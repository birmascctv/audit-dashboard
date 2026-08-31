<template>
  <div>
    <h2 class="text-xl font-bold mb-4">Audit Dashboard</h2>

    <!-- Store filter -->
    <StoreFilter v-model="selectedStores" />

    <!-- Monthly charts -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ChartCard
        v-for="cat in categories"
        :key="cat"
        type="line"
        :category="cat"
        :selected-stores="selectedStores"
        :passingGrade="passingGrades[cat]"
        :options="{ title: { text: cat } }"
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
/* optional: small spacing tweak for chart cards */
.chart-card { min-height: 220px; }
</style>
