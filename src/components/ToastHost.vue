<script setup>
import { useToast } from '../composables/useToast.js';
const { toasts, dismiss } = useToast();
const tone = { success: 'bg-emerald-600', error: 'bg-rose-600', info: 'bg-slate-800' };
</script>

<template>
  <div class="fixed top-4 right-4 z-[200] flex flex-col gap-2 w-[min(92vw,22rem)] pointer-events-none">
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg flex items-start gap-3"
        :class="tone[t.type] || tone.info"
        role="status"
      >
        <span class="flex-1">{{ t.message }}</span>
        <button class="opacity-70 hover:opacity-100" aria-label="Dismiss" @click="dismiss(t.id)">✕</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(24px); }
</style>
