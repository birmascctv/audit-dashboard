<template>
  <div class="card chart-card" :class="{ 'chart-card--fill': fillHeight }">
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
  category: { type: String, default: null },
  // optional: criterion id for single-criterion line view
  criterion: { type: [String, Number], default: null },

  // when set, fetch the pivoted store-passrate endpoint (categories as the
  // grouped bar series) instead of the category-based passrate endpoint
  storeId: { type: [String, Number], default: null },

  // full list of stores ({store_id, name}); used to build the clickable
  // line-chart legend (hollow/filled dots + "All stores")
  stores: { type: Array, default: () => [] },

  selectedStores: { type: Array, default: () => [] },

  // category filter (used only for store-passrate charts, where each
  // dataset series is a category); when provided and non-empty, only
  // categories whose name is in this list are kept
  selectedCategories: { type: Array, default: null },

  // type: 'line' or 'bar'
  type: { type: String, default: 'line' },
  options: { type: Object, default: () => ({}) },
  refreshKey: { type: [String, Number], default: null },
  passingGrade: { type: Number, default: null },

  year: { type: Number, default: null },
  excludeYear: { type: Number, default: null },
  // optional period (month) range filter, 1-12 inclusive; applied
  // client-side across all years present in the fetched data
  periodFrom: { type: Number, default: null },
  periodTo: { type: Number, default: null },
  // when true, the card fills the height of its flex parent instead of a
  // fixed 250px (used for the line chart so it can match the info panel)
  fillHeight: { type: Boolean, default: false }
})

const emit = defineEmits(['loading', 'update:average'])

const canvas = ref(null)
let chart = null
let unmounted = false
const loading = ref(false)
const error = ref(null)

/** Build URL depending on chart type and whether a criterion is selected.
 *  - Line (criterion): /api/category/:category/criterion/:criterion/monthly
 *  - Line (no criterion): fallback to /api/category/:category/monthly
 *  - Bar (passrate, per category): /api/category/:category/passrate
 *  - Bar (passrate, per store, pivoted): /api/store/:storeId/passrate
 */
