<template>
  <div class="card">
    <h2>{{ category }}</h2>

    <div class="chart-row">
      <canvas ref="medianChart"></canvas>
    </div>

    <div class="chart-row">
      <canvas ref="passChart"></canvas>
    </div>

    <div class="legend">
      <span v-for="s in visibleStores" :key="s" class="legend-item">
        <input type="checkbox" v-model="visibleStores" :value="s" /> {{ stores[s] }}
      </span>
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
    stores: { type: Object, required: true },
    selectedStores: { type: Array, required: true },
    useNormalized: { type: Boolean, default: false }
  },
  setup(props) {
    const medianChart = ref(null)
    const passChart = ref(null)
    let medianInstance = null
    let passInstance = null
    const visibleStores = ref([...props.selectedStores])

    async function fetchSeries(metric='raw') {
      const storesParam = visibleStores.value.join(',')
      const url = `/api/category/${encodeURIComponent(props.category)}/monthly?stores=${storesParam}&metric=${metric}`
      const res = await axios.get(url)
      return res.data // {store_id: [{x,y}, ...], ...}
    }

    async function fetchPass() {
      const storesParam = visibleStores.value.join(',')
      const url = `/api/category/${encodeURIComponent(props.category)}/passrate?stores=${storesParam}`
      const res = await axios.get(url)
      return res.data
    }

    function buildDatasets(series, colorFn) {
      return Object.keys(series).map((storeId, idx) => ({
        label: props.stores[storeId] || `Store ${storeId}`,
        data: series[storeId],
        borderColor: colorFn(idx),
        backgroundColor: colorFn(idx, 0.15),
        tension: 0.2,
        spanGaps: true
      }))
    }

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

    async function renderCharts() {
      const metric = props.useNormalized ? 'norm' : 'raw'
      const series = await fetchSeries(metric)
      const passSeries = await fetchPass()

      const medianDatasets = buildDatasets(series, colorFn)
      const passDatasets = buildDatasets(passSeries, colorFn)

      // Destroy previous instances
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

    watch(() => [props.category, props.selectedStores, props.useNormalized, visibleStores.value], () => {
      visibleStores.value = props.selectedStores.slice()
      renderCharts()
    }, { deep: true })

    return { medianChart, passChart, visibleStores }
  }
}
</script>

<style>
.card { border: 1px solid #ddd; padding: 16px; border-radius: 6px; background:#fff; }
.chart-row { margin: 12px 0; }
.legend { margin-top: 8px; display:flex; gap:8px; flex-wrap:wrap; }
.legend-item { font-size: 13px; }
</style>
