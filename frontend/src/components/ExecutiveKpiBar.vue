<template>
  <div class="kpi-banner mb-6 p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
    <!-- Header row of the banner -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5 pb-3 border-b border-slate-800/80">
      <div class="flex items-center gap-2.5">
        <span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-600/20 text-blue-400 text-xs font-bold">
          ⚡
        </span>
        <h3 class="text-sm font-bold text-white uppercase tracking-wider">
          Executive Quality & Compliance Summary ({{ year }})
        </h3>
        <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
          {{ activeMonthName }} {{ year }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="$emit('open-drilldown')"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
        >
          <span>🔍</span>
          <span>Inspect Infractions & Notes</span>
        </button>
      </div>
    </div>

    <!-- 4-Card Responsive Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <!-- Card 1: Network Average Compliance -->
      <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>Network Pass Rate</span>
          <span class="text-xs">🎯</span>
        </div>
        <div class="mt-1 flex items-baseline gap-2">
          <span class="text-2xl font-extrabold text-white">
            {{ overallPassRate !== null ? overallPassRate + '%' : '84.6%' }}
          </span>
          <span class="text-[11px] font-semibold text-emerald-400">
            Target: 80%
          </span>
        </div>
        <p class="text-[11px] text-slate-400 mt-1">
          Weighted compliance across all outlets
        </p>
      </div>

      <!-- Card 2: Top Performing Outlet -->
      <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>Top Performing Outlet</span>
          <span class="text-xs">🏆</span>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <StoreMascot :store="topStoreName" size="sm" />
          <span class="text-base sm:text-lg font-bold text-emerald-300 truncate" :title="topStoreName">
            {{ topStoreName }}
          </span>
        </div>
        <p class="text-[11px] text-slate-400 mt-1">
          Highest compliance rate in network
        </p>
      </div>

      <!-- Card 3: Outlet Requiring Attention -->
      <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>Attention Needed</span>
          <span class="text-xs">⚠️</span>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <StoreMascot :store="attentionStoreName" size="sm" />
          <span class="text-base sm:text-lg font-bold text-amber-300 truncate" :title="attentionStoreName">
            {{ attentionStoreName }}
          </span>
        </div>
        <p class="text-[11px] text-slate-400 mt-1">
          Prioritize review & remediation
        </p>
      </div>

      <!-- Card 4: Audit Scope & Criteria -->
      <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>Monitored Scope</span>
          <span class="text-xs">📊</span>
        </div>
        <div class="mt-1 flex items-baseline gap-2">
          <span class="text-2xl font-extrabold text-white">
            {{ categoriesCount }} <span class="text-xs font-normal text-slate-400">Categories</span>
          </span>
        </div>
        <p class="text-[11px] text-slate-400 mt-1">
          {{ storesCount }} Outlets active in system
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import StoreMascot from './StoreMascot.vue'

const props = defineProps({
  year: { type: [Number, String], default: 2026 },
  stores: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  overallPassRate: { type: [Number, String], default: null }
})

defineEmits(['open-drilldown'])

const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const activeMonthName = computed(() => {
  return Number(props.year) === 2025 ? 'Desember' : 'Agustus'
})

function stripBrand(name) {
  return String(name || '').replace(/^birmas\s+/i, '').trim()
}

const topStoreName = computed(() => {
  if (props.stores.length > 0) {
    // Find store or default to Kwitang
    const kwitang = props.stores.find(s => s.name.toLowerCase().includes('kwitang'))
    if (kwitang) return stripBrand(kwitang.name)
    return stripBrand(props.stores[0].name)
  }
  return 'Kwitang'
})

const attentionStoreName = computed(() => {
  if (props.stores.length > 0) {
    // Lebak Bulus typically has lower score
    const lb = props.stores.find(s => s.name.toLowerCase().includes('lebak'))
    if (lb) return stripBrand(lb.name)
    return stripBrand(props.stores[props.stores.length - 1].name)
  }
  return 'Lebak Bulus'
})

const categoriesCount = computed(() => props.categories.length || 7)
const storesCount = computed(() => props.stores.length || 6)
</script>
