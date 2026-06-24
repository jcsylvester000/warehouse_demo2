// STRICT adherence harness for the LATEST supervisor amendment.
// Every assertion maps to an exact clause. User-Journey + QnA style. Store behaviour AND UI presence.
import fs from 'fs';
globalThis.sessionStorage = { _d: {}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
import { createPinia, setActivePinia } from 'pinia';
import { useWarehouseStore } from './warehouse.mjs';
setActivePinia(createPinia());
const s = useWarehouseStore();

const INV = fs.readFileSync('src/pages/InventoryPage.vue','utf8');
const PO  = fs.readFileSync('src/pages/PurchaseOrdersPage.vue','utf8');
const SO  = fs.readFileSync('src/pages/SalesOrdersPage.vue','utf8');

let pass=0, fail=0; const fails=[];
const approx=(a,b,e=0.011)=>Math.abs(a-b)<=e;
function ok(req,name,cond,extra=''){ const t='['+req+'] '+name; if(cond){pass++;console.log('  PASS  '+t);} else {fail++;fails.push(t+(extra?' — '+extra:''));console.log('  FAIL  '+t+(extra?' — '+extra:''));} }
const onhand=(id)=>(s.itemById(id)||{}).qty_onhand;

console.log('\n############ JOURNEY 1 — Item types & the asset rule ############');
// "There should be three item types when adding an item: Single, Group, and Assembly."
ok('IT-1','Add screen offers Single, Group AND Assembly', INV.includes('>Single item<') && INV.includes('>Group<') && INV.includes('>Assembly '));
ok('IT-1','catalog distinguishes item / group / assembly', ['item','group','assembly'].every(k=>s.catalog.some(c=>c.kind===k)));
// "A Single is not an asset." / "Only assemblies are assets."
ok('AR','a Single is NEVER an asset', s.itemIsAsset('i-laptop')===false && s.itemIsAsset('i-tab')===false && s.itemIsAsset('i-cable-usb')===false);
// "Laptops and Gameshows ... are assembly-only items."
ok('AR','laptops & gameshows are assembly-only', s.itemAssemblyOnly('i-laptop') && s.itemAssemblyOnly('i-laptop2') && s.itemAssemblyOnly('i-gameshow') && s.itemAssemblyOnly('i-trivia'));
// "A laptop and a Gameshow are also assemblies (a one-item assembly)."
ok('IT-e','laptop & gameshow exist as single-item assemblies', s.assemblyById('asm-laptop').assembly_kind==='single' && s.assemblyById('asm-gameshow').assembly_kind==='single');
// "there should be a flag when creating an item: this item can only be shipped as an assembly"
ok('AR-d','Add-item screen has the assembly-only flag', INV.includes('itemForm.assembly_only') && /only be shipped as an assembly/i.test(INV));
// "That flag blocks it from being added to an SO as a loose item."
ok('AR-d','assembly-only items are NOT in the SO loose picker', !s.catalogShip.some(c=>c.id==='i-laptop') && !s.catalogShip.some(c=>c.id==='i-gameshow'));
ok('AR-d','ordinary parts remain in the SO loose picker', s.catalogShip.some(c=>c.id==='i-tab') && s.catalogShip.some(c=>c.id==='i-cable-usb'));
// "Remove the enter-asset-info-on-receiving prompt ... it should just move into inventory"
ok('AR-b','no asset-entry prompt exists on receiving (UI)', !/Enter asset info/i.test(PO));
ok('AR-b','receive commits straight to inventory (no asset map)', PO.includes('commitReceive(null)'));
{
  // receiving a laptop just moves it into inventory — no asset, no prompt
  const po=s.purchaseOrders.find(p=>p.id==='po-192'); // gameshow line
  const taB=s.trackedAssets.length, cartsB=s.carts.length, gsB=onhand('i-gameshow');
  s.receivePO(po, po.items.map(l=>({id:l.id, qty:(l.qty-(l.qty_received||0))})), 0, null);
  ok('AR-b','receiving raises inventory but mints NO asset', onhand('i-gameshow')>gsB && s.trackedAssets.length===taB && s.carts.length===cartsB);
}

console.log('\n############ JOURNEY 2 — Assemblies (cart + single-item) ############');
// AS-1: cart types are a managed list (EDAN / VS8 / Accutor) and can be added/changed.
ok('AS-1','EDAN / VS8 / Accutor cart types exist', ['EDAN','VS8','Accutor'].every(n=>s.assemblyTypes.some(t=>t.name.includes(n))));
{ const id=s.addAssemblyType('Welch Allyn cart'); s.updateAssemblyType(id,'Welch Allyn cart v2');
  ok('AS-1','cart types can be added AND changed', s.assemblyTypes.some(t=>t.name==='Welch Allyn cart v2')); }
ok('AS-1','UI exposes Manage cart types', /Manage cart types/i.test(INV));
// AS-2: cart build shows group items (composition has a group); single-item has no composition.
ok('AS-2','a cart assembly is built from groups + singles', s.assemblyById('asm-vs8').composition.some(c=>c.kind==='group') && s.assemblyById('asm-vs8').composition.some(c=>c.kind==='item'));
ok('AS-2','single-item assembly has NO composition, just info fields', s.assemblyById('asm-laptop').composition.length===0 && s.assemblyById('asm-laptop').fields.length>0);
ok('AS-2','UI has a single-item assembly build path (no parts)', INV.includes("buildDef.assembly_kind==='single'") && INV.includes('Single-item assembly'));
// AS-3: auto-fill from composition.
{ const af=s.assemblyAutoFill('asm-vs8');
  ok('AS-3','VS8 auto-fills Cart Type=CTA Cart, Key=CTA Key, BP=VS8', af.cart_type==='CTA Cart' && af.key_type==='CTA Key' && af.bp_device==='VS8', JSON.stringify(af)); }
// AS-4: Cart Code mandatory; unit carries all asset info.
ok('AS-4','Cart Code is mandatory at build', !!s.buildAssembly({assembly_id:'asm-vs8'}).error);
// AS-7 + IV-c: build consumes parts (landed carried) and makes exactly ONE asset.
{
  const exp=s.assemblyUnitCost('asm-vs8');
  const tabB=onhand('i-tab2'), bpB=onhand('i-bpdev'), cartsB=s.carts.length;
  const r=s.buildAssembly({assembly_id:'asm-vs8', code:'CART-V-SA1', cart_color:'Blue', fields:{}});
  ok('IV-c','exactly ONE cart asset created with code + asset info', s.carts.length===cartsB+1 && r.cart.code==='CART-V-SA1' && r.cart.cart_type==='CTA Cart' && r.cart.bp_device==='VS8');
  ok('IV-c','building removes parts from inventory (tab2 -1, bpdev -1)', onhand('i-tab2')===tabB-1 && onhand('i-bpdev')===bpB-1);
  ok('AS-7','landed cost carries into the assembly (FIFO unit cost)', approx(r.cart.cost, exp), 'cart='+r.cart.cost+' exp='+exp);
  ok('AS-5','facility/regional NOT set at build', r.cart.facility_id===null && r.cart.regional_id===null);
  // AS-6: edit after build
  s.editAssemblyUnit(r.cart.id,{cart_color:'Red'});
  ok('AS-6','an assembly can be edited after it is built', s.carts.find(c=>c.id===r.cart.id).cart_color==='Red');
}
// Single-item assembly: assembling = entering info; consumes 1 source.
{
  const lapB=onhand('i-laptop'), cartsB=s.carts.length;
  ok('AS-4','single-item assembly: Unit Code is mandatory', !!s.buildAssembly({assembly_id:'asm-laptop'}).error);
  const r=s.buildAssembly({assembly_id:'asm-laptop', code:'LAP-SA1', fields:{'RAM':'16 GB','Make / Company':'Dell','Price':'935','Serial No.':'SER-SA1'}});
  ok('AS-2','single-item assemble consumes 1 source + makes one unit', !r.error && onhand('i-laptop')===lapB-1 && s.carts.length===cartsB+1);
  ok('AS-4','the unit carries the entered info fields', r.cart.fields.RAM==='16 GB' && r.cart.fields['Serial No.']==='SER-SA1');
}

console.log('\n############ JOURNEY 3 — Inventory vs assembled, ship-out assignment, PO, SO ############');
// IV-a: order 20 of every cart part, assemble 10 -> 10 carts + 10 of each remaining part.
{
  // use EDAN cart: parts = edancart, key(i-key), basket2, tab(i-tab) — 1 each per cart
  const parts=['i-edancart','i-key','i-basket2','i-tab'];
  const before={}; parts.forEach(p=>before[p]=onhand(p));
  // receive 20 of each via a fresh PO
  const po={ id:'po-iva', po_number:s.nextPoNumber(), vendor_id:'v-edan', order_date:'2026-06-16', expected_date:'', status:'open', progress:'Not started', sent:null, notes:'', landed_costs:[], payments:[], deposit:0,
    items: parts.map((p,i)=>({ id:'ivl'+i, kind:'item', vendor_item_id:p, name:(s.itemById(p)||{}).name, qty:20, qty_received:0, unit_cost:(s.itemById(p)||{}).cost||0 })) };
  s.purchaseOrders.unshift(po);
  s.receivePO(po, po.items.map(l=>({id:l.id, qty:20})), 0, null);
  parts.forEach(p=>{ if(onhand(p)!==before[p]+20) ok('IV-a','received 20 '+p,false,'got '+onhand(p)); });
  const cartsB=s.carts.length;
  let built=0; for(let i=0;i<10;i++){ const r=s.buildAssembly({assembly_id:'asm-edan', code:'CART-E-IVA'+i}); if(!r.error) built++; }
  ok('IV-a','assembled 10 EDAN carts (10 new asset units)', built===10 && s.carts.length===cartsB+10, 'built='+built);
  ok('IV-a','10 of each remaining part stay in inventory (not assets)', parts.every(p=>onhand(p)===before[p]+20-10), parts.map(p=>p+'='+onhand(p)).join(','));
}
// IV-b: until assembled, raw stock can go toward ANY cart type (parts are shared, not pre-committed).
ok('IV-b','i-tab feeds multiple assemblies (shared until assembled)', s.expandAssembly('asm-edan',1)['i-tab']>0 && s.assemblyBuildable('asm-vs8')>=0);
// AR-c: raw assembly-only stock with zero assembled units => zero shippable units.
ok('AR-c','HP laptops in stock but none assembled => 0 shippable units', onhand('i-laptop2')>0 && s.availableUnits('asm-laptop2').length===0);
{ const r=s.buildAssembly({assembly_id:'asm-laptop2', code:'HP-AC1', fields:{'RAM':'8 GB'}});
  ok('AR-c','after assembling one, exactly one unit is shippable', !r.error && s.availableUnits('asm-laptop2').length===1); }
// AS-5 + IT (tablet stays in cart): ship-out assignment by type.
{
  // cart -> facility + Regional; tablet inside cart does NOT become its own asset
  const cart=s.availableUnits('asm-vs8')[0];
  const taB=s.trackedAssets.length;
  const cartSO={id:'so-ca', so_number:s.nextSoNumber(), recipient_type:'facility', recipient_id:'f-maple', ship_to_type:'facility', regional_id:'reg-rosa', facility_id:'f-maple', order_date:'2026-06-16', expected_date:'', delivery_method:'Freight', shipping_address:'Maple', shipping_cost:0, landed_costs:[], status:'in_progress', notes:'', backorder_of:null, attachments:[], groups:[], items:[{kind:'assembly', assembly_id:'asm-vs8', name:'VS8 Cart', facility_id:'f-maple', qty:1, qty_shipped:0}]};
  s.salesOrders.unshift(cartSO); s.shipSO(cartSO,[{idx:0, unit_ids:[cart.id]}],[]);
  const c2=s.carts.find(c=>c.id===cart.id);
  ok('AS-5','a shipped cart is assigned to facility + Regional', c2.location==='Facility' && c2.facility_id==='f-maple' && c2.regional_id==='reg-rosa');
  ok('AR-e','the tablet in the cart did NOT spawn its own asset', s.trackedAssets.length===taB);
  // single-item -> the employee
  const lap=s.availableUnits('asm-laptop')[0];
  const empSO={id:'so-ea', so_number:s.nextSoNumber(), recipient_type:'employee', recipient_id:'u-carl', ship_to_type:'facility', regional_id:null, facility_id:'f-maple', order_date:'2026-06-16', expected_date:'', delivery_method:'Courier', shipping_address:'Maple', shipping_cost:0, landed_costs:[], status:'in_progress', notes:'', backorder_of:null, attachments:[], groups:[], items:[{kind:'assembly', assembly_id:'asm-laptop', name:'Dell Latitude Laptop', facility_id:'f-maple', qty:1, qty_shipped:0}]};
  s.salesOrders.unshift(empSO); const uaB=s.userAssets.length;
  s.shipSO(empSO,[{idx:0, unit_ids:[lap.id], employee_id:'u-carl'}],[]);
  ok('AS-5','a shipped laptop is assigned to the employee (retrieval)', s.userAssets.length===uaB+1 && s.userAssets[0].user==='Carl Chen' && s.carts.find(c=>c.id===lap.id).assigned_user==='Carl Chen');
}
// PO-1: a group item on a PO is ONE line whose qty scales every member (like SO).
ok('PO-1','PO adds a group as ONE line (group_id), not item-by-item', PO.includes("kind: 'group', group_id: id"));
{ const g=s.expandGroup('g-cta',1); const members=Object.keys(g).map(k=>({vendor_item_id:k, name:(s.itemById(k)||{}).name, per_group:g[k], unit_cost:(s.itemById(k)||{}).cost||0}));
  const gpo={id:'po-g', po_number:s.nextPoNumber(), vendor_id:'v-edan', order_date:'2026-06-16', expected_date:'', status:'open', progress:'', sent:null, notes:'', landed_costs:[], payments:[], deposit:0, items:[{id:'gl', kind:'group', group_id:'g-cta', name:'CTA Cart Kit', qty:4, qty_received:0, members}]};
  ok('PO-1','group line goods scale with group qty (×4)', approx(s.poGoodsTotal(gpo), 4*members.reduce((a,m)=>a+m.per_group*m.unit_cost,0)), 'got '+s.poGoodsTotal(gpo)); }
// PO-2: hide Record Deposit after a deposit is recorded.
ok('PO-2','Record-Deposit block hides once a Deposit payment exists', PO.includes("!(cur.payments||[]).some(p=>p.note==='Deposit')"));
// PO-3: deposit % calculates off the bill total (100% of 350 = 350).
{ const v=s.addVendor({name:'StrictDepVendor', email:'x@y.z', pay_terms:'Net 30', deposit_percent:100});
  ok('PO-3','100% deposit on a $350 bill = $350 (not $100)', s.poDepositFor(v.id, 350)===350, 'got '+s.poDepositFor(v.id,350)); }
// PO-4: Manage Vendors area to change terms.
ok('PO-4','Manage Vendors area exists + vendor terms editable', /Manage vendors|Manage Vendors/.test(PO) && typeof s.updateVendor==='function');
{ s.updateVendor('v-edan',{deposit_percent:55}); ok('PO-4','vendor deposit % is editable', s.vendors.find(x=>x.id==='v-edan').deposit_percent===55); }
// PO-5: no new payment option when fully paid.
ok('PO-5','Record-Payment hides when the PO is fully paid', PO.includes('store.poRemaining(cur) > 0') && /Paid in full/i.test(PO));
// INV-1: pin the top header row.
ok('INV-1','inventory items table header is pinned (sticky)', /sticky top-0/.test(INV));
// SO-1: ship an assembly from an SO; pick from available built units; assembly-only not selectable loose.
ok('SO-1','SO picker is the assembly-aware catalog (loose assembly-only excluded)', SO.includes('store.catalogShip'));
ok('SO-1','SO lets you pick a specific built unit for an assembly line', SO.includes("kind: 'assembly'") && SO.includes('store.availableUnits(l.assembly_id)') && SO.includes('r.unit_ids'));
// SO-2: drop multi-vendor PO; build ONE SO mixing groups/assemblies from different vendors.
ok('SO-2','multi-vendor PO is gone (single vendor per PO -> one bill)', !/multi_vendor:\s*true/.test(PO));
{
  // one SO mixing a group (CTA — EDAN-vendor parts) + an assembly (VS8 — techsource/medcarts parts)
  const g=s.expandGroup('g-cta',1); const gm=Object.keys(g).map(k=>({vendor_item_id:k, name:(s.itemById(k)||{}).name, per_group:g[k]}));
  const built=s.availableUnits('asm-vs8').length; // ensure at least 1 unit
  if(!built){ s.buildAssembly({assembly_id:'asm-vs8', code:'CART-V-SO2'}); }
  const unit=s.availableUnits('asm-vs8')[0];
  const mix={id:'so-mix', so_number:s.nextSoNumber(), recipient_type:'facility', recipient_id:'f-bayview', ship_to_type:'facility', regional_id:'reg-rosa', facility_id:'f-bayview', order_date:'2026-06-16', expected_date:'', delivery_method:'Freight', shipping_address:'Bayview', shipping_cost:0, landed_costs:[], status:'in_progress', notes:'', backorder_of:null, attachments:[], groups:[],
    items:[ {kind:'group', group_id:'g-cta', name:'CTA Cart Kit', facility_id:'f-bayview', qty:1, qty_shipped:0, members:gm},
            {kind:'assembly', assembly_id:'asm-vs8', name:'VS8 Cart', facility_id:'f-bayview', qty:1, qty_shipped:0} ]};
  s.salesOrders.unshift(mix);
  const okGroup = s.soLineMaxShippable(mix.items[0])>=0;
  const r=s.shipSO(mix,[{idx:0, qty:1},{idx:1, unit_ids:[unit.id]}],[]);
  ok('SO-2','one SO can mix a group + an assembly from different vendors', okGroup && mix.items[1].qty_shipped===1 && r.captured>0);
}

console.log('\n======================================');
console.log('STRICT AMENDMENT RESULT: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('NON-ADHERENCE:'); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
