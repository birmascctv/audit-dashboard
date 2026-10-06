<script setup>
import { ref, computed, watch } from 'vue';
import { useAuditStore } from '../composables/useAuditStore.js';
import {
  Barcode,
  CheckCircle2,
  AlertTriangle,
  X,
  Package,
  Layers,
  Sparkles,
  Search,
  Check
} from 'lucide-vue-next';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  prefilledBarcode: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['close', 'barcodeAdded']);

const { wpProducts, addNewBarcode } = useAuditStore();

const barcodeInput = ref('');
const selectedProductId = ref('');
const isSubmitting = ref(false);
const feedbackMessage = ref(null);
const productSearchQuery = ref('');

// Dynamic products from ESB Cloud
const esbProductList = computed(() => {
  if (!wpProducts.value || wpProducts.value.length === 0) return [];
  return [...wpProducts.value].sort((a, b) =>
    (a.productTitle || a.varian || '').localeCompare(b.productTitle || b.varian || '')
  );
});

// Filtered options based on search filter
const filteredProductList = computed(() => {
  if (!productSearchQuery.value.trim()) return esbProductList.value;
  const q = productSearchQuery.value.toLowerCase().trim();
  return esbProductList.value.filter(
    (p) =>
      (p.productTitle && p.productTitle.toLowerCase().includes(q)) ||
      (p.varian && p.varian.toLowerCase().includes(q)) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
  );
});

// Currently chosen product object
const selectedProduct = computed(() => {
  if (!selectedProductId.value) return null;
  return esbProductList.value.find((p) => p.id === selectedProductId.value) || null;
});

watch(
  () => props.prefilledBarcode,
  (newVal) => {
    if (newVal) barcodeInput.value = newVal;
  },
  { immediate: true }
);

watch(
  esbProductList,
  (list) => {
    if (list && list.length > 0 && !selectedProductId.value) {
      selectedProductId.value = list[0].id;
    }
  },
  { immediate: true }
);

