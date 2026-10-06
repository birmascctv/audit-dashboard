<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuditStore } from '../composables/useAuditStore.js';
import { useScanner } from '../composables/useScanner.js';
import { useAuth } from '../composables/useAuth.js';
import { playScanMatchSound, playScanSuccessSound, playScanErrorSound } from '../utils/audio.js';
import { formatDateTime } from '../utils/storage.js';
import AddBarcodeModal from '../components/AddBarcodeModal.vue';

import {
  Barcode,
  Building2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileText,
  Search,
  Check,
  Plus,
  Minus,
  RotateCcw,
  Sparkles,
  Download,
  ChevronDown,
  Layers,
  Database,
  ExternalLink,
  Package,
  Trash2,
  Zap,
  Settings
} from 'lucide-vue-next';

const { currentUser } = useAuth();
const {
  stores,
  selectedStoreId,
  currentStore,
  wpConfig,
  auditItems,
  scanLogs,
  totalWpExpected,
  totalScanned,
  storeItemsCount,
  matchedVariantsCount,
  missingVariantsCount,
  surplusVariantsCount,
  unscannedVariantsCount,
  netDiscrepancyBottles,
  isAutoCheckerActive,
  lastCheckedAt,
  registerAuditScan,
  decrementAuditCount,
  setAuditCount,
  resetCurrentAudit,
  selectStore,
  syncFromWordPress,
  syncFromESBDirect,
  syncFromESBERP,
  syncFromBirmasServer,
  finalizeAudit,
  isSyncing,
  lastSyncStatus,
} = useAuditStore();

const searchQuery = ref('');
const statusFilter = ref('ALL');
const brandFilter = ref('ALL');

// Modals
const isCompleteModalOpen = ref(false);
const isAddBarcodeModalOpen = ref(false);
const isSessionModalOpen = ref(false);
const birmasSyncTab = ref('birmas'); // 'birmas' | 'curl'
const isSyncingBirmas = ref(false);
const rawCurlInput = ref('');
const isSavingSession = ref(false);
const sessionStatusMsg = ref('');
const pendingUnknownBarcode = ref('');
const isFinalizing = ref(false);
const auditNotes = ref('');
const pushToWordPressOnFinalize = ref(true);
const birmasServerUrlInput = ref('https://admin.birmas.id');

async function loadBirmasConfig() {
  try {
    const res = await fetch('/api/birmas/config');
    const data = await res.json();
    if (data.birmasServerUrl) {
      birmasServerUrlInput.value = data.birmasServerUrl;
    }
  } catch {}
}

async function handleBirmasServerSync() {
  isSyncingBirmas.value = true;
  sessionStatusMsg.value = '';
  try {
    if (birmasServerUrlInput.value.trim()) {
      await fetch('/api/birmas/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birmasServerUrl: birmasServerUrlInput.value.trim() }),
      });
    }
    const res = await syncFromBirmasServer();
    if (res.success) {
      sessionStatusMsg.value = `Successfully pulled fresh stock from Birmas Central Server! (${res.totalSyncedProducts || 0} items updated)`;
      setTimeout(() => {
        isSessionModalOpen.value = false;
        sessionStatusMsg.value = '';
      }, 1800);
    } else {
      sessionStatusMsg.value = res.error || res.message || 'Failed to pull from Birmas server';
    }
  } catch (err) {
    sessionStatusMsg.value = err.message;
  } finally {
    isSyncingBirmas.value = false;
  }
}

async function saveSessionFromCurl() {
  if (!rawCurlInput.value.trim()) return;
  isSavingSession.value = true;
  sessionStatusMsg.value = '';
  try {
    const res = await fetch('/api/esb/erp-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawCurl: rawCurlInput.value }),
    });
    const data = await res.json();
    if (data.success) {
      sessionStatusMsg.value = 'Session updated successfully! Syncing fresh stock...';
      rawCurlInput.value = '';
      await syncFromESBERP();
      setTimeout(() => {
        isSessionModalOpen.value = false;
        sessionStatusMsg.value = '';
      }, 1500);
    } else {
      sessionStatusMsg.value = data.message || 'Failed to update session';
    }
  } catch (err) {
    sessionStatusMsg.value = err.message;
  } finally {
    isSavingSession.value = false;
  }
}

const editingBarcode = ref(null);
const editCountValue = ref(0);

// Hardware scanner hook for USB / Wireless Barcode Scanner
const { scanFeedback, processBarcode } = useScanner({
  soundEnabled: true,
  onScan: async (scannedBarcode) => {
    const result = await registerAuditScan(scannedBarcode, currentUser.value?.name || 'Auditor');
    if (result.success) {
      if (result.isMatchedNow) {
        playScanMatchSound();
      } else if (result.isOvercount) {
        playScanErrorSound();
      } else {
        playScanSuccessSound();
      }
    } else {
      playScanErrorSound();
      if (result.unknownBarcode) {
        pendingUnknownBarcode.value = result.unknownBarcode;
      }
    }
    return result;
  },
});

