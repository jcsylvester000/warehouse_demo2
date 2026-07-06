<script setup>
import { ref, reactive, computed } from 'vue';
import { useWarehouseStore } from '@/stores/warehouse';
import { useToast } from '@/composables/useToast';
import { useRouter } from 'vue-router';
import { money, fmtDateTime } from '@/utils/format';
import Hero from '@/components/ui/Hero.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import Btn from '@/components/ui/BaseButton.vue';
import Modal from '@/components/ui/BaseModal.vue';
import SearchPicker from '@/components/ui/SearchPicker.vue';
import ReqTag from '@/components/ui/ReqTag.vue';

const store = useWarehouseStore();
const toast = useToast();
const router = useRouter();
const showLow = ref(false);
function onChip(c) { if (c && c.label === 'Low stock') showLow.value = true; }
function orderItem(it) { store.queuePO([it.id]); toast.info('Starting a PO for ' + it.name + '…'); router.push('/purchase-orders'); }
function orderAllLow() { store.queuePO(store.lowStockList.map((i) => i.id)); router.push('/purchase-orders'); }
const tab = ref('list');
const search = ref('');

const invFilter = ref('all');
const lowIds = computed(() => new Set(store.lowStockList.map((x) => x.id)));
const list = computed(() => {
  const s = search.value.trim().toLowerCase();
  return store.catalog.filter((o) => {
    if (invFilter.value === 'item' && o.kind !== 'item') return false;
    if (invFilter.value === 'group' && o.kind !== 'group') return false;
    if (invFilter.value === 'assembly' && o.kind !== 'assembly') return false;
    if (invFilter.value === 'low' && !lowIds.value.has(o.id)) return false;
    return !s || o.name.toLowerCase().includes(s) || String(o.sku).includes(s);
  });
});
const cartsAvailable = computed(() => store.carts.filter((c) => c.location === 'Warehouse').length);
const chips = computed(() => [
  { label: 'Items + Groups', value: store.catalog.length },
  { label: 'Single items', value: store.items.length },
  { label: 'Carts built (available)', value: cartsAvailable.value },
  { label: 'Low stock', value: store.lowStockList.length, danger: true, clickable: true },
]);

/* ---------- detail (click a row to open) ---------- */
const showDetail = ref(false); const detail = ref(null);
function openDetail(entry) { detail.value = entry; showDetail.value = true; }
const detailItem = computed(() => (detail.value && detail.value.kind === 'item' ? store.itemById(detail.value.id) : null));
const detailGroup = computed(() => (detail.value && detail.value.kind === 'group' ? store.groupById(detail.value.id) : null));
const detailAssembly = computed(() => (detail.value && detail.value.kind === 'assembly' ? store.assemblyById(detail.value.id) : null));
const memberName = (m) => (m.kind === 'group' ? (store.groupById(m.ref_id) || {}).name + ' (group)' : (store.itemById(m.ref_id) || {}).name);

/* ---------- add (single OR group) ---------- */
const showAdd = ref(false); const addKind = ref('item');
const itemForm = reactive({ id: null, name: '', vendor_id: '', item_type_id: '', cost: '', qty_onhand: 0, threshold: 0, bin_location: '', is_active: true, assembly_only: false, image: '' });
const groupForm = reactive({ id: null, name: '', description: '', vendor_id: '', assembly_only: false, members: [], image: '' });
const asmForm = reactive({ id: null, name: '', assembly_kind: 'cart', source_item_id: '', fields: [], assembly_type_id: '', composition: [], asset_defaults: { cart_type: '', key_type: '', bp_device: '' } });
function openAdd() {
  addKind.value = 'item';
  Object.assign(itemForm, { id: null, name: '', vendor_id: '', item_type_id: '', cost: '', qty_onhand: 0, threshold: 0, bin_location: '', is_active: true, assembly_only: false, image: '' });
  Object.assign(groupForm, { id: null, name: '', description: '', vendor_id: '', assembly_only: false, members: [], image: '' });
  Object.assign(asmForm, { id: null, name: '', assembly_kind: 'cart', source_item_id: '', fields: [], assembly_type_id: (store.assemblyTypes[0] || {}).id || '', composition: [], asset_defaults: { cart_type: '', key_type: '', bp_device: '' } });
  showAdd.value = true;
}
function onMemberPick(id) {
  const g = store.groupById(id);
  const kind = g ? 'group' : 'item';
  if (groupForm.members.some((m) => m.ref_id === id)) return;
  groupForm.members.push({ kind, ref_id: id, qty: 1 });
}
const memberExclude = computed(() => [groupForm.id, ...groupForm.members.map((m) => m.ref_id)].filter(Boolean));
function onImage(e, form) { const f = e.target.files && e.target.files[0]; if (!f) return; if (f.size > 200 * 1024) { toast.error('Image too large — please use one under 200 KB.'); return; } const r = new FileReader(); r.onload = () => { form.image = r.result; }; r.readAsDataURL(f); }
function saveAdd() {
  if (addKind.value === 'item') {
    if (!itemForm.name.trim()) return toast.error('Item name is required.');
    if (itemForm.id) { store.updateItem(itemForm.id, { name: itemForm.name, vendor_id: itemForm.vendor_id, item_type_id: itemForm.item_type_id, cost: Number(itemForm.cost) || 0, threshold: Number(itemForm.threshold) || 0, bin_location: itemForm.bin_location, is_active: itemForm.is_active, assembly_only: itemForm.assembly_only, image: itemForm.image }); toast.success('Item updated.'); }
    else { const it = store.addItem(itemForm); toast.success('Item ' + it.sku + ' added.'); }
  } else if (addKind.value === 'group') {
    if (!groupForm.name.trim() || !groupForm.members.length) return toast.error('Group name and at least one member are required.');
    const members = JSON.parse(JSON.stringify(groupForm.members));
    if (groupForm.id) { store.updateGroup(groupForm.id, { name: groupForm.name, description: groupForm.description, vendor_id: groupForm.vendor_id, assembly_only: groupForm.assembly_only, members, image: groupForm.image }); toast.success('Group updated.'); }
    else { const g = store.addGroup({ name: groupForm.name, description: groupForm.description, vendor_id: groupForm.vendor_id, assembly_only: groupForm.assembly_only, members, image: groupForm.image }); toast.success('Group ' + g.sku + ' added (its own item).'); }
  } else {
    if (asmForm.assembly_kind === 'single') {
      if (!asmForm.name.trim() || !asmForm.source_item_id) return toast.error('Assembly name and a source item are required.');
      const fields = asmForm.fields.map((f) => String(f).trim()).filter(Boolean);
      const payload = { name: asmForm.name, assembly_kind: 'single', source_item_id: asmForm.source_item_id, fields, composition: [], asset_defaults: {}, assembly_type_id: '' };
      if (asmForm.id) { store.updateAssemblyDef(asmForm.id, payload); toast.success('Assembly updated.'); }
      else { const a = store.addAssemblyDef(payload); toast.success('Assembly ' + a.sku + ' defined.'); }
    } else {
      if (!asmForm.name.trim() || !asmForm.composition.length) return toast.error('Assembly name and at least one part are required.');
      const composition = JSON.parse(JSON.stringify(asmForm.composition));
      const asset_defaults = JSON.parse(JSON.stringify(asmForm.asset_defaults));
      if (asmForm.id) { store.updateAssemblyDef(asmForm.id, { name: asmForm.name, assembly_kind: 'cart', assembly_type_id: asmForm.assembly_type_id, composition, asset_defaults }); toast.success('Assembly updated.'); }
      else { const a = store.addAssemblyDef({ name: asmForm.name, assembly_kind: 'cart', assembly_type_id: asmForm.assembly_type_id, composition, asset_defaults }); toast.success('Assembly ' + a.sku + ' defined.'); }
    }
  }
  showAdd.value = false;
}
function editFromDetail() {
  if (detailItem.value) { const it = detailItem.value; addKind.value = 'item'; Object.assign(itemForm, { id: it.id, name: it.name, vendor_id: it.vendor_id, item_type_id: it.item_type_id, cost: it.cost, qty_onhand: it.qty_onhand, threshold: it.threshold, bin_location: it.bin_location, is_active: it.is_active, assembly_only: !!it.assembly_only, image: it.image || '' }); }
  else if (detailGroup.value) { const g = detailGroup.value; addKind.value = 'group'; Object.assign(groupForm, { id: g.id, name: g.name, description: g.description, vendor_id: g.vendor_id || '', assembly_only: !!g.assembly_only, members: JSON.parse(JSON.stringify(g.members)), image: g.image || '' }); }
  else if (detailAssembly.value) { const a = detailAssembly.value; addKind.value = 'assembly'; Object.assign(asmForm, { id: a.id, name: a.name, assembly_kind: a.assembly_kind || 'cart', source_item_id: a.source_item_id || '', fields: JSON.parse(JSON.stringify(a.fields || [])), assembly_type_id: a.assembly_type_id, composition: JSON.parse(JSON.stringify(a.composition || [])), asset_defaults: JSON.parse(JSON.stringify(a.asset_defaults || { cart_type: '', key_type: '', bp_device: '' })) }); }
  showDetail.value = false; showAdd.value = true;
}
function deactivate() { if (detail.value) { store.deactivateItem(detail.value.id); toast.info(detail.value.name + ' deactivated.'); showDetail.value = false; } }

