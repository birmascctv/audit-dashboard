<!-- Upload Data section: Drag and drop or browse Excel/CSV with dynamic year and clean Birmas store names -->
<template>
  <div class="upload-card p-6 rounded-2xl bg-slate-900 border border-slate-700 text-slate-100 shadow-xl">
    <form class="space-y-5" @submit.prevent="submit">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <!-- 1. Birmas Store Selector -->
        <div>
          <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Birmas
          </label>
          <select
            v-model="store"
            class="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="" disabled>Select outlet</option>
            <option
              v-for="s in stores"
              :key="s.store_id"
              :value="s.name"
            >
              {{ stripStoreBrand(s.name) }}
            </option>
          </select>
        </div>

        <!-- 2. Audit Year (Dynamic 2025 to Current Year) -->
        <div>
          <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Audit Year
          </label>
          <select
            v-model="year"
            class="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option
              v-for="y in availableYears"
              :key="'yr-' + y"
              :value="String(y)"
            >
              {{ y }} {{ y === currentYear ? '(Current Year)' : (y === 2025 ? '(Historical 2025)' : '') }}
            </option>
          </select>
        </div>

        <!-- 3. Audit Month -->
        <div>
          <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Audit Month
          </label>
          <select
            v-model="month"
            class="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="" disabled>Select month</option>
            <option v-for="m in months" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
      </div>

      <!-- Drag & Drop or Browse Zone (CSV Only) -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Audit Data File (.csv only)
          </label>
          <span class="text-[11px] font-mono font-medium text-blue-400 bg-blue-950/60 border border-blue-800/50 px-2 py-0.5 rounded-md">
            CSV ONLY
          </span>
        </div>
        <div
          @dragenter.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @dragover.prevent="isDragging = true"
          @drop.prevent="handleDrop"
          :class="[
            'relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer',
            isDragging
              ? 'border-blue-500 bg-blue-950/20'
              : file
              ? 'border-emerald-500/60 bg-emerald-950/20'
              : 'border-slate-700 hover:border-slate-600 bg-slate-950/40'
          ]"
          @click="triggerBrowse"
        >
          <input
            ref="fileInput"
            type="file"
            accept=".csv,text/csv"
            @change="onFileChange"
            class="hidden"
          />

          <!-- File Selected State -->
          <div v-if="file" class="flex flex-col items-center gap-2">
            <div class="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold">
              📊
            </div>
            <div>
              <div class="flex items-center justify-center gap-2">
                <p class="text-sm font-semibold text-white">{{ file.name }}</p>
                <span class="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  CSV
                </span>
              </div>
              <p class="text-xs text-slate-400 mt-0.5">{{ (file.size / 1024).toFixed(1) }} KB • Ready to upload</p>
            </div>
            <button
              type="button"
              @click.stop="clearFile"
              class="text-xs text-rose-400 hover:text-rose-300 underline mt-1"
            >
              Remove file
            </button>
          </div>

          <!-- Empty Browse State -->
          <div v-else class="flex flex-col items-center gap-2">
            <div class="w-12 h-12 rounded-xl bg-slate-800 text-blue-400 flex items-center justify-center text-xl font-bold">
              📥
            </div>
            <div>
              <p class="text-sm font-semibold text-slate-200">
                Drag & drop CSV file here, or <span class="text-blue-400 underline">browse</span>
              </p>
              <p class="text-xs text-slate-500 mt-0.5">
                Strictly .csv format supported (e.g. Audit_Store_Januari_2026.csv)
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Submit Button & Overwrite Prompt -->
      <div class="flex items-center justify-between gap-4 pt-2">
        <div v-if="needsConfirm" class="text-xs text-amber-300 font-medium flex items-center gap-1.5">
          <span>⚠️</span>
          <span>Existing file has differences. Click "Upload Anyway" to replace it with this file.</span>
        </div>
        <div v-else></div>

        <button
          type="submit"
          :disabled="submitting || !store || !year || !month || !file"
          :class="[
            'px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg transition-all ml-auto disabled:opacity-40 disabled:cursor-not-allowed',
            needsConfirm
              ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20 ring-2 ring-amber-400/50'
              : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
          ]"
        >
          {{ submitting ? 'Uploading…' : (needsConfirm ? 'Upload Anyway' : 'Upload CSV File') }}
        </button>
      </div>
    </form>

    <div v-if="message" :class="['mt-4 p-3.5 rounded-xl text-sm border leading-relaxed', messageClass]">
      {{ message }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  stores: { type: Array, default: () => [] }
})

const emit = defineEmits(['uploaded'])

