<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  metric: { type: String, default: 'sales' },
  xAxisLabel: { type: String, default: 'Item' },
  xAxisFontSize: { type: Number, default: 8 },
  lineColor: { type: String, default: '#2563eb' },
  showPercent: { type: Boolean, default: true },
  sortItems: { type: Boolean, default: true },
  emptyLabel: { type: String, default: 'No chart data for this selection.' },
  maxItems: { type: Number, default: 24 },
});

const tooltip = ref(null);
const filteredItems = computed(() => {
  const items = props.items
    .map((item) => ({ ...item, value: Number(item[props.metric]) || 0 }))
    .filter((item) => item.value >= 0);
  return props.sortItems ? items.sort((a, b) => b.value - a.value) : items;
});
const denominator = computed(() => filteredItems.value.reduce((sum, item) => sum + item.value, 0));
const chartItems = computed(() => filteredItems.value.slice(0, props.maxItems));
const width = 980;
const left = 70;
const right = 20;
const top = 28;
const bottom = 105;
const height = 330;
const plotWidth = width - left - right;
const plotHeight = height - top - bottom;
const maxPercent = computed(() => Math.max(1, ...chartItems.value.map((item) => denominator.value ? item.value / denominator.value * 100 : 0)));
const points = computed(() => chartItems.value.map((item, index) => ({
  ...item,
  percent: denominator.value ? item.value / denominator.value * 100 : 0,
  x: chartItems.value.length === 1
    ? left + plotWidth / 2
    : left + (index * plotWidth) / (chartItems.value.length - 1),
  y: top + plotHeight - (denominator.value ? item.value / denominator.value * 100 / maxPercent.value : 0) * plotHeight,
})));
const linePath = computed(() => points.value.map((point, index) =>
  `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '));

function formatValue(value) {
  if (props.metric === 'sales') {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
  }
  return `${Number(value || 0).toLocaleString('id-ID')} units`;
}
function formatMoney(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
function formatAxisValue(value) {
  return `${Number(value || 0).toFixed(0)}%`;
}
function showTooltip(event, item) {
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  tooltip.value = {
    name: item.name,
    details: item.details,
    value: formatValue(item.value),
    percent: `${item.percent.toFixed(1)}%`,
    sales: item.sales === undefined ? null : formatMoney(item.sales),
    units: item.units === undefined ? null : Number(item.units).toLocaleString('id-ID'),
    x: Math.min(x + 14, window.innerWidth - 300),
    y: Math.min(y + 14, window.innerHeight - 150),
  };
}
function moveTooltip(event) {
  if (!tooltip.value) return;
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  tooltip.value = { ...tooltip.value, x: Math.min(x + 14, window.innerWidth - 300), y: Math.min(y + 14, window.innerHeight - 150) };
}
</script>

<template>
  <div v-if="chartItems.length" class="relative min-h-[23rem]">
    <div class="overflow-hidden px-2 pb-2">
      <svg class="w-full" :viewBox="`0 0 ${width} ${height}`" :height="height" preserveAspectRatio="none" role="img" aria-label="Sales line chart">
        <g v-for="tick in [0, 0.25, 0.5, 0.75, 1]" :key="tick">
          <line :x1="left" :x2="width - right" :y1="top + plotHeight * (1 - tick)" :y2="top + plotHeight * (1 - tick)" stroke="#cbd5e1" stroke-dasharray="3 4" />
          <text :x="left - 8" :y="top + plotHeight * (1 - tick) + 4" text-anchor="end" fill="#475569" font-size="10">{{ formatAxisValue(maxPercent * tick) }}</text>
        </g>
        <text x="14" :y="top + plotHeight / 2" text-anchor="middle" fill="#334155" font-size="10" transform="rotate(-90 14 125)">Share (%)</text>
        <path :d="linePath" fill="none" :stroke="lineColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <line v-if="points.length === 1" :x1="points[0].x" :x2="points[0].x" :y1="points[0].y" :y2="top + plotHeight" :stroke="lineColor" stroke-width="2" stroke-dasharray="4 4" />
        <g v-for="point in points" :key="point.name">
          <circle :cx="point.x" :cy="point.y" :r="points.length === 1 ? 7 : 4" :fill="lineColor" stroke="#fff" stroke-width="1" tabindex="0"
            :aria-label="`${point.name}: ${point.percent.toFixed(1)}%, ${formatValue(point.value)}`"
            @pointerenter="showTooltip($event, point)" @pointermove="moveTooltip" @pointerleave="tooltip = null"
            @focus="showTooltip($event, point)" @blur="tooltip = null" />
          <text :transform="`translate(${point.x + 2},${top + plotHeight + 13}) rotate(-48)`" text-anchor="end" fill="#334155" :font-size="xAxisFontSize">{{ point.name.length > 22 ? `${point.name.slice(0, 21)}…` : point.name }}</text>
        </g>
        <text :x="left + plotWidth / 2" :y="height - 5" text-anchor="middle" fill="#334155" font-size="10">{{ xAxisLabel }} · top {{ chartItems.length }}</text>
      </svg>
      <p class="px-3 text-[10px] text-slate-500">Top {{ chartItems.length }} of {{ filteredItems.length }} · hover or focus a point for sales and unit details.</p>
    </div>
  </div>
  <p v-else class="flex min-h-[23rem] items-center justify-center p-8 text-center text-xs text-slate-400">{{ emptyLabel }}</p>
  <Teleport v-if="tooltip" to="body">
    <div class="pointer-events-none fixed z-[100] min-w-48 whitespace-pre-line rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white shadow-xl" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
      <p class="font-bold">{{ tooltip.name }}</p><p v-if="tooltip.details" class="mt-0.5 max-w-[30rem] break-words text-slate-300">{{ tooltip.details }}</p>
      <p class="mt-1"><span v-if="showPercent">{{ tooltip.percent }} · </span>{{ tooltip.value }}</p><p v-if="tooltip.units !== null" class="text-slate-300">{{ tooltip.units }} units</p>
    </div>
  </Teleport>
</template>
