<!-- Small section-title "card", visually similar to the main Header but in a
     lighter grey (between the page background and the main header) and a
     smaller font, used above the Criteria control and the pass-rate
     section titles. -->
<template>
  <div class="mb-3">
    <div class="section-header-card inline-flex items-center gap-2">
      <h4 class="section-header-text text-base md:text-lg font-bold">{{ text }}</h4>
    </div>
    <p v-if="description" class="section-description-text text-sm mt-1.5 leading-relaxed">{{ description }}</p>
  </div>
</template>

<script setup>
defineProps({
  text: { type: String, required: true },
  description: { type: String, default: '' }
})
</script>

<style scoped>
.section-header-card {
  padding: 0.35rem 0.85rem;
  border-radius: 0.6rem;
  background: #334155;
  border: 1px solid #475569;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.section-header-text {
  color: #f8fafc;
  margin: 0;
}
.section-description-text {
  color: #475569; /* slate-600: dark enough to read clearly on the light page background */
  margin: 0;
  max-width: 900px;
}
</style>