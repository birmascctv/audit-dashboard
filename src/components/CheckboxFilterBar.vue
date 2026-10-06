<!-- Reusable "checkbox + All" filter bar. Used for store filters (Criteria /
     Category Pass Rate sections) and category filters (Store Passing Rate
     section). This is the actual data filter — the colored dots shown at
     the bottom of each chart are informational only and no longer
     clickable. -->
<template>
  <div class="checkbox-filter-bar flex flex-wrap items-center gap-x-4 gap-y-2 p-2.5 sm:p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
    <label class="checkbox-item all-item flex items-center gap-2 cursor-pointer select-none pr-3 border-r border-slate-200">
      <input type="checkbox" :checked="allSelected" @change="toggleAll" />
      <span class="text-sm font-bold tracking-tight text-slate-800">{{ allLabel }}</span>
    </label>

    <label
      v-for="item in items"
      :key="item.id"
      class="checkbox-item flex items-center gap-1.5 cursor-pointer select-none px-2 py-1 rounded-lg transition-colors hover:bg-slate-100/80"
    >
      <input type="checkbox" :checked="isSelected(item.id)" @change="toggle(item.id)" />
      <span v-if="item.color" class="dot" :style="{ backgroundColor: item.color }"></span>
      <span class="text-sm font-medium text-slate-700">{{ item.label }}</span>
    </label>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] }, // [{ id, label, color? }]
  modelValue: { type: Array, default: () => [] },
  allLabel: { type: String, default: 'All' }
})
const emit = defineEmits(['update:modelValue'])

const allSelected = computed(() => {
  return props.items.length > 0 && props.items.every(i => props.modelValue.includes(i.id))
})

function isSelected(id) {
  return props.modelValue.includes(id)
}

function toggle(id) {
  const cur = props.modelValue.slice()
  const idx = cur.indexOf(id)
  if (idx >= 0) cur.splice(idx, 1)
  else cur.push(id)
  emit('update:modelValue', cur)
}

function toggleAll() {
  emit('update:modelValue', allSelected.value ? [] : props.items.map(i => i.id))
}
</script>

<style scoped>
.checkbox-item {
  color: #334155; /* Slate-700 for light dashboard */
}
.checkbox-item:hover {
  color: #0f172a;
}
.checkbox-item input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  accent-color: #0d9488; /* teal-600 */
  cursor: pointer;
}
.dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 9999px;
  display: inline-block;
  flex-shrink: 0;
  border: 1px solid rgba(0, 0, 0, 0.15);
}
</style>
