<!-- Upload Data section: Drag and drop or browse Excel/CSV with dynamic year and clean Birmas store names -->
<template>
  <div class="upload-card p-6 rounded-2xl bg-white border border-slate-200 text-slate-800 shadow-sm">
    <form class="space-y-5" @submit.prevent="submit">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <!-- 1. Birmas Store Selector (Strictly Sudirman, Kuningan, Kwitang) -->
        <div>
          <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <span>🏪</span>
              <span>Birmas Outlet</span>
              <span class="text-rose-500">*</span>
            </span>
            <span class="text-[10px] text-teal-700 font-semibold">(Sudirman, Kuningan, Kwitang)</span>
          </label>
          <select
            v-model="store"
            class="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-bold focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 shadow-xs cursor-pointer transition-colors"
          >
            <option value="" disabled>Select outlet store</option>
            <option
              v-for="s in activeStores"
              :key="s.store_id || s.id"
              :value="s.name"
            >
              {{ stripStoreBrand(s.name) }}
            </option>
          </select>
        </div>

        <!-- 2. Audit Year (Dynamic 2025 to Current Year) -->
        <div>
          <label class="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            Audit Year
          </label>
          <select
            v-model="year"
            class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:outline-none focus:border-teal-500 focus:bg-white shadow-xs"
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
          <label class="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            Audit Month
          </label>
          <select
            v-model="month"
            class="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-semibold focus:outline-none focus:border-teal-500 focus:bg-white shadow-xs"
          >
            <option value="" disabled>Select month</option>
            <option v-for="m in months" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>
      </div>

      <!-- Drag & Drop or Browse Zone (CSV Only) -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label class="block text-xs font-bold text-slate-600 uppercase tracking-wider">
            Audit Data File (.csv only)
          </label>
          <span class="text-[11px] font-mono font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
            CSV ONLY
          </span>
        </div>
        <div
          @dragenter.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @dragover.prevent="isDragging = true"
          @drop.prevent="handleDrop"
          :class="[
            'relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer shadow-xs',
            isDragging
              ? 'border-teal-500 bg-teal-50/50'
              : file
              ? 'border-emerald-500 bg-emerald-50/40'
              : 'border-slate-300 hover:border-teal-500 hover:bg-teal-50/20 bg-slate-50/70'
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
            <div class="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl font-bold border border-emerald-200">
              📊
            </div>
            <div>
              <div class="flex items-center justify-center gap-2">
                <p class="text-sm font-bold text-slate-900">{{ file.name }}</p>
                <span class="text-[10px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                  CSV
                </span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5">{{ (file.size / 1024).toFixed(1) }} KB • Ready to upload</p>
            </div>
            <button
              type="button"
              @click.stop="clearFile"
              class="text-xs font-bold text-rose-600 hover:text-rose-700 underline mt-1 cursor-pointer"
            >
              Remove file
            </button>
          </div>

          <!-- Empty Browse State -->
          <div v-else class="flex flex-col items-center gap-2">
            <div class="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-xl font-bold border border-teal-200">
              📥
            </div>
            <div>
              <p class="text-sm font-bold text-slate-800">
                Drag & drop CSV file here, or <span class="text-teal-600 underline">browse</span>
              </p>
              <p class="text-xs text-slate-500 mt-0.5">
                Strictly .csv format supported (e.g. Log Auditor OL Sudirman 4 Agustus 2026.csv)
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- File Mismatch Warning Banner -->
      <div
        v-if="file && mismatchError"
        class="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-950 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
      >
        <div class="flex items-start gap-2.5">
          <span class="text-xl leading-none mt-0.5">❌</span>
          <div>
            <span class="font-extrabold text-rose-900 block text-sm">{{ mismatchError.title }}</span>
            <span class="text-rose-800 block mt-1 font-semibold leading-relaxed">{{ mismatchError.message }}</span>
          </div>
        </div>
        <button
          v-if="mismatchError.canSync"
          type="button"
          @click="syncDropdownToFile"
          class="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs whitespace-nowrap transition-colors shadow-xs cursor-pointer shrink-0"
        >
          Auto-Fix: Sync Selection to File
        </button>
      </div>

      <!-- File Verified Success Indicator -->
      <div
        v-else-if="file && isFileVerified"
        class="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center justify-between gap-2 shadow-xs"
      >
        <div class="flex items-center gap-2">
          <span class="text-base">✅</span>
          <span class="font-bold text-emerald-800">
            File Verified: Matches {{ stripStoreBrand(store) }} • {{ month }} {{ lastDetected?.detectedYear || '' }}
          </span>
        </div>
        <span class="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded">
          Verified Match
        </span>
      </div>

      <!-- Submit Button & Overwrite Prompt -->
      <div class="flex items-center justify-between gap-4 pt-2">
        <div v-if="needsConfirm" class="text-xs text-amber-800 font-bold flex items-center gap-1.5 bg-amber-50 p-2 rounded-xl border border-amber-300">
          <span>⚠️</span>
          <span>Existing file has differences. Click "Upload Anyway" to replace it with this file.</span>
        </div>
        <div v-else></div>

        <button
          type="submit"
          :disabled="submitting || !store || !year || !month || !file || !!mismatchError"
          :class="[
            'px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all ml-auto disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer',
            mismatchError
              ? 'bg-slate-400 cursor-not-allowed'
              : needsConfirm
              ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20 ring-2 ring-amber-400/50'
              : 'bg-teal-600 hover:bg-teal-500 shadow-teal-600/20'
          ]"
        >
          {{ submitting ? 'Uploading…' : (needsConfirm ? 'Upload Anyway' : 'Upload CSV File') }}
        </button>
      </div>
    </form>

    <!-- High-Contrast Status Banner with Distinct Notification Types -->
    <div
      v-if="message"
      :class="[
        'mt-5 p-4 rounded-2xl border-2 text-sm leading-relaxed shadow-sm transition-all',
        messageClass
      ]"
    >
      <div class="flex items-start gap-3">
        <span class="text-xl shrink-0 leading-none mt-0.5">{{ messageIcon }}</span>
        <div class="flex-1">
          <h4 v-if="messageTitle" class="text-xs font-black uppercase tracking-wider mb-1">{{ messageTitle }}</h4>
          <p class="font-bold text-sm leading-snug">{{ message }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuditStore } from '../composables/useAuditStore.js'

