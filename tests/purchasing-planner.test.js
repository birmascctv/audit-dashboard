import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_PURCHASING_SETTINGS, getPurchasingPlanner,
  savePurchasingProductSettings, savePurchasingSettings, saveSupplierSettings,
} from '../purchasingPlanner.js';
import { isReorderStockEligible, normalizePurchasingPreferences, summarizeOutletSync } from '../src/utils/purchasingPreferences.js';
import { useToast } from '../src/composables/useToast.js';

test('loading notifications remain visible until dismissed while other toasts expire', async () => {
  const toast = useToast();
  const id = toast.loading('Saving…');
  toast.info('Updated', 5);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(toast.toasts.value.map((item) => item.id), [id]);
  toast.dismiss(id);
  assert.equal(toast.toasts.value.length, 0);
});

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

test('zero stock requires positive, unambiguous sales at the same outlet within three calendar months', () => {
  const { stock, sales, get } = fixture();
  stock.prepare("UPDATE store_stocks SET stock_qty=0 WHERE store_id='s' AND product_id='p'").run();
  stock.exec(`
    INSERT INTO stores VALUES ('s2','Other');
    INSERT INTO store_stocks VALUES ('s2','p',0,0,'2026-01-31T12:00:00Z');
    INSERT INTO products VALUES ('old','Old Product','Old Product','BEER','OLD','Can');
    INSERT INTO products VALUES ('return','Return Product','Return Product','BEER','RETURN','Can');
    INSERT INTO products VALUES ('amb1','Ambiguous','Variant A','BEER','A','Can');
    INSERT INTO products VALUES ('amb2','Ambiguous','Variant B','BEER','B','Can');
    INSERT INTO store_stocks VALUES ('s','old',0,0,'2026-01-31T12:00:00Z');
    INSERT INTO store_stocks VALUES ('s','return',0,0,'2026-01-31T12:00:00Z');
    INSERT INTO store_stocks VALUES ('s','amb1',0,0,'2026-01-31T12:00:00Z');
    INSERT INTO store_stocks VALUES ('s','amb2',0,0,'2026-01-31T12:00:00Z');
  `);
  const insert = sales.prepare('INSERT INTO sales_transactions VALUES(?,?,?,?,?)');
  insert.run('Store', 'Old Product', '2025-10-29 12:00', 1, 10);
  insert.run('Store', 'Return Product', '2025-11-01 12:00', -1, -10);
  insert.run('Store', 'Ambiguous', '2025-11-01 12:00', 1, 10);
  let rows = get().rows;
  const row = (store, product) => rows.find((item) => item.storeId === store && item.productId === product);
  assert.equal(isReorderStockEligible(row('s', 'p')), true);
  assert.equal(isReorderStockEligible(row('s2', 'p')), false);
  assert.equal(isReorderStockEligible(row('s', 'old')), false);
  assert.equal(isReorderStockEligible(row('s', 'return')), false);
  assert.equal(isReorderStockEligible(row('s', 'amb1')), false);
  assert.equal(isReorderStockEligible(row('s', 'amb2')), false);
  insert.run('Store', 'Old Product', '2025-10-30 12:00', 1, 10);
  rows = get().rows;
  assert.equal(isReorderStockEligible(row('s', 'old')), true);
  const custom = getPurchasingPlanner(stock, sales, (branch) => branch === 'Store' ? 's' : null, '2026-01-30',
    { historyStart: '2025-12-01', historyEnd: '2025-12-02' });
  assert.equal(isReorderStockEligible(custom.rows.find((item) => item.productId === 'old')), true);
  assert.equal(isReorderStockEligible({ currentStock: 1, hasRecentSales: false }), true);
  assert.equal(isReorderStockEligible({ currentStock: -1, hasRecentSales: true }), false);
  assert.equal(isReorderStockEligible({ currentStock: null, hasRecentSales: true }), false);
  stock.close(); sales.close();
});

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

