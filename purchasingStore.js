import { createHash } from 'node:crypto';
const EXCLUDED = new Set([
  'INTANGIBLE ASSET', 'ELECTRONIC', 'LAIN LAIN', 'LIGHTER',
  'PERLENGKAPAN OUTLET', 'RENOVATION', 'SUPPLIES',
]);
const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase().replace(/-/g, ' ');
const shiftDate = (date, amount) => new Date(Date.parse(`${date}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
const digest = (row) => createHash('sha256').update(JSON.stringify([
  row.purchase_number, row.purchase_date, row.branch, row.supplier_name, row.product_code,
  row.product_name, row.unit, row.po_qty, row.pricelist_price, row.price, row.discount,
  row.vat, row.total, row.notes, row.additional_info,
])).digest('hex');
const holidayCalendar = [
  ['New Year\'s Day', '2025-01-01'], ['Isra Miraj', '2025-01-27'], ['Chinese New Year', '2025-01-29'], ['Nyepi', '2025-03-29'],
  ['Eid al-Fitr', '2025-03-31', '2025-04-01'], ['Good Friday', '2025-04-18'], ['Easter Sunday', '2025-04-20'],
  ["International Workers' Day", '2025-05-01'], ['Vesak Day', '2025-05-12'], ['Ascension Day', '2025-05-29'],
  ['Pancasila Day', '2025-06-01'], ['Eid al-Adha', '2025-06-06'], ['Islamic New Year', '2025-06-27'],
  ['Indonesian Independence Day', '2025-08-17'], ["Prophet Muhammad's Birthday", '2025-09-05'], ['Christmas', '2025-12-25'],
  ['New Year\'s Day', '2026-01-01'], ['Isra Miraj', '2026-01-16'], ['Chinese New Year', '2026-02-17'], ['Nyepi', '2026-03-19'],
  ['Eid al-Fitr', '2026-03-21', '2026-03-22'], ['Good Friday', '2026-04-03'], ['Easter Sunday', '2026-04-05'],
  ["International Workers' Day", '2026-05-01'], ['Ascension Day', '2026-05-14'], ['Eid al-Adha', '2026-05-27'],
  ['Vesak Day', '2026-05-31'], ['Pancasila Day', '2026-06-01'], ['Islamic New Year', '2026-06-16'],
  ['Indonesian Independence Day', '2026-08-17'], ["Prophet Muhammad's Birthday", '2026-08-25'], ['Christmas', '2026-12-25'],
  ['New Year’s Day', '2027-01-01'], ['Isra Miraj', '2027-01-05'], ['Chinese New Year', '2027-02-06'], ['Nyepi', '2027-03-08'],
  ['Eid al-Fitr', '2027-03-10', '2027-03-11'], ['Good Friday', '2027-03-26'], ['Easter Sunday', '2027-03-28'],
  ["International Workers' Day", '2027-05-01'], ['Ascension Day', '2027-05-06'], ['Eid al-Adha', '2027-05-17'],
  ['Vesak Day', '2027-05-20'], ['Pancasila Day', '2027-06-01'], ['Islamic New Year', '2027-06-06'],
  ["Prophet Muhammad's Birthday", '2027-08-15'], ['Indonesian Independence Day', '2027-08-17'], ['Christmas', '2027-12-25'],
  ['Isra Miraj', '2027-12-26'],
];

export function calculateHolidayWindow(start, end = start) {
  const firstDay = new Date(`${start}T00:00:00Z`).getUTCDay();
  const duration = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  const lastDay = new Date(`${end}T00:00:00Z`).getUTCDay();
  if (duration === 1) {
    const offsets = { 0: [-2, 0], 1: [-3, 0], 2: [-4, 0], 3: [-1, 0], 4: [-1, 0], 5: [-1, 2], 6: [-1, 1] };
    const [before, after] = offsets[firstDay];
    return { start: shiftDate(start, before), end: shiftDate(start, after) };
  }
  if (duration === 2) {
    const explicit = {
      '1-2': [-4, 1], '2-3': [-1, 1], '3-4': [-1, 1], '4-5': [0, 3],
      '5-6': [-1, 2], '6-0': [-1, 1], '0-1': [-2, 1],
    }[`${firstDay}-${lastDay}`];
    if (explicit) return { start: shiftDate(start, explicit[0]), end: shiftDate(start, explicit[1]) };
  }
  const includesWeekend = [0, 6].some((day) => {
    for (let offset = 0; offset < duration; offset++) if (new Date(`${shiftDate(start, offset)}T00:00:00Z`).getUTCDay() === day) return true;
    return false;
  });
  const touchesWeekend = includesWeekend || [0, 5, 6].includes(firstDay) || [0, 5, 6].includes(lastDay);
  const startOffsets = { 0: -2, 1: -3, 2: -4, 3: -1, 4: -1, 5: -1, 6: -1 };
  const windowStart = shiftDate(start, startOffsets[firstDay]);
  if (!touchesWeekend) return { start: windowStart, end };
  const windowEnd = [0, 5, 6].includes(lastDay) ? shiftDate(end, (7 - lastDay) % 7) : end;
  return { start: windowStart, end: windowEnd };
}

export function ensurePurchasingSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchasing_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS purchasing_product_settings (
      store_id TEXT NOT NULL, product_id TEXT NOT NULL, min_stock REAL, lead_days INTEGER,
      movement_override TEXT, selected_supplier TEXT, PRIMARY KEY (store_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS purchasing_supplier_settings (
      store_id TEXT NOT NULL, product_id TEXT NOT NULL, supplier_name TEXT NOT NULL,
      lead_days INTEGER, moq REAL, purchasing_unit TEXT, conversion_qty REAL NOT NULL DEFAULT 1,
      base_unit TEXT, updated_at TEXT NOT NULL,
      PRIMARY KEY (store_id, product_id, supplier_name)
    );
    CREATE TABLE IF NOT EXISTS purchasing_qty_overrides (
      store_id TEXT NOT NULL, product_id TEXT NOT NULL, review_date TEXT NOT NULL,
      supplier_name TEXT NOT NULL DEFAULT '', coverage_days INTEGER NOT NULL,
      quantity REAL NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (store_id, product_id, review_date, supplier_name, coverage_days)
    );
    CREATE TABLE IF NOT EXISTS purchasing_holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, start_date TEXT NOT NULL,
      end_date TEXT NOT NULL, window_start TEXT NOT NULL, window_end TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(name, start_date, end_date)
    );
    CREATE TABLE IF NOT EXISTS purchasing_holiday_adjustments (
      holiday_id INTEGER NOT NULL REFERENCES purchasing_holidays(id) ON DELETE CASCADE,
      store_id TEXT NOT NULL, adjustment_pct REAL NOT NULL, combined_group TEXT NOT NULL DEFAULT '',
      PRIMARY KEY(holiday_id, store_id)
    );
    CREATE TABLE IF NOT EXISTS purchasing_history_imports (
      id TEXT PRIMARY KEY, filename TEXT NOT NULL, file_size INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL, uploaded_by TEXT NOT NULL, row_count INTEGER NOT NULL DEFAULT 0,
      duplicate_count INTEGER NOT NULL DEFAULT 0, archive_byte_length INTEGER, archive_chunk_count INTEGER
    );
    CREATE TABLE IF NOT EXISTS purchasing_history_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT, import_id TEXT NOT NULL REFERENCES purchasing_history_imports(id) ON DELETE CASCADE,
      source_row INTEGER NOT NULL, record_hash TEXT NOT NULL UNIQUE,
      purchase_number TEXT NOT NULL, purchase_date TEXT NOT NULL, required_date TEXT, branch TEXT NOT NULL,
      supplier_name TEXT NOT NULL, cost_center TEXT, project TEXT, product_code TEXT, category TEXT NOT NULL,
      sub_category TEXT, product_name TEXT NOT NULL, unit TEXT NOT NULL, po_qty REAL NOT NULL,
      pricelist_price REAL, price REAL, discount REAL, vat REAL, total REAL, notes TEXT,
      additional_info TEXT, receipt_qty REAL, status TEXT, purchasing_unit TEXT NOT NULL,
      conversion_qty REAL NOT NULL, base_unit TEXT NOT NULL, equivalent_qty REAL NOT NULL,
      excluded INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS purchasing_history_archive_chunks (
      import_id TEXT NOT NULL REFERENCES purchasing_history_imports(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL, content BLOB NOT NULL, PRIMARY KEY(import_id, chunk_index)
    );
    CREATE TABLE IF NOT EXISTS purchasing_weekly_review_runs (
      review_date TEXT PRIMARY KEY, stock_date TEXT, status TEXT NOT NULL, row_count INTEGER NOT NULL DEFAULT 0,
      reorder_count INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_purchasing_history_match ON purchasing_history_records(product_code, product_name, branch, purchase_date);
    CREATE INDEX IF NOT EXISTS idx_purchasing_history_import ON purchasing_history_records(import_id);
    CREATE INDEX IF NOT EXISTS idx_purchasing_holidays_dates ON purchasing_holidays(start_date, end_date, window_start, window_end);
  `);
  for (const [name, type] of [['movement_override', 'TEXT'], ['selected_supplier', 'TEXT']]) {
    if (!db.prepare('PRAGMA table_info(purchasing_product_settings)').all().some((column) => column.name === name)) {
      db.exec(`ALTER TABLE purchasing_product_settings ADD COLUMN ${name} ${type}`);
    }
  }
  const insertHoliday = db.prepare(`INSERT OR IGNORE INTO purchasing_holidays
    (name,start_date,end_date,window_start,window_end,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`);
  const now = new Date().toISOString();
  for (const [name, start, end = start] of holidayCalendar) {
    const window = calculateHolidayWindow(start, end);
    insertHoliday.run(name, start, end, window.start, window.end, now, now);
  }
}

