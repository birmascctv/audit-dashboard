// src/router.js
import { createRouter, createWebHistory } from 'vue-router'
import Dashboard2025 from './pages/Dashboard2025.vue'
import Dashboard from './pages/Dashboard.vue'

const routes = [
  { path: '/2025', component: Dashboard2025 },
  { path: '/', component: Dashboard }
]

export default createRouter({
  history: createWebHistory(),
  routes
})
