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
const { refreshProducts, stores, selectStore } = useAuditStore();

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
const metadata4B = ref('');
const metadata5B = ref('');
const metadata6B = ref('');
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

// Robust CSV Line parser handling quoted commas and escapes
function parseCsvGrid(csvText, delimiter = ',') {
  const lines = csvText.split(/\r?\n/);
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

      if (char === '"' || char === "'") {
        if (insideQuote && nextChar === char) {
          // Escaped quote
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

// Client-side parser following user's exact specification:
// 4B: Date & time downloaded from ESB (row 4, col B)
// 5B: Stock date (row 5, col B)
// 6B: Store names active in that moment (row 6, col B)
// Data rows:
// Col B: Store name
// Col C: Product name
// Col E: Product category
// Col G: Default unit
// Col J: Stock qty
function validateAndParseStockCsv(csvText, filename) {
  validationErrors.value = [];
  duplicateWarning.value = null;
  parsedRows.value = [];
  metadata4B.value = '';
  metadata5B.value = '';
  metadata6B.value = '';

  if (!csvText || !csvText.trim()) {
    validationErrors.value.push({
      code: 'EMPTY_FILE',
      title: 'File is Empty',
      message: 'The uploaded CSV file contains no content. Please upload a valid ESB export.',
    });
    return false;
  }

  // Detect delimiter
  const previewChunk = csvText.slice(0, 1500);
  const commaCount = (previewChunk.match(/,/g) || []).length;
  const semiCount = (previewChunk.match(/;/g) || []).length;
  const tabCount = (previewChunk.match(/\t/g) || []).length;
  let delimiter = ',';
  if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
  else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

  const grid = parseCsvGrid(csvText, delimiter);

  if (grid.length < 6) {
    validationErrors.value.push({
      code: 'INSUFFICIENT_ROWS',
      title: 'Invalid File Structure',
      message: `The CSV file only contains ${grid.length} rows. Expected ESB template header with metadata cells (4B, 5B, 6B) and product data rows.`,
    });
    return false;
  }

  // Find 4B, 5B, 6B
  // Excel Cell 4B is Row index 3 (4th row), Column index 1 (Column B)
  let cell4B = '';
  let cell5B = '';
  let cell6B = '';

  // Direct check at expected coordinates
  if (grid[3] && grid[3][1]) {
    cell4B = cleanCell(grid[3][1]);
  }
  if (grid[4] && grid[4][1]) {
    cell5B = cleanCell(grid[4][1]);
  }
  if (grid[5] && grid[5][1]) {
    cell6B = cleanCell(grid[5][1]);
  }

  // Fallback search in top 8 rows if rows have titles or offset
  if (!cell4B) {
    for (let r = 0; r < Math.min(8, grid.length); r++) {
      const colA = cleanCell(grid[r][0] || '').toLowerCase();
      if (colA.includes('download') || colA.includes('waktu') || colA.includes('date & time')) {
        cell4B = cleanCell(grid[r][1] || grid[r][2] || '');
        break;
      }
    }
  }

  if (!cell5B) {
    for (let r = 0; r < Math.min(8, grid.length); r++) {
      const colA = cleanCell(grid[r][0] || '').toLowerCase();
      if ((colA.includes('stock date') || colA.includes('tanggal') || colA.includes('periode')) && !colA.includes('download')) {
        cell5B = cleanCell(grid[r][1] || grid[r][2] || '');
        break;
      }
    }
  }

  if (!cell6B) {
    for (let r = 0; r < Math.min(8, grid.length); r++) {
      const colA = cleanCell(grid[r][0] || '').toLowerCase();
      if (colA.includes('active') || colA.includes('store') || colA.includes('outlet') || colA.includes('cabang')) {
        cell6B = cleanCell(grid[r][1] || grid[r][2] || '');
        break;
      }
    }
  }

  // Strict Validation for 4B, 5B, 6B
  if (!cell4B) {
    validationErrors.value.push({
      code: 'MISSING_CELL_4B',
      title: 'Missing Cell 4B (ESB Download Date & Time)',
      message: 'Row 4, Column B must contain the date & time the CSV was downloaded from ESB (e.g. "15/10/2026 14:30:00").',
    });
  }

  if (!cell5B) {
    validationErrors.value.push({
      code: 'MISSING_CELL_5B',
      title: 'Missing Cell 5B (Stock Date)',
      message: 'Row 5, Column B must contain the stock date (e.g. "15/10/2026").',
    });
  }

  if (!cell6B) {
    validationErrors.value.push({
      code: 'MISSING_CELL_6B',
      title: 'Missing Cell 6B (Active Store Names)',
      message: 'Row 6, Column B must contain active store names (e.g. "Birmas Sudirman, Birmas Lebak Bulus").',
    });
  }

  metadata4B.value = cell4B;
  metadata5B.value = cell5B;
  metadata6B.value = cell6B;

  // Find where data rows start (usually after Row 6)
  let headerRowIndex = -1;
  for (let r = 5; r < Math.min(12, grid.length); r++) {
    const row = grid[r].map(c => cleanCell(c).toLowerCase());
    if (row.some(c => c.includes('product') || c.includes('nama') || c.includes('item') || c.includes('varian') || c.includes('store') || c.includes('toko'))) {
      headerRowIndex = r;
      break;
    }
  }

  const startRow = headerRowIndex !== -1 ? headerRowIndex + 1 : 6;
  const rows = [];
  let minColWarning = false;

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length < 2) continue;

    // Check minimum columns (Col J is index 9, so need at least 10 columns)
    if (row.length < 10) {
      minColWarning = true;
    }

    const storeName = cleanCell(row[1]); // Col B (index 1)
    const productName = cleanCell(row[2]); // Col C (index 2)
    const category = cleanCell(row[4] || ''); // Col E (index 4)
    const defaultUnit = cleanCell(row[6] || ''); // Col G (index 6)
    const stockQtyRaw = cleanCell(row[9] !== undefined ? row[9] : ''); // Col J (index 9)

    // Skip empty lines or summary rows
    if (!storeName && !productName) continue;
    if (storeName.toLowerCase().includes('total') || productName.toLowerCase().includes('total')) continue;

    // Parse Stock Qty (Col J)
    let stockQty = 0;
    if (stockQtyRaw) {
      const cleanNum = stockQtyRaw.replace(/[^0-9.-]+/g, '');
      stockQty = parseFloat(cleanNum) || 0;
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

  if (minColWarning && rows.length === 0) {
    validationErrors.value.push({
      code: 'COLUMN_COUNT_MISMATCH',
      title: 'Columns Structure Incorrect',
      message: 'The table requires at least 10 columns (Col B: Store Name, Col C: Product Name, Col E: Category, Col G: Unit, Col J: Stock Qty).',
    });
  }

  if (rows.length === 0) {
    validationErrors.value.push({
      code: 'NO_VALID_DATA',
      title: 'No Product Stock Data Found',
      message: 'Could not extract valid product stock rows. Please ensure data has Store Name in Column B, Product in Column C, and Stock Qty in Column J.',
    });
  }

  parsedRows.value = rows;

  // Check duplicate filename in history
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

// Submit upload to backend
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
        downloadedAtEsb: metadata4B.value,
        stockDate: metadata5B.value,
        activeStores: metadata6B.value,
      },
      rows: parsedRows.value,
      fileContent: rawFileContent.value,
    };

    const res = await fetch('/api/stock-csv/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      uploadStatus.value = {
        type: 'error',
        message: data.error || 'Server rejected CSV upload',
        code: data.code || 'SERVER_ERROR',
      };
      return;
    }

    uploadStatus.value = {
      type: 'success',
      message: data.message || `Successfully applied ${data.rowCount} product records to comparison table!`,
    };

    // Auto refresh products and live stores in memory
    await refreshProducts();
    emit('updated', data);

    // Auto switch to history or close after delay
    await fetchHistory();
    setTimeout(() => {
      // Clear file selection
      selectedFile.value = null;
      fileName.value = '';
      parsedRows.value = [];
      activeTab.value = 'history';
    }, 1200);
  } catch (err) {
    uploadStatus.value = {
      type: 'error',
      message: err.message || 'Network error while uploading CSV',
    };
  } finally {
    isUploading.value = false;
  }
}

