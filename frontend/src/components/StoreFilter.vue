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
  // optional: criterion id for single-criterion line view
  criterion: { type: [String, Number], default: null },

  selectedStores: { type: Array, default: () => [] },

  // type: 'line' or 'bar'
  type: { type: String, default: 'line' },
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

/** Build URL depending on chart type and whether a criterion is selected.
 *  - Line (criterion): /api/category/:category/criterion/:criterion/monthly
 *  - Line (no criterion): fallback to /api/category/:category/monthly
 *  - Bar (passrate): /api/category/:category/passrate
 */
function buildUrl(kind = 'monthly') {
  const cat = encodeURIComponent(props.category)
  const storesParam = (props.selectedStores && props.selectedStores.length) ? props.selectedStores.join(',') : ''
  let url = ''

  if (props.type === 'line' && props.criterion) {
    url = `/api/category/${cat}/criterion/${encodeURIComponent(props.criterion)}/monthly`
  } else {
    url = storesParam
      ? `/api/category/${cat}/${kind}?stores=${storesParam}`
      : `/api/category/${cat}/${kind}`
  }

  if (props.year) {
    url += (url.includes('?') ? '&' : '?') + `year=${props.year}`
  }
  return url
}

/** Deterministic color generator for fallback when dataset has no color. */
function colorForLabel(label) {
  if (!label) return 'hsl(210,70%,50%)'
  let sum = 0
  for (let i = 0; i < label.length; i++) sum += label.charCodeAt(i)
  const hue = (sum * 37) % 360
  return `hsl(${hue},70%,50%)`
}

/** Convert a border color into a slightly translucent background if possible. */
function backgroundFromBorder(border) {
  if (!border) return border
  const s = String(border).trim()
  if (s.startsWith('hsl(')) {
    return s.replace(/^hsl\(/, 'hsla(').replace(/\)$/, ',0.85)')
  }
  if (s.startsWith('rgb(')) {
    return s.replace(/^rgb\(/, 'rgba(').replace(/\)$/, ',0.85)')
  }
  return s
}

