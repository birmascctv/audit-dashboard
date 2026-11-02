<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAuditStore } from '../composables/useAuditStore.js';
import { useScanner } from '../composables/useScanner.js';
import { useAuth } from '../composables/useAuth.js';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBlock from '../components/SkeletonBlock.vue';
import { useToast } from '../composables/useToast.js';
import { authFetchJson } from '../services/authFetch.js';
import { formatDateTime } from '../utils/storage.js';
import { fmtDateTime } from '../utils/date.js';
import AddBarcodeModal from '../components/AddBarcodeModal.vue';

import {
  Barcode,
  Building2,
  RefreshCw,
  CheckCircle2,
  ClipboardCheck,
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
  UploadCloud,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Layers,
  Database,
  ExternalLink,
  Package,
  Trash2,
  Zap,
  Settings,
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
  Key,
  Eye,
  EyeOff,
  Copy,
  Undo2
} from 'lucide-vue-next';

const { currentUser } = useAuth();
const toast = useToast();
const {
  stores,
  selectedStoreId,
  currentStore,
  wpConfig,
  isInitialized,
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
  setProductNote,
  refreshProductsSilently,
  resetCurrentAudit,
  selectStore,
  syncFromWordPress,
  syncFromESBDirect,
  syncFromESBERP,
  syncFromBirmasServer,
  finalizeAudit,
  isSyncing,
  lastSyncStatus,
  isSessionLocked,
  sessionLockInfo,
  lockCurrentSession,
  unlockCurrentSession,
} = useAuditStore();

const searchQuery = ref('');
const statusFilter = ref('ALL');
const FILTER_KEY = 'birmas_stock_filters_v1';
const savedFilters = (() => { try { return JSON.parse(localStorage.getItem(FILTER_KEY) || '{}'); } catch { return {}; } })();
const brandFilter = ref(savedFilters.brand || 'ALL');
const categoryFilter = ref(savedFilters.category || 'ALL');
const mismatchesOnly = ref(false);
const undoStack = ref([]);
const pageOpenedAt = Date.now();
const clockNow = ref(Date.now());
const sessionElapsedSeconds = computed(() => {
  const firstScan = scanLogs.value.length ? scanLogs.value[scanLogs.value.length - 1]?.timestamp : null;
  const started = firstScan ? new Date(firstScan).getTime() : pageOpenedAt;
  return Math.max(0, Math.floor((clockNow.value - started) / 1000));
});
const sessionTimerLabel = computed(() => {
  const hours = Math.floor(sessionElapsedSeconds.value / 3600);
  const minutes = Math.floor((sessionElapsedSeconds.value % 3600) / 60);
  const seconds = sessionElapsedSeconds.value % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
});

const isUnlockModalOpen = ref(false);
const isUnlocking = ref(false);
const unlockError = ref('');
const isSuperAdmin = computed(() => currentUser.value?.username === 'bertha');

async function handleUnlockConfirm() {
  if (!isSuperAdmin.value) return;
  isUnlocking.value = true;
  unlockError.value = '';
  try {
    await unlockCurrentSession(currentUser.value?.name || 'Bertha');
    isUnlockModalOpen.value = false;
  } catch (err) {
    unlockError.value = err.message || 'Failed to unlock audit session';
  } finally {
    isUnlocking.value = false;
  }
}

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
let unknownTimer = null;
watch(pendingUnknownBarcode, (v) => {
  clearTimeout(unknownTimer);
  if (v) unknownTimer = setTimeout(() => { if (!isAddBarcodeModalOpen.value) pendingUnknownBarcode.value = ''; }, 60000);
});
const isFinalizing = ref(false);
const auditNotes = ref('');
const pushToWordPressOnFinalize = ref(true);
const lastServerSyncTime = ref(null);
const showPushApiDocs = ref(false);
const pushCopied = ref(false);

const birmasServerUrl = ref('https://core-api.esb.co.id/extv1/visit-purpose');
const birmasEndpointMode = ref('none'); // 'none' | 'wp' | 'visit_purpose' | 'menu' | 'custom'
const customEndpointPath = ref('');
const birmasTokenInput = ref('');
const isSavingBirmasConfig = ref(false);
const visitPurposesList = ref([]);
const isSyncingESBStock = ref(false);
const esbStockStatusMsg = ref('');
const showEndpointOptions = ref(true);

const computedTargetUrl = computed(() => {
  const base = (birmasServerUrl.value || '').trim();
  if (!base) return '';
  if (birmasEndpointMode.value === 'none') {
    return base; // Direct URL: NO endpoint appended!
  } else if (birmasEndpointMode.value === 'wp') {
    return `${base.replace(/\/+$/, '')}/wp-json/api/v1/product_stock`;
  } else if (birmasEndpointMode.value === 'visit_purpose') {
    return `${base.replace(/\/+$/, '')}/extv1/visit-purpose`;
  } else if (birmasEndpointMode.value === 'menu') {
    return `${base.replace(/\/+$/, '')}/extv1/menu`;
  } else if (birmasEndpointMode.value === 'custom') {
    const ep = customEndpointPath.value.trim();
    if (!ep) return base;
    const clean = ep.startsWith('/') ? ep : `/${ep}`;
    return `${base.replace(/\/+$/, '')}${clean}`;
  }
  return base;
});

async function loadBirmasConfig() {
  try {
    const res = await fetch('/api/birmas/config');
    const data = await res.json();
    if (data.birmasServerUrl) birmasServerUrl.value = data.birmasServerUrl;
    if (data.noEndpoint || !data.birmasServerEndpoint || data.birmasServerEndpoint === 'none') {
      birmasEndpointMode.value = 'none';
    } else if (data.birmasServerEndpoint.includes('wp-json')) {
      birmasEndpointMode.value = 'wp';
    } else if (data.birmasServerEndpoint.includes('visit-purpose')) {
      birmasEndpointMode.value = 'visit_purpose';
    } else if (data.birmasServerEndpoint.includes('menu')) {
      birmasEndpointMode.value = 'menu';
    } else {
      birmasEndpointMode.value = 'custom';
      customEndpointPath.value = data.birmasServerEndpoint;
    }
    if (data.visitPurposes && Array.isArray(data.visitPurposes)) {
      visitPurposesList.value = data.visitPurposes;
    }
    if (data.lastSyncedAt) lastServerSyncTime.value = data.lastSyncedAt;
  } catch {}
}

