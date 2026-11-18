<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';
import 'chart.js/auto';
import { authFetchJson, getAuthToken } from '../services/authFetch.js';
import { useAuth } from '../composables/useAuth.js';
import PurchasingHistoryUpload from '../components/PurchasingHistoryUpload.vue';
import { normalizePurchasingPreferences, summarizeOutletSync } from '../utils/purchasingPreferences.js';

const { currentUser } = useAuth();
const empty = { rows: [], stores: [], holidays: [], holidayAnalysis: [], upcomingHolidays: [], imports: [], ambiguousMatches: [], settings: {} };
const data = ref({ ...empty });
const loading = ref(true);
const error = ref('');
const message = ref('');
const tab = ref('recommendations');
const storeFilter = ref('all');
const holidayStoreFilter = ref('all');
const statusFilter = ref('all');
const movementFilter = ref('all');
const productSearch = ref('');
const coverage = ref('7');
const sortMode = ref('urgent');
const historyStart = ref('');
const historyEnd = ref('');
const appliedRange = ref(null);
const rangeError = ref('');
const preferenceMessage = ref('');
const preferenceError = ref('');
const clockNow = ref(Date.now());
let clockTimer;
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
const manualSupplier = ref(false);
const manualUnit = ref(false);
const MANUAL_OPTION = '__manual__';
const INPUT_HISTORY_LIMIT = 8;
const inputHistory = ref({});

function inputHistoryKey() { return `purchasing-input-history-v1:${currentUser.value?.id || 'user'}`; }
function loadInputHistory() {
  try { inputHistory.value = JSON.parse(localStorage.getItem(inputHistoryKey()) || '{}') || {}; } catch { inputHistory.value = {}; }
}
function rememberInputs(values) {
  const next = { ...inputHistory.value };
  for (const [field, raw] of Object.entries(values)) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    next[field] = [value, ...(next[field] || []).filter((item) => item !== value)].slice(0, INPUT_HISTORY_LIMIT);
  }
  inputHistory.value = next;
  try { localStorage.setItem(inputHistoryKey(), JSON.stringify(next)); } catch { /* history is a convenience only */ }
}
const suggestionsFor = (field) => inputHistory.value[field] || [];
const supplierOptions = computed(() => [...new Set([
  ...(selected.value?.historySuppliers || []).map((item) => item.supplierName),
  ...(selected.value?.suppliers || []).map((item) => item.supplierName),
])]);
const unitOptions = computed(() => {
  const seen = new Set();
  return [...(selected.value?.historyUnits || []), ...(selected.value?.suppliers || []).filter((item) => item.purchasingUnit)]
    .filter((item) => { const key = `${item.purchasingUnit}|${item.conversionQty}|${item.baseUnit}`; return !seen.has(key) && seen.add(key); })
    .map((item) => ({ ...item, label: `${item.purchasingUnit}${item.baseUnit ? ` · ${Number(item.conversionQty) || 1} ${item.baseUnit}` : ''}` }));
});
const supplierChoice = computed({
  get: () => manualSupplier.value || (supplierEdit.value.supplierName && !supplierOptions.value.includes(supplierEdit.value.supplierName))
    ? MANUAL_OPTION : supplierEdit.value.supplierName || '',
  set: (value) => {
    manualSupplier.value = value === MANUAL_OPTION;
    supplierEdit.value.supplierName = manualSupplier.value ? '' : value;
  },
});
const unitChoice = computed({
  get: () => {
    if (manualUnit.value) return MANUAL_OPTION;
    const index = unitOptions.value.findIndex((item) => item.purchasingUnit === supplierEdit.value.purchasingUnit &&
      Number(item.conversionQty) === Number(supplierEdit.value.conversionQty) && (item.baseUnit || '') === (supplierEdit.value.baseUnit || ''));
    return index >= 0 ? String(index) : supplierEdit.value.purchasingUnit ? MANUAL_OPTION : '';
  },
  set: (value) => {
    manualUnit.value = value === MANUAL_OPTION;
    if (manualUnit.value || value === '') { if (value === '') supplierEdit.value.purchasingUnit = ''; return; }
    const unit = unitOptions.value[Number(value)];
    if (!unit) return;
    supplierEdit.value.purchasingUnit = unit.purchasingUnit;
    if (unit.conversionQty) supplierEdit.value.conversionQty = unit.conversionQty;
    if (unit.baseUnit) supplierEdit.value.baseUnit = unit.baseUnit;
  },
});
const rememberProductInputs = () => rememberInputs({ minStock: productEdits.value.minStock, minStock10: productEdits.value.minStock10 });
const rememberSupplierInputs = () => rememberInputs({
  supplierName: manualSupplier.value ? supplierEdit.value.supplierName : '', leadDays: supplierEdit.value.leadDays, moq: supplierEdit.value.moq,
  purchasingUnit: manualUnit.value ? supplierEdit.value.purchasingUnit : '', conversionQty: supplierEdit.value.conversionQty,
  baseUnit: supplierEdit.value.baseUnit,
});
const supplierError = ref('');
const productError = ref('');
const purchaseImportError = ref('');
const detailError = ref('');
const detailLoading = ref(false);
let detailRequestId = 0;
let holidayForecastRequestId = 0;
const statuses = ['Critical Stock', 'Low Stock', 'Reorder Required', 'Overstock', 'Sufficient Stock', 'Unknown'];
const outletName = (name, id) => id === 'birmas-nomadic' ? 'Nomadic' : String(name || '').replace(/^birmas\s+/i, '').trim();

const stores = computed(() => {
  const map = new Map(data.value.rows.map((row) => [row.storeId, row.store]));
  for (const store of data.value.stores || []) if (store.id === 'birmas-nomadic') map.set(store.id, store.name);
  return [...map].map(([id, name]) => ({ id, name: outletName(name, id) })).sort((a, b) => a.name.localeCompare(b.name));
});
const outletSync = computed(() => stores.value.map((store) => ({
  ...store, ...summarizeOutletSync(data.value.rows.filter((row) => row.storeId === store.id), clockNow.value),
})));
const baseRows = computed(() => data.value.rows.filter((row) =>
  row.currentStock != null && Number(row.currentStock) > 0 &&
  (storeFilter.value === 'all' || row.storeId === storeFilter.value) &&
  (movementFilter.value === 'all' || row.movement === movementFilter.value) &&
  `${row.productName || row.product || ''} ${row.productVariant || ''} ${row.sku || ''}`.toLowerCase().includes(productSearch.value.trim().toLowerCase())));
const filteredRows = computed(() => baseRows.value.filter((row) =>
  statusFilter.value === 'all' || (statusFilter.value === 'needs-order' ? needsOrder(row) : row.status === statusFilter.value)));
