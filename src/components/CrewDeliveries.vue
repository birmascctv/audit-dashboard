<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { authFetchJson } from '../services/authFetch.js';
import { fmtDate, fmtJakarta } from '../utils/date.js';
import { useToast } from '../composables/useToast.js';
import { useAuth } from '../composables/useAuth.js';
import DateField from './DateField.vue';

const props = defineProps({
  storeId: { type: String, required: true },
  stores: { type: Array, default: () => [] },
  products: { type: Array, default: () => [] },
});
const toast = useToast();
const { currentUser } = useAuth();
const isOwner = computed(() => currentUser.value?.role === 'owner');

const deliveries = ref([]);
const pending = ref({});
const loading = ref(false);
const showForm = ref(false);
const showHistory = ref(false);
const saving = ref(false);
const actionDates = ref({});

const today = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const storeName = (id) => (props.stores.find((s) => s.id === id)?.name || id).replace(/^Birmas\s+/i, '');
const otherStores = computed(() => props.stores.filter((s) => s.id !== form.value.sourceStoreId));

const emptyLine = () => ({ search: '', productId: '', productName: '', qtyTotal: null, alloc: {} });
const form = ref({ sourceStoreId: props.storeId, arrivedOn: today(), note: '', lines: [emptyLine()] });

const productByTitle = computed(() => new Map(props.products.map((p) => [String(p.productTitle).toUpperCase(), p])));
function pickProduct(line) {
  const p = productByTitle.value.get(String(line.search || '').trim().toUpperCase());
  line.productId = p ? p.wpId : '';
  line.productName = p ? p.productTitle : '';
}
const forOthers = (line) => Object.values(line.alloc).reduce((sum, q) => sum + (Number(q) || 0), 0);
const keepHere = (line) => (Number(line.qtyTotal) || 0) - forOthers(line);
const formError = computed(() => {
  for (const l of form.value.lines) {
    if (!l.productId) return 'Pick every product from the list.';
    if (!(Number(l.qtyTotal) > 0)) return 'Enter how many arrived for every product.';
    if (keepHere(l) < 0) return `${l.productName}: you gave other stores more than what arrived.`;
  }
  return '';
});

async function load() {
  if (!props.storeId) return;
  loading.value = true;
  try {
    const [d, p] = await Promise.all([
      authFetchJson(`/api/crew/deliveries?storeId=${encodeURIComponent(props.storeId)}`),
      authFetchJson(`/api/crew/pending-esb?storeId=${encodeURIComponent(props.storeId)}`),
    ]);
    deliveries.value = d.deliveries || [];
    pending.value = p.pending || {};
  } catch (e) {
    toast.error(e.message);
  } finally {
    loading.value = false;
  }
}
watch(() => props.storeId, () => { form.value.sourceStoreId = props.storeId; load(); });
let refreshTimer = null;
onMounted(() => { load(); refreshTimer = setInterval(load, 30000); });
onUnmounted(() => clearInterval(refreshTimer));

