<!-- UploadedFilesTable.vue: Full history table of all uploaded audit CSV files with timestamps -->
<template>
  <div class="uploaded-files-table-container rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6 text-slate-800">
    <!-- Action and Refresh Controls Toolbar -->
    <div class="flex items-center justify-between gap-4 pb-2 border-b border-slate-100">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-slate-700">Audit Archive</span>
        <span class="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
          {{ files.length }} Files Stored
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="fetchFiles"
          :disabled="loading"
          class="px-3.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          title="Refresh list"
        >
          <span :class="{ 'animate-spin': loading }">🔄</span>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- Backend service notice banner if /api/uploaded-files is not reachable -->
    <div
      v-if="fetchError"
      class="my-3 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
    >
      <div class="flex items-start gap-2.5">
        <span class="text-base leading-none">⚠️</span>
        <div>
          <span class="font-bold text-amber-800 block">Unable to fetch audit records from server</span>
          <span class="text-slate-600 block mt-0.5">
            {{ fetchError }}.
          </span>
        </div>
      </div>
      <button
        type="button"
        @click="fetchFiles"
        class="px-3 py-1.5 rounded-lg bg-amber-200/60 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer"
      >
        Retry
      </button>
    </div>

    <!-- Quick Stats Cards Row -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2.5 mb-3.5">
      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-xs">
        <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Audits</span>
        <span class="text-xl font-black text-slate-900 mt-1 block">{{ files.length }}</span>
        <span class="text-[10px] text-slate-500">CSV files imported</span>
      </div>

      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-xs">
        <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Outlets</span>
        <span class="text-xl font-black text-teal-700 mt-1 block">{{ uniqueStoresCount }}</span>
        <span class="text-[10px] text-slate-500">Birmas branches</span>
      </div>

      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-xs">
        <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Latest Upload</span>
        <span class="text-sm font-extrabold text-emerald-700 mt-1 block truncate" :title="latestUploadDate">
          {{ latestUploadDateRelative }}
        </span>
        <span class="text-[10px] text-slate-500 truncate block">{{ latestUploadDate }}</span>
      </div>

      <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-xs">
        <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Avg Pass Rate</span>
        <span class="text-xl font-black text-teal-800 mt-1 block">{{ averagePassRate }}%</span>
        <span class="text-[10px] text-slate-500">Across all audits</span>
      </div>
    </div>

    <!-- Search & Filter Controls Toolbar -->
    <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 mb-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-xs">
      <!-- Search input -->
      <div class="relative flex-1 min-w-[200px]">
        <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs">
          🔍
        </span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by file name, store, date, or year..."
          class="w-full pl-8 pr-8 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs placeholder:text-slate-400 focus:outline-none focus:border-teal-500 transition-colors shadow-xs"
        />
        <button
          v-if="searchQuery"
          type="button"
          @click="searchQuery = ''"
          class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 text-xs"
        >
          ✕
        </button>
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Store filter -->
        <select
          v-model="filterStore"
          class="px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none focus:border-teal-500 shadow-xs"
        >
          <option value="">All Stores</option>
          <option v-for="s in storeOptions" :key="s" :value="s">{{ s }}</option>
        </select>

        <!-- Year filter -->
        <select
          v-model="filterYear"
          class="px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none focus:border-teal-500 shadow-xs"
        >
          <option value="">All Years</option>
          <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
        </select>

        <!-- Month filter -->
        <select
          v-model="filterMonth"
          class="px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none focus:border-teal-500 shadow-xs"
        >
          <option value="">All Months</option>
          <option v-for="m in monthOptions" :key="m" :value="m">{{ m }}</option>
        </select>

        <!-- Page size -->
        <select
          v-model.number="pageSize"
          class="px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-xs font-semibold focus:outline-none focus:border-teal-500 shadow-xs"
          title="Rows per page"
        >
          <option :value="10">10 / page</option>
          <option :value="25">25 / page</option>
          <option :value="50">50 / page</option>
          <option :value="100">100 / page</option>
        </select>

        <button
          v-if="hasActiveFilters"
          type="button"
          @click="resetFilters"
          class="px-2.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition-colors cursor-pointer"
          title="Reset all filters"
        >
          Reset
        </button>
      </div>
    </div>

    <!-- Table Container -->
    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
      <table class="w-full text-left text-xs">
        <thead class="bg-slate-50 text-slate-700 uppercase tracking-wider text-[10px] font-extrabold border-b border-slate-200 select-none">
          <tr>
            <th scope="col" class="py-3 px-3 w-12 text-center text-slate-400">#</th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-slate-900" @click="sortBy('store_name')">
              <div class="flex items-center gap-1.5">
                <span>Outlet</span>
                <span v-if="sortField === 'store_name'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-slate-900" @click="sortBy('file_name')">
              <div class="flex items-center gap-1.5">
                <span>File Name</span>
                <span v-if="sortField === 'file_name'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-slate-900" @click="sortBy('audit_date')">
              <div class="flex items-center gap-1.5">
                <span>Inspection Date</span>
                <span v-if="sortField === 'audit_date'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-slate-900" @click="sortBy('timestamp')">
              <div class="flex items-center gap-1.5">
                <span>Uploaded Timestamp</span>
                <span v-if="sortField === 'timestamp'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-slate-900" @click="sortBy('file_size')">
              <div class="flex items-center gap-1.5">
                <span>File Size</span>
                <span v-if="sortField === 'file_size'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-slate-900" @click="sortBy('pass_rate')">
              <div class="flex items-center gap-1.5">
                <span>Pass Rate</span>
                <span v-if="sortField === 'pass_rate'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <!-- Loading State -->
          <tr v-if="loading">
            <td colspan="8" class="py-12 text-center text-slate-500">
              <div class="flex flex-col items-center justify-center gap-2">
                <div class="w-7 h-7 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                <span class="text-xs font-semibold">Loading uploaded CSV files...</span>
              </div>
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-else-if="!paginatedFiles.length">
            <td colspan="8" class="py-12 text-center text-slate-500">
              <div class="flex flex-col items-center justify-center gap-2">
                <span class="text-2xl">🔍</span>
                <span class="font-bold text-slate-700">No audit CSV files match your search criteria</span>
                <button
                  type="button"
                  @click="resetFilters"
                  class="mt-2 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200 text-xs font-bold hover:bg-teal-100 transition-colors"
                >
                  Clear search and filters
                </button>
              </div>
            </td>
          </tr>

          <!-- Data Rows -->
          <tr
            v-for="(f, idx) in paginatedFiles"
            :key="f.audit_id"
            class="hover:bg-slate-50/80 transition-colors group"
          >
            <!-- Index -->
            <td class="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
              {{ (currentPage - 1) * pageSize + idx + 1 }}
            </td>

            <!-- Store / Outlet -->
            <td class="py-3 px-3">
              <div class="flex items-center gap-2.5">
                <StoreMascot :store="f.store_id" size="sm" class="flex-shrink-0" />
                <div class="flex flex-col min-w-0">
                  <span class="font-bold text-slate-900 text-xs truncate">
                    {{ stripStoreBrand(f.store_name) }}
                  </span>
                  <span class="text-[10px] text-slate-500 font-mono">
                    {{ f.month_name }} {{ f.year }}
                  </span>
                </div>
              </div>
            </td>

            <!-- File Name -->
            <td class="py-3 px-3">
              <span class="text-xs font-mono font-bold text-slate-800 group-hover:text-teal-700 transition-colors truncate max-w-[260px] sm:max-w-xs block" :title="f.file_name">
                {{ f.file_name }}
              </span>
            </td>

            <!-- Inspection Date -->
            <td class="py-3 px-3 whitespace-nowrap">
              <span class="text-xs font-semibold text-slate-700">
                {{ f.audit_date }}
              </span>
            </td>

            <!-- Upload Timestamp -->
            <td class="py-3 px-3 whitespace-nowrap">
              <div class="flex flex-col" :title="f.timestamp">
                <span class="text-xs font-mono font-medium text-slate-800">
                  {{ formatTimestamp(f.timestamp) }}
                </span>
                <span class="text-[10px] text-slate-400 font-sans">
                  {{ formatRelativeTime(f.timestamp) }}
                </span>
              </div>
            </td>

            <!-- File Size -->
            <td class="py-3 px-3 whitespace-nowrap">
              <span class="text-xs font-mono text-slate-600">
                {{ formatFileSize(f.file_size) }}
              </span>
            </td>

            <!-- Pass Rate & Score Metric -->
            <td class="py-3 px-3 whitespace-nowrap">
              <div class="flex items-center gap-2">
                <span
                  v-if="f.pass_rate !== null"
                  class="px-2 py-0.5 rounded-md text-xs font-extrabold border"
                  :class="getPassRateBadgeClass(f.pass_rate)"
                >
                  {{ f.pass_rate }}%
                </span>
                <span v-else class="text-xs text-slate-400 font-mono">—</span>

                <span v-if="f.total_criteria" class="text-[10px] text-slate-500 font-mono">
                  ({{ f.passed_count }}/{{ f.not_null_count || f.total_criteria }})
                </span>
              </div>
            </td>

            <!-- Action: Download CSV -->
            <td class="py-3 px-3 text-right whitespace-nowrap">
              <button
                type="button"
                @click="downloadAuditFile(f)"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition-all hover:scale-105 shadow-xs cursor-pointer"
                title="Download this CSV file"
              >
                <span>⬇️</span>
                <span>Download</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination & Results Count Footer -->
    <div class="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-3 border-t border-slate-200">
      <div>
        Showing
        <span class="font-bold text-slate-900">{{ filteredFiles.length ? (currentPage - 1) * pageSize + 1 : 0 }}</span>
        to
        <span class="font-bold text-slate-900">{{ Math.min(currentPage * pageSize, filteredFiles.length) }}</span>
        of
        <span class="font-bold text-slate-900">{{ filteredFiles.length }}</span>
        records
        <span v-if="filteredFiles.length !== files.length" class="text-slate-400">
          (filtered from {{ files.length }} total)
        </span>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          @click="currentPage = 1"
          :disabled="currentPage === 1"
          class="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-xs"
          title="First page"
        >
          ««
        </button>
        <button
          type="button"
          @click="currentPage--"
          :disabled="currentPage === 1"
          class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-xs font-semibold"
        >
          Previous
        </button>

        <span class="px-3 py-1.5 font-mono font-bold text-slate-800 bg-slate-50 rounded-lg border border-slate-200">
          Page {{ currentPage }} / {{ totalPages || 1 }}
        </span>

        <button
          type="button"
          @click="currentPage++"
          :disabled="currentPage >= totalPages"
          class="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-xs font-semibold"
        >
          Next
        </button>
        <button
          type="button"
          @click="currentPage = totalPages"
          :disabled="currentPage >= totalPages"
          class="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-xs"
          title="Last page"
        >
          »»
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import StoreMascot from './StoreMascot.vue'
import { stripStoreBrand } from '../store-meta.js'

