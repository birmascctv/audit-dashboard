const TIME_ZONE = 'Asia/Jakarta';

function jakartaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function ensureStockSnapshots(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS stock_snapshots (
      business_date TEXT NOT NULL,
      store_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      stock_qty REAL,
      captured_at TEXT NOT NULL,
      PRIMARY KEY (business_date, store_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_stock_snapshots_store_date ON stock_snapshots(store_id, business_date);
    CREATE TABLE IF NOT EXISTS stock_snapshot_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, business_date TEXT NOT NULL, captured_at TEXT NOT NULL,
      status TEXT NOT NULL, row_count INTEGER NOT NULL DEFAULT 0, error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stock_snapshot_sync_log_date ON stock_snapshot_sync_log(business_date, captured_at);
  `);
}

export function recordStockSnapshotStatus(sqlite, status, error = null, rowCount = 0, date = new Date()) {
  ensureStockSnapshots(sqlite);
  const parts = jakartaParts(date);
  const businessDate = `${parts.year}-${parts.month}-${parts.day}`;
  sqlite.prepare(`INSERT INTO stock_snapshot_sync_log(business_date,captured_at,status,row_count,error)
    VALUES(?,?,?,?,?)`).run(businessDate, date.toISOString(), status, rowCount, error ? String(error).slice(0, 1000) : null);
}

export function captureStockSnapshot(sqlite, date = new Date()) {
  ensureStockSnapshots(sqlite);
  const parts = jakartaParts(date);
  const businessDate = `${parts.year}-${parts.month}-${parts.day}`;
  const beforeSix = Number(parts.hour) < 6;
  const existing = sqlite.prepare('SELECT COUNT(*) AS count FROM stock_snapshots WHERE business_date = ?').get(businessDate).count;
  if (existing && !beforeSix) {
    sqlite.prepare(`INSERT INTO stock_snapshot_sync_log(business_date,captured_at,status,row_count,error)
      VALUES(?,?,'snapshot_already_exists',?,NULL)`).run(businessDate, date.toISOString(), existing);
    return { businessDate, captured: false, rows: existing };
  }

  const capturedAt = date.toISOString();
  const rows = sqlite.prepare(`
    SELECT ss.store_id, ss.product_id, COALESCE(NULLIF(p.product_title, ''), p.varian, ss.product_id) AS product_name,
      ss.stock_qty
    FROM store_stocks ss
    LEFT JOIN products p ON p.id = ss.product_id
  `).all();
  if (!rows.length) {
    sqlite.prepare(`INSERT INTO stock_snapshot_sync_log(business_date,captured_at,status,row_count,error)
      VALUES(?,?,'no_data',0,'No inventory rows were available to snapshot.')`).run(businessDate, capturedAt);
    return { businessDate, captured: false, rows: 0 };
  }
  const insert = sqlite.prepare(`
    INSERT INTO stock_snapshots (business_date, store_id, product_id, product_name, stock_qty, captured_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(business_date, store_id, product_id) DO NOTHING
  `);
  let inserted = 0;
  sqlite.exec('BEGIN');
  try {
    for (const row of rows) inserted += Number(insert.run(businessDate, row.store_id, row.product_id, row.product_name, row.stock_qty, capturedAt).changes);
    sqlite.prepare(`INSERT INTO stock_snapshot_sync_log(business_date,captured_at,status,row_count,error)
      VALUES(?,?,'captured',?,NULL)`).run(businessDate, capturedAt, inserted);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    sqlite.prepare(`INSERT INTO stock_snapshot_sync_log(business_date,captured_at,status,row_count,error)
      VALUES(?,?,'failed',0,?)`).run(businessDate, capturedAt, String(error.message || error).slice(0, 1000));
    throw error;
  }
  return { businessDate, captured: true, rows: inserted };
}
