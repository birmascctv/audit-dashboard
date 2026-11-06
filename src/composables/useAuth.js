import { ref, computed } from 'vue';
import { getAuthToken, setAuthToken, isSessionExpired } from '../services/authFetch.js';

const AUTH_STORAGE_KEY = 'birmas_audit_session_v4';

export const DEFAULT_ACCOUNTS = [
  {
    id: 'user-superadmin',
    username: 'superadmin',
    email: 'superadmin@birmas.id',
    name: 'Super Admin',
    role: 'superadmin',
    roleLabel: 'Super Admin',
    accessScope: 'Store Audit, Audit Records & Sales Report',
  },
  {
    id: 'user-admin',
    username: 'mia',
    email: 'mia@birmas.id',
    name: 'Mia',
    role: 'admin',
    roleLabel: 'Sales Admin',
    accessScope: 'Sales Report Only',
  },
  {
    id: 'user-chrisna',
    username: 'chrisna',
    email: 'chrisna@birmas.id',
    name: 'Chrisna',
    role: 'auditor',
    roleLabel: 'Store & Stock Auditor',
    accessScope: 'Store Audit, Upload Audits, Stock Audit & Audit Records',
  },
];

// Clean legacy localStorage keys to ensure user is prompted to log in
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('birmas_audit_user_v2');
    localStorage.removeItem('birmas_audit_user_v1');
    localStorage.removeItem('birmas_audit_user');
  } catch {}
}

const currentUser = ref(getStoredUser());

function getStoredUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (raw && !isSessionExpired()) {
      return JSON.parse(raw);
    }
    return null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const isAuthenticated = computed(() => currentUser.value !== null);

  async function loginWithBackend(usernameInput, passwordInput) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput.trim(),
          password: passwordInput.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.user) {
        currentUser.value = data.user;
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user));
          setAuthToken(data.token || '');
        }
        return { success: true, message: data.message || 'Login successful', user: data.user };
      } else {
        return {
          success: false,
          message: data.message || 'Invalid username or password',
        };
      }
    } catch (err) {
      return { success: false, message: err.message || 'Invalid username or password' };
    }
  }

  function logout() {
    const token = getAuthToken();
    if (token) {
      fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
    setAuthToken('');
    currentUser.value = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  const role = computed(() => currentUser.value?.role || '');
  const isAuditor = computed(() => role.value === 'auditor');
  const isAdmin = computed(() => role.value === 'admin');
  const isSuperAdmin = computed(() => role.value === 'superadmin' || role.value === 'owner');
  const isCrew = computed(() => role.value === 'crew');

  // Strict RBAC Access Controls:
  // - Auditor: Store Audit, Upload Audits, Stock Audit, Audit Records
  // - Admin: Sales Report Only
  // - Superadmin: Everything
  const isOwner = computed(() => role.value === 'owner');
  const canAccessStoreAudit = computed(() => ['auditor', 'superadmin', 'owner'].includes(role.value));
  const canAccessUploadAudits = computed(() => ['auditor', 'owner'].includes(role.value));
  const canAccessStockAudit = computed(() => ['auditor', 'owner', 'crew', 'superadmin'].includes(role.value));
  const canAccessCrewPage = computed(() => ['owner', 'crew'].includes(role.value));
  const canAccessAuditRecords = computed(() => ['auditor', 'superadmin', 'owner'].includes(role.value));
  const canAccessSalesReport = computed(() => ['admin', 'superadmin', 'owner'].includes(role.value));

  return {
    currentUser,
    role,
    isAuditor,
    isAdmin,
    isSuperAdmin,
    isCrew,
    canAccessStoreAudit,
    canAccessUploadAudits,
    canAccessStockAudit,
    canAccessCrewPage,
    canAccessAuditRecords,
    canAccessSalesReport,
    isAuthenticated,
    loginWithBackend,
    logout,
    defaultAccounts: DEFAULT_ACCOUNTS,
  };
}
