<!-- UploadedFilesTable.vue: Full history table of all uploaded audit CSV files with timestamps -->
<template>
  <div class="uploaded-files-table-container rounded-2xl bg-slate-900 border border-slate-700/80 shadow-xl p-5 sm:p-6 text-slate-100">
    <!-- Header with Live Stats -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
      <div>
        <div class="flex items-center gap-2.5">
          <span class="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 text-base font-bold shadow-sm">
            📁
          </span>
          <div>
            <h3 class="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
              Uploaded CSV Files History
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-blue-300 border border-blue-500/30">
                {{ files.length }} Total
              </span>
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">
              Comprehensive log of audit records stored in SQLite and on disk with exact timestamps
            </p>
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          @click="fetchFiles"
          :disabled="loading"
          class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
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
      class="my-4 p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md"
    >
      <div class="flex items-start gap-2.5">
        <span class="text-base leading-none">⚠️</span>
        <div>
          <span class="font-bold text-amber-300 block">Unable to fetch audit records from server</span>
          <span class="text-slate-300 block mt-0.5">
            {{ fetchError }}. If you just updated files or ran <code>npm run build</code>, remember to restart your Python/Flask backend service (e.g. <code>systemctl restart audit-dashboard</code> or restart gunicorn/app.py) so the new API route is loaded.
          </span>
        </div>
      </div>
      <button
        type="button"
        @click="fetchFiles"
        class="px-3 py-1.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/40 border border-amber-500/40 text-amber-200 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
      >
        Retry
      </button>
    </div>

    <!-- Quick Stats Cards Row -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
      <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Audits</span>
        <span class="text-xl font-black text-white mt-1 block">{{ files.length }}</span>
        <span class="text-[10px] text-slate-500">CSV files imported</span>
      </div>

      <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Outlets</span>
        <span class="text-xl font-black text-blue-400 mt-1 block">{{ uniqueStoresCount }}</span>
        <span class="text-[10px] text-slate-500">Birmas branches</span>
      </div>

      <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Latest Upload</span>
        <span class="text-sm font-bold text-emerald-400 mt-1 block truncate" :title="latestUploadDate">
          {{ latestUploadDateRelative }}
        </span>
        <span class="text-[10px] text-slate-500 truncate block">{{ latestUploadDate }}</span>
      </div>

      <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
        <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Avg Pass Rate</span>
        <span class="text-xl font-black text-purple-400 mt-1 block">{{ averagePassRate }}%</span>
        <span class="text-[10px] text-slate-500">Across all audits</span>
      </div>
    </div>

    <!-- Search & Filter Controls Toolbar -->
    <div class="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 mb-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
      <!-- Search input -->
      <div class="relative flex-1 min-w-[200px]">
        <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs">
          🔍
        </span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by file name, store, date, or year..."
          class="w-full pl-8 pr-8 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          v-if="searchQuery"
          type="button"
          @click="searchQuery = ''"
          class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-500 hover:text-slate-300 text-xs"
        >
          ✕
        </button>
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Store filter -->
        <select
          v-model="filterStore"
          class="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium focus:outline-none focus:border-blue-500 shadow-sm"
        >
          <option value="">All Stores</option>
          <option v-for="s in storeOptions" :key="s" :value="s">{{ s }}</option>
        </select>

        <!-- Year filter -->
        <select
          v-model="filterYear"
          class="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium focus:outline-none focus:border-blue-500 shadow-sm"
        >
          <option value="">All Years</option>
          <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
        </select>

        <!-- Month filter -->
        <select
          v-model="filterMonth"
          class="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium focus:outline-none focus:border-blue-500 shadow-sm"
        >
          <option value="">All Months</option>
          <option v-for="m in monthOptions" :key="m" :value="m">{{ m }}</option>
        </select>

        <!-- Page size -->
        <select
          v-model.number="pageSize"
          class="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-medium focus:outline-none focus:border-blue-500 shadow-sm"
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
          class="px-2.5 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-xs font-medium transition-colors cursor-pointer"
          title="Reset all filters"
        >
          Reset
        </button>
      </div>
    </div>

    <!-- Table Container -->
    <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/50">
      <table class="w-full text-left text-xs">
        <thead class="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[10px] font-bold border-b border-slate-800 select-none">
          <tr>
            <th scope="col" class="py-3 px-3 w-12 text-center">#</th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-white" @click="sortBy('store_name')">
              <div class="flex items-center gap-1.5">
                <span>Outlet</span>
                <span v-if="sortField === 'store_name'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-white" @click="sortBy('file_name')">
              <div class="flex items-center gap-1.5">
                <span>File Name</span>
                <span v-if="sortField === 'file_name'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-white" @click="sortBy('audit_date')">
              <div class="flex items-center gap-1.5">
                <span>Inspection Date</span>
                <span v-if="sortField === 'audit_date'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-white" @click="sortBy('timestamp')">
              <div class="flex items-center gap-1.5">
                <span>Uploaded Timestamp</span>
                <span v-if="sortField === 'timestamp'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-white" @click="sortBy('file_size')">
              <div class="flex items-center gap-1.5">
                <span>File Size</span>
                <span v-if="sortField === 'file_size'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 cursor-pointer hover:text-white" @click="sortBy('pass_rate')">
              <div class="flex items-center gap-1.5">
                <span>Pass Rate</span>
                <span v-if="sortField === 'pass_rate'">{{ sortAsc ? '▲' : '▼' }}</span>
              </div>
            </th>
            <th scope="col" class="py-3 px-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/80">
          <!-- Loading State -->
          <tr v-if="loading">
            <td colspan="8" class="py-12 text-center text-slate-400">
              <div class="flex flex-col items-center justify-center gap-2">
                <div class="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span class="text-xs">Loading uploaded CSV files...</span>
              </div>
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-else-if="!paginatedFiles.length">
            <td colspan="8" class="py-12 text-center text-slate-400">
              <div class="flex flex-col items-center justify-center gap-2">
                <span class="text-2xl">🔍</span>
                <span class="font-semibold text-slate-300">No audit CSV files match your search criteria</span>
                <button
                  type="button"
                  @click="resetFilters"
                  class="mt-2 px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs hover:bg-blue-600/30 transition-colors"
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
            class="hover:bg-slate-900/60 transition-colors group"
          >
            <!-- Index -->
            <td class="py-3 px-3 text-center text-slate-500 font-mono text-[11px]">
              {{ (currentPage - 1) * pageSize + idx + 1 }}
            </td>

            <!-- Store / Outlet -->
            <td class="py-3 px-3">
              <div class="flex items-center gap-2.5">
                <StoreMascot :store="f.store_id" size="sm" class="flex-shrink-0" />
                <div class="flex flex-col min-w-0">
                  <span class="font-bold text-white text-xs truncate">
                    {{ stripStoreBrand(f.store_name) }}
                  </span>
                  <span class="text-[10px] text-slate-400 font-mono">
                    {{ f.month_name }} {{ f.year }}
                  </span>
                </div>
              </div>
            </td>

            <!-- File Name -->
            <td class="py-3 px-3">
              <div class="flex items-center gap-2">
                <span class="text-xs font-mono font-semibold text-slate-200 group-hover:text-blue-300 transition-colors truncate max-w-[260px] sm:max-w-xs" :title="f.file_name">
                  {{ f.file_name }}
                </span>
                <span class="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  CSV
                </span>
              </div>
            </td>

            <!-- Inspection Date -->
            <td class="py-3 px-3 whitespace-nowrap">
              <span class="text-xs font-medium text-slate-300">
                {{ f.audit_date }}
              </span>
            </td>

            <!-- Upload Timestamp -->
            <td class="py-3 px-3 whitespace-nowrap">
              <div class="flex flex-col" :title="f.timestamp">
                <span class="text-xs font-mono font-medium text-slate-200">
                  {{ formatTimestamp(f.timestamp) }}
                </span>
                <span class="text-[10px] text-slate-500 font-sans">
                  {{ formatRelativeTime(f.timestamp) }}
                </span>
              </div>
            </td>

            <!-- File Size -->
            <td class="py-3 px-3 whitespace-nowrap">
              <span class="text-xs font-mono text-slate-300">
                {{ formatFileSize(f.file_size) }}
              </span>
            </td>

            <!-- Pass Rate & Score Metric -->
            <td class="py-3 px-3 whitespace-nowrap">
              <div class="flex items-center gap-2">
                <span
                  v-if="f.pass_rate !== null"
                  class="px-2 py-0.5 rounded-md text-xs font-black border"
                  :class="getPassRateBadgeClass(f.pass_rate)"
                >
                  {{ f.pass_rate }}%
                </span>
                <span v-else class="text-xs text-slate-500 font-mono">—</span>

                <span v-if="f.total_criteria" class="text-[10px] text-slate-400 font-mono">
                  ({{ f.passed_count }}/{{ f.not_null_count || f.total_criteria }})
                </span>
              </div>
            </td>

            <!-- Action: Download CSV -->
            <td class="py-3 px-3 text-right whitespace-nowrap">
              <a
                :href="'/api/download-audit-file?audit_id=' + f.audit_id"
                download
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold transition-all hover:scale-105"
                title="Download this CSV file"
              >
                <span>⬇️</span>
                <span>Download</span>
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination & Results Count Footer -->
    <div class="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 pt-3 border-t border-slate-800">
      <div>
        Showing
        <span class="font-bold text-white">{{ filteredFiles.length ? (currentPage - 1) * pageSize + 1 : 0 }}</span>
        to
        <span class="font-bold text-white">{{ Math.min(currentPage * pageSize, filteredFiles.length) }}</span>
        of
        <span class="font-bold text-white">{{ filteredFiles.length }}</span>
        records
        <span v-if="filteredFiles.length !== files.length" class="text-slate-500">
          (filtered from {{ files.length }} total)
        </span>
      </div>

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          @click="currentPage = 1"
          :disabled="currentPage === 1"
          class="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
          title="First page"
        >
          ««
        </button>
        <button
          type="button"
          @click="currentPage--"
          :disabled="currentPage === 1"
          class="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
        >
          Previous
        </button>

        <span class="px-3 py-1.5 font-mono font-bold text-slate-200 bg-slate-950 rounded-lg border border-slate-800">
          Page {{ currentPage }} / {{ totalPages || 1 }}
        </span>

        <button
          type="button"
          @click="currentPage++"
          :disabled="currentPage >= totalPages"
          class="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
        >
          Next
        </button>
        <button
          type="button"
          @click="currentPage = totalPages"
          :disabled="currentPage >= totalPages"
          class="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
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
  refreshKey: { type: [Number, String], default: 0 }
})

const files = ref([])
const loading = ref(false)
const fetchError = ref('')

const searchQuery = ref('')
const filterStore = ref('')
const filterYear = ref('')
const filterMonth = ref('')

const sortField = ref('timestamp')
const sortAsc = ref(false)

const currentPage = ref(1)
const pageSize = ref(10)

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
    if (Array.isArray(data)) {
      files.value = data
      fetchError.value = ''
    } else {
      files.value = []
    }
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

onMounted(() => {
  fetchFiles()
})

// Store, Year, and Month filter options
const storeOptions = computed(() => {
  const set = new Set()
  files.value.forEach(f => {
    if (f.store_name) set.add(stripStoreBrand(f.store_name))
  })
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

    if (sortField.value === 'timestamp') {
      valA = new Date(valA || 0).getTime()
      valB = new Date(valB || 0).getTime()
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
    return 'bg-emerald-950/60 text-emerald-400 border-emerald-700/50'
  }
  if (rate >= 65) {
    return 'bg-amber-950/60 text-amber-300 border-amber-700/50'
  }
  return 'bg-rose-950/60 text-rose-400 border-rose-700/50'
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
