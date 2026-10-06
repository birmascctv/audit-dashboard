<script setup lang="ts">
import { computed } from 'vue';
import { Product, SaleRecord } from '../types/inventory';
import {
  Package,
  ShoppingBag,
  AlertTriangle,
  Flame,
  CheckCircle2,
  TrendingUp,
  BarChart3,
  Layers
} from 'lucide-vue-next';

const props = defineProps<{
  products: Product[];
  sales: SaleRecord[];
}>();

const totalStock = computed(() => props.products.reduce((acc, p) => acc + p.qty, 0));
const totalInitialCapacity = computed(() =>
  props.products.reduce((acc, p) => acc + (p.capacity || p.initialQty || 24), 0)
);

const capacityPercentage = computed(() => {
  if (totalInitialCapacity.value === 0) return 0;
  return Math.min(100, Math.round((totalStock.value / totalInitialCapacity.value) * 100));
});

const totalSold = computed(() => props.sales.reduce((acc, s) => acc + s.qtySold, 0));

const lowStockItems = computed(() =>
  props.products.filter((p) => p.qty <= (p.minStockAlert || 5))
);

// Brand breakdown
const brandStats = computed(() => {
  const kulturaleStock = props.products
    .filter((p) => p.brand === 'Kulturale')
    .reduce((acc, p) => acc + p.qty, 0);
  const albensStock = props.products
    .filter((p) => p.brand === 'Albens')
    .reduce((acc, p) => acc + p.qty, 0);

  const kulturaleSold = props.sales
    .filter((s) => s.brand === 'Kulturale')
    .reduce((acc, s) => acc + s.qtySold, 0);
  const albensSold = props.sales
    .filter((s) => s.brand === 'Albens')
    .reduce((acc, s) => acc + s.qtySold, 0);

  return {
    kulturale: { stock: kulturaleStock, sold: kulturaleSold },
    albens: { stock: albensStock, sold: albensSold },
  };
});

// Top selling variant
const topSelling = computed(() => {
  const counts: Record<string, { brand: string; varian: string; count: number }> = {};
  for (const s of props.sales) {
    const key = `${s.brand} ${s.varian}`;
    if (!counts[key]) {
      counts[key] = { brand: s.brand, varian: s.varian, count: 0 };
    }
    counts[key].count += s.qtySold;
  }
  const list = Object.values(counts).sort((a, b) => b.count - a.count);
  return list.length > 0 ? list[0] : null;
});
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Card 1: Chiller Stock Level -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Chiller Fill Level</span>
        <div class="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
          <Package class="w-4 h-4" />
        </div>
      </div>
      <div class="my-2">
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-extrabold text-white font-mono">{{ totalStock }}</span>
          <span class="text-xs text-slate-400">/ {{ totalInitialCapacity }} units</span>
        </div>
        <!-- Progress bar -->
        <div class="w-full bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="
              capacityPercentage < 20
                ? 'bg-rose-500'
                : capacityPercentage < 45
                ? 'bg-amber-500'
                : 'bg-cyan-500'
            "
            :style="{ width: `${capacityPercentage}%` }"
          ></div>
        </div>
      </div>
      <div class="flex items-center justify-between text-[11px] text-slate-400">
        <span>Capacity: {{ capacityPercentage }}%</span>
        <span :class="totalStock < 25 ? 'text-amber-400 font-semibold' : 'text-slate-400'">
          {{ totalStock < 25 ? 'Restock Recommended' : 'Optimal Space' }}
        </span>
      </div>
    </div>

    <!-- Card 2: Units Sold -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Units Sold</span>
        <div class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
          <ShoppingBag class="w-4 h-4" />
        </div>
      </div>
      <div class="my-2">
        <div class="flex items-baseline gap-2">
          <span class="text-2xl font-extrabold text-emerald-400 font-mono">+{{ totalSold }}</span>
          <span class="text-xs text-slate-400">bottles scanned</span>
        </div>
        <p class="text-[11px] text-slate-400 mt-1">
          Auto-deducted from chiller stock via Cashcow HC-710C
        </p>
      </div>
      <div class="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
        <span class="text-slate-400">Transactions:</span>
        <span class="text-white font-mono font-medium">{{ sales.length }} scans</span>
      </div>
    </div>

    <!-- Card 3: Top Selling SKU -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Best Seller</span>
        <div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
          <Flame class="w-4 h-4" />
        </div>
      </div>
      <div class="my-2">
        <div v-if="topSelling" class="flex flex-col">
          <span class="text-lg font-bold text-white truncate">
            {{ topSelling.brand }} {{ topSelling.varian }}
          </span>
          <span class="text-xs text-amber-400 font-medium font-mono mt-0.5">
            {{ topSelling.count }} units sold
          </span>
        </div>
        <div v-else class="text-xs text-slate-500 italic py-2">
          Scan first product to see ranking
        </div>
      </div>
      <div class="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
        <span>Brand ratio:</span>
        <span class="text-slate-300">
          Kulturale ({{ brandStats.kulturale.sold }}) : Albens ({{ brandStats.albens.sold }})
        </span>
      </div>
    </div>

    <!-- Card 4: Low Stock Warnings -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Chiller Alerts</span>
        <div
          class="w-8 h-8 rounded-lg flex items-center justify-center"
          :class="lowStockItems.length > 0 ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'"
        >
          <component :is="lowStockItems.length > 0 ? AlertTriangle : CheckCircle2" class="w-4 h-4" />
        </div>
      </div>
      <div class="my-2">
        <div class="flex items-baseline gap-2">
          <span
            class="text-2xl font-extrabold font-mono"
            :class="lowStockItems.length > 0 ? 'text-amber-400' : 'text-emerald-400'"
          >
            {{ lowStockItems.length }}
          </span>
          <span class="text-xs text-slate-400">SKUs below safety stock</span>
        </div>
        <p class="text-[11px] text-slate-400 truncate mt-1">
          {{
            lowStockItems.length > 0
              ? lowStockItems.map((p) => p.varian).join(', ')
              : 'All 7 SKUs comfortably stocked'
          }}
        </p>
      </div>
      <div class="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
        <span>Restock alert set at:</span>
        <span class="text-slate-300 font-mono">&le; 4-5 units</span>
      </div>
    </div>
  </div>
</template>
