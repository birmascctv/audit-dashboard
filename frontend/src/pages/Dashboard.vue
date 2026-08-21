<template>
  <div class="dashboard min-h-screen px-3 sm:px-5 lg:px-10 py-4 transition-colors">
    <!-- Header -->
    <Header />

    <!-- Top row: Selected Camera + All Cameras -->
    <section class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4 items-stretch">
      <div class="card">
        <div class="flex items-center gap-2 mb-2 flex-wrap">
          <h2 class="brand">Selected Camera</h2>
          <select v-model="selectedCam" class="ml-auto select-cam">
            <option v-for="cam in cameras" :key="cam.id" :value="cam.id">{{ cam.name }}</option>
          </select>
        </div>

        <div class="relative w-full rounded-md overflow-hidden bg-black" style="padding-top:56.25%">
          <div class="absolute inset-0 flex items-center justify-center text-white">
            <div v-if="selectedCam">Live stream for {{ selectedCam }}</div>
            <div v-else>No camera selected</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 class="brand mb-2">All Cameras</h2>
        <div class="grid grid-cols-3 gap-2">
          <div v-for="cam in cameras" :key="cam.id"
               class="relative aspect-video rounded-md overflow-hidden cursor-pointer border-2"
               :class="selectedCam === cam.id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'"
               @click="selectedCam = cam.id">
            <img :src="cam.thumbnail" alt="Camera thumbnail" class="w-full h-full object-cover" />
            <span class="absolute bottom-0.5 left-0.5 text-xs font-medium px-1 py-0.5 rounded leading-tight"
                  :class="selectedCam === cam.id ? 'bg-red-600 text-white' : 'bg-black bg-opacity-60 text-white'">
              {{ cam.name }}
            </span>
            <span class="absolute top-0.5 right-0.5 w-2 h-2 rounded-full border border-white shadow"
                  :class="cameraOnline(cam.id) ? 'bg-green-500 animate-pulse' : 'bg-red-500'"></span>
          </div>
        </div>
      </div>
    </section>

    <!-- Filters row -->
    <div class="flex items-center gap-2 flex-wrap mb-3">
      <select v-model="activeFilter" class="filter-select">
        <option value="day">Last 1 Day</option>
        <option value="week">Last 1 Week</option>
        <option value="month">Last 1 Month</option>
        <option value="year">Last 1 Year</option>
      </select>

      <div class="ml-auto flex items-center gap-2 select-none">
        <span :class="!showAllCams ? 'text-red-600' : 'muted'">Selected Cam</span>
        <button @click="showAllCams = !showAllCams" :class="showAllCams ? 'btn-primary' : 'btn-ghost'">
          <span :class="showAllCams ? 'on' : 'off'"></span>
        </button>
        <span :class="showAllCams ? 'text-red-600' : 'muted'">All</span>
      </div>
    </div>

    <!-- Main content: Events table placeholder + Chart -->
    <section class="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch">
      <div class="card min-h-[320px]">
        <h2 class="brand mb-2">Recent Events</h2>
        <div class="muted">Event table not present in this repo — replace with your EventTable component when available.</div>
      </div>

      <div class="card min-h-[320px]">
        <h2 class="brand mb-2">Product Count Statistics</h2>
        <!-- ChartCard is your existing component that renders a bar chart -->
        <ChartCard />
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Header from '../components/Header.vue'
import CategoryCard from '../components/CategoryCard.vue' // kept in case you want to use it later
import ChartCard from '../components/ChartCard.vue'

const cameras = ref([
  { id: 'cam1', name: 'Front', thumbnail: '/assets/hero.png' },
  { id: 'cam2', name: 'Back', thumbnail: '/assets/hero.png' },
  { id: 'cam3', name: 'Side', thumbnail: '/assets/hero.png' }
])
const selectedCam = ref(cameras.value[0].id)
const showAllCams = ref(false)
const activeFilter = ref('day')

function cameraOnline(id) { return id === selectedCam.value }
</script>

<style scoped>
.select-cam { margin-left: auto; width: 9rem; height: 2rem; padding: 0.25rem; border-radius: 0.375rem; }
.filter-select { height:2rem; padding:0.25rem; border-radius:0.375rem; border:1px solid rgba(15,23,42,0.06); background:var(--panel); }
.muted { color: var(--muted); }
.brand { color: var(--accent); font-weight:700; }
.card { padding: 1rem; }
</style>
