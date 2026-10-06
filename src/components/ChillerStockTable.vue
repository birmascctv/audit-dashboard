<script setup lang="ts">
import { ref, computed } from 'vue';
import { Product } from '../types/inventory';
import { exportToCSV } from '../utils/storage';
import {
  Package,
  Plus,
  Minus,
  Download,
  Search,
  SlidersHorizontal,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Barcode,
  Layers,
  ShoppingBag
} from 'lucide-vue-next';

const props = defineProps<{
  products: Product[];
  lastSoldBarcode?: string | null;
}>();

const emit = defineEmits<{
  (e: 'updateQty', productId: string, delta: number): void;
  (e: 'setQty', productId: string, newQty: number): void;
  (e: 'sellOne', barcode: string): void;
  (e: 'openAddModal'): void;
  (e: 'openRestockModal', product?: Product): void;
}>();

const searchQuery = ref('');
const selectedBrand = ref<'ALL' | 'Kulturale' | 'Albens'>('ALL');
const editingProductId = ref<string | null>(null);
const editQtyValue = ref<number>(0);

const brands = computed(() => {
  const set = new Set(props.products.map((p) => p.brand));
  return Array.from(set);
});

const filteredProducts = computed(() => {
  return props.products.filter((p) => {
    const matchesBrand =
      selectedBrand.value === 'ALL' || p.brand.toLowerCase() === selectedBrand.value.toLowerCase();
    const query = searchQuery.value.toLowerCase().trim();
    const matchesSearch =
      !query ||
      p.barcode.toLowerCase().includes(query) ||
      p.brand.toLowerCase().includes(query) ||
      p.varian.toLowerCase().includes(query);
    return matchesBrand && matchesSearch;
  });
});

const totalStockCount = computed(() => {
  return props.products.reduce((acc, curr) => acc + curr.qty, 0);
});

function startEditQty(product: Product) {
  editingProductId.value = product.id;
  editQtyValue.value = product.qty;
}

function saveEditQty(product: Product) {
  if (editQtyValue.value >= 0) {
    emit('setQty', product.id, Number(editQtyValue.value));
  }
  editingProductId.value = null;
}

function cancelEditQty() {
  editingProductId.value = null;
}

function handleExportCSV() {
  const exportData = props.products.map((p) => ({
    No: p.no,
    'Kode Barcode': p.barcode,
    Brand: p.brand,
    Varian: p.varian,
    Qty: p.qty,
    'Initial Qty': p.initialQty,
    Status: p.qty === 0 ? 'Out of Stock' : p.qty <= (p.minStockAlert || 5) ? 'Low Stock' : 'In Stock',
  }));
  exportToCSV(`Chiller_1_Stock_${new Date().toISOString().split('T')[0]}.csv`, exportData);
}
</script>

