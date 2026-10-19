<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  rows: { type: Array, default: () => [] },
  emptyLabel: { type: String, default: 'No chart data for this selection.' },
});

const tooltip = ref(null);
const colors = ['#0f766e', '#2563eb', '#7c3aed', '#ea580c', '#0891b2', '#be123c', '#4f46e5', '#65a30d', '#c026d3', '#475569', '#b45309', '#0284c7'];
const series = computed(() => [...new Set(props.rows.flatMap((row) => row.segments.map((segment) => segment.name)))]);
const chartRows = computed(() => props.rows.map((row) => {
  const total = row.segments.reduce((sum, segment) => sum + Number(segment.sales || 0), 0);
  let offset = 0;
  return {
    ...row,
    total,
    segments: row.segments.filter((segment) => Number(segment.sales) > 0).map((segment) => {
      const percent = total > 0 ? Number(segment.sales) / total * 100 : 0;
      const result = { ...segment, percent, offset, color: colors[series.value.indexOf(segment.name) % colors.length] };
      offset += percent;
      return result;
    }),
  };
}));
const chartHeight = 420;
const left = 150;
const right = 24;
const top = 24;
const rowHeight = computed(() => (chartHeight - top - 34) / Math.max(chartRows.value.length, 1));
const plotWidth = computed(() => Math.max(40, 980 - left - right));
const legendItems = computed(() => series.value.map((name, index) => ({ name, color: colors[index % colors.length] })));

function money(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
function showTooltip(event, row, segment) {
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  tooltip.value = {
    row: row.name,
    segment: segment.name,
    sales: money(segment.sales),
    percent: `${segment.percent.toFixed(1)}%`,
    total: money(row.total),
    x: Math.min(x + 14, window.innerWidth - 290),
    y: Math.min(y + 14, window.innerHeight - 120),
  };
}
function moveTooltip(event) {
  if (!tooltip.value) return;
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  tooltip.value = { ...tooltip.value, x: Math.min(x + 14, window.innerWidth - 290), y: Math.min(y + 14, window.innerHeight - 120) };
}
</script>

<template>
  <div class="relative h-[28rem] p-3">
    <div v-if="chartRows.length" class="absolute left-3 right-3 top-3 flex max-h-12 flex-wrap gap-x-4 gap-y-1 overflow-y-auto text-[10px]">
      <span v-for="item in legendItems" :key="item.name" class="flex items-center gap-1.5"><i class="h-2.5 w-2.5 rounded-sm" :style="{ backgroundColor: item.color }"></i>{{ item.name }}</span>
    </div>
    <div v-if="chartRows.length" class="absolute inset-x-3 bottom-2 top-[3.75rem]">
      <svg class="h-full w-full" :viewBox="`0 0 980 ${chartHeight}`" preserveAspectRatio="none" role="img" aria-label="100 percent stacked horizontal sales chart">
        <g v-for="tick in [0, 25, 50, 75, 100]" :key="tick">
          <line :x1="left + plotWidth * tick / 100" :x2="left + plotWidth * tick / 100" :y1="top - 8" :y2="chartHeight - 28" stroke="#cbd5e1" stroke-dasharray="3 4" />
          <text :x="left + plotWidth * tick / 100" y="16" text-anchor="middle" fill="#475569" font-size="10">{{ tick }}%</text>
        </g>
        <g v-for="(row, index) in chartRows" :key="row.name">
          <text :x="left - 8" :y="top + index * rowHeight + rowHeight / 2 + 4" text-anchor="end" fill="#334155" font-size="10">{{ row.name.length > 22 ? `${row.name.slice(0, 21)}…` : row.name }}</text>
          <rect v-for="segment in row.segments" :key="segment.name"
            :x="left + plotWidth * segment.offset / 100" :y="top + index * rowHeight + rowHeight * 0.15"
            :width="Math.max(0.5, plotWidth * segment.percent / 100)" :height="rowHeight * 0.7" rx="2" :fill="segment.color" tabindex="0"
            :aria-label="`${row.name}, ${segment.name}: ${segment.percent.toFixed(1)}%, ${money(segment.sales)}`"
            @pointerenter="showTooltip($event, row, segment)" @pointermove="moveTooltip" @pointerleave="tooltip = null"
            @focus="showTooltip($event, row, segment)" @blur="tooltip = null" />
        </g>
        <text :x="left + plotWidth / 2" :y="chartHeight - 5" text-anchor="middle" fill="#334155" font-size="10">Share of row sales (%)</text>
      </svg>
    </div>
    <p v-else class="flex h-full items-center justify-center text-center text-xs text-slate-400">{{ emptyLabel }}</p>
  </div>
  <Teleport v-if="tooltip" to="body">
    <div class="pointer-events-none fixed z-[100] min-w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white shadow-xl" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
      <p class="font-bold">{{ tooltip.row }}</p><p class="text-slate-300">{{ tooltip.segment }} · {{ tooltip.percent }}</p>
      <p class="mt-1">{{ tooltip.sales }}</p><p class="text-slate-300">Row total {{ tooltip.total }}</p>
    </div>
  </Teleport>
</template>
