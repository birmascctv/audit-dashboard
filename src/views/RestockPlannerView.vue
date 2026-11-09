<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Line } from 'vue-chartjs';
import 'chart.js/auto';
import AnalyticsPieChart from '../components/AnalyticsPieChart.vue';
import { authFetchJson } from '../services/authFetch.js';

const data = ref({ rows: [], start: '', end: '', today: '' });
const loading = ref(true);
const error = ref('');
const store = ref('all');
const status = ref('all');
const page = ref(1);
const overstockPage = ref(1);
const stockoutPage = ref(1);
const selected = ref(null);
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
const statuses = ['Critical', 'Soon', 'OK', 'Overstock', 'Unknown'];
const colors = { Critical: 'bg-red-100 text-red-700', Soon: 'bg-orange-100 text-orange-700', OK: 'bg-green-100 text-green-700', Overstock: 'bg-blue-100 text-blue-700', Unknown: 'bg-slate-100 text-slate-600' };
const stores = computed(() => [...new Set(data.value.rows.map((r) => r.store))].sort());
const storeRows = computed(() => data.value.rows.filter((r) => store.value === 'all' || r.store === store.value));
const filtered = computed(() => storeRows.value.filter((r) => status.value === 'all' || r.status === status.value));
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / 25)));
const visible = computed(() => filtered.value.slice((page.value - 1) * 25, page.value * 25));
const watchRows = computed(() => filtered.value.filter((r) => r.daysLeft !== null).slice().sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 10));
const maxWatch = computed(() => Math.max(1, ...watchRows.value.map((r) => r.daysLeft)));
const overstock = computed(() => filtered.value.filter((r) => r.status === 'Overstock'));
const stockouts = computed(() => filtered.value.filter((r) => r.zeroDays > 0).sort((a, b) => b.zeroDays - a.zeroDays));
const abc = computed(() => ['A', 'B', 'C'].map((name) => ({ name, sales: filtered.value.filter((r) => r.abc === name).reduce((sum, r) => sum + r.revenue, 0) })));
const number = (value) => value == null ? '—' : Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 });
watch([store, status], () => { page.value = 1; overstockPage.value = 1; stockoutPage.value = 1; });

const chart = computed(() => {
  if (!selected.value) return { labels: [], datasets: [] };
  const row = selected.value;
  const future = row.forecast.slice(0, 14);
  return {
    labels: [...row.history.map((item) => item.date), ...future.map((item) => item.date)],
    datasets: [
      { label: 'Actual daily sales', data: [...row.history.map((item) => item.qty), ...future.map(() => null)], borderColor: '#0f766e', pointRadius: 1, tension: 0.15, spanGaps: false },
      { label: 'Weekday and occasion forecast', data: [...row.history.map(() => null), ...future.map((item) => item.qty)], borderColor: '#ea580c', borderDash: [6, 4], pointRadius: 0 },
    ],
  };
});

