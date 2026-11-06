<script setup>
import { computed, ref, watch } from 'vue';
import { fmtJakarta } from '../utils/date.js';

const props = defineProps({
  items: { type: Array, default: () => [] },
  history: { type: Array, default: () => [] },
  storeId: { type: String, default: '' },
  storeName: { type: String, default: '' },
  loading: { type: Boolean, default: false },
});
const search = ref('');
const page = ref(1);
const active = computed(() => props.items.some((item) => item.scannedCount > 0));
const latest = computed(() => props.history.find((audit) => audit.storeId === props.storeId && (audit.items || audit.records)?.length));
const archivedItems = computed(() => latest.value?.items || latest.value?.records || []);
const rows = computed(() => {
  const source = !active.value && latest.value ? archivedItems.value : props.items;
  const query = search.value.trim().toLowerCase();
  return source.filter((item) => !query || `${item.productTitle || item.varian || ''} ${item.barcode || ''}`.toLowerCase().includes(query))
    .slice().sort((a, b) => String(a.productTitle || a.varian || '').localeCompare(String(b.productTitle || b.varian || ''), undefined, { numeric: true, sensitivity: 'base' }));
});
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 25)));
const visibleRows = computed(() => rows.value.slice((page.value - 1) * 25, page.value * 25));
watch([search, () => props.storeId], () => { page.value = 1; });
watch(pages, (count) => { page.value = Math.min(page.value, count); });

function difference(item) {
  if (!latest.value || active.value) {
    if (!(Number(item.scannedCount) > 0)) return null;
  }
  return (Number(item.scannedCount) || 0) - Math.max(0, Number(item.wpExpectedQty) || 0);
}
function lastAudit(item) {
  return !active.value && latest.value ? latest.value.completedAt || latest.value.timestamp : item.lastScannedAt;
}
</script>

<template>
  <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="stock-comparison">
    <div class="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 p-4">
      <div>
        <h3 class="text-base font-bold text-slate-900">{{ storeName }} Store Physical Count vs ESB</h3>
        <p class="mt-1 text-xs text-slate-500">
          {{ !active && latest ? 'Latest completed audit; quantities reflect the audit snapshot.' : 'Current counting session; unscanned products have no recorded result.' }}
        </p>
      </div>
      <input v-model="search" type="search" placeholder="Search product or barcode" class="rounded-xl border border-slate-300 px-3 py-2 text-xs" />
    </div>
    <div class="overflow-x-auto">
      <table class="w-full min-w-[850px] text-left text-xs">
        <thead class="bg-slate-100 uppercase text-slate-600"><tr>
          <th class="px-4 py-3">Barcode</th><th class="px-4 py-3">Product name</th><th class="px-4 py-3 text-right" title="System stock">Qty</th>
          <th class="px-4 py-3 text-right">Missing</th><th class="px-4 py-3 text-right">Surplus</th><th class="px-4 py-3">Last audit</th><th class="px-4 py-3">Notes</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="(item, index) in visibleRows" :key="`${item.wpId || item.barcode || item.productTitle}-${index}`" class="even:bg-slate-50">
            <td class="px-4 py-3 font-mono">{{ item.barcode || '—' }}</td>
            <td class="px-4 py-3 font-semibold">{{ item.productTitle || item.varian }}</td>
            <td class="px-4 py-3 text-right font-mono">{{ Math.max(0, Number(item.wpExpectedQty) || 0) }}</td>
            <td class="px-4 py-3 text-right font-mono text-rose-700">{{ difference(item) === null ? '—' : Math.max(0, -difference(item)) }}</td>
            <td class="px-4 py-3 text-right font-mono text-amber-700">{{ difference(item) === null ? '—' : Math.max(0, difference(item)) }}</td>
            <td class="px-4 py-3 whitespace-nowrap">{{ lastAudit(item) ? fmtJakarta(lastAudit(item)) : '—' }}</td>
            <td class="px-4 py-3">{{ item.note || '—' }}</td>
          </tr>
          <tr v-if="!visibleRows.length"><td colspan="7" class="p-5 text-center text-slate-500">{{ loading ? 'Loading…' : 'No matching products.' }}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
      <span>Page {{ page }} of {{ pages }} · {{ rows.length }} products</span>
      <div class="flex gap-2"><button type="button" class="rounded border px-3 py-1 disabled:opacity-40" :disabled="page <= 1" @click="page--">Previous</button><button type="button" class="rounded border px-3 py-1 disabled:opacity-40" :disabled="page >= pages" @click="page++">Next</button></div>
    </div>
  </section>
</template>
