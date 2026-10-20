import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { applyStockRowsToDatabase } from '../db.js';

function createTestDb() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE stores (
      id TEXT PRIMARY KEY,
      wp_id INTEGER,
      name TEXT NOT NULL,
      location_code TEXT,
      esb_branch_code TEXT
    );
    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      barcode TEXT UNIQUE,
      sku TEXT,
      brand TEXT,
      varian TEXT,
      product_title TEXT,
      category TEXT,
      sub_category TEXT,
      default_unit TEXT,
      package_type TEXT,
      volume REAL,
      unit_volume TEXT,
      price REAL,
      wp_status TEXT DEFAULT 'publish',
      last_updated TEXT
    );
    CREATE TABLE store_stocks (
      store_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      stock_qty REAL DEFAULT 0,
      available_qty REAL DEFAULT 0,
      booked_qty REAL DEFAULT 0,
      stock_value REAL DEFAULT 0,
      last_synced TEXT,
      PRIMARY KEY (store_id, product_id)
    );
  `);
  return database;
}

test('sums duplicate store+product rows from the same CSV instead of overwriting', () => {
  const database = createTestDb();
  try {
    applyStockRowsToDatabase(database, [
      { storeName: 'BIRMAS KUNINGAN', productName: 'Heineken Can 330ml', stockQty: 40 },
      { storeName: 'BIRMAS KUNINGAN', productName: 'Heineken Can 330ml', stockQty: 35 },
      { storeName: 'BIRMAS KUNINGAN', productName: 'Heineken Can 330ml', stockQty: 10 },
    ]);

    const row = database.prepare(`
      SELECT ss.stock_qty FROM store_stocks ss
      JOIN products p ON p.id = ss.product_id
      WHERE ss.store_id = 'birmas-kuningan' AND p.product_title = 'Heineken Can 330ml'
    `).get();

    assert.ok(row, 'expected a store_stocks row to exist');
    assert.equal(row.stock_qty, 85, 'duplicate product rows for the same store should be summed, not overwritten');
  } finally {
    database.close();
  }
});

test('keeps distinct products/stores independent while summing only true duplicates', () => {
  const database = createTestDb();
  try {
    applyStockRowsToDatabase(database, [
      { storeName: 'BIRMAS KUNINGAN', productName: 'Heineken Can 330ml', stockQty: 20 },
      { storeName: 'BIRMAS SUDIRMAN', productName: 'Heineken Can 330ml', stockQty: 5 },
      { storeName: 'BIRMAS KUNINGAN', productName: 'Bintang Can 330ml', stockQty: 7 },
    ]);

    const rows = database.prepare(`
      SELECT ss.store_id, p.product_title, ss.stock_qty FROM store_stocks ss
      JOIN products p ON p.id = ss.product_id
      ORDER BY ss.store_id, p.product_title
    `).all();

    assert.deepEqual(rows.map((r) => ({ ...r })), [
      { store_id: 'birmas-kuningan', product_title: 'Bintang Can 330ml', stock_qty: 7 },
      { store_id: 'birmas-kuningan', product_title: 'Heineken Can 330ml', stock_qty: 20 },
      { store_id: 'birmas-sudirman', product_title: 'Heineken Can 330ml', stock_qty: 5 },
    ], `unexpected rows: ${JSON.stringify(rows)}`);
  } finally {
    database.close();
  }
});
