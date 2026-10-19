<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  denominator: { type: Number, default: 0 },
  maxItems: { type: Number, default: 12 },
  emptyLabel: { type: String, default: 'No chart data for this selection.' },
  xAxisLabel: { type: String, default: 'Item' },
  valueAxis: { type: String, default: 'percent' },
});
const tooltip = ref(null);

const colors = ['#0f766e', '#2563eb', '#7c3aed', '#ea580c', '#0891b2', '#be123c', '#4f46e5', '#65a30d', '#c026d3', '#475569', '#b45309', '#0284c7'];
const chartItems = computed(() => props.items.slice(0, props.maxItems).map((item, index) => ({
  ...item,
  percent: props.denominator > 0 ? (Number(item.sales || 0) / props.denominator) * 100 : 0,
  color: colors[index % colors.length],
})));
const width = 980;
const left = 52;
const top = 20;
const plotHeight = 170;
const baseline = top + plotHeight;
const plotWidth = width - left - 16;
const slotWidth = computed(() => plotWidth / Math.max(chartItems.value.length, 1));
const barWidth = computed(() => Math.min(32, slotWidth.value * 0.75));

function barX(index) {
  return left + (index + 0.5) * slotWidth.value - barWidth.value / 2;
}
const maxSales = computed(() => Math.max(0, ...props.items.slice(0, props.maxItems).map((item) => Number(item.sales) || 0)));
const rupiahMode = computed(() => props.valueAxis === 'rupiah');
const ticks = computed(() => [0, 25, 50, 75, 100].map((tick) => ({
  tick,
  label: rupiahMode.value ? compactRupiah(maxSales.value * tick / 100) : `${tick}%`,
})));
function compactRupiah(value) {
  if (value >= 1e9) return `Rp ${(value / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1e6) return `Rp ${(value / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1e3) return `Rp ${Math.round(value / 1e3)}K`;
  return `Rp ${Math.round(value)}`;
}
function barHeight(item) {
  if (rupiahMode.value) return maxSales.value > 0 ? ((Number(item.sales) || 0) / maxSales.value) * plotHeight : 0;
  return Math.max(0, (item.percent / 100) * plotHeight);
}
function money(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}
function showTooltip(event, item) {
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  tooltip.value = {
    name: item.name,
    details: item.details,
    sales: money(item.sales),
    percent: percent(item.percent),
    units: item.units === undefined ? null : Number(item.units).toLocaleString('id-ID'),
    x: Math.min(x + 14, window.innerWidth - 280),
    y: Math.min(y + 14, window.innerHeight - 130),
  };
}
function moveTooltip(event) {
  if (!tooltip.value) return;
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  tooltip.value = {
    ...tooltip.value,
    x: Math.min(x + 14, window.innerWidth - 280),
    y: Math.min(y + 14, window.innerHeight - 130),
  };
}
</script>

<template>
  <div v-if="chartItems.length" class="relative min-h-[21rem]">
    <div class="overflow-hidden px-2 pb-2">
      <svg class="w-full" :viewBox="`0 0 ${width} 300`" height="300" preserveAspectRatio="none" role="img" aria-label="Sales share bar chart">
      <g v-for="{ tick, label } in ticks" :key="tick">
        <line :x1="left" :x2="width - 12" :y1="baseline - (tick / 100) * plotHeight" :y2="baseline - (tick / 100) * plotHeight" stroke="#cbd5e1" stroke-dasharray="3 4" />
        <text :x="left - 8" :y="baseline - (tick / 100) * plotHeight + 4" text-anchor="end" fill="#475569" font-size="10">{{ label }}</text>
      </g>
      <text x="12" :y="top + plotHeight / 2" text-anchor="middle" fill="#334155" font-size="10" transform="rotate(-90 12 105)">{{ rupiahMode ? 'Revenue (Rp)' : 'Sales share (%)' }}</text>
      <g v-for="(item,index) in chartItems" :key="item.name">
        <rect
          :x="barX(index)"
          :y="baseline - barHeight(item)"
          :width="barWidth"
          :height="barHeight(item)"
          :fill="item.color"
          rx="3"
          tabindex="0"
          :aria-label="`${item.name}: ${percent(item.percent)}, ${money(item.sales)}`"
          @pointerenter="showTooltip($event, item)"
          @pointermove="moveTooltip"
          @pointerleave="tooltip = null"
          @focus="showTooltip($event, item)"
          @blur="tooltip = null"
        >
        </rect>
        <text :transform="`translate(${barX(index) + 4},${baseline + 10}) rotate(-45)`" text-anchor="end" fill="#334155" font-size="10">{{ item.name }}</text>
      </g>
      <text :x="left + plotWidth / 2" y="292" text-anchor="middle" fill="#334155" font-size="10">{{ xAxisLabel }}</text>
      </svg>
      <p class="px-3 text-[10px] text-slate-500">Hover or focus a bar for sales and share details.</p>
    </div>
  </div>
  <p v-else class="flex min-h-[21rem] items-center justify-center p-8 text-center text-xs text-slate-400">{{ emptyLabel }}</p>
  <Teleport v-if="tooltip" to="body">
    <div class="pointer-events-none fixed z-[100] min-w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white shadow-xl" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
      <p class="font-bold">{{ tooltip.name }}</p><p v-if="tooltip.details" class="mt-0.5 text-slate-300">{{ tooltip.details }}</p>
      <p class="mt-1">{{ rupiahMode ? tooltip.sales : `${tooltip.percent} · ${tooltip.sales}` }}</p><p v-if="tooltip.units" class="text-slate-300">{{ tooltip.units }} units</p>
    </div>
  </Teleport>
</template>
