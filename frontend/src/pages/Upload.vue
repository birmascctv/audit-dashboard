<template>
  <div class="page-gutter px-4 sm:px-8 lg:px-16 max-w-[1400px] mx-auto pb-12">
    <Header subtitle="Upload Audit File" />

    <div class="mt-8">
      <SectionHeader
        text="Upload Monthly Audit Inspection Records"
        description="Ingest monthly quality audit data into the SQLite database. Select the targeted store outlet, fiscal year, and audit period, then upload the standardized Excel (.xlsx) or CSV evaluation sheet. Metrics across criteria trends, category pass rates, and store performance will update automatically."
      />

      <div class="mt-6 p-6 rounded-2xl bg-slate-900 border border-slate-700 shadow-xl max-w-3xl">
        <UploadDataCard :stores="stores" @uploaded="onUploaded" />
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

onMounted(async () => {
  try {
    const res = await fetch('/api/stores')
    stores.value = await res.json()
  } catch (e) {
    stores.value = []
  }
})

function onUploaded() {
  alert('Audit file uploaded and processed successfully!')
}
</script>

<style scoped>
.page-gutter {
  padding-top: 6.5rem;
}
</style>