const props = defineProps({
  stores: { type: Array, default: () => [] }
})

const emit = defineEmits(['uploaded'])

const { selectedStoreId } = useAuditStore()

// Strictly limit Birmas Outlet dropdown to Sudirman, Kuningan, and Kwitang
const ALLOWED_OUTLETS = [
  { store_id: 5, id: 'birmas-sudirman', name: 'Birmas Sudirman' },
  { store_id: 2, id: 'birmas-kuningan', name: 'Birmas Kuningan' },
  { store_id: 3, id: 'birmas-kwitang', name: 'Birmas Kwitang' },
]

const localStores = ref([])
const activeStores = computed(() => {
  return ALLOWED_OUTLETS
})

// Auto-select outlet matching selectedStoreId or first store
function syncDefaultStore() {
  if (!store.value && activeStores.value.length > 0) {
    const match = activeStores.value.find(s => s.id === selectedStoreId?.value || s.store_id === selectedStoreId?.value)
    if (match) {
      store.value = match.name
    } else {
      store.value = activeStores.value[0].name
    }
  }
}
watch(activeStores, syncDefaultStore, { immediate: true })
watch(() => selectedStoreId?.value, () => {
  if (selectedStoreId?.value && activeStores.value.length > 0) {
    const match = activeStores.value.find(s => s.id === selectedStoreId.value)
    if (match) store.value = match.name
  }
})

const autoDetectedTag = ref('')

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