<template>
  <div class="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col">
    <!-- Header of the Table Component -->
    <div class="p-5 border-b border-slate-800 bg-slate-900/80">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
            <Package class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-bold text-white tracking-tight">
                Current Chiller Stock Table
              </h3>
              <span class="text-xs px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                {{ totalStockCount }} Units Total
              </span>
            </div>
            <p class="text-xs text-slate-400">
              Matches your original store chiller spreadsheet. Qty auto-decreases when scanned.
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <!-- Add SKU button -->
          <button
            @click="emit('openAddModal')"
            type="button"
            class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Plus class="w-3.5 h-3.5 text-cyan-400" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      <!-- Filters & Search Toolbar -->
      <div class="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
        <!-- Brand quick filters -->
        <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start">
          <button
            @click="selectedBrand = 'ALL'"
            type="button"
            class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
            :class="selectedBrand === 'ALL' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'"
          >
            All Brands ({{ products.length }})
          </button>
          <button
            v-for="b in brands"
            :key="b"
            @click="selectedBrand = b as any"
            type="button"
            class="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
            :class="selectedBrand === b ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'"
          >
            {{ b }}
          </button>
        </div>

        <!-- Search query -->
        <div class="relative w-full sm:w-64">
          <Search class="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search variant or barcode..."
            class="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
    </div>

    <!-- Table Container -->
    <div class="overflow-x-auto flex-1">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-slate-950/70 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <th class="py-3 px-4 w-12 text-center">No</th>
            <th class="py-3 px-4">Kode Barcode</th>
            <th class="py-3 px-4">Brand</th>
            <th class="py-3 px-4">Varian</th>
            <th class="py-3 px-4 text-center">Qty</th>
            <th class="py-3 px-4 text-center">Stock Status</th>
            <th class="py-3 px-4 text-right">Quick Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/80 text-sm">
          <tr
            v-for="p in filteredProducts"
            :key="p.id"
            class="hover:bg-slate-800/40 transition-colors group"
            :class="lastSoldBarcode === p.barcode ? 'bg-cyan-500/10' : ''"
          >
            <!-- No -->
            <td class="py-3.5 px-4 text-center font-mono text-xs text-slate-400">
              {{ p.no }}
            </td>

            <!-- Kode Barcode -->
            <td class="py-3.5 px-4 font-mono text-xs text-cyan-300">
              <div class="flex items-center gap-1.5">
                <Barcode class="w-4 h-4 text-slate-500 shrink-0" />
                <span class="tracking-wider bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {{ p.barcode }}
                </span>
              </div>
            </td>

            <!-- Brand -->
            <td class="py-3.5 px-4">
              <span
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                :class="
                  p.brand === 'Kulturale'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                "
              >
                {{ p.brand }}
              </span>
            </td>

            <!-- Varian -->
            <td class="py-3.5 px-4 font-semibold text-slate-100">
              <div class="flex items-center gap-2">
                <span>{{ p.varian }}</span>
                <span
                  v-if="lastSoldBarcode === p.barcode"
                  class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse"
                >
                  Just Scanned
                </span>
              </div>
            </td>

            <!-- Qty (Interactive) -->
            <td class="py-3.5 px-4 text-center">
              <div v-if="editingProductId === p.id" class="flex items-center justify-center gap-1">
                <input
                  v-model.number="editQtyValue"
                  type="number"
                  min="0"
                  class="w-16 px-1.5 py-1 text-center font-mono font-bold text-sm bg-slate-950 border border-cyan-400 rounded text-white focus:outline-none"
                  @keydown.enter="saveEditQty(p)"
                  @keydown.esc="cancelEditQty"
                  autofocus
                />
                <button
                  @click="saveEditQty(p)"
                  class="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white rounded"
                >
                  Save
                </button>
              </div>
              <div v-else class="flex items-center justify-center gap-2">
                <!-- Minus button -->
                <button
                  @click="emit('updateQty', p.id, -1)"
                  :disabled="p.qty <= 0"
                  class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 flex items-center justify-center transition-colors"
                  title="Reduce 1"
                >
                  <Minus class="w-3 h-3" />
                </button>

                <!-- Value click to edit -->
                <span
                  @click="startEditQty(p)"
                  class="w-10 text-center font-mono font-bold text-base cursor-pointer hover:underline"
                  :class="
                    p.qty === 0
                      ? 'text-rose-400'
                      : p.qty <= (p.minStockAlert || 5)
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  "
                  title="Click to manually edit quantity"
                >
                  {{ p.qty }}
                </span>

                <!-- Plus button -->
                <button
                  @click="emit('updateQty', p.id, 1)"
                  class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
                  title="Add 1"
                >
                  <Plus class="w-3 h-3" />
                </button>
              </div>
            </td>

            <!-- Stock Status Badge -->
            <td class="py-3.5 px-4 text-center">
              <span
                v-if="p.qty === 0"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30"
              >
                <AlertCircle class="w-3.5 h-3.5" />
                Out of Stock
              </span>
              <span
                v-else-if="p.qty <= (p.minStockAlert || 5)"
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30"
              >
                <AlertCircle class="w-3.5 h-3.5" />
                Low ({{ p.qty }})
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              >
                <CheckCircle class="w-3.5 h-3.5" />
                In Stock
              </span>
            </td>

            <!-- Quick Actions -->
            <td class="py-3.5 px-4 text-right">
              <div class="flex items-center justify-end gap-1.5">
                <!-- Sell 1 quick action -->
                <button
                  @click="emit('sellOne', p.barcode)"
                  :disabled="p.qty <= 0"
                  class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-medium text-xs flex items-center gap-1 shadow-sm transition-all"
                  title="Simulate 1 sale of this product"
                >
                  <ShoppingBag class="w-3 h-3" />
                  <span>Sell</span>
                </button>

                <!-- Restock crate -->
                <button
                  @click="emit('openRestockModal', p)"
                  class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700 transition-colors"
                  title="Restock crate (+6 / +12 / +24)"
                >
                  Restock
                </button>
              </div>
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-if="filteredProducts.length === 0">
            <td colspan="7" class="py-10 text-center text-slate-500 text-sm">
              No products found matching "{{ searchQuery }}"
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Table Footer with Summary -->
    <div class="p-3.5 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-slate-400 gap-2">
      <div class="flex items-center gap-4">
        <span>Showing {{ filteredProducts.length }} of {{ products.length }} items</span>
        <span class="text-slate-600">•</span>
        <span class="text-emerald-400 font-medium">{{ totalStockCount }} total bottles in Chiller #1</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-slate-500">Tip: Click any quantity number to edit directly</span>
      </div>
    </div>
  </div>
</template>
