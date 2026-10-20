import { randomUUID } from 'node:crypto';

export function initializeRawStockTables(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS raw_stock_snapshots (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      received_at TEXT NOT NULL,
      record_count INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_raw_stock_snapshots_received
      ON raw_stock_snapshots(received_at DESC);
  `);
}

export function saveRawStockSnapshot(database, payload, { source = 'birmas-server', receivedAt = new Date().toISOString() } = {}) {
  initializeRawStockTables(database);
  const json = JSON.stringify(payload);
  if (json === undefined) {
    throw new Error('Stock snapshot must be valid JSON');
  }

  const explicitCount = Number(payload?.record_count ?? payload?.records_count);
  const recordCount = Number.isInteger(explicitCount) && explicitCount >= 0
    ? explicitCount
    : Array.isArray(payload)
      ? payload.length
      : Array.isArray(payload?.data)
        ? payload.data.length
        : Array.isArray(payload?.pages)
          ? payload.pages.reduce((sum, page) => sum + (Number(page.record_count) || 0), 0)
          : 1;
  if (recordCount < 1) {
    throw new Error('Stock snapshot contains no records');
  }

  const id = randomUUID();
  database.prepare(`
    INSERT INTO raw_stock_snapshots (id, source, received_at, record_count, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, source, receivedAt, recordCount, json);

  return { id, source, receivedAt, recordCount };
}

export function getLatestRawStockSnapshot(database) {
  initializeRawStockTables(database);
  const snapshot = database.prepare(`
    SELECT id, source, received_at AS receivedAt, record_count AS recordCount, payload_json AS payloadJson
    FROM raw_stock_snapshots
    ORDER BY received_at DESC, rowid DESC
    LIMIT 1
  `).get();
  if (!snapshot) return null;

  let payload;
  try {
    payload = JSON.parse(snapshot.payloadJson);
  } catch (err) {
    throw new Error(`Stored raw stock snapshot ${snapshot.id} is invalid JSON: ${err.message}`);
  }
  const { payloadJson, ...metadata } = snapshot;
  return { ...metadata, payload };
}
