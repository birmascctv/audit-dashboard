<script setup lang="ts">
import { ref } from 'vue';
import { Product } from '../types/inventory';
import { X, Plus, Barcode, Package, Layers } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  nextNo: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'add', product: Omit<Product, 'id' | 'updatedAt'>): void;
}>();

const barcode = ref('');
const brand = ref('Kulturale');
const customBrand = ref('');
const varian = ref('');
const qty = ref(24);
const minStockAlert = ref(5);
const errorMsg = ref('');

function handleBrandChange(val: string) {
  brand.value = val;
}

function handleSubmit() {
  errorMsg.value = '';
  if (!barcode.value.trim()) {
    errorMsg.value = 'Barcode number is required.';
    return;
  }
  const selectedBrand = brand.value === 'Other' ? customBrand.value.trim() : brand.value;
  if (!selectedBrand) {
    errorMsg.value = 'Brand name is required.';
    return;
  }
  if (!varian.value.trim()) {
    errorMsg.value = 'Variant name is required.';
    return;
  }

  emit('add', {
    no: props.nextNo,
    barcode: barcode.value.trim(),
    brand: selectedBrand,
    varian: varian.value.trim(),
    qty: Math.max(0, Number(qty.value)),
    initialQty: Math.max(0, Number(qty.value)),
    capacity: Math.max(24, Number(qty.value)),
    minStockAlert: Number(minStockAlert.value) || 5,
  });

  // reset form
  barcode.value = '';
  varian.value = '';
  qty.value = 24;
  emit('close');
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
            <Plus class="w-5 h-5" />
          </div>
          <div>
            <h3 class="text-base font-bold text-white">Add Product to Chiller #1</h3>
            <p class="text-xs text-slate-400">Assign a new SKU barcode & initial stock</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Form Body -->
      <form @submit.prevent="handleSubmit" class="p-5 space-y-4 text-xs">
        <div v-if="errorMsg" class="p-2.5 rounded-lg bg-rose-950/80 border border-rose-600/50 text-rose-300">
          {{ errorMsg }}
        </div>

        <!-- Barcode with instant scan trigger -->
        <div>
          <label class="block text-slate-300 font-medium mb-1">Kode Barcode (Scan or Type):</label>
          <div class="relative">
            <Barcode class="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              v-model="barcode"
              type="text"
              required
              placeholder="e.g. 8997026800122 (aim scanner here)"
              class="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        <!-- Brand Selection -->
        <div>
          <label class="block text-slate-300 font-medium mb-1">Brand:</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="b in ['Kulturale', 'Albens', 'Other']"
              :key="b"
              type="button"
              @click="handleBrandChange(b)"
              class="py-1.5 px-3 rounded-lg border text-xs font-semibold transition-colors"
              :class="brand === b ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'"
            >
              {{ b }}
            </button>
          </div>
          <input
            v-if="brand === 'Other'"
            v-model="customBrand"
            type="text"
            placeholder="Enter brand name..."
            class="mt-2 w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <!-- Variant Name -->
        <div>
          <label class="block text-slate-300 font-medium mb-1">Varian Name:</label>
          <input
            v-model="varian"
            type="text"
            required
            placeholder="e.g. Peach, Ginger Beer, Blueberry..."
            class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <!-- Initial Qty & Alert Threshold -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-300 font-medium mb-1">Initial Qty in Chiller:</label>
            <input
              v-model.number="qty"
              type="number"
              min="0"
              required
              class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label class="block text-slate-300 font-medium mb-1">Low Stock Alert at &le;:</label>
            <input
              v-model.number="minStockAlert"
              type="number"
              min="1"
              required
              class="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            @click="emit('close')"
            type="button"
            class="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
          >
            Add to Chiller
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
