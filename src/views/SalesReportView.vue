<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useAuth } from '../composables/useAuth.js';
import { useAuditStore } from '../composables/useAuditStore.js';
import {
  TrendingUp,
  Receipt,
  DollarSign,
  Package,
  Building2,
  Calendar,
  Filter,
  Search,
  Download,
  RefreshCw,
  HelpCircle,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Layers,
  Store,
  ArrowUpRight,
  Sparkles,
  UploadCloud,
  FileSpreadsheet,
  Trash2,
  FileText
} from 'lucide-vue-next';
import UploadSalesCsvModal from '../components/UploadSalesCsvModal.vue';

const { currentUser, role, isSuperAdmin } = useAuth();

// Filters
const selectedStoreId = ref('all');
const selectedCategory = ref('all');
const selectedBrand = ref('all');
const selectedVisitPurpose = ref('all');
const selectedPayment = ref('all');
const searchQuery = ref('');
const datePreset = ref('all');
const startDate = ref('');
const endDate = ref('');
const activeViewTab = ref('table'); // 'table' | 'files' | 'byChannel' | 'byStore' | 'byBrand' | 'topItems' | 'byPayment'

// Pagination state (100 rows per page)
const currentPage = ref(1);
const pageSize = ref(100);

// State
const transactions = ref([]);
const uploadedFiles = ref([]);
const summary = ref({
  totalBills: 0,
  totalLineItems: 0,
  totalUnitsSold: 0,
  totalGrossSales: 0,
  totalDiscounts: 0,
  totalTax: 0,
  totalNetSales: 0,
  byStore: [],
  byChannel: [],
  byPayment: [],
  byBrand: [],
  topItems: [],
});
const isLoading = ref(false);
const isLoadingFiles = ref(false);
const isSyncing = ref(false);
const syncMessage = ref('');
const isUploadModalOpen = ref(false);
const fileToDelete = ref(null);
const isDeletingFile = ref(false);

function handleCsvImported(rows) {
  datePreset.value = 'all';
  startDate.value = '';
  endDate.value = '';
  selectedStoreId.value = 'all';
  selectedCategory.value = 'all';
  selectedBrand.value = 'all';
  selectedVisitPurpose.value = 'all';
  selectedPayment.value = 'all';
  searchQuery.value = '';
  currentPage.value = 1;
  loadSalesReport();
  loadUploadedFiles();
  syncMessage.value = `Successfully imported ${rows.length.toLocaleString()} sales records! Dashboard view updated.`;
}

// Stores list derived dynamically from uploaded sales data
const availableStores = computed(() => {
  const storeMap = new Map();
  if (summary.value?.byStore?.length) {
    summary.value.byStore.forEach((s) => {
      if (s.store_id && s.store_name) {
        storeMap.set(s.store_id, s.store_name);
      }
    });
  }
  transactions.value.forEach((t) => {
    if (t.store_id && t.store_name) {
      storeMap.set(t.store_id, t.store_name);
    }
  });
  return Array.from(storeMap.entries()).map(([id, name]) => ({ id, name }));
});

// Categories list
const categories = computed(() => {
  const set = new Set();
  transactions.value.forEach((t) => {
    if (t.category) set.add(t.category);
  });
  return Array.from(set);
});

// Brands list
const brands = computed(() => {
  const set = new Set();
  transactions.value.forEach((t) => {
    if (t.brand) set.add(t.brand);
  });
  return Array.from(set);
});

// Visit Purposes list
const visitPurposes = computed(() => {
  const set = new Set();
  transactions.value.forEach((t) => {
    if (t.visit_purpose) set.add(t.visit_purpose);
  });
  return Array.from(set);
});

// Payment methods list
const paymentMethods = computed(() => {
  const set = new Set();
  transactions.value.forEach((t) => {
    if (t.payment_method) set.add(t.payment_method);
  });
  return Array.from(set);
});

// Filtered transactions for client-side search/filters
const filteredTransactions = computed(() => {
  let list = transactions.value;
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(
      (t) =>
        (t.item_name && t.item_name.toLowerCase().includes(q)) ||
        (t.variant && t.variant.toLowerCase().includes(q)) ||
        (t.brand && t.brand.toLowerCase().includes(q)) ||
        (t.store_name && t.store_name.toLowerCase().includes(q)) ||
        (t.visit_purpose && t.visit_purpose.toLowerCase().includes(q)) ||
        (t.payment_method && t.payment_method.toLowerCase().includes(q))
    );
  }
  return list;
});

