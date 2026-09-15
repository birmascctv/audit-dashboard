<!-- ScrollNavButtons.vue: Floating quick-scroll buttons for back-to-top and back-to-bottom -->
<template>
  <div
    class="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-2 select-none print:hidden"
    role="navigation"
    aria-label="Page scroll navigation"
  >
    <!-- Scroll to Top (Arrow Up) -->
    <button
      type="button"
      @click="scrollToTop"
      class="scroll-btn group relative flex items-center justify-center w-11 h-11 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 hover:border-blue-500 shadow-xl backdrop-blur-md transition-all duration-200 active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      title="Back to Top"
      aria-label="Scroll back to top of page"
    >
      <svg
        class="w-5 h-5 transition-transform duration-200 group-hover:-translate-y-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
      <!-- Tooltip -->
      <span class="absolute right-13 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg">
        Top ↑
      </span>
    </button>

    <!-- Scroll to Bottom (Arrow Down) -->
    <button
      type="button"
      @click="scrollToBottom"
      class="scroll-btn group relative flex items-center justify-center w-11 h-11 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 hover:border-blue-500 shadow-xl backdrop-blur-md transition-all duration-200 active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      title="Back to Bottom"
      aria-label="Scroll to bottom of page"
    >
      <svg
        class="w-5 h-5 transition-transform duration-200 group-hover:translate-y-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
      <!-- Tooltip -->
      <span class="absolute right-13 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg">
        Bottom ↓
      </span>
    </button>
  </div>
</template>

<script setup>
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
</script>

<style scoped>
.scroll-btn {
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.6);
}
</style>
