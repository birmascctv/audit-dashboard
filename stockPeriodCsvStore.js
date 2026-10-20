import { randomUUID } from 'node:crypto';

export function initializeStockPeriodCsvTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS stock_period_csv_uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      record_count INTEGER NOT NULL,
      csv_content TEXT NOT NULL,
      generated_at TEXT,
      stock_date TEXT,
      stores_json TEXT,
      records_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stock_period_csv_uploads_uploaded
      ON stock_period_csv_uploads(uploaded_at DESC);
  `);
  for (const column of [
    'generated_at TEXT',
    'stock_date TEXT',
    'stores_json TEXT',
    'records_json TEXT',
  ]) {
    try {
      database.exec(`ALTER TABLE stock_period_csv_uploads ADD COLUMN ${column}`);
    } catch (err) {
      if (!String(err.message).includes('duplicate column name')) throw err;
    }
  }
}

export function saveStockPeriodCsv(database, upload, {
  uploadedAt = new Date().toISOString(),
} = {}) {
  initializeStockPeriodCsvTable(database);
  const id = randomUUID();
  database.prepare(`
    INSERT INTO stock_period_csv_uploads (id, filename, uploaded_at, uploaded_by, record_count, csv_content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    upload.filename,
    uploadedAt,
    upload.uploadedBy,
    upload.recordCount,
    upload.csvContent,
  );
  database.prepare(`
    UPDATE stock_period_csv_uploads
    SET generated_at = ?, stock_date = ?, stores_json = ?, records_json = ?
    WHERE id = ?
  `).run(
    upload.generatedAt,
    upload.stockDate,
    JSON.stringify(upload.stores),
    JSON.stringify(upload.records),
    id,
  );

  return {
    id,
    filename: upload.filename,
    uploadedAt,
    uploadedBy: upload.uploadedBy,
    recordCount: upload.recordCount,
    generatedAt: upload.generatedAt,
    stockDate: upload.stockDate,
    stores: upload.stores,
  };
}

export function listStockPeriodCsvUploads(database) {
  initializeStockPeriodCsvTable(database);
  return database.prepare(`
    SELECT id, filename, uploaded_at AS uploadedAt, uploaded_by AS uploadedBy,
      record_count AS recordCount, generated_at AS generatedAt, stock_date AS stockDate,
      stores_json AS storesJson
    FROM stock_period_csv_uploads
    ORDER BY uploaded_at DESC, rowid DESC
  `).all().map((upload) => {
    let stores = [];
    try {
      stores = JSON.parse(upload.storesJson || '[]');
    } catch (err) {
      throw new Error(`Stored CSV ${upload.id} has invalid store metadata: ${err.message}`);
    }
    const { storesJson, ...metadata } = upload;
    return { ...metadata, stores };
  });
}

export function getStockPeriodCsvDownload(database, id) {
  initializeStockPeriodCsvTable(database);
  return database.prepare(`
    SELECT id, filename, uploaded_at AS uploadedAt, csv_content AS csvContent
    FROM stock_period_csv_uploads
    WHERE id = ?
  `).get(id) || null;
}

export function getStockPeriodCsvUploadData(database, id) {
  initializeStockPeriodCsvTable(database);
  const upload = database.prepare(`
    SELECT id, filename, uploaded_at AS uploadedAt, uploaded_by AS uploadedBy,
      record_count AS recordCount, generated_at AS generatedAt, stock_date AS stockDate,
      stores_json AS storesJson, records_json AS recordsJson
    FROM stock_period_csv_uploads
    WHERE id = ?
  `).get(id);
  if (!upload) return null;

  let stores = [];
  let records = [];
  try {
    stores = JSON.parse(upload.storesJson || '[]');
    records = JSON.parse(upload.recordsJson || '[]');
  } catch (err) {
    throw new Error(`Stored CSV ${upload.id} has invalid parsed data: ${err.message}`);
  }
  const { storesJson, recordsJson, ...metadata } = upload;
  return { ...metadata, stores, records };
}

export function getLatestStockPeriodCsvUpload(database) {
  initializeStockPeriodCsvTable(database);
  const upload = database.prepare(`
    SELECT id
    FROM stock_period_csv_uploads
    ORDER BY COALESCE(stock_date, '') DESC, uploaded_at DESC, rowid DESC
    LIMIT 1
  `).get();
  return upload ? getStockPeriodCsvUploadData(database, upload.id) : null;
}

export function deleteStockPeriodCsvUpload(database, id) {
  initializeStockPeriodCsvTable(database);
  return database.prepare(`
    DELETE FROM stock_period_csv_uploads
    WHERE id = ?
  `).run(id).changes > 0;
}
