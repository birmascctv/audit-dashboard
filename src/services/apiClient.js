const API_BASE = '/api';

export async function fetchStores() {
  try {
    const res = await fetch(`${API_BASE}/stores`);
    if (!res.ok) throw new Error('Failed to fetch stores');
    return await res.json();
  } catch (err) {
    console.warn('Fallback to local stores:', err);
    return [
      { id: 'birmas-kuningan', name: 'Birmas Kuningan', locationCode: 'BRM-KNG', esbBranchCode: 'ESB_KNG' },
      { id: 'birmas-kwitang', name: 'Birmas Kwitang', locationCode: 'BRM-KWT', esbBranchCode: 'ESB_KWT' },
      { id: 'birmas-lebak-bulus', name: 'Birmas Lebak Bulus', locationCode: 'BRM-LBB', esbBranchCode: 'ESB_LBB' },
      { id: 'birmas-sudirman', name: 'Birmas Sudirman', locationCode: 'BRM-SDR', esbBranchCode: 'ESB_SDR' },
    ];
  }
}

export async function apiAddStore(storeData) {
  const res = await fetch(`${API_BASE}/stores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(storeData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add store');
  }
  return await res.json();
}

export async function apiDeleteStore(storeId) {
  const res = await fetch(`${API_BASE}/stores/${encodeURIComponent(storeId)}`, {
    method: 'DELETE',
  });
  return await res.json();
}

export async function fetchProducts() {
  try {
    const res = await fetch(`${API_BASE}/products`);
    if (!res.ok) throw new Error('Failed to fetch products');
    return await res.json();
  } catch (err) {
    console.warn('Fallback to cached products:', err);
    return [];
  }
}

export async function apiMatchBarcode(payload) {
  const res = await fetch(`${API_BASE}/products/match-barcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || 'Failed to match barcode');
  }
  return await res.json();
}

export async function fetchAuditState(storeId) {
  const res = await fetch(`${API_BASE}/audit/state?storeId=${encodeURIComponent(storeId)}`);
  if (!res.ok) throw new Error('Failed to fetch audit state');
  return await res.json();
}

export async function apiSendScan(barcode, storeId, auditorName) {
  const res = await fetch(`${API_BASE}/audit/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcode, storeId, auditorName }),
  });
  const data = await res.json();
  if (!res.ok) {
    return {
      success: false,
      message: data.message || data.error || 'Unknown scan error',
    };
  }
  return data;
}

export async function apiAdjustCount(barcode, storeId, opts = {}) {
  await fetch(`${API_BASE}/audit/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcode, storeId, ...opts }),
  });
}

export async function apiResetAudit(storeId) {
  await fetch(`${API_BASE}/audit/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId }),
  });
}

export async function apiFinalizeAudit(audit) {
  const res = await fetch(`${API_BASE}/audit/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(audit),
  });
  return await res.json();
}

export async function fetchAuditHistory() {
  try {
    const res = await fetch(`${API_BASE}/audit/history`);
    return await res.json();
  } catch {
    return [];
  }
}

export async function apiClearAuditHistory() {
  await fetch(`${API_BASE}/audit/history`, { method: 'DELETE' });
}

export async function fetchWpConfig() {
  const res = await fetch(`${API_BASE}/wordpress/config`);
  return await res.json();
}

export async function apiSaveWpConfig(config) {
  await fetch(`${API_BASE}/wordpress/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function apiDeleteBarcodeMatch(barcode) {
  const res = await fetch(`${API_BASE}/products/match-barcode/${encodeURIComponent(barcode)}`, {
    method: 'DELETE',
  });
  return await res.json();
}

export async function apiFetchDatabaseStatus() {
  const res = await fetch(`${API_BASE}/database/status`);
  return await res.json();
}

export async function apiSyncWordPress(config) {
  const res = await fetch(`${API_BASE}/wordpress/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config || {}),
  });
  return await res.json();
}

export async function apiSyncDirectESB() {
  const res = await fetch(`${API_BASE}/esb/sync-direct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return await res.json();
}

export async function apiSyncESBERP(credentials) {
  const res = await fetch(`${API_BASE}/esb/sync-erp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials || {}),
  });
  return await res.json();
}