const store = ref('Birmas Sudirman')
const year = ref(String(currentYear))
const month = ref('Januari')
const file = ref(null)
const fileInput = ref(null)
const fileContentSample = ref('')
const mismatchError = ref(null)
const lastDetected = ref(null)
const submitting = ref(false)
const message = ref('')
const messageTitle = ref('')
const messageIcon = ref('ℹ️')
const messageClass = ref('')
const needsConfirm = ref(false)
const isDragging = ref(false)

const isFileVerified = computed(() => {
  return !!(
    file.value &&
    !mismatchError.value &&
    lastDetected.value &&
    (lastDetected.value.detectedOutlet || lastDetected.value.detectedMonth)
  )
})

function setNotification(type, title, text) {
  message.value = text
  messageTitle.value = title
  if (type === 'error') {
    messageIcon.value = '❌'
    messageClass.value = 'bg-red-50 text-red-950 border-red-500 font-bold'
  } else if (type === 'warning') {
    messageIcon.value = '⚠️'
    messageClass.value = 'bg-amber-50 text-amber-950 border-amber-500 font-bold'
  } else if (type === 'info') {
    messageIcon.value = 'ℹ️'
    messageClass.value = 'bg-sky-50 text-sky-950 border-sky-500 font-bold'
  } else if (type === 'success') {
    messageIcon.value = '✅'
    messageClass.value = 'bg-emerald-50 text-emerald-950 border-emerald-500 font-bold'
  }
}

function stripStoreBrand(name) {
  if (!name) return ''
  return name.replace(/^birmas\s+/i, '').trim()
}

function triggerBrowse() {
  if (fileInput.value) {
    fileInput.value.click()
  }
}

function detectDelimiterClient(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const firstLines = clean.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 5)
  let commaCount = 0
  let semiCount = 0
  let tabCount = 0
  for (const line of firstLines) {
    commaCount += (line.match(/,/g) || []).length
    semiCount += (line.match(/;/g) || []).length
    tabCount += (line.match(/\t/g) || []).length
  }
  if (semiCount > commaCount && semiCount >= tabCount) return ';'
  if (tabCount > commaCount && tabCount > semiCount) return '\t'
  return ','
}

