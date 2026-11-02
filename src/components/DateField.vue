<script setup>
import { ref, watch } from 'vue';
import { fmtDate, parseDMY } from '../utils/date.js';

const props = defineProps({ modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);
const text = ref(fmtDate(props.modelValue));
const picker = ref(null);

watch(() => props.modelValue, (v) => { text.value = fmtDate(v); });

function onInput(e) {
  let v = e.target.value.replace(/[^\d/]/g, '');
  if (/^\d{2}$|^\d{2}\/\d{2}$/.test(v) && e.inputType !== 'deleteContentBackward') v += '/';
  text.value = v;
  const iso = parseDMY(v);
  if (iso) emit('update:modelValue', iso);
  else if (!v) emit('update:modelValue', '');
}
function onBlur() { text.value = fmtDate(props.modelValue); }
function openPicker() { try { picker.value?.showPicker(); } catch { picker.value?.click(); } }
</script>

<template>
  <span class="relative inline-flex items-center">
    <input
      :value="text"
      type="text"
      inputmode="numeric"
      maxlength="10"
      placeholder="DD/MM/YYYY"
      autocomplete="off"
      class="w-full min-w-[7.5rem] bg-transparent pr-6 outline-none"
      @input="onInput"
      @blur="onBlur"
    />
    <button type="button" tabindex="-1" class="absolute right-2 text-slate-400 hover:text-teal-700" aria-label="Pick date" @click="openPicker">📅</button>
    <input ref="picker" type="date" :value="modelValue" class="absolute right-0 bottom-0 h-0 w-0 opacity-0 pointer-events-none" tabindex="-1" @input="emit('update:modelValue', $event.target.value)" />
  </span>
</template>
