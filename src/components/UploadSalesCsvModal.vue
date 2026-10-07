<script setup>
import { ref, computed } from 'vue';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Database,
  Building2,
  DollarSign,
  Package,
  Layers,
  Sparkles
} from 'lucide-vue-next';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  stores: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['close', 'imported']);

const file = ref(null);
const fileName = ref('');
const fileSize = ref('');
const rawCsvText = ref('');
const isDragging = ref(false);
const isParsing = ref(false);
const isUploading = ref(false);
const parsedRows = ref([]);
const parseErrors = ref([]);
const uploadStatus = ref(null);

// Format Rupiah
function formatRupiah(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

// Clean and parse numbers (handles "15.000", "Rp 15.000", "15,000.00", etc.)
function parseNumber(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  let str = String(val).trim().replace(/Rp|IDR/gi, '').trim();
  
  if (str.includes('.') && !str.includes(',')) {
    const parts = str.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      str = str.replace(/\./g, '');
    }
  } else if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    if (str.split(',')[1]?.length === 3) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(',', '.');
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Dynamically extract store branch from CSV
function detectStore(storeName) {
  const raw = String(storeName || '').trim();
  if (!raw) return { id: 'branch-default', name: 'Main Branch' };

  const formattedName = raw === raw.toUpperCase() && raw.length > 1
    ? raw.split(' ').map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
    : raw;

  const cleanId = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: cleanId ? `store-${cleanId}` : 'branch-default',
    name: formattedName,
  };
}

// Standardize date strings (DD/MM/YYYY, YYYY-MM-DD, ISO, etc.) into consistent ISO timestamps
function normalizeDateString(raw) {
  if (!raw) return new Date().toISOString();
  const str = String(raw).trim();
  
  // DD/MM/YYYY or DD-MM-YYYY with optional time
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(.*)$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    const timePart = dmyMatch[4].trim() || '00:00:00';
    return `${year}-${month}-${day} ${timePart}`.trim();
  }
  
  return str;
}

