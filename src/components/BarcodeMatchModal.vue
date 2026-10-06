<script setup lang="ts">
import { ref, computed } from 'vue';
import { WordPressProductItem, StoreLocation } from '../types/inventory';
import { useAuditStore } from '../composables/useAuditStore';
import {
  Barcode,
  Link,
  Plus,
  X,
  Check,
  Globe,
  Building2,
  Sparkles,
  Search,
  AlertCircle
} from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  prefilledBarcode?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'matched', barcode: string): void;
}>();

const { stores, wpProducts, matchNewBarcode } = useAuditStore();

// Mode: 'link_existing' (link barcode to a product already in WordPress) or 'create_new'
const mode = ref<'link_existing' | 'create_new'>('link_existing');

const barcode = ref(props.prefilledBarcode || '');
const selectedWpId = ref('');
const brand = ref('Kulturale');
const customBrand = ref('');
const varian = ref('');
const sku = ref('');

// Stock per store inputs
const storeStocks = ref<Record<string, number>>({
  'birmas-kuningan': 24,
  'birmas-kwitang': 20,
  'birmas-lebak-bulus': 18,
  'birmas-sudirman': 24,
});

const isSubmitting = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

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

async function handleSubmit() {
  errorMsg.value = '';
  successMsg.value = '';

  const cleanBarcode = barcode.value.trim();
  if (!cleanBarcode) {
    errorMsg.value = 'Please enter or scan a barcode.';
    return;
  }

  let finalBrand = brand.value === 'Other' ? customBrand.value.trim() : brand.value;
  let finalVarian = varian.value.trim();

  if (mode.value === 'link_existing') {
    if (!selectedWpProduct.value) {
      errorMsg.value = 'Please select a WordPress product to match.';
      return;
    }
    finalBrand = selectedWpProduct.value.brand;
    finalVarian = selectedWpProduct.value.varian;
  } else {
    if (!finalBrand) {
      errorMsg.value = 'Please enter brand name.';
      return;
    }
    if (!finalVarian) {
      errorMsg.value = 'Please enter variant name.';
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
    emit('matched', cleanBarcode);

    setTimeout(() => {
      emit('close');
      barcode.value = '';
      varian.value = '';
      selectedWpId.value = '';
      successMsg.value = '';
    }, 1200);
  } catch (err: any) {
    errorMsg.value = err.message || 'Failed to match barcode';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
      <!-- Header -->
      <div class="p-5 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
            <Link class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-white">Match Barcode with WordPress</h3>
            <p class="text-xs text-slate-400">Link an unscanned physical barcode to a WordPress / ESB item</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Mode Selector -->
      <div class="px-6 pt-4 pb-1">
        <div class="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            @click="mode = 'link_existing'"
            type="button"
            class="py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            :class="
              mode === 'link_existing'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            "
          >
            <Link class="w-3.5 h-3.5" />
            <span>Link to Existing WP Item</span>
          </button>

          <button
            @click="mode = 'create_new'"
            type="button"
            class="py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            :class="
              mode === 'create_new'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            "
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Add Brand New SKU</span>
          </button>
        </div>
      </div>

      <!-- Form Body -->
      <form @submit.prevent="handleSubmit" class="p-6 space-y-4 overflow-y-auto text-xs">
        <!-- Error & Success alerts -->
        <div v-if="errorMsg" class="p-3 rounded-xl bg-rose-950/80 border border-rose-600/50 text-rose-300">
          {{ errorMsg }}
        </div>
        <div v-if="successMsg" class="p-3 rounded-xl bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 flex items-center gap-2">
          <Check class="w-4 h-4" />
          <span>{{ successMsg }}</span>
        </div>

        <!-- 1. Barcode Input (Scanner Auto-aim) -->
        <div>
          <label class="block text-slate-300 font-semibold mb-1">
            Physical Barcode (Cashcow HC-710C or Manual):
          </label>
          <div class="relative">
            <Barcode class="w-5 h-5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              v-model="barcode"
              type="text"
              required
              placeholder="Aim Cashcow scanner at bottle or type barcode..."
              class="w-full pl-10 pr-20 py-2.5 bg-slate-950 border-2 border-slate-700 rounded-xl text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              autofocus
            />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-cyan-300 bg-slate-800 px-2 py-0.5 rounded font-mono">
              Ready
            </span>
          </div>
          <p class="text-[10px] text-slate-500 mt-1">
            Pull trigger on bottle with Cashcow HC-710C to input barcode automatically.
          </p>
        </div>

        <!-- 2. Mode A: Select Existing WordPress Product -->
        <div v-if="mode === 'link_existing'" class="space-y-3">
          <label class="block text-slate-300 font-semibold">
            Choose WordPress / ESB Product to Match With:
          </label>
          <div class="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
            <div
              v-for="p in wpProducts"
              :key="p.id"
              @click="handleSelectExistingProduct(p)"
              class="p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between"
              :class="
                selectedWpId === p.id
                  ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-sm'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
              "
            >
              <div class="flex items-center gap-2.5">
                <span
                  class="w-2.5 h-2.5 rounded-full"
                  :class="p.brand === 'Kulturale' ? 'bg-amber-400' : 'bg-indigo-400'"
                ></span>
                <div>
                  <span class="font-bold text-xs">{{ p.brand }} {{ p.varian }}</span>
                  <span class="text-[10px] text-slate-500 block font-mono">
                    Current Barcode: {{ p.barcode }} • WP ID: #{{ p.id }}
                  </span>
                </div>
              </div>
              <span
                class="text-[10px] font-mono px-2 py-0.5 rounded"
                :class="selectedWpId === p.id ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-900 text-slate-400'"
              >
                {{ selectedWpId === p.id ? 'Selected' : 'Select' }}
              </span>
            </div>
          </div>
        </div>

        <!-- 3. Mode B: Brand New SKU definition -->
        <div v-else class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-slate-300 font-medium mb-1">Brand:</label>
              <select
                v-model="brand"
                class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="Kulturale">Kulturale</option>
                <option value="Albens">Albens</option>
                <option value="Other">Other Brand</option>
              </select>
            </div>
            <div>
              <label class="block text-slate-300 font-medium mb-1">Variant Name:</label>
              <input
                v-model="varian"
                type="text"
                placeholder="e.g. Raspberry Cider, Ginger Beer..."
                class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
          <div v-if="brand === 'Other'">
            <input
              v-model="customBrand"
              type="text"
              placeholder="Enter custom brand name..."
              class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white"
            />
          </div>
        </div>

        <!-- Expected Stock Across All 4 Birmas Stores -->
        <div class="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          <span class="text-xs font-semibold text-slate-300 block mb-2 flex items-center gap-1.5">
            <Building2 class="w-3.5 h-3.5 text-cyan-400" />
            Expected Baseline Stock across Birmas Stores:
          </span>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div v-for="s in stores" :key="s.id">
              <label class="block text-[10px] text-slate-400 truncate mb-1">
                {{ s.name.replace('Birmas ', '') }}:
              </label>
              <input
                v-model.number="storeStocks[s.id]"
                type="number"
                min="0"
                class="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center font-bold text-xs"
              />
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
          <button
            @click="emit('close')"
            type="button"
            class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Check class="w-4 h-4" />
            <span>{{ isSubmitting ? 'Saving to Backend...' : 'Save & Match Barcode' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
