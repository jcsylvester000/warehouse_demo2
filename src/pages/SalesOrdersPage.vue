<script setup>
import { ref, reactive, computed } from 'vue';
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
import AddressAutocomplete from '@/components/ui/AddressAutocomplete.vue';
import DocumentsModal from '@/components/ui/DocumentsModal.vue';
import { useDocViewer } from '@/composables/useDocViewer';
import { courierFor, qrDataUrl, barWidths } from '@/utils/labels';
import ReqTag from '@/components/ui/ReqTag.vue';

const store = useWarehouseStore();
const toast = useToast();
const docViewer = useDocViewer();
function viewDoc(name, kind, facility, order) { docViewer.open({ name, kind, facility, order }); }

const soTotal = (so) => store.soGoodsTotal(so) + store.soOutboundTotal(so);
const chips = computed(() => [
  { label: 'Total SOs', value: store.salesOrders.length },
  { label: 'In Progress', value: store.salesOrders.filter((s) => s.status === 'in_progress').length },
  { label: 'Back orders', value: store.salesOrders.filter((s) => s.status === 'backorder').length },
  { label: 'Shipped', value: store.salesOrders.filter((s) => ['shipped', 'completed'].includes(s.status)).length },
]);
const statusTone = (s) => ({ draft: 'slate', in_progress: 'amber', shipped: 'blue', completed: 'emerald', backorder: 'rose' }[s] || 'slate');
const statusLabel = (s) => ({ draft: 'Draft', in_progress: 'In Progress', shipped: 'Shipped', completed: 'Completed', backorder: 'Back order' }[s] || s);
const backordersReady = computed(() => store.backordersReady());
// M3: filter the order list by status (e.g. warehouse shows only confirmed orders).
const soFilter = ref('all');
const SO_FILTERS = [['all', 'All'], ['draft', 'Draft'], ['in_progress', 'Confirmed'], ['shipped', 'Shipped'], ['completed', 'Completed'], ['backorder', 'Back orders']];
const visibleSOs = computed(() => soFilter.value === 'all' ? store.salesOrders : store.salesOrders.filter((s) => s.status === soFilter.value));

const showConfirmDlg = ref(false); const confirmSOref = ref(null);
const confirmRegional = computed(() => { const so = confirmSOref.value; if (!so) return null; const rid = so.regional_id || (store.facilityById(so.facility_id) || {}).regional_id; return store.regionalById(rid); });
function openConfirm(so) { confirmSOref.value = so; showConfirmDlg.value = true; }
function doConfirm(actor) { const so = confirmSOref.value; if (!so) return; store.confirmSo(so, actor); toast.success(so.so_number + ' confirmed by ' + actor.name + ' (' + actor.role + ') — shipment queued.'); showConfirmDlg.value = false; }
function completeSo(so) { store.completeSalesOrder(so); toast.success(so.so_number + ' completed — delivered (proof of delivery recorded).'); }
function reverse(so) { store.reverseShip(so); toast.info(so.so_number + ' shipment reversed — stock returned.'); }
function shipBackorder(so) { if (so.status === 'backorder') so.status = 'in_progress'; openShip(so); }

const facUnderRegional = (rid) => store.facilities.filter((f) => f.regional_id === rid);
const itemOnHand = (id) => (store.itemById(id) || {}).qty_onhand || 0;
const lineUnitCost = (l) => store.soLineUnitCost(l);
const lineAvail = (l) => { if (l.kind === 'assembly') return store.availableUnits(l.assembly_id).length; if (l.kind === 'group') { const ms = l.members || []; if (!ms.length) return 0; return Math.floor(Math.min(...ms.map((m) => itemOnHand(m.vendor_item_id) / (Number(m.per_group) || 1)))); } return itemOnHand(l.vendor_item_id); };

/* recipient list label for the table */
function recipientLabel(so) {
  if (so.recipient_type === 'facility') return (store.facilityById(so.recipient_id) || store.facilityById(so.facility_id) || {}).name || '—';
  if (so.recipient_type === 'regional') return 'Regional · ' + ((store.regionalById(so.recipient_id) || {}).name || '');
  const u = store.userById(so.recipient_id); return u ? ((so.recipient_type === 'provider' ? 'Provider · ' : 'Employee · ') + u.name) : ((store.facilityById(so.facility_id) || {}).name || '—');
}

