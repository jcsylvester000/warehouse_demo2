<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useWarehouseStore, TODAY } from '@/stores/warehouse';
import { useToast } from '@/composables/useToast';
import { money, fmtDateTime, uid } from '@/utils/format';
import Hero from '@/components/ui/Hero.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import Btn from '@/components/ui/BaseButton.vue';
import Modal from '@/components/ui/BaseModal.vue';
import Tag from '@/components/ui/Tag.vue';
import SearchPicker from '@/components/ui/SearchPicker.vue';
import DocumentsModal from '@/components/ui/DocumentsModal.vue';
import ReqTag from '@/components/ui/ReqTag.vue';

const store = useWarehouseStore();
const toast = useToast();
const STATUSES = ['Not started', 'Deposit Sent', 'Production Started', 'Production Finished', 'Shipping'];

const poTotal = (po) => po.items.reduce((s, l) => s + (l.qty || 0) * (l.unit_cost || 0), 0);
const chips = computed(() => [
  { label: 'Total POs', value: store.purchaseOrders.length },
  { label: 'Open', value: store.purchaseOrders.filter((p) => p.status === 'open' || p.status === 'draft').length },
  { label: 'Partial', value: store.purchaseOrders.filter((p) => p.status === 'partial').length },
  { label: 'Received', value: store.purchaseOrders.filter((p) => p.status === 'received').length },
]);
const statusTone = (s) => ({ open: 'blue', draft: 'slate', partial: 'amber', received: 'emerald' }[s] || 'slate');

/* ---------- create / edit PO ---------- */
const showForm = ref(false); const editing = ref(false); const editReturnPO = ref(null);
const form = reactive({ id: null, vendor_id: '', order_date: TODAY, expected_date: '', notes: '', items: [], landed_costs: [], deposit: 0 });
const depositTouched = ref(false);
const lc = reactive({ label: '', amount: '' });
function openForm(po) {
  editing.value = !!po;
  if (po) Object.assign(form, JSON.parse(JSON.stringify({ id: po.id, vendor_id: po.vendor_id || store.vendors[0].id, order_date: po.order_date, expected_date: po.expected_date, notes: po.notes || '', items: po.items.map((l) => l.kind === 'group'
    ? { id: l.id, kind: 'group', group_id: l.group_id, name: l.name, qty: l.qty, qty_received: l.qty_received || 0, members: l.members || [], expanded: false }
    : { id: l.id, kind: 'item', vendor_item_id: l.vendor_item_id, name: l.name, qty: l.qty, qty_received: l.qty_received || 0, unit_cost: l.unit_cost }), landed_costs: po.landed_costs || [], deposit: po.deposit || 0 })));
  else Object.assign(form, { id: null, vendor_id: store.vendors[0].id, order_date: TODAY, expected_date: '', notes: '', items: [], landed_costs: [], deposit: 0 });
  depositTouched.value = !!po; // editing keeps the saved deposit; new auto-follows vendor rules
  Object.assign(lc, { label: '', amount: '' });
  showForm.value = true;
}
function afterFormClose() { showForm.value = false; if (editReturnPO.value) { const po = editReturnPO.value; editReturnPO.value = null; cur.value = po; showPO.value = true; } }
function onPick(id) {
  const g = store.groupById(id);
  if (g) {
    if (form.items.some((l) => l.kind === 'group' && l.group_id === id)) return;
    const exp = store.expandGroup(id, 1);
    const members = Object.keys(exp).map((k) => ({ vendor_item_id: k, name: (store.itemById(k) || {}).name, per_group: exp[k], unit_cost: (store.itemById(k) || {}).cost || 0 }));
    form.items.push({ id: uid('pol'), kind: 'group', group_id: id, name: g.name, qty: 1, qty_received: 0, members, expanded: true });
    return;
  }
  addItemLine(id, 1);
}
function addItemLine(itemId, qty) {
  const it = store.itemById(itemId); if (!it) return;
  const ex = form.items.find((l) => l.kind !== 'group' && l.vendor_item_id === itemId);
  if (ex) { ex.qty = Number(ex.qty) + qty; return; }
  form.items.push({ id: uid('pol'), kind: 'item', vendor_item_id: it.id, name: it.name, qty, qty_received: 0, unit_cost: it.cost });
}
const pickExclude = computed(() => form.items.map((l) => (l.kind === 'group' ? l.group_id : l.vendor_item_id)));
const landedTotal = computed(() => form.landed_costs.reduce((s, x) => s + (Number(x.amount) || 0), 0));
const formTotal = computed(() => form.items.reduce((s, l) => s + store.poLineGoods(l), 0));
const depositSuggestPct = computed(() => { const v = store.vendors.find((x) => x.id === form.vendor_id); return v ? (Number(v.deposit_percent) || 0) : 0; });
const suggestedDeposit = computed(() => store.poDepositFor(form.vendor_id, formTotal.value)); // R3 PO #1
watch(suggestedDeposit, (v) => { if (!depositTouched.value) form.deposit = v; }); // auto-fills from vendor rules, stays editable
function addLanded() { if (!lc.label.trim() || !(Number(lc.amount) > 0)) return toast.error('Enter what the cost is for and an amount.'); form.landed_costs.push({ id: uid('lc'), label: lc.label.trim(), amount: Number(lc.amount) }); Object.assign(lc, { label: '', amount: '' }); }
function saveForm() {
  if (!form.items.length) return toast.error('Add at least one item.');
  if (!form.vendor_id) return toast.error('Select a vendor.');
  const items = form.items.map((l) => l.kind === 'group'
    ? { id: l.id || uid('pol'), kind: 'group', group_id: l.group_id, name: l.name, qty: Number(l.qty) || 0, qty_received: l.qty_received || 0, members: JSON.parse(JSON.stringify(l.members || [])) }
    : { id: l.id || uid('pol'), kind: 'item', vendor_item_id: l.vendor_item_id, name: l.name, qty: Number(l.qty) || 0, qty_received: l.qty_received || 0, unit_cost: Number(l.unit_cost) || 0 });
  if (editing.value) { store.updatePO(form.id, { vendor_id: form.vendor_id, order_date: form.order_date, expected_date: form.expected_date, notes: form.notes, items, landed_costs: form.landed_costs, deposit: Number(form.deposit) || 0 }); toast.success('PO updated.'); }
  else { const po = { id: uid('po'), po_number: store.nextPoNumber(), vendor_id: form.vendor_id, order_date: form.order_date, expected_date: form.expected_date, status: 'open', progress: 'Not started', sent: null, notes: form.notes, landed_costs: form.landed_costs, payments: [], deposit: Number(form.deposit) || 0, items }; store.purchaseOrders.unshift(po); toast.success('PO ' + po.po_number + ' created.'); }
  afterFormClose();
}

