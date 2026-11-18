import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_PURCHASING_SETTINGS, getPurchasingPlanner,
  savePurchasingProductSettings, savePurchasingSettings, saveSupplierSettings,
} from '../purchasingPlanner.js';
import { normalizePurchasingPreferences, summarizeOutletSync } from '../src/utils/purchasingPreferences.js';

test('saved purchasing preferences restore valid filters and reject invalid dates and options', () => {
  const saved = normalizePurchasingPreferences({
    store: 's', status: 'needs-order', movement: 'Fast Moving', search: 'IPA',
    coverage: 'both', sort: 'product', historyStart: '2026-01-01', historyEnd: '2026-01-25',
  }, '2026-01-30');
  assert.deepEqual(saved.range, { historyStart: '2026-01-01', historyEnd: '2026-01-25' });
  assert.equal(saved.coverage, 'both');
  assert.equal(saved.store, 's');
  const invalid = normalizePurchasingPreferences({ coverage: '20', status: 'bad', historyStart: '2026-02-31', historyEnd: '2026-03-01' }, '2026-03-01');
  assert.equal(invalid.coverage, '7');
  assert.equal(invalid.status, 'all');
  assert.equal(invalid.range, null);
});

test('outlet sync ages identify missing, future, and older product observations', () => {
  const now = Date.parse('2026-01-30T12:00:00Z');
  const summary = summarizeOutletSync([
    { lastSynced: '2026-01-30T11:50:00Z' },
    { lastSynced: '2026-01-28T12:00:00Z' },
    { lastSynced: null },
    { lastSynced: '2026-02-01T00:00:00Z' },
  ], now);
  assert.equal(summary.latestAge, '10 min ago');
  assert.equal(summary.oldestAge, '2 days ago');
  assert.equal(summary.missing, 2);
  assert.equal(summarizeOutletSync([], now).latestAge, 'Unavailable');
});

function fixture() {
  const stock = new DatabaseSync(':memory:');
  const sales = new DatabaseSync(':memory:');
  stock.exec(`
    CREATE TABLE stores(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE products(id TEXT PRIMARY KEY,product_title TEXT,varian TEXT,category TEXT,sku TEXT,default_unit TEXT);
    CREATE TABLE store_stocks(store_id TEXT,product_id TEXT,stock_qty REAL,observed_stock_qty REAL,last_synced TEXT,PRIMARY KEY(store_id,product_id));
    CREATE TABLE stock_snapshots(store_id TEXT,product_id TEXT,business_date TEXT,stock_qty REAL,PRIMARY KEY(store_id,product_id,business_date));
    INSERT INTO stores VALUES ('s','Store');
    INSERT INTO products VALUES ('p','Product','Product variant','BEER','SKU-1','Can');
    INSERT INTO store_stocks VALUES ('s','p',2,99,'2026-01-31T12:00:00Z');
    INSERT INTO stock_snapshots VALUES ('s','p','2026-01-26',2);
  `);
  sales.exec('CREATE TABLE sales_transactions(branch TEXT,menu TEXT,sales_date_in TEXT,qty REAL,total_after_bill_discount REAL)');
  const insert = sales.prepare('INSERT INTO sales_transactions VALUES(?,?,?,?,?)');
  for (let i = 1; i <= 56; i++) {
    const date = new Date(Date.parse('2026-01-26T00:00:00Z') - i * 86400000).toISOString().slice(0, 10);
    insert.run('Store', 'Product', `${date} 12:00`, 2, 20);
  }
  const match = (branch) => branch === 'Store' ? 's' : null;
  const get = (today = '2026-01-30') => getPurchasingPlanner(stock, sales, match, today);
  return { stock, sales, get };
}

