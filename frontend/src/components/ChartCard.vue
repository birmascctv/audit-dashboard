<!-- ChartCard.vue -->
<template>
  <div class="card" style="height:250px">
    <canvas ref="canvas"></canvas>
    <div v-if="loading">Loading…</div>
    <div v-if="error">Error: {{ error }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { Chart, registerables } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'

Chart.register(...registerables, annotationPlugin)

const props = defineProps({
  endpoint: { type: String, required: true },
  type: { type: String, default: 'line' }, // line or bar
  options: { type: Object, default: () => ({}) },
  refreshKey: { type: [String, Number], default: null },
  passingGrade: { type: Number, default: null } // NEW: optional threshold line
})

const canvas = ref(null)
let chart = null
const loading = ref(false)
const error = ref(null)

async function loadData() {
  loading.value = true
  try {
    const res = await axios.get(props.endpoint)
    const payload = res.data

    if (chart) chart.destroy()

    // base options
    let baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: 'rgba(15,23,42,0.06)' } }
      }
    }

    // add passing grade line if provided
    if (props.passingGrade !== null) {
      baseOptions.plugins.annotation = {
        annotations: {
          passing: {
            type: 'line',
            yMin: props.passingGrade,
            yMax: props.passingGrade,
            borderColor: 'red',
            borderWidth: 2,
            label: {
              content: 'Passing Grade',
              enabled: true,
              position: 'end'
            }
          }
        }
      }
    }

    chart = new Chart(canvas.value, {
      type: props.type,
      data: payload,
      options: Object.assign(baseOptions, props.options)
    })
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch(() => props.endpoint, loadData)
watch(() => props.refreshKey, loadData)
onBeforeUnmount(() => chart?.destroy())
</script>

<style scoped>
.card { padding: 1rem; border-radius: 0.75rem; background: var(--panel); box-shadow: var(--card-shadow); border: 1px solid var(--panel-border); }
canvas { display:block; }
</style>
