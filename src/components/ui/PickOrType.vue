<script setup>
import { ref, computed, watch } from 'vue';

/*
  PickOrType — a dropdown of known values with a "＋ Other…" escape hatch.
  Keeps data clean (users pick from the canonical list) without trapping them
  when a genuinely new value is needed. v-model is a plain string, so it is a
  drop-in replacement for the old <input list="…"> datalists.
*/
const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] }, // array of strings
  placeholder: { type: String, default: '— choose —' },
});
const emit = defineEmits(['update:modelValue']);

const OTHER = '__other__';
const otherMode = ref(false);
const selVal = computed({
  get() {
    if (otherMode.value) return OTHER;
    if (props.modelValue && !props.options.includes(props.modelValue)) return OTHER;
    return props.modelValue || '';
  },
  set(v) {
    if (v === OTHER) { otherMode.value = true; emit('update:modelValue', ''); }
    else { otherMode.value = false; emit('update:modelValue', v); }
  },
});
watch(() => props.modelValue, (v) => {
  if (v && !props.options.includes(v)) otherMode.value = true;
}, { immediate: true });

function onText(e) { emit('update:modelValue', e.target.value); }
</script>

<template>
  <div class="flex gap-2">
    <select
      :value="selVal"
      @change="selVal = $event.target.value"
      class="h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white"
      :class="otherMode ? 'w-32 shrink-0' : 'w-full'"
    >
      <option value="">{{ placeholder }}</option>
      <option v-for="o in options" :key="o" :value="o">{{ o }}</option>
      <option :value="OTHER">＋ Other…</option>
    </select>
    <input
      v-if="otherMode"
      :value="modelValue"
      @input="onText"
      placeholder="Type a new value"
      class="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm"
    />
  </div>
</template>