const rows = computed(() => [...filteredRows.value].sort((a, b) => {
  if (sortMode.value === 'urgent') {
    const urgency = (row) => row.recommendedReorderDate && row.recommendedReorderDate <= data.value.today ? 0 :
      row.daysLeft == null ? 2 : 1;
    const priority = urgency(a) - urgency(b);
    if (priority) return priority;
    const days = (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity);
    if (days) return days;
    const orderDate = (a.recommendedReorderDate || '9999-12-31').localeCompare(b.recommendedReorderDate || '9999-12-31');
    if (orderDate) return orderDate;
  }
  return (a.productName || a.product || '').localeCompare(b.productName || b.product || '', undefined, { sensitivity: 'base' }) || a.store.localeCompare(b.store);
}));
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 30)));
const visibleRows = computed(() => rows.value.slice((page.value - 1) * 30, page.value * 30));
const counts = computed(() => ({
  reorder: baseRows.value.filter(needsOrder).length,
  critical: baseRows.value.filter((row) => row.status === 'Critical Stock').length,
  low: baseRows.value.filter((row) => row.status === 'Low Stock').length,
  overstock: baseRows.value.filter((row) => row.status === 'Overstock').length,
}));
const holidayAnalysis = computed(() => data.value.holidayAnalysis.filter((row) =>
  holidayStoreFilter.value === 'all' || row.storeId === holidayStoreFilter.value)
  .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name)));
const adjustmentHoliday = computed(() => data.value.upcomingHolidays.find((holiday) => String(holiday.id) === String(selectedHolidayId.value)));
const adjustmentOutlet = computed(() => stores.value.find((store) => store.id === selectedHolidayStore.value));
const number = (value, digits = 0) => value == null || !Number.isFinite(Number(value)) ? '—' :
  Number(value).toLocaleString('id-ID', { maximumFractionDigits: digits });
const money = (value) => value == null ? '—' : `Rp ${number(value)}`;
const dateDisplay = (value) => value ? value.slice(0, 10).split('-').reverse().join('/') : '—';
const dayLabel = (days) => days == null ? '—' : `${number(days)} days`;
const dateLabel = (value) => !value ? '—' : value < data.value.today ? `${value} · overdue` : value === data.value.today ? `${value} · today` : value;
const recommendationsFor = (row) => coverage.value === 'both'
  ? [{ label: '7d', value: row.recommendation7 }, { label: '10d', value: row.recommendation10 }]
  : coverage.value === '10'
    ? [{ label: '10d', value: row.recommendation10 }]
    : [{ label: '7d', value: row.recommendation7 }];
const needsOrder = (row) => recommendationsFor(row).some((item) => item.value?.calculatedQty > 0);
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

watch([storeFilter, statusFilter, movementFilter, productSearch, sortMode, coverage], () => { page.value = 1; });
watch([selectedHolidayStore, data], () => initializeHolidayAdjustments());
watch([selectedHolidayStore, selectedHolidayId, data, tab], loadHolidayForecast);
watch(selected, (row) => {
  if (!row) return;
  productEdits.value = {
    movement: row.movementOverride || '',
    minStock: row.minStock ?? row.suggestedMinStock7 ?? '',
    minStock10: row.minStock10 ?? row.suggestedMinStock10 ?? '',
  };
  manualSupplier.value = false;
  manualUnit.value = false;
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
  if (!data.value.upcomingHolidays.some((holiday) => String(holiday.id) === selectedHolidayId.value)) {
    selectedHolidayId.value = data.value.upcomingHolidays.length ? String(data.value.upcomingHolidays[0].id) : '';
  }
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
  const result = await authFetchJson(`/api/purchasing${rangeQuery()}`);
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

function rangeQuery() {
  return appliedRange.value ? `?${new URLSearchParams(appliedRange.value)}` : '';
}

async function applyRange() {
  rangeError.value = '';
  if (!historyStart.value || !historyEnd.value || historyStart.value > historyEnd.value || historyEnd.value > data.value.today ||
      (Date.parse(`${historyEnd.value}T00:00:00Z`) - Date.parse(`${historyStart.value}T00:00:00Z`)) / 86400000 >= 730) {
    rangeError.value = 'Choose a valid date range of up to 730 days, ending no later than today.';
    return;
  }
  const previous = appliedRange.value;
  appliedRange.value = { historyStart: historyStart.value, historyEnd: historyEnd.value };
  try { await loadPurchasing(); page.value = 1; }
  catch (err) { appliedRange.value = previous; rangeError.value = err.message; }
}

function chooseRange(preset) {
  const today = new Date(`${data.value.today}T00:00:00Z`);
  if (preset === 'week') {
    today.setUTCDate(today.getUTCDate() - 1);
    historyEnd.value = today.toISOString().slice(0, 10);
    today.setUTCDate(today.getUTCDate() - 6);
    historyStart.value = today.toISOString().slice(0, 10);
  } else {
    historyStart.value = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    historyEnd.value = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)).toISOString().slice(0, 10);
  }
  applyRange();
}

async function resetRange() {
  appliedRange.value = null;
  historyStart.value = '';
  historyEnd.value = '';
  rangeError.value = '';
  try { await loadPurchasing(); page.value = 1; }
  catch (err) { rangeError.value = err.message; }
}

async function resetFilters() {
  storeFilter.value = 'all';
  statusFilter.value = 'all';
  movementFilter.value = 'all';
  productSearch.value = '';
  coverage.value = '7';
  sortMode.value = 'urgent';
  await resetRange();
}

function preferenceKey() {
  return `purchasing-preferences-v1:${currentUser.value?.id || 'user'}`;
}

function savePreferences() {
  preferenceError.value = '';
  try {
    localStorage.setItem(preferenceKey(), JSON.stringify({
      store: storeFilter.value, status: statusFilter.value, movement: movementFilter.value,
      search: productSearch.value, coverage: coverage.value, sort: sortMode.value,
      ...appliedRange.value,
    }));
    preferenceMessage.value = 'Preferences saved on this browser. The applied sales date range is saved; unapplied dates are not.';
  } catch {
    preferenceMessage.value = '';
    preferenceError.value = 'Preferences could not be saved in this browser.';
  }
}

function clearPreferences() {
  preferenceError.value = '';
  try {
    localStorage.removeItem(preferenceKey());
    preferenceMessage.value = 'Saved preferences cleared. Current filters remain unchanged.';
  } catch {
    preferenceMessage.value = '';
    preferenceError.value = 'Saved preferences could not be cleared.';
  }
}

function restorePreferences() {
  try {
    const raw = localStorage.getItem(preferenceKey());
    if (!raw) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    const saved = normalizePurchasingPreferences(JSON.parse(raw), today);
    storeFilter.value = saved.store;
    statusFilter.value = saved.status;
    movementFilter.value = saved.movement;
    productSearch.value = saved.search;
    coverage.value = saved.coverage;
    sortMode.value = saved.sort;
    appliedRange.value = saved.range;
    historyStart.value = saved.range?.historyStart || '';
    historyEnd.value = saved.range?.historyEnd || '';
  } catch {
    preferenceError.value = 'Saved preferences could not be loaded.';
  }
}

function toggleStatus(status) {
  statusFilter.value = statusFilter.value === status ? 'all' : status;
}

function printSummary() {
  window.print();
}

