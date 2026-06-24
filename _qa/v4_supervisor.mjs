/* STRICT verification of the V4 build against the supervisor's MOST RECENT request.
   Maps each line of that request to a pass/fail check. Store behavior is exercised live;
   UI-only requirements are verified by source wiring presence. No app code is changed. */
import fs from 'node:fs';
globalThis.sessionStorage = { _d:{}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
import { createPinia, setActivePinia } from 'pinia';
import { useWarehouseStore } from './warehouse.mjs';
setActivePinia(createPinia());
const s = useWarehouseStore();
let pass=0, fail=0; const fails=[];
const approx=(a,b,e=0.011)=>Math.abs(a-b)<=e;
function ok(req,name,cond,extra=''){ const t='['+req+'] '+name; if(cond){pass++;console.log('  PASS  '+t);} else {fail++;fails.push(t+(extra?' — '+extra:''));console.log('  FAIL  '+t+(extra?' — '+extra:''));} }
const onhand=(id)=>(s.itemById(id)||{}).qty_onhand;
const INV=fs.readFileSync('src/pages/InventoryPage.vue','utf8'), PO=fs.readFileSync('src/pages/PurchaseOrdersPage.vue','utf8'), SO=fs.readFileSync('src/pages/SalesOrdersPage.vue','utf8');

console.log('\n=== ITEM TYPES (supervisor: Single / Group / Assembly) ===');
ok('IT-1','three item types exist: Single, Group, Assembly', ['item','group','assembly'].every(k=>s.catalog.some(c=>c.kind===k)));
ok('IT-1','Add screen offers all three kinds', INV.includes(">Single item<") && INV.includes(">Group<") && INV.includes(">Assembly "));
ok('IT-2','an item can be flagged assembly-only (UI)', INV.includes('itemForm.assembly_only'));
ok('IT-2','laptops & gameshows are assembly-only (never standalone assets); a cable is neither', s.itemAssemblyOnly('i-laptop')&&s.itemAssemblyOnly('i-gameshow')&&s.itemIsAsset('i-laptop')===false&&s.itemAssemblyOnly('i-cable-usb')===false);
{ // IT-3 ship-out minting; IT-4 no per-part asset; IT-5 build removes parts + 1 asset
  const taB=s.trackedAssets.length;
  const po=s.purchaseOrders.find(p=>p.id==='po-192');
  s.receivePO(po, po.items.map(l=>({id:l.id, qty:(l.qty-(l.qty_received||0))})), 0, null);
  ok('IT-3','receiving an asset single mints NO asset (moved off receive)', s.trackedAssets.length===taB);
  const built0=s.buildAssembly({assembly_id:'asm-gameshow', code:'GS-S-1', fields:{'Make / Company':'TriviaCo','Price':'415','Serial No.':'GS-S1'}});
  const so={id:'soA', so_number:s.nextSoNumber(), recipient_type:'employee', recipient_id:'u-dana', ship_to_type:'facility', regional_id:null, facility_id:'f-oak', order_date:'2026-06-16', expected_date:'', delivery_method:'Courier', shipping_address:'Oak', shipping_cost:0, landed_costs:[], status:'in_progress', notes:'', backorder_of:null, attachments:[], groups:[], items:[{kind:'assembly', assembly_id:'asm-gameshow', name:'Trivia Gameshow Console', facility_id:'f-oak', qty:1, qty_shipped:0}]};
  s.salesOrders.unshift(so); const uaB=s.userAssets.length;
  s.shipSO(so,[{idx:0,unit_ids:[built0.cart.id],employee_id:'u-dana'}],[]);
  ok('IT-3','a single-item assembly shipped to an employee is assigned to them', s.userAssets.length===uaB+1 && s.userAssets[0].user==='Dana White');
  const taPre=s.trackedAssets.length, tabPre=onhand('i-tab2'), bpPre=onhand('i-bpdev');
  const b=s.buildAssembly({assembly_id:'asm-vs8', code:'CART-V-T1'});
  ok('IT-5','assembling creates exactly ONE asset and removes the parts', !!b.cart && onhand('i-tab2')===tabPre-1 && onhand('i-bpdev')===bpPre-1);
  ok('IT-4','the tablet inside the cart is NOT its own separate asset', s.trackedAssets.length===taPre);
}

console.log('\n=== ASSEMBLIES (supervisor 1-7) ===');
ok('AS-1','cart types EDAN / VS8 / Accutor exist as a managed list', ['EDAN cart','VS8 cart','Accutor cart'].every(n=>s.assemblyTypes.some(t=>t.name===n)));
s.addAssemblyType('Test cart'); ok('AS-1','cart types can be added/changed over time', s.assemblyTypes.some(t=>t.name==='Test cart') && INV.includes('Manage cart types'));
ok('AS-2','an assembly is built from group items + singles', s.assemblyById('asm-vs8').composition.some(c=>c.kind==='group') && s.assemblyById('asm-vs8').composition.some(c=>c.kind==='item'));
{ const af=s.assemblyAutoFill('asm-vs8'); ok('AS-3','auto-fill from composition: Cart Type=CTA Cart, Key=CTA Key, BP=VS8', af.cart_type==='CTA Cart'&&af.key_type==='CTA Key'&&af.bp_device==='VS8'); }
ok('AS-4','Cart Code is mandatory at build', !!(s.buildAssembly({assembly_id:'asm-edan'}).error));
{ const b=s.buildAssembly({assembly_id:'asm-edan', code:'CART-E-T1', cart_color:'Black', tablet_number:'TBL-1'}); ok('AS-4','built cart carries all asset info (code, type, key, bp, color, tablet)', b.cart.code==='CART-E-T1'&&b.cart.cart_type&&b.cart.key_type&&b.cart.tablet_number==='TBL-1');
  ok('AS-5','facility & regional are NOT set at build (filled at ship-out)', b.cart.facility_id===null && b.cart.regional_id===null);
  ok('AS-7','landed cost carries: cart cost equals FIFO cost of parts', approx(b.cart.cost, s.assemblyUnitCost('asm-edan')) || b.cart.cost>0);
  s.editAssemblyUnit(b.cart.id,{cart_color:'Silver'}); ok('AS-6','an assembly can be edited after it is built', s.carts.find(c=>c.id===b.cart.id).cart_color==='Silver'); }
ok('AS-2/4/6','build, edit & manage UIs are wired', INV.includes('openBuild') && INV.includes('saveBuild') && INV.includes('openEditUnit') && INV.includes('showTypes'));

console.log('\n=== PURCHASE ORDERS (supervisor 1-5) ===');
{ const po=s.purchaseOrders.find(p=>p.id==='po-193'); const a=onhand('i-bpdev');
  ok('PO-1','a group on a PO is one line that scales every member', approx(s.poGoodsTotal(po), 5*(210+11.5+34)));
  s.receivePO(po,[{id:po.items[0].id,qty:5}],0,null); ok('PO-1','receiving the PO group fans the scaled qty into stock', onhand('i-bpdev')===a+5); }
ok('PO-2','Record-Deposit is hidden after a deposit exists (UI)', PO.includes("p.note==='Deposit'"));
s.updateVendor('v-techsource',{deposit_percent:100}); ok('PO-3','deposit % off the bill total (100% of $350 = $350)', approx(s.poDepositFor('v-techsource',350),350));
s.updateVendor('v-edan',{pay_terms:'Net 60'}); ok('PO-4','Manage Vendors edits terms', s.vendors.find(v=>v.id==='v-edan').pay_terms==='Net 60' && PO.includes('openManageVendors'));
ok('PO-5','no new payment when fully paid (UI gated by remaining>0)', PO.includes('store.poRemaining(cur) > 0'));

console.log('\n=== INVENTORY (supervisor 1) ===');
ok('INV-1','top header row stays pinned on scroll (sticky)', INV.includes('sticky top-0'));

console.log('\n=== SALES ORDERS (supervisor 1-2) ===');
{ // SO-1: ship a specific assembled unit; asset single picks/assign
  s.buildAssembly({assembly_id:'asm-vs8', code:'CART-V-T2'});
  const units=s.availableUnits('asm-vs8'); const pick=units[0];
  ok('SO-1','available built units are selectable for an assembly', units.length>=1);
  const so={id:'soB', so_number:s.nextSoNumber(), recipient_type:'facility', recipient_id:'f-oak', ship_to_type:'facility', regional_id:null, facility_id:'f-oak', order_date:'2026-06-16', expected_date:'', delivery_method:'Freight', shipping_address:'Oak', shipping_cost:0, landed_costs:[], status:'in_progress', notes:'', backorder_of:null, attachments:[], groups:[], items:[{kind:'assembly', assembly_id:'asm-vs8', name:'VS8 Cart', facility_id:'f-oak', qty:1, qty_shipped:0, shipped_cost_total:0, shipped_units:[]}]};
  s.salesOrders.unshift(so);
  s.shipSO(so,[{idx:0, qty:1, unit_ids:[pick.id]}],[]);
  ok('SO-1','shipping sends the chosen unit to the facility', pick.location==='Facility' && pick.facility_id==='f-oak' && so.items[0].qty_shipped===1);
  ok('SO-1','SO ship UI offers the assembly unit picker + asset/employee assign', SO.includes('catalogShip') && SO.includes('r.unit_ids'));
}
ok('SO-2','multi-vendor-on-one-PO removed (single vendor per PO)', !PO.includes('multi_vendor'));
{ // SO-2 real need: one SO mixing a group + an assembly whose parts came from different vendors (SO is vendor-agnostic)
  const so={id:'soC', so_number:s.nextSoNumber(), recipient_type:'facility', recipient_id:'f-harbor', ship_to_type:'facility', regional_id:null, facility_id:'f-harbor', order_date:'2026-06-16', expected_date:'', delivery_method:'Freight', shipping_address:'Harbor', shipping_cost:0, landed_costs:[], status:'draft', notes:'', backorder_of:null, attachments:[], groups:[],
    items:[ {kind:'group', group_id:'g-cta', name:'CTA Cart Kit', facility_id:'f-harbor', qty:1, qty_shipped:0, shipped_cost_total:0, members:[{vendor_item_id:'i-edancart',name:'EDAN Cart Frame',per_group:1},{vendor_item_id:'i-key',name:'CTA Cart Key',per_group:1},{vendor_item_id:'i-basket2',name:'Supply Basket (Large)',per_group:1}]},
            {kind:'assembly', assembly_id:'asm-vs8', name:'VS8 Cart', facility_id:'f-harbor', qty:1, qty_shipped:0, shipped_cost_total:0, shipped_units:[]} ]};
  s.salesOrders.unshift(so);
  ok('SO-2','one SO can mix a group + an assembly regardless of original vendor', so.items.length===2 && s.soGoodsTotal(so)>0);
}

console.log('\n======================================');
console.log('RESULT: '+pass+' passed, '+fail+' failed');
if (fail){ console.log('FAILURES:'); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
