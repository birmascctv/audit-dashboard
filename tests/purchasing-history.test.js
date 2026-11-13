import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { parsePurchasingCsv } from '../purchasingCsv.js';
import { captureStockSnapshot } from '../stockSnapshots.js';
import {
  calculateHolidayWindow, ensurePurchasingSchema, insertPurchaseHistoryRows,
  isExcludedPurchasingCategory,
} from '../purchasingStore.js';
import {
  DEFAULT_PURCHASING_SETTINGS, getPurchasingPlanner, saveHolidayAdjustment,
  savePurchasingProductSettings, savePurchasingSettings, saveSupplierSettings,
} from '../purchasingPlanner.js';

function csv(header = 'Purchase Number,Purchase Date,Required Date,Branch,Supplier Name,Cost Center,Project,Product Code,Category,Sub Category,Product Name,Unit,PO Qty,Pricelist Price,Price,Discount,VAT,Total,Notes,Additional Info,Receipt Qty,Status') {
  return `report title\n\n\n\n\n\n\n\n\n\n\n${header}\nPO-1,12/11/2026,13/11/2026,Sudirman,Vendor A,CC,Project,SKU-1,DRINKS,BEER,Product A,Carton @ 24 Can,2,100,90,0,0,180,Note,Info,2,Closed\n`;
}

function fixture() {
  const stock = new DatabaseSync(':memory:');
  const sales = new DatabaseSync(':memory:');
  stock.exec(`
    CREATE TABLE stores(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE products(id TEXT PRIMARY KEY,product_title TEXT,varian TEXT,category TEXT,sku TEXT,default_unit TEXT);
    CREATE TABLE store_stocks(store_id TEXT,product_id TEXT,stock_qty REAL,observed_stock_qty REAL,last_synced TEXT,PRIMARY KEY(store_id,product_id));
    CREATE TABLE stock_snapshots(store_id TEXT,product_id TEXT,business_date TEXT,stock_qty REAL,PRIMARY KEY(store_id,product_id,business_date));
    INSERT INTO stores VALUES ('s','Sudirman');
    INSERT INTO products VALUES ('p','Product A','Variant A','DRINKS','SKU-1','Can');
    INSERT INTO store_stocks VALUES ('s','p',40,40,'2026-11-12T10:00:00Z');
    INSERT INTO stock_snapshots VALUES ('s','p','2026-11-09',2);
  `);
  sales.exec('CREATE TABLE sales_transactions(branch TEXT,menu TEXT,sales_date_in TEXT,qty REAL,total_after_bill_discount REAL)');
  const insert = sales.prepare('INSERT INTO sales_transactions VALUES(?,?,?,?,?)');
  for (let i = 1; i <= 56; i++) {
    const date = new Date(Date.parse('2026-11-09T00:00:00Z') - i * 86400000).toISOString().slice(0, 10);
    insert.run('Sudirman', 'Product A', `${date} 12:00`, [5, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) ? 5 : 1, 1000000);
  }
  const match = (name) => name.toUpperCase() === 'SUDIRMAN' ? 's' : null;
  return { stock, sales, match };
}

test('purchase CSV parser requires row-12 header and parses unit conversion and quantity', () => {
  const parsed = parsePurchasingCsv(csv());
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].purchase_date, '2026-11-12');
  assert.equal(parsed[0].purchasing_unit, 'Carton');
  assert.equal(parsed[0].conversion_qty, 24);
  assert.equal(parsed[0].base_unit, 'Can');
  assert.equal(parsed[0].equivalent_qty, 48);
  assert.throws(() => parsePurchasingCsv(csv().replace('\n\n\n\n\n\n\n\n\n\n\nPurchase Number', '\nPurchase Number')), /row 12/);
  assert.throws(() => parsePurchasingCsv(csv().replace(',2,100,90', ',-1,100,90')), /positive number/);
});

test('purchase history imports deduplicate cross-file rows and retain excluded-category metadata', () => {
  const db = new DatabaseSync(':memory:');
  ensurePurchasingSchema(db);
  const [record] = parsePurchasingCsv(csv());
  const first = insertPurchaseHistoryRows(db, { importId: 'one', filename: 'purchases.csv', uploadedBy: 'Bertha', rows: [record] });
  const duplicate = insertPurchaseHistoryRows(db, { importId: 'two', filename: 'copy.csv', uploadedBy: 'Bertha', rows: [record] });
  assert.deepEqual(first, { inserted: 1, duplicates: 0 });
  assert.deepEqual(duplicate, { inserted: 0, duplicates: 1 });
  const excludedRecord = { ...record, purchase_number: 'PO-2', category: 'LAIN-LAIN', source_row: 14 };
  insertPurchaseHistoryRows(db, { importId: 'three', filename: 'history.csv', uploadedBy: 'Bertha', rows: [excludedRecord] });
  assert.equal(db.prepare("SELECT excluded FROM purchasing_history_records WHERE purchase_number='PO-2'").get().excluded, 1);
  assert.equal(isExcludedPurchasingCategory('LAIN-LAIN'), true);
  db.close();
});

