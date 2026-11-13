<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';
import 'chart.js/auto';
import { authFetchJson, getAuthToken } from '../services/authFetch.js';
import PurchasingHistoryUpload from '../components/PurchasingHistoryUpload.vue';

const empty = { rows: [], holidays: [], holidayAnalysis: [], upcomingHolidays: [], imports: [], ambiguousMatches: [], settings: {} };
const data = ref({ ...empty });
const loading = ref(true);
const error = ref('');
const message = ref('');
const tab = ref('recommendations');
const storeFilter = ref('all');
const statusFilter = ref('all');
const movementFilter = ref('all');
const page = ref(1);
const selected = ref(null);
const settingsOpen = ref(false);
const settingsDraft = ref({});
const settingsError = ref('');
const busy = ref(false);
const uploadOpen = ref(false);
const selectedHolidayStore = ref('');
const selectedHolidayId = ref('');
const holidayForecastRows = ref([]);
const holidayForecastError = ref('');
const holidayAdjustments = ref({});
const holidayDrafts = ref({});
const holidayAdjustmentError = ref('');
const holidayAdjustmentMessage = ref('');
const holidayNew = ref({ name: '', startDate: '', endDate: '', windowStart: '', windowEnd: '' });
const holidayError = ref('');
const productEdits = ref({});
const supplierEdit = ref({});
const supplierError = ref('');
const productError = ref('');
const purchaseImportError = ref('');
const detailError = ref('');
const detailLoading = ref(false);
let detailRequestId = 0;
let holidayForecastRequestId = 0;
const statuses = ['Critical Stock', 'Low Stock', 'Reorder Required', 'Overstock', 'Sufficient Stock', 'Unknown'];

const stores = computed(() => {
  const map = new Map(data.value.rows.map((row) => [row.storeId, row.store]));
  return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
});
const rows = computed(() => data.value.rows.filter((row) =>
  (storeFilter.value === 'all' || row.storeId === storeFilter.value) &&
  (statusFilter.value === 'all' || row.status === statusFilter.value) &&
  (movementFilter.value === 'all' || row.movement === movementFilter.value)));
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 30)));
const visibleRows = computed(() => rows.value.slice((page.value - 1) * 30, page.value * 30));
const counts = computed(() => ({
  reorder: rows.value.filter((row) => row.recommendation7?.calculatedQty > 0).length,
  critical: rows.value.filter((row) => row.status === 'Critical Stock').length,
  low: rows.value.filter((row) => row.status === 'Low Stock').length,
  overstock: rows.value.filter((row) => row.status === 'Overstock').length,
}));
const holidayAnalysis = computed(() => data.value.holidayAnalysis.filter((row) =>
  storeFilter.value === 'all' || row.storeId === storeFilter.value));
const ambiguousMatches = computed(() => data.value.ambiguousMatches.filter((match) =>
  storeFilter.value === 'all' || match.storeId === storeFilter.value));
const adjustmentHoliday = computed(() => data.value.upcomingHolidays.find((holiday) => String(holiday.id) === String(selectedHolidayId.value)));
const adjustmentOutlet = computed(() => stores.value.find((store) => store.id === selectedHolidayStore.value));
const number = (value, digits = 0) => value == null || !Number.isFinite(Number(value)) ? '—' :
  Number(value).toLocaleString('id-ID', { maximumFractionDigits: digits });
const money = (value) => value == null ? '—' : `Rp ${number(value)}`;
const dayLabel = (days) => days == null ? '—' : `${number(days)} days`;
const dateLabel = (value) => !value ? '—' : value < data.value.today ? `${value} · overdue` : value === data.value.today ? `${value} · today` : value;
const qtyLabel = (row, recommendation) => {
  if (!recommendation) return '—';
  const quantity = recommendation.orderQty;
  const unit = row.purchasingUnit || 'Piece';
  const equivalent = quantity * (row.conversionQty || 1);
  return row.conversionQty > 1
    ? `${number(quantity)} ${unit} (${number(equivalent)} ${row.baseUnit}/${unit})`
    : `${number(quantity)} ${unit}`;
};
const statusClass = (status) => ({
  'Critical Stock': 'bg-red-100 text-red-800',
  'Low Stock': 'bg-amber-100 text-amber-800',
  'Reorder Required': 'bg-orange-100 text-orange-800',
  Overstock: 'bg-blue-100 text-blue-800',
  'Sufficient Stock': 'bg-green-100 text-green-800',
  'Slow Moving': 'bg-violet-100 text-violet-800',
  Unknown: 'bg-slate-100 text-slate-700',
}[status] || 'bg-slate-100 text-slate-700');

watch([storeFilter, statusFilter, movementFilter], () => { page.value = 1; });
watch([selectedHolidayStore, data], () => initializeHolidayAdjustments());
watch([selectedHolidayStore, selectedHolidayId, data, tab], loadHolidayForecast);
watch(selected, (row) => {
  if (!row) return;
  productEdits.value = {
    movement: row.movementOverride || '',
    minStock: row.minStock ?? '',
    leadDays: row.leadOverride ?? '',
  };
  supplierEdit.value = {
    supplierName: row.supplier?.supplierName || '',
    leadDays: row.supplier?.leadDays ?? '',
    moq: row.supplier?.moq ?? '',
    purchasingUnit: row.supplier?.purchasingUnit || row.purchasingUnit || '',
    conversionQty: row.supplier?.conversionQty || row.conversionQty || 1,
    baseUnit: row.supplier?.baseUnit || row.baseUnit || '',
  };
  productError.value = '';
  supplierError.value = '';
});
watch(() => supplierEdit.value.supplierName, (name) => {
  const supplier = selected.value?.suppliers.find((item) => item.supplierName === name);
  if (!supplier) return;
  supplierEdit.value = {
    supplierName: name, leadDays: supplier.leadDays ?? '',
    moq: supplier.moq ?? '', purchasingUnit: supplier.purchasingUnit || '',
    conversionQty: supplier.conversionQty || 1, baseUnit: supplier.baseUnit || '',
  };
});

