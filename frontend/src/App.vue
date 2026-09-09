<template>
  <router-view v-if="$router" />
  <Dashboard v-else />
</template>

<script setup>
import Dashboard from './pages/Dashboard.vue'
</script>
