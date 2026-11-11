import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_RESTOCK_SETTINGS } from '../restockPlanner.js';
import { getPurchasingPlanner, savePurchasingProductSettings } from '../purchasingPlanner.js';

function fixture() {
  const stock = new DatabaseSync(':memory:');
  const sales = new DatabaseSync(':memory:');
  stock.exec(`
    CREATE TABLE stores(id TEXT, name TEXT);
    CREATE TABLE products(id TEXT, product_title TEXT, varian TEXT, category TEXT, sku TEXT);
    CREATE TABLE store_stocks(store_id TEXT, product_id TEXT, observed_stock_qty REAL, last_synced TEXT);
    CREATE TABLE stock_snapshots(store_id TEXT, product_id TEXT, business_date TEXT, stock_qty REAL);
    INSERT INTO stores VALUES ('s','Store');
    INSERT INTO products VALUES ('p','Product','','Drinks','SKU-1'), ('q','Unknown','','Drinks','SKU-2');
    INSERT INTO store_stocks VALUES ('s','p',28,'2026-01-31'), ('s','q',4,'2026-01-31');
    INSERT INTO stock_snapshots VALUES ('s','p','2026-01-30',0);
  `);
  sales.exec('CREATE TABLE sales_transactions(branch TEXT, menu TEXT, sales_date_in TEXT, qty REAL, total_after_bill_discount REAL)');
  const insert = sales.prepare('INSERT INTO sales_transactions VALUES (?, ?, ?, ?, ?)');
  for (let day = 1; day <= 30; day++) insert.run('Store', 'Product', `2026-01-${String(day).padStart(2, '0')} 12:00`, day === 24 ? 31 : 2, 20);
  insert.run('Store', 'Product', '2025-12-01 12:00', 10, 20);
  const match = (branch) => branch === 'Store' ? 's' : null;
  const config = { settings: { ...DEFAULT_RESTOCK_SETTINGS }, occasions: [] };
  const get = () => getPurchasingPlanner(stock, sales, match, '2026-01-31', config);
  return { stock, sales, config, get };
}

test('purchasing uses 30-day daily mean and separately reports 90-day coverage', () => {
  const { stock, sales, config, get } = fixture();
  config.occasions.push({ name: 'Holiday', start: '2026-01-31', end: '2026-01-31', adjustment: 50 });
  let row = get().rows.find((item) => item.productId === 'p');
  assert.equal(row.avg30, 3);
  assert.equal(row.avg90, 97 / 30);
  assert.equal(row.usable90, 30);
  assert.equal(row.forecast[0].qty, 4.5);
  assert.equal(row.forecast[1].qty, 3);
  assert.ok(Math.abs(row.daysLeft - 8.833333333333334) < 1e-8);
  assert.equal(row.stockoutDate, '2026-02-08');
  assert.equal(row.orderBy, '2026-02-07');
  assert.equal(row.orderQty, 7);
  assert.equal(row.status, 'Soon');
  assert.equal(row.sku, 'SKU-1');
  assert.equal(row.stockValue, null);
  assert.equal(row.turnover, null);
  assert.equal(get().rows.find((item) => item.productId === 'q').status, 'Unknown');
  stock.close(); sales.close();
});

test('per-store overrides persist, change target and reorder date, and can be reset', () => {
  const { stock, sales, get } = fixture();
  savePurchasingProductSettings(stock, { storeId: 's', productId: 'p', minStock: 70, leadDays: 3 });
  let row = get().rows.find((item) => item.productId === 'p');
  assert.equal(row.minStock, 70);
  assert.equal(row.belowMin, true);
  assert.equal(row.target, 70);
  assert.equal(row.orderQty, 42);
  assert.equal(row.leadDays, 3);
  assert.equal(row.orderBy, '2026-02-06');
  assert.throws(() => savePurchasingProductSettings(stock, { storeId: 's', productId: 'p', minStock: -1, leadDays: null }), /valid/);
  assert.throws(() => savePurchasingProductSettings(stock, { storeId: 's', productId: 'bad', minStock: null, leadDays: null }), /not found/);
  savePurchasingProductSettings(stock, { storeId: 's', productId: 'p', minStock: null, leadDays: null });
  row = get().rows.find((item) => item.productId === 'p');
  assert.equal(row.minStock, null);
  assert.equal(row.leadOverride, null);
  assert.equal(row.leadDays, 1);
  stock.close(); sales.close();
});

test('coverage thresholds, overdue dates and stale or ambiguous products are handled', () => {
  const { stock, sales, get } = fixture();
  for (const [qty, expected] of [[20, 'Critical'], [21, 'Soon'], [42, 'Soon'], [43, 'OK']]) {
    stock.prepare("UPDATE store_stocks SET observed_stock_qty=? WHERE product_id='p'").run(qty);
    assert.equal(get().rows.find((item) => item.productId === 'p').status, expected);
  }
  stock.exec("UPDATE store_stocks SET observed_stock_qty=0 WHERE product_id='p'");
  const row = get().rows.find((item) => item.productId === 'p');
  assert.equal(row.orderBy, '2026-01-30');
  stock.exec("UPDATE store_stocks SET last_synced='2026-01-01' WHERE product_id='p'");
  assert.equal(get().rows.find((item) => item.productId === 'p').daysLeft, null);
  stock.exec("INSERT INTO products VALUES ('copy','Product','','Drinks','COPY'); INSERT INTO store_stocks VALUES ('s','copy',4,'2026-01-31')");
  assert.ok(get().rows.filter((item) => item.product === 'Product').every((item) => item.avg90 === null && item.orderQty === null));
  stock.close(); sales.close();
});

test('long occasions are included beyond one year when calculating stockout dates', () => {
  const { stock, sales, config, get } = fixture();
  stock.exec("UPDATE store_stocks SET observed_stock_qty=3000 WHERE product_id='p'");
  config.occasions.push({ name: 'Long promotion', start: '2026-01-31', end: '2028-01-30', adjustment: 100 });
  const row = get().rows.find((item) => item.productId === 'p');
  assert.equal(row.daysLeft, 500);
  assert.equal(row.stockoutDate, '2027-06-15');
  stock.close(); sales.close();
});

test('turnover and movement use a full year of observed daily stock and sales', () => {
  const { stock, sales, get } = fixture();
  stock.exec('DELETE FROM stock_snapshots');
  sales.exec('DELETE FROM sales_transactions');
  const snapshot = stock.prepare('INSERT INTO stock_snapshots VALUES (?, ?, ?, ?)');
  const sale = sales.prepare('INSERT INTO sales_transactions VALUES (?, ?, ?, ?, ?)');
  for (let i = 1; i <= 365; i++) {
    const date = new Date(Date.parse('2026-01-31T00:00:00Z') - i * 86400000).toISOString().slice(0, 10);
    snapshot.run('s', 'p', date, 20);
    sale.run('Store', 'Product', `${date} 12:00`, 2, 20);
  }
  const row = get().rows.find((item) => item.productId === 'p');
  assert.equal(row.turnover, 36.5);
  assert.equal(row.movementClass, 'Fast');
  stock.prepare("DELETE FROM stock_snapshots WHERE business_date='2025-03-01'").run();
  assert.equal(get().rows.find((item) => item.productId === 'p').turnover, null);
  stock.close(); sales.close();
});
