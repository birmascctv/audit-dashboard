import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_PURCHASING_SETTINGS, getPurchasingPlanner, saveManualPurchasingQuantity,
  savePurchasingProductSettings, savePurchasingSettings, saveSupplierSettings,
} from '../purchasingPlanner.js';

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
    INSERT INTO store_stocks VALUES ('s','p',2,2,'2026-01-31T12:00:00Z');
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

test('purchasing settings persist and validate the 8-week movement threshold', () => {
  const { stock, sales } = fixture();
  assert.deepEqual(savePurchasingSettings(stock, { ...DEFAULT_PURCHASING_SETTINGS, fastMovingThreshold: 14 }), DEFAULT_PURCHASING_SETTINGS);
  assert.throws(() => savePurchasingSettings(stock, { historyWeeks: 0 }), /historyWeeks/);
  stock.close(); sales.close();
});

test('manual movement, supplier and order quantities override recommendations explicitly', () => {
  const { stock, sales, get } = fixture();
  saveSupplierSettings(stock, { storeId: 's', productId: 'p', supplierName: 'Vendor', leadDays: 2, moq: 3, purchasingUnit: 'Carton', conversionQty: 24, baseUnit: 'Can' });
  savePurchasingProductSettings(stock, { storeId: 's', productId: 'p', movement: 'Slow Moving', supplier: 'Vendor', minStock: 100 });
  let row = get().rows[0];
  assert.equal(row.movement, 'Slow Moving');
  assert.equal(row.status, 'Critical Stock');
  assert.equal(row.belowMinStock, true);
  assert.equal(row.supplier.supplierName, 'Vendor');
  assert.ok(row.recommendation7.orderUpTo >= 100);
  assert.ok(row.recommendation7.orderQty >= 3);
  assert.ok(row.recommendation10.orderQty >= row.recommendation7.orderQty);
  saveManualPurchasingQuantity(stock, { storeId: 's', productId: 'p', reviewDate: '2026-01-26', supplierName: 'Vendor', coverageDays: 7, quantity: 5 });
  row = get().rows[0];
  assert.equal(row.recommendation7.calculatedQty, row.calculatedOrderQty);
  assert.equal(row.recommendation7.orderQty, 5);
  assert.equal(row.recommendation7.manual, true);
  assert.throws(() => saveManualPurchasingQuantity(stock, { storeId: 's', productId: 'p', reviewDate: '2026-01-26', supplierName: 'Vendor', coverageDays: 7, quantity: 1.5 }), /whole-number/);
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
