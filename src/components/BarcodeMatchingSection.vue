<script setup lang="ts">
import { ref, computed } from 'vue';
import { WordPressProductItem } from '../types/inventory';
import { useAuditStore } from '../composables/useAuditStore';
import {
  Barcode,
  Link,
  Plus,
  Check,
  Building2,
  Sparkles,
  Search,
  Trash2,
  Edit2,
  RefreshCw,
  Server,
  Layers,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ScanLine
} from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    initialBarcode?: string;
    isOpenDefault?: boolean;
  }>(),
  {
    initialBarcode: '',
    isOpenDefault: true,
  }
);

const emit = defineEmits<{
  (e: 'matched', barcode: string): void;
  (e: 'testScan', barcode: string): void;
}>();

const {
  stores,
  wpProducts,
  matchNewBarcode,
  removeBarcodeMatch,
  selectedStoreId,
  currentStore,
} = useAuditStore();

const isSectionOpen = ref(props.isOpenDefault);
const mode = ref<'link_existing' | 'create_new'>('link_existing');

const barcode = ref(props.initialBarcode);
const selectedWpId = ref('');
const brand = ref('Kulturale');
const customBrand = ref('');
const varian = ref('');
const sku = ref('');
const price = ref<number>(35000);

// Stock across 4 Birmas stores
const storeStocks = ref<Record<string, number>>({
  'birmas-kuningan': 24,
  'birmas-kwitang': 20,
  'birmas-lebak-bulus': 18,
  'birmas-sudirman': 24,
});

const isSubmitting = ref(false);
const errorMsg = ref('');
const successMsg = ref('');
const lastMatchedBarcode = ref('');

// Filter search inside mapped list
const searchMapped = ref('');

const selectedWpProduct = computed(() => {
  return wpProducts.value.find((p) => p.id === selectedWpId.value);
});

function handleSelectExistingProduct(p: WordPressProductItem) {
  selectedWpId.value = p.id;
  brand.value = p.brand;
  varian.value = p.varian;
  sku.value = p.sku || '';
  if (p.stockByStore) {
    storeStocks.value = { ...p.stockByStore };
  }
}

async function handleSaveBarcode() {
  errorMsg.value = '';
  successMsg.value = '';

  const cleanBarcode = barcode.value.trim();
  if (!cleanBarcode) {
    errorMsg.value = 'Please scan with Cashcow HC-710C or enter a barcode.';
    return;
  }

  let finalBrand = brand.value === 'Other' ? customBrand.value.trim() : brand.value;
  let finalVarian = varian.value.trim();

  if (mode.value === 'link_existing') {
    if (!selectedWpProduct.value) {
      errorMsg.value = 'Please select a WordPress product from the list to link.';
      return;
    }
    finalBrand = selectedWpProduct.value.brand;
    finalVarian = selectedWpProduct.value.varian;
  } else {
    if (!finalBrand) {
      errorMsg.value = 'Please enter a brand name.';
      return;
    }
    if (!finalVarian) {
      errorMsg.value = 'Please enter a variant name.';
      return;
    }
  }

  isSubmitting.value = true;
  try {
    const res = await matchNewBarcode({
      barcode: cleanBarcode,
      brand: finalBrand,
      varian: finalVarian,
      wpProductId: selectedWpId.value || undefined,
      sku: sku.value.trim() || undefined,
      stockByStore: storeStocks.value,
    });

    successMsg.value = res.message;
    lastMatchedBarcode.value = cleanBarcode;
    emit('matched', cleanBarcode);

    // Reset inputs
    barcode.value = '';
    varian.value = '';
    selectedWpId.value = '';
  } catch (err: any) {
    errorMsg.value = err.message || 'Failed to match barcode on backend';
  } finally {
    isSubmitting.value = false;
  }
}

async function handleRemoveBarcode(bCode: string) {
  if (confirm(`Remove barcode ${bCode} from system catalog?`)) {
    await removeBarcodeMatch(bCode);
  }
}

const filteredProducts = computed(() => {
  if (!searchMapped.value) return wpProducts.value;
  const q = searchMapped.value.toLowerCase().trim();
  return wpProducts.value.filter(
    (p) =>
      p.barcode.includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.varian.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q))
  );
});

defineExpose({
  setBarcode(newBarcode: string) {
    barcode.value = newBarcode;
    isSectionOpen.value = true;
  },
});
</script>