/* ---------------- create / edit SO ---------------- */
const showForm = ref(false); const editing = ref(false);
const blank = () => ({ id: null, so_number: '', recipient_type: 'facility', recipient_id: '', recipient_label: '', ship_to_type: 'recipient', facility_id: '', regional_id: '', shipping_address: '', custom_address: '', order_date: TODAY, expected_date: '', delivery_method: 'Freight', shipping_cost: 0, landed_costs: [], notes: '', items: [] });
const form = reactive(blank());
const lc = reactive({ label: '', amount: '' });
function openForm(so) {
  editing.value = !!so;
  if (so) {
    Object.assign(form, JSON.parse(JSON.stringify({ ...blank(), id: so.id, so_number: so.so_number, recipient_type: so.recipient_type || 'facility', recipient_id: so.recipient_id || so.facility_id || '', ship_to_type: so.ship_to_type === 'address' ? 'address' : 'recipient', facility_id: so.facility_id || '', regional_id: so.regional_id || '', shipping_address: so.shipping_address || '', order_date: so.order_date, expected_date: so.expected_date, delivery_method: so.delivery_method, shipping_cost: so.shipping_cost || 0, landed_costs: so.landed_costs || [], notes: so.notes || '',
      items: (so.items || []).map((l) => l.kind === 'group'
        ? { kind: 'group', group_id: l.group_id, name: l.name, facility_id: l.facility_id, qty: l.qty, qty_shipped: l.qty_shipped || 0, shipped_cost_total: l.shipped_cost_total || 0, shipped_detail: l.shipped_detail || [], members: l.members || [], expanded: false }
        : { kind: 'item', vendor_item_id: l.vendor_item_id, name: l.name, facility_id: l.facility_id, qty: l.qty, qty_shipped: l.qty_shipped || 0, shipped_cost_total: l.shipped_cost_total || 0, shipped_detail: l.shipped_detail || [], unit_cost: l.unit_cost }) })));
    form.recipient_label = recipientLabel(so);
    if (form.ship_to_type === 'address') form.custom_address = form.shipping_address;
  } else {
    Object.assign(form, blank());
    onRecipientPick('facility:' + store.facilities[0].id);
  }
  Object.assign(lc, { label: '', amount: '' });
  showForm.value = true;
}
/* R3 SO #1: one unified recipient search */
function onRecipientPick(compositeId) {
  const rec = store.recipients.find((r) => r.id === compositeId); if (!rec) return;
  form.recipient_type = rec.kind; form.recipient_id = compositeId.split(':')[1]; form.recipient_label = rec.name + '  (' + rec.kind + ')';
  if (rec.kind === 'facility') { form.facility_id = rec.facility_id; form.regional_id = rec.regional_id; }
  else if (rec.kind === 'regional') { form.regional_id = rec.regional_id; form.facility_id = (facUnderRegional(rec.regional_id)[0] || {}).id || ''; }
  else { const fac = store.facilities.find((f) => f.name === rec.facility_name); form.facility_id = fac ? fac.id : store.facilities[0].id; form.regional_id = fac ? fac.regional_id : ''; }
  if (form.ship_to_type === 'recipient') form.shipping_address = rec.address;
}
function onShipToType() {
  if (form.ship_to_type === 'recipient') onRecipientPick(form.recipient_type + ':' + form.recipient_id);
  else if (form.ship_to_type === 'facility') { const f = store.facilityById(form.facility_id || store.facilities[0].id); form.facility_id = f.id; form.shipping_address = f.name + ' · ' + f.address; }
  else if (form.ship_to_type === 'regional') { const r = store.regionalById(form.regional_id || store.regionals[0].id); form.regional_id = r.id; form.shipping_address = r.name + ' · ' + r.address; }
  else if (form.ship_to_type === 'address') { form.shipping_address = form.custom_address || ''; }
}
function onShipFacility() { const f = store.facilityById(form.facility_id); if (f) form.shipping_address = f.name + ' · ' + f.address; }
function onShipRegional() { const r = store.regionalById(form.regional_id); if (r) form.shipping_address = r.name + ' · ' + r.address; }
function defaultLineFacility() { return form.facility_id || (facUnderRegional(form.regional_id)[0] || {}).id || store.facilities[0].id; }
/* R3 SO group line: a group is ONE line that scales every member */
function onItemPick(id) {
  const a = store.assemblyById(id);
  if (a) { form.items.push({ kind: 'assembly', assembly_id: id, name: a.name, facility_id: defaultLineFacility(), qty: 1, qty_shipped: 0, shipped_cost_total: 0, shipped_units: [] }); return; }
  const g = store.groupById(id);
  if (g) {
    const exp = store.expandGroup(id, 1);
    const members = Object.keys(exp).map((k) => ({ vendor_item_id: k, name: (store.itemById(k) || {}).name, per_group: exp[k] }));
    form.items.push({ kind: 'group', group_id: id, name: g.name, facility_id: defaultLineFacility(), qty: 1, qty_shipped: 0, shipped_cost_total: 0, shipped_detail: [], members, expanded: true });
    return;
  }
  const it = store.itemById(id); if (!it) return;
  form.items.push({ kind: 'item', vendor_item_id: id, name: it.name, facility_id: defaultLineFacility(), qty: 1, qty_shipped: 0, shipped_cost_total: 0, shipped_detail: [], unit_cost: store.fifoUnitCost(id) });
}
const formGoods = computed(() => form.items.reduce((s, l) => s + (Number(l.qty) || 0) * lineUnitCost(l), 0));
const outLandedTotal = computed(() => form.landed_costs.reduce((s, x) => s + (Number(x.amount) || 0), 0) + (Number(form.shipping_cost) || 0));
const formTotal = computed(() => formGoods.value + outLandedTotal.value);
const formFacilityCharges = computed(() => { const out = {}; form.items.forEach((l) => { const fid = l.facility_id || defaultLineFacility(); out[fid] = (out[fid] || 0) + (Number(l.qty) || 0) * lineUnitCost(l); }); return out; });
const editHasShipped = computed(() => editing.value && form.items.some((l) => (l.qty_shipped || 0) > 0));
function addLanded() { if (!lc.label.trim() || !(Number(lc.amount) > 0)) return toast.error('Enter what the cost is for and an amount.'); form.landed_costs.push({ id: uid('lc'), label: lc.label.trim(), amount: Number(lc.amount) }); Object.assign(lc, { label: '', amount: '' }); }
function reverseFromEdit() { const so = store.salesOrders.find((x) => x.id === form.id); if (!so) return; store.reverseShip(so); toast.info(so.so_number + ' shipment reversed — stock returned.'); openForm(so); }
function saveForm() {
  if (!form.recipient_id) return toast.error('Choose who this order is for.');
  if (!form.items.length) return toast.error('Add at least one item.');
  if (form.ship_to_type === 'address') form.shipping_address = form.custom_address || form.shipping_address;
  const items = form.items.map((l) => l.kind === 'assembly'
    ? { kind: 'assembly', assembly_id: l.assembly_id, name: l.name, facility_id: l.facility_id || defaultLineFacility(), qty: Math.max(Number(l.qty) || 0, l.qty_shipped || 0), qty_shipped: l.qty_shipped || 0, shipped_cost_total: l.shipped_cost_total || 0, shipped_units: l.shipped_units || [] }
    : l.kind === 'group'
    ? { kind: 'group', group_id: l.group_id, name: l.name, facility_id: l.facility_id || defaultLineFacility(), qty: Math.max(Number(l.qty) || 0, l.qty_shipped || 0), qty_shipped: l.qty_shipped || 0, shipped_cost_total: l.shipped_cost_total || 0, shipped_detail: l.shipped_detail || [], members: JSON.parse(JSON.stringify(l.members || [])) }
    : { kind: 'item', vendor_item_id: l.vendor_item_id, name: l.name, facility_id: l.facility_id || defaultLineFacility(), qty: Math.max(Number(l.qty) || 0, l.qty_shipped || 0), qty_shipped: l.qty_shipped || 0, shipped_cost_total: l.shipped_cost_total || 0, shipped_detail: l.shipped_detail || [], unit_cost: store.fifoUnitCost(l.vendor_item_id) });
  const base = { recipient_type: form.recipient_type, recipient_id: form.recipient_id, ship_to_type: form.ship_to_type === 'address' ? 'address' : (form.ship_to_type === 'regional' ? 'regional' : 'facility'), regional_id: form.regional_id || null, facility_id: form.facility_id || null, order_date: form.order_date, expected_date: form.expected_date, delivery_method: form.delivery_method, shipping_address: form.shipping_address, shipping_cost: Number(form.shipping_cost) || 0, landed_costs: form.landed_costs, notes: form.notes, items };
  if (editing.value) { store.updateSalesOrder(form.id, base); toast.success(form.so_number + ' updated.'); }
  else { store.addSalesOrder({ id: uid('so'), so_number: store.nextSoNumber(), status: 'draft', created_by: 'Malky Locker', created_at: TODAY, backorder_of: null, groups: [], attachments: [], ...base }); toast.success('Sales order created (customer notified).'); }
  showForm.value = false;
}

/* ---------------- SO detail + attachments (R3 SO #4) ---------------- */
const showSO = ref(false); const curSO = ref(null); const att = reactive({ kind: 'BOL' });
function openSO(so) { curSO.value = so; att.kind = 'BOL'; showSO.value = true; }
function onSoFile(e) { const f = e.target.files && e.target.files[0]; if (f && curSO.value) { store.addSoAttachment(curSO.value.id, f.name, att.kind); toast.success(att.kind + ' uploaded — also visible under the facility.'); } e.target.value = ''; }