export const isExcludedPurchasingCategory = (category) => EXCLUDED.has(normalize(category));

export function validatePurchaseHistoryRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw new Error('Provide between 1 and 10,000 purchase-history records per batch.');
  return rows.map((row) => {
    const requiredText = ['purchase_number', 'purchase_date', 'branch', 'supplier_name', 'category', 'product_name', 'unit'];
    if (!row || requiredText.some((key) => typeof row[key] !== 'string' || !row[key].trim())) throw new Error('A purchase-history row is missing a required text field.');
    const date = String(row.purchase_date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error(`Invalid purchase date on CSV row ${row.source_row}.`);
    const quantity = Number(row.po_qty);
    const conversion = Number(row.conversion_qty);
    const baseQty = Number(row.equivalent_qty);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(conversion) || conversion <= 0 ||
        !Number.isFinite(baseQty) || baseQty <= 0 || Math.abs(baseQty - quantity * conversion) > 1e-8) {
      throw new Error(`Invalid PO quantity or unit conversion on CSV row ${row.source_row}.`);
    }
    return { ...row, purchase_date: date, required_date: row.required_date || null, po_qty: quantity,
      conversion_qty: conversion, equivalent_qty: baseQty, excluded: isExcludedPurchasingCategory(row.category) ? 1 : 0 };
  });
}