async function loadProductDetails(row) {
  const requestId = ++detailRequestId;
  detailError.value = '';
  detailLoading.value = true;
  try {
    const params = new URLSearchParams({ storeId: row.storeId, productId: row.productId, ...(appliedRange.value || {}) });
    const result = await authFetchJson(`/api/purchasing/product-details?${params}`);
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
    const params = new URLSearchParams({ storeId, holidayId, ...(appliedRange.value || {}) });
    const result = await authFetchJson(`/api/purchasing/holiday-forecast?${params}`);
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

async function purchaseImported() {
  await refresh();
}

const minStockPayload = (value, suggested) => value === '' || value == null || Number(value) === suggested ? null : Number(value);

async function saveProductDetails() {
  if (!selected.value) return;
  productError.value = '';
  supplierError.value = '';
  const row = selected.value;
  const hasSupplier = !!String(supplierEdit.value.supplierName || '').trim();
  const product = {
    storeId: row.storeId, productId: row.productId,
    minStock: minStockPayload(productEdits.value.minStock, row.suggestedMinStock7),
    minStock10: minStockPayload(productEdits.value.minStock10, row.suggestedMinStock10),
    movement: productEdits.value.movement || null,
    supplier: hasSupplier ? supplierEdit.value.supplierName : row.selectedSupplier || null,
  };
  try {
    if (hasSupplier) {
      await authFetchJson('/api/purchasing/supplier', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: row.storeId, productId: row.productId,
          supplierName: supplierEdit.value.supplierName,
          leadDays: supplierEdit.value.leadDays === '' ? null : Number(supplierEdit.value.leadDays),
          moq: supplierEdit.value.moq === '' ? null : Number(supplierEdit.value.moq),
          purchasingUnit: supplierEdit.value.purchasingUnit,
          conversionQty: Number(supplierEdit.value.conversionQty),
          baseUnit: supplierEdit.value.baseUnit,
          selected: true,
        }),
      });
      rememberSupplierInputs();
    }
    await authFetchJson('/api/purchasing/product-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(product),
    });
    rememberProductInputs();
    await loadPurchasing();
  } catch (err) { productError.value = err.message; }
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

const detailChart = computed(() => {
  if (!selected.value?.forecast || !selected.value?.history) return { labels: [], datasets: [] };
  const row = selected.value;
  const future = row.forecast.slice(0, 14);
  let stock = row.reviewStock == null ? NaN : Number(row.reviewStock);
  const projected = future.map((day) => {
    if (!Number.isFinite(stock) || day.qty == null) return null;
    const beforeDemand = stock;
    stock = Math.max(0, stock - day.qty);
    return beforeDemand;
  });
  const actual = new Map(row.history.map((item) => [item.date, item]));
  const forecast = new Map(future.map((item, index) => [item.date, { ...item, stock: projected[index] }]));
  const labels = [...new Set([...actual.keys(), ...forecast.keys()])].sort();
  return {
    labels,
    datasets: [
      { label: 'Actual daily sales', data: labels.map((date) => actual.get(date)?.qty ?? null), borderColor: '#0f766e', yAxisID: 'sales', pointRadius: 1, tension: 0.15, spanGaps: false },
      { label: 'Forecast sales', data: labels.map((date) => forecast.get(date)?.qty ?? null), borderColor: '#ea580c', yAxisID: 'sales', borderDash: [6, 4], pointRadius: 1 },
      { label: 'Observed stock', data: labels.map((date) => actual.get(date)?.stock ?? null), borderColor: '#2563eb', yAxisID: 'stock', pointRadius: 2, spanGaps: false },
      { label: 'Projected stock', data: labels.map((date) => forecast.get(date)?.stock ?? null), borderColor: '#2563eb', yAxisID: 'stock', borderDash: [6, 4], pointRadius: 1 },
    ],
  };
});

onMounted(async () => {
  restorePreferences();
  loadInputHistory();
  await refresh();
  if (storeFilter.value !== 'all' && !stores.value.some((store) => store.id === storeFilter.value)) storeFilter.value = 'all';
  clockTimer = setInterval(() => { clockNow.value = Date.now(); }, 60000);
  loading.value = false;
});
onUnmounted(() => { clearInterval(clockTimer); });
</script>

