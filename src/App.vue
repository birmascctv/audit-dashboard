<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from './composables/useAuth.js';
import { isSessionExpired, SESSION_MAX_AGE_MS } from './services/authFetch.js';
import { useToast } from './composables/useToast.js';
import ToastHost from './components/ToastHost.vue';
import ChillerHeader from './components/ChillerHeader.vue';
import OnboardingCard from './components/OnboardingCard.vue';

const route = useRoute();
const router = useRouter();
const { currentUser, logout, canAccessStoreAudit, canAccessUploadAudits, canAccessStockAudit, canAccessAuditRecords, canAccessSalesReport } = useAuth();
const toast = useToast();

const pageNames = {
  '/store-audit': ['Audit', 'Store Audit', '2026'],
  '/store-audit2025': ['Audit', 'Store Audit', '2025'],
  '/upload-audits': ['Audit', 'Upload Audits'],
  '/stock-audit': ['Audit', 'Stock Audit'],
  '/stock-audit-crew': ['Audit', 'Stock Audit', 'Crew'],
  '/audit-records': ['Audit', 'Audit Records'],
  '/sales': ['Sales Report'],
};
const crumbs = computed(() => pageNames[route.path] || []);
const navItems = computed(() => [
  canAccessStoreAudit.value && { to: '/store-audit', label: 'Store' },
  canAccessUploadAudits.value && { to: '/upload-audits', label: 'Upload' },
  canAccessStockAudit.value && { to: '/stock-audit', label: 'Stock' },
  canAccessAuditRecords.value && { to: '/audit-records', label: 'Records' },
  canAccessSalesReport.value && { to: '/sales', label: 'Sales' },
].filter(Boolean));

let warned = false;
function onKey(e) {
  const tag = (e.target?.tagName || '').toLowerCase();
  if (e.key !== '/' || ['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable) return;
  const box = document.querySelector('input[type="search"], input[placeholder*="earch" i]');
  if (box) { e.preventDefault(); box.focus(); box.select?.(); }
}

// Force logout one hour after login
let expiryTimer = null;
function enforceExpiry() {
  const at = Number(sessionStorage.getItem('birmas_audit_login_at'));
  if (currentUser.value && at && !warned && Date.now() - at >= SESSION_MAX_AGE_MS - 60000) {
    warned = true;
    toast.error('You will be logged out in 1 minute. Finish and save your work.', 15000);
  }
  if (currentUser.value && isSessionExpired()) {
    logout();
    router.replace('/login');
  }
}
onMounted(() => { document.addEventListener('keydown', onKey); enforceExpiry(); expiryTimer = setInterval(enforceExpiry, 5000); });
onUnmounted(() => { clearInterval(expiryTimer); document.removeEventListener('keydown', onKey); });
</script>

<template>
  <div class="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
    <!-- Header (shown on all pages except login) -->
    <ChillerHeader
      v-if="route.path !== '/login'"
    />

    <nav v-if="crumbs.length && route.path !== '/login'" class="max-w-[1560px] w-full mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 pt-3 text-xs text-slate-500 hidden sm:flex items-center gap-1.5" aria-label="Breadcrumb">
      <template v-for="(c, i) in crumbs" :key="c">
        <span v-if="i" class="text-slate-300">/</span>
        <span :class="i === crumbs.length - 1 ? 'font-bold text-slate-800' : ''">{{ c }}</span>
      </template>
    </nav>

    <OnboardingCard />

    <!-- Routed View with generous left & right gutters -->
    <main
      class="flex-1 w-full"
      :class="route.path === '/login' ? '' : 'max-w-[1560px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 py-8'"
    >
      <router-view />
    </main>

    <!-- Footer -->
    <footer
      v-if="route.path !== '/login'"
      class="border-t border-slate-200 bg-white py-4 pb-20 sm:pb-4 text-center text-xs text-slate-500"
    >
      <div class="max-w-[1560px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>
          Birmas Store Stock Audit Station • Synchronized with ESB Inventory
        </p>
      </div>
    </footer>

    <ToastHost />

    <nav v-if="route.path !== '/login' && navItems.length" class="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-slate-200 flex justify-around py-1.5 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]" aria-label="Mobile navigation">
      <router-link
        v-for="n in navItems"
        :key="n.to"
        :to="n.to"
        class="flex-1 text-center py-2.5 text-[11px] font-bold rounded-lg mx-0.5"
        :class="route.path === n.to || (n.to === '/store-audit' && route.path === '/store-audit2025') ? 'bg-teal-600 text-white' : 'text-slate-600'"
      >{{ n.label }}</router-link>
    </nav>
  </div>
</template>
