<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { authFetchJson } from '../services/authFetch.js';
import { fmtDate, fmtJakarta } from '../utils/date.js';
import { useToast } from '../composables/useToast.js';
import DateField from './DateField.vue';

const props = defineProps({
  storeId: { type: String, required: true },
  stores: { type: Array, default: () => [] },
  products: { type: Array, default: () => [] },
});
const toast = useToast();

const deliveries = ref([]);
const pending = ref({});
const loading = ref(false);
const showForm = ref(false);
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
onMounted(load);

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
const statusLabel = { planned: 'Planned', sent: 'On the way', received: 'Received' };
const statusCls = { planned: 'bg-slate-100 text-slate-700', sent: 'bg-sky-100 text-sky-800', received: 'bg-emerald-100 text-emerald-800' };
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
      <button type="button" class="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-extrabold" @click="openForm">+ New delivery</button>
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

    <p v-if="loading && !deliveries.length" class="text-xs text-slate-500">Loading…</p>
    <p v-else-if="!deliveries.length" class="text-xs text-slate-500">No deliveries recorded for {{ storeName(storeId) }} yet.</p>

    <article v-for="d in deliveries" :key="d.id" class="rounded-2xl border border-slate-200 overflow-hidden">
      <header class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5 border-b border-slate-200">
        <div class="text-xs">
          <strong class="text-slate-900">{{ fmtDate(d.arrivedOn) }}</strong>
          <span class="text-slate-600"> · arrived at <strong>{{ storeName(d.sourceStoreId) }}</strong> · by {{ d.createdBy }}</span>
          <span v-if="d.note" class="text-slate-500"> · {{ d.note }}</span>
        </div>
        <button type="button" class="text-[11px] font-bold text-rose-600 hover:underline" @click="removeDelivery(d)">Delete</button>
      </header>
      <div class="divide-y divide-slate-100">
        <div v-for="l in d.lines" :key="l.id" class="px-4 py-3 space-y-2">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <strong class="text-slate-900">{{ l.productName }}</strong>
            <span class="rounded-md bg-slate-100 px-2 py-0.5 font-mono font-bold">{{ l.qtyTotal }} arrived</span>
            <span class="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">{{ l.keepQty }} stays at {{ storeName(d.sourceStoreId) }}</span>
            <span v-if="esbBadge(l.sourceEsb, `ESB ${storeName(d.sourceStoreId)}`)" class="rounded-md border px-2 py-0.5 font-semibold" :class="esbBadge(l.sourceEsb, `ESB ${storeName(d.sourceStoreId)}`).cls">{{ esbBadge(l.sourceEsb, `ESB ${storeName(d.sourceStoreId)}`).text }}</span>
          </div>
          <div v-for="a in l.allocations" :key="a.id" class="ml-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
            <span class="font-bold text-slate-900">→ {{ storeName(a.destStoreId) }}</span>
            <span class="font-mono font-bold">{{ a.qty }}</span>
            <span class="rounded-md px-2 py-0.5 font-bold" :class="statusCls[a.status]">{{ statusLabel[a.status] }}</span>
            <span v-if="a.sentOn" class="text-slate-500">sent {{ fmtDate(a.sentOn) }}</span>
            <span v-if="a.receivedOn" class="text-slate-500">received {{ fmtDate(a.receivedOn) }}</span>
            <span v-if="esbBadge(a.destEsb, `ESB ${storeName(a.destStoreId)}`)" class="rounded-md border px-2 py-0.5 font-semibold" :class="esbBadge(a.destEsb, `ESB ${storeName(a.destStoreId)}`).cls">{{ esbBadge(a.destEsb, `ESB ${storeName(a.destStoreId)}`).text }}</span>
            <span v-if="a.sourceEsbOn" class="text-emerald-700">transfer-out entered in ESB {{ fmtDate(a.sourceEsbOn) }}</span>
            <span class="ml-auto flex flex-wrap items-center gap-2">
              <DateField v-if="a.status !== 'received'" v-model="actionDates[a.id]" class="rounded-lg border border-slate-300 px-2 py-1 text-[11px]" />
              <button v-if="a.status === 'planned'" type="button" class="rounded-lg bg-sky-600 px-3 py-1 font-bold text-white" @click="act(a, 'sent')">Mark sent</button>
              <button v-if="a.status !== 'received'" type="button" class="rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white" @click="act(a, 'received')">Mark received</button>
              <button v-if="a.status !== 'planned' && !a.sourceEsbOn" type="button" class="rounded-lg border border-slate-300 px-3 py-1 font-bold text-slate-700" @click="act(a, 'source_esb_done')">Transfer-out entered in ESB</button>
              <button v-if="a.status !== 'planned'" type="button" class="font-bold text-slate-500 hover:underline" @click="act(a, 'undo')">Undo</button>
            </span>
          </div>
        </div>
      </div>
    </article>
  </section>
</template>
