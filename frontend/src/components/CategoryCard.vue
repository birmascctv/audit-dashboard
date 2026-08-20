<template>
  <div class="card">
    <h2>{{ category }}</h2>

    <div class="chart-row">
      <canvas ref="medianChart"></canvas>
    </div>

    <div class="chart-row">
      <canvas ref="passChart"></canvas>
    </div>
  </div>
</template>

<script>
import { onMounted, ref, watch } from 'vue'
import axios from 'axios'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

export default {
  props: {
    category: { type: String, required: true },
    storesMap: { type: Object, required: true },
    selectedStores: { type: Array, required: true },
    useNormalized: { type: Boolean, default: false }
  },
  setup(props) {
    const medianChart = ref(null)
    const passChart = ref(null)
    let medianInstance = null
    let passInstance = null

    function colorFn(i, alpha=1) {
      const palette = [
        'rgba(31,119,180,ALPHA)',
        'rgba(255,127,14,ALPHA)',
        'rgba(44,160,44,ALPHA)',
        'rgba(214,39,40,ALPHA)',
        'rgba(148,103,189,ALPHA)',
        'rgba(140,86,75,ALPHA)'
      ]
      return palette[i % palette.length].replace('ALPHA', alpha)
    }

    function rowsToSeries(rows) {
      const out = {}
      for (const r of rows) {
        const storeId = String(r[0])
        const label = `${String(r[1]).padStart(4,'0')}-${String(r[2]).padStart(2,'0')}`
        if (!out[storeId]) out[storeId] = []
        out[storeId].push({ x: label, y: r[3] === null ? null : Number(r[3]) })
      }
      for (const k in out) out[k].sort((a,b) => a.x.localeCompare(b.x))
      return out
    }

    async function fetchSeries(metric='raw') {
      const storesParam = props.selectedStores.join(',')
      const url = `/api/category/${encodeURIComponent(props.category)}/monthly?stores=${storesParam}&metric=${metric}`
      const res = await axios.get(url)
      return res.data
    }

    async function fetchPass() {
      const storesParam = props.selectedStores.join(',')
      const url = `/api/category/${encodeURIComponent(props.category)}/passrate?stores=${storesParam}`
      const res = await axios.get(url)
      return res.data
    }

    function buildDatasets(series, colorFn) {
      return Object.keys(series).map((storeId, idx) => ({
        label: props.storesMap[storeId] || `Store ${storeId}`,
        data: series[storeId],
        borderColor: colorFn(idx),
        backgroundColor: colorFn(idx, 0.15),
        tension: 0.2,
        spanGaps: true
      }))
    }

    async function renderCharts() {
      const metric = props.useNormalized ? 'norm' : 'raw'
      const series = await fetchSeries(metric)
      const passSeries = await fetchPass()

      const medianDatasets = buildDatasets(series, colorFn)
      const passDatasets = buildDatasets(passSeries, colorFn)

      if (medianInstance) medianInstance.destroy()
      if (passInstance) passInstance.destroy()

      medianInstance = new Chart(medianChart.value.getContext('2d'), {
        type: 'line',
        data: { datasets: medianDatasets },
        options: {
          parsing: { xAxisKey: 'x', yAxisKey: 'y' },
          scales: {
            x: { type: 'category', title: { display: true, text: 'Month' } },
            y: { title: { display: true, text: props.useNormalized ? 'Normalized (ratio)' : 'Median score' } }
          },
          plugins: { tooltip: { mode: 'index', intersect: false } }
        }
      })

      passInstance = new Chart(passChart.value.getContext('2d'), {
        type: 'line',
        data: { datasets: passDatasets },
        options: {
          parsing: { xAxisKey: 'x', yAxisKey: 'y' },
          scales: {
            x: { type: 'category', title: { display: true, text: 'Month' } },
            y: { title: { display: true, text: 'Pass rate' }, min: 0, max: 1 }
          },
          plugins: { tooltip: { mode: 'index', intersect: false } }
        }
      })
    }

    onMounted(() => {
      renderCharts()
    })

    watch(() => [props.category, props.selectedStores, props.useNormalized], () => {
      renderCharts()
    }, { deep: true })

    return { medianChart, passChart }
  }
}
</script>

<style>
.card { border: 1px solid #ddd; padding: 16px; border-radius: 6px; background:#fff; }
.chart-row { margin: 12px 0; }
</style>