test('rows expose PO-history suppliers and units, and 10-day minimum stock is separate', () => {
  const { stock, sales, get } = fixture();
  const name = get().rows[0].productName;
  stock.prepare(`INSERT INTO purchasing_history_imports(id,filename,uploaded_at,uploaded_by) VALUES('i','a.csv','2026-01-01','u')`).run();
  stock.prepare(`INSERT INTO purchasing_history_records(import_id,source_row,record_hash,purchase_number,purchase_date,branch,supplier_name,category,product_name,unit,po_qty,purchasing_unit,conversion_qty,base_unit,equivalent_qty)
    VALUES('i',1,'h','PO1','2026-01-01','KUNINGAN','Vendor A','Drink',?,'Carton @ 24 Can',2,'Carton',24,'Can',48)`).run(name);
  savePurchasingProductSettings(stock, { storeId: 's', productId: 'p', minStock: 5, minStock10: 500 });
  const row = get().rows[0];
  assert.deepEqual(row.historySuppliers.map((item) => item.supplierName), ['Vendor A']);
  assert.equal(row.historyUnits[0].purchasingUnit, 'Carton');
  assert.equal(row.minStock10, 500);
  if (row.recommendation10) assert.ok(row.recommendation10.orderUpTo >= 500 && row.recommendation7.orderUpTo < 500);
  stock.close(); sales.close();
});

test('supplier settings are shared by product name across outlets', () => {
  const { stock, sales } = fixture();
  stock.prepare("INSERT INTO stores(id,name) VALUES('s2','Other')").run();
  stock.prepare("INSERT INTO products(id,product_title,varian,default_unit) SELECT 'p2',product_title,varian,default_unit FROM products WHERE id='p'").run();
  stock.prepare("INSERT INTO store_stocks(store_id,product_id,stock_qty) VALUES('s2','p2',1)").run();
  saveSupplierSettings(stock, { storeId: 's', productId: 'p', supplierName: 'Vendor', leadDays: 3, moq: 2, purchasingUnit: 'Carton', conversionQty: 24, baseUnit: 'Can', selected: true });
  const copy = stock.prepare("SELECT * FROM purchasing_supplier_settings WHERE store_id='s2' AND product_id='p2'").get();
  assert.equal(copy.purchasing_unit, 'Carton');
  assert.equal(copy.conversion_qty, 24);
  assert.equal(stock.prepare("SELECT selected_supplier FROM purchasing_product_settings WHERE store_id='s2'").get().selected_supplier, 'Vendor');
  stock.close(); sales.close();
});

test('purchasing settings persist and validate the 8-week movement threshold', () => {
  const { stock, sales } = fixture();
  assert.deepEqual(savePurchasingSettings(stock, { ...DEFAULT_PURCHASING_SETTINGS, fastMovingThreshold: 14 }), DEFAULT_PURCHASING_SETTINGS);
  assert.throws(() => savePurchasingSettings(stock, { historyWeeks: 0 }), /historyWeeks/);
  stock.close(); sales.close();
});

test('recommendations ignore legacy manual quantities and product lead overrides', () => {
  const { stock, sales, get } = fixture();
  saveSupplierSettings(stock, { storeId: 's', productId: 'p', supplierName: 'Vendor', leadDays: 2, moq: 3, purchasingUnit: 'Carton', conversionQty: 24, baseUnit: 'Can' });
  savePurchasingProductSettings(stock, { storeId: 's', productId: 'p', movement: 'Slow Moving', supplier: 'Vendor', minStock: 100, minStock10: 100 });
  let row = get().rows[0];
  assert.equal(row.currentStock, 2);
  assert.equal(row.movement, 'Slow Moving');
  assert.equal(row.status, 'Critical Stock');
  assert.equal(row.belowMinStock, true);
  assert.equal(row.supplier.supplierName, 'Vendor');
  assert.ok(row.recommendation7.orderUpTo >= 100);
  assert.ok(row.recommendation7.orderQty >= 3);
  assert.ok(row.recommendation10.orderQty >= row.recommendation7.orderQty);
  stock.prepare("UPDATE purchasing_product_settings SET lead_days=9 WHERE store_id='s' AND product_id='p'").run();
  stock.prepare("INSERT INTO purchasing_qty_overrides(store_id,product_id,review_date,supplier_name,coverage_days,quantity,updated_at) VALUES('s','p','2026-01-26','Vendor',7,999,'now')").run();
  row = get().rows[0];
  assert.equal(row.recommendation7.calculatedQty, row.calculatedOrderQty);
  assert.equal(row.recommendation7.orderQty, row.recommendation7.calculatedQty);
  assert.equal(row.recommendation7.manual, false);
  assert.equal(row.leadDays, 2);
  saveSupplierSettings(stock, { storeId: 's', productId: 'p', supplierName: 'Vendor', conversionQty: 24 });
  assert.equal(get().rows[0].leadDays, DEFAULT_PURCHASING_SETTINGS.defaultLeadDays);
  assert.throws(() => savePurchasingProductSettings(stock, { storeId: 's', productId: 'p', leadDays: 4 }), /valid product purchasing settings/);
  stock.close(); sales.close();
});

