<!-- src/pages/Dashboard2025.vue -->
<template>
  <div>
    <div class="header flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold">Audit Dashboard — 2025</h2>

      <div class="controls flex items-center gap-3">
        <router-link
          to="/dashboard"
          class="btn bg-gray-700 text-white px-3 py-1 rounded hover:bg-gray-800"
        >
          Main Dashboard
        </router-link>
      </div>
    </div>

    <!-- Top controls: criteria search + dropdown -->
    <div class="controls-bar mb-4 grid grid-cols-1 gap-3 md:grid-cols-3 items-center">
      <div class="criteria-select col-span-2">
        <label class="block text-sm text-slate-300 mb-1">Select criterion</label>

        <div class="flex gap-2">
          <input
            v-model="criteriaSearch"
            type="search"
            placeholder="Search criteria..."
            class="w-1/3 px-3 py-2 rounded bg-slate-800 text-slate-100 border border-slate-700"
          />

          <select
            v-model="selectedCriterionId"
            class="flex-1 px-3 py-2 rounded bg-slate-800 text-slate-100 border border-slate-700"
          >
            <option v-for="c in filteredCriteria" :key="c.id" :value="c.id">
              {{ c.label }} — {{ c.category }}
            </option>
          </select>
        </div>
      </div>

      <div class="year-select">
        <label class="block text-sm text-slate-300 mb-1">Year</label>
        <select v-model="year" class="px-3 py-2 rounded bg-slate-800 text-slate-100 border border-slate-700">
          <option :value="null">All</option>
          <option v-for="y in availableYears" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
    </div>

    <!-- Main chart area with right-side info panel -->
    <div class="main-grid grid grid-cols-1 gap-4 md:grid-cols-3">
      <!-- Chart column (spans 2/3 on md+) -->
      <div class="chart-column md:col-span-2">
        <ChartCard
          v-if="selectedCriterion"
          :category="selectedCriterion.category"
          :criterion="selectedCriterion.id"
          type="line"
          :selected-stores="selectedStores"
          :passingGrade="categoryPassingGradeFor(selectedCriterion.category)"
          :options="{ title: { text: selectedCriterion.label } }"
          :year="2025"
          :exclude-year="excludeYear"
          :key="selectedCriterion.id + '-' + year + '-' + selectedStores.join(',')"
        />
      </div>

      <!-- Info panel column -->
      <aside class="info-column p-4 rounded bg-slate-900 border border-slate-700 text-slate-100">
        <h3 class="font-semibold mb-2">Legend & Info</h3>

        <div class="legend mb-3">
          <div class="flex items-center gap-2 mb-2">
            <span class="w-4 h-2 block bg-green-500 rounded-sm"></span>
            <div>
              <div class="text-sm">Passing grade</div>
              <div class="text-xs text-slate-400">
                {{ passingGradeLabel(selectedCriterion) }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 mb-2">
            <span class="w-4 h-2 block bg-red-500 rounded-sm"></span>
            <div>
              <div class="text-sm">Average (per month)</div>
              <div class="text-xs text-slate-400">Shown as red line on the chart</div>
            </div>
          </div>
        </div>

        <div class="criteria-details mb-3">
          <h4 class="text-sm font-medium mb-1">Criterion details</h4>
          <div v-if="selectedCriterion" class="text-sm text-slate-300">
            <div><strong>Name:</strong> {{ selectedCriterion.label }}</div>
            <div><strong>Category:</strong> {{ selectedCriterion.category }}</div>
            <div><strong>Unit:</strong> {{ selectedCriterion.unit || 'raw' }}</div>
          </div>
          <div v-else class="text-sm text-slate-400">No criterion selected</div>
        </div>

        <div class="stores-legend">
          <h4 class="text-sm font-medium mb-1">Stores</h4>
          <div v-if="stores.length" class="grid grid-cols-1 gap-2 text-sm">
            <div v-for="s in stores" :key="s.id" class="flex items-center gap-2">
              <span :style="{ background: colorForStore(s) }" class="w-3 h-3 rounded-full inline-block"></span>
              <span class="truncate text-slate-200">{{ s.name }}</span>
            </div>
          </div>
          <div v-else class="text-sm text-slate-400">No stores loaded</div>
        </div>
      </aside>
    </div>

    <!-- Store filter / checklist below chart -->
    <div class="store-filter mt-4">
      <h4 class="text-sm font-medium mb-2">Select stores</h4>
      <StoreFilter v-model="selectedStores" :criteria-filter="criteriaSearch" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ChartCard from '../components/ChartCard.vue'
import StoreFilter from '../components/StoreFilter.vue'

const props = defineProps({
  excludeYear: { type: Number, default: 2025 }
})

const criteria = ref([])            // list of all criteria { id, label, category, unit }
const categories = ref([])
const passingGrades = ref({})       // API: { CategoryName: { categoryPassingGrade: 75, unit: 'percent', criteria: {...} } }
const stores = ref([])              // list of stores { id, name }
const selectedStores = ref([])

const criteriaSearch = ref('')
const selectedCriterionId = ref(null)
const year = ref(2025)
const availableYears = ref([2026, 2025, 2024]) // fallback; can be fetched

// fetch initial data
onMounted(async () => {
  const [critRes, catRes, gradeRes, storesRes] = await Promise.all([
    fetch('/api/criteria'),          // expected: [{ id, label, category, unit }]
    fetch('/api/categories'),
    fetch('/api/passing-grades'),    // expected: { CategoryName: { categoryPassingGrade: 75, unit: 'percent', criteria: {...} } }
    fetch('/api/stores')             // expected: [{ id, name }]
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

// computed filtered criteria list
const filteredCriteria = computed(() => {
  const q = String(criteriaSearch.value || '').trim().toLowerCase()
  if (!q) return criteria.value
  return criteria.value.filter(c => {
    return (c.label || '').toLowerCase().includes(q) ||
           (c.category || '').toLowerCase().includes(q)
  })
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

// small deterministic color helper for stores (used in legend)
function colorForStore(store) {
  if (!store || !store.name) return '#64748b'
  let sum = 0
  for (let i = 0; i < store.name.length; i++) sum += store.name.charCodeAt(i)
  const hue = (sum * 37) % 360
  return `hsl(${hue} 70% 50%)`
}

// label for passing grade display (adds unit if available)
function passingGradeLabel(criterion) {
  if (!criterion) return ''
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

/* layout */
.controls-bar input,
.controls-bar select { outline: none; }

/* main grid spacing */
.main-grid { margin-top: 0.5rem; }

/* Chart column ensures chart fills available height */
.chart-column { min-height: 260px; }

/* info panel styling */
.info-column { min-height: 120px; }

/* store filter area */
.store-filter { margin-top: 1rem; }

/* small responsive tweaks */
@media (max-width: 767px) {
  .controls-bar { grid-template-columns: 1fr; }
}
</style>
