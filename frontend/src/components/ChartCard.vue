<template>
  <div class="card" style="height:250px; position:relative;">
    <canvas ref="canvas"></canvas>

    <div v-if="loading" class="overlay">
      <div class="loader">Loading…</div>
    </div>

    <div v-if="error" class="chart-error">
      Error: {{ error }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { Chart, registerables } from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import { baseOptions } from '../chart-config.js'

Chart.register(...registerables, annotationPlugin)

const props = defineProps({
  // New API: pass category and selectedStores instead of endpoint string
  category: { type: String, required: true },
  selectedStores: { type: Array, default: () => [] },

  // existing props
  type: { type: String, default: 'line' }, // line or bar
  options: { type: Object, default: () => ({}) },
  refreshKey: { type: [String, Number], default: null },
  passingGrade: { type: Number, default: null } // optional threshold line
})

const emit = defineEmits(['loading'])

const canvas = ref(null)
let chart = null
const loading = ref(false)
const error = ref(null)

// Build URL safely using encodeURIComponent and comma-separated store ids
function buildUrl(kind = 'monthly') {
  const cat = encodeURIComponent(props.category)
  const storesParam = (props.selectedStores && props.selectedStores.length) ? props.selectedStores.join(',') : ''
  return storesParam
    ? `/api/category/${cat}/${kind}?stores=${storesParam}`
    : `/api/category/${cat}/${kind}`
}

function applyPassingGrade(options) {
  if (props.passingGrade !== null) {
    options.plugins = options.plugins || {}
    options.plugins.annotation = {
      annotations: {
        passing: {
          type: 'line',
          yMin: props.passingGrade,
          yMax: props.passingGrade,
          borderColor: 'red',
          borderWidth: 2,
          label: {
            content: `Passing Grade ${props.passingGrade}`,
            enabled: true,
            position: 'end',
            color: '#f1f5f9'
          }
        }
      }
    }
  }
  return options
}

async function loadData() {
  loading.value = true
  error.value = null
  emit('loading', true)
  try {
    const kind = props.type === 'bar' ? 'passrate' : 'monthly'
    const url = buildUrl(kind)
    const res = await axios.get(url)
    const payload = res.data

    // destroy previous chart
    if (chart) chart.destroy()

    // clone base options
    let options = JSON.parse(JSON.stringify(baseOptions || {}))

    // apply passing grade if present
    options = applyPassingGrade(options)

    // merge title from props.options
    options.plugins = options.plugins || {}
    options.plugins.title = {
      ...(options.plugins.title || {}),
      display: true,
      text: props.options?.title?.text || ''
    }

    chart = new Chart(canvas.value, {
      type: props.type,
      data: payload,
      options
    })
  } catch (err) {
    // prefer axios error message or HTTP status
    if (err.response) {
      error.value = `HTTP ${err.response.status}`
    } else {
      error.value = err.message || 'Failed to load data'
    }
    console.error('Chart fetch error', err)
  } finally {
    loading.value = false
    emit('loading', false)
  }
}

onMounted(loadData)

// react to category, selectedStores, refreshKey changes
watch(() => [props.category, props.selectedStores, props.type], () => {
  loadData()
}, { immediate: false, deep: true })

watch(() => props.refreshKey, () => {
  loadData()
})

onBeforeUnmount(() => chart?.destroy())
</script>

<style scoped>
.card {
  padding: 1rem;
  border-radius: 0.75rem;
  background: #0f172a; /* dark slate */
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  border: 1px solid #334155;
  color: #f1f5f9;
  height: 250px;
  width: 100%;
  position: relative;
  overflow: hidden;
}
canvas { display:block; width:100%; height:100%; }

.overlay {
  position: absolute;
  inset: 0;
  display:flex;
  align-items:center;
  justify-content:center;
  background: rgba(2,6,23,0.45);
  z-index: 5;
}
.loader { color: #e2e8f0; font-weight:600; }

.chart-error {
  position: absolute;
  left: 12px;
  bottom: 12px;
  right: 12px;
  background: rgba(176,0,32,0.08);
  color: #fecaca;
  padding: 8px;
  border-radius: 6px;
  z-index: 6;
  font-size: 0.9rem;
}
</style>
