import { createRouter, createWebHistory } from 'vue-router';
import StoreAuditView from '../views/StoreAuditView.vue';
import StoreAudit2025View from '../views/StoreAudit2025View.vue';
import StoreAuditUploadView from '../views/StoreAuditUploadView.vue';
import AuditView from '../views/AuditView.vue';
import AuditHistoryView from '../views/AuditHistoryView.vue';
import SalesReportView from '../views/SalesReportView.vue';
import LoginView from '../views/LoginView.vue';

const routes = [
  {
    path: '/',
    redirect: (to) => {
      try {
        const session = sessionStorage.getItem('birmas_audit_session_v4');
        if (session) {
          const user = JSON.parse(session);
          if (user.role === 'admin') return '/sales';
        }
      } catch {}
      return '/dashboard';
    },
  },
  {
    path: '/dashboard',
    name: 'StoreAudit',
    component: StoreAuditView,
    meta: { requiresAuth: true, allowedRoles: ['auditor', 'superadmin'] },
  },
  {
    path: '/dashboard/2025',
    name: 'StoreAudit2025',
    component: StoreAudit2025View,
    meta: { requiresAuth: true, allowedRoles: ['auditor', 'superadmin'] },
  },
  {
    path: '/upload',
    name: 'StoreAuditUpload',
    component: StoreAuditUploadView,
    meta: { requiresAuth: true, allowedRoles: ['auditor', 'superadmin'] },
  },
  {
    path: '/audit',
    name: 'StockAudit',
    component: AuditView,
    meta: { requiresAuth: true, allowedRoles: ['auditor', 'superadmin'] },
  },
  {
    path: '/history',
    name: 'AuditHistory',
    component: AuditHistoryView,
    meta: { requiresAuth: true, allowedRoles: ['auditor', 'superadmin'] },
  },
  {
    path: '/sales',
    name: 'SalesReport',
    component: SalesReportView,
    meta: { requiresAuth: true, allowedRoles: ['admin', 'superadmin'] },
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
    if (session) {
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
    return next('/dashboard');
  }

  // Strict Role-Based Access Control check
  if (to.meta?.allowedRoles && !to.meta.allowedRoles.includes(userRole)) {
    if (userRole === 'admin') {
      return next('/sales');
    }
    if (userRole === 'auditor') {
      return next('/dashboard');
    }
    return next('/login');
  }

  next();
});

export default router;
