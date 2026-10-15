<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
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
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Layers,
  Database,
  ExternalLink,
  Package,
  Trash2,
  Zap,
  Settings,
  LayoutGrid,
  List,
  Boxes,
  Eye,
  CheckCheck,
  SlidersHorizontal,
  ArrowRight,
  Volume2,
  VolumeX,
  Info,
  X
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
  hasAuditStarted,
  storeItemsCount,
  scannedVariantsCount,
  countingVariantsCount,
  matchedVariantsCount,
  missingVariantsCount,
  surplusVariantsCount,
  unscannedVariantsCount,
  auditProgressPercentage,
  netDiscrepancyBottles,
  totalShortageBottles,
  totalSurplusBottles,
  isAutoCheckerActive,
  lastCheckedAt,
  registerAuditScan,
  decrementAuditCount,
  addBatchAuditCount,
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

// UI Workflow & Display Controls
const auditPhase = ref('counting'); // 'counting' (Pencacahan Fisik) | 'reconciliation' (Review Rekonsiliasi & Selisih)
const viewLayout = ref('table'); // 'table' | 'cards'
const groupMode = ref('brand'); // 'brand' | 'flat'
const collapsedBrands = ref(new Set());
const lastScannedItem = ref(null);
const isAudioMuted = ref(false);

const searchQuery = ref('');
const statusFilter = ref('ALL');
const brandFilter = ref('ALL');

// Modals
const isCompleteModalOpen = ref(false);
const isAddBarcodeModalOpen = ref(false);
const isResetConfirmModalOpen = ref(false);
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
  soundEnabled: false, // controlled manually to respect isAudioMuted and prevent duplicate beeps
  onScan: async (scannedBarcode) => {
    const result = await registerAuditScan(scannedBarcode, currentUser.value?.name || 'Auditor');
    if (result.success) {
      const current = auditItems.value.find((i) => i.barcode === scannedBarcode);
      lastScannedItem.value = current || result.item;
      if (!isAudioMuted.value) {
        if (result.isMatchedNow) {
          playScanMatchSound();
        } else if (result.isOvercount) {
          playScanErrorSound();
        } else {
          playScanSuccessSound();
        }
      }
    } else {
      if (!isAudioMuted.value) {
        playScanErrorSound();
      }
      if (result.unknownBarcode) {
        pendingUnknownBarcode.value = result.unknownBarcode;
      }
    }
    return result;
  },
});

function toggleAudioMute() {
  isAudioMuted.value = !isAudioMuted.value;
}

// Global Hardware Scanner Listener (captures barcode even if input isn't manually focused)
let globalScanBuffer = '';
let lastKeyTimestamp = 0;

function handleGlobalScannerKeydown(e) {
  const activeEl = document.activeElement;
  const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
  if (isInput && activeEl.id !== 'scanner-main-input') {
    return;
  }

  const now = Date.now();
  if (now - lastKeyTimestamp > 150) {
    globalScanBuffer = '';
  }
  lastKeyTimestamp = now;

  if (e.key === 'Enter') {
    if (globalScanBuffer.length >= 4) {
      processBarcode(globalScanBuffer.trim());
      globalScanBuffer = '';
      e.preventDefault();
    }
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    globalScanBuffer += e.key;
  }
}

// Quick Box Multiplier Handler
async function handleBatchAdd(item, amount) {
  if (!item?.barcode) return;
  await addBatchAuditCount(item.barcode, amount);
  const updated = auditItems.value.find((i) => i.barcode === item.barcode);
  lastScannedItem.value = updated || {
    ...item,
    scannedCount: (item.scannedCount || 0) + amount,
  };
  if (!isAudioMuted.value) {
    playScanSuccessSound();
  }
}

function toggleBrandCollapse(brand) {
  if (collapsedBrands.value.has(brand)) {
    collapsedBrands.value.delete(brand);
  } else {
    collapsedBrands.value.add(brand);
  }
}

function expandAllBrands() {
  collapsedBrands.value.clear();
}

function collapseAllBrands() {
  collapsedBrands.value = new Set(brandGroups.value.map((b) => b.brand));
}

// All items in catalog filtered for the comparison table / cards
const filteredItems = computed(() => {
  return auditItems.value.filter((item) => {
    if (brandFilter.value !== 'ALL' && (item.subCategory !== brandFilter.value && item.brand !== brandFilter.value)) {
      return false;
    }
    if (statusFilter.value === 'discrepancy') {
      return item.discrepancy !== 0 && (item.wpExpectedQty > 0 || item.scannedCount > 0);
    }
    if (statusFilter.value === 'shortage') {
      return item.discrepancy < 0 && item.wpExpectedQty > 0;
    }
    if (statusFilter.value === 'surplus') {
      return item.discrepancy > 0;
    }
    if (statusFilter.value === 'matched') {
      return item.status === 'matched';
    }
    if (statusFilter.value === 'unscanned') {
      return item.status === 'unscanned';
    }
    if (statusFilter.value === 'counting') {
      return item.status === 'counting';
    }
    if (searchQuery.value && searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      const bCode = String(item.barcode || '').toLowerCase();
      const bBrand = String(item.subCategory || item.brand || '').toLowerCase();
      const bTitle = String(item.productTitle || item.varian || '').toLowerCase();
      const bSku = String(item.sku || '').toLowerCase();
      const bCat = String(item.category || '').toLowerCase();

      const match =
        bCode.includes(q) ||
        bBrand.includes(q) ||
        bTitle.includes(q) ||
        bSku.includes(q) ||
        bCat.includes(q);
      if (!match) return false;
    }
    return true;
  });
});

// Grouped by Brand for hierarchical shelf counting
const brandGroups = computed(() => {
  const map = new Map();
  for (const item of filteredItems.value) {
    const brand = item.subCategory || item.brand || 'Other Brands';
    if (!map.has(brand)) {
      map.set(brand, []);
    }
    map.get(brand).push(item);
  }

  const list = [];
  for (const [brand, items] of map.entries()) {
    const expectedTotal = items.reduce((sum, i) => sum + i.wpExpectedQty, 0);
    const scannedTotal = items.reduce((sum, i) => sum + i.scannedCount, 0);
    const matchedCount = items.filter((i) => i.status === 'matched').length;
    const isComplete =
      items.length > 0 &&
      items.every(
        (i) => i.status === 'matched' || (i.wpExpectedQty === 0 && i.scannedCount === 0)
      );

    list.push({
      brand,
      items,
      expectedTotal,
      scannedTotal,
      matchedCount,
      totalCount: items.length,
      isComplete,
    });
  }

  return list.sort((a, b) => a.brand.localeCompare(b.brand));
});

