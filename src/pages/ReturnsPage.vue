<script setup>
import ReqTag from '@/components/ui/ReqTag.vue';
import { ref, reactive, computed } from 'vue';
import { useWarehouseStore } from '@/stores/warehouse';
import { useToast } from '@/composables/useToast';
import { money, fmtDateTime } from '@/utils/format';
import Hero from '@/components/ui/Hero.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import Btn from '@/components/ui/BaseButton.vue';
import Modal from '@/components/ui/BaseModal.vue';

const store = useWarehouseStore();
const toast = useToast();

const chips = computed(() => [
  { label: 'Returns', value: store.returns.length },
  { label: 'In transit', value: store.returns.filter((r) => r.status === 'in_transit').length },
  { label: 'Received', value: store.returns.filter((r) => r.status === 'received').length },
  { label: 'Refunded (PC)', value: money(store.returns.reduce((s, r) => s + (r.refund_total || 0), 0)) },
]);
const shippedSOs = computed(() => store.salesOrders.filter((s) => ['shipped', 'completed', 'in_progress'].includes(s.status)));

/* ---------- start a return (by source) ---------- */
const showStart = ref(false);
const start = reactive({ source_type: 'facility', source_id: '', so_ref: '', sel: [] });
const assetSearch = ref('');
function openStart() { Object.assign(start, { source_type: 'facility', source_id: store.facilities[0].id, so_ref: '', sel: [] }); assetSearch.value = ''; showStart.value = true; }
function onSourceType() { start.source_id = (start.source_type === 'facility' ? store.facilities[0] : start.source_type === 'regional' ? store.regionals[0] : store.employeeList[0]).id; start.sel = []; }
const sourceOptions = computed(() => (start.source_type === 'facility' ? store.facilities : start.source_type === 'regional' ? store.regionals : store.employeeList));
const assets = computed(() => {
  const list = store.returnableAssetsFor(start.source_type, start.source_id);
  const s = assetSearch.value.trim().toLowerCase();
  return list.filter((a) => !s || a.label.toLowerCase().includes(s) || (a.asset_tag || '').toLowerCase().includes(s));
});
function toggle(key) { const i = start.sel.indexOf(key); if (i > -1) start.sel.splice(i, 1); else start.sel.push(key); }
function selectAll() { start.sel = assets.value.map((a) => a.key); }
function doStart() {
  if (!start.sel.length) return toast.error('Select at least one asset (or use Select all).');
  const chosen = store.returnableAssetsFor(start.source_type, start.source_id).filter((a) => start.sel.includes(a.key));
  const ret = store.startAssetReturn({ source_type: start.source_type, source_id: start.source_id, so_ref: start.so_ref, assets: chosen });
  toast.success(ret.ret_no + ' started — ' + chosen.length + ' asset(s) in transit.');
  showStart.value = false;
}

/* ---------- confirm on arrival ---------- */
const showConfirm = ref(false); const cur = ref(null); const decisions = ref([]);
function openConfirm(ret) {
  cur.value = ret;
  decisions.value = ret.assets.map((a) => ({ key: a.key, label: a.label, kind: a.kind, cost: a.cost, asset_tag: a.asset_tag, received: true, components: (a.components || []).map((c) => ({ vendor_item_id: c.vendor_item_id, name: c.name, qty: c.qty, missing: 0 })) }));
  showConfirm.value = true;
}
const refundPreview = computed(() => decisions.value.filter((d) => d.received).reduce((s, d) => s + (Number(d.cost) || 0), 0));
const chargePreview = computed(() => decisions.value.filter((d) => d.received).reduce((s, d) => s + (d.components || []).reduce((cs, c) => cs + (Number(c.missing) || 0) * store.fifoUnitCost(c.vendor_item_id), 0), 0));
function doConfirm() {
  const payload = decisions.value.map((d) => ({ key: d.key, received: d.received, missing: (d.components || []).filter((c) => Number(c.missing) > 0).map((c) => ({ vendor_item_id: c.vendor_item_id, qty: Number(c.missing) })) }));
  const ret = store.confirmAssetReturn(cur.value.id, payload);
  toast.success(ret.ret_no + ' received — refund ' + money(ret.refund_total) + (ret.replacement_charge ? ', make-whole charge ' + money(ret.replacement_charge) : '') + '.');
  showConfirm.value = false;
}
</script>

