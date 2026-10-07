import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'birmas_audit.sqlite');

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    initTables(dbInstance);
  }
  return dbInstance;
}

function initTables(db) {
  // 1. Stores Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      wp_id INTEGER,
      name TEXT NOT NULL,
      location_code TEXT,
      esb_branch_code TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Products Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
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
  `);

  // Migrate additional columns for existing tables
  try { db.exec(`ALTER TABLE products ADD COLUMN category TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE products ADD COLUMN sub_category TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE products ADD COLUMN default_unit TEXT;`); } catch (_) {}

  // 3. Store Stocks Table (relation between store and product)
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_stocks (
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

  try { db.exec(`ALTER TABLE store_stocks ADD COLUMN available_qty REAL DEFAULT 0;`); } catch (_) {}
  try { db.exec(`ALTER TABLE store_stocks ADD COLUMN booked_qty REAL DEFAULT 0;`); } catch (_) {}
  try { db.exec(`ALTER TABLE store_stocks ADD COLUMN stock_value REAL DEFAULT 0;`); } catch (_) {}

  // 4. Audit Scans Table (live audit station scans)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_scans (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      barcode TEXT NOT NULL,
      brand TEXT,
      varian TEXT,
      scan_sequence INTEGER,
      auditor_name TEXT,
      timestamp TEXT NOT NULL
    );
  `);

  // 5. Audit History Table (completed audits)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_history (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      store_name TEXT,
      auditor_name TEXT,
      timestamp TEXT NOT NULL,
      completed_at TEXT,
      total_items INTEGER,
      variance_count INTEGER,
      accuracy REAL,
      records_json TEXT
    );
  `);

  // 6. Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password TEXT NOT NULL,
      name TEXT,
      role TEXT
    );
  `);

  // 7. App Configuration Table (for settings like wpUrl, selectedStoreId, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // 8. Sales Transactions Table (ESB report-sales-recapitulation-detail)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_transactions (
      id TEXT PRIMARY KEY,
      bill_no TEXT NOT NULL,
      date TEXT NOT NULL,
      store_id TEXT NOT NULL,
      store_name TEXT NOT NULL,
      item_name TEXT NOT NULL,
      variant TEXT,
      brand TEXT,
      category TEXT,
      barcode TEXT,
      qty INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      payment_method TEXT,
      visit_purpose TEXT,
      cashier TEXT,
      file_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_transactions(date);
    CREATE INDEX IF NOT EXISTS idx_sales_store ON sales_transactions(store_id);
    CREATE INDEX IF NOT EXISTS idx_sales_bill ON sales_transactions(bill_no);
    CREATE INDEX IF NOT EXISTS idx_sales_file ON sales_transactions(file_id);
  `);

  try { db.exec(`ALTER TABLE sales_transactions ADD COLUMN brand TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE sales_transactions ADD COLUMN visit_purpose TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE sales_transactions ADD COLUMN file_id TEXT;`); } catch (_) {}

  // 9. Uploaded Sales Files Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      file_size TEXT,
      uploaded_at TEXT NOT NULL,
      uploaded_by TEXT,
      row_count INTEGER DEFAULT 0,
      total_revenue REAL DEFAULT 0,
      stores TEXT,
      file_content TEXT
    );
  `);

  // Seed & sync required users:
  // - superadmin (superadmin666): can access both Stock Audit & Sales Report
  // - admin (admin666): can ONLY access Audit Sales Report
  // - chrisna / auditor (auditor666): can ONLY access Stock Audit
  const upsertUser = db.prepare(`
    INSERT INTO users (id, username, email, password, name, role)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      password = excluded.password,
      name = excluded.name,
      role = excluded.role;
  `);
  upsertUser.run('user-superadmin', 'superadmin', 'superadmin@birmas.id', 'superadmin666', 'Super Admin', 'superadmin');
  upsertUser.run('user-admin', 'admin', 'admin@birmas.id', 'admin666', 'Admin', 'admin');
  upsertUser.run('user-chrisna', 'chrisna', 'chrisna@birmas.id', 'auditor666', 'Chrisna', 'auditor');
  upsertUser.run('user-auditor', 'auditor', 'auditor@birmas.id', 'auditor666', 'Auditor Staff', 'auditor');

  // Official stores: Kelapa Gading, Kuningan, Kwitang, Lebak Bulus, Sudirman, Tebet, Nomadic Bandung, Nusa Dua Bali
  const upsertStore = db.prepare(`
    INSERT INTO stores (id, name, location_code, esb_branch_code)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      location_code = excluded.location_code,
      esb_branch_code = excluded.esb_branch_code;
  `);
  upsertStore.run('birmas-kelapa-gading', 'Birmas Kelapa Gading', 'BRM-GND', 'BRMKG');
  upsertStore.run('birmas-kuningan', 'Birmas Kuningan', 'BRM-KNG', 'BRMK');
  upsertStore.run('birmas-kwitang', 'Birmas Kwitang', 'BRM-KWT', 'BRMKW');
  upsertStore.run('birmas-lebak-bulus', 'Birmas Lebak Bulus', 'BRM-LBB', 'BRMLB');
  upsertStore.run('birmas-sudirman', 'Birmas Sudirman', 'BRM-SDR', 'OUTS');
  upsertStore.run('birmas-tebet', 'Birmas Tebet', 'BRM-TBT', 'BRMT');
  upsertStore.run('birmas-nomadic', 'Birmas Nomadic (Bandung)', 'BRM-NMD', 'LR00');
  upsertStore.run('birmas-nusadua', 'Birmas Nusa Dua (Bali)', 'BRM-BAL', 'BBND');

  // Purge any legacy mock barcodes from previous template versions
  db.exec(`
    DELETE FROM products WHERE id LIKE 'wp-10%';
    DELETE FROM products WHERE id LIKE 'esb-%';
    DELETE FROM store_stocks WHERE product_id LIKE 'esb-%';
    DELETE FROM products WHERE category IN ('PERLENGKAPAN OUTLET', 'ASSET', 'Asset', 'NON DEPRECIATED ASSET', 'LAIN LAIN') OR product_title LIKE '%ES BATU%' OR product_title LIKE '%GELAS CUP%';
    DELETE FROM store_stocks WHERE product_id IN ('erp-276', 'erp-298', 'erp-254', 'erp-128', 'erp-129');
    UPDATE products SET barcode = NULL WHERE barcode IN (
      '8997026800122', '8997026800030', '8997026800078', '8997026800016',
      '8993156000074', '8993156668267', '8993156668229', '8998888001011',
      '8801048951112', '5000213007624'
    );
  `);

  // Seed default WP config if not present
  const wpUrl = db.prepare('SELECT value FROM app_config WHERE key = ?;').get('wp_url');
  if (!wpUrl) {
    const setConfigStmt = db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);');
    setConfigStmt.run('wp_url', 'https://admin.birmas.id');
    setConfigStmt.run('custom_endpoint_path', '/wp-json/api/v1/product_stocks?per_page=100');
    setConfigStmt.run('auto_sync_interval_seconds', '30');
    setConfigStmt.run('is_connected', 'true');
    setConfigStmt.run('last_synced_at', new Date().toISOString());
  }

  cleanupLegacyWordPressData(db);
}

