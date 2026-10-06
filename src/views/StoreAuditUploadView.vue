<template>
  <div class="page-gutter px-4 sm:px-8 lg:px-16 max-w-[1400px] mx-auto pb-12">
    <!-- 1. Upload Form Section -->
    <div class="mt-2">
      <SectionHeader
        text="Upload Monthly Audit Inspection Records"
        description="Add new store audit data here. Choose the store, year, and month, then upload the CSV file for that audit. Once uploaded, all the charts on the dashboard update automatically with the new data."
      />

      <div class="mt-6 p-6 rounded-2xl bg-white border border-slate-200 shadow-sm max-w-3xl">
        <UploadDataCard :stores="stores" @uploaded="onUploaded" />

        <div v-if="uploadComplete" class="mt-5 p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div class="flex items-center gap-2.5">
            <span class="text-base">✅</span>
            <span class="font-medium">Audit data saved to SQLite database. Dashboard charts and table below now reflect this update.</span>
          </div>
          <router-link
            to="/dashboard"
            class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs whitespace-nowrap transition-colors text-center shadow-md shadow-teal-600/20"
          >
            View Dashboard →
          </router-link>
        </div>
      </div>
    </div>

    <!-- 2. Table of List of All CSV Uploaded with Timestamps -->
    <div class="mt-12">
      <SectionHeader
        text="Uploaded Audit CSV Records"
        description="Complete list of all audit CSV files stored in the database. Filter by store outlet, inspection month, and assessment year, or download any CSV backup."
      />

      <div class="mt-6">
        <UploadedFilesTable :refresh-key="refreshKey" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import SectionHeader from '../components/SectionHeader.vue'
import UploadDataCard from '../components/UploadDataCard.vue'
import UploadedFilesTable from '../components/UploadedFilesTable.vue'

const stores = ref([])
const uploadComplete = ref(false)
const refreshKey = ref(0)

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
  refreshKey.value++
}
</script>
