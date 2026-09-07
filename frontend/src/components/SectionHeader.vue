<!-- Small section-title "card", visually similar to the main Header but in a
     lighter grey (between the page background and the main header) and a
     smaller font, used above the Criteria control and the pass-rate
     section titles. -->
<template>
  <div class="mb-2">
    <div class="section-header-card inline-block">
      <h4 class="section-header-text text-base md:text-lg font-bold">{{ text }}</h4>
    </div>
    <p v-if="description" class="section-description-text text-sm mt-1">{{ description }}</p>
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
  background: #9ca3af; /* lighter than the main header's #374151, darker than the page bg #e5e7eb */
  border: 1px solid #b0b7c1;
}
.section-header-text {
  color: #111827;
  margin: 0;
}
.section-description-text {
  color: #4b5563;
  margin: 0;
}
</style>