// Automatically purges old wp-* rows and preserves barcodes on ESB items
export function cleanupLegacyWordPressData(providedDb) {
  const db = providedDb || getDb();
  try {
    const wpProducts = db.prepare("SELECT * FROM products WHERE id LIKE 'wp-%' AND barcode IS NOT NULL;").all();
    const esbProducts = db.prepare("SELECT * FROM products WHERE id LIKE 'esb-%';").all();

    let migrated = 0;
    for (const wp of wpProducts) {
      const match = esbProducts.find(
        (esb) =>
          esb.brand?.toLowerCase() === wp.brand?.toLowerCase() &&
          (esb.varian?.toLowerCase().includes(wp.varian?.toLowerCase()) || wp.varian?.toLowerCase().includes(esb.varian?.toLowerCase()))
      );
      if (match && !match.barcode) {
        db.prepare('UPDATE products SET barcode = ? WHERE id = ?;').run(wp.barcode, match.id);
        migrated++;
      }
    }

    const delP = db.prepare("DELETE FROM products WHERE id LIKE 'wp-%' OR product_title = 'Birmas Product';").run();
    const delS = db.prepare("DELETE FROM store_stocks WHERE product_id LIKE 'wp-%';").run();
    console.log(`[DB Auto-Cleanup] Purged legacy WordPress duplicates. Migrated ${migrated} barcodes to ESB items.`);
    return { migratedBarcodes: migrated, deletedProducts: delP.changes, deletedStocks: delS.changes };
  } catch (err) {
    console.warn('[DB Cleanup Note]:', err.message);
    return { error: err.message };
  }
}

