<template>
  <div class="store-filter-root">
    <div class="controls flex items-center gap-3 mb-2">
      <input
        v-model="storeSearch"
        type="search"
        placeholder="Search stores..."
        class="px-3 py-2 rounded bg-slate-800 text-slate-100 border border-slate-700 flex-1"
        aria-label="Search stores"
      />

      <label class="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          :checked="allChecked"
          @change="toggleAll($event)"
        />
        <span>All Stores</span>
      </label>
    </div>

    <div class="stores-list flex flex-wrap gap-2">
      <label
        v-for="store in filteredStores"
        :key="storeId(store)"
        class="store-item flex items-center gap-2 px-2 py-1 rounded bg-slate-800 text-slate-100 border border-slate-700"
      >
        <input
          type="checkbox"
          :value="storeId(store)"
          :checked="isChecked(storeId(store))"
          @change="toggleStore(storeId(store))"
        />
        <span class="truncate">{{ store.name }}</span>
      </label>

      <div v-if="!filteredStores.length" class="text-sm text-slate-400">
        No stores match your filter
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // optional: a criteria search string passed from parent to filter stores that are relevant to a criterion
  criteriaFilter: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const stores = ref([])
const storeSearch = ref('')

// fetch stores on mount
onMounted(async () => {
  try {
    const res = await fetch('/api/stores')
    const json = await res.json()
    // normalize store objects to support both { id, name } and { store_id, name }
    stores.value = Array.isArray(json) ? json.map(s => ({
      id: s.id ?? s.store_id ?? s.storeId ?? null,
      name: s.name ?? s.store_name ?? s.storeName ?? '',
      // optional: if API provides criteria relevance, keep it
      criteria: s.criteria ?? s.criteria_list ?? null
    })) : []
  } catch (e) {
    stores.value = []
    console.error('Failed to load stores', e)
  }
})

// helper to get id consistently
function storeId(s) {
  return s?.id ?? null
}

// whether a store id is currently selected
function isChecked(id) {
  if (id === null) return false
  return props.modelValue.includes(id)
}

// toggle a single store id
function toggleStore(id) {
  return () => {
    const exists = props.modelValue.includes(id)
    const newVal = exists ? props.modelValue.filter(s => s !== id) : [...props.modelValue, id]
    emit('update:modelValue', newVal)
  }
}

// toggle all stores on/off
function toggleAll(e) {
  if (e.target.checked) {
    const allIds = stores.value.map(s => storeId(s)).filter(Boolean)
    emit('update:modelValue', allIds)
  } else {
    emit('update:modelValue', [])
  }
}

// computed filtered stores list
const filteredStores = computed(() => {
  const q = String(storeSearch.value || '').trim().toLowerCase()
  const critQ = String(props.criteriaFilter || '').trim().toLowerCase()

  return stores.value.filter(s => {
    // if criteriaFilter is provided and store has a criteria array, prefer that relevance
    if (critQ && Array.isArray(s.criteria) && s.criteria.length) {
      const matchesCriteria = s.criteria.some(c => String(c).toLowerCase().includes(critQ))
      if (!matchesCriteria) return false
    }

    // then apply store name search
    if (!q) return true
    return (s.name || '').toLowerCase().includes(q)
  })
})

// whether all visible stores are checked
const allChecked = computed(() => {
  const ids = filteredStores.value.map(s => storeId(s)).filter(Boolean)
  if (!ids.length) return false
  return ids.every(id => props.modelValue.includes(id))
})

// keep internal search cleared when parent criteriaFilter changes (optional UX)
watch(() => props.criteriaFilter, () => {
  // do not overwrite user search, but if criteriaFilter is non-empty and storeSearch is empty, keep as-is.
  // no action required here; this watch is present for future extension.
})
</script>

<style scoped>
.store-filter-root { width: 100%; }
.controls { align-items: center; }
.stores-list { max-height: 320px; overflow:auto; padding: 4px 0; }
.store-item { min-width: 160px; }
input[type="search"] { -webkit-appearance: none; }
</style>