const props = defineProps({
  refreshKey: {
    type: Number,
    default: 0
  }
})

const files = ref([])
const allStoresList = ref([])
const loading = ref(false)
const fetchError = ref('')

const searchQuery = ref('')
const filterStore = ref('')
const filterYear = ref('')
const filterMonth = ref('')

// Default sort: newest to oldest inspection date
const sortField = ref('audit_date')
const sortAsc = ref(false)

const currentPage = ref(1)
const pageSize = ref(10)

const INDO_MONTH_MAP = {
  januari: 0, jan: 0,
  februari: 1, feb: 1,
  maret: 2, mar: 2,
  april: 3, apr: 3,
  mei: 4, may: 4,
  juni: 5, jun: 5,
  juli: 6, jul: 6,
  agustus: 7, agu: 7, aug: 7,
  september: 8, sep: 8,
  oktober: 9, okt: 9, oct: 9,
  november: 10, nov: 10,
  desember: 11, des: 11, dec: 11
}

function parseInspectionDateToTimestamp(item) {
  if (!item) return 0
  const rawDate = String(item.audit_date || item.file_name || '').toLowerCase()
  const match = rawDate.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i)
  if (match) {
    const day = parseInt(match[1], 10)
    const mName = match[2].toLowerCase()
    const year = parseInt(match[3], 10)
    const month = INDO_MONTH_MAP[mName] !== undefined ? INDO_MONTH_MAP[mName] : (parseInt(item.month, 10) - 1 || 0)
    return new Date(Date.UTC(year, month, day)).getTime()
  }
  if (item.year && item.month) {
    const y = parseInt(item.year, 10)
    const m = parseInt(item.month, 10) - 1
    return new Date(Date.UTC(y, m, 1)).getTime()
  }
  if (item.timestamp) {
    return new Date(item.timestamp).getTime() || 0
  }
  return 0
}