export function mapProductBarcode(productId, barcode) {
  const db = getDb();
  const clean = barcode.trim();
  db.prepare('UPDATE products SET barcode = NULL WHERE barcode = ?;').run(clean);
  db.prepare('UPDATE products SET barcode = ?, last_updated = ? WHERE id = ?;').run(clean, new Date().toISOString(), productId);
  return db.prepare('SELECT * FROM products WHERE id = ?;').get(productId);
}

// Stores Queries
export function getAllStores() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, wp_id as wpId, name, location_code as locationCode, esb_branch_code as esbBranchCode 
    FROM stores 
    ORDER BY name ASC;
  `).all();
  return rows;
}

export function saveStore(store) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO stores (id, wp_id, name, location_code, esb_branch_code)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      wp_id = coalesce(excluded.wp_id, stores.wp_id),
      name = excluded.name,
      location_code = coalesce(excluded.location_code, stores.location_code),
      esb_branch_code = coalesce(excluded.esb_branch_code, stores.esb_branch_code);
  `);
  stmt.run(store.id, store.wpId ?? null, store.name, store.locationCode ?? null, store.esbBranchCode ?? null);
}

export function deleteStore(id) {
  const db = getDb();
  db.prepare('DELETE FROM stores WHERE id = ?;').run(id);
  db.prepare('DELETE FROM store_stocks WHERE store_id = ?;').run(id);
  db.prepare('DELETE FROM audit_scans WHERE store_id = ?;').run(id);
}

// Products Queries
export function getAllProducts() {
  const db = getDb();
  const products = db.prepare(`
    SELECT 
      id, barcode, sku, brand, varian, 
      product_title as productTitle, 
      category,
      sub_category as subCategory,
      default_unit as defaultUnit,
      package_type as packageType, 
      volume, unit_volume as unitVolume, 
      price, wp_status as wpStatus, 
      last_updated as lastUpdated 
    FROM products ORDER BY brand ASC, varian ASC;
  `).all();

  // Attach stockByStore for each product
  const stocks = db.prepare('SELECT store_id, product_id, stock_qty FROM store_stocks;').all();
  const stockMap = {};
  for (const s of stocks) {
    if (!stockMap[s.product_id]) stockMap[s.product_id] = {};
    stockMap[s.product_id][s.store_id] = s.stock_qty;
  }

  return products.map(p => ({
    ...p,
    stockByStore: stockMap[p.id] || {},
    source: 'sqlite_backend',
  }));
}

