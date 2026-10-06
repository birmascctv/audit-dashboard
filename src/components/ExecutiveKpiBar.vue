<template>
  <div class="store-ranks-panel mt-3 sm:mt-4 mb-5 p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm text-slate-800">
    <!-- Header row: STORE RANKS with active Year -->
    <div class="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
      <div class="flex items-center gap-2.5">
        <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 text-sm font-black shadow-xs">
          🏆
        </span>
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-base sm:text-lg font-black text-slate-900 tracking-wider uppercase">
            STORE RANKS
          </h2>
          <span class="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-amber-700 border border-amber-200">
            Year {{ year }}
          </span>
          <span v-if="periodLabel" class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            {{ periodLabel }}
          </span>
        </div>
      </div>

      <div class="text-xs text-slate-500 font-bold hidden sm:block">
        Top 3 Outlets by Grade Index
      </div>
    </div>

    <!-- Responsive Layout: 3 Rank Cards (wider) + 1 Grade Index Info Card (narrower) -->
    <div class="flex flex-col lg:flex-row items-stretch gap-3.5">
      <!-- Ranks 1, 2, 3 Cards Grid (expanded width) -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5 flex-1 min-w-0">
        <div
          v-for="r in rankList"
          :key="'rank-' + r.rankNum"
          class="p-3.5 rounded-xl border flex flex-col justify-between shadow-xs relative overflow-hidden transition-all duration-200 group bg-white"
          :style="getCardStyle(r.data)"
        >
          <!-- Prominent store color ambient glow -->
          <div
            class="absolute -right-4 -top-4 w-36 h-36 rounded-full blur-2xl pointer-events-none opacity-30"
            :style="{ backgroundColor: r.data?.color || '#FFFF00' }"
          ></div>

          <!-- Animal Mascot Background Watermark -->
          <div
            v-if="r.data"
            class="absolute inset-0 pointer-events-none select-none z-0 flex items-center justify-center opacity-15 transition-all duration-300 group-hover:opacity-25"
            aria-hidden="true"
          >
            <!-- Mascot icon -->
            <span
              class="text-8xl sm:text-9xl leading-none block select-none transform transition-transform duration-300 group-hover:scale-105"
            >
              {{ r.data?.emoji || getStoreMascot(r.data?.id)?.emoji }}
            </span>
          </div>

          <!-- Header Section: Rank Indicator & Grade Badge + Store Name -->
          <div class="relative z-10">
            <!-- Rank Indicator & Grade Badge Header Row -->
            <div class="flex items-center justify-between gap-2 mb-2.5">
              <div class="flex items-center gap-1.5 min-w-0">
                <span
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-black tracking-wider uppercase shadow-xs border flex-shrink-0"
                  :style="{
                    backgroundColor: (r.data?.color || '#94a3b8') + '15',
                    borderColor: (r.data?.color || '#94a3b8') + '50',
                    color: r.data?.color || '#0d9488'
                  }"
                >
                  <span>{{ r.medal }}</span>
                  <span>{{ r.label }}</span>
                </span>
                <span
                  class="text-[11px] font-bold tracking-wider uppercase truncate"
                  :style="{ color: r.data?.color || '#475569' }"
                >
                  {{ r.sublabel }}
                </span>
              </div>

              <!-- Big Grade Index in Header Row -->
              <div class="flex flex-col items-end flex-shrink-0">
                <span class="text-[9px] font-mono uppercase tracking-wider text-slate-500 mb-0.5 font-bold">Grade</span>
                <div
                  class="flex items-center justify-center min-w-[50px] sm:min-w-[56px] h-[44px] sm:h-[50px] px-2.5 rounded-xl text-2xl sm:text-3xl font-black tracking-tight border shadow-xs"
                  :class="r.data?.grade?.badgeClass || 'bg-slate-100 text-slate-800 border-slate-300'"
                  title="Overall Store Grade"
                >
                  {{ r.data?.grade?.grade || '—' }}
                </div>
              </div>
            </div>

            <!-- Fully Readable Store Name -->
            <div class="my-1.5">
              <h3
                class="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug break-words"
                :title="r.data?.name"
              >
                {{ r.data?.shortName || r.data?.name || (loading ? 'Loading...' : '—') }}
              </h3>
            </div>
          </div>

          <!-- Top 3 Categories with Grade Index -->
          <div class="mt-3 pt-2.5 border-t border-slate-200/80 relative z-10 flex-1 flex flex-col justify-end">
            <div class="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1.5 flex items-center justify-between">
              <span>Top 3 Categories</span>
              <span class="text-[9px] font-medium text-slate-400">Grade</span>
            </div>
            <div class="space-y-1.5">
              <div
                v-for="(cat, idx) in (r.data?.topCategories || [])"
                :key="cat.name"
                class="flex items-center justify-between px-2.5 py-1 rounded-lg bg-slate-50/80 border border-slate-200 text-xs hover:border-slate-300 transition-colors shadow-2xs"
              >
                <div class="flex items-center gap-1.5 min-w-0 pr-1.5">
                  <span class="w-3.5 text-center text-[10px] font-bold text-slate-400 font-mono">#{{ idx + 1 }}</span>
                  <span class="font-bold text-slate-800 truncate" :title="cat.name">{{ cat.name }}</span>
                </div>
                <span
                  class="px-1.5 py-0.5 rounded text-[11px] font-black border flex-shrink-0"
                  :class="cat.grade?.badgeClass || 'bg-slate-100 text-slate-800 border-slate-300'"
                >
                  {{ cat.grade?.grade || '—' }}
                </span>
              </div>
              <div v-if="!r.data?.topCategories || !r.data.topCategories.length" class="text-xs text-slate-400 italic py-1.5 text-center">
                No category audit data
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Card 4: Grade Index Info (Narrower box, one index per row) -->
      <div class="w-full lg:w-44 xl:w-48 flex-shrink-0 p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between shadow-xs">
        <div>
          <!-- Header -->
          <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
            <div class="flex items-center gap-1.5 text-[11px] font-black text-slate-800 uppercase tracking-wider">
              <span>📐</span>
              <span>GRADE INDEX</span>
            </div>
            <span class="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200 shadow-2xs">
              Scale
            </span>
          </div>

          <!-- Academic Scale Guide: One index per row -->
          <div class="space-y-1">
            <div
              v-for="item in gradeScaleItems"
              :key="item.grade"
              class="flex items-center justify-between px-2 py-0.5 rounded border text-[10px] font-mono leading-tight shadow-2xs"
              :class="item.bgClass"
            >
              <span class="font-black" :class="item.textClass">{{ item.grade }}</span>
              <span class="text-slate-600 font-bold text-[9px]">{{ item.score }}</span>
            </div>
          </div>
        </div>

        <p class="text-[9px] text-slate-400 font-semibold mt-2 text-center pt-1.5 border-t border-slate-200">
          12-tier academic rubric
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  STORE_META,
  getStoreMeta,
  getStoreMascot,
  stripStoreBrand,
  calculateAlphabetGrade
} from '../store-meta.js'