<template>
  <section
    id="barcode-match-section"
    class="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden transition-all"
  >
    <!-- Section Header Bar with Toggle -->
    <div
      class="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer select-none"
      @click="isSectionOpen = !isSectionOpen"
    >
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
          <Link class="w-5 h-5" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-base font-bold text-white tracking-tight">
              Match Barcode with WordPress & ESB
            </h3>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono">
              Backend Saved
            </span>
          </div>
          <p class="text-xs text-slate-400 mt-0.5">
            Link physical barcodes (Cashcow HC-710C scans) to WordPress/ESB product variants across Birmas stores.
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2" @click.stop>
        <span class="text-xs font-mono text-slate-400 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800">
          {{ wpProducts.length }} Barcodes Mapped
        </span>
        <button
          @click="isSectionOpen = !isSectionOpen"
          type="button"
          class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-colors"
        >
          <ChevronDown
            class="w-4 h-4 transition-transform duration-200"
            :class="isSectionOpen ? 'rotate-180' : ''"
          />
        </button>
      </div>
    </div>

    <!-- Collapsible Body -->
    <div v-show="isSectionOpen" class="p-5 space-y-6">
      <!-- Input Card -->
      <div class="bg-slate-950/90 border border-slate-800 rounded-xl p-5 shadow-inner">
        <!-- Mode Tabs -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
          <div class="flex items-center gap-2">
            <button
              type="button"
              @click="mode = 'link_existing'"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              :class="
                mode === 'link_existing'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              "
            >
              <Link class="w-3.5 h-3.5" />
              <span>Link to WordPress Product</span>
            </button>
            <button
              type="button"
              @click="mode = 'create_new'"
              class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
              :class="
                mode === 'create_new'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              "
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Create New SKU / Variant</span>
            </button>
          </div>

          <span class="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Server class="w-3 h-3 text-emerald-400" />
            <span>Persists into server database JSON</span>
          </span>
        </div>

        <form @submit.prevent="handleSaveBarcode" class="space-y-4 text-xs">
          <!-- Step 1: Barcode Input -->
          <div>
            <label class="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
              <span class="flex items-center gap-1.5">
                <Barcode class="w-3.5 h-3.5 text-cyan-400" />
                <span>Physical Barcode (Cashcow HC-710C Scanner or Manual Input):</span>
              </span>
              <span class="text-[10px] text-cyan-400 font-normal">Scan can or type digits</span>
            </label>
            <div class="relative">
              <input
                v-model="barcode"
                type="text"
                placeholder="e.g. 8997026800122 (Scan bottle with Cashcow HC-710C)"
                class="w-full pl-3 pr-24 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
              />
              <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono border border-slate-700">
                EAN-13
              </span>
            </div>
          </div>

          <!-- Mode A: Select existing WordPress Product -->
          <div v-if="mode === 'link_existing'" class="space-y-3">
            <label class="block text-slate-300 font-semibold">
              Select WordPress / ESB Product to Link:
            </label>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1">
              <button
                v-for="p in wpProducts"
                :key="p.id"
                type="button"
                @click="handleSelectExistingProduct(p)"
                class="p-2.5 rounded-xl border text-left transition-all flex items-center justify-between group"
                :class="
                  selectedWpId === p.id
                    ? 'bg-cyan-950/60 border-cyan-400 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                "
              >
                <div>
                  <span class="font-bold block text-xs group-hover:text-cyan-300">
                    {{ p.brand }} {{ p.varian }}
                  </span>
                  <span class="text-[10px] text-slate-500 font-mono">
                    WP: {{ p.id }} • {{ p.barcode }}
                  </span>
                </div>
                <Check v-if="selectedWpId === p.id" class="w-4 h-4 text-cyan-400 shrink-0" />
              </button>
            </div>
          </div>

          <!-- Mode B: New Product Fields -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-slate-300 font-medium mb-1">Brand:</label>
              <select
                v-model="brand"
                class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-medium focus:outline-none focus:border-cyan-400"
              >
                <option value="Kulturale">Kulturale</option>
                <option value="Albens">Albens</option>
                <option value="Other">Other (Custom Brand)</option>
              </select>
            </div>

            <div v-if="brand === 'Other'">
              <label class="block text-slate-300 font-medium mb-1">Brand Name:</label>
              <input
                v-model="customBrand"
                type="text"
                placeholder="Brand Name"
                class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label class="block text-slate-300 font-medium mb-1">Variant Name:</label>
              <input
                v-model="varian"
                type="text"
                placeholder="e.g. Peach, Ginger Beer, Stout"
                class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label class="block text-slate-300 font-medium mb-1">SKU / Item Code:</label>
              <input
                v-model="sku"
                type="text"
                placeholder="e.g. KULT-PCH-24"
                class="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <!-- Step 3: Expected Stock across 4 Birmas Stores -->
          <div class="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800">
            <div class="flex items-center justify-between mb-2">
              <span class="font-bold text-white text-xs flex items-center gap-1.5">
                <Building2 class="w-3.5 h-3.5 text-cyan-400" />
                <span>Expected Baseline Stock across Birmas Stores:</span>
              </span>
              <span class="text-[10px] text-slate-400">Target stock for physical audit comparison</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div
                v-for="s in stores"
                :key="s.id"
                class="bg-slate-950 p-2 rounded-lg border border-slate-800"
              >
                <label class="block text-[11px] font-semibold text-slate-300 truncate mb-1">
                  {{ s.name.replace('Birmas ', '') }}
                </label>
                <div class="flex items-center gap-1">
                  <input
                    v-model.number="storeStocks[s.id]"
                    type="number"
                    min="0"
                    max="999"
                    class="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-center text-white font-mono font-bold text-xs focus:outline-none focus:border-cyan-400"
                  />
                  <span class="text-[10px] text-slate-500">cans</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Submit Button & Messages -->
          <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div class="flex items-center gap-2">
              <button
                type="submit"
                :disabled="isSubmitting"
                class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
              >
                <Link class="w-4 h-4" />
                <span>{{ isSubmitting ? 'Linking...' : 'Save & Link Barcode to WordPress' }}</span>
              </button>
            </div>

            <!-- Feedback -->
            <div v-if="successMsg" class="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
              <CheckCircle2 class="w-4 h-4 shrink-0" />
              <span>{{ successMsg }}</span>
              <button
                v-if="lastMatchedBarcode"
                type="button"
                @click="emit('testScan', lastMatchedBarcode)"
                class="ml-2 px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 text-[10px] font-bold hover:bg-emerald-900 transition-colors"
              >
                Simulate Scan (+1)
              </button>
            </div>

            <div v-if="errorMsg" class="text-xs text-rose-400 font-medium flex items-center gap-1.5">
              <AlertTriangle class="w-4 h-4 shrink-0" />
              <span>{{ errorMsg }}</span>
            </div>
          </div>
        </form>
      </div>

      <!-- Mapped Barcodes List Table -->
      <div>
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div class="flex items-center gap-2">
            <h4 class="text-xs font-bold text-white uppercase tracking-wider">
              Currently Matched Barcodes in Backend Database
            </h4>
            <span class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono">
              {{ wpProducts.length }} Total
            </span>
          </div>

          <!-- Search filter -->
          <div class="relative w-full sm:w-64">
            <Search class="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              v-model="searchMapped"
              type="text"
              placeholder="Search barcode or variant..."
              class="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-800">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-950 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <th class="py-2.5 px-3">Kode Barcode</th>
                <th class="py-2.5 px-3">Brand</th>
                <th class="py-2.5 px-3">Varian</th>
                <th class="py-2.5 px-3">SKU / WP ID</th>
                <th class="py-2.5 px-2 text-center">Kuningan</th>
                <th class="py-2.5 px-2 text-center">Kwitang</th>
                <th class="py-2.5 px-2 text-center">Lebak Bulus</th>
                <th class="py-2.5 px-2 text-center">Sudirman</th>
                <th class="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 bg-slate-900/50">
              <tr
                v-for="p in filteredProducts"
                :key="p.barcode"
                class="hover:bg-slate-800/40 transition-colors"
              >
                <!-- Barcode -->
                <td class="py-2.5 px-3 font-mono font-bold text-cyan-300">
                  <div class="flex items-center gap-1.5">
                    <Barcode class="w-3.5 h-3.5 text-slate-500" />
                    <span>{{ p.barcode }}</span>
                  </div>
                </td>

                <!-- Brand -->
                <td class="py-2.5 px-3 text-slate-200 font-medium">
                  {{ p.brand }}
                </td>

                <!-- Varian -->
                <td class="py-2.5 px-3 text-white font-bold">
                  {{ p.varian }}
                </td>

                <!-- SKU / ID -->
                <td class="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                  {{ p.sku || p.id }}
                </td>

                <!-- Kuningan -->
                <td class="py-2.5 px-2 text-center font-mono font-bold text-slate-300">
                  {{ p.stockByStore?.['birmas-kuningan'] ?? 0 }}
                </td>

                <!-- Kwitang -->
                <td class="py-2.5 px-2 text-center font-mono font-bold text-slate-300">
                  {{ p.stockByStore?.['birmas-kwitang'] ?? 0 }}
                </td>

                <!-- Lebak Bulus -->
                <td class="py-2.5 px-2 text-center font-mono font-bold text-slate-300">
                  {{ p.stockByStore?.['birmas-lebak-bulus'] ?? 0 }}
                </td>

                <!-- Sudirman -->
                <td class="py-2.5 px-2 text-center font-mono font-bold text-slate-300">
                  {{ p.stockByStore?.['birmas-sudirman'] ?? 0 }}
                </td>

                <!-- Actions -->
                <td class="py-2.5 px-3 text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      @click="emit('testScan', p.barcode)"
                      class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold transition-colors"
                      title="Test scan this barcode (+1 count)"
                    >
                      +1 Scan
                    </button>
                    <button
                      type="button"
                      @click="handleRemoveBarcode(p.barcode)"
                      class="p-1 rounded bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition-colors"
                      title="Remove barcode mapping"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>

              <tr v-if="filteredProducts.length === 0">
                <td colspan="9" class="py-6 text-center text-slate-500 italic text-xs">
                  No barcodes match "{{ searchMapped }}".
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>
