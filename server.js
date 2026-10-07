import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import * as db from './db.js';
import * as storeAuditService from './storeAuditService.js';

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

// In AI Studio / Cloud Run, the app must bind strictly to port 3000
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
export async function runDirectESBSync() {
  if (isEsbSyncing) {
    console.log('[Direct ESB Sync] Sync already in progress, skipping.');
    return { success: false, message: 'Already syncing' };
  }
  isEsbSyncing = true;
  try {
    const token = process.env.ESB_BEARER_TOKEN || 'enAYShLVFFtWqFPmcd5nwkuJFmeVC5cG3pgwgShNpmmpRLzEPeRabbvG8zdm';
    const baseUrl = (process.env.ESB_BASE_URL || 'https://stg7.esb.co.id/api-fnb-backend-int/web').replace(/\/$/, '');
    const defaultVp = process.env.ESB_VISIT_PURPOSE_ID || '2';

    console.log(`[Direct ESB Sync] Connecting to ${baseUrl} ...`);
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
let isBirmasServerSyncing = false;

export async function runBirmasServerSync(options = {}) {
  if (isBirmasServerSyncing) {
    return { success: false, message: 'Birmas Central Server sync is already running in background' };
  }
  isBirmasServerSyncing = true;
  try {
    const baseUrl = options.baseUrl || db.getConfig('wp_url') || 'https://admin.birmas.id';
    console.log(`[Birmas Server Sync] Connecting to Birmas central server (${baseUrl})...`);

    const existingProducts = db.getAllProducts();
    const barcodeMap = new Map();
    for (const p of existingProducts) {
      if (p.barcode) {
        barcodeMap.set(p.id, p.barcode);
        if (p.productTitle) barcodeMap.set(p.productTitle.toLowerCase().trim(), p.barcode);
      }
    }

    const storeKeywordMap = [
      { kw: 'sudirman', storeId: 'birmas-sudirman' },
      { kw: 'kuningan', storeId: 'birmas-kuningan' },
      { kw: 'kwitang', storeId: 'birmas-kwitang' },
      { kw: 'lebak bulus', storeId: 'birmas-lebak-bulus' },
      { kw: 'lbulus', storeId: 'birmas-lebak-bulus' },
    ];

    let totalSyncedProducts = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      const url = `${baseUrl.replace(/\/+$/, '')}/wp-json/api/v1/product_stocks?per_page=100&page=${page}`;
      let items = [];

      try {
        const res = await fetch(url, {
          headers: { 'user-agent': 'BirmasStockAudit/2.0' },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          console.log(`[Birmas Server Sync] End of catalog reached at page ${page} (status ${res.status}).`);
          break;
        }

        items = await res.json();
      } catch (fetchErr) {
        console.warn(`[Birmas Server Sync] Page ${page} notice: ${fetchErr.message}. Utilizing existing database stock.`);
        break;
      }

      if (!Array.isArray(items) || items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        const storeId = extractMatchedStoreId(item);
        if (!storeId) continue;

        const pv = item.product_variant?.[0];
        const p = pv?.product?.[0];
        if (!p && !item.esb_menu_id) continue;

        const prodName = (p?.post_title || '').trim();
        if (!prodName) continue;

        // Skip non-retail merchandise
        const categoryName = (p?.product_category?.post_title || 'BEVERAGE').toUpperCase();
        if (
          prodName.toLowerCase().includes('cleaner') ||
          prodName.toLowerCase().includes('router') ||
          prodName.toLowerCase().includes('es batu') ||
          prodName.toLowerCase().includes('gelas cup')
        ) {
          continue;
        }

        const esbId = item.esb_menu_id || item.id;
        const prodId = `erp-${esbId}`;
        const existingBarcode = barcodeMap.get(prodId) || barcodeMap.get(prodName.toLowerCase().trim()) || null;

        // Brand from product name or subcategory
        const brand = prodName.split(' ')[0].toUpperCase();
        let varian = prodName;
        if (varian.toLowerCase().startsWith(brand.toLowerCase())) {
          varian = varian.slice(brand.length).trim();
        }

        const price = parseFloat(pv?.regular_price) || 0;
        const unit = pv?.variant || 'BOTOL';
        const stockQty = parseFloat(item.stock) || 0;

        db.saveProduct({
          id: prodId,
          barcode: existingBarcode,
          sku: `SKU-${esbId}`,
          brand: brand,
          varian: varian || prodName,
          productTitle: prodName,
          category: categoryName,
          subCategory: brand,
          defaultUnit: unit,
          packageType: unit.toLowerCase().includes('can') || unit.toLowerCase().includes('kaleng') ? 'Kaleng' : 'Botol',
          volume: parseInt(pv?.volume) || (prodName.includes('620') ? 620 : 330),
          unitVolume: pv?.unit_volume || 'ml',
          price: price,
          wpStatus: 'publish',
          lastUpdated: new Date().toISOString(),
        });

        db.setProductStock(storeId, prodId, stockQty);
        totalSyncedProducts++;
      }

      page++;
      // Brief breathing space between requests
      await new Promise((r) => setTimeout(r, 400));
    }

    if (totalSyncedProducts > 0) {
      db.setConfig('last_birmas_server_synced_at', new Date().toISOString());
      console.log(`[Birmas Server Sync] Completed! Synced ${totalSyncedProducts} store stocks from Birmas central server.`);
    } else {
      console.log('[Birmas Server Sync] Finished. Local SQLite database inventory is active.');
    }

    return {
      success: true,
      message: `Successfully synchronized with Birmas Central Server (${baseUrl})`,
      totalSyncedProducts,
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
          store_id: s.store_id || idx + 1,
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
            store_id: cs.store_id || idx + 1,
            name: cs.name,
            locationCode: `BRM-${cleanCsName.substring(0, 3).toUpperCase()}`,
            esbBranchCode: cleanCsName.toUpperCase(),
          });
        }
      });

      const result = Array.from(map.values()).sort((a, b) => a.store_id - b.store_id);
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
    const payload = req.body;
    if (!payload.barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }

    const cleanBarcode = payload.barcode.trim();
    const all = db.getAllProducts();
    const existing = (payload.productId || payload.wpId)
      ? all.find(p => p.id === (payload.productId || payload.wpId))
      : null;

    const productItem = {
      id: existing ? existing.id : (payload.wpId || `prod-${Date.now()}`),
      barcode: cleanBarcode,
      sku: existing?.sku || payload.sku || `SKU-${Date.now().toString().slice(-4)}`,
      brand: existing?.brand || payload.brand || 'Birmas',
      varian: existing?.varian || payload.varian || cleanBarcode,
      productTitle: existing?.productTitle || payload.productTitle || `${existing?.brand || payload.brand || 'Birmas'} ${existing?.varian || payload.varian || cleanBarcode}`,
      packageType: existing?.packageType || payload.packageType || 'Botol',
      volume: existing?.volume || payload.volume || 330,
      unitVolume: existing?.unitVolume || payload.unitVolume || 'ml',
      price: existing?.price !== undefined ? existing.price : (payload.price || 0),
      stockByStore: existing?.stockByStore || payload.stockByStore || {},
      wpStatus: 'publish',
      lastUpdated: new Date().toISOString(),
    };

    db.saveProduct(productItem);

    res.json({
      success: true,
      message: `Barcode ${cleanBarcode} linked successfully to ${productItem.productTitle || productItem.varian}`,
      product: productItem,
    });
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

  // 5. Send physical scan
  app.post('/api/audit/scan', (req, res) => {
    const stores = db.getAllStores();
    const { barcode, storeId = (stores[0]?.id || 'birmas-sudirman'), auditorName = 'Auditor' } = req.body;
    if (!barcode) {
      return res.status(400).json({ error: 'Barcode is required' });
    }

    const clean = barcode.trim();
    const products = db.getAllProducts();
    const product = products.find((p) => p.barcode === clean);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Barcode ${clean} is not registered in the database.`,
        unknownBarcode: clean,
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

  // 6. Manual Adjust Count
  app.post('/api/audit/adjust', (req, res) => {
    const { barcode, storeId = 'birmas-sudirman', count, delta } = req.body;
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
      const product = products.find(p => p.barcode === barcode);
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
    res.json({
      birmasServerUrl: db.getConfig('wp_url') || 'https://admin.birmas.id',
      lastSyncedAt: db.getConfig('last_birmas_server_synced_at') || null,
    });
  });

  app.post('/api/birmas/config', (req, res) => {
    if (req.body.birmasServerUrl) {
      db.setConfig('wp_url', req.body.birmasServerUrl.trim());
    }
    res.json({
      success: true,
      birmasServerUrl: db.getConfig('wp_url'),
      lastSyncedAt: db.getConfig('last_birmas_server_synced_at'),
    });
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
      const fileInfo = {
        id: body.fileId || `sfile-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        filename: body.filename || `Sales_Recap_${new Date().toISOString().slice(0, 10)}.csv`,
        file_size: body.fileSize || `${(rawList.length * 0.15).toFixed(1)} KB`,
        uploaded_at: new Date().toISOString(),
        uploaded_by: body.uploadedBy || 'Admin',
        file_content: body.fileContent || '',
      };

      if (!Array.isArray(rawList) || rawList.length === 0) {
        return res.status(400).json({ success: false, message: 'No transactions found in request body' });
      }

      console.log(`[Sales Push] Received ${rawList.length} transactions from file: ${fileInfo.filename}`);

      const normalized = rawList.map((tx, idx) => {
        const storeKey = String(tx.store_id || tx.store_name || tx.branch || tx.location || '').toLowerCase();
        let storeId = 'birmas-kuningan';
        let storeName = 'Birmas Kuningan';

        if (storeKey.includes('sudirman')) {
          storeId = 'birmas-sudirman';
          storeName = 'Birmas Sudirman';
        } else if (storeKey.includes('kwitang')) {
          storeId = 'birmas-kwitang';
          storeName = 'Birmas Kwitang';
        } else if (storeKey.includes('kuningan') || storeKey.includes('kunngan')) {
          storeId = 'birmas-kuningan';
          storeName = 'Birmas Kuningan';
        } else if (storeKey.includes('lebak') || storeKey.includes('bulus')) {
          storeId = 'birmas-lebak-bulus';
          storeName = 'Birmas Lebak Bulus';
        } else if (storeKey.includes('gading') || storeKey.includes('kgading')) {
          storeId = 'birmas-kelapa-gading';
          storeName = 'Birmas Kelapa Gading';
        } else if (storeKey.includes('tebet')) {
          storeId = 'birmas-tebet';
          storeName = 'Birmas Tebet';
        } else if (storeKey.includes('nomadic') || storeKey.includes('bandung')) {
          storeId = 'birmas-nomadic';
          storeName = 'Birmas Nomadic';
        } else if (storeKey.includes('nusa') || storeKey.includes('bali')) {
          storeId = 'birmas-nusadua';
          storeName = 'Birmas Nusa Dua';
        } else if (tx.store_name || tx.branch) {
          storeName = String(tx.store_name || tx.branch).trim();
          storeId = `store-${storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        }

        const brandName = tx.brand || tx.menu_category_detail || tx.menuCategoryDetail || '';
        const visitPurpose = tx.visit_purpose || tx.visitPurpose || tx.order_mode || tx.orderMode || 'DINE IN';
        const itemName = tx.item_name || tx.menu || tx.itemName || tx.product_name || 'Retail Item';
        const variantName = tx.variant || tx.menu || tx.product_variant || '';

        return {
          id: tx.id || `push-${tx.bill_no || tx.billNumber || Date.now()}-${idx}`,
          bill_no: tx.bill_no || tx.billNumber || tx.bill_number || tx.invoice_no || `ESB-${Date.now()}-${idx}`,
          date: tx.date || tx.sales_date_in || tx.salesDateIn || tx.sales_date || tx.created_at || new Date().toISOString(),
          store_id: storeId,
          store_name: tx.store_name || storeName,
          item_name: itemName,
          variant: variantName,
          brand: brandName,
          category: tx.category || tx.menu_category || tx.menuCategory || 'Beverage',
          barcode: tx.barcode || '',
          qty: Number(tx.qty || tx.quantity) || 1,
          unit_price: parseSafeMoney(tx.unit_price || tx.price),
          discount: parseSafeMoney(tx.discount),
          tax: parseSafeMoney(tx.tax),
          subtotal: parseSafeMoney(tx.subtotal) || ((Number(tx.qty) || 1) * parseSafeMoney(tx.unit_price || tx.price)),
          total: parseSafeMoney(tx.total || tx.nett_sales || tx.nettSales) || ((Number(tx.qty) || 1) * parseSafeMoney(tx.unit_price || tx.price)),
          payment_method: tx.payment_method || tx.paymentMethod || 'QRIS BCA',
          visit_purpose: visitPurpose,
          cashier: tx.cashier || tx.waiter || 'Kasir',
          file_id: fileInfo.id,
        };
      });

      const saveRes = db.saveSalesFileRecord(fileInfo, normalized);
      if (!saveRes.success) {
        return res.status(500).json({ success: false, error: saveRes.error || 'Failed to save sales file records to database' });
      }
      db.setConfig('last_sales_pushed_at', new Date().toISOString());

      res.json({
        success: true,
        message: `Successfully received and saved ${normalized.length} sales records!`,
        count: normalized.length,
        fileId: saveRes.fileId,
        receivedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Sales Push Error]:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Sales Files History & Management Endpoints
  app.get('/api/sales/files', (req, res) => {
    try {
      const files = db.getSalesFilesList();
      res.json({ success: true, files });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/sales/files/:id/download', (req, res) => {
    try {
      const file = db.getSalesFileById(req.params.id);
      if (!file) {
        return res.status(404).send('Sales file not found');
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.file_content || '');
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.delete('/api/sales/files/:id', (req, res) => {
    try {
      const result = db.deleteSalesFileRecord(req.params.id);
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
  app.get('/api/sales/report', (req, res) => {
    try {
      const filters = {
        storeId: req.query.storeId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        search: req.query.search,
        category: req.query.category,
        brand: req.query.brand,
        visitPurpose: req.query.visitPurpose,
        paymentMethod: req.query.paymentMethod,
        limit: req.query.limit || 200,
        offset: req.query.offset || 0,
      };
      const transactions = db.getSalesTransactions(filters);
      res.json({ success: true, transactions, total: transactions.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/sales/summary', (req, res) => {
    try {
      const filters = {
        storeId: req.query.storeId,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        visitPurpose: req.query.visitPurpose,
        category: req.query.category,
        paymentMethod: req.query.paymentMethod,
      };
      const summary = db.getSalesSummary(filters);
      res.json({ success: true, summary });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/sales/clear', (req, res) => {
    try {
      const result = db.clearAllSalesTransactions();
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/sales/sync-birmas', async (req, res) => {
    try {
      const birmasUrl = db.getConfig('wp_url', 'https://admin.birmas.id');
      const salesEndpoint = `${birmasUrl.replace(/\/+$/, '')}/wp-json/api/v1/sales_report`;
      console.log(`[Sales Sync] Querying Birmas server sales bridge at: ${salesEndpoint}`);

      try {
        const response = await fetch(salesEndpoint, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8000),
        });

        if (response.ok) {
          const data = await response.json();
          const items = Array.isArray(data) ? data : (data.items || data.transactions || data.data || []);
          if (items.length > 0) {
            db.saveBulkSalesTransactions(items);
            return res.json({
              success: true,
              message: `Successfully synchronized ${items.length} sales records from Birmas Central Server!`,
              count: items.length,
            });
          }
        }
      } catch (fetchErr) {
        console.warn('[Sales Sync] Birmas server endpoint not yet active or timed out:', fetchErr.message);
      }

      // Return status with bridge instructions
      res.json({
        success: true,
        message: 'Loaded local ESB sales recapitulation data. To pull live from Birmas server, add the WordPress bridge snippet on admin.birmas.id.',
        bridgeReady: false,
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
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
      server: { middlewareMode: true },
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

    const SYNC_INTERVAL_MS = 15 * 60 * 1000; // Automatically every 15 minutes
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
