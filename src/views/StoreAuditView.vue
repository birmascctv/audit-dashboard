<template>
  <div v-if="lookupsLoaded && stores.length" class="page-gutter px-4 sm:px-8 lg:px-16 max-w-[1560px] mx-auto pb-12">
    <div class="flex items-center justify-between gap-3 mb-3">
      <h1 class="text-lg font-black text-slate-900">Store Audit Dashboard</h1>
      <nav class="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-xs" aria-label="Audit year">
        <router-link to="/store-audit2025" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" :class="2026 === 2025 ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'">2025</router-link>
        <router-link to="/store-audit" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" :class="2026 === 2026 ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'">2026</router-link>
      </nav>
    </div>
    <!-- STORE RANKS: Top 3 Outlets & Academic Grade Index -->
    <ExecutiveKpiBar
      :year="2026"
      :recent-store-ids="recentStoreIds"
      :latest-data-month="latestDataMonth"
      :stores="stores"
      :categories="categories"
      :period-from="periodFrom"
      :period-to="periodTo"
    />

    <section class="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-extrabold text-slate-900">Store Comparison</h2>
          <p class="text-xs text-slate-500 mt-0.5">Select 2–4 stores to compare their latest audit score and category scores.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <label v-for="store in stores" :key="`compare-${store.store_id}`" class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 cursor-pointer hover:border-teal-400">
            <input type="checkbox" :checked="comparisonStoreIds.includes(store.store_id)" @change="toggleComparisonStore(store.store_id)" class="accent-teal-600" />
            {{ stripStoreBrand(store.name) }}
          </label>
        </div>
      </div>
      <p v-if="comparisonStoreIds.length < 2" class="mt-3 text-xs text-slate-500">Choose at least two stores to compare.</p>
      <div v-else-if="comparisonLoading" class="mt-4"><SkeletonBlock :rows="3" height="h-7" /></div>
      <EmptyState v-else-if="!comparisonRows.length" class="mt-2" title="No comparison data" hint="No score data is available for the selected stores and period." />
      <div v-else class="mt-4 overflow-x-auto">
        <table class="min-w-[720px] w-full text-left text-xs border-collapse">
          <thead><tr class="border-b border-slate-200 bg-slate-50 text-slate-600"><th class="p-2">Store</th><th class="p-2 text-center">Latest score</th><th v-for="category in comparisonCategories" :key="category" class="p-2 text-center">{{ category }}</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="row in comparisonRows" :key="row.storeId"><th class="p-2 font-bold text-slate-800">{{ row.name }}</th><td class="p-2 text-center"><span class="inline-block min-w-[4.5rem] rounded-lg px-3 py-1.5 font-extrabold" :class="scoreFillClass(row.score)">{{ formatScore(row.score) }}</span></td><td v-for="category in comparisonCategories" :key="category" class="p-2 text-center"><span class="inline-block min-w-[4.5rem] rounded-lg px-3 py-1.5 font-extrabold" :class="scoreFillClass(row.categories[category])">{{ formatScore(row.categories[category]) }}</span></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Criteria search + selection -->
    <div id="criteria-section" class="controls-grid grid grid-cols-1 gap-4 md:grid-cols-3 mb-4">
      <div class="controls-bar md:col-span-2">
        <SectionHeader
          text="Criteria Performance Trends"
          description="Inspect month-by-month score trajectories for any selected audit criteria. The line chart plots store performance against the target passing grade (green line) and the overall average (red line). Use the date filters below to narrow the assessment period."
        />

        <label class="block text-sm mb-1.5 label-on-page font-bold text-slate-700">Select criteria</label>
        <CriteriaSelect :criteria="criteria" v-model="selectedCriterionId" />

        <div class="period-filter mt-3.5 flex items-center gap-2 flex-wrap">
          <label class="text-xs font-bold text-slate-600">Period:</label>
          <select
            v-model="periodFrom"
            class="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-medium focus:outline-none focus:border-teal-500 shadow-xs"
          >
            <option :value="null">All Months</option>
            <option v-for="(m, idx) in monthNames" :key="'from-' + idx" :value="idx + 1">{{ m }}</option>
          </select>
          <span class="text-xs text-slate-400">to</span>
          <select
            v-model="periodTo"
            class="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-medium focus:outline-none focus:border-teal-500 shadow-xs"
          >
            <option :value="null">All Months</option>
            <option v-for="(m, idx) in monthNames" :key="'to-' + idx" :value="idx + 1">{{ m }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Store filter for the line chart -->
    <div class="store-filter-row mb-3">
      <CheckboxFilterBar :items="storeFilterItems" v-model="selectedStores" all-label="All stores" />
    </div>

    <!-- Main chart area with right-side info panel -->
    <div class="main-grid grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch">
      <!-- Chart column (spans 2/3 on md+) -->
      <div class="chart-column md:col-span-2 flex flex-col">
        <ChartCard
          v-if="selectedCriterion"
          :category="selectedCriterion.category"
          :criterion="selectedCriterion.id"
          type="line"
          fill-height
          :stores="stores"
          :selected-stores="selectedStores"
          @update:average="averageValue = $event"
          :passingGrade="categoryPassingGradeFor(selectedCriterion.category)"
          :options="{ title: { text: selectedCriterion.label } }"
          :exclude-year="props.excludeYear"
          :period-from="periodFrom"
          :period-to="periodTo"
          :refresh-key="dataVersion"
          :key="selectedCriterion.id"
        />
      </div>

      <!-- Criteria Info Column (spans 1/3 on md+) -->
      <aside class="info-column p-4 rounded-2xl bg-white border border-slate-200 text-slate-800 flex flex-col justify-between shadow-xs">
        <div class="flex-1 flex flex-col min-h-0">
          <div class="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <div>
              <h3 class="text-base font-bold text-slate-900 leading-tight">Chart Info</h3>
              <p class="text-[11px] text-slate-500">Key metrics & criteria benchmarks</p>
            </div>
            <button
              type="button"
              @click="showDrilldown = true"
              class="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
              title="Inspect store audit notes & infractions"
            >
              <span>Notes</span>
              <span>🔍</span>
            </button>
          </div>

          <!-- Single Criteria Info View -->
          <div class="space-y-3 flex-1 overflow-y-auto pr-1">
            <!-- 2-Card KPI Grid: Passing Grade & Average -->
            <div class="grid grid-cols-2 gap-2.5">
              <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <span class="text-xs font-semibold text-slate-500">Target</span>
                <span class="text-lg font-extrabold text-emerald-600 leading-tight my-0.5">
                  {{ passingGradeLabel(selectedCriterion) }}
                </span>
                <span class="text-[11px] text-slate-400">Passing Grade</span>
              </div>
              <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <span class="text-xs font-semibold text-slate-500">Average</span>
                <span class="text-lg font-extrabold leading-tight my-0.5" :class="scoreColorClass(averageValue)">
                  {{ averageValue !== null ? averageValue : '—' }}
                </span>
                <span class="text-[11px] text-slate-400">Store Average</span>
              </div>
            </div>

            <!-- Active Criteria Card -->
            <div v-if="selectedCriterion" class="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Criteria Details</span>
                <span class="text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                  {{ selectedCriterion.category }}
                </span>
              </div>
              <div class="text-sm font-bold text-slate-900 leading-snug">
                {{ selectedCriterion.label }}
              </div>
            </div>

            <!-- Scoring Rubric / Metrics Definition from CSV -->
            <div v-if="selectedCriterion" class="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Scoring Rubric (CSV Definition)
              </span>
              <div v-if="selectedCriterion.metrics" class="text-xs text-slate-700 leading-relaxed whitespace-pre-line font-sans bg-white p-2.5 rounded-lg border border-slate-200">
                {{ selectedCriterion.metrics }}
              </div>
              <div v-else class="text-xs text-slate-400 italic bg-white p-2.5 rounded-lg border border-slate-200">
                No scoring rubric definition provided in CSV for this criterion.
              </div>
            </div>
          </div>
        </div>

        <!-- Legend footer -->
        <div class="pt-2.5 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between flex-shrink-0 mt-3">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5">
              <span class="w-3 h-1 bg-emerald-500 rounded-full inline-block"></span>
              Passing Grade
            </span>
            <span class="flex items-center gap-1.5">
              <span class="w-3 h-1 bg-rose-500 rounded-full inline-block"></span>
              Store Average
            </span>
          </div>
        </div>
      </aside>
    </div>

    <!-- Category Pass Rate Section -->
    <div id="category-passrate-section" class="passrate-section mt-10">
      <SectionHeader
        text="Category Pass Rate"
        description="Analyze compliance percentages across stores for each audit category over time. The bar chart on the left illustrates monthly store achievement relative to the network average (red line), while the panel on the right details all active criteria monitored under this category."
      />

      <!-- Category selection tabs -->
      <div class="category-tabs flex items-center gap-2 overflow-x-auto pb-2 mb-3">
        <button
          v-for="cat in categories"
          :key="'tab-' + cat"
          @click="selectedCategory = cat"
          type="button"
          :class="selectedCategory === cat ? 'bg-teal-600 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'"
          class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer"
        >
          {{ cat }}
        </button>
      </div>

      <div class="store-filter-row mb-3">
        <CheckboxFilterBar :items="storeFilterItems" v-model="selectedStores" all-label="All stores" />
      </div>

      <!-- 2-Column Layout matching line chart -->
      <div class="main-grid grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch">
        <!-- Left: Bar Chart -->
        <div class="chart-column md:col-span-2 flex flex-col">
          <ChartCard
            v-if="selectedCategory"
            :key="'passrate-' + selectedCategory"
            :category="selectedCategory"
            type="bar"
            fill-height
            :stores="stores"
            :selected-stores="selectedStores"
            :exclude-year="props.excludeYear"
            :period-from="periodFrom"
            :period-to="periodTo"
            :refresh-key="dataVersion"
            :options="{ title: { text: selectedCategory + ' Compliance Rate' } }"
          />
        </div>

        <!-- Right: Category Info & Criteria List -->
        <aside class="info-column p-4 rounded-2xl bg-white border border-slate-200 text-slate-800 flex flex-col justify-between shadow-xs">
          <div>
            <div class="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
              <h3 class="text-base font-bold text-slate-900">{{ selectedCategory }} Info</h3>
              <span class="text-xs bg-teal-50 text-teal-800 px-2 py-0.5 rounded-lg border border-teal-200 font-bold">
                {{ categoryCriteria.length }} criteria
              </span>
            </div>

            <div class="mb-3">
              <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Criteria In This Category
              </h4>
              <div class="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                <div
                  v-for="c in categoryCriteria"
                  :key="'cat-crit-' + c.id"
                  class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs hover:border-teal-400 transition-colors flex items-center justify-between gap-2"
                >
                  <div class="font-bold text-slate-800 leading-snug">{{ c.label }}</div>
                  <span v-if="c.unit" class="text-[11px] text-slate-500 flex-shrink-0">{{ c.unit }}</span>
                </div>
                <div v-if="!categoryCriteria.length" class="text-xs text-slate-400 italic p-3">
                  No criteria found for this category.
                </div>
              </div>
            </div>
          </div>

          <div class="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>Red line: Store Average</span>
            <span class="w-3 h-1.5 bg-rose-500 rounded-xs"></span>
          </div>
        </aside>
      </div>
    </div>

    <!-- Store passing rate -->
    <div id="store-passrate-section" class="storerate-section mt-10">
      <SectionHeader
        text="Store Pass Rate by Category"
        description="See how each store performs across every category. Each chart below is one store, with a bar for every category's pass rate per month. The red dashed line is that store's average pass rate, so you can quickly spot which categories are above or below its own average."
      />

      <div class="category-filter-row mb-3 flex flex-wrap items-center justify-between gap-3">
        <CheckboxFilterBar :items="categoryFilterItems" v-model="selectedCategoriesForStore" all-label="Filter Categories" />

        <!-- Shared Category Color Legend Reference Bar -->
        <div class="flex items-center gap-3 flex-wrap bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-xs text-xs font-semibold text-slate-700">
          <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Legend:</span>
          <div
            v-for="cat in activeCategoryLegends"
            :key="'legend-' + cat.name"
            class="flex items-center gap-1.5"
          >
            <span class="w-2.5 h-2.5 rounded-full border border-black/10" :style="{ backgroundColor: cat.color }"></span>
            <span class="text-xs text-slate-700">{{ cat.name }}</span>
          </div>
          <div class="flex items-center gap-1.5 pl-2 border-l border-slate-200 text-rose-600 font-bold">
            <span class="w-3 h-1 bg-rose-500 rounded-full inline-block"></span>
            <span>Store Average</span>
          </div>
        </div>
      </div>

      <div class="passrate-grid grid grid-cols-1 gap-4 md:grid-cols-2 mt-2">
        <ChartCard
          v-for="s in stores"
          :key="'storerate-' + s.store_id"
          type="bar"
          :store-id="s.store_id"
          :selected-categories="selectedCategoriesForStore"
          :exclude-year="props.excludeYear"
          :period-from="periodFrom"
          :period-to="periodTo"
          :refresh-key="dataVersion"
          :options="{ title: { text: stripStoreBrand(s.name) } }"
        />
      </div>
    </div>

    <!-- Interactive Infraction & Auditor Notes Drilldown Modal -->
    <DrilldownModal
      :is-open="showDrilldown"
      :stores="stores"
      :categories="categories"
      :initial-store-id="inspectStoreId || stores[0]?.store_id"
      :initial-category="selectedCriterion?.category || 'Aplikasi'"
      :initial-year="2026"
      :initial-month="8"
      @close="showDrilldown = false"
    />

    <!-- Quick Scroll Navigation (Back to Top / Back to Bottom) -->
    <ScrollNavButtons />
  </div>
  <div v-else class="max-w-[1560px] mx-auto px-4 sm:px-8 lg:px-16 py-12 rounded-2xl border border-slate-200 bg-white">
    <SkeletonBlock v-if="!lookupsLoaded" :rows="6" height="h-8" />
    <EmptyState v-else title="No store audit data available" hint="No stores have audit data for 2026." />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import CriteriaSelect from '../components/CriteriaSelect.vue'
import ChartCard from '../components/ChartCard.vue'
import SectionHeader from '../components/SectionHeader.vue'
import CheckboxFilterBar from '../components/CheckboxFilterBar.vue'
import ExecutiveKpiBar from '../components/ExecutiveKpiBar.vue'
import DrilldownModal from '../components/DrilldownModal.vue'
import ScrollNavButtons from '../components/ScrollNavButtons.vue'
import {
  getStoreMeta,
  getStoreColor,
  getCategoryColor,
  stripStoreBrand,
  lookupCriteriaMetric
} from '../store-meta.js'

function colorForId(id) {
  return getStoreColor(id)
}

const props = defineProps({
  excludeYear: { type: Number, default: 2025 }
})

const criteria = ref([])
const categories = ref([])
const stores = ref([])
const recentStoreIds = ref(null)
const latestDataMonth = ref(null)
const lookupsLoaded = ref(false)
const selectedStores = ref([])
const comparisonStoreIds = ref([])
const comparisonData = ref({})
const comparisonLoading = ref(false)
let comparisonRequest = 0
const selectedCategoriesForStore = ref([])
const selectedCategory = ref('')
const averageValue = ref(null)
const selectedCriterionId = ref(null)
const dataVersion = ref(0)
const periodFrom = ref(null)
const periodTo = ref(null)
const showDrilldown = ref(false)
const inspectStoreId = ref(null)

function handleInspectStore(storeId) {
  inspectStoreId.value = storeId
  showDrilldown.value = true
}

const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

// Safeguard period range selection from inversions
watch(periodFrom, (newFrom) => {
  if (newFrom !== null && periodTo.value !== null && periodTo.value < newFrom) {
    periodTo.value = newFrom
  }
})
watch(periodTo, (newTo) => {
  if (newTo !== null && periodFrom.value !== null && periodFrom.value > newTo) {
    periodFrom.value = newTo
  }
})

const storeFilterItems = computed(() => stores.value.map(s => {
  const meta = getStoreMeta(s.store_id)
  return {
    id: s.store_id,
    label: stripStoreBrand(s.name),
    color: meta?.color || colorForId(s.store_id)
  }
}))

const categoryFilterItems = computed(() => categories.value.map((cat, idx) => ({
  id: cat,
  label: cat,
  color: getCategoryColor(cat) || colorForId(idx + 1)
})))

const activeCategoryLegends = computed(() => {
  const selected = selectedCategoriesForStore.value || []
  return categories.value
    .filter(cat => selected.length === 0 || selected.includes(cat))
    .map((cat, idx) => ({
      name: cat,
      color: getCategoryColor(cat) || colorForId(idx + 1)
    }))
})

const categoryCriteria = computed(() => {
  if (!selectedCategory.value) return []
  return criteria.value.filter(c => c.category === selectedCategory.value)
})

function scoreColorClass(score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return 'text-slate-400'
  return Number(score) >= 80 ? 'text-emerald-700' : Number(score) >= 60 ? 'text-amber-700' : 'text-rose-700'
}

function scoreFillClass(score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return 'bg-slate-100 text-slate-400'
  return Number(score) >= 80 ? 'bg-emerald-500 text-white' : Number(score) >= 60 ? 'bg-amber-400 text-slate-900' : 'bg-rose-500 text-white'
}

function formatScore(score) {
  return score === null || score === undefined || !Number.isFinite(Number(score)) ? '—' : `${Number(score).toFixed(1)}%`
}

function toggleComparisonStore(storeId) {
  const ids = comparisonStoreIds.value
  if (ids.includes(storeId)) comparisonStoreIds.value = ids.filter(id => id !== storeId)
  else if (ids.length < 4) comparisonStoreIds.value = [...ids, storeId]
}

const comparisonCategories = computed(() => [...new Set(Object.values(comparisonData.value).flatMap(row => Object.keys(row.categories || {})))])
const comparisonRows = computed(() => comparisonStoreIds.value.map(id => {
  const store = stores.value.find(item => String(item.store_id) === String(id))
  const data = comparisonData.value[String(id)]
  return data && store ? { storeId: id, name: stripStoreBrand(store.name), score: data.score, categories: data.categories } : null
}).filter(Boolean))

async function loadComparison() {
  const request = ++comparisonRequest
  const ids = comparisonStoreIds.value.slice()
  if (ids.length < 2) { comparisonData.value = {}; return }
  comparisonLoading.value = true
  try {
    const results = await Promise.all(ids.map(async id => {
      try {
        const res = await fetch(`/api/store/${id}/passrate?year=2026`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload = await res.json()
        const labels = Array.isArray(payload.labels) ? payload.labels : []
        const datasets = Array.isArray(payload.datasets) ? payload.datasets : []
        const valid = labels.map((label, index) => ({ label, index })).filter(item => String(item.label || '').startsWith('2026-'))
          .filter(item => (periodFrom.value === null || Number(String(item.label).split('-')[1]) >= periodFrom.value) && (periodTo.value === null || Number(String(item.label).split('-')[1]) <= periodTo.value))
        const categories = {}
        datasets.forEach(ds => {
          const latest = valid.slice().reverse().find(item => ds.data?.[item.index] !== null && ds.data?.[item.index] !== undefined)
          const value = latest ? ds.data[latest.index] : null
          categories[ds.label] = value === null ? null : Math.round(Number(value) * 1000) / 10
        })
        const values = Object.values(categories).filter(value => value !== null)
        return [String(id), { categories, score: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null }]
      } catch { return [String(id), { categories: {}, score: null }] }
    }))
    if (request === comparisonRequest) comparisonData.value = Object.fromEntries(results)
  } finally {
    if (request === comparisonRequest) comparisonLoading.value = false
  }
}

watch([comparisonStoreIds, periodFrom, periodTo], loadComparison, { deep: true })

async function loadLookups() {
  try {
    const [critRes, catRes, storeDataRes] = await Promise.all([
      fetch(`/api/criteria?exclude_year=${props.excludeYear}`),
      fetch('/api/categories'),
      fetch('/api/store-audit/dashboard-stores?year=2026')
    ])
    try {
      const rawCrit = await critRes.json()
      criteria.value = (rawCrit || []).map(c => ({
        ...c,
        metrics: c.metrics || lookupCriteriaMetric(2026, c.label) || null
      }))
    } catch (e) { criteria.value = [] }
    try { categories.value = await catRes.json() } catch (e) { categories.value = [] }
    try {
      const storeData = await storeDataRes.json()
      stores.value = Array.isArray(storeData?.stores) ? storeData.stores : []
      recentStoreIds.value = Array.isArray(storeData?.recentStoreIds) ? storeData.recentStoreIds : null
      latestDataMonth.value = storeData?.latestDataMonth || null
    } catch (e) {
      stores.value = []
      recentStoreIds.value = null
      latestDataMonth.value = null
    }
  } catch (e) {
    criteria.value = []
    categories.value = []
    stores.value = []
    recentStoreIds.value = null
    latestDataMonth.value = null
  } finally {
    lookupsLoaded.value = true
  }
}

watch(criteria, (newVal) => {
  if (newVal && newVal.length) {
    const exists = newVal.some(c => c.id === selectedCriterionId.value)
    if (!exists) {
      selectedCriterionId.value = newVal[0].id
    }
  }
}, { immediate: true })

onMounted(async () => {
  await loadLookups()
  selectedStores.value = stores.value.map(s => s.store_id)
  comparisonStoreIds.value = stores.value.slice(0, 2).map(s => s.store_id)
  selectedCategoriesForStore.value = categories.value.slice()
  if (!selectedCriterionId.value && criteria.value.length) {
    selectedCriterionId.value = criteria.value[0].id
  }
  if (!selectedCategory.value && categories.value.length) {
    selectedCategory.value = categories.value[0]
  }
})

const selectedCriterion = computed(() => {
  return criteria.value.find(c => c.id === selectedCriterionId.value) || null
})

function categoryPassingGradeFor(categoryName) {
  if (!selectedCriterion.value || selectedCriterion.value.category !== categoryName) return null
  const val = selectedCriterion.value.passing_grade
  return (val === null || val === undefined) ? null : Number(val)
}

function passingGradeLabel(criterion) {
  if (!criterion) return 'No threshold available'
  const val = criterion.passing_grade
  if (val === null || val === undefined) return 'No threshold available'
  const unit = criterion.unit || ''
  return unit ? `${val}${unit === 'percent' || unit === '%' ? '%' : ' ' + unit}` : String(val)
}
</script>

<style scoped>
.page-gutter {
  padding-top: 0.35rem;
}
.main-grid {
  margin-top: 0.5rem;
}
.chart-column,
.info-column {
  height: 460px;
}
#criteria-section,
#category-passrate-section,
#store-passrate-section {
  scroll-margin-top: 5rem;
}
.label-on-page {
  color: #64748b;
}
</style>
