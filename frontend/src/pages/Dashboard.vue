<template>
  <div class="page-gutter px-4 sm:px-8 lg:px-16 max-w-[1400px] mx-auto pb-12">
    <Header subtitle="Year 2026" />

    <!-- Criteria search + selection -->
    <div id="criteria-section" class="controls-grid grid grid-cols-1 gap-4 md:grid-cols-3 mb-4">
      <div class="controls-bar md:col-span-2">
        <SectionHeader
          text="Criteria Performance Trends"
          description="Pick a criterion below to see how each store scored on it, month by month. The green line is the passing grade, and the red line is the average score across stores. Use the filters below the chart to narrow which months or stores are shown."
        />

        <label class="block text-sm mb-1 label-on-page">Select criteria</label>
        <CriteriaSelect :criteria="criteria" v-model="selectedCriterionId" />

        <div class="period-filter mt-3 flex items-center gap-2 flex-wrap">
          <label class="text-sm label-on-page font-medium">Period:</label>
          <select v-model="periodFrom" class="px-2 py-1 rounded border border-slate-300 bg-white text-slate-900 text-sm">
            <option :value="null">All</option>
            <option v-for="(m, idx) in monthNames" :key="'from-' + idx" :value="idx + 1">{{ m }}</option>
          </select>
          <span class="text-sm label-on-page">to</span>
          <select v-model="periodTo" class="px-2 py-1 rounded border border-slate-300 bg-white text-slate-900 text-sm">
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

      <!-- Info panel column -->
      <aside class="info-column p-4 rounded bg-slate-900 border border-slate-700 text-slate-100 flex flex-col">
        <h3 class="text-xl font-semibold mb-3">Chart Info</h3>

        <div class="legend mb-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-4 h-2 block bg-green-500 rounded-sm"></span>
            <div class="flex items-center gap-2">
              <span class="text-base">Passing grade:</span>
              <span class="text-2xl font-semibold text-slate-100">{{ passingGradeLabel(selectedCriterion) }}</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span class="w-4 h-2 block bg-red-500 rounded-sm"></span>
            <div class="flex items-center gap-2">
              <span class="text-base">Average:</span>
              <span class="text-2xl font-semibold text-slate-100">{{ averageValue === null ? '—' : averageValue }}</span>
            </div>
          </div>
        </div>

        <div class="criteria-details mb-3">
          <h4 class="text-base font-medium mb-1">Criteria Details</h4>
          <div v-if="selectedCriterion" class="text-base text-slate-300">
            <div><strong>Name:</strong> {{ selectedCriterion.label }}</div>
            <div><strong>Category:</strong> {{ selectedCriterion.category }}</div>
          </div>
          <div v-else class="text-base text-slate-400">No criterion selected</div>
        </div>

        <!-- Scoring rubric text for the selected criterion, straight from
             the CSV's "Metrics" column — explains what each score value
             (e.g. 3, 2, 1, 0) means for this specific criterion -->
        <div class="metrics-details flex-1 min-h-0 flex flex-col">
          <h4 class="text-base font-medium mb-1">Metrics</h4>
          <div
            v-if="selectedCriterion && selectedCriterion.metrics"
            class="text-sm text-slate-300 whitespace-pre-line overflow-y-auto pr-1 flex-1 leading-relaxed"
          >{{ selectedCriterion.metrics }}</div>
          <div v-else class="text-sm text-slate-400">No metrics available for this criterion.</div>
        </div>
      </aside>
    </div>

    <!-- Category Pass Rate Section: Same layout as line chart (Bar chart on left, info & list of criteria on right) -->
    <div id="category-passrate-section" class="passrate-section mt-10">
      <SectionHeader
        text="Category Pass Rate"
        description="See what percentage of stores passed each category every month. The bar chart shows each store's pass rate, and the red line is the average pass rate across all stores. The list on the right shows every criterion included in that category."
      />

      <!-- Category selection tabs -->
      <div class="category-tabs flex items-center gap-2 overflow-x-auto pb-2 mb-3">
        <button
          v-for="cat in categories"
          :key="'tab-' + cat"
          @click="selectedCategory = cat"
          type="button"
          :class="selectedCategory === cat ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'"
          class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
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
        <aside class="info-column p-4 rounded bg-slate-900 border border-slate-700 text-slate-100 flex flex-col justify-between">
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
                  class="p-2.5 rounded bg-slate-800/80 border border-slate-700 text-xs hover:border-purple-500/50 transition-colors flex items-center justify-between gap-2"
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Header from '../components/Header.vue'
import CriteriaSelect from '../components/CriteriaSelect.vue'
import ChartCard from '../components/ChartCard.vue'
import SectionHeader from '../components/SectionHeader.vue'
import CheckboxFilterBar from '../components/CheckboxFilterBar.vue'

// Updated Palette: Store 1 (Lebak Bulus) is now Purple (#8b5cf6) instead of Red (#ef4444)
const COLOR_PALETTE = [
  '#8b5cf6', // purple: Store 1 (Birmas Lebak Bulus) - now distinct from Average line!
  '#22c55e', // green: Store 2
  '#3b82f6', // blue: Store 3
  '#f59e0b', // amber: Store 4
  '#a855f7', // violet: Store 5
  '#06b6d4', // cyan: Store 6
  '#ec4899', // pink
  '#84cc16', // lime
  '#f97316', // orange
  '#14b8a6'  // teal
]

function colorForId(id) {
  return COLOR_PALETTE[(Number(id) - 1) % COLOR_PALETTE.length]
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

const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const storeFilterItems = computed(() => stores.value.map(s => ({
  id: s.store_id,
  label: stripStoreBrand(s.name),
  color: colorForId(s.store_id)
})))

const categoryFilterItems = computed(() => categories.value.map((cat, idx) => ({
  id: cat,
  label: cat,
  color: colorForId(idx + 1)
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

function stripStoreBrand(name) {
  return String(name || '').replace(/^birmas\s+/i, '').trim()
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
  color: #e2e8f0;
}
</style>