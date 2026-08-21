<template>
  <div class="flex flex-wrap gap-2 mb-4">
    <label class="flex items-center gap-1">
      <input
        type="checkbox"
        :checked="modelValue.length === stores.length"
        @change="toggleAll"
      />
      All Stores
    </label>
    <label v-for="store in stores" :key="store.store_id" class="flex items-center gap-1">
      <input
        type="checkbox"
        :value="store.store_id"
        :checked="modelValue.includes(store.store_id)"
        @change="toggleStore(store.store_id)"
      />
      {{ store.name }}
    </label>
  </div>
</template>

<script setup>
const props = defineProps({ modelValue: { type: Array, default: () => [] } })
const emit = defineEmits(['update:modelValue'])
const stores = ref([])

onMounted(async () => {
  const res = await fetch('/api/stores')
  stores.value = await res.json()
})

function toggleStore(id) {
  const newVal = props.modelValue.includes(id)
    ? props.modelValue.filter(s => s !== id)
    : [...props.modelValue, id]
  emit('update:modelValue', newVal)
}

function toggleAll(e) {
  if (e.target.checked) {
    emit('update:modelValue', stores.value.map(s => s.store_id))
  } else {
    emit('update:modelValue', [])
  }
}
</script>
