<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { useAuditStore } from '../composables/useAuditStore.js';
import {
  Barcode,
  Volume2,
  VolumeX,
  ClipboardCheck,
  History,
  Building2,
  LogOut,
  TrendingUp,
  Store,
  UploadCloud,
  Layers,
  ChevronDown
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
const { stores, selectedStoreId, selectStore } = useAuditStore();

const cleanUserName = computed(() => {
  if (!currentUser.value?.name) return 'User';
  return currentUser.value.name.replace(/\s*\([^)]*\)/g, '').trim();
});

function handleLogout() {
  logout();
  router.push('/login');
}
</script>

<template>
  <header class="bg-white border-b border-slate-200 text-slate-800 sticky top-0 z-30 shadow-xs">
    <div class="max-w-[1560px] mx-auto px-4 sm:px-6 lg:px-8 py-2">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <!-- Logo & Navigation Tabs -->
        <div class="flex flex-wrap items-center gap-3 sm:gap-4">
          <router-link
            :to="isAdmin ? '/sales' : '/dashboard'"
            class="flex items-center gap-2.5 group"
          >
            <div class="w-9 h-9 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform p-0.5">
              <img
                src="/birmas_logo.png"
                alt="Birmas Logo"
                class="w-full h-full object-contain"
                onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"
              />
              <div class="w-full h-full rounded-lg bg-gradient-to-tr from-teal-600 to-cyan-600 hidden items-center justify-center text-white">
                <ClipboardCheck class="w-4 h-4 text-white" />
              </div>
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <h1 class="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-tight">
                  Birmas Audit Dashboard
                </h1>
                <span class="text-[10px] px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 font-bold">
                  Store & Stock
                </span>
              </div>
              <p class="text-[10px] text-slate-500 hidden sm:block">Store Audit, Stock Station & Sales Report</p>
            </div>
          </router-link>

          <!-- Main Navigation Links with Strict Role Visibility -->
          <nav class="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200/80 flex-wrap">
            <!-- 1. Store Audit Dashboard (2026 / 2025 Inline Switcher) -->
            <div
              v-if="canAccessStoreAudit"
              class="flex items-center bg-white/80 p-0.5 rounded-xl border border-slate-200 shadow-2xs"
            >
              <router-link
                to="/dashboard"
                class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                :class="
                  route.path === '/dashboard'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                "
              >
                <Store class="w-3.5 h-3.5" />
                <span>Store Audit</span>
                <span class="text-[10px] font-mono font-bold px-1 rounded" :class="route.path === '/dashboard' ? 'bg-teal-700/60 text-white' : 'bg-slate-200/70 text-slate-600'">2026</span>
              </router-link>
              <router-link
                to="/dashboard/2025"
                class="px-2 py-1.5 rounded-lg text-xs font-bold transition-all"
                :class="
                  route.path === '/dashboard/2025'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                "
                title="Historical 2025 Store Audit Archive"
              >
                <span>2025</span>
              </router-link>
            </div>

            <!-- 2. Upload Store Audits (Auditor & Superadmin only) -->
            <router-link
              v-if="canAccessUploadAudits"
              to="/upload"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              :class="
                route.path === '/upload'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              "
            >
              <UploadCloud class="w-3.5 h-3.5" />
              <span>Upload Audits</span>
            </router-link>

            <!-- 3. Physical Stock Audit (Auditor & Superadmin only) -->
            <router-link
              v-if="canAccessStockAudit"
              to="/audit"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              :class="
                route.path === '/audit'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              "
            >
              <ClipboardCheck class="w-3.5 h-3.5" />
              <span>Stock Audit</span>
            </router-link>

            <!-- 4. Stock Audit History (Auditor & Superadmin only) -->
            <router-link
              v-if="canAccessAuditRecords"
              to="/history"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              :class="
                route.path === '/history'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              "
            >
              <History class="w-3.5 h-3.5" />
              <span>Audit Records</span>
            </router-link>

            <!-- 5. Sales Report (Admin & Superadmin only) -->
            <router-link
              v-if="canAccessSalesReport"
              to="/sales"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              :class="
                route.path === '/sales'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              "
            >
              <TrendingUp class="w-3.5 h-3.5" />
              <span>Sales Report</span>
            </router-link>
          </nav>
        </div>

        <!-- Right Side: User Profile & Logout (Time removed) -->
        <div class="flex items-center gap-2 sm:gap-3 flex-wrap">
          <!-- Current User Profile & Role Badge (without brackets in username) -->
          <div v-if="currentUser" class="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs">
            <div class="w-6 h-6 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-black text-[11px]">
              {{ cleanUserName.charAt(0) }}
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-bold text-slate-900 leading-tight">{{ cleanUserName }}</span>
                <span
                  class="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider"
                  :class="{
                    'bg-purple-100 text-purple-800 border border-purple-200': isSuperAdmin,
                    'bg-blue-100 text-blue-800 border border-blue-200': isAdmin,
                    'bg-teal-100 text-teal-800 border border-teal-200': isAuditor,
                  }"
                >
                  {{ isSuperAdmin ? 'Superadmin' : (isAdmin ? 'Admin' : 'Auditor') }}
                </span>
              </div>
            </div>
          </div>

          <!-- Sound Mute Toggle (for stock scanner) -->
          <button
            v-if="route.path === '/audit'"
            @click="emit('toggleSound')"
            type="button"
            class="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors shadow-xs cursor-pointer"
            :title="soundEnabled ? 'Mute Scanner Beeper' : 'Unmute Scanner Beeper'"
          >
            <component :is="soundEnabled ? Volume2 : VolumeX" class="w-4 h-4" />
          </button>

          <!-- Logout Button -->
          <button
            @click="handleLogout"
            type="button"
            class="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Log Out"
          >
            <LogOut class="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