function buildUrl(kind = 'monthly') {
  const storesParam = (props.selectedStores && props.selectedStores.length) ? props.selectedStores.join(',') : ''
  let url = ''

  if (props.type === 'bar' && props.storeId != null) {
    url = `/api/store/${encodeURIComponent(props.storeId)}/passrate`
  } else if (props.type === 'line' && props.criterion) {
    url = `/api/category/${encodeURIComponent(props.category)}/criterion/${encodeURIComponent(props.criterion)}/monthly`
    if (storesParam) url += `?stores=${storesParam}`
  } else {
    const cat = encodeURIComponent(props.category)
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

/** Store names all share the "Birmas" brand prefix, which is redundant
 *  everywhere they're shown as chart labels (legend, bar series, titles). */
function stripStoreBrand(name) {
  return String(name || '').replace(/^birmas\s+/i, '').trim()
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

/**
 * Filter payload to only keep labels whose month (the "MM" part of a
 * "YYYY-MM" label) falls within [periodFrom, periodTo] inclusive.
 */
function filterPayloadByPeriod(payload) {
  if (!payload || !Array.isArray(payload.labels)) return payload
  if (!props.periodFrom && !props.periodTo) return payload

  const from = props.periodFrom || 1
  const to = props.periodTo || 12

  const keepIdx = payload.labels
    .map((lbl, idx) => ({ lbl, idx }))
    .filter(x => {
      const m = parseInt(String(x.lbl).split('-')[1], 10)
      if (isNaN(m)) return true
      return from <= to ? (m >= from && m <= to) : (m >= from || m <= to)
    })
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
    // charts driven by the store-selection checkboxes (line charts, and
    // category-based bar charts) render an empty chart once every store
    // has been explicitly deselected, instead of falling back to "all"
    const usesStoreSelection = props.stores && props.stores.length &&
      ((props.type === 'line' && props.criterion) || (props.type === 'bar' && props.storeId == null))
    const noStoresSelected = usesStoreSelection && props.selectedStores && props.selectedStores.length === 0

    // store-passrate charts (categories as series) are instead filtered by
    // the category checkboxes; an empty selection likewise renders empty
    const usesCategorySelection = props.type === 'bar' && props.storeId != null && Array.isArray(props.selectedCategories)
    const noCategoriesSelected = usesCategorySelection && props.selectedCategories.length === 0

    let payload
    if (noStoresSelected || noCategoriesSelected) {
      payload = { labels: [], datasets: [] }
    } else {
      const kind = props.type === 'bar' ? 'passrate' : 'monthly'
      const url = buildUrl(kind)
      const res = await axios.get(url)
      payload = res.data

      // apply excludeYear + period (month range) filters client-side
      payload = filterPayloadByExcludeYear(payload)
      payload = filterPayloadByPeriod(payload)

      // ensure payload structure
      payload = payload || { labels: [], datasets: [] }

      // store-passrate charts: filter category series by the category
      // checkboxes (no server-side support for this, so done client-side)
      if (usesCategorySelection && Array.isArray(payload.datasets)) {
        const allowed = new Set(props.selectedCategories)
        payload.datasets = payload.datasets.filter(ds => allowed.has(ds.label))
      }
    }

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

      // per-category bar charts use store names as the series labels;
      // strip the redundant "Birmas" brand prefix (store-passrate charts
      // use category names here instead, which are left untouched)
      if (props.storeId == null) {
        payload.datasets = payload.datasets.map(ds => ({ ...ds, label: stripStoreBrand(ds.label) }))
      }
    }

    // for bar charts with multiple stores selected, Chart.js automatically
    // renders each dataset as a clustered/grouped bar per label (month)

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
        copy.pointRadius = copy.pointRadius ?? 3
        copy.pointHoverRadius = copy.pointHoverRadius ?? 6
        copy.pointBackgroundColor = copy.pointBackgroundColor || copy.borderColor
      }
      return copy
    })

    // Compute an "Average" reference series across all currently-shown
    // datasets (the datasets array here already reflects whichever
    // stores/categories are selected via the checkbox filters — server-side
    // for line/category charts, client-side above for store-category
    // charts). Shown as a red line on both line charts (average score) and
    // bar charts (average pass rate), excluded from the visible legend.
    {
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

        const avgDataset = props.type === 'bar'
          ? {
              type: 'line',
              label: 'Average',
              data: avgData,
              borderColor: 'red',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 0,
              tension: 0.2,
              order: -1
            }
          : {
              label: 'Average',
              data: avgData,
              borderColor: 'red',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 0,
              tension: 0.2
            }

        // keep the real datasets (colored) and append average as last dataset
        payload.datasets = payload.datasets.concat([avgDataset])

        if (props.type === 'line') {
          // surface a single overall-average number to the parent so it can
          // be shown next to the passing grade in the Chart Info panel
          const validAvgs = avgData.filter(v => v !== null && v !== undefined && !isNaN(v))
          const overallAvg = validAvgs.length ? (validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length) : null
          emit('update:average', overallAvg === null ? null : Math.round(overallAvg * 100) / 100)
        }
      } else if (props.type === 'line') {
        emit('update:average', null)
      }
    }

    // destroy previous chart
    if (chart) chart.destroy()

    // bail out if the component was unmounted (or its canvas ref is gone)
    // while the network request above was in flight — creating a Chart on
    // a null/detached canvas corrupts Chart.js's internal instance
    // registry and breaks every subsequent chart on the page
    if (unmounted || !canvas.value) {
      return
    }

    // clone base options
    let options = JSON.parse(JSON.stringify(baseOptions || {}))

    // responsive and fill the card height
    options.responsive = true
    options.maintainAspectRatio = false

    // ensure y axis starts at zero and only shows integer tick values
    options.scales = options.scales || {}
    options.scales.y = options.scales.y || {}
    options.scales.y.beginAtZero = true
    options.scales.y.ticks = options.scales.y.ticks || {}
    options.scales.y.ticks.precision = 0
    options.scales.y.afterBuildTicks = function (axis) {
      axis.ticks = axis.ticks.filter(t => Number.isInteger(t.value))
    }

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
      options.elements.point.radius = options.elements.point.radius ?? 3
      options.elements.point.hoverRadius = options.elements.point.hoverRadius ?? 6

      // show a dot on every month; hovering anywhere near an x position
      // (not just directly over a point) reveals every store's value for
      // that month, so overlapping/shared values are visible together
      options.interaction = { mode: 'index', intersect: false }
      options.plugins = options.plugins || {}
      options.plugins.tooltip = options.plugins.tooltip || {}
      options.plugins.tooltip.mode = 'index'
      options.plugins.tooltip.intersect = false

      // keep legend visible for line charts (stores only — the Average
      // reference line stays on the chart but is hidden from the legend)
      options.plugins.legend = options.plugins.legend || {}
      options.plugins.legend.display = true
      options.plugins.legend.labels = options.plugins.legend.labels || {}
      options.plugins.legend.labels.usePointStyle = true

      // legend for line charts is informational only (filters now live in
      // the checkbox bar above the chart) — every dataset present here has
      // already been filtered to the selected stores, so a plain filled-dot
      // legend is accurate; just strip the redundant "Birmas" prefix and
      // hide the "Average" reference line from the legend list
      options.plugins.legend.labels.generateLabels = function (chartInstance) {
        return chartInstance.data.datasets
          .map((ds, i) => ({
            text: ds.label === 'Average' ? ds.label : stripStoreBrand(ds.label),
            fillStyle: ds.borderColor || '#9ca3af',
            strokeStyle: ds.borderColor || '#9ca3af',
            fontColor: '#f1f5f9',
            lineWidth: 2,
            pointStyle: 'circle',
            datasetIndex: i
          }))
          .filter(item => item.text !== 'Average')
      }
      // info-only: clicking a legend item must not toggle dataset visibility
      options.plugins.legend.onClick = function () {}
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

      // show the legend so each store's/category's bar color (and the
      // average reference line) can be identified; informational only
      options.plugins = options.plugins || {}
      options.plugins.legend = options.plugins.legend || {}
      options.plugins.legend.display = payload.datasets.length > 0
      options.plugins.legend.labels = options.plugins.legend.labels || {}
      options.plugins.legend.labels.usePointStyle = true
      options.plugins.legend.onClick = function () {}
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
  () => [props.category, props.criterion, props.selectedStores, props.selectedCategories, props.type, props.year, props.excludeYear, props.periodFrom, props.periodTo],
  () => {
    loadData()
  },
  { immediate: false, deep: true }
)

watch(() => props.refreshKey, () => {
  loadData()
})

onBeforeUnmount(() => {
  unmounted = true
  chart?.destroy()
})
</script>

<style scoped>
.card {
  padding: 1rem;
  border-radius: 0.75rem;
  background: #1f2937; /* grey */
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  border: 1px solid #4b5563;
  color: #f1f5f9;
  height: 250px;
  width: 100%;
  position: relative;
  overflow: hidden;
}
.chart-card--fill {
  height: 100%;
  min-height: 250px;
  flex: 1;
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
