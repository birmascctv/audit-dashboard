<template>
  <div class="page-gutter px-4 sm:px-8 lg:px-16 max-w-[1400px] mx-auto pb-12">
    <Header subtitle="Year 2026" />

    <!-- STORE RANKS: Top 3 Outlets & Academic Grade Index -->
    <ExecutiveKpiBar
      :year="2026"
      :stores="stores"
      :categories="categories"
      :period-from="periodFrom"
      :period-to="periodTo"
    />

    <!-- Criteria search + selection -->
    <div id="criteria-section" class="controls-grid grid grid-cols-1 gap-4 md:grid-cols-3 mb-4">
      <div class="controls-bar md:col-span-2">
        <SectionHeader
          text="Criteria Performance Trends"
          description="Inspect month-by-month score trajectories for any selected audit criteria. The line chart plots store performance against the target passing grade (green line) and the overall average (red line). Use the date filters below to narrow the assessment period."
        />

        <label class="block text-sm mb-1.5 label-on-page font-medium">Select criteria</label>
        <CriteriaSelect :criteria="criteria" v-model="selectedCriterionId" />

        <div class="period-filter mt-3.5 flex items-center gap-2 flex-wrap">
          <label class="text-sm label-on-page font-medium">Period:</label>
          <select
            v-model="periodFrom"
            class="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 text-xs font-medium focus:outline-none focus:border-blue-500 shadow-sm"
          >
            <option :value="null">All</option>
            <option v-for="(m, idx) in monthNames" :key="'from-' + idx" :value="idx + 1">{{ m }}</option>
          </select>
          <span class="text-xs label-on-page">to</span>
          <select
            v-model="periodTo"
            class="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 text-xs font-medium focus:outline-none focus:border-blue-500 shadow-sm"
          >
            <option :value="null">All</option>
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
          :exclude-year="excludeYear"
          :period-from="periodFrom"
          :period-to="periodTo"
          :refresh-key="dataVersion"
          :key="selectedCriterion.id"
        />
      </div>

      <!-- Criteria Info Column (spans 1/3 on md+) -->
      <aside class="info-column p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 flex flex-col justify-between shadow-xl">
        <div class="flex-1 flex flex-col min-h-0">
          <div class="flex items-center justify-between mb-3 border-b border-slate-800 pb-2.5">
            <div>
              <h3 class="text-lg font-bold text-white leading-tight">Chart Info</h3>
              <p class="text-xs text-slate-400">Key metrics & criteria benchmarks</p>
            </div>
            <button
              type="button"
              @click="showDrilldown = true"
              class="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
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
              <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
                <span class="text-xs font-medium text-slate-400">Target</span>
                <span class="text-lg font-bold text-emerald-400 leading-tight my-0.5">
                  {{ passingGradeLabel(selectedCriterion) }}
                </span>
                <span class="text-[11px] text-slate-400">Passing Grade</span>
              </div>
              <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
                <span class="text-xs font-medium text-slate-400">Average</span>
                <span class="text-lg font-bold text-red-400 leading-tight my-0.5">
                  {{ averageValue !== null ? averageValue : '—' }}
                </span>
                <span class="text-[11px] text-slate-400">Store Average</span>
              </div>
            </div>

            <!-- Active Criteria Card -->
            <div v-if="selectedCriterion" class="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Criteria Details</span>
                <span class="text-xs font-mono font-medium text-purple-300 bg-purple-950/60 border border-purple-800/50 px-2 py-0.5 rounded-md">
                  {{ selectedCriterion.category }}
                </span>
              </div>
              <div class="text-sm font-semibold text-white leading-snug">
                {{ selectedCriterion.label }}
              </div>
            </div>

            <!-- Scoring Rubric / Metrics Definition from CSV -->
            <div v-if="selectedCriterion && selectedCriterion.metrics" class="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                Scoring Rubric (CSV Definition)
              </span>
              <div class="text-xs text-slate-300 leading-relaxed whitespace-pre-line font-sans bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80">
                {{ selectedCriterion.metrics }}
              </div>
            </div>
          </div>
        </div>

        <!-- Legend footer -->
        <div class="pt-2.5 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between flex-shrink-0 mt-3">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5">
              <span class="w-3 h-1 bg-emerald-500 rounded-full inline-block"></span>
              Passing Grade
            </span>
            <span class="flex items-center gap-1.5">
              <span class="w-3 h-1 bg-red-500 rounded-full inline-block"></span>
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
          :class="selectedCategory === cat ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'"
          class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
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
            :exclude-year="excludeYear"
            :period-from="periodFrom"
            :period-to="periodTo"
            :refresh-key="dataVersion"
            :options="{ title: { text: selectedCategory + ' Compliance Rate' } }"
          />
        </div>

        <!-- Right: Category Info & Criteria List -->
        <aside class="info-column p-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 flex flex-col justify-between shadow-xl">
          <div>
            <div class="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
              <h3 class="text-lg font-semibold text-white">{{ selectedCategory }} Info</h3>
              <span class="text-xs bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded border border-purple-700/50">
                {{ categoryCriteria.length }} criteria
              </span>
            </div>

            <div class="mb-3">
              <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Criteria In This Category
              </h4>
              <div class="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                <div
                  v-for="c in categoryCriteria"
                  :key="'cat-crit-' + c.id"
                  class="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs hover:border-purple-500/50 transition-colors flex items-center justify-between gap-2"
                >
                  <div class="font-medium text-slate-100 leading-snug">{{ c.label }}</div>
                  <span v-if="c.unit" class="text-[11px] text-slate-500 flex-shrink-0">{{ c.unit }}</span>
                </div>
                <div v-if="!categoryCriteria.length" class="text-xs text-slate-500 italic p-3">
                  No criteria found for this category.
                </div>
              </div>
            </div>
          </div>

          <div class="pt-2 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>Red line: Store Average</span>
            <span class="w-3 h-1.5 bg-red-500 rounded-xs"></span>
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

      <div class="category-filter-row mb-3">
        <CheckboxFilterBar :items="categoryFilterItems" v-model="selectedCategoriesForStore" all-label="All categories" />
      </div>

      <div class="passrate-grid grid grid-cols-1 gap-4 md:grid-cols-2 mt-2">
        <ChartCard
          v-for="s in stores"
          :key="'storerate-' + s.store_id"
          type="bar"
          :store-id="s.store_id"
          :selected-categories="selectedCategoriesForStore"
          :exclude-year="excludeYear"
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
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import Header from '../components/Header.vue'
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
  stripStoreBrand
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
const selectedStores = ref([])
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

const categoryCriteria = computed(() => {
  if (!selectedCategory.value) return []
  return criteria.value.filter(c => c.category === selectedCategory.value)
})

async function loadLookups() {
  const excludeYear = props.excludeYear
  const [critRes, catRes, storesRes] = await Promise.all([
    fetch(`/api/criteria?exclude_year=${excludeYear}`),
    fetch('/api/categories'),
    fetch('/api/stores')
  ])
  try {
    criteria.value = await critRes.json()
  } catch (e) { criteria.value = [] }
  try {
    categories.value = await catRes.json()
  } catch (e) { categories.value = [] }
  try {
    stores.value = await storesRes.json()
  } catch (e) { stores.value = [] }
}

onMounted(async () => {
  await loadLookups()
  selectedStores.value = stores.value.map(s => s.store_id)
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
  padding-top: 6.5rem;
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
  scroll-margin-top: 6.5rem;
}
.label-on-page {
  color: #94a3b8;
}
</style>
