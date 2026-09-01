<template>
  <header class="card flex items-center justify-between mb-4">
    <div>
      <h1 class="brand text-3xl md:text-4xl font-bold">Birmas Audit</h1>
      <div class="muted text-sm">{{ subtitle }}</div>
    </div>
    <div class="flex gap-2">
      <slot />
    </div>
  </header>
</template>

<script setup>
defineProps({
  subtitle: { type: String, default: 'Birmas store audit overview' }
})
</script>

<style scoped>
.card {
  padding: 1rem;
  border-radius: 0.75rem;
  background: #374151; /* grey slate */
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  border: 1px solid #4b5563;
  color: #f1f5f9;
}
.brand {
  color: #e5e7eb; /* light grey accent */
}
.muted {
  color: #9ca3af;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
  border: 0;
}
.btn-primary {
  background: #6b7280;
  color: #fff;
}
.btn-ghost {
  background: transparent;
  color: #9ca3af;
  border: 1px solid rgba(255,255,255,0.1);
}
</style>
