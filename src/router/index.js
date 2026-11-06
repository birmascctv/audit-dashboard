import { createRouter, createWebHistory } from 'vue-router';
import StoreAuditView from '../views/StoreAuditView.vue';
import StoreAudit2025View from '../views/StoreAudit2025View.vue';
import StoreAuditUploadView from '../views/StoreAuditUploadView.vue';
import AuditView from '../views/AuditView.vue';
import AuditHistoryView from '../views/AuditHistoryView.vue';
import SalesReportView from '../views/SalesReportView.vue';
import LoginView from '../views/LoginView.vue';
import { isSessionExpired } from '../services/authFetch.js';

const routes = [
  {
    path: '/',
    redirect: (to) => {
      try {
        const session = sessionStorage.getItem('birmas_audit_session_v4');
        if (session) {
          const user = JSON.parse(session);
          if (user.role === 'admin') return '/sales';
          if (user.role === 'crew') return '/stock-audit-crew';
        }
      } catch {}
      return '/store-audit';
    },
  },
  { path: '/dashboard', redirect: '/store-audit' },
  { path: '/dashboard/2025', redirect: '/store-audit2025' },
  { path: '/upload', redirect: '/upload-audits' },
  { path: '/audit', redirect: '/stock-audit' },
  { path: '/history', redirect: '/audit-records' },
  {
    path: '/store-audit',
    name: 'StoreAudit',
    component: StoreAuditView,
    meta: { requiresAuth: true, allowedRoles: ['auditor', 'superadmin', 'owner'] },
  },
  {
    path: '/store-audit2025',
    name: 'StoreAudit2025',
    component: StoreAudit2025View,
    meta: { requiresAuth: true, allowedRoles: ['auditor', 'superadmin', 'owner'] },
  },
  {
    path: '/upload-audits',
    name: 'StoreAuditUpload',
    component: StoreAuditUploadView,
    meta: { requiresAuth: true, allowedRoles: ['auditor', 'owner'] },
  },
  {
    path: '/stock-audit',
    name: 'StockAudit',
    component: AuditView,
    meta: { requiresAuth: true, allowedRoles: ['auditor', 'owner', 'superadmin'] },
  },
  ...(import.meta.env.DEV ? [{
    path: '/stock-audit-crew',
    name: 'StockAuditCrew',
    component: AuditView,
    props: { mode: 'crew' },
    meta: { requiresAuth: true, allowedRoles: ['owner', 'crew'] },
  }] : []),
  {
    path: '/audit-records',
    name: 'AuditHistory',
    component: AuditHistoryView,
    meta: { requiresAuth: true, allowedRoles: ['auditor', 'superadmin', 'owner'] },
  },
  {
    path: '/sales',
    name: 'SalesReport',
    component: SalesReportView,
    meta: { requiresAuth: true, allowedRoles: ['admin', 'superadmin', 'owner'] },
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0, left: 0, behavior: 'instant' };
  },
});

router.beforeEach((to, from, next) => {
  let user = null;
  try {
    const session = sessionStorage.getItem('birmas_audit_session_v4');
    if (session && !isSessionExpired()) {
      user = JSON.parse(session);
    }
  } catch {
    user = null;
  }

  const isAuth = !!user;
  const userRole = user?.role || '';

  if (to.path !== '/login' && !isAuth) {
    return next('/login');
  }

  if (to.path === '/login' && isAuth) {
    if (userRole === 'admin') {
      return next('/sales');
    }
    if (userRole === 'crew') return next('/stock-audit-crew');
    return next('/store-audit');
  }

  // Strict Role-Based Access Control check
  if (to.meta?.allowedRoles && !to.meta.allowedRoles.includes(userRole)) {
    if (userRole === 'admin') {
      return next('/sales');
    }
    if (userRole === 'auditor') {
      return next('/store-audit');
    }
    if (userRole === 'crew') return next('/stock-audit-crew');
    if (userRole === 'superadmin' || userRole === 'owner') {
      return next('/store-audit');
    }
    return next('/login');
  }

  next();
});

export default router;
