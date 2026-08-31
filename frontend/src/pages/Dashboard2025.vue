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

    <!-- Monthly charts (2025 only) -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <ChartCard
        v-for="cat in categories"
        :key="cat"
        type="line"
        :category="cat"
        :selected-stores="selectedStores"
        :passingGrade="passingGrades[cat]"
        :options="{ title: { text: cat } }"
        :year="2025"
      />
    </div>

    <!-- Pass rate charts (2025 only) -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      <ChartCard
        v-for="cat in categories"
        :key="cat + '-passing-rate'"
        type="bar"
        :category="cat"
        :selected-stores="selectedStores"
        :passingGrade="passingGrades[cat]"
        :options="{ title: { text: cat + ' Pass Rate' } }"
        :year="2025"
      />
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
.header { margin-bottom: 0.5rem; }
.chart-card { min-height: 220px; }
.btn { display: inline-flex; align-items: center; justify-content: center; }
</style>
