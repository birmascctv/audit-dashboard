<script setup>
import { computed, ref, watch } from 'vue';
import { UploadCloud, FileSpreadsheet, X, AlertCircle, CheckCircle2 } from 'lucide-vue-next';
import { parsePurchasingCsv } from '../../purchasingCsv.js';
import { authFetchJson, getAuthToken } from '../services/authFetch.js';

const props = defineProps({ isOpen: { type: Boolean, default: false } });
const emit = defineEmits(['close', 'imported']);
const file = ref(null);
const rows = ref([]);
const errors = ref([]);
const busy = ref(false);
const progress = ref('');
const result = ref(null);
const input = ref(null);
let readId = 0;
const excluded = computed(() => rows.value.filter((row) => row.excluded).length);
const sample = computed(() => rows.value.slice(0, 8));

watch(() => props.isOpen, (open) => {
  if (!open && !busy.value) clear();
});

function chooseFile(event) {
  const selected = event.target?.files?.[0] || event.dataTransfer?.files?.[0];
  if (!selected) return;
  clear();
  if (!selected.name.toLowerCase().endsWith('.csv')) {
    errors.value = ['Only .csv files are supported. Export the purchase-history report as CSV first.'];
    return;
  }
  file.value = selected;
  const currentRead = ++readId;
  const reader = new FileReader();
  reader.onload = () => {
    if (currentRead !== readId) return;
    try { rows.value = parsePurchasingCsv(String(reader.result || '')); }
    catch (error) { errors.value = [error.message || 'Could not parse purchase-history CSV.']; }
  };
  reader.onerror = () => { if (currentRead === readId) errors.value = ['Could not read the selected file.']; };
  reader.readAsText(selected);
}