/* ---------- vendor ---------- */
const showVendor = ref(false);
const vendorForm = reactive({ name: '', email: '', pay_terms: 'Net 30', deposit_percent: 0 });
function openVendor() { Object.assign(vendorForm, { name: '', email: '', pay_terms: 'Net 30', deposit_percent: 0 }); showVendor.value = true; }
function saveVendor() { if (!vendorForm.name.trim()) return toast.error('Vendor name required.'); const v = store.addVendor({ ...vendorForm }); form.vendor_id = v.id; toast.success('Vendor added.'); showVendor.value = false; }
const showManageVendors = ref(false);
function openManageVendors() { showManageVendors.value = true; }

/* ---------- PO detail hub (view all items, status dropdown, notes, payments, landed) ---------- */
const showPO = ref(false); const cur = ref(null);
function openPO(po) { cur.value = po; showPO.value = true; }
function setStatus(po, ev) { store.setPoStatus(po, ev.target.value); toast.info(po.po_number + ' → ' + po.progress); }
const pay = reactive({ amount: '', file: '', note: '' });
function onPayFile(e) { const f = e.target.files && e.target.files[0]; if (f) pay.file = f.name; }
function addPayment(po) { if (!(Number(pay.amount) > 0)) return toast.error('Enter a payment amount.'); store.addPoPayment(po, { amount: pay.amount, file: pay.file, note: pay.note }); Object.assign(pay, { amount: '', file: '', note: '' }); toast.success('Payment recorded.'); }
const dlc = reactive({ label: '', amount: '' });
function addDetailLanded(po) { if (!dlc.label.trim() || !(Number(dlc.amount) > 0)) return toast.error('Enter a label and amount.'); store.addPoLanded(po, dlc.label.trim(), dlc.amount); Object.assign(dlc, { label: '', amount: '' }); }
function saveNotes(po) { toast.success(po.po_number + ' saved.'); showPO.value = false; } // R3 PO #2: Save closes the PO
const depositPct = (po) => { const v = store.vendors.find((x) => x.id === po.vendor_id); return v ? (Number(v.deposit_percent) || 0) : 0; };
const detailSuggestedDeposit = (po) => store.poDepositFor(po.vendor_id, store.poGoodsTotal(po));
function useAutoDeposit(po) { po.deposit = detailSuggestedDeposit(po); }
function recordDeposit(po) { const amt = Number(po.deposit) || 0; if (amt <= 0) return toast.error('Set a deposit amount first.'); if ((po.payments || []).some((p) => p.note === 'Deposit')) return toast.error('A deposit payment is already recorded.'); store.addPoPayment(po, { amount: amt, note: 'Deposit' }); store.setPoStatus(po, 'Deposit Sent'); toast.success('Deposit recorded as a payment; status → Deposit Sent.'); }

/* ---------- send / resend ---------- */
const showSend = ref(false); const sendPO = ref(null); const sendForm = reactive({ to: '', cc: '', resend: false });
function openSend(po, resend) { sendPO.value = po; const v = store.vendors.find((x) => x.id === po.vendor_id); sendForm.to = v ? v.email : ''; sendForm.cc = ''; sendForm.resend = !!resend; showSend.value = true; }
function doSend() { store.sendPoToVendor(sendPO.value, sendForm.cc.trim(), sendForm.resend); toast.success('PO ' + sendPO.value.po_number + (sendForm.resend ? ' re-sent' : ' sent') + ' to vendor.'); showSend.value = false; }