// Parse CSV content into rows based on exact key column specifications:
// Sales Date: date of sales
// Sales Date In: date and time of sales
// Branch: store branch
// Visit Purpose: product bought via
// Payment method: payment method
// Menu category: type of product
// Menu Category Detail: product brand
// Menu: product variant
// Qty: amount of product per variant per sale
// Price: price per unit
function parseCSV(text) {
  const allLines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (allLines.length < 2) {
    throw new Error('CSV file contains no data rows or header.');
  }

  // Find header line
  let headerLineIndex = allLines.findIndex((line) => {
    const l = line.toLowerCase();
    return (l.includes('branch') || l.includes('sales date') || l.includes('sales date in') || l.includes('menu category detail')) &&
           (l.includes('menu') || l.includes('qty') || l.includes('price') || l.includes('total') || l.includes('visit purpose'));
  });

  if (headerLineIndex === -1) {
    headerLineIndex = allLines.findIndex((line) => {
      const l = line.toLowerCase();
      return l.includes('branch') || l.includes('sales') || l.includes('menu');
    });
  }

  if (headerLineIndex === -1) {
    headerLineIndex = 0;
  }

  const headerLine = allLines[headerLineIndex];
  let delimiter = ',';
  if ((headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length) {
    delimiter = ';';
  } else if ((headerLine.match(/\t/g) || []).length > (headerLine.match(/,/g) || []).length) {
    delimiter = '\t';
  }

  const splitLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
  };

  const headers = splitLine(headerLine).map((h) => h.toLowerCase().trim().replace(/[\s_.-]+/g, ''));

  // Exact matching for key columns
  const colIndex = {
    salesDate: headers.findIndex((h) => h === 'salesdate'),
    salesDateIn: headers.findIndex((h) => h === 'salesdatein' || h.includes('datein') || h.includes('datetime') || h.includes('waktu')),
    branch: headers.findIndex((h) => h === 'branch' || h.includes('cabang') || h.includes('store') || h.includes('outlet')),
    visitPurpose: headers.findIndex((h) => h === 'visitpurpose' || h.includes('purpose') || h.includes('ordermode') || h.includes('channel')),
    payment: headers.findIndex((h) => h === 'paymentmethod' || h.includes('payment') || h.includes('metodepembayaran') || h.includes('pembayaran')),
    menuCategory: headers.findIndex((h) => h === 'menucategory' || h === 'category' || h.includes('kategori')),
    menuCategoryDetail: headers.findIndex((h) => h === 'menucategorydetail' || h === 'categorydetail' || h === 'brand' || h.includes('merk')),
    menu: headers.findIndex((h) => h === 'menu' || h === 'menuvariant' || h === 'product' || h === 'itemname' || h.includes('varian')),
    qty: headers.findIndex((h) => h === 'qty' || h.includes('quantity') || h.includes('jumlah')),
    price: headers.findIndex((h) => h === 'price' || h.includes('harga') || h.includes('unitprice')),
    subtotal: headers.findIndex((h) => h === 'subtotal'),
    discount: headers.findIndex((h) => h === 'discount' || h.includes('diskon')),
    tax: headers.findIndex((h) => h === 'tax' || h === 'vat' || h.includes('pajak')),
    total: headers.findIndex((h) => h === 'total' || h === 'nettsales' || h.includes('totalbayar')),
    billNo: headers.findIndex((h) => h === 'billnumber' || h === 'billno' || h.includes('faktur') || h.includes('invoice')),
  };

  const parsed = [];
  for (let i = headerLineIndex + 1; i < allLines.length; i++) {
    const rawLine = allLines[i].trim();
    if (!rawLine) continue;
    
    // Ignore footer total rows
    if (rawLine.startsWith(',,,,,') || rawLine.includes('Rounding') || rawLine.includes('Total Rounding') || rawLine.includes('Platform Fee Total')) {
      continue;
    }

    const cols = splitLine(rawLine);
    if (cols.length < 3) continue;

    const rawBranch = colIndex.branch !== -1 ? cols[colIndex.branch] : 'Branch';
    const storeInfo = detectStore(rawBranch);

    const qty = parseNumber(colIndex.qty !== -1 ? cols[colIndex.qty] : 1) || 1;
    const unitPrice = parseNumber(colIndex.price !== -1 ? cols[colIndex.price] : 0);
    const discount = parseNumber(colIndex.discount !== -1 ? cols[colIndex.discount] : 0);
    const tax = parseNumber(colIndex.tax !== -1 ? cols[colIndex.tax] : 0);
    
    let subtotal = parseNumber(colIndex.subtotal !== -1 ? cols[colIndex.subtotal] : 0);
    if (!subtotal) subtotal = qty * unitPrice;

    let total = parseNumber(colIndex.total !== -1 ? cols[colIndex.total] : 0);
    if (!total) total = subtotal - discount + tax;

    const dateVal = (colIndex.salesDateIn !== -1 ? cols[colIndex.salesDateIn] : '') || 
                    (colIndex.salesDate !== -1 ? cols[colIndex.salesDate] : '') || 
                    new Date().toISOString();
    
    const visitPurpose = (colIndex.visitPurpose !== -1 ? cols[colIndex.visitPurpose] : '') || 'DINE IN';
    const payment = (colIndex.payment !== -1 ? cols[colIndex.payment] : '') || 'QRIS BCA';
    const category = (colIndex.menuCategory !== -1 ? cols[colIndex.menuCategory] : '') || 'Beverage';
    const brand = (colIndex.menuCategoryDetail !== -1 ? cols[colIndex.menuCategoryDetail] : '') || '';
    const menuVariant = (colIndex.menu !== -1 ? cols[colIndex.menu] : '') || `Product Variant #${i}`;
    const billNo = (colIndex.billNo !== -1 ? cols[colIndex.billNo] : '') || `ESB-${Date.now()}-${i}`;

    if (!menuVariant && unitPrice === 0 && total === 0) continue;

    parsed.push({
      id: `csv-${i}-${Date.now().toString(36)}`,
      bill_no: billNo,
      date: normalizeDateString(dateVal),
      store_id: storeInfo.id,
      store_name: storeInfo.name,
      item_name: menuVariant,
      variant: menuVariant,
      brand: brand,
      category: category,
      barcode: '',
      qty,
      unit_price: unitPrice,
      discount,
      tax,
      subtotal,
      total,
      payment_method: payment,
      visit_purpose: visitPurpose,
    });
  }

  return parsed;
}

