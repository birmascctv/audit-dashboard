<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from './composables/useAuth.js';
import { isSessionExpired, SESSION_MAX_AGE_MS } from './services/authFetch.js';
import { useToast } from './composables/useToast.js';
import ToastHost from './components/ToastHost.vue';
import ChillerHeader from './components/ChillerHeader.vue';

const route = useRoute();
const router = useRouter();
const { currentUser, logout, canAccessStoreAudit, canAccessUploadAudits, canAccessStockAudit, canAccessCrewPage, canAccessAuditRecords, canAccessSalesReport, canAccessRestockPlanner } = useAuth();
const toast = useToast();
const sidebarOpen = ref(false);
const desktopNavigation = ref(false);
let desktopQuery;

function updateNavigationBreakpoint(event) {
  desktopNavigation.value = event.matches;
  sidebarOpen.value = event.matches && route.path !== '/login';
}

async function closeSidebar(restoreFocus = false) {
  sidebarOpen.value = false;
  if (restoreFocus) {
    await nextTick();
    document.getElementById('sidebar-toggle')?.focus();
  }
}

const pageNames = {
  '/store-audit': ['Audit', 'Store Audit', '2026'],
  '/store-audit2025': ['Audit', 'Store Audit', '2025'],
  '/upload-audits': ['Audit', 'Upload Audits'],
  '/stock-audit': ['Audit', 'Stock Audit'],
  '/stock-audit-crew': ['Audit', 'Stock Audit', 'Crew'],
  '/audit-records': ['Audit', 'Audit Records'],
  '/sales': ['Sales Report'],
  '/sales/esb-analytics': ['Sales Report', 'ESB Analytics'],
  '/purchasing': ['Purchasing'],
};
const crumbs = computed(() => pageNames[route.path] || []);
const navItems = computed(() => [
  canAccessStoreAudit.value && { to: '/store-audit', label: 'Store Audit 2026' },
  canAccessStoreAudit.value && { to: '/store-audit2025', label: 'Store Audit 2025' },
  canAccessUploadAudits.value && { to: '/upload-audits', label: 'Upload Audits' },
  canAccessStockAudit.value && { to: canAccessCrewPage.value && currentUser.value?.role === 'crew' ? '/stock-audit-crew' : '/stock-audit', label: 'Stock Audit' },
  canAccessAuditRecords.value && { to: '/audit-records', label: 'Audit Records' },
  canAccessSalesReport.value && { to: '/sales', label: 'Sales Report' },
  canAccessRestockPlanner.value && { to: '/purchasing', label: 'Purchasing' },
].filter(Boolean));
watch(() => route.fullPath, (path, previous) => {
  if (path === '/login' || !desktopNavigation.value) sidebarOpen.value = false;
  else if (previous === '/login') sidebarOpen.value = true;
});

let warned = false;
function onKey(e) {
  if (e.key === 'Escape' && sidebarOpen.value &&
      (!desktopNavigation.value || document.getElementById('main-sidebar')?.contains(e.target) || e.target?.id === 'sidebar-toggle')) {
    closeSidebar(true);
    return;
  }
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
onMounted(() => {
  desktopQuery = window.matchMedia('(min-width: 1024px)');
  updateNavigationBreakpoint(desktopQuery);
  desktopQuery.addEventListener('change', updateNavigationBreakpoint);
  document.addEventListener('keydown', onKey);
  enforceExpiry();
  expiryTimer = setInterval(enforceExpiry, 5000);
});
onUnmounted(() => {
  clearInterval(expiryTimer);
  desktopQuery?.removeEventListener('change', updateNavigationBreakpoint);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div class="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
    <!-- Header (shown on all pages except login) -->
    <ChillerHeader v-if="route.path !== '/login'" :sidebar-open="sidebarOpen" @toggle-navigation="sidebarOpen = !sidebarOpen" />

    <div class="flex flex-1 min-w-0">
    <button v-if="sidebarOpen && route.path !== '/login'" type="button" class="fixed inset-0 z-50 bg-slate-950/50 lg:hidden" aria-label="Close navigation" @click="closeSidebar(true)"></button>
    <aside v-if="route.path !== '/login'" id="main-sidebar" class="fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] overflow-hidden bg-white shadow-xl transition-[width,transform,visibility] duration-200 lg:sticky lg:top-16 lg:z-0 lg:h-[calc(100vh-4rem)] lg:max-w-none lg:shrink-0 lg:shadow-none" :class="sidebarOpen ? 'visible translate-x-0 lg:w-56 lg:border-r lg:border-slate-200' : 'invisible -translate-x-full lg:w-0 lg:translate-x-0'" :inert="!sidebarOpen" :aria-hidden="!sidebarOpen">
      <div class="h-full w-64 max-w-[85vw] overflow-y-auto p-4 lg:w-56 lg:max-w-none">
      <div class="mb-4 flex items-center justify-between"><span class="text-xs font-bold uppercase tracking-wider text-slate-500">Navigation</span><button class="rounded border px-3 py-1 text-sm" type="button" @click="closeSidebar(true)">Close</button></div>
      <nav class="space-y-1" aria-label="Main navigation">
        <router-link v-for="n in navItems" :key="n.to" :to="n.to" class="block rounded-lg px-3 py-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-teal-600" :class="route.path === n.to || (n.to === '/sales' && route.path.startsWith('/sales/')) ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'" :aria-current="route.path === n.to ? 'page' : undefined" @click="!desktopNavigation && closeSidebar()">{{ n.label }}</router-link>
      </nav>
      </div>
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
    <nav v-if="crumbs.length && route.path !== '/login'" class="max-w-[1560px] w-full mx-auto px-4 sm:px-8 pt-3 text-xs text-slate-500 items-center gap-1.5 flex" aria-label="Breadcrumb">
      <template v-for="(c, i) in crumbs" :key="c">
        <span v-if="i" class="text-slate-300">/</span>
        <router-link v-if="route.path === '/sales/esb-analytics' && i === 0" to="/sales" class="hover:text-teal-700">{{ c }}</router-link>
        <span v-else :aria-current="i === crumbs.length - 1 ? 'page' : undefined" :class="i === crumbs.length - 1 ? 'font-bold text-slate-800' : ''">{{ c }}</span>
      </template>
    </nav>

    <!-- Routed View with generous left & right gutters -->
    <main
      class="flex-1 w-full"
      :class="route.path === '/login' ? '' : 'max-w-[1560px] mx-auto px-4 sm:px-8 py-5 sm:py-8'"
    >
      <router-view />
    </main>

    <!-- Footer -->
    <footer
      v-if="route.path !== '/login'"
      class="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500"
    >
      <div class="max-w-[1560px] mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>
          Birmas Store Stock Audit Station • Synchronized with ESB Inventory
        </p>
      </div>
    </footer>
    </div>
    </div>

    <ToastHost />
  </div>
</template>
