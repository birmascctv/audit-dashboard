import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { canAccessRestock, getRestockPlanner, DEFAULT_RESTOCK_SETTINGS, validateRestockConfig } from '../restockPlanner.js';

function fixture() {
  const stock = new DatabaseSync(':memory:');
  const sales = new DatabaseSync(':memory:');
  stock.exec(`
    CREATE TABLE stores(id TEXT, name TEXT);
    CREATE TABLE products(id TEXT, product_title TEXT, varian TEXT);
    CREATE TABLE store_stocks(store_id TEXT, product_id TEXT, observed_stock_qty REAL, last_synced TEXT);
    CREATE TABLE stock_snapshots(store_id TEXT, product_id TEXT, business_date TEXT, stock_qty REAL);
    INSERT INTO stores VALUES ('s', 'Store');
    INSERT INTO products VALUES ('p', 'Product', ''), ('unknown', 'Unknown', ''), ('draft', 'Draft (DRAFT)', '');
    INSERT INTO store_stocks VALUES ('s','p',2,'2026-01-31T12:00:00Z'), ('s','unknown',5,'2026-01-31T12:00:00Z'), ('s','draft',3,'2026-01-31T12:00:00Z');
    INSERT INTO stock_snapshots VALUES ('s','p','2026-01-30',0), ('s','p','2026-01-29',5);
  `);
  sales.exec('CREATE TABLE sales_transactions(branch TEXT, menu TEXT, sales_date_in TEXT, qty REAL, total_after_bill_discount REAL)');
  const insert = sales.prepare('INSERT INTO sales_transactions VALUES (?, ?, ?, ?, ?)');
  for (let day = 21; day <= 30; day++) insert.run('Store', 'Product', `2026-01-${day} 12:00:00`, 2, 20);
  return { stock, sales, match: (branch) => branch === 'Store' ? 's' : null };
}

test('planner calculates cover and replenishment using usable days and preserves unknowns', () => {
  const { stock, sales, match } = fixture();
  const result = getRestockPlanner(stock, sales, match, '2026-01-31');
  const product = result.rows.find((row) => row.productId === 'p');
  assert.equal(product.avg, 2);
  assert.equal(product.daysLeft, 1);
  assert.equal(product.status, 'Critical');
  assert.equal(product.orderQty, 20);
  assert.equal(product.safetyQty, 6);
  assert.equal(product.orderBy, '2026-01-31');
  assert.equal(product.zeroDays, 1);
  assert.equal(product.snapshotDays, 2);
  assert.equal(product.usableDays, 9);
  assert.equal(product.lowData, true);
  assert.equal(product.abc, 'A');
  assert.equal(product.history.find((day) => day.date === '2026-01-20').qty, null);
  assert.equal(result.rows.find((row) => row.productId === 'unknown').status, 'Unknown');
  assert.ok(!result.rows.some((row) => row.productId === 'draft'));
  stock.close(); sales.close();
});

test('stale and ambiguous data never generates recommendations', () => {
  const { stock, sales, match } = fixture();
  stock.exec("UPDATE store_stocks SET last_synced='2026-01-20' WHERE product_id='p'");
  assert.equal(getRestockPlanner(stock, sales, match, '2026-01-31').rows.find((r) => r.productId === 'p').reason, 'Stock data is stale');
  stock.exec("INSERT INTO products VALUES ('p2','Product',''); INSERT INTO store_stocks VALUES ('s','p2',3,'2026-01-31')");
  const rows = getRestockPlanner(stock, sales, match, '2026-01-31').rows.filter((r) => r.product.startsWith('Product'));
  assert.ok(rows.every((r) => r.status === 'Unknown' && r.orderQty === null));
  stock.close(); sales.close();
});