function validateAndAssignFile(selectedFile) {
  if (!selectedFile) return
  const fileName = selectedFile.name || ''
  if (!fileName.toLowerCase().endsWith('.csv')) {
    setNotification(
      'error',
      'File Type Must Be CSV',
      'Invalid file format. Strictly .csv files are supported (e.g. Log Auditor OL Sudirman 4 Agustus 2026.csv). Please upload a valid CSV file.'
    )
    clearFile()
    return
  }

  // Pre-validate CSV columns and content client-side
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const rawText = (e.target?.result || '').toString().trim()
      const text = rawText.replace(/^\uFEFF/, '')
      if (!text) {
        setNotification(
          'error',
          'Empty File',
          'Uploaded CSV file contains no data rows. Please ensure your audit CSV file is not empty.'
        )
        clearFile()
        return
      }
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
      if (lines.length < 2) {
        setNotification(
          'error',
          'Empty File',
          'Uploaded CSV file contains no data rows besides the header line.'
        )
        clearFile()
        return
      }

      const delimiter = detectDelimiterClient(text)
      let headerFound = false

      for (let i = 0; i < Math.min(lines.length, 15); i++) {
        const cols = lines[i].split(delimiter).map(col => col.replace(/^["']|["']$/g, '').trim().toLowerCase())
        const hasCategory = cols.some(c => c === 'category' || c.includes('category') || c.includes('kategori'))
        const hasCriteria = cols.some(c => c === 'criteria' || c.includes('criteria') || c.includes('kriteria') || c.includes('indikator') || c.includes('item'))
        const hasScore = cols.some(c => c === 'score' || c.includes('score') || c.includes('nilai') || c.includes('skor') || c.includes('poin') || c.includes('hasil'))

        if (hasCategory && (hasCriteria || hasScore)) {
          headerFound = true
          break
        }
      }

      if (!headerFound) {
        setNotification(
          'error',
          'File Structure Is Incorrect',
          'Data has different table format (failed to upload). Expected standard columns: Category (or Kategori), Criteria (or Kriteria), Score (or Nilai), Passing Grade (or Target).'
        )
        clearFile()
        return
      }

      file.value = selectedFile
      fileContentSample.value = text.slice(0, 4096)
      needsConfirm.value = false
      message.value = ''
      checkFileMatchWithInputs()
    } catch {
      file.value = selectedFile
      fileContentSample.value = ''
      needsConfirm.value = false
      message.value = ''
      checkFileMatchWithInputs()
    }
  }
  reader.onerror = () => {
    file.value = selectedFile
    fileContentSample.value = ''
    needsConfirm.value = false
    message.value = ''
    checkFileMatchWithInputs()
  }
  reader.readAsText(selectedFile.slice(0, 16384))
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

const OUTLET_KEYWORDS = [
  { key: 'sudirman', name: 'Sudirman', official: 'Birmas Sudirman' },
  { key: 'kuningan', name: 'Kuningan', official: 'Birmas Kuningan' },
  { key: 'kwitang', name: 'Kwitang', official: 'Birmas Kwitang' },
  { key: 'kelapa gading', name: 'Kelapa Gading', official: 'Birmas Kelapa Gading' },
  { key: 'gading', name: 'Kelapa Gading', official: 'Birmas Kelapa Gading' },
  { key: 'lebak bulus', name: 'Lebak Bulus', official: 'Birmas Lebak Bulus' },
  { key: 'bulus', name: 'Lebak Bulus', official: 'Birmas Lebak Bulus' },
  { key: 'tebet', name: 'Tebet', official: 'Birmas Tebet' },
  { key: 'nomadic', name: 'Nomadic', official: 'Birmas Nomadic (Bandung)' },
  { key: 'bandung', name: 'Nomadic', official: 'Birmas Nomadic (Bandung)' },
  { key: 'nusa dua', name: 'Nusa Dua', official: 'Birmas Nusa Dua (Bali)' },
  { key: 'nusadua', name: 'Nusa Dua', official: 'Birmas Nusa Dua (Bali)' },
  { key: 'bali', name: 'Nusa Dua', official: 'Birmas Nusa Dua (Bali)' },
]

const MONTH_MAP = {
  januari: 'Januari', january: 'Januari', jan: 'Januari',
  februari: 'Februari', february: 'Februari', feb: 'Februari',
  maret: 'Maret', march: 'Maret', mar: 'Maret',
  april: 'April', apr: 'April',
  mei: 'Mei', may: 'Mei',
  juni: 'Juni', june: 'Juni', jun: 'Juni',
  juli: 'Juli', july: 'Juli', jul: 'Juli',
  agustus: 'Agustus', august: 'Agustus', agu: 'Agustus', agt: 'Agustus', aug: 'Agustus',
  september: 'September', sep: 'September', sept: 'September',
  oktober: 'Oktober', october: 'Oktober', okt: 'Oktober', oct: 'Oktober',
  november: 'November', nov: 'November',
  desember: 'Desember', december: 'Desember', des: 'Desember', dec: 'Desember',
}

function extractOutletAndMonth(fileName, text = '') {
  const lowerName = (fileName || '').toLowerCase()
  const lowerText = (text || '').toLowerCase().slice(0, 4096)

  let detectedOutlet = null
  for (const item of OUTLET_KEYWORDS) {
    if (lowerName.includes(item.key)) {
      detectedOutlet = item
      break
    }
  }
  if (!detectedOutlet) {
    for (const item of OUTLET_KEYWORDS) {
      if (lowerText.includes(item.key)) {
        detectedOutlet = item
        break
      }
    }
  }

  let detectedMonth = null
  for (const [key, canonical] of Object.entries(MONTH_MAP)) {
    const regex = new RegExp(`(^|[^a-z0-9])${key}([^a-z0-9]|$)`, 'i')
    if (regex.test(lowerName)) {
      detectedMonth = canonical
      break
    }
  }
  if (!detectedMonth) {
    for (const [key, canonical] of Object.entries(MONTH_MAP)) {
      const regex = new RegExp(`(^|[^a-z0-9])${key}([^a-z0-9]|$)`, 'i')
      if (regex.test(lowerText)) {
        detectedMonth = canonical
        break
      }
    }
  }

  let detectedYear = null
  const yMatch = lowerName.match(/\b(202[4-9])\b/) || lowerText.match(/\b(202[4-9])\b/)
  if (yMatch) {
    detectedYear = yMatch[1]
  }

  return { detectedOutlet, detectedMonth, detectedYear }
}

function checkFileMatchWithInputs() {
  if (!file.value) {
    mismatchError.value = null
    lastDetected.value = null
    return
  }

  const detected = extractOutletAndMonth(file.value.name, fileContentSample.value)
  lastDetected.value = detected

  const selectedCleanStore = stripStoreBrand(store.value || '').toLowerCase().trim()
  const selectedCleanMonth = String(month.value || '').toLowerCase().trim()

  const detectedStoreKey = (detected.detectedOutlet?.name || '').toLowerCase()
  const detectedMonthKey = (detected.detectedMonth || '').toLowerCase()

  // 1. Check if the CSV file belongs to an unsupported outlet
  if (detected.detectedOutlet && !['sudirman', 'kuningan', 'kwitang'].includes(detectedStoreKey)) {
    mismatchError.value = {
      title: 'Unsupported Outlet in File',
      message: `The uploaded CSV file ("${file.value.name}") is for ${detected.detectedOutlet.name}. Only Sudirman, Kuningan, and Kwitang are supported.`,
      detected,
      canSync: false,
    }
    setNotification('error', mismatchError.value.title, mismatchError.value.message)
    return
  }

  // 2. Check outlet match
  const storeMismatch = detected.detectedOutlet && selectedCleanStore && (selectedCleanStore !== detectedStoreKey)

  // 3. Check month match
  const monthMismatch = detected.detectedMonth && selectedCleanMonth && (selectedCleanMonth !== detectedMonthKey)

  if (storeMismatch && monthMismatch) {
    mismatchError.value = {
      title: 'Outlet & Month Mismatch',
      message: `The uploaded CSV file ("${file.value.name}") is for ${detected.detectedOutlet.name} (${detected.detectedMonth}), but you selected ${stripStoreBrand(store.value)} (${month.value}). Please change your selection to match the file or upload the matching CSV file.`,
      detected,
      canSync: true,
    }
    setNotification('error', mismatchError.value.title, mismatchError.value.message)
    return
  }

  if (storeMismatch) {
    mismatchError.value = {
      title: 'Outlet Mismatch',
      message: `The uploaded CSV file ("${file.value.name}") is for ${detected.detectedOutlet.name}, but you selected ${stripStoreBrand(store.value)}. Please select Birmas ${detected.detectedOutlet.name} or upload the correct audit CSV file.`,
      detected,
      canSync: true,
    }
    setNotification('error', mismatchError.value.title, mismatchError.value.message)
    return
  }

  if (monthMismatch) {
    mismatchError.value = {
      title: 'Month Mismatch',
      message: `The uploaded CSV file ("${file.value.name}") is for ${detected.detectedMonth}, but you selected ${month.value}. Please select ${detected.detectedMonth} or upload the correct audit CSV file.`,
      detected,
      canSync: true,
    }
    setNotification('error', mismatchError.value.title, mismatchError.value.message)
    return
  }

  // File matches input perfectly
  mismatchError.value = null
  if (messageTitle.value.includes('Mismatch') || messageTitle.value.includes('Unsupported')) {
    message.value = ''
    messageTitle.value = ''
  }
}

// Watch user dropdown changes while a file is uploaded
watch([store, month], () => {
  if (file.value) {
    checkFileMatchWithInputs()
  }
})

function syncDropdownToFile() {
  if (!lastDetected.value) return
  if (lastDetected.value.detectedOutlet) {
    const matchedStore = activeStores.value.find(s =>
      s.name.toLowerCase().includes(lastDetected.value.detectedOutlet.name.toLowerCase())
    )
    if (matchedStore) {
      store.value = matchedStore.name
    }
  }
  if (lastDetected.value.detectedMonth) {
    month.value = lastDetected.value.detectedMonth
  }
  if (lastDetected.value.detectedYear) {
    year.value = String(lastDetected.value.detectedYear)
  }
  mismatchError.value = null
  message.value = ''
  messageTitle.value = ''
}

function clearFile() {
  file.value = null
  fileContentSample.value = ''
  mismatchError.value = null
  lastDetected.value = null
  if (fileInput.value) fileInput.value.value = ''
  needsConfirm.value = false
  autoDetectedTag.value = ''
  if (messageTitle.value.includes('Mismatch') || messageTitle.value.includes('Unsupported')) {
    message.value = ''
    messageTitle.value = ''
  }
}

onMounted(async () => {
  try {
    const [mRes, sRes] = await Promise.all([
      fetch('/api/months'),
      fetch('/api/stores')
    ])
    const mData = await mRes.json()
    if (Array.isArray(mData) && mData.length > 0) {
      months.value = mData
    }
    const sData = await sRes.json()
    if (Array.isArray(sData) && sData.length > 0) {
      localStores.value = sData
    }
  } catch (e) {
    // fallback default months and outlets
  }
})

async function submit() {
  if (mismatchError.value) {
    setNotification('error', mismatchError.value.title, mismatchError.value.message)
    return
  }
  if (!store.value || !year.value || !month.value || !file.value) {
    setNotification(
      'warning',
      'Incomplete Form',
      'Please select an outlet store, audit year, audit month, and choose a valid CSV file before uploading.'
    )
    return
  }
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
      const errMsg = (data && data.message) || `Upload failed with server status ${res.status}.`
      let title = 'Upload Failed'
      if (data?.errorType === 'OUTLET_MISMATCH') title = 'Outlet Mismatch'
      else if (data?.errorType === 'MONTH_MISMATCH') title = 'Month Mismatch'
      else if (data?.errorType === 'MISMATCH_INPUT') title = 'Outlet & Month Mismatch'
      else if (data?.errorType === 'UNSUPPORTED_OUTLET') title = 'Unsupported Outlet'
      else if (data?.errorType === 'INCORRECT_STRUCTURE') title = 'File Structure Is Incorrect'
      else if (data?.errorType === 'INVALID_FILE_TYPE') title = 'File Type Must Be CSV'
      else if (data?.errorType === 'EMPTY_FILE') title = 'Empty File'
      else if (data?.errorType === 'MISSING_FIELDS') title = 'Missing Required Fields'

      setNotification('error', title, errMsg)
      needsConfirm.value = false
    } else if (data.status === 'confirm_required') {
      setNotification(
        'warning',
        'File Already Exists',
        data.message || `File "${file.value?.name}" already exists for ${store.value} (${month.value} ${year.value}) with different data. Click "Upload Anyway" to replace it.`
      )
      needsConfirm.value = true
      submitting.value = false
      return
    } else if (data.status === 'success') {
      setNotification(
        'success',
        'Upload Successful',
        data.message || `Audit file successfully processed and stored for ${store.value} (${month.value} ${year.value})!`
      )
      needsConfirm.value = false
      clearFile()
      emit('uploaded')
    } else if (data.status === 'unchanged') {
      setNotification(
        'info',
        'File Already Exists',
        data.message || `File already exists: exact same audit records are already recorded for ${store.value} (${month.value} ${year.value}). No changes needed.`
      )
      needsConfirm.value = false
    } else {
      setNotification('error', 'Upload Failed', data.message || 'Data failed to upload.')
      needsConfirm.value = false
    }
  } catch (e) {
    setNotification('error', 'Network Connection Error', 'Upload failed due to network error. Please verify server connectivity and retry.')
    needsConfirm.value = false
  } finally {
    submitting.value = false
  }
}
</script>
