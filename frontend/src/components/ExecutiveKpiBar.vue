<template>
  <div class="store-ranks-panel mb-6 p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
    <!-- Header row: STORE RANKS with active Year -->
    <div class="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800/80">
      <div class="flex items-center gap-2.5">
        <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm font-black shadow-inner">
          🏆
        </span>
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-base sm:text-lg font-black text-white tracking-wider uppercase">
            STORE RANKS
          </h2>
          <span class="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-amber-500/30">
            Year {{ year }}
          </span>
          <span v-if="periodLabel" class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {{ periodLabel }}
          </span>
        </div>
      </div>

      <div class="text-xs text-slate-400 font-medium hidden sm:block">
        Top 3 Outlets by Compliance Pass Rate
      </div>
    </div>

    <!-- Responsive Layout: 3 Rank Cards (wider) + 1 Grade Index Info Card (narrower) -->
    <div class="flex flex-col lg:flex-row items-stretch gap-3.5">
      <!-- Ranks 1, 2, 3 Cards Grid (expanded width) -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5 flex-1 min-w-0">
        <div
          v-for="r in rankList"
          :key="'rank-' + r.rankNum"
          class="p-3.5 rounded-xl border flex flex-col justify-between shadow-lg relative overflow-hidden transition-all duration-200"
          :style="getCardStyle(r.data)"
        >
          <!-- Prominent store color ambient glow -->
          <div
            class="absolute -right-4 -top-4 w-32 h-32 rounded-full blur-2xl pointer-events-none opacity-50"
            :style="{ backgroundColor: r.data?.color || '#FFFF00' }"
          ></div>

          <div class="relative z-10">
            <!-- Rank Indicator & Grade Badge Header Row -->
            <div class="flex items-center justify-between gap-2 mb-2.5">
              <div class="flex items-center gap-1.5 min-w-0">
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-black tracking-wider uppercase shadow-sm border flex-shrink-0"
                  :style="{
                    backgroundColor: (r.data?.color || '#94a3b8') + '22',
                    borderColor: (r.data?.color || '#94a3b8') + '60',
                    color: r.data?.color || '#FFFF00'
                  }"
                >
                  <span>{{ r.medal }}</span>
                  <span>{{ r.label }}</span>
                </span>
                <span
                  class="text-[11px] font-bold tracking-wider uppercase truncate"
                  :style="{ color: r.data?.color || '#94a3b8' }"
                >
                  {{ r.sublabel }}
                </span>
              </div>

              <!-- Big Grade Index in Header Row -->
              <div
                class="flex-shrink-0 flex items-center justify-center min-w-[42px] h-[38px] px-2 rounded-lg text-2xl font-black tracking-tight border shadow-md"
                :class="r.data?.grade?.badgeClass || 'bg-slate-800 text-white'"
                title="Overall Store Grade"
              >
                {{ r.data?.grade?.grade || '—' }}
              </div>
            </div>

            <!-- Mascot + Fully Readable Store Name Row -->
            <div class="flex items-center gap-3 my-2">
              <!-- Store Mascot Icon -->
              <StoreMascot v-if="r.data" :store="r.data.id" size="lg" class="flex-shrink-0" />
              <div v-else class="w-11 h-11 rounded-xl bg-slate-800 animate-pulse flex-shrink-0"></div>

              <!-- Store Name & Compliance Rate -->
              <div class="min-w-0 flex-1">
                <h3
                  class="text-base sm:text-lg font-black text-white tracking-tight leading-snug break-words"
                  :title="r.data?.name"
                >
                  {{ r.data?.shortName || r.data?.name || (loading ? 'Loading...' : '—') }}
                </h3>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span
                    class="text-xs font-bold font-mono"
                    :style="{ color: r.data?.color || '#FFFF00' }"
                  >
                    {{ r.data?.passRate != null ? r.data.passRate + '%' : '—' }}
                  </span>
                  <span class="text-[10px] text-slate-400 font-medium">Compliance</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Top 3 Categories with Grade Index -->
          <div class="mt-3 pt-2.5 border-t border-slate-800/80 relative z-10 flex-1 flex flex-col justify-end">
            <div class="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5 flex items-center justify-between">
              <span>Top 3 Categories</span>
              <span class="text-[9px] font-medium text-slate-500">Grade</span>
            </div>
            <div class="space-y-1.5">
              <div
                v-for="(cat, idx) in (r.data?.topCategories || [])"
                :key="cat.name"
                class="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs hover:border-slate-700 transition-colors"
              >
                <div class="flex items-center gap-1.5 min-w-0 pr-1.5">
                  <span class="w-3.5 text-center text-[10px] font-bold text-slate-400 font-mono">#{{ idx + 1 }}</span>
                  <span class="font-semibold text-slate-200 truncate" :title="cat.name">{{ cat.name }}</span>
                </div>
                <span
                  class="px-1.5 py-0.5 rounded text-[11px] font-black border flex-shrink-0"
                  :class="cat.grade?.badgeClass || 'bg-slate-800 text-slate-200'"
                >
                  {{ cat.grade?.grade || '—' }}
                </span>
              </div>
              <div v-if="!r.data?.topCategories || !r.data.topCategories.length" class="text-xs text-slate-500 italic py-1.5 text-center">
                No category audit data
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Card 4: Grade Index Info (Narrower box, one index per row) -->
      <div class="w-full lg:w-44 xl:w-48 flex-shrink-0 p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between shadow-lg">
        <div>
          <!-- Header -->
          <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
            <div class="flex items-center gap-1.5 text-[11px] font-bold text-white uppercase tracking-wider">
              <span>📐</span>
              <span>GRADE INDEX</span>
            </div>
            <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              Scale
            </span>
          </div>

          <!-- Academic Scale Guide: One index per row -->
          <div class="space-y-1">
            <div
              v-for="item in gradeScaleItems"
              :key="item.grade"
              class="flex items-center justify-between px-2 py-0.5 rounded border text-[10px] font-mono leading-tight"
              :class="item.bgClass"
            >
              <span class="font-black" :class="item.textClass">{{ item.grade }}</span>
              <span class="text-slate-300 font-semibold text-[9px]">{{ item.score }}</span>
            </div>
          </div>
        </div>

        <p class="text-[9px] text-slate-400 mt-2 text-center pt-1.5 border-t border-slate-800/80">
          12-tier academic rubric
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import StoreMascot from './StoreMascot.vue'
import {
  STORE_META,
  stripStoreBrand,
  calculateAlphabetGrade
} from '../store-meta.js'

