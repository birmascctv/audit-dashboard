<!-- Combined search + dropdown for picking a criterion. Typing filters the
     list live; the same input doubles as the dropdown trigger. -->
<template>
  <div class="criteria-select-root relative" ref="root">
    <input
      v-model="query"
      type="text"
      placeholder="Search or select criteria..."
      class="w-full px-3 py-2 rounded bg-white text-slate-900 border border-slate-300 placeholder-slate-500"
      @focus="onFocus"
      @click="onFocus"
      @input="open = true"
    />

    <ul
      v-if="open && filteredCriteria.length"
      class="dropdown absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded bg-white border border-slate-300 shadow-lg"
    >
      <li
        v-for="c in filteredCriteria"
        :key="c.id"
        class="px-3 py-2 cursor-pointer hover:bg-slate-100 text-slate-900"
        :class="{ 'bg-slate-100': c.id === modelValue }"
        @mousedown.prevent="select(c)"
      >
        {{ c.label }} <span class="text-xs text-slate-500">— {{ c.category }}</span>
      </li>
    </ul>

    <div v-else-if="open && !filteredCriteria.length" class="dropdown absolute z-10 mt-1 w-full rounded bg-white border border-slate-300 shadow-lg px-3 py-2 text-sm text-slate-500">
      No criteria match your search
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  criteria: { type: Array, default: () => [] },
  modelValue: { type: [String, Number], default: null }
})
const emit = defineEmits(['update:modelValue'])

const root = ref(null)
const query = ref('')
const open = ref(false)

// keep the input text in sync with the selected criterion's label
function syncQueryFromSelection() {
  const selected = props.criteria.find(c => c.id === props.modelValue)
  query.value = selected ? selected.label : ''
}
onMounted(syncQueryFromSelection)
watch(() => props.modelValue, syncQueryFromSelection)
watch(() => props.criteria, syncQueryFromSelection)

const filteredCriteria = computed(() => {
  const q = String(query.value || '').trim().toLowerCase()
  if (!q) return props.criteria
  return props.criteria.filter(c => {
    return (c.label || '').toLowerCase().includes(q) ||
           (c.category || '').toLowerCase().includes(q)
  })
})

// clear the search text on focus so the full list shows; the selected
// label is restored on blur/close via syncQueryFromSelection
function onFocus() {
  query.value = ''
  open.value = true
}

function select(c) {
  emit('update:modelValue', c.id)
  query.value = c.label
  open.value = false
}

function handleClickOutside(e) {
  if (root.value && !root.value.contains(e.target)) {
    open.value = false
    syncQueryFromSelection()
  }
}
onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', handleClickOutside))
</script>

<style scoped>
.criteria-select-root { width: 100%; }
.dropdown { list-style: none; margin: 0; padding: 0.25rem 0; }
</style>
