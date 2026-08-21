<template>
  <div class="card" style="height:300px">
    <canvas ref="c"></canvas>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Chart } from 'chart.js/auto'
import { baseOptions, barDataset } from '../chart-config'
const c = ref(null)
onMounted(()=> {
  new Chart(c.value, {
    type:'bar',
    data:{ labels:['Jan','Feb','Mar'], datasets:[barDataset([12,9,15])] },
    options: baseOptions
  })
})
</script>