/* ---------------- ship (group-aware + employee assign + partial/backorder) ---------------- */
const showShip = ref(false); const shipSOref = ref(null); const shipRows = ref([]); const shipCost = ref(0); const makeBackorder = ref(false); const slc = reactive({ label: '', amount: '' });
function openShip(so) {
  shipSOref.value = so; shipCost.value = so.shipping_cost || 0; makeBackorder.value = false;
  shipRows.value = so.items.map((l, idx) => {
    const remaining = (l.qty || 0) - (l.qty_shipped || 0); const avail = lineAvail(l);
    const is_assembly = l.kind === 'assembly';
    const adef = is_assembly ? store.assemblyById(l.assembly_id) : null;
    const is_single = !!(adef && adef.assembly_kind === 'single');
    // single-item assemblies (laptops/gameshows) auto-assign to the employee on the SO; allow override here.
    const assignable = is_single || (l.kind === 'group' ? (l.members || []).some((m) => store.isEmployeeAssignable(m.vendor_item_id)) : false);
    return { idx, name: l.name, is_group: l.kind === 'group', is_assembly, is_single, assembly_id: l.assembly_id, pool: 'New', facility_id: l.facility_id, ordered: l.qty, remaining, avail, qty: Math.min(remaining, avail), assignable, employee_id: '', unit_ids: [] };
  });
  showShip.value = true;
}
const anyShort = computed(() => shipRows.value.some((r) => r.qty < r.remaining));
function unitsForRow(r) { return store.availableUnitsByCondition(r.assembly_id, r.pool); }
function unitCapped(r, id) { return !r.unit_ids.includes(id) && r.unit_ids.length >= r.remaining; }
function addShipLanded() { const so = shipSOref.value; if (!so) return; if (!slc.label.trim() || !(Number(slc.amount) > 0)) return toast.error('Enter a label and amount.'); (so.landed_costs = so.landed_costs || []).push({ id: uid('lc'), label: slc.label.trim(), amount: Number(slc.amount) }); Object.assign(slc, { label: '', amount: '' }); }
function doShip() {
  const rows = shipRows.value.map((r) => r.is_assembly ? { idx: r.idx, qty: (r.unit_ids || []).length, unit_ids: r.unit_ids || [], employee_id: r.employee_id || '' } : { idx: r.idx, qty: Number(r.qty), employee_id: r.employee_id }).filter((r) => r.qty > 0);
  if (!rows.length) return toast.error('Nothing to ship.');
  if (shipSOref.value) shipSOref.value.shipping_cost = Number(shipCost.value) || 0;
  if (makeBackorder.value) {
    const r = store.shipAndBackorder(shipSOref.value, rows, shipSOref.value.landed_costs);
    toast.success('Shipped ' + shipSOref.value.so_number + ' — ' + (r.backorder ? 'back order ' + r.backorder.so_number + ' created.' : 'complete.'));
  } else {
    const r = store.shipSO(shipSOref.value, rows, shipSOref.value.landed_costs);
    store.emailCustomer(shipSOref.value, 'Shipped');
    toast.success('Shipped ' + shipSOref.value.so_number + ' (cost ' + money(r.captured) + ', landed included) — customer notified.');
  }
  showShip.value = false;
}

/* ---------------- combine (kept) ---------------- */
const showCombine = ref(false); const combineReg = ref(''); const combineSel = ref([]); const combineCost = ref(0);
const combinable = computed(() => store.salesOrders.filter((s) => !s.combined_into && ['draft', 'in_progress'].includes(s.status) && (s.regional_id === combineReg.value || (store.facilityById(s.facility_id) || {}).regional_id === combineReg.value)));
// C1: once one SO is picked, only same-destination SOs stay selectable. C2: how many destinations have >=2 combinable orders.
const combineDestKey = computed(() => { const first = store.salesOrders.find((s) => s.id === combineSel.value[0]); return first ? store.soDestKey(first) : null; });
const combineHint = computed(() => { const g = {}; store.salesOrders.forEach((s) => { if (!s.combined_into && s.status === 'in_progress') { const k = store.soDestKey(s); g[k] = (g[k] || 0) + 1; } }); return Object.values(g).filter((n) => n >= 2).length; });
function openCombine() { combineReg.value = store.regionals[0].id; combineSel.value = []; combineCost.value = 0; showCombine.value = true; }
function toggleCombine(id) { const i = combineSel.value.indexOf(id); if (i > -1) combineSel.value.splice(i, 1); else combineSel.value.push(id); }
function doCombine() { if (combineSel.value.length < 2) return toast.error('Select at least two orders going to the same place.'); const sh = store.combineSOs(combineSel.value, combineCost.value); if (!sh || sh.error) return toast.error((sh && sh.error) || 'Could not combine.'); toast.success('Combined into ' + sh.shipment_no + ' — one shipment to ' + (sh.recipient_label || 'the recipient') + '.'); showCombine.value = false; }

/* ---------------- print (ready-to-ship list + shipping slips one per page) ---------------- */
const showSlips = ref(false);
const readyToShip = computed(() => store.salesOrders.filter((s) => (s.status === 'in_progress' || s.status === 'shipped' || (s.status === 'backorder' && s.items.every((l) => store.soLineEffective(l, (l.qty - (l.qty_shipped || 0))).every((e) => itemOnHand(e.vendor_item_id) >= e.qty)))) && !s.combined_into));
// R3 SO #5: one slip per order; multiple to the same place numbered 1 of N, 2 of N
const slips = computed(() => {
  const by = {}; readyToShip.value.forEach((so) => { const key = so.shipping_address || '—'; (by[key] = by[key] || []).push(so); });
  const out = []; Object.values(by).forEach((g) => g.forEach((so, i) => out.push({ so, x: i + 1, n: g.length }))); return out;
});
function doPrint() { setTimeout(() => window.print(), 60); }
/* V4+ : courier shipping labels with QR + per-label print selection */
const labelSel = ref([]);
const labels = computed(() => slips.value.map((sl) => { const c = courierFor(sl.so); return { so: sl.so, x: sl.x, n: sl.n, c, qr: qrDataUrl(c.trackUrl || c.tracking), bars: barWidths(c.tracking) }; }));
const labelSearch = ref('');
const labelsFiltered = computed(() => { const q = labelSearch.value.trim().toLowerCase(); if (!q) return labels.value; return labels.value.filter((L) => recipientLabel(L.so).toLowerCase().includes(q) || (L.so.shipping_address || '').toLowerCase().includes(q) || L.so.so_number.toLowerCase().includes(q) || (L.c.carrier || '').toLowerCase().includes(q)); });
function openLabels() { labelSel.value = labels.value.map((l) => l.so.id); labelSearch.value = ''; showSlips.value = true; }
function toggleLabel(id) { const i = labelSel.value.indexOf(id); if (i > -1) labelSel.value.splice(i, 1); else labelSel.value.push(id); }
const allLabelsSelected = computed(() => labels.value.length > 0 && labelSel.value.length === labels.value.length);
function toggleAllLabels() { labelSel.value = allLabelsSelected.value ? [] : labels.value.map((l) => l.so.id); }

const showShipments = ref(false); const showEmails = ref(false); const showDocs = ref(false);
</script>