export function saveProduct(product) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO products (
      id, barcode, sku, brand, varian, product_title, category, sub_category, default_unit, package_type, volume, unit_volume, price, wp_status, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      barcode = coalesce(excluded.barcode, products.barcode),
      sku = coalesce(excluded.sku, products.sku),
      brand = excluded.brand,
      varian = excluded.varian,
      product_title = excluded.product_title,
      category = coalesce(excluded.category, products.category),
      sub_category = coalesce(excluded.sub_category, products.sub_category),
      default_unit = coalesce(excluded.default_unit, products.default_unit),
      package_type = excluded.package_type,
      volume = excluded.volume,
      unit_volume = excluded.unit_volume,
      price = excluded.price,
      wp_status = excluded.wp_status,
      last_updated = excluded.last_updated;
  `);

  stmt.run(
    product.id,
    product.barcode || null,
    product.sku || null,
    product.brand,
    product.varian,
    product.productTitle || `${product.brand} ${product.varian}`,
    product.category || null,
    product.subCategory || null,
    product.defaultUnit || null,
    product.packageType || 'Kaleng',
    product.volume ?? 330,
    product.unitVolume || 'ml',
    product.price ?? 0,
    product.wpStatus || 'publish',
    product.lastUpdated || new Date().toISOString()
  );

  // If product has stockByStore map, save each
  if (product.stockByStore) {
    for (const [storeId, qty] of Object.entries(product.stockByStore)) {
      setProductStock(storeId, product.id, qty);
    }
  }
}

export function setProductStock(storeId, productId, qty) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO store_stocks (store_id, product_id, stock_qty, last_synced)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(store_id, product_id) DO UPDATE SET
      stock_qty = excluded.stock_qty,
      last_synced = excluded.last_synced;
  `);
  stmt.run(storeId, productId, Number(qty || 0), new Date().toISOString());
}

// Scans Queries
export function getScansByStore(storeId) {
  const db = getDb();
  return db.prepare(`
    SELECT 
      id, store_id as storeId, barcode, brand, varian, 
      scan_sequence as scanSequence, auditor_name as auditorName, timestamp 
    FROM audit_scans 
    WHERE store_id = ? 
    ORDER BY timestamp DESC;
  `).all(storeId);
}

export function getAllScanLogs() {
  const db = getDb();
  return db.prepare(`
    SELECT 
      id, store_id as storeId, barcode, brand, varian, 
      scan_sequence as scanSequence, auditor_name as auditorName, timestamp 
    FROM audit_scans 
    ORDER BY timestamp DESC;
  `).all();
}

export function saveScan(scan) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_scans (id, store_id, barcode, brand, varian, scan_sequence, auditor_name, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
  `);
  stmt.run(
    scan.id || `scan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    scan.storeId,
    scan.barcode,
    scan.brand || '',
    scan.varian || '',
    scan.scanSequence ?? 1,
    scan.auditorName || 'Auditor',
    scan.timestamp || new Date().toISOString()
  );
}

export function clearScansByStore(storeId) {
  const db = getDb();
  db.prepare('DELETE FROM audit_scans WHERE store_id = ?;').run(storeId);
}

// Audit History Queries
export function getAllAuditHistory() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT 
      id, store_id as storeId, store_name as storeName, auditor_name as auditorName,
      timestamp, completed_at as completedAt, total_items as totalItems,
      variance_count as varianceCount, accuracy, records_json as recordsJson
    FROM audit_history 
    ORDER BY timestamp DESC;
  `).all();

  return rows.map(r => ({
    id: r.id,
    storeId: r.storeId,
    storeName: r.storeName,
    auditorName: r.auditorName,
    timestamp: r.timestamp,
    completedAt: r.completedAt,
    totalItems: r.totalItems,
    varianceCount: r.varianceCount,
    accuracy: r.accuracy,
    records: r.recordsJson ? JSON.parse(r.recordsJson) : [],
  }));
}

export function saveAuditHistoryRecord(record) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_history (
      id, store_id, store_name, auditor_name, timestamp, completed_at, total_items, variance_count, accuracy, records_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      total_items = excluded.total_items,
      variance_count = excluded.variance_count,
      accuracy = excluded.accuracy,
      records_json = excluded.records_json;
  `);

  stmt.run(
    record.id || `audit-${Date.now()}`,
    record.storeId || '',
    record.storeName || '',
    record.auditorName || '',
    record.timestamp || new Date().toISOString(),
    record.completedAt || new Date().toISOString(),
    record.totalItems ?? 0,
    record.varianceCount ?? 0,
    record.accuracy ?? 100,
    JSON.stringify(record.records || [])
  );
}