test('supplier settings and selection remain independent per outlet and product', () => {
  const { stock, sales } = fixture();
  stock.prepare("INSERT INTO stores(id,name) VALUES('s2','Other')").run();
  stock.prepare("INSERT INTO products(id,product_title,varian,default_unit) SELECT 'p2',product_title,varian,default_unit FROM products WHERE id='p'").run();
  stock.prepare("INSERT INTO store_stocks(store_id,product_id,stock_qty) VALUES('s2','p',1)").run();
  stock.prepare("INSERT INTO store_stocks(store_id,product_id,stock_qty) VALUES('s2','p2',1)").run();
  saveSupplierSettings(stock, { storeId: 's2', productId: 'p', supplierName: 'Vendor B', leadDays: 5, moq: 4, purchasingUnit: 'PACK', conversionQty: 6, baseUnit: 'CAN' });
  savePurchasingProductSettings(stock, { storeId: 's2', productId: 'p', supplier: 'Vendor B' });
  saveSupplierSettings(stock, { storeId: 's', productId: 'p', supplierName: 'Vendor A', leadDays: 3, moq: 2, purchasingUnit: 'CARTON', conversionQty: 24, baseUnit: 'CAN', selected: true });
  savePurchasingProductSettings(stock, { storeId: 's', productId: 'p', supplier: 'Vendor A' });
  assert.equal(stock.prepare("SELECT selected_supplier FROM purchasing_product_settings WHERE store_id='s2' AND product_id='p'").get().selected_supplier, 'Vendor B');
  const other = stock.prepare("SELECT supplier_name,lead_days,purchasing_unit,conversion_qty FROM purchasing_supplier_settings WHERE store_id='s2' AND product_id='p'").get();
  assert.deepEqual({ ...other }, { supplier_name: 'Vendor B', lead_days: 5, purchasing_unit: 'PACK', conversion_qty: 6 });
  assert.equal(stock.prepare("SELECT COUNT(*) AS count FROM purchasing_supplier_settings WHERE store_id='s2' AND product_id='p2'").get().count, 0);
  assert.equal(stock.prepare("SELECT COUNT(*) AS count FROM purchasing_product_settings WHERE store_id='s2' AND product_id='p2'").get().count, 0);
  stock.close(); sales.close();
});

test('Jakarta supplier defaults apply to matching products without overwriting outlet overrides', () => {
  const { stock, sales } = fixture();
  stock.exec(`
    INSERT INTO stores VALUES ('birmas-kuningan','Kuningan'),('birmas-kwitang','Kwitang'),
      ('birmas-sudirman','Sudirman'),('birmas-nomadic','Nomadic');
    INSERT INTO products VALUES ('p2','Product','Product variant','BEER','SKU-2','Can');
    INSERT INTO products VALUES ('p3','Product','Different variant','BEER','SKU-3','Can');
    INSERT INTO store_stocks VALUES ('birmas-kuningan','p',5,5,'2026-01-30T12:00:00Z');
    INSERT INTO store_stocks VALUES ('birmas-kwitang','p',5,5,'2026-01-30T12:00:00Z');
    INSERT INTO store_stocks VALUES ('birmas-sudirman','p2',5,5,'2026-01-30T12:00:00Z');
    INSERT INTO store_stocks VALUES ('birmas-sudirman','p3',5,5,'2026-01-30T12:00:00Z');
    INSERT INTO store_stocks VALUES ('birmas-nomadic','p',5,5,'2026-01-30T12:00:00Z');
  `);
  const save = (storeId, productId, supplierName, leadDays) => {
    saveSupplierSettings(stock, { storeId, productId, supplierName, leadDays, moq: 4, purchasingUnit: 'CARTON', conversionQty: 24, baseUnit: 'CAN' });
    savePurchasingProductSettings(stock, { storeId, productId, supplier: supplierName });
  };
  const getRow = (storeId, productId) => getPurchasingPlanner(stock, sales, () => null, '2026-01-30').rows
    .find((row) => row.storeId === storeId && row.productId === productId);
  save('birmas-kuningan', 'p', 'Jakarta supplier', 5);
  assert.equal(getRow('birmas-kwitang', 'p').supplier.supplierName, 'Jakarta supplier');
  assert.deepEqual(getRow('birmas-kwitang', 'p').supplier, {
    supplierName: 'Jakarta supplier', leadDays: 5, moq: 4, purchasingUnit: 'CARTON',
    conversionQty: 24, baseUnit: 'CAN', configured: false,
  });
  assert.equal(getRow('birmas-kwitang', 'p').leadDays, 5);
  assert.equal(getRow('birmas-kwitang', 'p').conversionQty, 24);
  assert.equal(getRow('birmas-sudirman', 'p2').selectedSupplier, 'Jakarta supplier');
  assert.equal(getRow('birmas-sudirman', 'p3').supplier, null);
  assert.equal(getRow('birmas-nomadic', 'p').supplier, null);
  saveSupplierSettings(stock, { storeId: 'birmas-kuningan', productId: 'p', supplierName: 'Jakarta supplier',
    leadDays: 7, moq: 8, purchasingUnit: 'PACK', conversionQty: 6, baseUnit: 'BOTOL' });
  assert.deepEqual(getRow('birmas-sudirman', 'p2').supplier, {
    supplierName: 'Jakarta supplier', leadDays: 7, moq: 8, purchasingUnit: 'PACK',
    conversionQty: 6, baseUnit: 'BOTOL', configured: false,
  });
  save('birmas-sudirman', 'p2', 'Jakarta supplier', 9);
  assert.equal(getRow('birmas-sudirman', 'p2').supplier.leadDays, 9);
  assert.equal(getRow('birmas-kwitang', 'p').supplier.leadDays, 7);
  save('birmas-kwitang', 'p', 'Local supplier', 3);
  save('birmas-kuningan', 'p', 'Changed supplier', 2);
  assert.equal(getRow('birmas-kwitang', 'p').supplier.supplierName, 'Local supplier');
  assert.equal(getRow('birmas-kwitang', 'p').supplier.leadDays, 3);
  assert.equal(getRow('birmas-sudirman', 'p2').selectedSupplier, 'Jakarta supplier');
  assert.equal(getRow('birmas-sudirman', 'p2').supplier.leadDays, 9);
  assert.equal(getRow('birmas-kuningan', 'p').selectedSupplier, 'Changed supplier');
  stock.close(); sales.close();
});

