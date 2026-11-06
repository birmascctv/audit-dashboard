import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(String(pw), salt, 64).toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  const [tag, salt, hash] = String(stored || '').split('$');
  if (tag !== 'scrypt' || !salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(String(pw), salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function logLoginAttempt(username, ip, success, reason) {
  try {
    getDb().prepare('INSERT INTO login_attempts (username, ip, success, reason, created_at) VALUES (?, ?, ?, ?, ?);').run(String(username).slice(0, 60), String(ip).slice(0, 60), success ? 1 : 0, reason, new Date().toISOString());
  } catch {}
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'birmas_audit.sqlite');

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    // NOTE: a previous change here set journal_mode=WAL, which requires the
    // "data" directory (not just the .sqlite file) to be writable so SQLite can
    // create -wal/-shm files; WAL mode is also persisted in the file itself, so
    // once set it keeps requiring that on every future connection/restart. On a
    // host where the directory has restrictive permissions, that silently turned
    // every future write into "attempt to write a readonly database" - explicitly
    // force the classic rollback-journal mode back (a no-op if already DELETE) so
    // writes only ever need the single .sqlite file to be writable, exactly as
    // before. busy_timeout is a harmless per-connection setting (not persisted).
    try {
      dbInstance.exec('PRAGMA journal_mode = DELETE;');
      dbInstance.exec('PRAGMA busy_timeout = 5000;');
    } catch (err) {
      console.error('[DB] Failed to apply PRAGMA settings:', err.message);
    }
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
    CREATE TABLE IF NOT EXISTS stock_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      old_qty REAL,
      new_qty REAL,
      changed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stock_changes_store ON stock_changes (store_id, product_id, changed_at);
  `);
  try { db.exec(`ALTER TABLE store_stocks ADD COLUMN changed_at TEXT;`); } catch (_) {}

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
  for (const col of ['started_at TEXT', 'total_expected INTEGER', 'total_scanned INTEGER', 'matched_count INTEGER', 'missing_count INTEGER', 'surplus_count INTEGER', 'notes TEXT']) {
    try { db.exec(`ALTER TABLE audit_history ADD COLUMN ${col};`); } catch (_) {}
  }

  // 6. Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password TEXT NOT NULL,
      name TEXT,
      role TEXT,
      store_id TEXT
    );
  `);
  try { db.exec('ALTER TABLE users ADD COLUMN store_id TEXT;'); } catch (_) {}

  // 6b. Auth sessions (only the sha256 of the bearer token is stored)
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  // 7. App Configuration Table (for settings like wpUrl, selectedStoreId, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Sales data lives in sales_clean.sqlite; drop the legacy copies
  db.exec('DROP TABLE IF EXISTS sales_transactions; DROP TABLE IF EXISTS sales_files;');

  // 9. Uploaded Sales Files Table
  db.exec(`
    DROP TABLE IF EXISTS stock_audit_files;

    -- 11. Audit Sessions Lock Table
    CREATE TABLE IF NOT EXISTS audit_sessions (
      store_id TEXT PRIMARY KEY,
      is_locked INTEGER DEFAULT 0,
      locked_at TEXT,
      locked_by TEXT,
      unlocked_at TEXT,
      unlocked_by TEXT
    );

    -- 12. Audit Scan Events Table
    CREATE TABLE IF NOT EXISTS audit_scan_events (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      barcode TEXT NOT NULL,
      auditor TEXT,
      action TEXT,
      created_at TEXT
    );

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_store_stocks_lookup ON store_stocks (store_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_audit_scans_lookup ON audit_scans (store_id, barcode);
  `);
  db.exec(`CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, ip TEXT, success INTEGER, reason TEXT, created_at TEXT);`);

  // Seed & sync required users:
  // - superadmin (superadmin666): can access both Stock Audit & Sales Report
  // - mia (admin666): can ONLY access Sales Report
  // - bertha (owner): everything and the only one who can unlock audits; superadmin: Store Audit, Audit Records, Sales Report
  // - chrisna / auditor (auditor666): can ONLY access Stock Audit
  const upsertUser = db.prepare(`
    INSERT INTO users (id, username, email, password, name, role)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      name = excluded.name,
      role = excluded.role;
  `);
  upsertUser.run('user-superadmin', 'superadmin', 'superadmin@birmas.id', hashPassword('superadmin666'), 'Super Admin', 'superadmin');
  db.prepare("UPDATE users SET username = 'mia', email = 'mia@birmas.id', name = 'Mia' WHERE id = 'user-admin' AND username = 'admin';").run();
  upsertUser.run('user-bertha', 'bertha', 'bertha@birmas.id', hashPassword('evania'), 'Bertha', 'owner');
  upsertUser.run('user-admin', 'mia', 'mia@birmas.id', hashPassword('admin666'), 'Mia', 'admin');
  upsertUser.run('user-chrisna', 'chrisna', 'chrisna@birmas.id', hashPassword('auditor666'), 'Chrisna', 'auditor');
  upsertUser.run('user-auditor', 'auditor', 'auditor@birmas.id', hashPassword('auditor666'), 'Auditor Staff', 'auditor');
  if (process.env.NODE_ENV === 'development') {
    upsertUser.run('user-crew1', 'crew1', 'crew1@birmas.id', hashPassword('BirmasKuningan'), 'Birmas Kuningan Crew', 'crew');
    upsertUser.run('user-crew2', 'crew2', 'crew2@birmas.id', hashPassword('BirmasKwitang'), 'Birmas Kwitang Crew', 'crew');
    upsertUser.run('user-crew3', 'crew3', 'crew3@birmas.id', hashPassword('BirmasSudirman'), 'Birmas Sudirman Crew', 'crew');
    db.prepare('UPDATE users SET store_id = ? WHERE id = ?').run('birmas-kuningan', 'user-crew1');
    db.prepare('UPDATE users SET store_id = ? WHERE id = ?').run('birmas-kwitang', 'user-crew2');
    db.prepare('UPDATE users SET store_id = ? WHERE id = ?').run('birmas-sudirman', 'user-crew3');
  }
  for (const u of db.prepare('SELECT id, password FROM users;').all()) {
    if (!String(u.password).startsWith('scrypt$')) db.prepare('UPDATE users SET password = ? WHERE id = ?;').run(hashPassword(u.password), u.id);
  }

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
    DELETE FROM products WHERE UPPER(category) IN ('PERLENGKAPAN OUTLET', 'LAIN-LAIN', 'LAIN LAIN', 'ELECTRONIC') AND UPPER(TRIM(product_title)) <> 'GELAS CUP';
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

// Saves the ESB quantity and, when it differs from what we had, records WHEN the ESB figure changed
export function setProductStock(storeId, productId, qty) {
  const db = getDb();
  const now = new Date().toISOString();
  const next = Number(qty || 0);
  const prev = db.prepare('SELECT stock_qty FROM store_stocks WHERE store_id = ? AND product_id = ?').get(storeId, productId);
  const changed = prev && Number(prev.stock_qty) !== next;
  db.prepare(`
    INSERT INTO store_stocks (store_id, product_id, stock_qty, last_synced)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(store_id, product_id) DO UPDATE SET
      stock_qty = excluded.stock_qty,
      last_synced = excluded.last_synced;
  `).run(storeId, productId, next, now);
  if (changed) {
    db.prepare('UPDATE store_stocks SET changed_at = ? WHERE store_id = ? AND product_id = ?').run(now, storeId, productId);
    db.prepare('INSERT INTO stock_changes (store_id, product_id, old_qty, new_qty, changed_at) VALUES (?, ?, ?, ?, ?)').run(storeId, productId, Number(prev.stock_qty), next, now);
  }
}

export function getStockFreshness(storeId) {
  const db = getDb();
  const row = db.prepare('SELECT MAX(last_synced) AS lastPulledAt, MAX(changed_at) AS lastChangedAt FROM store_stocks WHERE store_id = ?').get(storeId) || {};
  // Sales also lower ESB stock all day, so stock-in (increases) are reported separately
  const stockIn = db.prepare('SELECT MAX(changed_at) AS t FROM stock_changes WHERE store_id = ? AND new_qty > old_qty').get(storeId) || {};
  const recent = db.prepare(`
    SELECT c.product_id AS productId, COALESCE(p.product_title, c.product_id) AS name, c.old_qty AS oldQty, c.new_qty AS newQty, c.changed_at AS changedAt
    FROM stock_changes c LEFT JOIN products p ON p.id = c.product_id
    WHERE c.store_id = ? ORDER BY c.changed_at DESC LIMIT 15
  `).all(storeId);
  return { lastPulledAt: row.lastPulledAt || null, lastChangedAt: row.lastChangedAt || null, lastStockInAt: stockIn.t || null, recentChanges: recent };
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
      variance_count as varianceCount, accuracy, records_json as recordsJson,
      started_at as startedAt, total_expected as totalExpected, total_scanned as totalScanned,
      matched_count as matchedCount, missing_count as missingCount, surplus_count as surplusCount, notes
    FROM audit_history 
    ORDER BY completed_at DESC, timestamp DESC;
  `).all();

  return rows.map(r => {
    let items = [];
    try { items = r.recordsJson ? JSON.parse(r.recordsJson) : []; } catch (_) {}
    if (!Array.isArray(items)) items = [];
    const m = computeAuditMetrics(items);
    // Legacy rows have NULL summary columns: recompute from stored item details when available
    const pick = (stored, computed, fallback = 0) =>
      stored !== null && stored !== undefined ? stored : (items.length ? computed : fallback);
    const totalExpected = pick(r.totalExpected, m.totalExpected);
    const totalScanned = pick(r.totalScanned, m.totalScanned, r.totalItems || 0);
    const missingCount = pick(r.missingCount, m.missingCount, r.varianceCount || 0);
    const accuracy = items.length && r.totalExpected == null ? m.accuracy
      : (r.accuracy !== null && r.accuracy !== undefined ? r.accuracy : 100);
    return {
      id: r.id,
      storeId: r.storeId,
      storeName: r.storeName,
      auditorName: r.auditorName,
      timestamp: r.timestamp,
      startedAt: r.startedAt || null,
      completedAt: r.completedAt || r.timestamp,
      totalItems: r.totalItems,
      varianceCount: r.varianceCount,
      totalExpected,
      totalScanned,
      matchedCount: pick(r.matchedCount, m.matchedCount),
      missingCount,
      surplusCount: pick(r.surplusCount, m.surplusCount),
      accuracy,
      notes: r.notes || '',
      records: items,
      items,
    };
  });
}

export function computeAuditMetrics(items = []) {
  let totalExpected = 0, totalScanned = 0, matchedCount = 0, missingCount = 0, surplusCount = 0;
  let expectedSkus = 0;
  for (const it of items) {
    const exp = Number(it.wpExpectedQty) || 0;
    const sc = Number(it.scannedCount) || 0;
    totalExpected += Math.max(exp, 0);
    totalScanned += sc;
    if (exp > 0) expectedSkus += 1;
    if (it.status === 'matched' && exp !== 0) matchedCount += 1;
    if (exp > 0 && sc < exp) missingCount += 1;
    if (it.status === 'surplus') surplusCount += 1;
  }
  const accuracy = expectedSkus > 0 ? Math.round(((expectedSkus - missingCount) / expectedSkus) * 1000) / 10 : 100;
  return { totalExpected, totalScanned, matchedCount, missingCount, surplusCount, accuracy };
}

export function updateAuditHistoryRecord(id, { auditorName, notes, completedAt } = {}) {
  const db = getDb();
  const row = db.prepare('SELECT id FROM audit_history WHERE id = ?;').get(id);
  if (!row) return false;
  if (auditorName !== undefined) db.prepare('UPDATE audit_history SET auditor_name = ? WHERE id = ?;').run(String(auditorName), id);
  if (notes !== undefined) db.prepare('UPDATE audit_history SET notes = ? WHERE id = ?;').run(String(notes), id);
  if (completedAt) db.prepare('UPDATE audit_history SET completed_at = ? WHERE id = ?;').run(String(completedAt), id);
  return true;
}

export function deleteAuditHistoryRecord(id) {
  const db = getDb();
  return db.prepare('DELETE FROM audit_history WHERE id = ?;').run(id).changes > 0;
}

export function saveAuditHistoryRecord(record) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_history (
      id, store_id, store_name, auditor_name, timestamp, completed_at, total_items, variance_count, accuracy, records_json,
      started_at, total_expected, total_scanned, matched_count, missing_count, surplus_count, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      total_items = excluded.total_items,
      variance_count = excluded.variance_count,
      accuracy = excluded.accuracy,
      records_json = excluded.records_json,
      started_at = excluded.started_at,
      total_expected = excluded.total_expected,
      total_scanned = excluded.total_scanned,
      matched_count = excluded.matched_count,
      missing_count = excluded.missing_count,
      surplus_count = excluded.surplus_count,
      notes = excluded.notes;
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
    JSON.stringify(record.records || []),
    record.startedAt || null,
    record.totalExpected ?? 0,
    record.totalScanned ?? 0,
    record.matchedCount ?? 0,
    record.missingCount ?? 0,
    record.surplusCount ?? 0,
    record.notes || ''
  );
}

// Users Queries
export function getAllUsers() {
  const db = getDb();
  return db.prepare('SELECT id, username, email, name, role, store_id AS storeId FROM users;').all();
}

export function getUserByUsername(username) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE username = ?;').get(username);
}

const AUTH_SESSION_TTL_MS = 60 * 60 * 1000;
const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

export function createAuthSession(user) {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?;').run(new Date().toISOString());
  db.prepare('INSERT INTO auth_sessions (token_hash, user_id, role, expires_at) VALUES (?, ?, ?, ?);')
    .run(hashToken(token), user.id, user.role || '', new Date(Date.now() + AUTH_SESSION_TTL_MS).toISOString());
  return token;
}

export function getAuthSession(token) {
  if (!token || typeof token !== 'string') return null;
  const row = getDb().prepare(
    'SELECT s.user_id AS userId, u.username AS username, u.role AS role, u.name AS name, u.store_id AS storeId, s.expires_at AS expiresAt FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?;'
  ).get(hashToken(token));
  if (!row || new Date(row.expiresAt).getTime() <= Date.now()) return null;
  return row;
}

export function deleteAuthSession(token) {
  if (!token || typeof token !== 'string') return;
  getDb().prepare('DELETE FROM auth_sessions WHERE token_hash = ?;').run(hashToken(token));
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
// Stock Audit CSV File Records & Live Stock Application
// ==========================================

export function resolveStoreIdForStock(storeName) {
  const raw = String(storeName || '').trim().toLowerCase();
  if (!raw) return 'birmas-sudirman';
  if (raw.includes('sudirman')) return 'birmas-sudirman';
  if (raw.includes('kuningan')) return 'birmas-kuningan';
  if (raw.includes('kwitang')) return 'birmas-kwitang';
  if (raw.includes('lebak') || raw.includes('bulus')) return 'birmas-lebak-bulus';
  if (raw.includes('kelapa') || raw.includes('gading')) return 'birmas-kelapa-gading';
  if (raw.includes('tebet')) return 'birmas-tebet';
  if (raw.includes('nomadic') || raw.includes('bandung')) return 'birmas-nomadic';
  if (raw.includes('nusa') || raw.includes('bali')) return 'birmas-nusadua';
  
  const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug ? `birmas-${slug}` : 'birmas-sudirman';
}

export function deriveProductBrand(title) {
  const t = String(title || '').trim();
  if (/^kulturale/i.test(t)) return 'Kulturale';
  if (/^guinness/i.test(t)) return 'Guinness';
  if (/^bintang/i.test(t)) return 'Bintang';
  if (/^heineken/i.test(t)) return 'Heineken';
  if (/^smirnoff/i.test(t)) return 'Smirnoff';
  if (/^corona/i.test(t)) return 'Corona';
  if (/^soju|chamisul|jinro/i.test(t)) return 'Jinro';
  if (/^carlsberg/i.test(t)) return 'Carlsberg';
  if (/^san miguel/i.test(t)) return 'San Miguel';
  if (/^prost/i.test(t)) return 'Prost';
  if (/^singha/i.test(t)) return 'Singha';
  if (/^budweiser/i.test(t)) return 'Budweiser';
  if (/^sapporo/i.test(t)) return 'Sapporo';
  if (/^asahi/i.test(t)) return 'Asahi';
  if (/^anker/i.test(t)) return 'Anker';
  if (/^albens/i.test(t)) return 'Albens';
  if (/^kura kura/i.test(t)) return 'Kura Kura';
  if (/^island brewing/i.test(t)) return 'Island Brewing';
  if (/^black sand/i.test(t)) return 'Black Sand';
  const firstWord = t.split(/[\s-]+/)[0];
  if (firstWord && firstWord.length > 2) return firstWord;
  return 'Birmas';
}

export function applyStockRowsToDatabase(db, rows = []) {
  if (!rows || rows.length === 0) return;

  const allStores = db.prepare('SELECT id, name FROM stores').all();
  const storeMap = new Map(allStores.map(s => [s.id, s]));

  const insertStoreStmt = db.prepare(`
    INSERT INTO stores (id, name, location_code, esb_branch_code)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING;
  `);

  const existingProducts = db.prepare('SELECT id, product_title, varian, barcode FROM products').all();
  const productLookup = new Map();
  for (const p of existingProducts) {
    if (p.product_title) productLookup.set(p.product_title.toLowerCase().trim(), p);
    if (p.varian) productLookup.set(p.varian.toLowerCase().trim(), p);
  }

  const upsertProductStmt = db.prepare(`
    INSERT INTO products (
      id, barcode, sku, brand, varian, product_title, category, sub_category, default_unit, package_type, volume, unit_volume, price, wp_status, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      category = coalesce(excluded.category, products.category),
      sub_category = coalesce(excluded.sub_category, products.sub_category),
      default_unit = coalesce(excluded.default_unit, products.default_unit),
      last_updated = excluded.last_updated;
  `);

  const upsertStockStmt = db.prepare(`
    INSERT INTO store_stocks (store_id, product_id, stock_qty, last_synced)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(store_id, product_id) DO UPDATE SET
      stock_qty = excluded.stock_qty,
      last_synced = excluded.last_synced;
  `);

  const now = new Date().toISOString();

  // Accumulate quantities per (store, product) first. The ESB stock period export can list
  // the same product more than once per store (e.g. separate batch/expiry/sub-category rows),
  // so writing each row directly would overwrite earlier rows instead of summing them,
  // silently undercounting the true stock on hand.
  const stockTotals = new Map();

  for (const r of rows) {
    const rawStoreName = r.storeName || r.store || '';
    const storeId = resolveStoreIdForStock(rawStoreName);

    if (!storeMap.has(storeId)) {
      const displayName = rawStoreName.startsWith('Birmas') ? rawStoreName : `Birmas ${rawStoreName}`;
      insertStoreStmt.run(storeId, displayName, storeId.replace('birmas-', 'BRM-').toUpperCase(), 'ESB');
      storeMap.set(storeId, { id: storeId, name: displayName });
    }

    const prodTitle = String(r.productName || r.product || '').trim();
    if (!prodTitle) continue;

    const lowerTitle = prodTitle.toLowerCase();
    let matchedProduct = productLookup.get(lowerTitle);
    let productId;

    if (matchedProduct) {
      productId = matchedProduct.id;
      upsertProductStmt.run(
        productId,
        matchedProduct.barcode || null,
        null,
        deriveProductBrand(prodTitle),
        prodTitle,
        prodTitle,
        r.category || null,
        r.category || deriveProductBrand(prodTitle),
        r.unit || null,
        'Kaleng',
        330,
        'ml',
        0,
        'publish',
        now
      );
    } else {
      const slug = lowerTitle.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      productId = `prod-${slug || Date.now()}`;
      upsertProductStmt.run(
        productId,
        null,
        `SKU-${slug.slice(0, 8).toUpperCase()}`,
        deriveProductBrand(prodTitle),
        prodTitle,
        prodTitle,
        r.category || 'Craft Beer',
        r.category || deriveProductBrand(prodTitle),
        r.unit || 'Can',
        'Kaleng',
        330,
        'ml',
        0,
        'publish',
        now
      );
      productLookup.set(lowerTitle, { id: productId, product_title: prodTitle });
    }

    const stockQty = Number(r.stockQty ?? r.qty ?? 0) || 0;
    const key = `${storeId}\u0000${productId}`;
    stockTotals.set(key, (stockTotals.get(key) || 0) + stockQty);
  }

  for (const [key, totalQty] of stockTotals) {
    const [storeId, productId] = key.split('\u0000');
    upsertStockStmt.run(storeId, productId, totalQty, now);
  }
}

export function getSessionLockState(storeId) {
  const db = getDb();
  try {
    const row = db.prepare('SELECT * FROM audit_sessions WHERE store_id = ?').get(storeId);
    if (!row) {
      return { storeId, isLocked: false };
    }
    const LOCK_MS = 3 * 24 * 60 * 60 * 1000;
    const lockedUntil = row.locked_at ? new Date(new Date(row.locked_at).getTime() + LOCK_MS).toISOString() : null;
    if (row.is_locked === 1 && lockedUntil && Date.now() >= new Date(lockedUntil).getTime()) {
      db.prepare('UPDATE audit_sessions SET is_locked = 0, unlocked_at = ?, unlocked_by = ? WHERE store_id = ?').run(new Date().toISOString(), 'Auto (3 days)', storeId);
      return { storeId, isLocked: false, lockedAt: row.locked_at, lockedBy: row.locked_by, unlockedBy: 'Auto (3 days)' };
    }
    return {
      storeId: row.store_id,
      isLocked: row.is_locked === 1,
      lockedUntil: row.is_locked === 1 ? lockedUntil : null,
      lockedAt: row.locked_at,
      lockedBy: row.locked_by,
      unlockedAt: row.unlocked_at,
      unlockedBy: row.unlocked_by,
    };
  } catch (err) {
    console.warn('[DB getSessionLockState]:', err);
    return { storeId, isLocked: false };
  }
}

export function setSessionLockState(storeId, isLocked, user = 'Super Admin') {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    if (isLocked) {
      db.prepare(`
        INSERT INTO audit_sessions (store_id, is_locked, locked_at, locked_by)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(store_id) DO UPDATE SET
          is_locked = 1,
          locked_at = excluded.locked_at,
          locked_by = excluded.locked_by
      `).run(storeId, now, user);
    } else {
      db.prepare(`
        INSERT INTO audit_sessions (store_id, is_locked, unlocked_at, unlocked_by)
        VALUES (?, 0, ?, ?)
        ON CONFLICT(store_id) DO UPDATE SET
          is_locked = 0,
          unlocked_at = excluded.unlocked_at,
          unlocked_by = excluded.unlocked_by
      `).run(storeId, now, user);
    }
    return { success: true, storeId, isLocked: Boolean(isLocked) };
  } catch (err) {
    console.error('[DB setSessionLockState]:', err);
    return { success: false, error: err.message };
  }
}

export function logAuditScanEvent(storeId, barcode, auditor = 'Auditor', action = 'SCAN') {
  const db = getDb();
  try {
    const id = 'evt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    db.prepare(`
      INSERT INTO audit_scan_events (id, store_id, barcode, auditor, action, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, storeId, barcode, auditor, action, new Date().toISOString());
    return { success: true, id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function getVisitPurposes() {
  try {
    const raw = getConfig('esb_visit_purposes', '');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    return [
      { id: 1, name: 'DINE IN', companyCode: 'BRM' },
      { id: 2, name: 'TAKE AWAY', companyCode: 'BRM' },
      { id: 3, name: 'DELIVERY', companyCode: 'BRM' },
      { id: 4, name: 'GOFOOD', companyCode: 'BRM' },
      { id: 5, name: 'GRABFOOD', companyCode: 'BRM' },
      { id: 6, name: 'SHOPEEFOOD', companyCode: 'BRM' },
      { id: 7, name: 'WHATSAPP ORDER', companyCode: 'BRM' },
    ];
  } catch {
    return [];
  }
}

export function setVisitPurposes(purposes) {
  const list = Array.isArray(purposes) ? purposes : [];
  setConfig('esb_visit_purposes', JSON.stringify(list));
  setConfig('last_visit_purposes_synced_at', new Date().toISOString());
  return list;
}