<template>
  <div class="space-y-5">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="text-2xl font-extrabold text-slate-900">Purchasing</h1><p class="mt-1 text-sm text-slate-600">Weekly outlet and product-variant reorder recommendations · PO creation and tracking are out of scope.</p></div>
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
        <section class="rounded-xl border bg-white p-4">
          <h2 class="text-sm font-bold">Stock sync by outlet</h2>
          <p class="mt-1 text-xs text-slate-500">Latest recorded product sync per outlet; older or missing product timestamps are shown separately. This does not confirm that every product was refreshed.</p>
          <div class="mt-3 flex flex-wrap gap-2"><div v-for="store in outletSync" :key="store.id" class="rounded-lg border bg-slate-50 px-3 py-2 text-xs"><strong>{{ store.name }}</strong> · {{ store.latestAge }}<span v-if="store.oldest != null && store.oldest !== store.latest" class="block text-slate-600">Oldest product: {{ store.oldestAge }}</span><span v-if="store.missing" class="block text-amber-700">{{ store.missing }} product(s) with missing or invalid sync time</span></div></div>
        </section>
        <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <button type="button" class="rounded-xl bg-red-100 p-4 text-left text-red-800 ring-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600" :class="statusFilter === 'Critical Stock' ? 'ring-2 ring-red-600' : ''" @click="toggleStatus('Critical Stock')"><span class="text-sm font-bold">Critical stock</span><span class="mt-1 block text-3xl font-extrabold tabular-nums">{{ counts.critical }}</span><span class="mt-1 block text-xs">Expected to run out within 7 days.</span></button>
          <button type="button" class="rounded-xl bg-amber-100 p-4 text-left text-amber-800 ring-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600" :class="statusFilter === 'Low Stock' ? 'ring-2 ring-amber-600' : ''" @click="toggleStatus('Low Stock')"><span class="text-sm font-bold">Low stock</span><span class="mt-1 block text-3xl font-extrabold tabular-nums">{{ counts.low }}</span><span class="mt-1 block text-xs">Expected to run out within 14 days.</span></button>
          <button type="button" class="rounded-xl bg-orange-100 p-4 text-left text-orange-800 ring-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600" :class="statusFilter === 'needs-order' ? 'ring-2 ring-orange-600' : ''" @click="toggleStatus('needs-order')"><span class="text-sm font-bold">Reorder required</span><span class="mt-1 block text-3xl font-extrabold tabular-nums">{{ counts.reorder }}</span><span class="mt-1 block text-xs">System recommends a positive order.</span></button>
          <button type="button" class="rounded-xl bg-blue-100 p-4 text-left text-blue-800 ring-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" :class="statusFilter === 'Overstock' ? 'ring-2 ring-blue-600' : ''" @click="toggleStatus('Overstock')"><span class="text-sm font-bold">Overstock</span><span class="mt-1 block text-3xl font-extrabold tabular-nums">{{ counts.overstock }}</span><span class="mt-1 block text-xs">Estimated stock covers over {{ data.settings.overstockDays }} days.</span></button>
        </section>
        <section class="space-y-3 rounded-xl border bg-white p-4">
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <label class="text-xs font-bold">Search product<input v-model="productSearch" type="search" placeholder="Product, variant, or SKU ( / )" class="mt-1 block w-full rounded-lg border p-2 font-normal"></label>
            <label class="text-xs font-bold">Outlet<select v-model="storeFilter" class="mt-1 block w-full rounded-lg border p-2"><option value="all">All outlets</option><option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option></select></label>
            <label class="text-xs font-bold">Status<select v-model="statusFilter" class="mt-1 block w-full rounded-lg border p-2"><option value="all">All statuses</option><option value="needs-order">Reorder required</option><option v-for="status in statuses" :key="status">{{ status }}</option></select></label>
            <label class="text-xs font-bold">Movement<select v-model="movementFilter" class="mt-1 block w-full rounded-lg border p-2"><option value="all">Fast & slow</option><option>Fast Moving</option><option>Slow Moving</option><option>Unknown</option></select></label>
            <label class="text-xs font-bold">Sort<select v-model="sortMode" class="mt-1 block w-full rounded-lg border p-2"><option value="urgent">Most urgent</option><option value="product">Product A–Z</option></select></label>
            <fieldset class="text-xs font-bold"><legend>Coverage</legend><div class="mt-1 flex rounded-lg border p-1"><button v-for="item in [{value:'7',label:'7 days'},{value:'10',label:'10 days'},{value:'both',label:'Both'}]" :key="item.value" type="button" class="flex-1 rounded px-2 py-1.5" :class="coverage === item.value ? 'bg-teal-700 text-white' : 'text-slate-700'" :aria-pressed="coverage === item.value" @click="coverage = item.value">{{ item.label }}</button></div></fieldset>
          </div>
          <form class="flex flex-wrap items-end gap-2 border-t pt-3" @submit.prevent="applyRange">
            <label class="text-xs font-bold">Sales from<input v-model="historyStart" type="date" :max="data.today" required class="mt-1 block rounded border p-2"></label>
            <label class="text-xs font-bold">Sales to<input v-model="historyEnd" type="date" :max="data.today" required class="mt-1 block rounded border p-2"></label>
            <button class="rounded bg-teal-700 px-3 py-2 text-xs font-bold text-white">Apply range</button>
            <button type="button" class="rounded border px-3 py-2 text-xs font-bold" @click="chooseRange('week')">Last 7 days</button>
            <button type="button" class="rounded border px-3 py-2 text-xs font-bold" @click="chooseRange('month')">Last month</button>
            <button type="button" class="rounded border px-3 py-2 text-xs font-bold" @click="resetFilters">Reset</button>
            <button type="button" class="rounded border border-teal-700 px-3 py-2 text-xs font-bold text-teal-800" @click="savePreferences">Save preferences</button>
            <button type="button" class="rounded border px-3 py-2 text-xs font-bold" @click="clearPreferences">Clear saved</button>
            <p class="ml-auto text-xs text-slate-500">Monday: {{ data.reviewDate || 'missing' }} · Sales: {{ dateDisplay(data.historyStart) }}–{{ dateDisplay(data.historyEnd) }}</p>
          </form>
          <p class="text-xs text-slate-500">Last 7 days ends yesterday; last month is the previous calendar month. Days without outlet sales records, holiday windows and observed zero-stock days are excluded.</p>
          <p v-if="rangeError" role="alert" class="text-xs text-red-700">{{ rangeError }}</p>
          <p v-if="preferenceMessage" role="status" class="text-xs text-teal-800">{{ preferenceMessage }}</p>
          <p v-if="preferenceError" role="alert" class="text-xs text-red-700">{{ preferenceError }}</p>
        </section>
        <p v-if="storeFilter === 'birmas-nomadic' && !data.rows.some(row => row.storeId === 'birmas-nomadic')" role="status" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No Nomadic products with positive stock are available for recommendations. Check the inventory feed and stock quantities; zero and negative stock are excluded.</p>
        <section class="overflow-hidden rounded-xl border bg-white shadow-sm">
          <header class="flex flex-wrap items-center justify-between gap-2 border-b p-4"><div><h2 class="font-bold">Reorder recommendations</h2><p class="text-xs text-slate-500">Order quantities are supplier purchasing units. Open Details &amp; MOQ to edit supplier settings.</p></div><button type="button" class="rounded border border-teal-700 px-3 py-2 text-xs font-bold text-teal-800" @click="printSummary">Print summary</button></header>
          <details class="mx-4 my-3 rounded-lg bg-slate-50 p-3 text-xs">
            <summary class="cursor-pointer font-bold text-teal-800">How calculations work</summary>
            <ol class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <li><strong>1. Monday baseline:</strong> recommendations start from Monday's saved stock snapshot; current synced stock is shown for comparison.</li>
              <li><strong>2. Demand:</strong> weekday sales averages exclude configured holiday windows, days without sales coverage, and observed zero-stock days.</li>
              <li><strong>3. Order quantity:</strong> forecast demand through lead time, Tuesday buffer and selected coverage; subtract Monday stock, then apply MOQ and pack conversion.</li>
              <li><strong>4. Review:</strong> configured holiday adjustments affect future demand. Quantities are read-only system recommendations; no incoming PO stock is assumed.</li>
            </ol>
          </details>
          <p class="px-4 pb-3 text-xs text-amber-800">Order recommendations use Monday stock, not current stock. No incoming quantities or active orders are included.</p>
          <div class="hidden overflow-x-auto xl:block">
            <table class="w-full min-w-[1040px] table-fixed text-left text-xs">
              <colgroup><col style="width:25%"><col style="width:12%"><col style="width:10%"><col style="width:10%"><col style="width:15%"><col style="width:20%"><col style="width:8%"></colgroup>
              <thead class="bg-slate-50 text-[10px] uppercase text-slate-600"><tr>
                <th v-for="heading in ['Product','Status','Stock','Sales pace','Order by & runway','Order qty','Details']" :key="heading" class="p-3">{{ heading }}</th>
              </tr></thead>
              <tbody>
                <tr v-for="row in visibleRows" :key="`${row.storeId}-${row.productId}`" class="cursor-pointer border-t hover:bg-teal-50" tabindex="0" @click="openDetails(row)" @keydown.enter="openDetails(row)" @keydown.space.prevent="openDetails(row)">
                  <td class="p-3 align-top"><strong class="block break-words text-sm">{{ row.productName || row.product }}</strong><span class="mt-1 block text-slate-500">{{ outletName(row.store,row.storeId) }} · <span :class="row.movement === 'Fast Moving' ? 'text-teal-800' : row.movement === 'Slow Moving' ? 'text-violet-800' : ''">{{ row.movement }}<template v-if="row.movementManual"> · Manual</template></span></span><span v-if="row.reason" class="mt-1 block whitespace-normal text-[10px] text-amber-800">{{ row.reason }}</span><span v-else-if="row.lowData" class="mt-1 block text-[10px] text-amber-700">Low data · {{ row.usableDays }} days</span><span v-for="holiday in row.holidayEvents" :key="holiday.id" class="block break-words text-[10px] text-purple-800">{{ holiday.name }} {{ holiday.adjustmentPct > 0 ? '+' : '' }}{{ number(holiday.adjustmentPct) }}%</span><span v-if="row.holidayConflict" class="block text-[10px] text-red-700">Holiday overlap needs review</span></td>
                  <td class="p-3 align-top"><span class="inline-block rounded-full px-2 py-1 font-bold" :class="statusClass(row.status)">{{ row.status }}</span></td>
                  <td class="p-3 align-top text-right tabular-nums"><strong class="block text-sm">{{ number(row.currentStock) }}</strong><span class="mt-1 block text-[10px] text-slate-500">Mon {{ number(row.reviewStock) }} · {{ dateDisplay(row.stockReferenceDate) }}</span></td>
                  <td class="p-3 align-top text-right tabular-nums"><strong class="block">{{ number(row.avgDaily) }} / day</strong><span class="mt-1 block text-[10px] text-slate-500">{{ number(row.avgWeekly) }} / week</span></td>
                  <td class="p-3 align-top tabular-nums"><strong class="block" :class="row.recommendedReorderDate && row.recommendedReorderDate <= data.today ? 'text-red-700' : ''">Order {{ dateLabel(row.recommendedReorderDate) }}</strong><span class="mt-1 block text-[10px] text-slate-600">{{ dayLabel(row.daysLeft) }} left · run out {{ dateDisplay(row.expectedStockoutDate) }}</span></td>
                  <td class="p-3 align-top tabular-nums"><template v-for="entry in recommendationsFor(row)" :key="entry.label"><span class="block font-bold">{{ entry.label }} · {{ qtyLabel(row,entry.value) }}</span><span class="mt-1 block text-[10px] text-slate-500">Up to {{ number(entry.value?.orderUpTo) }} {{ row.baseUnit }} · {{ row.leadDays }}d lead</span></template><span class="mt-1 block text-[10px] text-slate-500">MOQ {{ row.supplier?.moq == null ? 'not set' : number(row.supplier.moq) }} {{ row.purchasingUnit }} · pack {{ number(row.conversionQty) }} {{ row.baseUnit }}</span></td>
                  <td class="p-3 align-top"><button type="button" class="font-bold text-teal-800 underline" @click.stop="openDetails(row)">Details &amp; MOQ ›</button></td>
                </tr>
                <tr v-if="!visibleRows.length"><td colspan="7" class="p-8 text-center text-slate-500">No products match these filters.</td></tr>
              </tbody>
            </table>
          </div>
          <div class="grid gap-3 p-3 xl:hidden">
            <article v-for="row in visibleRows" :key="`${row.storeId}-${row.productId}`" class="rounded-xl border p-3 shadow-sm" tabindex="0" @click="openDetails(row)" @keydown.enter="openDetails(row)">
              <div class="flex items-start justify-between gap-2"><div class="min-w-0"><h3 class="break-words font-bold">{{ row.productName || row.product }}</h3><p class="mt-1 text-xs text-slate-500">{{ outletName(row.store,row.storeId) }} · {{ row.movement }}<span v-if="row.movementManual"> · Manual</span></p></div><span class="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold" :class="statusClass(row.status)">{{ row.status }}</span></div>
              <p v-if="row.reason" class="mt-2 text-xs text-amber-800">{{ row.reason }}</p><p v-else-if="row.lowData" class="mt-2 text-xs text-amber-700">Low data · {{ row.usableDays }} days</p>
              <p v-for="holiday in row.holidayEvents" :key="holiday.id" class="mt-1 text-xs text-purple-800">{{ holiday.name }} {{ holiday.adjustmentPct > 0 ? '+' : '' }}{{ number(holiday.adjustmentPct) }}%<span v-if="row.holidayConflict" class="text-red-700"> · overlap needs review</span></p>
              <div class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs tabular-nums">
                <p><span class="block text-slate-500">Stock · Monday</span><strong>{{ number(row.currentStock) }}</strong> · {{ number(row.reviewStock) }}</p>
                <p><span class="block text-slate-500">Sales pace</span><strong>{{ number(row.avgDaily) }}/day</strong> · {{ number(row.avgWeekly) }}/week</p>
                <p class="col-span-2"><span class="block text-slate-500">Order by · runway</span><strong :class="row.recommendedReorderDate && row.recommendedReorderDate <= data.today ? 'text-red-700' : ''">{{ dateLabel(row.recommendedReorderDate) }}</strong> · {{ dayLabel(row.daysLeft) }} left, out {{ dateDisplay(row.expectedStockoutDate) }}</p>
                <p class="col-span-2"><span class="block text-slate-500">Order quantity · system only</span><template v-for="entry in recommendationsFor(row)" :key="entry.label"><strong class="mr-3">{{ entry.label }} · {{ qtyLabel(row,entry.value) }}</strong><span class="mr-3 text-[10px] text-slate-500">Up to {{ number(entry.value?.orderUpTo) }} {{ row.baseUnit }}</span></template><span class="block text-[10px] text-slate-500">{{ row.leadDays }}d lead · MOQ {{ row.supplier?.moq == null ? 'not set' : number(row.supplier.moq) }} {{ row.purchasingUnit }} · pack {{ number(row.conversionQty) }} {{ row.baseUnit }}</span></p>
              </div>
              <button type="button" class="mt-3 w-full rounded-lg border border-teal-700 px-3 py-2 text-sm font-bold text-teal-800" @click.stop="openDetails(row)">Details &amp; MOQ ›</button>
            </article>
            <p v-if="!visibleRows.length" class="p-8 text-center text-sm text-slate-500">No products match these filters.</p>
          </div>
          <footer class="flex items-center justify-between border-t p-3 text-xs"><span>{{ rows.length }} outlet/products · Page {{ page }} of {{ pages }}</span><div class="space-x-2"><button class="rounded border px-3 py-1 disabled:opacity-40" :disabled="page <= 1" @click="page--">Previous</button><button class="rounded border px-3 py-1 disabled:opacity-40" :disabled="page >= pages" @click="page++">Next</button></div></footer>
        </section>
      </template>

      <template v-else-if="tab === 'holiday-analysis'">
        <section class="rounded-xl border bg-white p-4">
          <h2 class="font-bold">Holiday sales analysis</h2><p class="mt-1 text-xs text-slate-600">Historical windows and baselines are separate from future forecast adjustments. Individual holiday totals may overlap; combined entries count each sales date once.</p>
          <p class="mt-1 text-xs text-slate-600">Difference = (holiday window sales − normal baseline) ÷ normal baseline × 100. The baseline sums the average sales for each matching weekday over the preceding {{ data.settings.historyWeeks }} weeks, excluding holiday windows and days without sales records.</p>
          <label class="mt-3 block text-xs font-bold">Outlet<select v-model="holidayStoreFilter" class="ml-2 rounded border p-2"><option value="all">All outlets</option><option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option></select></label>
          <div class="mt-4 overflow-x-auto"><table class="w-full min-w-[1100px] text-left text-xs"><thead class="bg-slate-50"><tr><th v-for="heading in ['Holiday','Outlet','Holiday dates','Sales window','Total sales','Class','Normal baseline','Difference']" :key="heading" class="p-3">{{ heading }}</th></tr></thead><tbody>
            <tr v-for="item in holidayAnalysis" :key="item.id" class="border-t"><td class="p-3 font-semibold">{{ item.name }}<span v-if="item.combined" class="ml-1 rounded bg-violet-100 px-1 text-violet-800">Combined</span></td><td class="p-3">{{ stores.find(s => s.id === item.storeId)?.name || item.storeId }}</td><td class="p-3">{{ dateDisplay(item.startDate) }}{{ item.endDate !== item.startDate ? ` – ${dateDisplay(item.endDate)}` : '' }}</td><td class="p-3">{{ dateDisplay(item.windowStart) }} – {{ dateDisplay(item.windowEnd) }}</td><td class="p-3">{{ money(item.totalSales) }}</td><td class="p-3">{{ item.classification }}</td><td class="p-3">{{ money(item.normalBaseline) }}</td><td class="p-3">{{ item.differencePct == null ? 'Unavailable' : `${number(item.differencePct,1)}%` }}</td></tr>
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
          <p class="mt-2 text-xs text-slate-600">Combined group is optional. Give overlapping occasions the same group name only when both adjustments should be added together; otherwise overlapping adjustments are blocked to prevent accidental double counting.</p>
          <div class="mt-4 overflow-x-auto"><table class="w-full min-w-[1120px] text-left text-xs"><thead class="bg-slate-50"><tr><th v-for="heading in ['Occasion','Holiday start','Holiday end','Sales window start','Sales window end','Expected adjustment %','Combined group','Action']" :key="heading" class="p-2">{{ heading }}</th></tr></thead><tbody>
            <tr v-for="holiday in data.upcomingHolidays" :key="holiday.id" class="border-t">
              <td class="p-2 font-semibold">{{ holiday.name }}</td>
              <td class="p-2">{{ dateDisplay(holiday.start_date) }}</td><td class="p-2">{{ dateDisplay(holiday.end_date) }}</td><td class="p-2">{{ dateDisplay(holiday.window_start) }}</td><td class="p-2">{{ dateDisplay(holiday.window_end) }}</td>
              <td class="p-2"><input v-model="holidayAdjustments[holiday.id].adjustmentPct" type="number" min="-100" max="500" step="any" class="w-28 rounded border p-1" :aria-label="`Expected demand adjustment for ${holiday.name}`"></td>
              <td class="p-2"><input v-model.trim="holidayAdjustments[holiday.id].combinedGroup" type="text" maxlength="120" placeholder="Optional; same group to combine" class="w-44 rounded border p-1"></td>
              <td class="p-2"><button class="rounded bg-teal-700 px-2 py-1 font-bold text-white" @click="saveAdjustment(holiday)">Save adjustment</button></td>
            </tr>
            <tr v-if="!data.upcomingHolidays.length"><td colspan="8" class="p-5 text-center text-slate-500">Add a holiday calendar record below to configure future adjustments.</td></tr>
          </tbody></table></div>
          <p v-if="holidayAdjustmentError" role="alert" class="mt-3 text-sm text-red-700">{{ holidayAdjustmentError }}</p><p v-if="holidayAdjustmentMessage" role="status" class="mt-3 text-sm text-green-700">{{ holidayAdjustmentMessage }}</p><p v-if="holidayForecastError" role="alert" class="mt-3 text-sm text-red-700">{{ holidayForecastError }}</p>
          <div v-if="adjustmentHoliday" class="mt-5 border-t pt-4"><h3 class="font-bold">Forecast impact: {{ adjustmentHoliday.name }} · {{ adjustmentOutlet?.name }}</h3><label class="mt-2 block text-xs font-bold">Occasion<select v-model="selectedHolidayId" class="ml-2 rounded border p-2"><option v-for="holiday in data.upcomingHolidays" :key="holiday.id" :value="String(holiday.id)">{{ holiday.name }} · {{ dateDisplay(holiday.start_date) }}</option></select></label><p class="mt-1 text-xs text-slate-600">Historical sales are for each product in the most recent matching holiday's sales window. Products with confirmed zero sales are omitted; unavailable references remain visible. Future percentages must be entered manually and apply to forecast demand, not directly to order quantity.</p>
            <p class="mt-2 text-xs text-slate-500">The projected maximum assumes the displayed 7-day recommendation is placed and arrives; it is not an active purchase order or confirmed incoming stock.</p>
            <p class="mt-2 text-xs text-slate-500">The forecast below reflects the last saved adjustment. Save a changed percentage above to recalculate demand and recommendations.</p>
            <div class="mt-3 max-h-[28rem] overflow-auto"><table class="w-full min-w-[900px] text-left text-xs"><thead class="sticky top-0 bg-slate-50"><tr><th v-for="heading in ['Product','Historical sales reference','Saved expected %','Normal forecast','Adjusted forecast','Max stock after order arrival','Order qty 7d']" :key="heading" class="p-2">{{ heading }}</th></tr></thead><tbody><tr v-for="row in holidayForecastRows" :key="row.productId" class="border-t"><td class="p-2">{{ row.productName }}</td><td class="p-2">{{ row.historyReference?.qty != null ? `${number(row.historyReference.qty,2)} ${row.baseUnit} · ${money(row.historyReference.revenue)} (${dateDisplay(row.historyReference.windowStart)}–${dateDisplay(row.historyReference.windowEnd)})` : 'Unavailable / no comparable reference' }}</td><td class="p-2">{{ row.savedAdjustmentPct == null ? 'Not set' : `${number(row.savedAdjustmentPct)}%` }}</td><td class="p-2">{{ row.forecastAvailable ? `${number(row.normalDemand)} ${row.baseUnit}/holiday` : 'Outside forecast horizon' }}</td><td class="p-2">{{ row.forecastAvailable ? `${number(row.adjustedDemand)} ${row.baseUnit}/holiday` : 'Outside forecast horizon' }}</td><td class="p-2">{{ number(row.maximumProjectedStock7) }} {{ row.baseUnit }}</td><td class="p-2">{{ qtyLabel(row,row.recommendation7) }}</td></tr><tr v-if="!holidayForecastRows.length"><td colspan="7" class="p-4 text-slate-500">No products with sales or available references for this occasion.</td></tr></tbody></table></div>
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
          <div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-bold">Uploaded purchase history files</h2><p class="mt-1 text-xs text-slate-600">Import status and original CSV files only; purchase order details are not displayed here.</p></div><button class="rounded bg-teal-700 px-3 py-2 text-xs font-bold text-white" @click="uploadOpen = true">Upload purchase history CSV</button></div>
          <p v-if="purchaseImportError" role="alert" class="mt-3 text-sm text-red-700">{{ purchaseImportError }}</p>
          <div class="mt-4 overflow-x-auto"><table class="w-full min-w-[700px] text-left text-xs"><thead class="bg-slate-50"><tr><th v-for="heading in ['File','Uploaded','Uploaded by','Rows saved','Duplicates','Original CSV']" :key="heading" class="p-3">{{ heading }}</th></tr></thead><tbody>
            <tr v-for="item in data.imports" :key="item.id" class="border-t"><td class="p-3">{{ item.filename }}</td><td class="p-3">{{ item.uploadedAt }}</td><td class="p-3">{{ item.uploadedBy }}</td><td class="p-3">{{ number(item.rowCount) }}</td><td class="p-3">{{ number(item.duplicateCount) }}</td><td class="p-3"><button v-if="item.archived" class="text-teal-800 underline" @click="downloadOriginal(item)">Download original</button><span v-else class="text-amber-700">Archive incomplete</span></td></tr>
            <tr v-if="!data.imports.length"><td colspan="6" class="p-8 text-center text-slate-500">No purchase-history CSVs uploaded yet.</td></tr>
          </tbody></table></div>
        </section>
      </template>
    </template>

    <Teleport to="body">
      <section v-if="tab === 'recommendations' && !loading && !error" class="purchasing-print">
        <h1>Purchasing recommendations</h1>
        <p>As of {{ dateDisplay(data.today) }} · Monday stock {{ dateDisplay(data.reviewDate) }} · Sales {{ dateDisplay(data.historyStart) }}–{{ dateDisplay(data.historyEnd) }}</p>
        <p>Outlet: {{ storeFilter === 'all' ? 'All' : (stores.find(store => store.id === storeFilter)?.name || storeFilter) }} · Status: {{ statusFilter }} · Movement: {{ movementFilter }} · Search: {{ productSearch || 'All' }} · Coverage: {{ coverage === 'both' ? '7 and 10 days' : `${coverage} days` }} · {{ rows.length }} products</p>
        <p>System recommendations only. Monday stock is the order baseline; incoming orders are not included.</p>
        <table>
          <thead><tr><th>Product / outlet</th><th>Status</th><th>Current / Mon</th><th>Sales / day</th><th>Order by / days left</th><th>Recommended quantity</th></tr></thead>
          <tbody>
            <tr v-for="row in rows" :key="`${row.storeId}-${row.productId}`">
              <td>{{ row.productName || row.product }}<br>{{ outletName(row.store,row.storeId) }}</td>
              <td>{{ row.status }}<span v-if="row.reason"><br>{{ row.reason }}</span></td>
              <td>{{ number(row.currentStock) }} / {{ number(row.reviewStock) }}</td>
              <td>{{ number(row.avgDaily) }}</td>
              <td>{{ dateLabel(row.recommendedReorderDate) }}<br>{{ dayLabel(row.daysLeft) }}</td>
              <td><div v-for="entry in recommendationsFor(row)" :key="entry.label">{{ entry.label }}: {{ qtyLabel(row,entry.value) }}</div></td>
            </tr>
            <tr v-if="!rows.length"><td colspan="6">No products match these filters.</td></tr>
          </tbody>
        </table>
      </section>
    </Teleport>
    <Teleport to="body">
      <Transition name="purchasing-pop">
        <div v-if="selected" class="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4" @click.self="selected = null" @keydown.esc="selected = null">
          <section role="dialog" aria-modal="true" aria-label="Purchasing recommendation details" class="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <header class="flex justify-between gap-3"><div><h2 class="text-lg font-extrabold">{{ selected.productName }} · {{ selected.productVariant || selected.sku || 'No variant identifier' }}</h2><p class="text-sm text-slate-600">{{ outletName(selected.store,selected.storeId) }} · {{ selected.movement }} · Monday stock {{ number(selected.reviewStock) }} ({{ selected.reviewDate }}) · current stock {{ number(selected.currentStock) }}</p></div><button class="shrink-0 rounded border px-3 py-1" aria-label="Close details" @click="selected = null">Close</button></header>
            <div class="mt-4 grid gap-2 sm:grid-cols-3">
              <article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Supplier lead time</p><strong class="tabular-nums">{{ selected.leadDays }} days</strong></article>
              <article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">MOQ · pack unit</p><strong>{{ selected.supplier?.moq == null ? 'MOQ not set' : number(selected.supplier.moq) }} {{ selected.purchasingUnit }} · {{ number(selected.conversionQty) }} {{ selected.baseUnit }}/pack</strong></article>
              <article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Order up to · 7d / 10d</p><strong class="tabular-nums">{{ number(selected.recommendation7?.orderUpTo) }} / {{ number(selected.recommendation10?.orderUpTo) }} {{ selected.baseUnit }}</strong></article>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Average sales/week</p><strong>{{ number(selected.avgWeekly) }} {{ selected.baseUnit }}</strong></article><article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Average sales/day</p><strong>{{ number(selected.avgDaily) }} {{ selected.baseUnit }}</strong></article><article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Days left · run out</p><strong>{{ dayLabel(selected.daysLeft) }} · {{ dateLabel(selected.expectedStockoutDate) }}</strong></article><article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Order by</p><strong>{{ dateLabel(selected.recommendedReorderDate) }}</strong></article><article class="rounded-lg bg-slate-50 p-3"><p class="text-xs text-slate-500">Usable history</p><strong>{{ selected.usableDays }} days · {{ dateDisplay(data.historyStart) }}–{{ dateDisplay(data.historyEnd) }}</strong></article></div>
            <p v-if="detailLoading" role="status" class="mt-3 rounded bg-teal-50 p-3 text-sm text-teal-900">Loading product history and forecast…</p>
            <p v-if="detailError" role="alert" class="mt-3 rounded bg-red-50 p-3 text-sm text-red-800">{{ detailError }}</p>
            <p v-if="selected.reason" class="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">{{ selected.reason }}. System quantities are unavailable until this data issue is resolved.</p>
            <p v-if="selected.lowData" class="mt-3 text-sm text-amber-800">Low data: some weekdays or historical days are missing; review the demand estimate.</p>
            <p v-if="selected.holidayConflict" class="mt-2 text-sm text-red-700">Overlapping holiday adjustments are not combined. Set the same explicit combined group for overlapping occasions before using the affected forecast.</p>
            <section class="mt-5 rounded-xl border p-4"><h3 class="font-bold">Supplier and product settings · Edit MOQ</h3><p class="mt-1 text-xs text-slate-600">Pick a supplier and unit from purchase order history (or enter them manually). Minimum stock defaults to the system recommendation for that coverage and can be edited; clear it to return to automatic. Use Save product details to save everything. Inputs you type are remembered as suggestions. MOQ is configured per product and outlet.</p><div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label class="text-xs font-semibold">Movement classification<select v-model="productEdits.movement" class="mt-1 block w-full rounded border p-2"><option value="">Automatic ({{ selected.movement }})</option><option>Fast Moving</option><option>Slow Moving</option></select></label>
              <label class="text-xs font-semibold">Minimum stock · 7-day (default = recommendation)<input v-model="productEdits.minStock" list="hist-minStock" type="number" min="0" class="mt-1 block w-full rounded border p-2"></label>
              <label class="text-xs font-semibold">Minimum stock · 10-day (default = recommendation)<input v-model="productEdits.minStock10" list="hist-minStock10" type="number" min="0" class="mt-1 block w-full rounded border p-2"></label>
              <label class="text-xs font-semibold">Supplier name<select v-model="supplierChoice" class="mt-1 block w-full rounded border p-2"><option value="">Select supplier…</option><option v-for="name in supplierOptions" :key="name" :value="name">{{ name }}</option><option :value="MANUAL_OPTION">Enter manually…</option></select><input v-if="supplierChoice === MANUAL_OPTION" v-model.trim="supplierEdit.supplierName" list="hist-supplierName" maxlength="200" placeholder="Type supplier name" class="mt-2 block w-full rounded border p-2"><span v-if="!supplierOptions.length" class="mt-1 block text-[10px] font-normal text-slate-500">No supplier found in purchase order history for this product.</span></label>
              <label class="text-xs font-semibold">Supplier lead time (days)<input v-model="supplierEdit.leadDays" list="hist-leadDays" type="number" min="1" max="365" class="mt-1 block w-full rounded border p-2"></label>
              <label class="text-xs font-semibold">Minimum order quantity (supplier units)<input v-model="supplierEdit.moq" list="hist-moq" type="number" min="0" step="any" class="mt-1 block w-full rounded border p-2"></label>
              <label class="text-xs font-semibold">Purchasing unit<select v-model="unitChoice" class="mt-1 block w-full rounded border p-2"><option value="">Select unit…</option><option v-for="(unit, index) in unitOptions" :key="index" :value="String(index)">{{ unit.label }}</option><option :value="MANUAL_OPTION">Enter manually…</option></select><input v-if="unitChoice === MANUAL_OPTION" v-model.trim="supplierEdit.purchasingUnit" list="hist-purchasingUnit" maxlength="80" placeholder="Carton, pack, piece…" class="mt-2 block w-full rounded border p-2"><span v-if="!unitOptions.length" class="mt-1 block text-[10px] font-normal text-slate-500">No unit found in purchase order history for this product.</span></label>
              <label class="text-xs font-semibold">Base units per purchasing unit<input v-model="supplierEdit.conversionQty" list="hist-conversionQty" type="number" min="0.0001" step="any" class="mt-1 block w-full rounded border p-2"></label>
              <label class="text-xs font-semibold">Base unit<input v-model.trim="supplierEdit.baseUnit" list="hist-baseUnit" maxlength="80" placeholder="Can, bottle, piece…" class="mt-1 block w-full rounded border p-2"></label>
              <datalist v-for="field in ['minStock','minStock10','supplierName','leadDays','moq','purchasingUnit','conversionQty','baseUnit']" :id="`hist-${field}`" :key="field"><option v-for="value in suggestionsFor(field)" :key="value" :value="value" /></datalist>
            </div><p class="mt-3 text-xs text-slate-600">The selected supplier's lead time is used; when it is not set, the default supplier lead time applies.</p>
              <div class="mt-3 flex flex-wrap gap-2"><button class="rounded bg-teal-700 px-3 py-2 text-xs font-bold text-white" @click="saveProductDetails">Save product details</button></div><p v-if="productError" role="alert" class="mt-2 text-xs text-red-700">{{ productError }}</p>
            </section>
            <div v-if="selected.forecast && selected.history" class="mt-4 h-72"><Line :data="detailChart" :options="{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{tooltip:{mode:'index',intersect:false}},scales:{sales:{position:'left',beginAtZero:true,title:{display:true,text:'Sales / day'}},stock:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false},title:{display:true,text:'Stock'}}}}" /></div>
            <p class="mt-2 text-xs text-slate-500">Hover over a date to see all available values. Projected stock starts with Monday stock and subtracts forecast sales each day, assuming no deliveries or transfers; it is not confirmed stock. Snapshot days with observed zero stock are excluded from normal demand; they are observations, not proof of a full-day stockout.</p>
            <section class="mt-4 rounded-xl border p-4"><h3 class="font-bold">Transparent order calculation</h3><p class="mt-1 text-xs text-slate-600">Protection horizon = supplier lead time + 1-day Tuesday buffer + stock coverage. The purchase-history file never contributes incoming stock.</p>
              <div class="mt-3 grid gap-3 md:grid-cols-2"><article v-for="entry in [{days:7,label:'7-day coverage',value:selected.recommendation7,max:selected.maximumProjectedStock7},{days:10,label:'10-day coverage',value:selected.recommendation10,max:selected.maximumProjectedStock10}]" :key="entry.days" class="rounded-lg bg-slate-50 p-3"><h4 class="font-bold">{{ entry.label }}</h4><p class="mt-2 text-xs">Demand through lead time + buffer: {{ number(entry.value?.demandDuringLead,2) }} {{ selected.baseUnit }}</p><p class="text-xs">Target coverage demand: {{ number(entry.value?.coverageDemand,2) }} {{ selected.baseUnit }}</p><p class="text-xs">Order up to: {{ number(entry.value?.orderUpTo,2) }} {{ selected.baseUnit }} · stock available Monday: {{ number(selected.reviewStock) }}<span v-if="entry.value?.minimumStock"> · minimum stock floor: {{ number(entry.value.minimumStock) }}</span></p><p class="text-xs">Calculated purchase qty: {{ number(entry.value?.calculatedQty) }} {{ selected.purchasingUnit }}{{ selected.supplier?.moq == null ? '' : ` · MOQ ${number(selected.supplier.moq)}` }}</p><p class="text-xs">Recommended qty: <strong>{{ qtyLabel(selected,entry.value) }}</strong> · maximum projected stock after arrival: {{ number(entry.max) }} {{ selected.baseUnit }}</p></article></div>
            </section>
            <section v-if="selected.holidayEvents.length" class="mt-4 rounded-xl border p-4"><h3 class="font-bold">Manual holiday adjustments</h3><p v-for="holiday in selected.holidayEvents" :key="holiday.id" class="mt-1 text-xs">{{ holiday.name }} ({{ holiday.start_date }}–{{ holiday.end_date }}): {{ holiday.adjustmentPct > 0 ? '+' : '' }}{{ number(holiday.adjustmentPct) }}% applied to forecast demand for this outlet only.</p></section>
          </section>
        </div>
      </Transition>
    </Teleport>
    <PurchasingHistoryUpload :is-open="uploadOpen" @close="uploadOpen = false" @imported="purchaseImported" />
  </div>
</template>

<style scoped>
.purchasing-pop-enter-active,.purchasing-pop-leave-active{transition:opacity .16s ease,transform .16s ease}
.purchasing-pop-enter-from,.purchasing-pop-leave-to{opacity:0}
.purchasing-pop-enter-from section,.purchasing-pop-leave-to section{transform:scale(.94)}
.purchasing-pop-enter-active section,.purchasing-pop-leave-active section{transition:transform .16s ease}
</style>

<style>
.purchasing-print { display: none; }
@media print {
  body:has(.purchasing-print) > :not(.purchasing-print) { display: none !important; }
  body > .purchasing-print { display: block; color: #000; font: 10px sans-serif; }
  .purchasing-print h1 { font-size: 18px; font-weight: bold; margin-bottom: 8px; }
  .purchasing-print p { margin: 4px 0; }
  .purchasing-print table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  .purchasing-print th, .purchasing-print td { border: 1px solid #777; padding: 5px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  .purchasing-print thead { display: table-header-group; }
  .purchasing-print tr { break-inside: avoid; }
}
</style>
