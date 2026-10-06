<script setup lang="ts">
import { ref, watch } from 'vue';
import { Product } from '../types/inventory';
import { X, RefreshCw, PackagePlus, Check } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  product?: Product | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'restock', productId: string, addQty: number): void;
}>();

const restockAmount = ref<number>(12);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      restockAmount.value = 12;
    }
  }
);

function addPreset(qty: number) {
  restockAmount.value = qty;
}

function handleConfirm() {
  if (props.product && restockAmount.value > 0) {
    emit('restock', props.product.id, Number(restockAmount.value));
    emit('close');
  }
}
</script>

<template>
  <div
    v-if="isOpen && product"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <PackagePlus class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-sm font-bold text-white">Restock Chiller Shelf</h3>
            <p class="text-[11px] text-slate-400">{{ product.brand }} {{ product.varian }}</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-5 space-y-4 text-xs">
        <div class="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
          <div>
            <span class="text-slate-400 block text-[11px]">Current In-Chiller Stock:</span>
            <span class="text-base font-bold text-white font-mono">{{ product.qty }} bottles</span>
          </div>
          <div class="text-right">
            <span class="text-slate-400 block text-[11px]">Barcode:</span>
            <span class="text-xs font-mono text-cyan-300">...{{ product.barcode.slice(-6) }}</span>
          </div>
        </div>

        <div>
          <label class="block text-slate-300 font-medium mb-1.5">Select Crate / Batch Size to Add:</label>
          <div class="grid grid-cols-4 gap-2 mb-3">
            <button
              v-for="amt in [6, 12, 20, 24]"
              :key="amt"
              type="button"
              @click="addPreset(amt)"
              class="py-2 rounded-lg border text-xs font-bold transition-all"
              :class="
                restockAmount === amt
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
              "
            >
              +{{ amt }}
            </button>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-slate-400">Custom:</span>
            <input
              v-model.number="restockAmount"
              type="number"
              min="1"
              class="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        <div class="bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-500/20 text-emerald-300 flex items-center justify-between">
          <span>New Total After Restock:</span>
          <span class="font-bold font-mono text-sm">{{ product.qty + (Number(restockAmount) || 0) }} units</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-3.5 border-t border-slate-800 bg-slate-950/80 flex justify-end gap-2">
        <button
          @click="emit('close')"
          type="button"
          class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
        >
          Cancel
        </button>
        <button
          @click="handleConfirm"
          type="button"
          class="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
        >
          <Check class="w-3.5 h-3.5" />
          <span>Confirm +{{ restockAmount }} Restock</span>
        </button>
      </div>
    </div>
  </div>
</template>
