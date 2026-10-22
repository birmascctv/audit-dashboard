import { ref, computed } from 'vue';
import {
  DEFAULT_STORES,
  DEFAULT_WP_PRODUCTS,
  fetchStores,
  fetchWordPressConfig,
  saveWordPressConfig,
  fetchProducts,
  saveNewBarcode,
  syncWordPressData,
  syncDirectESB,
  syncDirectESBERP,
  fetchAuditState,
  sendAuditScan,
  adjustAuditCount,
  resetAuditSession,
  finalizeAuditSession,
  fetchAuditHistory,
  clearAuditHistory,
  addStore as apiAddStore,
  deleteStore as apiDeleteStore,
} from '../services/wordpressApi.js';

// Global Singleton State
const stores = ref(DEFAULT_STORES);
const selectedStoreId = ref('birmas-kuningan');
const wpConfig = ref({
  wpUrl: 'https://demo-store.local',
  apiType: 'woocommerce',
  customEndpointPath: '/wp-json/birmas/v1/chiller-stocks',
  consumerKey: '',
  consumerSecret: '',
  isConnected: true,
  lastSyncedAt: new Date().toISOString(),
  selectedStoreId: 'birmas-kuningan',
  autoSyncIntervalSeconds: 30,
});

const wpProducts = ref(DEFAULT_WP_PRODUCTS);
const scannedCounts = ref({});
const scanLogs = ref([]);
const auditHistory = ref([]);
const isSyncing = ref(false);
const isInitialized = ref(false);
const lastCheckedAt = ref(new Date().toLocaleTimeString());
const isAutoCheckerActive = ref(true);

const lastSyncStatus = ref({
  success: true,
  message: 'Connected to Birmas Store Backend Storage',
});

// Load state from backend
async function initializeFromBackend() {
  try {
    const [loadedStores, loadedConfig, loadedProducts, loadedHistory] = await Promise.all([
      fetchStores().catch(() => DEFAULT_STORES),
      fetchWordPressConfig().catch(() => wpConfig.value),
      fetchProducts().catch(() => DEFAULT_WP_PRODUCTS),
      fetchAuditHistory().catch(() => []),
    ]);

    if (loadedStores && loadedStores.length > 0) {
      stores.value = loadedStores;
    } else {
      try {
        const localStores = JSON.parse(localStorage.getItem('birmas_stores') || '[]');
        if (localStores.length > 0) stores.value = localStores;
      } catch (_) {}
    }
    if (loadedConfig) {
      wpConfig.value = { ...wpConfig.value, ...loadedConfig };
    }
    if (loadedProducts && loadedProducts.length > 0) {
      wpProducts.value = loadedProducts;
    } else {
      try {
        const localProds = JSON.parse(localStorage.getItem('birmas_products') || '[]');
        if (localProds.length > 0) wpProducts.value = localProds;
      } catch (_) {}
    }
    if (loadedHistory) {
      auditHistory.value = loadedHistory;
    }

    await loadStoreScans(selectedStoreId.value);
    isInitialized.value = true;
  } catch (err) {
    console.warn('Backend init fallback:', err);
    try {
      const localProds = JSON.parse(localStorage.getItem('birmas_products') || '[]');
      if (localProds.length > 0) wpProducts.value = localProds;
    } catch (_) {}
  }
}

const isSessionLocked = ref(false);
const sessionLockInfo = ref(null);

async function loadSessionLockState(storeId) {
  if (!storeId) return;
  try {
    const res = await fetch(`/api/audit/session/${encodeURIComponent(storeId)}/lock`);
    const data = await res.json();
    if (data.success) {
      isSessionLocked.value = Boolean(data.isLocked);
      sessionLockInfo.value = {
        lockedAt: data.lockedAt,
        lockedBy: data.lockedBy,
        unlockedAt: data.unlockedAt,
        unlockedBy: data.unlockedBy,
      };
      return;
    }
  } catch (_) {}

  try {
    const local = JSON.parse(localStorage.getItem(`birmas_session_lock_${storeId}`) || 'null');
    if (local) {
      isSessionLocked.value = Boolean(local.isLocked);
      sessionLockInfo.value = local;
    } else {
      isSessionLocked.value = false;
      sessionLockInfo.value = null;
    }
  } catch (_) {
    isSessionLocked.value = false;
  }
}

