<!-- StoreMascot.vue: Visual mascot badge for Birmas store outlets -->
<template>
  <div class="inline-flex items-center gap-2" :title="mascot.name">
    <div
      class="mascot-badge relative flex items-center justify-center rounded-xl border transition-all select-none shadow-sm"
      :class="[sizeClasses, borderClass, bgClass]"
      :style="{ borderColor: meta?.color ? `${meta.color}66` : undefined }"
    >
      <!-- Image if provided / saved by user, otherwise fallback to styled emoji/icon -->
      <img
        v-if="hasValidImage && !imageFailed"
        :src="meta?.mascotImg"
        :alt="mascot.name"
        @error="imageFailed = true"
        class="w-full h-full object-contain rounded-lg p-0.5"
      />
      <span v-else :class="emojiSizeClass" class="leading-none transform transition-transform hover:scale-110">
        {{ mascot.emoji }}
      </span>

      <!-- Vibrant colored dot indicator -->
      <span
        class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-900 shadow-sm"
        :style="{ backgroundColor: meta?.color || '#3b82f6' }"
      />
    </div>

    <!-- Optional text label next to mascot -->
    <div v-if="showLabel" class="leading-tight">
      <div v-if="showStoreName" class="text-xs font-semibold text-white truncate">
        {{ meta?.shortName || 'Store' }}
      </div>
      <div class="text-[10px] font-medium" :style="{ color: meta?.color || '#94a3b8' }">
        {{ mascot.name }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getStoreMeta, getStoreMascot } from '../store-meta.js'

const props = defineProps({
  store: { type: [Number, String, Object], default: null },
  size: { type: String, default: 'md' }, // 'xs', 'sm', 'md', 'lg', 'xl'
  showLabel: { type: Boolean, default: false },
  showStoreName: { type: Boolean, default: true }
})

const imageFailed = ref(false)

const storeIdOrName = computed(() => {
  if (!props.store) return null
  if (typeof props.store === 'object') {
    return props.store.store_id ?? props.store.id ?? props.store.name
  }
  return props.store
})

const meta = computed(() => getStoreMeta(storeIdOrName.value))
const mascot = computed(() => getStoreMascot(storeIdOrName.value))

const hasValidImage = computed(() => {
  return !!meta.value?.mascotImg
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'w-6 h-6 text-xs'
    case 'sm':
      return 'w-7 h-7 text-sm'
    case 'lg':
      return 'w-11 h-11 text-xl'
    case 'xl':
      return 'w-14 h-14 text-2xl'
    case '2xl':
      return 'w-16 h-16 text-3xl'
    case 'md':
    default:
      return 'w-9 h-9 text-base'
  }
})

const emojiSizeClass = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'text-[11px]'
    case 'sm':
      return 'text-xs'
    case 'lg':
      return 'text-lg'
    case 'xl':
      return 'text-2xl'
    case '2xl':
      return 'text-3xl'
    case 'md':
    default:
      return 'text-sm'
  }
})

const borderClass = computed(() => meta.value?.borderClass || 'border-slate-700')
const bgClass = computed(() => meta.value?.bgClass || 'bg-slate-800/80')
</script>
