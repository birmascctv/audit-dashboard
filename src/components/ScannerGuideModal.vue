<script setup>
import { ref } from 'vue';
import {
  X,
  Barcode,
  CheckCircle2,
  Cpu,
  Keyboard,
  Settings,
  HelpCircle,
  Languages
} from 'lucide-vue-next';

defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close']);

const testScannedValue = ref('');
const testScanHistory = ref([]);
const activeLanguage = ref('all');

function handleTestKeydown(e) {
  if (e.key === 'Enter' && testScannedValue.value.trim()) {
    testScanHistory.value.unshift(testScannedValue.value.trim());
    testScannedValue.value = '';
    e.preventDefault();
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      <!-- Modal Header -->
      <div class="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-600 flex items-center justify-center">
            <Barcode class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">
              Barcode Scanner Tips / Panduan Pemindai Barcode
            </h3>
            <p class="text-xs text-slate-500">
              Dual Language Guide (English & Bahasa Indonesia)
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- Language filter pill -->
          <div class="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-[11px] font-semibold">
            <button
              @click="activeLanguage = 'all'"
              type="button"
              class="px-2 py-0.5 rounded transition-colors"
              :class="activeLanguage === 'all' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-slate-950'"
            >
              Both
            </button>
            <button
              @click="activeLanguage = 'id'"
              type="button"
              class="px-2 py-0.5 rounded transition-colors"
              :class="activeLanguage === 'id' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-slate-950'"
            >
              ID
            </button>
            <button
              @click="activeLanguage = 'en'"
              type="button"
              class="px-2 py-0.5 rounded transition-colors"
              :class="activeLanguage === 'en' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-slate-950'"
            >
              EN
            </button>
          </div>

          <button
            @click="emit('close')"
            class="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-5 text-sm text-slate-700">
        <!-- Tip 1: How scanner works -->
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <h4 class="font-bold text-slate-900 text-xs sm:text-sm mb-2 flex items-center gap-2">
            <Cpu class="w-4 h-4 text-teal-600" />
            <span>1. How the Barcode Scanner Works / Cara Kerja Pemindai Barcode</span>
          </h4>

          <div v-if="activeLanguage === 'all' || activeLanguage === 'en'" class="space-y-1 text-xs text-slate-600">
            <p class="font-semibold text-slate-800">English:</p>
            <p>
              Your USB or wireless barcode scanner functions as a standard <strong>Keyboard (HID)</strong>. When aimed at a can/bottle barcode (e.g. <code>8997026800122</code>), it instantly types all digits followed by an automatic <strong>Enter</strong> key in less than 50 milliseconds.
            </p>
          </div>

          <div v-if="activeLanguage === 'all' || activeLanguage === 'id'" class="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-1 text-xs text-slate-600">
            <p class="font-semibold text-teal-700">Bahasa Indonesia:</p>
            <p>
              Pemindai barcode USB atau nirkabel Anda bekerja seperti <strong>Keyboard (HID)</strong>. Saat diarahkan ke barcode botol/kaleng (contoh: <code>8997026800122</code>), pemindai akan langsung mengetikkan seluruh digit angka diikuti tombol <strong>Enter</strong> secara otomatis dalam sekejap.
            </p>
          </div>
        </div>

        <!-- Tip 2: Hands-Free Auto Counting -->
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <h4 class="font-bold text-slate-900 text-xs sm:text-sm mb-2 flex items-center gap-2">
            <Keyboard class="w-4 h-4 text-teal-600" />
            <span>2. Hands-Free Scanning / Pemindaian Bebas Klik (Otomatis)</span>
          </h4>

          <div v-if="activeLanguage === 'all' || activeLanguage === 'en'" class="space-y-1 text-xs text-slate-600">
            <p class="font-semibold text-slate-800">English:</p>
            <p>
              You do <strong>not</strong> need to click the search bar for every item. As long as this web page is open, any barcode scanned is automatically intercepted by the background listener, tallying +1 bottle and saving to the backend database.
            </p>
          </div>

          <div v-if="activeLanguage === 'all' || activeLanguage === 'id'" class="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-1 text-xs text-slate-600">
            <p class="font-semibold text-teal-700">Bahasa Indonesia:</p>
            <p>
              Anda <strong>tidak perlu mengklik</strong> kolom input setiap kali memindai. Cukup buka halaman audit ini, dan setiap barcode yang dipindai akan langsung ditangkap otomatis, menambah hitungan +1 produk, dan langsung tersimpan ke backend database.
            </p>
          </div>
        </div>

        <!-- Tip 3: Live Hardware Test Bench -->
        <div class="bg-teal-50/50 p-4 rounded-xl border border-teal-200">
          <h4 class="font-bold text-teal-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Barcode class="w-4 h-4 text-teal-600" />
            <span>Interactive Scanner Test / Uji Coba Pemindai Langsung</span>
          </h4>
          <p class="text-xs text-slate-600 mb-2">
            <strong>EN:</strong> Aim scanner at any barcode to test reading • 
            <strong class="text-teal-700">ID:</strong> Arahkan scanner ke barcode apa pun untuk menguji pembacaan:
          </p>
          <input
            v-model="testScannedValue"
            @keydown="handleTestKeydown"
            type="text"
            placeholder="Scan test barcode here / Pindai barcode uji coba di sini..."
            class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          <div v-if="testScanHistory.length > 0" class="mt-3">
            <span class="text-[11px] text-slate-500 font-semibold">Received Scans / Hasil Pindaian:</span>
            <div class="flex flex-wrap gap-2 mt-1">
              <span
                v-for="(code, idx) in testScanHistory.slice(0, 5)"
                :key="idx"
                class="px-2 py-0.5 rounded bg-white border border-teal-300 text-teal-800 font-mono text-xs flex items-center gap-1 shadow-sm"
              >
                <CheckCircle2 class="w-3 h-3 text-teal-600" />
                {{ code }}
              </span>
            </div>
          </div>
        </div>

        <!-- Tip 4: Troubleshooting -->
        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <h4 class="font-bold text-slate-900 text-xs sm:text-sm mb-2 flex items-center gap-2">
            <Settings class="w-4 h-4 text-amber-600" />
            <span>3. Troubleshooting & Suffix / Pemecahan Masalah & Suffix Enter</span>
          </h4>

          <div v-if="activeLanguage === 'all' || activeLanguage === 'en'" class="space-y-1 text-xs text-slate-600">
            <p class="font-semibold text-slate-800">English:</p>
            <ul class="list-disc list-inside space-y-1">
              <li><strong>If scanner doesn't press Enter:</strong> In your scanner's manual sheet, scan the setup barcode labeled <em>"Add CR/LF Suffix"</em> or <em>"Add Enter Suffix"</em> once.</li>
              <li><strong>Accidental double scan:</strong> Click the minus button (-) in the Scanned Table to decrease 1 bottle.</li>
            </ul>
          </div>

          <div v-if="activeLanguage === 'all' || activeLanguage === 'id'" class="mt-2.5 pt-2.5 border-t border-slate-200/80 space-y-1 text-xs text-slate-600">
            <p class="font-semibold text-teal-700">Bahasa Indonesia:</p>
            <ul class="list-disc list-inside space-y-1">
              <li><strong>Jika scanner tidak otomatis menekan Enter:</strong> Pada lembar manual pemindai Anda, pindai barcode konfigurasi bertuliskan <em>"Add CR/LF Suffix"</em> atau <em>"Add Enter Suffix"</em> satu kali.</li>
              <li><strong>Jika tidak sengaja terpindai dua kali:</strong> Cukup klik tombol minus (-) pada tabel produk terpindai untuk mengurangi 1 botol.</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
        <button
          @click="emit('close')"
          type="button"
          class="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm transition-colors"
        >
          Tutup / Close Guide
        </button>
      </div>
    </div>
  </div>
</template>