test('fourteen usable days with every weekday clears the tentative label', () => {
  const { stock, sales, match } = fixture();
  const insert = sales.prepare('INSERT INTO sales_transactions VALUES (?, ?, ?, ?, ?)');
  for (let day = 16; day <= 20; day++) insert.run('Store', 'Product', `2026-01-${day} 12:00:00`, 2, 20);
  const row = getRestockPlanner(stock, sales, match, '2026-01-31').rows.find((r) => r.productId === 'p');
  assert.equal(row.usableDays, 14);
  assert.equal(row.lowData, false);
  stock.close(); sales.close();
});

test('planner access is limited to Bertha even for superadmins', () => {
  assert.equal(canAccessRestock({ userId: 'user-bertha', role: 'owner' }), true);
  assert.equal(canAccessRestock({ userId: 'other', role: 'superadmin' }), false);
  assert.equal(canAccessRestock({ userId: 'other', role: 'owner' }), false);
  assert.equal(canAccessRestock({ userId: 'other', role: 'admin' }), false);
});

test('weekday forecast and occasion adjustments change periodic order-up-to quantities', () => {
  const { stock, sales, match } = fixture();
  sales.exec("UPDATE sales_transactions SET qty=8 WHERE substr(sales_date_in,1,10)='2026-01-24'");
  const config = { settings: { ...DEFAULT_RESTOCK_SETTINGS }, occasions: [{ name: 'Holiday', start: '2026-01-31', end: '2026-01-31', adjustment: 50 }] };
  const row = getRestockPlanner(stock, sales, match, '2026-01-31', config).rows.find((r) => r.productId === 'p');
  assert.equal(row.forecast[0].qty, 12);
  assert.equal(row.forecast[1].qty, 2);
  assert.equal(row.avg, 24 / 9);
  assert.equal(row.safetyQty, 8);
  assert.equal(row.orderQty, 38);
  stock.close(); sales.close();
});

test('yearly revenue determines safety classification and dates outside the window do not count', () => {
  const { stock, sales, match } = fixture();
  stock.exec("INSERT INTO products VALUES ('q','Other',''); INSERT INTO store_stocks VALUES ('s','q',5,'2026-01-31')");
  sales.exec("INSERT INTO sales_transactions VALUES ('Store','Other','2026-01-30 12:00',1,5), ('Store','Other','2025-03-01 12:00',1,5000), ('Store','Product','2024-01-01 12:00',1,90000)");
  const rows = getRestockPlanner(stock, sales, match, '2026-01-31').rows;
  assert.equal(rows.find((r) => r.productId === 'q').abc, 'A');
  assert.equal(rows.find((r) => r.productId === 'p').abc, 'C');
  stock.close(); sales.close();
});

test('settings and low-sales occasions lower the protection period target', () => {
  const { stock, sales, match } = fixture();
  const settings = { ...DEFAULT_RESTOCK_SETTINGS, reviewDays: 2, leadDays: 1, safetyA: 1 };
  const config = { settings, occasions: [{ name: 'Quiet period', start: '2026-01-31', end: '2026-02-02', adjustment: -50 }] };
  const row = getRestockPlanner(stock, sales, match, '2026-01-31', config).rows.find((r) => r.productId === 'p');
  assert.deepEqual(row.forecast.slice(0, 3).map((day) => day.qty), [1, 1, 1]);
  assert.equal(row.orderQty, 3);
  stock.close(); sales.close();
});

test('settings validation rejects invalid numbers and impossible dates', () => {
  const valid = { settings: { ...DEFAULT_RESTOCK_SETTINGS }, occasions: [] };
  assert.equal(validateRestockConfig(valid).settings.reviewDays, 7);
  assert.throws(() => validateRestockConfig({ ...valid, settings: { ...valid.settings, historyDays: 0 } }), /historyDays/);
  assert.throws(() => validateRestockConfig({ ...valid, occasions: [{ name: 'Holiday', start: '2026-02-30', end: '2026-03-01', adjustment: 10 }] }), /valid start/);
  assert.throws(() => validateRestockConfig({ ...valid, occasions: [{ name: 'Holiday', start: '2026-02-01', end: '2026-02-02', adjustment: -101 }] }), /adjustment/);
});
