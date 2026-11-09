<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';
import 'chart.js/auto';
import { authFetchJson } from '../services/authFetch.js';
import { fmtJakarta } from '../utils/date.js';

const data = ref({ rows: [], start: '', end: '', today: '' });
const loading = ref(true);
const error = ref('');
const store = ref('all');
const category = ref('all');
const abcClass = ref('all');
const status = ref('all');
const ordersOnly = ref(false);
const page = ref(1);
const overstockPage = ref(1);
const selected = ref(null);
const settingsOpen = ref(false);
const settings = ref(null);
const occasions = ref([]);
const saving = ref(false);
const configMessage = ref('');
const configError = ref('');
const settingFields = [
  { key: 'reviewDays', label: 'Review period (days)', min: 1, max: 30 },
  { key: 'leadDays', label: 'Supplier lead time (days)', min: 1, max: 14 },
  { key: 'historyDays', label: 'Recent sales window (days)', min: 14, max: 90 },
  { key: 'safetyA', label: 'A safety stock (days)', min: 0, max: 30 },
  { key: 'safetyB', label: 'B safety stock (days)', min: 0, max: 30 },
  { key: 'safetyC', label: 'C safety stock (days)', min: 0, max: 30 },
  { key: 'overstockDays', label: 'Overstock threshold (days)', min: 4, max: 365 },
];
const statuses = ['Critical', 'Order', 'OK', 'Overstock', 'Unknown'];
const colors = { Critical: 'bg-red-100 text-red-700', Order: 'bg-orange-100 text-orange-700', OK: 'bg-green-100 text-green-700', Overstock: 'bg-blue-100 text-blue-700', Unknown: 'bg-slate-100 text-slate-600' };
const stores = computed(() => [...new Set(data.value.rows.map((r) => r.store))].sort());
const categories = computed(() => [...new Set(data.value.rows.map((r) => r.category))].sort());
const scopedRows = computed(() => data.value.rows.filter((r) =>
  (store.value === 'all' || r.store === store.value) &&
  (category.value === 'all' || r.category === category.value) &&
  (abcClass.value === 'all' || (r.abc || 'Unclassified') === abcClass.value)));
const filtered = computed(() => scopedRows.value.filter((r) =>
  (status.value === 'all' || r.status === status.value) && (!ordersOnly.value || r.orderQty > 0)));
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 25)));
const visible = computed(() => filtered.value.slice((page.value - 1) * 25, page.value * 25));
const watchRows = computed(() => filtered.value.filter((r) => r.daysLeft !== null).slice().sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 10));
const maxWatch = computed(() => Math.max(1, ...watchRows.value.map((r) => r.daysLeft)));
const overstock = computed(() => filtered.value.filter((r) => r.status === 'Overstock'));
const missingRecent = computed(() => {
  const missing = new Map();
  for (const row of scopedRows.value) {
    if (row.missingRecentDays.length) missing.set(row.store, row.missingRecentDays);
  }
  return [...missing].map(([name, dates]) => `${name}: ${dates.join(', ')}`);
});
const oldestStock = computed(() => {
  if (!scopedRows.value.length || scopedRows.value.some((row) => !row.lastSynced)) return '';
  return scopedRows.value.map((row) => row.lastSynced).sort()[0];
});
const oldestSales = computed(() => {
  if (!scopedRows.value.length || scopedRows.value.some((row) => !row.latestSale)) return '';
  return scopedRows.value.map((row) => row.latestSale).sort()[0];
});
const number = (value) => value == null ? '—' : Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const quality = (row) => {
  const warnings = [];
  if (row.lowData) warnings.push('Low data');
  if (row.missingRecentDays.length) warnings.push('Recent sales missing');
  return warnings.join(' · ');
};
watch([store, category, abcClass, status, ordersOnly], () => { page.value = 1; overstockPage.value = 1; });

