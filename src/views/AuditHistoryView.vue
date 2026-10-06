<script setup>
import { ref } from 'vue';
import { useAuditStore } from '../composables/useAuditStore.js';
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
  X
} from 'lucide-vue-next';

const { auditHistory, clearHistory } = useAuditStore();

const searchQuery = ref('');
const selectedAudit = ref(null);

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
    <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-xl font-extrabold text-slate-900 tracking-tight">
            Store Audit Records & History
          </h2>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-semibold font-mono">
            {{ auditHistory.length }} Audits Filed
          </span>
        </div>
        <p class="text-xs text-slate-500 mt-0.5">
          Archived physical audits, discrepancy reports, and reconciliation logs for all store locations.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="exportHistoryCSV"
          :disabled="auditHistory.length === 0"
          type="button"
          class="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Download class="w-3.5 h-3.5 text-teal-600" />
          <span>Export All History CSV</span>
        </button>

        <button
          @click="handleClearHistory"
          :disabled="auditHistory.length === 0"
          type="button"
          class="p-2 rounded-xl bg-slate-50 hover:bg-rose-50 disabled:opacity-40 text-slate-500 hover:text-rose-600 border border-slate-300 text-xs transition-colors"
          title="Clear History"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Table of Past Audits -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              <th class="py-3.5 px-4">Date & Time</th>
              <th class="py-3.5 px-4">Store Location</th>
              <th class="py-3.5 px-4">Auditor</th>
              <th class="py-3.5 px-4 text-center">Expected (ESB)</th>
              <th class="py-3.5 px-4 text-center">Scanned (Physical)</th>
              <th class="py-3.5 px-4 text-center">Discrepancy</th>
              <th class="py-3.5 px-4">Notes</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="audit in auditHistory"
              :key="audit.id"
              class="hover:bg-slate-50 transition-colors cursor-pointer"
              @click="selectedAudit = audit"
              title="Click to view detailed item breakdown"
            >
              <!-- Date & Time -->
              <td class="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                <div class="flex items-center gap-1.5 font-medium">
                  <Calendar class="w-3.5 h-3.5 text-teal-600" />
                  <span>{{ formatDateTime(audit.completedAt).full }}</span>
                </div>
              </td>

              <!-- Store -->
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-1.5 font-semibold text-slate-900">
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
                  class="px-2 py-0.5 rounded font-bold"
                  :class="
                    audit.totalScanned === audit.totalExpected
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : audit.totalScanned < audit.totalExpected
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  "
                >
                  {{ audit.totalScanned - audit.totalExpected === 0 ? 'Balanced (0)' : audit.totalScanned - audit.totalExpected }}
                </span>
              </td>

              <!-- Notes -->
              <td class="py-3.5 px-4 text-slate-700 max-w-xs">
                <span v-if="audit.notes" class="font-medium text-slate-800">{{ audit.notes }}</span>
                <span v-else class="text-slate-400 italic">No notes</span>
              </td>
            </tr>

            <!-- Empty -->
            <tr v-if="auditHistory.length === 0">
              <td colspan="7" class="py-12 text-center text-slate-400">
                <History class="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p class="font-medium text-slate-600">No completed audits in history yet</p>
                <p class="text-xs text-slate-400 mt-0.5">
                  Complete your first physical scan audit in the Audit tab to see historical reconciliation reports here.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: Audit Details Breakdown -->
    <div
      v-if="selectedAudit"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      @click.self="selectedAudit = null"
    >
      <div class="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 class="text-base font-bold text-slate-900">{{ selectedAudit.storeName }} Audit Breakdown</h3>
            <p class="text-xs text-slate-500">
              Audited by {{ selectedAudit.auditorName }} • {{ formatDateTime(selectedAudit.completedAt).full }}
            </p>
          </div>
          <button
            @click="selectedAudit = null"
            class="p-1 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 overflow-y-auto space-y-4 text-xs text-slate-700">
          <div v-if="selectedAudit.notes" class="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span class="font-semibold text-slate-600 block mb-1">Auditor Notes:</span>
            <p>{{ selectedAudit.notes }}</p>
          </div>

          <!-- Items Table -->
          <div class="overflow-x-auto rounded-xl border border-slate-200">
            <table class="w-full text-left border-collapse">
              <thead class="bg-slate-50 text-[11px] text-slate-600 uppercase border-b border-slate-200">
                <tr>
                  <th class="py-2.5 px-3">Kode Barcode</th>
                  <th class="py-2.5 px-3">Brand & Variant</th>
                  <th class="py-2.5 px-3 text-center">ESB Expected</th>
                  <th class="py-2.5 px-3 text-center">Scanned</th>
                  <th class="py-2.5 px-3 text-center">Discrepancy</th>
                  <th class="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-slate-800 bg-white">
                <tr v-for="item in selectedAudit.items" :key="item.barcode">
                  <td class="py-2.5 px-3 font-mono text-teal-800">{{ item.barcode }}</td>
                  <td class="py-2.5 px-3 font-medium">{{ item.brand }} {{ item.varian }}</td>
                  <td class="py-2.5 px-3 text-center font-mono">{{ item.wpExpectedQty }}</td>
                  <td class="py-2.5 px-3 text-center font-mono font-bold">{{ item.scannedCount }}</td>
                  <td class="py-2.5 px-3 text-center font-mono">
                    <span
                      class="font-bold"
                      :class="item.discrepancy === 0 ? 'text-emerald-600' : 'text-rose-600'"
                    >
                      {{ item.discrepancy > 0 ? `+${item.discrepancy}` : item.discrepancy }}
                    </span>
                  </td>
                  <td class="py-2.5 px-3 text-right">
                    <span
                      class="px-2 py-0.5 rounded text-[10px] font-bold"
                      :class="
                        item.status === 'matched'
                          ? 'bg-emerald-50 text-emerald-700'
                          : item.status === 'missing'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-amber-50 text-amber-700'
                      "
                    >
                      {{ item.status.toUpperCase() }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            @click="selectedAudit = null"
            class="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
