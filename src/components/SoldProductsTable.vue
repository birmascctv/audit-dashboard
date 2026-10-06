<script setup lang="ts">
import { ref, computed } from 'vue';
import { SaleRecord } from '../types/inventory';
import { formatDateTime, exportToCSV } from '../utils/storage';
import {
  History,
  Download,
  Trash2,
  Undo2,
  Search,
  Calendar,
  Clock,
  Barcode,
  CheckCircle2,
  TrendingUp,
  AlertCircle
} from 'lucide-vue-next';

const props = defineProps<{
  sales: SaleRecord[];
}>();

const emit = defineEmits<{
  (e: 'voidSale', saleId: string): void;
  (e: 'clearHistory'): void;
}>();

const searchQuery = ref('');
const filterBrand = ref<'ALL' | 'Kulturale' | 'Albens'>('ALL');

const totalUnitsSold = computed(() => {
  return props.sales.reduce((acc, curr) => acc + curr.qtySold, 0);
});

const filteredSales = computed(() => {
  return props.sales.filter((s) => {
    const matchesBrand =
      filterBrand.value === 'ALL' || s.brand.toLowerCase() === filterBrand.value.toLowerCase();
    const query = searchQuery.value.toLowerCase().trim();
    const matchesSearch =
      !query ||
      s.barcode.toLowerCase().includes(query) ||
      s.brand.toLowerCase().includes(query) ||
      s.varian.toLowerCase().includes(query);
    return matchesBrand && matchesSearch;
  });
});

function handleExportCSV() {
  const exportData = props.sales.map((s) => {
    const dt = formatDateTime(s.timestamp);
    return {
      'Date & Time': dt.full,
      Date: dt.date,
      Time: dt.time,
      'Kode Barcode': s.barcode,
      Brand: s.brand,
      Varian: s.varian,
      'Qty Sold': s.qtySold,
      'Remaining Stock': s.remainingQty,
    };
  });
  exportToCSV(`Chiller_1_Sales_Report_${new Date().toISOString().split('T')[0]}.csv`, exportData);
}

function confirmClear() {
  if (confirm('Are you sure you want to clear the sales history log? (Chiller stock counts will NOT be affected)')) {
    emit('clearHistory');
  }
}
</script>