/* ---------- assembly definition part picker (groups + singles) ---------- */
function onAsmPartPick(id) { if (asmForm.composition.some((c) => c.ref_id === id)) return; const g = store.groupById(id); asmForm.composition.push({ kind: g ? 'group' : 'item', ref_id: id, qty: 1 }); }
const asmPartExclude = computed(() => asmForm.composition.map((c) => c.ref_id));
const asmPartName = (c) => (c.kind === 'group' ? (store.groupById(c.ref_id) || {}).name + ' (group)' : (store.itemById(c.ref_id) || {}).name);

/* ---------- build an assembly into ONE tracked cart asset (auto-fill + mandatory code) ---------- */
const showBuild = ref(false);
const build = reactive({ assembly_id: '', code: '', cart_color: '', tablet_number: '', fields: { cart_type: '', key_type: '', bp_device: '' } });
function blankFieldsFor(a) { const f = {}; (a && a.fields || []).forEach((k) => { f[k] = ''; }); return f; }
function openBuild(defId) { const a = store.assemblyById(defId); if (!a) return; if (a.assembly_kind === 'single') { Object.assign(build, { assembly_id: defId, code: '', cart_color: '', tablet_number: '', fields: blankFieldsFor(a) }); } else { const af = store.assemblyAutoFill(defId); Object.assign(build, { assembly_id: defId, code: '', cart_color: '', tablet_number: '', fields: { cart_type: af.cart_type || '', key_type: af.key_type || '', bp_device: af.bp_device || '' } }); } showDetail.value = false; showBuild.value = true; }
const buildDef = computed(() => store.assemblyById(build.assembly_id));
function reloadBuildFields() { const a = store.assemblyById(build.assembly_id); if (!a) return; if (a.assembly_kind === 'single') { build.fields = blankFieldsFor(a); } else { const af = store.assemblyAutoFill(build.assembly_id); build.fields = { cart_type: af.cart_type || '', key_type: af.key_type || '', bp_device: af.bp_device || '' }; } build.code = ''; }
function saveBuild() {
  const res = store.buildAssembly({ assembly_id: build.assembly_id, code: build.code, cart_color: build.cart_color, tablet_number: build.tablet_number, fields: build.fields });
  if (res.error) return toast.error(res.error);
  toast.success('Built ' + res.cart.code + ' — one asset created; parts removed from inventory.');
  showBuild.value = false; tab.value = 'cart';
}

/* ---------- AS-5: build MANY assemblies at once (spreadsheet-style) ---------- */
const showBatch = ref(false);
const batch = reactive({ assembly_id: '', condition: 'New', rows: [] });
const batchDef = computed(() => store.assemblyById(batch.assembly_id));
const batchIsCart = computed(() => !!(batchDef.value && batchDef.value.assembly_kind !== 'single'));
function asmContents(id) { const a = store.assemblyById(id); if (!a) return ''; if (a.assembly_kind === 'single') return (store.itemById(a.source_item_id) || {}).name || ''; return (a.composition || []).map((m) => m.qty + '× ' + (m.kind === 'group' ? ((store.groupById(m.ref_id) || {}).name || 'group') : ((store.itemById(m.ref_id) || {}).name || 'item'))).join(', '); }
function newBatchRow() { const f = {}; const d = batchDef.value; if (d && d.assembly_kind === 'single') (d.fields || []).forEach((k) => { f[k] = ''; }); return { code: '', cart_color: '', tablet_number: '', fields: f }; }
function openBatch(id) { const d = id ? store.assemblyById(id) : (store.assemblies.find((a) => a.assembly_kind !== 'single') || store.assemblies[0] || {}); batch.assembly_id = (d && d.id) || ''; batch.condition = 'New'; batch.rows = []; batch.rows.push(newBatchRow()); showDetail.value = false; showBatch.value = true; }
function onBatchAsm() { batch.rows = [newBatchRow()]; }
function addBatchRow() { batch.rows.push(newBatchRow()); }
function removeBatchRow(i) { batch.rows.splice(i, 1); if (!batch.rows.length) batch.rows.push(newBatchRow()); }
const batchAutoFill = computed(() => batchIsCart.value ? store.assemblyAutoFill(batch.assembly_id) : {});
function saveBatch() {
  const af = batchIsCart.value ? store.assemblyAutoFill(batch.assembly_id) : null;
  const rows = batch.rows.filter((r) => String(r.code).trim()).map((r) => ({ assembly_id: batch.assembly_id, code: String(r.code).trim(), cart_color: r.cart_color, tablet_number: r.tablet_number, fields: batchIsCart.value ? af : r.fields, condition: batch.condition }));
  if (!rows.length) return toast.error('Enter at least one code.');
  const res = store.buildAssembliesBatch(rows);
  if (res.built.length) toast.success('Built ' + res.built.length + ' unit(s) — parts removed from inventory.');
  if (res.errors.length) return toast.error(res.errors.length + ' row(s) failed: ' + res.errors.map((e) => e.code + ' (' + e.error + ')').slice(0, 3).join('; '));
  showBatch.value = false; tab.value = 'cart';
}

/* ---------- edit a built cart (assembly unit) ---------- */
const showEditUnit = ref(false); const editUnit = reactive({ id: '', code: '', cart_color: '', tablet_number: '', key_type: '', bp_device: '' });
function openEditUnit(c) { Object.assign(editUnit, { id: c.id, code: c.code, cart_color: c.cart_color || '', tablet_number: c.tablet_number || '', key_type: c.key_type || '', bp_device: c.bp_device || '' }); showEditUnit.value = true; }
function saveEditUnit() { if (!editUnit.code.trim()) return toast.error('Cart Code is required.'); store.editAssemblyUnit(editUnit.id, { code: editUnit.code.trim(), cart_color: editUnit.cart_color, tablet_number: editUnit.tablet_number, key_type: editUnit.key_type, bp_device: editUnit.bp_device }); toast.success('Assembly updated.'); showEditUnit.value = false; }

/* ---------- manage assembly (cart) types ---------- */
const showTypes = ref(false); const newTypeName = ref('');
function addType() { if (!newTypeName.value.trim()) return; store.addAssemblyType(newTypeName.value.trim()); newTypeName.value = ''; }
// A7: a cart type IS an assembly preset — Manage cart types is the one place to edit a type's contents or add a new one.
function openNewType() { openAdd(); addKind.value = 'assembly'; showTypes.value = false; }
function openTypeEdit(a) { addKind.value = 'assembly'; Object.assign(asmForm, { id: a.id, name: a.name, assembly_kind: a.assembly_kind || 'cart', source_item_id: a.source_item_id || '', fields: JSON.parse(JSON.stringify(a.fields || [])), assembly_type_id: a.assembly_type_id, composition: JSON.parse(JSON.stringify(a.composition || [])), asset_defaults: JSON.parse(JSON.stringify(a.asset_defaults || { cart_type: '', key_type: '', bp_device: '' })) }); showTypes.value = false; showAdd.value = true; }

