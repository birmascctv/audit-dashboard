const API_BASE = '/api';

export async function safeFetchJson(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.warn(`[API] Endpoint ${url} returned non-JSON (${contentType}). Backend may be offline.`);
      return { ok: false, status: res.status, data: null, error: 'Non-JSON response' };
    }
    const data = await res.json();
    return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data.error || data.message || 'Request failed') };
  } catch (err) {
    console.warn(`[API] Network error fetching ${url}:`, err);
    return { ok: false, status: 0, data: null, error: err.message };
  }
}

export async function fetchStores() {
  try {
    const { ok, data } = await safeFetchJson(`${API_BASE}/stores`);
    if (ok && Array.isArray(data) && data.length > 0) return data;
    throw new Error('Fallback needed');
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
    const { ok, data } = await safeFetchJson(`${API_BASE}/products`);
    if (ok && Array.isArray(data)) return data;
    throw new Error('Fallback to local');
  } catch (err) {
    console.warn('Fallback to cached products:', err);
    return [];
  }
}

export async function apiMatchBarcode(payload) {
  const { ok, data, error } = await safeFetchJson(`${API_BASE}/products/match-barcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!ok) {
    throw new Error(error || 'Failed to match barcode');
  }
  return data;
}

export async function fetchAuditState(storeId) {
  const { ok, data } = await safeFetchJson(`${API_BASE}/audit/state?storeId=${encodeURIComponent(storeId)}`);
  if (!ok || !data) return { scannedCounts: {}, scanLogs: [] };
  return data;
}

export async function apiSendScan(barcode, storeId, auditorName) {
  const { ok, data, error } = await safeFetchJson(`${API_BASE}/audit/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcode, storeId, auditorName }),
  });
  if (data) {
    return {
      ...data,
      unknownBarcode: data.unknownBarcode || (!data.success ? barcode : undefined),
    };
  }
  return {
    success: false,
    message: error || 'Scan error (offline or server error)',
    unknownBarcode: barcode,
  };
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