export function insertPurchaseHistoryRows(db, { importId, filename, fileSize = 0, uploadedBy, rows, uploadedAt = new Date().toISOString() }) {
  ensurePurchasingSchema(db);
  if (typeof importId !== 'string' || !importId || typeof filename !== 'string' || !filename ||
      typeof uploadedBy !== 'string' || !uploadedBy) throw new Error('Purchase history import metadata is required.');
  const cleanRows = validatePurchaseHistoryRows(rows);
  const insertImport = db.prepare(`INSERT INTO purchasing_history_imports (id,filename,file_size,uploaded_at,uploaded_by)
    VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET filename=excluded.filename,file_size=excluded.file_size`);
  const insert = db.prepare(`INSERT OR IGNORE INTO purchasing_history_records (
    import_id,source_row,record_hash,purchase_number,purchase_date,required_date,branch,supplier_name,cost_center,
    project,product_code,category,sub_category,product_name,unit,po_qty,pricelist_price,price,discount,vat,total,
    notes,additional_info,receipt_qty,status,purchasing_unit,conversion_qty,base_unit,equivalent_qty,excluded
  ) VALUES (${Array.from({ length: 30 }, () => '?').join(',')})`);
  let inserted = 0, duplicates = 0;
  db.exec('BEGIN');
  try {
    insertImport.run(importId, filename, Number(fileSize) || 0, uploadedAt, uploadedBy);
    for (const row of cleanRows) {
      const changed = insert.run(importId, Number(row.source_row), digest(row), row.purchase_number.trim(), row.purchase_date,
        row.required_date, row.branch.trim(), row.supplier_name.trim(), row.cost_center || '', row.project || '',
        row.product_code || '', row.category.trim(), row.sub_category || '', row.product_name.trim(), row.unit.trim(),
        row.po_qty, row.pricelist_price, row.price, row.discount, row.vat, row.total, row.notes || '',
        row.additional_info || '', row.receipt_qty, row.status || '', row.purchasing_unit, row.conversion_qty,
        row.base_unit, row.equivalent_qty, row.excluded);
      if (Number(changed.changes)) inserted++; else duplicates++;
    }
    db.prepare(`UPDATE purchasing_history_imports SET row_count =
      (SELECT COUNT(*) FROM purchasing_history_records WHERE import_id=?),
      duplicate_count=duplicate_count+? WHERE id=?`).run(importId, duplicates, importId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { inserted, duplicates };
}

export function putPurchaseArchiveChunk(db, importId, index, content) {
  ensurePurchasingSchema(db);
  if (!Number.isInteger(index) || index < 0 || !Buffer.isBuffer(content) || content.length > 1024 * 1024) throw new Error('Invalid archive chunk.');
  if (!db.prepare('SELECT 1 FROM purchasing_history_imports WHERE id=?').get(importId)) throw new Error('Purchase history import not found.');
  db.prepare(`INSERT INTO purchasing_history_archive_chunks(import_id,chunk_index,content) VALUES(?,?,?)
    ON CONFLICT(import_id,chunk_index) DO UPDATE SET content=excluded.content`).run(importId, index, content);
}

export function finishPurchaseArchive(db, importId, byteLength, chunkCount) {
  ensurePurchasingSchema(db);
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || !Number.isInteger(chunkCount) || chunkCount < 1 ||
      chunkCount !== Math.ceil(byteLength / (1024 * 1024))) throw new Error('Invalid archive metadata.');
  const chunks = db.prepare('SELECT chunk_index,length(content) AS size FROM purchasing_history_archive_chunks WHERE import_id=? ORDER BY chunk_index').all(importId);
  if (chunks.length !== chunkCount || chunks.some((chunk, index) => chunk.chunk_index !== index) ||
      chunks.reduce((sum, chunk) => sum + chunk.size, 0) !== byteLength) throw new Error('Original CSV archive is incomplete.');
  db.prepare('UPDATE purchasing_history_imports SET archive_byte_length=?,archive_chunk_count=? WHERE id=?').run(byteLength, chunkCount, importId);
}

export function listPurchaseHistoryImports(db) {
  ensurePurchasingSchema(db);
  return db.prepare(`SELECT id,filename,file_size AS fileSize,uploaded_at AS uploadedAt,uploaded_by AS uploadedBy,
    row_count AS rowCount,duplicate_count AS duplicateCount,
    archive_byte_length IS NOT NULL AS archived FROM purchasing_history_imports ORDER BY uploaded_at DESC`).all();
}

export function recordPurchasingWeeklyReview(db, { reviewDate, stockDate = null, status, rowCount = 0, reorderCount = 0, error = null }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate) || !['completed', 'waiting_for_stock', 'failed'].includes(status)) {
    throw new Error('Invalid weekly purchasing review status.');
  }
  ensurePurchasingSchema(db);
  db.prepare(`INSERT INTO purchasing_weekly_review_runs(review_date,stock_date,status,row_count,reorder_count,error,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(review_date) DO UPDATE SET stock_date=excluded.stock_date,status=excluded.status,
    row_count=excluded.row_count,reorder_count=excluded.reorder_count,error=excluded.error,updated_at=excluded.updated_at`)
    .run(reviewDate, stockDate, status, rowCount, reorderCount, error ? String(error).slice(0, 1000) : null, new Date().toISOString());
}

export { holidayCalendar };
