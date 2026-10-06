<template>
  <div class="card" style="height:300px">
    <canvas ref="c"></canvas>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Chart } from 'chart.js/auto'
import { baseOptions, barDataset } from '../chart-config'

// reference to the canvas
const c = ref(null)

onMounted(async () => {
  try {
    // fetch category stats from backend
    const res = await fetch('/api/stats/categories')
    const json = await res.json()

    // assume backend returns { labels: [...], datasets: [...] }
    const labels = json.labels || []
    const datasets = json.datasets || []

    // if backend returns raw numbers, adapt them:
    // const labels = Object.keys(json)
    // const datasets = [barDataset(Object.values(json))]

    new Chart(c.value, {
      type: 'bar',
      data: { labels, datasets },
      options: baseOptions
    })
  } catch (err) {
    console.error('Failed to load category stats', err)
  }
})
</script>
