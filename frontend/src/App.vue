<template>
  <div class="flex min-h-screen bg-[#1e293b] text-slate-100">
    <Sidebar />
    <div class="flex-1 md:ml-64 min-h-screen">
      <router-view v-if="$router" />
      <Dashboard v-else />
    </div>
  </div>
</template>

<script setup>
import Sidebar from './components/Sidebar.vue'
import Dashboard from './pages/Dashboard.vue'
</script>