// Handle File Selection
function handleFileSelect(e) {
  const selectedFile = e.target.files?.[0] || e.dataTransfer?.files?.[0];
  if (!selectedFile) return;

  file.value = selectedFile;
  fileName.value = selectedFile.name;
  fileSize.value = (selectedFile.size / 1024).toFixed(1) + ' KB';
  parseErrors.value = [];
  uploadStatus.value = null;
  isParsing.value = true;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const text = event.target?.result || '';
      rawCsvText.value = text;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        parseErrors.value = ['No valid transaction rows found in CSV. Please verify column headers.'];
      } else {
        parsedRows.value = rows;
      }
    } catch (err) {
      parseErrors.value = [err.message || 'Failed to parse CSV file.'];
    } finally {
      isParsing.value = false;
    }
  };
  reader.onerror = () => {
    parseErrors.value = ['Error reading file from disk.'];
    isParsing.value = false;
  };
  reader.readAsText(selectedFile);
}

// Computed stats of parsed CSV
const parsedStats = computed(() => {
  if (parsedRows.value.length === 0) return null;
  const uniqueStores = new Set(parsedRows.value.map((r) => r.store_name));
  const uniqueBrands = new Set(parsedRows.value.map((r) => r.brand).filter(Boolean));
  const totalUnits = parsedRows.value.reduce((acc, r) => acc + (r.qty || 0), 0);
  const totalGross = parsedRows.value.reduce((acc, r) => acc + (r.subtotal || 0), 0);
  const totalNet = parsedRows.value.reduce((acc, r) => acc + (r.total || 0), 0);

  return {
    rowCount: parsedRows.value.length,
    stores: Array.from(uniqueStores),
    brandCount: uniqueBrands.size,
    totalUnits,
    totalGross,
    totalNet,
  };
});

const uploadProgress = ref(0);
const uploadProgressText = ref('');

