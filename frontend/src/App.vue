<template>
  <div class="min-h-screen bg-[#f1f5f9] text-slate-800 flex flex-col">
    <!-- Sliding Off-canvas Sidebar (3-stripes toggled) -->
    <SideBar />

    <!-- Main Content Area: Full Width (Does not narrow page) -->
    <div class="flex-1 w-full min-h-screen">
      <router-view v-if="$router" />
      <Dashboard v-else />
    </div>
  </div>
</template>

<script setup>
import { ref, provide } from 'vue'
import SideBar from './components/SideBar.vue'
import Dashboard from './pages/Dashboard.vue'

const isSidebarOpen = ref(false)
provide('isSidebarOpen', isSidebarOpen)
provide('toggleSidebar', () => {
  isSidebarOpen.value = !isSidebarOpen.value
})
</script>