// Users Queries
export function getAllUsers() {
  const db = getDb();
  return db.prepare('SELECT id, username, email, name, role FROM users;').all();
}

export function getUserByUsername(username) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE username = ?;').get(username);
}

// App Config Queries
export function getConfig(key, defaultValue = '') {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?;').get(key);
  return row ? row.value : defaultValue;
}

export function setConfig(key, value) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);').run(key, String(value));
}

export function getWpConfig() {
  return {
    wpUrl: getConfig('wp_url', 'https://admin.birmas.id'),
    apiType: 'pods',
    customEndpointPath: getConfig('custom_endpoint_path', '/wp-json/api/v1/product_stocks?per_page=100'),
    consumerKey: '',
    consumerSecret: '',
    isConnected: getConfig('is_connected', 'true') === 'true',
    lastSyncedAt: getConfig('last_synced_at', new Date().toISOString()),
    selectedStoreId: getConfig('selected_store_id', ''),
    autoSyncIntervalSeconds: parseInt(getConfig('auto_sync_interval_seconds', '30'), 10),
  };
}

// ==========================================
// Sales Transactions Queries (ESB Report Sales Recapitulation Detail)
// ==========================================

export function getSalesTransactions(filters = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM sales_transactions WHERE 1=1';
  const params = [];

  if (filters.storeId && filters.storeId !== 'all') {
    sql += ' AND store_id = ?';
    params.push(filters.storeId);
  }

  if (filters.startDate) {
    sql += ' AND date >= ?';
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    sql += ' AND date <= ?';
    params.push(filters.endDate + 'T23:59:59.999Z');
  }

  if (filters.category && filters.category !== 'all') {
    sql += ' AND category = ?';
    params.push(filters.category);
  }

  if (filters.brand && filters.brand !== 'all') {
    sql += ' AND brand = ?';
    params.push(filters.brand);
  }

  if (filters.visitPurpose && filters.visitPurpose !== 'all') {
    sql += ' AND visit_purpose = ?';
    params.push(filters.visitPurpose);
  }

  if (filters.paymentMethod && filters.paymentMethod !== 'all') {
    sql += ' AND payment_method = ?';
    params.push(filters.paymentMethod);
  }

  if (filters.search) {
    sql += ' AND (item_name LIKE ? OR variant LIKE ? OR brand LIKE ? OR bill_no LIKE ? OR cashier LIKE ? OR visit_purpose LIKE ?)';
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term);
  }

  sql += ' ORDER BY date DESC';

  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(parseInt(filters.limit, 10));
    if (filters.offset) {
      sql += ' OFFSET ?';
      params.push(parseInt(filters.offset, 10));
    }
  }

  return db.prepare(sql).all(...params);
}

