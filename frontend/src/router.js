// src/router.js
import { createRouter, createWebHistory } from 'vue-router'
import Dashboard2025 from './pages/Dashboard2025.vue'
import Dashboard from './pages/Dashboard.vue'

const routes = [
  // root -> main dashboard
  { path: '/', redirect: '/dashboard' },

  // Main dashboard: shows all years except 2025
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: Dashboard,
    props: { excludeYear: 2025 }
  },

  // 2025-only dashboard
  {
    path: '/dashboard2025',
    name: 'Dashboard2025',
    component: Dashboard2025,
    props: true
  },

  // keep your existing short path as an alias to the 2025 dashboard
  { path: '/2025', redirect: '/dashboard2025' },

  // fallback: redirect unknown routes to main dashboard
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes
})
