<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  groups: { type: Array, default: () => [] },
  emptyLabel: { type: String, default: 'No chart data for this selection.' },
});
const tooltip = ref(null);

const colors = ['#0f766e', '#ea580c', '#2563eb', '#be123c', '#7e22ce', '#a16207', '#0891b2', '#4d7c0f', '#c2410c', '#4338ca'];
const legend = computed(() => [...new Set(props.groups.flatMap((group) => group.values.map((value) => value.label)))]);
const width = computed(() => Math.max(560, props.groups.length * 180 + 72));
const left = 52;
const top = 24;
const plotHeight = 220;
const baseline = top + plotHeight;
const plotWidth = computed(() => width.value - left - 20);
const seriesWidth = computed(() => Math.min(24, 112 / Math.max(legend.value.length, 1)));

function barX(groupIndex, seriesIndex) {
  const groupWidth = plotWidth.value / Math.max(props.groups.length, 1);
  const totalWidth = seriesWidth.value * legend.value.length;
  return left + groupIndex * groupWidth + (groupWidth - totalWidth) / 2 + seriesIndex * seriesWidth.value;
}
function barHeight(value) {
  return Math.max(0, (Number(value.percent || 0) / 100) * plotHeight);
}
function money(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
function showTooltip(event, group, value) {
  const x = Number.isFinite(event.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event.clientY) ? event.clientY : window.innerHeight / 2;
  tooltip.value = {
    store: group.name,
    payment: value.label,
    percent: `${Number(value.percent).toFixed(1)}%`,
    sales: money(value.sales),
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
  <div v-if="groups.length && legend.length" class="overflow-x-auto px-2 pb-2">
    <svg :viewBox="`0 0 ${width} 340`" :width="width" height="340" role="img" aria-label="Grouped sales percentage bar chart">
      <g v-for="tick in [0, 25, 50, 75, 100]" :key="tick">
        <line :x1="left" :x2="width - 12" :y1="baseline - (tick / 100) * plotHeight" :y2="baseline - (tick / 100) * plotHeight" stroke="#cbd5e1" stroke-dasharray="3 4" />
        <text :x="left - 8" :y="baseline - (tick / 100) * plotHeight + 4" text-anchor="end" fill="#475569" font-size="10">{{ tick }}%</text>
      </g>
      <text x="12" :y="top + plotHeight / 2" text-anchor="middle" fill="#334155" font-size="10" transform="rotate(-90 12 134)">Payment share (%)</text>
      <g v-for="(group,groupIndex) in groups" :key="group.name">
        <g v-for="value in group.values" :key="`${group.name}-${value.label}`">
          <template v-if="value.percent > 0">
            <polygon
              :points="`${barX(groupIndex, legend.indexOf(value.label))},${baseline - barHeight(value)} ${barX(groupIndex, legend.indexOf(value.label)) + seriesWidth - 2},${baseline - barHeight(value)} ${barX(groupIndex, legend.indexOf(value.label)) + seriesWidth + 4},${baseline - barHeight(value) - 5} ${barX(groupIndex, legend.indexOf(value.label)) + 6},${baseline - barHeight(value) - 5}`"
              fill="#0f172a"
              opacity="0.42"
              pointer-events="none"
            />
            <rect
              :x="barX(groupIndex, legend.indexOf(value.label))"
              :y="baseline - barHeight(value)"
              :width="seriesWidth - 2"
              :height="barHeight(value)"
              :fill="colors[legend.indexOf(value.label) % colors.length]"
              rx="2"
              tabindex="0"
              :aria-label="`${group.name} ${value.label}: ${value.percent.toFixed(1)}%, ${money(value.sales)}`"
              @pointerenter="showTooltip($event, group, value)"
              @pointermove="moveTooltip"
              @pointerleave="tooltip = null"
              @focus="showTooltip($event, group, value)"
              @blur="tooltip = null"
            >
            </rect>
            <polygon
              :points="`${barX(groupIndex, legend.indexOf(value.label)) + seriesWidth - 2},${baseline - barHeight(value)} ${barX(groupIndex, legend.indexOf(value.label)) + seriesWidth + 4},${baseline - barHeight(value) - 5} ${barX(groupIndex, legend.indexOf(value.label)) + seriesWidth + 4},${baseline - 5} ${barX(groupIndex, legend.indexOf(value.label)) + seriesWidth - 2},${baseline}`"
              fill="#0f172a"
              opacity="0.3"
              pointer-events="none"
            />
          </template>
        </g>
        <text :x="left + (groupIndex + 0.5) * (plotWidth / groups.length)" :y="baseline + 22" text-anchor="middle" fill="#334155" font-size="11">{{ group.name }}</text>
      </g>
      <text :x="left + plotWidth / 2" :y="baseline + 42" text-anchor="middle" fill="#334155" font-size="10">Store</text>
      <g v-for="(label,index) in legend" :key="label" :transform="`translate(${left + (index % 5) * 142},${baseline + 56 + Math.floor(index / 5) * 20})`">
        <rect width="10" height="10" rx="2" :fill="colors[index % colors.length]" />
        <text x="15" y="9" fill="#334155" font-size="10">{{ label }}</text>
      </g>
    </svg>
    <p class="px-3 text-[10px] text-slate-500">Y-axis is each payment method's share of that store's sales. Hover or focus a bar for details.</p>
  </div>
  <p v-else class="p-8 text-center text-xs text-slate-400">{{ emptyLabel }}</p>
  <Teleport v-if="tooltip" to="body">
    <div class="pointer-events-none fixed z-[100] min-w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white shadow-xl" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
      <p class="font-bold">{{ tooltip.store }}</p><p class="text-slate-300">{{ tooltip.payment }}</p><p class="mt-1">{{ tooltip.percent }} · {{ tooltip.sales }}</p>
    </div>
  </Teleport>
</template>
