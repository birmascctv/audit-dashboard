<script setup>
defineProps({ rows: { type: Number, default: 4 }, height: { type: String, default: 'h-4' } });
</script>

<template>
  <div class="space-y-3 animate-pulse" aria-busy="true">
    <div v-for="n in rows" :key="n" class="rounded-lg bg-slate-200/80" :class="height" :style="{ width: n === rows ? '60%' : '100%' }" />
  </div>
</template>
