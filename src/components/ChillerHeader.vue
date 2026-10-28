<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  LogOut,
  Store,
  TrendingUp,
  UploadCloud,
  Volume2,
  VolumeX,
} from 'lucide-vue-next';

defineProps({
  soundEnabled: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['toggleSound', 'openGuide']);
const route = useRoute();
const router = useRouter();
const menuRoot = ref(null);
const auditButton = ref(null);
const dropdownPosition = ref({});
const auditMenuOpen = ref(false);
const storeSubmenuOpen = ref(false);
const {
  currentUser,
  isAuditor,
  isAdmin,
  isSuperAdmin,
  canAccessStoreAudit,
  canAccessUploadAudits,
  canAccessStockAudit,
  canAccessAuditRecords,
  canAccessSalesReport,
  logout
} = useAuth();

const cleanUserName = computed(() => {
  if (!currentUser.value?.name) return 'User';
  return currentUser.value.name.replace(/\s*\([^)]*\)/g, '').trim();
});
const isStoreAuditRoute = computed(() => route.path === '/dashboard' || route.path === '/dashboard/2025');
const isAuditRoute = computed(() => isStoreAuditRoute.value || ['/upload', '/audit', '/history'].includes(route.path));
const canAccessAuditMenu = computed(() =>
  canAccessStoreAudit.value || canAccessUploadAudits.value || canAccessStockAudit.value || canAccessAuditRecords.value
);

function closeMenus() {
  auditMenuOpen.value = false;
  storeSubmenuOpen.value = false;
}

function updateDropdownPosition() {
  const rect = auditButton.value?.getBoundingClientRect();
  if (!rect) return;
  const width = Math.min(288, window.innerWidth - 32);
  dropdownPosition.value = {
    left: `${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`,
    top: `${rect.bottom + 8}px`,
    width: `${width}px`,
  };
}

function toggleAuditMenu() {
  auditMenuOpen.value = !auditMenuOpen.value;
  if (auditMenuOpen.value) {
    storeSubmenuOpen.value = isStoreAuditRoute.value;
    updateDropdownPosition();
  } else {
    storeSubmenuOpen.value = false;
  }
}

function handleOutsidePointerDown(event) {
  if (menuRoot.value && !menuRoot.value.contains(event.target)) closeMenus();
}

function handleLogout() {
  logout();
  closeMenus();
  router.push('/login');
}

watch(() => route.fullPath, closeMenus);
onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointerDown);
  window.addEventListener('resize', updateDropdownPosition);
  window.addEventListener('scroll', updateDropdownPosition, true);
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', handleOutsidePointerDown);
  window.removeEventListener('resize', updateDropdownPosition);
  window.removeEventListener('scroll', updateDropdownPosition, true);
});
</script>