function initializeHolidayAdjustments() {
  if (!selectedHolidayStore.value && stores.value.length) selectedHolidayStore.value = stores.value[0].id;
  if (!selectedHolidayId.value && data.value.upcomingHolidays.length) selectedHolidayId.value = String(data.value.upcomingHolidays[0].id);
  const next = {};
  for (const holiday of data.value.upcomingHolidays) {
    const adjustment = holiday.adjustments?.find((item) => item.storeId === selectedHolidayStore.value);
    next[holiday.id] = {
      adjustmentPct: adjustment?.adjustmentPct ?? '',
      combinedGroup: adjustment?.combinedGroup || '',
    };
  }
  holidayAdjustments.value = next;
  const edits = {};
  for (const holiday of data.value.holidays) edits[holiday.id] = {
    name: holiday.name, startDate: holiday.start_date, endDate: holiday.end_date,
    windowStart: holiday.window_start, windowEnd: holiday.window_end,
  };
  holidayDrafts.value = edits;
}

async function loadPurchasing() {
  const selectedKey = selected.value ? { storeId: selected.value.storeId, productId: selected.value.productId } : null;
  const result = await authFetchJson('/api/purchasing');
  if (!['rows', 'holidays', 'holidayAnalysis', 'upcomingHolidays', 'imports', 'ambiguousMatches']
    .every((key) => Array.isArray(result[key])) || !result.settings ||
    result.rows.some((row) => !Array.isArray(row.suppliers) || !Array.isArray(row.holidayEvents))) {
    throw new Error('Purchasing server data is incompatible with this page. The server needs to be updated and restarted.');
  }
  data.value = result;
  settingsDraft.value = { ...result.settings };
  if (selectedKey) {
    const summary = data.value.rows.find((row) => row.storeId === selectedKey.storeId && row.productId === selectedKey.productId) || null;
    selected.value = summary;
    if (summary) await loadProductDetails(summary);
  }
  initializeHolidayAdjustments();
}

async function loadProductDetails(row) {
  const requestId = ++detailRequestId;
  detailError.value = '';
  detailLoading.value = true;
  try {
    const result = await authFetchJson(`/api/purchasing/product-details?storeId=${encodeURIComponent(row.storeId)}&productId=${encodeURIComponent(row.productId)}`);
    if (requestId === detailRequestId && selected.value?.storeId === row.storeId && selected.value?.productId === row.productId) {
      selected.value = result.row;
    }
  } catch (err) {
    if (requestId === detailRequestId) detailError.value = err.message || 'Product details could not be loaded.';
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false;
  }
}

function openDetails(row) {
  selected.value = row;
  loadProductDetails(row);
}

async function loadHolidayForecast() {
  const requestId = ++holidayForecastRequestId;
  const storeId = selectedHolidayStore.value;
  const holidayId = selectedHolidayId.value;
  holidayForecastError.value = '';
  holidayForecastRows.value = [];
  if (tab.value !== 'settings' || !storeId || !holidayId) return;
  try {
    const result = await authFetchJson(`/api/purchasing/holiday-forecast?storeId=${encodeURIComponent(storeId)}&holidayId=${encodeURIComponent(holidayId)}`);
    if (requestId === holidayForecastRequestId) holidayForecastRows.value = result.rows;
  } catch (err) {
    if (requestId === holidayForecastRequestId) holidayForecastError.value = err.message || 'Holiday forecasts could not be loaded.';
  }
}

async function refresh() {
  error.value = '';
  try { await loadPurchasing(); }
  catch (err) { error.value = err.message || 'Purchasing data could not be loaded.'; }
}

async function saveManualQuantity(row, coverageDays, event) {
  const recommendation = coverageDays === 7 ? row.recommendation7 : row.recommendation10;
  if (!recommendation || event.target.value === '') return;
  message.value = '';
  try {
    await authFetchJson('/api/purchasing/order-quantity', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: row.storeId, productId: row.productId, reviewDate: row.reviewDate,
        supplierName: row.selectedSupplier || '', coverageDays, quantity: Number(event.target.value),
      }),
    });
    await loadPurchasing();
    message.value = 'Manual order quantity saved. The system calculation remains visible for comparison.';
  } catch (err) { error.value = err.message; }
}

async function saveProductEdits() {
  if (!selected.value) return;
  try {
    await authFetchJson('/api/purchasing/product-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: selected.value.storeId, productId: selected.value.productId,
        minStock: productEdits.value.minStock === '' ? null : Number(productEdits.value.minStock),
        leadDays: productEdits.value.leadDays === '' ? null : Number(productEdits.value.leadDays),
        movement: productEdits.value.movement || null,
        supplier: selected.value.selectedSupplier || null,
      }),
    });
    await loadPurchasing();
  } catch (err) { productError.value = err.message; }
}

async function selectSupplier(row, supplierName) {
  const supplier = row.suppliers.find((item) => item.supplierName === supplierName);
  if (!supplier) return;
  try {
    await authFetchJson('/api/purchasing/supplier', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: row.storeId, productId: row.productId, supplierName,
        leadDays: supplier.leadDays, moq: supplier.moq,
        purchasingUnit: supplier.purchasingUnit, conversionQty: supplier.conversionQty,
        baseUnit: supplier.baseUnit, selected: true,
      }),
    });
    await loadPurchasing();
  } catch (err) { error.value = err.message; }
}

async function saveSupplier() {
  if (!selected.value) return;
  try {
    await authFetchJson('/api/purchasing/supplier', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: selected.value.storeId, productId: selected.value.productId,
        supplierName: supplierEdit.value.supplierName,
        leadDays: supplierEdit.value.leadDays === '' ? null : Number(supplierEdit.value.leadDays),
        moq: supplierEdit.value.moq === '' ? null : Number(supplierEdit.value.moq),
        purchasingUnit: supplierEdit.value.purchasingUnit,
        conversionQty: Number(supplierEdit.value.conversionQty),
        baseUnit: supplierEdit.value.baseUnit,
        selected: true,
      }),
    });
    await authFetchJson('/api/purchasing/product-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: selected.value.storeId, productId: selected.value.productId,
        minStock: productEdits.value.minStock === '' ? null : Number(productEdits.value.minStock),
        leadDays: productEdits.value.leadDays === '' ? null : Number(productEdits.value.leadDays),
        movement: productEdits.value.movement || null, supplier: supplierEdit.value.supplierName,
      }),
    });
    await loadPurchasing();
  } catch (err) { supplierError.value = err.message; }
}

async function saveSettings() {
  busy.value = true;
  settingsError.value = '';
  try {
    await authFetchJson('/api/purchasing/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsDraft.value),
    });
    await loadPurchasing();
    message.value = 'Purchasing settings saved.';
  } catch (err) { settingsError.value = err.message; }
  finally { busy.value = false; }
}

