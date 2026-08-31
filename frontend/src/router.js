// src/router.js
import { createRouter, createWebHistory } from 'vue-router'
import Dashboard2025 from './pages/Dashboard2025.vue'
import Dashboard from './pages/Dashboard.vue'

const routes = [
  // root -> main dashboard
  { path: '/', redirect: '/dashboard' },

  // Main dashboard: client-side will exclude 2025 by default
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: Dashboard,
    props: { year: null, excludeYear: 2025 }
  },

  // 2025-only dashboard
  {
    path: '/dashboard2025',
    name: 'Dashboard2025',
    component: Dashboard2025,
    props: { year: 2025, excludeYear: null }
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
