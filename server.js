import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import * as db from './db.js';
import * as salesDb from './salesDb.js';
import * as storeAuditService from './storeAuditService.js';
import * as stockPeriodCsv from './stockPeriodCsv.js';
import * as stockPeriodCsvStore from './stockPeriodCsvStore.js';

export function parseSafeMoney(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = String(val).trim().replace(/^(Rp|IDR)\.?\s*/i, '').trim();
  if (!str) return 0;

  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastDot > lastComma) {
      // US format: 1,250,000.00
      str = str.replace(/,/g, '');
    } else {
      // EU/Indonesian format: 1.250.000,00
      str = str.replace(/\./g, '').replace(',', '.');
    }
  } else if (str.includes(',')) {
    const parts = str.split(',');
    if (parts.length > 2) {
      str = str.replace(/,/g, '');
    } else if (parts.length === 2) {
      if (parts[1].length === 3) {
        str = str.replace(/,/g, '');
      } else if (parts[1].length === 2 && parts[1] === '00') {
        str = parts[0];
      } else {
        str = str.replace(',', '.');
      }
    }
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length > 2) {
      str = str.replace(/\./g, '');
    } else if (parts.length === 2) {
      if (parts[1].length === 3) {
        str = str.replace(/\./g, '');
      } else if (parts[1].length === 2 && parts[1] === '00') {
        str = parts[0];
      }
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Prevent unhandled errors from terminating Node
process.on('uncaughtException', (err) => {
  console.error('[Process Uncaught Exception]:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Process Unhandled Rejection]:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In AI Studio runtime environment, the app must bind strictly to port 3000
const PORT = 3000;

export const BIRMAS_STORE_KEYWORD_MAP = [
  { storeId: 'birmas-sudirman', name: 'Birmas Sudirman', keywords: ['sudirman', 'outs', 'sdr', 'outlet sudirman', 'brms'] },
  { storeId: 'birmas-kuningan', name: 'Birmas Kuningan', keywords: ['kuningan', 'brmk', 'kng', 'kunngan', 'outlet kuningan'] },
  { storeId: 'birmas-kwitang', name: 'Birmas Kwitang', keywords: ['kwitang', 'brmkw', 'kwt', 'outlet kwitang'] },
  { storeId: 'birmas-lebak-bulus', name: 'Birmas Lebak Bulus', keywords: ['lebak bulus', 'lebak', 'bulus', 'brmlb', 'lbb', 'lbulus', 'outlet lebak bulus'] },
  { storeId: 'birmas-kelapa-gading', name: 'Birmas Kelapa Gading', keywords: ['kelapa gading', 'gading', 'brmkg', 'kgading', 'outlet kelapa gading'] },
  { storeId: 'birmas-tebet', name: 'Birmas Tebet', keywords: ['tebet', 'brmt', 'tbt', 'outlet tebet'] },
  { storeId: 'birmas-nomadic', name: 'Birmas Nomadic (Bandung)', keywords: ['nomadic', 'bandung', 'lr00'] },
  { storeId: 'birmas-nusadua', name: 'Birmas Nusa Dua (Bali)', keywords: ['nusa dua', 'bali', 'nusadua', 'bbnd'] },
];

export function extractMatchedStoreId(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    const s = String(item).toLowerCase();
    const found = BIRMAS_STORE_KEYWORD_MAP.find(m => m.storeId === s || m.keywords.some(kw => s.includes(kw)));
    return found ? found.storeId : null;
  }
  if (item.store_id) {
    const s = String(item.store_id).toLowerCase();
    const found = BIRMAS_STORE_KEYWORD_MAP.find(m => m.storeId === s || m.keywords.some(kw => s.includes(kw)));
    if (found) return found.storeId;
  }
  const locRaw = item.location || item.branch || item.store || item.outlet || item.location_name || item.branch_name || item.branchCode || '';
  let locStr = '';
  if (Array.isArray(locRaw)) {
    locStr = locRaw.map(l => typeof l === 'object' ? (l.post_title || l.name || l.title || '') : String(l)).join(' ');
  } else if (typeof locRaw === 'object' && locRaw !== null) {
    locStr = locRaw.post_title || locRaw.name || locRaw.title || '';
  } else {
    locStr = String(locRaw);
  }
  const clean = locStr.toLowerCase();
  const matched = BIRMAS_STORE_KEYWORD_MAP.find(m => clean.includes(m.storeId) || m.keywords.some(kw => clean.includes(kw)));
  return matched ? matched.storeId : null;
}

let isEsbSyncing = false;

// Direct ESB Live Sync: Connects straight to ESB POS Cloud to fetch real store stock per branch
export async function runDirectESBSync(options = {}) {
  if (isEsbSyncing) {
    console.log('[Direct ESB Sync] Sync already in progress, skipping.');
    return { success: false, message: 'Already syncing' };
  }
  isEsbSyncing = true;
  try {
    const token = options.token || process.env.BIRMAS_API_TOKEN || process.env.ESB_BEARER_TOKEN || db.getConfig('birmas_server_token') || 'enAYShLVFFtWqFPmcd5nwkuJFmeVC5cG3pgwgShNpmmpRLzEPeRabbvG8zdm';

    let baseUrl = options.baseUrl || process.env.ESB_BASE_URL;
    if (!baseUrl) {
      const candidateUrl = options.birmasServerUrl || process.env.BIRMAS_BACKEND_URL || db.getConfig('wp_url') || '';
      if (candidateUrl.includes('esb.co.id')) {
        try {
          const u = new URL(candidateUrl);
          baseUrl = `${u.protocol}//${u.host}`;
        } catch {
          baseUrl = 'https://core-api.esb.co.id';
        }
      } else {
        baseUrl = 'https://stg7.esb.co.id/api-fnb-backend-int/web';
      }
    }
    baseUrl = baseUrl.replace(/\/$/, '');

    let defaultVp = options.visitPurposeId || process.env.ESB_VISIT_PURPOSE_ID;
    if (!defaultVp) {
      const cachedVps = db.getVisitPurposes();
      if (cachedVps.length > 0 && cachedVps[0]?.id) {
        defaultVp = String(cachedVps[0].id);
      } else {
        defaultVp = '2';
      }
    }

    console.log(`[Direct ESB Sync] Connecting to ${baseUrl} (Visit Purpose ID: ${defaultVp}) ...`);
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 BirmasAudit/2.0',
    };

    // 1. Fetch live branches from ESB
    let branches = [];
    try {
      const res = await fetch(`${baseUrl}/extv1/branch`, { headers, signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        branches = await res.json();
      }
    } catch (err) {
      console.warn('[Direct ESB Sync] Failed to fetch branches from ESB, using active branch list:', err.message);
    }

    if (!Array.isArray(branches) || branches.length === 0) {
      branches = [
        { branchCode: 'OUTS', branchName: 'Outlet Sudirman' },
        { branchCode: 'BRMT', branchName: 'Tebet' },
        { branchCode: 'BRMK', branchName: 'Kuningan' },
        { branchCode: 'BRMKG', branchName: 'Kelapa Gading' },
        { branchCode: 'BRMLB', branchName: 'Lebak Bulus' },
        { branchCode: 'BRMKW', branchName: 'Kwitang' },
        { branchCode: 'BBND', branchName: 'Bali Nusa Dua' },
      ];
    }

    console.log(`[Direct ESB Sync] Syncing ${branches.length} Birmas branches in SQLite...`);
    const branchMap = new Map();
    for (const b of branches) {
      const storeId = extractMatchedStoreId(b.branchCode) || extractMatchedStoreId(b.branchName) || 'birmas-kuningan';
      branchMap.set(b.branchCode, storeId);
    }

    // Preserve existing mapped barcodes in SQLite
    const existingProducts = db.getAllProducts();
    const barcodeMap = new Map();
    for (const p of existingProducts) {
      if (p.barcode) {
        barcodeMap.set(p.id, p.barcode);
        if (p.brand && p.varian) {
          const key = `${p.brand.toLowerCase()}-${p.varian.toLowerCase()}`;
          barcodeMap.set(key, p.barcode);
        }
      }
    }

    const productCatalog = new Map();
    let totalStockEntries = 0;

    // Helper to normalize ESB item titles and extract volume
    function normalizeMenu(rawName) {
      let name = (rawName || '').trim();
      name = name.replace(/^(\(\s*\d+\+\s*\)|\[\s*\d+\+\s*\])\s*/i, '');
      name = name.replace(/^\[[A-Za-z0-9_-]+\]\s*/, '');

      let volume = 330;
      const volMatch = name.match(/(\d+(?:\.\d+)?)\s*(ml|l|cl)/i);
      if (volMatch) {
        const val = parseFloat(volMatch[1]);
        const unit = volMatch[2].toLowerCase();
        volume = unit === 'l' ? val * 1000 : unit === 'cl' ? val * 10 : val;
      }

      let packageType = 'Botol';
      if (name.toLowerCase().includes('can') || name.toLowerCase().includes('kaleng')) {
        packageType = 'Kaleng';
      }

      const knownBrands = ['Bintang', 'Anker', 'Iceland', 'Albens', 'Orang Tua', 'Kulturale', 'Guinness', 'Prost', 'Siren', 'Vibe', 'Palapa', 'Red Bull', 'Kawa Kawa', 'Intisari', 'Atlas', 'Pu Tao Chee Chiew', 'Royal Brewhouse'];
      let brand = '';
      for (const b of knownBrands) {
        if (new RegExp(`\\b${b}\\b`, 'i').test(name)) {
          brand = b;
          break;
        }
      }
      if (!brand) {
        brand = name.split(/\s+/)[0] || 'Birmas';
        brand = brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
      }

      let varian = name;
      if (varian.toLowerCase().startsWith(brand.toLowerCase())) {
        varian = varian.slice(brand.length).trim();
      }
      if (!varian) varian = 'Standard';

      return { displayName: name, brand, varian, volume, packageType };
    }

    // 2. Fetch menu & stock per branch
    for (const b of branches) {
      try {
        let menuUrl = `${baseUrl}/extv1/menu?branchCode=${encodeURIComponent(b.branchCode)}&visitPurposeID=${defaultVp}`;
        let res = await fetch(menuUrl, { headers, signal: AbortSignal.timeout(20000) });
        if (!res.ok) {
          menuUrl = `${baseUrl}/extv1/menu?branchCode=${encodeURIComponent(b.branchCode)}&visitPurposeID=2`;
          res = await fetch(menuUrl, { headers, signal: AbortSignal.timeout(20000) });
        }
        if (!res.ok) continue;

        const categories = await res.json();
        if (!Array.isArray(categories)) continue;
        const storeId = branchMap.get(b.branchCode);

        for (const cat of categories) {
          for (const detail of (cat.menuCategoryDetails || [])) {
            for (const m of (detail.menus || [])) {
              const menuId = m.menuID;
              const rawName = (m.menuName || m.menuShortName || '').trim();
              if (!rawName) continue;

              const norm = normalizeMenu(rawName);
              const prodId = `esb-${menuId}`;
              const key = `${norm.brand.toLowerCase()}-${norm.varian.toLowerCase()}`;
              const barcode = barcodeMap.get(prodId) || barcodeMap.get(key) || null;
              const price = Number(m.sellPrice ?? m.price ?? 0);
              const qty = Number(m.qty ?? 0);

              if (!productCatalog.has(prodId)) {
                productCatalog.set(prodId, {
                  id: prodId,
                  barcode: barcode,
                  sku: String(m.menuCode || menuId),
                  brand: norm.brand,
                  varian: norm.varian,
                  productTitle: norm.displayName,
                  packageType: norm.packageType,
                  volume: norm.volume,
                  unitVolume: 'ml',
                  price: price,
                  wpStatus: 'publish',
                  lastUpdated: new Date().toISOString(),
                });
              }

              if (storeId) {
                db.setProductStock(storeId, prodId, qty);
                totalStockEntries++;
              }
            }
          }
        }
        console.log(`[Direct ESB Sync] Branch ${b.branchCode} (${b.branchName}) synced.`);
      } catch (err) {
        console.warn(`[Direct ESB Sync] Branch ${b.branchCode} sync error:`, err.message);
      }
    }

    // Save all deduplicated products into SQLite
    for (const prod of productCatalog.values()) {
      db.saveProduct(prod);
    }

    db.setConfig('last_esb_synced_at', new Date().toISOString());
    console.log(`[Direct ESB Sync] Success! Synced ${productCatalog.size} products & ${totalStockEntries} branch stocks.`);
    return {
      success: true,
      totalProducts: productCatalog.size,
      totalStockEntries,
      totalStores: branches.length,
    };
  } finally {
    isEsbSyncing = false;
  }
}

// ==========================================
// BIRMAS CENTRAL SERVER INVENTORY SYNC ENGINE
// Pulls directly from Birmas central server (which has permanent ESB API access)
// No session cookies or cURL required!
// ==========================================
const SALES_SYNC_INTERVAL_MS = 60 * 1000;
const salesSyncStatus = { state: 'idle', message: 'Not synced yet', lastAttemptAt: null, lastSyncedAt: null, lastCount: 0 };
let isSalesSyncing = false;

function getSalesSyncEndpoint() {
  const explicit = process.env.SALES_SYNC_URL || db.getConfig('sales_sync_url');
  if (explicit) return explicit;
  const base = String(process.env.BIRMAS_BACKEND_URL || db.getConfig('wp_url') || 'http://10.0.0.10').replace(/\/+$/, '');
  return `${base}/wp-json/api/v1/sales_report`;
}

// Pulls the rolling last-2-days window from the Birmas server and replaces it idempotently
export async function runSalesSync() {
  if (isSalesSyncing) return { ok: false, message: 'A sales sync is already running.' };
  isSalesSyncing = true;
  salesSyncStatus.lastAttemptAt = new Date().toISOString();
  try {
    const latest = salesDb.getLatestSalesDate(salesDb.getSalesDb());
    const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const fromDate = latest && latest < from ? latest : from;
    const url = new URL(getSalesSyncEndpoint());
    url.searchParams.set('from', fromDate);
    const headers = { accept: 'application/json', 'user-agent': 'BirmasSalesSync/1.0' };
    const token = process.env.BIRMAS_API_TOKEN || db.getConfig('birmas_server_token');
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
    if (response.status === 404) {
      salesSyncStatus.state = 'unavailable';
      salesSyncStatus.message = 'The Birmas server has no sales endpoint yet (404). Add a sales_report route there, or push data to /api/sales/push.';
      return { ok: false, message: salesSyncStatus.message };
    }
    if (!response.ok) throw new Error(`Birmas server returned HTTP ${response.status}`);
    const body = await response.json();
    const rows = Array.isArray(body) ? body : (body.items || body.transactions || body.data || []);
    const count = rows.length ? salesDb.replaceLiveSalesWindow(salesDb.getSalesDb(), { fromDate, rows }) : 0;
    salesSyncStatus.state = 'ok';
    salesSyncStatus.lastSyncedAt = new Date().toISOString();
    salesSyncStatus.lastCount = count;
    salesSyncStatus.message = `Synced ${count} sales rows from ${fromDate}`;
    return { ok: true, message: salesSyncStatus.message, count };
  } catch (err) {
    salesSyncStatus.state = 'error';
    salesSyncStatus.message = err.message;
    return { ok: false, message: err.message };
  } finally {
    isSalesSyncing = false;
  }
}

let isBirmasServerSyncing = false;

const EXCLUDED_ESB_CATEGORIES = new Set(['LAIN-LAIN', 'LAIN LAIN', 'PERLENGKAPAN OUTLET', 'ELECTRONIC']);
const ESB_FEED_STORES = { BRMS: 'birmas-sudirman', BRMK: 'birmas-kuningan', BRMKW: 'birmas-kwitang' };

export function isExcludedEsbProduct(name, category) {
  const n = String(name || '').trim().toUpperCase();
  if (n.startsWith('PROMO') && /\(?DRAFT\)?$/.test(n)) return true;
  return EXCLUDED_ESB_CATEGORIES.has(String(category || '').trim().toUpperCase());
}

// Pulls the ESB stock list through the Birmas server feed (exact ESB names, categories and quantities)
async function runEsbFeedSync() {
  const key = process.env.BIRMAS_STOCK_FEED_KEY;
  if (!key) return null;
  const base = String(process.env.BIRMAS_BACKEND_URL || db.getConfig('wp_url') || 'http://10.0.0.10').replace(/\/+$/, '').replace(/\/wp-json.*$/, '');
  const res = await fetch(`${base}/audit-stock-feed.php`, { headers: { 'X-Audit-Key': key, accept: 'application/json' }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`ESB stock feed returned HTTP ${res.status}`);
  const body = await res.json();
  if (!body.success || !Array.isArray(body.rows) || body.rows.length === 0) {
    throw new Error(`ESB stock feed incomplete: ${JSON.stringify(body.errors || {})}`);
  }

  const startedAt = new Date().toISOString();
  const norm = (v) => String(v || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const barcodes = new Map();
  for (const p of db.getAllProducts()) {
    if (p.barcode && p.productTitle) barcodes.set(norm(p.productTitle), p.barcode);
  }
  const usedBarcodes = new Set();
  const barcodeFor = (name) => {
    const n = norm(name);
    const found = barcodes.get(n) || (() => {
      const close = [...barcodes].filter(([k]) => k.startsWith(`${n} `) || n.startsWith(`${k} `));
      return close.length === 1 ? close[0][1] : null;
    })();
    if (!found || usedBarcodes.has(found)) return found && usedBarcodes.has(found) ? undefined : null;
    usedBarcodes.add(found);
    return found;
  };

  let synced = 0;
  const sqlite = db.getDb();
  sqlite.exec('BEGIN');
  try {
    sqlite.prepare("UPDATE products SET barcode = NULL WHERE id LIKE 'erp-%'").run();
    const idBarcode = new Map();
    for (const row of body.rows) {
      const storeId = ESB_FEED_STORES[row.branch];
      const name = norm(row.name);
      if (!storeId || !name || isExcludedEsbProduct(name, row.category)) continue;
      const category = norm(row.category) || 'BEVERAGE';
      const brand = norm(row.subCategory) || db.deriveProductBrand(name);
      const unit = norm(row.unit) || 'BOTOL';
      const id = `esb-${row.productId}`;
      db.saveProduct({
        id,
        barcode: idBarcode.has(row.productId) ? idBarcode.get(row.productId) : (idBarcode.set(row.productId, barcodeFor(name) ?? null), idBarcode.get(row.productId)),
        sku: `SKU-${row.productId}`,
        brand,
        varian: name.startsWith(brand) ? name.slice(brand.length).trim() || name : name,
        productTitle: name,
        category,
        subCategory: brand,
        defaultUnit: unit,
        packageType: /CAN|KALENG/.test(unit) ? 'Kaleng' : 'Botol',
        volume: parseInt((name.match(/(\d{2,4})\s*ML/) || [])[1], 10) || (name.includes('620') ? 620 : 330),
        unitVolume: 'ml',
        price: 0,
        wpStatus: 'publish',
        lastUpdated: startedAt,
      });
      db.setProductStock(storeId, id, Math.round(Number(row.stock) || 0));
      synced++;
    }
    // Drop everything this feed no longer reports (old WP-based ids, excluded categories)
    sqlite.prepare('DELETE FROM store_stocks WHERE last_synced < ?').run(startedAt);
    sqlite.prepare("DELETE FROM products WHERE id NOT IN (SELECT product_id FROM store_stocks) AND (id LIKE 'erp-%' OR id LIKE 'esb-%')").run();
    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
  db.setConfig('last_birmas_server_synced_at', new Date().toISOString());
  console.log(`[ESB Feed Sync] Synced ${synced} store stocks.`);
  return synced;
}

export async function runBirmasServerSync(options = {}) {
  if (isBirmasServerSyncing) {
    return { success: false, message: 'Birmas Central Server sync is already running in background' };
  }
  isBirmasServerSyncing = true;
  try {
    try {
      const feedCount = await runEsbFeedSync();
      if (feedCount) {
        return { success: true, message: `Synchronized ${feedCount} ESB store stocks via the Birmas server feed`, totalSyncedProducts: feedCount, source: 'esb_feed' };
      }
    } catch (feedErr) {
      console.warn(`[ESB Feed Sync] ${feedErr.message}; falling back to the WordPress product_stock API.`);
    }
    const rawBaseUrl = options.baseUrl || options.birmasServerUrl || process.env.BIRMAS_BACKEND_URL || db.getConfig('wp_url') || 'http://10.0.0.10';
    const baseUrl = String(rawBaseUrl).trim();
    const token = options.token || options.apiToken || options.birmasServerToken || process.env.BIRMAS_API_TOKEN || db.getConfig('birmas_server_token') || '';

    // Determine whether to append an endpoint path or use baseUrl directly
    // If the user specifies noEndpoint: true, or endpointPath: '', 'none', or 'direct', DO NOT append any endpoint.
    const explicitEndpoint = options.endpointPath !== undefined ? options.endpointPath : options.birmasServerEndpoint;
    let resolvedEndpoint = '';

    if (options.noEndpoint === true || explicitEndpoint === '' || explicitEndpoint === 'none' || explicitEndpoint === 'direct') {
      resolvedEndpoint = ''; // Do NOT add any endpoint
    } else if (typeof explicitEndpoint === 'string' && explicitEndpoint.trim()) {
      resolvedEndpoint = explicitEndpoint.trim();
    } else {
      // Check stored database config or environment variable
      const dbEndpoint = db.getConfig('birmas_server_endpoint', null);
      const envEndpoint = process.env.BIRMAS_ENDPOINT_PATH !== undefined ? process.env.BIRMAS_ENDPOINT_PATH : null;

      if (dbEndpoint === '' || dbEndpoint === 'none' || dbEndpoint === 'direct') {
        resolvedEndpoint = '';
      } else if (dbEndpoint) {
        resolvedEndpoint = dbEndpoint;
      } else if (envEndpoint === '' || envEndpoint === 'none' || envEndpoint === 'direct') {
        resolvedEndpoint = '';
      } else if (envEndpoint) {
        resolvedEndpoint = envEndpoint;
      } else {
        // If baseUrl already looks like a complete endpoint URL
        // (e.g. contains /extv1/, /visit-purpose, /wp-json/, .php, /api/, etc.)
        const lowerUrl = baseUrl.toLowerCase();
        const hasExistingRoute = 
          lowerUrl.includes('/extv1/') || 
          lowerUrl.includes('visit-purpose') || 
          lowerUrl.includes('/wp-json/') || 
          lowerUrl.includes('.php') || 
          lowerUrl.includes('/product_stocks');
          
        if (hasExistingRoute) {
          resolvedEndpoint = ''; // Do NOT add any endpoint! User provided a full URL!
        } else {
          resolvedEndpoint = '/wp-json/api/v1/product_stock';
        }
      }
    }

    let targetUrl = baseUrl.trim();
    if (resolvedEndpoint && resolvedEndpoint !== 'none' && resolvedEndpoint !== 'direct') {
      const cleanEndpoint = resolvedEndpoint.startsWith('/') ? resolvedEndpoint : `/${resolvedEndpoint}`;
      targetUrl = `${baseUrl.replace(/\/+$/, '')}${cleanEndpoint}`;
    }

    console.log(`[Birmas Server Sync] Connecting to: ${targetUrl} (Endpoint appended: ${resolvedEndpoint ? resolvedEndpoint : 'NONE (Direct URL)'}) ...`);

    const existingProducts = db.getAllProducts();
    const barcodeMap = new Map();
    for (const p of existingProducts) {
      if (p.barcode) {
        barcodeMap.set(p.id, p.barcode);
        if (p.productTitle) barcodeMap.set(p.productTitle.toLowerCase().trim(), p.barcode);
      }
    }

    // Only true single-shot ESB endpoints (visit-purpose lookup, /extv1/ menu dumps) return
    // everything in one response. A direct full URL to a WordPress product_stock(s) REST
    // endpoint still paginates like the auto-appended endpoint does — previously any direct
    // URL was treated as single-shot, so only the first page (e.g. ~14 products) was ever
    // fetched and the rest of the catalog was silently ignored.
    const isSingleShotEsbEndpoint = targetUrl.toLowerCase().includes('visit-purpose') || targetUrl.toLowerCase().includes('/extv1/');
    const PAGE_SIZE = 25;
    const maxPages = isSingleShotEsbEndpoint ? 1 : 100;

    let totalSyncedProducts = 0;
    let page = 1;
    let hasMore = true;
    let fetchFailed = false;
    const syncStartedAt = new Date().toISOString();

    while (hasMore && page <= maxPages) {
      let url = targetUrl;
      if (!isSingleShotEsbEndpoint) {
        const sep = targetUrl.includes('?') ? '&' : '?';
        url = `${targetUrl}${sep}per_page=${PAGE_SIZE}&page=${page}&_fields=id,location,product_variant,stock,esb_menu_id,is_exist_in_esb`;
      }

      let items = [];
      let rawJson = null;

      try {
        const headers = {
          'user-agent': 'BirmasStockAudit/2.0',
          'accept': 'application/json',
        };
        if (token && token.trim()) {
          headers['authorization'] = `Bearer ${token.trim()}`;
        }

        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(120000),
        });

        if (!res.ok) {
          let errMsg = `HTTP ${res.status} ${res.statusText || ''}`.trim();
          try {
            const errJson = await res.json();
            if (errJson && errJson.message) {
              errMsg = `${errJson.message} (HTTP ${res.status})`;
            }
          } catch {}
          console.warn(`[Birmas Server Sync] Response error from ${url}: ${errMsg}`);
          return {
            success: false,
            urlCalled: url,
            endpointUsed: resolvedEndpoint || '(Direct URL - No Endpoint Added)',
            error: `API error from ${url}: ${errMsg}`,
            message: `Remote server returned ${errMsg}. If this endpoint requires credentials, check your Bearer token or URL.`,
          };
        }

        rawJson = await res.json();
        if (Array.isArray(rawJson)) {
          items = rawJson;
        } else if (rawJson && Array.isArray(rawJson.data)) {
          items = rawJson.data;
        } else if (rawJson && Array.isArray(rawJson.products)) {
          items = rawJson.products;
        } else if (rawJson && Array.isArray(rawJson.stocks)) {
          items = rawJson.stocks;
        } else if (rawJson && Array.isArray(rawJson.items)) {
          items = rawJson.items;
        } else {
          items = [];
        }
      } catch (fetchErr) {
        console.warn(`[Birmas Server Sync] Request notice: ${fetchErr.message}. Utilizing existing database stock.`);
        fetchFailed = true;
        break;
      }

      // 1. Detect if this is ESB Visit Purpose data
      const isVisitPurposeData = 
        targetUrl.toLowerCase().includes('visit-purpose') ||
        (Array.isArray(items) && items.length > 0 && items.some(x => x && (x.visitPurposeID !== undefined || x.visitPurposeName !== undefined || x.visit_purpose_name !== undefined))) ||
        (rawJson && (rawJson.visitPurposes || (Array.isArray(rawJson?.data) && rawJson.data.some(x => x && x.visitPurposeID !== undefined))));

      if (isVisitPurposeData) {
        const rawList = Array.isArray(items) && items.length > 0 ? items : (Array.isArray(rawJson?.data) ? rawJson.data : (Array.isArray(rawJson) ? rawJson : []));
        const vpList = rawList.map(vp => ({
          id: vp.visitPurposeID ?? vp.id ?? vp.code,
          name: vp.visitPurposeName ?? vp.name ?? vp.title ?? `Purpose ${vp.visitPurposeID}`,
          companyCode: vp.companyCode ?? vp.company_code ?? 'BRM',
          raw: vp,
        }));

        if (vpList.length > 0) {
          db.setVisitPurposes(vpList);
          console.log(`[Birmas Server Sync] Captured ${vpList.length} ESB Visit Purposes:`, vpList.map(v => `${v.name} (#${v.id})`).join(', '));
          
          return {
            success: true,
            isVisitPurposeData: true,
            urlCalled: targetUrl,
            endpointAdded: resolvedEndpoint ? resolvedEndpoint : 'None (Direct URL)',
            totalVisitPurposes: vpList.length,
            visitPurposes: vpList,
            message: `Retrieved ${vpList.length} ESB Visit Purposes (${vpList.map(v => `${v.name} [ID:${v.id}]`).join(', ')}) from ${targetUrl}`,
            guidance: 'Visit purposes represent order channels (e.g. Dine In, Take Away, Delivery), not inventory stocks. To fetch product stocks from ESB, connect to /extv1/menu with branchCode and visitPurposeID.',
          };
        }
      }

      // 2. Detect if this is ESB Branch data
      const isBranchData =
        targetUrl.toLowerCase().includes('/extv1/branch') ||
        (Array.isArray(items) && items.length > 0 && items.some(x => x && (x.branchCode !== undefined || x.branchName !== undefined)));

      if (isBranchData) {
        const branches = Array.isArray(items) ? items : (rawJson?.data || []);
        return {
          success: true,
          isBranchData: true,
          urlCalled: targetUrl,
          endpointAdded: resolvedEndpoint ? resolvedEndpoint : 'None (Direct URL)',
          totalBranches: branches.length,
          branches: branches,
          message: `Received ${branches.length} ESB Branches: ${branches.map(b => b.branchName || b.branchCode).join(', ')}.`,
          guidance: 'Branch list received. To pull inventory stock, connect to /extv1/menu for these branches.',
        };
      }

      // 3. Handle ESB Menu hierarchical category format if returned from /extv1/menu
      if (Array.isArray(rawJson) && rawJson.some(c => c && Array.isArray(c.menuCategoryDetails))) {
        for (const cat of rawJson) {
          for (const detail of (cat.menuCategoryDetails || [])) {
            for (const m of (detail.menus || [])) {
              const menuId = m.menuID;
              const prodName = (m.menuName || m.menuShortName || '').trim();
              if (!prodName) continue;

              const prodId = `esb-${menuId}`;
              const existingBarcode = barcodeMap.get(prodId) || barcodeMap.get(prodName.toLowerCase().trim()) || null;
              const price = Number(m.sellPrice ?? m.price ?? 0);
              const qty = Number(m.qty ?? 0);

              db.saveProduct({
                id: prodId,
                barcode: existingBarcode,
                sku: String(m.menuCode || menuId),
                brand: cat.categoryName || 'Birmas',
                varian: prodName,
                productTitle: prodName,
                category: cat.categoryName || 'BEVERAGE',
                subCategory: cat.categoryName || 'Craft Beer',
                defaultUnit: 'BOTOL',
                packageType: 'Botol',
                volume: 330,
                unitVolume: 'ml',
                price: price,
                wpStatus: 'publish',
                lastUpdated: new Date().toISOString(),
              });

              const defaultStore = db.getAllStores()[0]?.id || 'birmas-sudirman';
              db.setProductStock(defaultStore, prodId, qty);
              totalSyncedProducts++;
            }
          }
        }
        hasMore = false;
        break;
      }

      if (!Array.isArray(items) || items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        const branchCode = String(item.location?.[0]?.branch_code_esb || '').toLowerCase();
        // Records without a linked outlet (location=false) must never fall back to a default store
        if (!branchCode || branchCode === 'behp') continue; // also skips the ESB test branch
        const storeId = (branchCode && BIRMAS_STORE_KEYWORD_MAP.find((m) => m.keywords.includes(branchCode))?.storeId)
          || extractMatchedStoreId(item) || db.resolveStoreIdForStock(item.store || item.store_name || item.storeName || item.branch || item.storeId || '');
        if (!storeId) continue;

        const pv = item.product_variant?.[0];
        const p = pv?.product?.[0];

        const variantSlug = String(pv?.post_name || '').replace(/-+/g, ' ').trim().toUpperCase();
        const prodName = (p?.post_title || variantSlug || item.product_name || item.productName || item.product_title || item.name || item.varian || '').trim();
        if (!prodName) continue;

        // Skip non-retail merchandise
        const categoryName = (p?.product_category?.post_title || item.category || 'BEVERAGE').toUpperCase();
        if (
          prodName.toLowerCase().includes('cleaner') ||
          prodName.toLowerCase().includes('router') ||
          prodName.toLowerCase().includes('es batu') ||
          prodName.toLowerCase().includes('gelas cup')
        ) {
          continue;
        }

        const esbId = item.esb_menu_id || item.id || prodName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const prodId = `erp-${esbId}`;
        const existingBarcode = barcodeMap.get(prodId) || barcodeMap.get(prodName.toLowerCase().trim()) || item.barcode || null;

        const brand = item.brand || db.deriveProductBrand(prodName);
        let varian = item.varian || prodName;
        if (varian.toLowerCase().startsWith(brand.toLowerCase())) {
          varian = varian.slice(brand.length).trim();
        }

        const price = parseFloat(pv?.regular_price ?? item.price ?? 0) || 0;
        const unit = pv?.variant || item.unit || item.defaultUnit || 'BOTOL';
        const stockQty = Math.round(Number(item.stock ?? item.stock_qty ?? item.stockQty ?? item.qty ?? 0) || 0);

        db.saveProduct({
          id: prodId,
          barcode: existingBarcode,
          sku: item.sku || `SKU-${esbId}`,
          brand: brand,
          varian: varian || prodName,
          productTitle: prodName,
          category: categoryName,
          subCategory: brand,
          defaultUnit: unit,
          packageType: unit.toLowerCase().includes('can') || unit.toLowerCase().includes('kaleng') ? 'Kaleng' : 'Botol',
          volume: parseInt(pv?.volume || item.volume) || (prodName.includes('620') ? 620 : 330),
          unitVolume: pv?.unit_volume || item.unitVolume || 'ml',
          price: price,
          wpStatus: 'publish',
          lastUpdated: new Date().toISOString(),
        });

        db.setProductStock(storeId, prodId, stockQty);
        totalSyncedProducts++;
      }

      if (items.length < PAGE_SIZE || isSingleShotEsbEndpoint) {
        hasMore = false;
        break;
      }

      page++;
      await new Promise((r) => setTimeout(r, 100));
    }

    // After a complete pull, drop stock rows the server no longer reports so stale imports can't linger
    if (totalSyncedProducts > 0 && !fetchFailed && !isSingleShotEsbEndpoint) {
      const pruned = db.getDb().prepare('DELETE FROM store_stocks WHERE last_synced < ?').run(syncStartedAt);
      if (pruned.changes) console.log(`[Birmas Server Sync] Removed ${pruned.changes} stale stock rows.`);
    }

    if (totalSyncedProducts > 0) {
      db.setConfig('last_birmas_server_synced_at', new Date().toISOString());
      console.log(`[Birmas Server Sync] Completed! Synced ${totalSyncedProducts} store stocks from ${targetUrl}.`);
    } else {
      console.log(`[Birmas Server Sync] Finished querying ${targetUrl}.`);
    }

    return {
      success: true,
      message: totalSyncedProducts > 0 
        ? `Successfully synchronized ${totalSyncedProducts} store stocks from ${targetUrl}`
        : `Connected to ${targetUrl}. No product stock records were returned. (Endpoint used: ${resolvedEndpoint || 'None'})`,
      totalSyncedProducts,
      urlCalled: targetUrl,
      endpointUsed: resolvedEndpoint || '(Direct URL - No Endpoint Added)',
      source: 'birmas_server',
    };
  } catch (err) {
    console.warn('[Birmas Server Sync Notice]:', err.message);
    return { success: false, error: err.message };
  } finally {
    isBirmasServerSyncing = false;
  }
}

// ==========================================
// MY ESB ERP INVENTORY SYNC ENGINE
// Pulls directly from My ESB ERP (Stock Period List)
// ==========================================
let isErpSyncing = false;

const DEFAULT_ERP_COOKIE = `_csrf-esb-fnb-backend=f78ccb84cefe055a764612525d2f74062e83a7c0a022538d86aa4fae44216c71a%3A2%3A%7Bi%3A0%3Bs%3A21%3A%22_csrf-esb-fnb-backend%22%3Bi%3A1%3Bs%3A32%3A%22L4gJX2eDfoa3DbPJAvw5vRJ89C12jNGn%22%3B%7D; PHPSESSID=t4vll2k1onjef4pmhma58f4bb0; _jwt-token=6610caad01882c9402616a0929ee9dfa964c4e662ad1643bde5be6fd8c0701c3a%3A2%3A%7Bi%3A0%3Bs%3A10%3A%22_jwt-token%22%3Bi%3A1%3Bs%3A373%3A%22eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdXRob3JpemVkIjp0cnVlLCJjb21wYW55Q29kZSI6IkJSTSIsImNvbXBhbnlJRCI6NTk3MSwiY29tcGFueU5hbWUiOiJQVC4gQmlybWFzIE1lcnViYWggUGVyc2Vwc2kiLCJkYk5hbWUiOiJmbmJfYnJtIiwiZXhwIjoxNzkwOTU1MDE0LCJmdWxsTmFtZSI6IlBoaWxsaXAiLCJzZXJ2ZXJDb2RlIjoiZ2xvYmFsMyIsInVzZXJSb2xlSUQiOjEsInVzZXJuYW1lIjoiQlJNUGhpbGxpcCJ9.j1zACEId80wffGXPNaJMGXA9A39dnOjngStrNCEHbVQ%22%3B%7D; _identity=18b2dc04b4c5721f9b9c31dd6309b0068ae32ae914af34d8ade231f4cc8f8542a%3A2%3A%7Bi%3A0%3Bs%3A9%3A%22_identity%22%3Bi%3A1%3Bs%3A28%3A%22%5B%22BRMPhillip%22%2Cnull%2C31104000%5D%22%3B%7D;`;
const DEFAULT_ERP_CSRF = 'YG3zBCat5kSNTL7OxAYsz9Az4Rt7B2fsyYtF8Y3WYCQsWZROfp-DAOsj3_2AZHyFkUWWLg1VLdTwyHTD55gnSg==';

export async function runDirectESBERPSync(options = {}) {
  if (isErpSyncing) {
    return { success: false, message: 'ERP Stock sync is already running in background' };
  }
  isErpSyncing = true;
  try {
    const savedCookie = db.getConfig('esb_erp_cookie');
    const savedCsrf = db.getConfig('esb_erp_csrf');
    const cookie = options.cookie || savedCookie || DEFAULT_ERP_COOKIE;
    const csrf = options.csrf || savedCsrf || DEFAULT_ERP_CSRF;

    if (options.cookie) db.setConfig('esb_erp_cookie', options.cookie);
    if (options.csrf) db.setConfig('esb_erp_csrf', options.csrf);

    const today = new Date().toISOString().split('T')[0];

    // The 4 official Birmas locations in ESB ERP
    const allBranches = [
      { branchId: 3, locationId: 5, storeId: 'birmas-kuningan', name: 'BIRMAS KUNINGAN' },
      { branchId: 2, locationId: 4, storeId: 'birmas-sudirman', name: 'BIRMAS SUDIRMAN' },
      { branchId: 5, locationId: 9, storeId: 'birmas-kwitang', name: 'BIRMAS KWITANG' },
      { branchId: 9, locationId: 17, storeId: 'birmas-lebak-bulus', name: 'BIRMAS LEBAK BULUS' },
    ];

    // Sync requested store or all 4 official locations
    const targetBranches = options.storeId && options.storeId !== 'all'
      ? allBranches.filter((b) => b.storeId === options.storeId)
      : allBranches;

    const existingProducts = db.getAllProducts();
    const barcodeMap = new Map();
    for (const p of existingProducts) {
      if (p.barcode) {
        barcodeMap.set(p.id, p.barcode);
        if (p.productTitle) barcodeMap.set(p.productTitle.toLowerCase().trim(), p.barcode);
      }
    }

    let totalSyncedProducts = 0;
    const sampleItems = [];

    // Filter out non-inventory outlet hardware/assets
    const excludedCategories = [
      'PERLENGKAPAN OUTLET',
      'ASSET',
      'NON DEPRECIATED ASSET',
      'ELECTRONIC',
      'RENOVATION',
      'TABLET',
      'KITCHENWARE AND SUPPLIES',
    ];

    let isSessionExpired = false;
    for (const b of targetBranches) {
      if (isSessionExpired) break;
      for (let page = 1; page <= 16; page++) {
        const url = `https://erp.esb.co.id/stock-period?StockCardForm%5BcategoryTypeID%5D%5B%5D=1&StockCardForm%5BbranchID%5D=${b.branchId}&StockCardForm%5BlocationID%5D%5B%5D=${b.locationId}&StockCardForm%5BstockDate%5D=${today}&_pjax=%23search-pjax&page=${page}`;
        let res;
        try {
          res = await fetch(url, {
            headers: {
              cookie,
              'x-csrf-token': csrf,
              'x-pjax': 'true',
              'x-pjax-container': '#search-pjax',
              'x-requested-with': 'XMLHttpRequest',
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/154.0.0.0',
            },
            redirect: 'manual',
            signal: AbortSignal.timeout(15000),
          });
        } catch (fetchErr) {
          console.warn(`[ESB ERP Sync] Network notice: ${fetchErr.message}`);
          break;
        }

        // Check if ERP session has expired or requires authentication (302 redirect)
        if (res.status === 302 || res.status === 401 || res.status === 403 || res.url.includes('/site/login')) {
          console.log('[ESB ERP Sync] Notice: ESB ERP session requires fresh credentials (HTTP 302 redirect). Preserving local SQLite database.');
          isSessionExpired = true;
          break;
        }

        if (!res.ok) {
          console.log(`[ESB ERP Sync] Page ${page} finished with status ${res.status}`);
          break;
        }

        const html = await res.text();
        const rows = html.match(/<tr[^>]*data-key[^>]*>[\s\S]*?<\/tr>/gi) || [];
        if (rows.length === 0) break;

        for (const r of rows) {
          const cells = [];
          for (const m of r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)) {
            cells.push(m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
          }
          if (cells.length >= 10 && cells[0] !== '#') {
            const idMatch = r.match(/productID%22%3A(\d+)/i) || r.match(/"productID":(\d+)/i);
            const productId = idMatch ? idMatch[1] : `erp-${totalSyncedProducts + 1}`;
            const prodName = cells[3] || '';
            const prodCode = cells[4] || '';
            const category = cells[5] || '';
            const subCategory = cells[6] || '';
            const defaultUnit = cells[7] || '';
            const stockQty = parseFloat(cells[9]?.replace(/\./g, '').replace(',', '.')) || 0;
            const availableQty = parseFloat(cells[11]?.replace(/\./g, '').replace(',', '.')) || 0;
            const price = parseFloat(cells[12]?.replace(/\./g, '').replace(',', '.')) || 0;

            // Skip non-merchandise supplies
            if (
              excludedCategories.includes(category.toUpperCase()) ||
              prodName.toLowerCase().includes('cleaner') ||
              prodName.toLowerCase().includes('router') ||
              prodName.toLowerCase().includes('shovel')
            ) {
              continue;
            }

            const prodId = `erp-${productId}`;
            const existingBarcode = barcodeMap.get(prodId) || barcodeMap.get(prodName.toLowerCase().trim()) || null;

            let brand = subCategory || 'Birmas';
            let varian = prodName;
            if (varian.toLowerCase().startsWith(brand.toLowerCase())) {
              varian = varian.slice(brand.length).trim();
            }

            db.saveProduct({
              id: prodId,
              barcode: existingBarcode,
              sku: prodCode || `SKU-${productId}`,
              brand: brand,
              varian: varian || prodName,
              productTitle: prodName,
              category: category,
              subCategory: subCategory,
              defaultUnit: defaultUnit,
              packageType: defaultUnit === 'CAN' ? 'Kaleng' : 'Botol',
              volume: prodName.includes('620') ? 620 : 330,
              unitVolume: 'ml',
              price: price,
              wpStatus: 'publish',
              lastUpdated: new Date().toISOString(),
            });

            db.setProductStock(b.storeId, prodId, availableQty);
            totalSyncedProducts++;
            if (sampleItems.length < 5) {
              sampleItems.push({ id: prodId, name: prodName, availableQty, store: b.name });
            }
          }
        }
      }
      console.log(`[ESB ERP Sync] Finished location: ${b.name}`);
    }

    db.setConfig('last_esb_erp_synced_at', new Date().toISOString());
    console.log(`[ESB ERP Sync] Success! Synced ${totalSyncedProducts} items from 4 Birmas store locations.`);
    return {
      success: true,
      totalSyncedProducts,
      sampleItems,
      lastSyncedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[ESB ERP Sync] Error:', err);
    return { success: false, message: err.message };
  } finally {
    isErpSyncing = false;
  }
}

async function startServer() {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Global CORS headers for cross-origin sync from Birmas server & dashboards
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Ensure SQLite tables are initialized
  db.getDb();

  // 1. Stores API (Unified for both Store Audit CCTV and Physical Stock Audit)
  app.get('/api/stores', (req, res) => {
    try {
      const cctvStores = storeAuditService.getCctvStores() || [];
      const stockStores = db.getAllStores() || [];

      const map = new Map();

      // First register all known store branches from stock database
      stockStores.forEach((s, idx) => {
        const cleanName = String(s.name || '').toLowerCase().replace(/^birmas\s+/i, '').trim();
        map.set(cleanName, {
          id: s.id,
          store_id: s.store_id || null,
          name: s.name,
          locationCode: s.locationCode || s.location_code || 'BRM',
          esbBranchCode: s.esbBranchCode || s.esb_branch_code || 'BRM',
        });
      });

      // Merge and update with CCTV audit store records
      cctvStores.forEach((cs, idx) => {
        const cleanCsName = String(cs.name || '').toLowerCase().replace(/^birmas\s+/i, '').trim();
        const existing = map.get(cleanCsName);
        if (existing) {
          existing.store_id = cs.store_id || existing.store_id;
          existing.name = cs.name;
        } else {
          map.set(cleanCsName, {
            id: `birmas-${cleanCsName.replace(/[^a-z0-9]/g, '-')}`,
            store_id: cs.store_id || null,
            name: cs.name,
            locationCode: `BRM-${cleanCsName.substring(0, 3).toUpperCase()}`,
            esbBranchCode: cleanCsName.toUpperCase(),
          });
        }
      });

      // Stores without a CCTV audit id get unique ids above the highest real one
      const all = Array.from(map.values());
      let nextId = Math.max(0, ...all.map((s) => Number(s.store_id) || 0)) + 1;
      all.forEach((s) => { if (!s.store_id) s.store_id = nextId++; });
      const activeRows = db.getDb().prepare('SELECT DISTINCT store_id FROM store_stocks WHERE stock_qty <> 0').all();
      const activeIds = new Set(activeRows.map((r) => r.store_id));
      all.forEach((s) => { s.hasStock = activeIds.has(s.id); });
      const result = all.sort((a, b) => a.store_id - b.store_id);
      res.json(result);
    } catch (err) {
      console.warn('[/api/stores] Fallback error:', err.message);
      res.json(db.getAllStores());
    }
  });

  app.post('/api/stores', (req, res) => {
    const { name, locationCode, esbBranchCode } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Store name is required' });
    }
    const id = req.body.id || `birmas-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const newStore = {
      id,
      name,
      locationCode: locationCode || `BRM-${id.substring(7, 10).toUpperCase()}`,
      esbBranchCode: esbBranchCode || `ESB_${id.substring(7, 10).toUpperCase()}`,
    };
    db.saveStore(newStore);
    res.json({ success: true, store: newStore, stores: db.getAllStores() });
  });

  app.delete('/api/stores/:id', (req, res) => {
    const { id } = req.params;
    db.deleteStore(id);
    res.json({ success: true, stores: db.getAllStores() });
  });

  // 2. Products API
  app.get('/api/products', (req, res) => {
    res.json(db.getAllProducts());
  });

  // 3. Add or match new barcode
  app.post('/api/products/match-barcode', (req, res) => {
    try {
      const payload = req.body;
      if (!payload.barcode) {
        return res.status(400).json({ error: 'Barcode is required' });
      }

      const cleanBarcode = payload.barcode.trim();
      const all = db.getAllProducts();
      const targetTitle = (payload.productTitle || payload.varian || '').toLowerCase().trim();
      const existing = (payload.productId || payload.wpId)
        ? all.find(p => p.id === (payload.productId || payload.wpId))
        : (targetTitle ? all.find(p => (p.productTitle && p.productTitle.toLowerCase().trim() === targetTitle) || (p.varian && p.varian.toLowerCase().trim() === targetTitle)) : null);

      const productItem = {
        id: existing ? existing.id : (payload.wpId || `prod-${Date.now()}`),
        barcode: cleanBarcode,
        sku: existing?.sku || payload.sku || `SKU-${Date.now().toString().slice(-4)}`,
        brand: existing?.brand || payload.brand || 'Birmas',
        varian: existing?.varian || payload.varian || cleanBarcode,
        productTitle: existing?.productTitle || payload.productTitle || `${existing?.brand || payload.brand || 'Birmas'} ${existing?.varian || payload.varian || cleanBarcode}`,
        packageType: existing?.packageType || payload.packageType || 'Kaleng',
        volume: existing?.volume || payload.volume || 330,
        unitVolume: existing?.unitVolume || payload.unitVolume || 'ml',
        price: existing?.price !== undefined ? existing.price : (payload.price || 0),
        stockByStore: existing?.stockByStore || payload.stockByStore || {},
        wpStatus: 'publish',
        lastUpdated: new Date().toISOString(),
      };

      db.saveProduct(productItem);

      // Preserve any counts already scanned under the synthetic `id:<productId>` key
      // (used before this product had a real barcode) by migrating them onto the
      // newly-assigned barcode.
      try {
        const sqliteDb = db.getDb();
        sqliteDb.prepare('UPDATE audit_scans SET barcode = ? WHERE barcode = ?;').run(cleanBarcode, `id:${productItem.id}`);
      } catch (_) {}

      res.json({
        success: true,
        message: `Barcode ${cleanBarcode} linked successfully to ${productItem.productTitle || productItem.varian}`,
        product: productItem,
      });
    } catch (err) {
      console.error('[Add/Change Barcode Error]:', err);
      const isReadonly = /readonly database/i.test(err.message || '');
      res.status(500).json({
        success: false,
        error: err.message,
        message: isReadonly
          ? 'Cannot save barcode: the database file or its folder is not writable by the server process. Run: ls -la data/ && whoami, then chown/chmod the "data" directory and data/birmas_audit.sqlite so the user running "node server.js" (or your process manager) can write to them.'
          : (err.message || 'Failed to save barcode'),
      });
    }
  });

  app.delete('/api/products/match-barcode/:barcode', (req, res) => {
    const { barcode } = req.params;
    const all = db.getAllProducts();
    const prod = all.find(p => p.barcode === barcode);
    if (prod) {
      const sqliteDb = db.getDb();
      sqliteDb.prepare('DELETE FROM products WHERE id = ?;').run(prod.id);
      sqliteDb.prepare('DELETE FROM store_stocks WHERE product_id = ?;').run(prod.id);
    }
    res.json({ success: true, message: `Barcode ${barcode} removed from SQLite` });
  });

  // 4. Audit State per store
  app.get('/api/audit/state', (req, res) => {
    const stores = db.getAllStores();
    const storeId = (req.query.storeId) || (stores[0]?.id || 'birmas-sudirman');
    const scans = db.getScansByStore(storeId);
    
    // Calculate counts per barcode
    const counts = {};
    for (const s of scans) {
      counts[s.barcode] = (counts[s.barcode] || 0) + 1;
    }

    res.json({
      storeId,
      counts,
      scanLogs: scans,
      totalScans: scans.length,
    });
  });

  // 5. Send physical scan (also used by the per-row "+" button in the comparison
  // table, which may not have a real barcode yet - in that case the frontend sends
  // a synthetic `id:<productId>` key alongside productId so the product can still be
  // matched and counted individually instead of collapsing onto a shared empty key)
  app.post('/api/audit/scan', (req, res) => {
    const stores = db.getAllStores();
    const { barcode, productId, storeId = (stores[0]?.id || 'birmas-sudirman'), auditorName = 'Auditor' } = req.body;
    if (!barcode && !productId) {
      return res.status(400).json({ error: 'Barcode is required' });
    }

    const products = db.getAllProducts();
    let clean = (barcode || '').trim();
    let product = clean ? products.find((p) => p.barcode === clean) : null;
    if (!product && productId) {
      product = products.find((p) => String(p.id) === String(productId));
      if (product && !clean) clean = `id:${product.id}`;
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Barcode ${clean || barcode || ''} is not registered in the database.`,
        unknownBarcode: clean || barcode,
      });
    }

    const scans = db.getScansByStore(storeId);
    const currentCount = scans.filter(s => s.barcode === clean).length;
    const newCount = currentCount + 1;

    const scanEvent = {
      id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      barcode: clean,
      brand: product.brand,
      varian: product.varian,
      scanSequence: newCount,
      storeId,
      auditorName,
    };

    db.saveScan(scanEvent);

    const wpExpected = (product.stockByStore && product.stockByStore[storeId]) ?? 0;
    const discrepancy = newCount - wpExpected;

    res.json({
      success: true,
      message: `${product.brand} ${product.varian} counted (${newCount}/${wpExpected})`,
      product,
      scannedCount: newCount,
      wpExpected,
      discrepancy,
      status: discrepancy === 0 ? 'matched' : discrepancy < 0 ? 'missing' : 'surplus',
      scanEvent,
    });
  });

  // 6. Manual Adjust Count (barcode here may be a real barcode OR a synthetic
  // `id:<productId>` key for products that don't have a barcode assigned yet -
  // see scanKeyFor() in useAuditStore.js. Each product gets its own key so
  // adjusting one row's count never affects any other row.)
  app.post('/api/audit/adjust', (req, res) => {
    const { barcode, productId, storeId = 'birmas-sudirman', count, delta } = req.body;
    if (!barcode) return res.status(400).json({ error: 'Barcode required' });

    const scans = db.getScansByStore(storeId);
    const barcodeScans = scans.filter(s => s.barcode === barcode);
    const current = barcodeScans.length;
    
    let targetCount = current;
    if (typeof count === 'number') {
      targetCount = Math.max(0, count);
    } else if (typeof delta === 'number') {
      targetCount = Math.max(0, current + delta);
    }

    if (targetCount > current) {
      const diff = targetCount - current;
      const products = db.getAllProducts();
      const product = products.find(p => p.barcode === barcode) ||
        (productId ? products.find(p => String(p.id) === String(productId)) : null);
      for (let i = 0; i < diff; i++) {
        db.saveScan({
          storeId,
          barcode,
          brand: product?.brand || '',
          varian: product?.varian || '',
          scanSequence: current + i + 1,
          auditorName: 'Adjusted',
        });
      }
    } else if (targetCount < current) {
      const sqliteDb = db.getDb();
      const toDelete = current - targetCount;
      const scanIdsToDelete = barcodeScans.slice(0, toDelete).map(s => `'${s.id}'`).join(',');
      if (scanIdsToDelete) {
        sqliteDb.exec(`DELETE FROM audit_scans WHERE id IN (${scanIdsToDelete});`);
      }
    }

    res.json({ success: true, count: targetCount });
  });

  // 7. Reset audit for store
  app.post('/api/audit/reset', (req, res) => {
    const stores = db.getAllStores();
    const { storeId = (stores[0]?.id || 'birmas-sudirman') } = req.body;
    db.clearScansByStore(storeId);
    res.json({ success: true, message: `Physical count reset for ${storeId}` });
  });

  // 8. Finalize Audit
  app.post('/api/audit/finalize', (req, res) => {
    const audit = req.body;
    if (!audit.storeId) return res.status(400).json({ error: 'Store ID required' });

    const auditRecord = {
      id: audit.id || `audit-${Date.now()}`,
      storeId: audit.storeId,
      storeName: audit.storeName || 'Birmas Store',
      auditorName: audit.auditorName || 'Auditor',
      timestamp: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      totalItems: audit.totalScanned || 0,
      varianceCount: audit.missingCount || 0,
      accuracy: audit.accuracy || 100,
      records: audit.items || [],
    };

    db.saveAuditHistoryRecord(auditRecord);

    // Update stock in SQLite if pushed
    if (audit.pushedToWordPress && audit.items) {
      const allProducts = db.getAllProducts();
      audit.items.forEach((item) => {
        const prod = allProducts.find((p) => p.barcode === item.barcode);
        if (prod) {
          db.setProductStock(audit.storeId, prod.id, item.scannedCount);
        }
      });
    }

    // Clear active scans for this store
    db.clearScansByStore(audit.storeId);

    res.json({
      success: true,
      message: 'Audit signed off and persisted in SQLite history',
      audit: auditRecord,
    });
  });

  // 9. Audit History
  app.get('/api/audit/history', (req, res) => {
    res.json(db.getAllAuditHistory());
  });

  app.delete('/api/audit/history', (req, res) => {
    const sqliteDb = db.getDb();
    sqliteDb.exec('DELETE FROM audit_history;');
    res.json({ success: true, message: 'Audit history cleared in SQLite' });
  });

  // 10. WordPress / ESB Config
  app.get('/api/wordpress/config', (req, res) => {
    res.json(db.getWpConfig());
  });

  app.post('/api/wordpress/config', (req, res) => {
    if (req.body.wpUrl) db.setConfig('wp_url', req.body.wpUrl);
    if (req.body.customEndpointPath) db.setConfig('custom_endpoint_path', req.body.customEndpointPath);
    if (req.body.selectedStoreId) db.setConfig('selected_store_id', req.body.selectedStoreId);
    res.json({ success: true, config: db.getWpConfig() });
  });

  // 11. Sync data (ESB POS Exclusive)
  app.post('/api/wordpress/sync', async (req, res) => {
    try {
      const result = await runDirectESBSync();
      res.json({
        success: true,
        message: 'Synchronized live catalog from ESB POS',
        data: db.getAllProducts(),
        ...result,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 12. Cleanup legacy WordPress duplicates
  app.post('/api/esb/cleanup-duplicates', (req, res) => {
    try {
      const result = db.cleanupLegacyWordPressData();
      res.json({ success: true, message: 'Cleaned up duplicate WordPress data from database', ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13. Direct ESB Live Sync (POS Menu)
  app.post('/api/esb/sync-direct', async (req, res) => {
    try {
      const result = await runDirectESBSync();
      res.json({
        success: true,
        message: 'Successfully synchronized directly with ESB POS',
        ...result,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13b. Direct My ESB ERP Inventory Stock Sync (Stock Period List)
  app.post('/api/esb/sync-erp', async (req, res) => {
    try {
      const result = await runDirectESBERPSync(req.body || {});
      res.json({
        success: true,
        message: `Successfully synchronized ${result.totalSyncedProducts || 0} real inventory items from My ESB ERP (Kuningan)`,
        ...result,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/esb/erp-config', (req, res) => {
    res.json({
      hasCustomCookie: !!db.getConfig('esb_erp_cookie'),
      lastSyncedAt: db.getConfig('last_esb_erp_synced_at') || null,
    });
  });

  app.post('/api/esb/erp-config', (req, res) => {
    let { cookie, csrf, rawCurl } = req.body;
    if (rawCurl) {
      // Auto-extract cookie from -b '...' or -H 'cookie: ...'
      const cookieMatch = rawCurl.match(/-b\s+['"]([^'"]+)['"]/i) || rawCurl.match(/-H\s+['"]cookie:\s*([^'"]+)['"]/i);
      if (cookieMatch) cookie = cookieMatch[1];
      // Auto-extract csrf token from -H 'x-csrf-token: ...'
      const csrfMatch = rawCurl.match(/x-csrf-token:\s*([^\s'"]+)/i);
      if (csrfMatch) csrf = csrfMatch[1];
    }
    if (cookie) db.setConfig('esb_erp_cookie', cookie);
    if (csrf) db.setConfig('esb_erp_csrf', csrf);
    res.json({
      success: true,
      message: 'Updated My ESB ERP session credentials',
      hasCookie: !!cookie,
      hasCsrf: !!csrf,
    });
  });

  // 13c. Birmas Central Server Sync (Permanent & No cURL needed)
  app.post('/api/birmas/sync', async (req, res) => {
    try {
      const result = await runBirmasServerSync(req.body || {});
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/birmas/config', (req, res) => {
    const token = db.getConfig('birmas_server_token') || '';
    const rawUrl = db.getConfig('wp_url') || process.env.BIRMAS_BACKEND_URL || 'http://10.0.0.10';
    const dbEndpoint = db.getConfig('birmas_server_endpoint');
    const envEndpoint = process.env.BIRMAS_ENDPOINT_PATH;
    
    // Determine effective endpoint
    let effectiveEndpoint = '';
    let isNoEndpoint = false;
    
    if (dbEndpoint === '' || dbEndpoint === 'none' || dbEndpoint === 'direct') {
      effectiveEndpoint = '';
      isNoEndpoint = true;
    } else if (dbEndpoint) {
      effectiveEndpoint = dbEndpoint;
    } else if (envEndpoint === '' || envEndpoint === 'none' || envEndpoint === 'direct') {
      effectiveEndpoint = '';
      isNoEndpoint = true;
    } else if (envEndpoint) {
      effectiveEndpoint = envEndpoint;
    } else {
      const lower = rawUrl.toLowerCase();
      if (lower.includes('/extv1/') || lower.includes('visit-purpose') || lower.includes('/wp-json/') || lower.includes('.php')) {
        effectiveEndpoint = '';
        isNoEndpoint = true;
      } else {
        effectiveEndpoint = '/wp-json/api/v1/product_stock';
      }
    }

    res.json({
      birmasServerUrl: rawUrl,
      birmasServerEndpoint: effectiveEndpoint,
      noEndpoint: isNoEndpoint,
      hasToken: !!(token || process.env.BIRMAS_API_TOKEN),
      lastSyncedAt: db.getConfig('last_birmas_server_synced_at') || null,
      visitPurposes: db.getVisitPurposes(),
      lastVisitPurposesSyncedAt: db.getConfig('last_visit_purposes_synced_at') || null,
    });
  });

  app.post('/api/birmas/config', (req, res) => {
    if (req.body.birmasServerUrl !== undefined) {
      db.setConfig('wp_url', req.body.birmasServerUrl.trim());
    }
    if (req.body.birmasServerToken !== undefined) {
      db.setConfig('birmas_server_token', req.body.birmasServerToken.trim());
    }
    if (req.body.noEndpoint === true) {
      db.setConfig('birmas_server_endpoint', 'none');
    } else if (req.body.birmasServerEndpoint !== undefined) {
      const val = req.body.birmasServerEndpoint.trim();
      db.setConfig('birmas_server_endpoint', val === '' ? 'none' : val);
    }
    
    const dbEndpoint = db.getConfig('birmas_server_endpoint');
    const isNoEp = dbEndpoint === 'none' || dbEndpoint === '';
    res.json({
      success: true,
      birmasServerUrl: db.getConfig('wp_url'),
      birmasServerEndpoint: isNoEp ? '' : dbEndpoint,
      noEndpoint: isNoEp,
      hasToken: !!db.getConfig('birmas_server_token'),
      lastSyncedAt: db.getConfig('last_birmas_server_synced_at'),
      visitPurposes: db.getVisitPurposes(),
    });
  });

  app.get('/api/esb/visit-purposes', (req, res) => {
    res.json({
      success: true,
      visitPurposes: db.getVisitPurposes(),
      lastSyncedAt: db.getConfig('last_visit_purposes_synced_at') || null,
    });
  });

  // 13d. Direct Push API: Send stock payload directly from Birmas Backend to this Audit Server
  app.post(['/api/stock/push', '/api/sync/push'], (req, res) => {
    try {
      const payload = req.body;
      const items = Array.isArray(payload) ? payload : (payload.items || payload.data || payload.products || []);
      if (!items || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Expected JSON array of product stock items' });
      }

      // Check optional token if configured
      const configuredToken = db.getConfig('birmas_server_token');
      if (configuredToken) {
        const auth = req.headers['authorization'] || '';
        const token = auth.replace(/^Bearer\s+/i, '').trim();
        if (token && token !== configuredToken.trim()) {
          return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Bearer Token' });
        }
      }

      const allStores = db.getAllStores();
      let importedCount = 0;

      for (const item of items) {
        const rawStore = item.store || item.storeName || item.store_name || item.branch || item.storeId || allStores[0]?.id;
        const storeId = db.resolveStoreIdForStock(rawStore);
        const prodName = String(item.productName || item.product_name || item.productTitle || item.name || item.varian || '').trim();
        if (!prodName) continue;

        const barcode = (item.barcode && String(item.barcode).trim()) || null;
        const stockQty = Math.round(Number(item.stockQty ?? item.stock_qty ?? item.stock ?? item.qty ?? 0) || 0);
        const category = item.category || 'Craft Beer';
        const unit = item.unit || item.defaultUnit || 'Can';

        const slug = prodName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const productId = item.id || `prod-${slug}`;

        db.saveProduct({
          id: productId,
          barcode: barcode,
          sku: item.sku || `SKU-${slug.slice(0, 8).toUpperCase()}`,
          brand: item.brand || db.deriveProductBrand(prodName),
          varian: prodName,
          productTitle: prodName,
          category: category,
          subCategory: item.brand || db.deriveProductBrand(prodName),
          defaultUnit: unit,
          packageType: unit.toLowerCase().includes('botol') ? 'Botol' : 'Kaleng',
          volume: item.volume || 330,
          unitVolume: item.unitVolume || 'ml',
          price: item.price || 0,
          wpStatus: 'publish',
          lastUpdated: new Date().toISOString(),
        });

        db.setProductStock(storeId, productId, stockQty);
        importedCount++;
      }

      db.setConfig('last_birmas_server_synced_at', new Date().toISOString());

      res.json({
        success: true,
        message: `Successfully received and imported ${importedCount} items into audit database!`,
        importedCount,
        stores: allStores.map(s => s.name),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 14. Instant Webhook from ESB / WordPress
  app.post('/api/esb/webhook', (req, res) => {
    const { location, variant_title, stock } = req.body;
    console.log('[ESB Webhook Received]:', req.body);

    if (variant_title) {
      const stores = db.getAllStores();
      const locKey = (location || '').toLowerCase();
      const targetStore = stores.find((s) => s.id === locKey || s.locationCode?.toLowerCase() === locKey || s.name.toLowerCase().includes(locKey));
      const storeId = targetStore ? targetStore.id : (stores[0]?.id || 'birmas-sudirman');

      const products = db.getAllProducts();
      const existing = products.find((p) => p.varian?.toLowerCase() === variant_title.toLowerCase() || p.productTitle === variant_title);
      if (existing) {
        db.setProductStock(storeId, existing.id, Number(stock) || 0);
      }
    }

    res.json({ success: true, receivedAt: new Date().toISOString() });
  });

  // 15. Push Endpoints: Birmas Server sends ESB sales and stock data directly to this dashboard
  app.post('/api/sales/push', (req, res) => {
    try {
      const body = req.body;
      const rawList = Array.isArray(body) ? body : (body.transactions || body.items || body.data || []);
      if (!Array.isArray(rawList) || rawList.length === 0) {
        return res.status(400).json({ success: false, message: 'No transactions found in request body' });
      }

      const fileId = body.fileId || `sfile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const filename = body.filename || `Sales_Recap_${new Date().toISOString().slice(0, 10)}.csv`;
      const chunkSize = Number(body.chunkSize) || 1500;
      const sourceRowOffset = Number(body.sourceRowOffset ?? (Number(body.chunkIndex) || 0) * chunkSize);
      const result = salesDb.insertSalesRows(salesDb.getSalesDb(), {
        fileId,
        filename,
        fileSize: body.fileSize || '',
        uploadedBy: body.uploadedBy || 'Admin',
        sourceRowOffset,
        rows: rawList,
      });

      res.json({
        success: true,
        message: result.duplicate_count > 0
          ? `Saved ${rawList.length - result.duplicate_count} new sales record(s); skipped ${result.duplicate_count} row(s) already in the database.`
          : `Successfully received and saved ${rawList.length} sales records.`,
        count: rawList.length,
        rowCount: result.row_count,
        duplicateCount: result.duplicate_count,
        fileId,
        receivedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Sales Push Error]:', err);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Sales import metadata and clean-data CSV downloads
  app.get('/api/sales/files', (req, res) => {
    try {
      const files = salesDb.getSalesFiles();
      res.json({ success: true, files });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/sales/files/:id/download', (req, res) => {
    try {
      const file = salesDb.getSalesFileCsv(req.params.id);
      if (!file) {
        return res.status(404).send('Sales file not found');
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.content);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.delete('/api/sales/files/:id', (req, res) => {
    try {
      const result = salesDb.deleteSalesFile(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


  // ==========================================
  // Stock Audit CSV Upload & Management Endpoints
  // ==========================================

  app.get('/api/stock-csv/history', (req, res) => {
    try {
      const files = db.getStockFilesList();
      res.json({ success: true, files });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/stock-csv/active', (req, res) => {
    try {
      const file = db.getActiveStockFile();
      res.json({ success: true, file: file || null });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock-csv/upload', (req, res) => {
    try {
      const {
        filename,
        fileSize,
        uploadedBy,
        metadata = {},
        rows = [],
        fileContent = '',
      } = req.body;

      if (!filename) {
        return res.status(400).json({
          success: false,
          code: 'FILE_NAME_REQUIRED',
          error: 'Filename is required.',
        });
      }

      if (!filename.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_FILE_TYPE',
          error: 'File must be a CSV file (.csv).',
        });
      }

      if (!rows || rows.length === 0) {
        return res.status(400).json({
          success: false,
          code: 'NO_DATA_ROWS',
          error: 'No valid product stock records found in the uploaded CSV table.',
        });
      }

      const inferredStores = Array.from(new Set(rows.map(r => r.storeName).filter(Boolean))).join(', ');
      const downloadedAt = metadata.downloadedAtEsb || metadata.cell4B || new Date().toLocaleString('id-ID');
      const stockDate = metadata.stockDate || metadata.cell5B || new Date().toLocaleDateString('id-ID');
      const activeStores = metadata.activeStores || metadata.cell6B || inferredStores || 'All Active Stores';

      const fileInfo = {
        filename,
        file_size: fileSize || '0 KB',
        uploaded_by: uploadedBy || 'Auditor',
        downloaded_at_esb: downloadedAt,
        stock_date: stockDate,
        active_stores: activeStores,
        file_content: fileContent,
      };

      const result = db.saveStockFileRecord(fileInfo, rows);
      if (!result.success) {
        return res.status(500).json(result);
      }

      res.json({
        success: true,
        message: `Successfully uploaded ${filename} and applied ${rows.length} product stock records to comparison table.`,
        fileId: result.fileId,
        activeStores: fileInfo.active_stores,
        stockDate: fileInfo.stock_date,
        downloadedAtEsb: fileInfo.downloaded_at_esb,
        rowCount: rows.length,
      });
    } catch (err) {
      console.error('[Upload Stock CSV Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock-csv/revert/:id', (req, res) => {
    try {
      const result = db.revertStockFileRecord(req.params.id);
      if (!result.success) {
        return res.status(404).json(result);
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/stock-csv/:id', (req, res) => {
    try {
      const result = db.deleteStockFileRecord(req.params.id);
      if (!result.success) {
        return res.status(404).json(result);
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/stock-csv/template', (req, res) => {
    try {
      const templatePath = path.join(process.cwd(), 'public', 'templates', 'stock_period_list_sample.csv');
      if (fs.existsSync(templatePath)) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="stock_period_list_template.csv"');
        return fs.createReadStream(templatePath).pipe(res);
      }
      res.status(404).send('Template not found');
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  // ==========================================
  // Stock Period CSV Upload & History (strict ESB template: product name + stock qty only)
  // ==========================================

  app.post('/api/stock-period-csv/preview', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No CSV file was uploaded.' });
      }
      const text = req.file.buffer.toString('utf8');
      const parsed = stockPeriodCsv.parseStockPeriodCsvDetails(text);
      res.json({
        success: true,
        filename: req.file.originalname,
        recordCount: parsed.records.length,
        generatedAt: parsed.generatedAt,
        stockDate: parsed.stockDate,
        stores: parsed.stores,
        records: parsed.records,
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.post('/api/stock-period-csv/uploads', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No CSV file was uploaded.' });
      }
      const csvContent = req.file.buffer.toString('utf8');
      const parsed = stockPeriodCsv.parseStockPeriodCsvDetails(csvContent);
      const uploadedBy = req.body.uploadedBy || 'Auditor';
      const saved = stockPeriodCsvStore.saveStockPeriodCsv(db.getDb(), {
        filename: req.file.originalname,
        uploadedBy,
        recordCount: parsed.records.length,
        generatedAt: parsed.generatedAt,
        stockDate: parsed.stockDate,
        stores: parsed.stores,
        records: parsed.records,
        csvContent,
      });
      res.json({ success: true, upload: saved });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  app.get('/api/stock-period-csv/uploads', (req, res) => {
    try {
      const uploads = stockPeriodCsvStore.listStockPeriodCsvUploads(db.getDb());
      res.json({ success: true, uploads });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/stock-period-csv/uploads/latest', (req, res) => {
    try {
      const upload = stockPeriodCsvStore.getLatestStockPeriodCsvUpload(db.getDb());
      res.json({ success: true, upload: upload || null });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/stock-period-csv/uploads/:id/download', (req, res) => {
    try {
      const file = stockPeriodCsvStore.getStockPeriodCsvDownload(db.getDb(), req.params.id);
      if (!file) {
        return res.status(404).json({ success: false, error: 'Stock period CSV upload not found.' });
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.csvContent);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/stock-period-csv/uploads/:id', (req, res) => {
    try {
      const upload = stockPeriodCsvStore.getStockPeriodCsvUploadData(db.getDb(), req.params.id);
      if (!upload) {
        return res.status(404).json({ success: false, error: 'Stock period CSV upload not found.' });
      }
      res.json({ success: true, upload });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/stock-period-csv/uploads/:id', (req, res) => {
    try {
      const deleted = stockPeriodCsvStore.deleteStockPeriodCsvUpload(db.getDb(), req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Stock period CSV upload not found.' });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Audit Session Lock & Approval Endpoints (Superadmin approval required to unlock)
  app.get('/api/audit/session/:storeId/lock', (req, res) => {
    try {
      const state = db.getSessionLockState(req.params.storeId);
      res.json({ success: true, ...state });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/audit/session/:storeId/lock', (req, res) => {
    try {
      const user = req.body?.user || 'Auditor';
      const result = db.setSessionLockState(req.params.storeId, true, user);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/audit/session/:storeId/unlock', (req, res) => {
    try {
      const role = req.body?.role || '';
      const user = req.body?.user || 'Super Admin';
      if (role !== 'superadmin') {
        return res.status(403).json({ success: false, error: 'Only Superadmin can approve unlocking an audit session.' });
      }
      const result = db.setSessionLockState(req.params.storeId, false, user);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Store Audit API Endpoints
  app.get('/api/categories', (req, res) => {
    try {
      const cats = storeAuditService.getCctvCategories();
      res.json(cats);
    } catch (err) {
      res.status(500).json([]);
    }
  });

  app.get('/api/criteria', (req, res) => {
    try {
      const crit = storeAuditService.getCctvCriteria(req.query);
      res.json(crit);
    } catch (err) {
      res.status(500).json([]);
    }
  });

  app.get('/api/category/:category/monthly', (req, res) => {
    try {
      const data = storeAuditService.getCategoryMonthly(req.params.category, req.query);
      res.json(data);
    } catch (err) {
      res.status(500).json({ labels: [], datasets: [] });
    }
  });

  app.get('/api/category/:category/criterion/:criterion/monthly', (req, res) => {
    try {
      const data = storeAuditService.getCategoryCriterionMonthly(req.params.category, req.params.criterion, req.query);
      res.json(data);
    } catch (err) {
      res.status(500).json({ labels: [], datasets: [] });
    }
  });

  app.get('/api/category/:category/passrate', (req, res) => {
    try {
      const data = storeAuditService.getCategoryPassrate(req.params.category, req.query);
      res.json(data);
    } catch (err) {
      res.status(500).json({ labels: [], datasets: [] });
    }
  });

  app.get('/api/store/:storeId/passrate', (req, res) => {
    try {
      const data = storeAuditService.getStorePassrate(req.params.storeId, req.query);
      res.json(data);
    } catch (err) {
      res.status(500).json({ labels: [], datasets: [] });
    }
  });

  app.get('/api/stores/:storeId/passrate', (req, res) => {
    try {
      const data = storeAuditService.getStorePassrate(req.params.storeId, req.query);
      res.json(data);
    } catch (err) {
      res.status(500).json({ labels: [], datasets: [] });
    }
  });

  app.get('/api/passing-grades', (req, res) => {
    try {
      const grades = storeAuditService.getPassingGrades(req.query);
      res.json(grades);
    } catch (err) {
      res.status(500).json({});
    }
  });

  app.get('/api/drilldown', (req, res) => {
    try {
      const data = storeAuditService.getCctvDrilldown(req.query);
      res.json(data);
    } catch (err) {
      res.status(500).json({ infractions: [] });
    }
  });

  app.get('/api/months', (req, res) => {
    res.json([
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ]);
  });

  // Upload and process store audit CSV
  app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
      const { store, year, month, confirm } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          status: 'error',
          errorType: 'EMPTY_FILE',
          message: 'No CSV file was uploaded. Please choose a valid audit CSV file.',
        });
      }

      const fileName = file.originalname || 'audit.csv';
      if (!fileName.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({
          status: 'error',
          errorType: 'INVALID_FILE_TYPE',
          message: 'Invalid file format. Strictly .csv files are supported.',
        });
      }

      // Strictly limit allowed upload outlets to Sudirman, Kuningan, Kwitang
      const allowedStores = ['sudirman', 'kuningan', 'kwitang'];
      const rawStore = String(store || '').trim();
      const cleanInputStore = rawStore.toLowerCase().replace(/^birmas\s+/i, '').trim();

      if (!cleanInputStore || !allowedStores.includes(cleanInputStore)) {
        return res.status(400).json({
          status: 'error',
          errorType: 'UNSUPPORTED_OUTLET',
          message: 'Birmas Outlet is limited to only Sudirman, Kuningan, and Kwitang. Please choose one of these outlets.',
        });
      }

      // Canonical name for the store
      const canonicalStoreMap = {
        sudirman: 'Birmas Sudirman',
        kuningan: 'Birmas Kuningan',
        kwitang: 'Birmas Kwitang',
      };
      const storeName = canonicalStoreMap[cleanInputStore] || rawStore;
      let yr = year;
      let mo = month;

      if (!yr || !mo) {
        return res.status(400).json({
          status: 'error',
          errorType: 'MISSING_FIELDS',
          message: 'Please select store, audit year, and audit month before uploading.',
        });
      }

      // Extract outlet and month from uploaded CSV file (filename + first rows)
      const lowerName = fileName.toLowerCase();
      const fileTextSample = file.buffer ? file.buffer.toString('utf-8').slice(0, 4096).toLowerCase() : '';

      const outletKeywords = [
        { key: 'sudirman', name: 'Sudirman', official: 'Birmas Sudirman' },
        { key: 'kuningan', name: 'Kuningan', official: 'Birmas Kuningan' },
        { key: 'kwitang', name: 'Kwitang', official: 'Birmas Kwitang' },
        { key: 'kelapa gading', name: 'Kelapa Gading', official: 'Birmas Kelapa Gading' },
        { key: 'gading', name: 'Kelapa Gading', official: 'Birmas Kelapa Gading' },
        { key: 'lebak bulus', name: 'Lebak Bulus', official: 'Birmas Lebak Bulus' },
        { key: 'bulus', name: 'Lebak Bulus', official: 'Birmas Lebak Bulus' },
        { key: 'tebet', name: 'Tebet', official: 'Birmas Tebet' },
        { key: 'nomadic', name: 'Nomadic', official: 'Birmas Nomadic (Bandung)' },
        { key: 'bandung', name: 'Nomadic', official: 'Birmas Nomadic (Bandung)' },
        { key: 'nusa dua', name: 'Nusa Dua', official: 'Birmas Nusa Dua (Bali)' },
        { key: 'nusadua', name: 'Nusa Dua', official: 'Birmas Nusa Dua (Bali)' },
        { key: 'bali', name: 'Nusa Dua', official: 'Birmas Nusa Dua (Bali)' },
      ];

      let detectedFileOutlet = null;
      for (const o of outletKeywords) {
        if (lowerName.includes(o.key)) {
          detectedFileOutlet = o;
          break;
        }
      }
      if (!detectedFileOutlet) {
        for (const o of outletKeywords) {
          if (fileTextSample.includes(o.key)) {
            detectedFileOutlet = o;
            break;
          }
        }
      }

      const monthMap = {
        januari: 'Januari', january: 'Januari', jan: 'Januari',
        februari: 'Februari', february: 'Februari', feb: 'Februari',
        maret: 'Maret', march: 'Maret', mar: 'Maret',
        april: 'April', apr: 'April',
        mei: 'Mei', may: 'Mei',
        juni: 'Juni', june: 'Juni', jun: 'Juni',
        juli: 'Juli', july: 'Juli', jul: 'Juli',
        agustus: 'Agustus', august: 'Agustus', agu: 'Agustus', agt: 'Agustus', aug: 'Agustus',
        september: 'September', sep: 'September', sept: 'September',
        oktober: 'Oktober', october: 'Oktober', okt: 'Oktober', oct: 'Oktober',
        november: 'November', nov: 'November',
        desember: 'Desember', december: 'Desember', des: 'Desember', dec: 'Desember',
      };

      let detectedFileMonth = null;
      for (const [k, canonical] of Object.entries(monthMap)) {
        const regex = new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`, 'i');
        if (regex.test(lowerName)) {
          detectedFileMonth = canonical;
          break;
        }
      }
      if (!detectedFileMonth) {
        for (const [k, canonical] of Object.entries(monthMap)) {
          const regex = new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`, 'i');
          if (regex.test(fileTextSample)) {
            detectedFileMonth = canonical;
            break;
          }
        }
      }

      // Check if file belongs to an unsupported outlet
      if (detectedFileOutlet && !allowedStores.includes(detectedFileOutlet.key)) {
        return res.status(400).json({
          status: 'error',
          errorType: 'UNSUPPORTED_OUTLET',
          message: `The uploaded CSV file ("${fileName}") is for ${detectedFileOutlet.name}. Only Sudirman, Kuningan, and Kwitang outlets are supported.`,
        });
      }

      // Validate that file outlet and month match the user input
      const fileStoreKey = detectedFileOutlet ? detectedFileOutlet.key : null;
      const storeMismatch = fileStoreKey && cleanInputStore && (fileStoreKey !== cleanInputStore);

      const userMonthClean = String(mo || '').toLowerCase().trim();
      const fileMonthClean = detectedFileMonth ? detectedFileMonth.toLowerCase().trim() : null;
      const monthMismatch = fileMonthClean && userMonthClean && (fileMonthClean !== userMonthClean);

      if (storeMismatch && monthMismatch) {
        return res.status(400).json({
          status: 'error',
          errorType: 'MISMATCH_INPUT',
          message: `CSV file does not match selected outlet and month: The file ("${fileName}") is for ${detectedFileOutlet.name} (${detectedFileMonth}), but you selected ${storeName} (${mo}).`,
        });
      }

      if (storeMismatch) {
        return res.status(400).json({
          status: 'error',
          errorType: 'OUTLET_MISMATCH',
          message: `CSV file does not match selected outlet: The file ("${fileName}") is for ${detectedFileOutlet.name}, but you selected ${storeName}. Please select Birmas ${detectedFileOutlet.name} or upload the matching file.`,
        });
      }

      if (monthMismatch) {
        return res.status(400).json({
          status: 'error',
          errorType: 'MONTH_MISMATCH',
          message: `CSV file does not match selected month: The file ("${fileName}") is for ${detectedFileMonth}, but you selected ${mo}. Please select ${detectedFileMonth} or upload the matching file.`,
        });
      }

      const result = storeAuditService.processAuditUpload({
        storeName: storeName,
        year: parseInt(yr, 10),
        month: mo,
        fileName: fileName,
        fileBuffer: file.buffer,
        confirm: confirm === '1' || confirm === true,
      });

      if (!result.success && result.errorType) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (err) {
      console.error('/api/upload error:', err);
      res.status(500).json({
        status: 'error',
        message: err.message || 'Failed to process audit upload.',
      });
    }
  });

  app.get('/api/uploaded-files', (req, res) => {
    try {
      const files = storeAuditService.getCctvUploadedFiles();
      res.json(files);
    } catch (err) {
      console.error('/api/uploaded-files error:', err);
      res.status(500).json([]);
    }
  });

  app.get('/api/download-audit-file', (req, res) => {
    try {
      const auditId = req.query.audit_id ? parseInt(req.query.audit_id, 10) : null;
      if (!auditId) {
        return res.status(400).send('audit_id is required');
      }

      const files = storeAuditService.getCctvUploadedFiles();
      const match = files.find((f) => f.audit_id === auditId);

      const indonesianMonths = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];

      if (match) {
        const monthName = indonesianMonths[(match.month || 1) - 1] || 'Januari';
        const possiblePaths = [
          path.join(__dirname, 'audit_birmas', match.store_name || '', String(match.year), monthName, match.file_name),
          path.join(__dirname, 'audit_birmas', match.store_name || '', match.file_name),
          path.join(__dirname, 'audit_birmas', match.file_name),
        ];

        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            return res.download(p, match.file_name || `Audit_${match.store_name}_${match.year}_${monthName}.csv`);
          }
        }
      }

      // If physical file is not on disk, generate CSV from SQLite scores
      const cctvDb = storeAuditService.getCctvDb();
      if (!cctvDb) {
        return res.status(404).send('Audit database not found');
      }

      const rows = cctvDb.prepare(`
        SELECT c.name AS criteria_name, c.category, c.passing_grade, sc.score
        FROM scores sc
        JOIN criteria c ON sc.criteria_id = c.criteria_id
        WHERE sc.audit_id = ?
        ORDER BY c.category, c.name
      `).all(auditId);

      if (!rows || rows.length === 0) {
        return res.status(404).send('No scores found for this audit ID');
      }

      let csvContent = 'Criteria,Category,Passing Grade,Score,Status\n';
      for (const r of rows) {
        const status = r.score >= r.passing_grade ? 'PASS' : 'FAIL';
        const cleanCrit = `"${(r.criteria_name || '').replace(/"/g, '""')}"`;
        const cleanCat = `"${(r.category || '').replace(/"/g, '""')}"`;
        csvContent += `${cleanCrit},${cleanCat},${r.passing_grade || ''},${r.score || ''},${status}\n`;
      }

      const dlFilename = match?.file_name || `Audit_Export_${auditId}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${dlFilename}"`);
      return res.send(csvContent);
    } catch (err) {
      console.error('/api/download-audit-file error:', err);
      res.status(500).send('Failed to generate audit download file');
    }
  });

  app.post('/api/stock/push', (req, res) => {
    try {
      const body = req.body;
      const rawList = Array.isArray(body) ? body : (body.stocks || body.items || body.products || []);

      if (!Array.isArray(rawList) || rawList.length === 0) {
        return res.status(400).json({ success: false, message: 'No stock items found in request body' });
      }

      console.log(`[Stock Push] Received ${rawList.length} stock items from Birmas server!`);

      let updatedCount = 0;
      for (const item of rawList) {
        const storeId = extractMatchedStoreId(item);
        if (!storeId) continue;

        if (item.product_id && item.stock !== undefined) {
          db.setProductStock(storeId, item.product_id, Number(item.stock) || 0);
          updatedCount++;
        } else if (item.product_variant || item.esb_menu_id || item.id) {
          const pv = item.product_variant?.[0];
          const esbId = item.esb_menu_id || item.id;
          const prodId = `erp-${esbId}`;
          const stockQty = parseFloat(item.stock) || 0;

          db.setProductStock(storeId, prodId, stockQty);
          updatedCount++;
        }
      }

      db.setConfig('last_stock_pushed_at', new Date().toISOString());

      res.json({
        success: true,
        message: `Successfully received and updated ${updatedCount} stock items!`,
        count: updatedCount,
        receivedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Stock Push Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13. Auth endpoints
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const cleanUser = username.trim().toLowerCase();
    const user = db.getUserByUsername(cleanUser);

    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const safeUser = { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role };
    res.json({ success: true, message: `Welcome back, ${user.name}`, user: safeUser });
  });

  // 14. Sales Report Endpoints (ESB report-sales-recapitulation-detail)
  app.get('/api/sales/stores', (req, res) => {
    try {
      res.json({ success: true, stores: salesDb.getSalesStores() });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/sales/report', (req, res) => {
    try {
      const filters = {
        storeId: req.query.storeId,
        storeIds: req.query.storeIds,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        search: req.query.search,
        importId: req.query.importId,
        limit: req.query.limit,
        offset: req.query.offset,
      };
      res.json({ success: true, ...salesDb.getSalesReport(filters) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/sales/summary', (req, res) => {
    try {
      const filters = {
        storeId: req.query.storeId,
        storeIds: req.query.storeIds,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        importId: req.query.importId,
      };
      const summary = salesDb.getSalesSummary(filters);
      res.json({ success: true, summary });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/sales/time-series', (req, res) => {
    try {
      const filters = {
        storeId: req.query.storeId,
        storeIds: req.query.storeIds,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        importId: req.query.importId,
      };
      res.json({ success: true, timeSeries: salesDb.getSalesTimeSeries(filters) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/sales/clear', (req, res) => {
    try {
      const result = salesDb.clearSalesData();
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/sales/sync-status', (req, res) => {
    res.json({ success: true, ...salesSyncStatus, intervalSeconds: SALES_SYNC_INTERVAL_MS / 1000, endpoint: getSalesSyncEndpoint() });
  });

  app.post('/api/sales/sync-birmas', async (req, res) => {
    const result = await runSalesSync();
    res.json({ success: result.ok, message: result.message, count: result.count || 0, status: salesSyncStatus });
  });

  // 15. Database health & system status
  app.get('/api/database/status', (req, res) => {
    const dbPath = path.join(__dirname, 'data', 'birmas_audit.sqlite');
    const stats = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;
    const stores = db.getAllStores();
    const products = db.getAllProducts();
    const history = db.getAllAuditHistory();

    res.json({
      status: 'healthy',
      engine: 'SQLite (Relational Tables)',
      dbFile: dbPath,
      fileSizeKB: stats ? Math.round(stats.size / 1024) : 0,
      totalProducts: products.length,
      totalStores: stores.length,
      totalAuditsArchived: history.length,
      lastSaved: new Date().toISOString(),
      autoSyncEnabled: true,
      autoSyncIntervalSeconds: 30,
    });
  });

  // Handle any unmatched API routes with JSON 404, never letting it fall through to HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Vite Dev Middlewares or Production Static Serving
  const isProduction = process.env.NODE_ENV === 'production';
  const distHtmlPath = path.join(__dirname, 'dist', 'index.html');
  const hasDist = fs.existsSync(distHtmlPath);

  if (isProduction || (hasDist && process.env.NODE_ENV !== 'development')) {
    console.log('[Server] Serving production assets from ./dist');
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(distHtmlPath);
    });
  } else {
    console.log('[Server] Starting Vite development middleware');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        if (vite && vite.ssrFixStacktrace) {
          vite.ssrFixStacktrace(e);
        }
        next(e);
      }
    });
  }

  // Express global error catching middleware
  app.use((err, req, res, next) => {
    console.error('[API Express Error]:', err.message);
    if (!res.headersSent) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    runSalesSync();
    setInterval(runSalesSync, SALES_SYNC_INTERVAL_MS);
    console.log(`[Birmas Server] SQLite Tables Ready at http://localhost:${PORT}`);

    // Combined automatic sync routine:
    // 1. Primary: Pull from Birmas Central Server (https://admin.birmas.id) - Permanent & No cURL needed!
    // 2. Secondary fallback: My ESB ERP session if configured
    async function executePeriodicSync() {
      console.log('[Auto-Sync] Running scheduled 15-minute background inventory sync...');
      try {
        const birmasRes = await runBirmasServerSync();
        if (birmasRes.success && birmasRes.totalSyncedProducts > 0) {
          console.log(`[Auto-Sync] Successfully synchronized ${birmasRes.totalSyncedProducts} items from Birmas Central Server!`);
          return;
        }
      } catch (e) {
        console.warn('[Auto-Sync] Birmas Central Server sync notice:', e.message);
      }

      // Only attempt direct ESB ERP scrape if a custom session was actively saved by the user
      const customErpCookie = db.getConfig('esb_erp_cookie');
      if (customErpCookie) {
        try {
          console.log('[Auto-Sync] Executing configured ESB ERP session sync...');
          await runDirectESBERPSync({ storeId: 'all' });
        } catch (e) {
          console.warn('[Auto-Sync] ESB ERP notice:', e.message);
        }
      } else {
        console.log('[Auto-Sync] Local SQLite catalog and store stock records are up to date.');
      }
    }

    setTimeout(() => {
      executePeriodicSync();
    }, 3000);

    const intervalMins = parseInt(process.env.BIRMAS_SYNC_INTERVAL_MINUTES || '15', 10) || 15;
    const SYNC_INTERVAL_MS = intervalMins * 60 * 1000;
    setInterval(() => {
      executePeriodicSync();
    }, SYNC_INTERVAL_MS);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[CRITICAL] Port ${PORT} is already in use by another application!`);
      console.error(`Please ensure you launch with: PORT=3005 node server.js`);
    } else {
      console.error('[Server Error]:', err);
    }
  });
}

if (process.argv.includes('--sync-esb')) {
  console.log('[CLI] Connecting directly to ESB Production (core-api.esb.co.id)...');
  runDirectESBSync().then((res) => {
    const stores = db.getAllStores();
    const products = db.getAllProducts();
    console.log(`[CLI] Direct ESB Sync complete! Total products in SQLite: ${products.length}, Stores: ${stores.length}, Stock entries: ${res.totalStockEntries}`);
    process.exit(0);
  }).catch((err) => {
    console.error('[CLI] Direct ESB Sync failed:', err);
    process.exit(1);
  });
} else if (process.argv.includes('--sync')) {
  console.log('[CLI] Connecting directly to ESB to sync products into SQLite tables...');
  runDirectESBSync().then(() => {
    const stores = db.getAllStores();
    const products = db.getAllProducts();
    console.log(`[CLI] ESB Sync finished! Total products in SQLite: ${products.length}, Stores in SQLite: ${stores.length}`);
    process.exit(0);
  }).catch((err) => {
    console.error('[CLI] Sync failed:', err);
    process.exit(1);
  });
} else {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
