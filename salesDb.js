import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLocalizedNumber } from './src/utils/salesCsv.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const DB_PATH = path.join(DATA_DIR, 'sales_clean.sqlite');
const CSV_COLUMNS = [
  ['sales_date_in', 'Sales Date In'],
  ['branch', 'Branch'],
  ['visit_purpose', 'Visit Purpose'],
  ['payment_method', 'Payment Method'],
  ['menu_category', 'Menu Category'],
  ['menu_category_detail', 'Menu Category Detail'],
  ['menu', 'Menu'],
  ['qty', 'Qty'],
  ['price', 'Price'],
  ['subtotal', 'Subtotal'],
  ['discount', 'Discount'],
  ['total_after_bill_discount', 'Total After Bill Discount'],
];

let database;

export function initializeSalesDatabase(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS sales_imports (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      file_size TEXT,
      uploaded_at TEXT NOT NULL,
      uploaded_by TEXT
    );
    CREATE TABLE IF NOT EXISTS sales_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id TEXT NOT NULL REFERENCES sales_imports(id) ON DELETE CASCADE,
      source_row INTEGER NOT NULL,
      sales_date_in TEXT NOT NULL,
      branch TEXT NOT NULL,
      visit_purpose TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      menu_category TEXT NOT NULL,
      menu_category_detail TEXT NOT NULL,
      menu TEXT NOT NULL,
      qty REAL NOT NULL,
      price REAL NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL,
      total_after_bill_discount REAL NOT NULL,
      UNIQUE(import_id, source_row)
    );
    CREATE INDEX IF NOT EXISTS idx_clean_sales_date ON sales_transactions(sales_date_in);
    CREATE INDEX IF NOT EXISTS idx_clean_sales_branch ON sales_transactions(branch);
    CREATE INDEX IF NOT EXISTS idx_clean_sales_import ON sales_transactions(import_id);
    CREATE INDEX IF NOT EXISTS idx_clean_sales_dedupe ON sales_transactions(sales_date_in, menu);
  `);
}

export function getSalesDb() {
  if (!database) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    database = new DatabaseSync(DB_PATH);
    // See db.js getDb() for why this is DELETE (classic rollback journal) and
    // not WAL: WAL requires the containing directory to be writable (to create
    // -wal/-shm files) and persists that requirement in the file itself.
    try {
      database.exec('PRAGMA journal_mode = DELETE;');
      database.exec('PRAGMA busy_timeout = 5000;');
    } catch (err) {
      console.error('[SalesDB] Failed to apply PRAGMA settings:', err.message);
    }
    initializeSalesDatabase(database);
  }
  return database;
}

function normalizeRow(row) {
  const get = (snake, camel, label) => row[snake] ?? row[camel] ?? row[label] ?? '';

  // Numeric fields: treat missing/blank/non-numeric values as 0 instead of
  // rejecting the whole row - a row with a 0 qty/price/discount/total (e.g. a
  // complimentary item or a promo line) is still a real transaction and should
  // be imported as-is.
  const toNumber = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };
  const quantity = toNumber(get('qty', 'qty', 'Qty'));
  const price = toNumber(get('price', 'price', 'Price'));
  const discount = toNumber(get('discount', 'discount', 'Discount'));
  const total = toNumber(get('total_after_bill_discount', 'totalAfterBillDiscount', 'Total After Bill Discount'));

  // Sales Date In (column H in the ESB export) is the only field that genuinely
  // needs a usable value for reporting - fall back to parsing it loosely, and
  // only default to "now" if it truly can't be read, rather than dropping the row.
  let salesDateIn = String(get('sales_date_in', 'salesDateIn', 'Sales Date In')).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(salesDateIn)) {
    const parsed = salesDateIn ? new Date(salesDateIn) : null;
    salesDateIn = parsed && !isNaN(parsed.getTime())
      ? parsed.toISOString().slice(0, 19).replace('T', ' ')
      : new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  const branch = String(get('branch', 'branch', 'Branch')).trim() || 'Unknown Branch';

  return {
    sales_date_in: salesDateIn,
    branch,
    visit_purpose: String(get('visit_purpose', 'visitPurpose', 'Visit Purpose')).trim(),
    payment_method: String(get('payment_method', 'paymentMethod', 'Payment Method')).trim(),
    menu_category: String(get('menu_category', 'menuCategory', 'Menu Category')).trim(),
    menu_category_detail: String(get('menu_category_detail', 'menuCategoryDetail', 'Menu Category Detail')).trim(),
    menu: String(get('menu', 'menu', 'Menu')).trim(),
    qty: quantity,
    price,
    subtotal: quantity * price,
    discount,
    total_after_bill_discount: total,
  };
}


export function insertSalesRows(db, {
  fileId,
  filename,
  fileSize = '',
  uploadedBy = 'Admin',
  uploadedAt = new Date().toISOString(),
  sourceRowOffset = 0,
  rows,
}) {
  if (!fileId || !Array.isArray(rows) || rows.length === 0) throw new Error('An import ID and at least one sales row are required.');
  const insertImport = db.prepare(`
    INSERT INTO sales_imports (id, filename, file_size, uploaded_at, uploaded_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      filename = excluded.filename,
      file_size = excluded.file_size
  `);
  const insertTransaction = db.prepare(`
    INSERT INTO sales_transactions (
      import_id, source_row, sales_date_in, branch, visit_purpose, payment_method,
      menu_category, menu_category_detail, menu, qty, price, subtotal, discount,
      total_after_bill_discount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(import_id, source_row) DO UPDATE SET
      sales_date_in = excluded.sales_date_in,
      branch = excluded.branch,
      visit_purpose = excluded.visit_purpose,
      payment_method = excluded.payment_method,
      menu_category = excluded.menu_category,
      menu_category_detail = excluded.menu_category_detail,
      menu = excluded.menu,
      qty = excluded.qty,
      price = excluded.price,
      subtotal = excluded.subtotal,
      discount = excluded.discount,
      total_after_bill_discount = excluded.total_after_bill_discount
  `);
  // A row is a duplicate of an already-imported transaction when its exact Sales
  // Date In timestamp and Menu (product variant) match one already stored in a
  // *different* row slot - this still lets the exact same (import_id, source_row)
  // slot be resubmitted/updated in place via the ON CONFLICT clause above (e.g. a
  // retried chunk), while any other matching row - from this import, an earlier
  // chunk of it, or a previous CSV altogether - is skipped instead of duplicated.
  const findDuplicate = db.prepare(`
    SELECT 1 FROM sales_transactions
    WHERE sales_date_in = ? AND menu = ? AND NOT (import_id = ? AND source_row = ?)
    LIMIT 1
  `);

  let duplicateCount = 0;
  db.exec('BEGIN');
  try {
    insertImport.run(fileId, filename || 'sales.csv', fileSize, uploadedAt, uploadedBy);
    const seenInBatch = new Set();
    rows.forEach((row, index) => {
      const clean = normalizeRow(row);
      const sourceRow = sourceRowOffset + index;
      const dedupeKey = `${clean.sales_date_in}\u0000${clean.menu}`;
      const isDuplicate = seenInBatch.has(dedupeKey) ||
        Boolean(findDuplicate.get(clean.sales_date_in, clean.menu, fileId, sourceRow));
      if (isDuplicate) {
        duplicateCount++;
        return;
      }
      seenInBatch.add(dedupeKey);
      insertTransaction.run(
        fileId,
        sourceRow,
        ...CSV_COLUMNS.map(([key]) => clean[key]),
      );
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const summary = db.prepare(`
    SELECT COUNT(*) AS row_count, COALESCE(SUM(total_after_bill_discount), 0) AS total_revenue
    FROM sales_transactions WHERE import_id = ?
  `).get(fileId);
  return { ...summary, duplicate_count: duplicateCount };
}

// Idempotent live sync: replaces the rows of one rolling window under a fixed import id
export function replaceLiveSalesWindow(db, { fileId = 'birmas-live', filename = 'Birmas live sync', fromDate, rows }) {
  const clean = rows.map(normalizeRow).filter((row) => row.sales_date_in.slice(0, 10) >= fromDate);
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO sales_imports (id, filename, file_size, uploaded_at, uploaded_by)
      VALUES (?, ?, '', ?, 'Birmas server') ON CONFLICT(id) DO UPDATE SET filename = excluded.filename`)
      .run(fileId, filename, new Date().toISOString());
    db.prepare('DELETE FROM sales_transactions WHERE import_id = ? AND substr(sales_date_in, 1, 10) >= ?').run(fileId, fromDate);
    let sourceRow = db.prepare('SELECT COALESCE(MAX(source_row), -1) + 1 AS next FROM sales_transactions WHERE import_id = ?').get(fileId).next;
    const insert = db.prepare(`INSERT INTO sales_transactions (
      import_id, source_row, sales_date_in, branch, visit_purpose, payment_method,
      menu_category, menu_category_detail, menu, qty, price, subtotal, discount, total_after_bill_discount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const row of clean) insert.run(fileId, sourceRow++, ...CSV_COLUMNS.map(([key]) => row[key]));
    db.exec('COMMIT');
    return clean.length;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function getLatestSalesDate(db, fileId = 'birmas-live') {
  return db.prepare('SELECT MAX(substr(sales_date_in, 1, 10)) AS d FROM sales_transactions WHERE import_id = ?').get(fileId)?.d || null;
}

export function makeWhere(filters = {}) {
  const clauses = [];
  const values = [];
  if (filters.storeId) {
    clauses.push('branch = ?');
    values.push(filters.storeId);
  } else if (filters.storeIds !== undefined && filters.storeIds !== null) {
    const storeIds = Array.isArray(filters.storeIds)
      ? filters.storeIds
      : String(filters.storeIds).split(',').filter(Boolean);
    if (storeIds.length) {
      clauses.push(`branch IN (${storeIds.map(() => '?').join(', ')})`);
      values.push(...storeIds);
    } else {
      clauses.push('1 = 0');
    }
  }
  if (filters.startDate) {
    clauses.push('sales_date_in >= ?');
    values.push(`${filters.startDate} 00:00:00`);
  }
  if (filters.endDate) {
    const nextDate = new Date(`${filters.endDate}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    clauses.push('sales_date_in < ?');
    values.push(`${nextDate.toISOString().slice(0, 10)} 00:00:00`);
  }
  if (filters.importId) {
    clauses.push('import_id = ?');
    values.push(filters.importId);
  }
  if (filters.search) {
    clauses.push('(menu LIKE ? OR menu_category LIKE ? OR menu_category_detail LIKE ? OR branch LIKE ? OR payment_method LIKE ? OR visit_purpose LIKE ?)');
    const term = `%${filters.search}%`;
    values.push(term, term, term, term, term, term);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

function aggregateRows(db, sql, values) {
  return db.prepare(sql).all(...values);
}

export function allocatePaymentSales(rows, dimensions = []) {
  const totals = new Map();
  for (const row of rows) {
    const source = String(row.payment_method || '').trim();
    const matches = [...source.matchAll(/([^,]+?)\s*\(([^()]*)\)/g)];
    let allocations = matches.map((match) => ({
      name: match[1].trim(),
      amount: parseLocalizedNumber(match[2]),
    })).filter((item) => item.name && item.amount !== null);
    if (!allocations.length) allocations = [{ name: source || 'Unspecified', amount: 1 }];
    const amountTotal = allocations.reduce((sum, item) => sum + item.amount, 0);
    const useEqualShares = amountTotal <= 0;
    const rowSales = Number(row.sales) || 0;
    for (const allocation of allocations) {
      const share = useEqualShares ? 1 / allocations.length : allocation.amount / amountTotal;
      const keyValues = [...dimensions.map((name) => row[name]), allocation.name];
      const key = JSON.stringify(keyValues);
      const current = totals.get(key) || Object.fromEntries([...dimensions.map((name) => [name, row[name]]), ['payment_method', allocation.name], ['sales', 0]]);
      current.sales += rowSales * share;
      totals.set(key, current);
    }
  }
  return [...totals.values()].sort((a, b) => b.sales - a.sales);
}

export function getSalesStores() {
  return getSalesDb().prepare(`
    SELECT branch AS name FROM sales_transactions GROUP BY branch ORDER BY branch
  `).all();
}

export function getSalesReport(filters = {}) {
  const db = getSalesDb();
  const { sql, values } = makeWhere(filters);
  const limit = Math.max(1, Math.min(Number(filters.limit) || 100, 100));
  const offset = Math.max(0, Number(filters.offset) || 0);
  const total = db.prepare(`SELECT COUNT(*) AS total FROM sales_transactions ${sql}`).get(...values).total;
  const rows = db.prepare(`
    SELECT sales_date_in, branch, visit_purpose, payment_method, menu_category,
      menu_category_detail, menu, qty, price, subtotal, discount, total_after_bill_discount
    FROM sales_transactions ${sql}
    ORDER BY sales_date_in DESC, id DESC LIMIT ? OFFSET ?
  `).all(...values, limit, offset);
  return { transactions: rows, total };
}

function pivotRows(db, where, dimension, filters) {
  const expr = {
    brand: 'menu_category_detail',
    category: 'menu_category',
    variant: 'menu',
  }[dimension];
  const conditions = [where.sql ? where.sql.slice(6) : '1 = 1'];
  if (dimension === 'brand') {
    conditions.push("UPPER(menu_category) NOT LIKE '%PROMO%' AND UPPER(menu_category_detail) NOT LIKE '%PROMO%'");
  }
  const values = [...where.values];
  if (filters.search) {
    conditions.push(`${expr} LIKE ?`);
    values.push(`%${filters.search}%`);
  }
  return aggregateRows(db, `
    SELECT ${expr} AS item, payment_method, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions
    WHERE ${conditions.join(' AND ')} AND ${expr} <> ''
    GROUP BY ${expr}, payment_method
    ORDER BY item, sales DESC
  `, values);
}

export function getSalesSummary(filters = {}) {
  const db = getSalesDb();
  const where = makeWhere(filters);
  const base = db.prepare(`
    SELECT COUNT(*) AS totalLineItems, COALESCE(SUM(qty), 0) AS totalUnitsSold,
      COALESCE(SUM(subtotal), 0) AS totalSubtotal,
      COALESCE(SUM(discount), 0) AS totalDiscounts,
      COALESCE(SUM(total_after_bill_discount), 0) AS totalNetSales
    FROM sales_transactions ${where.sql}
  `).get(...where.values);
  const paymentRows = aggregateRows(db, `
    SELECT payment_method, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    GROUP BY payment_method ORDER BY sales DESC
  `, where.values);
  const topVisitPurposes = aggregateRows(db, `
    SELECT visit_purpose AS name, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    GROUP BY visit_purpose ORDER BY sales DESC LIMIT 10
  `, where.values);
  const byStoreVisitPurpose = aggregateRows(db, `
    SELECT branch, visit_purpose AS name, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    GROUP BY branch, visit_purpose ORDER BY branch, sales DESC
  `, where.values);
  const variantByStorePaymentRows = aggregateRows(db, `
    SELECT branch, menu AS item, payment_method, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql} ${where.sql ? 'AND' : 'WHERE'} menu <> ''
    GROUP BY branch, menu, payment_method ORDER BY menu, branch, sales DESC
  `, where.values);
  const variantByStorePayment = allocatePaymentSales(variantByStorePaymentRows, ['branch', 'item']);
  const byStoreCategory = aggregateRows(db, `
    SELECT branch, menu_category AS name,
      SUM(total_after_bill_discount) AS sales, SUM(qty) AS units
    FROM sales_transactions ${where.sql} ${where.sql ? 'AND' : 'WHERE'} menu_category <> ''
    GROUP BY branch, menu_category ORDER BY branch, sales DESC
  `, where.values);
  const payments = allocatePaymentSales(paymentRows).map((row) => ({ name: row.payment_method, sales: row.sales }));
  const byStore = aggregateRows(db, `
    SELECT branch AS name, SUM(total_after_bill_discount) AS sales, SUM(qty) AS units, COUNT(*) AS lines
    FROM sales_transactions ${where.sql}
    GROUP BY branch ORDER BY sales DESC
  `, where.values);

  const productWhere = {
    sql: where.sql
      ? `${where.sql} AND UPPER(menu_category) NOT LIKE '%PROMO%' AND UPPER(menu_category_detail) NOT LIKE '%PROMO%'`
      : `WHERE UPPER(menu_category) NOT LIKE '%PROMO%' AND UPPER(menu_category_detail) NOT LIKE '%PROMO%'`,
    values: where.values,
  };
  const byBrand = aggregateRows(db, `
    SELECT menu_category_detail AS name, SUM(total_after_bill_discount) AS sales, SUM(qty) AS units
    FROM sales_transactions ${productWhere.sql} AND menu_category_detail <> ''
    GROUP BY menu_category_detail ORDER BY sales DESC
  `, productWhere.values);
  const topProductsAllStores = aggregateRows(db, `
    SELECT 'All stores' AS branch, menu, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${productWhere.sql} AND menu <> ''
    GROUP BY menu ORDER BY sales DESC LIMIT 10
  `, productWhere.values);
  const byStoreBrand = aggregateRows(db, `
    SELECT branch, menu_category_detail AS name,
      SUM(total_after_bill_discount) AS sales, SUM(qty) AS units
    FROM sales_transactions ${productWhere.sql} AND menu_category_detail <> ''
    GROUP BY branch, menu_category_detail ORDER BY branch, sales DESC
  `, productWhere.values);
  const byCategory = aggregateRows(db, `
    SELECT menu_category AS name, SUM(total_after_bill_discount) AS sales, SUM(qty) AS units
    FROM sales_transactions ${where.sql} ${where.sql ? 'AND' : 'WHERE'} menu_category <> ''
    GROUP BY menu_category ORDER BY sales DESC
  `, where.values);
  const promotions = aggregateRows(db, `
    SELECT menu AS name, branch, SUM(total_after_bill_discount) AS sales, SUM(qty) AS units,
      MIN(substr(sales_date_in, 1, 10)) AS start_date,
      MAX(substr(sales_date_in, 1, 10)) AS end_date
    FROM sales_transactions ${where.sql}
    ${where.sql ? 'AND' : 'WHERE'}
      (UPPER(menu_category) LIKE '%PROMO%' OR UPPER(menu_category_detail) LIKE '%PROMO%')
    GROUP BY menu, branch ORDER BY sales DESC
  `, where.values);
  const byVisitPurpose = aggregateRows(db, `
    SELECT visit_purpose AS name, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    GROUP BY visit_purpose ORDER BY sales DESC
  `, where.values);
  const storePaymentRows = aggregateRows(db, `
    SELECT branch AS branch, payment_method, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    GROUP BY branch, payment_method ORDER BY branch, sales DESC
  `, where.values);
  const storePayments = allocatePaymentSales(storePaymentRows, ['branch']);
  const topProductsByStore = aggregateRows(db, `
    SELECT branch, menu, sales FROM (
      SELECT branch, menu, SUM(total_after_bill_discount) AS sales,
        ROW_NUMBER() OVER (PARTITION BY branch ORDER BY SUM(total_after_bill_discount) DESC) AS rank
      FROM sales_transactions ${productWhere.sql} AND menu <> ''
      GROUP BY branch, menu
    ) WHERE rank <= 10 ORDER BY branch, rank
  `, productWhere.values);

  return {
    ...base,
    byStore,
    payments,
    byBrand,
    byStoreBrand,
    byCategory,
    byStoreCategory,
    promotions,
    byVisitPurpose,
    topVisitPurposes,
    byStoreVisitPurpose,
    variantByStorePayment,
    storePayments,
    topProductsByStore,
    topProductsAllStores,
    pivots: {
      brand: allocatePaymentSales(pivotRows(db, where, 'brand', filters), ['item']),
      category: allocatePaymentSales(pivotRows(db, where, 'category', filters), ['item']),
      variant: allocatePaymentSales(pivotRows(db, where, 'variant', filters), ['item']),
    },
  };
}

export function getSalesTimeSeries(filters = {}) {
  const db = getSalesDb();
  const where = makeWhere(filters);
  const weeklyByPaymentRows = db.prepare(`
    SELECT branch, payment_method, date(substr(sales_date_in, 1, 10), '-' ||
      ((CAST(strftime('%w', substr(sales_date_in, 1, 10)) AS INTEGER) + 6) % 7) || ' days') AS week_start,
      SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    GROUP BY branch, payment_method, week_start ORDER BY week_start, branch
  `).all(...where.values);
  const weeklyByPayment = allocatePaymentSales(weeklyByPaymentRows, ['branch', 'week_start']);
  const hourlyByPaymentRows = db.prepare(`
    SELECT branch, payment_method, CAST(substr(sales_date_in, 12, 2) AS INTEGER) AS hour,
      SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    ${where.sql ? 'AND' : 'WHERE'}
      substr(sales_date_in, 12, 2) GLOB '[0-2][0-9]'
    GROUP BY branch, payment_method, hour ORDER BY hour, branch
  `).all(...where.values);
  const hourlyByPayment = allocatePaymentSales(hourlyByPaymentRows, ['branch', 'hour']);
  const hourlySales = db.prepare(`
    SELECT CAST(substr(sales_date_in, 12, 2) AS INTEGER) AS hour,
      SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    ${where.sql ? 'AND' : 'WHERE'}
      substr(sales_date_in, 12, 2) GLOB '[0-2][0-9]'
    GROUP BY hour ORDER BY hour
  `).all(...where.values);
  const hourlyByStore = db.prepare(`
    SELECT branch, CAST(substr(sales_date_in, 12, 2) AS INTEGER) AS hour,
      SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    ${where.sql ? 'AND' : 'WHERE'}
      substr(sales_date_in, 12, 2) GLOB '[0-2][0-9]'
    GROUP BY branch, hour ORDER BY hour, sales DESC
  `).all(...where.values);
  const weeklySales = db.prepare(`
    SELECT date(substr(sales_date_in, 1, 10), '-' ||
      ((CAST(strftime('%w', substr(sales_date_in, 1, 10)) AS INTEGER) + 6) % 7) || ' days') AS week_start,
      SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    GROUP BY week_start ORDER BY week_start
  `).all(...where.values);
  const weeklyByStore = db.prepare(`
    SELECT branch, date(substr(sales_date_in, 1, 10), '-' ||
      ((CAST(strftime('%w', substr(sales_date_in, 1, 10)) AS INTEGER) + 6) % 7) || ' days') AS week_start,
      SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    GROUP BY branch, week_start ORDER BY week_start, sales DESC
  `).all(...where.values);
  const monthlySales = db.prepare(`
    SELECT substr(sales_date_in, 1, 7) AS month,
      SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    GROUP BY month ORDER BY month
  `).all(...where.values);
  const monthlyByStore = db.prepare(`
    SELECT branch, substr(sales_date_in, 1, 7) AS month,
      SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    GROUP BY branch, month ORDER BY month, sales DESC
  `).all(...where.values);
  const monthlyByPaymentRows = db.prepare(`
    SELECT branch, payment_method, substr(sales_date_in, 1, 7) AS month,
      SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql}
    GROUP BY branch, payment_method, month ORDER BY month, branch
  `).all(...where.values);
  const monthlyByPayment = allocatePaymentSales(monthlyByPaymentRows, ['branch', 'month']);

  return {
    hourlySales, hourlyByStore, hourlyByPayment,
    weeklySales, weeklyByStore, weeklyByPayment,
    monthlySales, monthlyByStore, monthlyByPayment,
  };
}

export function getSalesFiles() {
  return getSalesDb().prepare(`
    SELECT i.id, i.filename, i.file_size, i.uploaded_at, i.uploaded_by,
      COUNT(t.id) AS row_count,
      COALESCE(SUM(t.total_after_bill_discount), 0) AS total_revenue,
      GROUP_CONCAT(DISTINCT t.branch) AS stores
    FROM sales_imports i
    LEFT JOIN sales_transactions t ON t.import_id = i.id
    GROUP BY i.id ORDER BY i.uploaded_at DESC
  `).all();
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function getSalesFileCsv(fileId) {
  const db = getSalesDb();
  const file = db.prepare('SELECT filename FROM sales_imports WHERE id = ?').get(fileId);
  if (!file) return null;
  const rows = db.prepare(`
    SELECT ${CSV_COLUMNS.map(([key]) => key).join(', ')}
    FROM sales_transactions WHERE import_id = ?
    ORDER BY source_row
  `).all(fileId);
  return {
    filename: file.filename,
    content: [
      CSV_COLUMNS.map(([, label]) => csvCell(label)).join(','),
      ...rows.map((row) => CSV_COLUMNS.map(([key]) => csvCell(row[key])).join(',')),
    ].join('\r\n'),
  };
}

export function deleteSalesFile(fileId) {
  const result = getSalesDb().prepare('DELETE FROM sales_imports WHERE id = ?').run(fileId);
  return { success: result.changes > 0 };
}

export function clearSalesData() {
  const db = getSalesDb();
  db.exec('DELETE FROM sales_transactions; DELETE FROM sales_imports;');
  return { success: true };
}

export { CSV_COLUMNS };
