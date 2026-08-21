<template>
  <div class="flex flex-wrap gap-2 mb-4">
    <label v-for="store in stores" :key="store.id" class="flex items-center gap-1">
      <input type="checkbox" v-model="modelValue" :value="store.id" />
      {{ store.name }}
    </label>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({ modelValue: Array })
const emit = defineEmits(['update:modelValue'])

const stores = ref([])

onMounted(async () => {
  const res = await fetch('/api/stores')
  stores.value = await res.json()
})
</script>
