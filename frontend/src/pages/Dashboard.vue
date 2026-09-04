<template>
  <div class="page-gutter px-4 sm:px-8 lg:px-16 max-w-[1400px] mx-auto">
    <Header subtitle="All years except 2025">
      <router-link
        to="/dashboard2025"
        class="btn bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700"
      >
        View 2025 Dashboard
      </router-link>
    </Header>

    <!-- Criteria search + selection (single combined bar); width matches the
         line chart column below it via the same 3-column grid -->
    <div class="controls-grid grid grid-cols-1 gap-4 md:grid-cols-3 mb-4">
      <div class="controls-bar md:col-span-2">
        <SectionHeader text="Criteria" />
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
          @update:selected-stores="selectedStores = $event"
          @update:average="averageValue = $event"
          :passingGrade="categoryPassingGradeFor(selectedCriterion.category)"
          :options="{ title: { text: selectedCriterion.label } }"
          :exclude-year="excludeYear"
          :period-from="periodFrom"
          :period-to="periodTo"
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
         (selected) stores for every month. Multiple selected stores render
         as grouped/clustered bars. -->
    <div class="passrate-section mt-6">
      <SectionHeader text="Category Pass Rate" />
      <div class="passrate-grid grid grid-cols-1 gap-4 md:grid-cols-2 mt-2">
        <ChartCard
          v-for="cat in categories"
          :key="'passrate-' + cat"
          :category="cat"
          type="bar"
          :stores="stores"
          :selected-stores="selectedStores"
          :exclude-year="excludeYear"
          :period-from="periodFrom"
          :period-to="periodTo"
          :options="{ title: { text: cat } }"
        />
      </div>
    </div>

    <!-- Store passing rate: pivoted view, one chart per store, with
         categories as the grouped/clustered bar series. -->
    <div class="storerate-section mt-6">
      <SectionHeader text="Store Passing Rate" />
      <div class="passrate-grid grid grid-cols-1 gap-4 md:grid-cols-2 mt-2">
        <ChartCard
          v-for="s in stores"
          :key="'storerate-' + s.store_id"
          type="bar"
          :store-id="s.store_id"
          :exclude-year="excludeYear"
          :period-from="periodFrom"
          :period-to="periodTo"
          :options="{ title: { text: stripStoreBrand(s.name) } }"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ChartCard from '../components/ChartCard.vue'
import CriteriaSelect from '../components/CriteriaSelect.vue'
import Header from '../components/Header.vue'
import SectionHeader from '../components/SectionHeader.vue'

const props = defineProps({
  excludeYear: { type: Number, default: 2025 }
})

const criteria = ref([])            // list of criteria for years other than excludeYear
const categories = ref([])
const passingGrades = ref({})       // API may return category -> { categoryPassingGrade, criteria: {...}, unit }
const stores = ref([])              // list of stores { store_id, name }
const selectedStores = ref([])
const averageValue = ref(null)      // overall average for the selected criterion, from ChartCard

const selectedCriterionId = ref(null)

// period (month range) filter applied across all charts on this page
const periodFrom = ref(null)
const periodTo = ref(null)
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

// fetch initial data (criteria/passing-grades scoped to "all years except 2025")
onMounted(async () => {
  const excludeYear = props.excludeYear
  const [critRes, catRes, gradeRes, storesRes] = await Promise.all([
    fetch(`/api/criteria?exclude_year=${excludeYear}`),
    fetch('/api/categories'),
    fetch(`/api/passing-grades?exclude_year=${excludeYear}`),
    fetch('/api/stores')
  ])

  try {
    criteria.value = await critRes.json()
  } catch (e) { criteria.value = [] }

  try {
    categories.value = await catRes.json()
  } catch (e) { categories.value = [] }

  try {
    passingGrades.value = await gradeRes.json()
  } catch (e) { passingGrades.value = {} }

  try {
    stores.value = await storesRes.json()
  } catch (e) { stores.value = [] }

  // default: all stores selected/shown (filled dots) until the user
  // deselects some via the line chart's clickable legend
  selectedStores.value = stores.value.map(s => s.store_id)

  // default selection: first criterion if none selected
  if (!selectedCriterionId.value && criteria.value.length) {
    selectedCriterionId.value = criteria.value[0].id
  }
})

const selectedCriterion = computed(() => {
  return criteria.value.find(c => c.id === selectedCriterionId.value) || null
})

// helper: return category-level passing grade (normalized number or null)
function categoryPassingGradeFor(categoryName) {
  if (!categoryName) return null
  const entry = passingGrades.value?.[categoryName]
  if (!entry) return null
  // entry may be a number or an object with categoryPassingGrade
  if (typeof entry === 'number') return entry
  if (entry && typeof entry.categoryPassingGrade === 'number') return entry.categoryPassingGrade
  // fallback: if entry.criteria exists, compute median of criteria values
  if (entry && entry.criteria) {
    const vals = Object.values(entry.criteria).map(v => Number(v)).filter(v => !isNaN(v))
    if (!vals.length) return null
    vals.sort((a,b) => a-b)
    const mid = Math.floor(vals.length/2)
    return (vals.length % 2) ? vals[mid] : (vals[mid-1] + vals[mid]) / 2
  }
  return null
}

// label for passing grade display (adds unit if available)
function passingGradeLabel(criterion) {
  if (!criterion) return 'No threshold available'
  const cat = criterion.category
  const entry = passingGrades.value?.[cat]
  let val = categoryPassingGradeFor(cat)
  if (val === null || val === undefined) return 'No threshold available'
  const unit = (entry && entry.unit) || (criterion.unit || '')
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
</style>
