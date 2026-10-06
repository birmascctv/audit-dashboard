<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { Product } from '../types/inventory';
import {
  Barcode,
  Search,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Sparkles,
  ArrowRight,
  Flame
} from 'lucide-vue-next';

const props = defineProps<{
  products: Product[];
  feedback: {
    type: 'success' | 'error' | 'idle';
    message: string;
    timestamp: number;
  };
  multiplier: number;
}>();

const emit = defineEmits<{
  (e: 'scan', barcode: string): void;
  (e: 'update:multiplier', val: number): void;
}>();

const manualBarcodeInput = ref('');
const inputEl = ref<HTMLInputElement | null>(null);

function handleSubmit() {
  if (!manualBarcodeInput.value.trim()) return;
  emit('scan', manualBarcodeInput.value.trim());
  manualBarcodeInput.value = '';
}

function handleQuickScan(barcode: string) {
  emit('scan', barcode);
  // Refocus input
  nextTick(() => {
    inputEl.value?.focus();
  });
}

function setMultiplier(val: number) {
  emit('update:multiplier', val);
}

onMounted(() => {
  // Focus main scan input on load
  inputEl.value?.focus();
});
</script>

<template>
  <div class="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-5 border border-slate-700/80 shadow-xl relative overflow-hidden">
    <!-- Subtle laser scan effect glow in background -->
    <div class="absolute -right-16 -top-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute -left-16 -bottom-16 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

    <div class="relative z-10 flex flex-col gap-4">
      <!-- Top row: Station Title & Multiplier controls -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-700/60 pb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
            <Zap class="w-4 h-4" />
          </div>
          <div>
            <h2 class="text-base font-bold text-white tracking-wide flex items-center gap-2">
              Scan & Sell Station
              <span class="text-[11px] font-normal px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-700 text-cyan-300">
                Cashcow HC-710C Active
              </span>
            </h2>
            <p class="text-xs text-slate-400">
              Scan any product barcode with Cashcow scanner or click test chips below.
            </p>
          </div>
        </div>

        <!-- Quantity Multiplier -->
        <div class="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-700/80 self-start sm:self-auto">
          <span class="text-xs text-slate-400 px-2 font-medium">Qty:</span>
          <button
            v-for="qty in [1, 2, 3, 6]"
            :key="qty"
            @click="setMultiplier(qty)"
            type="button"
            class="px-2.5 py-1 text-xs font-semibold rounded-lg transition-all"
            :class="multiplier === qty ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30' : 'text-slate-300 hover:text-white hover:bg-slate-800'"
          >
            {{ qty }}x
          </button>
        </div>
      </div>

      <!-- Main Barcode Scan Input Bar -->
      <form @submit.prevent="handleSubmit" class="relative">
        <div class="relative flex items-center">
          <div class="absolute left-4 flex items-center pointer-events-none text-cyan-400">
            <Barcode class="w-6 h-6 animate-pulse" />
          </div>
          <input
            id="scanner-main-input"
            ref="inputEl"
            v-model="manualBarcodeInput"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="Scan barcode with Cashcow HC-710C or type & press Enter..."
            class="w-full pl-13 pr-32 py-3.5 bg-slate-950/90 text-white placeholder-slate-500 text-base font-mono rounded-xl border-2 border-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-500/20 transition-all shadow-inner"
          />
          <button
            type="submit"
            class="absolute right-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm rounded-lg transition-all shadow-md flex items-center gap-1.5"
          >
            <span>Sell {{ multiplier > 1 ? `${multiplier}x` : '' }}</span>
            <ArrowRight class="w-4 h-4" />
          </button>
        </div>
      </form>

      <!-- Feedback Alert banner -->
      <div
        v-if="feedback.type !== 'idle'"
        class="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all animate-fadeIn"
        :class="
          feedback.type === 'success'
            ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
            : 'bg-rose-950/70 border-rose-500/50 text-rose-200'
        "
      >
        <component
          :is="feedback.type === 'success' ? CheckCircle2 : AlertTriangle"
          class="w-5 h-5 shrink-0"
          :class="feedback.type === 'success' ? 'text-emerald-400' : 'text-rose-400'"
        />
        <div class="flex-1 text-sm font-medium">
          {{ feedback.message }}
        </div>
        <span class="text-xs opacity-75 font-mono">
          {{ feedback.type === 'success' ? 'Inventory Deducted' : 'Check Chiller' }}
        </span>
      </div>

      <!-- Quick Test Barcode Chips (Great for testing the exact 7 products from the photo!) -->
      <div class="flex flex-col gap-2 pt-1">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles class="w-3.5 h-3.5 text-amber-400" />
            Quick Simulate Scanner (Click any bottle to test instant sale):
          </span>
          <span class="text-[11px] text-slate-400 hidden sm:inline">
            Matches Cashcow HC-710C scan result
          </span>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in products"
            :key="p.id"
            @click="handleQuickScan(p.barcode)"
            type="button"
            class="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 hover:border-cyan-500/50 text-xs transition-all shadow-sm active:scale-95"
            :class="p.qty === 0 ? 'opacity-50 cursor-not-allowed' : ''"
            :disabled="p.qty === 0"
          >
            <span
              class="w-2 h-2 rounded-full"
              :class="
                p.brand === 'Kulturale'
                  ? 'bg-amber-400'
                  : 'bg-indigo-400'
              "
            ></span>
            <span class="font-medium text-slate-200 group-hover:text-white">
              {{ p.brand }} {{ p.varian }}
            </span>
            <span class="font-mono text-[10px] text-cyan-300/80 bg-slate-900 px-1.5 py-0.5 rounded">
              ...{{ p.barcode.slice(-4) }}
            </span>
            <span
              class="text-[10px] font-bold px-1.5 py-0.2 rounded"
              :class="
                p.qty === 0
                  ? 'bg-rose-500/20 text-rose-300'
                  : p.qty <= (p.minStockAlert || 5)
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-emerald-500/20 text-emerald-300'
              "
            >
              {{ p.qty }} left
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
