<template>
  <div class="page-gutter px-4 sm:px-8 lg:px-16 max-w-[1400px] mx-auto pb-12">
    <Header subtitle="Upload Audit File" />

    <div class="mt-8">
      <SectionHeader
        text="Upload Monthly Audit Inspection Records"
        description="Add new audit data here. Choose the store, year, and month, then upload the CSV file for that audit. Once uploaded, all the charts on the dashboard update automatically with the new data."
      />

      <div class="mt-6 p-6 rounded-2xl bg-slate-900 border border-slate-700 shadow-xl max-w-3xl">
        <UploadDataCard :stores="stores" @uploaded="onUploaded" />

        <div v-if="uploadComplete" class="mt-5 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <span class="text-base">✅</span>
            <span>Audit data saved to SQLite database. Dashboard charts now reflect this update.</span>
          </div>
          <router-link
            to="/dashboard"
            class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs whitespace-nowrap transition-colors text-center shadow-lg shadow-emerald-600/20"
          >
            View Dashboard →
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Header from '../components/Header.vue'
import SectionHeader from '../components/SectionHeader.vue'
import UploadDataCard from '../components/UploadDataCard.vue'

const stores = ref([])
const uploadComplete = ref(false)

onMounted(async () => {
  try {
    const res = await fetch('/api/stores')
    stores.value = await res.json()
  } catch (e) {
    stores.value = []
  }
})

function onUploaded() {
  uploadComplete.value = true
}
</script>

<style scoped>
.page-gutter {
  padding-top: 6.5rem;
}
</style>