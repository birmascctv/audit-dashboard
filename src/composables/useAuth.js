import { ref, computed } from 'vue';

const AUTH_STORAGE_KEY = 'birmas_audit_session_v4';

export const DEFAULT_ACCOUNTS = [
  {
    id: 'user-superadmin',
    username: 'superadmin',
    email: 'superadmin@birmas.id',
    name: 'Super Admin',
    role: 'superadmin',
    roleLabel: 'Super Admin',
    accessScope: 'Store Audit, Upload Audits, Stock Audit, Audit Records & Sales Report',
    hint: 'Password: superadmin666',
  },
  {
    id: 'user-admin',
    username: 'admin',
    email: 'admin@birmas.id',
    name: 'Admin',
    role: 'admin',
    roleLabel: 'Sales Admin',
    accessScope: 'Sales Report Only',
    hint: 'Password: admin666',
  },
  {
    id: 'user-chrisna',
    username: 'chrisna',
    email: 'chrisna@birmas.id',
    name: 'Chrisna',
    role: 'auditor',
    roleLabel: 'Store & Stock Auditor',
    accessScope: 'Store Audit, Upload Audits, Stock Audit & Audit Records',
    hint: 'Password: auditor666',
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
    if (raw) {
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
        }
        return { success: true, message: data.message || 'Login successful', user: data.user };
      } else {
        return {
          success: false,
          message: data.message || 'Invalid username or password',
        };
      }
    } catch (err) {
      // Local fallback if server unreachable
      const cleanUser = usernameInput.trim().toLowerCase();
      const matched = DEFAULT_ACCOUNTS.find(
        (u) => u.username.toLowerCase() === cleanUser || u.email.toLowerCase() === cleanUser
      );
      if (
        matched &&
        ((cleanUser === 'superadmin' && passwordInput === 'superadmin666') ||
         (cleanUser === 'admin' && passwordInput === 'admin666') ||
         (cleanUser === 'chrisna' && passwordInput === 'auditor666') ||
         (cleanUser === 'auditor' && passwordInput === 'auditor666'))
      ) {
        currentUser.value = matched;
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(matched));
        }
        return { success: true, message: 'Logged in successfully', user: matched };
      }
      return { success: false, message: err.message || 'Invalid username or password' };
    }
  }

  function logout() {
    currentUser.value = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  const role = computed(() => currentUser.value?.role || '');
  const isAuditor = computed(() => role.value === 'auditor');
  const isAdmin = computed(() => role.value === 'admin');
  const isSuperAdmin = computed(() => role.value === 'superadmin');

  // Strict RBAC Access Controls:
  // - Auditor: Store Audit, Upload Audits, Stock Audit, Audit Records
  // - Admin: Sales Report Only
  // - Superadmin: Everything
  const canAccessStoreAudit = computed(() => role.value === 'auditor' || role.value === 'superadmin');
  const canAccessUploadAudits = computed(() => role.value === 'auditor' || role.value === 'superadmin');
  const canAccessStockAudit = computed(() => role.value === 'auditor' || role.value === 'superadmin');
  const canAccessAuditRecords = computed(() => role.value === 'auditor' || role.value === 'superadmin');
  const canAccessSalesReport = computed(() => role.value === 'admin' || role.value === 'superadmin');

  return {
    currentUser,
    role,
    isAuditor,
    isAdmin,
    isSuperAdmin,
    canAccessStoreAudit,
    canAccessUploadAudits,
    canAccessStockAudit,
    canAccessAuditRecords,
    canAccessSalesReport,
    isAuthenticated,
    loginWithBackend,
    logout,
    defaultAccounts: DEFAULT_ACCOUNTS,
  };
}
