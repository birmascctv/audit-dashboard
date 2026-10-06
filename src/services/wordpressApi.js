import {
  fetchStores as apiFetchStores,
  fetchProducts as apiFetchProducts,
  apiMatchBarcode,
  fetchAuditState as apiFetchAuditState,
  apiSendScan,
  apiAdjustCount,
  apiResetAudit,
  apiFinalizeAudit,
  fetchAuditHistory as apiFetchAuditHistory,
  apiClearAuditHistory,
  fetchWpConfig as apiFetchWpConfig,
  apiSaveWpConfig,
  apiDeleteBarcodeMatch,
  apiFetchDatabaseStatus,
  apiSyncWordPress as apiRunSync,
  apiSyncDirectESB,
  apiSyncESBERP,
  apiAddStore,
  apiDeleteStore,
} from './apiClient.js';

export const DEFAULT_STORES = [
  {
    id: 'birmas-kuningan',
    name: 'Birmas Kuningan',
    locationCode: 'BRM-KNG',
    esbBranchCode: 'KUNINGAN',
  },
  {
    id: 'birmas-sudirman',
    name: 'Birmas Sudirman',
    locationCode: 'BRM-SDR',
    esbBranchCode: 'SUDIRMAN',
  },
  {
    id: 'birmas-kwitang',
    name: 'Birmas Kwitang',
    locationCode: 'BRM-KWT',
    esbBranchCode: 'KWITANG',
  },
  {
    id: 'birmas-lebak-bulus',
    name: 'Birmas Lebak Bulus',
    locationCode: 'BRM-LBB',
    esbBranchCode: 'LEBAKBULUS',
  },
];

// No hardcoded mock products or barcodes. All data is fetched live from ESB Cloud & SQLite
export const DEFAULT_WP_PRODUCTS = [];

export async function fetchStores() {
  return await apiFetchStores();
}

export async function addStore(storeData) {
  return await apiAddStore(storeData);
}

export async function deleteStore(storeId) {
  return await apiDeleteStore(storeId);
}

export async function fetchProducts() {
  return await apiFetchProducts();
}

export async function saveNewBarcode(payload) {
  return await apiMatchBarcode(payload);
}

export async function deleteBarcode(barcode) {
  return await apiDeleteBarcodeMatch(barcode);
}

export async function fetchAuditState(storeId) {
  return await apiFetchAuditState(storeId);
}

export async function sendAuditScan(barcode, storeId, auditorName) {
  return await apiSendScan(barcode, storeId, auditorName);
}

export async function adjustAuditCount(barcode, storeId, opts) {
  return await apiAdjustCount(barcode, storeId, opts);
}

export async function resetAuditSession(storeId) {
  return await apiResetAudit(storeId);
}

export async function finalizeAuditSession(audit) {
  return await apiFinalizeAudit(audit);
}

export async function fetchAuditHistory() {
  return await apiFetchAuditHistory();
}

export async function clearAuditHistory() {
  return await apiClearAuditHistory();
}

export async function fetchWordPressConfig() {
  return await apiFetchWpConfig();
}

export async function saveWordPressConfig(config) {
  return await apiSaveWpConfig(config);
}

export async function syncWordPressData(config) {
  return await apiRunSync(config);
}

export async function syncDirectESB() {
  return await apiSyncDirectESB();
}

export async function syncDirectESBERP(credentials) {
  return await apiSyncESBERP(credentials);
}

export async function fetchDatabaseHealth() {
  return await apiFetchDatabaseStatus();
}
