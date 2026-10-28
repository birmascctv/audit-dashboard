<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuditStore } from '../composables/useAuditStore.js';
import { useAuth } from '../composables/useAuth.js';
import { authFetchJson } from '../services/authFetch.js';
import { fetchAuditHistory } from '../services/wordpressApi.js';
import { formatDateTime, exportToCSV } from '../utils/storage.js';
import {
  History,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  Calendar,
  Building2,
  Eye,
  X,
  Trophy,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Award,
  Layers,
  ArrowUpDown,
  BarChart3,
  Flame,
  Pencil,
  Check
} from 'lucide-vue-next';

const { auditHistory, clearHistory, stores } = useAuditStore();
const { isSuperAdmin } = useAuth();

const searchQuery = ref('');
const expandedId = ref(null);
const isLoadingHistory = ref(false);
const editingAudit = ref(null);
const editForm = ref({ id: '', auditorName: '', notes: '', date: '' });
const editError = ref('');
const deletingAudit = ref(null);
const deleteError = ref('');
const isSaving = ref(false);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function sessionItems(a) {
  return Array.isArray(a.items) && a.items.length ? a.items : Array.isArray(a.records) ? a.records : [];
}

// Missing/surplus in units (cans); falls back to SKU counts when item details are absent
function missingUnits(a) {
  const items = sessionItems(a);
  if (items.length) {
    return items.reduce((s, i) => (num(i.wpExpectedQty) > 0 && num(i.scannedCount) < num(i.wpExpectedQty) ? s + num(i.wpExpectedQty) - num(i.scannedCount) : s), 0);
  }
  return num(a.missingCount);
}

function surplusUnits(a) {
  const items = sessionItems(a);
  if (items.length) {
    return items.reduce((s, i) => (num(i.scannedCount) > Math.max(num(i.wpExpectedQty), 0) ? s + num(i.scannedCount) - Math.max(num(i.wpExpectedQty), 0) : s), 0);
  }
  return num(a.surplusCount);
}

function sessionAccuracy(a) {
  if (a.accuracy !== null && a.accuracy !== undefined && Number.isFinite(Number(a.accuracy))) {
    return Math.max(0, Math.min(100, Number(a.accuracy)));
  }
  return 100;
}

const matchedItems = (a) => sessionItems(a).filter((i) => i.status === 'matched' && num(i.wpExpectedQty) !== 0);
const discrepancyItems = (a) => sessionItems(a).filter((i) => i.status !== 'matched' && (num(i.discrepancy) !== 0 || i.note));

function toLocalInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function updateAuditRecord(id, body) {
  return await authFetchJson(`/api/audit/history/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function deleteAuditRecord(id) {
  return await authFetchJson(`/api/audit/history/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

onMounted(async () => {
  isLoadingHistory.value = true;
  try {
    const list = await fetchAuditHistory();
    if (list && Array.isArray(list)) {
      auditHistory.value = list;
    }
  } catch (_) {
  } finally {
    isLoadingHistory.value = false;
  }
});

// Aggregate shrinkage statistics per store
const shrinkageLeaderboard = computed(() => {
  const storeMap = new Map();

  // Seed with all known stores
  (stores.value || []).forEach((s) => {
    storeMap.set(s.name, {
      storeId: s.id,
      storeName: s.name,
      city: s.city || 'Jakarta',
      totalAudits: 0,
      totalExpected: 0,
      totalScanned: 0,
      totalMissing: 0,
      totalSurplus: 0,
      accWeighted: 0,
      accWeight: 0,
      lastAuditDate: null,
      lastAuditor: null,
    });
  });

  // Aggregate audit history
  (auditHistory.value || []).forEach((a) => {
    const sName = a.storeName || 'Unknown Store';
    if (!storeMap.has(sName)) {
      storeMap.set(sName, {
        storeId: a.storeId || sName,
        storeName: sName,
        city: 'Jakarta',
        totalAudits: 0,
        totalExpected: 0,
        totalScanned: 0,
        totalMissing: 0,
        totalSurplus: 0,
        accWeighted: 0,
        accWeight: 0,
        lastAuditDate: null,
        lastAuditor: null,
      });
    }

    const entry = storeMap.get(sName);
    entry.totalAudits += 1;
    entry.totalExpected += num(a.totalExpected);
    entry.totalScanned += num(a.totalScanned);
    entry.totalMissing += missingUnits(a);
    entry.totalSurplus += surplusUnits(a);
    // Accuracy is averaged per session, weighted by expected units (weight 1 when unknown)
    const w = Math.max(num(a.totalExpected), 1);
    entry.accWeighted += sessionAccuracy(a) * w;
    entry.accWeight += w;
    if (!entry.lastAuditDate || new Date(a.completedAt) > new Date(entry.lastAuditDate)) {
      entry.lastAuditDate = a.completedAt;
      entry.lastAuditor = a.auditorName;
    }
  });

  const list = Array.from(storeMap.values()).map((item) => {
    const netDiscrepancy = item.totalScanned - item.totalExpected;
    const accuracy = item.accWeight > 0 ? Math.round((item.accWeighted / item.accWeight) * 10) / 10 : 100;

    let riskLevel = 'LOW';
    if (item.totalMissing > 10 || accuracy < 90) {
      riskLevel = 'HIGH';
    } else if (item.totalMissing > 3 || accuracy < 96) {
      riskLevel = 'MEDIUM';
    }

    return {
      ...item,
      netDiscrepancy,
      accuracy,
      riskLevel,
    };
  });

  // Sort by highest missing (shrinkage) first
  return list.sort((a, b) => b.totalMissing - a.totalMissing || a.accuracy - b.accuracy);
});

// Top metrics
const worstShrinkageStore = computed(() => {
  const withAudits = shrinkageLeaderboard.value.filter(s => s.totalAudits > 0);
  return withAudits.length > 0 ? withAudits[0] : null;
});

const bestAccuracyStore = computed(() => {
  const withAudits = shrinkageLeaderboard.value.filter(s => s.totalAudits > 0);
  if (withAudits.length === 0) return null;
  return withAudits.slice().sort((a, b) => b.accuracy - a.accuracy || a.totalMissing - b.totalMissing)[0];
});

const totalChainMissing = computed(() => {
  return shrinkageLeaderboard.value.reduce((acc, s) => acc + s.totalMissing, 0);
});

// Chain accuracy = expected-weighted average of every archived session's accuracy
const overallChainAccuracy = computed(() => {
  const list = auditHistory.value || [];
  if (list.length === 0) return null;
  let sum = 0;
  let weight = 0;
  list.forEach((a) => {
    const w = Math.max(num(a.totalExpected), 1);
    sum += sessionAccuracy(a) * w;
    weight += w;
  });
  return weight > 0 ? Math.round((sum / weight) * 10) / 10 : null;
});

function startEdit(audit) {
  editError.value = '';
  editForm.value = {
    id: audit.id,
    auditorName: audit.auditorName || '',
    notes: audit.notes || '',
    date: toLocalInput(audit.completedAt),
  };
  editingAudit.value = audit;
}

async function saveEdit() {
  if (!editForm.value.auditorName.trim()) {
    editError.value = 'Auditor name is required';
    return;
  }
  isSaving.value = true;
  editError.value = '';
  try {
    const res = await updateAuditRecord(editForm.value.id, {
      auditorName: editForm.value.auditorName.trim(),
      notes: editForm.value.notes,
      completedAt: editForm.value.date ? new Date(editForm.value.date).toISOString() : undefined,
    });
    if (!res.success) throw new Error(res.error || 'Update failed');
    const idx = auditHistory.value.findIndex((a) => a.id === editForm.value.id);
    if (idx >= 0 && res.audit) auditHistory.value[idx] = res.audit;
    editingAudit.value = null;
  } catch (err) {
    editError.value = err.message;
  } finally {
    isSaving.value = false;
  }
}

async function confirmDelete() {
  const target = deletingAudit.value;
  if (!target) return;
  isSaving.value = true;
  try {
    const res = await deleteAuditRecord(target.id);
    if (!res.success) throw new Error(res.error || 'Delete failed');
    auditHistory.value = auditHistory.value.filter((a) => a.id !== target.id);
    if (expandedId.value === target.id) expandedId.value = null;
    deletingAudit.value = null;
  } catch (err) {
    deleteError.value = err.message;
  } finally {
    isSaving.value = false;
  }
}

const filteredHistory = computed(() => {
  const q = searchQuery.value.toLowerCase();
  return (auditHistory.value || []).filter((a) => !q || (a.storeName || '').toLowerCase().includes(q) || (a.auditorName || '').toLowerCase().includes(q));
});

function handleClearHistory() {
  if (confirm('Are you sure you want to clear past audit logs?')) {
    clearHistory();
  }
}

function exportHistoryCSV() {
  const data = auditHistory.value.map((a, idx) => ({
    No: idx + 1,
    'Audit ID': a.id,
    Store: a.storeName,
    Auditor: a.auditorName,
    'Completed At': formatDateTime(a.completedAt).full,
    'Expected Units': a.totalExpected,
    'Scanned Units': a.totalScanned,
    Discrepancy: a.totalScanned - a.totalExpected,
    'Matched SKUs': a.matchedCount,
    'Missing SKUs': a.missingCount,
    'Surplus SKUs': a.surplusCount,
    Notes: a.notes || '',
  }));
  exportToCSV(`Store_Audits_History_${new Date().toISOString().split('T')[0]}.csv`, data);
}

</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <div class="flex items-center gap-2.5">
          <div class="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shadow-xs">
            <Trophy class="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-black text-slate-900 tracking-tight">
                Store Audit Records & History
              </h2>
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 font-bold font-mono">
                {{ stores.length }} Stores Monitored
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">
              Loss prevention rankings, cross-store shrinkage benchmarking, and physical reconciliation archives.
            </p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 self-start md:self-center flex-wrap">
        <button
          @click="exportHistoryCSV"
          :disabled="auditHistory.length === 0"
          type="button"
          class="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 disabled:opacity-40 text-teal-800 border border-teal-200 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          title="Export Audit Records History to CSV"
        >
          <Download class="w-3.5 h-3.5 text-teal-600" />
          <span>Export History CSV</span>
        </button>

        <button
          v-if="isSuperAdmin"
          @click="handleClearHistory"
          :disabled="auditHistory.length === 0"
          type="button"
          class="p-2 rounded-xl bg-slate-50 hover:bg-rose-50 disabled:opacity-40 text-slate-500 hover:text-rose-600 border border-slate-300 text-xs transition-colors cursor-pointer"
          title="Clear History"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- ON TOP OF PAGE: STORE SHRINKAGE LEADERBOARD -->
    <div class="space-y-6">
      <!-- Executive Summary Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Card 1: Overall Accuracy -->
        <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
            <ShieldCheck class="w-6 h-6 text-teal-600" />
          </div>
          <div>
            <span class="text-xs font-bold text-slate-500 block">Overall Chain Accuracy</span>
            <span class="text-xl font-black text-slate-900 font-mono">{{ overallChainAccuracy === null ? '—' : `${overallChainAccuracy}%` }}</span>
            <span class="text-[11px] text-teal-700 font-semibold block mt-0.5">{{ auditHistory.length ? `Weighted avg of ${auditHistory.length} archived audits` : 'Awaiting audits' }}</span>
          </div>
        </div>

        <!-- Card 2: Total Missing Cans -->
        <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
            <Flame class="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <span class="text-xs font-bold text-slate-500 block">Total Missing Units</span>
            <span class="text-xl font-black text-rose-600 font-mono">{{ totalChainMissing > 0 ? "-" : "" }}{{ totalChainMissing }} cans</span>
            <span class="text-[11px] text-rose-700 font-semibold block mt-0.5">Sum across all archived audits</span>
          </div>
        </div>

        <!-- Card 3: Top Performer Store -->
        <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <Award class="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <span class="text-xs font-bold text-slate-500 block">Best Accuracy Store</span>
            <span class="text-sm font-black text-slate-900 block truncate" :title="bestAccuracyStore?.storeName">
              {{ bestAccuracyStore ? bestAccuracyStore.storeName : 'None Yet' }}
            </span>
            <span class="text-[11px] text-emerald-700 font-semibold block mt-0.5">
              {{ bestAccuracyStore ? `${bestAccuracyStore.accuracy}% accuracy` : 'Awaiting audits' }}
            </span>
          </div>
        </div>

        <!-- Card 4: Highest Shrinkage Alert -->
        <div class="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <ShieldAlert class="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <span class="text-xs font-bold text-slate-500 block">Highest Shrinkage Alert</span>
            <span class="text-sm font-black text-amber-950 block truncate" :title="worstShrinkageStore?.storeName">
              {{ worstShrinkageStore && worstShrinkageStore.totalMissing > 0 ? worstShrinkageStore.storeName : 'Zero Critical Losses' }}
            </span>
            <span class="text-[11px] text-amber-700 font-semibold block mt-0.5">
              {{ worstShrinkageStore && worstShrinkageStore.totalMissing > 0 ? `${worstShrinkageStore.totalMissing} cans missing` : 'All branches compliant' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Leaderboard Table -->
      <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div class="p-5 border-b border-slate-100 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <Trophy class="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 class="text-sm font-extrabold text-slate-900">
                Store Shrinkage Leaderboard
              </h3>
              <p class="text-xs text-slate-500">
                Ranked from highest physical stock shrinkage to best inventory compliance.
              </p>
            </div>
          </div>
          <span class="text-xs text-slate-500 font-mono font-bold bg-slate-100 px-2.5 py-1 rounded-lg">
            {{ shrinkageLeaderboard.length }} Outlets
          </span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                <th class="py-3 px-4 w-12 text-center">Rank</th>
                <th class="py-3 px-4">Store Name</th>
                <th class="py-3 px-4 text-center">Audits Filed</th>
                <th class="py-3 px-4 text-center">Missing Cans (Shortage)</th>
                <th class="py-3 px-4 text-center">Surplus Cans</th>
                <th class="py-3 px-4 text-center">Net Variance</th>
                <th class="py-3 px-4 text-center w-40">Accuracy Rate</th>
                <th class="py-3 px-4 text-center">Risk Assessment</th>
                <th class="py-3 px-4 text-right">Last Audit</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="(store, idx) in shrinkageLeaderboard"
                :key="store.storeName"
                class="hover:bg-slate-50/70 transition-colors"
                :class="store.riskLevel === 'HIGH' ? 'bg-rose-50/20' : ''"
              >
                <!-- Rank -->
                <td class="py-3.5 px-4 text-center font-bold">
                  <span
                    v-if="idx === 0 && store.totalMissing > 0"
                    class="w-6 h-6 rounded-full bg-rose-100 text-rose-700 font-black inline-flex items-center justify-center text-xs"
                  >
                    #1
                  </span>
                  <span
                    v-else-if="idx === shrinkageLeaderboard.length - 1 && store.totalAudits > 0"
                    class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black inline-flex items-center justify-center text-xs"
                  >
                    ★
                  </span>
                  <span v-else class="text-slate-400 font-mono text-xs">
                    #{{ idx + 1 }}
                  </span>
                </td>

                <!-- Store Name -->
                <td class="py-3.5 px-4 font-bold text-slate-900">
                  <div class="flex items-center gap-2">
                    <Building2 class="w-4 h-4 text-teal-600 shrink-0" />
                    <span>{{ store.storeName }}</span>
                  </div>
                </td>

                <!-- Audits Filed -->
                <td class="py-3.5 px-4 text-center font-mono font-semibold text-slate-700">
                  {{ store.totalAudits }}
                </td>

                <!-- Missing Cans -->
                <td class="py-3.5 px-4 text-center font-mono font-bold">
                  <span
                    v-if="store.totalMissing > 0"
                    class="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200"
                  >
                    <Flame class="w-3 h-3 text-rose-600" />
                    -{{ store.totalMissing }}
                  </span>
                  <span v-else class="text-emerald-700 font-bold">0</span>
                </td>

                <!-- Surplus Cans -->
                <td class="py-3.5 px-4 text-center font-mono font-semibold text-amber-700">
                  {{ store.totalSurplus > 0 ? `+${store.totalSurplus}` : '0' }}
                </td>

                <!-- Net Variance -->
                <td class="py-3.5 px-4 text-center font-mono font-bold">
                  <span :class="store.netDiscrepancy < 0 ? 'text-rose-600' : store.netDiscrepancy > 0 ? 'text-amber-600' : 'text-emerald-600'">
                    {{ store.netDiscrepancy === 0 ? '0' : store.netDiscrepancy > 0 ? `+${store.netDiscrepancy}` : store.netDiscrepancy }}
                  </span>
                </td>

                <!-- Accuracy Rate -->
                <td class="py-3.5 px-4 text-center">
                  <div class="flex flex-col items-center gap-1">
                    <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden max-w-[120px]">
                      <div
                        class="h-2 rounded-full transition-all"
                        :class="store.accuracy >= 96 ? 'bg-emerald-500' : store.accuracy >= 90 ? 'bg-amber-500' : 'bg-rose-500'"
                        :style="{ width: `${store.accuracy}%` }"
                      ></div>
                    </div>
                    <span class="font-mono font-extrabold text-[11px]" :class="store.accuracy >= 96 ? 'text-emerald-700' : store.accuracy >= 90 ? 'text-amber-700' : 'text-rose-700'">
                      {{ store.accuracy }}%
                    </span>
                  </div>
                </td>

                <!-- Risk Assessment -->
                <td class="py-3.5 px-4 text-center">
                  <span
                    class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold"
                    :class="
                      store.riskLevel === 'HIGH'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : store.riskLevel === 'MEDIUM'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    "
                  >
                    <ShieldAlert v-if="store.riskLevel === 'HIGH'" class="w-3 h-3 text-rose-700" />
                    <AlertTriangle v-else-if="store.riskLevel === 'MEDIUM'" class="w-3 h-3 text-amber-700" />
                    <Check v-else class="w-3 h-3 text-emerald-700" />
                    {{ store.riskLevel === 'HIGH' ? 'Critical Shrinkage' : store.riskLevel === 'MEDIUM' ? 'Caution' : 'Compliant' }}
                  </span>
                </td>

                <!-- Last Audit -->
                <td class="py-3.5 px-4 text-right font-mono text-slate-500 text-[11px]">
                  <span v-if="store.lastAuditDate">{{ formatDateTime(store.lastAuditDate).date }}</span>
                  <span v-else class="text-slate-400 italic">No audits yet</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- COMPLETED AUDIT SESSION ARCHIVE -->
    <div class="space-y-4">
      <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div class="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 class="text-sm font-extrabold text-slate-900">
              Completed Audit Session Archive
            </h3>
            <p class="text-xs text-slate-500">
              Chronological logs of completed physical counts. Use Details to see matched and discrepancy products.
            </p>
          </div>
          <div class="relative w-full sm:w-64">
            <Search class="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search store or auditor..."
              class="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        <table class="w-full table-fixed text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
              <th class="py-2 px-2 w-[14%]">Date & Time</th>
              <th class="py-2 px-2 w-[16%]">Store</th>
              <th class="py-2 px-2 w-[12%]">Auditor</th>
              <th class="py-2 px-1 text-center w-[8%]">Expected</th>
              <th class="py-2 px-1 text-center w-[8%]">Scanned</th>
              <th class="py-2 px-1 text-center w-[9%]">Discrepancy</th>
              <th class="py-2 px-1 text-center w-[7%]">Missing</th>
              <th class="py-2 px-1 text-center w-[8%]">Accuracy</th>
              <th class="py-2 px-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <template v-for="audit in filteredHistory" :key="audit.id">
              <tr
                class="hover:bg-slate-50/80 transition-colors cursor-pointer align-top"
                @click="expandedId = expandedId === audit.id ? null : audit.id"
              >
                <td class="py-2 px-2 font-mono text-slate-700 text-[11px] leading-tight">
                  <span class="block">{{ formatDateTime(audit.completedAt).date }}</span>
                  <span class="block text-slate-400">{{ formatDateTime(audit.completedAt).time }}</span>
                </td>
                <td class="py-2 px-2 font-semibold text-slate-900 break-words">{{ audit.storeName }}</td>
                <td class="py-2 px-2 text-slate-700 break-words">{{ audit.auditorName }}</td>
                <td class="py-2 px-1 text-center font-mono font-bold text-slate-800">{{ audit.totalExpected ?? 0 }}</td>
                <td class="py-2 px-1 text-center font-mono font-bold text-teal-700">{{ audit.totalScanned ?? 0 }}</td>
                <td class="py-2 px-1 text-center font-mono">
                  <span
                    class="px-1.5 py-0.5 rounded-full text-[11px] font-bold inline-block"
                    :class="
                      num(audit.totalScanned) === num(audit.totalExpected)
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : num(audit.totalScanned) < num(audit.totalExpected)
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    "
                  >
                    {{ num(audit.totalScanned) - num(audit.totalExpected) === 0 ? '0' : num(audit.totalScanned) - num(audit.totalExpected) }}
                  </span>
                </td>
                <td class="py-2 px-1 text-center font-mono font-bold" :class="missingUnits(audit) > 0 ? 'text-rose-600' : 'text-emerald-600'">
                  {{ missingUnits(audit) > 0 ? `-${missingUnits(audit)}` : '0' }}
                </td>
                <td class="py-2 px-1 text-center font-mono font-bold" :class="sessionAccuracy(audit) >= 96 ? 'text-emerald-700' : sessionAccuracy(audit) >= 90 ? 'text-amber-700' : 'text-rose-700'">
                  {{ sessionAccuracy(audit) }}%
                </td>
                <td class="py-2 px-2 text-right">
                  <div class="flex items-center justify-end gap-1 flex-wrap">
                    <button
                      @click.stop="expandedId = expandedId === audit.id ? null : audit.id"
                      type="button"
                      class="px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Eye class="w-3 h-3" />
                      <span>{{ expandedId === audit.id ? 'Hide' : 'Details' }}</span>
                    </button>
                    <template v-if="isSuperAdmin">
                      <button
                        @click.stop="startEdit(audit)"
                        type="button"
                        title="Edit session"
                        class="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-300 cursor-pointer"
                      >
                        <Pencil class="w-3 h-3" />
                      </button>
                      <button
                        @click.stop="deleteError = ''; deletingAudit = audit"
                        type="button"
                        title="Remove session"
                        class="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-300 cursor-pointer"
                      >
                        <Trash2 class="w-3 h-3" />
                      </button>
                    </template>
                  </div>
                </td>
              </tr>

              <tr v-if="expandedId === audit.id" class="bg-slate-50/60">
                <td colspan="9" class="px-3 py-3">
                  <p v-if="audit.notes" class="text-xs text-slate-600 mb-2">
                    <span class="font-bold text-slate-700">Session notes:</span> {{ audit.notes }}
                  </p>
                  <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div class="border border-rose-200 rounded-xl bg-white overflow-hidden">
                      <div class="px-3 py-1.5 bg-rose-50 text-rose-800 font-bold text-[11px] uppercase">
                        Discrepancies ({{ discrepancyItems(audit).length }})
                      </div>
                      <div class="max-h-64 overflow-y-auto">
                        <table class="w-full text-left">
                          <thead class="bg-slate-50 text-[10px] uppercase text-slate-500 sticky top-0">
                            <tr>
                              <th class="py-1 px-3">Product</th>
                              <th class="py-1 px-2 text-center w-20">Qty</th>
                              <th class="py-1 px-3 w-[34%]">Notes</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-100">
                            <tr v-for="(item, k) in discrepancyItems(audit)" :key="`d-${k}-${item.barcode}`" class="align-top">
                              <td class="py-1.5 px-3 min-w-0">
                                <span class="font-semibold text-slate-900 block break-words">{{ item.productTitle || item.varian }}</span>
                                <span class="text-[10px] font-mono text-slate-400">{{ item.barcode }}</span>
                              </td>
                              <td class="py-1.5 px-2 text-center font-mono">
                                <span class="font-bold text-slate-900">{{ item.scannedCount ?? 0 }}</span>
                                <span class="block text-[10px] text-slate-400">exp {{ item.wpExpectedQty ?? 0 }}<template v-if="num(item.discrepancy) !== 0"> · <span :class="num(item.discrepancy) < 0 ? 'text-rose-600' : 'text-amber-600'">{{ num(item.discrepancy) > 0 ? `+${item.discrepancy}` : item.discrepancy }}</span></template></span>
                              </td>
                              <td class="py-1.5 px-3 text-[11px] text-slate-600 break-words">{{ item.note || '-' }}</td>
                            </tr>
                            <tr v-if="discrepancyItems(audit).length === 0">
                              <td colspan="3" class="px-3 py-3 text-slate-400 italic">
                                {{ sessionItems(audit).length ? 'No discrepancies' : 'No item details stored for this session' }}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div class="border border-emerald-200 rounded-xl bg-white overflow-hidden">
                      <div class="px-3 py-1.5 bg-emerald-50 text-emerald-800 font-bold text-[11px] uppercase">
                        Matched ({{ matchedItems(audit).length }})
                      </div>
                      <div class="max-h-64 overflow-y-auto">
                        <table class="w-full text-left">
                          <thead class="bg-slate-50 text-[10px] uppercase text-slate-500 sticky top-0">
                            <tr>
                              <th class="py-1 px-3">Product</th>
                              <th class="py-1 px-2 text-center w-20">Qty</th>
                              <th class="py-1 px-3 w-[34%]">Notes</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-slate-100">
                            <tr v-for="(item, k) in matchedItems(audit)" :key="`m-${k}-${item.barcode}`" class="align-top">
                              <td class="py-1.5 px-3 min-w-0">
                                <span class="font-semibold text-slate-900 block break-words">{{ item.productTitle || item.varian }}</span>
                                <span class="text-[10px] font-mono text-slate-400">{{ item.barcode }}</span>
                              </td>
                              <td class="py-1.5 px-2 text-center font-mono">
                                <span class="font-bold text-emerald-700">{{ item.scannedCount ?? 0 }}</span>
                                <span class="block text-[10px] text-slate-400">exp {{ item.wpExpectedQty ?? 0 }}<template v-if="num(item.discrepancy) !== 0"> · <span :class="num(item.discrepancy) < 0 ? 'text-rose-600' : 'text-amber-600'">{{ num(item.discrepancy) > 0 ? `+${item.discrepancy}` : item.discrepancy }}</span></template></span>
                              </td>
                              <td class="py-1.5 px-3 text-[11px] text-slate-600 break-words">{{ item.note || '-' }}</td>
                            </tr>
                            <tr v-if="matchedItems(audit).length === 0">
                              <td colspan="3" class="px-3 py-3 text-slate-400 italic">
                                {{ sessionItems(audit).length ? 'No matched products' : 'No item details stored for this session' }}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>

            <tr v-if="filteredHistory.length === 0">
              <td colspan="9" class="py-12 text-center text-slate-400">
                <History class="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p class="font-bold text-slate-700">{{ auditHistory.length === 0 ? 'No completed audits in history yet' : 'No audits match your search' }}</p>
                <p v-if="auditHistory.length === 0" class="text-xs text-slate-400 mt-0.5">
                  Complete your first physical scan audit in the Stock Audit tab to see historical reconciliation reports here.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Modal (superadmin) -->
    <div v-if="editingAudit" class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-5 space-y-3 text-slate-800">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-extrabold text-slate-900">Edit Audit Session — {{ editingAudit.storeName }}</h3>
          <button @click="editingAudit = null" type="button" class="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"><X class="w-4 h-4" /></button>
        </div>
        <label class="block text-xs font-bold text-slate-600">
          Auditor name
          <input v-model="editForm.auditorName" type="text" class="mt-1 w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-normal focus:outline-none focus:border-teal-500" />
        </label>
        <label class="block text-xs font-bold text-slate-600">
          Date & time
          <input v-model="editForm.date" type="datetime-local" class="mt-1 w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-normal focus:outline-none focus:border-teal-500" />
        </label>
        <label class="block text-xs font-bold text-slate-600">
          Session notes
          <textarea v-model="editForm.notes" rows="3" class="mt-1 w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-normal focus:outline-none focus:border-teal-500"></textarea>
        </label>
        <p v-if="editError" class="text-xs text-rose-600 font-semibold">{{ editError }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <button @click="editingAudit = null" type="button" class="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button @click="saveEdit" :disabled="isSaving" type="button" class="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">Save</button>
        </div>
      </div>
    </div>

    <!-- Remove Confirmation (superadmin) -->
    <div v-if="deletingAudit" class="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm p-5 space-y-3 text-slate-800">
        <h3 class="text-sm font-extrabold text-slate-900">Remove audit session?</h3>
        <p class="text-xs text-slate-600">
          {{ deletingAudit.storeName }} · {{ deletingAudit.auditorName }} · {{ formatDateTime(deletingAudit.completedAt).full }}.
          This permanently deletes the archived session and cannot be undone.
        </p>
        <p v-if="deleteError" class="text-xs text-rose-600 font-semibold">{{ deleteError }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <button @click="deletingAudit = null" type="button" class="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button @click="confirmDelete" :disabled="isSaving" type="button" class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">Remove</button>
        </div>
      </div>
    </div>
  </div>
</template>