// Import into Dashboard (Chunked POST to handle 50,000+ rows reliably without network/memory failure)
async function handleImport() {
  if (parsedRows.value.length === 0 || isUploading.value) return;

  isUploading.value = true;
  uploadStatus.value = null;
  uploadProgress.value = 0;
  uploadProgressText.value = 'Preparing import batches...';

  try {
    const totalRows = parsedRows.value.length;
    const CHUNK_SIZE = 4000;
    const totalChunks = Math.ceil(totalRows / CHUNK_SIZE);
    const generatedFileId = `sfile-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Truncate raw CSV archive string if excessively large to protect browser memory
    const safeArchiveContent = rawCsvText.value.length > 2000000 
      ? rawCsvText.value.slice(0, 2000000) + '\n...[Preview truncated for high capacity]' 
      : rawCsvText.value;

    let savedTotal = 0;

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const start = chunkIdx * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalRows);
      const chunkRows = parsedRows.value.slice(start, end);

      uploadProgress.value = Math.round(((chunkIdx) / totalChunks) * 100);
      uploadProgressText.value = `Importing batch ${chunkIdx + 1} of ${totalChunks} (${start + 1} - ${end} of ${totalRows.toLocaleString()} rows)...`;

      const res = await fetch('/api/sales/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileId: generatedFileId,
          filename: fileName.value,
          fileSize: fileSize.value,
          fileContent: chunkIdx === 0 ? safeArchiveContent : '',
          uploadedBy: 'Admin',
          transactions: chunkRows,
          isChunk: true,
          chunkIndex: chunkIdx,
          totalChunks: totalChunks,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || `Failed on batch ${chunkIdx + 1}`);
      }

      savedTotal += chunkRows.length;
    }

    uploadProgress.value = 100;
    uploadProgressText.value = 'Completed!';
    uploadStatus.value = {
      success: true,
      message: `Successfully imported all ${savedTotal.toLocaleString()} sales records! File has been archived.`,
    };

    emit('imported', parsedRows.value);
    setTimeout(() => {
      handleClose();
    }, 1200);
  } catch (err) {
    uploadStatus.value = {
      success: false,
      message: err.message || 'Network error while uploading transactions.',
    };
  } finally {
    isUploading.value = false;
  }
}

function handleClose() {
  file.value = null;
  fileName.value = '';
  fileSize.value = '';
  rawCsvText.value = '';
  parsedRows.value = [];
  parseErrors.value = [];
  uploadStatus.value = null;
  emit('close');
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs transition-all"
    @click.self="handleClose"
  >
    <div class="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      <!-- Modal Header -->
      <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shadow-xs">
            <FileSpreadsheet class="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h3 class="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>Import Sales Recapitulation (CSV)</span>
              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                ESB Compatible
              </span>
            </h3>
            <p class="text-xs text-slate-500">
              Upload daily or monthly ESB Sales Recapitulation Detail CSV to update live metrics and file history.
            </p>
          </div>
        </div>

        <button
          @click="handleClose"
          class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-5 text-sm">
        <!-- Drag & Drop Zone -->
        <div
          v-if="parsedRows.length === 0"
          class="relative border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer"
          :class="isDragging ? 'border-teal-500 bg-teal-50/50 scale-[0.99]' : 'border-slate-300 hover:border-teal-400 bg-slate-50/30'"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="isDragging = false; handleFileSelect($event)"
        >
          <input
            type="file"
            accept=".csv, .tsv, .txt, text/csv, application/vnd.ms-excel"
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            @change="handleFileSelect"
          />

          <div class="flex flex-col items-center justify-center gap-3">
            <div class="w-14 h-14 rounded-2xl bg-teal-100/70 text-teal-700 flex items-center justify-center shadow-inner">
              <UploadCloud class="w-7 h-7 text-teal-700" />
            </div>

            <div>
              <p class="text-sm font-bold text-slate-800">
                Click to browse or drag & drop your Sales CSV file
              </p>
              <p class="text-xs text-slate-500 mt-1">
                Accepts Sales Recapitulation Detail (.csv) with columns: Sales Date, Branch, Visit Purpose, Payment, Menu Category, Menu Category Detail (Brand), Menu, Qty, Price
              </p>
            </div>
          </div>
        </div>

        <!-- Parsing Feedback / Errors -->
        <div v-if="parseErrors.length > 0" class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
          <div class="flex items-center gap-2 font-bold">
            <AlertCircle class="w-4 h-4 text-rose-600" />
            <span>CSV Parsing Failed</span>
          </div>
          <p v-for="(err, idx) in parseErrors" :key="idx" class="pl-6 text-rose-700">
            {{ err }}
          </p>
        </div>

        <!-- Parsed Summary & Preview -->
        <div v-if="parsedStats" class="space-y-4">
          <!-- File info header -->
          <div class="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
            <div class="flex items-center gap-2.5">
              <FileSpreadsheet class="w-5 h-5 text-teal-600" />
              <div>
                <p class="text-xs font-bold text-slate-900">{{ fileName }}</p>
                <p class="text-[11px] text-slate-500">{{ fileSize }} • Ready to import</p>
              </div>
            </div>
            <button
              @click="parsedRows = []; file = null; fileName = ''; rawCsvText = ''; uploadStatus = null;"
              class="text-xs font-bold text-slate-500 hover:text-rose-600 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Choose Another File
            </button>
          </div>

          <!-- KPI Cards for the parsed batch -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="p-3.5 rounded-2xl bg-teal-50/60 border border-teal-200/70">
              <p class="text-[11px] font-bold uppercase tracking-wider text-teal-800">Total Rows</p>
              <p class="text-xl font-extrabold text-teal-950 mt-1">{{ parsedStats.rowCount }}</p>
              <p class="text-[11px] text-teal-700 mt-0.5">{{ parsedStats.brandCount }} Brands detected</p>
            </div>

            <div class="p-3.5 rounded-2xl bg-cyan-50/60 border border-cyan-200/70">
              <p class="text-[11px] font-bold uppercase tracking-wider text-cyan-800">Units Sold</p>
              <p class="text-xl font-extrabold text-cyan-950 mt-1">{{ parsedStats.totalUnits }}</p>
              <p class="text-[11px] text-cyan-700 mt-0.5">Physical units</p>
            </div>

            <div class="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/70">
              <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Net Sales Total</p>
              <p class="text-lg font-extrabold text-emerald-950 mt-1 truncate">
                {{ formatRupiah(parsedStats.totalNet) }}
              </p>
              <p class="text-[11px] text-emerald-700 mt-0.5">Nett revenue</p>
            </div>

            <div class="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200/70">
              <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-800">Stores</p>
              <p class="text-xl font-extrabold text-indigo-950 mt-1">{{ parsedStats.stores.length }}</p>
              <p class="text-[11px] text-indigo-700 mt-0.5 truncate">{{ parsedStats.stores.join(', ') }}</p>
            </div>
          </div>

          <!-- Preview Table (without Bill No and Cashier, with Visit Purpose) -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-slate-700">Preview (First 6 Rows)</span>
              <span class="text-[11px] text-slate-500">Total {{ parsedRows.length }} rows parsed</span>
            </div>

            <div class="border border-slate-200 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th class="py-2.5 px-3">Date & Time</th>
                    <th class="py-2.5 px-3">Branch</th>
                    <th class="py-2.5 px-3">Visit Purpose</th>
                    <th class="py-2.5 px-3">Brand (Detail)</th>
                    <th class="py-2.5 px-3">Product Variant</th>
                    <th class="py-2.5 px-3 text-center">Qty</th>
                    <th class="py-2.5 px-3 text-right">Price</th>
                    <th class="py-2.5 px-3 text-right">Total</th>
                    <th class="py-2.5 px-3">Payment</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr v-for="(row, idx) in parsedRows.slice(0, 6)" :key="idx" class="hover:bg-slate-50/70">
                    <td class="py-2 px-3 text-[11px] text-slate-600 whitespace-nowrap">
                      {{ row.date }}
                    </td>
                    <td class="py-2 px-3">
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                        {{ row.store_name }}
                      </span>
                    </td>
                    <td class="py-2 px-3">
                      <span
                        class="px-2 py-0.5 rounded-full text-[10px] font-bold"
                        :class="row.visit_purpose === 'DINE IN' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-700 border border-amber-200'"
                      >
                        {{ row.visit_purpose }}
                      </span>
                    </td>
                    <td class="py-2 px-3">
                      <span v-if="row.brand" class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                        {{ row.brand }}
                      </span>
                      <span v-else class="text-slate-400 text-[10px]">-</span>
                    </td>
                    <td class="py-2 px-3 text-slate-900 font-medium">
                      <span class="font-bold block truncate max-w-[160px]">{{ row.item_name }}</span>
                      <span v-if="row.category" class="text-slate-400 text-[10px]">{{ row.category }}</span>
                    </td>
                    <td class="py-2 px-3 text-center font-bold text-teal-800">{{ row.qty }}</td>
                    <td class="py-2 px-3 text-right text-slate-600">{{ formatRupiah(row.unit_price) }}</td>
                    <td class="py-2 px-3 text-right font-extrabold text-slate-900">{{ formatRupiah(row.total) }}</td>
                    <td class="py-2 px-3 text-slate-600">
                      <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 max-w-[110px] truncate block">
                        {{ row.payment_method }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Status & Progress Indicator -->
          <div v-if="isUploading" class="space-y-2 p-4 rounded-2xl bg-teal-50 border border-teal-200">
            <div class="flex items-center justify-between text-xs font-bold text-teal-900">
              <span>{{ uploadProgressText }}</span>
              <span>{{ uploadProgress }}%</span>
            </div>
            <div class="w-full h-2.5 bg-teal-200/60 rounded-full overflow-hidden">
              <div
                class="h-full bg-teal-600 transition-all duration-200 rounded-full"
                :style="{ width: `${uploadProgress}%` }"
              ></div>
            </div>
          </div>

          <!-- Status Message -->
          <div
            v-if="uploadStatus"
            class="p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2"
            :class="uploadStatus.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'"
          >
            <CheckCircle2 v-if="uploadStatus.success" class="w-4 h-4 text-emerald-600 shrink-0" />
            <AlertCircle v-else class="w-4 h-4 text-rose-600 shrink-0" />
            <span>{{ uploadStatus.message }}</span>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 gap-2.5">
        <div class="text-[11px] text-slate-500 hidden sm:block">
          ⚡ High capacity engine: supports 50,000+ rows with auto-batch streaming.
        </div>

        <div class="flex items-center gap-2.5">
          <button
            type="button"
            @click="handleClose"
            :disabled="isUploading"
            class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            v-if="parsedRows.length > 0"
            type="button"
            @click="handleImport"
            :disabled="isUploading"
            class="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-md shadow-teal-600/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            <Database class="w-4 h-4" />
            <span>{{ isUploading ? `Importing (${uploadProgress}%)...` : `Import ${parsedRows.length.toLocaleString()} Rows` }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
