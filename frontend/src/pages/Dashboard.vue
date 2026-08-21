<template>
  <div class="dashboard min-h-screen px-4 py-4">
    <Header />

    <div class="flex items-center gap-2 mb-3">
      <label class="text-sm font-medium">Year</label>
      <select v-model="year" class="filter-select">
        <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
      </select>

      <label class="text-sm font-medium">Month</label>
      <select v-model="month" class="filter-select">
        <option v-for="m in months" :key="m.value" :value="m.value">{{ m.label }}</option>
      </select>

      <button @click="refreshKey = Date.now()" class="ml-auto btn btn-primary">Refresh Chart</button>
    </div>

    <section class="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch">
      <div class="card min-h-[320px]">
        <h2 class="brand mb-2">Recent Events</h2>
        <div class="muted">Event table not present in this repo — add your EventTable component or API later.</div>
      </div>

      <div class="card min-h-[320px]">
        <h2 class="brand mb-2">Product Count Statistics</h2>
        <ChartCard
          :endpoint="chartEndpoint"
          :refreshKey="refreshKey"
        />
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import Header from '../components/Header.vue'
import ChartCard from '../components/ChartCard.vue'
import CategoryCard from '../components/CategoryCard.vue' // keep available

// Minimal local state (replace with real data or API calls)
const cameras = ref([
  { id: 'cam1', name: 'Front', thumbnail: '/assets/hero.png' },
  { id: 'cam2', name: 'Back', thumbnail: '/assets/hero.png' },
  { id: 'cam3', name: 'Side', thumbnail: '/assets/hero.png' }
])
const selectedCam = ref(cameras.value[0]?.id || null)
const showAllCams = ref(false)

// Chart filters
const now = new Date()
const currentYear = now.getFullYear()
const years = Array.from({length: 3}, (_,i) => currentYear - i) // current and two previous years
const months = [
  { value: 1, label: 'Jan' },{ value: 2, label: 'Feb' },{ value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },{ value: 5, label: 'May' },{ value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },{ value: 8, label: 'Aug' },{ value: 9, label: 'Sep' },
  { value:10, label: 'Oct' },{ value:11, label: 'Nov' },{ value:12, label: 'Dec' }
]
const year = ref(currentYear)
const month = ref(now.getMonth() + 1)
const refreshKey = ref(Date.now())

// Chart endpoint builder (adjust to your backend route)
const chartEndpoint = computed(() => {
  // Example endpoint expected to return { labels:[], datasets:[] }
  return `/api/stats/categories?year=${year.value}&month=${month.value}`
})

function cameraOnline(id) { return id === selectedCam.value }
</script>

<style scoped>
.select-cam { margin-left: auto; width: 9rem; height: 2rem; padding: 0.25rem; border-radius: 0.375rem; }
.filter-select { height:2rem; padding:0.25rem; border-radius:0.375rem; border:1px solid rgba(15,23,42,0.06); background:var(--panel); }
.muted { color: var(--muted); }
.brand { color: var(--accent); font-weight:700; }
.card { padding: 1rem; border-radius: 0.75rem; background:var(--panel); box-shadow:var(--card-shadow); border:1px solid var(--panel-border); }
.btn { padding: 0.35rem 0.6rem; border-radius: 0.375rem; cursor: pointer; }
.btn-primary { background: var(--accent); color: #fff; }
</style>
