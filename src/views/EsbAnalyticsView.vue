<script setup>
import { computed, onMounted, ref } from 'vue';
import AnalyticsPieChart from '../components/AnalyticsPieChart.vue';
import { authFetchJson } from '../services/authFetch.js';

const stores = ref([]);
const storeId = ref('');
const startDate = ref('');
const endDate = ref('');
const analytics = ref(null);
const loading = ref(false);
const error = ref('');
const topProductSort = ref('qty');
const money = (value) => `Rp ${Math.round(Number(value) || 0).toLocaleString('id-ID')}`;
const percent = (value, total) => total ? `${(value / total * 100).toFixed(1)}%` : '0.0%';
const topProducts = computed(() => topProductSort.value === 'qty' ? analytics.value?.topProductsQty || [] : analytics.value?.topProductsSales || []);

function setQuickRange(range) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const shift = (date, days) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  };
  startDate.value = range === 'all' ? '' : range === 'yesterday' ? shift(today, -1) : range === 'week' ? shift(today, -6) : range === 'month' ? `${today.slice(0, 8)}01` : today;
  endDate.value = range === 'all' ? '' : range === 'yesterday' ? shift(today, -1) : today;
  load();
}

async function load() {
  if (startDate.value && endDate.value && startDate.value > endDate.value) {
    error.value = 'The start date must be on or before the end date.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const params = new URLSearchParams();
    if (storeId.value) params.set('storeId', storeId.value);
    if (startDate.value) params.set('startDate', startDate.value);
    if (endDate.value) params.set('endDate', endDate.value);
    analytics.value = (await authFetchJson(`/api/sales/esb-analytics?${params}`)).analytics;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    stores.value = (await authFetchJson('/api/sales/stores')).stores;
  } catch (err) {
    error.value = err.message;
    return;
  }
  await load();
});
</script>

