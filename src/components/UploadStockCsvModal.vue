<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Download,
  Calendar,
  Building2,
  Layers,
  Clock,
  Package,
  History,
  Check,
  Eye,
  FileText
} from 'lucide-vue-next';
import { useAuth } from '../composables/useAuth.js';
import { useAuditStore } from '../composables/useAuditStore.js';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close', 'updated']);

const { currentUser } = useAuth();
const { refreshProducts, stores, selectStore, applyStockCsvRows } = useAuditStore();

// Tabs: 'upload' | 'history'
const activeTab = ref('upload');

// Upload state
const fileInput = ref(null);
const selectedFile = ref(null);
const fileName = ref('');
const fileSize = ref('');
const isDragging = ref(false);
const isParsing = ref(false);
const isUploading = ref(false);
const uploadStatus = ref(null); // { type: 'success' | 'error', message: '', details: [] }

// Parsed metadata & data
const metadataDownloadedAt = ref('');
const metadataStockDate = ref('');
const metadataActiveStores = ref('');
const parsedRows = ref([]);
const validationErrors = ref([]);
const duplicateWarning = ref(null);
const rawFileContent = ref('');

// History state
const historyFiles = ref([]);
const isLoadingHistory = ref(false);
const previewFile = ref(null);
const deleteConfirmId = ref(null);
const isProcessingAction = ref(false);

// Clean string
function cleanCell(val) {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  return str;
}

// Robust CSV Line parser handling quoted commas, semicolons, and escapes
function parseCsvGrid(csvText, delimiter = ',') {
  // Strip BOM if present
  const text = csvText.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const grid = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const row = [];
    let currentCell = '';
    let insideQuote = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuote && nextChar === char) {
          currentCell += char;
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === delimiter && !insideQuote) {
        row.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    row.push(currentCell.trim());
    grid.push(row);
  }

  return grid;
}

// Helper to safely read JSON from response or null if HTML
async function safeJson(response) {
  if (!response) return null;
  const contentType = response.headers ? (response.headers.get('content-type') || '') : '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (_) {
      return null;
    }
  }
  return null;
}

// Local Storage helpers for seamless offline / Vite-only support
function getLocalStockHistory() {
  try {
    return JSON.parse(localStorage.getItem('birmas_stock_csv_files') || '[]');
  } catch (_) {
    return [];
  }
}

function saveLocalStockFile(newFile) {
  try {
    const list = getLocalStockHistory().map(f => ({ ...f, is_active: 0 }));
    list.unshift({ ...newFile, is_active: 1 });
    localStorage.setItem('birmas_stock_csv_files', JSON.stringify(list));
    localStorage.setItem('birmas_active_stock_csv', JSON.stringify(newFile));
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }
}

