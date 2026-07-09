<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { useWarehouseStore, TODAY } from '@/stores/warehouse';
import { useToast } from '@/composables/useToast';
import Hero from '@/components/ui/Hero.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import Btn from '@/components/ui/BaseButton.vue';
import Modal from '@/components/ui/BaseModal.vue';
import ReqTag from '@/components/ui/ReqTag.vue';

const store = useWarehouseStore();
const toast = useToast();

const tab = ref('cart');
const classes = computed(() => store.assetClassList);
const meta = computed(() => store.assetClassMeta(tab.value));

const search = ref('');
const statusFilter = ref('');
const holderFilter = ref('');

// pagination: default 10 per page; user can choose 10/20/30/40/50 (max 50)
const pageSize = ref(10);
const pageOptions = [10, 20, 30, 40, 50];
const page = ref(1);

function resetView() { search.value = ''; statusFilter.value = ''; holderFilter.value = ''; page.value = 1; }
function pickTab(id) { tab.value = id; resetView(); }

const STATUS_TONE = {
  'In Warehouse': 'slate', 'Deployed': 'emerald', 'Assigned': 'blue', 'Out of Service': 'amber',
  'Incomplete': 'amber', 'Retired': 'slate', 'Return Pending': 'rose', 'Returned': 'violet',
  'Active': 'emerald', 'Deactivated': 'slate',
};
const tone = (st) => STATUS_TONE[st] || 'slate';

const classAssets = computed(() => store.assetsOf(tab.value));
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return classAssets.value.filter((a) => {
    if (statusFilter.value && a.status !== statusFilter.value) return false;
    if (holderFilter.value === 'employee' && a.holder_type !== 'employee') return false;
    if (holderFilter.value === 'facility' && a.holder_type !== 'facility') return false;
    if (holderFilter.value === 'warehouse' && a.holder_type) return false;
    if (!q) return true;
    const hay = [a.code, a.holder, a.status, ...((meta.value.cols || []).map((c) => a[c[0]]))].join(' ').toLowerCase();
    return hay.includes(q);
  });
});
const total = computed(() => filtered.value.length);
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const paged = computed(() => { const start = (page.value - 1) * pageSize.value; return filtered.value.slice(start, start + pageSize.value); });
const rangeLabel = computed(() => { if (!total.value) return '0 items'; const start = (page.value - 1) * pageSize.value + 1; const end = Math.min(total.value, page.value * pageSize.value); return start + '–' + end + ' of ' + total.value; });
const statusesPresent = computed(() => [...new Set(classAssets.value.map((a) => a.status).filter(Boolean))]);
const statusSummary = computed(() => statusesPresent.value.map((st) => ({ st, n: classAssets.value.filter((a) => a.status === st).length })));
watch([search, statusFilter, holderFilter, tab, pageSize], () => { page.value = 1; });
function prev() { if (page.value > 1) page.value--; }
function next() { if (page.value < pageCount.value) page.value++; }

function onStatus(a, ev) { store.setAssetUnitStatus(a.id, ev.target.value); toast.success(a.code + ' → ' + ev.target.value); }
const cell = (a, key) => { const v = a[key]; if (v === true) return 'Yes'; if (v === false || v == null || v === '') return '—'; return v; };

// ---------- add / edit an asset ----------
const showEdit = ref(false);
const editingId = ref(null);
const form = reactive({ code: '', holder_type: '', holder: '', emp_state: '', status: 'In Warehouse', condition: 'New', fields: {} });
function blankFields() { const f = {}; (meta.value.cols || []).forEach((c) => { f[c[0]] = ''; }); return f; }
function openAdd() { editingId.value = null; Object.assign(form, { code: store.nextAssetCode(tab.value), holder_type: '', holder: '', emp_state: '', status: 'In Warehouse', condition: 'New', fields: blankFields() }); showEdit.value = true; }
function onHolderPick() { if (form.holder_type === 'employee') { const st = store.userStateOf(form.holder); if (st) form.emp_state = st; } else if (form.holder_type === 'facility') { form.emp_state = store.facilityStateOf(form.holder) || ''; } }
function openEdit(a) { editingId.value = a.id; const f = {}; (meta.value.cols || []).forEach((c) => { f[c[0]] = a[c[0]] != null ? a[c[0]] : ''; }); Object.assign(form, { code: a.code || '', holder_type: a.holder_type || '', holder: a.holder || '', emp_state: a.emp_state || '', status: a.status || 'In Warehouse', condition: a.condition || 'New', fields: f }); showEdit.value = true; }
function saveEdit() {
  if (!String(form.code).trim()) return toast.error('A Code / ID is required.');
  const patch = { code: String(form.code).trim(), holder_type: form.holder_type, holder: form.holder_type ? String(form.holder).trim() : '', emp_state: form.holder_type === 'employee' ? String(form.emp_state).trim() : '', status: form.status, condition: form.condition, ...form.fields };
  if (!editingId.value) { const missing = store.assetTypeBuildCols(tab.value).filter((c) => c[0] !== 'price' && !String((form.fields[c[0]] || '')).trim()); if (missing.length) return toast.error('Please fill required fields: ' + missing.map((c) => c[1]).join(', ') + '.'); }
  if (editingId.value) { const r = store.updateAsset(editingId.value, patch); if (r && r.error) return toast.error(r.error); toast.success(patch.code + ' updated.'); }
  else { const r = store.buildAssetOf(tab.value, patch); if (r && r.error) return toast.error(r.error); toast.success(patch.code + ' built.'); }
  showEdit.value = false;
}

