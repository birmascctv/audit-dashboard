<script setup>
import { ref, computed, watch, nextTick } from 'vue';
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
const barcodeInputEl = ref(null);
const searchInputEl = ref(null);
const isClearing = ref(false);

async function clearBarcode() {
  const prod = selectedProduct.value;
  if (!prod || !hasRealBarcode(prod)) return;
  isClearing.value = true;
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(prod.id)}/barcode`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed');
    prod.barcode = '';
    try { localStorage.setItem('birmas_products', JSON.stringify(wpProducts.value)); } catch (_) {}
    feedbackMessage.value = { type: 'success', text: `Barcode removed from "${prod.productTitle || prod.varian}".` };
  } catch (err) {
    feedbackMessage.value = { type: 'error', text: err.message || 'Network error' };
  } finally {
    isClearing.value = false;
  }
}

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

// Check if product has an actively assigned valid barcode
function hasRealBarcode(prod) {
  if (!prod || !prod.barcode) return false;
  const b = String(prod.barcode).trim();
  return b !== '' && b !== '-' && !b.startsWith('STK');
}

watch(
  () => props.prefilledBarcode,
  (newVal) => {
    if (newVal) barcodeInput.value = newVal;
  },
  { immediate: true }
);

const showList = ref(false);
const highlightIdx = ref(0);

function onSearchInput() {
  selectedProductId.value = '';
  highlightIdx.value = 0;
  showList.value = true;
}

function pickProduct(p) {
  if (!p) return;
  selectedProductId.value = p.id;
  productSearchQuery.value = p.productTitle || p.varian || '';
  showList.value = false;
  nextTick(() => {
    barcodeInputEl.value?.focus();
    barcodeInputEl.value?.select();
  });
}

function onSearchKeydown(e) {
  const n = filteredProductList.value.length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    showList.value = true;
    highlightIdx.value = Math.min(highlightIdx.value + 1, n - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightIdx.value = Math.max(highlightIdx.value - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (showList.value) pickProduct(filteredProductList.value[highlightIdx.value]);
    else if (selectedProductId.value) barcodeInputEl.value?.focus();
  } else if (e.key === 'Escape') {
    showList.value = false;
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      barcodeInput.value = props.prefilledBarcode || '';
      productSearchQuery.value = '';
      selectedProductId.value = '';
      showList.value = false;
      feedbackMessage.value = null;
      nextTick(() => searchInputEl.value?.focus());
    } else {
      barcodeInput.value = '';
      productSearchQuery.value = '';
    }
  }
);

async function handleSubmit() {
  feedbackMessage.value = null;
  const cleanBarcode = barcodeInput.value.trim();

  if (!cleanBarcode) {
    feedbackMessage.value = { type: 'error', text: 'Please enter or scan a barcode!' };
    return;
  }

  if (!selectedProduct.value) {
    feedbackMessage.value = { type: 'error', text: 'Please select a product variant!' };
    return;
  }

  isSubmitting.value = true;
  try {
    const payload = {
      wpId: selectedProduct.value.id,
      productId: selectedProduct.value.id,
      barcode: cleanBarcode,
      sku: selectedProduct.value.sku,
      brand: selectedProduct.value.brand || 'Birmas',
      varian: selectedProduct.value.varian || selectedProduct.value.productTitle,
      productTitle: selectedProduct.value.productTitle || selectedProduct.value.varian,
      packageType: selectedProduct.value.packageType || 'Kaleng',
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
      barcodeInput.value = '';
      productSearchQuery.value = '';
      selectedProductId.value = '';
      await nextTick();
      searchInputEl.value?.focus();
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
    <div class="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full text-slate-800">
      <!-- Modal Header -->
      <div class="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 rounded-t-3xl">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
            <Barcode class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">
              {{ hasRealBarcode(selectedProduct) ? 'Change Barcode' : 'Add New Barcode' }}
            </h3>
            <p class="text-xs text-slate-500">
              {{ hasRealBarcode(selectedProduct) ? 'Replace the barcode currently linked to this product' : 'Assign scanned barcode to a product variant' }}
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
            ref="barcodeInputEl"
            v-model="barcodeInput"
            @keydown.enter.prevent="handleSubmit"
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

        <!-- 2. Choose Product Variant -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
          <div class="flex items-center justify-between">
            <label class="block text-slate-900 font-bold text-xs flex items-center gap-1.5">
              <Package class="w-4 h-4 text-teal-600" />
              <span>Choose Product Variant:</span>
            </label>
            <span class="text-[10px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              {{ esbProductList.length }} Products
            </span>
          </div>

          <!-- Search + dropdown in one box -->
          <div class="relative">
            <Search class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref="searchInputEl"
              v-model="productSearchQuery"
              @input="onSearchInput"
              @focus="$event.target.select(); showList = true"
              @blur="showList = false"
              @keydown="onSearchKeydown"
              type="text"
              autocomplete="off"
              placeholder="Type to search product variant (e.g. Bintang, Coca Cola, Canard)..."
              class="w-full pl-8 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 placeholder:font-normal focus:outline-none focus:border-teal-500 shadow-sm"
            />
            <ul
              v-if="showList"
              class="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto overscroll-contain bg-white border border-slate-300 rounded-xl shadow-lg text-xs"
            >
              <li v-if="filteredProductList.length === 0" class="px-3 py-2 text-slate-400">No matching product</li>
              <li
                v-for="(p, i) in filteredProductList"
                :key="p.id"
                @mousedown.prevent="pickProduct(p)"
                @mouseenter="highlightIdx = i"
                class="h-8 px-3 flex items-center cursor-pointer font-semibold text-slate-800 truncate"
                :class="i === highlightIdx ? 'bg-teal-50 text-teal-900' : ''"
              >
                {{ p.productTitle || p.varian }}
              </li>
            </ul>
          </div>

          <!-- Selected Product Info Card -->
          <div v-if="selectedProduct" class="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-500 font-medium">Variant / Name:</span>
              <span class="font-bold text-slate-900">{{ selectedProduct.productTitle || selectedProduct.varian }}</span>
            </div>
            <div v-if="selectedProduct.category" class="flex items-center justify-between text-xs">
              <span class="text-slate-500 font-medium">Category:</span>
              <span class="font-semibold text-slate-700">{{ selectedProduct.category }}</span>
            </div>
            <div class="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
              <span class="text-slate-500 font-medium">Current Registered Barcode:</span>
              <span class="flex items-center gap-1.5">
                <span class="font-mono text-xs font-bold" :class="hasRealBarcode(selectedProduct) ? 'text-teal-700' : 'text-slate-400 font-normal'">
                  {{ hasRealBarcode(selectedProduct) ? selectedProduct.barcode : '-' }}
                </span>
                <button
                  v-if="hasRealBarcode(selectedProduct)"
                  type="button"
                  @click="barcodeInput = selectedProduct.barcode"
                  class="text-[10px] text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-1.5 py-0.5 rounded font-bold"
                  title="Fill the field above with the current barcode so you can edit it"
                >
                  Edit
                </button>
                <button
                  v-if="hasRealBarcode(selectedProduct)"
                  type="button"
                  :disabled="isClearing"
                  @click="clearBarcode"
                  class="text-[10px] text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-1.5 py-0.5 rounded font-bold"
                  title="Remove the barcode from this product (it will be counted manually)"
                >
                  Remove
                </button>
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
            <span>{{ isSubmitting ? 'Saving Barcode...' : (hasRealBarcode(selectedProduct) ? 'Save New Barcode' : 'Save Barcode') }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