// All items in catalog filtered for the main comparison table
const filteredItems = computed(() => {
  return auditItems.value.filter((item) => {
    if (brandFilter.value !== 'ALL' && (item.subCategory !== brandFilter.value && item.brand !== brandFilter.value)) {
      return false;
    }
    if (statusFilter.value === 'discrepancy') {
      return item.status === 'missing' || item.status === 'surplus';
    }
    if (statusFilter.value === 'matched') {
      return item.status === 'matched';
    }
    if (statusFilter.value === 'unscanned') {
      return item.status === 'unscanned';
    }
    if (searchQuery.value && searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      const bCode = String(item.barcode || '').toLowerCase();
      const bBrand = String(item.subCategory || item.brand || '').toLowerCase();
      const bTitle = String(item.productTitle || item.varian || '').toLowerCase();
      const bSku = String(item.sku || '').toLowerCase();

      const match =
        bCode.includes(q) ||
        bBrand.includes(q) ||
        bTitle.includes(q) ||
        bSku.includes(q);
      if (!match) return false;
    }
    return true;
  });
});

// ONLY products that have been physically scanned in this session (scannedCount > 0)
const scannedOnlyItems = computed(() => {
  return auditItems.value.filter((item) => item.scannedCount > 0);
});

const accuracyPercentage = computed(() => {
  const activeItems = auditItems.value.filter((i) => i.wpExpectedQty > 0 || i.scannedCount > 0);
  if (activeItems.length === 0) return 100;
  const matched = activeItems.filter((i) => i.status === 'matched').length;
  return Math.round((matched / activeItems.length) * 100);
});

function handleScanSimulate(barcode) {
  processBarcode(barcode);
}

function startEdit(item) {
  editingBarcode.value = item.barcode;
  editCountValue.value = item.scannedCount;
}

function saveEdit(item) {
  if (editCountValue.value >= 0) {
    setAuditCount(item.barcode, Number(editCountValue.value));
  }
  editingBarcode.value = null;
}

function handleResetAuditSession() {
  if (confirm(`Clear all physically scanned counts for ${currentStore.value.name} and restart count?`)) {
    resetCurrentAudit();
  }
}

async function handleFinalizeAudit() {
  isFinalizing.value = true;
  try {
    await finalizeAudit(
      currentUser.value?.name || 'Store Auditor',
      auditNotes.value,
      pushToWordPressOnFinalize.value
    );
    isCompleteModalOpen.value = false;
    auditNotes.value = '';
    alert('Audit successfully signed off and stored in backend history!');
  } catch (err) {
    alert('Failed to finalize audit: ' + err.message);
  } finally {
    isFinalizing.value = false;
  }
}

function openAddBarcodeWithPrefill(barcode) {
  pendingUnknownBarcode.value = barcode || '';
  isAddBarcodeModalOpen.value = true;
}

