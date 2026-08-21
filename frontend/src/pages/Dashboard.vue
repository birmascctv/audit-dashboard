<!-- src/pages/Dashboard.vue -->
<template>
  <div>
    <h2 class="text-xl font-bold mb-4">Audit Dashboard — Other Years</h2>

    <!-- Store filter -->
    <StoreFilter v-model="selectedStores" />

    <!-- Category charts -->
    <div class="grid grid-cols-2 gap-4">
      <ChartCard
        v-for="cat in categories"
        :key="cat"
        type="line"
        :endpoint="`/api/category/${cat}/monthly?stores=${selectedStores.join(',')}&year!=2025`"
        :passing-grade="passingGrades[cat]"
      />
    </div>

    <!-- Passing rate chart -->
    <ChartCard
      v-for="cat in categories"
      :key="cat + '-passing-rate'"
      type="line"
      :endpoint="`/api/category/${cat}/monthly?stores=${selectedStores.join(',')}`"
      :passing-grade="passingGrades[cat]"
    />
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