test('missing or stale Monday stock snapshots prevent purchasing quantities', () => {
  const { stock, sales, get } = fixture();
  stock.exec('DELETE FROM stock_snapshots');
  let row = get().rows[0];
  assert.equal(row.status, 'Unknown');
  assert.equal(row.recommendation7, null);
  stock.exec("INSERT INTO stock_snapshots VALUES('s','p','2026-01-12',10)");
  row = get('2026-01-30').rows[0];
  assert.equal(row.reason, 'No recent Monday stock snapshot');
  assert.equal(row.orderQty, null);
  stock.exec("DELETE FROM stock_snapshots; INSERT INTO stock_snapshots VALUES('s','p','2026-01-26',10)");
  row = get('2026-02-02').rows[0];
  assert.equal(row.reason, 'No recent Monday stock snapshot');
  assert.equal(row.recommendation7, null);
  stock.close(); sales.close();
});

test('ambiguous sales names identify affected stock products and suppress partial recommendations', () => {
  const { stock, sales, get } = fixture();
  stock.exec(`
    INSERT INTO products VALUES ('p2','Product','Other variant','BEER','SKU-2','Can');
    INSERT INTO store_stocks VALUES ('s','p2',3,3,'2026-01-31T12:00:00Z');
    INSERT INTO stock_snapshots VALUES ('s','p2','2026-01-26',3);
  `);
  sales.prepare('INSERT INTO sales_transactions VALUES(?,?,?,?,?)').run('Store', 'SKU-1', '2026-01-25 12:00', 5, 50);
  const result = get();
  assert.equal(result.ambiguousMatches.length, 1);
  assert.equal(result.ambiguousMatches[0].salesName, 'Product');
  assert.deepEqual(result.ambiguousMatches[0].products.map((p) => p.productId).sort(), ['p', 'p2']);
  for (const row of result.rows) {
    assert.match(row.reason, /matches multiple stock products/);
    assert.equal(row.recommendation7, null);
  }
  sales.exec("DELETE FROM sales_transactions WHERE menu='Product'");
  const resolved = get();
  assert.equal(resolved.ambiguousMatches.length, 0);
  assert.ok(resolved.rows.find((row) => row.productId === 'p').recommendation7);
  stock.close(); sales.close();
});

test('custom sales history changes averages and validates the inclusive range', () => {
  const { stock, sales } = fixture();
  sales.exec("UPDATE sales_transactions SET qty=9 WHERE sales_date_in LIKE '2026-01-20%'");
  const match = (branch) => branch === 'Store' ? 's' : null;
  const run = (range) => getPurchasingPlanner(stock, sales, match, '2026-01-30', range);
  const result = run({ historyStart: '2026-01-19', historyEnd: '2026-01-25' });
  assert.equal(result.rows[0].avgDailyRaw, 3);
  assert.equal(result.rows[0].avgWeeklyRaw, 21);
  assert.equal(result.rows[0].history.length, 7);
  assert.throws(() => run({ historyStart: '2026-01-26', historyEnd: '2026-01-25' }), /valid sales history/);
  assert.throws(() => run({ historyStart: '2026-01-01', historyEnd: '2026-02-01' }), /valid sales history/);
  stock.close(); sales.close();
});

