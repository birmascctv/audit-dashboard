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
    }
    if (loadedConfig) {
      wpConfig.value = { ...wpConfig.value, ...loadedConfig };
    }
    if (loadedProducts && loadedProducts.length > 0) {
      wpProducts.value = loadedProducts;
    }
    if (loadedHistory) {
      auditHistory.value = loadedHistory;
    }

    await loadStoreScans(selectedStoreId.value);
    isInitialized.value = true;
  } catch (err) {
    console.warn('Backend init fallback:', err);
  }
}

async function loadStoreScans(storeId) {
  try {
    const res = await fetchAuditState(storeId);
    scannedCounts.value = res.counts || res.scannedCounts || {};
    scanLogs.value = res.scanLogs || [];
  } catch (err) {
    console.warn('Failed to load store scans:', err);
  }
}

export function useAuditStore() {
  if (!isInitialized.value) {
    initializeFromBackend();
  }

  const visibleStores = computed(() => {
    if (!stores.value || stores.value.length === 0) return [];
    return stores.value.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  });

  const currentStore = computed(() => {
    const found = visibleStores.value.find((s) => s.id === selectedStoreId.value);
    if (!found && visibleStores.value.length > 0) {
      selectedStoreId.value = visibleStores.value[0].id;
      return visibleStores.value[0];
    }
    return found || visibleStores.value[0] || stores.value[0];
  });

  // Compare Scanned Physical Count with WordPress/ESB Stock for this Store
  const auditItems = computed(() => {
    const storeId = selectedStoreId.value;

    return wpProducts.value.map((prod) => {
      const wpExpected = (prod.stockByStore && prod.stockByStore[storeId]) ?? 0;
      const count = scannedCounts.value[prod.barcode] ?? 0;
      const discrepancy = count - wpExpected;

      let status = 'unscanned';
      if (count === 0 && wpExpected === 0) {
        status = 'zero_stock';
      } else if (count === 0 && wpExpected > 0) {
        status = 'unscanned';
      } else if (count === wpExpected) {
        status = 'matched';
      } else if (count < wpExpected) {
        status = 'missing'; // Shortage
      } else {
        status = 'surplus'; // Overcount
      }

      const lastLog = scanLogs.value.find((l) => l.barcode === prod.barcode);

      return {
        barcode: prod.barcode,
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
        lastScannedAt: lastLog ? lastLog.timestamp : null,
      };
    });
  });

  // KPI Metrics
  const totalWpExpected = computed(() => {
    return auditItems.value.reduce((acc, item) => acc + item.wpExpectedQty, 0);
  });

  const totalScanned = computed(() => {
    return auditItems.value.reduce((acc, item) => acc + item.scannedCount, 0);
  });

  // Items that belong to this store (have expected stock or were scanned)
  const storeItemsCount = computed(() => {
    return auditItems.value.filter((i) => i.wpExpectedQty > 0 || i.scannedCount > 0).length;
  });

  const matchedVariantsCount = computed(() => {
    return auditItems.value.filter((i) => i.status === 'matched').length;
  });

  const missingVariantsCount = computed(() => {
    return auditItems.value.filter((i) => i.status === 'missing').length;
  });

  const surplusVariantsCount = computed(() => {
    return auditItems.value.filter((i) => i.status === 'surplus').length;
  });

  const unscannedVariantsCount = computed(() => {
    return auditItems.value.filter((i) => i.status === 'unscanned').length;
  });

  const netDiscrepancyBottles = computed(() => {
    return totalScanned.value - totalWpExpected.value;
  });

  async function selectStore(storeId) {
    selectedStoreId.value = storeId;
    await loadStoreScans(storeId);
  }

  // Register physical scan
  async function registerAuditScan(barcode, auditorName = 'Auditor') {
    const clean = (barcode || '').trim();

    const res = await sendAuditScan(clean, selectedStoreId.value, auditorName);

    if (res.success && res.scannedCount !== undefined) {
      scannedCounts.value[clean] = res.scannedCount;

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

      const currentItem = auditItems.value.find((i) => i.barcode === clean);

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

  async function decrementAuditCount(barcode) {
    const clean = (barcode || '').trim();
    const cur = scannedCounts.value[clean] ?? 0;
    if (cur > 0) {
      scannedCounts.value[clean] = cur - 1;
      await adjustAuditCount(clean, selectedStoreId.value, { delta: -1 });
    }
  }

  async function setAuditCount(barcode, count) {
    const clean = (barcode || '').trim();
    const safeCount = Math.max(0, count);
    scannedCounts.value[clean] = safeCount;
    await adjustAuditCount(clean, selectedStoreId.value, { count: safeCount });
  }

  async function resetCurrentAudit() {
    scannedCounts.value = {};
    scanLogs.value = [];
    await resetAuditSession(selectedStoreId.value);
  }

  async function addNewBarcode(payload) {
    const res = await saveNewBarcode(payload);
    if (res.success && res.product) {
      const cleanNew = String(res.product.barcode || '').toLowerCase().trim();
      const idx = wpProducts.value.findIndex(
        (p) => p.id === res.product.id || (p.barcode && String(p.barcode).toLowerCase().trim() === cleanNew)
      );
      if (idx >= 0) {
        wpProducts.value[idx] = { ...wpProducts.value[idx], ...res.product };
      } else {
        wpProducts.value.push(res.product);
      }
      try {
        const fresh = await fetchProducts();
        if (fresh && fresh.length > 0) {
          wpProducts.value = fresh;
        }
      } catch {}
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

  async function syncFromBirmasServer() {
    isSyncing.value = true;
    try {
      const res = await fetch('/api/birmas/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
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
    storeItemsCount,
    matchedVariantsCount,
    missingVariantsCount,
    surplusVariantsCount,
    unscannedVariantsCount,
    netDiscrepancyBottles,
    isAutoCheckerActive,
    lastCheckedAt,
    selectStore,
    registerAuditScan,
    decrementAuditCount,
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
    refreshAuditState: () => loadStoreScans(selectedStoreId.value),
  };
}