// Products physically scanned in this session (scannedCount > 0)
const scannedOnlyItems = computed(() => {
  return auditItems.value.filter((item) => item.scannedCount > 0);
});

const accuracyPercentage = computed(() => {
  const activeItems = auditItems.value.filter((i) => i.wpExpectedQty > 0 || i.scannedCount > 0);
  if (activeItems.length === 0) return 100;
  if (!hasAuditStarted.value) return 100; // Not started yet, not 0% failure
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
    const current = auditItems.value.find((i) => i.barcode === item.barcode);
    lastScannedItem.value = current;
  }
  editingBarcode.value = null;
}

function handleResetAuditSession() {
  isResetConfirmModalOpen.value = true;
}

function confirmResetAudit() {
  resetCurrentAudit();
  lastScannedItem.value = null;
  isResetConfirmModalOpen.value = false;
}

function exportAuditToCSV() {
  const headers = [
    'Barcode',
    'Brand/Kategori',
    'Nama Produk & Varian',
    'Unit',
    'Stok Sistem ESB',
    'Fisik Terhitung',
    'Selisih (Variance)',
    'Status Rekonsiliasi',
    'Lokasi Toko',
    'Waktu Export'
  ];

  const rows = auditItems.value.map((item) => {
    let statusLabel = 'Belum Dipindai';
    if (item.status === 'matched') {
      statusLabel = 'Sesuai (Match)';
    } else if (item.discrepancy < 0) {
      statusLabel = `Kurang (${item.discrepancy})`;
    } else if (item.discrepancy > 0) {
      statusLabel = `Lebih (+${item.discrepancy})`;
    } else if (item.status === 'zero_stock') {
      statusLabel = 'Stok Kosong (0)';
    }

    return [
      `"${item.barcode}"`,
      `"${(item.subCategory || item.brand || '').replace(/"/g, '""')}"`,
      `"${(item.productTitle || item.varian || '').replace(/"/g, '""')}"`,
      `"${item.defaultUnit || ''}"`,
      item.wpExpectedQty,
      item.scannedCount,
      item.discrepancy,
      `"${statusLabel}"`,
      `"${(currentStore.value.name || '').replace(/"/g, '""')}"`,
      `"${new Date().toLocaleString('id-ID')}"`
    ].join(',');
  });

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Audit_${(currentStore.value.name || 'Store').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
    alert('Audit berhasil ditandatangani dan disimpan dalam rekaman riwayat!');
  } catch (err) {
    alert('Gagal menyelesaikan audit: ' + err.message);
  } finally {
    isFinalizing.value = false;
  }
}

