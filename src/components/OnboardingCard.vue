<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';

const route = useRoute();
const { currentUser, role } = useAuth();
const key = computed(() => `birmas_onboarding_done_${currentUser.value?.username || ''}`);
const dismissed = ref(false);
const checked = ref({});

const tasks = computed(() => {
  if (role.value === 'admin') return [
    ['Pick a date with Quick Range', 'Use Today, Last 7 Days or Date Range at the top of Sales Report.'],
    ['Choose a store', 'Use the store dropdown to see one store only.'],
    ['Check Stock vs Sold', 'Scroll to Sales by Time Range to compare stock with sales.'],
  ];
  return [
    ['Upload the monthly audit CSV', 'Audit > Upload Audits. The file name must contain the outlet and month.'],
    ['Count stock', 'Audit > Stock Audit. Click the scan box and scan each product once.'],
    ['Finish the audit', 'Press Complete Audit when you are done. Results go to Audit Records.'],
  ];
});
const hidden = computed(() => route.path === '/login' || !currentUser.value || dismissed.value || localStorage.getItem(key.value) === '1');
function done() {
  localStorage.setItem(key.value, '1');
  dismissed.value = true;
}
</script>

<template>
  <section v-if="!hidden" class="max-w-[1560px] w-full mx-auto px-4 sm:px-8 lg:px-12 xl:px-16 pt-4">
    <div class="rounded-2xl border border-teal-200 bg-teal-50 p-4 shadow-sm">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-extrabold text-teal-900">Welcome, {{ currentUser?.name }}. Start here</h2>
          <p class="text-xs text-teal-800">Three quick steps. Tick them as you go.</p>
        </div>
        <button type="button" class="rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100" @click="done">Dismiss</button>
      </div>
      <ol class="mt-3 grid gap-2 sm:grid-cols-3">
        <li v-for="(t, i) in tasks" :key="i" class="flex gap-2 rounded-xl bg-white p-3 text-xs border border-teal-100">
          <input v-model="checked[i]" type="checkbox" class="mt-0.5 h-4 w-4 accent-teal-600">
          <span><strong class="block text-slate-900" :class="checked[i] ? 'line-through text-slate-400' : ''">{{ i + 1 }}. {{ t[0] }}</strong><span class="text-slate-600">{{ t[1] }}</span></span>
        </li>
      </ol>
    </div>
  </section>
</template>