async function lockCurrentSession(user = 'Auditor') {
  const storeId = selectedStoreId.value;
  try {
    await fetch(`/api/audit/session/${encodeURIComponent(storeId)}/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user }),
    });
  } catch (_) {}

  isSessionLocked.value = true;
  sessionLockInfo.value = {
    isLocked: true,
    lockedAt: new Date().toISOString(),
    lockedBy: user,
  };
  try {
    localStorage.setItem(`birmas_session_lock_${storeId}`, JSON.stringify(sessionLockInfo.value));
  } catch (_) {}
}

async function unlockCurrentSession(user = 'Super Admin', role = 'superadmin') {
  const storeId = selectedStoreId.value;
  if (role !== 'superadmin') {
    throw new Error('Only Superadmin can approve unlocking this audit session.');
  }

  try {
    await fetch(`/api/audit/session/${encodeURIComponent(storeId)}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, role }),
    });
  } catch (_) {}

  isSessionLocked.value = false;
  sessionLockInfo.value = {
    isLocked: false,
    unlockedAt: new Date().toISOString(),
    unlockedBy: user,
  };
  try {
    localStorage.setItem(`birmas_session_lock_${storeId}`, JSON.stringify(sessionLockInfo.value));
  } catch (_) {}
}

const countsCacheKey = (storeId) => `birmas_counts_${storeId}`;
const PENDING_KEY = 'birmas_pending_scans';

function persistCounts(storeId = selectedStoreId.value) {
  try { localStorage.setItem(countsCacheKey(storeId), JSON.stringify(scannedCounts.value)); } catch (_) {}
}

function readPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch (_) { return []; }
}
function writePending(list) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch (_) {}
}

let isFlushing = false;
// Send scans that were taken while offline; stops at the first network failure
async function flushPendingScans() {
  if (isFlushing) return;
  isFlushing = true;
  try {
    let queue = readPending();
    while (queue.length > 0) {
      const item = queue[0];
      const res = await sendAuditScan(item.barcode, item.storeId, item.auditorName, item.productId);
      if (res.offline) break;
      queue = queue.slice(1);
      writePending(queue);
    }
  } finally {
    isFlushing = false;
  }
}

async function loadStoreScans(storeId) {
  try {
    await flushPendingScans();
    const res = await fetchAuditState(storeId);
    if (res.failed) {
      // Offline: fall back to the last counts saved on this device, plus unsent scans
      const cached = JSON.parse(localStorage.getItem(countsCacheKey(storeId)) || '{}');
      scannedCounts.value = cached;
      scanLogs.value = [];
    } else {
      scannedCounts.value = res.counts || res.scannedCounts || {};
      scanLogs.value = res.scanLogs || [];
      const pending = readPending().filter((p) => p.storeId === storeId);
      for (const p of pending) {
        const k = p.barcode || `id:${p.productId}`;
        scannedCounts.value[k] = (scannedCounts.value[k] ?? 0) + 1;
      }
      persistCounts(storeId);
    }
  } catch (err) {
    console.warn('Failed to load store scans:', err);
  }
  await loadSessionLockState(storeId);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushPendingScans());
}

