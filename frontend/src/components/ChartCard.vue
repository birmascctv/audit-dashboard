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
  category: { type: String, required: true },
  selectedStores: { type: Array, default: () => [] },

  type: { type: String, default: 'line' }, // line or bar
  options: { type: Object, default: () => ({}) },
  refreshKey: { type: [String, Number], default: null },
  passingGrade: { type: Number, default: null },

  year: { type: Number, default: null },
  excludeYear: { type: Number, default: null }
})

const emit = defineEmits(['loading'])

const canvas = ref(null)
let chart = null
const loading = ref(false)
const error = ref(null)

function buildUrl(kind = 'monthly') {
  const cat = encodeURIComponent(props.category)
  const storesParam = (props.selectedStores && props.selectedStores.length) ? props.selectedStores.join(',') : ''
  let url = storesParam
    ? `/api/category/${cat}/${kind}?stores=${storesParam}`
    : `/api/category/${cat}/${kind}`

  if (props.year) {
    url += (url.includes('?') ? '&' : '?') + `year=${props.year}`
  }
  return url
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

/**
 * Deterministic color generator for fallback when dataset has no color.
 * Produces an HSL string based on the label text.
 */
function colorForLabel(label) {
  if (!label) return 'hsl(210,70%,50%)'
  let sum = 0
  for (let i = 0; i < label.length; i++) sum += label.charCodeAt(i)
  const hue = (sum * 37) % 360
  return `hsl(${hue},70%,50%)`
}

/**
 * Filter payload to remove labels/dataset points that belong to excludeYear.
 */
function filterPayloadByExcludeYear(payload) {
  if (!props.excludeYear || !payload || !Array.isArray(payload.labels)) return payload

  const excludePrefix = `${props.excludeYear}-`
  const keepIdx = payload.labels
    .map((lbl, idx) => ({ lbl, idx }))
    .filter(x => !String(x.lbl).startsWith(excludePrefix))
    .map(x => x.idx)

  if (!keepIdx.length) {
    return { labels: [], datasets: payload.datasets ? payload.datasets.map(ds => ({ ...ds, data: [] })) : [] }
  }

  const newLabels = keepIdx.map(i => payload.labels[i])

  const newDatasets = (payload.datasets || []).map(ds => {
    const data = Array.isArray(ds.data) ? ds.data : []
    const newData = keepIdx.map(i => (i < data.length ? data[i] : null))
    return { ...ds, data: newData }
  })

  return { labels: newLabels, datasets: newDatasets }
}

async function loadData() {
  loading.value = true
  error.value = null
  emit('loading', true)
  try {
    const kind = props.type === 'bar' ? 'passrate' : 'monthly'
    const url = buildUrl(kind)
    const res = await axios.get(url)
    let payload = res.data

    // apply excludeYear filter client-side if requested
    payload = filterPayloadByExcludeYear(payload)

    // ensure payload has labels/datasets structure
    payload = payload || { labels: [], datasets: [] }

    // normalize dataset colors: for bar charts set backgroundColor = borderColor
    payload.datasets = (payload.datasets || []).map(ds => {
      const copy = { ...ds }
      // ensure borderColor exists or generate one
      if (!copy.borderColor) {
        copy.borderColor = colorForLabel(copy.label)
      }
      if (props.type === 'bar') {
        // use same color for bar fill and border
        copy.backgroundColor = copy.backgroundColor || copy.borderColor
        copy.borderColor = copy.borderColor || copy.backgroundColor
        copy.borderWidth = copy.borderWidth ?? 1
      } else {
        // for line charts, ensure point/background colors are visible
        copy.backgroundColor = copy.backgroundColor || 'transparent'
        copy.borderWidth = copy.borderWidth ?? 2
      }
      return copy
    })

    // destroy previous chart
    if (chart) chart.destroy()

    // clone base options
    let options = JSON.parse(JSON.stringify(baseOptions || {}))

    // ensure y axis starts at zero
    options.scales = options.scales || {}
    options.scales.y = options.scales.y || {}
    options.scales.y.beginAtZero = true

    // small bar-specific defaults
    if (props.type === 'bar') {
      options.plugins = options.plugins || {}
      options.plugins.legend = options.plugins.legend || {}
      options.plugins.legend.labels = options.plugins.legend.labels || {}
      options.plugins.legend.labels.usePointStyle = false
      // make bars more visible on dark background
      options.datasets = options.datasets || {}
      options.datasets.bar = options.datasets.bar || {}
      options.datasets.bar.maxBarThickness = 48
    }

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

watch(
  () => [props.category, props.selectedStores, props.type, props.year, props.excludeYear],
  () => {
    loadData()
  },
  { immediate: false, deep: true }
)

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