// Dynamically compute years from 2025 up to current year
const currentYear = new Date().getFullYear()
const availableYears = computed(() => {
  const years = []
  for (let y = currentYear; y >= 2025; y--) {
    years.push(y)
  }
  return years
})

const months = ref([
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
])

const store = ref('')
const year = ref(String(currentYear))
const month = ref('Januari')
const file = ref(null)
const fileInput = ref(null)
const submitting = ref(false)
const message = ref('')
const messageClass = ref('')
const needsConfirm = ref(false)
const isDragging = ref(false)

function stripStoreBrand(name) {
  if (!name) return ''
  return name.replace(/^birmas\s+/i, '').trim()
}

function triggerBrowse() {
  if (fileInput.value) {
    fileInput.value.click()
  }
}

function validateAndAssignFile(selectedFile) {
  if (!selectedFile) return
  const fileName = selectedFile.name || ''
  if (!fileName.toLowerCase().endsWith('.csv')) {
    message.value = 'File format must be CSV'
    messageClass.value = 'bg-rose-950/40 text-rose-300 border-rose-800/40'
    clearFile()
    return
  }

  // Pre-validate CSV columns and content client-side
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const text = (e.target?.result || '').toString().trim()
      if (!text) {
        message.value = 'Uploaded CSV file contains no data rows.'
        messageClass.value = 'bg-rose-950/40 text-rose-300 border-rose-800/40'
        clearFile()
        return
      }
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
      if (lines.length < 2) {
        message.value = 'Uploaded CSV file contains no data rows.'
        messageClass.value = 'bg-rose-950/40 text-rose-300 border-rose-800/40'
        clearFile()
        return
      }
      const headerCols = lines[0].split(',').map(col => col.replace(/^["']|["']$/g, '').trim())
      const requiredCols = ['Category', 'Criteria', 'Score', 'Passing Grade']
      const missing = requiredCols.filter(
        req => !headerCols.some(col => col.toLowerCase() === req.toLowerCase())
      )
      if (missing.length > 0) {
        message.value = `Data has different table format (failed to upload). Missing columns: ${missing.join(', ')}.`
        messageClass.value = 'bg-rose-950/40 text-rose-300 border-rose-800/40'
        clearFile()
        return
      }
      file.value = selectedFile
      needsConfirm.value = false
      message.value = ''
    } catch {
      file.value = selectedFile
      needsConfirm.value = false
      message.value = ''
    }
  }
  reader.onerror = () => {
    file.value = selectedFile
    needsConfirm.value = false
    message.value = ''
  }
  reader.readAsText(selectedFile.slice(0, 8192))
}

function onFileChange(e) {
  if (e.target.files && e.target.files[0]) {
    validateAndAssignFile(e.target.files[0])
  }
}

function handleDrop(e) {
  isDragging.value = false
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
    validateAndAssignFile(e.dataTransfer.files[0])
  }
}

function clearFile() {
  file.value = null
  if (fileInput.value) fileInput.value.value = ''
  needsConfirm.value = false
}

onMounted(async () => {
  try {
    const res = await fetch('/api/months')
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      months.value = data
    }
  } catch (e) {
    // fallback default months
  }
})

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
    if (needsConfirm.value) fd.append('confirm', '1')

    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    let data = null
    try { data = await res.json() } catch (e) { /* ignore */ }

    if (!res.ok || !data) {
      message.value = (data && data.message) || `Upload failed with server status ${res.status}.`
      messageClass.value = 'bg-rose-950/40 text-rose-300 border-rose-800/40'
      needsConfirm.value = false
    } else if (data.status === 'confirm_required') {
      message.value = data.message
      messageClass.value = 'bg-amber-950/40 text-amber-300 border-amber-800/40'
      needsConfirm.value = true
      submitting.value = false
      return
    } else if (data.status === 'success') {
      message.value = data.message || 'Audit file successfully processed and stored!'
      messageClass.value = 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40'
      needsConfirm.value = false
      clearFile()
      emit('uploaded')
    } else if (data.status === 'unchanged') {
      message.value = data.message
      messageClass.value = 'bg-amber-950/40 text-amber-300 border-amber-800/40'
      needsConfirm.value = false
    } else {
      message.value = data.message || 'Upload failed.'
      messageClass.value = 'bg-rose-950/40 text-rose-300 border-rose-800/40'
      needsConfirm.value = false
    }
  } catch (e) {
    message.value = 'Upload failed due to network error.'
    messageClass.value = 'bg-rose-950/40 text-rose-300 border-rose-800/40'
    needsConfirm.value = false
  } finally {
    submitting.value = false
  }
}
</script>