function openAddBarcodeWithPrefill(barcode) {
  pendingUnknownBarcode.value = barcode || '';
  isAddBarcodeModalOpen.value = true;
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalScannerKeydown);
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  if (document.documentElement) document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
  loadBirmasConfig();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalScannerKeydown);
});
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
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
              Station & Rekonsiliasi
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Pencacahan fisik dengan barcode scanner, verifikasi stok per varian botol/kaleng, dan rekonsiliasi selisih terhadap ESB.
          </p>
        </div>
      </div>

      <!-- Action Bar: Store Selector, Sound Toggle, Export CSV, Add Barcode, Complete Audit -->
      <div class="flex flex-wrap items-center gap-2">
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

        <!-- Sound Toggle Button -->
        <button
          @click="toggleAudioMute"
          type="button"
          class="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
          :class="isAudioMuted ? 'bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-200' : 'bg-teal-50 border-teal-300 text-teal-800 hover:bg-teal-100'"
          :title="isAudioMuted ? 'Suara scanner mati (Klik untuk mengaktifkan beep)' : 'Suara scanner aktif (Klik untuk membisukan)'"
        >
          <component :is="isAudioMuted ? VolumeX : Volume2" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">{{ isAudioMuted ? 'Muted' : 'Beep Aktif' }}</span>
        </button>

        <!-- Export CSV Button -->
        <button
          @click="exportAuditToCSV"
          type="button"
          class="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
          title="Unduh laporan rekonsiliasi audit dalam format CSV"
        >
          <Download class="w-3.5 h-3.5 text-slate-600" />
          <span class="hidden sm:inline">Export CSV</span>
        </button>

        <!-- Add New Barcode Button -->
        <button
          @click="openAddBarcodeWithPrefill()"
          type="button"
          class="px-3 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
          title="Tambah barcode baru yang belum terdaftar"
        >
          <Plus class="w-3.5 h-3.5 text-teal-700" />
          <span class="hidden sm:inline">Tambah Barcode</span>
        </button>

        <!-- Finalize Audit Button -->
        <button
          @click="isCompleteModalOpen = true"
          type="button"
          class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all cursor-pointer"
        >
          <CheckCircle2 class="w-4 h-4" />
          <span>Selesaikan Audit</span>
        </button>
      </div>
    </div>

    <!-- Workflow Stepper / Phase Selector (Solves the premature discrepancy issue) -->
    <div class="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-2">
      <div class="flex items-center gap-1.5 w-full sm:w-auto bg-slate-100/90 p-1 rounded-xl border border-slate-200">
        <!-- Tab 1: Counting Phase -->
        <button
          @click="auditPhase = 'counting'"
          type="button"
          class="flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
          :class="
            auditPhase === 'counting'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          "
        >
          <Barcode class="w-4 h-4" />
          <span>1. Mode Hitung Fisik (Scan Station)</span>
          <span
            class="text-[10px] font-mono px-1.5 py-0.2 rounded"
            :class="auditPhase === 'counting' ? 'bg-teal-700 text-white' : 'bg-slate-200 text-slate-700'"
          >
            {{ totalScanned }} Unit
          </span>
        </button>

        <!-- Tab 2: Reconciliation Review Phase -->
        <button
          @click="auditPhase = 'reconciliation'"
          type="button"
          class="flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
          :class="
            auditPhase === 'reconciliation'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          "
        >
          <CheckCheck class="w-4 h-4" />
          <span>2. Review Rekonsiliasi & Selisih</span>
          <span
            v-if="hasAuditStarted"
            class="text-[10px] font-mono px-1.5 py-0.2 rounded font-bold"
            :class="
              netDiscrepancyBottles === 0
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-rose-100 text-rose-800'
            "
          >
            {{ netDiscrepancyBottles === 0 ? 'Match' : `${netDiscrepancyBottles > 0 ? `+${netDiscrepancyBottles}` : netDiscrepancyBottles}` }}
          </span>
        </button>
      </div>

      <!-- Realtime Hardware Scanner Readiness Indicator -->
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-50/80 border border-teal-200 text-teal-800 text-xs font-medium">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="font-semibold text-[11px]">Hardware Scanner Ready</span>
        <span class="text-[11px] text-teal-600 hidden md:inline">(Arahkan & tembak barcode di mana saja)</span>
      </div>
    </div>

    <!-- Counting Station (Visible in Counting Mode) -->
    <div v-show="auditPhase === 'counting'" class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
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
                  Mode Pencacahan
                </span>
              </h2>
              <p class="text-xs text-slate-500">
                Pindai 1 kali untuk setiap botol/kaleng fisik, atau gunakan tombol batch (+6, +12, +24 Karton) untuk kardus utuh.
              </p>
            </div>
          </div>

          <!-- Reset session button -->
          <div class="flex items-center gap-2">
            <button
              @click="handleResetAuditSession"
              type="button"
              class="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw class="w-3.5 h-3.5" />
              <span>Reset Hitungan Fisik</span>
            </button>
          </div>
        </div>

        <!-- Initial Session Clarity Banner: Explains why 0 scans is not a deficit/discrepancy -->
        <div
          v-if="!hasAuditStarted"
          class="p-3.5 rounded-xl bg-teal-50/90 border border-teal-200 text-teal-900 text-xs flex items-start gap-2.5"
        >
          <Info class="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
          <div class="leading-relaxed">
            <span class="font-bold block text-teal-950">Sesi Audit Siap: Belum ada fisik yang dipindai</span>
            <span class="text-teal-800 text-[11px] block mt-0.5">
              Semua produk di katalog saat ini berstatus <strong>"Belum Dipindai"</strong> (bukan selisih). Nilai selisih riil (kurang/lebih) baru akan dievaluasi saat Anda membuka tab <strong>"2. Review Rekonsiliasi & Selisih"</strong> setelah pencacahan selesai.
            </span>
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
            placeholder="Pindai barcode botol / kaleng dengan scanner USB / Wireless (atau ketik barcode)..."
            class="w-full pl-13 pr-28 py-3.5 bg-slate-50 text-slate-900 placeholder-slate-400 text-base font-mono rounded-xl border-2 border-slate-300 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-teal-100 transition-all shadow-inner"
            @keydown.enter.prevent="processBarcode($event.target.value); $event.target.value = ''"
          />
          <span class="absolute right-3 px-2.5 py-1 rounded bg-white border border-slate-300 text-[11px] font-mono text-teal-700 font-semibold shadow-sm">
            Auto-Enter
          </span>
        </div>

        <!-- Last Scanned Product Hero Banner (Prominent Visual Confirmation) -->
        <div
          v-if="lastScannedItem"
          class="p-4 rounded-2xl border transition-all animate-in fade-in slide-in-from-top-2 duration-300"
          :class="
            lastScannedItem.status === 'matched'
              ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
              : lastScannedItem.status === 'surplus'
              ? 'bg-amber-50/80 border-amber-300 text-amber-950'
              : 'bg-teal-50/70 border-teal-300 text-teal-950'
          "
        >
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="flex items-center gap-3">
              <div
                class="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white shadow-xs shrink-0"
                :class="
                  lastScannedItem.status === 'matched'
                    ? 'bg-emerald-600'
                    : lastScannedItem.status === 'surplus'
                    ? 'bg-amber-600'
                    : 'bg-teal-600'
                "
              >
                <Package class="w-5 h-5" />
              </div>
              <div>
                <span class="text-[10px] font-bold uppercase tracking-wider block opacity-75">
                  Produk Baru Terpindai:
                </span>
                <h4 class="text-sm sm:text-base font-extrabold tracking-tight">
                  {{ lastScannedItem.productTitle || lastScannedItem.varian }}
                </h4>
                <div class="flex items-center gap-2 text-xs font-mono opacity-85 mt-0.5">
                  <span class="font-bold">{{ lastScannedItem.brand }}</span>
                  <span>•</span>
                  <span>{{ lastScannedItem.barcode }}</span>
                  <span v-if="lastScannedItem.defaultUnit">• {{ lastScannedItem.defaultUnit }}</span>
                </div>
              </div>
            </div>

            <!-- Tally & Quick Batch Modifiers -->
            <div class="flex items-center gap-2 self-end sm:self-auto flex-wrap">
              <!-- Count stepper -->
              <div class="flex items-center bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs gap-2">
                <button
                  @click="decrementAuditCount(lastScannedItem.barcode)"
                  class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-colors cursor-pointer"
                  title="Kurang 1"
                >
                  <Minus class="w-3.5 h-3.5" />
                </button>

                <div class="text-center px-1">
                  <span class="text-lg font-mono font-black text-slate-900 block leading-tight">
                    {{ lastScannedItem.scannedCount }}
                  </span>
                  <span class="text-[10px] font-mono text-slate-500 block leading-none">
                    Target: {{ lastScannedItem.wpExpectedQty }}
                  </span>
                </div>

                <button
                  @click="registerAuditScan(lastScannedItem.barcode)"
                  class="w-7 h-7 rounded-lg bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center font-bold transition-colors cursor-pointer shadow-xs"
                  title="Tambah 1"
                >
                  <Plus class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Quick Multipliers (Box Multipliers) -->
              <div class="flex items-center gap-1 bg-white/80 p-1 rounded-xl border border-slate-200">
                <button
                  @click="handleBatchAdd(lastScannedItem, 6)"
                  type="button"
                  class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-teal-100 text-slate-800 hover:text-teal-900 text-xs font-bold transition-colors cursor-pointer"
                  title="Tambah 6 botol/kaleng"
                >
                  +6
                </button>
                <button
                  @click="handleBatchAdd(lastScannedItem, 12)"
                  type="button"
                  class="px-2 py-1 rounded-lg bg-slate-100 hover:bg-teal-100 text-slate-800 hover:text-teal-900 text-xs font-bold transition-colors cursor-pointer"
                  title="Tambah 12 botol/kaleng"
                >
                  +12
                </button>
                <button
                  @click="handleBatchAdd(lastScannedItem, 24)"
                  type="button"
                  class="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                  title="Tambah 1 Karton / Box (24 kaleng)"
                >
                  <Boxes class="w-3.5 h-3.5" />
                  <span>+24 (Box)</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Unknown Barcode Notice & Quick Add Action -->
        <div
          v-if="pendingUnknownBarcode"
          class="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs gap-3"
        >
          <div class="flex items-center gap-2">
            <AlertTriangle class="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Barcode belum terdaftar: <strong class="font-mono">{{ pendingUnknownBarcode }}</strong>.
              Tidak ditemukan dalam katalog {{ currentStore.name }}.
            </span>
          </div>
          <button
            @click="openAddBarcodeWithPrefill(pendingUnknownBarcode)"
            class="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shrink-0 flex items-center gap-1 shadow-sm cursor-pointer"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Petakan Barcode Ini</span>
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
            {{ scanFeedback.type === 'success' ? 'Tercatat' : 'Peringatan' }}
          </span>
        </div>
      </div>
    </div>

    <!-- KPI Summary Cards (Context-Aware for Phase 1 vs Phase 2) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Card 1: ESB Target Stock -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">TARGET STOK ESB</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">Sistem</span>
        </div>
        <div class="my-2">
          <span class="text-3xl font-extrabold text-slate-900 font-mono">{{ totalWpExpected }}</span>
          <span class="text-xs text-slate-500 ml-1.5">unit</span>
        </div>
        <p class="text-[11px] text-slate-500">
          Target stok terdaftar di outlet {{ currentStore.name }}
        </p>
      </div>

      <!-- Card 2: Physical Count (Scanned) -->
      <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">FISIK TERHITUNG</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">Scanner</span>
        </div>
        <div class="my-2 flex items-baseline gap-2">
          <span class="text-3xl font-extrabold text-teal-700 font-mono">{{ totalScanned }}</span>
          <span class="text-xs text-slate-500">unit terhitung</span>
        </div>
        <p class="text-[11px] text-slate-500">
          Total botol & kaleng fisik yang sudah dihitung
        </p>
      </div>

      <!-- Card 3: Context-aware KPI -->
      <!-- In Counting Phase: Shows Audit Progress (% of SKUs audited) -->
      <div v-if="auditPhase === 'counting'" class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">PROGRESS PENCACAHAN</span>
          <span class="text-xs font-mono font-bold text-teal-800">{{ scannedVariantsCount }} / {{ storeItemsCount || auditItems.length }} SKU</span>
        </div>
        <div class="my-2">
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-extrabold text-teal-700 font-mono">{{ auditProgressPercentage }}%</span>
          </div>
          <div class="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden border border-slate-200">
            <div
              class="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-500"
              :style="{ width: `${auditProgressPercentage}%` }"
            ></div>
          </div>
        </div>
        <p class="text-[11px] text-slate-500">
          {{ unscannedVariantsCount }} SKU belum dihitung • {{ countingVariantsCount }} sedang proses
        </p>
      </div>

      <!-- In Reconciliation Phase: Shows Net Discrepancy (True Discrepancy) -->
      <div v-else class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">SELISIH BERSIH FISIK</span>
          <span
            class="text-[10px] font-bold px-2 py-0.5 rounded"
            :class="
              !hasAuditStarted
                ? 'bg-slate-100 text-slate-600'
                : netDiscrepancyBottles === 0
                ? 'bg-emerald-100 text-emerald-800'
                : netDiscrepancyBottles < 0
                ? 'bg-rose-100 text-rose-800'
                : 'bg-amber-100 text-amber-800'
            "
          >
            {{ !hasAuditStarted ? 'Siap' : netDiscrepancyBottles === 0 ? 'Sesuai' : netDiscrepancyBottles < 0 ? 'Kurang' : 'Lebih' }}
          </span>
        </div>
        <div class="my-2">
          <span
            class="text-3xl font-extrabold font-mono"
            :class="
              !hasAuditStarted
                ? 'text-slate-400'
                : netDiscrepancyBottles === 0
                ? 'text-emerald-600'
                : netDiscrepancyBottles < 0
                ? 'text-rose-600'
                : 'text-amber-600'
            "
          >
            {{ !hasAuditStarted ? '0' : (netDiscrepancyBottles > 0 ? `+${netDiscrepancyBottles}` : netDiscrepancyBottles) }}
          </span>
          <span class="text-xs text-slate-500 ml-1.5">unit variansi</span>
        </div>
        <p class="text-[11px] text-slate-500">
          {{ !hasAuditStarted ? 'Belum ada penghitungan fisik' : `${missingVariantsCount} SKU kurang (-${totalShortageBottles}) • ${surplusVariantsCount} SKU lebih (+${totalSurplusBottles})` }}
        </p>
      </div>

      <!-- Card 4: Status Sesi / Akurasi -->
      <div v-if="auditPhase === 'counting'" class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">STATUS SESI AUDIT</span>
          <span
            class="w-2.5 h-2.5 rounded-full"
            :class="hasAuditStarted ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'"
          ></span>
        </div>
        <div class="my-2">
          <span class="text-2xl font-extrabold text-slate-900">
            {{ hasAuditStarted ? 'Sedang Menghitung' : 'Sesi Baru' }}
          </span>
          <span class="text-xs text-slate-500 block mt-0.5 font-medium">
            {{ hasAuditStarted ? `${totalScanned} unit telah dicatat` : 'Belum ada scan (Siap Pindai)' }}
          </span>
        </div>
        <p class="text-[11px] text-slate-500">
          {{ matchedVariantsCount }} SKU telah persis sesuai target
        </p>
      </div>

      <div v-else class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">AKURASI REKONSILIASI</span>
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
          Target: 100% matched dengan data ESB
        </p>
      </div>
    </div>

    <!-- Main Comparison Section (Physical Count vs ESB) -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <!-- Table Header & Filter Toolbar -->
      <div class="p-5 border-b border-slate-100 bg-slate-50/80 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                {{ currentStore.name }} • {{ auditPhase === 'counting' ? 'Pencacahan Fisik Rak / Chiller' : 'Hasil Rekonsiliasi Fisik vs ESB' }}
              </h3>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              {{
                auditPhase === 'counting'
                  ? 'Fokus menghitung fisik. Gunakan tombol +6, +12, +24 untuk karton utuh agar penghitungan cepat.'
                  : 'Daftar perbandingan lengkap fisik vs sistem ESB. Periksa shortage (kurang) dan surplus (lebih) sebelum sign-off.'
              }}
            </p>
          </div>

          <!-- View Layout & Grouping Controls -->
          <div class="flex items-center gap-2 flex-wrap">
            <!-- Grouping Toggle -->
            <div class="flex items-center bg-white p-1 rounded-xl border border-slate-300 shadow-2xs">
              <button
                @click="groupMode = 'brand'"
                type="button"
                class="px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                :class="groupMode === 'brand' ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'"
                title="Kelompokkan berdasarkan Brand / Rak"
              >
                Grup Brand
              </button>
              <button
                @click="groupMode = 'flat'"
                type="button"
                class="px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                :class="groupMode === 'flat' ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'"
                title="Tampilkan daftar flat semua produk"
              >
                Semua SKU
              </button>
            </div>

            <!-- Brand Accordion Quick Helpers -->
            <div v-if="groupMode === 'brand'" class="hidden md:flex items-center gap-1">
              <button
                @click="expandAllBrands"
                type="button"
                class="px-2 py-1 rounded-lg text-[11px] font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                title="Buka semua grup brand"
              >
                Buka Semua
              </button>
              <button
                @click="collapseAllBrands"
                type="button"
                class="px-2 py-1 rounded-lg text-[11px] font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
                title="Tutup semua grup brand"
              >
                Tutup Semua
              </button>
            </div>

            <!-- Table / Cards Layout Toggle -->
            <div class="flex items-center bg-white p-1 rounded-xl border border-slate-300 shadow-2xs">
              <button
                @click="viewLayout = 'table'"
                type="button"
                class="p-1.5 rounded-lg transition-colors cursor-pointer"
                :class="viewLayout === 'table' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-slate-900'"
                title="Tampilan Tabel"
              >
                <List class="w-4 h-4" />
              </button>
              <button
                @click="viewLayout = 'cards'"
                type="button"
                class="p-1.5 rounded-lg transition-colors cursor-pointer"
                :class="viewLayout === 'cards' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-slate-900'"
                title="Tampilan Kartu / Handheld"
              >
                <LayoutGrid class="w-4 h-4" />
              </button>
            </div>

            <button
              @click="openAddBarcodeWithPrefill()"
              type="button"
              class="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Tambah Barcode</span>
            </button>
          </div>
        </div>

        <!-- Filter tabs & search -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
          <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start flex-wrap">
            <button
              @click="statusFilter = 'ALL'"
              type="button"
              class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              :class="statusFilter === 'ALL' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
            >
              Semua ({{ auditItems.length }})
            </button>

            <!-- In Counting Mode -->
            <template v-if="auditPhase === 'counting'">
              <button
                @click="statusFilter = 'unscanned'"
                type="button"
                class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                :class="statusFilter === 'unscanned' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
              >
                <span>Belum Dipindai</span>
                <span class="px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">{{ unscannedVariantsCount }}</span>
              </button>
              <button
                @click="statusFilter = 'counting'"
                type="button"
                class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                :class="statusFilter === 'counting' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
              >
                <span>Sedang Dihitung</span>
                <span class="px-1.5 py-0.2 rounded bg-teal-100 text-teal-800 text-[10px] font-bold">{{ countingVariantsCount }}</span>
              </button>
              <button
                @click="statusFilter = 'matched'"
                type="button"
                class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                :class="statusFilter === 'matched' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
              >
                <span>Sesuai Target</span>
                <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">{{ matchedVariantsCount }}</span>
              </button>
              <button
                v-if="surplusVariantsCount > 0"
                @click="statusFilter = 'surplus'"
                type="button"
                class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                :class="statusFilter === 'surplus' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
              >
                <span>Kelebihan</span>
                <span class="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">+{{ surplusVariantsCount }}</span>
              </button>
            </template>

            <!-- In Reconciliation Mode -->
            <template v-else>
              <button
                @click="statusFilter = 'discrepancy'"
                type="button"
                class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                :class="statusFilter === 'discrepancy' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
              >
                <span>Ada Selisih</span>
                <span class="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">{{ missingVariantsCount + surplusVariantsCount }}</span>
              </button>
              <button
                @click="statusFilter = 'shortage'"
                type="button"
                class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                :class="statusFilter === 'shortage' ? 'bg-rose-700 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
              >
                <span>Kurang</span>
                <span class="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">{{ missingVariantsCount }}</span>
              </button>
              <button
                @click="statusFilter = 'surplus'"
                type="button"
                class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                :class="statusFilter === 'surplus' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
              >
                <span>Lebih</span>
                <span class="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">{{ surplusVariantsCount }}</span>
              </button>
              <button
                @click="statusFilter = 'matched'"
                type="button"
                class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                :class="statusFilter === 'matched' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'"
              >
                <span>Sesuai (Match)</span>
                <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">{{ matchedVariantsCount }}</span>
              </button>
            </template>
          </div>

          <!-- Search input with clear button -->
          <div class="relative w-full sm:w-64">
            <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Cari varian, brand, atau barcode..."
              class="w-full pl-9 pr-8 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 shadow-2xs"
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              title="Hapus pencarian"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- VIEW 1: TABLE VIEW -->
      <div v-if="viewLayout === 'table'" class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)] min-h-[450px] flex-1 relative border-t border-slate-200">
        <table class="w-full text-left border-collapse">
          <thead class="sticky top-0 z-20 shadow-xs">
            <tr class="bg-slate-100 border-b border-slate-300 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <th class="py-3 px-3 w-10 text-center bg-slate-100">No</th>
              <th class="py-3 px-3 bg-slate-100">Kode Barcode</th>
              <th class="py-3 px-3 bg-slate-100">Brand</th>
              <th class="py-3 px-4 bg-slate-100">Nama Produk & Varian</th>
              <th class="py-3 px-3 text-center bg-slate-200/90 text-slate-800">
                Stok ESB
              </th>
              <th class="py-3 px-3 text-center bg-teal-100 text-teal-900">
                Fisik Terhitung
              </th>
              <th class="py-3 px-3 text-center bg-slate-100">
                {{ auditPhase === 'counting' ? 'Status Hitung' : 'Selisih (Variance)' }}
              </th>
              <th class="py-3 px-4 text-center bg-slate-100">Batch Multiplier (+Box)</th>
            </tr>
          </thead>

          <!-- Brand Grouped Table Body -->
          <template v-if="groupMode === 'brand'">
            <tbody v-for="bg in brandGroups" :key="bg.brand" class="divide-y divide-slate-100 text-sm border-b border-slate-200">
              <!-- Brand Accordion Header Row -->
              <tr
                @click="toggleBrandCollapse(bg.brand)"
                class="bg-slate-100/80 hover:bg-slate-200/70 cursor-pointer select-none transition-colors"
              >
                <td colspan="8" class="py-2.5 px-4">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <ChevronRight
                        class="w-4 h-4 text-slate-500 transition-transform"
                        :class="{ 'rotate-90': !collapsedBrands.has(bg.brand) }"
                      />
                      <span class="font-extrabold text-xs sm:text-sm text-slate-900 tracking-tight">
                        {{ bg.brand }}
                      </span>
                      <span class="text-[11px] text-slate-500 font-mono font-medium">
                        ({{ bg.totalCount }} Varian)
                      </span>
                    </div>

                    <div class="flex items-center gap-3 text-xs font-mono">
                      <span class="text-slate-600 font-semibold">
                        Fisik: <strong class="text-teal-800">{{ bg.scannedTotal }}</strong> / Target: {{ bg.expectedTotal }}
                      </span>
                      <span
                        class="px-2 py-0.5 rounded text-[10px] font-bold"
                        :class="
                          bg.isComplete
                            ? 'bg-emerald-100 text-emerald-800'
                            : bg.scannedTotal > 0
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-slate-200 text-slate-600'
                        "
                      >
                        {{ bg.isComplete ? 'Selesai' : `${bg.matchedCount}/${bg.totalCount} Sesuai` }}
                      </span>
                    </div>
                  </div>
                </td>
              </tr>

              <!-- Brand Item Rows -->
              <template v-if="!collapsedBrands.has(bg.brand)">
                <tr
                  v-for="(item, idx) in bg.items"
                  :key="item.barcode"
                  class="hover:bg-slate-50/80 transition-colors"
                  :class="
                    item.status === 'matched'
                      ? 'bg-emerald-50/20'
                      : item.status === 'surplus'
                      ? 'bg-amber-50/20'
                      : item.status === 'counting'
                      ? 'bg-teal-50/15'
                      : ''
                  "
                >
                  <td class="py-3 px-3 text-center font-mono text-xs text-slate-400">
                    {{ idx + 1 }}
                  </td>

                  <td class="py-3 px-3 font-mono text-xs text-teal-800">
                    <div class="flex items-center gap-1.5">
                      <Barcode class="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span class="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 tracking-wider font-semibold">
                        {{ item.barcode }}
                      </span>
                    </div>
                  </td>

                  <td class="py-3 px-3">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                      {{ item.subCategory || item.brand }}
                    </span>
                  </td>

                  <td class="py-3 px-4 font-semibold text-slate-900">
                    <div class="flex flex-col">
                      <span class="text-xs sm:text-sm font-bold text-slate-900">{{ item.productTitle || item.varian }}</span>
                      <div class="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-normal">
                        <span v-if="item.defaultUnit" class="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.2 rounded text-[10px]">{{ item.defaultUnit }}</span>
                        <span v-if="item.category" class="text-slate-400 font-medium">{{ item.category }}</span>
                      </div>
                    </div>
                  </td>

                  <!-- Expected ESB Qty -->
                  <td class="py-3 px-3 text-center font-mono font-bold text-slate-800 bg-slate-50/40 text-sm">
                    {{ item.wpExpectedQty }}
                  </td>

                  <!-- Scanned Count with Inline Stepper -->
                  <td class="py-3 px-3 text-center bg-teal-50/30">
                    <div v-if="editingBarcode === item.barcode" class="flex items-center justify-center gap-1">
                      <input
                        v-model.number="editCountValue"
                        type="number"
                        min="0"
                        class="w-14 px-1 py-1 text-center font-mono font-bold text-xs bg-white border border-teal-500 rounded text-slate-900 focus:outline-none"
                        @keydown.enter="saveEdit(item)"
                        autofocus
                      />
                      <button
                        @click="saveEdit(item)"
                        class="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-xs font-bold text-white rounded cursor-pointer"
                      >
                        OK
                      </button>
                    </div>
                    <div v-else class="flex items-center justify-center gap-1.5">
                      <button
                        @click="decrementAuditCount(item.barcode)"
                        :disabled="item.scannedCount <= 0"
                        class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                        title="Kurangi 1"
                      >
                        <Minus class="w-3 h-3" />
                      </button>

                      <span
                        @click="startEdit(item)"
                        class="w-10 text-center font-mono font-extrabold text-base cursor-pointer hover:underline"
                        :class="
                          item.status === 'matched'
                            ? 'text-emerald-600'
                            : item.status === 'surplus'
                            ? 'text-amber-600'
                            : item.status === 'counting'
                            ? 'text-teal-700'
                            : 'text-slate-400'
                        "
                        title="Klik untuk ubah angka manual"
                      >
                        {{ item.scannedCount }}
                      </span>

                      <button
                        @click="registerAuditScan(item.barcode)"
                        class="w-6 h-6 rounded bg-teal-100 hover:bg-teal-200 text-teal-800 border border-teal-300 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                        title="Pindai / Tambah +1"
                      >
                        <Plus class="w-3 h-3" />
                      </button>
                    </div>
                  </td>

                  <!-- Phase-aware Discrepancy Column -->
                  <td class="py-3 px-3 text-center font-mono text-xs">
                    <!-- IN COUNTING PHASE: Do NOT alarm user with negative discrepancies before scanning! -->
                    <template v-if="auditPhase === 'counting'">
                      <span
                        v-if="item.status === 'matched'"
                        class="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]"
                      >
                        <CheckCircle2 class="w-3 h-3" />
                        Sesuai (Match)
                      </span>
                      <span
                        v-else-if="item.status === 'surplus'"
                        class="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[11px]"
                      >
                        <AlertCircle class="w-3 h-3" />
                        +{{ item.discrepancy }} (Lebih)
                      </span>
                      <span
                        v-else-if="item.status === 'counting'"
                        class="inline-flex items-center gap-1 font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 text-[11px]"
                      >
                        Hitung: {{ item.scannedCount }}/{{ item.wpExpectedQty }}
                      </span>
                      <span v-else-if="item.status === 'zero_stock'" class="text-slate-400 font-semibold text-xs">
                        0 (Stok Kosong)
                      </span>
                      <span v-else class="text-slate-400 font-medium text-xs italic">
                        - (Belum Dihitung)
                      </span>
                    </template>

                    <!-- IN RECONCILIATION PHASE: Show True Discrepancies clearly -->
                    <template v-else>
                      <span
                        v-if="item.status === 'matched'"
                        class="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]"
                      >
                        <CheckCircle2 class="w-3 h-3" />
                        0 (Match)
                      </span>
                      <span
                        v-else-if="item.discrepancy < 0"
                        class="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 text-[11px]"
                      >
                        <AlertTriangle class="w-3 h-3" />
                        {{ item.discrepancy }} (Kurang)
                      </span>
                      <span
                        v-else-if="item.discrepancy > 0"
                        class="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[11px]"
                      >
                        <AlertCircle class="w-3 h-3" />
                        +{{ item.discrepancy }} (Lebih)
                      </span>
                      <span v-else class="text-slate-400 text-xs">0</span>
                    </template>
                  </td>

                  <!-- Batch Multipliers for quick box additions -->
                  <td class="py-3 px-4 text-center">
                    <div class="flex items-center justify-center gap-1">
                      <button
                        @click="handleBatchAdd(item, 1)"
                        type="button"
                        class="px-2 py-1 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-[11px] font-bold transition-colors cursor-pointer"
                        title="Tambah 1 kaleng"
                      >
                        +1
                      </button>
                      <button
                        @click="handleBatchAdd(item, 6)"
                        type="button"
                        class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
                        title="Tambah 6 botol/kaleng"
                      >
                        +6
                      </button>
                      <button
                        @click="handleBatchAdd(item, 12)"
                        type="button"
                        class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
                        title="Tambah 12 botol/kaleng (1/2 Karton)"
                      >
                        +12
                      </button>
                      <button
                        @click="handleBatchAdd(item, 24)"
                        type="button"
                        class="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-black transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
                        title="Tambah 1 Karton / Box Utuh (24 unit)"
                      >
                        <Boxes class="w-3 h-3" />
                        <span>+24</span>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </template>

          <!-- Flat Table Body -->
          <template v-else>
            <tbody class="divide-y divide-slate-100 text-sm">
              <tr
                v-for="(item, idx) in filteredItems"
                :key="item.barcode"
                class="hover:bg-slate-50/80 transition-colors"
                :class="
                  item.status === 'matched'
                    ? 'bg-emerald-50/20'
                    : item.status === 'surplus'
                    ? 'bg-amber-50/20'
                    : item.status === 'counting'
                    ? 'bg-teal-50/15'
                    : ''
                "
              >
                <td class="py-3 px-3 text-center font-mono text-xs text-slate-400">
                  {{ idx + 1 }}
                </td>

                <td class="py-3 px-3 font-mono text-xs text-teal-800">
                  <div class="flex items-center gap-1.5">
                    <Barcode class="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span class="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 tracking-wider font-semibold">
                      {{ item.barcode }}
                    </span>
                  </div>
                </td>

                <td class="py-3 px-3">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                    {{ item.subCategory || item.brand }}
                  </span>
                </td>

                <td class="py-3 px-4 font-semibold text-slate-900">
                  <div class="flex flex-col">
                    <span class="text-xs sm:text-sm font-bold text-slate-900">{{ item.productTitle || item.varian }}</span>
                    <div class="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-normal">
                      <span v-if="item.defaultUnit" class="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.2 rounded text-[10px]">{{ item.defaultUnit }}</span>
                      <span v-if="item.category" class="text-slate-400 font-medium">{{ item.category }}</span>
                    </div>
                  </div>
                </td>

                <td class="py-3 px-3 text-center font-mono font-bold text-slate-800 bg-slate-50/40 text-sm">
                  {{ item.wpExpectedQty }}
                </td>

                <td class="py-3 px-3 text-center bg-teal-50/30">
                  <div v-if="editingBarcode === item.barcode" class="flex items-center justify-center gap-1">
                    <input
                      v-model.number="editCountValue"
                      type="number"
                      min="0"
                      class="w-14 px-1 py-1 text-center font-mono font-bold text-xs bg-white border border-teal-500 rounded text-slate-900 focus:outline-none"
                      @keydown.enter="saveEdit(item)"
                      autofocus
                    />
                    <button
                      @click="saveEdit(item)"
                      class="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-xs font-bold text-white rounded cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                  <div v-else class="flex items-center justify-center gap-1.5">
                    <button
                      @click="decrementAuditCount(item.barcode)"
                      :disabled="item.scannedCount <= 0"
                      class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                      title="Kurangi 1"
                    >
                      <Minus class="w-3 h-3" />
                    </button>

                    <span
                      @click="startEdit(item)"
                      class="w-10 text-center font-mono font-extrabold text-base cursor-pointer hover:underline"
                      :class="
                        item.status === 'matched'
                          ? 'text-emerald-600'
                          : item.status === 'surplus'
                          ? 'text-amber-600'
                          : item.status === 'counting'
                          ? 'text-teal-700'
                          : 'text-slate-400'
                      "
                      title="Klik untuk ubah angka manual"
                    >
                      {{ item.scannedCount }}
                    </span>

                    <button
                      @click="registerAuditScan(item.barcode)"
                      class="w-6 h-6 rounded bg-teal-100 hover:bg-teal-200 text-teal-800 border border-teal-300 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                      title="Pindai / Tambah +1"
                    >
                      <Plus class="w-3 h-3" />
                    </button>
                  </div>
                </td>

                <td class="py-3 px-3 text-center font-mono text-xs">
                  <template v-if="auditPhase === 'counting'">
                    <span
                      v-if="item.status === 'matched'"
                      class="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]"
                    >
                      <CheckCircle2 class="w-3 h-3" />
                      Sesuai (Match)
                    </span>
                    <span
                      v-else-if="item.status === 'surplus'"
                      class="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[11px]"
                    >
                      <AlertCircle class="w-3 h-3" />
                      +{{ item.discrepancy }} (Lebih)
                    </span>
                    <span
                      v-else-if="item.status === 'counting'"
                      class="inline-flex items-center gap-1 font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 text-[11px]"
                    >
                      Hitung: {{ item.scannedCount }}/{{ item.wpExpectedQty }}
                    </span>
                    <span v-else-if="item.status === 'zero_stock'" class="text-slate-400 font-semibold text-xs">
                      0
                    </span>
                    <span v-else class="text-slate-400 font-medium text-xs italic">
                      - (Belum Dihitung)
                    </span>
                  </template>
                  <template v-else>
                    <span
                      v-if="item.status === 'matched'"
                      class="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]"
                    >
                      <CheckCircle2 class="w-3 h-3" />
                      0 (Match)
                    </span>
                    <span
                      v-else-if="item.discrepancy < 0"
                      class="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 text-[11px]"
                    >
                      <AlertTriangle class="w-3 h-3" />
                      {{ item.discrepancy }} (Kurang)
                    </span>
                    <span
                      v-else-if="item.discrepancy > 0"
                      class="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[11px]"
                    >
                      <AlertCircle class="w-3 h-3" />
                      +{{ item.discrepancy }} (Lebih)
                    </span>
                    <span v-else class="text-slate-400 text-xs">0</span>
                  </template>
                </td>

                <td class="py-3 px-4 text-center">
                  <div class="flex items-center justify-center gap-1">
                    <button
                      @click="handleBatchAdd(item, 1)"
                      type="button"
                      class="px-2 py-1 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      +1
                    </button>
                    <button
                      @click="handleBatchAdd(item, 6)"
                      type="button"
                      class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      +6
                    </button>
                    <button
                      @click="handleBatchAdd(item, 12)"
                      type="button"
                      class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      +12
                    </button>
                    <button
                      @click="handleBatchAdd(item, 24)"
                      type="button"
                      class="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-black transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
                    >
                      <Boxes class="w-3 h-3" />
                      <span>+24</span>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </template>

          <!-- Empty Filter State -->
          <tbody v-if="filteredItems.length === 0">
            <tr>
              <td colspan="8" class="py-12 text-center text-slate-400">
                <Package class="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p class="font-medium text-slate-600">Tidak ada produk yang cocok dengan pencarian / filter</p>
                <button
                  @click="searchQuery = ''; statusFilter = 'ALL'; brandFilter = 'ALL'"
                  class="mt-2 text-xs text-teal-700 hover:underline font-semibold cursor-pointer"
                >
                  Reset filter & pencarian
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- VIEW 2: CARDS / HANDHELD VIEW (Touch-friendly for phones and tablets) -->
      <div v-else class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[calc(100vh-280px)] overflow-y-auto">
        <div
          v-for="item in filteredItems"
          :key="item.barcode"
          class="bg-white border rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3 transition-all"
          :class="
            item.status === 'matched'
              ? 'border-emerald-300 bg-emerald-50/20'
              : item.status === 'surplus'
              ? 'border-amber-300 bg-amber-50/20'
              : item.status === 'counting'
              ? 'border-teal-300 bg-teal-50/10'
              : 'border-slate-200'
          "
        >
          <div>
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                {{ item.subCategory || item.brand }}
              </span>
              <span class="text-[11px] font-mono text-slate-400">
                {{ item.barcode }}
              </span>
            </div>
            <h4 class="text-sm font-extrabold text-slate-900 tracking-tight">
              {{ item.productTitle || item.varian }}
            </h4>
          </div>

          <!-- Stock & Count Comparison -->
          <div class="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div>
              <span class="text-[10px] text-slate-400 uppercase font-bold block">Target ESB</span>
              <span class="text-base font-mono font-bold text-slate-800">{{ item.wpExpectedQty }}</span>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                @click="decrementAuditCount(item.barcode)"
                :disabled="item.scannedCount <= 0"
                class="w-7 h-7 rounded-lg bg-white border border-slate-300 text-slate-700 flex items-center justify-center font-bold disabled:opacity-30 cursor-pointer"
              >
                <Minus class="w-3.5 h-3.5" />
              </button>
              <span class="text-lg font-mono font-black text-teal-800 px-1">
                {{ item.scannedCount }}
              </span>
              <button
                @click="registerAuditScan(item.barcode)"
                class="w-7 h-7 rounded-lg bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center font-bold shadow-xs cursor-pointer"
              >
                <Plus class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Quick Box Multipliers -->
          <div class="flex items-center justify-between gap-1 pt-1 border-t border-slate-100">
            <span class="text-[10px] text-slate-400 font-semibold">Tambah:</span>
            <div class="flex items-center gap-1">
              <button
                @click="handleBatchAdd(item, 6)"
                class="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 cursor-pointer"
              >
                +6
              </button>
              <button
                @click="handleBatchAdd(item, 12)"
                class="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 cursor-pointer"
              >
                +12
              </button>
              <button
                @click="handleBatchAdd(item, 24)"
                class="px-2 py-1 rounded bg-teal-600 text-white text-xs font-extrabold hover:bg-teal-700 cursor-pointer flex items-center gap-1"
              >
                <Boxes class="w-3 h-3" />
                <span>+24 (Box)</span>
              </button>
            </div>
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

    <!-- Modal: Confirmation for Reset Audit Session -->
    <div
      v-if="isResetConfirmModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      @click.self="isResetConfirmModalOpen = false"
    >
      <div class="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
            <RotateCcw class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-extrabold text-slate-900">Reset Hitungan Fisik?</h3>
            <p class="text-xs text-slate-500">{{ currentStore.name }}</p>
          </div>
        </div>
        <p class="text-xs text-slate-600 leading-relaxed">
          Tindakan ini akan mengosongkan semua botol fisik yang telah di-scan (total <strong class="text-rose-700 font-mono">{{ totalScanned }} unit</strong>) untuk outlet ini dan mengembalikan status ke awal (0 scan).
        </p>
        <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            @click="isResetConfirmModalOpen = false"
            type="button"
            class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            Batal
          </button>
          <button
            @click="confirmResetAudit"
            type="button"
            class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm cursor-pointer"
          >
            Ya, Reset Hitungan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