<template>
  <header class="bg-white border-b border-slate-200 text-slate-800 sticky top-0 z-50 shadow-xs" @keydown.esc.stop.prevent="closeMenus">
    <div class="max-w-[1560px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex min-w-0 items-center gap-3">
          <router-link :to="isAdmin ? '/sales' : '/dashboard'" class="flex min-w-0 items-center gap-2.5 group">
            <div class="w-9 h-9 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform p-0.5 shrink-0">
              <img src="/birmas_logo.png" alt="Birmas Logo" class="w-full h-full object-contain" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
              <div class="w-full h-full rounded-lg bg-gradient-to-tr from-teal-600 to-cyan-600 hidden items-center justify-center text-white">
                <ClipboardCheck class="w-4 h-4 text-white" />
              </div>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <h1 class="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-tight">Birmas Audit Dashboard</h1>
                <span class="hidden sm:inline text-[10px] px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 font-bold">Store & Stock</span>
              </div>
              <p class="text-[10px] text-slate-500 hidden sm:block">Store Audit, Stock Station & Sales Report</p>
            </div>
          </router-link>

          <nav ref="menuRoot" class="relative flex shrink-0 items-center gap-2" aria-label="Main navigation">
            <div v-if="canAccessAuditMenu" class="relative">
              <button
                ref="auditButton"
                type="button"
                class="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                :class="isAuditRoute || auditMenuOpen ? 'border-teal-600 bg-teal-600 text-white shadow-xs' : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'"
                aria-haspopup="true"
                aria-controls="audit-navigation-menu"
                :aria-expanded="auditMenuOpen"
                @click="toggleAuditMenu"
              >
                Audit
                <ChevronDown class="w-4 h-4 transition-transform" :class="auditMenuOpen ? 'rotate-180' : ''" />
              </button>

              <div
                v-if="auditMenuOpen"
                id="audit-navigation-menu"
                class="fixed z-[70] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5"
                :style="dropdownPosition"
              >
                <div v-if="canAccessStoreAudit" class="rounded-xl">
                  <button
                    type="button"
                    class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                    :class="isStoreAuditRoute ? 'bg-teal-50 text-teal-800' : 'text-slate-700 hover:bg-slate-100'"
                    aria-controls="store-audit-years"
                    :aria-expanded="storeSubmenuOpen"
                    @click="storeSubmenuOpen = !storeSubmenuOpen"
                  >
                    <span class="flex items-center gap-2"><Store class="h-4 w-4" />Store Audit</span>
                    <ChevronRight class="h-4 w-4 transition-transform" :class="storeSubmenuOpen ? 'rotate-90' : ''" />
                  </button>
                  <div v-if="storeSubmenuOpen" id="store-audit-years" class="ml-7 border-l border-slate-200 py-1 pl-3">
                    <router-link
                      to="/dashboard/2025"
                      class="block rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                      :class="route.path === '/dashboard/2025' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'"
                      @click="closeMenus"
                    >2025</router-link>
                    <router-link
                      to="/dashboard"
                      class="mt-1 block rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                      :class="route.path === '/dashboard' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'"
                      @click="closeMenus"
                    >2026</router-link>
                  </div>
                </div>

                <router-link
                  v-if="canAccessUploadAudits"
                  to="/upload"
                  class="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
                  :class="route.path === '/upload' ? 'bg-teal-600 text-white' : 'text-slate-700 hover:bg-slate-100'"
                  @click="closeMenus"
                ><UploadCloud class="h-4 w-4" />Upload Audits</router-link>
                <router-link
                  v-if="canAccessStockAudit"
                  to="/audit"
                  class="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
                  :class="route.path === '/audit' ? 'bg-teal-600 text-white' : 'text-slate-700 hover:bg-slate-100'"
                  @click="closeMenus"
                ><ClipboardCheck class="h-4 w-4" />Stock Audit</router-link>
                <router-link
                  v-if="canAccessAuditRecords"
                  to="/history"
                  class="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
                  :class="route.path === '/history' ? 'bg-teal-600 text-white' : 'text-slate-700 hover:bg-slate-100'"
                  @click="closeMenus"
                ><ClipboardCheck class="h-4 w-4" />Audit Records</router-link>
              </div>
            </div>

            <router-link
              v-if="canAccessSalesReport"
              to="/sales"
              class="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              :class="route.path === '/sales' ? 'border-teal-600 bg-teal-600 text-white shadow-xs' : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'"
            ><TrendingUp class="h-4 w-4" />Sales Report</router-link>
          </nav>
        </div>

        <div class="flex items-center justify-between gap-2 sm:justify-end sm:gap-3 flex-wrap">
          <div class="flex items-center gap-1">
            <button
              type="button"
              @click="emit('toggleSound')"
              class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              :aria-label="soundEnabled ? 'Mute scanner sounds' : 'Enable scanner sounds'"
              :title="soundEnabled ? 'Mute scanner sounds' : 'Enable scanner sounds'"
            ><Volume2 v-if="soundEnabled" class="h-4 w-4" /><VolumeX v-else class="h-4 w-4" /></button>
            <button
              type="button"
              @click="emit('openGuide')"
              class="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            ><BookOpen class="h-4 w-4" /><span>Guide</span></button>
          </div>

          <div v-if="currentUser" class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-xs">
            <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-100 text-[11px] font-black text-teal-800">{{ cleanUserName.charAt(0) }}</div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-bold leading-tight text-slate-900">{{ cleanUserName }}</span>
                <span
                  class="rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider"
                  :class="{
                    'bg-purple-100 text-purple-800 border border-purple-200': isSuperAdmin,
                    'bg-blue-100 text-blue-800 border border-blue-200': isAdmin,
                    'bg-teal-100 text-teal-800 border border-teal-200': isAuditor,
                  }"
                >{{ isSuperAdmin ? 'Superadmin' : (isAdmin ? 'Admin' : 'Auditor') }}</span>
              </div>
            </div>
          </div>

          <button
            @click="handleLogout"
            type="button"
            class="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            title="Log Out"
          ><LogOut class="h-3.5 w-3.5" /><span>Logout</span></button>
        </div>
      </div>
    </div>
  </header>
</template>
