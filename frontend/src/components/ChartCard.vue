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
import { baseOptions } from '../chart-config.js'

Chart.register(...registerables, annotationPlugin)

const props = defineProps({
  endpoint: { type: String, required: true },
  type: { type: String, default: 'line' }, // line or bar
  options: { type: Object, default: () => ({}) },
  refreshKey: { type: [String, Number], default: null },
  passingGrade: { type: Number, default: null } // optional threshold line
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

    // clone base options
    let options = JSON.parse(JSON.stringify(baseOptions))

    // add passing grade line if provided
    if (props.passingGrade !== null) {
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

    // merge with incoming props.options (e.g. title override)
    options = {
      ...options,
      plugins: {
        ...options.plugins,
        title: {
          ...options.plugins.title,
          display: true, // ✅ always show title
          text: props.options?.title?.text || '' // use category name
        }
      }
    }

    chart = new Chart(canvas.value, {
      type: props.type,
      data: payload,
      options
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
.card {
  padding: 1rem;
  border-radius: 0.75rem;
  background: #1e293b; /* dark slate */
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  border: 1px solid #334155;
  color: #f1f5f9;
  height: 250px;
  width: 100%;       /* allow grid to size it */
}
canvas { display:block; width:100%; height:100%; }
</style>
