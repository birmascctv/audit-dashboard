import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  getLatestRawStockSnapshot,
  initializeRawStockTables,
  saveRawStockSnapshot,
} from '../rawStockStore.js';

test('stores and returns the raw stock payload without reshaping records', () => {
  const database = new DatabaseSync(':memory:');
  try {
    const payload = [
      { branch: 'KUNINGAN', product_code: 'A-1', stock_qty: '2,00', available_qty: '2,00' },
      { branch: 'SUDIRMAN', product_code: 'B-2', stock_qty: '7,00', available_qty: '5,00' },
    ];
    const saved = saveRawStockSnapshot(database, payload, {
      source: 'birmas-stock-list',
      receivedAt: '2026-10-12T09:00:00.000Z',
    });

    assert.equal(saved.recordCount, 2);
    assert.deepEqual(getLatestRawStockSnapshot(database), {
      ...saved,
      payload,
    });
  } finally {
    database.close();
  }
});

test('rejects empty stock lists without creating a snapshot', () => {
  const database = new DatabaseSync(':memory:');
  try {
    initializeRawStockTables(database);
    assert.throws(() => saveRawStockSnapshot(database, []), /contains no records/);
    assert.throws(() => saveRawStockSnapshot(database, { data: [] }), /contains no records/);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM raw_stock_snapshots').get().count, 0);
  } finally {
    database.close();
  }
});