onMounted(() => {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  if (document.documentElement) document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
  loadBirmasConfig();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Top Bar: Birmas Store Selector & ESB Status (Light Gray & Tosca Theme) -->
    <div class="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <!-- Store Location Selector (Overall Store without chiller labels) -->
      <div class="flex items-center gap-3.5">
        <div class="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0 shadow-sm">
          <Building2 class="w-6 h-6" />
        </div>
        <div>
          <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            STORE LOCATION UNDER AUDIT
          </span>
          <div class="relative inline-block mt-0.5">
            <select
              :value="selectedStoreId"
              @change="selectStore($event.target.value)"
              class="appearance-none bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-900 font-extrabold text-base sm:text-lg rounded-xl pl-3 pr-8 py-1.5 focus:outline-none focus:border-teal-500 cursor-pointer transition-colors"
            >
              <option v-for="s in stores" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select>
            <ChevronDown class="w-4 h-4 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      <!-- Action Bar: Add Barcode, Sync WordPress/ESB, Finalize -->
      <div class="flex flex-wrap items-center gap-2 sm:gap-2.5">
        <!-- Add New Barcode Button -->
        <button
          @click="openAddBarcodeWithPrefill()"
          type="button"
          class="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          title="Add a new barcode based on WordPress variant or entirely new product"
        >
          <Plus class="w-3.5 h-3.5 text-teal-700" />
          <span>Add New Barcode</span>
        </button>

        <!-- Refresh Stock Button (Birmas Central Server) -->
        <button
          @click="handleBirmasServerSync"
          :disabled="isSyncing || isSyncingBirmas"
          type="button"
          class="px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
          title="Refresh real-time catalog & stock from Birmas Central Server"
        >
          <RefreshCw class="w-3.5 h-3.5 text-teal-600" :class="{ 'animate-spin': isSyncing || isSyncingBirmas }" />
          <span>{{ isSyncing || isSyncingBirmas ? 'Syncing...' : 'Refresh Stock' }}</span>
        </button>

        <!-- Sync Settings Button -->
        <button
          @click="isSessionModalOpen = true"
          type="button"
          class="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-300 transition-colors shadow-sm cursor-pointer"
          title="Server Sync Settings"
        >
          <Settings class="w-4 h-4" />
        </button>

        <!-- Finalize Audit Button -->
        <button
          @click="isCompleteModalOpen = true"
          type="button"
          class="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all cursor-pointer"
        >
          <CheckCircle2 class="w-4 h-4" />
          <span>Complete Audit</span>
        </button>
      </div>
    </div>

    <!-- Live Direct ESB Sync Status Banner -->
    <transition enter-active-class="transition duration-300 ease-out" enter-from-class="opacity-0 -translate-y-2" enter-to-class="opacity-100 translate-y-0" leave-active-class="transition duration-200 ease-in" leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity-0 -translate-y-2">
      <div
        v-if="lastSyncStatus"
        class="p-4 rounded-2xl flex items-center justify-between text-xs font-bold border shadow-sm transition-all"
        :class="lastSyncStatus.success ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'"
      >
        <div class="flex items-center gap-2.5">
          <CheckCircle2 v-if="lastSyncStatus.success" class="w-5 h-5 text-emerald-600 shrink-0" />
          <AlertCircle v-else class="w-5 h-5 text-rose-600 shrink-0" />
          <span class="text-sm font-semibold">{{ lastSyncStatus.message }}</span>
        </div>
        <button
          @click="lastSyncStatus = null"
          type="button"
          class="p-1 rounded-lg hover:bg-black/5 text-slate-500 cursor-pointer"
          title="Dismiss"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </transition>

    <!-- Counting Station (Light theme with tosca accents) -->
    <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
      <div class="relative z-10 flex flex-col gap-4">
        <!-- Top header of the counting station -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-200">
              <Barcode class="w-4 h-4" />
            </div>
            <div>
              <h2 class="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>{{ currentStore.name }} Store Counting Station</span>
                <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 border border-teal-300 text-teal-700">
                  Barcode Scanner Ready
                </span>
              </h2>
              <p class="text-xs text-slate-500">
                Scan each bottle 1 time for every physical can in the store. (Pindai 1 kali untuk setiap botol/kaleng di toko).
              </p>
            </div>
          </div>

          <!-- Reset session button -->
          <div class="flex items-center gap-2">
            <button
              @click="handleResetAuditSession"
              type="button"
              class="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw class="w-3.5 h-3.5" />
              <span>Reset Physical Count</span>
            </button>
          </div>
        </div>

        <!-- Main Barcode Input Field -->
        <div class="relative flex items-center">
          <div class="absolute left-4 flex items-center pointer-events-none text-teal-600">
            <Barcode class="w-6 h-6 animate-pulse" />
          </div>
          <input
            id="scanner-main-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="Scan barcode with USB/Wireless scanner (aim and scan bottle)..."
            class="w-full pl-13 pr-28 py-3.5 bg-slate-50 text-slate-900 placeholder-slate-400 text-base font-mono rounded-xl border-2 border-slate-300 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-100 transition-all shadow-inner"
            @keydown.enter.prevent="processBarcode($event.target.value); $event.target.value = ''"
          />
          <span class="absolute right-3 px-2.5 py-1 rounded bg-white border border-slate-300 text-[11px] font-mono text-teal-700 font-semibold shadow-sm">
            Auto-Enter
          </span>
        </div>

        <!-- Unknown Barcode Notice & Quick Add Action -->
        <div
          v-if="pendingUnknownBarcode"
          class="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs gap-3"
        >
          <div class="flex items-center gap-2">
            <AlertTriangle class="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Unregistered Barcode scanned: <strong class="font-mono">{{ pendingUnknownBarcode }}</strong>.
              Not found in database for {{ currentStore.name }}.
            </span>
          </div>
          <button
            @click="openAddBarcodeWithPrefill(pendingUnknownBarcode)"
            class="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shrink-0 flex items-center gap-1 shadow-sm"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Map Barcode Now</span>
          </button>
        </div>

        <!-- Feedback Alert -->
        <div
          v-if="scanFeedback.type !== 'idle'"
          class="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
          :class="
            scanFeedback.type === 'success'
              ? 'bg-teal-50 border-teal-300 text-teal-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          "
        >
          <component
            :is="scanFeedback.type === 'success' ? CheckCircle2 : AlertTriangle"
            class="w-5 h-5 shrink-0"
            :class="scanFeedback.type === 'success' ? 'text-teal-600' : 'text-rose-600'"
          />
          <div class="flex-1 text-sm font-semibold">
            {{ scanFeedback.message }}
          </div>
          <span class="text-xs font-mono font-bold" :class="scanFeedback.type === 'success' ? 'text-teal-700' : 'text-rose-700'">
            {{ scanFeedback.type === 'success' ? 'Recorded' : 'Alert' }}
          </span>
        </div>

        <!-- Dedicated Live Table of SCANNED PRODUCTS ONLY -->
        <div class="pt-2">
          <div class="flex items-center justify-between mb-2.5">
            <div class="flex items-center gap-2">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Package class="w-4 h-4 text-teal-600" />
                <span>Live Scanned Products Summary (Produk Terpindai Sesi Ini)</span>
              </h3>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-mono font-bold">
                {{ scannedOnlyItems.length }} SKUs Counted
              </span>
            </div>

            <!-- Quick simulator trigger if no scanner connected -->
            <div class="flex items-center gap-2">
              <select
                @change="if ($event.target.value) { handleScanSimulate($event.target.value); $event.target.value = ''; }"
                class="text-[11px] bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-slate-700 cursor-pointer focus:outline-none focus:border-teal-500"
              >
                <option value="">+ Test Scan Item...</option>
                <option v-for="item in auditItems" :key="item.barcode" :value="item.barcode">
                  {{ item.brand }} {{ item.varian }} ({{ item.barcode }})
                </option>
              </select>
            </div>
          </div>

          <!-- The Scanned Only Table -->
          <div class="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
            <div v-if="scannedOnlyItems.length === 0" class="py-8 text-center px-4">
              <div class="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto mb-2">
                <Barcode class="w-5 h-5" />
              </div>
              <p class="text-xs font-semibold text-slate-700">
                No products scanned yet for {{ currentStore.name }}.
              </p>
              <p class="text-[11px] text-slate-500 mt-0.5">
                Aim your barcode scanner at any bottle or can to start counting. (Belum ada produk yang dipindai).
              </p>
            </div>

            <table v-else class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-100/90 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th class="py-2.5 px-3 w-10 text-center">No</th>
                  <th class="py-2.5 px-3">Kode Barcode</th>
                  <th class="py-2.5 px-3">Brand & Product Variant</th>
                  <th class="py-2.5 px-3 text-center">ESB Stock</th>
                  <th class="py-2.5 px-3 text-center bg-teal-50/80 text-teal-900 font-bold">Physical Count</th>
                  <th class="py-2.5 px-3 text-center">Difference</th>
                  <th class="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/80 bg-white">
                <tr
                  v-for="(item, sIdx) in scannedOnlyItems"
                  :key="item.barcode"
                  class="hover:bg-slate-50 transition-colors"
                >
                  <td class="py-2 px-3 text-center font-mono text-slate-500 text-[11px]">
                    {{ sIdx + 1 }}
                  </td>
                  <td class="py-2 px-3 font-mono font-medium text-teal-800 text-[11px]">
                    {{ item.barcode }}
                  </td>
                  <td class="py-2 px-3 font-semibold text-slate-900">
                    <div class="flex items-center gap-1.5">
                      <span
                        class="w-2 h-2 rounded-full"
                        :class="item.brand === 'Kulturale' ? 'bg-amber-400' : item.brand === 'Guinness' ? 'bg-slate-800' : 'bg-teal-500'"
                      ></span>
                      <span>{{ item.brand }} {{ item.varian }}</span>
                    </div>
                  </td>
                  <td class="py-2 px-3 text-center font-mono font-bold text-slate-600">
                    {{ item.wpExpectedQty }}
                  </td>
                  <td class="py-2 px-3 text-center bg-teal-50/50">
                    <div class="flex items-center justify-center gap-1.5">
                      <button
                        @click="decrementAuditCount(item.barcode)"
                        class="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors"
                        title="Reduce 1"
                      >
                        <Minus class="w-3 h-3" />
                      </button>
                      <span class="w-8 text-center font-mono font-extrabold text-base text-teal-800">
                        {{ item.scannedCount }}
                      </span>
                      <button
                        @click="registerAuditScan(item.barcode)"
                        class="w-5 h-5 rounded bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center transition-colors shadow-sm"
                        title="Add 1"
                      >
                        <Plus class="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  <td class="py-2 px-3 text-center font-mono text-xs">
                    <span
                      class="px-2 py-0.5 rounded font-bold"
                      :class="
                        item.discrepancy === 0
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : item.discrepancy < 0
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      "
                    >
                      {{ item.discrepancy === 0 ? 'Match (0)' : item.discrepancy > 0 ? `+${item.discrepancy}` : item.discrepancy }}
                    </span>
                  </td>
                  <td class="py-2 px-3 text-center">
                    <button
                      @click="setAuditCount(item.barcode, 0)"
                      class="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Clear count for this item"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- KPI Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Card 1: ESB STOCK -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">ESB STOCK</span>
        </div>
        <div class="my-2">
          <span class="text-3xl font-extrabold text-slate-900 font-mono">{{ totalWpExpected }}</span>
          <span class="text-xs text-slate-500 ml-1.5">units</span>
        </div>
        <p class="text-[11px] text-slate-500">
          Expected in {{ currentStore.name }} store
        </p>
      </div>

      <!-- Card 2: Physical Count (Scanned) -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Physical Count (Scanned)</span>
        </div>
        <div class="my-2 flex items-baseline gap-2">
          <span class="text-3xl font-extrabold text-teal-700 font-mono">{{ totalScanned }}</span>
          <span class="text-xs text-slate-500">units counted</span>
        </div>
        <p class="text-[11px] text-slate-500">
          Recorded by barcode scanner
        </p>
      </div>

      <!-- Card 3: Net Discrepancy -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Net Discrepancy</span>
        </div>
        <div class="my-2">
          <span
            class="text-3xl font-extrabold font-mono"
            :class="
              netDiscrepancyBottles === 0
                ? 'text-emerald-600'
                : netDiscrepancyBottles < 0
                ? 'text-rose-600'
                : 'text-amber-600'
            "
          >
            {{ netDiscrepancyBottles > 0 ? `+${netDiscrepancyBottles}` : netDiscrepancyBottles }}
          </span>
          <span class="text-xs text-slate-500 ml-1.5">cans difference</span>
        </div>
        <p class="text-[11px] text-slate-500">
          {{ missingVariantsCount }} missing SKUs • {{ surplusVariantsCount }} surplus SKUs
        </p>
      </div>

      <!-- Card 4: Audit Accuracy -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Audit Accuracy</span>
          <span class="text-xs text-slate-800 font-mono font-bold">{{ matchedVariantsCount }} / {{ storeItemsCount || auditItems.length }} Matched</span>
        </div>
        <div class="my-2">
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-extrabold text-teal-700 font-mono">{{ accuracyPercentage }}%</span>
          </div>
          <div class="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden border border-slate-200">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="accuracyPercentage === 100 ? 'bg-emerald-500' : accuracyPercentage > 85 ? 'bg-teal-600' : 'bg-rose-500'"
              :style="{ width: `${accuracyPercentage}%` }"
            ></div>
          </div>
        </div>
        <p class="text-[11px] text-slate-500">
          Target: 100% matched with ESB stock
        </p>
      </div>
    </div>

    <!-- Main Comparison Table (Physical Count vs ESB, light theme) -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <!-- Table Header & Filter Toolbar -->
      <div class="p-5 border-b border-slate-100 bg-slate-50/80">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                {{ currentStore.name }} Store Physical Count vs ESB
              </h3>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              Live stock comparison based on store and variant. Scanned via barcode scanner.
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              @click="openAddBarcodeWithPrefill()"
              type="button"
              class="px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Add New Barcode</span>
            </button>
          </div>
        </div>

        <!-- Filter tabs & search -->
        <div class="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
          <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start">
            <button
              @click="statusFilter = 'ALL'"
              type="button"
              class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
              :class="statusFilter === 'ALL' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
            >
              All ({{ auditItems.length }})
            </button>
            <button
              @click="statusFilter = 'discrepancy'"
              type="button"
              class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
              :class="statusFilter === 'discrepancy' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
            >
              <span>Discrepancies</span>
              <span class="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">{{ missingVariantsCount + surplusVariantsCount }}</span>
            </button>
            <button
              @click="statusFilter = 'matched'"
              type="button"
              class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
              :class="statusFilter === 'matched' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
            >
              <span>Matched</span>
              <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">{{ matchedVariantsCount }}</span>
            </button>
            <button
              @click="statusFilter = 'unscanned'"
              type="button"
              class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
              :class="statusFilter === 'unscanned' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
            >
              <span>Unscanned</span>
              <span class="px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">{{ unscannedVariantsCount }}</span>
            </button>
          </div>

          <!-- Search input -->
          <div class="relative w-full sm:w-64">
            <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search variant or barcode..."
              class="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
        </div>
      </div>

      <!-- Main Audit Table (Sticky Header like Google Sheets) -->
      <div class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)] min-h-[450px] flex-1 relative border-t border-slate-200">
        <table class="w-full text-left border-collapse">
          <thead class="sticky top-0 z-20 shadow-sm">
            <tr class="bg-slate-100 border-b border-slate-300 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <th class="py-3 px-4 w-12 text-center bg-slate-100">No</th>
              <th class="py-3 px-4 bg-slate-100">Kode Barcode</th>
              <th class="py-3 px-4 bg-slate-100">Brand</th>
              <th class="py-3 px-4 bg-slate-100">Product Name</th>
              <th class="py-3 px-4 text-center bg-slate-200/90 text-slate-800">
                Qty
              </th>
              <th class="py-3 px-4 text-center bg-teal-100 text-teal-900">
                Scanned Count
              </th>
              <th class="py-3 px-4 text-center bg-slate-100">Discrepancy</th>
              <th class="py-3 px-4 text-center bg-slate-100">Audit Status</th>
              <th class="py-3 px-4 text-right bg-slate-100">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-sm">
            <tr
              v-for="(item, idx) in filteredItems"
              :key="item.barcode"
              class="hover:bg-slate-50/80 transition-colors"
              :class="
                item.status === 'matched'
                  ? 'bg-emerald-50/20'
                  : item.status === 'missing' && item.scannedCount > 0
                  ? 'bg-rose-50/20'
                  : item.status === 'surplus'
                  ? 'bg-amber-50/20'
                  : ''
              "
            >
              <!-- No -->
              <td class="py-3.5 px-4 text-center font-mono text-xs text-slate-400">
                {{ idx + 1 }}
              </td>

              <!-- Barcode -->
              <td class="py-3.5 px-4 font-mono text-xs text-teal-800">
                <div class="flex items-center gap-1.5">
                  <Barcode class="w-4 h-4 text-slate-400 shrink-0" />
                  <span class="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 tracking-wider font-semibold">
                    {{ item.barcode }}
                  </span>
                </div>
              </td>

              <!-- Brand (Sub Category from ESB) -->
              <td class="py-3.5 px-4">
                <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                  {{ item.subCategory || item.brand }}
                </span>
              </td>

              <!-- Product Name -->
              <td class="py-3.5 px-4 font-semibold text-slate-900">
                <div class="flex flex-col">
                  <span class="text-sm font-bold text-slate-900">{{ item.productTitle || item.varian }}</span>
                  <div class="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-normal">
                    <span v-if="item.defaultUnit" class="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.2 rounded text-[10px]">{{ item.defaultUnit }}</span>
                    <span v-if="item.category" class="text-slate-400 font-medium">{{ item.category }}</span>
                    <span v-if="item.lastScannedAt" class="text-[10px] text-slate-400 font-mono">
                      • Last scan: {{ formatDateTime(item.lastScannedAt).time }}
                    </span>
                  </div>
                </div>
              </td>

              <!-- Qty (ESB Expected) -->
              <td class="py-3.5 px-4 text-center font-mono font-bold text-slate-800 bg-slate-50/40 text-base">
                {{ item.wpExpectedQty }}
              </td>

              <!-- Scanned Count (Physical tally) -->
              <td class="py-3.5 px-4 text-center bg-teal-50/30">
                <div v-if="editingBarcode === item.barcode" class="flex items-center justify-center gap-1">
                  <input
                    v-model.number="editCountValue"
                    type="number"
                    min="0"
                    class="w-16 px-1.5 py-1 text-center font-mono font-bold text-sm bg-white border border-teal-500 rounded text-slate-900 focus:outline-none"
                    @keydown.enter="saveEdit(item)"
                    autofocus
                  />
                  <button
                    @click="saveEdit(item)"
                    class="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-xs font-bold text-white rounded"
                  >
                    OK
                  </button>
                </div>
                <div v-else class="flex items-center justify-center gap-1.5">
                  <button
                    @click="decrementAuditCount(item.barcode)"
                    :disabled="item.scannedCount <= 0"
                    class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 flex items-center justify-center transition-colors"
                    title="Undo 1 scan"
                  >
                    <Minus class="w-3 h-3" />
                  </button>

                  <span
                    @click="startEdit(item)"
                    class="w-12 text-center font-mono font-extrabold text-lg cursor-pointer hover:underline"
                    :class="
                      item.status === 'matched'
                        ? 'text-emerald-600'
                        : item.status === 'missing' && item.scannedCount > 0
                        ? 'text-rose-600'
                        : item.status === 'surplus'
                        ? 'text-amber-600'
                        : 'text-slate-400'
                    "
                    title="Click to manually edit count"
                  >
                    {{ item.scannedCount }}
                  </span>

                  <button
                    @click="registerAuditScan(item.barcode)"
                    class="w-6 h-6 rounded bg-teal-100 hover:bg-teal-200 text-teal-800 border border-teal-300 flex items-center justify-center transition-colors shadow-sm"
                    title="Scan/Count +1 bottle"
                  >
                    <Plus class="w-3 h-3" />
                  </button>
                </div>
              </td>

              <!-- Discrepancy Column -->
              <td class="py-3.5 px-4 text-center font-mono text-xs">
                <span
                  v-if="item.status === 'matched'"
                  class="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200"
                >
                  <CheckCircle2 class="w-3.5 h-3.5" />
                  0 (Match)
                </span>
                <span
                  v-else-if="item.status === 'missing'"
                  class="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200"
                >
                  <AlertTriangle class="w-3.5 h-3.5" />
                  {{ item.discrepancy }} (Shortage)
                </span>
                <span
                  v-else-if="item.status === 'surplus'"
                  class="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200"
                >
                  <AlertCircle class="w-3.5 h-3.5" />
                  +{{ item.discrepancy }} (Surplus)
                </span>
                <span v-else-if="item.status === 'zero_stock'" class="text-slate-400 font-semibold text-xs">
                  0
                </span>
                <span v-else class="text-slate-400 italic text-xs">
                  -
                </span>
              </td>

              <!-- Status Badge -->
              <td class="py-3.5 px-4 text-center">
                <span
                  class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                  :class="
                    item.status === 'matched'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : item.status === 'missing'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : item.status === 'surplus'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : item.status === 'zero_stock'
                      ? 'bg-slate-50 text-slate-400 border border-slate-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  "
                >
                  {{
                    item.status === 'matched'
                      ? 'Matched'
                      : item.status === 'missing'
                      ? 'Shortage'
                      : item.status === 'surplus'
                      ? 'Surplus'
                      : item.status === 'zero_stock'
                      ? 'Zero Stock'
                      : 'Unscanned'
                  }}
                </span>
              </td>

              <!-- Action -->
              <td class="py-3.5 px-4 text-right">
                <button
                  @click="registerAuditScan(item.barcode)"
                  type="button"
                  class="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm transition-all"
                  title="Simulate 1 scan of this barcode"
                >
                  +1 Scan
                </button>
              </td>
            </tr>

            <!-- Empty Filter State -->
            <tr v-if="filteredItems.length === 0">
              <td colspan="9" class="py-12 text-center text-slate-400">
                <Package class="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p class="font-medium text-slate-600">No products matching your search</p>
                <button
                  @click="searchQuery = ''; statusFilter = 'ALL'; brandFilter = 'ALL'"
                  class="mt-2 text-xs text-teal-700 hover:underline font-semibold"
                >
                  Reset search & filters
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Complete Audit Session -->
    <div
      v-if="isCompleteModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      @click.self="isCompleteModalOpen = false"
    >
      <div class="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden p-6 space-y-5">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
            <CheckCircle2 class="w-6 h-6" />
          </div>
          <div>
            <h3 class="text-base font-extrabold text-slate-900">Sign Off & Finalize Audit</h3>
            <p class="text-xs text-slate-500">
              Store: {{ currentStore.name }} • Auditor: {{ currentUser?.name || 'Staff' }}
            </p>
          </div>
        </div>

        <div class="bg-slate-50 rounded-2xl p-4 border border-slate-200 grid grid-cols-3 gap-2 text-center">
          <div>
            <span class="text-[10px] text-slate-500 uppercase font-bold block">Expected</span>
            <span class="text-lg font-mono font-bold text-slate-800">{{ totalWpExpected }}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-500 uppercase font-bold block">Scanned</span>
            <span class="text-lg font-mono font-bold text-teal-700">{{ totalScanned }}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-500 uppercase font-bold block">Discrepancy</span>
            <span
              class="text-lg font-mono font-bold"
              :class="netDiscrepancyBottles === 0 ? 'text-emerald-600' : 'text-rose-600'"
            >
              {{ netDiscrepancyBottles > 0 ? `+${netDiscrepancyBottles}` : netDiscrepancyBottles }}
            </span>
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Auditor Notes / Catatan Audit:</label>
          <textarea
            v-model="auditNotes"
            rows="3"
            placeholder="Add any notes on damaged cans, expired stock, or physical condition..."
            class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-teal-500"
          ></textarea>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            @click="isCompleteModalOpen = false"
            type="button"
            class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            @click="handleFinalizeAudit"
            :disabled="isFinalizing"
            type="button"
            class="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-teal-600/20 disabled:opacity-50"
          >
            <CheckCircle2 class="w-4 h-4" />
            <span>{{ isFinalizing ? 'Saving Audit...' : 'Confirm & Save Audit Record' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Add / Map New Barcode -->
    <AddBarcodeModal
      :is-open="isAddBarcodeModalOpen"
      :prefilled-barcode="pendingUnknownBarcode"
      @close="isAddBarcodeModalOpen = false; pendingUnknownBarcode = ''"
      @barcode-added="pendingUnknownBarcode = ''"
    />

    <!-- Modal: My ESB ERP Session & Credentials -->
    <div
      v-if="isSessionModalOpen"
      class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      @click.self="isSessionModalOpen = false"
    >
      <div class="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center">
              <Database class="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-base font-extrabold text-slate-900">Inventory Sync Engine</h3>
              <p class="text-xs text-slate-500">Live Stock Connection & Data Refresh</p>
            </div>
          </div>
          <button
            @click="isSessionModalOpen = false"
            class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <!-- Navigation Tabs between Birmas Server and Direct ERP -->
        <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            @click="birmasSyncTab = 'birmas'"
            type="button"
            class="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center cursor-pointer"
            :class="birmasSyncTab === 'birmas' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          >
            Birmas Server (Recommended)
          </button>
          <button
            @click="birmasSyncTab = 'curl'"
            type="button"
            class="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center cursor-pointer"
            :class="birmasSyncTab === 'curl' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          >
            ESB ERP Session cURL
          </button>
        </div>

        <!-- TAB 1: Birmas Server Sync -->
        <div v-if="birmasSyncTab === 'birmas'" class="space-y-4">
          <div class="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-start gap-2.5">
            <CheckCircle2 class="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <div>
              <span class="font-bold block">Source: Birmas Central Server</span>
              <span class="text-teal-700 text-[11px] block mt-0.5">Connected to https://admin.birmas.id (Direct ESB API integration, no cookies needed)</span>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-bold text-slate-700 block">
              Birmas Server URL or IP Address:
            </label>
            <div class="flex items-center gap-2">
              <input
                v-model="birmasServerUrlInput"
                type="text"
                placeholder="https://admin.birmas.id or http://103.xxx.xxx.xxx"
                class="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-teal-500"
              />
            </div>
            <p class="text-[11px] text-slate-400">
              Supports domain name (e.g. <code class="text-teal-700">https://admin.birmas.id</code>) or direct server IP (e.g. <code class="text-teal-700">http://103.x.x.x:8000</code>).
            </p>
          </div>

          <div class="text-xs text-slate-600 space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <p class="font-bold text-slate-800">Why pull from Birmas Server?</p>
            <p class="text-[11px] leading-relaxed text-slate-600">
              The Birmas server is configured with direct, authorized access to the official ESB API. Pulling data from the Birmas server refreshes stock for all 4 stores automatically without expiring session cookies or manual cURL exports.
            </p>
          </div>

          <button
            @click="handleBirmasServerSync"
            :disabled="isSyncing || isSyncingBirmas"
            type="button"
            class="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-teal-600/20 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isSyncing || isSyncingBirmas }" />
            <span>{{ isSyncing || isSyncingBirmas ? 'Pulling Data from Birmas Server...' : 'Pull Fresh Stock from Birmas Server Now' }}</span>
          </button>
        </div>

        <!-- TAB 2: Direct ESB ERP Session cURL -->
        <div v-else class="space-y-4">
          <div class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5">
            <CheckCircle2 class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span class="font-bold block">Status: Connected to PT. Birmas Merubah Persepsi</span>
              <span class="text-slate-600 text-[11px] block mt-0.5">User: BRMPhillip (KUNINGAN Branch #3, 283 items)</span>
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs font-bold text-slate-700 block">
              Update Session (Paste cURL from Chrome DevTools)
            </label>
            <p class="text-[11px] text-slate-500">
              If your session ever expires in the future, simply Right-Click the <code class="bg-slate-100 px-1 py-0.5 rounded text-teal-800">stock-period</code> request in DevTools &gt; Copy as cURL, and paste it here:
            </p>
            <textarea
              v-model="rawCurlInput"
              rows="4"
              placeholder="curl --url 'https://erp.esb.co.id/stock-period?...' -b '...' -H '...'"
              class="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:border-teal-500 text-slate-800 resize-none"
            ></textarea>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-2">
            <button
              @click="isSessionModalOpen = false"
              type="button"
              class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
            >
              Close
            </button>
            <button
              @click="saveSessionFromCurl"
              :disabled="!rawCurlInput.trim() || isSavingSession"
              type="button"
              class="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-teal-600/20 disabled:opacity-50"
            >
              <CheckCircle2 class="w-4 h-4" />
              <span>{{ isSavingSession ? 'Updating & Syncing...' : 'Update Session' }}</span>
            </button>
          </div>
        </div>

        <div v-if="sessionStatusMsg" class="p-3 rounded-xl text-xs font-medium bg-teal-50 text-teal-900 border border-teal-200">
          {{ sessionStatusMsg }}
        </div>
      </div>
    </div>
  </div>
</template>