const gradeScaleItems = [
  { grade: 'Grade A', score: '100%', textClass: 'text-emerald-300', bgClass: 'bg-emerald-950/40 border-emerald-500/30' },
  { grade: 'Grade A-', score: '≥ 91.7%', textClass: 'text-emerald-400', bgClass: 'bg-emerald-950/30 border-emerald-500/20' },
  { grade: 'Grade B+', score: '≥ 83.3%', textClass: 'text-cyan-300', bgClass: 'bg-cyan-950/40 border-cyan-500/30' },
  { grade: 'Grade B', score: '≥ 75.0%', textClass: 'text-blue-300', bgClass: 'bg-blue-950/40 border-blue-500/30' },
  { grade: 'Grade B-', score: '≥ 66.7%', textClass: 'text-blue-400', bgClass: 'bg-blue-950/30 border-blue-600/20' },
  { grade: 'Grade C+', score: '≥ 56.7%', textClass: 'text-amber-300', bgClass: 'bg-amber-950/40 border-amber-500/30' },
  { grade: 'Grade C', score: '≥ 50.0%', textClass: 'text-yellow-300', bgClass: 'bg-yellow-950/40 border-yellow-500/30' },
  { grade: 'Grade C-', score: '≥ 46.7%', textClass: 'text-amber-400', bgClass: 'bg-amber-950/30 border-amber-600/20' },
  { grade: 'Grade D+', score: '≥ 38.3%', textClass: 'text-orange-300', bgClass: 'bg-orange-950/40 border-orange-500/30' },
  { grade: 'Grade D', score: '≥ 25.0%', textClass: 'text-orange-400', bgClass: 'bg-orange-950/30 border-orange-600/20' },
  { grade: 'Grade D-', score: '≥ 12.3%', textClass: 'text-rose-400', bgClass: 'bg-rose-950/30 border-rose-700/20' },
  { grade: 'Grade E', score: '< 12.3%', textClass: 'text-rose-500', bgClass: 'bg-rose-950/50 border-rose-500/30' }
]

const props = defineProps({
  year: { type: [Number, String], default: 2026 },
  stores: { type: Array, default: () => [] },
  periodFrom: { type: [Number, String], default: null },
  periodTo: { type: [Number, String], default: null }
})

const loading = ref(false)
const rankedStores = ref([])

const monthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
]

