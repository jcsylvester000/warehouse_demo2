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
// proper labeling: every option shows what it is (Item / Group / Assembly / Cart) + the right availability word.
function kindOf(o) { return o.kind || (o.is_assembly ? 'assembly' : (o.is_group ? 'group' : 'item')); }
const KL = { item: 'Item', group: 'Group', assembly: 'Assembly', cart: 'Cart' };
const KC = { item: 'bg-slate-100 text-slate-500', group: 'bg-emerald-100 text-emerald-700', assembly: 'bg-violet-100 text-violet-700', cart: 'bg-blue-100 text-blue-700' };
function kindLabel(o) { return KL[kindOf(o)] || 'Item'; }
function kindClass(o) { return KC[kindOf(o)] || KC.item; }
function availLabel(o) { const k = kindOf(o); return k === 'group' ? 'buildable' : (k === 'assembly' ? 'available' : 'on hand'); }
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
        class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-indigo-50"
        @mousedown.prevent="pick(o)"
      >
        <span class="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" :class="kindClass(o)">{{ kindLabel(o) }}</span>
        <span v-if="o.sku" class="font-mono text-[11px] text-slate-400 w-14 shrink-0">{{ o.sku }}</span>
        <span class="flex-1 min-w-0 truncate">
          <span class="text-slate-700">{{ o.name }}</span>
          <span v-if="o.sub" class="ml-1 text-xs text-slate-400">· {{ o.sub }}</span>
        </span>
        <span v-if="o.on_hand != null" class="shrink-0 text-xs tabular-nums" :class="o.on_hand > 0 ? 'text-slate-500' : 'text-rose-400'">{{ o.on_hand }} {{ availLabel(o) }}</span>
      </button>
      <div v-if="multi" class="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100 bg-slate-50/70 sticky bottom-0">Click to add — the list stays open so you can add several.</div>
    </div>
    <div v-else-if="open && q.trim()" class="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg px-3 py-2 text-sm text-slate-400">No matches.</div>
  </div>
</template>