async function saveBirmasConfig() {
  isSavingBirmasConfig.value = true;
  try {
    let endpoint = '';
    if (birmasEndpointMode.value === 'none') endpoint = 'none';
    else if (birmasEndpointMode.value === 'wp') endpoint = '/wp-json/api/v1/product_stock';
    else if (birmasEndpointMode.value === 'visit_purpose') endpoint = '/extv1/visit-purpose';
    else if (birmasEndpointMode.value === 'menu') endpoint = '/extv1/menu';
    else if (birmasEndpointMode.value === 'custom') endpoint = customEndpointPath.value.trim();

    const body = {
      birmasServerUrl: birmasServerUrl.value,
      birmasServerEndpoint: endpoint,
      noEndpoint: birmasEndpointMode.value === 'none',
    };
    if (birmasTokenInput.value) {
      body.birmasServerToken = birmasTokenInput.value.trim();
    }
    await fetch('/api/birmas/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('Failed to save Birmas config:', err);
  } finally {
    isSavingBirmasConfig.value = false;
  }
}

async function handleBirmasServerSync() {
  isSyncingBirmas.value = true;
  sessionStatusMsg.value = '';
  try {
    await saveBirmasConfig();

    let endpoint = '';
    if (birmasEndpointMode.value === 'none') endpoint = 'none';
    else if (birmasEndpointMode.value === 'wp') endpoint = '/wp-json/api/v1/product_stock';
    else if (birmasEndpointMode.value === 'visit_purpose') endpoint = '/extv1/visit-purpose';
    else if (birmasEndpointMode.value === 'menu') endpoint = '/extv1/menu';
    else if (birmasEndpointMode.value === 'custom') endpoint = customEndpointPath.value.trim();

    const payload = {
      baseUrl: birmasServerUrl.value,
      endpointPath: endpoint,
      noEndpoint: birmasEndpointMode.value === 'none',
    };
    if (birmasTokenInput.value) {
      payload.token = birmasTokenInput.value.trim();
    }

    const res = await syncFromBirmasServer(payload);
    if (res.success) {
      lastServerSyncTime.value = new Date().toISOString();
      if (res.isVisitPurposeData) {
        if (res.visitPurposes) visitPurposesList.value = res.visitPurposes;
        sessionStatusMsg.value = res.message;
      } else {
        sessionStatusMsg.value = `Successfully synchronized! (${res.totalSyncedProducts || 0} products updated from Birmas server)`;
        setTimeout(() => {
          isSessionModalOpen.value = false;
          sessionStatusMsg.value = '';
        }, 2200);
      }
    } else {
      sessionStatusMsg.value = res.error || res.message || 'Quiet sync failed to reach Birmas server';
    }
  } catch (err) {
    sessionStatusMsg.value = err.message;
  } finally {
    isSyncingBirmas.value = false;
  }
}

async function handleSyncESBStocks() {
  isSyncingESBStock.value = true;
  esbStockStatusMsg.value = '';
  try {
    const res = await syncFromESBDirect();
    if (res.success) {
      esbStockStatusMsg.value = `ESB Live Catalog Synced! (${res.totalProducts || 0} products & ${res.totalStockEntries || 0} branch stocks updated)`;
      setTimeout(() => {
        isSessionModalOpen.value = false;
        esbStockStatusMsg.value = '';
      }, 2000);
    } else {
      esbStockStatusMsg.value = res.message || res.error || 'Failed to sync ESB stocks';
    }
  } catch (err) {
    esbStockStatusMsg.value = err.message;
  } finally {
    isSyncingESBStock.value = false;
  }
}

function copyPushCurlCommand() {
  const origin = window.location.origin;
  const cmd = `curl -X POST "${origin}/api/stock/push" \\
  -H "Authorization: Bearer <CONFIGURED_SERVER_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '[
    {
      "store": "Birmas Sudirman",
      "productName": "Canard Brut Lager 330ml",
      "barcode": "8997026800122",
      "stockQty": 24,
      "category": "Craft Beer",
      "unit": "Can"
    }
  ]'`;
  navigator.clipboard.writeText(cmd);
  pushCopied.value = true;
  setTimeout(() => {
    pushCopied.value = false;
  }, 2000);
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

const editingItemId = ref(null);
const editCountValue = ref(0);

const lastScannedKey = ref(null);
const scanOver = computed(() => {
  const m = /\((\d+)\/(\d+)\)/.exec(scanFeedback.value?.message || '');
  return !!m && Number(m[1]) > Number(m[2]);
});
const scanMode = ref(false);
const mismatchCount = computed(() => auditItems.value.filter((i) => i.scannedCount > 0 && i.status !== 'matched').length);
const unscannedCount = computed(() => auditItems.value.filter((i) => Number(i.wpExpectedQty) > 0 && !(i.scannedCount > 0)).length);

// Hardware scanner hook for USB / Wireless Barcode Scanner
const { scanFeedback, processBarcode } = useScanner({
  onScan: async (scannedBarcode) => {
    // While Add Barcode is open, a scan only fills the barcode box; it must not count
    if (isAddBarcodeModalOpen.value) {
      pendingUnknownBarcode.value = scannedBarcode;
      return { success: true, message: `Barcode ${scannedBarcode} captured for linking` };
    }
    const result = await registerAuditScan(scannedBarcode, undefined, currentUser.value?.name || 'Auditor');
    if (result.success && !isAddBarcodeModalOpen.value) {
      lastScannedKey.value = result.item?.scanKey || null;
      const scannedItem = result.item || auditItems.value.find((item) => item.barcode === scannedBarcode);
      if (scannedItem) {
        undoStack.value.push({ barcode: scannedItem.barcode, wpId: scannedItem.wpId });
        if (undoStack.value.length > 30) undoStack.value.shift();
      }
    } else {
      toast.error(result.message || `Barcode ${scannedBarcode} could not be counted.`);
      if (result.unknownBarcode) {
        pendingUnknownBarcode.value = result.unknownBarcode;
      }
    }
    return result;
  },
});

// Keep the scan notification in sync when the count is edited in the table
watch(
  () => {
    const it = auditItems.value.find((i) => i.scanKey === lastScannedKey.value);
    return it ? `${it.scannedCount}/${it.wpExpectedQty}` : null;
  },
  (val) => {
    if (val && scanFeedback.value.type === 'success') {
      scanFeedback.value = { ...scanFeedback.value, message: scanFeedback.value.message.replace(/\(\d+\/\d+\)/, `(${val})`) };
    }
  }
);

const availableBrands = computed(() => [...new Set(auditItems.value.map((item) => item.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
const availableCategories = computed(() => [...new Set(auditItems.value.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
const openingStockProducts = computed(() => auditItems.value.filter((item) => item.wpExpectedQty > 0));
const scannedOpeningStockProducts = computed(() => openingStockProducts.value.filter((item) => item.scannedCount > 0).length);
const openingStockProgress = computed(() => openingStockProducts.value.length ? Math.round(scannedOpeningStockProducts.value / openingStockProducts.value.length * 100) : 0);

const discrepancyVariantsCount = computed(() =>
  auditItems.value.filter((i) => i.scannedCount > 0 && i.scannedCount !== i.wpExpectedQty).length
);

// All items in catalog filtered for the main comparison table
const PAGE_SIZE = 25;
const page = ref(1);

const filteredItems = computed(() => {
  return auditItems.value.slice().sort((a, b) =>
    (Number(b.wpExpectedQty) > 0) - (Number(a.wpExpectedQty) > 0) ||
    String(a.productTitle || a.varian || '').localeCompare(String(b.productTitle || b.varian || ''), undefined, { numeric: true, sensitivity: 'base' })
  ).filter((item) => {
    if (brandFilter.value !== 'ALL' && item.brand !== brandFilter.value) return false;
    if (categoryFilter.value !== 'ALL' && item.category !== categoryFilter.value) return false;
    if (mismatchesOnly.value && !(item.scannedCount > 0 && item.scannedCount !== item.wpExpectedQty)) return false;
    if (statusFilter.value === 'discrepancy' && !(item.scannedCount > 0 && item.scannedCount !== item.wpExpectedQty)) return false;
    if (statusFilter.value === 'matched' && item.status !== 'matched') return false;
    if (statusFilter.value === 'unscanned' && item.status !== 'unscanned') return false;
    if (searchQuery.value && searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      const bCode = String(item.barcode || '').toLowerCase();
      const bCategory = String(item.category || '').toLowerCase();
      const bTitle = String(item.productTitle || item.varian || '').toLowerCase();
      const bSku = String(item.sku || '').toLowerCase();

      const match =
        bCode.includes(q) ||
        bCategory.includes(q) ||
        bTitle.includes(q) ||
        bSku.includes(q);
      if (!match) return false;
    }
    return true;
  });
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / PAGE_SIZE)));
const pagedItems = computed(() => filteredItems.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
watch([searchQuery, statusFilter, brandFilter, categoryFilter, mismatchesOnly], () => { page.value = 1; });
watch(totalPages, (n) => { if (page.value > n) page.value = n; });

const sortedAuditItems = computed(() => auditItems.value.slice().sort((a, b) =>
  String(a.productTitle || a.varian || '').localeCompare(String(b.productTitle || b.varian || ''), undefined, { numeric: true, sensitivity: 'base' })));

// ONLY products that have been physically scanned in this session (scannedCount > 0)
const scannedOnlyItems = computed(() => {
  return auditItems.value.filter((item) => item.scannedCount > 0).sort((a, b) =>
    String(a.productTitle || a.varian || '').localeCompare(String(b.productTitle || b.varian || ''), undefined, { numeric: true, sensitivity: 'base' }));
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
  editingItemId.value = item.wpId;
  editCountValue.value = item.scannedCount;
}

function saveEdit(item) {
  if (editCountValue.value >= 0) {
    setAuditCount(item.barcode, item.wpId, Number(editCountValue.value));
  }
  editingItemId.value = null;
}

function handleResetAuditSession() {
  if (confirm(`Clear all physically scanned counts for ${currentStore.value.name} and restart count?`)) {
    resetCurrentAudit();
    undoStack.value = [];
  }
}

async function undoLastScan() {
  const last = undoStack.value.pop();
  if (!last) return;
  await decrementAuditCount(last.barcode, last.wpId);
  toast.info('Undid the last scan.');
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
    undoStack.value = [];
    toast.success('Audit completed and saved.');
    showAuditSuccess.value = true;
    setTimeout(() => { showAuditSuccess.value = false; }, 2600);
  } catch (err) {
    toast.error('Failed to finalize audit: ' + err.message);
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
  timerInterval = setInterval(() => { clockNow.value = Date.now(); }, 1000);
  // Keep stock fresh without any button: the server syncs from ESB, the page just re-reads it
  silentRefreshTimer = setInterval(() => {
    if (!document.hidden) refreshProductsSilently();
  }, 60000);
});

function onUndoKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA'].includes(e.target?.tagName) && undoStack.value.length) {
    e.preventDefault();
    undoLastScan();
  }
  if (e.key === 'Escape' && scanMode.value) scanMode.value = false;
}
onMounted(() => document.addEventListener('keydown', onUndoKey));
onUnmounted(() => document.removeEventListener('keydown', onUndoKey));
watch([brandFilter, categoryFilter], () => {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify({ brand: brandFilter.value, category: categoryFilter.value })); } catch {}
});
let silentRefreshTimer = null;
let timerInterval = null;
const topSold = ref([]);
const topSoldDays = ref(30);
async function loadTopSold() {
  if (!selectedStoreId.value) return;
  try {
    const r = await authFetchJson(`/api/audit/top-sold?storeId=${encodeURIComponent(selectedStoreId.value)}&days=${topSoldDays.value}`);
    topSold.value = r.products || [];
  } catch { topSold.value = []; }
}
watch([selectedStoreId, topSoldDays], loadTopSold, { immediate: true });
watch(selectedStoreId, () => { undoStack.value = []; });
onUnmounted(() => { clearInterval(silentRefreshTimer); clearInterval(timerInterval); });

const showAuditSuccess = ref(false);
</script>

<template>
  <div class="space-y-6">
    <!-- Standardized Submenu Header Section -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <div class="flex items-center gap-3.5">
        <div class="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shadow-xs shrink-0">
          <ClipboardCheck class="w-6 h-6 text-teal-700" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Physical Stock Audit
            </h2>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
              Station & Reconciliation
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Physical barcode scanner station, variant bottle count, and live inventory discrepancy verification against ESB records
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>Auditor: <strong class="text-slate-900">{{ currentUser?.name || 'Staff' }}</strong></span>
            <span>Session: <strong class="font-mono text-slate-900">{{ sessionTimerLabel }}</strong></span>
          </div>
        </div>
      </div>

      <!-- Action Bar: Store Selector, Add Barcode, Upload CSV, Export CSV, Complete Audit -->
      <div class="flex flex-wrap items-center gap-2.5">
        <!-- Store Location Selector -->
        <div class="relative inline-block">
          <select
            :value="selectedStoreId"
            @change="selectStore($event.target.value)"
            class="appearance-none bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-900 font-bold text-xs sm:text-sm rounded-xl pl-3 pr-8 py-2 focus:outline-none focus:border-teal-500 cursor-pointer transition-colors shadow-2xs"
          >
            <option v-for="s in stores" :key="s.id" :value="s.id">
              {{ s.name }}
            </option>
          </select>
          <ChevronDown class="w-4 h-4 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <!-- Add New Barcode Button -->
        <button
          @click="openAddBarcodeWithPrefill()"
          type="button"
          class="px-3.5 py-2 min-h-12 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          title="Add a new barcode based on variant or new product"
        >
          <Plus class="w-3.5 h-3.5 text-teal-700" />
          <span>Add Barcode</span>
        </button>

        <!-- Finalize Audit Button -->
        <button
          @click="isCompleteModalOpen = true"
          type="button"
          class="px-4 py-2 min-h-12 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all cursor-pointer"
        >
          <CheckCircle2 class="w-4 h-4" />
          <span>Complete Audit</span>
        </button>
      </div>
    </div>

    <!-- Audit Session Lock Status Banner (Superadmin approval workflow) -->
    <div
      v-if="isSessionLocked"
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-xs text-amber-950 shadow-sm"
    >
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 shrink-0">
          <Lock class="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-black text-amber-950 text-sm">Audit Session is Locked & Frozen</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
              LOCKED
            </span>
          </div>
          <p class="text-amber-900 text-xs mt-0.5">
            Physical counts are sealed for {{ currentStore.name }}. All barcode scanning and manual tally edits are disabled.
            <span v-if="sessionLockInfo?.lockedUntil"> Opens automatically on <strong>{{ fmtDateTime(sessionLockInfo.lockedUntil) }}</strong>.</span>
            <span v-if="sessionLockInfo?.lockedBy"> Sealed by <strong>{{ sessionLockInfo.lockedBy }}</strong>.</span>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 self-end sm:self-center">
        <button
          v-if="isSuperAdmin"
          @click="isUnlockModalOpen = true"
          type="button"
          class="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
        >
          <Unlock class="w-4 h-4" />
          <span>Unlock Session</span>
        </button>
        <span
          v-else
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold shadow-2xs"
        >
          <ShieldAlert class="w-4 h-4 text-amber-600" />
          <span>Only Bertha can unlock</span>
        </span>
      </div>
    </div>



    <!-- KPI Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Card 1: ESB STOCK -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider" title="Quantity the system says should be in the store">System Stock <span class="cursor-help text-slate-400">?</span></span>
        </div>
        <div class="my-2">
          <span class="text-3xl font-extrabold text-slate-900 font-mono">{{ Math.round(Number(totalWpExpected) || 0).toLocaleString('id-ID') }}</span>
          <span class="text-xs text-slate-500 ml-1.5">units</span>
        </div>
        <p class="text-[11px] text-slate-500">
          Expected in {{ currentStore.name }} store
        </p>
      </div>

      <!-- Card 2: Physical Count (Scanned) -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider" title="Quantity you scanned in the store">Physical Count (Scanned) <span class="cursor-help text-slate-400">?</span></span>
        </div>
        <div class="my-2 flex items-baseline gap-2">
          <span class="text-3xl font-extrabold text-teal-700 font-mono">{{ Number(totalScanned).toLocaleString('id-ID') }}</span>
          <span class="text-xs text-slate-500">units counted</span>
        </div>
        <p class="text-[11px] text-slate-500">
          Recorded by barcode scanner
        </p>
      </div>

      <!-- Card 3: Net Discrepancy -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider" title="Scanned minus system stock. 0 means everything matches">Difference (Net) <span class="cursor-help text-slate-400">?</span></span>
          <span
            v-if="totalScanned === 0"
            class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
          >
            Pending Scan
          </span>
        </div>
        <div class="my-2">
          <template v-if="totalScanned === 0">
            <span class="text-3xl font-extrabold font-mono text-slate-400">0</span>
            <span class="text-xs text-slate-400 ml-1.5">(Belum Ada Scan)</span>
          </template>
          <template v-else>
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
          </template>
        </div>
        <p class="text-[11px] text-slate-500">
          <template v-if="totalScanned === 0">
            Pindai fisik untuk mulai verifikasi perbedaan stok
          </template>
          <template v-else>
            {{ missingVariantsCount }} missing SKUs • {{ surplusVariantsCount }} surplus SKUs
          </template>
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
            <span class="text-3xl font-extrabold text-teal-700 font-mono">{{ totalScanned === 0 ? '0%' : `${accuracyPercentage}%` }}</span>
            <span v-if="totalScanned === 0" class="text-xs text-slate-400 font-normal">(Belum Ada Scan)</span>
          </div>
          <div class="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden border border-slate-200">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="totalScanned === 0 ? 'bg-slate-300' : (accuracyPercentage === 100 ? 'bg-emerald-500' : accuracyPercentage > 85 ? 'bg-teal-600' : 'bg-rose-500')"
              :style="{ width: `${totalScanned === 0 ? 0 : accuracyPercentage}%` }"
            ></div>
          </div>
        </div>
        <p class="text-[11px] text-slate-500">
          {{ totalScanned === 0 ? 'Pindai barcode untuk menghitung akurasi' : 'Target: 100% matched with system stock' }}
        </p>
      </div>
    </div>

    <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span class="font-bold text-slate-800">System products scanned</span>
        <span class="font-mono font-bold text-teal-700">{{ scannedOpeningStockProducts }} / {{ openingStockProducts.length }} ({{ openingStockProgress }}%)</span>
      </div>
      <div class="mt-2 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" :aria-valuenow="openingStockProgress" aria-valuemin="0" aria-valuemax="100" :aria-label="`${openingStockProgress}% of in-stock ESB products scanned`">
        <div class="h-full rounded-full bg-teal-600 transition-all duration-500" :style="{ width: `${openingStockProgress}%` }"></div>
      </div>
    </div>

    <!-- Top selling products by qty sold -->
    <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 class="text-sm font-extrabold text-slate-900">Top Products by Qty Sold <span class="font-semibold text-slate-500">· {{ currentStore.name }}</span></h3>
        <select v-model.number="topSoldDays" class="min-h-8 px-3 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800">
          <option :value="7">Last 7 days</option>
          <option :value="30">Last 30 days</option>
          <option :value="90">Last 90 days</option>
        </select>
      </div>
      <p v-if="!topSold.length" class="text-xs text-slate-500">No sales found for this store in this period.</p>
      <ol v-else class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <li v-for="(p, i) in topSold" :key="p.product" class="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <span class="truncate font-semibold text-slate-800"><span class="mr-1 text-teal-700">{{ i + 1 }}.</span>{{ p.product }}</span>
          <span class="whitespace-nowrap rounded-lg bg-teal-600 px-2 py-0.5 font-mono font-bold text-white">{{ Number(p.qty).toLocaleString('id-ID') }}</span>
        </li>
      </ol>
    </div>

    <!-- Counting Station (Light theme with tosca accents) -->
    <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden" :class="scanMode ? '!fixed inset-0 z-[60] !rounded-none overflow-y-auto scan-mode' : ''">
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

          <!-- Session controls -->
          <div class="flex flex-wrap items-center gap-2">
            <button @click="scanMode = !scanMode" type="button" class="px-3 py-2 min-h-12 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-800 text-xs font-semibold">
              {{ scanMode ? 'Exit scan mode' : 'Scan mode (full screen)' }}
            </button>
            <button @click="undoLastScan" :disabled="undoStack.length === 0 || isSessionLocked" type="button" class="px-3 py-2 min-h-12 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 disabled:opacity-40 text-xs font-semibold flex items-center gap-1.5">
              <Undo2 class="w-4 h-4" /><span>Undo last scan</span><kbd class="hidden sm:inline rounded border border-amber-300 bg-white px-1 text-[10px] font-mono">Ctrl+Z</kbd>
            </button>
            <button
              @click="handleResetAuditSession"
              type="button"
              class="px-3 py-2 min-h-12 rounded-lg bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw class="w-3.5 h-3.5" />
              <span>Reset Physical Count</span>
            </button>
          </div>
        </div>

        <!-- Main Barcode Input Field -->
        <div class="relative flex items-center">
          <div class="absolute left-4 flex items-center pointer-events-none text-teal-600">
            <Barcode class="w-6 h-6" :class="isSessionLocked ? 'opacity-40' : 'animate-pulse'" />
          </div>
          <input
            id="scanner-main-input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :disabled="isSessionLocked"
            :placeholder="isSessionLocked ? 'Audit Session is locked. Only Bertha can unlock it.' : 'Scan barcode with USB/Wireless scanner (aim and scan bottle)...'"
            class="w-full pl-13 pr-28 py-4 min-h-14 text-slate-900 placeholder-slate-400 text-lg font-mono rounded-xl border-2 transition-all shadow-inner"
            :class="isSessionLocked ? 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-60' : 'bg-slate-50 border-slate-300 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-100'"
          />
          <span class="absolute right-3 px-2.5 py-1 rounded bg-white border border-slate-300 text-[11px] font-mono text-teal-700 font-semibold shadow-sm">
            Auto-Enter
          </span>
        </div>

        <!-- Unknown Barcode Notice & Quick Add Action -->
        <div
          v-if="pendingUnknownBarcode"
          class="flex flex-wrap items-center justify-between p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs gap-3"
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
            class="px-3 py-2 min-h-12 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shrink-0 flex items-center gap-1 shadow-sm"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Map Barcode Now</span>
          </button>
        </div>

        <!-- Feedback Alert -->
        <div
          v-if="scanFeedback.type !== 'idle'"
          :key="scanFeedback.timestamp"
          class="flex items-center gap-4 px-5 py-6 min-h-24 rounded-2xl border-2 transition-all"
          :class="
            scanFeedback.type !== 'success'
              ? 'bg-rose-100 border-rose-500 text-rose-900 scan-flash-error'
              : scanOver
              ? 'bg-amber-100 border-amber-500 text-amber-900 scan-flash-error'
              : 'bg-emerald-100 border-emerald-500 text-emerald-900 scan-flash-success'
          "
        >
          <component
            :is="scanFeedback.type === 'success' ? CheckCircle2 : AlertTriangle"
            class="w-10 h-10 shrink-0"
            :class="scanFeedback.type !== 'success' ? 'text-rose-600' : scanOver ? 'text-amber-600' : 'text-emerald-600'"
          />
          <div class="flex-1 text-xl sm:text-2xl font-extrabold leading-tight">
            {{ scanFeedback.message }}
          </div>
          <span class="text-sm font-extrabold uppercase" :class="scanFeedback.type !== 'success' ? 'text-rose-700' : scanOver ? 'text-amber-700' : 'text-emerald-700'">
            {{ scanFeedback.type !== 'success' ? 'Alert' : scanOver ? 'Too many' : 'Recorded' }}
          </span>
        </div>

        <p class="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600">
          <span class="inline-flex items-center gap-1"><i class="h-2.5 w-2.5 rounded-full bg-emerald-500"></i>Matched</span>
          <span class="inline-flex items-center gap-1"><i class="h-2.5 w-2.5 rounded-full bg-amber-500"></i>Too many</span>
          <span class="inline-flex items-center gap-1"><i class="h-2.5 w-2.5 rounded-full bg-rose-500"></i>Missing</span>
          <span class="inline-flex items-center gap-1"><i class="h-2.5 w-2.5 rounded-full bg-slate-400"></i>Not scanned</span>
        </p>
        <!-- Dedicated Live Table of SCANNED PRODUCTS ONLY -->
        <div class="pt-2">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5">
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
                class="min-h-12 text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-700 cursor-pointer focus:outline-none focus:border-teal-500"
              >
                <option value="">+ Test Scan Item...</option>
                <option v-for="item in sortedAuditItems" :key="item.barcode" :value="item.barcode">
                  {{ item.productTitle || item.varian }} ({{ item.barcode }})
                </option>
              </select>
            </div>
          </div>

          <!-- The Scanned Only Table -->
          <div class="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
            <EmptyState
              v-if="scannedOnlyItems.length === 0"
              title="No products scanned yet"
              :hint="`Scan a product for ${currentStore.name} to begin the physical count.`"
            />
            <div v-else class="overflow-x-auto">
            <table class="min-w-[760px] w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-100/90 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th class="py-2.5 px-3 w-10 text-center">No</th>
                  <th class="py-2.5 px-3">Kode Barcode</th>
                  <th class="py-2.5 px-3">Product Name</th>
                  <th class="py-2.5 px-3 text-center">System Stock</th>
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
                      <span>{{ item.productTitle || item.varian }}</span>
                    </div>
                  </td>
                  <td class="py-2 px-3 text-center font-mono font-bold text-slate-600">
                    {{ Math.round(Number(item.wpExpectedQty) || 0) }}
                  </td>
                  <td class="py-2 px-3 text-center bg-teal-50/50">
                    <div class="flex items-center justify-center gap-1.5">
                      <button
                        @click="decrementAuditCount(item.barcode, item.wpId)"
                        class="min-w-12 min-h-12 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors"
                        title="Reduce 1"
                      >
                        <Minus class="w-3 h-3" />
                      </button>
                      <input
                        :value="item.scannedCount"
                        :disabled="isSessionLocked"
                        type="number"
                        min="0"
                        class="w-14 rounded border border-transparent bg-transparent text-center font-mono font-extrabold text-base text-teal-800 hover:border-slate-300 focus:border-teal-500 focus:bg-white focus:outline-none"
                        @change="setAuditCount(item.barcode, item.wpId, Math.max(0, Math.floor(Number($event.target.value) || 0)))"
                        @keydown.enter="$event.target.blur()"
                      />
                      <button
                        @click="registerAuditScan(item.barcode, item.wpId)"
                        class="min-w-12 min-h-12 rounded bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center transition-colors shadow-sm"
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
                      {{ item.discrepancy === 0 ? 'OK (0)' : item.discrepancy > 0 ? `+${item.discrepancy}` : item.discrepancy }}
                    </span>
                  </td>
                  <td class="py-2 px-3 text-center">
                    <button
                      @click="setAuditCount(item.barcode, item.wpId, 0)"
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

          <div class="flex flex-wrap items-center gap-2">
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
        <div class="mt-4 flex flex-col gap-3 pt-3 border-t border-slate-200">
          <div class="flex flex-wrap items-center gap-2 self-start">
            <button
              @click="statusFilter = 'ALL'"
              type="button"
              class="px-3 py-1 min-h-8 rounded-lg border text-xs font-semibold transition-colors"
              :class="statusFilter === 'ALL' ? 'bg-teal-600 border-teal-600 text-white shadow-sm' : 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100'"
            >
              All ({{ auditItems.length }})
            </button>
            <button
              @click="statusFilter = 'discrepancy'"
              type="button"
              class="px-3 py-1 min-h-8 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1"
              :class="statusFilter === 'discrepancy' ? 'bg-rose-600 border-rose-600 text-white shadow-sm' : 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'"
            >
              <span>Differences</span>
              <span class="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">{{ discrepancyVariantsCount }}</span>
            </button>
            <button
              @click="statusFilter = 'matched'"
              type="button"
              class="px-3 py-1 min-h-8 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1"
              :class="statusFilter === 'matched' ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'"
            >
              <span>Matched</span>
              <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">{{ matchedVariantsCount }}</span>
            </button>
            <button
              @click="statusFilter = 'unscanned'"
              type="button"
              class="px-3 py-1 min-h-8 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1"
              :class="statusFilter === 'unscanned' ? 'bg-slate-700 border-slate-700 text-white shadow-sm' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'"
            >
              <span>Unscanned</span>
              <span class="px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">{{ unscannedVariantsCount }}</span>
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <select v-model="brandFilter" class="min-h-8 px-3 py-1 bg-sky-50 border border-sky-300 rounded-xl text-sm font-semibold text-sky-900">
              <option value="ALL">All brands</option>
              <option v-for="brand in availableBrands" :key="brand" :value="brand">{{ brand }}</option>
            </select>
            <select v-model="categoryFilter" class="min-h-8 px-3 py-1 bg-violet-50 border border-violet-300 rounded-xl text-sm font-semibold text-violet-900">
              <option value="ALL">All categories</option>
              <option v-for="category in availableCategories" :key="category" :value="category">{{ category }}</option>
            </select>
            <label class="inline-flex min-h-8 items-center gap-2 px-3 py-1 rounded-xl border border-rose-300 bg-rose-50 text-sm font-semibold text-rose-800">
              <input v-model="mismatchesOnly" type="checkbox" class="accent-rose-600" />
              Show only mismatches
            </label>
          </div>

          <!-- Search input -->
          <div class="relative w-full sm:w-64">
            <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search variant or barcode...  (press / to focus)"
              class="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
        </div>
      </div>

      <!-- Main Audit Table (Sticky Header like Google Sheets) -->
      <div class="overflow-x-auto flex-1 relative border-t border-slate-200">
        <div v-if="!isInitialized" class="p-5"><SkeletonBlock :rows="8" height="h-8" /></div>
        <EmptyState v-else-if="filteredItems.length === 0" title="No matching products" hint="Adjust the search or filters to see products.">
          <button @click="searchQuery = ''; statusFilter = 'ALL'; brandFilter = 'ALL'; categoryFilter = 'ALL'; mismatchesOnly = false" class="min-h-12 px-4 py-2 rounded-xl bg-teal-50 text-teal-800 font-semibold">Reset filters</button>
        </EmptyState>
        <table v-else class="min-w-[900px] w-full text-left border-collapse">
          <thead class="shadow-sm">
            <tr class="bg-slate-100 border-b border-slate-300 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <th class="py-3 px-4 w-12 text-center bg-slate-100">No</th>
              <th class="py-3 px-4 bg-slate-100">Kode Barcode</th>
              <th class="py-3 px-4 bg-slate-100">Product Name</th>
              <th class="py-3 px-4 text-center bg-slate-200/90 text-slate-800">
                Qty
              </th>
              <th class="py-3 px-4 text-center bg-teal-100 text-teal-900">
                Scanned Count
              </th>
              <th class="py-3 px-4 text-center bg-slate-100">Difference</th>
              <th class="py-3 px-4 text-center bg-slate-100">Audit Status</th>
              <th class="py-3 px-4 bg-slate-100 min-w-[180px]">Notes</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-sm">
            <tr
              v-for="(item, idx) in pagedItems"
              :key="item.barcode"
              class="transition-colors border-l-4"
              :class="
                item.status === 'matched'
                  ? 'bg-emerald-50 border-l-emerald-500 hover:bg-emerald-100/70'
                  : item.status === 'missing' && item.scannedCount > 0
                  ? 'bg-rose-50 border-l-rose-500 hover:bg-rose-100/70'
                  : item.status === 'counting' || item.status === 'surplus'
                  ? 'bg-amber-50 border-l-amber-500 hover:bg-amber-100/70'
                  : Number(item.wpExpectedQty) > 0
                  ? (idx % 2 ? 'bg-slate-50 border-l-transparent hover:bg-slate-100' : 'bg-white border-l-transparent hover:bg-slate-50')
                  : 'bg-slate-100/80 border-l-slate-300 text-slate-500 hover:bg-slate-100'
              "
            >
              <!-- No -->
              <td class="py-3.5 px-4 text-center font-mono text-xs text-slate-400">
                {{ (page - 1) * PAGE_SIZE + idx + 1 }}
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

              <!-- Product Name -->
              <td class="py-3.5 px-4 font-semibold text-slate-900">
                <div class="flex flex-col">
                  <span class="text-sm font-bold text-slate-900">{{ item.productTitle || item.varian }}</span>
                  <div class="flex items-center gap-2 text-[11px] text-slate-500 font-normal">
                    <span v-if="item.defaultUnit" class="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.2 rounded text-[10px]">{{ item.defaultUnit }}</span>
                    <span v-if="item.category" class="text-slate-400 font-medium">{{ item.category }}</span>
                    <span v-if="item.lastScannedAt" class="text-[10px] text-slate-400 font-mono">
                      • Last scan: {{ formatDateTime(item.lastScannedAt).time }}
                    </span>
                  </div>
                </div>
              </td>

              <!-- Qty (ESB Expected) -->
              <td class="py-3.5 px-4 text-center font-mono font-bold bg-slate-50/40 text-lg">
                <div class="flex flex-col items-center justify-center">
                  <span :class="item.wpExpectedQty < 0 ? 'text-rose-600 font-extrabold' : 'text-slate-800'">
                    {{ Math.round(Number(item.wpExpectedQty) || 0) }}
                  </span>
                  <span
                    v-if="item.wpExpectedQty < 0"
                    class="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 mt-0.5 tracking-tight whitespace-nowrap"
                    title="Minus in system stock indicates items already missing at the store"
                  >
                    Missing in Store
                  </span>
                </div>
              </td>

              <!-- Scanned Count (Physical tally) -->
              <td class="py-3.5 px-4 text-center bg-teal-50/30">
                <div v-if="editingItemId === item.wpId" class="flex items-center justify-center gap-1">
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
                    @click="decrementAuditCount(item.barcode, item.wpId)"
                    :disabled="item.scannedCount <= 0 || isSessionLocked"
                    class="w-9 h-9 !min-h-0 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 flex items-center justify-center transition-colors"
                    title="Undo 1 scan"
                  >
                    <Minus class="w-3 h-3" />
                  </button>

                  <span
                    @click="!isSessionLocked && startEdit(item)"
                    class="w-12 text-center font-mono font-extrabold text-base"
                    :class="[
                      isSessionLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:underline',
                      item.status === 'matched'
                        ? 'text-emerald-600'
                        : item.status === 'missing' && item.scannedCount > 0
                        ? 'text-rose-600'
                        : item.status === 'surplus'
                        ? 'text-amber-600'
                        : 'text-slate-400'
                    ]"
                    :title="isSessionLocked ? 'Session is locked' : 'Click to manually edit count'"
                  >
                    {{ item.scannedCount }}
                  </span>

                  <button
                    @click="registerAuditScan(item.barcode, item.wpId)"
                    :disabled="isSessionLocked"
                    class="w-9 h-9 !min-h-0 rounded bg-teal-100 hover:bg-teal-200 disabled:opacity-30 disabled:cursor-not-allowed text-teal-800 border border-teal-300 flex items-center justify-center transition-colors shadow-sm"
                    title="Scan/Count +1 bottle"
                  >
                    <Plus class="w-3 h-3" />
                  </button>
                </div>
              </td>

              <!-- Discrepancy Column (Negative stock friendly) -->
              <td class="py-3.5 px-4 text-center font-mono text-xs">
                <span
                  v-if="item.status === 'matched'"
                  class="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200"
                >
                  <CheckCircle2 class="w-3.5 h-3.5" />
                  <span v-if="item.wpExpectedQty < 0">0 (All {{ item.scannedCount }} Found)</span>
                  <span v-else>0 (Match)</span>
                </span>
                <span
                  v-else-if="item.status === 'missing'"
                  class="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200"
                >
                  <AlertTriangle class="w-3.5 h-3.5" />
                  <span v-if="item.wpExpectedQty < 0 && item.scannedCount === 0">
                    {{ item.discrepancy }} (Missing in Store)
                  </span>
                  <span v-else>
                    {{ item.discrepancy }} (Shortage)
                  </span>
                </span>
                <span
                  v-else-if="item.status === 'counting'"
                  class="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200"
                >
                  <span v-if="item.wpExpectedQty < 0">
                    {{ item.discrepancy }} ({{ item.scannedCount }} Found, {{ Math.abs(item.discrepancy) }} Missing)
                  </span>
                  <span v-else>
                    {{ item.discrepancy }} (Counting)
                  </span>
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
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
                  :class="
                    item.status === 'matched'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : item.status === 'missing'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : item.status === 'counting'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : item.status === 'surplus'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : item.status === 'zero_stock'
                      ? 'bg-slate-50 text-slate-400 border border-slate-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  "
                >
                  {{
                    item.status === 'matched'
                      ? (item.wpExpectedQty < 0 ? 'All Found' : 'Matched')
                      : item.status === 'missing'
                      ? (item.wpExpectedQty < 0 ? 'Missing in Store' : 'Shortage')
                      : item.status === 'counting'
                      ? (item.wpExpectedQty < 0 ? 'Partially Found' : 'Counting')
                      : item.status === 'surplus'
                      ? 'Surplus'
                      : item.status === 'zero_stock'
                      ? 'Zero Stock'
                      : 'Unscanned'
                  }}
                </span>
              </td>

              <!-- Notes -->
              <td class="py-2 px-4">
                <input
                  :value="item.note"
                  @change="setProductNote(item.wpId, $event.target.value)"
                  @keydown.enter="$event.target.blur()"
                  :disabled="isSessionLocked"
                  type="text"
                  maxlength="500"
                  placeholder="Add note..."
                  class="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-300 focus:outline-none focus:border-teal-500"
                />
              </td>

            </tr>


          </tbody>
        </table>
        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          <span>Showing {{ (page - 1) * PAGE_SIZE + 1 }}-{{ Math.min(page * PAGE_SIZE, filteredItems.length) }} of {{ filteredItems.length }}</span>
          <div class="flex items-center gap-1">
            <button type="button" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold disabled:opacity-40" :disabled="page <= 1" @click="page = 1">«</button>
            <button type="button" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold disabled:opacity-40" :disabled="page <= 1" @click="page--">Prev</button>
            <span class="px-2 font-bold">Page {{ page }} / {{ totalPages }}</span>
            <button type="button" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold disabled:opacity-40" :disabled="page >= totalPages" @click="page++">Next</button>
            <button type="button" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold disabled:opacity-40" :disabled="page >= totalPages" @click="page = totalPages">»</button>
          </div>
        </div>
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
            <span class="text-lg font-mono font-bold text-slate-800">{{ Math.round(Number(totalWpExpected) || 0) }}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-500 uppercase font-bold block">Scanned</span>
            <span class="text-lg font-mono font-bold text-teal-700">{{ totalScanned }}</span>
          </div>
          <div>
            <span class="text-[10px] text-slate-500 uppercase font-bold block">Difference</span>
            <span
              class="text-lg font-mono font-bold"
              :class="netDiscrepancyBottles === 0 ? 'text-emerald-600' : 'text-rose-600'"
            >
              {{ netDiscrepancyBottles > 0 ? `+${netDiscrepancyBottles}` : netDiscrepancyBottles }}
            </span>
          </div>
        </div>

        <p class="rounded-xl border px-3 py-2 text-xs font-semibold" :class="mismatchCount || unscannedCount ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'">
          {{ mismatchCount }} product(s) with a difference, {{ unscannedCount }} product(s) not scanned. {{ mismatchCount || unscannedCount ? 'Finish anyway?' : 'Everything matches.' }}
        </p>
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
            class="px-5 py-3 min-h-12 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-teal-600/20 disabled:opacity-50"
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

        <!-- TAB 1: Birmas Server & ESB API Sync -->
        <div v-if="birmasSyncTab === 'birmas'" class="space-y-4">
          <!-- Connection Config Form -->
          <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5 text-xs">
            <div>
              <label class="block font-bold text-slate-800 mb-1 flex items-center justify-between">
                <span>Target Server / Backend API URL</span>
                <span class="text-[10px] text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  Direct URL Supported
                </span>
              </label>
              <input
                v-model="birmasServerUrl"
                type="text"
                placeholder="https://core-api.esb.co.id/extv1/visit-purpose"
                class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
              <p class="text-[11px] text-slate-500 mt-1">
                Enter your Birmas backend or ESB endpoint. You can use full direct endpoint URLs like <code class="bg-slate-200/70 px-1 py-0.2 rounded font-mono text-[10.5px]">https://core-api.esb.co.id/extv1/visit-purpose</code>.
              </p>
            </div>

            <!-- Endpoint Suffix Control -->
            <div class="pt-2 border-t border-slate-200">
              <label class="block font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                <span>Append Endpoint Path?</span>
                <span v-if="birmasEndpointMode === 'none'" class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  ✓ No Endpoint Added (Direct Mode)
                </span>
              </label>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <!-- Option 1: No Endpoint (Direct URL) -->
                <button
                  @click="birmasEndpointMode = 'none'"
                  type="button"
                  class="p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2"
                  :class="birmasEndpointMode === 'none' ? 'bg-teal-50 border-teal-400 text-teal-950 font-semibold shadow-xs' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'"
                >
                  <div class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5"
                    :class="birmasEndpointMode === 'none' ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-400'">
                    <span v-if="birmasEndpointMode === 'none'" class="text-[9px] font-black">✓</span>
                  </div>
                  <div>
                    <span class="block text-xs font-bold">No Endpoint (Direct URL)</span>
                    <span class="block text-[10px] text-slate-500 mt-0.5">Use exact URL as specified without appending any route</span>
                  </div>
                </button>

                <!-- Option 2: ESB Visit Purposes -->
                <button
                  @click="birmasEndpointMode = 'visit_purpose'"
                  type="button"
                  class="p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2"
                  :class="birmasEndpointMode === 'visit_purpose' ? 'bg-teal-50 border-teal-400 text-teal-950 font-semibold shadow-xs' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'"
                >
                  <div class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5"
                    :class="birmasEndpointMode === 'visit_purpose' ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-400'">
                    <span v-if="birmasEndpointMode === 'visit_purpose'" class="text-[9px] font-black">✓</span>
                  </div>
                  <div>
                    <span class="block text-xs font-bold">ESB Visit Purposes</span>
                    <span class="block text-[10px] font-mono text-slate-500 mt-0.5">/extv1/visit-purpose</span>
                  </div>
                </button>

                <!-- Option 3: Birmas WordPress Stocks API -->
                <button
                  @click="birmasEndpointMode = 'wp'"
                  type="button"
                  class="p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2"
                  :class="birmasEndpointMode === 'wp' ? 'bg-teal-50 border-teal-400 text-teal-950 font-semibold shadow-xs' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'"
                >
                  <div class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5"
                    :class="birmasEndpointMode === 'wp' ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-400'">
                    <span v-if="birmasEndpointMode === 'wp'" class="text-[9px] font-black">✓</span>
                  </div>
                  <div>
                    <span class="block text-xs font-bold">Birmas Stocks API</span>
                    <span class="block text-[10px] font-mono text-slate-500 mt-0.5">/wp-json/api/v1/product_stock</span>
                  </div>
                </button>

                <!-- Option 4: Custom Endpoint -->
                <button
                  @click="birmasEndpointMode = 'custom'"
                  type="button"
                  class="p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2"
                  :class="birmasEndpointMode === 'custom' ? 'bg-teal-50 border-teal-400 text-teal-950 font-semibold shadow-xs' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'"
                >
                  <div class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5"
                    :class="birmasEndpointMode === 'custom' ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-400'">
                    <span v-if="birmasEndpointMode === 'custom'" class="text-[9px] font-black">✓</span>
                  </div>
                  <div>
                    <span class="block text-xs font-bold">Custom Endpoint</span>
                    <span class="block text-[10px] text-slate-500 mt-0.5">Enter custom route below</span>
                  </div>
                </button>
              </div>

              <!-- Custom input if custom selected -->
              <div v-if="birmasEndpointMode === 'custom'" class="mt-2.5">
                <input
                  v-model="customEndpointPath"
                  type="text"
                  placeholder="/extv1/menu"
                  class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              <!-- Live URL Preview -->
              <div class="mt-2.5 p-2.5 rounded-xl bg-slate-900 text-teal-300 font-mono text-[11px] flex items-center justify-between gap-2 overflow-x-auto">
                <div class="flex items-center gap-2 truncate">
                  <span class="text-slate-400 text-[10px] uppercase font-bold shrink-0">Query Target:</span>
                  <span class="truncate font-semibold">{{ computedTargetUrl }}</span>
                </div>
                <span v-if="birmasEndpointMode === 'none'" class="text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded shrink-0">
                  Exact URL
                </span>
              </div>
            </div>

            <!-- Optional Bearer Token -->
            <div class="pt-2 border-t border-slate-200">
              <label class="block font-bold text-slate-800 mb-1">
                Authorization Token / Bearer Key (Optional)
              </label>
              <input
                v-model="birmasTokenInput"
                type="password"
                placeholder="Leave blank to use server environment BIRMAS_API_TOKEN"
                class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <!-- Visit Purposes Viewer (If ESB Visit Purposes have been loaded) -->
          <div v-if="visitPurposesList.length > 0" class="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-2.5">
            <div class="flex items-start gap-2">
              <Sparkles class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span class="font-bold text-amber-950 block text-xs">ESB Visit Purposes Loaded ({{ visitPurposesList.length }} order channels)</span>
                <p class="text-[11px] text-amber-800 leading-relaxed mt-0.5">
                  Visit purposes define order channels (e.g. Dine In, Take Away, Delivery) for sales transactions, not product stocks.
                </p>
              </div>
            </div>

            <!-- Badges for visit purposes -->
            <div class="flex flex-wrap gap-1.5 pt-1">
              <span
                v-for="vp in visitPurposesList"
                :key="vp.id"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white text-slate-800 border border-amber-300 shadow-2xs"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>{{ vp.name }}</span>
                <span class="text-[9px] text-slate-400 font-mono">#{{ vp.id }}</span>
              </span>
            </div>

            <!-- Action to fetch real product stocks -->
            <div class="pt-2 border-t border-amber-200/80 flex items-center justify-between gap-2">
              <span class="text-[11px] text-amber-900 font-medium">Want product stocks from ESB Cloud?</span>
              <button
                @click="handleSyncESBStocks"
                :disabled="isSyncingESBStock"
                type="button"
                class="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isSyncingESBStock }" />
                <span>{{ isSyncingESBStock ? 'Syncing ESB Catalog...' : 'Sync ESB Product Stocks' }}</span>
              </button>
            </div>
            <p v-if="esbStockStatusMsg" class="text-[11px] font-bold text-emerald-800 bg-emerald-100/70 p-2 rounded-lg">
              {{ esbStockStatusMsg }}
            </p>
          </div>

          <!-- Status Message -->
          <div v-if="sessionStatusMsg" class="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 font-medium leading-relaxed">
            {{ sessionStatusMsg }}
          </div>

          <!-- Pull / Trigger Button -->
          <div class="flex items-center gap-2">
            <button
              @click="handleBirmasServerSync"
              :disabled="isSyncing || isSyncingBirmas"
              type="button"
              class="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-teal-600/20 disabled:opacity-50 cursor-pointer transition-all"
            >
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isSyncing || isSyncingBirmas }" />
              <span>{{ isSyncing || isSyncingBirmas ? 'Connecting & Syncing...' : 'Query URL & Refresh Stock Now' }}</span>
            </button>
            <button
              @click="handleSyncESBStocks"
              :disabled="isSyncingESBStock"
              type="button"
              class="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
              title="Direct POS Live Catalog sync using ESB branch & menu APIs"
            >
              <Zap class="w-3.5 h-3.5 text-amber-600" />
              <span>Sync ESB POS</span>
            </button>
          </div>

          <!-- Push API Accordion -->
          <div class="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/60">
            <button
              @click="showPushApiDocs = !showPushApiDocs"
              type="button"
              class="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <div class="flex items-center gap-2">
                <Zap class="w-3.5 h-3.5 text-amber-600" />
                <span>Want to PUSH data directly from your server to Audit?</span>
              </div>
              <component :is="showPushApiDocs ? ChevronDown : ChevronRight" class="w-3.5 h-3.5 text-slate-400" />
            </button>

            <div v-if="showPushApiDocs" class="p-4 pt-1 space-y-3 text-xs border-t border-slate-200 bg-white">
              <p class="text-slate-600 text-[11px] leading-relaxed">
                You can also configure your Birmas server backend, cron job, or webhook to <strong>send (POST)</strong> stock data directly to this audit server at <code class="text-teal-800 font-mono font-bold">/api/stock/push</code>:
              </p>

              <div class="relative bg-slate-900 rounded-xl p-3 font-mono text-[11px] text-teal-300 overflow-x-auto">
                <button
                  @click="copyPushCurlCommand"
                  type="button"
                  class="absolute right-2 top-2 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-sans font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <component :is="pushCopied ? Check : Copy" class="w-3 h-3 text-teal-400" />
                  <span>{{ pushCopied ? 'Copied!' : 'Copy cURL' }}</span>
                </button>
                <pre class="pr-16 text-[10.5px] leading-relaxed">curl -X POST "{{ typeof window !== 'undefined' ? window.location.origin : '' }}/api/stock/push" \
  -H "Authorization: Bearer &lt;CONFIGURED_SERVER_TOKEN&gt;" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "store": "Birmas Sudirman",
      "productName": "Canard Brut Lager 330ml",
      "barcode": "8997026800122",
      "stockQty": 24,
      "category": "Craft Beer",
      "unit": "Can"
    }
  ]'</pre>
              </div>
              <p class="text-[11px] text-slate-500">
                Any payload received is immediately applied into SQLite and shown on this Stock Audit table!
              </p>
            </div>
          </div>
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
              class="px-5 py-3 min-h-12 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-teal-600/20 disabled:opacity-50"
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

    <!-- Superadmin Unlock Confirmation Modal -->
    <div
      v-if="isUnlockModalOpen"
      class="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xl max-w-md w-full space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 shrink-0">
            <Unlock class="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 class="text-sm font-black text-slate-900">
              Unlock Audit Session?
            </h3>
            <p class="text-xs text-slate-500">
              Bertha Authorization Required
            </p>
          </div>
        </div>

        <div class="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1.5">
          <p class="font-bold flex items-center gap-1.5 text-amber-900">
            <ShieldCheck class="w-4 h-4 text-amber-700" />
            <span>Store: {{ currentStore.name }}</span>
          </p>
          <p class="text-[11px] text-amber-900">
            Unlocking this session will unfreeze physical counts and allow the store team and auditors to resume scanning and recounting items.
          </p>
        </div>

        <div v-if="unlockError" class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-bold">
          {{ unlockError }}
        </div>

        <div class="flex items-center justify-end gap-2 pt-2">
          <button
            @click="isUnlockModalOpen = false"
            type="button"
            class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            @click="handleUnlockConfirm"
            :disabled="isUnlocking"
            type="button"
            class="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-amber-700/20 cursor-pointer disabled:opacity-50"
          >
            <Unlock class="w-3.5 h-3.5" />
            <span>{{ isUnlocking ? 'Unlocking...' : 'Approve & Unlock' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Audit Complete success animation -->
    <transition name="audit-success">
      <div
        v-if="showAuditSuccess"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
        @click="showAuditSuccess = false"
      >
        <div class="bg-white rounded-3xl shadow-2xl px-12 py-10 flex flex-col items-center gap-4 audit-success-card">
          <svg class="w-24 h-24" viewBox="0 0 52 52" fill="none">
            <circle class="audit-success-circle" cx="26" cy="26" r="24" stroke="#0d9488" stroke-width="3" />
            <path class="audit-success-check" d="M14 27 l8 8 l16 -17" stroke="#0d9488" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <p class="text-2xl font-extrabold text-slate-900">Audit Complete</p>
          <p class="text-sm font-semibold text-teal-700">Success! Saved to Audit Records.</p>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.audit-success-enter-active, .audit-success-leave-active { transition: opacity 0.3s ease; }
.audit-success-enter-from, .audit-success-leave-to { opacity: 0; }
.audit-success-card { animation: audit-pop 0.5s cubic-bezier(0.2, 1.4, 0.4, 1); }
.audit-success-circle { stroke-dasharray: 151; stroke-dashoffset: 151; animation: audit-draw 0.6s ease forwards; }
.audit-success-check { stroke-dasharray: 40; stroke-dashoffset: 40; animation: audit-draw 0.4s 0.5s ease forwards; }
@keyframes audit-draw { to { stroke-dashoffset: 0; } }
@keyframes audit-pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.scan-flash-success { animation: scan-success-flash 550ms ease-out; }
.scan-flash-error { animation: scan-error-flash 550ms ease-out; }
@keyframes scan-success-flash { 0% { box-shadow: 0 0 0 5px rgb(16 185 129 / 35%); } 100% { box-shadow: 0 0 0 0 rgb(16 185 129 / 0%); } }
@keyframes scan-error-flash { 0% { box-shadow: 0 0 0 5px rgb(244 63 94 / 35%); } 100% { box-shadow: 0 0 0 0 rgb(244 63 94 / 0%); } }
</style>
