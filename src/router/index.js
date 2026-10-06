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
    redirect: '/dashboard',
  },
  {
    path: '/dashboard',
    name: 'StoreAudit',
    component: StoreAuditView,
    meta: { requiresAuth: true },
  },
  {
    path: '/dashboard/2025',
    name: 'StoreAudit2025',
    component: StoreAudit2025View,
    meta: { requiresAuth: true },
  },
  {
    path: '/audit',
    name: 'StockAudit',
    component: AuditView,
    meta: { requiresAuth: true },
  },
  {
    path: '/history',
    name: 'AuditHistory',
    component: AuditHistoryView,
    meta: { requiresAuth: true },
  },
  {
    path: '/sales',
    name: 'SalesReport',
    component: SalesReportView,
    meta: { requiresAuth: true },
  },
  {
    path: '/upload',
    name: 'StoreAuditUpload',
    component: StoreAuditUploadView,
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard',
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

  if (to.path !== '/login' && !isAuth) {
    return next('/login');
  }

  if (to.path === '/login' && isAuth) {
    return next('/dashboard');
  }

  next();
});

export default router;