<template>
  <div class="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col">
    <!-- Header of the Sold Table -->
    <div class="p-5 border-b border-slate-800 bg-slate-900/80">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <History class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-bold text-white tracking-tight">
                Product Sold History Table
              </h3>
              <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                {{ totalUnitsSold }} Units Sold
              </span>
            </div>
            <p class="text-xs text-slate-400">
              Live scan logs from Cashcow HC-710C with timestamp, brand, variant & remaining chiller stock.
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2">
          <!-- Export Sales CSV -->
          <button
            @click="handleExportCSV"
            :disabled="sales.length === 0"
            type="button"
            class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 hover:text-white border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Download class="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Sales CSV</span>
          </button>

          <!-- Clear history -->
          <button
            @click="confirmClear"
            :disabled="sales.length === 0"
            type="button"
            class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 disabled:opacity-40 disabled:cursor-not-allowed text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-900/50 text-xs transition-colors"
            title="Clear sales log"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Filters & Search Toolbar -->
      <div class="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
        <!-- Brand quick filters -->
        <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start">
          <button
            @click="filterBrand = 'ALL'"
            type="button"
            class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
            :class="filterBrand === 'ALL' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'"
          >
            All Sales ({{ sales.length }})
          </button>
          <button
            @click="filterBrand = 'Kulturale'"
            type="button"
            class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
            :class="filterBrand === 'Kulturale' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'"
          >
            Kulturale
          </button>
          <button
            @click="filterBrand = 'Albens'"
            type="button"
            class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
            :class="filterBrand === 'Albens' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'"
          >
            Albens
          </button>
        </div>

        <!-- Search bar -->
        <div class="relative w-full sm:w-64">
          <Search class="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search sold items or barcode..."
            class="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>
    </div>

    <!-- Table Container -->
    <div class="overflow-x-auto flex-1 max-h-[460px] overflow-y-auto">
      <table class="w-full text-left border-collapse">
        <thead class="sticky top-0 z-10 bg-slate-950 border-b border-slate-800">
          <tr class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <th class="py-3 px-4">Date & Time</th>
            <th class="py-3 px-4">Kode Barcode</th>
            <th class="py-3 px-4">Brand</th>
            <th class="py-3 px-4">Varian</th>
            <th class="py-3 px-4 text-center">Qty Sold</th>
            <th class="py-3 px-4 text-center">Remaining Stock</th>
            <th class="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/70 text-sm">
          <tr
            v-for="(sale, index) in filteredSales"
            :key="sale.id"
            class="hover:bg-slate-800/40 transition-colors"
            :class="index === 0 ? 'bg-emerald-500/5' : ''"
          >
            <!-- Date & Time -->
            <td class="py-3 px-4 text-xs font-mono text-slate-300 whitespace-nowrap">
              <div class="flex flex-col">
                <div class="flex items-center gap-1.5 font-medium text-slate-200">
                  <Clock class="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>{{ formatDateTime(sale.timestamp).time }}</span>
                  <span class="text-[10px] text-slate-500 font-sans">({{ formatDateTime(sale.timestamp).relative }})</span>
                </div>
                <div class="text-[11px] text-slate-400 flex items-center gap-1 pl-5">
                  <Calendar class="w-3 h-3 text-slate-600" />
                  <span>{{ formatDateTime(sale.timestamp).date }}</span>
                </div>
              </div>
            </td>

            <!-- Kode Barcode -->
            <td class="py-3 px-4 font-mono text-xs text-cyan-300">
              <span class="bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {{ sale.barcode }}
              </span>
            </td>

            <!-- Brand -->
            <td class="py-3 px-4">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                :class="
                  sale.brand === 'Kulturale'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                "
              >
                {{ sale.brand }}
              </span>
            </td>

            <!-- Varian -->
            <td class="py-3 px-4 font-semibold text-slate-100">
              {{ sale.varian }}
            </td>

            <!-- Qty Sold -->
            <td class="py-3 px-4 text-center">
              <span class="inline-flex items-center justify-center font-mono font-bold text-sm px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                -{{ sale.qtySold }}
              </span>
            </td>

            <!-- Remaining Stock after this sale -->
            <td class="py-3 px-4 text-center font-mono text-xs">
              <span
                class="px-2 py-0.5 rounded font-bold"
                :class="
                  sale.remainingQty === 0
                    ? 'text-rose-400 bg-rose-500/10 border border-rose-500/30'
                    : sale.remainingQty <= 5
                    ? 'text-amber-400 bg-amber-500/10 border border-amber-500/30'
                    : 'text-slate-300 bg-slate-950'
                "
              >
                {{ sale.remainingQty }} in chiller
              </span>
            </td>

            <!-- Action: Void/Undo Sale -->
            <td class="py-3 px-4 text-right">
              <button
                @click="emit('voidSale', sale.id)"
                type="button"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800 text-xs transition-colors"
                title="Void this scan and restore +1 product back into chiller stock"
              >
                <Undo2 class="w-3 h-3" />
                <span>Void</span>
              </button>
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-if="filteredSales.length === 0">
            <td colspan="7" class="py-12 text-center text-slate-500">
              <div class="flex flex-col items-center justify-center gap-2">
                <Barcode class="w-8 h-8 text-slate-600 animate-pulse" />
                <p class="text-sm font-medium text-slate-400">No sold items recorded yet</p>
                <p class="text-xs text-slate-500 max-w-sm">
                  Scan a product barcode using Cashcow HC-710C or click a quick-test chip above to record your first sale.
                </p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Footer Summary -->
    <div class="p-3.5 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-400 gap-2">
      <div class="flex items-center gap-3">
        <span>Total {{ sales.length }} sales recorded</span>
        <span class="text-slate-600">•</span>
        <span class="text-emerald-400 font-semibold">{{ totalUnitsSold }} units sold from Chiller #1</span>
      </div>
      <div class="flex items-center gap-1.5 text-slate-500">
        <span>Scans are logged in real-time</span>
      </div>
    </div>
  </div>
</template>