<template>
  <main class="space-y-5">
    <header class="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h1 class="text-xl font-black text-slate-900">ESB Analytics</h1>
        <p class="text-xs text-slate-500">Sales Report with transaction-level ESB revenue adjustments</p>
      </div>
      <router-link to="/sales" class="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Back to Sales Report</router-link>
    </header>

    <p v-if="error" role="alert" class="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{{ error }}</p>
    <div v-if="analytics && (analytics.missingRows || analytics.missingSalesDateRows || analytics.excludedOrders || analytics.splitMismatchOrders)" role="alert" class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p v-if="analytics.missingRows">{{ analytics.missingRows.toLocaleString('id-ID') }} rows ({{ money(analytics.missingRevenue) }}) have no saved Sales Number and are excluded. Delete the old uploaded files, then re-upload the original ESB CSVs.</p>
      <p v-if="analytics.missingSalesDateRows">{{ analytics.missingSalesDateRows.toLocaleString('id-ID') }} rows across the selected stores have no saved Sales Date. Sales without any saved Sales Date use Sales Date In, so date-filtered totals may be inaccurate. Re-upload the original CSVs containing Sales Date to restore dates on matching rows.</p>
      <p v-if="analytics.excludedOrders">{{ analytics.excludedOrders.toLocaleString('id-ID') }} sales ({{ money(analytics.excludedRevenue) }}) have inconsistent or unreadable payment/visit details and are excluded.</p>
      <p v-if="analytics.splitMismatchOrders">{{ analytics.splitMismatchOrders.toLocaleString('id-ID') }} split-payment sales have tender amounts that differ from their sales-row total; revenue is allocated proportionally.</p>
    </div>

    <section v-if="analytics" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-bold uppercase text-slate-500">Total net sales</p>
        <p class="mt-2 text-2xl font-black text-slate-900">{{ money(analytics.adjustedRevenue) }}</p>
        <p class="mt-1 text-xs text-slate-500">Original {{ money(analytics.baseRevenue) }} · Ceiling {{ money(analytics.roundingAdjustment) }} · ShopeeFood {{ money(analytics.shopeeAdjustment) }}</p>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-bold uppercase text-slate-500">Units sold</p>
        <p class="mt-2 text-2xl font-black text-slate-900">{{ analytics.totalUnitsSold.toLocaleString('id-ID') }}</p>
        <p class="mt-1 text-xs text-slate-500">{{ analytics.transactionCount.toLocaleString('id-ID') }} included sales</p>
      </article>
      <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="text-xs font-bold uppercase text-slate-500">Top Stores</p>
        <ol class="mt-2 space-y-1.5">
          <li v-for="(store, index) in analytics.stores.slice(0, 3)" :key="store.name" class="flex justify-between gap-2 text-xs"><span class="font-semibold"><span class="mr-1 text-teal-700">{{ index + 1 }}.</span>{{ store.name }}</span><span class="font-mono font-bold">{{ money(store.sales) }}</span></li>
          <li v-if="!analytics.stores.length" class="text-xs text-slate-400">No store sales in this period.</li>
        </ol>
      </article>
    </section>

    <form class="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" @submit.prevent="load">
      <div>
        <p class="mb-1 text-sm font-bold uppercase text-slate-500">Quick range</p>
        <div class="flex flex-wrap gap-1">
          <button v-for="preset in [{id:'today',label:'Today'}, {id:'yesterday',label:'Yesterday'}, {id:'week',label:'Last 7 Days'}, {id:'month',label:'This Month'}, {id:'all',label:'All Time'}]" :key="preset.id" type="button" class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-teal-50" :disabled="loading" @click="setQuickRange(preset.id)">{{ preset.label }}</button>
        </div>
      </div>
      <label class="text-xs font-bold text-slate-600">Start date<input v-model="startDate" type="date" class="mt-1 block rounded-lg border border-slate-200 p-2 text-sm"></label>
      <label class="text-xs font-bold text-slate-600">End date<input v-model="endDate" type="date" class="mt-1 block rounded-lg border border-slate-200 p-2 text-sm"></label>
      <label class="text-xs font-bold text-slate-600">Store
        <select v-model="storeId" class="mt-1 block rounded-lg border border-slate-200 p-2 text-sm"><option value="">All stores</option><option v-for="store in stores" :key="store.name" :value="store.name">{{ store.name }}</option></select>
      </label>
      <button class="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" :disabled="loading">{{ loading ? 'Loading…' : 'Apply' }}</button>
    </form>

    <p class="text-xs text-slate-500">CASH and QRIS BCA portions are rounded up to the next Rp1,000 per sales number; SHOPEEFOOD visit purpose adds Rp3,000 per sale. Split payments use their recorded proportions. Adjustments are allocated proportionally to payments and product lines. Sales use Sales Date when available, otherwise Sales Date In.</p>

    <template v-if="analytics">
      <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <header class="mb-4"><h2 class="text-sm font-bold text-slate-900">Top 5 Products</h2><p class="text-xs text-slate-500">By quantity sold · Selected store · Independent of date filter · Excludes packages and non-ranking categories</p></header>
        <div class="grid gap-4 xl:grid-cols-2">
          <article v-for="window in [{title:'Last 7 Days', rows:analytics.topProductsLastWeek}, {title:'This Month', rows:analytics.topProductsThisMonth}]" :key="window.title" class="rounded-xl border border-slate-100 p-3">
            <h3 class="mb-3 text-sm font-bold">{{ window.title }}</h3>
            <table class="w-full text-xs"><thead class="bg-slate-50 text-left text-slate-500"><tr><th class="p-2">#</th><th class="p-2">Product</th><th class="p-2 text-right">Qty</th><th class="p-2 text-right">Revenue</th></tr></thead>
              <tbody><tr v-for="(item, index) in window.rows" :key="item.name" class="border-t border-slate-100"><td class="p-2">{{ index + 1 }}</td><td class="p-2">{{ item.name }}</td><td class="p-2 text-right">{{ item.qty.toLocaleString('id-ID') }}</td><td class="p-2 text-right font-mono">{{ money(item.sales) }}</td></tr><tr v-if="!window.rows.length"><td colspan="4" class="p-4 text-center text-slate-400">No product sales in this period.</td></tr></tbody>
            </table>
          </article>
        </div>
      </section>

      <section v-for="group in [{title:'Sales by Visit Purpose', chart:'Visit Purpose Sales Distribution', rows:analytics.purposes}, {title:'Sales by Payment Method', chart:'Payment Share Chart', rows:analytics.payments}]" :key="group.title" class="grid gap-4 lg:grid-cols-2">
        <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header class="border-b border-slate-100 px-4 py-3"><h2 class="text-sm font-bold">{{ group.title }}</h2></header>
          <table class="w-full text-left text-xs"><thead class="bg-slate-50 text-slate-500"><tr><th class="px-4 py-2">Name</th><th class="px-4 py-2 text-right">Sales</th><th class="px-4 py-2 text-right">Share</th></tr></thead>
            <tbody><tr v-for="item in group.rows" :key="item.name" class="border-t border-slate-100"><td class="px-4 py-2 font-semibold">{{ item.name }}</td><td class="px-4 py-2 text-right font-mono">{{ money(item.sales) }}</td><td class="px-4 py-2 text-right">{{ percent(item.sales, analytics.adjustedRevenue) }}</td></tr><tr v-if="!group.rows.length"><td colspan="3" class="p-4 text-center text-slate-400">No sales in this period.</td></tr></tbody>
          </table>
        </article>
        <article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header class="border-b border-slate-100 px-4 py-3"><h3 class="text-sm font-bold">{{ group.chart }}</h3></header>
          <AnalyticsPieChart :items="group.rows.filter((item) => item.sales > 0)" :max-items="group.rows.length" show-values-on-hover show-legend-values />
        </article>
      </section>

      <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div><h2 class="text-sm font-bold">Top Products</h2><p class="text-xs text-slate-500">Top ten by quantity or adjusted revenue · Selected store and date range</p></div>
          <div class="flex gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Rank products by">
            <button v-for="sort in [{id:'qty', label:'Qty sold'}, {id:'sales', label:'Revenue'}]" :key="sort.id" type="button" class="rounded-lg px-3 py-1.5 text-xs font-bold" :class="topProductSort === sort.id ? 'bg-white shadow-sm' : 'text-slate-600'" @click="topProductSort = sort.id">{{ sort.label }}</button>
          </div>
        </header>
        <table class="w-full text-left text-xs"><thead class="bg-slate-50 text-slate-500"><tr><th class="px-4 py-2">Product</th><th class="px-4 py-2 text-right">Qty</th><th class="px-4 py-2 text-right">Sales</th></tr></thead>
          <tbody><tr v-for="item in topProducts" :key="item.name" class="border-t border-slate-100"><td class="px-4 py-2">{{ item.name }}</td><td class="px-4 py-2 text-right">{{ item.qty.toLocaleString('id-ID') }}</td><td class="px-4 py-2 text-right font-mono">{{ money(item.sales) }}</td></tr><tr v-if="!topProducts.length"><td colspan="3" class="p-4 text-center text-slate-400">No product sales in this period.</td></tr></tbody>
        </table>
      </section>
    </template>
  </main>
</template>
