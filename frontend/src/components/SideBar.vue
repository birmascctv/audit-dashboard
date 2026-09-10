<template>
  <div>
    <!-- Backdrop Overlay (closes drawer on click) -->
    <div
      v-if="isOpen"
      @click="closeSidebar"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
      aria-hidden="true"
    />

    <!-- Off-canvas Sliding Drawer Sidebar -->
    <aside
      class="sidebar-container bg-slate-900 border-r border-slate-800 text-slate-200 flex flex-col fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[85vw] transition-transform duration-300 ease-in-out shadow-2xl"
      :class="isOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <!-- Brand Header + Close Button -->
      <div class="brand-header p-5 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm shadow-sm">
            BA
          </div>
          <div>
            <h1 class="brand-title font-bold text-base text-white leading-tight">Birmas Audit</h1>
            <p class="brand-subtitle text-xs text-slate-400">Quality Assurance</p>
          </div>
        </div>

        <button
          type="button"
          @click="closeSidebar"
          class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Close menu"
        >
          <span class="text-xl leading-none">✕</span>
        </button>
      </div>

      <!-- Navigation Menu -->
      <nav class="nav-menu flex-1 p-4 space-y-1.5 overflow-y-auto">
        <router-link
          to="/dashboard"
          @click="closeSidebar"
          class="nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          :class="$route.path === '/dashboard' || $route.path === '/' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'"
        >
          <span class="text-base">📊</span>
          <div>
            <div class="leading-tight">Dashboard</div>
            <div class="text-[11px] opacity-70">Year 2026</div>
          </div>
        </router-link>

        <router-link
          to="/dashboard2025"
          @click="closeSidebar"
          class="nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          :class="$route.path === '/dashboard2025' || $route.path === '/2025' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'"
        >
          <span class="text-base">📅</span>
          <div>
            <div class="leading-tight">Dashboard 2025</div>
            <div class="text-[11px] opacity-70">Historical Archive</div>
          </div>
        </router-link>

        <router-link
          to="/upload"
          @click="closeSidebar"
          class="nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          :class="$route.path === '/upload' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'"
        >
          <span class="text-base">📤</span>
          <div>
            <div class="leading-tight">Upload File</div>
            <div class="text-[11px] opacity-70">Import Audit Sheet</div>
          </div>
        </router-link>
      </nav>

      <!-- Footer info -->
      <div class="p-4 border-t border-slate-800 text-xs text-slate-500 flex items-center justify-between">
        <span>Store Audit Intelligence</span>
        <span class="font-mono">v1.2</span>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { inject, unref, computed } from 'vue'

const isSidebarOpen = inject('isSidebarOpen', null)
const toggleSidebar = inject('toggleSidebar', () => {})

const isOpen = computed(() => {
  return isSidebarOpen ? !!unref(isSidebarOpen) : false
})

function closeSidebar() {
  if (isOpen.value) {
    toggleSidebar()
  }
}
</script>

<style scoped>
.sidebar-container {
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
}
</style>