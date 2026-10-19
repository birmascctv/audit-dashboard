<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuditStore } from '../composables/useAuditStore.js';
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
  Check
} from 'lucide-vue-next';

const { auditHistory, clearHistory, stores } = useAuditStore();

const searchQuery = ref('');
const selectedAudit = ref(null);
const isLoadingHistory = ref(false);

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
        lastAuditDate: null,
        lastAuditor: null,
      });
    }

    const entry = storeMap.get(sName);
    entry.totalAudits += 1;
    entry.totalExpected += (a.totalExpected || 0);
    entry.totalScanned += (a.totalScanned || 0);
    entry.totalMissing += (a.missingCount || 0);
    entry.totalSurplus += (a.surplusCount || 0);
    if (!entry.lastAuditDate || new Date(a.completedAt) > new Date(entry.lastAuditDate)) {
      entry.lastAuditDate = a.completedAt;
      entry.lastAuditor = a.auditorName;
    }
  });

  const list = Array.from(storeMap.values()).map((item) => {
    const netDiscrepancy = item.totalScanned - item.totalExpected;
    let accuracy = 100;
    if (item.totalExpected > 0) {
      accuracy = Math.max(0, Math.min(100, Math.round(((item.totalExpected - item.totalMissing) / item.totalExpected) * 100)));
    } else if (item.totalAudits === 0) {
      accuracy = 100;
    }

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

const overallChainAccuracy = computed(() => {
  const totalExp = shrinkageLeaderboard.value.reduce((acc, s) => acc + s.totalExpected, 0);
  const totalMiss = shrinkageLeaderboard.value.reduce((acc, s) => acc + s.totalMissing, 0);
  if (totalExp === 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((totalExp - totalMiss) / totalExp) * 100)));
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
            <span class="text-xl font-black text-slate-900 font-mono">{{ overallChainAccuracy }}%</span>
            <span class="text-[11px] text-teal-700 font-semibold block mt-0.5">Across all branch audits</span>
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
            <span class="text-[11px] text-rose-700 font-semibold block mt-0.5">Discrepancy shrinkage</span>
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

    <!-- PREVIOUS TEMPLATE: COMPLETED AUDIT SESSION ARCHIVE -->
    <div class="space-y-4">
      <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div class="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 class="text-sm font-extrabold text-slate-900">
              Completed Audit Session Archive
            </h3>
            <p class="text-xs text-slate-500">
              Detailed chronological logs of all completed physical counts. Click any row to view individual items.
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

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                <th class="py-3 px-4">Date & Time</th>
                <th class="py-3 px-4">Store Location</th>
                <th class="py-3 px-4">Auditor</th>
                <th class="py-3 px-4 text-center">Expected (ESB)</th>
                <th class="py-3 px-4 text-center">Scanned (Physical)</th>
                <th class="py-3 px-4 text-center">Discrepancy</th>
                <th class="py-3 px-4">Notes</th>
                <th class="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr
                v-for="audit in auditHistory.filter(a => !searchQuery || (a.storeName || '').toLowerCase().includes(searchQuery.toLowerCase()) || (a.auditorName || '').toLowerCase().includes(searchQuery.toLowerCase()))"
                :key="audit.id"
                class="hover:bg-slate-50/80 transition-colors cursor-pointer"
                @click="selectedAudit = audit"
              >
                <!-- Date & Time -->
                <td class="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                  <div class="flex items-center gap-1.5 font-medium">
                    <Calendar class="w-3.5 h-3.5 text-teal-600" />
                    <span>{{ formatDateTime(audit.completedAt).full }}</span>
                  </div>
                </td>

                <!-- Store -->
                <td class="py-3.5 px-4 font-semibold text-slate-900">
                  <div class="flex items-center gap-1.5">
                    <Building2 class="w-3.5 h-3.5 text-teal-600" />
                    <span>{{ audit.storeName }}</span>
                  </div>
                </td>

                <!-- Auditor -->
                <td class="py-3.5 px-4 text-slate-700">
                  {{ audit.auditorName }}
                </td>

                <!-- Expected -->
                <td class="py-3.5 px-4 text-center font-mono font-bold text-slate-800">
                  {{ audit.totalExpected }}
                </td>

                <!-- Scanned -->
                <td class="py-3.5 px-4 text-center font-mono font-bold text-teal-700">
                  {{ audit.totalScanned }}
                </td>

                <!-- Discrepancy -->
                <td class="py-3.5 px-4 text-center font-mono">
                  <span
                    class="px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1"
                    :class="
                      audit.totalScanned === audit.totalExpected
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : audit.totalScanned < audit.totalExpected
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    "
                  >
                    {{ audit.totalScanned - audit.totalExpected === 0 ? 'Match (0)' : audit.totalScanned - audit.totalExpected }}
                  </span>
                </td>

                <!-- Notes -->
                <td class="py-3.5 px-4 text-slate-700 max-w-xs">
                  <span v-if="audit.notes" class="font-medium text-slate-800">{{ audit.notes }}</span>
                  <span v-else class="text-slate-400 italic">No notes</span>
                </td>

                <!-- Action -->
                <td class="py-3.5 px-4 text-right">
                  <button
                    @click.stop="selectedAudit = audit"
                    type="button"
                    class="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Eye class="w-3.5 h-3.5" />
                    <span>View Items</span>
                  </button>
                </td>
              </tr>

              <!-- Empty -->
              <tr v-if="auditHistory.length === 0">
                <td colspan="8" class="py-12 text-center text-slate-400">
                  <History class="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p class="font-bold text-slate-700">No completed audits in history yet</p>
                  <p class="text-xs text-slate-400 mt-0.5">
                    Complete your first physical scan audit in the Stock Audit tab to see historical reconciliation reports here.
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Detail Modal for Selected Audit -->
    <div
      v-if="selectedAudit"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div class="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden text-slate-800">
        <div class="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 class="text-base font-extrabold text-slate-900">
              Audit Session Details: {{ selectedAudit.storeName }}
            </h3>
            <p class="text-xs text-slate-500">
              Conducted by {{ selectedAudit.auditorName }} on {{ formatDateTime(selectedAudit.completedAt).full }}
            </p>
          </div>
          <button
            @click="selectedAudit = null"
            type="button"
            class="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center border border-slate-200 transition-colors cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="p-5 overflow-y-auto space-y-4">
          <!-- Summary chips -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span class="text-slate-400 block text-[11px]">Expected (ESB)</span>
              <span class="font-mono font-bold text-base text-slate-900">{{ selectedAudit.totalExpected }}</span>
            </div>
            <div class="p-3 bg-teal-50 border border-teal-200 rounded-xl">
              <span class="text-teal-700 block text-[11px]">Scanned (Physical)</span>
              <span class="font-mono font-bold text-base text-teal-900">{{ selectedAudit.totalScanned }}</span>
            </div>
            <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span class="text-emerald-700 block text-[11px]">Matched SKUs</span>
              <span class="font-mono font-bold text-base text-emerald-900">{{ selectedAudit.matchedCount }}</span>
            </div>
            <div class="p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <span class="text-rose-700 block text-[11px]">Discrepancies</span>
              <span class="font-mono font-bold text-base text-rose-900">
                {{ selectedAudit.totalScanned - selectedAudit.totalExpected }}
              </span>
            </div>
          </div>

          <!-- Items Table -->
          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                  <th class="py-2.5 px-3">Product</th>
                  <th class="py-2.5 px-3 text-center">Expected</th>
                  <th class="py-2.5 px-3 text-center">Physical</th>
                  <th class="py-2.5 px-3 text-center">Diff</th>
                  <th class="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="item in (selectedAudit.items || [])" :key="item.barcode" class="hover:bg-slate-50">
                  <td class="py-2 px-3">
                    <span class="font-bold text-slate-900 block">{{ item.productTitle || item.varian }}</span>
                    <span class="text-[10px] font-mono text-slate-400">{{ item.barcode }}</span>
                  </td>
                  <td class="py-2 px-3 text-center font-mono">{{ item.wpExpectedQty }}</td>
                  <td class="py-2 px-3 text-center font-mono font-bold text-teal-800">{{ item.scannedCount }}</td>
                  <td class="py-2 px-3 text-center font-mono font-bold">
                    <span :class="item.discrepancy < 0 ? 'text-rose-600' : item.discrepancy > 0 ? 'text-amber-600' : 'text-emerald-600'">
                      {{ item.discrepancy }}
                    </span>
                  </td>
                  <td class="py-2 px-3 text-center">
                    <span
                      class="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      :class="
                        item.status === 'matched'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : item.status === 'missing'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      "
                    >
                      {{ item.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            @click="selectedAudit = null"
            type="button"
            class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
