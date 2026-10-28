<script>
export const PIE_CHART_COLORS = ['#005f73', '#e76f00', '#6a00f4', '#b0003a', '#007f5f', '#0072b2', '#9c5700', '#c000c0', '#31572c', '#334eac', '#d00000', '#006d77'];
</script>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  maxItems: { type: Number, default: 12 },
  emptyLabel: { type: String, default: 'No chart data for this selection.' },
  showValuesOnHover: { type: Boolean, default: false },
  showLegendValues: { type: Boolean, default: false },
  legendColumns: { type: Number, default: 1 },
  showLegend: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  compactSpacing: { type: Boolean, default: false },
  alignChartLeft: { type: Boolean, default: false },
});
const tooltip = ref(null);
const hoveredName = ref(null);
const slices = computed(() => {
  const data = props.items.slice(0, props.maxItems).map((item) => ({ ...item, sales: Number(item.sales || 0) }));
  const total = data.reduce((sum, item) => sum + item.sales, 0);
  let angle = -Math.PI / 2;
  return data.map((item, index) => {
    const share = total > 0 ? item.sales / total : 0;
    const next = angle + share * Math.PI * 2;
    const largeArc = next - angle > Math.PI ? 1 : 0;
    const start = point(angle, 90);
    const end = point(next, 90);
    const innerStart = point(angle, 52);
    const innerEnd = point(next, 52);
    const path = share >= 0.99999
      ? 'M 110 20 A 90 90 0 1 1 110 200 A 90 90 0 1 1 110 20 Z M 110 58 A 52 52 0 1 0 110 162 A 52 52 0 1 0 110 58 Z'
      : `M ${start.x} ${start.y} A 90 90 0 ${largeArc} 1 ${end.x} ${end.y} L ${innerEnd.x} ${innerEnd.y} A 52 52 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
    angle = next;
    return { ...item, percent: share * 100, color: PIE_CHART_COLORS[index % PIE_CHART_COLORS.length], path };
  });
});
const totalSales = computed(() => slices.value.reduce((sum, item) => sum + item.sales, 0));

function point(angle, radius) {
  return { x: 110 + Math.cos(angle) * radius, y: 110 + Math.sin(angle) * radius };
}
function money(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
function compactMoney(value) {
  return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
}
function showTooltip(event, item) {
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  tooltip.value = {
    name: item.name,
    details: item.details,
    sales: money(item.sales),
    percent: `${item.percent.toFixed(1)}%`,
    x: Math.min(x + 14, window.innerWidth - 280),
    y: Math.min(y + 14, window.innerHeight - 110),
  };
}
function moveTooltip(event) {
  if (!tooltip.value) return;
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  tooltip.value = {
    ...tooltip.value,
    x: Math.min(x + 14, window.innerWidth - 280),
    y: Math.min(y + 14, window.innerHeight - 110),
  };
}
</script>

<template>
  <div v-if="slices.length && totalSales > 0" class="flex flex-col items-center"
    :class="[compact ? 'min-h-0 gap-2 p-2' : compactSpacing ? 'min-h-0 gap-0 p-0' : 'min-h-[18rem] gap-2 p-4 sm:flex-row sm:items-start sm:gap-4', alignChartLeft ? 'sm:flex-row sm:items-center sm:justify-start' : '']">
    <svg :class="compact ? 'h-36 w-36' : 'h-56 w-56'" class="shrink-0" viewBox="0 0 220 220" role="img" aria-label="Sales share doughnut chart">
      <path v-for="item in slices" :key="`v-${item.name}`" :d="item.path" :fill="item.color" fill-rule="evenodd" stroke="rgba(255,255,255,0.45)" stroke-width="0.6" pointer-events="none"
        :opacity="hoveredName && hoveredName !== item.name ? 0.75 : 1"
        :transform="hoveredName === item.name ? 'translate(110 110) scale(1.06) translate(-110 -110)' : undefined"
        style="transition: transform 200ms ease, opacity 200ms ease" />
      <path v-for="item in slices" :key="`h-${item.name}`" :d="item.path" fill="transparent" fill-rule="evenodd" class="focus:outline-none"
        tabindex="0" :aria-label="showValuesOnHover ? `${item.name}: ${item.percent.toFixed(1)}%, ${money(item.sales)}` : item.name"
        @pointerenter="hoveredName = item.name; showTooltip($event, item)" @pointermove="moveTooltip" @pointerleave="hoveredName = null; tooltip = null"
        @focus="hoveredName = item.name; showTooltip($event, item)" @blur="hoveredName = null; tooltip = null" />
      <text x="110" y="105" text-anchor="middle" fill="#475569" :font-size="compact ? 8 : 9" font-weight="700">TOTAL SALES</text>
      <text x="110" y="122" text-anchor="middle" fill="#0f172a" :font-size="compact ? 11 : 13" font-weight="800">Rp {{ compactMoney(totalSales) }}</text>
    </svg>
    <div v-if="showLegend" class="grid min-w-0 flex-1 content-start gap-x-4 gap-y-1 text-xs" :class="legendColumns > 1 ? 'grid-cols-2' : 'grid-cols-1'">
      <div v-for="item in slices" :key="item.name" class="flex min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50">
        <span class="flex min-w-0 items-center gap-2"><i class="h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ backgroundColor: item.color }"></i><span class="truncate font-medium text-slate-700">{{ item.name }}</span></span>
        <span v-if="showLegendValues" class="shrink-0 text-right text-[10px] text-slate-500">{{ item.percent.toFixed(1) }}% · {{ money(item.sales) }}</span>
      </div>
    </div>
  </div>
  <p v-else class="flex min-h-[18rem] items-center justify-center p-8 text-center text-xs text-slate-400">{{ emptyLabel }}</p>
  <Teleport v-if="tooltip" to="body">
    <div class="pointer-events-none fixed z-[100] min-w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white shadow-xl" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
      <p class="font-bold">{{ tooltip.name }}</p><p v-if="tooltip.details" class="mt-0.5 text-slate-300">{{ tooltip.details }}</p>
      <template v-if="showValuesOnHover"><p class="mt-1">{{ tooltip.percent }} · {{ tooltip.sales }}</p></template>
    </div>
  </Teleport>
</template>