// ---------- Manage Asset Types: define a type, its ID prefix, and its columns (build vs ship-out) ----------
const showTypes = ref(false);
const typeForm = reactive({ id: null, label: '', prefix: '', assign: 'employee', cols: [], source: 'none' });
function resetTypeForm() { Object.assign(typeForm, { id: null, label: '', prefix: '', assign: 'employee', cols: [], source: 'none' }); }
function openTypes() { resetTypeForm(); showTypes.value = true; }
function editType(c) { Object.assign(typeForm, { id: c.id, label: c.label, prefix: c.prefix || '', assign: c.assign || 'employee', cols: (c.cols || []).map((col) => ({ key: col[0], label: col[1], stage: col[2] || 'build', choices: Array.isArray(col[3]) ? col[3].join(', ') : '' })), source: (c.source_kind && c.source_id) ? (c.source_kind + ':' + c.source_id) : 'none' }); }
function addCol() { typeForm.cols.push({ key: '', label: '', stage: 'build', choices: '' }); }
function rmCol(i) { typeForm.cols.splice(i, 1); }
function saveType() {
  const cols = typeForm.cols.filter((c) => String(c.label).trim()).map((c) => { const key = (c.key || c.label).toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); const stage = c.stage === 'shipout' ? 'shipout' : 'build'; const choices = String(c.choices || '').split(',').map((x) => x.trim()).filter(Boolean); if (choices.length) return [key, c.label.trim(), stage, choices]; return stage === 'shipout' ? [key, c.label.trim(), 'shipout'] : [key, c.label.trim()]; });
  const sp = String(typeForm.source || 'none').split(':');
  const payload = { label: typeForm.label, prefix: typeForm.prefix, assign: typeForm.assign, cols, source_kind: sp[0] === 'none' ? 'none' : sp[0], source_id: sp[0] === 'none' ? '' : sp.slice(1).join(':') };
  const r = typeForm.id ? store.updateAssetType(typeForm.id, payload) : store.addAssetType(payload);
  if (r && r.error) return toast.error(r.error);
  toast.success('Asset type ' + (typeForm.id ? 'updated' : 'added') + '.'); resetTypeForm();
}
function removeType(c) { const r = store.removeAssetType(c.id); if (r && r.error) return toast.error(r.error); toast.success(c.label + ' removed.'); if (tab.value === c.id) tab.value = 'cart'; }
// ---------- Employee confirms receipt of an assigned asset ----------
function confirmReceipt(a) { const r = store.confirmAssetReceipt(a.id, a.holder); if (r && r.error) return toast.error(r.error); toast.success(a.code + ' receipt confirmed.'); }
// ---------- Ship a warehouse asset out to an employee (reuses the Phase-1 shipOutAsset engine) ----------
const showShipOut = ref(false);
const shipForm = reactive({ id: null, code: '', holder: '', emp_state: '' });
function openShipOut(a) { Object.assign(shipForm, { id: a.id, code: a.code, holder: '', emp_state: '' }); showShipOut.value = true; }
function onShipEmpPick() { const st = store.userStateOf(shipForm.holder); if (st) shipForm.emp_state = st; }
function doShipOut() {
  if (!shipForm.holder.trim()) return toast.error('Enter the employee this asset ships to.');
  const r = store.shipOutAsset(shipForm.id, { holder_type: 'employee', holder: shipForm.holder.trim(), emp_state: shipForm.emp_state.trim() });
  if (r && r.error) return toast.error(r.error);
  toast.success(shipForm.code + ' shipped to ' + shipForm.holder.trim() + ' — awaiting their receipt.');
  showShipOut.value = false;
}
// ---------- Bulk import existing assets (paste rows — avoids manual entry) ----------
const showImport = ref(false);
const importType = ref('');
const importPlace = ref('warehouse');
const sourceOptions = computed(() => [ ...(store.items || []).map((i) => ({ v: 'item:' + i.id, label: i.name + ' (item)' })), ...(store.groups || []).map((g) => ({ v: 'group:' + g.id, label: g.name + ' (group)' })) ]);
function returnToWh(a) { const r = store.markAssetInWarehouse(a.id); if (r && r.error) return toast.error(r.error); toast.success(a.code + ' is back in the warehouse.'); }
function onCondition(a, ev) { store.updateAsset(a.id, { condition: ev.target.value }); toast.success(a.code + ' → ' + ev.target.value); }
const importText = ref('');
function openImport() { importType.value = (tab.value && tab.value !== 'cart') ? tab.value : ((store.assetClassList.find((c) => c.id !== 'cart') || {}).id || ''); importText.value = ''; showImport.value = true; }
function runImport() {
  const klass = importType.value; if (!klass) return toast.error('Pick an asset type.');
  const cols = (store.assetClassMeta(klass).cols || []).map((c) => c[0]);
  const lines = importText.value.split('\n').map((l) => l.trim()).filter(Boolean);
  let added = 0, skipped = 0;
  lines.forEach((line) => {
    const parts = line.split(/[\t,]/).map((x) => x.trim());
    const code = parts[0]; if (!code) { skipped++; return; }
    const rec = { code }; cols.forEach((k, i) => { if (parts[i + 1] !== undefined && parts[i + 1] !== '') rec[k] = parts[i + 1]; });
    if (importPlace.value !== 'warehouse') { const holder = parts[cols.length + 1]; if (holder) { rec.holder_type = importPlace.value; rec.holder = holder; rec.status = importPlace.value === 'facility' ? 'Deployed' : 'Assigned'; } }
    const r = store.addAsset(klass, rec);
    if (r && r.error) skipped++; else added++;
  });
  toast.success(added + ' asset' + (added === 1 ? '' : 's') + ' imported' + (skipped ? ', ' + skipped + ' skipped (duplicate/blank)' : '') + '.');
  importText.value = ''; showImport.value = false;
}
// ---------- Unified "Build Asset": pick a type, then branch (simple -> form; cart -> proven cart engine) ----------
const showPick = ref(false);
const cartTypes = computed(() => (store.assemblies || []).filter((a) => a.assembly_kind !== 'single'));
const simpleTypes = computed(() => (store.assetClassList || []).filter((c) => c.id !== 'cart'));
function openBuildAsset() { showPick.value = true; }
function pickSimple(c) { showPick.value = false; pickTab(c.id); openAdd(); }
function pickCart(def) { showPick.value = false; openCartBuild(def.id); }
const showCartBuild = ref(false);
const cbuild = reactive({ assembly_id: '', rows: [] });
const cbuildDef = computed(() => store.assemblyById(cbuild.assembly_id));
const cbuildAutoFill = computed(() => cbuild.assembly_id ? store.assemblyAutoFill(cbuild.assembly_id) : {});
function cbSuggest() { let max = 0; const scan = (code) => { const m = String(code || '').match(/(\d+)\s*$/); if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; } }; (store.carts || []).forEach((c) => scan(c.code)); (cbuild.rows || []).forEach((r) => scan(r.code)); return String(max + 1).padStart(4, '0'); }
function cbNewRow() { return { code: cbSuggest(), cart_color: '', tablet_number: '' }; }
function openCartBuild(id) { cbuild.assembly_id = id; cbuild.rows = [cbNewRow()]; showCartBuild.value = true; }
function cbAddRow() { cbuild.rows.push(cbNewRow()); }
function cbRemoveRow(i) { cbuild.rows.splice(i, 1); if (!cbuild.rows.length) cbuild.rows.push(cbNewRow()); }
function cbSave() {
  const af = store.assemblyAutoFill(cbuild.assembly_id);
  const rows = cbuild.rows.filter((r) => String(r.code).trim()).map((r) => ({ assembly_id: cbuild.assembly_id, code: String(r.code).trim(), cart_color: r.cart_color, tablet_number: r.tablet_number, fields: af, condition: 'New' }));
  if (!rows.length) return toast.error('Enter at least one code.');
  const res = store.buildAssembliesBatch(rows);
  if (res.built.length) { toast.success('Built ' + res.built.length + ' cart(s) — parts removed from inventory.'); tab.value = 'cart'; showCartBuild.value = false; }
  if (res.errors.length) toast.error(res.errors.length + ' failed: ' + res.errors.map((e) => e.code + ' (' + e.error + ')').slice(0, 3).join('; '));
}

