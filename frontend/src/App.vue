<template>
  <div id="app">
    <!-- Global sticky header -->
    <Header subtitle="Birmas store audit overview">
      <!-- optional global slot content -->
    </Header>

    <!-- Global content wrapper -->
    <div class="page-gutter px-4 sm:px-8 lg:px-16 max-w-[1400px] mx-auto">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import Header from './components/Header.vue'
</script>

<style>
.page-gutter {
  padding-top: var(--header-height, 5rem);
}
</style>