/* ---------- adjust stock (add/remove + mandatory reason, no FIFO option) ---------- */
const showStock = ref(false);
const stock = reactive({ item: null, dir: 'add', qty: 1, reason: '' });
function openStock(it) { Object.assign(stock, { item: it, dir: 'add', qty: 1, reason: '' }); showDetail.value = false; showStock.value = true; }
function saveStock() {
  const q = Number(stock.qty); if (!q || q < 1) return toast.error('Quantity must be at least 1.');
  if (!stock.reason.trim()) return toast.error('A reason is required for every adjustment.');
  const delta = stock.dir === 'remove' ? -q : q;
  if (delta < 0 && (stock.item.qty_onhand || 0) + delta < 0) return toast.error('Cannot remove more than on hand.');
  store.adjustStock(stock.item, delta, stock.reason.trim());
  toast.success((delta < 0 ? 'Removed ' : 'Added ') + q + ' unit(s) of ' + stock.item.name + '.');
  showStock.value = false;
}

/* ---------- lots + logs ---------- */
const showLots = ref(false); const lotItem = ref(null);
function openLots(it) { lotItem.value = it; showDetail.value = false; showLots.value = true; }
const showLogs = ref(false); const logItem = ref(null);
const itemLogs = computed(() => (logItem.value ? store.stockLogs.filter((l) => l.vendor_item_id === logItem.value.id) : []));
function openLogs(it) { logItem.value = it; showDetail.value = false; showLogs.value = true; }

/* ---------- cart assembly ---------- */
const showAssemble = ref(false);
const asm = reactive({ code: '', cart_type: '', components: [] });
function openAssemble() { Object.assign(asm, { code: '', cart_type: (store.assemblyTypes[0] || {}).name || '', components: [] }); showAssemble.value = true; }
function onCompPick(id) { if (asm.components.some((c) => c.vendor_item_id === id)) return; const it = store.itemById(id); if (!it) return; asm.components.push({ vendor_item_id: it.id, name: it.name, qty: 1 }); }
const asmExclude = computed(() => asm.components.map((c) => c.vendor_item_id));
const asmCost = computed(() => asm.components.reduce((s, c) => s + (Number(c.qty) || 0) * store.fifoUnitCost(c.vendor_item_id), 0));
function saveAssemble() {
  if (!asm.components.length) return toast.error('Add at least one component.');
  for (const c of asm.components) { const it = store.itemById(c.vendor_item_id); if ((it.qty_onhand || 0) < c.qty) return toast.error('Not enough ' + it.name + ' in stock.'); }
  const cart = store.assembleCart({ code: asm.code.trim() || null, cart_type: asm.cart_type, components: asm.components.map((c) => ({ vendor_item_id: c.vendor_item_id, qty: Number(c.qty) || 1 })) });
  toast.success('Assembled ' + cart.code + ' — components removed from inventory.');
  showAssemble.value = false;
}
const showAssign = ref(false); const assignCart = ref(null); const assignFac = ref('');
function openAssign(c) { assignCart.value = c; assignFac.value = store.facilities[0].id; showAssign.value = true; }
function saveAssign() { store.setCartLocation(assignCart.value, 'Facility', assignFac.value); toast.success('Cart assigned — now shows in Assets.'); showAssign.value = false; }

/* item-only options for the cart component picker (singles only) */
const singleOptions = computed(() => store.catalogLite.filter((o) => !o.is_group));
</script>

