const AUTH_STORAGE_KEY = 'birmas_audit_session_v4';
const TOKEN_STORAGE_KEY = 'birmas_audit_token_v1';

export const SESSION_EXPIRED_MESSAGE = 'Session expired - please log out and log in again to edit or remove.';

export function getAuthToken() {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {}
}

// Fetch with the session bearer token; resolves to parsed JSON and throws a clear message when the session is missing/expired
export async function authFetchJson(url, options = {}) {
  const token = getAuthToken();
  if (!token) throw new Error(SESSION_EXPIRED_MESSAGE);
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error(SESSION_EXPIRED_MESSAGE);
  if (!res.ok || data.success === false) throw new Error(data.error || data.message || 'Request failed');
  return data;
}

export { AUTH_STORAGE_KEY };
