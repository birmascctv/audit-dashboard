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

    <!-- Store filter -->
    <StoreFilter v-model="selectedStores" />

    <!-- Render pairs: left = line chart, right = bar (pass rate) for 2025 -->
    <div class="pairs-grid mt-4">
      <div v-for="cat in categories" :key="cat" class="pair-row">
        <!-- Left: time series line chart for 2025 -->
        <ChartCard
          :category="cat"
          type="line"
          :selected-stores="selectedStores"
          :passingGrade="passingGrades[cat]"
          :options="{ title: { text: cat } }"
          :year="2025"
        />

        <!-- Right: pass rate bar chart for 2025 -->
        <ChartCard
          :category="cat"
          type="bar"
          :selected-stores="selectedStores"
          :passingGrade="passingGrades[cat]"
          :options="{ title: { text: cat + ' Pass Rate (%)' } }"
          :year="2025"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import ChartCard from '../components/ChartCard.vue'
import StoreFilter from '../components/StoreFilter.vue'

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
/* pair-row: two columns on md+, stacked on small screens */
.pairs-grid {
  display: block;
  gap: 1rem;
}

/* each pair is a two-column grid on medium+ screens */
.pair-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

/* two columns side-by-side on medium and larger screens */
@media (min-width: 768px) {
  .pair-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.header { margin-bottom: 0.5rem; }
.btn { display: inline-flex; align-items: center; justify-content: center; }
</style>