export function getSalesSummary(filters = {}) {
  const db = getDb();
  let sqlBase = 'FROM sales_transactions WHERE 1=1';
  const params = [];

  if (filters.storeId && filters.storeId !== 'all') {
    sqlBase += ' AND store_id = ?';
    params.push(filters.storeId);
  }
  if (filters.startDate) {
    sqlBase += ' AND date >= ?';
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    sqlBase += ' AND date <= ?';
    params.push(filters.endDate + 'T23:59:59.999Z');
  }
  if (filters.visitPurpose && filters.visitPurpose !== 'all') {
    sqlBase += ' AND visit_purpose = ?';
    params.push(filters.visitPurpose);
  }
  if (filters.category && filters.category !== 'all') {
    sqlBase += ' AND category = ?';
    params.push(filters.category);
  }
  if (filters.paymentMethod && filters.paymentMethod !== 'all') {
    sqlBase += ' AND payment_method = ?';
    params.push(filters.paymentMethod);
  }

  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT bill_no) as totalBills,
      COUNT(*) as totalLineItems,
      COALESCE(SUM(qty), 0) as totalUnitsSold,
      COALESCE(SUM(subtotal), 0) as totalGrossSales,
      COALESCE(SUM(discount), 0) as totalDiscounts,
      COALESCE(SUM(tax), 0) as totalTax,
      COALESCE(SUM(total), 0) as totalNetSales
    ${sqlBase}
  `).get(...params);

  const byStore = db.prepare(`
    SELECT store_id, store_name, COUNT(DISTINCT bill_no) as bills, SUM(total) as revenue, SUM(qty) as units
    ${sqlBase}
    GROUP BY store_id, store_name
    ORDER BY revenue DESC
  `).all(...params);

  const byChannel = db.prepare(`
    SELECT COALESCE(NULLIF(visit_purpose, ''), 'Direct') as channel, COUNT(DISTINCT bill_no) as bills, SUM(total) as revenue, SUM(qty) as units
    ${sqlBase}
    GROUP BY visit_purpose
    ORDER BY revenue DESC
  `).all(...params);

  const byPayment = db.prepare(`
    SELECT payment_method, COUNT(DISTINCT bill_no) as count, SUM(total) as totalAmount
    ${sqlBase}
    GROUP BY payment_method
    ORDER BY totalAmount DESC
  `).all(...params);

  const byBrand = db.prepare(`
    SELECT COALESCE(NULLIF(brand, ''), 'Other') as brand, category, SUM(qty) as units, SUM(total) as revenue
    ${sqlBase}
    GROUP BY brand
    ORDER BY units DESC
    LIMIT 10
  `).all(...params);

  const topItems = db.prepare(`
    SELECT item_name, variant, brand, category, SUM(qty) as totalQty, SUM(total) as totalRevenue
    ${sqlBase}
    GROUP BY item_name, variant
    ORDER BY totalQty DESC
    LIMIT 10
  `).all(...params);

  return {
    ...totals,
    byStore,
    byChannel,
    byPayment,
    byBrand,
    topItems,
  };
}

export function insertSalesTransaction(tx) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO sales_transactions (
      id, bill_no, date, store_id, store_name, item_name, variant, category, barcode,
      qty, unit_price, discount, tax, subtotal, total, payment_method, cashier
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    tx.id || `stx-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    tx.bill_no,
    tx.date || new Date().toISOString(),
    tx.store_id,
    tx.store_name,
    tx.item_name,
    tx.variant || '',
    tx.category || 'Beverage',
    tx.barcode || '',
    tx.qty || 1,
    tx.unit_price || 0,
    tx.discount || 0,
    tx.tax || 0,
    tx.subtotal || ((tx.qty || 1) * (tx.unit_price || 0)),
    tx.total || (((tx.qty || 1) * (tx.unit_price || 0)) - (tx.discount || 0) + (tx.tax || 0)),
    tx.payment_method || 'QRIS BCA',
    tx.cashier || 'Kasir'
  );
}

