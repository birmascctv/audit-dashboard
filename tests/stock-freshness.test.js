import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('records observed stock increases and decreases, but not local audit edits', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'audit-freshness-'));
  process.env.DATA_DIR = dir;
  const { getDb, getStockFreshness, setProductStock } = await import('../db.js');
  const db = getDb();
  try {
    const store = 'birmas-kuningan';
    const product = 'freshness-test';
    setProductStock(store, product, 10);
    assert.equal(getStockFreshness(store).lastChangedAt, null);
    setProductStock(store, product, 12);
    const increase = getStockFreshness(store);
    assert.ok(increase.lastStockInAt);
    assert.equal(increase.lastChangedAt, increase.lastStockInAt);
    assert.equal(increase.recentChanges[0].newQty, 12);

    setProductStock(store, product, 9);
    const decrease = getStockFreshness(store);
    assert.equal(decrease.recentChanges.length, 2);
    assert.ok(decrease.recentChanges.some((change) => change.oldQty === 12 && change.newQty === 9));

    setProductStock(store, product, 14, { observed: false });
    const local = getStockFreshness(store);
    assert.equal(local.recentChanges.length, 2);
    assert.equal(local.lastPulledAt, decrease.lastPulledAt);

    setProductStock(store, product, 9);
    assert.equal(getStockFreshness(store).recentChanges.length, 2);
    setProductStock(store, product, 11);
    assert.ok(getStockFreshness(store).recentChanges.some((change) => change.oldQty === 9 && change.newQty === 11));
  } finally {
    db.close();
    unlinkSync(path.join(dir, 'birmas_audit.sqlite'));
    rmdirSync(dir);
  }
});