async function handleSubmit() {
  feedbackMessage.value = null;
  const cleanBarcode = barcodeInput.value.trim();

  if (!cleanBarcode) {
    feedbackMessage.value = { type: 'error', text: 'Please enter or scan a barcode!' };
    return;
  }

  if (!selectedProduct.value) {
    feedbackMessage.value = { type: 'error', text: 'Please select an ESB product variant!' };
    return;
  }

  isSubmitting.value = true;
  try {
    const payload = {
      wpId: selectedProduct.value.id,
      productId: selectedProduct.value.id,
      barcode: cleanBarcode,
      sku: selectedProduct.value.sku,
      brand: selectedProduct.value.brand,
      varian: selectedProduct.value.varian,
      productTitle: selectedProduct.value.productTitle || `${selectedProduct.value.brand} ${selectedProduct.value.varian}`,
      packageType: selectedProduct.value.packageType || 'Botol',
      volume: selectedProduct.value.volume || 330,
      unitVolume: selectedProduct.value.unitVolume || 'ml',
      price: selectedProduct.value.price || 0,
      stockByStore: selectedProduct.value.stockByStore || {},
    };

    const res = await addNewBarcode(payload);
    if (res.success) {
      feedbackMessage.value = {
        type: 'success',
        text: `Barcode ${cleanBarcode} linked to "${payload.productTitle}"! Future physical scans will match immediately.`,
      };
      emit('barcodeAdded', cleanBarcode);
      setTimeout(() => {
        emit('close');
        feedbackMessage.value = null;
      }, 1200);
    } else {
      feedbackMessage.value = { type: 'error', text: res.message || 'Failed to save barcode' };
    }
  } catch (err) {
    feedbackMessage.value = { type: 'error', text: err.message || 'Network error' };
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
  >
    <div class="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden text-slate-800">
      <!-- Modal Header -->
      <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
            <Barcode class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Add New Barcode</h3>
            <p class="text-xs text-slate-500">
              Assign scanned barcode to an ESB product variant
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          type="button"
          class="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Form Body -->
      <form @submit.prevent="handleSubmit" class="p-6 space-y-4 text-xs text-slate-700">
        <!-- 1. Barcode Field (Scan or Type) -->
        <div class="bg-teal-50/60 border border-teal-200 p-4 rounded-2xl">
          <label class="block text-teal-900 font-bold mb-1.5 flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <Barcode class="w-4 h-4 text-teal-700" />
              <span>Kode Barcode:</span>
            </span>
            <span class="text-[10px] text-teal-800 bg-teal-100 px-2 py-0.5 rounded font-mono font-bold">
              Scanner Ready
            </span>
          </label>
          <input
            v-model="barcodeInput"
            type="text"
            required
            autofocus
            placeholder="Scan bottle barcode (e.g. 8997026800122)"
            class="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-base font-bold placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          <p class="text-[11px] text-slate-500 mt-1">
            * Aim scanner at the bottle or manually enter the number under the barcode.
          </p>
        </div>

        <!-- 2. Choose ESB Product Variant -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
          <div class="flex items-center justify-between">
            <label class="block text-slate-900 font-bold text-xs flex items-center gap-1.5">
              <Package class="w-4 h-4 text-teal-600" />
              <span>Choose ESB Product Variant:</span>
            </label>
            <span class="text-[10px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              {{ esbProductList.length }} Products in ESB
            </span>
          </div>

          <!-- Quick Search Filter for Product Dropdown -->
          <div class="relative">
            <Search class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              v-model="productSearchQuery"
              type="text"
              placeholder="Filter by name (e.g. Bintang, Coca Cola, Canard)..."
              class="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500"
            />
          </div>

          <select
            v-model="selectedProductId"
            required
            class="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-xs font-semibold focus:outline-none focus:border-teal-500 cursor-pointer shadow-sm"
          >
            <option
              v-for="p in filteredProductList"
              :key="p.id"
              :value="p.id"
            >
              {{ p.productTitle || p.varian }} • {{ p.packageType }} {{ p.volume }}{{ p.unitVolume }} • Rp {{ (p.price || 0).toLocaleString() }}
            </option>
          </select>

          <!-- Selected Product Info Card (Read-only, automatically set according to ESB) -->
          <div v-if="selectedProduct" class="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-500 font-medium">Brand:</span>
              <span class="font-bold text-slate-900">{{ selectedProduct.brand || 'Birmas' }}</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-500 font-medium">Variant / Name:</span>
              <span class="font-bold text-slate-900">{{ selectedProduct.productTitle || selectedProduct.varian }}</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-500 font-medium">Packaging & Volume:</span>
              <span class="font-semibold text-slate-800">{{ selectedProduct.packageType }} • {{ selectedProduct.volume }}{{ selectedProduct.unitVolume }}</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-500 font-medium">ESB Retail Price:</span>
              <span class="font-bold text-teal-800">Rp {{ (selectedProduct.price || 0).toLocaleString() }}</span>
            </div>
            <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
              <span class="text-slate-500 font-medium">Current Registered Barcode:</span>
              <span class="font-mono text-xs font-bold" :class="selectedProduct.barcode ? 'text-teal-700' : 'text-slate-400 italic'">
                {{ selectedProduct.barcode || 'None (Unassigned)' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Feedback Message -->
        <div
          v-if="feedbackMessage"
          class="p-3 rounded-xl text-xs flex items-center gap-2"
          :class="feedbackMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'"
        >
          <component :is="feedbackMessage.type === 'success' ? CheckCircle2 : AlertTriangle" class="w-4 h-4 shrink-0" />
          <span>{{ feedbackMessage.text }}</span>
        </div>

        <!-- Footer Actions -->
        <div class="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            @click="emit('close')"
            type="button"
            class="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            :disabled="isSubmitting"
            class="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Check class="w-4 h-4" />
            <span>{{ isSubmitting ? 'Saving Barcode...' : 'Save Barcode' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
