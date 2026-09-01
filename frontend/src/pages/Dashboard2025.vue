<!-- src/pages/Dashboard2025.vue -->
<template>
  <div>
    <Header subtitle="Year 2025 data only">
      <router-link
        to="/dashboard"
        class="btn bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700"
      >
        Main Dashboard
      </router-link>
    </Header>

    <!-- Criteria search + selection (single combined bar) -->
    <div class="controls-bar mb-4">
      <h4 class="text-sm font-medium mb-1 text-slate-100">Criteria</h4>
      <label class="block text-sm text-slate-300 mb-1">Select criteria</label>
      <CriteriaSelect :criteria="criteria" v-model="selectedCriterionId" />
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
          :selected-stores="selectedStores"
          :passingGrade="categoryPassingGradeFor(selectedCriterion.category)"
          :options="{ title: { text: selectedCriterion.label } }"
          :year="2025"
          :key="selectedCriterion.id + '-' + selectedStores.join(',')"
        />
        <StoreLegendToggle :stores="stores" v-model="selectedStores" />
      </div>

      <!-- Info panel column -->
      <aside class="info-column p-4 rounded bg-slate-900 border border-slate-700 text-slate-100 flex flex-col">
        <h3 class="font-semibold mb-2">Chart Info</h3>

        <div class="legend mb-3">
          <div class="flex items-center gap-2 mb-2">
            <span class="w-4 h-2 block bg-green-500 rounded-sm"></span>
            <div class="flex items-center gap-2">
              <span class="text-sm">Passing grade:</span>
              <span class="text-lg font-semibold text-slate-100">{{ passingGradeLabel(selectedCriterion) }}</span>
            </div>
          </div>
        </div>

        <div class="criteria-details mb-3">
          <h4 class="text-sm font-medium mb-1">Criteria Details</h4>
          <div v-if="selectedCriterion" class="text-sm text-slate-300">
            <div><strong>Name:</strong> {{ selectedCriterion.label }}</div>
            <div><strong>Category:</strong> {{ selectedCriterion.category }}</div>
          </div>
          <div v-else class="text-sm text-slate-400">No criterion selected</div>
        </div>
      </aside>
    </div>

    <!-- Passing rate bar charts: one per category, showing pass rate across
         (selected) stores for every month of 2025. Multiple selected stores
         render as grouped/clustered bars. -->
    <div class="passrate-section mt-6">
      <h3 class="text-lg font-semibold mb-3 text-slate-100">Category Pass Rate</h3>
      <div class="passrate-grid grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard
          v-for="cat in categories"
          :key="'passrate-' + cat + '-' + selectedStores.join(',')"
          :category="cat"
          type="bar"
          :selected-stores="selectedStores"
          :year="2025"
          :options="{ title: { text: cat } }"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ChartCard from '../components/ChartCard.vue'
import StoreLegendToggle from '../components/StoreLegendToggle.vue'
import CriteriaSelect from '../components/CriteriaSelect.vue'
import Header from '../components/Header.vue'

const criteria = ref([])            // list of criteria recorded in 2025 only
const categories = ref([])
const passingGrades = ref({})       // API: { CategoryName: { categoryPassingGrade: 75, unit: 'percent', criteria: {...} } }
const stores = ref([])              // list of stores { store_id, name }
const selectedStores = ref([])

const selectedCriterionId = ref(null)

// fetch initial data (criteria/passing-grades scoped to year 2025 only)
onMounted(async () => {
  const [critRes, catRes, gradeRes, storesRes] = await Promise.all([
    fetch('/api/criteria?year=2025'),
    fetch('/api/categories'),
    fetch('/api/passing-grades?year=2025'),
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
  if (typeof entry === 'number') return entry
  if (entry && typeof entry.categoryPassingGrade === 'number') return entry.categoryPassingGrade
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
</script>

<style scoped>
.header { margin-bottom: 0.5rem; }
.btn { display: inline-flex; align-items: center; justify-content: center; }

/* main grid spacing */
.main-grid { margin-top: 0.5rem; }

/* Chart column and info panel share the same fixed height so the line
   chart and Chart Info panel line up visually */
.chart-column,
.info-column {
  height: 420px;
}
</style>