// Paginated transactions (100 visible rows)
const paginatedTransactions = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredTransactions.value.slice(start, start + pageSize.value);
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredTransactions.value.length / pageSize.value));
});

// Format Rupiah
function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

// Format Date Only (Sales Date)
function formatSalesDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).split(' ')[0];
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return String(dateStr).split(' ')[0];
  }
}

// Format Date & Time (Sales Date In)
function formatSalesDateIn(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatSimpleDate(isoString) {
  return formatSalesDateIn(isoString);
}

// Date preset handler
function applyDatePreset(preset) {
  datePreset.value = preset;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  if (preset === 'today') {
    startDate.value = todayStr;
    endDate.value = todayStr;
  } else if (preset === 'yesterday') {
    const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yestStr = yest.toISOString().slice(0, 10);
    startDate.value = yestStr;
    endDate.value = yestStr;
  } else if (preset === '7d') {
    const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    startDate.value = past7.toISOString().slice(0, 10);
    endDate.value = todayStr;
  } else if (preset === '30d') {
    const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.value = past30.toISOString().slice(0, 10);
    endDate.value = todayStr;
  } else if (preset === 'all') {
    startDate.value = '';
    endDate.value = '';
  }
  currentPage.value = 1;
  loadSalesReport();
}

async function loadSalesReport() {
  isLoading.value = true;
  try {
    const query = new URLSearchParams();
    if (selectedStoreId.value && selectedStoreId.value !== 'all') {
      query.set('storeId', selectedStoreId.value);
    }
    if (startDate.value) query.set('startDate', startDate.value);
    if (endDate.value) query.set('endDate', endDate.value);
    if (searchQuery.value.trim()) query.set('search', searchQuery.value.trim());
    if (selectedCategory.value && selectedCategory.value !== 'all') {
      query.set('category', selectedCategory.value);
    }
    if (selectedBrand.value && selectedBrand.value !== 'all') {
      query.set('brand', selectedBrand.value);
    }
    if (selectedVisitPurpose.value && selectedVisitPurpose.value !== 'all') {
      query.set('visitPurpose', selectedVisitPurpose.value);
    }
    if (selectedPayment.value && selectedPayment.value !== 'all') {
      query.set('paymentMethod', selectedPayment.value);
    }
    query.set('limit', '5000');

    const [txRes, sumRes] = await Promise.all([
      fetch(`/api/sales/report?${query.toString()}`).then((r) => r.json()),
      fetch(`/api/sales/summary?${query.toString()}`).then((r) => r.json()),
    ]);

    if (txRes.success) {
      transactions.value = txRes.transactions || [];
    }
    if (sumRes.success && sumRes.summary) {
      summary.value = sumRes.summary;
    }
  } catch (err) {
    console.error('Failed to load sales report:', err);
  } finally {
    isLoading.value = false;
  }
}

async function loadUploadedFiles() {
  isLoadingFiles.value = true;
  try {
    const res = await fetch('/api/sales/files').then((r) => r.json());
    if (res.success && Array.isArray(res.files)) {
      uploadedFiles.value = res.files;
    }
  } catch (err) {
    console.error('Failed to load uploaded files:', err);
  } finally {
    isLoadingFiles.value = false;
  }
}

function handleDownloadFile(fileId, filename) {
  const downloadUrl = `/api/sales/files/${fileId}/download`;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.setAttribute('download', filename || 'sales_report.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function confirmDeleteFile(file) {
  fileToDelete.value = file;
}

async function executeDeleteFile() {
  if (!fileToDelete.value) return;
  isDeletingFile.value = true;
  try {
    const res = await fetch(`/api/sales/files/${fileToDelete.value.id}`, {
      method: 'DELETE',
    }).then((r) => r.json());

    if (res.success) {
      syncMessage.value = `File "${fileToDelete.value.filename}" and its associated sales records removed.`;
      fileToDelete.value = null;
      await Promise.all([loadUploadedFiles(), loadSalesReport()]);
    } else {
      alert(res.error || 'Failed to delete file');
    }
  } catch (err) {
    alert('Error deleting file: ' + err.message);
  } finally {
    isDeletingFile.value = false;
  }
}

async function handleSyncFromBirmas() {
  isSyncing.value = true;
  syncMessage.value = '';
  try {
    const res = await fetch('/api/sales/sync-birmas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (data.success) {
      syncMessage.value = data.message || 'Sales data updated successfully!';
      await Promise.all([loadSalesReport(), loadUploadedFiles()]);
    } else {
      syncMessage.value = data.message || 'Sync response received.';
    }
  } catch (err) {
    syncMessage.value = 'Sync notice: ' + err.message;
  } finally {
    isSyncing.value = false;
  }
}

// Watch filters to reset page to 1
watch(
  [selectedStoreId, selectedCategory, selectedBrand, selectedVisitPurpose, selectedPayment, searchQuery],
  () => {
    currentPage.value = 1;
  }
);

onMounted(() => {
  applyDatePreset('7d');
  loadUploadedFiles();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header Section -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <div class="flex items-center gap-3.5">
        <div class="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shadow-xs">
          <TrendingUp class="w-6 h-6 text-teal-700" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Audit Sales Report
            </h2>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
              ESB Recapitulation
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Real sales transaction ledger, product brand breakdowns, and multi-outlet revenue analytics
          </p>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-2.5 flex-wrap">
        <!-- Upload CSV Button -->
        <button
          type="button"
          @click="isUploadModalOpen = true"
          class="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <UploadCloud class="w-4 h-4" />
          <span>Upload Sales CSV</span>
        </button>

        <!-- Refresh Button -->
        <button
          type="button"
          @click="loadSalesReport(); loadUploadedFiles();"
          :disabled="isLoading"
          class="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
          title="Refresh Data"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
        </button>
      </div>
    </div>

    <!-- Live Sync Alert / Notification Banner -->
    <div
      v-if="syncMessage"
      class="p-4 rounded-2xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-semibold flex items-center justify-between gap-3 shadow-xs animate-in fade-in"
    >
      <div class="flex items-center gap-2">
        <CheckCircle2 class="w-4 h-4 text-teal-600 shrink-0" />
        <span>{{ syncMessage }}</span>
      </div>
      <button
        @click="syncMessage = ''"
        class="text-teal-700 hover:text-teal-900 text-[11px] font-bold px-2 py-0.5 rounded-lg hover:bg-teal-100 transition-colors"
      >
        Dismiss
      </button>
    </div>

    <!-- Executive KPI Summary Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- 1. Total Net Sales -->
      <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
        <div class="flex items-center justify-between text-slate-500 mb-2">
          <span class="text-[11px] font-bold uppercase tracking-wider">Total Net Sales</span>
          <div class="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
            <DollarSign class="w-4 h-4" />
          </div>
        </div>
        <p class="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight">
          {{ formatRupiah(summary.totalNetSales) }}
        </p>
        <div class="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
          <span class="font-mono font-bold text-slate-700">{{ summary.totalBills }}</span>
          <span>unique orders</span>
        </div>
      </div>

      <!-- 2. Units Sold -->
      <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
        <div class="flex items-center justify-between text-slate-500 mb-2">
          <span class="text-[11px] font-bold uppercase tracking-wider">Physical Units Sold</span>
          <div class="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center">
            <Package class="w-4 h-4" />
          </div>
        </div>
        <p class="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight">
          {{ summary.totalUnitsSold }}
        </p>
        <div class="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
          <span class="font-mono font-bold text-slate-700">{{ summary.totalLineItems }}</span>
          <span>line item rows</span>
        </div>
      </div>

      <!-- 3. Active Stores -->
      <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
        <div class="flex items-center justify-between text-slate-500 mb-2">
          <span class="text-[11px] font-bold uppercase tracking-wider">Store Outlets</span>
          <div class="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center">
            <Building2 class="w-4 h-4" />
          </div>
        </div>
        <p class="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight">
          {{ summary.byStore?.length || availableStores.length }}
        </p>
        <div class="mt-2 flex items-center gap-2 text-[11px] text-slate-500 truncate">
          <span>Top: </span>
          <strong class="text-slate-800">{{ summary.byStore?.[0]?.store_name || 'Birmas' }}</strong>
        </div>
      </div>

      <!-- 4. Uploaded Files Archived -->
      <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
        <div class="flex items-center justify-between text-slate-500 mb-2">
          <span class="text-[11px] font-bold uppercase tracking-wider">CSV Files Archived</span>
          <div class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center">
            <FileSpreadsheet class="w-4 h-4" />
          </div>
        </div>
        <p class="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight">
          {{ uploadedFiles.length }}
        </p>
        <div class="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
          <button
            @click="activeViewTab = 'files'"
            class="text-teal-700 font-bold hover:underline flex items-center gap-1"
          >
            <span>Manage Files</span>
            <ArrowUpRight class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Filter & Search Controls Bar -->
    <div class="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
      <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <!-- Store Branch Selector -->
        <div class="flex items-center gap-2 flex-wrap">
          <label class="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
            Branch:
          </label>
          <div class="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              @click="selectedStoreId = 'all'; loadSalesReport();"
              class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              :class="selectedStoreId === 'all' ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
            >
              All Outlets
            </button>
            <button
              v-for="st in availableStores"
              :key="st.id"
              type="button"
              @click="selectedStoreId = st.id; loadSalesReport();"
              class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              :class="selectedStoreId === st.id ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
            >
              {{ st.name }}
            </button>
          </div>
        </div>

        <!-- Date Range Presets -->
        <div class="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200/80">
          <button
            v-for="preset in [
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: 'all', label: 'All Time' },
            ]"
            :key="preset.id"
            type="button"
            @click="applyDatePreset(preset.id)"
            class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
            :class="datePreset === preset.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <!-- Advanced Filter Row: Search, Category, Brand, Visit Purpose, Payment -->
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-slate-100">
        <!-- Search -->
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Search</label>
          <div class="relative">
            <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search product variant, brand, etc..."
              class="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:outline-none focus:border-teal-500 focus:bg-white"
            />
          </div>
        </div>

        <!-- Brand Filter (Menu Category Detail) -->
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Brand</label>
          <select
            v-model="selectedBrand"
            @change="loadSalesReport"
            class="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:outline-none focus:border-teal-500 focus:bg-white"
          >
            <option value="all">All Brands</option>
            <option v-for="b in brands" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>

        <!-- Visit Purpose Filter -->
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Visit Purpose</label>
          <select
            v-model="selectedVisitPurpose"
            @change="loadSalesReport"
            class="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:outline-none focus:border-teal-500 focus:bg-white"
          >
            <option value="all">All Purposes</option>
            <option v-for="vp in visitPurposes" :key="vp" :value="vp">{{ vp }}</option>
          </select>
        </div>

        <!-- Category Filter -->
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Category</label>
          <select
            v-model="selectedCategory"
            @change="loadSalesReport"
            class="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:outline-none focus:border-teal-500 focus:bg-white"
          >
            <option value="all">All Categories</option>
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>

        <!-- Payment Method Filter -->
        <div>
          <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Payment Method</label>
          <select
            v-model="selectedPayment"
            @change="loadSalesReport"
            class="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs focus:outline-none focus:border-teal-500 focus:bg-white"
          >
            <option value="all">All Payment Methods</option>
            <option v-for="pm in paymentMethods" :key="pm" :value="pm">{{ pm }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs for Report Views -->
    <div class="flex items-center gap-2 overflow-x-auto pb-1">
      <button
        v-for="tab in [
          { id: 'table', label: 'Detailed Transactions', icon: Receipt },
          { id: 'files', label: 'Uploaded CSV Files History', icon: FileSpreadsheet, badge: uploadedFiles.length },
          { id: 'byChannel', label: 'Sales by Visit Purpose', icon: Layers },
          { id: 'byStore', label: 'Sales by Store', icon: Building2 },
          { id: 'byBrand', label: 'Sales by Brand', icon: Sparkles },
          { id: 'topItems', label: 'Top Products', icon: Package },
          { id: 'byPayment', label: 'Payment Methods', icon: CreditCard },
        ]"
        :key="tab.id"
        type="button"
        @click="activeViewTab = tab.id"
        class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer"
        :class="
          activeViewTab === tab.id
            ? 'bg-slate-900 text-white shadow-sm'
            : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
        "
      >
        <component :is="tab.icon" class="w-3.5 h-3.5" />
        <span>{{ tab.label }}</span>
        <span
          v-if="tab.badge !== undefined"
          class="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono"
          :class="activeViewTab === tab.id ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600'"
        >
          {{ tab.badge }}
        </span>
      </button>
    </div>

    <!-- MAIN VIEW CONTAINER -->
    <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <!-- TAB 1: Detailed Transactions Table with 100 rows pagination -->
      <div v-if="activeViewTab === 'table'" class="flex flex-col">
        <!-- Table Header Status Bar -->
        <div class="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-800">
              Showing {{ filteredTransactions.length === 0 ? 0 : (currentPage - 1) * pageSize + 1 }} - {{ Math.min(currentPage * pageSize, filteredTransactions.length) }}
            </span>
            <span class="text-slate-400">of</span>
            <span class="font-mono font-bold text-slate-900">{{ filteredTransactions.length }}</span>
            <span class="text-slate-500">transactions</span>
            <span class="text-[10px] px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-bold ml-1">
              100 rows per page
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <span class="text-slate-500 mr-1">Page {{ currentPage }} of {{ totalPages }}</span>
          </div>
        </div>

        <!-- Table Container (Narrower spacing so Unit Price and Total are fully visible) -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-50 text-[10px] font-extrabold text-slate-600 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th class="py-2 px-2 w-10 text-center text-slate-400">#</th>
                <th class="py-2 px-2.5 whitespace-nowrap">Sales Date</th>
                <th class="py-2 px-2.5 whitespace-nowrap">Sales Date In</th>
                <th class="py-2 px-2.5 whitespace-nowrap">Branch</th>
                <th class="py-2 px-2.5 whitespace-nowrap">Visit Purpose</th>
                <th class="py-2 px-2.5 whitespace-nowrap">Payment Method</th>
                <th class="py-2 px-2.5 whitespace-nowrap">Menu Category</th>
                <th class="py-2 px-2.5 whitespace-nowrap">Menu Category Detail</th>
                <th class="py-2 px-2.5">Menu</th>
                <th class="py-2 px-2 text-center whitespace-nowrap">Qty</th>
                <th class="py-2 px-2.5 text-right whitespace-nowrap">Price</th>
                <th class="py-2 px-2.5 text-right whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="(tx, idx) in paginatedTransactions"
                :key="tx.id || idx"
                class="hover:bg-slate-50/80 transition-colors"
              >
                <td class="py-2 px-2 text-center font-mono text-slate-400 text-[11px]">
                  {{ (currentPage - 1) * pageSize + idx + 1 }}
                </td>
                <!-- 1. Sales Date: date of sales -->
                <td class="py-2 px-2.5 text-slate-700 font-mono whitespace-nowrap text-[11px] font-medium">
                  {{ formatSalesDate(tx.sales_date || tx.date) }}
                </td>
                <!-- 2. Sales Date In: date and time of sales -->
                <td class="py-2 px-2.5 text-slate-500 font-mono whitespace-nowrap text-[11px]">
                  {{ formatSalesDateIn(tx.sales_date_in || tx.date) }}
                </td>
                <!-- 3. Branch: store branch -->
                <td class="py-2 px-2.5 whitespace-nowrap">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800">
                    {{ tx.store_name }}
                  </span>
                </td>
                <!-- 4. Visit Purpose: product bought via -->
                <td class="py-2 px-2.5 whitespace-nowrap">
                  <span
                    class="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    :class="{
                      'bg-blue-50 text-blue-700 border border-blue-200': tx.visit_purpose === 'DINE IN',
                      'bg-orange-50 text-orange-700 border border-orange-200': tx.visit_purpose === 'SHOPEEFOOD',
                      'bg-emerald-50 text-emerald-700 border border-emerald-200': tx.visit_purpose === 'GOFOOD',
                      'bg-green-50 text-green-700 border border-green-200': tx.visit_purpose === 'GRABFOOD' || tx.visit_purpose === 'GRABMART',
                      'bg-indigo-50 text-indigo-700 border border-indigo-200': tx.visit_purpose === 'WA ORDER',
                      'bg-slate-100 text-slate-700': !tx.visit_purpose || tx.visit_purpose === 'TAKE AWAY' || tx.visit_purpose === 'TEMAN',
                    }"
                  >
                    {{ tx.visit_purpose || 'DINE IN' }}
                  </span>
                </td>
                <!-- 5. Payment method -->
                <td class="py-2 px-2.5 whitespace-nowrap">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-50 text-slate-700 border border-slate-200">
                    {{ tx.payment_method || 'QRIS BCA' }}
                  </span>
                </td>
                <!-- 6. Menu Category: type of product -->
                <td class="py-2 px-2.5 whitespace-nowrap">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                    {{ tx.category || 'Beverage' }}
                  </span>
                </td>
                <!-- 7. Menu Category Detail: product brand -->
                <td class="py-2 px-2.5 whitespace-nowrap">
                  <span v-if="tx.brand" class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-teal-50 text-teal-800 border border-teal-200">
                    {{ tx.brand }}
                  </span>
                  <span v-else class="text-slate-400 text-[10px]">-</span>
                </td>
                <!-- 8. Menu: product variant -->
                <td class="py-2 px-2.5 font-bold text-slate-900 text-xs min-w-[140px]">
                  {{ tx.item_name || tx.variant }}
                </td>
                <!-- 9. Qty: amount of product per variant per sale -->
                <td class="py-2 px-2 text-center font-bold text-teal-800 font-mono text-xs">
                  {{ tx.qty }}
                </td>
                <!-- 10. Price: price per unit -->
                <td class="py-2 px-2.5 text-right text-slate-700 font-mono whitespace-nowrap text-xs font-semibold">
                  {{ formatRupiah(tx.unit_price) }}
                </td>
                <!-- 11. Total: total amount -->
                <td class="py-2 px-2.5 text-right font-black text-slate-900 font-mono whitespace-nowrap text-xs">
                  {{ formatRupiah(tx.total) }}
                </td>
              </tr>

              <!-- Empty state -->
              <tr v-if="filteredTransactions.length === 0 && !isLoading">
                <td colspan="12" class="py-12 text-center">
                  <div class="flex flex-col items-center justify-center gap-2">
                    <FileSpreadsheet class="w-10 h-10 text-slate-300" />
                    <p class="font-bold text-slate-700 text-sm">No transaction records found</p>
                    <p class="text-xs text-slate-400 max-w-md">
                      Upload your ESB Sales Recapitulation Detail CSV file to view transactions and live summaries.
                    </p>
                    <button
                      type="button"
                      @click="isUploadModalOpen = true"
                      class="mt-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 shadow-sm"
                    >
                      Upload CSV Now
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Controls Bar (Bottom) -->
        <div
          v-if="filteredTransactions.length > 0"
          class="p-4 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
        >
          <div class="text-slate-500">
            Showing <strong class="text-slate-800 font-mono">{{ (currentPage - 1) * pageSize + 1 }}</strong> to
            <strong class="text-slate-800 font-mono">{{ Math.min(currentPage * pageSize, filteredTransactions.length) }}</strong> of
            <strong class="text-slate-900 font-mono">{{ filteredTransactions.length }}</strong> total records
          </div>

          <!-- Page Navigation Buttons -->
          <div class="flex items-center gap-1.5">
            <!-- First Page -->
            <button
              type="button"
              @click="currentPage = 1"
              :disabled="currentPage === 1"
              class="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="First Page"
            >
              <ChevronsLeft class="w-3.5 h-3.5" />
            </button>

            <!-- Previous Page -->
            <button
              type="button"
              @click="currentPage = Math.max(1, currentPage - 1)"
              :disabled="currentPage === 1"
              class="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous Page"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
            </button>

            <!-- Page Indicator -->
            <span class="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-800 font-mono">
              Page {{ currentPage }} / {{ totalPages }}
            </span>

            <!-- Next Page -->
            <button
              type="button"
              @click="currentPage = Math.min(totalPages, currentPage + 1)"
              :disabled="currentPage === totalPages"
              class="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next Page"
            >
              <ChevronRight class="w-3.5 h-3.5" />
            </button>

            <!-- Last Page -->
            <button
              type="button"
              @click="currentPage = totalPages"
              :disabled="currentPage === totalPages"
              class="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Last Page"
            >
              <ChevronsRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- TAB 2: Uploaded CSV Files History Management Table -->
      <div v-else-if="activeViewTab === 'files'" class="p-6 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h4 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet class="w-4 h-4 text-teal-600" />
              <span>Uploaded Sales CSV Files History</span>
            </h4>
            <p class="text-xs text-slate-500 mt-0.5">
              Archive of uploaded sales reports with timestamps. You can re-download original files or delete batches if incorrect.
            </p>
          </div>

          <button
            type="button"
            @click="isUploadModalOpen = true"
            class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer self-start sm:self-auto"
          >
            <UploadCloud class="w-4 h-4" />
            <span>Upload New CSV</span>
          </button>
        </div>

        <div class="overflow-x-auto border border-slate-200 rounded-2xl">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th class="py-3 px-4">File Name</th>
                <th class="py-3 px-4 whitespace-nowrap">Uploaded At</th>
                <th class="py-3 px-4">Uploaded By</th>
                <th class="py-3 px-4">Stores / Branch</th>
                <th class="py-3 px-4 text-center">Row Count</th>
                <th class="py-3 px-4 text-right">Revenue Imported</th>
                <th class="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="file in uploadedFiles" :key="file.id" class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2.5">
                    <FileSpreadsheet class="w-4 h-4 text-teal-600 shrink-0" />
                    <div>
                      <span class="font-bold text-slate-900 block">{{ file.filename }}</span>
                      <span class="text-[10px] text-slate-400">{{ file.file_size || 'CSV File' }}</span>
                    </div>
                  </div>
                </td>
                <td class="py-3 px-4 text-slate-600 font-mono whitespace-nowrap text-[11px]">
                  {{ formatSimpleDate(file.uploaded_at) }}
                </td>
                <td class="py-3 px-4">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700">
                    {{ file.uploaded_by || 'Admin' }}
                  </span>
                </td>
                <td class="py-3 px-4 text-slate-700 font-medium">
                  <span class="truncate block max-w-[180px]">{{ file.stores || 'All Stores' }}</span>
                </td>
                <td class="py-3 px-4 text-center font-bold text-teal-800 font-mono">
                  {{ file.row_count }}
                </td>
                <td class="py-3 px-4 text-right font-black text-slate-900 font-mono">
                  {{ formatRupiah(file.total_revenue) }}
                </td>
                <td class="py-3 px-4 text-center">
                  <div class="flex items-center justify-center gap-1.5">
                    <!-- Download Button -->
                    <button
                      type="button"
                      @click="handleDownloadFile(file.id, file.filename)"
                      class="p-1.5 rounded-lg bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-700 border border-slate-200 transition-colors cursor-pointer"
                      title="Download original CSV file"
                    >
                      <Download class="w-3.5 h-3.5" />
                    </button>

                    <!-- Delete Button -->
                    <button
                      type="button"
                      @click="confirmDeleteFile(file)"
                      class="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 transition-colors cursor-pointer"
                      title="Delete file and associated transactions"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>

              <tr v-if="uploadedFiles.length === 0 && !isLoadingFiles">
                <td colspan="7" class="py-10 text-center text-slate-500">
                  <FileSpreadsheet class="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p class="font-bold text-slate-700">No uploaded sales files recorded yet</p>
                  <p class="text-xs text-slate-400 mt-0.5">Click "Upload Sales CSV" to import ESB sales files.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 3: Sales by Visit Purpose -->
      <div v-else-if="activeViewTab === 'byChannel'" class="p-6 space-y-4">
        <h4 class="text-sm font-bold text-slate-900 mb-2">Revenue Breakdown by Visit Purpose</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div
            v-for="ch in summary.byChannel || []"
            :key="ch.channel"
            class="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between"
          >
            <div>
              <div class="flex items-center justify-between">
                <span
                  class="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider"
                  :class="{
                    'bg-blue-100 text-blue-800': ch.channel === 'DINE IN',
                    'bg-orange-100 text-orange-800': ch.channel === 'SHOPEEFOOD',
                    'bg-emerald-100 text-emerald-800': ch.channel === 'GOFOOD',
                    'bg-green-100 text-green-800': ch.channel === 'GRABFOOD' || ch.channel === 'GRABMART',
                    'bg-indigo-100 text-indigo-800': ch.channel === 'WA ORDER',
                    'bg-purple-100 text-purple-800': ch.channel === 'TEMAN' || ch.channel === 'TAKE AWAY',
                    'bg-slate-200 text-slate-800': !ch.channel,
                  }"
                >
                  {{ ch.channel || 'Direct' }}
                </span>
                <span class="text-xs font-mono font-bold text-slate-500">{{ ch.bills }} bills</span>
              </div>
              <div class="mt-4">
                <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Total Revenue</span>
                <span class="text-xl font-black text-slate-900 font-mono">{{ formatRupiah(ch.revenue) }}</span>
              </div>
            </div>
            <div class="flex items-center justify-between pt-3 mt-4 border-t border-slate-200 text-xs">
              <span class="text-slate-500">Units Sold: <strong class="text-slate-800 font-mono">{{ ch.units }}</strong></span>
              <span class="text-slate-500">
                Share: <strong class="text-teal-700 font-mono">{{ summary.totalNetSales > 0 ? ((ch.revenue / summary.totalNetSales) * 100).toFixed(1) : 0 }}%</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 4: Sales by Store Location -->
      <div v-else-if="activeViewTab === 'byStore'" class="p-6 space-y-4">
        <h4 class="text-sm font-bold text-slate-900 mb-2">Revenue Breakdown by Store Location</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="st in summary.byStore || []"
            :key="st.store_id"
            class="bg-slate-50 border border-slate-200 rounded-2xl p-5"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <Building2 class="w-4 h-4 text-teal-600" />
                <span class="font-extrabold text-slate-900 text-sm">{{ st.store_name }}</span>
              </div>
              <span class="text-xs font-bold text-slate-500 font-mono">{{ st.bills }} bills</span>
            </div>
            <div class="flex items-baseline justify-between pt-2 border-t border-slate-200/80">
              <div>
                <span class="text-[11px] text-slate-500 uppercase tracking-wider block">Net Revenue</span>
                <span class="text-lg font-black text-emerald-700 font-mono">{{ formatRupiah(st.revenue) }}</span>
              </div>
              <div class="text-right">
                <span class="text-[11px] text-slate-500 uppercase tracking-wider block">Units Sold</span>
                <span class="text-sm font-bold text-slate-900 font-mono">{{ st.units }} units</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 5: Sales by Brand (Menu Category Detail) -->
      <div v-else-if="activeViewTab === 'byBrand'" class="p-6 space-y-4">
        <h4 class="text-sm font-bold text-slate-900 mb-2">Top Selling Product Brands (Menu Category Detail)</h4>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th class="py-3 px-4 w-12 text-center">Rank</th>
                <th class="py-3 px-4">Brand Name</th>
                <th class="py-3 px-4">Category</th>
                <th class="py-3 px-4 text-center">Units Sold</th>
                <th class="py-3 px-4 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(b, idx) in summary.byBrand || []" :key="idx" class="hover:bg-slate-50">
                <td class="py-3 px-4 text-center font-bold text-teal-700 font-mono">#{{ idx + 1 }}</td>
                <td class="py-3 px-4 font-black text-slate-900">{{ b.brand }}</td>
                <td class="py-3 px-4">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                    {{ b.category || 'Beverage' }}
                  </span>
                </td>
                <td class="py-3 px-4 text-center font-bold text-teal-800 font-mono">{{ b.units }}</td>
                <td class="py-3 px-4 text-right font-black text-slate-900 font-mono">{{ formatRupiah(b.revenue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 6: Top Selling Products -->
      <div v-else-if="activeViewTab === 'topItems'" class="p-6 space-y-4">
        <h4 class="text-sm font-bold text-slate-900 mb-2">Top Selling Products (Menu Variants)</h4>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th class="py-3 px-4 w-12 text-center">Rank</th>
                <th class="py-3 px-4">Brand</th>
                <th class="py-3 px-4">Menu Variant</th>
                <th class="py-3 px-4">Category</th>
                <th class="py-3 px-4 text-center">Units Sold</th>
                <th class="py-3 px-4 text-right">Total Revenue</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(item, idx) in summary.topItems || []" :key="idx" class="hover:bg-slate-50">
                <td class="py-3 px-4 text-center font-bold text-teal-700 font-mono">#{{ idx + 1 }}</td>
                <td class="py-3 px-4">
                  <span v-if="item.brand" class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                    {{ item.brand }}
                  </span>
                  <span v-else class="text-slate-400">-</span>
                </td>
                <td class="py-3 px-4 font-bold text-slate-900">{{ item.item_name }}</td>
                <td class="py-3 px-4">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                    {{ item.category || 'Beverage' }}
                  </span>
                </td>
                <td class="py-3 px-4 text-center font-bold text-teal-800 font-mono">{{ item.totalQty }}</td>
                <td class="py-3 px-4 text-right font-bold text-emerald-700 font-mono">{{ formatRupiah(item.totalRevenue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 7: Sales by Payment Method -->
      <div v-else-if="activeViewTab === 'byPayment'" class="p-6 space-y-4">
        <h4 class="text-sm font-bold text-slate-900 mb-2">Breakdown by Payment Method</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div
            v-for="pm in summary.byPayment || []"
            :key="pm.payment_method"
            class="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                <CreditCard class="w-3.5 h-3.5 text-teal-600" />
                {{ pm.payment_method }}
              </span>
              <span class="text-[11px] font-bold text-slate-500">{{ pm.count }} tx</span>
            </div>
            <div class="mt-2 pt-2 border-t border-slate-200">
              <span class="text-base font-black text-slate-900 font-mono">{{ formatRupiah(pm.totalAmount) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete File Confirmation Modal -->
    <div
      v-if="fileToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs transition-all"
    >
      <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
        <div class="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
          <Trash2 class="w-6 h-6" />
        </div>
        <div>
          <h3 class="text-base font-bold text-slate-900">Delete Sales File Record?</h3>
          <p class="text-xs text-slate-500 mt-1">
            Are you sure you want to delete <strong class="text-slate-800">{{ fileToDelete.filename }}</strong>? This will remove all associated sales transactions and update the reports automatically.
          </p>
        </div>
        <div class="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            @click="fileToDelete = null"
            class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            @click="executeDeleteFile"
            :disabled="isDeletingFile"
            class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            {{ isDeletingFile ? 'Deleting...' : 'Yes, Delete File' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Upload Sales CSV Modal -->
    <UploadSalesCsvModal
      :is-open="isUploadModalOpen"
      :stores="availableStores"
      @close="isUploadModalOpen = false"
      @imported="handleCsvImported"
    />
  </div>
</template>