// Fetch history
async function fetchHistory() {
  isLoadingHistory.value = true;
  try {
    const res = await fetch('/api/stock-csv/history');
    const data = await res.json();
    if (data.success) {
      historyFiles.value = data.files || [];
    }
  } catch (err) {
    console.warn('Failed to fetch stock CSV history:', err);
  } finally {
    isLoadingHistory.value = false;
  }
}

// Revert to a specific CSV file in history
async function handleRevert(file) {
  if (!file || !file.id) return;
  isProcessingAction.value = true;
  try {
    const res = await fetch(`/api/stock-csv/revert/${encodeURIComponent(file.id)}`, {
      method: 'POST',
    });
    const data = await res.json();
    if (data.success) {
      await refreshProducts();
      await fetchHistory();
      emit('updated', data);
    } else {
      alert(data.error || 'Failed to revert to this CSV');
    }
  } catch (err) {
    alert(err.message || 'Error reverting stock data');
  } finally {
    isProcessingAction.value = false;
  }
}

// Delete an uploaded file from history
async function handleDelete(fileId) {
  if (!fileId) return;
  isProcessingAction.value = true;
  try {
    const res = await fetch(`/api/stock-csv/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (data.success) {
      deleteConfirmId.value = null;
      await refreshProducts();
      await fetchHistory();
      emit('updated', data);
    } else {
      alert(data.error || 'Failed to delete file');
    }
  } catch (err) {
    alert(err.message || 'Error deleting file');
  } finally {
    isProcessingAction.value = false;
  }
}

// Inspect details of an uploaded file
async function handleInspect(file) {
  try {
    const res = await fetch('/api/stock-csv/history');
    const data = await res.json();
    const found = (data.files || []).find(f => f.id === file.id);
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
        <!-- Template Requirement Spec Box (Clear & Highly Visible) -->
        <div class="p-4 bg-teal-50/70 border border-teal-200 rounded-2xl text-xs space-y-2">
          <div class="flex items-center gap-2 text-teal-950 font-bold">
            <FileSpreadsheet class="w-4 h-4 text-teal-700" />
            <span>Required ESB Stock CSV Template Structure:</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
            <div class="p-2.5 rounded-xl bg-white border border-teal-100 shadow-2xs">
              <span class="text-teal-800 font-extrabold block">Cell 4B:</span>
              <span class="text-slate-600">Date & time downloaded from ESB</span>
            </div>
            <div class="p-2.5 rounded-xl bg-white border border-teal-100 shadow-2xs">
              <span class="text-teal-800 font-extrabold block">Cell 5B:</span>
              <span class="text-slate-600">Stock audit date</span>
            </div>
            <div class="p-2.5 rounded-xl bg-white border border-teal-100 shadow-2xs">
              <span class="text-teal-800 font-extrabold block">Cell 6B:</span>
              <span class="text-slate-600">Active store names at that moment</span>
            </div>
          </div>
          <p class="text-[11px] text-teal-900 mt-1 font-medium">
            <strong>Table Data Columns:</strong> Column B: Store Name • Column C: Product Name • Column E: Product Category • Column G: Default Unit • <strong>Column J: Stock Qty</strong>
          </p>
        </div>

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

        <!-- Validation Errors Display (High contrast, bold, easy to read) -->
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

          <!-- Metadata Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div class="bg-white p-3 rounded-xl border border-emerald-200">
              <span class="text-slate-500 font-bold block text-[11px]">4B: ESB Download Date & Time</span>
              <span class="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                {{ metadata4B || '-' }}
              </span>
            </div>

            <div class="bg-white p-3 rounded-xl border border-emerald-200">
              <span class="text-slate-500 font-bold block text-[11px]">5B: Stock Date</span>
              <span class="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                {{ metadata5B || '-' }}
              </span>
            </div>

            <div class="bg-white p-3 rounded-xl border border-emerald-200">
              <span class="text-slate-500 font-bold block text-[11px]">6B: Active Stores</span>
              <span class="font-semibold text-slate-900 text-xs mt-0.5 block line-clamp-2" :title="metadata6B">
                {{ metadata6B || '-' }}
              </span>
            </div>
          </div>

          <!-- Sample Table Preview -->
          <div class="bg-white rounded-xl border border-emerald-200 overflow-hidden">
            <div class="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span class="font-bold text-slate-700">Sample Parsed Data Preview (First 5 of {{ parsedRows.length }} items):</span>
              <span class="text-slate-500 font-mono text-[11px]">{{ distinctStoresInUpload.length }} Active Stores</span>
            </div>
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-100/70 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                  <th class="py-2 px-3 w-8 text-center">No</th>
                  <th class="py-2 px-3">Store Name (Col B)</th>
                  <th class="py-2 px-3">Product Name (Col C)</th>
                  <th class="py-2 px-3">Category (Col E)</th>
                  <th class="py-2 px-3">Unit (Col G)</th>
                  <th class="py-2 px-3 text-center bg-teal-50 text-teal-900 font-extrabold">Stock Qty (Col J)</th>
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
          <p class="font-bold">{{ uploadStatus.message }}</p>
        </div>
      </div>

      <!-- Tab 2: Upload History & Versions -->
      <div v-else-if="activeTab === 'history'" class="p-6 overflow-y-auto flex-1 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-sm font-black text-slate-900">
              Stock Audit Upload Records & Reversion
            </h4>
            <p class="text-xs text-slate-500 mt-0.5">
              Switch or revert between uploaded ESB stock snapshots, view historical uploads, or remove obsolete files.
            </p>
          </div>
          <button
            @click="fetchHistory"
            type="button"
            class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
          >
            Refresh
          </button>
        </div>

        <!-- Loading -->
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

        <!-- History Table -->
        <div v-else class="border border-slate-200 rounded-2xl overflow-hidden bg-white">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                <th class="py-3 px-3.5">Filename</th>
                <th class="py-3 px-3">Stock Date (5B)</th>
                <th class="py-3 px-3">ESB Downloaded (4B)</th>
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
                    <Check class="w-3 h-3 text-emerald-700" />
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
