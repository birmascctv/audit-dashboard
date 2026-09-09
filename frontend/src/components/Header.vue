<template>
  <header class="header-bar">
    <div class="flex items-center justify-between w-full">
      <div>
        <h1 class="brand text-3xl md:text-4xl font-bold">Birmas Audit</h1>
        <div class="muted text-sm">{{ subtitle }}</div>
      </div>
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
  background: #374151;   /* grey slate */
  padding: 1rem 1.5rem;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  border-bottom: 1px solid #4b5563;
  color: #f1f5f9;
  z-index: 1000;         /* keep above charts/content */
}

.brand {
  color: #e5e7eb;
}
.muted {
  color: #9ca3af;
}
</style>