export function saveBulkSalesTransactions(txList, fileId = null) {
  if (!txList || !Array.isArray(txList) || txList.length === 0) return;
  const db = getDb();
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sales_transactions (
      id, bill_no, date, store_id, store_name, item_name, variant, brand, category, barcode,
      qty, unit_price, discount, tax, subtotal, total, payment_method, visit_purpose, cashier, file_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    db.exec('BEGIN TRANSACTION;');
    for (const tx of txList) {
      stmt.run(
        String(tx.id || `stx-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`),
        String(tx.bill_no || `ESB-${Date.now()}`),
        String(tx.date || new Date().toISOString()),
        String(tx.store_id || 'birmas-kuningan'),
        String(tx.store_name || 'Birmas Kuningan'),
        String(tx.item_name || 'Retail Item'),
        String(tx.variant || ''),
        String(tx.brand || ''),
        String(tx.category || 'Beverage'),
        String(tx.barcode || ''),
        Number(tx.qty) || 1,
        Number(tx.unit_price) || 0,
        Number(tx.discount) || 0,
        Number(tx.tax) || 0,
        Number(tx.subtotal) || ((Number(tx.qty) || 1) * (Number(tx.unit_price) || 0)),
        Number(tx.total) || (((Number(tx.qty) || 1) * (Number(tx.unit_price) || 0)) - (Number(tx.discount) || 0) + (Number(tx.tax) || 0)),
        String(tx.payment_method || 'QRIS BCA'),
        String(tx.visit_purpose || 'DINE IN'),
        String(tx.cashier || 'Kasir'),
        fileId ? String(fileId) : (tx.file_id ? String(tx.file_id) : null)
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {}
    console.error('[DB Sales Bulk Error]:', err.message);
  }
}

// Uploaded Sales CSV Files Record Management
export function getSalesFilesList() {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT id, filename, file_size, uploaded_at, uploaded_by, row_count, total_revenue, stores
      FROM sales_files
      ORDER BY uploaded_at DESC
    `).all();
  } catch (err) {
    console.error('[DB] getSalesFilesList error:', err.message);
    return [];
  }
}

export function getSalesFileById(id) {
  const db = getDb();
  try {
    return db.prepare(`SELECT * FROM sales_files WHERE id = ?`).get(id);
  } catch (err) {
    console.error('[DB] getSalesFileById error:', err.message);
    return null;
  }
}

export function saveSalesFileRecord(fileInfo, rows = []) {
  const db = getDb();
  const fileId = fileInfo.id || `sfile-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  
  const insertFileStmt = db.prepare(`
    INSERT INTO sales_files (
      id, filename, file_size, uploaded_at, uploaded_by, row_count, total_revenue, stores, file_content
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      row_count = row_count + excluded.row_count,
      total_revenue = total_revenue + excluded.total_revenue;
  `);

  try {
    insertFileStmt.run(
      fileId,
      fileInfo.filename || 'sales_report.csv',
      fileInfo.file_size || `${(rows.length * 0.2).toFixed(1)} KB`,
      fileInfo.uploaded_at || new Date().toISOString(),
      fileInfo.uploaded_by || 'Admin',
      rows.length,
      fileInfo.total_revenue || rows.reduce((acc, r) => acc + (Number(r.total) || 0), 0),
      fileInfo.stores || Array.from(new Set(rows.map(r => r.store_name).filter(Boolean))).join(', ') || 'All Stores',
      fileInfo.file_content || ''
    );

    if (rows && rows.length > 0) {
      saveBulkSalesTransactions(rows, fileId);
    }

    return { success: true, fileId, message: 'Sales file and records saved successfully.' };
  } catch (err) {
    console.error('[DB] saveSalesFileRecord error:', err.message);
    return { success: false, error: err.message };
  }
}

export function deleteSalesFileRecord(fileId) {
  const db = getDb();
  try {
    db.exec('BEGIN TRANSACTION;');
    db.prepare('DELETE FROM sales_transactions WHERE file_id = ?').run(fileId);
    db.prepare('DELETE FROM sales_files WHERE id = ?').run(fileId);
    db.exec('COMMIT;');
    console.log(`[DB] Deleted sales file ${fileId} and associated transactions.`);
    return { success: true, message: 'File and associated transactions deleted successfully.' };
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    console.error('[DB] deleteSalesFileRecord error:', err.message);
    return { success: false, error: err.message };
  }
}

export function clearAllSalesTransactions() {
  const db = getDb();
  try {
    db.exec('BEGIN TRANSACTION;');
    db.exec('DELETE FROM sales_transactions;');
    db.exec('DELETE FROM sales_files;');
    db.exec('COMMIT;');
    console.log('[DB] sales_transactions and sales_files cleared.');
    return { success: true, message: 'Sales transactions and files cleared successfully.' };
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch (_) {}
    return { success: false, error: err.message };
  }
}