const periodLabel = computed(() => {
  if (props.periodFrom && props.periodTo) {
    const from = monthNames[Number(props.periodFrom) - 1] || props.periodFrom
    const to = monthNames[Number(props.periodTo) - 1] || props.periodTo
    return `${from} – ${to}`
  }
  return ''
})

async function loadRanks() {
  loading.value = true
  try {
    const targetStores = props.stores.length ? props.stores : Object.values(STORE_META)
    const results = await Promise.all(
      targetStores.map(async (s) => {
        const storeId = s.store_id ?? s.id
        const meta = STORE_META[storeId] || {
          id: storeId,
          name: s.name,
          shortName: stripStoreBrand(s.name),
          color: '#3b82f6',
          mascotName: 'Outlet'
        }

        try {
          const res = await fetch(`/api/store/${storeId}/passrate?year=${props.year}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()

          const labels = Array.isArray(data.labels) ? data.labels : []
          let validIndices = labels.map((_, i) => i)

          if (props.periodFrom !== null || props.periodTo !== null) {
            validIndices = validIndices.filter(idx => {
              const label = labels[idx]
              if (!label) return true
              const monthNum = parseInt(label.split('-')[1], 10)
              if (props.periodFrom !== null && monthNum < props.periodFrom) return false
              if (props.periodTo !== null && monthNum > props.periodTo) return false
              return true
            })
          }

          const categories = (data.datasets || []).map(ds => {
            const seriesData = validIndices.map(i => ds.data?.[i]).filter(v => v !== null && v !== undefined)
            let avg = 0
            if (seriesData.length > 0) {
              avg = seriesData.reduce((acc, val) => acc + Number(val), 0) / seriesData.length
            }
            const passRate = Math.round(avg * 1000) / 10
            return {
              name: ds.label,
              passRate,
              grade: calculateAlphabetGrade(passRate)
            }
          })

          // Extract top 3 performing categories
          const topCategories = [...categories]
            .sort((a, b) => b.passRate - a.passRate)
            .slice(0, 3)

          const catAverages = categories.map(c => c.passRate)
          let storeOverallAvg = 0
          if (catAverages.length > 0) {
            storeOverallAvg = Math.round((catAverages.reduce((a, b) => a + b, 0) / catAverages.length) * 10) / 10
          }

          return {
            id: storeId,
            name: meta.name,
            shortName: meta.shortName,
            color: meta.color,
            mascotName: meta.mascotName,
            passRate: storeOverallAvg,
            grade: calculateAlphabetGrade(storeOverallAvg),
            topCategories,
            hasData: categories.length > 0 && catAverages.some(v => v > 0)
          }
        } catch (err) {
          return {
            id: storeId,
            name: meta.name,
            shortName: meta.shortName,
            color: meta.color,
            mascotName: meta.mascotName,
            passRate: 0,
            grade: calculateAlphabetGrade(null),
            topCategories: [],
            hasData: false
          }
        }
      })
    )

    // Sort descending by pass rate
    rankedStores.value = results
      .filter(s => s.hasData || s.passRate > 0)
      .sort((a, b) => b.passRate - a.passRate)
  } catch (e) {
    console.error('Failed to load store ranks', e)
  } finally {
    loading.value = false
  }
}

const rank1 = computed(() => rankedStores.value[0] || null)
const rank2 = computed(() => rankedStores.value[1] || null)
const rank3 = computed(() => rankedStores.value[2] || null)

const rankList = computed(() => [
  { rankNum: 1, medal: '🥇', label: 'RANK 1', sublabel: 'Leader', data: rank1.value },
  { rankNum: 2, medal: '🥈', label: 'RANK 2', sublabel: 'Runner-Up', data: rank2.value },
  { rankNum: 3, medal: '🥉', label: 'RANK 3', sublabel: 'Top 3', data: rank3.value }
])

function getCardStyle(store) {
  if (!store || !store.color) {
    return {
      borderColor: 'rgba(51, 65, 85, 0.8)',
      background: 'rgba(15, 23, 42, 0.9)'
    }
  }
  const c = store.color
  return {
    borderColor: `${c}99`,
    background: `linear-gradient(155deg, ${c}40 0%, ${c}15 45%, rgba(15, 23, 42, 0.96) 100%)`,
    boxShadow: `0 10px 28px -4px ${c}35, inset 0 1px 0 ${c}50`
  }
}

watch(
  [() => props.year, () => props.stores, () => props.periodFrom, () => props.periodTo],
  () => {
    loadRanks()
  },
  { deep: true }
)

onMounted(() => {
  loadRanks()
})
</script>
