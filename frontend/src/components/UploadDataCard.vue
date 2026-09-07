<!-- Upload Data section: lets a user add/replace one store+month+year CSV
     file. On success/update the parent should bump its refreshKey so all
     ChartCard instances reload their data. -->
<template>
  <div class="upload-card p-4 rounded bg-slate-900 border border-slate-700 text-slate-100">
    <form class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end" @submit.prevent="submit">
      <div>
        <label class="block text-sm mb-1">Store</label>
        <select v-model="store" class="w-full px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-sm">
          <option value="" disabled>Select store</option>
          <option v-for="s in stores" :key="s.store_id" :value="s.name">{{ s.name }}</option>
        </select>
      </div>

      <div>
        <label class="block text-sm mb-1">Year</label>
        <input
          v-model="year"
          type="number"
          placeholder="e.g. 2026"
          class="w-full px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-sm"
        />
      </div>

      <div>
        <label class="block text-sm mb-1">Month</label>
        <select v-model="month" class="w-full px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 text-sm">
          <option value="" disabled>Select month</option>
          <option v-for="m in months" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>

      <div>
        <label class="block text-sm mb-1">CSV file</label>
        <input
          ref="fileInput"
          type="file"
          accept=".csv"
          @change="onFileChange"
          class="w-full text-sm file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-slate-700 file:text-slate-100"
        />
      </div>

      <div>
        <button
          type="submit"
          :disabled="submitting || !store || !year || !month || !file"
          class="w-full px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          {{ submitting ? 'Uploading…' : 'Upload' }}
        </button>
      </div>
    </form>

    <p v-if="message" :class="['mt-3 text-sm', messageClass]">{{ message }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  stores: { type: Array, default: () => [] }
})

const emit = defineEmits(['uploaded'])

const months = ref([])
const store = ref('')
const year = ref('')
const month = ref('')
const file = ref(null)
const fileInput = ref(null)
const submitting = ref(false)
const message = ref('')
const messageClass = ref('')

onMounted(async () => {
  try {
    const res = await fetch('/api/months')
    months.value = await res.json()
  } catch (e) {
    months.value = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
  }
})

function onFileChange(e) {
  file.value = e.target.files && e.target.files[0] ? e.target.files[0] : null
}

async function submit() {
  if (!store.value || !year.value || !month.value || !file.value) return
  submitting.value = true
  message.value = ''
  try {
    const fd = new FormData()
    fd.append('store', store.value)
    fd.append('year', String(year.value))
    fd.append('month', month.value)
    fd.append('file', file.value)

    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    let data = null
    try { data = await res.json() } catch (e) { /* ignore */ }

    if (!res.ok || !data) {
      message.value = (data && data.message) || `Data failed to upload for other reasons (server error ${res.status}).`
      messageClass.value = 'text-red-400'
    } else if (data.status === 'success') {
      message.value = data.message
      messageClass.value = 'text-green-400'
      emit('uploaded')
    } else if (data.status === 'unchanged') {
      message.value = data.message
      messageClass.value = 'text-amber-300'
    } else {
      message.value = data.message || 'Data failed to upload.'
      messageClass.value = 'text-red-400'
    }
  } catch (e) {
    message.value = 'Data failed to upload for other reasons (network error).'
    messageClass.value = 'text-red-400'
  } finally {
    submitting.value = false
    // reset the form's file input every submit, per the same "always
    // reset" behavior used for the criteria search bar
    file.value = null
    if (fileInput.value) fileInput.value.value = ''
  }
}
</script>