/* ---------- receive (landed from PO + optional asset prompt) ---------- */
const showRecv = ref(false); const recvPO = ref(null); const recvLines = ref([]); const lastResult = ref(null);
const recvLandedTotal = computed(() => recvPO.value ? store.poLandedTotal(recvPO.value) : 0);
function openRecv(po) { recvPO.value = po; recvLines.value = po.items.map((l) => ({ id: l.id, name: l.name, is_group: l.kind === 'group', members: l.members || [], trackable: l.kind !== 'group' && store.isTrackableItem(l.vendor_item_id), ordered: l.qty, received: l.qty_received || 0, remaining: (l.qty || 0) - (l.qty_received || 0), qty: (l.qty || 0) - (l.qty_received || 0) })); showRecv.value = true; }
const recvUnits = computed(() => recvLines.value.filter((l) => l.qty > 0).reduce((s, l) => s + (l.is_group ? (l.members || []).reduce((a, m) => a + (Number(m.per_group) || 0), 0) * Number(l.qty) : Number(l.qty)), 0));
const landedPerUnitPreview = computed(() => recvUnits.value > 0 ? Math.round((recvLandedTotal.value / recvUnits.value) * 100) / 100 : 0);
function proceedReceive() {
  const lines = recvLines.value.filter((l) => l.qty > 0);
  if (!lines.length) return toast.error('Nothing to receive.');
  commitReceive(null); // V4 IT-3: tracked assets are created at ship-out / assembly, not at receiving.
}
function commitReceive(entries) {
  const lines = recvLines.value.filter((l) => l.qty > 0).map((l) => ({ id: l.id, qty: Number(l.qty) }));
  const res = store.receivePO(recvPO.value, lines, recvLandedTotal.value, entries);
  lastResult.value = { ro: res.ro, billIds: res.billIds, po: recvPO.value.po_number, landedPerUnit: res.landedPerUnit, assets: res.assetsCreated.length, remaining: store.poRemaining(recvPO.value) };
  toast.success('Received into ' + res.ro + ' — items added to inventory.');
  showRecv.value = false;
}
const showBills = ref(false); const showEmails = ref(false); const showDocs = ref(false);
onMounted(() => { const d = store.takePoDraft(); if (d && d.length) { openForm(); d.forEach((id) => onPick(id)); } });
</script>

