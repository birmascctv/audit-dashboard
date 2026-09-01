<!-- Clickable store selector shown below the line chart. Each store is a
     colored dot: filled when selected, hollow when not. An "All stores"
     dot selects every store when not all are selected, and clears the
     selection (empty chart) when clicked again while all are selected. -->
<template>
  <div class="store-legend-toggle flex flex-wrap items-center gap-3 mt-3">
    <button
      type="button"
      class="dot-btn flex items-center gap-1.5 text-sm text-slate-200"
      @click="toggleAll"
    >
      <span
        class="dot"
        :class="{ filled: allSelected }"
        :style="allSelected ? { background: '#e5e7eb', borderColor: '#e5e7eb' } : { borderColor: '#e5e7eb' }"
      ></span>
      All stores
    </button>

    <button
      v-for="s in stores"
      :key="s.store_id"
      type="button"
      class="dot-btn flex items-center gap-1.5 text-sm text-slate-200"
      @click="toggleStore(s.store_id)"
    >
      <span
        class="dot"
        :class="{ filled: isSelected(s.store_id) }"
        :style="isSelected(s.store_id) ? { background: colorForStore(s), borderColor: colorForStore(s) } : { borderColor: colorForStore(s) }"
      ></span>
      {{ s.name }}
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  stores: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue'])

function isSelected(id) {
  return props.modelValue.includes(id)
}

const allSelected = computed(() => {
  return props.stores.length > 0 && props.stores.every(s => props.modelValue.includes(s.store_id))
})

function toggleStore(id) {
  const cur = props.modelValue.slice()
  const idx = cur.indexOf(id)
  if (idx >= 0) cur.splice(idx, 1)
  else cur.push(id)
  emit('update:modelValue', cur)
}

function toggleAll() {
  if (allSelected.value) {
    emit('update:modelValue', [])
  } else {
    emit('update:modelValue', props.stores.map(s => s.store_id))
  }
}

function colorForStore(store) {
  const id = store?.store_id
  if (id === undefined || id === null) return '#64748b'
  const hue = (id * 47) % 360
  return `hsl(${hue}, 70%, 50%)`
}
</script>

<style scoped>
.dot-btn {
  background: transparent;
  border: 0;
  cursor: pointer;
  padding: 0.15rem 0.35rem;
  border-radius: 0.375rem;
}
.dot-btn:hover {
  background: rgba(255,255,255,0.06);
}
.dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 9999px;
  border: 2px solid;
  background: transparent;
  display: inline-block;
}
.dot.filled {
  border-width: 0;
}
</style>