async function saveHoliday(holiday) {
  holidayError.value = '';
  const draft = holidayDrafts.value[holiday.id];
  try {
    await authFetchJson(`/api/purchasing/holidays/${holiday.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    });
    await loadPurchasing();
    holidayError.value = '';
  } catch (err) { holidayError.value = err.message; }
}

async function addHoliday() {
  holidayError.value = '';
  try {
    await authFetchJson('/api/purchasing/holidays', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(holidayNew.value),
    });
    holidayNew.value = { name: '', startDate: '', endDate: '', windowStart: '', windowEnd: '' };
    await loadPurchasing();
  } catch (err) { holidayError.value = err.message; }
}

async function removeHoliday(holiday) {
  if (!window.confirm(`Delete ${holiday.name}?`)) return;
  try {
    await authFetchJson(`/api/purchasing/holidays/${holiday.id}`, { method: 'DELETE' });
    await loadPurchasing();
  } catch (err) { holidayError.value = err.message; }
}

async function saveAdjustment(holiday) {
  holidayAdjustmentError.value = '';
  holidayAdjustmentMessage.value = '';
  const draft = holidayAdjustments.value[holiday.id] || {};
  try {
    await authFetchJson('/api/purchasing/holiday-adjustment', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        holidayId: holiday.id, storeId: selectedHolidayStore.value,
        adjustmentPct: draft.adjustmentPct === '' ? 0 : Number(draft.adjustmentPct),
        combinedGroup: draft.combinedGroup || '',
      }),
    });
    await loadPurchasing();
    holidayAdjustmentMessage.value = 'Holiday forecast adjustment saved. It affects demand, not the order quantity directly.';
  } catch (err) { holidayAdjustmentError.value = err.message; }
}

async function downloadOriginal(file) {
  try {
    const response = await fetch(`/api/purchasing/history/${encodeURIComponent(file.id)}/original`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
    });
    if (!response.ok) throw new Error(`Original file download failed (HTTP ${response.status}).`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = file.filename; link.click();
    URL.revokeObjectURL(url);
  } catch (err) { purchaseImportError.value = err.message; }
}

function exportCsv() {
  const headings = ['Product Name', 'Product Variant', 'Outlet', 'Movement', 'Current Stock', 'Minimum Stock', 'Monday Stock', 'Average Weekly Sales', 'Average Daily Sales', 'Days Left', 'Expected Stockout Date', 'Recommended Reorder Date', 'Supplier', 'Lead Time', 'Order Up to', 'Recommended Qty 7 days', 'Recommended Qty 10 days', 'MOQ', 'Purchasing Unit', 'Holiday Adjustment', 'Status'];
  const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = rows.value.map((row) => [
    row.productName, row.productVariant, row.store, row.movement, row.currentStock, row.minStock, row.reviewStock,
    row.avgWeekly, row.avgDaily, row.daysLeft, row.expectedStockoutDate, row.recommendedReorderDate,
    row.selectedSupplier, row.leadDays,
    row.recommendation7?.orderUpTo, qtyLabel(row, row.recommendation7), qtyLabel(row, row.recommendation10),
    row.supplier?.moq, row.purchasingUnit,
    row.holidayEvents.map((holiday) => `${holiday.name}: ${holiday.adjustmentPct}%`).join('; '), row.status,
  ].map(quote).join(','));
  const blob = new Blob(['\ufeffsep=,\r\n', headings.map(quote).join(','), '\r\n', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'purchasing-recommendations.csv'; link.click();
  URL.revokeObjectURL(url);
}

const detailChart = computed(() => {
  if (!selected.value?.forecast || !selected.value?.history) return { labels: [], datasets: [] };
  const row = selected.value;
  const future = row.forecast.slice(0, 14);
  let stock = Number(row.reviewStock);
  const projected = future.map((day) => {
    if (!Number.isFinite(stock) || day.qty == null) return null;
    const beforeDemand = stock;
    stock = Math.max(0, stock - day.qty);
    return beforeDemand;
  });
  return {
    labels: [...row.history.map((item) => item.date), ...future.map((item) => item.date)],
    datasets: [
      { label: 'Actual daily sales', data: [...row.history.map((item) => item.qty), ...future.map(() => null)], borderColor: '#0f766e', yAxisID: 'sales', pointRadius: 1, tension: 0.15, spanGaps: false },
      { label: 'Forecast sales', data: [...row.history.map(() => null), ...future.map((item) => item.qty)], borderColor: '#ea580c', yAxisID: 'sales', borderDash: [6, 4], pointRadius: 0 },
      { label: 'Observed stock', data: [...row.history.map((item) => item.stock), ...future.map(() => null)], borderColor: '#2563eb', yAxisID: 'stock', pointRadius: 2, spanGaps: false },
      { label: 'Projected stock', data: [...row.history.map(() => null), ...projected], borderColor: '#2563eb', yAxisID: 'stock', borderDash: [6, 4], pointRadius: 0 },
    ],
  };
});

onMounted(async () => {
  await refresh();
  loading.value = false;
});
</script>

<template>
  <div class="space-y-5">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="text-2xl font-extrabold text-slate-900">Purchasing</h1><p class="mt-1 text-sm text-slate-600">Weekly outlet and product-variant reorder recommendations · PO creation and tracking are out of scope.</p></div>
      <button class="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white" @click="uploadOpen = true">Upload purchase history CSV</button>
    </header>

    <p v-if="loading" class="rounded-xl bg-white p-5">Loading Purchasing data…</p>
    <p v-else-if="error" role="alert" class="rounded-xl bg-red-50 p-4 text-red-800">{{ error }}</p>
    <template v-else>
      <div class="flex flex-wrap gap-2 border-b border-slate-200">
        <button v-for="item in [{id:'recommendations',label:'Reorder Recommendations'},{id:'holiday-analysis',label:'Holiday Sales Analysis'},{id:'settings',label:'Settings & Holidays'},{id:'history',label:'Purchase History'}]" :key="item.id" class="border-b-2 px-3 py-2 text-sm font-bold" :class="tab === item.id ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500'" @click="tab = item.id">{{ item.label }}</button>
      </div>
      <p v-if="message" role="status" class="rounded-lg bg-green-50 p-3 text-sm text-green-800">{{ message }}</p>
      <p v-if="data.snapshotSync?.status === 'failed'" role="alert" class="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">Latest stock sync failed ({{ data.snapshotSync.businessDate }}): {{ data.snapshotSync.error }}</p>
      <p v-else-if="data.snapshotSync?.status === 'no_data'" role="alert" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Latest inventory sync returned no stock data ({{ data.snapshotSync.businessDate }}): {{ data.snapshotSync.error }}</p>
      <p v-if="data.weeklyReview" class="text-xs text-slate-500">Scheduled Monday review: {{ data.weeklyReview.reviewDate }} · {{ data.weeklyReview.status }}<span v-if="data.weeklyReview.error"> · {{ data.weeklyReview.error }}</span></p>
      <p v-if="data.reviewIsStale" role="alert" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No stock snapshot from Monday within the last 7 days. Order recommendations are withheld until fresh Monday inventory is available.</p>

      <template v-if="tab === 'recommendations'">
        <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <article class="rounded-xl bg-red-100 p-4 text-red-800"><p class="text-sm font-bold">Critical stock</p><p class="mt-1 text-3xl font-extrabold">{{ counts.critical }}</p></article>
          <article class="rounded-xl bg-amber-100 p-4 text-amber-800"><p class="text-sm font-bold">Low stock</p><p class="mt-1 text-3xl font-extrabold">{{ counts.low }}</p></article>
          <article class="rounded-xl bg-orange-100 p-4 text-orange-800"><p class="text-sm font-bold">Reorder required</p><p class="mt-1 text-3xl font-extrabold">{{ counts.reorder }}</p></article>
          <article class="rounded-xl bg-blue-100 p-4 text-blue-800"><p class="text-sm font-bold">Overstock</p><p class="mt-1 text-3xl font-extrabold">{{ counts.overstock }}</p></article>
        </section>
        <section class="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
          <label class="text-xs font-bold">Outlet<select v-model="storeFilter" class="mt-1 block rounded-lg border p-2"><option value="all">All outlets</option><option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option></select></label>
          <label class="text-xs font-bold">Status<select v-model="statusFilter" class="mt-1 block rounded-lg border p-2"><option value="all">All statuses</option><option v-for="status in statuses" :key="status">{{ status }}</option></select></label>
          <label class="text-xs font-bold">Movement<select v-model="movementFilter" class="mt-1 block rounded-lg border p-2"><option value="all">Fast & slow</option><option>Fast Moving</option><option>Slow Moving</option><option>Unknown</option></select></label>
          <p class="ml-auto text-xs text-slate-500">Monday reference: {{ data.reviewDate || 'missing' }} · Calculation: last {{ data.settings.historyWeeks }} weeks · 1-day buffer for Tuesday PO creation</p>
        </section>
        <section class="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 class="font-bold text-amber-900">Ambiguous sales-to-stock matches ({{ ambiguousMatches.length }})</h2>
          <p class="mt-1 text-xs text-amber-900">These sales names match more than one stock product in the same outlet during the history window. Orders are withheld for the affected products; correct the product names or SKUs in the source data so each sales name identifies one product.</p>
          <p v-if="!ambiguousMatches.length" class="mt-2 text-xs text-amber-900">No ambiguous matches found for the selected outlet.</p>
          <div v-else class="mt-3 overflow-x-auto"><table class="w-full text-left text-xs"><thead><tr><th class="p-2">Outlet</th><th class="p-2">Sales name</th><th class="p-2">Matching stock products</th></tr></thead><tbody>
            <tr v-for="match in ambiguousMatches" :key="`${match.storeId}-${match.salesName}`" class="border-t border-amber-200"><td class="p-2">{{ match.store }}</td><td class="p-2">{{ match.salesName }}</td><td class="p-2"><div v-for="product in match.products" :key="product.productId">{{ product.name || 'Unnamed' }} · {{ product.variant || 'No variant' }} · SKU: {{ product.sku || 'not supplied' }} · ID: {{ product.productId }}</div></td></tr>
          </tbody></table></div>
        </section>
        <section class="overflow-hidden rounded-xl border bg-white shadow-sm">
          <header class="flex flex-wrap items-center justify-between gap-2 border-b p-4"><div><h2 class="font-bold">Reorder recommendations</h2><p class="text-xs text-slate-500">Demand uses weekday averages; Friday–Sunday patterns are calculated separately. Order quantities are supplier purchasing units.</p></div><button class="rounded-lg border px-3 py-2 text-xs font-bold" @click="exportCsv">Export CSV</button></header>
          <p class="px-4 pt-3 text-xs text-slate-600">System order-up-to = forecast demand during lead time + Tuesday buffer + selected coverage. It is not a PO. The final quantity rounds to whole purchasing units and applies configured MOQ.</p>
          <p class="px-4 py-2 text-xs text-amber-800">Monday stock is the calculation reference; current ESB stock is shown separately. No incoming quantities or active orders are included. Holiday-analysis history is not automatically applied to future demand.</p>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[1800px] text-left text-xs">
              <thead class="bg-slate-50 text-[10px] uppercase text-slate-600"><tr>
                <th v-for="heading in ['Product name / variant','Outlet','Movement','Current stock','Minimum stock','Monday stock','Avg/week','Avg/day','Days left','Expected run out','Order by','Supplier','Lead time','Order up to','Qty 7 days','Qty 10 days','MOQ / unit','Holiday adjustment','Status']" :key="heading" class="p-3">{{ heading }}</th>
              </tr></thead>
              <tbody>
                <tr v-for="row in visibleRows" :key="`${row.storeId}-${row.productId}`" class="cursor-pointer border-t hover:bg-teal-50" tabindex="0" @click="openDetails(row)" @keydown.enter="openDetails(row)" @keydown.space.prevent="openDetails(row)">
                  <td class="p-3 font-semibold">{{ row.productName }}<span class="block text-[10px] font-normal text-slate-500">{{ row.productVariant || row.sku || 'Variant not supplied' }}</span><span v-if="row.reason" class="block max-w-56 whitespace-normal text-[10px] font-normal text-slate-500">{{ row.reason }}</span><span v-else-if="row.lowData" class="block text-[10px] font-normal text-amber-700">Low data · {{ row.usableDays }} usable days</span></td>
                  <td class="p-3">{{ row.store }}</td>
                  <td class="p-3"><span :class="row.movement === 'Fast Moving' ? 'text-teal-800' : row.movement === 'Slow Moving' ? 'text-violet-800' : 'text-slate-500'">{{ row.movement }}</span><span v-if="row.movementManual" class="block text-[10px] text-slate-500">Manual</span></td>
                  <td class="p-3">{{ number(row.currentStock) }}</td><td class="p-3">{{ row.minStock == null ? '—' : number(row.minStock) }}<span v-if="row.belowMinStock" class="block text-[10px] font-bold text-red-700">Below minimum</span></td><td class="p-3">{{ number(row.reviewStock) }}<span class="block text-[10px] text-slate-500">{{ row.stockReferenceDate }}</span></td>
                  <td class="p-3">{{ number(row.avgWeekly) }}</td><td class="p-3">{{ number(row.avgDaily) }}</td><td class="p-3">{{ dayLabel(row.daysLeft) }}</td>
                  <td class="p-3">{{ dateLabel(row.expectedStockoutDate) }}</td><td class="p-3" :class="row.recommendedReorderDate && row.recommendedReorderDate <= data.today ? 'font-bold text-red-700' : ''">{{ dateLabel(row.recommendedReorderDate) }}</td>
                  <td class="p-3"><select class="max-w-40 rounded border bg-white p-1" :value="row.selectedSupplier" @click.stop @change="selectSupplier(row, $event.target.value)"><option value="">Select supplier</option><option v-for="supplier in row.suppliers" :key="supplier.supplierName" :value="supplier.supplierName">{{ supplier.supplierName }}{{ supplier.configured ? '' : ' · history' }}</option></select><span v-if="!row.suppliers.length" class="text-slate-500">No history</span></td>
                  <td class="p-3">{{ row.leadDays }} days</td><td class="p-3">{{ number(row.recommendation7?.orderUpTo) }} {{ row.baseUnit }}</td>
                  <td class="p-3" @click.stop><span v-if="row.recommendation7"><input type="number" min="0" step="1" class="w-16 rounded border p-1 font-bold" :value="row.recommendation7.orderQty" :aria-label="`Manual 7-day order quantity for ${row.productName}`" @change="saveManualQuantity(row,7,$event)"><span class="ml-1">{{ row.purchasingUnit }}</span><span class="block text-[10px] text-slate-500">System {{ number(row.recommendation7.calculatedQty) }} · {{ number(row.recommendation7.equivalentQty) }} {{ row.baseUnit }}</span></span><span v-else>—</span></td>
                  <td class="p-3" @click.stop><span v-if="row.recommendation10"><input type="number" min="0" step="1" class="w-16 rounded border p-1 font-bold" :value="row.recommendation10.orderQty" :aria-label="`Manual 10-day order quantity for ${row.productName}`" @change="saveManualQuantity(row,10,$event)"><span class="ml-1">{{ row.purchasingUnit }}</span><span class="block text-[10px] text-slate-500">System {{ number(row.recommendation10.calculatedQty) }} · {{ number(row.recommendation10.equivalentQty) }} {{ row.baseUnit }}</span></span><span v-else>—</span></td>
                  <td class="p-3">{{ row.supplier?.moq == null ? 'Not set' : `${number(row.supplier.moq)} ${row.purchasingUnit}` }}<span class="block text-[10px]">{{ row.conversionQty > 1 ? `${number(row.conversionQty)} ${row.baseUnit}/${row.purchasingUnit}` : row.purchasingUnit }}</span></td>
                  <td class="max-w-44 whitespace-normal p-3">{{ row.holidayEvents.length ? row.holidayEvents.map(h => `${h.name} ${h.adjustmentPct > 0 ? '+' : ''}${number(h.adjustmentPct)}%`).join(', ') : '—' }}<span v-if="row.holidayConflict" class="block text-[10px] text-red-700">Resolve overlapping adjustment</span></td>
                  <td class="p-3"><span class="whitespace-nowrap rounded-full px-2 py-1 font-bold" :class="statusClass(row.status)">{{ row.status }}</span></td>
                </tr>
                <tr v-if="!visibleRows.length"><td colspan="19" class="p-8 text-center text-slate-500">No products match these filters.</td></tr>
              </tbody>
            </table>
          </div>
          <footer class="flex items-center justify-between border-t p-3 text-xs"><span>{{ rows.length }} outlet/product variants · Page {{ page }} of {{ pages }}</span><div class="space-x-2"><button class="rounded border px-3 py-1 disabled:opacity-40" :disabled="page <= 1" @click="page--">Previous</button><button class="rounded border px-3 py-1 disabled:opacity-40" :disabled="page >= pages" @click="page++">Next</button></div></footer>
        </section>
      </template>

      <template v-else-if="tab === 'holiday-analysis'">
        <section class="rounded-xl border bg-white p-4">
          <h2 class="font-bold">Holiday sales analysis</h2><p class="mt-1 text-xs text-slate-600">Historical windows and baselines are separate from future forecast adjustments. Individual holiday totals may overlap; combined entries count each sales date once.</p>
          <div class="mt-4 overflow-x-auto"><table class="w-full min-w-[1100px] text-left text-xs"><thead class="bg-slate-50"><tr><th v-for="heading in ['Holiday','Outlet','Holiday dates','Sales window','Total sales','Class','Normal baseline','Difference']" :key="heading" class="p-3">{{ heading }}</th></tr></thead><tbody>
            <tr v-for="item in holidayAnalysis" :key="item.id" class="border-t"><td class="p-3 font-semibold">{{ item.name }}<span v-if="item.combined" class="ml-1 rounded bg-violet-100 px-1 text-violet-800">Combined</span></td><td class="p-3">{{ stores.find(s => s.id === item.storeId)?.name || item.storeId }}</td><td class="p-3">{{ item.startDate }}{{ item.endDate !== item.startDate ? ` – ${item.endDate}` : '' }}</td><td class="p-3">{{ item.windowStart }} – {{ item.windowEnd }}</td><td class="p-3">{{ money(item.totalSales) }}</td><td class="p-3">{{ item.classification }}</td><td class="p-3">{{ money(item.normalBaseline) }}</td><td class="p-3">{{ item.differencePct == null ? 'Unavailable' : `${number(item.differencePct,1)}%` }}</td></tr>
            <tr v-if="!holidayAnalysis.length"><td colspan="8" class="p-8 text-center text-slate-500">No holiday sales in the selected outlet scope.</td></tr>
          </tbody></table></div>
        </section>
      </template>

      <template v-else-if="tab === 'settings'">
        <section class="rounded-xl border bg-white p-4">
          <h2 class="font-bold">Forecast settings</h2><p class="mt-1 text-xs text-slate-600">Average sales uses the last 8 weeks by default, excludes configured holiday windows and observed zero-stock dates, and forecasts weekdays separately. Fast/slow classification uses average weekly sales; individual classifications can override it.</p>
          <form class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" @submit.prevent="saveSettings">
            <label class="text-xs font-semibold">Sales history (weeks)<input v-model.number="settingsDraft.historyWeeks" type="number" min="1" max="52" step="1" class="mt-1 block w-full rounded border p-2"></label>
            <label class="text-xs font-semibold">Fast-moving cutoff (units/week)<input v-model.number="settingsDraft.fastMovingThreshold" type="number" min="0" max="100000" step="1" class="mt-1 block w-full rounded border p-2"></label>
            <label class="text-xs font-semibold">Default supplier lead time (days)<input v-model.number="settingsDraft.defaultLeadDays" type="number" min="1" max="365" step="1" class="mt-1 block w-full rounded border p-2"></label>
            <label class="text-xs font-semibold">Overstock threshold (days)<input v-model.number="settingsDraft.overstockDays" type="number" min="1" max="365" step="1" class="mt-1 block w-full rounded border p-2"></label>
            <p v-if="settingsError" class="text-xs text-red-700 sm:col-span-2 lg:col-span-4">{{ settingsError }}</p>
            <button :disabled="busy" class="w-fit rounded bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save forecast settings</button>
          </form>
        </section>
        <section class="rounded-xl border bg-white p-4">
          <header class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-bold">Holiday calendar and forecast adjustment</h2><p class="mt-1 text-xs text-slate-600">Initial holiday dates are supplied through 2027. Correct dates and sales windows as needed; future years can be added.</p></div>
            <label class="text-xs font-bold">Outlet for adjustments<select v-model="selectedHolidayStore" class="ml-2 rounded border p-2"><option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option></select></label>
          </header>
          <div class="mt-4 overflow-x-auto"><table class="w-full min-w-[1120px] text-left text-xs"><thead class="bg-slate-50"><tr><th v-for="heading in ['Occasion','Holiday start','Holiday end','Sales window start','Sales window end','Expected adjustment %','Combined group','Action']" :key="heading" class="p-2">{{ heading }}</th></tr></thead><tbody>
            <tr v-for="holiday in data.upcomingHolidays" :key="holiday.id" class="border-t">
              <td class="p-2 font-semibold">{{ holiday.name }}</td>
              <td class="p-2">{{ holiday.start_date }}</td><td class="p-2">{{ holiday.end_date }}</td><td class="p-2">{{ holiday.window_start }}</td><td class="p-2">{{ holiday.window_end }}</td>
              <td class="p-2"><input v-model="holidayAdjustments[holiday.id].adjustmentPct" type="number" min="-100" max="500" step="any" class="w-28 rounded border p-1" :aria-label="`Expected demand adjustment for ${holiday.name}`"></td>
              <td class="p-2"><input v-model.trim="holidayAdjustments[holiday.id].combinedGroup" type="text" maxlength="120" placeholder="Optional; same group to combine" class="w-44 rounded border p-1"></td>
              <td class="p-2"><button class="rounded bg-teal-700 px-2 py-1 font-bold text-white" @click="saveAdjustment(holiday)">Save adjustment</button></td>
            </tr>
            <tr v-if="!data.upcomingHolidays.length"><td colspan="8" class="p-5 text-center text-slate-500">Add a holiday calendar record below to configure future adjustments.</td></tr>
          </tbody></table></div>
          <p v-if="holidayAdjustmentError" role="alert" class="mt-3 text-sm text-red-700">{{ holidayAdjustmentError }}</p><p v-if="holidayAdjustmentMessage" role="status" class="mt-3 text-sm text-green-700">{{ holidayAdjustmentMessage }}</p><p v-if="holidayForecastError" role="alert" class="mt-3 text-sm text-red-700">{{ holidayForecastError }}</p>
          <div v-if="adjustmentHoliday" class="mt-5 border-t pt-4"><h3 class="font-bold">Forecast impact: {{ adjustmentHoliday.name }} · {{ adjustmentOutlet?.name }}</h3><p class="mt-1 text-xs text-slate-600">Historical holiday sales are shown only as reference. Future percentages must be entered manually and apply to forecast demand, not directly to order quantity.</p>
            <p class="mt-2 text-xs text-slate-500">The projected maximum assumes the displayed 7-day recommendation is placed and arrives; it is not an active purchase order or confirmed incoming stock.</p>
            <p class="mt-2 text-xs text-slate-500">The forecast below reflects the last saved adjustment. Save a changed percentage above to recalculate demand and recommendations.</p>
            <div class="mt-3 max-h-[28rem] overflow-auto"><table class="w-full min-w-[900px] text-left text-xs"><thead class="sticky top-0 bg-slate-50"><tr><th v-for="heading in ['Product','Historical sales reference','Saved expected %','Normal forecast','Adjusted forecast','Max stock after order arrival','Order qty 7d']" :key="heading" class="p-2">{{ heading }}</th></tr></thead><tbody><tr v-for="row in holidayForecastRows" :key="row.productId" class="border-t"><td class="p-2">{{ row.productName }} · {{ row.productVariant || '—' }}</td><td class="p-2">{{ row.historyReference ? `${money(row.historyReference.totalSales)} (${row.historyReference.classification})` : 'No comparable holiday reference' }}</td><td class="p-2">{{ row.savedAdjustmentPct == null ? 'Not set' : `${number(row.savedAdjustmentPct)}%` }}</td><td class="p-2">{{ row.forecastAvailable ? `${number(row.normalDemand)} ${row.baseUnit}/holiday` : 'Outside forecast horizon' }}</td><td class="p-2">{{ row.forecastAvailable ? `${number(row.adjustedDemand)} ${row.baseUnit}/holiday` : 'Outside forecast horizon' }}</td><td class="p-2">{{ number(row.maximumProjectedStock7) }} {{ row.baseUnit }}</td><td class="p-2">{{ qtyLabel(row,row.recommendation7) }}</td></tr></tbody></table></div>
          </div>
        </section>
        <section class="rounded-xl border bg-white p-4">
          <h2 class="font-bold">Edit calendar dates and sales windows</h2><p class="mt-1 text-xs text-slate-600">Default sales windows follow the supplied weekday rules and are editable per event. Overlapping windows are also reported as a combined period.</p>
          <form class="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-3 lg:grid-cols-6" @submit.prevent="addHoliday">
            <label class="text-xs">Occasion<input v-model.trim="holidayNew.name" required maxlength="120" class="mt-1 w-full rounded border p-2"></label>
            <label class="text-xs">Start date<input v-model="holidayNew.startDate" type="date" required class="mt-1 w-full rounded border p-2"></label>
            <label class="text-xs">End date<input v-model="holidayNew.endDate" type="date" required class="mt-1 w-full rounded border p-2"></label>
            <label class="text-xs">Window start (optional)<input v-model="holidayNew.windowStart" type="date" class="mt-1 w-full rounded border p-2"></label>
            <label class="text-xs">Window end (optional)<input v-model="holidayNew.windowEnd" type="date" class="mt-1 w-full rounded border p-2"></label>
            <button class="self-end rounded bg-teal-700 px-3 py-2 text-xs font-bold text-white">Add holiday</button>
          </form>
          <p v-if="holidayError" role="alert" class="mt-2 text-sm text-red-700">{{ holidayError }}</p>
          <div class="mt-4 max-h-[32rem] overflow-auto"><table class="w-full min-w-[1000px] text-left text-xs"><thead class="sticky top-0 bg-slate-50"><tr><th v-for="heading in ['Occasion','Start','End','Window start','Window end','Save']" :key="heading" class="p-2">{{ heading }}</th></tr></thead><tbody>
            <tr v-for="holiday in data.holidays" :key="holiday.id" class="border-t"><td class="p-2"><input v-model.trim="holidayDrafts[holiday.id].name" class="w-48 rounded border p-1"></td><td class="p-2"><input v-model="holidayDrafts[holiday.id].startDate" type="date" class="rounded border p-1"></td><td class="p-2"><input v-model="holidayDrafts[holiday.id].endDate" type="date" class="rounded border p-1"></td><td class="p-2"><input v-model="holidayDrafts[holiday.id].windowStart" type="date" class="rounded border p-1"></td><td class="p-2"><input v-model="holidayDrafts[holiday.id].windowEnd" type="date" class="rounded border p-1"></td><td class="whitespace-nowrap p-2"><button class="rounded bg-teal-700 px-2 py-1 font-bold text-white" @click="saveHoliday(holiday)">Save</button><button class="ml-1 rounded border px-2 py-1 text-red-700" @click="removeHoliday(holiday)">Delete</button></td></tr>
          </tbody></table></div>
        </section>
      </template>

      <template v-else>
        <section class="rounded-xl border bg-white p-4">
          <div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-bold">Historical purchase reference</h2><p class="mt-1 text-xs text-slate-600">Archived source files and historical purchase lines only. No active PO quantities, receiving dates, or incoming stock are tracked.</p></div><button class="rounded bg-teal-700 px-3 py-2 text-xs font-bold text-white" @click="uploadOpen = true">Upload CSV</button></div>
          <p v-if="purchaseImportError" role="alert" class="mt-3 text-sm text-red-700">{{ purchaseImportError }}</p>
          <div class="mt-4 overflow-x-auto"><table class="w-full min-w-[700px] text-left text-xs"><thead class="bg-slate-50"><tr><th v-for="heading in ['File','Uploaded','Uploaded by','Rows saved','Duplicates','Original CSV']" :key="heading" class="p-3">{{ heading }}</th></tr></thead><tbody>
            <tr v-for="item in data.imports" :key="item.id" class="border-t"><td class="p-3">{{ item.filename }}</td><td class="p-3">{{ item.uploadedAt }}</td><td class="p-3">{{ item.uploadedBy }}</td><td class="p-3">{{ number(item.rowCount) }}</td><td class="p-3">{{ number(item.duplicateCount) }}</td><td class="p-3"><button v-if="item.archived" class="text-teal-800 underline" @click="downloadOriginal(item)">Download original</button><span v-else class="text-amber-700">Archive incomplete</span></td></tr>
            <tr v-if="!data.imports.length"><td colspan="6" class="p-8 text-center text-slate-500">No purchase-history CSVs uploaded yet.</td></tr>
          </tbody></table></div>
          <div class="mt-5 border-t pt-4"><h3 class="font-bold">Supplier and unit references</h3><p class="mt-1 text-xs text-slate-600">Historical suppliers and purchase units become available on each product detail. MOQ and supplier lead time must be configured manually; historical PO quantities are not treated as confirmed MOQ.</p></div>
        </section>
      </template>
    </template>

    <Teleport to="body">
      <Transition name="purchasing-pop">
        <div v-if="selected" class="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4" @click.self="selected = null" @keydown.esc="selected = null">
          <section role="dialog" aria-modal="true" aria-label="Purchasing recommendation details" class="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <header class="flex justify-between gap-3"><div><h2 class="text-lg font-extrabold">{{ selected.productName }} · {{ selected.productVariant || selected.sku || 'No variant identifier' }}</h2><p class="text-sm text-slate-600">{{ selected.store }} · {{ selected.movement }} · Monday stock {{ number(selected.reviewStock) }} ({{ selected.reviewDate }}) · current ESB stock {{ number(selected.currentStock) }}</p></div><button class="rounded border px-3 py-1" aria-label="Close details" @click="selected = null">Close</button></header>
            <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Average sales/week</p><strong>{{ number(selected.avgWeekly) }} {{ selected.baseUnit }}</strong></article><article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Average sales/day</p><strong>{{ number(selected.avgDaily) }} {{ selected.baseUnit }}</strong></article><article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Days left · run out</p><strong>{{ dayLabel(selected.daysLeft) }} · {{ dateLabel(selected.expectedStockoutDate) }}</strong></article><article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Order by</p><strong>{{ dateLabel(selected.recommendedReorderDate) }}</strong></article><article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Usable history</p><strong>{{ selected.usableDays }} days / {{ selected.historyWeeks }} weeks</strong></article></div>
            <p v-if="detailLoading" role="status" class="mt-3 rounded bg-teal-50 p-3 text-sm text-teal-900">Loading product history and forecast…</p>
            <p v-if="detailError" role="alert" class="mt-3 rounded bg-red-50 p-3 text-sm text-red-800">{{ detailError }}</p>
            <p v-if="selected.reason" class="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">{{ selected.reason }}. System quantities are unavailable until this data issue is resolved.</p>
            <p v-if="selected.lowData" class="mt-3 text-sm text-amber-800">Low data: some weekdays or historical days are missing; review the demand estimate.</p>
            <p v-if="selected.holidayConflict" class="mt-2 text-sm text-red-700">Overlapping holiday adjustments are not combined. Set the same explicit combined group for overlapping occasions before using the affected forecast.</p>
            <div v-if="selected.forecast && selected.history" class="mt-4 h-72"><Line :data="detailChart" :options="{responsive:true,maintainAspectRatio:false,scales:{sales:{position:'left',beginAtZero:true,title:{display:true,text:'Sales / day'}},stock:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false},title:{display:true,text:'Stock'}}}}" /></div>
            <p class="mt-2 text-xs text-slate-500">Actual sales and observed stock snapshots are shown when available. Forecast projections assume no deliveries or transfers and use date-specific weekday averages. Snapshot days with observed zero stock are excluded from normal demand; they are observations, not proof of a full-day stockout.</p>
            <section class="mt-5 rounded-xl border p-4"><h3 class="font-bold">Supplier and product settings</h3><div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label class="text-xs font-semibold">Movement classification<select v-model="productEdits.movement" class="mt-1 block w-full rounded border p-2"><option value="">Automatic ({{ selected.movement }})</option><option>Fast Moving</option><option>Slow Moving</option></select></label>
              <label class="text-xs font-semibold">Minimum stock (optional)<input v-model="productEdits.minStock" type="number" min="0" class="mt-1 block w-full rounded border p-2"></label>
              <label class="text-xs font-semibold">Product lead time override (days)<input v-model="productEdits.leadDays" type="number" min="1" max="365" class="mt-1 block w-full rounded border p-2"></label>
              <label class="text-xs font-semibold">Supplier name<input v-model.trim="supplierEdit.supplierName" list="purchasing-suppliers" class="mt-1 block w-full rounded border p-2"><datalist id="purchasing-suppliers"><option v-for="supplier in selected.suppliers" :key="supplier.supplierName" :value="supplier.supplierName" /></datalist></label>
              <label class="text-xs font-semibold">Supplier lead time (days)<input v-model="supplierEdit.leadDays" type="number" min="1" max="365" class="mt-1 block w-full rounded border p-2"></label>
              <label class="text-xs font-semibold">Minimum order quantity (supplier units)<input v-model="supplierEdit.moq" type="number" min="0" step="any" class="mt-1 block w-full rounded border p-2"></label>
              <label class="text-xs font-semibold">Purchasing unit<input v-model.trim="supplierEdit.purchasingUnit" maxlength="80" placeholder="Carton, pack, piece…" class="mt-1 block w-full rounded border p-2"></label>
              <label class="text-xs font-semibold">Base units per purchasing unit<input v-model="supplierEdit.conversionQty" type="number" min="0.0001" step="any" class="mt-1 block w-full rounded border p-2"></label>
              <label class="text-xs font-semibold">Base unit<input v-model.trim="supplierEdit.baseUnit" maxlength="80" placeholder="Can, bottle, piece…" class="mt-1 block w-full rounded border p-2"></label>
            </div><p v-if="selected.historicalPurchase" class="mt-3 text-xs text-slate-600">Purchase history reference: avg {{ number(selected.historicalPurchase.averageOrderQty,2) }} {{ selected.historicalPurchase.unit }} / order, equivalent to {{ number(selected.historicalPurchase.equivalentQty,2) }} {{ selected.historicalPurchase.baseUnit }}; last historical purchase {{ selected.historicalPurchase.lastPurchaseDate }}. This does not confirm MOQ or an open PO.</p>
              <div class="mt-3 flex flex-wrap gap-2"><button class="rounded bg-teal-700 px-3 py-2 text-xs font-bold text-white" @click="saveProductEdits">Save product settings</button><button class="rounded border px-3 py-2 text-xs font-bold" @click="saveSupplier">Save supplier settings & select</button></div><p v-if="productError || supplierError" role="alert" class="mt-2 text-xs text-red-700">{{ productError || supplierError }}</p>
            </section>
            <section class="mt-4 rounded-xl border p-4"><h3 class="font-bold">Transparent order calculation</h3><p class="mt-1 text-xs text-slate-600">Protection horizon = supplier lead time + 1-day Tuesday buffer + stock coverage. The purchase-history file never contributes incoming stock.</p>
              <div class="mt-3 grid gap-3 md:grid-cols-2"><article v-for="entry in [{days:7,label:'7-day coverage',value:selected.recommendation7,max:selected.maximumProjectedStock7},{days:10,label:'10-day coverage',value:selected.recommendation10,max:selected.maximumProjectedStock10}]" :key="entry.days" class="rounded-lg bg-slate-50 p-3"><h4 class="font-bold">{{ entry.label }}</h4><p class="mt-2 text-xs">Demand through lead time + buffer: {{ number(entry.value?.demandDuringLead,2) }} {{ selected.baseUnit }}</p><p class="text-xs">Target coverage demand: {{ number(entry.value?.coverageDemand,2) }} {{ selected.baseUnit }}</p><p class="text-xs">Order up to: {{ number(entry.value?.orderUpTo,2) }} {{ selected.baseUnit }} · stock available Monday: {{ number(selected.reviewStock) }}<span v-if="entry.value?.minimumStock"> · minimum stock floor: {{ number(entry.value.minimumStock) }}</span></p><p class="text-xs">Calculated purchase qty: {{ number(entry.value?.calculatedQty) }} {{ selected.purchasingUnit }}{{ selected.supplier?.moq == null ? '' : ` · MOQ ${number(selected.supplier.moq)}` }}</p><p class="text-xs">Final {{ entry.value?.manual ? 'manual' : 'recommended' }} qty: <strong>{{ qtyLabel(selected,entry.value) }}</strong> · maximum projected stock after arrival: {{ number(entry.max) }} {{ selected.baseUnit }}</p></article></div>
            </section>
            <section v-if="selected.holidayEvents.length" class="mt-4 rounded-xl border p-4"><h3 class="font-bold">Manual holiday adjustments</h3><p v-for="holiday in selected.holidayEvents" :key="holiday.id" class="mt-1 text-xs">{{ holiday.name }} ({{ holiday.start_date }}–{{ holiday.end_date }}): {{ holiday.adjustmentPct > 0 ? '+' : '' }}{{ number(holiday.adjustmentPct) }}% applied to forecast demand for this outlet only.</p></section>
          </section>
        </div>
      </Transition>
    </Teleport>
    <PurchasingHistoryUpload :is-open="uploadOpen" @close="uploadOpen = false" @imported="loadPurchasing" />
  </div>
</template>

<style scoped>
.purchasing-pop-enter-active,.purchasing-pop-leave-active{transition:opacity .16s ease,transform .16s ease}
.purchasing-pop-enter-from,.purchasing-pop-leave-to{opacity:0}
.purchasing-pop-enter-from section,.purchasing-pop-leave-to section{transform:scale(.94)}
.purchasing-pop-enter-active section,.purchasing-pop-leave-active section{transition:transform .16s ease}
</style>