async function fetchFiles() {
  loading.value = true
  fetchError.value = ''
  try {
    const res = await fetch('/api/uploaded-files')
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('API endpoint /api/uploaded-files returned 404 Not Found')
      }
      throw new Error(`Server returned HTTP ${res.status}`)
    }
    const data = await res.json()
    const list = Array.isArray(data) ? data : (Array.isArray(data?.files) ? data.files : [])
    files.value = list
    fetchError.value = ''
  } catch (err) {
    console.error('Failed to load uploaded files list:', err)
    fetchError.value = err.message || 'Failed to fetch uploaded files'
  } finally {
    loading.value = false
  }
}

watch(() => props.refreshKey, () => {
  fetchFiles()
})

onMounted(async () => {
  fetchFiles()
  try {
    const res = await fetch('/api/stores')
    if (res.ok) {
      allStoresList.value = await res.json()
    }
  } catch (_) {}
})

// Store, Year, and Month filter options
const storeOptions = computed(() => {
  const set = new Set()
  files.value.forEach(f => {
    if (f.store_name) set.add(stripStoreBrand(f.store_name))
  })
  if (Array.isArray(allStoresList.value)) {
    allStoresList.value.forEach(s => {
      if (s.name) set.add(stripStoreBrand(s.name))
    })
  }
  if (set.size === 0) {
    ;['Kelapa Gading', 'Kuningan', 'Kwitang', 'Lebak Bulus', 'Sudirman', 'Tebet'].forEach(n => set.add(n))
  }
  return Array.from(set).sort()
})