async function upload() {
  if (!file.value || !rows.value.length || busy.value) return;
  busy.value = true;
  result.value = null;
  const importId = `purch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let inserted = 0, duplicates = 0, rowsImported = false;
  try {
    const batchSize = 1000;
    for (let offset = 0; offset < rows.value.length; offset += batchSize) {
      const batch = rows.value.slice(offset, offset + batchSize);
      progress.value = `Importing purchase history ${offset + 1}–${offset + batch.length} of ${rows.value.length}…`;
      const response = await authFetchJson('/api/purchasing/history/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importId, filename: file.value.name, fileSize: file.value.size, rows: batch }),
      });
      inserted += response.inserted;
      duplicates += response.duplicates;
      rowsImported = true;
    }
    const chunkSize = 1024 * 1024;
    const chunks = Math.ceil(file.value.size / chunkSize);
    for (let index = 0; index < chunks; index++) {
      progress.value = `Archiving original CSV (${index + 1} of ${chunks})…`;
      const response = await fetch(`/api/purchasing/history/${encodeURIComponent(importId)}/archive/${index}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getAuthToken()}`, 'Content-Type': 'application/octet-stream' },
        body: file.value.slice(index * chunkSize, (index + 1) * chunkSize),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Archive upload failed (HTTP ${response.status}).`);
    }
    const completed = await authFetchJson(`/api/purchasing/history/${encodeURIComponent(importId)}/archive/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ byteLength: file.value.size, chunkCount: chunks }),
    });
    if (!completed.success) throw new Error('Original CSV archive could not be finalized.');
    result.value = { success: true, message: `Imported ${inserted.toLocaleString()} new reference rows; skipped ${duplicates.toLocaleString()} duplicates. The original CSV is archived.` };
    emit('imported');
  } catch (error) {
    result.value = {
      success: false,
      message: rowsImported
        ? `Purchase-history rows were saved, but the original CSV was not fully archived: ${error.message}`
        : error.message || 'Purchase-history import failed.',
    };
  } finally {
    busy.value = false;
    progress.value = '';
  }
}

function clear() {
  if (busy.value) return;
  readId++;
  file.value = null;
  rows.value = [];
  errors.value = [];
  result.value = null;
  progress.value = '';
  if (input.value) input.value.value = '';
}

function close() {
  if (busy.value) return;
  clear();
  emit('close');
}
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4" @click.self="close" @keydown.esc="close">
    <section role="dialog" aria-modal="true" aria-label="Upload purchase history CSV" class="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b p-5">
        <div><h2 class="flex items-center gap-2 text-lg font-bold"><FileSpreadsheet class="h-5 w-5 text-teal-700" />Purchase History CSV</h2><p class="mt-1 text-xs text-slate-600">Reference data only: this does not track open orders, receipts, or incoming stock. CSV header must be on row 12.</p></div>
        <button type="button" class="rounded-lg border p-2" :disabled="busy" aria-label="Close upload" @click="close"><X class="h-4 w-4" /></button>
      </header>
      <div class="space-y-4 p-5">
        <label class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center hover:border-teal-600" @dragover.prevent @drop.prevent="chooseFile">
          <UploadCloud class="h-8 w-8 text-teal-700" /><span class="text-sm font-bold">{{ file ? file.name : 'Choose or drop a purchase-history CSV' }}</span>
          <span class="text-xs text-slate-500">{{ file ? `${(file.size / 1024).toFixed(1)} KB` : 'Required fields and units are validated before import.' }}</span>
          <input ref="input" type="file" accept=".csv,text/csv" class="sr-only" :disabled="busy" @change="chooseFile">
        </label>
        <div v-if="errors.length" role="alert" class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p v-for="error in errors" :key="error">{{ error }}</p></div>
        <div v-if="rows.length" class="rounded-xl border p-4">
          <div class="flex flex-wrap justify-between gap-2 text-sm"><strong>Preview: {{ rows.length.toLocaleString() }} rows</strong><span>{{ excluded.toLocaleString() }} rows from excluded categories will be archived but not used in analysis.</span></div>
          <p class="mt-1 text-xs text-slate-500">The `Total`, `Receipt Qty`, `Required Date`, and status fields are reference-only. Purchase date and PO Qty are the historical purchase signals.</p>
          <div class="mt-3 overflow-x-auto"><table class="w-full min-w-[1000px] text-left text-xs"><thead class="bg-slate-50"><tr><th v-for="heading in ['Purchase #','Date','Outlet','Supplier','Product','Category','Unit','PO qty','Equivalent qty','Analysis']" :key="heading" class="p-2">{{ heading }}</th></tr></thead><tbody><tr v-for="row in sample" :key="`${row.source_row}-${row.purchase_number}`" class="border-t"><td class="p-2">{{ row.purchase_number }}</td><td class="p-2">{{ row.purchase_date }}</td><td class="p-2">{{ row.branch }}</td><td class="p-2">{{ row.supplier_name }}</td><td class="p-2">{{ row.product_name }}</td><td class="p-2">{{ row.category }}</td><td class="p-2">{{ row.unit }}</td><td class="p-2">{{ row.po_qty }}</td><td class="p-2">{{ row.equivalent_qty }} {{ row.base_unit }}</td><td class="p-2">{{ row.excluded ? 'Excluded category' : 'Included' }}</td></tr></tbody></table></div>
        </div>
        <p v-if="busy" role="status" class="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">{{ progress }}</p>
        <div v-if="result" class="flex items-start gap-2 rounded-lg p-3 text-sm" :class="result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'">
          <CheckCircle2 v-if="result.success" class="mt-0.5 h-4 w-4 shrink-0" /><AlertCircle v-else class="mt-0.5 h-4 w-4 shrink-0" />{{ result.message }}
        </div>
        <footer class="flex justify-end gap-2 border-t pt-4"><button type="button" class="rounded-lg border px-4 py-2 text-sm font-bold" :disabled="busy" @click="close">Close</button><button type="button" class="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" :disabled="busy || !rows.length || errors.length" @click="upload">Import reference history</button></footer>
      </div>
    </section>
  </div>
</template>