const gradeScaleItems = [
  { grade: 'Grade A', score: '100%', textClass: 'text-emerald-800', bgClass: 'bg-emerald-50 border-emerald-300' },
  { grade: 'Grade A-', score: '≥ 91.7%', textClass: 'text-emerald-800', bgClass: 'bg-emerald-50/80 border-emerald-200' },
  { grade: 'Grade B+', score: '≥ 83.3%', textClass: 'text-cyan-800', bgClass: 'bg-cyan-50 border-cyan-300' },
  { grade: 'Grade B', score: '≥ 75.0%', textClass: 'text-blue-800', bgClass: 'bg-blue-50 border-blue-300' },
  { grade: 'Grade B-', score: '≥ 66.7%', textClass: 'text-blue-800', bgClass: 'bg-blue-50/80 border-blue-200' },
  { grade: 'Grade C+', score: '≥ 56.7%', textClass: 'text-amber-800', bgClass: 'bg-amber-50 border-amber-300' },
  { grade: 'Grade C', score: '≥ 50.0%', textClass: 'text-yellow-800', bgClass: 'bg-yellow-50 border-yellow-300' },
  { grade: 'Grade C-', score: '≥ 46.7%', textClass: 'text-amber-800', bgClass: 'bg-amber-50/80 border-amber-200' },
  { grade: 'Grade D+', score: '≥ 38.3%', textClass: 'text-orange-800', bgClass: 'bg-orange-50 border-orange-300' },
  { grade: 'Grade D', score: '≥ 25.0%', textClass: 'text-orange-800', bgClass: 'bg-orange-50/80 border-orange-200' },
  { grade: 'Grade D-', score: '≥ 12.3%', textClass: 'text-rose-800', bgClass: 'bg-rose-50/80 border-rose-200' },
  { grade: 'Grade E', score: '< 12.3%', textClass: 'text-rose-800', bgClass: 'bg-rose-50 border-rose-300' }
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
        const meta = getStoreMeta(storeId) || STORE_META[storeId] || {
          id: storeId,
          name: s.name,
          shortName: stripStoreBrand(s.name),
          color: '#3b82f6',
          mascotName: 'Outlet',
          animal: 'Store',
          emoji: '🏬',
          mascotImg: null
        }

        try {
          const res = await fetch(`/api/store/${storeId}/passrate?year=${props.year}`)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()

          const labels = Array.isArray(data.labels) ? data.labels : []
          let validIndices = labels.map((_, i) => i)

          // Strict year filter: only keep indices matching props.year
          if (props.year) {
            const yearPrefix = `${props.year}-`
            validIndices = validIndices.filter(idx => {
              const label = labels[idx]
              return label && String(label).startsWith(yearPrefix)
            })
          }

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
            animal: meta.animal,
            emoji: meta.emoji,
            mascotImg: meta.mascotImg,
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
            animal: meta.animal,
            emoji: meta.emoji,
            mascotImg: meta.mascotImg,
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
      borderColor: '#e2e8f0',
      background: '#ffffff'
    }
  }
  const c = store.color
  return {
    borderColor: `${c}55`,
    background: `linear-gradient(135deg, ${c}12 0%, ${c}05 40%, #ffffff 100%)`,
    boxShadow: `0 2px 8px 0 rgba(0, 0, 0, 0.04), 0 0 0 1px ${c}25`
  }
}

function getMascotWatermarkStyle(store) {
  if (!store || !store.color) return {}
  const c = store.color
  return {
    filter: `drop-shadow(0 0 14px ${c}) drop-shadow(0 0 30px ${c}cc)`
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
