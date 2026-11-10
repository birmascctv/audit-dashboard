<script setup>
import { onMounted, ref } from 'vue';
import { authFetchJson } from '../services/authFetch.js';

const stores = ref([]);
const storeId = ref('');
const startDate = ref('');
const endDate = ref('');
const analytics = ref(null);
const loading = ref(false);
const error = ref('');
const money = (value) => `Rp ${Math.round(Number(value) || 0).toLocaleString('id-ID')}`;

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
        <p class="text-xs text-slate-500">Transaction-level revenue adjustments from the Sales Report data</p>
      </div>
      <router-link to="/sales" class="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Back to Sales Report</router-link>
    </header>

    <form class="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" @submit.prevent="load">
      <label class="text-xs font-bold text-slate-600">Store
        <select v-model="storeId" class="mt-1 block rounded-lg border border-slate-200 p-2 text-sm"><option value="">All stores</option><option v-for="store in stores" :key="store.name" :value="store.name">{{ store.name }}</option></select>
      </label>
      <label class="text-xs font-bold text-slate-600">Start date<input v-model="startDate" type="date" class="mt-1 block rounded-lg border border-slate-200 p-2 text-sm"></label>
      <label class="text-xs font-bold text-slate-600">End date<input v-model="endDate" type="date" class="mt-1 block rounded-lg border border-slate-200 p-2 text-sm"></label>
      <button class="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" :disabled="loading">{{ loading ? 'Loading…' : 'Apply' }}</button>
    </form>

    <p v-if="error" role="alert" class="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{{ error }}</p>
    <template v-if="analytics">
      <div v-if="analytics.missingRows || analytics.excludedOrders" role="alert" class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p v-if="analytics.missingRows">{{ analytics.missingRows.toLocaleString('id-ID') }} rows ({{ money(analytics.missingRevenue) }}) have no saved Sales Number and are excluded from these totals. Delete the old uploaded files in Sales Report, then re-upload the original ESB CSVs to restore them.</p>
        <p v-if="analytics.excludedOrders">{{ analytics.excludedOrders.toLocaleString('id-ID') }} sales ({{ money(analytics.excludedRevenue) }}) have inconsistent or unreadable payment/visit details and are excluded.</p>
      </div>
      <p class="text-xs text-slate-500">Only identifiable, consistent sales are included. CASH and QRIS BCA portions are rounded to the nearest Rp1,000 per sales number; SHOPEEFOOD visit purpose adds Rp3,000 per sales number. Split payments are allocated in proportion to their recorded amounts. A sale belongs to the date of its earliest row.</p>
      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article v-for="card in [{label:'Original revenue', value:analytics.baseRevenue}, {label:'Rounding adjustment', value:analytics.roundingAdjustment}, {label:'ShopeeFood adjustment', value:analytics.shopeeAdjustment}, {label:'ESB adjusted revenue', value:analytics.adjustedRevenue}]" :key="card.label" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-bold uppercase text-slate-500">{{ card.label }}</p><p class="mt-2 text-xl font-black text-slate-900">{{ money(card.value) }}</p>
        </article>
      </section>
      <p class="text-xs text-slate-500">{{ analytics.transactionCount.toLocaleString('id-ID') }} included sales. Payment totals exclude the separately displayed ShopeeFood adjustment.</p>
      <section class="grid gap-4 lg:grid-cols-2">
        <article v-for="group in [{title:'Revenue by payment method', rows:analytics.payments}, {title:'Adjusted revenue by store', rows:analytics.stores}]" :key="group.title" class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 class="mb-3 text-sm font-bold text-slate-900">{{ group.title }}</h2>
          <table class="w-full text-sm"><tbody><tr v-for="row in group.rows" :key="row.name" class="border-t border-slate-100"><td class="py-2">{{ row.name }}</td><td class="py-2 text-right font-semibold">{{ money(row.sales) }}</td></tr><tr v-if="!group.rows.length"><td class="py-2 text-slate-500">No included sales for these filters.</td></tr></tbody></table>
        </article>
      </section>
    </template>
  </main>
</template>