// ---------- export current view (WM reporting) ----------
function exportCsv() {
  const cols = meta.value.cols || [];
  const head = ['Code', 'Holder type', 'Holder', 'State', 'Status', ...cols.map((c) => c[1])];
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = filtered.value.map((a) => [a.code, a.holder_type || '', a.holder || '', a.emp_state || '', a.status || '', ...cols.map((c) => { const v = a[c[0]]; return v === true ? 'Yes' : (v === false || v == null ? '' : v); })]);
  const csv = [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a'); link.href = url; link.download = meta.value.label.replace(/\s+/g, '_') + '_assets.csv'; link.click(); URL.revokeObjectURL(url);
  toast.success('Exported ' + filtered.value.length + ' rows.');
}

// ---------- Returns from terminated employees ----------
const recoverName = ref('');
const recoverList = computed(() => store.assetsForEmployee(recoverName.value).filter((a) => a.status !== 'Returned'));
function startRecovery(name) { const n = store.recoverTerminatedAssets(name); recoverName.value = name; toast.info(n + ' asset' + (n === 1 ? '' : 's') + ' flagged for recovery from ' + name + '.'); }
function markReturned(a) { store.returnAsset(a.id); toast.success(a.code + ' marked returned.'); }
const heldCount = (name) => store.assetsForEmployee(name).filter((a) => a.status !== 'Returned').length;

// ---------- Cart Received ----------
const showRecv = ref(false);
const recv = reactive({ facility_id: '', received_on: TODAY, bol: '', photos: [], qty: 0 });
function openRecv(fid) { const ship = store.facilitiesAwaitingReceipt; const facId = fid || (ship[0] && ship[0].id) || (store.facilities[0] || {}).id; Object.assign(recv, { facility_id: facId, received_on: TODAY, bol: '', photos: [], qty: store.cartsInboundTo(facId) }); showRecv.value = true; }
function markReady(a) { store.markCartReady(a.id); toast.success(a.code + ' passed QC — ready to ship.'); }
function onBol(e) { const f = e.target.files && e.target.files[0]; if (f) recv.bol = f.name; }
function onPhotos(e) { recv.photos = Array.from(e.target.files || []).map((f) => f.name); }
function saveRecv() { if (!recv.bol) return toast.error('Upload the BOL to confirm receipt.'); store.confirmCartReceipt({ facility_id: recv.facility_id, received_on: recv.received_on, bol: recv.bol, photos: recv.photos, qty: recv.qty }); const f = store.facilityById(recv.facility_id); toast.success('Cart receipt confirmed for ' + (f ? f.name : '') + '.'); showRecv.value = false; }

const chips = computed(() => [
  { label: 'Total assets', value: store.assetTotal },
  { label: 'In warehouse', value: store.assetCountByStatus('', 'In Warehouse') },
  { label: 'To recover', value: store.assetsToRecover.length, danger: store.assetsToRecover.length > 0 },
]);
</script>

<template>
  <div>
    <Hero title="Assets" subtitle="Every tracked unit the company owns — carts and IT equipment — by class, holder and status." :chips="chips" />

    <div class="-mt-2 mb-4 flex flex-wrap items-center gap-2">
      <ReqTag ver="V7" code="FRESH-DATA" text="V7 — Assets start empty so you can enter your own. An asset appears here automatically when you build a cart (Inventory → Build) or add one with the + button; the 8 classes are ready to fill." />
      <ReqTag ver="V5" code="ASSETS" text="The Assets section holds all 8 real asset classes (Carts, Laptops, Game Shows, Tablets, Monitors, Desktops, Cell Phones, EZ Pass)." />
      <ReqTag ver="V5" code="CART-FIELDS" text="NEW — corrected cart schema: Cart Type is the wheel (cta wheel 1/2, cta yellow, microlife); BP Machine is edan / vs8 / accutar." />
      <ReqTag ver="V5" code="EDIT" text="NEW — add and edit any asset, with pagination (10–50 per page) for the large lists." />
      <ReqTag ver="V5" code="RETURNS" text="NEW — terminated employees show their outstanding assets; Start recovery flags them and Mark returned closes them out." />
    </div>

    <div class="flex flex-wrap gap-1.5 mb-4">
      <button v-for="c in classes" :key="c.id" class="px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors" :class="tab===c.id?'bg-indigo-600 text-white border-indigo-600':'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'" @click="pickTab(c.id)">
        {{ c.label }} <span class="text-xs opacity-70">{{ store.assetClassCount(c.id) }}</span>
      </button>
      <button class="px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors" :class="tab==='returns'?'bg-rose-600 text-white border-rose-600':'bg-white border-slate-200 text-rose-600 hover:bg-rose-50'" @click="pickTab('returns')">
        Returns — Terminated <span class="text-xs opacity-70">{{ store.terminatedList.length }}</span>
      </button>
      <button class="px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors" :class="tab==='received'?'bg-emerald-600 text-white border-emerald-600':'bg-white border-slate-200 text-emerald-700 hover:bg-emerald-50'" @click="pickTab('received')">Cart Received</button>
    </div>

    <Card v-if="tab!=='returns' && tab!=='received'" :title="meta.label" :sub="total + ' total · showing ' + rangeLabel">
      <!-- status summary (quick triage for the warehouse manager) -->
      <div class="flex flex-wrap items-center gap-1.5 mb-3">
        <button class="text-[11px] font-semibold px-2 py-1 rounded-full border" :class="!statusFilter?'bg-slate-800 text-white border-slate-800':'border-slate-200 text-slate-500'" @click="statusFilter=''">All {{ classAssets.length }}</button>
        <button v-for="g in statusSummary" :key="g.st" class="text-[11px] font-semibold px-2 py-1 rounded-full border" :class="statusFilter===g.st?'bg-slate-800 text-white border-slate-800':'border-slate-200 text-slate-600'" @click="statusFilter = statusFilter===g.st ? '' : g.st">{{ g.st }} {{ g.n }}</button>
      </div>

      <div class="flex flex-wrap items-center gap-2 mb-3">
        <input v-model="search" placeholder="Search code, holder, serial…" class="h-9 px-3 rounded-lg border border-slate-300 text-sm flex-1 min-w-[200px]" />
        <div class="flex gap-1">
          <button v-for="h in [['','All'],['employee','User Assets'],['facility','Facility'],['warehouse','In warehouse']]" :key="h[0]" class="px-2.5 h-9 rounded-lg text-xs font-semibold border" :class="holderFilter===h[0]?'bg-slate-800 text-white border-slate-800':'border-slate-200 text-slate-600'" @click="holderFilter=h[0]">{{ h[1] }}</button>
        </div>
        <Btn variant="secondary" size="sm" @click="exportCsv">Export CSV</Btn>
        <Btn size="sm" @click="openBuildAsset">+ Build asset</Btn>
        <Btn variant="secondary" size="sm" @click="openTypes">Manage asset types</Btn>
        <Btn variant="secondary" size="sm" @click="openImport">Import</Btn>
        <Btn v-if="tab!=='cart'" size="sm" @click="openAdd">+ Build {{ meta.label.replace(/s$/, '') }}</Btn>
        <span v-else class="text-xs text-slate-400 self-center">Build carts with <span class="font-semibold text-slate-500">+ Build asset</span> above · cart recipes live in Inventory</span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider sticky top-0">
            <tr>
              <th class="text-left px-3 py-2">{{ tab==='cart' ? 'Cart #' : 'ID' }}</th>
              <th class="text-left px-3 py-2">Holder</th>
              <th class="text-left px-3 py-2">Status</th>
              <th class="text-left px-3 py-2">Condition</th>
              <th v-for="c in meta.cols" :key="c[0]" class="text-left px-3 py-2">{{ c[1] }}</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="a in paged" :key="a.id" class="hover:bg-slate-50/60">
              <td class="px-3 py-2 font-mono text-xs text-slate-700">{{ a.code }}<Badge v-if="a.legacy" tone="slate" class="ml-1">old</Badge><Badge v-if="a.refurbished" tone="amber" class="ml-1">Refurb</Badge><Badge v-if="a._cart && a.refurbished && !a.ready" tone="rose" class="ml-1">Needs QC</Badge></td>
              <td class="px-3 py-2">
                <span v-if="a.holder_type==='employee'" class="text-slate-700">\U0001F464 {{ a.holder }}<span v-if="a.emp_state" class="text-slate-400"> · {{ a.emp_state }}</span></span>
                <span v-else-if="a.holder_type==='facility'" class="text-slate-700">\U0001F3E5 {{ a.holder }}</span>
                <span v-else class="text-slate-400">— warehouse —</span>
              </td>
              <td class="px-3 py-2">
                <select :value="a.status" class="h-7 px-1.5 rounded border border-slate-200 text-xs" @change="onStatus(a, $event)">
                  <option v-for="o in store.assetStatusOptions" :key="o">{{ o }}</option>
                </select>
              </td>
              <td class="px-3 py-2"><select v-if="tab!=='cart'" :value="a.condition || 'New'" @change="onCondition(a, $event)" class="h-7 px-1.5 rounded border border-slate-200 text-xs"><option>New</option><option>Used</option></select><Badge v-else tone="slate">{{ a.condition || 'New' }}</Badge></td>
              <td v-for="c in meta.cols" :key="c[0]" class="px-3 py-2 text-slate-600">{{ cell(a, c[0]) }}</td>
              <td class="px-3 py-2 text-right whitespace-nowrap"><button v-if="a._cart && a.refurbished && !a.ready" class="text-xs font-semibold text-amber-700 hover:underline mr-2" @click="markReady(a)">Mark ready</button><button v-if="a.holder_type==='employee' && a.status==='Assigned' && !a.received" class="text-xs font-semibold text-emerald-700 hover:underline mr-2" @click="confirmReceipt(a)">Confirm receipt</button><button v-if="tab!=='cart' && !a.holder_type && (a.status==='In Warehouse' || a.status==='Available')" class="text-xs font-semibold text-blue-700 hover:underline mr-2" @click="openShipOut(a)">Ship out</button><button v-if="tab!=='cart' && a.status==='Returned'" class="text-xs font-semibold text-violet-700 hover:underline mr-2" @click="returnToWh(a)">Return to warehouse</button><button class="text-xs font-semibold text-indigo-600 hover:underline" @click="openEdit(a)">Edit</button></td>
            </tr>
            <tr v-if="!total"><td :colspan="5 + meta.cols.length" class="px-3 py-8 text-center text-slate-400">No matching assets.</td></tr>
          </tbody>
        </table>
      </div>

      <!-- pagination controls -->
      <div class="flex flex-wrap items-center justify-between gap-3 pt-3">
        <div class="flex items-center gap-2 text-sm text-slate-500">
          <span>Rows per page</span>
          <select v-model.number="pageSize" class="h-8 px-2 rounded-lg border border-slate-300 text-sm">
            <option v-for="o in pageOptions" :key="o" :value="o">{{ o }}</option>
          </select>
          <span class="ml-1">{{ rangeLabel }}</span>
        </div>
        <div class="flex items-center gap-1">
          <Btn variant="secondary" size="sm" :disabled="page<=1" @click="prev">← Prev</Btn>
          <span class="text-sm text-slate-600 px-2">Page {{ page }} / {{ pageCount }}</span>
          <Btn variant="secondary" size="sm" :disabled="page>=pageCount" @click="next">Next →</Btn>
        </div>
      </div>
    </Card>

    <div v-else-if="tab==='returns'" class="grid gap-5 lg:grid-cols-2 items-start">
      <Card title="Terminated employees" sub="Their company assets must be recovered.">
        <div class="space-y-2 max-h-[60vh] overflow-y-auto">
          <div v-for="t in store.terminatedList" :key="t.id" class="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-slate-800 text-sm">{{ t.name }}</div>
              <div class="text-[11px] text-slate-500">{{ t.role || '—' }}<span v-if="t.personal_email"> · {{ t.personal_email }}</span></div>
            </div>
            <Badge :tone="heldCount(t.name) ? 'rose' : 'emerald'">{{ heldCount(t.name) }} to recover</Badge>
            <Btn size="sm" :variant="heldCount(t.name)?'soft-primary':'secondary'" :disabled="!heldCount(t.name)" @click="startRecovery(t.name)">Start recovery →</Btn>
          </div>
          <p v-if="!store.terminatedList.length" class="text-center text-slate-400 py-6 text-sm">No terminated employees.</p>
        </div>
      </Card>
      <Card :title="recoverName ? ('Assets held by ' + recoverName) : 'Select an employee'" :sub="recoverName ? (recoverList.length + ' outstanding') : 'Click Start recovery to list their assets.'">
        <div v-if="recoverName" class="space-y-2 max-h-[60vh] overflow-y-auto">
          <div v-for="a in recoverList" :key="a.id" class="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
            <Badge tone="indigo">{{ store.assetClassMeta(a.klass).label }}</Badge>
            <span class="font-mono text-xs text-slate-600">{{ a.code }}</span>
            <Badge :tone="tone(a.status)" class="ml-auto">{{ a.status }}</Badge>
            <Btn size="sm" variant="success" @click="markReturned(a)">Mark returned</Btn>
          </div>
          <p v-if="!recoverList.length" class="text-center text-emerald-600 py-6 text-sm">All assets recovered.</p>
        </div>
        <p v-else class="text-center text-slate-400 py-10 text-sm">No employee selected.</p>
      </Card>
    </div>

    <Card v-else title="Cart Received" sub="Confirm a facility's carts arrived (BOL + photos).">
      <div class="flex items-center justify-between mb-3">
        <p v-if="!store.facilitiesAwaitingReceipt.length" class="text-xs text-slate-400">No facilities are awaiting a delivery — the receive action appears only when an order is on the way.</p>
        <span v-else class="text-xs text-slate-500">{{ store.facilitiesAwaitingReceipt.length }} facility awaiting a delivery.</span>
        <Btn size="sm" :disabled="!store.facilitiesAwaitingReceipt.length" @click="openRecv()">+ Confirm cart received</Btn>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider"><tr><th class="text-left px-4 py-2">Facility</th><th class="text-left px-4 py-2">Qty</th><th class="text-left px-4 py-2">Shipment date</th><th class="text-left px-4 py-2">Received</th><th class="text-left px-4 py-2">BOL</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="r in store.cartReceipts" :key="r.id" class="hover:bg-slate-50/60">
              <td class="px-4 py-2 text-slate-700">{{ (store.facilityById(r.facility_id)||{}).name || r.facility_id }}</td>
              <td class="px-4 py-2">{{ r.shipped_qty || '—' }}</td>
              <td class="px-4 py-2 text-slate-500">{{ r.shipment_date || '—' }}</td>
              <td class="px-4 py-2 text-slate-500">{{ r.received_on }}</td>
              <td class="px-4 py-2 text-emerald-700">{{ r.bol_name }}</td>
            </tr>
            <tr v-if="!store.cartReceipts.length"><td colspan="5" class="px-4 py-8 text-center text-slate-400">No cart receipts yet.</td></tr>
          </tbody>
        </table>
      </div>
    </Card>

    <!-- add / edit asset -->
    <Modal v-if="showEdit" :title="(editingId?'Edit ':'Add ') + meta.label.replace(/s$/, '')" :sub="editingId ? form.code : 'New ' + meta.label.replace(/s$/, '') + ' — holder is an employee or a facility.'" wide @close="showEdit=false">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <label class="text-sm"><span class="block text-slate-600 mb-1">{{ tab==='cart' ? 'Cart #' : 'ID' }} <span class="text-rose-500">*</span></span><input v-model="form.code" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          <label class="text-sm"><span class="block text-slate-600 mb-1">Status</span><select v-model="form.status" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option v-for="o in store.assetStatusOptions" :key="o">{{ o }}</option></select></label>
          <label v-if="tab!=='cart'" class="text-sm"><span class="block text-slate-600 mb-1">Condition</span><select v-model="form.condition" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option>New</option><option>Used</option></select></label>
        </div>
        <div class="rounded-lg bg-slate-50 ring-1 ring-slate-100 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Holder <ReqTag ver="V5" code="HOLDER" text="A cart is held by a Facility; IT equipment by an Employee. Leave as None to keep it in the warehouse." /></div>
          <div class="grid grid-cols-3 gap-3">
            <label class="text-sm"><span class="block text-slate-600 mb-1">Held by</span>
              <select v-model="form.holder_type" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm">
                <option value="">None (warehouse)</option>
                <option value="employee">Employee</option>
                <option value="facility">Facility</option>
              </select>
            </label>
            <label class="text-sm" :class="form.holder_type ? '' : 'opacity-40'"><span class="block text-slate-600 mb-1">{{ form.holder_type==='facility' ? 'Facility' : 'Employee' }}</span><select v-model="form.holder" :disabled="!form.holder_type" @change="onHolderPick" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100 bg-white"><option value="">{{ form.holder_type==='facility' ? '— choose facility —' : '— choose employee —' }}</option><option v-if="form.holder_type==='employee'" v-for="u in store.employeeList" :key="u.id" :value="u.name">{{ u.name }} · {{ u.role }}</option><option v-if="form.holder_type==='facility'" v-for="f in store.facilities" :key="f.id" :value="f.name">{{ f.name }}</option></select></label>
            <label class="text-sm" :class="form.holder_type==='employee' ? '' : 'opacity-40'"><span class="block text-slate-600 mb-1">State</span><select v-model="form.emp_state" :disabled="form.holder_type!=='employee'" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100 bg-white"><option value="">—</option><option v-for="stt in store.stateOptions" :key="stt" :value="stt">{{ stt }}</option></select></label>
          </div>
        </div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{{ meta.label }} details <span class="text-slate-400 normal-case font-normal">· entered when built</span></div>
          <div class="grid grid-cols-2 gap-3">
            <label v-for="c in store.assetTypeBuildCols(tab)" :key="c[0]" class="text-sm"><span class="block text-slate-600 mb-1">{{ c[1] }}</span><select v-if="c[3] && c[3].length" v-model="form.fields[c[0]]" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white"><option value="">— choose —</option><option v-for="opt in c[3]" :key="opt" :value="opt">{{ opt }}</option></select><input v-else v-model="form.fields[c[0]]" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          </div>
        </div>
        <div v-if="store.assetTypeShipoutCols(tab).length">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Ship-out details <span class="text-slate-400 normal-case font-normal">· captured when it ships to its holder</span></div>
          <div class="grid grid-cols-2 gap-3">
            <label v-for="c in store.assetTypeShipoutCols(tab)" :key="c[0]" class="text-sm"><span class="block text-slate-600 mb-1">{{ c[1] }}</span><select v-if="c[3] && c[3].length" v-model="form.fields[c[0]]" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white"><option value="">— choose —</option><option v-for="opt in c[3]" :key="opt" :value="opt">{{ opt }}</option></select><input v-else v-model="form.fields[c[0]]" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
          </div>
        </div>
      </div>
      <template #footer><Btn variant="secondary" @click="showEdit=false">Cancel</Btn><Btn @click="saveEdit">{{ editingId ? 'Save changes' : 'Add asset' }}</Btn></template>
    </Modal>

    <Modal v-if="showRecv" title="Confirm cart received" sub="Upload the BOL (required) and any delivery photos." @close="showRecv=false">
      <div class="space-y-3">
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Facility <span class="text-slate-400 font-normal">(only facilities with a delivery on the way)</span></span><select v-model="recv.facility_id" @change="recv.qty = store.cartsInboundTo(recv.facility_id)" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option v-for="f in store.facilitiesAwaitingReceipt" :key="f.id" :value="f.id">{{ f.name }}</option></select></label>
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Carts received <span class="text-slate-400 font-normal">({{ store.cartsInboundTo(recv.facility_id) }} sent to this facility)</span></span><input v-model.number="recv.qty" type="number" min="0" :max="store.cartsInboundTo(recv.facility_id)" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Received on</span><input v-model="recv.received_on" type="date" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm block"><span class="block text-slate-600 mb-1">BOL <span class="text-rose-500">*</span></span><input type="file" class="text-xs" @change="onBol" /><span v-if="recv.bol" class="text-xs text-emerald-700 ml-2">{{ recv.bol }}</span></label>
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Delivery photos</span><input type="file" multiple class="text-xs" @change="onPhotos" /><span v-if="recv.photos.length" class="text-xs text-slate-500 ml-2">{{ recv.photos.length }} photo(s)</span></label>
      </div>
      <template #footer><Btn variant="secondary" @click="showRecv=false">Cancel</Btn><Btn variant="success" @click="saveRecv">Confirm received</Btn></template>
    </Modal>

    <!-- Ship a warehouse asset out to an employee -->
    <Modal v-if="showShipOut" title="Ship asset to employee" :sub="shipForm.code + ' → assign to an employee (status becomes Assigned; they confirm receipt).'" @close="showShipOut=false">
      <div class="space-y-3">
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Employee <span class="text-rose-500">*</span></span><select v-model="shipForm.holder" @change="onShipEmpPick" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white"><option value="">— choose employee —</option><option v-for="u in store.employeeList" :key="u.id" :value="u.name">{{ u.name }} · {{ u.role }}</option></select></label>
        <label class="text-sm block"><span class="block text-slate-600 mb-1">State</span><select v-model="shipForm.emp_state" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm bg-white"><option value="">—</option><option v-for="stt in store.stateOptions" :key="stt" :value="stt">{{ stt }}</option></select></label>
        <p class="text-[11px] text-slate-500">Carts ship to facilities on a Sales Order; individual equipment assets attach to the employee here. The asset then shows under its holder and the employee can confirm receipt.</p>
      </div>
      <template #footer><Btn variant="secondary" @click="showShipOut=false">Cancel</Btn><Btn variant="success" @click="doShipOut">Ship to employee</Btn></template>
    </Modal>

    <!-- Unified Build Asset: choose what to build -->
    <Modal v-if="showPick" title="Build asset" sub="Pick what you're building — a cart pulls its parts from inventory; other types just capture their details." wide @close="showPick=false">
      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Cart types <span class="font-normal text-slate-400">· parts pulled from inventory</span></div>
          <div class="space-y-1.5 max-h-[46vh] overflow-y-auto pr-1">
            <button v-for="d in cartTypes" :key="d.id" class="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:bg-indigo-50/50 hover:border-indigo-200" @click="pickCart(d)">
              <div class="text-sm font-semibold text-slate-800">{{ d.name }}</div>
              <div class="text-[11px] text-slate-500 truncate">{{ (d.composition||[]).length }} part group(s)</div>
            </button>
            <p v-if="!cartTypes.length" class="text-[11px] text-slate-400 py-2">No cart types defined yet.</p>
          </div>
        </div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Other asset types</div>
          <div class="space-y-1.5 max-h-[46vh] overflow-y-auto pr-1">
            <button v-for="c in simpleTypes" :key="c.id" class="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:bg-indigo-50/50 hover:border-indigo-200 flex items-center gap-2" @click="pickSimple(c)">
              <span class="text-sm font-semibold text-slate-800 flex-1">{{ c.label }}</span>
              <span v-if="c.prefix" class="font-mono text-[11px] text-slate-400">{{ c.prefix }}0001</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Cart build (reuses the proven cart engine: buildAssembliesBatch) -->
    <Modal v-if="showCartBuild" :title="'Build ' + (cbuildDef ? cbuildDef.name : 'cart')" sub="Each unit consumes its parts from inventory and is tracked as an asset." wide @close="showCartBuild=false">
      <div class="space-y-3">
        <div class="rounded-lg bg-violet-50/60 ring-1 ring-violet-100 px-3 py-2 text-[11px] text-slate-600">Auto-filled from the cart type → Cart Type <b>{{ cbuildAutoFill.cart_type || '—' }}</b>, Key <b>{{ cbuildAutoFill.key_type || '—' }}</b>, BP <b>{{ cbuildAutoFill.bp_device || '—' }}</b>. Clini/Omni, LTE and Regional are captured at ship-out.</div>
        <table class="w-full text-sm">
          <thead class="text-[11px] uppercase tracking-wide text-slate-400"><tr><th class="text-left py-1">Cart code</th><th class="text-left py-1">Tablet #</th><th class="text-left py-1">Color</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in cbuild.rows" :key="i">
              <td class="py-1 pr-2"><input v-model="r.code" class="w-full h-8 px-2 rounded border border-slate-300 text-sm font-mono" /></td>
              <td class="py-1 pr-2"><input v-model="r.tablet_number" class="w-full h-8 px-2 rounded border border-slate-300 text-sm" /></td>
              <td class="py-1 pr-2"><input v-model="r.cart_color" class="w-full h-8 px-2 rounded border border-slate-300 text-sm" /></td>
              <td class="py-1"><button class="text-slate-400 hover:text-rose-600 text-lg leading-none" @click="cbRemoveRow(i)">&times;</button></td>
            </tr>
          </tbody>
        </table>
        <button class="text-xs font-semibold text-indigo-600 hover:underline" @click="cbAddRow">+ Build another</button>
      </div>
      <template #footer><Btn variant="secondary" @click="showCartBuild=false">Cancel</Btn><Btn variant="success" @click="cbSave">Build carts</Btn></template>
    </Modal>

    <!-- Bulk import existing assets (paste rows) -->
    <Modal v-if="showImport" title="Import assets" sub="Paste one asset per line to add existing units in bulk — no manual entry. First value is the ID, then the type's columns in order." @close="showImport=false">
      <div class="space-y-3">
        <label class="text-sm block"><span class="block text-slate-600 mb-1">Asset type</span><select v-model="importType" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option v-for="c in classes.filter((x) => x.id !== 'cart')" :key="c.id" :value="c.id">{{ c.label }}</option></select></label>
        <label class="text-sm block"><span class="block text-slate-600 mb-1">These assets are</span><select v-model="importPlace" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option value="warehouse">In the warehouse</option><option value="facility">Deployed to a facility</option><option value="employee">Assigned to an employee</option></select></label>
        <div class="text-[11px] text-slate-500">Column order: <b>ID</b><span v-for="c in store.assetClassMeta(importType).cols" :key="c[0]">, {{ c[1] }}</span><span v-if="importPlace !== 'warehouse'">, <b>{{ importPlace === 'facility' ? 'facility' : 'employee' }} name</b></span>. Separate values with a comma or tab; one asset per line.</div>
        <textarea v-model="importText" rows="8" placeholder="LT-2001, Dell, 5400, SN123, 16GB, i7&#10;LT-2002, HP, 840, SN456, 16GB, i5" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"></textarea>
      </div>
      <template #footer><Btn variant="secondary" @click="showImport=false">Cancel</Btn><Btn @click="runImport">Import assets</Btn></template>
    </Modal>

    <!-- Manage Asset Types: define a type, its ID prefix, and its columns (each captured at build or ship-out) -->
    <Modal v-if="showTypes" title="Manage asset types" sub="A type is the recipe for an asset — its ID prefix and the columns you fill in. Mark each column as captured when the asset is built or when it ships out." wide @close="showTypes=false">
      <div class="grid md:grid-cols-5 gap-4">
        <div class="md:col-span-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Existing types</div>
          <div class="space-y-1.5 max-h-[52vh] overflow-y-auto pr-1">
            <div v-for="c in classes" :key="c.id" class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <div class="flex-1 min-w-0"><div class="text-sm font-semibold text-slate-800">{{ c.label }} <span v-if="c.prefix" class="font-mono text-[11px] text-slate-400">{{ c.prefix }}0001</span></div><div class="text-[11px] text-slate-500">{{ (c.cols||[]).length }} columns · to {{ c.assign }}</div></div>
              <button class="text-xs font-semibold text-indigo-600 hover:underline" @click="editType(c)">Edit</button>
              <button v-if="c.id!=='cart'" class="text-xs font-semibold text-rose-600 hover:underline" @click="removeType(c)">Remove</button>
            </div>
          </div>
        </div>
        <div class="md:col-span-3 rounded-xl bg-slate-50 ring-1 ring-slate-100 p-3">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{{ typeForm.id ? 'Edit type' : 'New type' }}</div>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <label class="text-sm"><span class="block text-slate-600 mb-1">Type name</span><input v-model="typeForm.label" placeholder="e.g. Scanner" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
            <label class="text-sm"><span class="block text-slate-600 mb-1">ID prefix</span><input v-model="typeForm.prefix" placeholder="e.g. SC-" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
            <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Assigned to</span><select v-model="typeForm.assign" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option value="employee">An employee</option><option value="facility">A facility</option></select></label>
            <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Built from <span class="text-slate-400 font-normal">· optional — consumes this from inventory each time you build one</span></span><select v-model="typeForm.source" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option value="none">Nothing (just capture details)</option><option v-for="o in sourceOptions" :key="o.v" :value="o.v">{{ o.label }}</option></select></label>
          </div>
          <div class="flex items-center justify-between mb-1"><span class="text-xs font-semibold uppercase tracking-wide text-slate-500">Columns</span><button class="text-xs font-semibold text-indigo-600 hover:underline" @click="addCol">+ Add column</button></div>
          <div class="space-y-1.5 max-h-[26vh] overflow-y-auto">
            <div v-for="(col, i) in typeForm.cols" :key="i" class="flex items-center gap-2">
              <input v-model="col.label" placeholder="Column name" class="flex-1 h-8 px-2 rounded border border-slate-300 text-sm" />
              <input v-model="col.choices" placeholder="Choices (optional, comma-sep)" class="flex-1 h-8 px-2 rounded border border-slate-300 text-sm" title="Leave blank for free text; add comma-separated values to make this column a dropdown." />
              <select v-model="col.stage" class="h-8 px-1.5 rounded border border-slate-300 text-xs"><option value="build">At build</option><option value="shipout">At ship-out</option></select>
              <button class="text-slate-400 hover:text-rose-600 text-lg leading-none" @click="rmCol(i)">&times;</button>
            </div>
            <p v-if="!typeForm.cols.length" class="text-[11px] text-slate-400 py-2">No columns yet — add the fields this asset needs (brand, serial, …).</p>
            <p v-else class="text-[11px] text-slate-400 py-1">Tip: add comma-separated <b>Choices</b> to turn a column into a dropdown; leave blank for free text.</p>
          </div>
          <div class="flex justify-end gap-2 mt-3"><Btn v-if="typeForm.id" variant="secondary" size="sm" @click="resetTypeForm">Cancel edit</Btn><Btn size="sm" @click="saveType">{{ typeForm.id ? 'Save type' : 'Add type' }}</Btn></div>
        </div>
      </div>
    </Modal>
  </div>
</template>
