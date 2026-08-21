<!-- src/pages/Dashboard2025.vue -->
<template>
  <div>
    <h2 class="text-xl font-bold mb-4">Audit Dashboard — 2025</h2>

    <!-- Store filter -->
    <StoreFilter v-model="selectedStores" />
    <div class="grid grid-cols-2 gap-4">
      <ChartCard
        v-for="cat in categories"
        :key="cat"
        type="line"
        :endpoint="`/api/category/${cat}/monthly?stores=${selectedStores.join(',')}&year=2025`"
        :passingGrade="passingGrades[cat]"
      />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <ChartCard
        v-for="cat in categories"
        :key="cat + '-passing-rate'"
        type="bar"
        :endpoint="`/api/category/${cat}/passrate?stores=${selectedStores.join(',')}&year=2025`"
        :passingGrade="passingGrades[cat]"
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
