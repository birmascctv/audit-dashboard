<template>
  <header class="header-bar">
    <div class="flex items-center justify-between w-full gap-4 flex-wrap">
      <!-- 3-Stripes Button & Brand -->
      <div class="brand-block flex items-center gap-3">
        <button
          type="button"
          @click="toggleSidebar"
          class="sidebar-toggle-btn p-2 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-blue-400 border border-slate-600/70 transition-all flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
          title="Toggle Navigation Menu (☰)"
          aria-label="Toggle Sidebar Menu"
        >
          <span class="text-xl font-bold leading-none select-none">☰</span>
        </button>

        <div>
          <h1 class="brand text-xl sm:text-2xl md:text-3xl font-bold">Birmas Audit</h1>
          <div class="muted text-xs sm:text-sm">{{ subtitle }}</div>
        </div>
      </div>

      <nav class="header-nav hidden md:flex items-center gap-8 flex-1 justify-center">
        <a href="#criteria-section" class="nav-link">Criteria</a>
        <a href="#category-passrate-section" class="nav-link">Category Pass Rate</a>
        <a href="#store-passrate-section" class="nav-link">Store Pass Rate</a>
      </nav>

      <div class="flex gap-2">
        <slot />
      </div>
    </div>
  </header>
</template>

<script setup>
import { inject } from 'vue'

defineProps({
  subtitle: { type: String, default: 'Birmas store audit overview' }
})

const toggleSidebar = inject('toggleSidebar', () => {})
</script>

<style scoped>
.header-bar {
  position: fixed;       /* stays visible when scrolling */
  top: 0;
  left: 0;
  right: 0;
  width: 100%;           /* full width on all screen sizes */
  min-height: 4.75rem;
  background: #374151;   /* grey slate */
  padding: 0.85rem 1.5rem;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  border-bottom: 1px solid #4b5563;
  color: #f1f5f9;
  z-index: 30;         /* keep above charts/content */
}

.brand-block {
  flex-shrink: 0;
}

.brand {
  color: #e5e7eb;
}

.muted {
  color: #9ca3af;
}

.header-nav {
  margin-left: 2rem;
}

.nav-link {
  color: #cbd5e1;
  font-size: 0.95rem;
  font-weight: 500;
  white-space: nowrap;
  transition: color 0.15s ease;
}

.nav-link:hover {
  color: #ffffff;
}
</style>
