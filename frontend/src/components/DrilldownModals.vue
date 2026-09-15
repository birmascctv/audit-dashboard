<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    @keydown.esc="close"
  >
    <!-- Backdrop Overlay -->
    <div
      class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
      @click="close"
      aria-hidden="true"
    />

    <!-- Modal Container -->
    <div
      class="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 z-10"
      role="dialog"
      aria-modal="true"
    >
      <!-- Modal Header -->
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
        <div class="flex items-center gap-3">
          <StoreMascot v-if="selectedStoreId" :store="selectedStoreId" size="md" />
          <div v-else class="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-lg">
            🔍
          </div>
          <div>
            <h3 class="text-lg font-bold text-white leading-tight">
              Audit Notes & Infraction Drilldown
            </h3>
            <p class="text-xs text-slate-400">
              Inspect auditor comments, fail reasons, and itemized scores
            </p>
          </div>
        </div>
        <button
          type="button"
          @click="close"
          class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <span class="text-xl leading-none">✕</span>
        </button>
      </div>

      <!-- Controls & Filter Toolbar -->
      <div class="p-5 border-b border-slate-800/80 bg-slate-900/60 space-y-4">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <!-- Store Selector -->
          <div>
            <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Store Outlet
            </label>
            <select
              v-model="selectedStoreId"
              @change="fetchDrilldown"
              class="w-full px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-white text-xs font-medium focus:outline-none focus:border-blue-500"
            >
              <option v-for="s in stores" :key="s.store_id" :value="s.store_id">
                {{ getStoreMeta(s.store_id)?.emoji }} {{ stripStoreBrand(s.name) }} ({{ getStoreMeta(s.store_id)?.mascotName }})
              </option>
            </select>
          </div>

          <!-- Category Selector -->
          <div>
            <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Audit Category
            </label>
            <select
              v-model="selectedCategory"
              @change="fetchDrilldown"
              class="w-full px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-white text-xs font-medium focus:outline-none focus:border-blue-500"
            >
              <option v-for="c in categories" :key="c" :value="c">
                {{ c }}
              </option>
            </select>
          </div>

          <!-- Year Selector -->
          <div>
            <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Audit Year
            </label>
            <select
              v-model="selectedYear"
              @change="fetchDrilldown"
              class="w-full px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-white text-xs font-medium focus:outline-none focus:border-blue-500"
            >
              <option v-for="y in availableYears" :key="'drill-yr-' + y" :value="y">
                {{ y }}
              </option>
            </select>
          </div>

          <!-- Month Selector -->
          <div>
            <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Month
            </label>
            <select
              v-model="selectedMonth"
              @change="fetchDrilldown"
              class="w-full px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-white text-xs font-medium focus:outline-none focus:border-blue-500"
            >
              <option v-for="(m, idx) in monthNames" :key="'drill-m-' + idx" :value="idx + 1">
                {{ m }}
              </option>
            </select>
          </div>
        </div>

        <!-- Filter Pills & Search -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
          <!-- Status filter tabs -->
          <div class="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              @click="statusFilter = 'all'"
              class="px-2.5 py-1 rounded-md font-medium transition-colors"
              :class="statusFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'"
            >
              All ({{ items.length }})
            </button>
            <button
              type="button"
              @click="statusFilter = 'not_pass'"
              class="px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5"
              :class="statusFilter === 'not_pass' ? 'bg-rose-600 text-white' : 'text-rose-400 hover:text-rose-300'"
            >
              <span>Infractions Only</span>
              <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-950/80 border border-rose-800/60">
                {{ notPassCount }}
              </span>
            </button>
            <button
              type="button"
              @click="statusFilter = 'pass'"
              class="px-2.5 py-1 rounded-md font-medium transition-colors"
              :class="statusFilter === 'pass' ? 'bg-emerald-600 text-white' : 'text-emerald-400 hover:text-emerald-300'"
            >
              Passed ({{ passCount }})
            </button>
          </div>

          <!-- Keyword Search -->
          <div class="relative min-w-[200px] flex-1 sm:flex-initial">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search criteria or notes..."
              class="w-full pl-3 pr-8 py-1.5 rounded-lg bg-slate-950/70 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <span v-if="searchQuery" @click="searchQuery = ''" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer text-xs">✕</span>
          </div>
        </div>
      </div>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto p-5 min-h-[250px]">
        <!-- Loading State -->
        <div v-if="loading" class="flex flex-col items-center justify-center py-12 text-slate-400">
          <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p class="text-xs">Loading audit inspection records…</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="p-4 rounded-xl bg-rose-950/30 border border-rose-800 text-rose-300 text-xs">
          {{ error }}
        </div>

        <!-- Empty State -->
        <div v-else-if="filteredItems.length === 0" class="flex flex-col items-center justify-center py-12 text-center text-slate-500">
          <div class="text-3xl mb-2">📋</div>
          <p class="text-sm font-medium text-slate-400">No inspection records match the selection.</p>
          <p class="text-xs text-slate-500 mt-1">
            Try choosing a different store, month, or status filter.
          </p>
        </div>

        <!-- Items Table -->
        <div v-else class="space-y-2.5">
          <div
            v-for="(item, idx) in filteredItems"
            :key="'drill-' + idx"
            class="p-3.5 rounded-xl border transition-all"
            :class="isNotPass(item)
              ? 'bg-rose-950/20 border-rose-900/60 hover:border-rose-700/80'
              : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'"
          >
            <div class="flex items-start justify-between gap-3">
              <!-- Left: Criteria Name & Benchmark -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="text-sm font-semibold text-white">
                    {{ item.name }}
                  </h4>
                  <span
                    class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                    :class="isNotPass(item)
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'"
                  >
                    {{ item.pass_fail || (isNotPass(item) ? 'Not Pass' : 'Pass') }}
                  </span>
                </div>

                <div class="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  <span>Target Passing Grade: <strong class="text-emerald-400">{{ item.passing_grade ?? '—' }}</strong></span>
                  <span>•</span>
                  <span>Recorded Score: <strong :class="isNotPass(item) ? 'text-rose-400' : 'text-slate-200'">{{ item.score ?? 'None' }}</strong></span>
                </div>
              </div>

              <!-- Right: Score Badge -->
              <div
                class="w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold text-base flex-shrink-0"
                :class="isNotPass(item)
                  ? 'bg-rose-900/30 text-rose-300 border border-rose-700/50'
                  : 'bg-emerald-900/30 text-emerald-300 border border-emerald-700/50'"
              >
                <span>{{ item.score !== null && item.score !== undefined ? item.score : '—' }}</span>
                <span class="text-[9px] uppercase font-normal opacity-70">Score</span>
              </div>
            </div>

            <!-- Auditor Notes / Infraction Remark -->
            <div
              class="mt-2.5 pt-2.5 border-t text-xs flex items-start gap-2"
              :class="isNotPass(item) ? 'border-rose-900/40 text-rose-200' : 'border-slate-800 text-slate-300'"
            >
              <span class="text-sm select-none opacity-80" title="Auditor Observation">💬</span>
              <div class="flex-1">
                <span class="font-medium text-slate-400 mr-1">Auditor Remark:</span>
                <span :class="item.notes && item.notes !== '-' ? 'font-normal italic' : 'text-slate-500'">
                  {{ item.notes && item.notes !== '-' ? item.notes : 'No specific infraction note logged.' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Info & Summary -->
      <div class="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
        <div class="flex items-center gap-2">
          <span>Source: SQLite <code>scores</code> & <code>audits</code></span>
        </div>
        <button
          type="button"
          @click="close"
          class="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import StoreMascot from './StoreMascot.vue'
import { getStoreMeta, stripStoreBrand } from '../store-meta.js'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  stores: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  initialStoreId: { type: [Number, String], default: null },
  initialCategory: { type: String, default: null },
  initialYear: { type: [Number, String], default: 2026 },
  initialMonth: { type: [Number, String], default: 8 }
})

