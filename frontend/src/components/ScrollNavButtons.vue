<!-- ScrollNavButtons.vue: Floating quick-scroll buttons for back-to-top and back-to-bottom -->
<template>
  <div
    class="fixed bottom-5 right-5 z-40 select-none print:hidden transition-all duration-300 ease-out"
    :class="[
      isVisible
        ? 'opacity-100 translate-y-0 pointer-events-auto'
        : 'opacity-0 translate-y-3 pointer-events-none'
    ]"
    role="navigation"
    aria-label="Page scroll navigation"
  >
    <!-- Top Half of Page: Only show Go to Bottom (Arrow Down) -->
    <button
      v-if="isTopHalf"
      type="button"
      @click="scrollToBottom"
      class="scroll-btn group relative flex items-center justify-center w-8 h-8 rounded-lg bg-slate-200 hover:bg-white text-slate-800 hover:text-slate-950 border border-slate-300/90 shadow-md transition-all duration-200 active:scale-90 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400"
      title="Scroll to Bottom"
      aria-label="Scroll to bottom of page"
    >
      <svg
        class="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-y-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
      <!-- Tooltip -->
      <span class="absolute right-10 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-200 text-[10px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg">
        Bottom ↓
      </span>
    </button>

    <!-- Bottom Half of Page: Only show Go to Top (Arrow Up) -->
    <button
      v-else
      type="button"
      @click="scrollToTop"
      class="scroll-btn group relative flex items-center justify-center w-8 h-8 rounded-lg bg-slate-200 hover:bg-white text-slate-800 hover:text-slate-950 border border-slate-300/90 shadow-md transition-all duration-200 active:scale-90 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400"
      title="Scroll to Top"
      aria-label="Scroll back to top of page"
    >
      <svg
        class="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-y-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
      <!-- Tooltip -->
      <span class="absolute right-10 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-200 text-[10px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg">
        Top ↑
      </span>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const isVisible = ref(false)
const isTopHalf = ref(true)

function handleScroll() {
  const currentY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
  const docHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.offsetHeight
  )
  const winHeight = window.innerHeight || document.documentElement.clientHeight || 0
  const maxScroll = Math.max(docHeight - winHeight, 1)

  isVisible.value = currentY > 60
  isTopHalf.value = currentY < (maxScroll / 2)
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  })
}

function scrollToBottom() {
  window.scrollTo({
    top: Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    ),
    behavior: 'smooth'
  })
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<style scoped>
.scroll-btn {
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.25);
}
</style>
