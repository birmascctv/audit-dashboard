<!-- Reusable "Dropdown Multi-Select Filter". Used for store filters and category filters -->
<template>
  <div class="relative inline-block text-left" ref="dropdownRef">
    <!-- Trigger Button -->
    <button
      type="button"
      @click="isOpen = !isOpen"
      class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold shadow-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/20"
      :class="{ 'border-teal-500 ring-2 ring-teal-500/20': isOpen }"
    >
      <span class="text-slate-400">🔍</span>
      <span>{{ buttonLabel }}</span>
      <span
        class="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-black"
        :class="allSelected ? 'bg-teal-50 text-teal-800 border border-teal-200' : 'bg-amber-50 text-amber-800 border border-amber-200'"
      >
        {{ selectedCountLabel }}
      </span>
      <ChevronDown class="w-3.5 h-3.5 text-slate-400 transition-transform duration-200" :class="{ 'rotate-180': isOpen }" />
    </button>

    <!-- Dropdown Menu Popup -->
    <div
      v-if="isOpen"
      class="absolute left-0 z-40 mt-1.5 w-64 sm:w-72 rounded-2xl bg-white border border-slate-200 shadow-xl p-2 text-slate-800 animate-in fade-in zoom-in-95 duration-100"
    >
      <!-- Quick Action Header: Select All / Clear -->
      <div class="flex items-center justify-between px-2.5 py-1.5 pb-2 border-b border-slate-100 text-xs">
        <label class="flex items-center gap-2 cursor-pointer select-none font-bold text-slate-800">
          <input
            type="checkbox"
            :checked="allSelected"
            @change="toggleAll"
            class="w-4 h-4 rounded text-teal-600 accent-teal-600 cursor-pointer"
          />
          <span>{{ allLabel }}</span>
        </label>

        <button
          type="button"
          @click="toggleAll"
          class="text-[11px] font-bold text-teal-700 hover:text-teal-800 cursor-pointer"
        >
          {{ allSelected ? 'Deselect All' : 'Select All' }}
        </button>
      </div>

      <!-- Scrollable Checkbox List -->
      <div class="max-h-60 overflow-y-auto py-1 space-y-0.5">
        <label
          v-for="item in items"
          :key="item.id"
          class="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-slate-50 cursor-pointer select-none transition-colors"
        >
          <div class="flex items-center gap-2 min-w-0 pr-2">
            <input
              type="checkbox"
              :checked="isSelected(item.id)"
              @change="toggle(item.id)"
              class="w-4 h-4 rounded text-teal-600 accent-teal-600 cursor-pointer shrink-0"
            />
            <span
              v-if="item.color"
              class="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
              :style="{ backgroundColor: item.color }"
            ></span>
            <span class="text-xs font-semibold text-slate-700 truncate">{{ item.label }}</span>
          </div>

          <span v-if="isSelected(item.id)" class="text-xs text-teal-600 font-bold shrink-0">✓</span>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

const props = defineProps({
  items: { type: Array, default: () => [] }, // [{ id, label, color? }]
  modelValue: { type: Array, default: () => [] },
  allLabel: { type: String, default: 'All' },
  placeholder: { type: String, default: 'Filter Selection' }
})
const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const dropdownRef = ref(null)

const allSelected = computed(() => {
  return props.items.length > 0 && props.items.every(i => props.modelValue.includes(i.id))
})

const selectedCountLabel = computed(() => {
  if (allSelected.value) return 'All'
  const count = props.modelValue.length
  return `${count}/${props.items.length}`
})

const buttonLabel = computed(() => {
  if (allSelected.value) return props.allLabel
  if (props.modelValue.length === 0) return 'None Selected'
  if (props.modelValue.length === 1) {
    const item = props.items.find(i => i.id === props.modelValue[0])
    return item ? item.label : '1 Selected'
  }
  return `${props.allLabel}: ${props.modelValue.length} active`
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

function handleClickOutside(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>