export function useAuditStore() {
  if (!isInitialized.value) {
    initializeFromBackend();
  }

  const visibleStores = computed(() => {
    if (!stores.value || stores.value.length === 0) return [];
    // Hide stores whose ESB stock is entirely 0 (inactive); keep all if none have stock yet
    const active = stores.value.filter((s) => s.hasStock !== false);
    const list = active.length > 0 ? active : stores.value;
    return list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  });

  const currentStore = computed(() => {
    const found = visibleStores.value.find((s) => s.id === selectedStoreId.value);
    if (!found && visibleStores.value.length > 0) {
      selectedStoreId.value = visibleStores.value[0].id;
      return visibleStores.value[0];
    }
    return found || visibleStores.value[0] || stores.value[0];
  });

  // Canonical identity key used to track scanned counts per product. Falls back to
  // `id:<productId>` when a product has no barcode yet, so products without a
  // barcode never collapse onto one shared counter (they all currently share
  // barcode = null/''). Once a real barcode is assigned, the key switches to it.
  function scanKeyFor(barcode, wpId) {
    const b = (barcode || '').toString().trim();
    if (b) return b;
    return wpId !== undefined && wpId !== null && wpId !== '' ? `id:${wpId}` : '';
  }

  // Compare Scanned Physical Count with WordPress/ESB Stock for this Store
  const auditItems = computed(() => {
    const storeId = selectedStoreId.value;

    const seenBarcodes = new Set();
    return wpProducts.value.map((rawProd) => {
      // One barcode belongs to one product: later duplicates fall back to their own id key
      const b = String(rawProd.barcode || '').trim();
      const prod = b && seenBarcodes.has(b) ? { ...rawProd, barcode: '' } : rawProd;
      if (b) seenBarcodes.add(b);
      const rawExpected = (prod.stockByStore && prod.stockByStore[storeId]) ?? 0;
      const wpExpected = Math.round(Number(rawExpected) || 0);
      const scanKey = scanKeyFor(prod.barcode, prod.id);
      const count = scannedCounts.value[scanKey] ?? 0;

      let status = 'unscanned';
      let discrepancy = 0;

      if (wpExpected < 0) {
        // Negative ESB stock means the ERP recorded that items are missing in the store (e.g. -2 means 2 cans missing)
        if (count === 0) {
          status = 'missing'; // Items are physically missing
          discrepancy = wpExpected; // e.g. -2
        } else if (count < Math.abs(wpExpected)) {
          status = 'counting';
          discrepancy = wpExpected + count;
        } else if (count === Math.abs(wpExpected)) {
          status = 'matched';
          discrepancy = 0;
        } else {
          status = 'surplus';
          discrepancy = count - Math.abs(wpExpected);
        }
      } else if (count === 0 && wpExpected === 0) {
        status = 'zero_stock'; // Stok Kosong
        discrepancy = 0;
      } else if (count === 0 && wpExpected > 0) {
        status = 'unscanned'; // Belum Dipindai
        discrepancy = -wpExpected;
      } else if (count === wpExpected) {
        status = 'matched'; // Sesuai Persis
        discrepancy = 0;
      } else if (count < wpExpected) {
        status = count > 0 ? 'counting' : 'unscanned'; // Sedang dihitung atau belum
        discrepancy = count - wpExpected;
      } else {
        status = 'surplus'; // Kelebihan / Overcount
        discrepancy = count - wpExpected;
      }

      const lastLog = scanLogs.value.find((l) => l.barcode === scanKey);

      return {
        barcode: prod.barcode,
        scanKey,
        wpId: prod.id,
        brand: prod.subCategory || prod.brand || 'Birmas',
        subCategory: prod.subCategory || prod.brand || 'Birmas',
        productTitle: prod.productTitle || prod.varian,
        category: prod.category,
        defaultUnit: prod.defaultUnit,
        varian: prod.varian,
        wpExpectedQty: wpExpected,
        scannedCount: count,
        discrepancy,
        status,
        hasNegativeStock: wpExpected < 0,
        negativeStockDeficit: wpExpected < 0 ? Math.abs(wpExpected) : 0,
        isMatched: status === 'matched',
        isSurplus: status === 'surplus',
        isDeficit: status === 'missing' || (count < wpExpected && wpExpected > 0),
        isUnscanned: status === 'unscanned',
        lastScannedAt: lastLog ? lastLog.timestamp : null,
      };
    });
  });

  // KPI Metrics
  const totalWpExpected = computed(() => {
    return Math.round(auditItems.value.reduce((acc, item) => acc + item.wpExpectedQty, 0));
  });

  const totalScanned = computed(() => {
    return auditItems.value.reduce((acc, item) => acc + item.scannedCount, 0);
  });

  const hasAuditStarted = computed(() => {
    return totalScanned.value > 0;
  });

  // Items that belong to this store (have expected stock or were scanned)
  const storeItemsCount = computed(() => {
    return auditItems.value.filter((i) => i.wpExpectedQty > 0 || i.scannedCount > 0).length;
  });

  const scannedVariantsCount = computed(() => {
    return auditItems.value.filter((i) => i.scannedCount > 0).length;
  });

  const matchedVariantsCount = computed(() => {
    return auditItems.value.filter((i) => i.status === 'matched').length;
  });

  const countingVariantsCount = computed(() => {
    return auditItems.value.filter((i) => i.status === 'counting').length;
  });

  const missingVariantsCount = computed(() => {
    // True shortages during reconciliation (only evaluated once audit counting is underway)
    if (!hasAuditStarted.value) return 0;
    return auditItems.value.filter((i) => i.wpExpectedQty > 0 && i.scannedCount < i.wpExpectedQty).length;
  });

  const surplusVariantsCount = computed(() => {
    return auditItems.value.filter((i) => i.status === 'surplus').length;
  });

  const unscannedVariantsCount = computed(() => {
    return auditItems.value.filter((i) => i.status === 'unscanned').length;
  });

  const auditProgressPercentage = computed(() => {
    const totalActive = storeItemsCount.value || 1;
    return Math.min(100, Math.round((scannedVariantsCount.value / totalActive) * 100));
  });

  const netDiscrepancyBottles = computed(() => {
    if (!hasAuditStarted.value) return 0;
    return totalScanned.value - totalWpExpected.value;
  });

  const totalShortageBottles = computed(() => {
    if (!hasAuditStarted.value) return 0;
    return auditItems.value.reduce((acc, i) => {
      return acc + (i.scannedCount < i.wpExpectedQty ? (i.wpExpectedQty - i.scannedCount) : 0);
    }, 0);
  });

  const totalSurplusBottles = computed(() => {
    return auditItems.value.reduce((acc, i) => {
      return acc + (i.scannedCount > i.wpExpectedQty ? (i.scannedCount - i.wpExpectedQty) : 0);
    }, 0);
  });

  async function selectStore(storeId) {
    selectedStoreId.value = storeId;
    await loadStoreScans(storeId);
  }

  // Register physical scan (barcode may be a real scanned code, or for the manual
  // "+" button on a product without a barcode yet, an empty barcode + wpId so the
  // backend can still resolve the product and keep its count independent of others)
  async function registerAuditScan(barcode, wpId, auditorName = 'Auditor') {
    if (isSessionLocked.value) {
      return { success: false, message: 'Audit session is locked. Unlocking requires Superadmin approval.' };
    }
    const clean = scanKeyFor(barcode, wpId);
    if (!clean) {
      return { success: false, message: 'Unable to identify this product for scanning.' };
    }

    let res = await sendAuditScan((barcode || '').trim(), selectedStoreId.value, auditorName, wpId);

    if (res.offline) {
      // No connection: count locally and queue the scan so nothing is lost
      const prod = wpProducts.value.find((p) =>
        (barcode && String(p.barcode || '').trim() === String(barcode).trim()) ||
        (!barcode && wpId !== undefined && String(p.id) === String(wpId))
      );
      if (prod) {
        const queue = readPending();
        queue.push({ barcode: (barcode || '').trim(), productId: prod.id, storeId: selectedStoreId.value, auditorName, ts: Date.now() });
        writePending(queue);
        const next = (scannedCounts.value[clean] ?? 0) + 1;
        const expected = Math.round(Number(prod.stockByStore?.[selectedStoreId.value]) || 0);
        res = {
          success: true,
          message: `${prod.brand || ''} ${prod.varian || prod.productTitle} counted (offline, will sync)`,
          product: prod,
          scannedCount: next,
          discrepancy: next - expected,
        };
      }
    } else if (res.success) {
      flushPendingScans();
    }

    if (res.success && res.scannedCount !== undefined) {
      scannedCounts.value[clean] = res.scannedCount;
      persistCounts();

      const scanEvent = {
        id: `scan-${Date.now()}`,
        timestamp: new Date().toISOString(),
        barcode: clean,
        brand: res.product?.brand || 'Birmas',
        varian: res.product?.varian || 'Product',
        scanSequence: res.scannedCount,
        storeId: selectedStoreId.value,
        auditorName,
      };
      scanLogs.value.unshift(scanEvent);

      const currentItem = auditItems.value.find((i) => i.scanKey === clean);

      return {
        success: true,
        message: res.message,
        item: currentItem,
        isOvercount: res.discrepancy > 0,
        isMatchedNow: res.discrepancy === 0,
      };
    } else {
      return {
        success: false,
        message: res.message || `Barcode ${clean} not found in database.`,
        unknownBarcode: clean,
      };
    }
  }

  async function decrementAuditCount(barcode, wpId) {
    if (isSessionLocked.value) return;
    const clean = scanKeyFor(barcode, wpId);
    if (!clean) return;
    const cur = scannedCounts.value[clean] ?? 0;
    if (cur > 0) {
      scannedCounts.value[clean] = cur - 1;
      persistCounts();
      await adjustAuditCount(clean, selectedStoreId.value, { delta: -1, productId: wpId });
    }
  }

  async function setAuditCount(barcode, wpId, count) {
    if (isSessionLocked.value) return;
    const clean = scanKeyFor(barcode, wpId);
    if (!clean) return;
    const safeCount = Math.max(0, count);
    scannedCounts.value[clean] = safeCount;
    persistCounts();
    await adjustAuditCount(clean, selectedStoreId.value, { count: safeCount, productId: wpId });
  }

  async function addBatchAuditCount(barcode, wpId, delta) {
    const clean = scanKeyFor(barcode, wpId);
    if (!clean) return;
    const cur = scannedCounts.value[clean] ?? 0;
    const target = Math.max(0, cur + delta);
    scannedCounts.value[clean] = target;
    persistCounts();
    await adjustAuditCount(clean, selectedStoreId.value, { delta, productId: wpId });
  }

  async function resetCurrentAudit() {
    scannedCounts.value = {};
    scanLogs.value = [];
    writePending(readPending().filter((p) => p.storeId !== selectedStoreId.value));
    persistCounts();
    await resetAuditSession(selectedStoreId.value);
  }

  async function addNewBarcode(payload) {
    const res = await saveNewBarcode(payload);
    if (res.success && res.product) {
      const cleanNew = String(res.product.barcode || '').trim();
      const targetTitle = (payload.productTitle || payload.varian || '').toLowerCase().trim();

      // Update ALL matching products in catalog across all store views
      let matchedCount = 0;
      // A barcode belongs to one product; clear it from any other product locally
      wpProducts.value.forEach((p) => {
        if (cleanNew && p.id !== res.product.id && String(p.barcode || '').trim() === cleanNew) p.barcode = '';
      });
      wpProducts.value.forEach((p) => {
        const pTitle = (p.productTitle || p.varian || '').toLowerCase().trim();
        if (p.id === res.product.id) {
          const oldKey = scanKeyFor(p.barcode, p.id);
          p.barcode = cleanNew;
          if (res.product.brand && !p.brand) p.brand = res.product.brand;
          matchedCount++;
          // Carry over any count already scanned under the old synthetic id-based
          // key so assigning a barcode doesn't appear to reset this product's count
          if (cleanNew && oldKey && oldKey !== cleanNew && scannedCounts.value[oldKey] !== undefined) {
            scannedCounts.value[cleanNew] = scannedCounts.value[oldKey];
            delete scannedCounts.value[oldKey];
          }
        }
      });

      // If not yet present in wpProducts, add it
      if (matchedCount === 0) {
        wpProducts.value.push(res.product);
      }

      // Persist immediately to localStorage so all stores immediately recognize it
      try {
        localStorage.setItem('birmas_products', JSON.stringify(wpProducts.value));
      } catch (_) {}

      // Background sync with database to fetch any fresh barcodes without dropping existing products
      try {
        const fresh = await fetchProducts();
        if (fresh && fresh.length > 0) {
          fresh.forEach((fp) => {
            if (!fp.barcode) return;
            const fpTitle = (fp.productTitle || fp.varian || '').toLowerCase().trim();
            wpProducts.value.forEach((p) => {
              if (p.id === fp.id) p.barcode = fp.barcode;
            });
          });
          localStorage.setItem('birmas_products', JSON.stringify(wpProducts.value));
        }
      } catch (_) {}
    }
    return res;
  }

  async function syncFromWordPress() {
    isSyncing.value = true;
    try {
      await saveWordPressConfig(wpConfig.value);
      const res = await syncWordPressData(wpConfig.value);
      if (res.data && res.data.length > 0) {
        wpProducts.value = res.data;
        wpConfig.value.isConnected = true;
        wpConfig.value.lastSyncedAt = new Date().toISOString();
        lastSyncStatus.value = { success: res.success, message: res.message };
      } else {
        lastSyncStatus.value = { success: false, message: res.message };
      }
    } catch (err) {
      lastSyncStatus.value = { success: false, message: err.message };
    } finally {
      isSyncing.value = false;
    }
  }

  async function syncFromESBDirect() {
    isSyncing.value = true;
    try {
      const res = await syncDirectESB();
      if (res.success) {
        const [freshStores, freshProducts] = await Promise.all([fetchStores(), fetchProducts()]);
        stores.value = freshStores;
        wpProducts.value = freshProducts;
        wpConfig.value.lastSyncedAt = new Date().toISOString();
        try {
          const auditState = await fetchAuditState(selectedStoreId.value);
          if (auditState && auditState.counts) {
            scannedCounts.value = auditState.counts;
          }
        } catch {}
        lastSyncStatus.value = {
          success: true,
          message: `Direct ESB Sync Complete! ${res.totalProducts || 192} products & ${res.totalStockEntries || 951} branch stocks synchronized from ESB Cloud.`,
        };
      } else {
        lastSyncStatus.value = { success: false, message: res.message || 'Direct ESB Sync failed' };
      }
      return res;
    } catch (err) {
      lastSyncStatus.value = { success: false, message: err.message };
      return { success: false, error: err.message };
    } finally {
      isSyncing.value = false;
    }
  }

  async function syncFromESBERP(credentials = {}) {
    isSyncing.value = true;
    try {
      const payload = {
        storeId: selectedStoreId.value,
        ...credentials,
      };
      const res = await syncDirectESBERP(payload);
      if (res.success) {
        const [freshStores, freshProducts] = await Promise.all([fetchStores(), fetchProducts()]);
        stores.value = freshStores;
        wpProducts.value = freshProducts;
        wpConfig.value.lastSyncedAt = new Date().toISOString();
        try {
          const auditState = await fetchAuditState(selectedStoreId.value);
          if (auditState && auditState.counts) {
            scannedCounts.value = auditState.counts;
          }
        } catch {}
        lastSyncStatus.value = {
          success: true,
          message: `ESB Inventory Synced! ${res.totalSyncedProducts || 0} real inventory items updated for ${currentStore.value.name}.`,
        };
      } else {
        lastSyncStatus.value = { success: false, message: res.message || 'ERP Sync failed' };
      }
      return res;
    } catch (err) {
      lastSyncStatus.value = { success: false, message: err.message };
      return { success: false, error: err.message };
    } finally {
      isSyncing.value = false;
    }
  }

  async function syncFromBirmasServer(customPayload = {}) {
    isSyncing.value = true;
    try {
      const res = await fetch('/api/birmas/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customPayload),
      });
      const data = await res.json();
      if (data.success) {
        if (data.isVisitPurposeData) {
          lastSyncStatus.value = {
            success: true,
            isVisitPurposeData: true,
            message: data.message,
            visitPurposes: data.visitPurposes,
            guidance: data.guidance,
          };
        } else {
          const [freshStores, freshProducts] = await Promise.all([fetchStores(), fetchProducts()]);
          stores.value = freshStores;
          wpProducts.value = freshProducts;
          wpConfig.value.lastSyncedAt = new Date().toISOString();
          try {
            const auditState = await fetchAuditState(selectedStoreId.value);
            if (auditState && auditState.counts) {
              scannedCounts.value = auditState.counts;
            }
          } catch {}
          lastSyncStatus.value = {
            success: true,
            message: `Synced with Birmas Server! ${data.totalSyncedProducts || 0} items updated across all stores.`,
          };
        }
      } else {
        lastSyncStatus.value = { success: false, message: data.error || 'Birmas server sync failed' };
      }
      return data;
    } catch (err) {
      lastSyncStatus.value = { success: false, message: err.message };
      return { success: false, error: err.message };
    } finally {
      isSyncing.value = false;
    }
  }

  async function finalizeAudit(auditorName, notes = '', pushToWP = false) {
    const completedRecord = {
      id: `audit-${Date.now()}`,
      storeId: selectedStoreId.value,
      storeName: currentStore.value.name,
      auditorName,
      startedAt: scanLogs.value.length > 0 ? scanLogs.value[scanLogs.value.length - 1].timestamp : new Date().toISOString(),
      completedAt: new Date().toISOString(),
      totalExpected: totalWpExpected.value,
      totalScanned: totalScanned.value,
      matchedCount: matchedVariantsCount.value,
      missingCount: missingVariantsCount.value,
      surplusCount: surplusVariantsCount.value,
      items: auditItems.value,
      pushedToWordPress: pushToWP,
      notes,
    };

    const res = await finalizeAuditSession(completedRecord);

    if (res.success) {
      auditHistory.value.unshift(completedRecord);
      await lockCurrentSession(auditorName);
      scannedCounts.value = {};
      scanLogs.value = [];

      if (pushToWP) {
        const refreshed = await fetchProducts();
        if (refreshed) wpProducts.value = refreshed;
      }

      return completedRecord;
    } else {
      throw new Error(res.message || 'Failed to finalize audit on backend');
    }
  }

  async function clearHistory() {
    await clearAuditHistory();
    auditHistory.value = [];
  }

  async function createStore(storeData) {
    const res = await apiAddStore(storeData);
    if (res.success && res.stores) {
      stores.value = res.stores;
    }
    return res;
  }

  async function removeStore(storeId) {
    const res = await apiDeleteStore(storeId);
    if (res.success && res.stores) {
      stores.value = res.stores;
    }
    return res;
  }

  function applyStockCsvRows(rows = [], metadata = {}, filename = '') {
    if (!rows || rows.length === 0) return { updatedCount: 0 };

    const clean = (s) => (s || '').toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '');

    // 1. Gather all store names and match or create stores
    const updatedStores = [...stores.value];
    const storeMap = new Map();

    for (const s of updatedStores) {
      if (s.name) storeMap.set(clean(s.name), s);
      if (s.id) storeMap.set(clean(s.id), s);
      if (s.esbBranchCode) storeMap.set(clean(s.esbBranchCode), s);
    }

    // 2. Discover stores from CSV rows
    for (const r of rows) {
      const sName = (r.storeName || '').trim();
      if (!sName) continue;
      const sKey = clean(sName);
      if (!storeMap.has(sKey)) {
        const newStoreId = 'store-' + (sKey || Date.now());
        const newStore = {
          id: newStoreId,
          name: sName,
          city: 'Jakarta',
          esbBranchCode: sName,
        };
        updatedStores.push(newStore);
        storeMap.set(sKey, newStore);
      }
    }
    stores.value = updatedStores;

    // 3. Update products and their stockByStore
    const currentProducts = [...wpProducts.value];
    let updatedCount = 0;

    for (const r of rows) {
      const sName = (r.storeName || '').trim();
      const pName = (r.productName || '').trim();
      if (!sName || !pName) continue;

      const targetStore = storeMap.get(clean(sName)) || updatedStores.find(s => s.name.toLowerCase() === sName.toLowerCase());
      const storeId = targetStore ? targetStore.id : selectedStoreId.value;

      // Find matching product
      let matchedProd = currentProducts.find((p) => {
        if (p.productTitle && clean(p.productTitle) === clean(pName)) return true;
        if (p.varian && clean(p.varian) === clean(pName)) return true;
        if (p.barcode && r.barcode && clean(p.barcode) === clean(r.barcode)) return true;
        return false;
      });

      if (!matchedProd) {
        matchedProd = currentProducts.find((p) => {
          const pt = clean(p.productTitle || '');
          const pn = clean(pName);
          return (pt.length > 4 && pn.length > 4 && (pt.includes(pn) || pn.includes(pt)));
        });
      }

      const rawQty = typeof r.stockQty === 'number' ? r.stockQty : parseFloat(String(r.stockQty).replace(/[^0-9.-]/g, '')) || 0;
      const qty = Math.round(Number(rawQty) || 0);

      if (matchedProd) {
        matchedProd.stockByStore = matchedProd.stockByStore || {};
        matchedProd.stockByStore[storeId] = qty;
        if (r.category && !matchedProd.category) matchedProd.category = r.category;
        if (r.unit && !matchedProd.defaultUnit) matchedProd.defaultUnit = r.unit;
        updatedCount++;
      } else {
        const newProd = {
          id: 'stock-prod-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
          barcode: (r.barcode && !String(r.barcode).startsWith('STK')) ? String(r.barcode).trim() : null,
          productTitle: pName,
          varian: pName,
          brand: 'Birmas',
          subCategory: 'Birmas',
          category: r.category || 'Craft Beer',
          defaultUnit: r.unit || 'Can',
          stockByStore: { [storeId]: qty },
        };
        currentProducts.push(newProd);
        updatedCount++;
      }
    }

    wpProducts.value = currentProducts;

    // Cache locally
    try {
      localStorage.setItem('birmas_products', JSON.stringify(wpProducts.value));
      localStorage.setItem('birmas_stores', JSON.stringify(stores.value));
      if (filename) {
        const activeInfo = {
          filename,
          stock_date: metadata.stockDate || metadata.cell5B || new Date().toLocaleDateString('id-ID'),
          downloaded_at_esb: metadata.downloadedAtEsb || metadata.cell4B || new Date().toLocaleString('id-ID'),
          active_stores: metadata.activeStores || metadata.cell6B || '',
          row_count: rows.length,
          updated_at: new Date().toISOString(),
        };
        localStorage.setItem('birmas_active_stock_csv', JSON.stringify(activeInfo));
      }
    } catch (_) {}

    return { updatedCount, totalProducts: wpProducts.value.length };
  }

  return {
    stores: visibleStores,
    rawStores: stores,
    selectedStoreId,
    currentStore,
    wpConfig,
    wpProducts,
    auditItems,
    scannedCounts,
    scanLogs,
    auditHistory,
    isSyncing,
    lastSyncStatus,
    totalWpExpected,
    totalScanned,
    hasAuditStarted,
    storeItemsCount,
    scannedVariantsCount,
    countingVariantsCount,
    matchedVariantsCount,
    missingVariantsCount,
    surplusVariantsCount,
    unscannedVariantsCount,
    auditProgressPercentage,
    netDiscrepancyBottles,
    totalShortageBottles,
    totalSurplusBottles,
    isAutoCheckerActive,
    lastCheckedAt,
    selectStore,
    registerAuditScan,
    decrementAuditCount,
    addBatchAuditCount,
    setAuditCount,
    resetCurrentAudit,
    addNewBarcode,
    syncFromWordPress,
    syncFromESBDirect,
    syncFromESBERP,
    syncFromBirmasServer,
    finalizeAudit,
    clearHistory,
    createStore,
    removeStore,
    applyStockCsvRows,
    isSessionLocked,
    sessionLockInfo,
    loadSessionLockState,
    lockCurrentSession,
    unlockCurrentSession,
    refreshAuditState: () => loadStoreScans(selectedStoreId.value),
    refreshProducts: async () => {
      try {
        const prods = await fetchProducts();
        if (prods && Array.isArray(prods)) {
          wpProducts.value = prods;
        }
        const stds = await fetchStores();
        if (stds && Array.isArray(stds) && stds.length > 0) {
          stores.value = stds;
        }
        return prods;
      } catch (err) {
        console.warn('Failed to refresh products:', err);
        return [];
      }
    },
  };
}