<template>
  <div>
    <Hero title="Inventory" subtitle="One list of items and groups. Numeric item numbers auto-generate; click any row to open it." :chips="chips" @chip="onChip" />

    <div class="mb-4 rounded-xl bg-emerald-50/70 ring-1 ring-emerald-100 px-4 py-3 text-sm text-emerald-900 flex items-start gap-2">
      <p><b>Groups are items.</b> A group lives in the same list as everything else and can contain single items <b>and</b> nested groups. <b>Click a row</b> to edit it, adjust stock, or view lots & logs. <b>Item numbers</b> are numeric and auto-generated. <ReqTag ver="V7" code="FRESH-DATA" text="V7 — Inventory starts empty for fresh data. Add single items and groups with the + buttons, then build carts from them under the Assemblies tab. Purchase Orders, Sales Orders and Returns also start empty; 'Reset demo data' returns to this clean state." /></p>
    </div>

    <Card :padded="false">
      <div class="flex items-center justify-between border-b border-slate-100 px-5">
        <div class="flex">
          <button class="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors" :class="tab==='list'?'border-indigo-600 text-indigo-700':'border-transparent text-slate-500 hover:text-slate-700'" @click="tab='list'">Items &amp; Groups <span class="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold" :class="tab==='list'?'bg-indigo-100 text-indigo-700':'bg-slate-100 text-slate-500'">{{ store.catalog.length }}</span></button>
          <button class="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors" :class="tab==='cart'?'border-purple-600 text-purple-700':'border-transparent text-slate-500 hover:text-slate-700'" @click="tab='cart'">Carts <span class="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold" :class="tab==='cart'?'bg-purple-100 text-purple-700':'bg-slate-100 text-slate-500'">{{ store.carts.length }}</span></button>
        </div>
        <Btn v-if="tab==='list'" size="sm" @click="openAdd()">+ Add Item</Btn>
        <Btn v-else size="sm" @click="openBatch()">+ Build Carts</Btn>
      </div>

      <!-- Items & Groups (minimal: SKU, Name, On Hand, Bin) -->
      <div v-show="tab==='list'">
        <div class="px-5 py-3 border-b border-slate-100">
          <div class="flex flex-wrap items-center gap-2">
            <input v-model="search" placeholder="Search item number or name…" class="h-9 px-3 rounded-lg border border-slate-300 text-sm w-full max-w-sm" />
            <span class="flex flex-wrap gap-1">
              <button v-for="f in [['all','All'],['item','Single items'],['group','Grouped items'],['assembly','Carts available'],['low','Low stock']]" :key="f[0]" class="px-2.5 h-8 rounded-lg text-xs font-semibold border" :class="invFilter===f[0] ? (f[0]==='low' ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-800 text-white border-slate-800') : 'border-slate-200 text-slate-600'" @click="invFilter=f[0]">{{ f[1] }}</button>
            </span>
            <ReqTag ver="V6" code="INV-1" text="V6 Inventory 1 — filter the list by single items, grouped items, carts available, or low stock." />
          </div>
        </div>
        <div class="overflow-auto max-h-[65vh]">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider sticky top-0 z-10 shadow-sm"><tr>
              <th class="px-5 py-2.5 text-left font-semibold bg-slate-50">SKU (item #)</th>
              <th class="px-5 py-2.5 text-left font-semibold bg-slate-50">Item name</th>
              <th class="px-5 py-2.5 text-right font-semibold bg-slate-50">On hand</th>
              <th class="px-5 py-2.5 text-left font-semibold bg-slate-50">Bin location</th>
              <th class="px-5 py-2.5 bg-slate-50"></th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="o in list" :key="o.id" class="hover:bg-indigo-50/40 cursor-pointer" @click="openDetail(o)">
                <td class="px-5 py-3 font-mono text-xs text-slate-600">{{ o.sku }}</td>
                <td class="px-5 py-3 font-medium text-slate-800"><img v-if="o.image" :src="o.image" alt="" class="inline-block w-7 h-7 object-cover rounded ring-1 ring-slate-200 mr-2 align-middle" />{{ o.name }}<Badge v-if="o.is_group" tone="emerald" class="ml-2">group</Badge><Badge v-if="o.is_assembly" tone="violet" class="ml-2">assembly</Badge><Badge v-if="!o.is_active" tone="slate" class="ml-1">inactive</Badge></td>
                <td class="px-5 py-3 text-right tabular-nums font-semibold text-slate-800">{{ o.on_hand }}</td>
                <td class="px-5 py-3 text-slate-600">{{ o.bin }}</td>
                <td class="px-5 py-3 text-right"><span class="text-xs text-indigo-600 font-semibold">Open →</span></td>
              </tr>
              <tr v-if="!list.length"><td colspan="5" class="px-5 py-10 text-center text-slate-400">No items match.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Carts -->
      <div v-show="tab==='cart'">
        <div class="px-5 py-3 text-xs text-slate-500 border-b border-slate-100 flex items-center gap-2">Assembled carts (tracked assets). Build consumes parts and creates one asset; assigning to a facility moves it there.<span class="ml-auto flex gap-2"><Btn variant="secondary" size="sm" @click="showTypes=true">Manage cart types</Btn><Btn size="sm" @click="openBatch()">+ Build carts <ReqTag ver="V6" code="AS-5" text="Build one or many carts at once — pick the cart type and it pulls the parts automatically." /></Btn></span></div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider"><tr><th class="px-5 py-2.5 text-left font-semibold">Code</th><th class="px-5 py-2.5 text-left font-semibold">Type</th><th class="px-5 py-2.5 text-left font-semibold">Condition</th><th class="px-5 py-2.5 text-left font-semibold">Components</th><th class="px-5 py-2.5 text-right font-semibold">Cost (FIFO)</th><th class="px-5 py-2.5 text-left font-semibold">Location</th><th class="px-5 py-2.5 text-left font-semibold">Status</th><th class="px-5 py-2.5"></th></tr></thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="c in store.carts" :key="c.id" class="hover:bg-slate-50/60">
                <td class="px-5 py-3 font-mono text-xs text-slate-600">{{ c.code }}</td>
                <td class="px-5 py-3">{{ c.cart_type }}</td>
                <td class="px-5 py-3"><Badge :tone="(c.condition==='Refurbished')?'amber':'slate'">{{ c.condition || 'New' }}</Badge><span v-if="c.refurbished" class="text-[10px] text-slate-400 ml-1" :title="'Returned from '+(c.returned_from||'')">↺</span></td>
                <td class="px-5 py-3 text-slate-600 text-xs">{{ c.components.length ? c.components.map(x=>x.qty+'× '+x.name).join(', ') : '—' }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ money(c.cost) }}</td>
                <td class="px-5 py-3">{{ c.location }}<span v-if="c.facility_id" class="text-slate-400"> · {{ (store.facilityById(c.facility_id)||{}).name }}</span></td>
                <td class="px-5 py-3"><Badge :tone="c.status==='Available'?'emerald':'amber'">{{ c.status }}</Badge></td>
                <td class="px-5 py-3 text-right whitespace-nowrap"><Btn variant="ghost" size="sm" @click="openEditUnit(c)">Edit</Btn><Btn v-if="c.location==='Warehouse'" variant="ghost" size="sm" @click="openAssign(c)">Assign</Btn></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Card>

    <!-- detail -->
    <Modal v-if="showDetail && detail" :title="detail.name" :sub="'Item # ' + detail.sku" wide @close="showDetail=false">
      <div v-if="detailItem" class="space-y-4">
        <img v-if="detailItem.image" :src="detailItem.image" alt="item photo" class="w-full max-h-56 object-contain rounded-lg ring-1 ring-slate-200 bg-slate-50" />
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">Vendor</div><div class="font-medium text-slate-700">{{ store.vendorName(detailItem.vendor_id) }}</div></div>
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">Type</div><div class="font-medium text-slate-700">{{ store.typeName(detailItem.item_type_id) }}<Badge v-if="store.isTrackableItem(detailItem.id)" tone="violet" class="ml-1">tracked</Badge></div></div>
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">On hand</div><div class="font-semibold tabular-nums" :class="(detailItem.qty_onhand||0)<=(detailItem.threshold||0)?'text-rose-600':'text-slate-800'">{{ detailItem.qty_onhand }}</div></div>
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">Bin</div><div class="font-medium text-slate-700">{{ detailItem.bin_location }}</div></div>
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">Base cost</div><div class="font-medium tabular-nums">{{ money(detailItem.cost) }}</div></div>
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">FIFO cost</div><div class="font-semibold tabular-nums text-indigo-700">{{ money(store.fifoUnitCost(detailItem.id)) }}</div></div>
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">Threshold</div><div class="font-medium tabular-nums">{{ detailItem.threshold }}</div></div>
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">Status</div><div><Badge :tone="detailItem.is_active?'emerald':'slate'">{{ detailItem.is_active?'Active':'Inactive' }}</Badge></div></div>
        </div>
        <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          <Btn variant="secondary" size="sm" @click="editFromDetail">Edit item</Btn>
          <Btn variant="soft-primary" size="sm" @click="openStock(detailItem)">Adjust stock</Btn>
          <Btn variant="ghost" size="sm" @click="openLots(detailItem)">View lots</Btn>
          <Btn variant="ghost" size="sm" @click="openLogs(detailItem)">View logs</Btn>
          <Btn v-if="detailItem.is_active" variant="soft-danger" size="sm" @click="deactivate">Deactivate</Btn>
        </div>
      </div>
      <div v-else-if="detailGroup" class="space-y-4">
        <img v-if="detailGroup.image" :src="detailGroup.image" alt="group photo" class="w-full max-h-56 object-contain rounded-lg ring-1 ring-slate-200 bg-slate-50" />
        <p class="text-sm text-slate-500">{{ detailGroup.description }}</p>
        <div class="rounded-xl border border-slate-200 overflow-hidden">
          <table class="w-full text-sm"><tbody class="divide-y divide-slate-100">
            <tr v-for="(m,mi) in detailGroup.members" :key="mi"><td class="px-4 py-2 text-slate-700"><Badge :tone="m.kind==='group'?'emerald':'slate'">{{ m.kind }}</Badge> {{ memberName(m) }}</td><td class="px-4 py-2 text-right text-slate-500 tabular-nums">×{{ m.qty }}</td></tr>
          </tbody></table>
          <div class="px-4 py-2 bg-slate-50/60 text-xs text-slate-500 flex justify-between"><span>Group unit cost (FIFO)</span><b class="text-slate-700">{{ money(store.groupUnitCost(detailGroup.id)) }}</b></div>
          <div class="px-4 py-2 text-xs text-slate-500 flex justify-between"><span>Full groups buildable from stock</span><b class="text-emerald-700">{{ store.groupOnHand(detailGroup.id) }}</b></div>
        </div>
        <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          <Btn variant="secondary" size="sm" @click="editFromDetail">Edit group</Btn>
          <Btn v-if="detailGroup.is_active!==false" variant="soft-danger" size="sm" @click="deactivate">Deactivate</Btn>
        </div>
      </div>
      <div v-else-if="detailAssembly" class="space-y-4">
        <div class="flex flex-wrap gap-5 text-sm">
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">{{ detailAssembly.assembly_kind==='single' ? 'Kind' : 'Cart type' }}</div><div class="font-medium text-slate-700">{{ detailAssembly.assembly_kind==='single' ? 'Single-item · ' + ((store.itemById(detailAssembly.source_item_id)||{}).name || '—') : store.assemblyTypeName(detailAssembly.assembly_type_id) }}</div></div>
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">Unit cost (FIFO)</div><div class="font-semibold tabular-nums text-indigo-700">{{ money(store.assemblyUnitCost(detailAssembly.id)) }}</div></div>
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">Buildable from stock</div><div class="font-semibold tabular-nums text-emerald-700">{{ store.assemblyBuildable(detailAssembly.id) }}</div></div>
          <div><div class="text-[10px] uppercase tracking-wide text-slate-400">Built &amp; available</div><div class="font-semibold tabular-nums">{{ store.availableUnits(detailAssembly.id).length }}</div></div>
        </div>
        <div v-if="detailAssembly.assembly_kind!=='single'" class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">Composition (groups + singles)</div>
          <table class="w-full text-sm"><tbody class="divide-y divide-slate-100">
            <tr v-for="(c,ci) in detailAssembly.composition" :key="ci"><td class="px-4 py-2 text-slate-700"><Badge :tone="c.kind==='group'?'emerald':'slate'">{{ c.kind }}</Badge> {{ c.kind==='group' ? (store.groupById(c.ref_id)||{}).name : (store.itemById(c.ref_id)||{}).name }}</td><td class="px-4 py-2 text-right text-slate-500 tabular-nums">×{{ c.qty }}</td></tr>
          </tbody></table>
          <div class="px-4 py-2 bg-violet-50/60 text-xs text-slate-600">Auto-fills on build → Cart Type <b>{{ (detailAssembly.asset_defaults||{}).cart_type || '—' }}</b> · Key <b>{{ (detailAssembly.asset_defaults||{}).key_type || '—' }}</b> · BP <b>{{ (detailAssembly.asset_defaults||{}).bp_device || '—' }}</b></div>
        </div>
        <div v-else class="rounded-xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-2 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">Single-item assembly — no parts to put together</div>
          <div class="px-4 py-3 text-sm text-slate-600">Source item: <b>{{ (store.itemById(detailAssembly.source_item_id)||{}).name || '—' }}</b>. Assembling consumes one from inventory and records: <b>{{ (detailAssembly.fields||[]).join(', ') || '—' }}</b>.</div>
        </div>
        <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          <Btn variant="secondary" size="sm" @click="editFromDetail">Edit assembly</Btn>
          <Btn variant="soft-primary" size="sm" @click="openBatch(detailAssembly.id)">Build</Btn>
        </div>
      </div>
    </Modal>

    <!-- add / edit (single or group) -->
    <Modal v-if="showAdd" :title="(itemForm.id||groupForm.id||asmForm.id)?'Edit':'Add to inventory'" :sub="(itemForm.id||groupForm.id||asmForm.id)?'':'Choose a single item, a group, or an assembly.'" wide @close="showAdd=false">
      <div class="space-y-4">
        <div v-if="!itemForm.id && !groupForm.id && !asmForm.id" class="flex gap-2">
          <button class="flex-1 h-10 rounded-lg text-sm font-semibold border" :class="addKind==='item'?'bg-indigo-600 text-white border-indigo-600':'border-slate-300 text-slate-600'" @click="addKind='item'">Single item</button>
          <button class="flex-1 h-10 rounded-lg text-sm font-semibold border" :class="addKind==='group'?'bg-emerald-600 text-white border-emerald-600':'border-slate-300 text-slate-600'" @click="addKind='group'">Group</button>
          <button class="flex-1 h-10 rounded-lg text-sm font-semibold border inline-flex items-center justify-center gap-1" :class="addKind==='assembly'?'bg-violet-600 text-white border-violet-600':'border-slate-300 text-slate-600'" @click="addKind='assembly'">Assembly <ReqTag ver="V4" code="IT-1" text="V4 Item Types #1 — items are Single, Group, or Assembly." /></button>
        </div>

        <!-- single item -->
        <div v-if="addKind==='item'" class="grid grid-cols-2 gap-4">
          <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Item name *</span><input v-model="itemForm.name" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <div class="text-sm"><span class="block text-slate-600 mb-1">Item number (SKU)</span><div class="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm flex items-center text-slate-500">{{ itemForm.id ? store.itemById(itemForm.id).sku : 'auto-generated (numbers only)' }}</div></div>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Vendor</span><select v-model="itemForm.vendor_id" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option value="">— none —</option><option v-for="v in store.vendors" :key="v.id" :value="v.id">{{ v.name }}</option></select></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Item type</span><select v-model="itemForm.item_type_id" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option value="">— none —</option><option v-for="t in store.itemTypes" :key="t.id" :value="t.id">{{ t.name }}</option></select></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Base cost</span><input v-model="itemForm.cost" type="number" step="0.01" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Opening qty</span><input v-model="itemForm.qty_onhand" type="number" :disabled="!!itemForm.id" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-50" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Threshold</span><input v-model="itemForm.threshold" type="number" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Bin location</span><input v-model="itemForm.bin_location" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm flex items-center gap-2"><input v-model="itemForm.is_active" type="checkbox" /> Active</label>
          <label class="text-sm flex items-center gap-2 col-span-2"><input v-model="itemForm.assembly_only" type="checkbox" /> This item can only be shipped as an assembly <ReqTag ver="V4" code="IT-2" text="Amendment — an assembly-only item (laptop, gameshow) can't be added to a Sales Order as a loose item; it must be assembled first. A Single is never an asset." /></label>
          <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Image <span class="text-slate-400 font-normal">(optional · max 200 KB)</span></span><div class="flex items-center gap-3"><input type="file" accept="image/*" class="text-xs" @change="onImage($event, itemForm)" /><img v-if="itemForm.image" :src="itemForm.image" class="w-14 h-14 object-cover rounded ring-1 ring-slate-200" /></div></label>
        </div>

        <!-- group -->
        <div v-else-if="addKind==='group'" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <label class="text-sm"><span class="block text-slate-600 mb-1">Group name *</span><input v-model="groupForm.name" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
            <label class="text-sm"><span class="block text-slate-600 mb-1">Vendor <ReqTag code="INV-2b" text="A group can carry its own vendor (e.g. the cart-hardware group from one supplier)." /></span><select v-model="groupForm.vendor_id" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option value="">— none —</option><option v-for="v in store.vendors" :key="v.id" :value="v.id">{{ v.name }}</option></select></label>
            <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Description</span><input v-model="groupForm.description" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          </div>
          <label class="text-sm flex items-center gap-2"><input v-model="groupForm.assembly_only" type="checkbox" /> This group can only be shipped as an assembly <ReqTag ver="V6" code="INV-2" text="V6 Inventory 2 — a master full-cart group can only ship as an assembly; its individual parts can still ship loose." /></label>
          <label class="text-sm block"><span class="block text-slate-600 mb-1">Image <span class="text-slate-400 font-normal">(optional · max 200 KB)</span></span><div class="flex items-center gap-3"><input type="file" accept="image/*" class="text-xs" @change="onImage($event, groupForm)" /><img v-if="groupForm.image" :src="groupForm.image" class="w-14 h-14 object-cover rounded ring-1 ring-slate-200" /></div></label>
          <div>
            <span class="block text-slate-600 mb-1 text-sm">Add items to this group <ReqTag code="INV-1" text="V3 Inventory #1 — Group building is fast: adding successive items to a group has no lag (lightweight search picker)." /> <span class="text-xs text-slate-400">— search & click to drop in (single items or other groups)</span></span>
            <SearchPicker multi :options="store.catalogLite" :exclude-ids="memberExclude" placeholder="Search all inventory…" @pick="onMemberPick" />
          </div>
          <div v-for="(m,idx) in groupForm.members" :key="idx" class="flex items-center gap-2 text-sm rounded-lg ring-1 ring-slate-100 px-3 py-2">
            <Badge :tone="m.kind==='group'?'emerald':'slate'">{{ m.kind }}</Badge>
            <span class="flex-1">{{ m.kind==='group' ? (store.groupById(m.ref_id)||{}).name : (store.itemById(m.ref_id)||{}).name }}</span>
            <input v-model="m.qty" type="number" min="1" class="w-16 h-8 px-2 rounded border border-slate-300 text-right" />
            <button class="text-rose-500 text-lg" @click="groupForm.members.splice(idx,1)">&times;</button>
          </div>
          <p v-if="!groupForm.members.length" class="text-xs text-slate-400">No members yet — search above and click to add.</p>
        </div>

        <!-- assembly -->
        <div v-else class="space-y-3">
          <div class="flex gap-2">
            <button type="button" class="flex-1 h-9 rounded-lg text-xs font-semibold border" :class="asmForm.assembly_kind==='cart'?'bg-violet-600 text-white border-violet-600':'border-slate-300 text-slate-600'" @click="asmForm.assembly_kind='cart'">Cart assembly <span class="font-normal opacity-70">(built from parts)</span></button>
            <button type="button" class="flex-1 h-9 rounded-lg text-xs font-semibold border inline-flex items-center justify-center gap-1" :class="asmForm.assembly_kind==='single'?'bg-violet-600 text-white border-violet-600':'border-slate-300 text-slate-600'" @click="asmForm.assembly_kind='single'">Single-item assembly <ReqTag ver="V4" code="AS-2" text="Amendment — two kinds of assembly: a cart (built from groups + singles) and a single-item assembly (laptop, gameshow) that has no parts to put together." /></button>
          </div>
          <label class="text-sm block"><span class="block text-slate-600 mb-1">Assembly name *</span><input v-model="asmForm.name" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>

          <!-- CART assembly: parts + auto-fill defaults -->
          <template v-if="asmForm.assembly_kind==='cart'">
            <label class="text-sm block"><span class="block text-slate-600 mb-1">Cart type</span><select v-model="asmForm.assembly_type_id" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option v-for="t in store.assemblyTypes" :key="t.id" :value="t.id">{{ t.name }}</option></select></label>
            <div>
              <span class="block text-slate-600 mb-1 text-sm">Parts — groups &amp; singles <ReqTag ver="V4" code="AS-2" text="V4 Assemblies #2 — a cart assembly is built from group items and singles." /> <span class="text-xs text-slate-400">— search &amp; click to add</span></span>
              <SearchPicker multi :options="store.catalogLite" :exclude-ids="asmPartExclude" placeholder="Search groups &amp; items…" @pick="onAsmPartPick" />
              <p class="mt-1 text-[11px] text-violet-600">An assembly can combine <b>any number of groups and single items</b> — add as many as the cart needs.</p>
            </div>
            <div v-for="(c,idx) in asmForm.composition" :key="idx" class="flex items-center gap-2 text-sm rounded-lg ring-1 ring-slate-100 px-3 py-2">
              <Badge :tone="c.kind==='group'?'emerald':'slate'">{{ c.kind }}</Badge>
              <span class="flex-1">{{ asmPartName(c) }}</span>
              <input v-model="c.qty" type="number" min="1" class="w-16 h-8 px-2 rounded border border-slate-300 text-right" />
              <button class="text-rose-500 text-lg" @click="asmForm.composition.splice(idx,1)">&times;</button>
            </div>
            <p v-if="!asmForm.composition.length" class="text-xs text-slate-400">No parts yet — search above and click to add.</p>
            <div class="rounded-lg bg-violet-50/60 ring-1 ring-violet-100 p-3">
              <div class="text-xs font-semibold uppercase tracking-wide text-violet-700 mb-2">Asset auto-fill defaults <ReqTag ver="V4" code="AS-3" text="V4 Assemblies #3 — these defaults auto-fill the asset fields when a unit is built." /></div>
              <div class="grid grid-cols-3 gap-3">
                <label class="text-sm"><span class="block text-slate-600 mb-1">Cart Type</span><input v-model="asmForm.asset_defaults.cart_type" list="dlCT_a" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
                <label class="text-sm"><span class="block text-slate-600 mb-1">Key Type</span><input v-model="asmForm.asset_defaults.key_type" list="dlKT_a" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
                <label class="text-sm"><span class="block text-slate-600 mb-1">BP Device</span><input v-model="asmForm.asset_defaults.bp_device" list="dlBP_a" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
              </div>
              <datalist id="dlCT_a"><option v-for="o in store.cartTypeOptions" :key="o" :value="o" /></datalist>
              <datalist id="dlKT_a"><option v-for="o in store.keyTypeOptions" :key="o" :value="o" /></datalist>
              <datalist id="dlBP_a"><option v-for="o in store.bpDeviceOptions" :key="o" :value="o" /></datalist>
              <p class="mt-1 text-[11px] text-slate-500">Suggestions come from your existing cart types — type your own to add a new one. Finalize the list any time in <b>Manage cart types</b>.</p>
            </div>
          </template>

          <!-- SINGLE-ITEM assembly: source item + info fields (no parts to assemble) -->
          <template v-else>
            <label class="text-sm block"><span class="block text-slate-600 mb-1">Source item — must be an assembly-only item *</span>
              <select v-model="asmForm.source_item_id" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm">
                <option value="">— choose the raw item —</option>
                <option v-for="it in store.items.filter(i=>i.assembly_only)" :key="it.id" :value="it.id">{{ it.name }} ({{ it.sku }})</option>
              </select>
            </label>
            <p class="text-[11px] text-slate-500">No parts to put together — assembling just records the unit's info (RAM, make, price, …). One unit consumes one source item from inventory.</p>
            <div>
              <span class="block text-slate-600 mb-1 text-sm">Info fields captured at assembly</span>
              <div v-for="(f,idx) in asmForm.fields" :key="idx" class="flex items-center gap-2 mb-2">
                <input v-model="asmForm.fields[idx]" placeholder="e.g. RAM" class="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm" />
                <button class="text-rose-500 text-lg" @click="asmForm.fields.splice(idx,1)">&times;</button>
              </div>
              <button type="button" class="text-xs font-semibold text-indigo-600 hover:underline" @click="asmForm.fields.push('')">+ Add field</button>
            </div>
          </template>
        </div>
      </div>
      <template #footer><Btn variant="secondary" @click="showAdd=false">Cancel</Btn><Btn @click="saveAdd">Save</Btn></template>
    </Modal>

    <!-- low stock list -> order workflow -->
    <Modal v-if="showLow" title="Low stock items" sub="At or below threshold — reorder to keep facilities supplied." wide @close="showLow=false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left px-3 py-2">Item</th><th class="text-left px-3 py-2">Vendor</th><th class="text-right px-3 py-2">On hand</th><th class="text-right px-3 py-2">Threshold</th><th class="text-right px-3 py-2">Suggested order</th><th></th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="it in store.lowStockList" :key="it.id" class="hover:bg-slate-50/60">
              <td class="px-3 py-2 text-slate-700">{{ it.name }}</td>
              <td class="px-3 py-2 text-slate-500">{{ store.vendorName(it.vendor_id) }}</td>
              <td class="px-3 py-2 text-right tabular-nums text-rose-600 font-semibold">{{ it.qty_onhand }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ it.threshold }}</td>
              <td class="px-3 py-2 text-right tabular-nums text-indigo-700 font-semibold">{{ Math.max(it.threshold * 2 - it.qty_onhand, it.threshold) }}</td>
              <td class="px-3 py-2 text-right"><Btn variant="soft-primary" size="sm" @click="orderItem(it)">Order more →</Btn></td>
            </tr>
            <tr v-if="!store.lowStockList.length"><td colspan="6" class="px-3 py-8 text-center text-emerald-600">All items are above threshold. 🎉</td></tr>
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-slate-500">“Order more” starts a new Purchase Order pre-filled with the selected item(s).</p>
      <template #footer><Btn variant="secondary" @click="showLow=false">Close</Btn><Btn v-if="store.lowStockList.length" @click="orderAllLow">Order all low stock →</Btn></template>
    </Modal>

    <!-- build assembly (one tracked unit) -->
    <Modal v-if="showBuild && buildDef" :title="'Build ' + buildDef.name" :sub="buildDef.assembly_kind==='single' ? 'Single-item assembly — enter the unit info. Consumes 1 from stock and creates ONE tracked unit. Unit Code is required.' : 'Consumes the parts and creates ONE tracked cart asset. Cart Code is required; asset fields auto-fill.'" @close="showBuild=false">
      <div class="space-y-3">
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Which assembly are you building? <ReqTag ver="V6" code="AS-3" text="V6 Assemblies 3 — clearly choose which assembly type you are building." /></span><select v-model="build.assembly_id" @change="reloadBuildFields" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option v-for="a in store.assemblies" :key="a.id" :value="a.id">{{ a.name }}<template v-if="a.assembly_kind==='single'"> (single-item)</template></option></select></label>
        <div class="rounded-lg bg-slate-50 ring-1 ring-slate-100 p-3 text-xs text-slate-600">Buildable now: <b>{{ store.assemblyBuildable(buildDef.id) }}</b> · Unit cost (FIFO incl. landed): <b>{{ money(store.assemblyUnitCost(buildDef.id)) }}</b></div>

        <datalist id="dlCT_b"><option v-for="o in store.cartTypeOptions" :key="o" :value="o" /></datalist>
        <datalist id="dlKT_b"><option v-for="o in store.keyTypeOptions" :key="o" :value="o" /></datalist>
        <datalist id="dlBP_b"><option v-for="o in store.bpDeviceOptions" :key="o" :value="o" /></datalist>
        <!-- CART build -->
        <div v-if="buildDef.assembly_kind!=='single'" class="grid grid-cols-2 gap-3">
          <label class="text-sm"><span class="block text-slate-600 mb-1">Cart Code <span class="text-rose-500">*</span> <ReqTag ver="V4" code="AS-4" text="V4 Assemblies #4 — Cart Code is mandatory and the unit carries all asset info." /></span><input v-model="build.code" placeholder="e.g. CART-V-0002" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Cart Color</span><input v-model="build.cart_color" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Cart Type</span><input v-model="build.fields.cart_type" list="dlCT_b" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Key Type</span><input v-model="build.fields.key_type" list="dlKT_b" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">BP Device</span><input v-model="build.fields.bp_device" list="dlBP_b" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Tablet Number</span><input v-model="build.tablet_number" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        </div>

        <!-- SINGLE-ITEM build (no parts; just unit info) -->
        <div v-else class="grid grid-cols-2 gap-3">
          <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Unit Code <span class="text-rose-500">*</span> <ReqTag ver="V4" code="AS-4" text="V4 Assemblies #4 — a unit code / asset tag is mandatory; the unit carries all its info." /></span><input v-model="build.code" placeholder="e.g. LAP-0003" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label v-for="(v,k) in build.fields" :key="k" class="text-sm"><span class="block text-slate-600 mb-1">{{ k }}</span><input v-model="build.fields[k]" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        </div>

        <p class="text-[11px] text-slate-500"><template v-if="buildDef.assembly_kind==='single'">Assigned to an employee later, when the unit ships out on a Sales Order.</template><template v-else>Facility &amp; Regional are set later, when the cart ships out on a Sales Order.</template> <ReqTag ver="V4" code="AS-5" text="V4 Assemblies #5 — assignment auto-fills at ship-out (carts → facility + Regional; laptops/gameshows → the employee)." /></p>
      </div>
      <template #footer><Btn variant="secondary" @click="showBuild=false">Cancel</Btn><Btn variant="success" @click="saveBuild">{{ buildDef.assembly_kind==='single' ? 'Build unit' : 'Build cart' }}</Btn></template>
    </Modal>

    <!-- AS-5: build multiple assemblies at once -->
    <Modal v-if="showBatch && batchDef" :title="'Build multiple — ' + batchDef.name" sub="Add a row per unit and fill the details; builds them all at once and removes the parts from inventory." wide @close="showBatch=false">
      <div class="space-y-3">
        <div class="flex flex-wrap items-end gap-3">
          <label class="text-sm"><span class="block text-slate-600 mb-1">Assembly type <ReqTag ver="V6" code="AS-3" text="V6 Assemblies 3 — choose which assembly type you are building." /></span><select v-model="batch.assembly_id" @change="onBatchAsm" class="h-9 px-3 rounded-lg border border-slate-300 text-sm"><option v-for="a in store.assemblies" :key="a.id" :value="a.id">{{ a.name }}<template v-if="a.assembly_kind==='single'"> (single-item)</template></option></select></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Condition</span><select v-model="batch.condition" class="h-9 px-3 rounded-lg border border-slate-300 text-sm"><option>New</option><option>Refurbished</option></select></label>
          <div class="text-xs text-slate-500 ml-auto text-right">Available to build (from parts): <b>{{ store.assemblyBuildable(batch.assembly_id) }}</b><div class="text-[11px] text-slate-400 max-w-[340px]">Contains: {{ asmContents(batch.assembly_id) || '—' }}</div></div>
        </div>
        <div v-if="batchIsCart" class="text-[11px] text-violet-700">Auto-filled from inventory → Cart Type <b>{{ batchAutoFill.cart_type || '—' }}</b> · Key <b>{{ batchAutoFill.key_type || '—' }}</b> · BP <b>{{ batchAutoFill.bp_device || '—' }}</b> <ReqTag ver="V6" code="AS-2" text="V6 Assemblies 2 — these values are traced from the inventory items/groups inside the assembly." /></div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th class="px-2 py-2 text-left">#</th><th class="px-2 py-2 text-left">Code *</th><template v-if="batchIsCart"><th class="px-2 py-2 text-left">Colour</th><th class="px-2 py-2 text-left">Tablet #</th></template><template v-else><th v-for="f in batchDef.fields" :key="f" class="px-2 py-2 text-left">{{ f }}</th></template><th></th></tr></thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(r,i) in batch.rows" :key="i">
                <td class="px-2 py-1 text-slate-400">{{ i+1 }}</td>
                <td class="px-2 py-1"><input v-model="r.code" :placeholder="batchIsCart ? 'CART-…' : 'UNIT-…'" class="w-32 h-8 px-2 rounded border border-slate-300 text-sm" /></td>
                <template v-if="batchIsCart"><td class="px-2 py-1"><input v-model="r.cart_color" class="w-24 h-8 px-2 rounded border border-slate-300 text-sm" /></td><td class="px-2 py-1"><input v-model="r.tablet_number" class="w-28 h-8 px-2 rounded border border-slate-300 text-sm" /></td></template>
                <template v-else><td v-for="f in batchDef.fields" :key="f" class="px-2 py-1"><input v-model="r.fields[f]" class="w-28 h-8 px-2 rounded border border-slate-300 text-sm" /></td></template>
                <td class="px-2 py-1 text-right"><button class="text-rose-400 text-lg" @click="removeBatchRow(i)">&times;</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button class="text-xs font-semibold text-indigo-600 hover:underline" @click="addBatchRow">+ Add row</button>
      </div>
      <template #footer><Btn variant="secondary" @click="showBatch=false">Cancel</Btn><Btn variant="success" @click="saveBatch">Build {{ batch.rows.filter(r=>String(r.code).trim()).length }} unit(s)</Btn></template>
    </Modal>

    <!-- edit built cart -->
    <Modal v-if="showEditUnit" title="Edit assembled cart" sub="Update the asset details of a built cart." @close="showEditUnit=false">
      <div class="grid grid-cols-2 gap-3">
        <label class="text-sm"><span class="block text-slate-600 mb-1">Cart Code *</span><input v-model="editUnit.code" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm"><span class="block text-slate-600 mb-1">Cart Color</span><input v-model="editUnit.cart_color" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm"><span class="block text-slate-600 mb-1">Key Type</span><input v-model="editUnit.key_type" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm"><span class="block text-slate-600 mb-1">BP Device</span><input v-model="editUnit.bp_device" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Tablet Number</span><input v-model="editUnit.tablet_number" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
      </div>
      <template #footer><Btn variant="secondary" @click="showEditUnit=false">Cancel</Btn><Btn @click="saveEditUnit">Save <ReqTag ver="V4" code="AS-6" text="V4 Assemblies #6 — edit an assembly after it is built." /></Btn></template>
    </Modal>

    <!-- manage cart (assembly) types -->
    <Modal v-if="showTypes" title="Manage cart types" sub="Each cart type is a preset made once — its name and what is inside it. Edit a type's contents or add a new one; 'Build carts' then just picks a type and pulls the parts automatically." wide @close="showTypes=false">
      <div class="space-y-2">
        <div class="flex items-center justify-between"><span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Cart types (presets)</span><Btn size="sm" @click="openNewType">+ New cart type</Btn></div>
        <div v-for="a in store.assemblies.filter(x=>x.assembly_kind!=='single')" :key="a.id" class="rounded-lg ring-1 ring-slate-200 px-3 py-2">
          <div class="flex items-center gap-2"><span class="font-semibold text-slate-800">{{ a.name }}</span><span class="text-[11px] text-slate-400">· {{ store.assemblyBuildable(a.id) }} buildable</span><Btn variant="ghost" size="sm" class="ml-auto" @click="openTypeEdit(a)">Edit contents</Btn></div>
          <div class="text-[11px] text-slate-500 mt-0.5">Contains: {{ asmContents(a.id) || '—' }}</div>
        </div>
        <p v-if="!store.assemblies.filter(x=>x.assembly_kind!=='single').length" class="text-xs text-slate-400">No cart types yet — click <b>+ New cart type</b> to define one.</p>
        <details class="pt-2 border-t border-slate-100"><summary class="text-[11px] uppercase tracking-wide text-slate-400 cursor-pointer">Cart type labels (used in the picker)</summary><div class="space-y-2 pt-2">
          <div v-for="t in store.assemblyTypes" :key="t.id" class="flex items-center gap-2"><input v-model="t.name" class="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm" /></div>
          <div class="flex items-center gap-2"><input v-model="newTypeName" placeholder="New label…" class="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm" @keyup.enter="addType" /><Btn size="sm" @click="addType">Add</Btn></div>
        </div></details>
      </div>
      <template #footer><Btn @click="showTypes=false">Done</Btn></template>
    </Modal>

    <!-- adjust stock -->
    <Modal v-if="showStock" title="Adjust stock" :sub="stock.item?stock.item.name:''" @close="showStock=false">
      <div class="space-y-4">
        <div class="flex gap-2">
          <button class="flex-1 h-9 rounded-lg text-sm font-medium border" :class="stock.dir==='add'?'bg-emerald-600 text-white border-emerald-600':'border-slate-300 text-slate-600'" @click="stock.dir='add'">Add quantity</button>
          <button class="flex-1 h-9 rounded-lg text-sm font-medium border" :class="stock.dir==='remove'?'bg-rose-600 text-white border-rose-600':'border-slate-300 text-slate-600'" @click="stock.dir='remove'">Remove quantity</button>
        </div>
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Quantity</span><input v-model="stock.qty" type="number" min="1" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Reason <span class="text-rose-500">*</span></span><input v-model="stock.reason" placeholder="Required — e.g. cycle count, damage, correction" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <p class="text-xs text-slate-500">Adjusts total on hand. A reason is mandatory and recorded in the stock log.</p>
      </div>
      <template #footer><Btn variant="secondary" @click="showStock=false">Cancel</Btn><Btn @click="saveStock">Apply</Btn></template>
    </Modal>

    <!-- lots -->
    <Modal v-if="showLots" title="FIFO cost layers" :sub="lotItem?lotItem.name:''" wide @close="showLots=false">
      <table class="w-full text-sm"><thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left px-3 py-2">Received</th><th class="text-left px-3 py-2">Ref</th><th class="text-right px-3 py-2">Qty</th><th class="text-right px-3 py-2">Base</th><th class="text-right px-3 py-2">Landed</th><th class="text-right px-3 py-2">Effective</th></tr></thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="(l,idx) in (lotItem?lotItem.lots:[])" :key="l.id" :class="idx===0?'bg-emerald-50/50':''">
            <td class="px-3 py-2 text-slate-600">{{ l.received_at }}<span v-if="idx===0" class="ml-1 text-[10px] text-emerald-700 font-bold">NEXT OUT</span></td>
            <td class="px-3 py-2 font-mono text-xs text-slate-500">{{ l.ref }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ l.qty }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ money(l.unit_cost) }}</td>
            <td class="px-3 py-2 text-right tabular-nums" :class="l.landed?'text-amber-700':''">{{ l.landed ? '+'+money(l.landed) : '—' }}</td>
            <td class="px-3 py-2 text-right tabular-nums font-semibold">{{ money(l.unit_cost + (l.landed||0)) }}</td>
          </tr>
        </tbody></table>
      <p class="mt-3 text-xs text-slate-500">Oldest layer (top) is issued first. Landed cost rides on top of the base cost and travels with the item when it ships.</p>
    </Modal>

    <!-- logs -->
    <Modal v-if="showLogs" title="Stock log" :sub="logItem?logItem.name:''" wide @close="showLogs=false">
      <table class="w-full text-sm"><thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left py-2">When</th><th class="text-left py-2">Source</th><th class="text-left py-2">Ref</th><th class="text-right py-2">Qty</th></tr></thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="l in itemLogs" :key="l.id"><td class="py-2 text-slate-500">{{ fmtDateTime(l.created_at) }}</td><td class="py-2"><Badge :tone="l.kind==='out'?'rose':'emerald'">{{ l.source_label }}</Badge><span v-if="l.reason" class="text-xs text-slate-400 ml-2">{{ l.reason }}</span></td><td class="py-2 font-mono text-xs text-slate-500">{{ l.ref || '—' }}</td><td class="py-2 text-right font-semibold tabular-nums" :class="l.kind==='out'?'text-rose-600':'text-emerald-600'">{{ l.kind==='out'?'-':'+' }}{{ l.qty }}</td></tr>
          <tr v-if="!itemLogs.length"><td colspan="4" class="py-8 text-center text-slate-400">No movements yet.</td></tr>
        </tbody></table>
    </Modal>

    <!-- assemble cart -->
    <Modal v-if="showAssemble" title="Assemble cart" sub="Consumes the chosen items from inventory and lists the cart here + in Assets." wide @close="showAssemble=false">
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <label class="text-sm"><span class="block text-slate-600 mb-1">Cart code</span><input v-model="asm.code" placeholder="auto if blank" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Cart type</span><select v-model="asm.cart_type" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option v-for="t in store.assemblyTypes" :key="t.id" :value="t.name">{{ t.name }}</option></select></label>
        </div>
        <div><span class="block text-slate-600 mb-1 text-sm">Components <span class="text-xs text-slate-400">— search & click to add</span></span><SearchPicker multi :options="singleOptions" :exclude-ids="asmExclude" placeholder="Search items…" @pick="onCompPick" /></div>
        <table class="w-full text-sm"><tbody class="divide-y divide-slate-100">
          <tr v-for="(c,idx) in asm.components" :key="c.vendor_item_id"><td class="px-2 py-2 text-slate-700">{{ c.name }}</td><td class="px-2 py-2 text-right"><input v-model="c.qty" type="number" min="1" class="w-16 h-8 px-2 rounded border border-slate-300 text-right" /></td><td class="px-2 py-2 text-right tabular-nums text-slate-500">{{ money((Number(c.qty)||0)*store.fifoUnitCost(c.vendor_item_id)) }}</td><td class="px-2 py-2 text-right"><button class="text-rose-500" @click="asm.components.splice(idx,1)">&times;</button></td></tr>
          <tr v-if="!asm.components.length"><td colspan="4" class="px-2 py-5 text-center text-slate-400">No components yet.</td></tr>
        </tbody><tfoot><tr class="border-t border-slate-200"><td class="px-2 py-2 text-xs uppercase text-slate-400">Cart cost (FIFO)</td><td colspan="2" class="px-2 py-2 text-right font-bold tabular-nums">{{ money(asmCost) }}</td><td></td></tr></tfoot></table>
      </div>
      <template #footer><Btn variant="secondary" @click="showAssemble=false">Cancel</Btn><Btn @click="saveAssemble">Assemble</Btn></template>
    </Modal>

    <!-- assign cart -->
    <Modal v-if="showAssign" title="Assign cart to facility" @close="showAssign=false">
      <label class="text-sm block"><span class="block text-slate-600 mb-1">Facility</span><select v-model="assignFac" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option v-for="f in store.facilities" :key="f.id" :value="f.id">{{ f.name }}</option></select></label>
      <template #footer><Btn variant="secondary" @click="showAssign=false">Cancel</Btn><Btn @click="saveAssign">Assign</Btn></template>
    </Modal>
  </div>
</template>