function exportCsv() {
  const headings = ['Product', 'Store', 'Stock', 'Avg/day', 'Days left', 'Order by', 'Order qty', 'Status', 'Data quality', 'ABC'];
  const quote = (value) => {
    const text = String(value ?? '');
    return `"${(/^[\s]*[=+\-@\t\r]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`;
  };
  const lines = filtered.value.filter((r) => r.orderQty > 0).map((r) => [r.product, r.store, r.stock, r.avg, r.daysLeft, r.orderBy, r.orderQty, r.status, r.lowData ? 'Low data - tentative' : 'Available', r.abc].map(quote).join(','));
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
    <header>
      <h1 class="text-2xl font-extrabold text-slate-900">Restock Planner</h1>
      <p v-if="data.settings" class="mt-1 text-sm text-slate-600">{{ data.settings.reviewDays }}-day review · {{ data.settings.leadDays }}-day lead time · {{ data.settings.historyDays }}-day sales window ({{ data.start }} to {{ data.end }})</p>
    </header>
    <p v-if="loading" class="rounded-xl bg-white p-5">Loading planner…</p>
    <p v-else-if="error" class="rounded-xl bg-red-50 p-5 text-red-700">{{ error }}</p>
    <template v-else>
      <p class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        Order-up-to = predicted sales during review + lead time, plus ABC safety stock, minus current ESB stock. Incoming orders and transfers are not deducted; check them and product units before ordering. Weekday averages use recent sales; missing weekdays fall back to the overall average. Occasion percentages adjust forecasts on the entered dates (overlaps add together). Days without store sales and observed zero-stock days are excluded. Fewer than 14 usable days or missing weekdays are Low data; quantities are tentative. Stale data or no match is Unknown. Snapshots show stock at one moment, not a full day out of stock.
      </p>
      <details class="rounded-xl border border-slate-200 bg-white p-4">
        <summary class="cursor-pointer font-bold">Planner settings and special occasions</summary>
        <form class="mt-4 space-y-4" @submit.prevent="saveConfig">
          <p class="text-xs text-slate-600">Global settings apply to all stores and products. ABC uses matched revenue over the last 365 days. Changes take effect after saving.</p>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label v-for="field in settingFields" :key="field.key" class="text-xs font-semibold text-slate-700">{{ field.label }}
              <input v-model.number="settings[field.key]" type="number" :min="field.min" :max="field.max" step="1" required class="mt-1 block w-full rounded-lg border border-slate-300 p-2">
            </label>
          </div>
          <div class="border-t pt-4">
            <div class="flex items-center justify-between gap-2"><div><h3 class="text-sm font-bold">Special occasions</h3><p class="text-xs text-slate-500">Enter a date range and a percentage, e.g. +30 for higher or -20 for lower sales. Applies to every product and store.</p></div><button type="button" class="rounded-lg border px-3 py-2 text-xs font-bold" @click="occasions.push({ name: '', start: data.today, end: data.today, adjustment: 0 })">Add occasion</button></div>
            <div v-for="(occasion, index) in occasions" :key="index" class="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <label class="text-xs">Name<input v-model.trim="occasion.name" required maxlength="100" class="mt-1 block w-full rounded border border-slate-300 p-2"></label>
              <label class="text-xs">Start date<input v-model="occasion.start" type="date" required class="mt-1 block w-full rounded border border-slate-300 p-2"></label>
              <label class="text-xs">End date<input v-model="occasion.end" type="date" required :min="occasion.start" class="mt-1 block w-full rounded border border-slate-300 p-2"></label>
              <label class="text-xs">Adjustment %<input v-model.number="occasion.adjustment" type="number" min="-100" max="500" step="any" required class="mt-1 block w-full rounded border border-slate-300 p-2"></label>
              <button type="button" class="self-end rounded border px-3 py-2 text-xs text-red-700" @click="occasions.splice(index, 1)">Remove</button>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-3"><button :disabled="saving" class="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{{ saving ? 'Saving…' : 'Save settings' }}</button><span v-if="configError" role="alert" class="text-xs text-red-700">{{ configError }}</span><span v-else-if="configMessage" class="text-xs text-green-700">{{ configMessage }}</span></div>
        </form>
      </details>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div v-for="name in statuses.slice(0, 4)" :key="name" class="rounded-xl p-4" :class="colors[name]">
          <div class="text-sm font-bold">{{ name }}</div>
          <div class="mt-1 text-3xl font-extrabold">{{ storeRows.filter((r) => r.status === name).length }}</div>
        </div>
      </div>
      <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 class="font-bold">Restock recommendations</h2><p class="text-xs text-slate-500">Critical ≤ 1 day · Soon ≤ 3 days · Overstock &gt; {{ data.settings.overstockDays }} days · {{ storeRows.filter(r => r.status === 'Unknown').length }} unknown</p></div>
          <div class="flex flex-wrap gap-2">
            <label class="text-xs">Store<select v-model="store" class="ml-1 rounded-lg border border-slate-300 p-2"><option value="all">All stores</option><option v-for="name in stores" :key="name">{{ name }}</option></select></label>
            <label class="text-xs">Status<select v-model="status" class="ml-1 rounded-lg border border-slate-300 p-2"><option value="all">All statuses</option><option v-for="name in statuses" :key="name">{{ name }}</option></select></label>
            <button class="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" :disabled="!filtered.some(r => r.orderQty > 0)" @click="exportCsv">Export order CSV</button>
          </div>
        </div>
        <p class="mb-2 text-xs text-slate-500">Export includes filtered rows with a positive order quantity. Select a row for sales history and forecast.</p>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[850px] text-left text-xs">
            <thead class="bg-slate-50 text-slate-600"><tr><th v-for="heading in ['Product', 'Store', 'Stock', 'Avg/day', 'Days left', 'Order by', 'Order qty', 'Status']" :key="heading" class="p-3">{{ heading }}</th></tr></thead>
            <tbody><tr v-for="row in visible" :key="`${row.storeId}-${row.productId}`" class="cursor-pointer border-t hover:bg-teal-50" tabindex="0" @click="selected = row" @keydown.enter="selected = row" @keydown.space.prevent="selected = row">
              <td class="p-3 font-semibold">{{ row.product }}<span v-if="row.reason" class="block font-normal text-slate-500">{{ row.reason }}</span><span v-else-if="row.lowData" class="block font-normal text-amber-700">Low data · tentative</span><span v-if="row.abc" class="block font-normal text-slate-500">ABC: {{ row.abc }}</span></td><td class="p-3">{{ row.store }}</td><td class="p-3">{{ number(row.stock) }}</td><td class="p-3">{{ number(row.avg) }}</td><td class="p-3">{{ number(row.daysLeft) }}</td><td class="p-3">{{ row.orderBy || '—' }}</td><td class="p-3">{{ number(row.orderQty) }}</td><td class="p-3"><span class="rounded-full px-2 py-1 font-bold" :class="colors[row.status]">{{ row.status }}</span></td>
            </tr><tr v-if="!visible.length"><td colspan="8" class="p-5 text-center text-slate-500">No products for these filters.</td></tr></tbody>
          </table>
        </div>
        <div class="mt-3 flex items-center justify-between text-xs text-slate-600"><span>Page {{ page }} of {{ pages }} · {{ filtered.length }} products</span><div class="space-x-2"><button :disabled="page <= 1" class="rounded border px-3 py-1 disabled:opacity-40" @click="page--">Previous</button><button :disabled="page >= pages" class="rounded border px-3 py-1 disabled:opacity-40" @click="page++">Next</button></div></div>
      </section>
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="rounded-xl border bg-white p-4"><h2 class="font-bold">Top products to watch</h2><p class="text-xs text-slate-500">Fewest estimated days of cover</p><div v-for="row in watchRows" :key="`${row.storeId}-${row.productId}`" class="mt-3 text-xs"><div class="flex justify-between gap-2"><span>{{ row.product }} · {{ row.store }}</span><strong>{{ number(row.daysLeft) }} days</strong></div><div class="mt-1 h-2 rounded bg-slate-100"><div class="h-2 rounded bg-orange-500" :style="{ width: `${Math.max(1, row.daysLeft / maxWatch * 100)}%` }" /></div></div><p v-if="!watchRows.length" class="mt-4 text-xs text-slate-500">No estimates available.</p></section>
        <section class="rounded-xl border bg-white p-4"><h2 class="font-bold">ABC revenue analysis</h2><p class="text-xs text-slate-500">Matched product/store revenue from {{ data.annualStart }} to {{ data.end }}, ranked across all stores before filters. A ≈ 80%, B ≈ 15%, C remainder; missing sales reduce reliability.</p><AnalyticsPieChart :items="abc" :show-legend-values="true" /><p v-if="!abc.some(a => a.sales > 0)" class="text-xs text-slate-500">No matched revenue available.</p></section>
      </div>
      <section class="rounded-xl border bg-white p-4"><h2 class="font-bold">Overstock / slow-moving</h2><p class="mb-3 text-xs text-slate-500">More than {{ data.settings.overstockDays }} estimated days of cover.</p><div class="overflow-x-auto"><table class="w-full text-left text-xs"><thead><tr><th class="p-2">Product</th><th class="p-2">Store</th><th class="p-2">Stock</th><th class="p-2">Days left</th></tr></thead><tbody><tr v-for="r in overstock.slice((overstockPage - 1) * 20, overstockPage * 20)" :key="`${r.storeId}-${r.productId}`" class="border-t"><td class="p-2">{{ r.product }}</td><td class="p-2">{{ r.store }}</td><td class="p-2">{{ number(r.stock) }}</td><td class="p-2">{{ number(r.daysLeft) }}</td></tr><tr v-if="!overstock.length"><td colspan="4" class="p-2 text-slate-500">No estimated overstock.</td></tr></tbody></table></div><div class="mt-3 flex justify-between text-xs"><span>{{ overstock.length }} products · Page {{ overstockPage }}</span><div class="space-x-2"><button :disabled="overstockPage <= 1" class="rounded border px-3 py-1 disabled:opacity-40" @click="overstockPage--">Previous</button><button :disabled="overstockPage * 20 >= overstock.length" class="rounded border px-3 py-1 disabled:opacity-40" @click="overstockPage++">Next</button></div></div></section>
      <section class="rounded-xl border bg-white p-4"><h2 class="font-bold">Stockout observations</h2><p class="mb-3 text-xs text-slate-500">Zero or negative snapshots during {{ data.start }}–{{ data.end }}. Missing snapshots are not stockouts.</p><div class="overflow-x-auto"><table class="w-full text-left text-xs"><thead><tr><th class="p-2">Product</th><th class="p-2">Store</th><th class="p-2">Zero observations</th><th class="p-2">Snapshot days / {{ data.settings.historyDays }}</th></tr></thead><tbody><tr v-for="r in stockouts.slice((stockoutPage - 1) * 20, stockoutPage * 20)" :key="`${r.storeId}-${r.productId}`" class="border-t"><td class="p-2">{{ r.product }}</td><td class="p-2">{{ r.store }}</td><td class="p-2">{{ r.zeroDays }}</td><td class="p-2">{{ r.snapshotDays }} / {{ data.settings.historyDays }}</td></tr><tr v-if="!stockouts.length"><td colspan="4" class="p-2 text-slate-500">No zero-stock observations in this selection.</td></tr></tbody></table></div><div class="mt-3 flex justify-between text-xs"><span>{{ stockouts.length }} products · Page {{ stockoutPage }}</span><div class="space-x-2"><button :disabled="stockoutPage <= 1" class="rounded border px-3 py-1 disabled:opacity-40" @click="stockoutPage--">Previous</button><button :disabled="stockoutPage * 20 >= stockouts.length" class="rounded border px-3 py-1 disabled:opacity-40" @click="stockoutPage++">Next</button></div></div></section>
    </template>
    <Teleport to="body"><div v-if="selected" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" @click.self="selected = null" @keydown.esc="selected = null"><div role="dialog" aria-modal="true" aria-label="Product sales and forecast" class="w-full max-w-4xl rounded-xl bg-white p-5 shadow-xl"><div class="flex justify-between gap-4"><div><h2 class="font-bold">{{ selected.product }} · {{ selected.store }}</h2><p class="text-xs text-slate-500">Stock pulled: {{ selected.lastSynced || 'unknown' }} · Sales last seen: {{ selected.latestSale || 'unknown' }} · Usable days: {{ selected.usableDays }}/{{ data.settings.historyDays }} · Safety stock: {{ number(selected.safetyQty) }} · {{ selected.lowData ? 'Low data' : 'Usable data' }}</p></div><button class="rounded border px-3 py-1 text-sm" @click="selected = null">Close</button></div><p class="my-3 text-xs text-slate-500">Forecast uses recent weekday averages and manually entered occasion adjustments, not a guarantee. Gaps indicate missing store sales data; observed zero-stock days are excluded from demand estimates. {{ selected.reason }}</p><div class="h-72"><Line :data="chart" :options="{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }" /></div></div></div></Teleport>
  </div>
</template>