const yearOptions = computed(() => {
  const set = new Set()
  files.value.forEach(f => {
    if (f.year) set.add(f.year)
  })
  return Array.from(set).sort((a, b) => b - a)
})

const monthOptions = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

const hasActiveFilters = computed(() => {
  return !!(searchQuery.value || filterStore.value || filterYear.value || filterMonth.value)
})

function resetFilters() {
  searchQuery.value = ''
  filterStore.value = ''
  filterYear.value = ''
  filterMonth.value = ''
  currentPage.value = 1
}

// Quick stats
const uniqueStoresCount = computed(() => {
  return new Set(files.value.map(f => f.store_id)).size
})

const latestUploadDate = computed(() => {
  if (!files.value.length) return '—'
  const sorted = [...files.value].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return formatTimestamp(sorted[0].timestamp)
})

const latestUploadDateRelative = computed(() => {
  if (!files.value.length) return '—'
  const sorted = [...files.value].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  return formatRelativeTime(sorted[0].timestamp)
})

const averagePassRate = computed(() => {
  const valid = files.value.filter(f => f.pass_rate !== null && f.pass_rate !== undefined).map(f => f.pass_rate)
  if (!valid.length) return '—'
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length
  return avg.toFixed(1)
})

// Filtering & Sorting
const filteredFiles = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  const st = filterStore.value.toLowerCase().trim()
  const yr = filterYear.value ? String(filterYear.value) : ''
  const mo = filterMonth.value.toLowerCase().trim()

  return files.value.filter(f => {
    if (st && stripStoreBrand(f.store_name).toLowerCase() !== st) return false
    if (yr && String(f.year) !== yr) return false
    if (mo && String(f.month_name).toLowerCase() !== mo) return false

    if (q) {
      const matchFile = (f.file_name || '').toLowerCase().includes(q)
      const matchStore = (f.store_name || '').toLowerCase().includes(q)
      const matchDate = (f.audit_date || '').toLowerCase().includes(q)
      const matchYear = String(f.year || '').includes(q)
      const matchMonth = (f.month_name || '').toLowerCase().includes(q)
      if (!matchFile && !matchStore && !matchDate && !matchYear && !matchMonth) {
        return false
      }
    }

    return true
  }).sort((a, b) => {
    let valA = a[sortField.value]
    let valB = b[sortField.value]

    if (sortField.value === 'audit_date' || sortField.value === 'timestamp') {
      valA = parseInspectionDateToTimestamp(a)
      valB = parseInspectionDateToTimestamp(b)
    } else if (sortField.value === 'file_size' || sortField.value === 'pass_rate') {
      valA = valA ?? -1
      valB = valB ?? -1
    } else {
      valA = String(valA || '').toLowerCase()
      valB = String(valB || '').toLowerCase()
    }

    if (valA < valB) return sortAsc.value ? -1 : 1
    if (valA > valB) return sortAsc.value ? 1 : -1
    return 0
  })
})

