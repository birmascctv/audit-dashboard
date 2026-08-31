<template>
  <div>
    <div class="header flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold">Audit Dashboard</h2>

      <div class="controls flex items-center gap-3">
        <!-- Navigate to the 2025-only dashboard -->
        <router-link
          to="/dashboard2025"
          class="btn bg-sky-600 text-white px-3 py-1 rounded hover:bg-sky-700"
        >
          View 2025 Dashboard
        </router-link>

        <!-- Optional: quick link back to main dashboard (if on /dashboard2025) -->
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

    <!-- Monthly charts (responsive grid: 1 column on small, 2 on md+) -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
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

/**
 * Router can pass props to this page:
 * - year: number (show only this year)
 * - excludeYear: number (client-side exclude this year)
 *
 * Default behavior for the main Dashboard is to exclude 2025.
 * When you create a /dashboard2025 route, pass { year: 2025 } as route props.
 */
const props = defineProps({
  year: { type: Number, default: null },
  excludeYear: { type: Number, default: 2025 }
})

const categories = ref([])
const passingGrades = ref({})
const selectedStores = ref([])

onMounted(async () => {
  // fetch categories and passing grades
  const [catRes, gradeRes] = await Promise.all([
    fetch('/api/categories'),
    fetch('/api/passing-grades')
  ])
  categories.value = await catRes.json()
  passingGrades.value = await gradeRes.json()
})
</script>

<style scoped>
/* optional: small spacing tweak for chart cards */
.chart-card { min-height: 220px; }

/* simple button styles if your project doesn't already provide them */
.btn { display: inline-flex; align-items: center; justify-content: center; }
</style>