const chart = computed(() => {
  if (!selected.value) return { labels: [], datasets: [] };
  const row = selected.value;
  const future = row.forecast.slice(0, 14);
  let stock = row.stock;
  const predictedStock = future.map((day) => {
    if (stock == null || day.qty == null) return null;
    const opening = stock;
    stock = Math.max(0, stock - day.qty);
    return opening;
  });
  return {
    labels: [...row.history.map((item) => item.date), ...future.map((item) => item.date)],
    datasets: [
      { label: 'Actual daily sales', data: [...row.history.map((item) => item.qty), ...future.map(() => null)], borderColor: '#0f766e', yAxisID: 'sales', pointRadius: 1, tension: 0.15, spanGaps: false },
      { label: 'Forecast sales', data: [...row.history.map(() => null), ...future.map((item) => item.qty)], borderColor: '#ea580c', yAxisID: 'sales', borderDash: [6, 4], pointRadius: 0 },
      { label: 'Observed stock snapshots', data: [...row.history.map((item) => item.stock), ...future.map(() => null)], borderColor: '#2563eb', yAxisID: 'stock', pointRadius: 2, spanGaps: false },
      { label: 'Projected stock before sales', data: [...row.history.map(() => null), ...predictedStock], borderColor: '#2563eb', yAxisID: 'stock', borderDash: [6, 4], pointRadius: 0 },
    ],
  };
});

