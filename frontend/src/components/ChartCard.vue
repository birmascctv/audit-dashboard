<template>
  <div class="card" style="height:100%">
    <canvas ref="canvas" style="width:100%;height:100%"></canvas>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Chart } from 'chart.js/auto'
import { baseOptions, barDataset } from '../chart-config.js'

const canvas = ref(null)

onMounted(() => {
  if (!canvas.value) return
  new Chart(canvas.value, {
    type: 'bar',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
      datasets: [barDataset([12, 19, 7, 14, 11])]
    },
    options: baseOptions
  })
})
</script>

<style scoped>
canvas { display:block; }
</style>