/** Median helper for arrays of numbers */
function medianOfArray(arr) {
  if (!Array.isArray(arr)) return null
  const nums = arr.filter(v => v !== null && v !== undefined).map(Number).filter(n => !isNaN(n)).sort((a,b)=>a-b)
  if (!nums.length) return null
  const mid = Math.floor(nums.length / 2)
  return (nums.length % 2 === 1) ? nums[mid] : (nums[mid-1] + nums[mid]) / 2
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

/** Normalize passing grade for chart type:
 *  - For bar charts, convert 0..1 -> 0..100 if needed
 *  - For line charts, return as-is (assumed same unit as line data)
 */
function normalizePassingGradeForChart(passingGrade, chartType) {
  if (passingGrade === null || passingGrade === undefined) return null
  if (chartType === 'bar') {
    if (typeof passingGrade === 'number' && passingGrade >= 0 && passingGrade <= 1) {
      return Math.round(passingGrade * 1000) / 10
    }
    return passingGrade
  }
  return passingGrade
}

/** Apply passing grade annotation(s).
 *  For line charts we draw a single green line at the normalized passing grade.
 *  For bar charts we intentionally do not draw a red/green annotation here (per new requirement).
 */
function applyPassingGrade(options, normalizedPassingGrade) {
  if (normalizedPassingGrade === null || normalizedPassingGrade === undefined) return options
  options.plugins = options.plugins || {}
  options.plugins.annotation = options.plugins.annotation || { annotations: {} }

  // Only draw for line charts (single criterion view). Use green color.
  if (props.type === 'line') {
    options.plugins.annotation.annotations.passing = {
      type: 'line',
      yMin: normalizedPassingGrade,
      yMax: normalizedPassingGrade,
      borderColor: 'green',
      borderWidth: 2,
      label: {
        content: `${String(normalizedPassingGrade)}`,
        enabled: true,
        position: 'end',
        color: '#0f172a',
        backgroundColor: 'rgba(34,197,94,0.95)',
        font: { weight: '600' }
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
    let payload = res.data

    // apply excludeYear filter client-side if requested
    payload = filterPayloadByExcludeYear(payload)

    // ensure payload structure
    payload = payload || { labels: [], datasets: [] }

    // If datasets contain arrays per label (raw samples), compute medians per label
    if (Array.isArray(payload.datasets)) {
      payload.datasets = payload.datasets.map(ds => {
        if (!Array.isArray(ds.data)) return ds
        const first = ds.data[0]
        // if first item is an array, assume each label contains samples
        if (Array.isArray(first)) {
          const medians = ds.data.map(item => medianOfArray(item))
          return { ...ds, data: medians }
        }
        return ds
      })
    }

    // --- Normalize passrate values when type === 'bar' ---
    if (props.type === 'bar') {
      payload.datasets = (payload.datasets || []).map(ds => {
        const data = (ds.data || []).map(v => {
          if (v === null || v === undefined) return null
          if (typeof v === 'number' && v >= 0 && v <= 1) {
            return Math.round(v * 1000) / 10 // keep one decimal
          }
          return v
        })
        return { ...ds, data }
      })
    }

    // normalize dataset colors and bar backgrounds
    payload.datasets = (payload.datasets || []).map(ds => {
      const copy = { ...ds }
      if (!copy.borderColor) copy.borderColor = colorForLabel(copy.label)
      if (props.type === 'bar') {
        // use same color for bar fill (slightly translucent if possible)
        copy.backgroundColor = copy.backgroundColor || backgroundFromBorder(copy.borderColor)
        copy.borderColor = copy.borderColor || copy.backgroundColor
        copy.borderWidth = copy.borderWidth ?? 1
      } else {
        // line chart defaults
        copy.backgroundColor = copy.backgroundColor || 'transparent'
        copy.borderWidth = copy.borderWidth ?? 2
        copy.pointRadius = copy.pointRadius ?? 0
        copy.pointHoverRadius = copy.pointHoverRadius ?? 4
      }
      return copy
    })

    // For line charts showing a single criterion: compute an "Average" series across stores
    if (props.type === 'line') {
      // compute average per label across datasets (ignore nulls)
      const labels = Array.isArray(payload.labels) ? payload.labels : []
      if (payload.datasets && payload.datasets.length) {
        const avgData = labels.map((_, idx) => {
          let sum = 0, count = 0
          for (const ds of payload.datasets) {
            const v = Array.isArray(ds.data) ? ds.data[idx] : undefined
            if (v !== null && v !== undefined && !isNaN(Number(v))) {
              sum += Number(v)
              count++
            }
          }
          return count ? (sum / count) : null
        })

        // add average dataset as a red line
        const avgDataset = {
          label: 'Average',
          data: avgData,
          borderColor: 'red',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2
        }

        // keep store datasets (colored) and append average as last dataset
        payload.datasets = payload.datasets.concat([avgDataset])
      }
    }

    // destroy previous chart
    if (chart) chart.destroy()

    // clone base options
    let options = JSON.parse(JSON.stringify(baseOptions || {}))

    // responsive and fill the card height
    options.responsive = true
    options.maintainAspectRatio = false

    // ensure y axis starts at zero
    options.scales = options.scales || {}
    options.scales.y = options.scales.y || {}
    options.scales.y.beginAtZero = true

    // x axis tick density to avoid overlap when many months are present
    options.scales.x = options.scales.x || {}
    options.scales.x.ticks = options.scales.x.ticks || {}
    options.scales.x.ticks.autoSkip = true
    options.scales.x.ticks.maxTicksLimit = options.scales.x.ticks.maxTicksLimit || 12
    options.scales.x.ticks.maxRotation = 0
    options.scales.x.ticks.minRotation = 0

    // line chart tweaks
    if (props.type === 'line') {
      options.elements = options.elements || {}
      options.elements.point = options.elements.point || {}
      options.elements.point.radius = options.elements.point.radius ?? 0
      options.elements.point.hoverRadius = options.elements.point.hoverRadius ?? 4

      // keep legend visible for line charts (stores + average)
      options.plugins = options.plugins || {}
      options.plugins.legend = options.plugins.legend || {}
      options.plugins.legend.display = true
      options.plugins.legend.labels = options.plugins.legend.labels || {}
      options.plugins.legend.labels.usePointStyle = true
    }

    // bar chart specific options: treat as percentage axis 0..100
    if (props.type === 'bar') {
      options.scales.y.max = 100
      options.scales.y.ticks = options.scales.y.ticks || {}
      options.scales.y.ticks.callback = function (value) { return value + '%' }
      options.scales.y.ticks.stepSize = 10

      // tooltip formatting for percent
      options.plugins = options.plugins || {}
      options.plugins.tooltip = options.plugins.tooltip || {}
      options.plugins.tooltip.callbacks = options.plugins.tooltip.callbacks || {}
      options.plugins.tooltip.callbacks.label = function (context) {
        const v = context.parsed?.y
        if (v === null || v === undefined) return ''
        return `${context.dataset.label || ''}: ${v}%`
      }

      // bar sizing and visibility
      options.datasets = options.datasets || {}
      options.datasets.bar = options.datasets.bar || {}
      options.datasets.bar.maxBarThickness = options.datasets.bar.maxBarThickness ?? 48
      options.datasets.bar.categoryPercentage = options.datasets.bar.categoryPercentage ?? 0.8
      options.datasets.bar.barPercentage = options.datasets.bar.barPercentage ?? 0.9

      // per new requirement: remove per-store pass rate legend (hide legend)
      options.plugins = options.plugins || {}
      options.plugins.legend = options.plugins.legend || {}
      options.plugins.legend.display = false
    }

    // normalize and apply passing grade for line charts (green)
    const normalizedPassingGrade = normalizePassingGradeForChart(props.passingGrade, props.type)
    options = applyPassingGrade(options, normalizedPassingGrade)

    // merge title from props.options (keeps existing behavior)
    options.plugins = options.plugins || {}
    options.plugins.title = {
      ...(options.plugins.title || {}),
      display: true,
      text: props.options?.title?.text || ''
    }

    // create chart
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
  () => [props.category, props.criterion, props.selectedStores, props.type, props.year, props.excludeYear],
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
