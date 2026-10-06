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
        class="absolute rounded-full border border-slate-900 shadow-sm"
        :class="dotSizeClass"
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
  size: { type: String, default: 'md' }, // 'xs', 'sm', 'md', 'lg', 'xl', '2xl'
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
      return 'w-6 h-6 text-xs rounded-lg'
    case 'sm':
      return 'w-8 h-8 text-sm rounded-lg'
    case 'md':
      return 'w-10 h-10 text-base rounded-xl'
    case 'lg':
      return 'w-12 h-12 text-xl rounded-xl'
    case 'xl':
      return 'w-14 h-14 text-2xl rounded-2xl'
    case '2xl':
      return 'w-16 h-16 text-3xl rounded-2xl'
    default:
      return 'w-10 h-10 text-base rounded-xl'
  }
})

const emojiSizeClass = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'text-[11px]'
    case 'sm':
      return 'text-sm'
    case 'md':
      return 'text-xl'
    case 'lg':
      return 'text-2xl'
    case 'xl':
      return 'text-3xl'
    case '2xl':
      return 'text-4xl'
    default:
      return 'text-xl'
  }
})

const dotSizeClass = computed(() => {
  switch (props.size) {
    case 'xs':
    case 'sm':
      return 'w-2 h-2 -bottom-0.5 -right-0.5'
    case 'md':
      return 'w-2.5 h-2.5 -bottom-0.5 -right-0.5'
    case 'lg':
    case 'xl':
    case '2xl':
      return 'w-3.5 h-3.5 -bottom-1 -right-1 border-2'
    default:
      return 'w-2.5 h-2.5 -bottom-0.5 -right-0.5'
  }
})

const borderClass = computed(() => meta.value?.borderClass || 'border-slate-700')
const bgClass = computed(() => meta.value?.bgClass || 'bg-slate-800/80')
</script>
