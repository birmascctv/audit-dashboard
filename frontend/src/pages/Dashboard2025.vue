<!-- src/pages/Dashboard2025.vue -->
<template>
  <div class="page-gutter px-4 sm:px-8 lg:px-16 max-w-[1400px] mx-auto">
    <Header subtitle="Year 2025 data only">
      <router-link
        to="/dashboard"
        class="btn bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700"
      >
        Main Dashboard
      </router-link>
    </Header>

    <!-- Criteria search + selection (single combined bar); width matches the
         line chart column below it via the same 3-column grid -->
    <div id="criteria-section" class="controls-grid grid grid-cols-1 gap-4 md:grid-cols-3 mb-4">
      <div class="controls-bar md:col-span-2">
        <SectionHeader
          text="Criteria"
          description="Pick a criterion to see its monthly score trend. Use the period filter to narrow the months shown."
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

    <!-- Store filter for the line chart: which stores' data is fetched/shown -->
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
          :year="2025"
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
      </aside>
    </div>

    <!-- Passing rate bar charts: one per category, showing pass rate across
         (selected) stores for every month of 2025. Multiple selected stores
         render as grouped/clustered bars. -->
    <div id="category-passrate-section" class="passrate-section mt-10">
      <SectionHeader
        text="Category Pass Rate & Evaluated Criteria"
        description="Analyze compliance percentages across stores for each audit category over time. The bar chart on the left illustrates monthly store achievement relative to the network average (red line), while the panel on the right details all active criteria monitored under this category."
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
                Criteria Evaluated In This Category
              </h4>
              <div class="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                <div
                  v-for="c in categoryCriteria"
                  :key="'cat-crit-' + c.id"
                  class="p-2.5 rounded bg-slate-800/80 border border-slate-700 text-xs hover:border-purple-500/50 transition-colors"
                >
                  <div class="font-medium text-slate-100">{{ c.label }}</div>
                  <div class="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>Passing grade: <strong class="text-emerald-400">{{ c.passing_grade }}</strong></span>
                    <span v-if="c.unit" class="text-slate-500">{{ c.unit }}</span>
                  </div>
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

    <!-- Store passing rate: pivoted view, one chart per store, with
         categories as the grouped/clustered bar series. -->
    <div id="store-passrate-section" class="storerate-section mt-6">
      <SectionHeader
        text="Store Pass Rate"
        description="Pass rate per category for each store, per month. The red line is the average pass rate across all selected categories for that month."
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
          :year="2025"
          :period-from="periodFrom"
          :period-to="periodTo"
          :refresh-key="dataVersion"
          :options="{ title: { text: stripStoreBrand(s.name) } }"
        />
      </div>
    </div>

    <!-- Upload Data: add/replace a single store+month+year CSV; on success
         bump dataVersion so every ChartCard above reloads automatically. -->
    <div id="upload-section" class="upload-section mt-6">
      <SectionHeader
        text="Upload Data"
        description="Upload a new audit CSV for a store, year, and month. Existing data for that store/month/year will be updated (the old file is kept); brand-new data will be added; matching charts refresh automatically."
      />
      <UploadDataCard :stores="stores" @uploaded="onUploaded" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ChartCard from '../components/ChartCard.vue'
import CriteriaSelect from '../components/CriteriaSelect.vue'
import Header from '../components/Header.vue'
import SectionHeader from '../components/SectionHeader.vue'
import CheckboxFilterBar from '../components/CheckboxFilterBar.vue'
import UploadDataCard from '../components/UploadDataCard.vue'

// mirrors backend COLOR_PALETTE in app.py's color_for_id(), so the store/
// category checkbox dots match the colors used on the actual charts
const COLOR_PALETTE = [
  '#2C0092', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6'
]
function colorForId(id) {
  return COLOR_PALETTE[(Number(id) - 1) % COLOR_PALETTE.length]
}

const criteria = ref([])            // list of criteria recorded in 2025 only
const categories = ref([])
const stores = ref([])              // list of stores { store_id, name }
const selectedStores = ref([])
const selectedCategoriesForStore = ref([]) // category filter for Store Passing Rate charts
const averageValue = ref(null)      // overall average for the selected criterion, from ChartCard

