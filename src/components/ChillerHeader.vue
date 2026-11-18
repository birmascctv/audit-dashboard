<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { online, lastUpdatedAt } from '../composables/useSyncStatus.js';
import { authFetchJson } from '../services/authFetch.js';
import {
  ChevronDown,
  ClipboardCheck,
  LogOut,
  Menu,
} from 'lucide-vue-next';

defineProps({
  sidebarOpen: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['toggleNavigation']);
const route = useRoute();
const router = useRouter();
const now = ref(Date.now());
let clockTimer = null;
const profileOpen = ref(false);
const signedInUsers = ref([]);
const sessionsLoading = ref(false);
const sessionsError = ref('');
let sessionsTimer = null;
async function loadSignedInUsers() {
  if (sessionsLoading.value) return;
  sessionsLoading.value = true;
  try {
    const data = await authFetchJson('/api/auth/signed-in-users');
    signedInUsers.value = data.users;
    sessionsError.value = '';
  } catch {
    sessionsError.value = 'Unable to load signed-in users.';
  } finally {
    sessionsLoading.value = false;
  }
}
const updatedLabel = computed(() => {
  if (!lastUpdatedAt.value) return 'Waiting for data';
  const s = Math.max(0, Math.round((now.value - lastUpdatedAt.value) / 1000));
  if (s < 5) return 'Updated just now';
  if (s < 60) return `Updated ${s}s ago`;
  return `Updated ${Math.round(s / 60)}m ago`;
});
const {
  currentUser,
  isAuditor,
  isAdmin,
  isSuperAdmin,
  logout
} = useAuth();

const cleanUserName = computed(() => {
  if (!currentUser.value?.name) return 'User';
  return currentUser.value.name.replace(/\s*\([^)]*\)/g, '').trim();
});
function handleOutsidePointerDown(event) {
  if (!event.target.closest?.('[data-profile-menu]')) profileOpen.value = false;
}

function handleLogout() {
  logout();
  router.push('/login');
}

watch(() => route.fullPath, () => { profileOpen.value = false; });
watch(profileOpen, (open) => {
  clearInterval(sessionsTimer);
  if (open && currentUser.value?.id === 'user-bertha') {
    loadSignedInUsers();
    sessionsTimer = setInterval(loadSignedInUsers, 30000);
  }
});
onMounted(() => {
  clockTimer = setInterval(() => { now.value = Date.now(); }, 5000);
  document.addEventListener('pointerdown', handleOutsidePointerDown);
});
onUnmounted(() => {
  clearInterval(clockTimer);
  clearInterval(sessionsTimer);
  document.removeEventListener('pointerdown', handleOutsidePointerDown);
});
</script>

<template>
  <header class="bg-white border-b border-slate-200 text-slate-800 sticky top-0 z-40 shadow-xs" @keydown.esc="profileOpen = false">
    <div class="max-w-[1560px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-3">
          <button id="sidebar-toggle" type="button" class="rounded-lg border p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500" :aria-label="sidebarOpen ? 'Hide navigation' : 'Show navigation'" aria-controls="main-sidebar" :aria-expanded="sidebarOpen" @click="$emit('toggleNavigation')"><Menu class="h-5 w-5" /></button>
          <router-link :to="isAdmin ? '/sales' : '/store-audit'" class="flex min-w-0 items-center gap-2.5 group">
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

        </div>

        <div class="flex items-center justify-between gap-2 sm:justify-end sm:gap-3 flex-wrap">
          <div class="hidden sm:flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold" :class="online ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'" :title="online ? 'Connected to server' : 'Offline - scans are saved locally'">
            <span class="h-2 w-2 rounded-full" :class="online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'" />
            {{ online ? 'Live' : 'Offline' }}<span v-if="online" class="font-medium text-slate-500">· {{ updatedLabel }}</span>
          </div>

          <div v-if="currentUser" class="relative" data-profile-menu>
            <button type="button" class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-xs hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500" aria-haspopup="true" :aria-expanded="profileOpen" @click="profileOpen = !profileOpen">
              <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-100 text-[11px] font-black text-teal-800">{{ cleanUserName.charAt(0) }}</div>
              <span class="hidden text-xs font-bold leading-tight text-slate-900 sm:inline">{{ cleanUserName }}</span>
              <span
                class="hidden rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider sm:inline"
                :class="{
                  'bg-purple-100 text-purple-800 border border-purple-200': isSuperAdmin,
                  'bg-blue-100 text-blue-800 border border-blue-200': isAdmin,
                  'bg-teal-100 text-teal-800 border border-teal-200': isAuditor,
                }"
              >{{ isSuperAdmin ? 'Superadmin' : (isAdmin ? 'Admin' : 'Auditor') }}</span>
              <ChevronDown class="h-3.5 w-3.5 text-slate-500 transition-transform" :class="profileOpen ? 'rotate-180' : ''" />
            </button>
            <Transition name="menu-slide">
              <div v-if="profileOpen" class="absolute right-0 top-full z-[70] mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5">
                <p class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Signed in as {{ currentUser.username }}</p>
                <div v-if="currentUser.id === 'user-bertha'" class="border-t border-slate-100 px-3 py-2" data-testid="signed-in-users">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-xs font-bold text-slate-800">Signed-in users: {{ signedInUsers.length }}</p>
                    <button type="button" class="text-xs font-bold text-teal-700 disabled:opacity-50" :disabled="sessionsLoading" @click="loadSignedInUsers">Refresh</button>
                  </div>
                  <p v-if="sessionsError" class="mt-1 text-xs text-rose-700">{{ sessionsError }}</p>
                  <p v-else-if="sessionsLoading && !signedInUsers.length" class="mt-1 text-xs text-slate-500">Loading…</p>
                  <ul v-else class="mt-1 max-h-40 overflow-y-auto text-xs text-slate-700">
                    <li v-for="user in signedInUsers" :key="user.id" class="py-1">{{ user.name }} ({{ user.username }})<span v-if="user.sessionCount > 1"> · {{ user.sessionCount }} sessions</span></li>
                  </ul>
                  <p class="mt-1 text-[10px] text-slate-500">Unexpired sessions, including inactive browsers; sessions expire after 1 hour or logout.</p>
                </div>
                <button type="button" class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50" @click="handleLogout"><LogOut class="h-4 w-4" />Logout</button>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.menu-slide-enter-active,
.menu-slide-leave-active { transition: opacity 280ms ease, transform 280ms ease; }
.menu-slide-enter-from,
.menu-slide-leave-to { opacity: 0; transform: translateY(-10px); }
</style>