// Validate and parse CSV according to ESB specifications
function validateAndParseStockCsv(csvText, filename) {
  validationErrors.value = [];
  duplicateWarning.value = null;
  parsedRows.value = [];
  metadataDownloadedAt.value = '';
  metadataStockDate.value = '';
  metadataActiveStores.value = '';

  if (!csvText || !csvText.trim()) {
    validationErrors.value.push({
      code: 'EMPTY_FILE',
      title: 'File is Empty',
      message: 'The uploaded CSV file contains no content. Please upload a valid ESB export.',
    });
    return false;
  }

  // Detect delimiter
  const previewChunk = csvText.slice(0, 2000);
  const commaCount = (previewChunk.match(/,/g) || []).length;
  const semiCount = (previewChunk.match(/;/g) || []).length;
  const tabCount = (previewChunk.match(/\t/g) || []).length;
  let delimiter = ',';
  if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
  else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

  const grid = parseCsvGrid(csvText, delimiter);

  if (grid.length < 3) {
    validationErrors.value.push({
      code: 'INSUFFICIENT_ROWS',
      title: 'Invalid File Structure',
      message: `The CSV file only contains ${grid.length} rows. Expected ESB export with product data rows.`,
    });
    return false;
  }

  // 1. Downloaded Date & Time (Row 4, Col B or search)
  let downloadedAtVal = '';
  if (grid[3] && grid[3][1]) {
    downloadedAtVal = cleanCell(grid[3][1]);
  }
  if (!downloadedAtVal) {
    for (let r = 0; r < Math.min(10, grid.length); r++) {
      const colA = cleanCell(grid[r][0] || '').toLowerCase();
      if (colA.includes('download') || colA.includes('waktu') || colA.includes('date & time')) {
        downloadedAtVal = cleanCell(grid[r][1] || grid[r][2] || '');
        break;
      }
    }
  }
  if (!downloadedAtVal) {
    downloadedAtVal = new Date().toLocaleString('id-ID');
  }

  // 2. Stock Date (Row 5, Col B or search)
  let stockDateVal = '';
  if (grid[4] && grid[4][1]) {
    stockDateVal = cleanCell(grid[4][1]);
  }
  if (!stockDateVal) {
    for (let r = 0; r < Math.min(10, grid.length); r++) {
      const colA = cleanCell(grid[r][0] || '').toLowerCase();
      if ((colA.includes('stock date') || colA.includes('tanggal') || colA.includes('periode')) && !colA.includes('download')) {
        stockDateVal = cleanCell(grid[r][1] || grid[r][2] || '');
        break;
      }
    }
  }
  if (!stockDateVal) {
    stockDateVal = new Date().toLocaleDateString('id-ID');
  }

  // 3. Active Stores (Row 6, Col B or search)
  let activeStoresVal = '';
  if (grid[5] && grid[5][1]) {
    activeStoresVal = cleanCell(grid[5][1]);
  }
  if (!activeStoresVal) {
    for (let r = 0; r < Math.min(10, grid.length); r++) {
      const colA = cleanCell(grid[r][0] || '').toLowerCase();
      if (colA.includes('active') || colA.includes('store') || colA.includes('outlet') || colA.includes('cabang')) {
        activeStoresVal = cleanCell(grid[r][1] || grid[r][2] || '');
        break;
      }
    }
  }

  // 4. Find header row where product table begins
  let headerRowIndex = -1;
  let storeColIdx = 1;
  let productColIdx = 2;
  let categoryColIdx = 4;
  let unitColIdx = 6;
  let stockColIdx = 9;

  for (let r = 0; r < Math.min(15, grid.length); r++) {
    const row = grid[r].map(c => cleanCell(c).toLowerCase());
    const hasStore = row.some(c => c.includes('store') || c.includes('toko') || c.includes('cabang') || c.includes('branch'));
    const hasProduct = row.some(c => c.includes('product') || c.includes('nama') || c.includes('item') || c.includes('varian') || c.includes('barang'));
    if (hasStore || hasProduct) {
      headerRowIndex = r;
      // Dynamically map column positions from header names
      const sIdx = row.findIndex(c => c.includes('store') || c.includes('cabang') || c.includes('outlet') || c.includes('toko') || c.includes('branch'));
      if (sIdx !== -1) storeColIdx = sIdx;

      const pIdx = row.findIndex(c => c.includes('product') || c.includes('nama') || c.includes('item') || c.includes('varian') || c.includes('barang'));
      if (pIdx !== -1) productColIdx = pIdx;

      const cIdx = row.findIndex(c => c.includes('category') || c.includes('kategori') || c.includes('cat'));
      if (cIdx !== -1) categoryColIdx = cIdx;

      const uIdx = row.findIndex(c => c.includes('unit') || c.includes('satuan') || c.includes('uom'));
      if (uIdx !== -1) unitColIdx = uIdx;

      // Locate stock count column
      const qIdx = row.findIndex(c => 
        c.includes('stok akhir') || c.includes('ending') || c.includes('current stock') || 
        c.includes('saldo akhir') || c.includes('stock qty') || c.includes('qty stock') ||
        c.includes('stok fisik') || c.includes('qty') || c.includes('quantity') || c.includes('stok') || c.includes('stock') || c.includes('jumlah')
      );
      if (qIdx !== -1) stockColIdx = qIdx;
      break;
    }
  }

  const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 6;
  const rows = [];

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length < 2) continue;

    const storeName = cleanCell(row[storeColIdx] || row[1] || row[0]);
    const productName = cleanCell(row[productColIdx] || row[2] || row[1]);
    const category = cleanCell(categoryColIdx !== -1 ? row[categoryColIdx] : '');
    const defaultUnit = cleanCell(unitColIdx !== -1 ? row[unitColIdx] : '') || 'Can';
    const stockQtyRaw = cleanCell(row[stockColIdx] !== undefined ? row[stockColIdx] : (row[row.length - 1] || '0'));

    if (!storeName && !productName) continue;
    if (storeName.toLowerCase().includes('total') || productName.toLowerCase().includes('total')) continue;
    if (storeName.toLowerCase().includes('grand total') || productName.toLowerCase().includes('grand total')) continue;

    let stockQty = 0;
    if (stockQtyRaw) {
      let s = stockQtyRaw.replace(/[^0-9.,-]/g, '').trim();
      if (s.includes('.') && s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else if (s.includes(',') && !s.includes('.')) {
        s = s.replace(',', '.');
      }
      const parsed = parseFloat(s);
      // Discrete inventory: bottles/cans are strictly integer counts
      stockQty = isNaN(parsed) ? 0 : Math.round(parsed);
    }

    if (storeName && productName) {
      rows.push({
        rowNum: r + 1,
        storeName,
        productName,
        category: category || 'Craft Beer',
        unit: defaultUnit || 'Can',
        stockQty,
      });
    }
  }

  // If active stores wasn't in header row, infer from distinct store names in data
  if (!activeStoresVal && rows.length > 0) {
    const unique = Array.from(new Set(rows.map(r => r.storeName).filter(Boolean)));
    activeStoresVal = unique.join(', ');
  }

  metadataDownloadedAt.value = downloadedAtVal;
  metadataStockDate.value = stockDateVal;
  metadataActiveStores.value = activeStoresVal || 'All Stores';

  if (rows.length === 0) {
    validationErrors.value.push({
      code: 'NO_VALID_DATA',
      title: 'No Product Stock Data Found',
      message: 'Could not extract valid product stock rows. Please ensure your CSV contains Store Name, Product Name, and Stock Qty.',
    });
  }

  parsedRows.value = rows;

  // Duplicate warning check
  const existing = historyFiles.value.find(
    f => f.filename.toLowerCase() === filename.toLowerCase()
  );
  if (existing) {
    duplicateWarning.value = {
      filename: existing.filename,
      uploadedAt: existing.uploaded_at,
      uploadedBy: existing.uploaded_by,
      isActive: existing.is_active === 1,
    };
  }

  return validationErrors.value.length === 0;
}