const selectedCriterionId = ref(null)
const dataVersion = ref(0)

// period (month range) filter applied across all charts on this page
const periodFrom = ref(null)
const periodTo = ref(null)
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

// checkbox items for the store filter (line chart + Category Pass Rate)
const storeFilterItems = computed(() => stores.value.map(s => ({
  id: s.store_id,
  label: stripStoreBrand(s.name),
  color: colorForId(s.store_id)
})))

// checkbox items for the category filter (Store Passing Rate); colors mirror
// the backend's category_index (1-based, alphabetical) used in store_passrate
const categoryFilterItems = computed(() => categories.value.map((cat, idx) => ({
  id: cat,
  label: cat,
  color: colorForId(idx + 1)
})))

const selectedCategory = ref('')
const categoryCriteria = computed(() => {
  if (!selectedCategory.value) return []
  return criteria.value.filter(c => c.category === selectedCategory.value)
})

onMounted(async () => {
  await loadLookups()
  // ... existing store selections ...
  if (!selectedCategory.value && categories.value.length) {
    selectedCategory.value = categories.value[0]
  }
})

// (re)fetch criteria/categories/stores; also used after an Upload Data
// submission in case it introduced a new criterion/category
async function loadLookups() {
  const [critRes, catRes, storesRes] = await Promise.all([
    fetch('/api/criteria?year=2025'),
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

// after a successful/updated upload: refresh lookups (in case a new
// criterion/category/store appeared) and bump dataVersion so every
// ChartCard reloads its data
async function onUploaded() {
  await loadLookups()
  dataVersion.value++
}

// fetch initial data (criteria/stores scoped to year 2025 only)
onMounted(async () => {
  await loadLookups()

  // default: all stores/categories selected until the user unchecks some
  selectedStores.value = stores.value.map(s => s.store_id)
  selectedCategoriesForStore.value = categories.value.slice()

  // default selection: first criterion if none selected
  if (!selectedCriterionId.value && criteria.value.length) {
    selectedCriterionId.value = criteria.value[0].id
  }
})

const selectedCriterion = computed(() => {
  return criteria.value.find(c => c.id === selectedCriterionId.value) || null
})

// helper: return the SPECIFIC criterion's own passing grade (not a
// category-wide aggregate — categories can contain criteria with very
// different thresholds, e.g. Stock Opname mixes passing grades of 1 and 3,
// so a category median would misrepresent an individual criterion's max)
function categoryPassingGradeFor(categoryName) {
  if (!selectedCriterion.value || selectedCriterion.value.category !== categoryName) return null
  const val = selectedCriterion.value.passing_grade
  return (val === null || val === undefined) ? null : Number(val)
}

// label for passing grade display (adds unit if available)
function passingGradeLabel(criterion) {
  if (!criterion) return 'No threshold available'
  const val = criterion.passing_grade
  if (val === null || val === undefined) return 'No threshold available'
  const unit = criterion.unit || ''
  return unit ? `${val}${unit === 'percent' || unit === '%' ? '%' : ' ' + unit}` : String(val)
}

// strip the redundant "Birmas " prefix from store names for short labels
function stripStoreBrand(name) {
  return String(name || '').replace(/^birmas\s+/i, '').trim()
}
</script>

<style scoped>
.header { margin-bottom: 0.5rem; }
.btn { display: inline-flex; align-items: center; justify-content: center; }

/* Titles/labels sitting directly on the page's light-grey background need
   dark text (the light "slate" text colors are meant for the dark cards) */
.title-on-page { color: #111827; }
.label-on-page { color: #374151; }

/* main grid spacing */
.main-grid { margin-top: 0.5rem; }

/* Chart column and info panel share the same fixed height so the line
   chart and Chart Info panel line up visually */
.chart-column,
.info-column {
  height: 420px;
}

/* The header is fixed/always-visible, so push page content below it and
   make sure the nav's anchor links don't scroll a section title under it */
.page-gutter {
  padding-top: 6.5rem;
}
#criteria-section,
#category-passrate-section,
#store-passrate-section {
  scroll-margin-top: 6.5rem;
}
</style>