const emit = defineEmits(['close'])

const selectedStoreId = ref(null)
const selectedCategory = ref('')
const selectedYear = ref(2026)
const selectedMonth = ref(8)
const statusFilter = ref('all') // 'all', 'not_pass', 'pass'
const searchQuery = ref('')
const loading = ref(false)
const error = ref(null)
const items = ref([])

const availableYears = [2026, 2025]
const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

function isNotPass(item) {
  const status = String(item.pass_fail || '').toLowerCase()
  if (status.includes('not') || status.includes('fail')) return true
  if (item.passing_grade !== null && item.score !== null && item.score < item.passing_grade) return true
  return false
}

const notPassCount = computed(() => {
  return items.value.filter(isNotPass).length
})

const passCount = computed(() => {
  return items.value.length - notPassCount.value
})

const filteredItems = computed(() => {
  let list = items.value
  if (statusFilter.value === 'not_pass') {
    list = list.filter(isNotPass)
  } else if (statusFilter.value === 'pass') {
    list = list.filter(i => !isNotPass(i))
  }

  const q = String(searchQuery.value || '').trim().toLowerCase()
  if (q) {
    list = list.filter(i => {
      const name = String(i.name || '').toLowerCase()
      const notes = String(i.notes || '').toLowerCase()
      return name.includes(q) || notes.includes(q)
    })
  }
  return list
})

async function fetchDrilldown() {
  if (!selectedStoreId.value || !selectedCategory.value || !selectedYear.value || !selectedMonth.value) {
    return
  }
  loading.value = true
  error.value = null
  try {
    const params = new URLSearchParams({
      store: String(selectedStoreId.value),
      year: String(selectedYear.value),
      month: String(selectedMonth.value),
      category: String(selectedCategory.value)
    })
    const res = await fetch(`/api/drilldown?${params.toString()}`)
    if (!res.ok) throw new Error(`Server returned ${res.status}`)
    items.value = await res.json()
  } catch (err) {
    error.value = `Could not load drilldown data: ${err.message}`
    items.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.isOpen, (open) => {
  if (open) {
    selectedStoreId.value = props.initialStoreId || (props.stores.length ? props.stores[0].store_id : 1)
    selectedCategory.value = props.initialCategory || (props.categories.length ? props.categories[0] : 'Aplikasi')
    selectedYear.value = Number(props.initialYear) || 2026
    selectedMonth.value = Number(props.initialMonth) || 8
    fetchDrilldown()
  }
})

function close() {
  emit('close')
}
</script>
