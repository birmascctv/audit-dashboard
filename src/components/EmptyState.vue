<script setup>
defineProps({ title: { type: String, default: 'Nothing here yet' }, hint: { type: String, default: '' } });
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center py-10 px-4 text-slate-500">
    <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-2xl mb-3">📭</div>
    <p class="text-sm font-bold text-slate-700">{{ title }}</p>
    <p v-if="hint" class="text-xs mt-1 max-w-sm">{{ hint }}</p>
    <div class="mt-3"><slot /></div>
  </div>
</template>
