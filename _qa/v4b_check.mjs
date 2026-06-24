/* V4 Phases 1-4 — strict checks of the supervisor's Item-Types / Assembly / asset requests. */
globalThis.sessionStorage = { _d:{}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
import { createPinia, setActivePinia } from 'pinia';
import { useWarehouseStore } from './warehouse.mjs';
setActivePinia(createPinia());
const s = useWarehouseStore();
let pass=0, fail=0; const fails=[];
const approx=(a,b,e=0.011)=>Math.abs(a-b)<=e;
function ok(req,name,cond,extra=''){ const t='['+req+'] '+name; if(cond){pass++;console.log('  PASS  '+t);} else {fail++;fails.push(t+(extra?' — '+extra:''));console.log('  FAIL  '+t+(extra?' — '+extra:''));} }
const onhand=(id)=>(s.itemById(id)||{}).qty_onhand;

console.log('\n=== Item Types (IT-1, IT-2) ===');
ok('IT-1','catalog exposes all three kinds: item, group, assembly', ['item','group','assembly'].every(k=>s.catalog.some(c=>c.kind===k)), [...new Set(s.catalog.map(c=>c.kind))].join(','));
ok('IT-2','a Single is NEVER an asset; laptops/gameshows are assembly-only', s.itemAssemblyOnly('i-laptop') && s.itemAssemblyOnly('i-gameshow') && s.itemIsAsset('i-laptop')===false);
ok('IT-2','a normal part (cable) is neither an asset nor assembly-only', s.itemAssemblyOnly('i-cable-usb')===false && s.itemIsAsset('i-cable-usb')===false);

console.log('\n=== Assemblies (AS-1..7, IT-4, IT-5) ===');
ok('AS-1','cart types are a managed list (EDAN / VS8 / Accutor)', s.assemblyTypes.map(t=>t.name).join(',').includes('EDAN cart') && s.assemblyTypes.length>=3);
s.addAssemblyType('Custom cart'); ok('AS-1','new cart types can be added', s.assemblyTypes.some(t=>t.name==='Custom cart'));
{
  // AS-2: an assembly is built from groups + singles
  const a=s.assemblyById('asm-vs8');
  ok('AS-2','assembly composition includes group items, not just singles', a.composition.some(c=>c.kind==='group') && a.composition.some(c=>c.kind==='item'));
  // AS-3: auto-fill asset fields from the composition defaults
  const af=s.assemblyAutoFill('asm-vs8');
  ok('AS-3','auto-fill yields Cart Type=CTA Cart, Key Type=CTA Key, BP Device=VS8', af.cart_type==='CTA Cart' && af.key_type==='CTA Key' && af.bp_device==='VS8', JSON.stringify(af));
  // AS-4 + IT-5 + AS-7: build consumes parts, makes ONE asset, code mandatory, landed carried
  const noCode=s.buildAssembly({assembly_id:'asm-vs8'});
  ok('AS-4','Cart Code is mandatory at build', noCode.error && /code/i.test(noCode.error));
  const expCost=s.assemblyUnitCost('asm-vs8');
  const tabB=onhand('i-tab2'), bpB=onhand('i-bpdev'), edanB=onhand('i-edancart'), cartsB=s.carts.length;
  const r=s.buildAssembly({assembly_id:'asm-vs8', code:'CART-V-9001', cart_color:'Blue', tablet_number:'TBL-X'});
  ok('IT-5','building creates exactly ONE asset (cart)', s.carts.length===cartsB+1 && !!r.cart);
  ok('AS-4','built cart carries the asset fields + code', r.cart.code==='CART-V-9001' && r.cart.cart_type==='CTA Cart' && r.cart.bp_device==='VS8' && r.cart.cart_color==='Blue');
  ok('IT-5','building removes the parts from inventory (tab2 -1, bpdev -1, edancart -1)', onhand('i-tab2')===tabB-1 && onhand('i-bpdev')===bpB-1 && onhand('i-edancart')===edanB-1);
  ok('AS-7','assembly cost equals the FIFO cost of its parts (landed carried)', approx(r.cart.cost, expCost), 'cart='+r.cart.cost+' exp='+expCost);
  ok('AS-5','facility/regional NOT set at build (filled at ship)', r.cart.facility_id===null && r.cart.regional_id===null);
  // AS-6: edit the built assembly
  s.editAssemblyUnit(r.cart.id,{cart_color:'Red'});
  ok('AS-6','an assembly can be edited after build', s.carts.find(c=>c.id===r.cart.id).cart_color==='Red');
  globalThis.__builtCartId=r.cart.id;
}
// IT-4: a tablet inside the cart is part of the cart, not its own separate asset
{
  const before=s.trackedAssets.length;
  const r=s.buildAssembly({assembly_id:'asm-edan', code:'CART-E-9001'});
  ok('IT-4','building a cart does NOT mint separate per-part tracked assets', s.trackedAssets.length===before, 'delta='+(s.trackedAssets.length-before));
}

console.log('\n=== Asset only at assembly + ship-out (IT-3) ===');
{
  // receiving an assembly-only single just moves it into inventory — no asset, no prompt
  const taB=s.trackedAssets.length, cartsB=s.carts.length;
  const po=s.purchaseOrders.find(p=>p.id==='po-192'); // has gameshow (assembly-only) not yet received
  s.receivePO(po, po.items.map(l=>({id:l.id, qty:(l.qty-(l.qty_received||0))})), 0, null);
  ok('IT-3','receiving an assembly-only single mints NO asset (just inventory)', s.trackedAssets.length===taB && s.carts.length===cartsB, 'delta='+(s.trackedAssets.length-taB));
  // assembling the single-item gameshow consumes 1 from stock and makes exactly one unit
  const gsB=onhand('i-gameshow'), cartsB2=s.carts.length;
  const built=s.buildAssembly({assembly_id:'asm-gameshow', code:'GS-T-1', fields:{'Make / Company':'TriviaCo','Price':'415','Serial No.':'GS-T1'}});
  ok('IT-5','assembling a single-item gameshow: 1 from stock -> 1 unit', !built.error && onhand('i-gameshow')===gsB-1 && s.carts.length===cartsB2+1, built.error||'');
  // shipping that unit to an employee assigns it to them
  const so={id:'so-z1', so_number:s.nextSoNumber(), recipient_type:'employee', recipient_id:'u-dana', ship_to_type:'facility', regional_id:null, facility_id:'f-oak', order_date:'2026-06-16', expected_date:'', delivery_method:'Courier', shipping_address:'Oak', shipping_cost:0, landed_costs:[], status:'in_progress', notes:'', backorder_of:null, attachments:[], groups:[],
    items:[{kind:'assembly', assembly_id:'asm-gameshow', name:'Trivia Gameshow Console', facility_id:'f-oak', qty:1, qty_shipped:0}]};
  s.salesOrders.unshift(so);
  const uaB=s.userAssets.length;
  s.shipSO(so,[{idx:0, unit_ids:[built.cart.id], employee_id:'u-dana'}],[]);
  ok('IT-3','shipping a single-item assembly assigns the unit to the employee', s.userAssets.length===uaB+1 && s.userAssets[0].user==='Dana White');
}

console.log('\n=== SO ships a specific built unit / asset (SO-1) ===');
{
  // build a couple VS8 units, then ship one specific unit on an SO assembly line
  s.buildAssembly({assembly_id:'asm-vs8', code:'CART-V-9101'});
  const units=s.availableUnits('asm-vs8');
  ok('SO-1','available built units are listable for an assembly', units.length>=1, 'units='+units.length);
  const pick=units[0];
  const so={id:'so-z2', so_number:s.nextSoNumber(), recipient_type:'facility', recipient_id:'f-oak', ship_to_type:'facility', regional_id:null, facility_id:'f-oak', order_date:'2026-06-16', expected_date:'', delivery_method:'Freight', shipping_address:'Oak', shipping_cost:0, landed_costs:[], status:'in_progress', notes:'', backorder_of:null, attachments:[], groups:[],
    items:[{kind:'assembly', assembly_id:'asm-vs8', name:'VS8 Cart', facility_id:'f-oak', qty:1, qty_shipped:0, shipped_cost_total:0, shipped_units:[]}]};
  s.salesOrders.unshift(so);
  const avB=s.availableUnits('asm-vs8').length;
  s.shipSO(so,[{idx:0, qty:1, unit_ids:[pick.id]}],[]);
  ok('SO-1','shipping the assembly line moves the chosen unit to the facility', pick.location==='Facility' && pick.status==='Assigned' && pick.facility_id==='f-oak');
  ok('SO-1','the shipped unit leaves the available pool', s.availableUnits('asm-vs8').length===avB-1);
  ok('SO-1','SO assembly line marked shipped', so.items[0].qty_shipped===1);
  // reverse returns the unit to the warehouse
  s.reverseShip(so);
  ok('SO-1','reversing returns the unit to the warehouse', pick.location==='Warehouse' && pick.status==='Available' && pick.facility_id===null);
}

console.log('\n======================================');
console.log('RESULT: '+pass+' passed, '+fail+' failed');
if (fail){ console.log('FAILURES:'); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
