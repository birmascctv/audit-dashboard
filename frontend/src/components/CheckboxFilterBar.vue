<!-- Reusable "checkbox + All" filter bar. Used for store filters (Criteria /
     Category Pass Rate sections) and category filters (Store Passing Rate
     section). This is the actual data filter — the colored dots shown at
     the bottom of each chart are informational only and no longer
     clickable. -->
<template>
  <div class="checkbox-filter-bar flex flex-wrap items-center gap-x-4 gap-y-2">
    <label class="checkbox-item all-item flex items-center gap-1.5 cursor-pointer select-none">
      <input type="checkbox" :checked="allSelected" @change="toggleAll" />
      <span class="text-sm font-medium">{{ allLabel }}</span>
    </label>

    <label
      v-for="item in items"
      :key="item.id"
      class="checkbox-item flex items-center gap-1.5 cursor-pointer select-none"
    >
      <input type="checkbox" :checked="isSelected(item.id)" @change="toggle(item.id)" />
      <span v-if="item.color" class="dot" :style="{ backgroundColor: item.color }"></span>
      <span class="text-sm">{{ item.label }}</span>
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
  color: #111827; /* dark text, readable on the light page background */
}
.checkbox-item input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  accent-color: #374151;
  cursor: pointer;
}
.dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 9999px;
  display: inline-block;
}
</style>
