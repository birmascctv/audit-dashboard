import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLocalizedNumber } from './src/utils/salesCsv.js';

const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
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
  ['sales_number', 'Sales Number'],
];

let database;

// Categories excluded from qty-based product rankings (tolerates 'LAIN-LAIN' / 'LAIN LAIN').
const RANKING_CATEGORY_SQL = "REPLACE(UPPER(TRIM(menu_category)), '-', ' ') NOT IN ('LAIN LAIN', 'MIXER', 'SNACK')";
const BUSINESS_DATE_SQL = 'date(sales_date_in)';
function jakartaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}-${parts.find((part) => part.type === 'day').value}`;
}

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
  if (!db.prepare('PRAGMA table_info(sales_transactions)').all().some((column) => column.name === 'sales_number')) {
    db.exec("ALTER TABLE sales_transactions ADD COLUMN sales_number TEXT NOT NULL DEFAULT ''");
  }
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
    sales_number: String(get('sales_number', 'salesNumber', 'Sales Number')).trim(),
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
      total_after_bill_discount, sales_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      total_after_bill_discount = excluded.total_after_bill_discount,
      sales_number = excluded.sales_number
  `);
  // Match only other imports; repeated rows within this file can represent distinct sales.
  const findExisting = db.prepare(`
    SELECT id, price, subtotal, discount, total_after_bill_discount FROM sales_transactions
    WHERE sales_date_in = ? AND menu = ? AND branch = ? AND payment_method = ? AND qty = ?
      AND import_id <> ?
      AND (sales_number = '' OR ? = '' OR sales_number = ?)
    ORDER BY (total_after_bill_discount = ?) DESC
    LIMIT 1
  `);
  const updatePrice = db.prepare('UPDATE sales_transactions SET price = ?, subtotal = ?, discount = ?, total_after_bill_discount = ? WHERE id = ?');

  let duplicateCount = 0;
  let updatedCount = 0;
  db.exec('BEGIN');
  try {
    insertImport.run(fileId, filename || 'sales.csv', fileSize, uploadedAt, uploadedBy);
    rows.forEach((row, index) => {
      const clean = normalizeRow(row);
      const sourceRow = sourceRowOffset + index;
      const existing = findExisting.get(clean.sales_date_in, clean.menu, clean.branch, clean.payment_method, clean.qty, fileId, clean.sales_number, clean.sales_number, clean.total_after_bill_discount);
      if (existing) {
        const changed = Number(existing.price) !== Number(clean.price) || Number(existing.subtotal) !== Number(clean.subtotal) ||
          Number(existing.discount) !== Number(clean.discount) || Number(existing.total_after_bill_discount) !== Number(clean.total_after_bill_discount);
        if (changed) {
          updatePrice.run(clean.price, clean.subtotal, clean.discount, clean.total_after_bill_discount, existing.id);
          updatedCount++;
        } else {
          duplicateCount++;
        }
        return;
      }
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
  return { ...summary, duplicate_count: duplicateCount, updated_count: updatedCount };
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
      menu_category, menu_category_detail, menu, qty, price, subtotal, discount, total_after_bill_discount, sales_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
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
    clauses.push(`${BUSINESS_DATE_SQL} >= ?`);
    values.push(filters.startDate);
  }
  if (filters.endDate) {
    const nextDate = new Date(`${filters.endDate}T00:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    clauses.push(`${BUSINESS_DATE_SQL} < ?`);
    values.push(nextDate.toISOString().slice(0, 10));
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

export function getEsbAnalytics(filters = {}, db = getSalesDb()) {
  const { sql, values } = makeWhere({ storeId: filters.storeId, storeIds: filters.storeIds });
  const rows = db.prepare(`SELECT branch, sales_number, sales_date_in, visit_purpose, payment_method,
    menu, menu_category, menu_category_detail, qty, total_after_bill_discount
    FROM sales_transactions ${sql}`).all(...values);
  const orders = new Map();
  const inRange = (date) => (!filters.startDate || date >= filters.startDate) && (!filters.endDate || date <= filters.endDate);
  const today = filters.today || jakartaToday();
  const weekStart = new Date(`${today}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const weekDate = weekStart.toISOString().slice(0, 10);
  const monthDate = `${today.slice(0, 8)}01`;
  let rowCount = 0;
  let missingRows = 0;
  let missingRevenue = 0;
  for (const row of rows) {
    const date = row.sales_date_in.slice(0, 10);
    if (!row.sales_number.trim()) {
      if (inRange(date)) {
        rowCount++;
        missingRows++;
        missingRevenue += row.total_after_bill_discount;
      }
      continue;
    }
    const key = JSON.stringify([row.branch, row.sales_number]);
    if (!orders.has(key)) orders.set(key, { branch: row.branch, date, rows: [], methods: new Set(), purposes: new Set(), sales: 0 });
    const order = orders.get(key);
    if (date < order.date) order.date = date;
    order.rows.push(row);
    order.methods.add(row.payment_method.trim());
    order.purposes.add(row.visit_purpose.trim().toUpperCase());
    order.sales += row.total_after_bill_discount;
  }
  const payments = new Map();
  const stores = new Map();
  const purposes = new Map();
  const products = new Map();
  const weekProducts = new Map();
  const monthProducts = new Map();
  const addAmount = (map, name, amount) => map.set(name, (map.get(name) || 0) + amount);
  const addProduct = (map, row, sales) => {
    const category = row.menu_category.toUpperCase();
    const detail = row.menu_category_detail.toUpperCase();
    const name = row.menu.trim();
    if (!name || name.toUpperCase().endsWith('(PACKAGE)') || category.includes('PROMO') || detail.includes('PROMO')) return;
    const current = map.get(name) || { name, qty: 0, sales: 0, qtyEligible: 0, qtyEligibleSales: 0 };
    current.qty += row.qty;
    current.sales += sales;
    if (!['LAIN LAIN', 'MIXER', 'SNACK'].includes(category.trim().replace(/-/g, ' '))) {
      current.qtyEligible += row.qty;
      current.qtyEligibleSales += sales;
    }
    map.set(name, current);
  };
  const productList = (map, metric, limit) => [...map.values()]
    .map((item) => metric === 'qty' ? { ...item, qty: item.qtyEligible, sales: item.qtyEligibleSales } : item)
    .filter((item) => metric !== 'qty' || item.qty !== 0)
    .sort((a, b) => b[metric] - a[metric] || b.sales - a.sales || a.name.localeCompare(b.name))
    .slice(0, limit);
  let baseRevenue = 0;
  let roundingAdjustment = 0;
  let shopeeAdjustment = 0;
  let excludedOrders = 0;
  let excludedRevenue = 0;
  let transactionCount = 0;
  let totalUnitsSold = 0;
  for (const order of orders.values()) {
    const selected = inRange(order.date);
    const inWeek = order.date >= weekDate && order.date <= today;
    const inMonth = order.date >= monthDate && order.date <= today;
    if (!selected && !inWeek && !inMonth) continue;
    if (selected) rowCount += order.rows.length;
    const method = [...order.methods][0];
    const matches = [...method.matchAll(/([^,]+?)\s*\(([^()]*)\)/g)];
    const malformed = (method.includes(',') && !matches.length) ||
      (method.includes('(') && (!matches.length ||
        method.replace(/([^,]+?)\s*\(([^()]*)\)/g, '').replace(/[,\s]/g, '') !== '' ||
        matches.some((match) => parseLocalizedNumber(match[2]) === null)));
    if (order.methods.size !== 1 || order.purposes.size !== 1 || malformed) {
      if (selected) {
        excludedOrders++;
        excludedRevenue += order.sales;
      }
      continue;
    }
    const portions = allocatePaymentSales([{ payment_method: method, sales: order.sales }]);
    let orderRounding = 0;
    for (const portion of portions) {
      const eligible = ['CASH', 'QRIS BCA'].includes(portion.payment_method.toUpperCase());
      const rounded = eligible ? Math.ceil(portion.sales / 1000 - 1e-10) * 1000 : portion.sales;
      orderRounding += rounded - portion.sales;
      portion.adjusted = rounded;
    }
    const fee = order.purposes.has('SHOPEEFOOD') ? 3000 : 0;
    const adjustment = orderRounding + fee;
    if (selected) {
      transactionCount++;
      baseRevenue += order.sales;
      roundingAdjustment += orderRounding;
      shopeeAdjustment += fee;
      addAmount(stores, order.branch, order.sales + adjustment);
      addAmount(purposes, [...order.purposes][0] || 'Unspecified', order.sales + adjustment);
      const paymentWeight = portions.reduce((sum, portion) => sum + Math.abs(portion.sales), 0);
      for (const portion of portions) {
        const share = paymentWeight ? Math.abs(portion.sales) / paymentWeight : 1 / portions.length;
        addAmount(payments, portion.payment_method, portion.adjusted + fee * share);
      }
    }
    const rowWeight = order.rows.reduce((sum, row) => sum + Math.abs(row.total_after_bill_discount), 0);
    for (const row of order.rows) {
      const share = rowWeight ? Math.abs(row.total_after_bill_discount) / rowWeight : 1 / order.rows.length;
      const sales = row.total_after_bill_discount + adjustment * share;
      if (selected) {
        totalUnitsSold += row.qty;
        addProduct(products, row, sales);
      }
      if (inWeek) addProduct(weekProducts, row, sales);
      if (inMonth) addProduct(monthProducts, row, sales);
    }
  }
  return {
    rowCount, transactionCount,
    missingRows, missingRevenue, excludedOrders, excludedRevenue,
    baseRevenue, roundingAdjustment, shopeeAdjustment, totalUnitsSold,
    adjustedRevenue: baseRevenue + roundingAdjustment + shopeeAdjustment,
    payments: [...payments].map(([name, sales]) => ({ name, sales })).sort((a, b) => b.sales - a.sales),
    stores: [...stores].map(([name, sales]) => ({ name, sales })).sort((a, b) => b.sales - a.sales),
    purposes: [...purposes].map(([name, sales]) => ({ name, sales })).sort((a, b) => b.sales - a.sales),
    topProductsQty: productList(products, 'qty', 10),
    topProductsSales: productList(products, 'sales', 10),
    topProductsLastWeek: productList(weekProducts, 'qty', 5),
    topProductsThisMonth: productList(monthProducts, 'qty', 5),
  };
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
    SELECT 'All stores' AS branch, menu, SUM(qty) AS qty, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${productWhere.sql} AND menu <> ''
      AND UPPER(TRIM(menu)) NOT LIKE '%(PACKAGE)'
    GROUP BY menu ORDER BY sales DESC LIMIT 10
  `, productWhere.values);
  const topProductsAllStoresQty = aggregateRows(db, `
    SELECT 'All stores' AS branch, menu, SUM(qty) AS qty, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${productWhere.sql} AND menu <> ''
      AND ${RANKING_CATEGORY_SQL}
      AND UPPER(TRIM(menu)) NOT LIKE '%(PACKAGE)'
    GROUP BY menu ORDER BY qty DESC, menu LIMIT 10
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
      MIN(${BUSINESS_DATE_SQL}) AS start_date,
      MAX(${BUSINESS_DATE_SQL}) AS end_date
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
    SELECT branch, menu, qty, sales FROM (
      SELECT branch, menu, SUM(qty) AS qty, SUM(total_after_bill_discount) AS sales,
        ROW_NUMBER() OVER (PARTITION BY branch ORDER BY SUM(total_after_bill_discount) DESC) AS rank
      FROM sales_transactions ${productWhere.sql} AND menu <> ''
        AND UPPER(TRIM(menu)) NOT LIKE '%(PACKAGE)'
      GROUP BY branch, menu
    ) WHERE rank <= 10 ORDER BY branch, rank
  `, productWhere.values);

  const topProductsByStoreQty = aggregateRows(db, `
    SELECT branch, menu, qty, sales FROM (
      SELECT branch, menu, SUM(qty) AS qty, SUM(total_after_bill_discount) AS sales,
        ROW_NUMBER() OVER (PARTITION BY branch ORDER BY SUM(qty) DESC, menu) AS rank
      FROM sales_transactions ${productWhere.sql} AND menu <> ''
        AND ${RANKING_CATEGORY_SQL}
        AND UPPER(TRIM(menu)) NOT LIKE '%(PACKAGE)'
      GROUP BY branch, menu
    ) WHERE rank <= 10 ORDER BY branch, rank
  `, productWhere.values);

  const storeOnlyWhere = makeWhere({ storeId: filters.storeId, storeIds: filters.storeIds });
  const latestDataDate = db.prepare(`SELECT MAX(${BUSINESS_DATE_SQL}) AS d FROM sales_transactions ${storeOnlyWhere.sql}`).get(...storeOnlyWhere.values)?.d;
  const today = jakartaToday();
  const latestBusinessDate = latestDataDate && latestDataDate < today ? latestDataDate : today;
  const lastWeekStart = new Date(`${today}T00:00:00Z`);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 6);
  const lastWeekDate = lastWeekStart.toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const getTopProducts = (startDate, endDate) => {
    const rangeWhere = makeWhere({
      storeId: filters.storeId, storeIds: filters.storeIds, startDate, endDate,
    });
    return aggregateRows(db, `
      SELECT branch, menu, SUM(qty) AS qty, SUM(total_after_bill_discount) AS sales
      FROM sales_transactions ${rangeWhere.sql}
        ${rangeWhere.sql ? 'AND' : 'WHERE'} UPPER(COALESCE(menu_category, '')) NOT LIKE '%PROMO%'
        AND UPPER(COALESCE(menu_category_detail, '')) NOT LIKE '%PROMO%' AND COALESCE(menu, '') <> ''
        AND UPPER(TRIM(menu)) NOT LIKE '%(PACKAGE)'
        AND REPLACE(UPPER(TRIM(COALESCE(menu_category, ''))), '-', ' ') NOT IN ('LAIN LAIN', 'MIXER', 'SNACK')
      GROUP BY branch, menu
      ORDER BY branch, SUM(qty) DESC, SUM(total_after_bill_discount) DESC
    `, rangeWhere.values);
  };
  const topProductsLastWeek = getTopProducts(lastWeekDate, today);
  const topProductsThisMonth = getTopProducts(monthStart, today);

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
    topProductsAllStoresQty,
    topProductsByStoreQty,
    topProductsLastWeek,
    topProductsThisMonth,
    latestSaleAt: db.prepare(`SELECT MAX(sales_date_in) AS d FROM sales_transactions`).get()?.d || null,
    latestBusinessDate,
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
  const dayExpr = BUSINESS_DATE_SQL;
  const hourExpr = 'CAST(substr(sales_date_in, 12, 2) AS INTEGER)';
  const weekExpr = `date(${dayExpr}, '-' || ((CAST(strftime('%w', ${dayExpr}) AS INTEGER) + 6) % 7) || ' days')`;
  const weeklySales = db.prepare(`
    SELECT week_start, substr(week_start, 1, 7) AS month, SUM(sales) AS sales FROM (
      SELECT ${weekExpr} AS week_start, SUM(total_after_bill_discount) AS sales
      FROM sales_transactions ${where.sql} GROUP BY week_start
    ) GROUP BY week_start ORDER BY week_start
  `).all(...where.values);
  const weeklyByStore = db.prepare(`
    SELECT branch, ${weekExpr} AS week_start, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql} GROUP BY branch, week_start ORDER BY week_start, sales DESC
  `).all(...where.values);
  const monthlySales = db.prepare(`
    SELECT substr(${dayExpr}, 1, 7) AS month, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql} GROUP BY month ORDER BY month
  `).all(...where.values);
  const monthlyByStore = db.prepare(`
    SELECT branch, substr(${dayExpr}, 1, 7) AS month, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql} GROUP BY branch, month ORDER BY month, sales DESC
  `).all(...where.values);
  const monthlyByPaymentRows = db.prepare(`
    SELECT branch, payment_method, substr(${dayExpr}, 1, 7) AS month, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql} GROUP BY branch, payment_method, month ORDER BY month, branch
  `).all(...where.values);
  const monthlyByPayment = allocatePaymentSales(monthlyByPaymentRows, ['branch', 'month']);
  const hourlySales = db.prepare(`
    SELECT ${hourExpr} AS hour, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql} ${where.sql ? 'AND' : 'WHERE'} substr(sales_date_in, 12, 2) GLOB '[0-2][0-9]'
    GROUP BY hour ORDER BY CASE WHEN hour >= 11 THEN hour - 11 ELSE hour + 13 END
  `).all(...where.values);
  const hourlyByStore = db.prepare(`
    SELECT branch, ${hourExpr} AS hour, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql} ${where.sql ? 'AND' : 'WHERE'} substr(sales_date_in, 12, 2) GLOB '[0-2][0-9]'
    GROUP BY branch, hour ORDER BY CASE WHEN hour >= 11 THEN hour - 11 ELSE hour + 13 END, sales DESC
  `).all(...where.values);
  const hourlyByPaymentRows = db.prepare(`
    SELECT branch, payment_method, ${hourExpr} AS hour, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql} ${where.sql ? 'AND' : 'WHERE'} substr(sales_date_in, 12, 2) GLOB '[0-2][0-9]'
    GROUP BY branch, payment_method, hour ORDER BY CASE WHEN hour >= 11 THEN hour - 11 ELSE hour + 13 END, branch
  `).all(...where.values);
  const hourlyByPayment = allocatePaymentSales(hourlyByPaymentRows, ['branch', 'hour']);
  const weekdaySales = db.prepare(`
    SELECT CAST(strftime('%w', ${dayExpr}) AS INTEGER) AS weekday, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions ${where.sql} GROUP BY weekday ORDER BY weekday
  `).all(...where.values);
  const weekdayTopProducts = db.prepare(`
    SELECT weekday, menu, qty, sales FROM (
      SELECT CAST(strftime('%w', ${dayExpr}) AS INTEGER) AS weekday, menu,
        SUM(qty) AS qty, SUM(total_after_bill_discount) AS sales,
        ROW_NUMBER() OVER (PARTITION BY CAST(strftime('%w', ${dayExpr}) AS INTEGER) ORDER BY SUM(qty) DESC, SUM(total_after_bill_discount) DESC) AS rank
      FROM sales_transactions ${where.sql} ${where.sql ? 'AND' : 'WHERE'} menu <> ''
        AND UPPER(TRIM(menu)) NOT LIKE '%(PACKAGE)'
        AND ${RANKING_CATEGORY_SQL}
      GROUP BY weekday, menu
    ) WHERE rank <= 10 ORDER BY weekday, rank
  `).all(...where.values);
  return { hourlySales, hourlyByStore, hourlyByPayment, weeklySales, weeklyByStore, monthlySales, monthlyByStore, monthlyByPayment, weekdaySales, weekdayTopProducts };
}

export function getSalesProductsByBusinessDate(date, branch) {
  const db = getSalesDb();
  return db.prepare(`
    SELECT menu, SUM(qty) AS qty, SUM(total_after_bill_discount) AS sales
    FROM sales_transactions
    WHERE ${BUSINESS_DATE_SQL} = ? AND branch = ? AND menu <> ''
    GROUP BY menu ORDER BY menu
  `).all(date, branch);
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

export function getSalesFileCsv(fileId, db = getSalesDb()) {
  const file = db.prepare('SELECT filename FROM sales_imports WHERE id = ?').get(fileId);
  if (!file) return null;
  const rows = db.prepare(`
    SELECT ${CSV_COLUMNS.map(([key]) => key).join(', ')}
    FROM sales_transactions WHERE import_id = ?
    ORDER BY source_row
  `).all(fileId);
  return {
    filename: file.filename,
    content: '\uFEFF' + [
      'sep=,',
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