<template>
  <div>
    <Hero title="Purchase Order" subtitle="Search & drop in items, set status, record payments, add internal landed costs, and receive into stock." :chips="chips">
      <template #actions>
        <button class="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-white/10 ring-1 ring-white/15 backdrop-blur text-white hover:bg-white/15" @click="showEmails=true">Sent log · {{ store.emails.length }}</button>
        <button class="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-white/10 ring-1 ring-white/15 backdrop-blur text-white hover:bg-white/15" @click="openVendor()">+ Add Vendor</button>
        <button class="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-white/10 ring-1 ring-white/15 backdrop-blur text-white hover:bg-white/15" @click="openManageVendors()">Manage Vendors <ReqTag ver="V4" code="PO-4" text="V4 PO #4 — Edit existing vendor terms and deposit %." /></button>
        <button class="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-white/10 ring-1 ring-white/15 backdrop-blur text-white hover:bg-white/15" @click="showBills=true">Vendor Bills · {{ (store.vendorBills||[]).length }}</button>
        <button class="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-white text-slate-800 hover:bg-white/90" @click="editReturnPO=null; openForm()">+ New PO</button>
      </template>
    </Hero>

    <div v-if="lastResult" class="mb-4 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-sm text-emerald-900 flex items-center gap-3">
      <span class="font-semibold">Received {{ lastResult.po }} → {{ lastResult.ro }}.</span>
      <span v-if="lastResult.landedPerUnit">Landed +{{ money(lastResult.landedPerUnit) }}/unit (carried on FIFO).</span>
      <span v-if="lastResult.billIds.length">Vendor bill(s): <b>{{ lastResult.billIds.join(', ') }}</b>.</span>
      <span v-if="lastResult.assets">{{ lastResult.assets }} asset(s) registered.</span>
      <span v-if="lastResult.remaining != null">Remaining owed: <b>{{ money(lastResult.remaining) }}</b>.</span>
      <button class="ml-auto text-emerald-500 hover:text-emerald-700" @click="lastResult=null">&times;</button>
    </div>

    <Card :padded="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider"><tr><th class="px-5 py-2.5 text-left font-semibold">PO #</th><th class="px-5 py-2.5 text-left font-semibold">Vendor</th><th class="px-5 py-2.5 text-left font-semibold">Status</th><th class="px-5 py-2.5 text-right font-semibold">Items</th><th class="px-5 py-2.5 text-right font-semibold">Total (incl. landed)</th><th class="px-5 py-2.5 text-left font-semibold">Receiving</th><th class="px-5 py-2.5"></th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="po in store.purchaseOrders" :key="po.id" class="hover:bg-indigo-50/40 cursor-pointer" @click="openPO(po)">
              <td class="px-5 py-3"><div class="font-mono text-xs text-slate-700">{{ po.po_number }}</div><div v-if="po.sent" class="text-[10px] text-emerald-600">✓ {{ po.sent.resent ? 're-sent' : 'sent' }} {{ po.sent.cc ? '· cc '+po.sent.cc : '' }}</div></td>
              <td class="px-5 py-3"><span class="font-medium text-slate-800">{{ store.vendorName(po.vendor_id) }}</span></td>
              <td class="px-5 py-3"><Badge tone="amber">{{ po.progress || 'Not started' }}</Badge></td>
              <td class="px-5 py-3 text-right tabular-nums">{{ po.items.length }}</td>
              <td class="px-5 py-3 text-right tabular-nums font-semibold">{{ money(store.poTotalWithLanded(po)) }}</td>
              <td class="px-5 py-3"><Badge :tone="statusTone(po.status)">{{ po.status }}</Badge></td>
              <td class="px-5 py-3 text-right whitespace-nowrap" @click.stop>
                <Btn variant="ghost" size="sm" @click="openPO(po)">Open</Btn>
                <Btn variant="ghost" size="sm" @click="openSend(po)">Send</Btn>
                <Btn v-if="po.status!=='received'" variant="soft-primary" size="sm" @click="openRecv(po)">Receive</Btn>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>

    <!-- PO detail hub -->
    <Modal v-if="showPO && cur" :title="cur.po_number" :sub="store.vendorName(cur.vendor_id)" wide @close="showPO=false">
      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <label class="text-sm"><span class="block text-slate-600 mb-1 text-xs">Status</span><select :value="cur.progress || 'Not started'" class="h-9 px-3 rounded-lg border border-slate-300 text-sm" @change="setStatus(cur, $event)"><option v-for="s in STATUSES" :key="s">{{ s }}</option></select></label>
          <div class="text-sm"><span class="block text-slate-600 mb-1 text-xs">Receiving</span><Badge :tone="statusTone(cur.status)">{{ cur.status }}</Badge></div>
          <div class="ml-auto flex gap-2">
            <span class="inline-flex items-center gap-1.5"><Btn variant="secondary" size="sm" @click="showDocs=true">Documents</Btn><Tag /></span>
            <Btn variant="secondary" size="sm" @click="showPO=false; editReturnPO=cur; openForm(cur)">Edit PO</Btn>
            <Btn variant="secondary" size="sm" @click="openSend(cur, !!cur.sent)">{{ cur.sent ? 'Resend' : 'Send' }}</Btn>
            <Btn v-if="cur.status!=='received'" variant="success" size="sm" @click="showPO=false; openRecv(cur)">Receive</Btn>
          </div>
        </div>

        <!-- all items -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">All items ({{ cur.items.length }})</div>
          <table class="w-full text-sm"><thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left px-4 py-2">Item</th><th class="text-left px-4 py-2">Vendor</th><th class="text-right px-4 py-2">Ordered</th><th class="text-right px-4 py-2">Received</th><th class="text-right px-4 py-2">Unit</th><th class="text-right px-4 py-2">Line</th></tr></thead>
            <tbody class="divide-y divide-slate-100"><template v-for="l in cur.items" :key="l.id"><tr><td class="px-4 py-2 text-slate-700">{{ l.name }}<Badge v-if="l.kind==='group'" tone="emerald" class="ml-1">group</Badge></td><td class="px-4 py-2 text-slate-500">{{ store.vendorName(cur.vendor_id) }}</td><td class="px-4 py-2 text-right tabular-nums">{{ l.qty }}</td><td class="px-4 py-2 text-right tabular-nums">{{ l.qty_received }}</td><td class="px-4 py-2 text-right tabular-nums">{{ l.kind==='group' ? '—' : money(l.unit_cost) }}</td><td class="px-4 py-2 text-right tabular-nums">{{ money(store.poLineGoods(l)) }}</td></tr><tr v-for="(m,mi) in (l.kind==='group'?l.members:[])" :key="l.id+'m'+mi" class="text-slate-500 bg-slate-50/40"><td class="px-4 py-1 pl-8 text-xs">↳ {{ m.name }}</td><td></td><td class="px-4 py-1 text-right text-xs">{{ (m.per_group||0)*(l.qty||0) }}</td><td></td><td class="px-4 py-1 text-right text-xs tabular-nums">{{ money(m.unit_cost) }}</td><td></td></tr></template></tbody>
            <tfoot>
              <tr><td colspan="5" class="px-4 py-1.5 text-right text-xs text-slate-400">Goods</td><td class="px-4 py-1.5 text-right tabular-nums text-slate-600">{{ money(store.poGoodsTotal(cur)) }}</td></tr>
              <tr><td colspan="5" class="px-4 py-1.5 text-right text-xs text-slate-400">Landed (internal)</td><td class="px-4 py-1.5 text-right tabular-nums text-amber-700">{{ money(store.poLandedTotal(cur)) }}</td></tr>
              <tr class="border-t border-slate-200"><td colspan="5" class="px-4 py-2 text-right text-xs uppercase text-slate-400">Total (incl. landed)</td><td class="px-4 py-2 text-right font-bold tabular-nums">{{ money(store.poTotalWithLanded(cur)) }}</td></tr>
            </tfoot>
          </table>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <!-- landed (internal only) -->
          <div class="rounded-xl border border-amber-200 overflow-hidden">
            <div class="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs font-semibold uppercase tracking-wide text-amber-800 flex items-center gap-2">Landed costs · internal only</div>
            <div class="p-3 space-y-2">
              <div v-for="x in (cur.landed_costs||[])" :key="x.id" class="flex items-center justify-between text-sm"><span class="text-slate-600">{{ x.label }}</span><span class="tabular-nums font-medium">{{ money(x.amount) }} <button class="text-rose-400 ml-1" @click="store.removePoLanded(cur, x.id)">&times;</button></span></div>
              <p v-if="!(cur.landed_costs||[]).length" class="text-xs text-slate-400">None yet.</p>
              <div class="flex items-end gap-2 pt-2 border-t border-amber-100">
                <label class="text-xs flex-1"><span class="block text-slate-500 mb-1">What for</span><input v-model="dlc.label" placeholder="e.g. Ocean freight" class="w-full h-8 px-2 rounded border border-amber-300 text-sm" /></label>
                <label class="text-xs w-24"><span class="block text-slate-500 mb-1">Amount</span><input v-model="dlc.amount" type="number" step="0.01" class="w-full h-8 px-2 rounded border border-amber-300 text-sm" /></label>
                <Btn variant="secondary" size="sm" @click="addDetailLanded(cur)">Add Landed Cost</Btn>
              </div>
              <p class="text-[11px] text-amber-700">Total landed <b>{{ money(store.poLandedTotal(cur)) }}</b> — spread per unit at receiving. Not sent to the vendor.</p>
            </div>
          </div>
          <!-- payments (editable, changed-flag, total, remaining) -->
          <div class="rounded-xl border border-slate-200 overflow-hidden">
            <div class="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">Payments to vendor <ReqTag code="PO-4" text="V3 PO #4 — Payments are editable, show a 'changed' indicator, and a running total." /> <ReqTag ver="V4" code="PO-2" text="V4 PO #2 — Once a deposit is recorded, the Record-Deposit option disappears." /></div>
            <div class="p-3 space-y-2">
              <div v-if="!(cur.payments||[]).some(p=>p.note==='Deposit')" class="flex items-end gap-2 pb-2 border-b border-slate-100">
                <label class="text-xs"><span class="block text-slate-500 mb-1">Deposit (auto {{ depositPct(cur) }}%)</span><input v-model.number="cur.deposit" type="number" step="0.01" class="w-28 h-8 px-2 rounded border border-slate-300 text-sm" /></label>
                <button class="text-[11px] text-indigo-600 underline pb-2" @click="useAutoDeposit(cur)">use {{ money(detailSuggestedDeposit(cur)) }}</button>
                <Btn variant="secondary" size="sm" class="ml-auto" @click="recordDeposit(cur)">Record deposit as payment</Btn>
              </div>
              <div v-for="p in (cur.payments||[])" :key="p.id" class="flex items-center gap-2 text-sm">
                <input :value="p.amount" type="number" step="0.01" class="w-24 h-8 px-2 rounded border border-slate-300 text-right text-sm" @change="store.updatePoPayment(cur, p.id, { amount: $event.target.value })" />
                <input :value="p.note" placeholder="note" class="flex-1 h-8 px-2 rounded border border-slate-300 text-sm" @change="store.updatePoPayment(cur, p.id, { note: $event.target.value })" />
                <Badge v-if="p.edited" tone="amber">changed</Badge>
                <span v-if="p.file" class="text-xs text-emerald-700" :title="p.file">📎</span>
                <button class="text-rose-400" @click="store.removePoPayment(cur, p.id)">&times;</button>
              </div>
              <p v-if="!(cur.payments||[]).length" class="text-xs text-slate-400">No payments recorded.</p>
              <div v-if="store.poRemaining(cur) > 0" class="flex items-end gap-2 pt-2 border-t border-slate-100">
                <label class="text-xs w-24"><span class="block text-slate-500 mb-1">Amount</span><input v-model="pay.amount" type="number" step="0.01" class="w-full h-8 px-2 rounded border border-slate-300 text-sm" /></label>
                <label class="text-xs flex-1"><span class="block text-slate-500 mb-1">Note</span><input v-model="pay.note" placeholder="Deposit / final" class="w-full h-8 px-2 rounded border border-slate-300 text-sm" /></label>
              </div>
              <div v-if="store.poRemaining(cur) > 0" class="flex items-center justify-between"><input type="file" class="text-xs" @change="onPayFile" /><Btn variant="secondary" size="sm" @click="addPayment(cur)">Record payment</Btn></div><p v-else class="text-[11px] text-emerald-700 font-semibold pt-2 border-t border-slate-100">Paid in full ✓ — no further payment needed. <ReqTag ver="V4" code="PO-5" text="V4 PO #5 — When the PO is fully paid, the Record-Payment option is hidden." /></p>
              <div class="pt-2 border-t border-slate-100 text-xs space-y-1">
                <div class="flex justify-between"><span class="text-slate-500">Payments total</span><b class="tabular-nums">{{ money(store.poPaymentsTotal(cur)) }}</b></div>
                <div class="flex justify-between"><span class="text-slate-500">Remaining owed (goods) <ReqTag code="PO-3" text="V3 PO #3 — Remaining balance owed is shown after receiving." /></span><b class="tabular-nums" :class="store.poRemaining(cur) > 0 ? 'text-rose-600' : 'text-emerald-700'">{{ money(store.poRemaining(cur)) }}</b></div>
              </div>
            </div>
          </div>
        </div>

        <!-- notes -->
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Notes</span><textarea v-model="cur.notes" rows="2" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"></textarea></label>
      </div>
      <template #footer><Btn variant="secondary" @click="showPO=false">Close</Btn><ReqTag code="PO-2" text="V3 PO #2 — Save closes the PO." /><Btn @click="saveNotes(cur)">Save</Btn></template>
    </Modal>

    <!-- New / edit PO -->
    <Modal v-if="showForm" :title="editing ? ('Edit ' + (store.purchaseOrders.find(p=>p.id===form.id)||{}).po_number) : 'New Purchase Order'" wide @close="afterFormClose()">
      <div class="space-y-4">
        <div class="grid grid-cols-3 gap-4">
          <div class="text-sm"><span class="block text-slate-600 mb-1">Vendor</span><div class="flex gap-2"><select v-model="form.vendor_id" class="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm"><option v-for="v in store.vendors" :key="v.id" :value="v.id">{{ v.name }}</option></select><Btn variant="secondary" size="sm" @click="openVendor()">+ Add</Btn></div></div>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Order date</span><input v-model="form.order_date" type="date" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Expected</span><input v-model="form.expected_date" type="date" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Deposit <ReqTag code="PO-1" text="V3 PO #1 — Deposit auto-fills from the vendor's deposit rule and stays editable." /> <ReqTag ver="V4" code="PO-3" text="V4 PO #3 — Deposit now calculates correctly off the bill total via vendor rules (set the % in Manage Vendors)." /> <span class="text-[10px] text-slate-400">auto {{ depositSuggestPct }}% of total</span></span><input v-model.number="form.deposit" type="number" step="0.01" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" @input="depositTouched=true" /></label>
        </div>

        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-100"><span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Items — search & click to drop in (items and groups in one list) <ReqTag ver="V4" code="PO-1" text="V4 PO #1 — A group on a PO is ONE line; set the group qty once and every item inside scales (same as the Sales Order)." /></span><div class="mt-2"><SearchPicker :options="store.catalogLite" :exclude-ids="pickExclude" placeholder="Search item number or name…" @pick="onPick" /></div></div>
          <table class="w-full text-sm">
            <thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left px-4 py-2">Item / Group</th><th class="text-right px-4 py-2">Qty</th><th class="text-right px-4 py-2">Unit</th><th class="text-right px-4 py-2">Line</th><th></th></tr></thead>
            <tbody class="divide-y divide-slate-100">
              <template v-for="(l,idx) in form.items" :key="l.id">
                <tr>
                  <td class="px-4 py-2 text-slate-700"><button v-if="l.kind==='group'" class="mr-1 text-slate-400" @click="l.expanded=!l.expanded">{{ l.expanded ? '▾' : '▸' }}</button>{{ l.name }}<Badge v-if="l.kind==='group'" tone="emerald" class="ml-1">group</Badge></td>
                  <td class="px-4 py-2 text-right"><input v-model="l.qty" type="number" min="1" class="w-16 h-8 px-2 rounded border border-slate-300 text-right" /></td>
                  <td class="px-4 py-2 text-right"><input v-if="l.kind!=='group'" v-model="l.unit_cost" type="number" step="0.01" class="w-20 h-8 px-2 rounded border border-slate-300 text-right" /><span v-else class="text-slate-400">—</span></td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ money(store.poLineGoods(l)) }}</td>
                  <td class="px-4 py-2 text-right"><button class="text-rose-500" @click="form.items.splice(idx,1)">&times;</button></td>
                </tr>
                <template v-if="l.kind==='group' && l.expanded">
                  <tr v-for="(m,mi) in l.members" :key="l.id+'-'+mi" class="text-slate-500 bg-slate-50/40">
                    <td class="px-4 py-1.5 pl-10 text-xs">↳ {{ m.name }}</td>
                    <td class="px-4 py-1.5 text-right text-xs tabular-nums">{{ m.per_group }} × {{ l.qty||0 }} = <b class="text-slate-700">{{ (m.per_group||0) * (Number(l.qty)||0) }}</b></td>
                    <td class="px-4 py-1.5 text-right text-xs tabular-nums">{{ money(m.unit_cost) }}</td>
                    <td class="px-4 py-1.5 text-right text-xs tabular-nums">{{ money((m.per_group||0) * (Number(l.qty)||0) * (Number(m.unit_cost)||0)) }}</td>
                    <td></td>
                  </tr>
                </template>
              </template>
              <tr v-if="!form.items.length"><td colspan="5" class="px-4 py-6 text-center text-slate-400">No items — search above to add.</td></tr>
            </tbody>
            <tfoot><tr class="border-t border-slate-200"><td colspan="2"></td><td class="px-4 py-2 text-right text-xs uppercase text-slate-400">Goods</td><td class="px-4 py-2 text-right font-bold tabular-nums">{{ money(formTotal) }}</td><td></td></tr></tfoot>
          </table>
        </div>

        <!-- landed cost (internal only, multiple) -->
        <div class="rounded-xl border border-amber-200 overflow-hidden">
          <div class="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs font-semibold uppercase tracking-wide text-amber-800 flex items-center gap-2">Landed costs (shipping / duty) — internal only, not sent to vendor</div>
          <div class="p-3 space-y-2">
            <div v-for="(x,i) in form.landed_costs" :key="x.id" class="flex items-center justify-between text-sm"><span class="text-slate-600">{{ x.label }}</span><span class="tabular-nums font-medium">{{ money(x.amount) }} <button class="text-rose-400 ml-1" @click="form.landed_costs.splice(i,1)">&times;</button></span></div>
            <div class="flex items-end gap-2 pt-1">
              <label class="text-xs flex-1"><span class="block text-slate-500 mb-1">What is the cost for</span><input v-model="lc.label" placeholder="e.g. Ocean freight, Import duty" class="w-full h-8 px-2 rounded border border-amber-300 text-sm" /></label>
              <label class="text-xs w-24"><span class="block text-slate-500 mb-1">Amount</span><input v-model="lc.amount" type="number" step="0.01" class="w-full h-8 px-2 rounded border border-amber-300 text-sm" /></label>
              <Btn variant="secondary" size="sm" @click="addLanded">Add Landed Cost</Btn>
            </div>
            <p class="text-[11px] text-amber-700">Total landed <b>{{ money(landedTotal) }}</b> — spread per unit at receiving and carried with the item via FIFO.</p>
          </div>
        </div>

        <label class="text-sm block"><span class="block text-slate-600 mb-1">Notes</span><input v-model="form.notes" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
      </div>
      <template #footer><Btn variant="secondary" @click="afterFormClose()">{{ editReturnPO ? '← Back' : 'Cancel' }}</Btn><Btn @click="saveForm">{{ editing ? 'Save changes' : 'Create PO' }}</Btn></template>
    </Modal>

    <!-- add vendor -->
    <Modal v-if="showVendor" title="Add vendor" @close="showVendor=false">
      <div class="grid grid-cols-2 gap-4">
        <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Name *</span><input v-model="vendorForm.name" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Email</span><input v-model="vendorForm.email" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm"><span class="block text-slate-600 mb-1">Pay terms</span><select v-model="vendorForm.pay_terms" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option>Net 15</option><option>Net 30</option><option>Net 60</option><option>Prepaid</option></select></label>
        <label class="text-sm"><span class="block text-slate-600 mb-1">Deposit %</span><input v-model="vendorForm.deposit_percent" type="number" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
      </div>
      <template #footer><Btn variant="secondary" @click="showVendor=false">Cancel</Btn><Btn @click="saveVendor">Add vendor</Btn></template>
    </Modal>

    <!-- manage vendors (V4 PO-4) -->
    <Modal v-if="showManageVendors" title="Manage vendors" sub="Edit terms and deposit rules for existing vendors — drives the auto-filled deposit on new POs." wide @close="showManageVendors=false">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left px-3 py-2">Vendor</th><th class="text-left px-3 py-2">Email</th><th class="text-left px-3 py-2">Pay terms</th><th class="text-right px-3 py-2">Deposit %</th></tr></thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="v in store.vendors" :key="v.id">
            <td class="px-3 py-2"><input v-model="v.name" class="w-full h-8 px-2 rounded border border-slate-300 text-sm" /></td>
            <td class="px-3 py-2"><input v-model="v.email" class="w-full h-8 px-2 rounded border border-slate-300 text-sm" /></td>
            <td class="px-3 py-2"><select v-model="v.pay_terms" class="h-8 px-2 rounded border border-slate-300 text-sm"><option>Net 15</option><option>Net 30</option><option>Net 60</option><option>Prepaid</option></select></td>
            <td class="px-3 py-2 text-right"><input v-model.number="v.deposit_percent" type="number" min="0" max="100" class="w-20 h-8 px-2 rounded border border-slate-300 text-right text-sm" /></td>
          </tr>
        </tbody>
      </table>
      <p class="mt-3 text-xs text-slate-500">Deposit % drives the auto-filled deposit on a PO (e.g. 100% of a $350 order = $350).</p>
      <template #footer><Btn @click="showManageVendors=false">Done</Btn></template>
    </Modal>

    <!-- send / resend -->
    <Modal v-if="showSend" :title="(sendForm.resend ? 'Resend ' : 'Send ') + (sendPO?sendPO.po_number:'') + ' to vendor'" sub="Simulated email — recorded in the Sent log. Landed costs are withheld (internal only)." @close="showSend=false">
      <div class="space-y-3">
        <label class="text-sm block"><span class="block text-slate-600 mb-1">To (vendor)</span><input v-model="sendForm.to" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm bg-slate-50" readonly /></label>
        <label class="text-sm block"><span class="block text-slate-600 mb-1">CC (comma-separated)</span><input v-model="sendForm.cc" placeholder="cfo@carease.com, ops@carease.com" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <p class="text-xs text-slate-500">Sends the PO (items, quantities, prices). Internal landed costs are <b>not</b> included.</p>
      </div>
      <template #footer><Btn variant="secondary" @click="showSend=false">Cancel</Btn><Btn @click="doSend">{{ sendForm.resend ? 'Resend PO' : 'Send PO' }}</Btn></template>
    </Modal>

    <!-- receive -->
    <Modal v-if="showRecv" :title="'Receive ' + (recvPO?recvPO.po_number:'')" sub="Landed cost (from the PO) spreads per unit. Items move straight into inventory — no asset prompt; asset info is captured later at assembly." wide @close="showRecv=false">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left px-3 py-2">Item</th><th class="text-left px-3 py-2">Vendor</th><th class="text-right px-3 py-2">Ordered</th><th class="text-right px-3 py-2">Received</th><th class="text-right px-3 py-2">Remaining</th><th class="text-right px-3 py-2">Receive now</th></tr></thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="l in recvLines" :key="l.id"><td class="px-3 py-2 text-slate-700">{{ l.name }}<Badge v-if="l.is_group" tone="emerald" class="ml-1">group</Badge><Badge v-if="l.trackable" tone="violet" class="ml-1">tracked</Badge></td><td class="px-3 py-2 text-slate-500">{{ store.vendorName(recvPO && recvPO.vendor_id) }}</td><td class="px-3 py-2 text-right tabular-nums">{{ l.ordered }}</td><td class="px-3 py-2 text-right tabular-nums">{{ l.received }}</td><td class="px-3 py-2 text-right tabular-nums">{{ l.remaining }}</td><td class="px-3 py-2 text-right"><input v-model="l.qty" type="number" min="0" :max="l.remaining" class="w-20 h-8 px-2 rounded border border-slate-300 text-right" /></td></tr>
        </tbody>
      </table>
      <div class="mt-4 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-900 flex items-center gap-2">Landed total <b>{{ money(recvLandedTotal) }}</b> = <b>{{ money(landedPerUnitPreview) }}/unit</b> on {{ recvUnits }} unit(s). Rides on top of base; carries with the item when it ships.</div>
      <p class="mt-2 text-xs text-slate-400">V4: tracked assets are created when items ship out (or when a cart is assembled), not at receiving.</p>
      <template #footer><Btn variant="secondary" @click="showRecv=false">Cancel</Btn><Btn variant="success" @click="proceedReceive">Receive &amp; post</Btn></template>
    </Modal>