function exportCsv() {
  const headings = ['Product', 'Store', 'Category', 'Class', 'Stock', 'Avg/day', 'Days left', 'Target', 'Order qty', 'Status', 'Data quality'];
  const quote = (value) => {
    const text = String(value ?? '');
    return `"${(/^[\s]*[=+\-@\t\r]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`;
  };
  const lines = filtered.value.filter((r) => r.orderQty > 0).map((r) => [r.product, r.store, r.category, r.abc, r.stock, r.avg, r.daysLeft, r.target, r.orderQty, r.status, quality(r) ? `${quality(r)} - tentative` : 'Available'].map(quote).join(','));
  const blob = new Blob(['\ufeffsep=,\r\n', headings.map(quote).join(','), '\r\n', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'restock-orders.csv';
  link.click();
  URL.revokeObjectURL(url);
}

async function loadPlanner() {
  const response = await authFetchJson('/api/restock-planner');
  data.value = response;
  settings.value = { ...response.settings };
  occasions.value = response.occasions.map((event) => ({ ...event }));
  selected.value = null;
}
async function saveConfig() {
  saving.value = true;
  configError.value = '';
  configMessage.value = '';
  try {
    await authFetchJson('/api/restock-planner/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: settings.value, occasions: occasions.value }),
    });
    configMessage.value = 'Settings saved.';
    await loadPlanner();
  } catch (err) { configError.value = err.message; }
  finally { saving.value = false; }
}
onMounted(async () => {
  try { await loadPlanner(); }
  catch (err) { error.value = err.message; }
  finally { loading.value = false; }
});
</script>

<template>
  <div class="space-y-5">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-extrabold text-slate-900">Restock Planner</h1>
        <p v-if="data.settings" class="mt-1 text-sm text-slate-600">Stock last pulled (oldest): {{ oldestStock ? `${fmtJakarta(oldestStock)} WIB` : 'unknown' }} · Sales last seen (oldest store): {{ oldestSales || 'unknown' }}</p>
      </div>
      <button v-if="settings" type="button" class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold" @click="settingsOpen = true">Settings</button>
    </header>
    <p v-if="loading" class="rounded-xl bg-white p-5">Loading planner…</p>
    <p v-else-if="error" class="rounded-xl bg-red-50 p-5 text-red-700">{{ error }}</p>
    <template v-else>
      <div class="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs">
        <label class="font-semibold">Store<select v-model="store" class="ml-1 rounded-lg border border-slate-300 p-2"><option value="all">All stores</option><option v-for="name in stores" :key="name">{{ name }}</option></select></label>
        <label class="font-semibold">Category<select v-model="category" class="ml-1 rounded-lg border border-slate-300 p-2"><option value="all">All categories</option><option v-for="name in categories" :key="name">{{ name }}</option></select></label>
        <label class="font-semibold">Class<select v-model="abcClass" class="ml-1 rounded-lg border border-slate-300 p-2"><option value="all">All classes</option><option>A</option><option>B</option><option>C</option><option>Unclassified</option></select></label>
        <label class="font-semibold">Status<select v-model="status" class="ml-1 rounded-lg border border-slate-300 p-2"><option value="all">All statuses</option><option v-for="name in statuses" :key="name">{{ name }}</option></select></label>
      </div>
      <div v-if="missingRecent.length" role="status" class="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Recent store sales data is missing.</strong> Check the weekend upload before ordering; estimates may be incomplete. {{ missingRecent.join(' · ') }}
      </div>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="name in statuses.slice(0, 4)" :key="name" class="rounded-xl p-4" :class="colors[name]">
          <div class="text-sm font-bold">{{ name }}</div>
          <div class="mt-1 text-3xl font-extrabold">{{ scopedRows.filter((r) => r.status === name).length }}</div>
        </div>
        <p class="text-xs text-slate-500">Cards reflect Store, Category and Class; Status and “Only suggested orders” filter the tables.</p>
      </div>
      <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><h2 class="font-bold">Order list</h2><p class="text-xs text-slate-500">Critical ≤ 1 day · Order &gt; 1–3 days · Overstock &gt; {{ data.settings.overstockDays }} days · {{ scopedRows.filter(r => r.status === 'Unknown').length }} unknown</p></div>
          <div class="flex flex-wrap items-center gap-3"><label class="flex items-center gap-2 text-xs"><input v-model="ordersOnly" type="checkbox"> Only suggested orders</label><button class="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" :disabled="!filtered.some(r => r.orderQty > 0)" @click="exportCsv">Export order CSV</button></div>
        </div>
        <p class="mb-3 text-xs text-slate-500">Target = forecast during review + lead time + safety stock. Quantity = target minus ESB stock, rounded up. “Order” indicates 1–3 days of cover; OK items can also have a positive weekly top-up. Export includes filtered positive quantities only.</p>
        <p class="mb-3 text-xs text-slate-500">Days without store sales or with an observed zero-stock snapshot are excluded from demand estimates. Fewer than 14 usable days or missing weekdays are Low data; estimates are tentative.</p>
        <p class="mb-3 text-xs text-amber-800">Incoming orders and transfers are not deducted. Check stock units, recent sales and tentative estimates before ordering.</p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[900px] text-left text-xs">
            <thead class="bg-slate-50 text-slate-600"><tr><th v-for="heading in ['Product', 'Store', 'Class', 'Stock', 'Avg/day', 'Days left', 'Target', 'Order qty', 'Status']" :key="heading" class="p-3">{{ heading }}</th></tr></thead>
            <tbody><tr v-for="row in visible" :key="`${row.storeId}-${row.productId}`" class="cursor-pointer border-t hover:bg-teal-50" tabindex="0" @click="selected = row" @keydown.enter="selected = row" @keydown.space.prevent="selected = row">
              <td class="p-3 font-semibold">{{ row.product }}<span v-if="row.reason" class="block font-normal text-slate-500">{{ row.reason }}</span><span v-else-if="quality(row)" class="block font-normal text-amber-700">{{ quality(row) }} · tentative</span></td><td class="p-3">{{ row.store }}</td><td class="p-3"><span v-if="row.abc" class="rounded bg-slate-100 px-2 py-1 font-bold">{{ row.abc }}</span><span v-else>—</span></td><td class="p-3">{{ number(row.stock) }}</td><td class="p-3">{{ number(row.avg) }}</td><td class="p-3">{{ number(row.daysLeft) }}</td><td class="p-3">{{ number(row.target) }}</td><td class="p-3 font-bold">{{ number(row.orderQty) }}</td><td class="p-3"><span class="rounded-full px-2 py-1 font-bold" :class="colors[row.status]">{{ row.status }}</span></td>
            </tr><tr v-if="!visible.length"><td colspan="9" class="p-5 text-center text-slate-500">No products for these filters.</td></tr></tbody>
          </table>
        </div>
        <div class="mt-3 flex items-center justify-between text-xs text-slate-600"><span>Page {{ page }} of {{ pages }} · {{ filtered.length }} product/store entries</span><div class="space-x-2"><button :disabled="page <= 1" class="rounded border px-3 py-1 disabled:opacity-40" @click="page--">Previous</button><button :disabled="page >= pages" class="rounded border px-3 py-1 disabled:opacity-40" @click="page++">Next</button></div></div>
      </section>
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="rounded-xl border bg-white p-4"><h2 class="font-bold">Lowest days of cover</h2><p class="text-xs text-slate-500">10 closest to empty in this selection</p><div v-for="row in watchRows" :key="`${row.storeId}-${row.productId}`" class="mt-3 text-xs"><div class="flex justify-between gap-2"><span>{{ row.product }} · {{ row.store }}</span><strong>{{ number(row.daysLeft) }} days</strong></div><div class="mt-1 h-2 rounded bg-slate-100"><div class="h-2 rounded bg-orange-500" :style="{ width: `${Math.max(1, row.daysLeft / maxWatch * 100)}%` }" /></div></div><p v-if="!watchRows.length" class="mt-4 text-xs text-slate-500">No estimates available.</p></section>
        <section class="rounded-xl border bg-white p-4"><h2 class="font-bold">Overstock</h2><p class="mb-3 text-xs text-slate-500">More than {{ data.settings.overstockDays }} estimated days of cover.</p><div class="overflow-x-auto"><table class="w-full text-left text-xs"><thead><tr><th class="p-2">Product</th><th class="p-2">Store</th><th class="p-2">Stock</th><th class="p-2">Days left</th></tr></thead><tbody><tr v-for="r in overstock.slice((overstockPage - 1) * 10, overstockPage * 10)" :key="`${r.storeId}-${r.productId}`" class="cursor-pointer border-t hover:bg-teal-50" tabindex="0" @click="selected = r" @keydown.enter="selected = r" @keydown.space.prevent="selected = r"><td class="p-2">{{ r.product }}</td><td class="p-2">{{ r.store }}</td><td class="p-2">{{ number(r.stock) }}</td><td class="p-2">{{ number(r.daysLeft) }}</td></tr><tr v-if="!overstock.length"><td colspan="4" class="p-2 text-slate-500">No estimated overstock in this selection.</td></tr></tbody></table></div><div class="mt-3 flex justify-between text-xs"><span>{{ overstock.length }} products · Page {{ overstockPage }}</span><div class="space-x-2"><button :disabled="overstockPage <= 1" class="rounded border px-3 py-1 disabled:opacity-40" @click="overstockPage--">Previous</button><button :disabled="overstockPage * 10 >= overstock.length" class="rounded border px-3 py-1 disabled:opacity-40" @click="overstockPage++">Next</button></div></div></section>
      </div>
    </template>
    <Teleport to="body">
      <div v-if="selected" class="fixed inset-0 z-[100] bg-slate-950/60" @click.self="selected = null" @keydown.esc="selected = null">
        <aside role="dialog" aria-modal="true" aria-label="Product sales and forecast" class="ml-auto h-full w-full max-w-3xl overflow-y-auto bg-white p-5 shadow-xl">
          <div class="flex justify-between gap-4"><div><h2 class="font-bold">{{ selected.product }} · {{ selected.store }}</h2><p class="text-xs text-slate-500">Stock pulled: {{ selected.lastSynced ? `${fmtJakarta(selected.lastSynced)} WIB` : 'unknown' }} · Sales last seen: {{ selected.latestSale || 'unknown' }} · Usable days: {{ selected.usableDays }}/{{ data.settings.historyDays }}</p></div><button class="self-start rounded border px-3 py-1 text-sm" @click="selected = null">Close</button></div>
          <p class="my-3 text-xs text-slate-600">Class {{ selected.abc || 'unclassified' }} · Target {{ number(selected.target) }} · Safety stock {{ number(selected.safetyQty) }} · Suggested order {{ number(selected.orderQty) }}</p>
          <p v-if="selected.reason || quality(selected)" class="my-2 text-xs text-amber-700">{{ selected.reason || `${quality(selected)} · tentative` }}</p>
          <p class="my-3 text-xs text-slate-500">Sales forecast uses weekday averages and occasion adjustments. Stock projections assume no deliveries or transfers. Snapshots are observations, not proof of a full day out of stock; {{ selected.zeroDays }} zero-stock observations in {{ selected.snapshotDays }} snapshot days.</p>
          <div class="h-80"><Line :data="chart" :options="{ responsive: true, maintainAspectRatio: false, scales: { sales: { position: 'left', beginAtZero: true, title: { display: true, text: 'Sales / day' } }, stock: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Stock' } } } }" /></div>
        </aside>
      </div>
      <div v-if="settingsOpen" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" @click.self="settingsOpen = false" @keydown.esc="settingsOpen = false">
        <div role="dialog" aria-modal="true" aria-label="Planner settings" class="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
          <div class="flex items-center justify-between gap-3"><h2 class="font-bold">Planner settings and special occasions</h2><button type="button" class="rounded border px-3 py-1 text-sm" @click="settingsOpen = false">Close</button></div>
          <form class="mt-4 space-y-4" @submit.prevent="saveConfig">
            <p class="text-xs text-slate-600">Global settings apply to all stores and products. ABC uses matched revenue over the last 365 days. Changes take effect after saving.</p>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label v-for="field in settingFields" :key="field.key" class="text-xs font-semibold text-slate-700">{{ field.label }}<input v-model.number="settings[field.key]" type="number" :min="field.min" :max="field.max" step="1" required class="mt-1 block w-full rounded-lg border border-slate-300 p-2"></label></div>
            <div class="border-t pt-4"><div class="flex items-center justify-between gap-2"><div><h3 class="text-sm font-bold">Special occasions</h3><p class="text-xs text-slate-500">Enter dates and a percentage, e.g. +30 for higher or -20 for lower sales. Applies to every product and store; overlaps add together.</p></div><button type="button" class="rounded-lg border px-3 py-2 text-xs font-bold" @click="occasions.push({ name: '', start: data.today, end: data.today, adjustment: 0 })">Add occasion</button></div>
              <div v-for="(occasion, index) in occasions" :key="index" class="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"><label class="text-xs">Name<input v-model.trim="occasion.name" required maxlength="100" class="mt-1 block w-full rounded border border-slate-300 p-2"></label><label class="text-xs">Start date<input v-model="occasion.start" type="date" required class="mt-1 block w-full rounded border border-slate-300 p-2"></label><label class="text-xs">End date<input v-model="occasion.end" type="date" required :min="occasion.start" class="mt-1 block w-full rounded border border-slate-300 p-2"></label><label class="text-xs">Adjustment %<input v-model.number="occasion.adjustment" type="number" min="-100" max="500" step="any" required class="mt-1 block w-full rounded border border-slate-300 p-2"></label><button type="button" class="self-end rounded border px-3 py-2 text-xs text-red-700" @click="occasions.splice(index, 1)">Remove</button></div>
            </div>
            <div class="flex flex-wrap items-center gap-3"><button :disabled="saving" class="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{{ saving ? 'Saving…' : 'Save settings' }}</button><span v-if="configError" role="alert" class="text-xs text-red-700">{{ configError }}</span><span v-else-if="configMessage" class="text-xs text-green-700">{{ configMessage }}</span></div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>
