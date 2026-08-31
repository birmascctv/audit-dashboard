<template>
  <div>
    <div class="header flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold">Audit Dashboard</h2>

      <div class="controls flex items-center gap-3">
        <router-link
          to="/dashboard2025"
          class="btn bg-sky-600 text-white px-3 py-1 rounded hover:bg-sky-700"
        >
          View 2025 Dashboard
        </router-link>

        <router-link
          v-if="$route.path !== '/dashboard'"
          to="/dashboard"
          class="btn bg-gray-700 text-white px-3 py-1 rounded hover:bg-gray-800"
        >
          Main Dashboard
        </router-link>
      </div>
    </div>

    <!-- Store filter -->
    <StoreFilter v-model="selectedStores" />

    <!-- Monthly charts: use explicit CSS grid class for reliable 2-column layout -->
    <div class="charts-grid mt-4">
      <ChartCard
        v-for="cat in categories"
        :key="cat"
        type="line"
        :category="cat"
        :selected-stores="selectedStores"
        :passingGrade="passingGrades[cat]"
        :options="{ title: { text: cat } }"
        :year="year"
        :exclude-year="excludeYear"
      />
    </div>

    <!-- Pass rate charts -->
    <div class="charts-grid mt-6">
      <ChartCard
        v-for="cat in categories"
        :key="cat + '-passrate'"
        type="bar"
        :category="cat"
        :selected-stores="selectedStores"
        :passingGrade="passingGrades[cat]"
        :options="{ title: { text: cat + ' Pass Rate' } }"
        :year="year"
        :exclude-year="excludeYear"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import ChartCard from '../components/ChartCard.vue'
import StoreFilter from '../components/StoreFilter.vue'

const props = defineProps({
  year: { type: Number, default: null },
  excludeYear: { type: Number, default: 2025 }
})

const categories = ref([])
const passingGrades = ref({})
const selectedStores = ref([])

onMounted(async () => {
  const [catRes, gradeRes] = await Promise.all([
    fetch('/api/categories'),
    fetch('/api/passing-grades')
  ])
  categories.value = await catRes.json()
  passingGrades.value = await gradeRes.json()
})
</script>

<style scoped>
/* reliable responsive grid: 1 column on small, 2 columns on md+ */
.charts-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 768px) {
  .charts-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* small tweaks */
.header { margin-bottom: 0.5rem; }
.btn { display: inline-flex; align-items: center; justify-content: center; }
</style>
