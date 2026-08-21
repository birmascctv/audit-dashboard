<template>
  <div class="card" style="height:100%">
    <canvas ref="canvas" style="width:100%;height:100%"></canvas>
    <div v-if="loading" class="text-sm text-gray-500 mt-2">Loading chart…</div>
    <div v-if="error" class="text-sm text-red-600 mt-2">Chart error: {{ error }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

const props = defineProps({
  /** full URL or relative endpoint that returns { labels:[], datasets:[] } */
  endpoint: { type: String, required: true },
  /** optional Chart.js options override */
  options: { type: Object, default: () => ({}) },
  /** refresh key to force reload when parent changes filters */
  refreshKey: { type: [String, Number], default: null }
})

const canvas = ref(null)
let chart = null
const loading = ref(false)
const error = ref(null)

async function loadData() {
  if (!props.endpoint) return
  loading.value = true
  error.value = null
  try {
    const res = await axios.get(props.endpoint, { timeout: 15000 })
    const payload = res.data

    // Basic validation of expected shape
    if (!payload || !Array.isArray(payload.labels) || !Array.isArray(payload.datasets)) {
      throw new Error('Invalid payload shape')
    }

    // Ensure dataset colors: apply red accent if not provided
    payload.datasets = payload.datasets.map(ds => {
      if (!ds.backgroundColor) ds.backgroundColor = '#ef4444'
      if (!ds.borderColor && ds.type !== 'bar') ds.borderColor = '#ef4444'
      return ds
    })

    if (!canvas.value) return
    if (chart) chart.destroy()

    chart = new Chart(canvas.value, {
      type: 'bar',
      data: {
        labels: payload.labels,
        datasets: payload.datasets
      },
      options: Object.assign({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(15,23,42,0.06)' } }
        }
      }, props.options)
    })
  } catch (err) {
    console.error('Chart load error', err)
    error.value = err.message || String(err)
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch(() => props.endpoint, loadData)
watch(() => props.refreshKey, loadData)

onBeforeUnmount(() => {
  if (chart) {
    chart.destroy()
    chart = null
  }
})
</script>

<style scoped>
.card { padding: 1rem; border-radius: 0.75rem; background: var(--panel); box-shadow: var(--card-shadow); border: 1px solid var(--panel-border); }
canvas { display:block; }
</style>