<template>
  <div>
    <Hero title="Sales Order" subtitle="One search for any recipient, address lookup, group-as-one-line, attachments, and per-order shipping slips." :chips="chips">
      <template #actions>
        <button class="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-white/10 ring-1 ring-white/15 backdrop-blur text-white hover:bg-white/15" @click="showEmails=true">Notifications · {{ store.emails.length }}</button>
        <button class="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-white/10 ring-1 ring-white/15 backdrop-blur text-white hover:bg-white/15" @click="showShipments=true">Shipments · {{ store.shipments.length }}</button>
        <button class="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-white/10 ring-1 ring-white/15 backdrop-blur text-white hover:bg-white/15" @click="openLabels()">Shipping labels <ReqTag code="SO-5" text="V3 SO #5 — One label per order, numbered 1 of N to the same place." /> <ReqTag ver="V4" code="SO-5+" text="Real courier labels (FedEx/UPS/USPS/Freight) with QR code + mock tracking; tick-box to choose which to print." /></button>
        <button class="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-white/10 ring-1 ring-white/15 backdrop-blur text-white hover:bg-white/15" @click="openCombine()">Combine<span v-if="combineHint" class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold" title="Orders going to the same place can be combined">{{ combineHint }}</span></button>
        <button class="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-white text-slate-800 hover:bg-white/90" @click="openForm()">+ New SO</button>
      </template>
    </Hero>

    <div class="-mt-1 mb-3">
      <ReqTag ver="V7" code="FRESH-DATA" text="V7 — Sales Orders start empty for fresh data. Click + New SO to ship to your own recipients; pick built units (New vs Refurbished) on each assembly line, and Confirm to queue a shipment. 'Reset demo data' clears back to this state." />
    </div>

    <div v-if="backordersReady.length" class="mb-4 rounded-xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-sm text-emerald-900">
      <div class="flex items-center gap-2 mb-2"><b>{{ backordersReady.length }} back order(s) ready to ship</b> — items are back in stock.</div>
      <div class="flex flex-wrap gap-2">
        <span v-for="so in backordersReady" :key="so.id" class="inline-flex items-center gap-2 rounded-lg bg-white ring-1 ring-emerald-200 px-3 py-1">
          <span class="font-mono text-xs text-slate-600">{{ so.so_number }}</span>
          <Btn variant="soft-success" size="sm" @click="shipBackorder(so)">Ship now</Btn>
        </span>
      </div>
    </div>

    <div class="mb-4 rounded-xl bg-emerald-50/70 ring-1 ring-emerald-100 px-4 py-3 text-sm text-emerald-900 flex items-start gap-2">
      <p><b>FIFO-locked pricing, landed included.</b> Search one box for any recipient, look up an address, add a whole group as a single line that scales its items, and attach the BOL — it shows under the facility too.</p>
    </div>

    <Card :padded="false">
      <div class="flex flex-wrap items-center gap-1.5 px-4 pt-3 pb-1">
        <button v-for="f in SO_FILTERS" :key="f[0]" class="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors" :class="soFilter===f[0] ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'" @click="soFilter=f[0]">{{ f[1] }} <span class="opacity-60">{{ f[0]==='all' ? store.salesOrders.length : store.salesOrders.filter(s=>s.status===f[0]).length }}</span></button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider"><tr><th class="px-5 py-2.5 text-left font-semibold">SO #</th><th class="px-5 py-2.5 text-left font-semibold">For</th><th class="px-5 py-2.5 text-left font-semibold">Ship to</th><th class="px-5 py-2.5 text-right font-semibold">Lines</th><th class="px-5 py-2.5 text-right font-semibold">Total</th><th class="px-5 py-2.5 text-left font-semibold">Status</th><th class="px-5 py-2.5"></th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="so in visibleSOs" :key="so.id" class="hover:bg-indigo-50/40 cursor-pointer" @click="openSO(so)">
              <td class="px-5 py-3"><div class="font-mono text-xs text-slate-700">{{ so.so_number }}</div><div v-if="so.created_by" class="text-[10px] text-slate-400">by {{ so.created_by }}</div><div v-if="so.backorder_of" class="text-[10px] text-rose-600">back order of {{ so.backorder_of }}</div><div v-else-if="so.combined_into" class="text-[10px] text-blue-600">combined</div><div v-if="(so.attachments||[]).length" class="text-[10px] text-indigo-600">📎 {{ so.attachments.length }}</div></td>
              <td class="px-5 py-3 text-slate-700">{{ recipientLabel(so) }}</td>
              <td class="px-5 py-3 text-slate-500 text-xs max-w-[220px] truncate" :title="so.shipping_address">{{ so.shipping_address || '—' }}</td>
              <td class="px-5 py-3 text-right tabular-nums">{{ so.items.length }}</td>
              <td class="px-5 py-3 text-right tabular-nums font-semibold">{{ money(soTotal(so)) }}</td>
              <td class="px-5 py-3"><Badge :tone="statusTone(so.status)">{{ statusLabel(so.status) }}</Badge><div v-if="so.confirmed_by" class="text-[10px] text-emerald-600 mt-0.5" :title="'Confirmed ' + (so.confirmed_at||'')">✓ {{ so.confirmed_by }}<span v-if="so.confirmed_by_role" class="text-slate-400"> · {{ so.confirmed_by_role }}</span></div></td>
              <td class="px-5 py-3 text-right whitespace-nowrap" @click.stop>
                <Btn variant="ghost" size="sm" @click="openSO(so)">Open</Btn>
                <Btn variant="ghost" size="sm" @click="openForm(so)">Edit</Btn>
                <Btn v-if="so.status==='draft'||so.status==='backorder'" variant="soft-primary" size="sm" @click="openConfirm(so)">Confirm</Btn>
                <Btn v-if="so.status==='in_progress'" variant="soft-primary" size="sm" @click="openShip(so)">Ship</Btn>
                <Btn v-else-if="so.status==='shipped'" variant="soft-success" size="sm" @click="completeSo(so)">Complete</Btn>
                <Btn v-if="['shipped','completed'].includes(so.status) && so.items.some(l=>l.qty_shipped>0)" variant="ghost" size="sm" @click="reverse(so)">Reverse</Btn>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>

    <!-- New / edit SO -->
    <Modal v-if="showForm" :title="editing ? ('Edit ' + form.so_number) : 'New Sales Order'" sub="Search any recipient, look up the address, add items or a whole group." wide @close="showForm=false">
      <div class="space-y-4">
        <!-- recipient (unified search) -->
        <div class="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-indigo-700 mb-2">Who is this SO for? <ReqTag code="SO-1" text="V3 SO #1 — One search bar finds any recipient: facility, regional, employee, or provider." /></div>
          <SearchPicker :options="store.recipients" placeholder="Search anyone — facility, regional, employee or provider…" @pick="onRecipientPick" />
          <p class="mt-2 text-sm text-slate-600">For:  <b>{{ form.recipient_label || '— choose a recipient —' }}</b></p>
        </div>

        <!-- shipping info / address (OSM lookup) -->
        <div class="rounded-xl border border-slate-200 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Shipping info <ReqTag code="SO-2" text="V3 SO #2 — Google-style address lookup with autocomplete (OpenStreetMap in demo; Google Maps Places in production)." /></div>
          <div class="grid grid-cols-2 gap-3">
            <label class="text-sm"><span class="block text-slate-600 mb-1">Ship to</span><select v-model="form.ship_to_type" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" @change="onShipToType"><option value="recipient">Use recipient's address</option><option value="facility">A facility</option><option value="regional">A Regional</option><option value="address">A new address (lookup)</option></select></label>
            <label v-if="form.ship_to_type==='facility'" class="text-sm"><span class="block text-slate-600 mb-1">Facility</span><select v-model="form.facility_id" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" @change="onShipFacility"><option v-for="f in store.facilities" :key="f.id" :value="f.id">{{ f.name }}</option></select></label>
            <label v-else-if="form.ship_to_type==='regional'" class="text-sm"><span class="block text-slate-600 mb-1">Regional</span><select v-model="form.regional_id" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" @change="onShipRegional"><option v-for="r in store.regionals" :key="r.id" :value="r.id">{{ r.name }} ({{ r.area }})</option></select></label>
            <label class="text-sm"><span class="block text-slate-600 mb-1">Delivery method</span><select v-model="form.delivery_method" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option>Freight</option><option>Courier</option><option>Pickup</option></select></label>
          </div>
          <div v-if="form.ship_to_type==='address'" class="mt-3"><span class="block text-slate-600 mb-1 text-sm">New address (type to search)</span><AddressAutocomplete v-model="form.custom_address" @update:modelValue="form.shipping_address=form.custom_address" /></div>
          <label v-else class="text-sm block mt-3"><span class="block text-slate-600 mb-1">Shipping address (auto)</span><input v-model="form.shipping_address" readonly class="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm bg-slate-100 text-slate-500 cursor-not-allowed" /><span class="block text-[11px] text-slate-400 mt-1">Pulled from the recipient/facility. To type a different address, choose “A new address (lookup)” above.</span></label>
          <label class="text-sm block mt-3 w-48"><span class="block text-slate-600 mb-1">Expected date</span><input v-model="form.expected_date" type="date" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        </div>

        <!-- items + group lines -->
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-100"><span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Items on this order <ReqTag code="SO-GRP-1" text="V3 SO Groups #1 — A group is ONE line with an expandable dropdown; changing its qty scales every member (e.g. 5 groups: singles x5, a double x10)." /> <ReqTag ver="V4" code="SO-1" text="Amendment SO #1 — add an Assembly (cart, laptop, or gameshow) and pick the specific built unit at ship-out. Assembly-only items cannot be added as loose items." /></span></div>
          <table class="w-full text-sm">
            <thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left px-4 py-2">Item / Group</th><th class="text-left px-4 py-2">Facility (charge)</th><th class="text-right px-4 py-2">Qty</th><th class="text-right px-4 py-2">Unit</th><th class="text-right px-4 py-2">Line</th><th></th></tr></thead>
            <tbody class="divide-y divide-slate-100">
              <template v-for="(l,idx) in form.items" :key="idx">
                <tr>
                  <td class="px-4 py-2 text-slate-700">
                    <button v-if="l.kind==='group'" class="mr-1 text-slate-400" @click="l.expanded=!l.expanded">{{ l.expanded ? '▾' : '▸' }}</button>
                    {{ l.name }}<Badge v-if="l.kind==='group'" tone="emerald" class="ml-1">group</Badge><Badge v-if="l.kind==='assembly'" tone="rose" class="ml-1 font-bold">◆ asset</Badge>
                  </td>
                  <td class="px-4 py-2"><select v-model="l.facility_id" class="h-8 px-2 rounded border border-slate-300 text-xs"><option v-for="f in store.facilities" :key="f.id" :value="f.id">{{ f.name }}</option></select></td>
                  <td class="px-4 py-2 text-right"><input v-model.number="l.qty" type="number" min="1" class="w-16 h-8 px-2 rounded border border-slate-300 text-right" /></td>
                  <td class="px-4 py-2 text-right tabular-nums text-slate-700">{{ money(lineUnitCost(l)) }} <span class="text-[10px] text-slate-400" title="FIFO + landed, locked">[locked]</span></td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ money((Number(l.qty)||0) * lineUnitCost(l)) }}</td>
                  <td class="px-4 py-2 text-right"><button class="text-rose-500" @click="form.items.splice(idx,1)">&times;</button></td>
                </tr>
                <template v-if="l.kind==='group' && l.expanded">
                  <tr v-for="(m,mi) in l.members" :key="idx+'-'+mi" class="text-slate-500 bg-slate-50/40">
                    <td class="px-4 py-1.5 pl-10 text-xs">↳ {{ m.name }}</td>
                    <td class="px-4 py-1.5 text-xs">—</td>
                    <td class="px-4 py-1.5 text-right text-xs tabular-nums">{{ m.per_group }} × {{ l.qty||0 }} = <b class="text-slate-700">{{ (m.per_group||0) * (Number(l.qty)||0) }}</b></td>
                    <td class="px-4 py-1.5 text-right text-xs tabular-nums">{{ money(store.fifoUnitCost(m.vendor_item_id)) }}</td>
                    <td class="px-4 py-1.5 text-right text-xs tabular-nums">{{ money((m.per_group||0) * (Number(l.qty)||0) * store.fifoUnitCost(m.vendor_item_id)) }}</td>
                    <td></td>
                  </tr>
                </template>
              </template>
              <tr v-if="!form.items.length"><td colspan="6" class="px-4 py-6 text-center text-slate-400">No items yet — add them below.</td></tr>
            </tbody>
            <tfoot>
              <tr><td colspan="4"></td><td class="px-4 py-1.5 text-right text-xs text-slate-400">Goods</td><td class="px-4 py-1.5 text-right tabular-nums text-slate-600">{{ money(formGoods) }}</td></tr>
              <tr class="border-t border-slate-200"><td colspan="4"></td><td class="px-4 py-2 text-right text-xs uppercase text-slate-400">Total</td><td class="px-4 py-2 text-right font-bold tabular-nums">{{ money(formTotal) }}</td></tr>
            </tfoot>
          </table>
          <div v-if="form.items.length" class="px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-600">
            <span class="font-semibold uppercase tracking-wide text-slate-400">Charges by facility:</span>
            <span v-for="(amt,fid) in formFacilityCharges" :key="fid" class="ml-3">{{ (store.facilityById(fid)||{}).name }} <b class="tabular-nums">{{ money(amt) }}</b></span>
          </div>
        </div>

        <!-- add items BELOW the list so the dropdown never covers what you've already added -->
        <div class="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3">
          <span class="block text-[11px] font-semibold uppercase tracking-wide text-indigo-500 mb-1.5">+ Add an item, group, or asset</span>
          <SearchPicker multi :options="store.catalogShip" placeholder="Search items, groups, or assets…" @pick="onItemPick" />
        </div>

        <!-- outbound landed -->
        <div class="rounded-xl border border-amber-200 overflow-hidden">
          <div class="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs font-semibold uppercase tracking-wide text-amber-800 flex items-center gap-2">Outbound shipping / landed cost <ReqTag code="SO-3" text="V3 SO #3 — Landed cost reconciles: SO goods cost matches PO goods + landed for the same items." /></div>
          <div class="p-3 space-y-2">
            <label class="text-sm flex items-center gap-2"><span class="text-slate-600 w-40">Base outbound freight</span><input v-model="form.shipping_cost" type="number" step="0.01" class="w-32 h-8 px-2 rounded border border-amber-300 text-sm" /></label>
            <div v-for="(x,i) in form.landed_costs" :key="x.id" class="flex items-center justify-between text-sm"><span class="text-slate-600">{{ x.label }}</span><span class="tabular-nums font-medium">{{ money(x.amount) }} <button class="text-rose-400 ml-1" @click="form.landed_costs.splice(i,1)">&times;</button></span></div>
            <div class="flex items-end gap-2 pt-1">
              <label class="text-xs flex-1"><span class="block text-slate-500 mb-1">What for</span><input v-model="lc.label" placeholder="e.g. Crating, Insurance" class="w-full h-8 px-2 rounded border border-amber-300 text-sm" /></label>
              <label class="text-xs w-24"><span class="block text-slate-500 mb-1">Amount</span><input v-model="lc.amount" type="number" step="0.01" class="w-full h-8 px-2 rounded border border-amber-300 text-sm" /></label>
              <Btn variant="secondary" size="sm" @click="addLanded">Add Landed Cost</Btn>
            </div>
            <p class="text-[11px] text-amber-700">Outbound total <b>{{ money(outLandedTotal) }}</b>.</p>
          </div>
        </div>

        <label class="text-sm block"><span class="block text-slate-600 mb-1">Notes</span><input v-model="form.notes" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
      </div>
      <template #footer><Btn v-if="editHasShipped" variant="soft-danger" @click="reverseFromEdit">Reverse last shipment</Btn><Btn variant="secondary" @click="showForm=false">Cancel</Btn><Btn @click="saveForm">{{ editing ? 'Save changes' : 'Create SO' }}</Btn></template>
    </Modal>

    <!-- SO detail + attachments -->
    <Modal v-if="showSO && curSO" :title="curSO.so_number" :sub="recipientLabel(curSO)" wide @close="showSO=false">
      <div class="space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <Badge :tone="statusTone(curSO.status)">{{ statusLabel(curSO.status) }}</Badge>
          <span class="text-xs text-slate-500">{{ curSO.shipping_address }}</span>
          <div class="ml-auto flex gap-2">
            <span class="inline-flex items-center gap-1.5"><Btn variant="secondary" size="sm" @click="showDocs=true">Documents</Btn><Tag /></span>
            <Btn variant="secondary" size="sm" @click="showSO=false; openForm(curSO)">Edit</Btn>
            <Btn v-if="curSO.status==='draft'||curSO.status==='backorder'" variant="soft-primary" size="sm" @click="openConfirm(curSO)">Confirm</Btn>
            <Btn v-if="curSO.status==='in_progress'" variant="success" size="sm" @click="showSO=false; openShip(curSO)">Ship</Btn>
          </div>
        </div>
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">Lines</div>
          <table class="w-full text-sm"><tbody class="divide-y divide-slate-100">
            <template v-for="(l,i) in curSO.items" :key="i">
              <tr><td class="px-4 py-2 text-slate-700">{{ l.name }}<Badge v-if="l.kind==='group'" tone="emerald" class="ml-1">group</Badge></td><td class="px-4 py-2 text-slate-500">{{ (store.facilityById(l.facility_id)||{}).name }}</td><td class="px-4 py-2 text-right tabular-nums">{{ l.qty }}<span class="text-slate-400 text-xs"> · {{ l.qty_shipped||0 }} shipped</span></td><td class="px-4 py-2 text-right tabular-nums">{{ money((l.qty||0)*lineUnitCost(l)) }}</td></tr>
              <tr v-for="(m,mi) in (l.kind==='group'?l.members:[])" :key="i+'m'+mi" class="text-slate-500 bg-slate-50/40"><td class="px-4 py-1 pl-10 text-xs">↳ {{ m.name }}</td><td></td><td class="px-4 py-1 text-right text-xs">{{ (m.per_group||0)*(l.qty||0) }}</td><td></td></tr>
            </template>
          </tbody></table>
        </div>
        <!-- attachments (R3 SO #4) -->
        <div class="rounded-xl border border-indigo-100 overflow-hidden">
          <div class="px-4 py-2 bg-indigo-50 border-b border-indigo-100 text-xs font-semibold uppercase tracking-wide text-indigo-700">Attachments (BOL, proof of delivery) <ReqTag code="SO-4" text="V3 SO #4 — Open any SO to edit and upload attachments (BOL / proof of delivery); they also appear under the destination Facility." /></div>
          <div class="p-3 space-y-2">
            <div v-for="a in (curSO.attachments||[])" :key="a.id" class="flex items-center gap-2 text-sm"><Badge :tone="a.kind==='BOL'?'blue':a.kind==='Proof of delivery'?'emerald':'slate'">{{ a.kind }}</Badge><span class="flex-1 text-indigo-700 hover:underline cursor-pointer" @click="viewDoc(a.name, a.kind, store.facilityById(curSO.facility_id), curSO)">📎 {{ a.name }}</span><span class="text-[10px] text-slate-400">{{ fmtDateTime(a.at) }}</span><button class="text-rose-400" @click="store.removeSoAttachment(curSO.id, a.id)">&times;</button></div>
            <p v-if="!(curSO.attachments||[]).length" class="text-xs text-slate-400">No attachments yet.</p>
            <div class="flex items-center gap-2 pt-2 border-t border-indigo-100">
              <select v-model="att.kind" class="h-8 px-2 rounded border border-slate-300 text-sm"><option>BOL</option><option>Proof of delivery</option><option>Other</option></select>
              <input type="file" class="text-xs" @change="onSoFile" />
            </div>
            <p class="text-[11px] text-indigo-700">Uploads here also appear under the destination facility (Dashboard ▸ Facilities ▸ Manage).</p>
          </div>
        </div>
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Notes</span><textarea v-model="curSO.notes" rows="2" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"></textarea></label>
      </div>
      <template #footer><Btn variant="secondary" @click="showSO=false">Close</Btn><Btn @click="showSO=false">Save</Btn></template>
    </Modal>

    <!-- Ship -->
    <Modal v-if="showShip" :title="'Ship ' + (shipSOref?shipSOref.so_number:'')" sub="Group lines ship as a unit (scaling members). Assign laptops/trivia; partial ship can create a back order." wide @close="showShip=false">
      <table class="w-full text-sm">
        <thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left px-3 py-2">Item / Group</th><th class="text-left px-3 py-2">Facility</th><th class="text-right px-3 py-2">Ordered</th><th class="text-right px-3 py-2">Available</th><th class="text-right px-3 py-2">Ship now</th><th class="text-left px-3 py-2">Assign to</th></tr></thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="r in shipRows" :key="r.idx">
            <td class="px-3 py-2 text-slate-700">{{ r.name }}<Badge v-if="r.is_group" tone="emerald" class="ml-1">group</Badge><Badge v-if="r.is_assembly" tone="violet" class="ml-1">assembly</Badge></td>
            <td class="px-3 py-2 text-slate-500">{{ (store.facilityById(r.facility_id)||{}).name }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ r.ordered }}</td>
            <td class="px-3 py-2 text-right tabular-nums" :class="r.avail<r.remaining?'text-rose-600 font-semibold':''">{{ r.avail }}</td>
            <td class="px-3 py-2 text-right"><div v-if="r.is_assembly" class="flex flex-col items-end gap-1"><select v-model="r.pool" class="h-7 px-1.5 rounded border border-slate-300 text-[11px]" title="Choose the pool — new vs refurbished are never mixed."><option>New</option><option>Refurbished</option></select><div class="flex flex-wrap gap-1 justify-end max-w-[300px]"><label v-for="u in unitsForRow(r)" :key="u.id" class="inline-flex items-center gap-1 text-[11px] rounded ring-1 px-1.5 py-0.5 cursor-pointer" :class="(u.condition==='Refurbished') ? 'ring-amber-300 bg-amber-50' : 'ring-slate-200'"><input type="checkbox" :value="u.id" v-model="r.unit_ids" :disabled="unitCapped(r,u.id)" /> {{ u.code }}<span v-if="u.condition==='Refurbished'" class="text-amber-700 font-bold">R</span></label><span v-if="!unitsForRow(r).length" class="text-xs text-slate-400">no {{ r.pool.toLowerCase() }} units</span></div><span class="text-[10px] text-slate-400">pick up to {{ r.remaining }} · {{ r.unit_ids.length }} selected <ReqTag ver="V6" code="SO-5" text="V6 SO 5 — pick specific units from a pool (new vs refurbished, R-tagged), capped at what is in the warehouse; the shortfall goes to a back order." /></span><span v-if="r.pool==='Refurbished'" class="block text-[10px] text-amber-700 font-semibold">Refurbished value is provisional — pending the refund formula.</span></div><input v-else v-model.number="r.qty" type="number" min="0" :max="Math.min(r.remaining,r.avail)" class="w-20 h-8 px-2 rounded border border-slate-300 text-right" /></td>
            <td class="px-3 py-2"><select v-if="r.assignable" v-model="r.employee_id" class="h-8 px-2 rounded border border-slate-300 text-xs"><option value="">— employee —</option><option v-for="u in store.employeeList" :key="u.id" :value="u.id">{{ u.name }}</option></select><span v-else class="text-xs text-slate-300">—</span></td>
          </tr>
        </tbody>
      </table>
      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Outbound freight (this shipment)</span><input v-model="shipCost" type="number" step="0.01" class="w-40 h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <div class="rounded-lg ring-1 ring-amber-200 bg-amber-50/50 p-2">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-amber-800 mb-1">Add outbound landed</div>
          <div class="flex items-end gap-2"><input v-model="slc.label" placeholder="What for" class="flex-1 h-8 px-2 rounded border border-amber-300 text-sm" /><input v-model="slc.amount" type="number" step="0.01" placeholder="Amt" class="w-20 h-8 px-2 rounded border border-amber-300 text-sm" /><Btn variant="secondary" size="sm" @click="addShipLanded">Add</Btn></div>
        </div>
      </div>
      <label v-if="anyShort" class="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-800"><input v-model="makeBackorder" type="checkbox" /> Some items are short — ship what's available, complete this SO, and create a back order (SO …BC) for the rest.</label>
      <template #footer><Btn variant="secondary" @click="showShip=false">Cancel</Btn><Btn variant="success" @click="doShip">Ship items</Btn></template>
    </Modal>

    <!-- Combine -->
    <Modal v-if="showCombine" title="Combine sales orders" sub="Only orders going to the same recipient AND address can be combined into one shipment." wide @close="showCombine=false">
      <label class="text-sm block mb-3"><span class="block text-slate-600 mb-1">Regional</span><select v-model="combineReg" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" @change="combineSel=[]"><option v-for="r in store.regionals" :key="r.id" :value="r.id">{{ r.name }} ({{ r.area }})</option></select></label>
      <div class="space-y-2">
        <label v-for="so in combinable" :key="so.id" class="flex items-center gap-3 rounded-lg ring-1 ring-slate-200 px-3 py-2 text-sm cursor-pointer" :class="{'opacity-40': combineDestKey && store.soDestKey(so)!==combineDestKey && !combineSel.includes(so.id)}">
          <input type="checkbox" :checked="combineSel.includes(so.id)" :disabled="combineDestKey && store.soDestKey(so)!==combineDestKey && !combineSel.includes(so.id)" @change="toggleCombine(so.id)" />
          <span class="font-mono text-xs">{{ so.so_number }}</span><span class="text-slate-600">→ {{ recipientLabel(so) }}</span><span class="text-[11px] text-slate-400 truncate max-w-[170px]">{{ so.shipping_address }}</span><span class="ml-auto text-slate-400">{{ so.items.length }} line(s)</span>
        </label>
        <p v-if="!combinable.length" class="text-xs text-slate-400">No combinable SOs for this Regional (need draft/in-progress orders).</p>
      </div>
      <label class="text-sm block mt-3"><span class="block text-slate-600 mb-1">Shipment outbound cost</span><input v-model="combineCost" type="number" step="0.01" class="w-40 h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
      <template #footer><Btn variant="secondary" @click="showCombine=false">Cancel</Btn><Btn @click="doCombine">Combine into one shipment</Btn></template>
    </Modal>

    <!-- Shipments -->
    <Modal v-if="showShipments" title="Shipments" sub="Shipped orders and combined shipments, grouped by facility." wide @close="showShipments=false">
      <div v-for="sh in store.shipments" :key="sh.id" class="rounded-xl border border-slate-200 mb-3">
        <div class="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100"><div class="font-semibold text-slate-800"><span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 align-middle" :class="sh.single_so ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'">{{ sh.single_so ? 'SINGLE' : 'COMBINED' }}</span>{{ sh.shipment_no }} <span class="text-xs font-normal text-slate-500">· {{ sh.recipient_label || (store.regionalById(sh.regional_id)||{}).name }} · SOs {{ sh.so_numbers.join(', ') }}</span></div><div class="text-xs text-slate-500"><span v-if="sh.status" class="mr-2 text-[10px] font-semibold uppercase" :class="sh.status==='Delivered'?'text-emerald-600':'text-slate-400'">{{ sh.status }}</span>freight {{ money(sh.shipping_cost) }}</div></div>
        <div class="p-3 grid gap-2 sm:grid-cols-2"><div v-for="(rows,fid) in sh.byFacility" :key="fid" class="rounded-lg ring-1 ring-slate-100 p-2"><div class="text-xs font-semibold text-slate-700 mb-1">{{ (store.facilityById(fid)||{}).name }}</div><div v-for="(r,i) in rows" :key="i" class="text-xs text-slate-500 flex justify-between"><span>{{ r.qty }}× {{ r.name }}</span><span class="font-mono text-slate-400">{{ r.so }}</span></div></div></div>
      </div>
      <p v-if="!store.shipments.length" class="text-center text-slate-400 text-sm py-6">No shipments yet — ship an order, or use Combine to group orders for one Regional.</p>
    </Modal>

    <!-- Confirm SO — S5: Warehouse Manager OR the receiving Regional confirms; saved to the shared database -->
    <Modal v-if="showConfirmDlg" :title="'Confirm ' + (confirmSOref ? confirmSOref.so_number : '')" sub="Both the Warehouse Manager and the Regional receiving the order can confirm. The confirmation is saved to the shared database." @close="showConfirmDlg=false">
      <div class="space-y-3">
        <p class="text-sm text-slate-600">Confirming moves the order into the shipping queue and records who confirmed it.</p>
        <button class="w-full text-left rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 px-4 py-3 transition" @click="doConfirm({ name: 'Warehouse Manager', role: 'Warehouse Manager' })">
          <div class="font-semibold text-slate-800">🏭 Warehouse Manager</div>
          <div class="text-xs text-slate-500">Confirm on the warehouse side.</div>
        </button>
        <button class="w-full text-left rounded-xl border px-4 py-3 transition" :class="confirmRegional ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50' : 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'" :disabled="!confirmRegional" @click="confirmRegional && doConfirm({ name: confirmRegional.name, role: 'Regional' })">
          <div class="font-semibold text-slate-800">🧑‍💼 {{ confirmRegional ? confirmRegional.name : 'No receiving regional' }}</div>
          <div class="text-xs text-slate-500">{{ confirmRegional ? 'Confirm as the Regional receiving this order.' : 'This order has no regional to confirm as.' }}</div>
        </button>
      </div>
      <template #footer><Btn variant="secondary" @click="showConfirmDlg=false">Cancel</Btn></template>
    </Modal>

    <!-- Notifications -->
    <Modal v-if="showEmails" title="Customer notifications & sent log" sub="Simulated emails to customers / regionals on order events." wide @close="showEmails=false">
      <table class="w-full text-sm"><thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left px-3 py-2">Kind</th><th class="text-left px-3 py-2">To</th><th class="text-left px-3 py-2">Subject</th></tr></thead>
        <tbody class="divide-y divide-slate-100"><tr v-for="e in store.emails" :key="e.id"><td class="px-3 py-2"><Badge :tone="e.kind==='PO to vendor'?'blue':'emerald'">{{ e.kind }}</Badge></td><td class="px-3 py-2 text-slate-700">{{ e.to }}</td><td class="px-3 py-2 text-slate-600">{{ e.subject }}</td></tr>
        <tr v-if="!store.emails.length"><td colspan="3" class="px-3 py-8 text-center text-slate-400">No notifications yet.</td></tr></tbody></table>
    </Modal>

    <!-- Shipping labels (courier labels w/ QR + per-label print selection) -->
    <Modal v-if="showSlips" title="Shipping labels" sub="Real-style courier labels with QR tracking. Tick which to print, or print all." wide @close="showSlips=false">
      <div class="flex flex-wrap items-center gap-3 mb-3 text-sm">
        <div class="relative flex-1 min-w-[220px]">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
          <input v-model="labelSearch" placeholder="Search labels by name, facility, SO# or carrier…" class="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 text-sm" />
        </div>
        <label class="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" :checked="allLabelsSelected" @change="toggleAllLabels" /> Select all</label>
        <span class="text-slate-600">{{ labelSel.length }} of {{ labels.length }} selected</span>
      </div>
      <div id="print-labels">
        <div v-for="L in labelsFiltered" :key="L.so.id">
          <label class="no-print flex items-center gap-2 mb-1 text-xs text-slate-500 cursor-pointer"><input type="checkbox" :checked="labelSel.includes(L.so.id)" @change="toggleLabel(L.so.id)" /> Include {{ L.so.so_number }} → {{ recipientLabel(L.so) }}</label>
          <div class="label rounded-lg border-2 border-slate-800 overflow-hidden mb-4" :class="{ unselected: !labelSel.includes(L.so.id) }">
            <div class="flex items-center justify-between px-3 py-2 text-white" :style="{ background: L.c.accent }">
              <div class="text-lg font-extrabold tracking-tight">{{ L.c.carrier }}</div>
              <div class="text-xs font-semibold uppercase tracking-wide">{{ L.c.service }}</div>
            </div>
            <div class="grid grid-cols-3">
              <div class="col-span-2 p-3 border-r border-slate-300 text-sm">
                <div class="text-[10px] uppercase tracking-wide text-slate-400">Ship to</div>
                <div class="font-bold text-slate-900 text-base leading-tight">{{ recipientLabel(L.so) }}</div>
                <div class="text-slate-700 text-xs">{{ L.so.shipping_address }}</div>
                <div class="mt-2 text-[10px] uppercase tracking-wide text-slate-400">From</div>
                <div class="text-xs text-slate-600">Carease Health — Warehouse · 1 Warehouse Way, Lakewood, NJ 08701</div>
              </div>
              <div class="p-3 flex flex-col items-center justify-center">
                <img v-if="L.qr" :src="L.qr" class="w-24 h-24" alt="tracking QR" />
                <div class="text-[9px] text-slate-500 mt-1 tracking-widest">SCAN TO TRACK</div>
              </div>
            </div>
            <div class="px-3 py-1.5 border-t border-slate-300 grid grid-cols-3 text-xs text-slate-600">
              <div><b>WT</b> {{ L.c.weight }} lb</div><div class="text-center"><b>PKG</b> {{ L.x }} of {{ L.n }}</div><div class="text-right"><b>SHIP</b> {{ L.c.ship_date || '—' }}</div>
            </div>
            <div class="px-3 pb-1 pt-1">
              <div class="flex items-end gap-[1px] h-10">
                <span v-for="(w,bi) in L.bars" :key="bi" :style="{ width: w + 'px', height: '100%' }" :class="bi % 2 ? 'bg-white' : 'bg-slate-900'"></span>
              </div>
              <div class="text-center font-mono text-sm tracking-widest text-slate-800">{{ L.c.tracking }}</div>
            </div>
            <div class="px-3 pb-3 flex items-center justify-between text-[11px] text-slate-500">
              <span class="font-semibold text-slate-700">{{ L.so.so_number }}</span>
              <span>{{ (L.so.items||[]).length }} line(s) · {{ L.so.delivery_method }}</span>
            </div>
          </div>
        </div>
        <p v-if="!labels.length" class="text-center text-slate-400 text-sm py-6">No orders are ready to ship right now.</p>
        <p v-else-if="!labelsFiltered.length" class="text-center text-slate-400 text-sm py-6">No labels match “{{ labelSearch }}”.</p>
      </div>
      <template #footer><Btn variant="secondary" @click="showSlips=false">Close</Btn><Btn :disabled="!labelSel.length" @click="doPrint">Print selected ({{ labelSel.length }})</Btn></template>
    </Modal>
    <DocumentsModal v-if="showDocs && curSO" kind="so" :order="curSO" @close="showDocs=false" />
  </div>
</template>

<style>
@media print {
  body * { visibility: hidden !important; }
  #print-labels, #print-labels * { visibility: visible !important; }
  #print-labels { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
  #print-labels .no-print { display: none !important; }
  #print-labels .label.unselected { display: none !important; }
  #print-labels .label:not(:last-child) { page-break-after: always; }
}
</style>
