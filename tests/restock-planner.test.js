import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { canAccessRestock, getRestockPlanner } from '../restockPlanner.js';

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
  assert.equal(product.orderQty, 14);
  assert.equal(product.orderBy, '2026-01-31');
  assert.equal(product.zeroDays, 1);
  assert.equal(product.snapshotDays, 2);
  assert.equal(product.usableDays, 9);
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

test('planner access is limited to Bertha and superadmins', () => {
  assert.equal(canAccessRestock({ userId: 'user-bertha', role: 'owner' }), true);
  assert.equal(canAccessRestock({ userId: 'other', role: 'superadmin' }), true);
  assert.equal(canAccessRestock({ userId: 'other', role: 'owner' }), false);
  assert.equal(canAccessRestock({ userId: 'other', role: 'admin' }), false);
});