test('holiday references are product-specific and missing coverage remains unknown', () => {
  const { stock, sales } = fixture();
  stock.exec(`
    INSERT INTO products VALUES ('p2','Other','Other variant','BEER','SKU-2','Can');
    INSERT INTO store_stocks VALUES ('s','p2',3,3,'2026-01-26');
    INSERT INTO stock_snapshots VALUES ('s','p2','2026-01-26',3);
  `);
  sales.prepare('INSERT INTO sales_transactions VALUES(?,?,?,?,?)').run('Store', 'Other', '2026-01-05 12:00', 1, 10);
  getPurchasingPlanner(stock, sales, () => 's', '2026-01-30');
  const insert = stock.prepare(`INSERT INTO purchasing_holidays(name,start_date,end_date,window_start,window_end,created_at,updated_at)
    VALUES('Special',?,?,?,?,'now','now')`);
  insert.run('2026-01-10', '2026-01-10', '2026-01-09', '2026-01-11');
  const id = Number(insert.run('2026-02-10', '2026-02-10', '2026-02-09', '2026-02-10').lastInsertRowid);
  const run = () => getPurchasingPlanner(stock, sales, () => 's', '2026-01-30', { holidayReferenceId: id });
  let rows = run().rows;
  assert.equal(rows.find((r) => r.productId === 'p').holidayReference.qty, 6);
  assert.equal(rows.find((r) => r.productId === 'p').holidayReference.revenue, 60);
  assert.equal(rows.find((r) => r.productId === 'p2').holidayReference.qty, 0);
  sales.exec("DELETE FROM sales_transactions WHERE sales_date_in LIKE '2026-01-10%'");
  rows = run().rows;
  assert.equal(rows.find((r) => r.productId === 'p').holidayReference.qty, null);
  assert.equal(rows.find((r) => r.productId === 'p2').holidayReference.qty, null);
  stock.close(); sales.close();
});

test('Nomadic is available without stock and uses its own stock and sales when provided', () => {
  const { stock, sales } = fixture();
  stock.exec("INSERT INTO stores VALUES ('birmas-nomadic','Birmas Nomadic (Bandung)')");
  sales.prepare('INSERT INTO sales_transactions VALUES(?,?,?,?,?)').run('NOMADIC', 'Product', '2026-01-25 12:00', 4, 40);
  const match = (branch) => branch === 'NOMADIC' ? 'birmas-nomadic' : 's';
  let result = getPurchasingPlanner(stock, sales, match, '2026-01-30');
  assert.ok(result.stores.some((store) => store.id === 'birmas-nomadic'));
  assert.ok(!result.rows.some((row) => row.storeId === 'birmas-nomadic'));
  assert.ok(result.holidayAnalysis.some((row) => row.storeId === 'birmas-nomadic'));
  stock.exec("INSERT INTO store_stocks VALUES ('birmas-nomadic','p',5,5,'2026-01-26'); INSERT INTO stock_snapshots VALUES ('birmas-nomadic','p','2026-01-26',5)");
  result = getPurchasingPlanner(stock, sales, match, '2026-01-30');
  const row = result.rows.find((item) => item.storeId === 'birmas-nomadic');
  assert.equal(row.currentStock, 5);
  assert.equal(row.avgDailyRaw, 4);
  stock.prepare("UPDATE store_stocks SET last_synced='2026-01-25' WHERE store_id='birmas-nomadic'").run();
  const stale = getPurchasingPlanner(stock, sales, match, '2026-01-30').rows.find((item) => item.storeId === 'birmas-nomadic');
  assert.equal(stale.recommendation7, null);
  assert.equal(stale.reason, 'Stock not synced since the Monday review');
  stock.close(); sales.close();
});