<template>
  <div>
    <Hero title="Returns" subtitle="Asset returns by source. Confirm on arrival, refund the facility, and make returned carts whole." :chips="chips">
      <template #actions>
        <button class="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-white text-slate-800 hover:bg-white/90" @click="openStart()">+ New Return</button>
      </template>
    </Hero>

    <div class="mb-4 rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
      <div class="flex-1"><p><b>Only assets are returned.</b> Start from a <b>facility</b> or an <b>employee</b> and pick the assets. On arrival, confirm what was received. A returned <b>cart</b> is made whole (missing parts replaced from inventory, charged to the facility) and then comes back as a <b>Refurbished</b> unit in its own pool. <ReqTag ver="V7" code="FRESH-DATA" text="V7 — Returns start empty for fresh data. Click + New Return and pick the assets a facility or employee is sending back; 'Reset demo data' clears back to this state." /></p>
        <div class="mt-2 flex items-center gap-2 text-[12px]">
          <span class="font-semibold">Refurbished credit / value:</span>
          <input type="number" min="0" max="100" step="5" :value="Math.round(store.refurbCreditRate*100)" @change="store.setRefurbCreditRate(($event.target.value||0)/100)" class="w-16 h-7 px-2 rounded border border-amber-300 text-sm" /> <span>% of the cart's book cost</span> <span class="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5">PROVISIONAL — pending the final refund formula</span>
          <ReqTag ver="V6" code="CA-3" text="V6 CA-3 — the refund logic: a returned cart credits the facility this % of its book cost, and the refurbished cart is valued at that same amount. Placeholder rate; change here when the real refund formula is set." />
        </div></div>
    </div>

    <Card :padded="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider"><tr>
            <th class="px-5 py-2.5 text-left font-semibold">Return #</th><th class="px-5 py-2.5 text-left font-semibold">From</th><th class="px-5 py-2.5 text-left font-semibold">SO</th><th class="px-5 py-2.5 text-right font-semibold">Assets</th><th class="px-5 py-2.5 text-right font-semibold">Refund (PC)</th><th class="px-5 py-2.5 text-right font-semibold">Make-whole</th><th class="px-5 py-2.5 text-left font-semibold">Status</th><th class="px-5 py-2.5 text-left font-semibold">When</th><th class="px-5 py-2.5"></th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="r in store.returns" :key="r.id" class="hover:bg-slate-50/60">
              <td class="px-5 py-3 font-mono text-xs text-slate-700">{{ r.ret_no }}</td>
              <td class="px-5 py-3 text-slate-800"><Badge :tone="r.source_type==='facility'?'indigo':'violet'">{{ r.source_type }}</Badge> {{ r.source_label }}</td>
              <td class="px-5 py-3 font-mono text-xs text-slate-500">{{ r.so_ref || '—' }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ r.assets.length }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ r.status==='received' ? money(r.refund_total) : '—' }}</td>
              <td class="px-5 py-3 text-right tabular-nums" :class="r.replacement_charge?'text-amber-700':'text-slate-400'">{{ r.status==='received' ? (r.replacement_charge ? money(r.replacement_charge) : 'none') : '—' }}</td>
              <td class="px-5 py-3"><Badge :tone="r.status==='received'?'emerald':'amber'">{{ r.status==='received'?'Received':'In transit' }}</Badge></td>
              <td class="px-5 py-3 text-slate-500">{{ fmtDateTime(r.created_at) }}</td>
              <td class="px-5 py-3 text-right"><Btn v-if="r.status==='in_transit'" variant="soft-primary" size="sm" @click="openConfirm(r)">Confirm arrival</Btn></td>
            </tr>
            <tr v-if="!store.returns.length"><td colspan="9" class="px-5 py-10 text-center text-slate-400 text-sm">No returns yet — start one with “+ New Return”.</td></tr>
          </tbody>
        </table>
      </div>
    </Card>

    <!-- start return -->
    <Modal v-if="showStart" title="Start a return" sub="Where is it coming from? Search and pick the assets." wide @close="showStart=false">
      <div class="space-y-3">
        <div class="grid grid-cols-3 gap-3">
          <label class="text-sm"><span class="block text-slate-600 mb-1">Coming from</span><select v-model="start.source_type" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" @change="onSourceType"><option value="facility">A facility</option><option value="regional">A regional</option><option value="employee">An employee</option></select></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">{{ start.source_type==='facility'?'Facility':start.source_type==='regional'?'Regional':'Employee' }}</span><select v-model="start.source_id" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" @change="start.sel=[]"><option v-for="o in sourceOptions" :key="o.id" :value="o.id">{{ o.name }}</option></select></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">From SO (optional)</span><input v-model="start.so_ref" list="ret-so" placeholder="e.g. SO-2026-0142" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /><datalist id="ret-so"><option v-for="so in shippedSOs" :key="so.id" :value="so.so_number" /></datalist></label>
        </div>
        <div class="flex items-center gap-2">
          <input v-model="assetSearch" placeholder="Search assets by name or asset ID…" class="h-9 px-3 rounded-lg border border-slate-300 text-sm flex-1" />
          <Btn variant="secondary" size="sm" @click="selectAll">Select all</Btn>
        </div>
        <div class="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
          <label v-for="a in assets" :key="a.key" class="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
            <input type="checkbox" :checked="start.sel.includes(a.key)" @change="toggle(a.key)" />
            <Badge :tone="a.kind==='cart'?'purple':a.kind==='laptop'?'violet':'slate'">{{ a.kind }}</Badge>
            <span class="flex-1">{{ a.label }}</span>
            <span class="font-mono text-xs text-slate-400">{{ a.asset_tag }}</span>
            <span class="tabular-nums text-slate-500 w-20 text-right">{{ a.cost ? money(a.cost) : '—' }}</span>
          </label>
          <p v-if="!assets.length" class="px-3 py-6 text-center text-slate-400 text-sm">No returnable assets for this source.</p>
        </div>
        <p class="text-xs text-slate-500">{{ start.sel.length }} selected · only assets (carts, laptops, facility assets) can be returned.</p>
      </div>
      <template #footer><Btn variant="secondary" @click="showStart=false">Cancel</Btn><Btn @click="doStart">Start return</Btn></template>
    </Modal>

    <!-- confirm arrival -->
    <Modal v-if="showConfirm && cur" :title="'Confirm arrival · ' + cur.ret_no" sub="Tick what was received. For carts, mark any missing items to replace (charged to the facility)." wide @close="showConfirm=false">
      <div class="space-y-3">
        <div v-for="d in decisions" :key="d.key" class="rounded-xl border border-slate-200 overflow-hidden">
          <label class="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100 cursor-pointer">
            <input v-model="d.received" type="checkbox" />
            <Badge :tone="d.kind==='cart'?'purple':d.kind==='laptop'?'violet':'slate'">{{ d.kind }}</Badge>
            <span class="font-medium text-slate-800 flex-1">{{ d.label }}</span>
            <span class="font-mono text-xs text-slate-400">{{ d.asset_tag }}</span>
            <span class="text-sm text-slate-600">refund {{ money(d.cost) }}</span>
          </label>
          <div v-if="d.kind==='cart' && d.received" class="p-3">
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Make whole — mark missing items to replace from inventory</div>
            <table class="w-full text-sm"><tbody class="divide-y divide-slate-100">
              <tr v-for="(c,ci) in d.components" :key="ci"><td class="px-2 py-1.5 text-slate-700">{{ c.name }}</td><td class="px-2 py-1.5 text-right text-slate-400 text-xs">shipped with {{ c.qty }}</td><td class="px-2 py-1.5 text-right"><span class="text-xs text-slate-500 mr-2">missing</span><input v-model="c.missing" type="number" min="0" :max="c.qty" class="w-16 h-8 px-2 rounded border border-slate-300 text-right" /></td><td class="px-2 py-1.5 text-right tabular-nums text-amber-700">{{ (Number(c.missing)||0) ? money((Number(c.missing)||0)*store.fifoUnitCost(c.vendor_item_id)) : '—' }}</td></tr>
              <tr v-if="!d.components.length"><td colspan="4" class="px-2 py-3 text-center text-slate-400 text-xs">No recorded components for this cart.</td></tr>
            </tbody></table>
          </div>
        </div>
        <div class="rounded-lg bg-slate-50 ring-1 ring-slate-100 px-4 py-3 text-sm flex items-center justify-between">
          <span class="text-slate-500">Refund to facility (PC) <b class="text-slate-800">{{ money(refundPreview) }}</b></span>
          <span class="text-slate-500">Make-whole charge to facility <b class="text-amber-700">{{ money(chargePreview) }}</b></span>
        </div>
      </div>
      <template #footer><Btn variant="secondary" @click="showConfirm=false">Cancel</Btn><Btn variant="success" @click="doConfirm">Confirm received</Btn></template>
    </Modal>
  </div>
</template>
