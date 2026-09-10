import { createRouter, createWebHistory } from 'vue-router'
import Dashboard2025 from './pages/Dashboard2025.vue'
import Dashboard from './pages/Dashboard.vue'
import Upload from './pages/Upload.vue'

const routes = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: Dashboard,
    props: { excludeYear: 2025 }
  },
  {
    path: '/dashboard2025',
    name: 'Dashboard2025',
    component: Dashboard2025,
    props: true
  },
  {
    path: '/upload',
    name: 'Upload',
    component: Upload
  },
  { path: '/2025', redirect: '/dashboard2025' },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes
})