<!-- Amendment: no asset-entry prompt at receiving — items move straight into inventory; asset info is entered later, at the assembly step. -->

    <!-- bills -->
    <Modal v-if="showBills" title="Vendor bills" sub="One bill per vendor on receiving (includes landed cost)." wide @close="showBills=false">
      <table class="w-full text-sm"><thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left px-3 py-2">Bill</th><th class="text-left px-3 py-2">Vendor</th><th class="text-left px-3 py-2">PO</th><th class="text-left px-3 py-2">Receiving</th><th class="text-right px-3 py-2">Total</th></tr></thead>
        <tbody class="divide-y divide-slate-100"><tr v-for="b in (store.vendorBills||[])" :key="b.id"><td class="px-3 py-2 font-mono text-xs">{{ b.id }}</td><td class="px-3 py-2">{{ store.vendorName(b.vendor_id) }}</td><td class="px-3 py-2 font-mono text-xs text-slate-500">{{ b.po_number }}</td><td class="px-3 py-2 font-mono text-xs text-slate-500">{{ b.receiving_no }}</td><td class="px-3 py-2 text-right font-semibold tabular-nums">{{ money(b.total) }}</td></tr>
        <tr v-if="!(store.vendorBills||[]).length"><td colspan="5" class="px-3 py-8 text-center text-slate-400">No bills yet.</td></tr></tbody></table>
    </Modal>

    <!-- emails -->
    <Modal v-if="showEmails" title="Sent log & notifications" sub="Simulated emails (PO-to-vendor and customer notifications)." wide @close="showEmails=false">
      <table class="w-full text-sm"><thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left px-3 py-2">Kind</th><th class="text-left px-3 py-2">To</th><th class="text-left px-3 py-2">CC</th><th class="text-left px-3 py-2">Subject</th></tr></thead>
        <tbody class="divide-y divide-slate-100"><tr v-for="e in store.emails" :key="e.id"><td class="px-3 py-2"><Badge :tone="e.kind==='PO to vendor'?'blue':'emerald'">{{ e.kind }}</Badge></td><td class="px-3 py-2 text-slate-700">{{ e.to }}</td><td class="px-3 py-2 text-slate-500">{{ e.cc || '—' }}</td><td class="px-3 py-2 text-slate-600">{{ e.subject }}</td></tr>
        <tr v-if="!store.emails.length"><td colspan="4" class="px-3 py-8 text-center text-slate-400">No messages yet.</td></tr></tbody></table>
    </Modal>
    <DocumentsModal v-if="showDocs && cur" kind="po" :order="cur" @close="showDocs=false" />
  </div>
</template>