function openForm() {
  form.value = { sourceStoreId: props.storeId, arrivedOn: today(), note: '', lines: [emptyLine()] };
  showForm.value = true;
}
async function saveDelivery() {
  if (formError.value) return toast.error(formError.value);
  saving.value = true;
  try {
    await authFetchJson('/api/crew/deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceStoreId: form.value.sourceStoreId,
        arrivedOn: form.value.arrivedOn,
        note: form.value.note,
        lines: form.value.lines.map((l) => ({
          productId: l.productId, productName: l.productName, qtyTotal: Number(l.qtyTotal),
          allocations: Object.entries(l.alloc).filter(([, q]) => Number(q) > 0).map(([destStoreId, q]) => ({ destStoreId, qty: Number(q) })),
        })),
      }),
    });
    toast.success('Delivery saved.');
    showForm.value = false;
    await load();
  } catch (e) {
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
async function act(alloc, action) {
  try {
    await authFetchJson(`/api/crew/allocations/${alloc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, date: actionDates.value[alloc.id] || today() }),
    });
    await load();
  } catch (e) {
    toast.error(e.message);
  }
}
async function removeDelivery(d) {
  if (!window.confirm(`Delete the delivery of ${fmtDate(d.arrivedOn)}?`)) return;
  try {
    await authFetchJson(`/api/crew/deliveries/${d.id}`, { method: 'DELETE' });
    await load();
  } catch (e) {
    toast.error(e.message);
  }
}

const pendingList = computed(() => Object.entries(pending.value).map(([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name)));

function esbBadge(esb, label = 'ESB') {
  if (!esb || esb.state === 'not_yet') return null;
  if (esb.state === 'updated') {
    const lag = esb.lagDays === 0 ? 'same day' : `${esb.lagDays} day${esb.lagDays > 1 ? 's' : ''} later`;
    return { cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', text: `${label} updated ${fmtJakarta(esb.at)} (+${esb.delta}, ${lag})` };
  }
  if (esb.state === 'overdue') return { cls: 'bg-rose-100 text-rose-800 border-rose-300', text: `${label} not updated after ${esb.waitingDays} days` };
  return { cls: 'bg-amber-100 text-amber-900 border-amber-300', text: `Waiting for ${label} update${esb.waitingDays ? ` (${esb.waitingDays} day${esb.waitingDays > 1 ? 's' : ''})` : ''}` };
}
const transferRows = computed(() => deliveries.value.flatMap((d) => d.lines.flatMap((line) => line.allocations.map((allocation) => ({
  ...allocation,
  deliveryId: d.id,
  sourceStoreId: d.sourceStoreId,
  sourceStoreName: storeName(d.sourceStoreId),
  productName: line.productName,
  createdAt: d.createdAt,
})))));
const statusLabel = { planned: 'Planned', sent: 'On the Way', received: 'Received' };
const statusCls = { planned: 'bg-slate-100 text-slate-700', sent: 'bg-sky-100 text-sky-800', received: 'bg-emerald-100 text-emerald-800' };
const canSend = (row) => row.sourceStoreId === props.storeId && row.status === 'planned';
const canReceive = (row) => row.destStoreId === props.storeId && row.status === 'sent';
const displayStatus = (row) => row.destStoreId === props.storeId && row.status === 'sent'
  ? 'Incoming · On the Way'
  : statusLabel[row.status];
</script>

<template>
  <section class="bg-white rounded-2xl p-5 border border-violet-200 shadow-sm space-y-4" data-testid="crew-panel">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-base font-black text-slate-900">Deliveries &amp; transfers</h3>
        <p class="text-xs text-slate-500 mt-0.5">
          Record what arrived, who it is for, when it was sent and received. ESB is often updated 1–3 days late, so each step shows whether ESB has caught up.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700" @click="showHistory = true">Deliveries &amp; Transfers History</button>
        <button v-if="isOwner" type="button" class="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-extrabold" @click="openForm">+ New delivery</button>
      </div>
    </div>

    <div v-if="pendingList.length" class="rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p class="text-xs font-bold text-amber-900 mb-1.5">Products in {{ storeName(storeId) }} that are not in ESB yet</p>
      <ul class="flex flex-wrap gap-2">
        <li v-for="p in pendingList" :key="p.id" class="rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800">
          {{ p.name }} <span class="font-mono text-amber-800">+{{ p.qty }}</span>
        </li>
      </ul>
      <p class="mt-1.5 text-[11px] text-amber-800">When the audit shows these products short, the difference may just be an ESB entry that is still missing.</p>
    </div>

    <form v-if="showForm" class="rounded-2xl border border-violet-300 bg-violet-50/50 p-4 space-y-3" @submit.prevent="saveDelivery">
      <div class="flex flex-wrap items-end gap-3">
        <label class="text-[11px] font-bold text-slate-600">Products arrived at
          <select v-model="form.sourceStoreId" class="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900">
            <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <label class="text-[11px] font-bold text-slate-600">Arrival date
          <DateField v-model="form.arrivedOn" class="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900" />
        </label>
        <label class="grow text-[11px] font-bold text-slate-600">Note (optional)
          <input v-model="form.note" maxlength="300" type="text" class="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900" placeholder="Supplier, driver, invoice…" />
        </label>
      </div>

      <div class="space-y-2">
        <div v-for="(line, i) in form.lines" :key="i" class="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[2fr_1fr_repeat(2,1fr)_auto] items-end">
          <label class="text-[11px] font-bold text-slate-600">Product
            <input v-model="line.search" list="crew-products" type="text" class="mt-1 block w-full rounded-lg border px-2 py-1.5 text-xs text-slate-900" :class="line.productId ? 'border-emerald-400' : 'border-slate-300'" placeholder="Type to search…" @input="pickProduct(line)" />
          </label>
          <label class="text-[11px] font-bold text-slate-600">Arrived qty
            <input v-model.number="line.qtyTotal" type="number" min="1" class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900" />
          </label>
          <label v-for="s in otherStores" :key="s.id" class="text-[11px] font-bold text-slate-600">For {{ storeName(s.id) }}
            <input v-model.number="line.alloc[s.id]" type="number" min="0" class="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900" />
          </label>
          <div class="flex items-center gap-2 text-xs">
            <span class="rounded-lg px-2 py-1 font-bold" :class="keepHere(line) < 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'">Stays here: {{ keepHere(line) }}</span>
            <button v-if="form.lines.length > 1" type="button" class="text-rose-600 font-bold" title="Remove product" @click="form.lines.splice(i, 1)">✕</button>
          </div>
        </div>
        <datalist id="crew-products"><option v-for="p in products" :key="p.wpId" :value="p.productTitle" /></datalist>
        <button type="button" class="text-xs font-bold text-violet-700 hover:underline" @click="form.lines.push(emptyLine())">+ Add another product</button>
      </div>

      <p v-if="formError" class="text-xs font-semibold text-rose-700">{{ formError }}</p>
      <div class="flex gap-2">
        <button type="submit" :disabled="saving" class="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-extrabold disabled:opacity-50">Save delivery</button>
        <button type="button" class="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700" @click="showForm = false">Cancel</button>
      </div>
    </form>

    <p v-if="loading && !transferRows.length" class="text-xs text-slate-500">Loading…</p>
    <p v-else-if="!transferRows.length" class="text-xs text-slate-500">No deliveries or transfers recorded for {{ storeName(storeId) }} yet.</p>
    <div v-else class="overflow-x-auto rounded-xl border border-slate-200">
      <table class="w-full min-w-[980px] text-left text-xs">
        <thead class="bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
          <tr>
            <th class="px-3 py-2">Product</th><th class="px-3 py-2 text-right">Qty</th><th class="px-3 py-2">Send to</th>
            <th class="px-3 py-2">Status</th><th class="px-3 py-2">List entered</th><th class="px-3 py-2">Sent</th>
            <th class="px-3 py-2">Received</th><th class="px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="row in transferRows" :key="row.id" class="bg-white">
            <td class="px-3 py-2 font-semibold text-slate-900">{{ row.productName }}<span class="block text-[10px] font-normal text-slate-500">From {{ row.sourceStoreName }}</span></td>
            <td class="px-3 py-2 text-right font-mono font-bold">{{ row.qty }}</td>
            <td class="px-3 py-2 font-semibold">{{ storeName(row.destStoreId) }}</td>
            <td class="px-3 py-2"><span class="rounded-full px-2 py-1 font-bold" :class="statusCls[row.status]">{{ displayStatus(row) }}</span></td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">{{ fmtJakarta(row.createdAt) }}</td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">
              <span v-if="row.sentOn">{{ fmtDate(row.sentOn) }}</span><span v-else>—</span>
              <span v-if="row.sentAt" class="block text-[10px]">{{ fmtJakarta(row.sentAt) }}</span>
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-slate-600">
              <span v-if="row.receivedOn">{{ fmtDate(row.receivedOn) }}</span><span v-else>—</span>
              <span v-if="row.receivedAt" class="block text-[10px]">{{ fmtJakarta(row.receivedAt) }}</span>
            </td>
            <td class="px-3 py-2">
              <div v-if="canSend(row) || canReceive(row)" class="flex items-center gap-2">
                <DateField v-model="actionDates[row.id]" class="w-28 rounded-lg border border-slate-300 px-2 py-1 text-[11px]" />
                <button v-if="canSend(row)" type="button" class="rounded-lg bg-sky-600 px-3 py-1.5 font-bold text-white" @click="act(row, 'sent')">Mark Sent</button>
                <button v-if="canReceive(row)" type="button" class="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white" @click="act(row, 'received')">Mark Received</button>
              </div>
              <button v-else-if="isOwner" type="button" class="text-[10px] font-bold text-rose-600 hover:underline" @click="removeDelivery(deliveries.find((d) => d.id === row.deliveryId))">Delete</button>
              <span v-else class="text-slate-400">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showHistory" class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" @click.self="showHistory = false">
      <section class="w-full max-w-6xl rounded-2xl bg-white p-5 shadow-2xl">
        <header class="mb-3 flex items-center justify-between gap-3">
          <h3 class="text-lg font-black text-slate-900">Deliveries &amp; Transfers History</h3>
          <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold" @click="showHistory = false">Close</button>
        </header>
        <div class="max-h-[70vh] overflow-auto rounded-xl border border-slate-200">
          <table class="w-full min-w-[980px] text-left text-xs">
            <thead class="sticky top-0 bg-slate-100 text-[10px] font-bold uppercase text-slate-600"><tr>
              <th class="px-3 py-2">Product</th><th class="px-3 py-2 text-right">Qty</th><th class="px-3 py-2">Send to</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">List entered</th><th class="px-3 py-2">Sent</th><th class="px-3 py-2">Received</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100"><tr v-for="row in transferRows" :key="`history-${row.id}`">
              <td class="px-3 py-2 font-semibold">{{ row.productName }}<span class="block text-[10px] font-normal text-slate-500">From {{ row.sourceStoreName }}</span></td>
              <td class="px-3 py-2 text-right font-mono font-bold">{{ row.qty }}</td><td class="px-3 py-2">{{ storeName(row.destStoreId) }}</td>
              <td class="px-3 py-2"><span class="rounded-full px-2 py-1 font-bold" :class="statusCls[row.status]">{{ displayStatus(row) }}</span></td>
              <td class="px-3 py-2 whitespace-nowrap">{{ fmtJakarta(row.createdAt) }}</td>
              <td class="px-3 py-2 whitespace-nowrap"><span v-if="row.sentOn">{{ fmtDate(row.sentOn) }}</span><span v-else>—</span><span v-if="row.sentAt" class="block text-[10px]">{{ fmtJakarta(row.sentAt) }}</span></td>
              <td class="px-3 py-2 whitespace-nowrap"><span v-if="row.receivedOn">{{ fmtDate(row.receivedOn) }}</span><span v-else>—</span><span v-if="row.receivedAt" class="block text-[10px]">{{ fmtJakarta(row.receivedAt) }}</span></td>
            </tr></tbody>
          </table>
        </div>
      </section>
    </div>
  </section>
</template>
