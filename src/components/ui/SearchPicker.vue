<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  options: { type: Array, default: () => [] }, // [{ id, name, sku, sub, on_hand, is_group }]
  placeholder: { type: String, default: 'Search…' },
  excludeIds: { type: Array, default: () => [] },
  multi: { type: Boolean, default: false }, // I5/I6: keep open after a pick so several can be added in a row
});
const emit = defineEmits(['pick']);

const q = ref('');
const open = ref(false);
const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  return props.options
    .filter((o) => !props.excludeIds.includes(o.id))
    .filter((o) => {
      if (!s) return true;
      return (o.name || '').toLowerCase().includes(s) || String(o.sku || '').toLowerCase().includes(s) || (o.sub || '').toLowerCase().includes(s);
    })
    .slice(0, 40);
});
function pick(o) { emit('pick', o.id); q.value = ''; if (!props.multi) open.value = false; }
function blur() { setTimeout(() => { open.value = false; }, 150); }
</script>

<template>
  <div class="relative w-full">
    <div class="relative">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
      <input
        v-model="q"
        :placeholder="placeholder"
        class="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
        @focus="open = true"
        @input="open = true"
        @blur="blur"
      />
    </div>
    <div v-if="open && filtered.length" class="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
      <button
        v-for="o in filtered"
        :key="o.id"
        type="button"
        class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-indigo-50"
        @mousedown.prevent="pick(o)"
      >
        <span v-if="o.sku" class="font-mono text-[11px] text-slate-400 w-14 shrink-0">{{ o.sku }}</span>
        <span class="flex-1 min-w-0 truncate">
          <span class="text-slate-700">{{ o.name }}</span>
          <span v-if="o.is_group" class="ml-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">group</span>
          <span v-if="o.sub" class="ml-1 text-xs text-slate-400">· {{ o.sub }}</span>
        </span>
        <span v-if="o.on_hand != null" class="shrink-0 text-xs tabular-nums text-slate-400">{{ o.on_hand }} on hand</span>
      </button>
    </div>
    <div v-else-if="open && q.trim()" class="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg px-3 py-2 text-sm text-slate-400">No matches.</div>
  </div>
</template>