// File handling
function handleFileSelect(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  processFile(files[0]);
}

function handleFileDrop(e) {
  isDragging.value = false;
  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;
  processFile(files[0]);
}

function processFile(file) {
  uploadStatus.value = null;
  selectedFile.value = file;
  fileName.value = file.name;
  fileSize.value = (file.size / 1024).toFixed(1) + ' KB';

  if (!file.name.toLowerCase().endsWith('.csv')) {
    validationErrors.value = [
      {
        code: 'INVALID_FILE_TYPE',
        title: 'File Type Must Be CSV',
        message: `The selected file "${file.name}" is not a CSV. Please upload a .csv file exported from ESB ERP.`,
      },
    ];
    return;
  }

  isParsing.value = true;
  const reader = new FileReader();

  reader.onload = (event) => {
    isParsing.value = false;
    const text = event.target.result;
    rawFileContent.value = text;
    validateAndParseStockCsv(text, file.name);
  };

  reader.onerror = () => {
    isParsing.value = false;
    validationErrors.value = [
      {
        code: 'READ_ERROR',
        title: 'Failed to Read File',
        message: 'Could not read the file from disk. Please check file permissions and try again.',
      },
    ];
  };

  reader.readAsText(file);
}

// Submit upload
async function submitStockCsvUpload() {
  if (validationErrors.value.length > 0 || parsedRows.value.length === 0) return;

  isUploading.value = true;
  uploadStatus.value = null;

  try {
    const payload = {
      filename: fileName.value,
      fileSize: fileSize.value,
      uploadedBy: currentUser.value?.name || currentUser.value?.username || 'Auditor',
      metadata: {
        downloadedAtEsb: metadataDownloadedAt.value,
        stockDate: metadataStockDate.value,
        activeStores: metadataActiveStores.value,
      },
      rows: parsedRows.value,
      fileContent: rawFileContent.value,
    };

    let serverData = null;
    try {
      const res = await fetch('/api/stock-csv/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      serverData = await safeJson(res);
    } catch (netErr) {
      console.warn('[Stock CSV] Backend unreachable, using client storage:', netErr);
    }

    // Always apply to in-memory store & localStorage for instant comparison table update
    applyStockCsvRows(parsedRows.value, payload.metadata, fileName.value);

    // Save to local history
    const localRecord = {
      id: (serverData && serverData.fileId) ? serverData.fileId : ('stock-' + Date.now()),
      filename: fileName.value,
      file_size: fileSize.value,
      uploaded_by: payload.uploadedBy,
      uploaded_at: new Date().toISOString(),
      downloaded_at_esb: metadataDownloadedAt.value,
      stock_date: metadataStockDate.value,
      active_stores: metadataActiveStores.value,
      row_count: parsedRows.value.length,
      is_active: 1,
      rows: parsedRows.value,
      file_content: rawFileContent.value,
    };

    saveLocalStockFile(localRecord);

    uploadStatus.value = {
      type: 'success',
      message: (serverData && serverData.message)
        ? serverData.message
        : `Successfully applied ${parsedRows.value.length} product records to comparison table!`,
    };

    // Auto refresh and notify parent
    await refreshProducts();
    emit('updated', {
      fileId: localRecord.id,
      filename: localRecord.filename,
      rowCount: localRecord.row_count,
      activeStores: localRecord.active_stores,
      stockDate: localRecord.stock_date,
    });

    await fetchHistory();
    setTimeout(() => {
      selectedFile.value = null;
      fileName.value = '';
      parsedRows.value = [];
      activeTab.value = 'history';
    }, 1200);
  } catch (err) {
    uploadStatus.value = {
      type: 'error',
      message: err.message || 'Error processing uploaded CSV',
    };
  } finally {
    isUploading.value = false;
  }
}

// Fetch history (hybrid: backend + localStorage)
async function fetchHistory() {
  isLoadingHistory.value = true;
  try {
    let serverFiles = [];
    try {
      const res = await fetch('/api/stock-csv/history');
      const data = await safeJson(res);
      if (data && data.success && Array.isArray(data.files)) {
        serverFiles = data.files;
      }
    } catch (_) {}

    const localFiles = getLocalStockHistory();

    const merged = [...serverFiles];
    for (const lf of localFiles) {
      if (!merged.some(mf => mf.id === lf.id || mf.filename === lf.filename)) {
        merged.push(lf);
      }
    }

    historyFiles.value = merged.length > 0 ? merged : localFiles;
  } catch (err) {
    console.warn('History fetch fallback:', err);
    historyFiles.value = getLocalStockHistory();
  } finally {
    isLoadingHistory.value = false;
  }
}

// Revert to a specific CSV file in history
async function handleRevert(file) {
  if (!file || !file.id) return;
  isProcessingAction.value = true;
  try {
    try {
      const res = await fetch(`/api/stock-csv/revert/${encodeURIComponent(file.id)}`, {
        method: 'POST',
      });
      await safeJson(res);
    } catch (_) {}

    // Update local history active state
    const list = getLocalStockHistory().map(f => ({
      ...f,
      is_active: (f.id === file.id || f.filename === file.filename) ? 1 : 0,
    }));
    localStorage.setItem('birmas_stock_csv_files', JSON.stringify(list));
    localStorage.setItem('birmas_active_stock_csv', JSON.stringify({ ...file, is_active: 1 }));

    // Apply rows if present
    if (file.rows && Array.isArray(file.rows) && file.rows.length > 0) {
      applyStockCsvRows(file.rows, {
        downloadedAtEsb: file.downloaded_at_esb,
        stockDate: file.stock_date,
        activeStores: file.active_stores,
      }, file.filename);
    } else if (file.file_content) {
      const grid = parseCsvGrid(file.file_content);
      validateAndParseStockCsv(file.file_content, file.filename);
      if (parsedRows.value.length > 0) {
        applyStockCsvRows(parsedRows.value, {
          downloadedAtEsb: file.downloaded_at_esb,
          stockDate: file.stock_date,
          activeStores: file.active_stores,
        }, file.filename);
      }
    }

    await refreshProducts();
    await fetchHistory();
    emit('updated', file);
  } catch (err) {
    console.error('Error reverting stock data:', err);
  } finally {
    isProcessingAction.value = false;
  }
}

// Delete an uploaded file from history
async function handleDelete(fileId) {
  if (!fileId) return;
  isProcessingAction.value = true;
  try {
    try {
      await fetch(`/api/stock-csv/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
      });
    } catch (_) {}

    const list = getLocalStockHistory().filter(f => f.id !== fileId);
    localStorage.setItem('birmas_stock_csv_files', JSON.stringify(list));

    const activeLocal = localStorage.getItem('birmas_active_stock_csv');
    if (activeLocal) {
      try {
        const activeObj = JSON.parse(activeLocal);
        if (activeObj.id === fileId) {
          const nextActive = list.find(f => f.is_active === 1) || list[0] || null;
          if (nextActive) {
            localStorage.setItem('birmas_active_stock_csv', JSON.stringify(nextActive));
          } else {
            localStorage.removeItem('birmas_active_stock_csv');
          }
        }
      } catch (_) {}
    }

    deleteConfirmId.value = null;
    await refreshProducts();
    await fetchHistory();
    emit('updated', { fileId, deleted: true });
  } catch (err) {
    console.error('Error deleting file:', err);
  } finally {
    isProcessingAction.value = false;
  }
}

// Inspect details of an uploaded file
async function handleInspect(file) {
  try {
    const res = await fetch('/api/stock-csv/history');
    const data = await safeJson(res);
    const found = (data && data.files || []).find(f => f.id === file.id);
    previewFile.value = found || file;
  } catch {
    previewFile.value = file;
  }
}

// Distinct stores in parsed rows
const distinctStoresInUpload = computed(() => {
  return Array.from(new Set(parsedRows.value.map(r => r.storeName).filter(Boolean)));
});

// Format date
function formatDateStr(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    fetchHistory();
    uploadStatus.value = null;
  }
});

onMounted(() => {
  if (props.isOpen) {
    fetchHistory();
  }
});
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
  >
    <div
      class="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
    >
      <!-- Top Header -->
      <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shadow-xs">
            <UploadCloud class="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-black text-slate-900 tracking-tight">
                ESB Stock Period CSV Manager
              </h3>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                Live Comparison Engine
              </span>
            </div>
            <p class="text-xs text-slate-500">
              Upload and manage ESB ERP stock balance exports to update the stock comparison table automatically
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          type="button"
          class="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Tab Navigation -->
      <div class="px-6 pt-3 border-b border-slate-200 flex items-center gap-2 bg-white shrink-0">
        <button
          @click="activeTab = 'upload'"
          type="button"
          class="pb-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer"
          :class="activeTab === 'upload' ? 'border-teal-600 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800'"
        >
          <UploadCloud class="w-4 h-4" />
          <span>Upload Stock CSV</span>
        </button>

        <button
          @click="activeTab = 'history'"
          type="button"
          class="pb-3 px-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer"
          :class="activeTab === 'history' ? 'border-teal-600 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800'"
        >
          <History class="w-4 h-4" />
          <span>Upload History & Versions</span>
          <span
            v-if="historyFiles.length > 0"
            class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200"
          >
            {{ historyFiles.length }}
          </span>
        </button>

        <div class="ml-auto pb-3">
          <a
            href="/public/templates/stock_period_list_sample.csv"
            download="stock_period_list_template.csv"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors border border-slate-200"
            title="Download the official CSV structure template"
          >
            <Download class="w-3.5 h-3.5 text-slate-600" />
            <span>Download Template CSV</span>
          </a>
        </div>
      </div>

      <!-- Tab 1: Upload New CSV -->
      <div v-if="activeTab === 'upload'" class="p-6 overflow-y-auto flex-1 space-y-5">
        <!-- Drag & Drop Zone -->
        <div
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleFileDrop"
          class="border-2 border-dashed rounded-3xl p-7 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 relative overflow-hidden"
          :class="isDragging ? 'border-teal-500 bg-teal-50/40 ring-4 ring-teal-100' : 'border-slate-300 hover:border-teal-400 bg-slate-50/50 hover:bg-slate-50'"
          @click="$refs.fileInput.click()"
        >
          <input
            ref="fileInput"
            type="file"
            accept=".csv,text/csv"
            class="hidden"
            @change="handleFileSelect"
          />

          <div class="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shadow-sm">
            <UploadCloud class="w-7 h-7 text-teal-600 animate-pulse" />
          </div>

          <div>
            <p class="text-sm font-black text-slate-800">
              Drag & Drop your ESB Stock CSV here, or <span class="text-teal-700 underline">Browse File</span>
            </p>
            <p class="text-xs text-slate-500 mt-1">
              Supports .csv files only (e.g. stock_period_list_15102026.csv)
            </p>
          </div>

          <div v-if="fileName" class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white border border-teal-300 text-teal-950 font-mono text-xs font-bold shadow-xs">
            <FileText class="w-4 h-4 text-teal-700" />
            <span>{{ fileName }}</span>
            <span class="text-slate-400 font-normal">({{ fileSize }})</span>
          </div>
        </div>

        <!-- Validation Errors Display -->
        <div
          v-if="validationErrors.length > 0"
          class="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-2 text-rose-950 shadow-xs"
        >
          <div class="flex items-center gap-2 font-black text-rose-950 text-sm">
            <AlertCircle class="w-5 h-5 text-rose-700 shrink-0" />
            <span>Upload Validation Failed ({{ validationErrors.length }} {{ validationErrors.length === 1 ? 'Error' : 'Errors' }} Found):</span>
          </div>
          <ul class="space-y-1.5 pl-7 list-disc text-xs text-rose-950 font-medium">
            <li v-for="(err, idx) in validationErrors" :key="idx">
              <strong class="font-extrabold text-rose-950">[{{ err.title }}]:</strong>
              <span class="ml-1 text-rose-900">{{ err.message }}</span>
            </li>
          </ul>
        </div>

        <!-- Duplicate Warning Notice -->
        <div
          v-if="duplicateWarning"
          class="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3 text-amber-950 text-xs shadow-xs"
        >
          <AlertTriangle class="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p class="font-extrabold text-amber-950">
              Duplicate Filename Warning: "{{ duplicateWarning.filename }}"
            </p>
            <p class="text-amber-900 mt-0.5">
              This file was previously uploaded by <strong>{{ duplicateWarning.uploadedBy }}</strong> on {{ formatDateStr(duplicateWarning.uploadedAt) }}.
              Uploading again will supersede previous stock values and create a new active version in the history.
            </p>
          </div>
        </div>



        <!-- Validated Metadata Preview Card -->
        <div
          v-if="validationErrors.length === 0 && parsedRows.length > 0"
          class="p-5 bg-emerald-50/60 border border-emerald-300 rounded-2xl space-y-4 shadow-xs"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <CheckCircle2 class="w-5 h-5 text-emerald-700" />
              <h4 class="text-sm font-extrabold text-emerald-950">
                ESB Template Validated Successfully
              </h4>
            </div>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
              {{ parsedRows.length }} Products Ready
            </span>
          </div>

          <!-- Metadata Grid without coordinate info -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div class="bg-white p-3 rounded-xl border border-emerald-200">
              <span class="text-slate-500 font-bold block text-[11px]">ESB Download Date & Time</span>
              <span class="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                {{ metadataDownloadedAt || '-' }}
              </span>
            </div>

            <div class="bg-white p-3 rounded-xl border border-emerald-200">
              <span class="text-slate-500 font-bold block text-[11px]">Stock Date</span>
              <span class="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                {{ metadataStockDate || '-' }}
              </span>
            </div>

            <div class="bg-white p-3 rounded-xl border border-emerald-200">
              <span class="text-slate-500 font-bold block text-[11px]">Active Stores</span>
              <span class="font-semibold text-slate-900 text-xs mt-0.5 block line-clamp-2" :title="metadataActiveStores">
                {{ metadataActiveStores || '-' }}
              </span>
            </div>
          </div>

          <!-- Sample Table Preview without coordinate labels -->
          <div class="bg-white rounded-xl border border-emerald-200 overflow-hidden">
            <div class="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span class="font-bold text-slate-700">Sample Parsed Data Preview (First 5 of {{ parsedRows.length }} items):</span>
              <span class="text-slate-500 font-mono text-[11px]">{{ distinctStoresInUpload.length }} Active Stores</span>
            </div>
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-100/70 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                  <th class="py-2 px-3 w-8 text-center">No</th>
                  <th class="py-2 px-3">Store Name</th>
                  <th class="py-2 px-3">Product Name</th>
                  <th class="py-2 px-3">Category</th>
                  <th class="py-2 px-3">Unit</th>
                  <th class="py-2 px-3 text-center bg-teal-50 text-teal-900 font-extrabold">Stock Qty</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="(r, idx) in parsedRows.slice(0, 5)" :key="idx" class="hover:bg-slate-50">
                  <td class="py-1.5 px-3 text-center font-mono text-slate-400 text-[11px]">{{ idx + 1 }}</td>
                  <td class="py-1.5 px-3 font-semibold text-slate-900">{{ r.storeName }}</td>
                  <td class="py-1.5 px-3 font-medium text-slate-800">{{ r.productName }}</td>
                  <td class="py-1.5 px-3 text-slate-500">{{ r.category }}</td>
                  <td class="py-1.5 px-3 text-slate-600 font-bold">{{ r.unit }}</td>
                  <td class="py-1.5 px-3 text-center font-mono font-black text-teal-800 bg-teal-50/50">{{ r.stockQty }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Upload Status Banner -->
        <div
          v-if="uploadStatus"
          class="p-4 rounded-2xl flex items-center gap-3 text-xs"
          :class="uploadStatus.type === 'success' ? 'bg-emerald-50 text-emerald-950 border border-emerald-300' : 'bg-rose-50 text-rose-950 border border-rose-300'"
        >
          <CheckCircle2 v-if="uploadStatus.type === 'success'" class="w-5 h-5 text-emerald-700 shrink-0" />
          <AlertCircle v-else class="w-5 h-5 text-rose-700 shrink-0" />
          <div class="flex-1 font-medium">
            <p class="font-bold">{{ uploadStatus.message }}</p>
          </div>
        </div>
      </div>

      <!-- Tab 2: Upload History & Versions -->
      <div v-else-if="activeTab === 'history'" class="p-6 overflow-y-auto flex-1 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-sm font-extrabold text-slate-900">
              Uploaded Stock CSV Archive
            </h4>
            <p class="text-xs text-slate-500">
              Audit versions are tracked below. You can revert comparison data to any previous CSV or delete obsolete versions.
            </p>
          </div>
          <button
            @click="fetchHistory"
            type="button"
            class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Clock class="w-3.5 h-3.5 text-slate-500" />
            <span>Refresh</span>
          </button>
        </div>

        <!-- Loading indicator -->
        <div v-if="isLoadingHistory" class="py-12 text-center text-slate-400 text-xs">
          Loading history files...
        </div>

        <!-- Empty state -->
        <div
          v-else-if="historyFiles.length === 0"
          class="py-12 text-center border-2 border-dashed border-slate-200 rounded-3xl p-6"
        >
          <FileSpreadsheet class="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p class="text-sm font-bold text-slate-700">No Stock CSV files uploaded yet</p>
          <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Upload your first ESB stock period export in the Upload tab to populate the comparison table.
          </p>
          <button
            @click="activeTab = 'upload'"
            type="button"
            class="mt-4 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm cursor-pointer"
          >
            Upload Now
          </button>
        </div>

        <!-- History Table without coordinate labels in headers -->
        <div v-else class="border border-slate-200 rounded-2xl overflow-hidden bg-white">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                <th class="py-3 px-3.5">Filename</th>
                <th class="py-3 px-3">Stock Date</th>
                <th class="py-3 px-3">ESB Downloaded</th>
                <th class="py-3 px-3">Uploaded By</th>
                <th class="py-3 px-3">Upload Time</th>
                <th class="py-3 px-3 text-center">Items</th>
                <th class="py-3 px-3 text-center">Status</th>
                <th class="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="file in historyFiles"
                :key="file.id"
                class="hover:bg-slate-50/80 transition-colors"
                :class="file.is_active === 1 ? 'bg-teal-50/30' : ''"
              >
                <!-- Filename -->
                <td class="py-3 px-3.5">
                  <div class="flex items-center gap-2">
                    <FileSpreadsheet
                      class="w-4 h-4 shrink-0"
                      :class="file.is_active === 1 ? 'text-teal-600' : 'text-slate-400'"
                    />
                    <div>
                      <span class="font-bold text-slate-900 block">{{ file.filename }}</span>
                      <span class="text-[10px] text-slate-400 font-mono">{{ file.file_size || '-' }}</span>
                    </div>
                  </div>
                </td>

                <!-- Stock Date -->
                <td class="py-3 px-3 font-mono font-semibold text-slate-800">
                  {{ file.stock_date || '-' }}
                </td>

                <!-- ESB Downloaded -->
                <td class="py-3 px-3 font-mono text-slate-600">
                  {{ file.downloaded_at_esb || '-' }}
                </td>

                <!-- Uploaded By -->
                <td class="py-3 px-3">
                  <span class="font-semibold text-slate-800">{{ file.uploaded_by || 'Auditor' }}</span>
                </td>

                <!-- Upload Time -->
                <td class="py-3 px-3 text-slate-500 font-mono text-[11px]">
                  {{ formatDateStr(file.uploaded_at) }}
                </td>

                <!-- Items -->
                <td class="py-3 px-3 text-center font-mono font-bold text-slate-800">
                  {{ file.row_count || 0 }}
                </td>

                <!-- Status -->
                <td class="py-3 px-3 text-center">
                  <span
                    v-if="file.is_active === 1"
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300"
                  >
                    <Check class="w-3 hand-3 text-emerald-700" />
                    Active Comparison
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200"
                  >
                    Archived
                  </span>
                </td>

                <!-- Actions -->
                <td class="py-3 px-3 text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <!-- Revert Button -->
                    <button
                      v-if="file.is_active !== 1"
                      @click="handleRevert(file)"
                      :disabled="isProcessingAction"
                      type="button"
                      class="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      title="Revert stock comparison data to this file"
                    >
                      <RotateCcw class="w-3 h-3 text-teal-700" />
                      <span>Revert Data</span>
                    </button>

                    <!-- Delete Button -->
                    <button
                      @click="deleteConfirmId = file.id"
                      type="button"
                      class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete this uploaded CSV from history"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div
        v-if="deleteConfirmId"
        class="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
      >
        <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-xl max-w-sm w-full space-y-3">
          <div class="flex items-center gap-2 text-rose-700 font-bold text-sm">
            <AlertCircle class="w-5 h-5 text-rose-600" />
            <span>Delete Uploaded Stock CSV?</span>
          </div>
          <p class="text-xs text-slate-600">
            Are you sure you want to remove this CSV file from your history? If this was the active comparison file, the previous uploaded version will be restored.
          </p>
          <div class="flex items-center justify-end gap-2 pt-2">
            <button
              @click="deleteConfirmId = null"
              type="button"
              class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
            >
              Cancel
            </button>
            <button
              @click="handleDelete(deleteConfirmId)"
              type="button"
              class="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs"
            >
              <Trash2 class="w-3.5 h-3.5" />
              <span>Confirm Delete</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
        <div class="text-xs text-slate-500">
          <span v-if="activeTab === 'upload' && parsedRows.length > 0">
            Ready to update {{ parsedRows.length }} product stocks across {{ distinctStoresInUpload.length }} stores.
          </span>
          <span v-else>
            Physical Stock Audit & ESB Reconciliation
          </span>
        </div>

        <div class="flex items-center gap-2.5">
          <button
            @click="emit('close')"
            type="button"
            class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>

          <button
            v-if="activeTab === 'upload'"
            @click="submitStockCsvUpload"
            :disabled="validationErrors.length > 0 || parsedRows.length === 0 || isUploading"
            type="button"
            class="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs flex items-center gap-2 shadow-md shadow-teal-600/20 transition-all cursor-pointer"
          >
            <CheckCircle2 v-if="!isUploading" class="w-4 h-4" />
            <span v-if="isUploading">Applying to Comparison Table...</span>
            <span v-else>Upload & Apply to Comparison Table</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