test('existing Jakarta supplier is used as the default without overwriting saved suppliers', () => {
  const { stock, sales } = fixture();
  stock.exec(`
    INSERT INTO stores VALUES ('birmas-kuningan','Kuningan'),('birmas-kwitang','Kwitang'),('birmas-sudirman','Sudirman');
    INSERT INTO store_stocks VALUES ('birmas-kuningan','p',5,5,'2026-01-30T12:00:00Z');
    INSERT INTO store_stocks VALUES ('birmas-kwitang','p',5,5,'2026-01-30T12:00:00Z');
    INSERT INTO store_stocks VALUES ('birmas-sudirman','p',5,5,'2026-01-30T12:00:00Z');
  `);
  getPurchasingPlanner(stock, sales, () => null, '2026-01-30');
  saveSupplierSettings(stock, { storeId: 'birmas-kuningan', productId: 'p', supplierName: 'Original',
    leadDays: 6, moq: 3, purchasingUnit: 'PACK', conversionQty: 12, baseUnit: 'CAN' });
  stock.prepare("INSERT INTO purchasing_product_settings(store_id,product_id,selected_supplier) VALUES('birmas-kuningan','p','Original')").run();
  stock.prepare("INSERT INTO purchasing_area_supplier_defaults(area,product_key,supplier_name) VALUES(?,?,?)")
    .run('jakarta', JSON.stringify(['PRODUCT', 'PRODUCT VARIANT']), 'Original');
  saveSupplierSettings(stock, { storeId: 'birmas-kwitang', productId: 'p', supplierName: 'Override' });
  savePurchasingProductSettings(stock, { storeId: 'birmas-kwitang', productId: 'p', supplier: 'Override' });
  const rows = getPurchasingPlanner(stock, sales, () => null, '2026-01-30').rows;
  assert.equal(rows.find((row) => row.storeId === 'birmas-sudirman').selectedSupplier, 'Original');
  assert.equal(rows.find((row) => row.storeId === 'birmas-sudirman').supplier.leadDays, 6);
  assert.equal(rows.find((row) => row.storeId === 'birmas-sudirman').supplier.conversionQty, 12);
  assert.equal(rows.find((row) => row.storeId === 'birmas-kwitang').selectedSupplier, 'Override');
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