const totalPages = computed(() => {
  return Math.ceil(filteredFiles.value.length / pageSize.value) || 1
})

const paginatedFiles = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredFiles.value.slice(start, start + pageSize.value)
})

watch([searchQuery, filterStore, filterYear, filterMonth, pageSize], () => {
  currentPage.value = 1
})

function sortBy(field) {
  if (sortField.value === field) {
    sortAsc.value = !sortAsc.value
  } else {
    sortField.value = field
    sortAsc.value = field === 'store_name' || field === 'file_name'
  }
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '—'
  if (bytes < 1024) return bytes + ' B'
  const kb = bytes / 1024
  if (kb < 1024) return kb.toFixed(1) + ' KB'
  const mb = kb / 1024
  return mb.toFixed(2) + ' MB'
}

function formatTimestamp(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch (e) {
    return iso
  }
}

function formatRelativeTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffSec = Math.floor((now - d) / 1000)

    if (diffSec < 60) return 'Just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mins ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`
    if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)} days ago`
    return `${Math.floor(diffSec / 2592000)} months ago`
  } catch (e) {
    return ''
  }
}

function getPassRateBadgeClass(rate) {
  if (rate >= 80) {
    return 'bg-emerald-50 text-emerald-800 border-emerald-300'
  }
  if (rate >= 65) {
    return 'bg-amber-50 text-amber-800 border-amber-300'
  }
  return 'bg-rose-50 text-rose-800 border-rose-300'
}

async function downloadAuditFile(f) {
  try {
    const res = await fetch(`/api/download-audit-file?audit_id=${f.audit_id}`);
    if (!res.ok) throw new Error('File download failed');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = f.file_name || `Audit_${f.store_name}_${f.year}_${f.month_name}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (err) {
    window.location.href = `/api/download-audit-file?audit_id=${f.audit_id}`;
  }
}
</script>

<style scoped>
.uploaded-files-table-container {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