test('holiday calculation windows follow the supplied weekday mappings', () => {
  assert.deepEqual(calculateHolidayWindow('2026-11-09'), { start: '2026-11-06', end: '2026-11-09' });
  assert.deepEqual(calculateHolidayWindow('2026-11-10'), { start: '2026-11-06', end: '2026-11-10' });
  assert.deepEqual(calculateHolidayWindow('2026-11-11'), { start: '2026-11-10', end: '2026-11-11' });
  assert.deepEqual(calculateHolidayWindow('2026-11-12'), { start: '2026-11-11', end: '2026-11-12' });
  assert.deepEqual(calculateHolidayWindow('2026-11-13'), { start: '2026-11-12', end: '2026-11-15' });
  assert.deepEqual(calculateHolidayWindow('2026-11-14'), { start: '2026-11-13', end: '2026-11-15' });
  assert.deepEqual(calculateHolidayWindow('2026-11-15'), { start: '2026-11-13', end: '2026-11-15' });
  assert.deepEqual(calculateHolidayWindow('2026-11-12', '2026-11-13'), { start: '2026-11-12', end: '2026-11-15' });
  assert.deepEqual(calculateHolidayWindow('2026-11-13', '2026-11-16'), { start: '2026-11-12', end: '2026-11-16' });
  assert.deepEqual(calculateHolidayWindow('2026-11-11', '2026-11-13'), { start: '2026-11-10', end: '2026-11-15' });
  assert.deepEqual(calculateHolidayWindow('2026-11-12', '2026-11-14'), { start: '2026-11-11', end: '2026-11-15' });
});

test('empty inventory sync is recorded without creating a stock snapshot', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE store_stocks(store_id TEXT,product_id TEXT,stock_qty REAL); CREATE TABLE products(id TEXT,product_title TEXT,varian TEXT);');
  const result = captureStockSnapshot(db, new Date('2026-11-09T12:00:00.000Z'));
  assert.equal(result.captured, false);
  assert.equal(db.prepare('SELECT status FROM stock_snapshot_sync_log').get().status, 'no_data');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM stock_snapshots').get().count, 0);
  db.close();
});

test('holiday analysis reports incomplete windows instead of treating missing sales as zero', () => {
  const { stock, sales, match } = fixture();
  const result = getPurchasingPlanner(stock, sales, match, '2026-11-13');
  const holiday = result.holidayAnalysis.find((item) => item.name === "New Year's Day" && item.startDate === '2025-01-01');
  assert.ok(holiday);
  assert.equal(holiday.totalSales, null);
  assert.equal(holiday.classification, 'Insufficient data');
  stock.close(); sales.close();
});

test('forecast uses Monday inventory, eight weeks, weekend demand and supplier units', () => {
  const { stock, sales, match } = fixture();
  ensurePurchasingSchema(stock);
  assert.deepEqual(savePurchasingSettings(stock, { ...DEFAULT_PURCHASING_SETTINGS, fastMovingThreshold: 14 }), DEFAULT_PURCHASING_SETTINGS);
  saveSupplierSettings(stock, { storeId: 's', productId: 'p', supplierName: 'Vendor A', leadDays: 2, moq: 2, purchasingUnit: 'Carton', conversionQty: 24, baseUnit: 'Can' });
  const [record] = parsePurchasingCsv(csv());
  insertPurchaseHistoryRows(stock, { importId: 'h1', filename: 'history.csv', uploadedBy: 'Bertha', rows: [record] });
  savePurchasingProductSettings(stock, { storeId: 's', productId: 'p', supplier: 'Vendor A', movement: 'Fast Moving' });
  const result = getPurchasingPlanner(stock, sales, match, '2026-11-13');
  const row = result.rows[0];
  assert.equal(result.reviewDate, '2026-11-09');
  assert.equal(row.currentStock, 40);
  assert.equal(row.reviewStock, 2);
  assert.equal(row.avgWeekly, 15);
  assert.equal(row.movement, 'Fast Moving');
  assert.equal(row.expectedStockoutDate, '2026-11-11');
  assert.equal(row.recommendedReorderDate, '2026-11-08');
  assert.equal(row.supplier.leadDays, 2);
  assert.equal(row.purchasingUnit, 'Carton');
  assert.equal(row.conversionQty, 24);
  assert.ok(row.recommendation7.orderQty >= 2);
  assert.ok(row.recommendation10.orderQty >= row.recommendation7.orderQty);
  stock.close(); sales.close();
});

test('overlapping holiday adjustments require an explicit shared combination group', () => {
  const { stock } = fixture();
  ensurePurchasingSchema(stock);
  const first = savePurchasingHolidayForTest(stock, 'Event A', '2026-04-05');
  const second = savePurchasingHolidayForTest(stock, 'Event B', '2026-04-05');
  saveHolidayAdjustment(stock, { holidayId: first, storeId: 's', adjustmentPct: 20 });
  assert.throws(() => saveHolidayAdjustment(stock, { holidayId: second, storeId: 's', adjustmentPct: 10 }), /overlapping/);
  stock.close();
});

function savePurchasingHolidayForTest(db, name, date) {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO purchasing_holidays(name,start_date,end_date,window_start,window_end,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`).run(name, date, date, date, date, now, now).lastInsertRowid;
}
