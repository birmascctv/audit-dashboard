<template>
  <header class="header-bar">
    <div class="flex items-center justify-between w-full gap-6 flex-wrap">
      <div class="brand-block">
        <h1 class="brand text-2xl md:text-3xl font-bold">Birmas Audit</h1>
        <div class="muted text-sm">{{ subtitle }}</div>
      </div>

      <nav class="header-nav hidden md:flex items-center gap-8 flex-1 justify-center">
        <a href="#criteria-section" class="nav-link">Criteria</a>
        <a href="#category-passrate-section" class="nav-link">Category Pass Rate</a>
        <a href="#store-passrate-section" class="nav-link">Store Pass Rate</a>
        <a href="#upload-section" class="nav-link">Upload Data</a>
      </nav>

      <div class="flex gap-2">
        <slot />
      </div>
    </div>
  </header>
</template>

<script setup>
defineProps({
  subtitle: { type: String, default: 'Birmas store audit overview' }
})
</script>

<style scoped>
.header-bar {
  position: fixed;       /* stays visible when scrolling */
  top: 0;
  left: 0;
  right: 0;
  width: 100%;           /* full width */
  min-height: 5rem;
  background: #374151;   /* grey slate */
  padding: 1rem 1.5rem;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  border-bottom: 1px solid #4b5563;
  color: #f1f5f9;
  z-index: 1000;         /* keep above charts/content */
}

.brand-block {
  /* left margin/offset intentionally unchanged from before */
  flex-shrink: 0;
}

.brand {
  color: #e5e7eb;
}
.muted {
  color: #9ca3af;
}

.header-nav {
  /* considerable spacing away from the title, and between each link */
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

