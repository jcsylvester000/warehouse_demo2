// Amendment harness — locks the refined asset model:
//  * Only ASSEMBLIES are assets; a Single is never an asset.
//  * Laptops / Gameshows are ASSEMBLY-ONLY items (can't ship loose; must be assembled first).
//  * Two assembly kinds: cart (composition) + single-item (no parts, info fields only).
//  * Assembling consumes parts from inventory and creates exactly ONE asset; landed cost carries.
//  * Assignment auto-fills at ship-out: carts -> facility + Regional; laptops/gameshows -> employee.
globalThis.sessionStorage = { _d: {}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
import { createPinia, setActivePinia } from 'pinia';
import { useWarehouseStore } from './warehouse.mjs';
setActivePinia(createPinia());
const s = useWarehouseStore();
let pass=0, fail=0; const fails=[];
const approx=(a,b,e=0.011)=>Math.abs(a-b)<=e;
function ok(req,name,cond,extra=''){ const t='['+req+'] '+name; if(cond){pass++;console.log('  PASS  '+t);} else {fail++;fails.push(t+(extra?' — '+extra:''));console.log('  FAIL  '+t+(extra?' — '+extra:''));} }
const onhand=(id)=>(s.itemById(id)||{}).qty_onhand;

console.log('\n=== ITEM TYPES: only assemblies are assets ===');
ok('IT','three kinds in catalog (item/group/assembly)', ['item','group','assembly'].every(k=>s.catalog.some(c=>c.kind===k)));
ok('IT','a Single is never an asset', s.itemIsAsset('i-laptop')===false && s.itemIsAsset('i-gameshow')===false && s.itemIsAsset('i-tab')===false);
ok('IT','laptops & gameshows are assembly-only', s.itemAssemblyOnly('i-laptop') && s.itemAssemblyOnly('i-laptop2') && s.itemAssemblyOnly('i-gameshow') && s.itemAssemblyOnly('i-trivia'));
ok('IT','ordinary parts (tablet, cable) are NOT assembly-only', s.itemAssemblyOnly('i-tab')===false && s.itemAssemblyOnly('i-cable-usb')===false);

console.log('\n=== ASSEMBLY-ONLY items cannot ship loose ===');
ok('SO','assembly-only laptop is excluded from the SO loose picker', !s.catalogShip.some(c=>c.id==='i-laptop') && !s.catalogShip.some(c=>c.id==='i-gameshow'));
ok('SO','an ordinary part (tablet) IS still in the SO loose picker', s.catalogShip.some(c=>c.id==='i-tab'));
ok('SO','the single-item assemblies ARE offered on the SO picker', s.catalogShip.some(c=>c.id==='asm-laptop') && s.catalogShip.some(c=>c.id==='asm-gameshow'));

console.log('\n=== TWO ASSEMBLY KINDS ===');
ok('AS','cart assemblies are kind=cart with composition', s.assemblyById('asm-vs8').assembly_kind==='cart' && s.assemblyById('asm-vs8').composition.length>0);
ok('AS','single-item assemblies are kind=single, no composition, with info fields', s.assemblyById('asm-laptop').assembly_kind==='single' && s.assemblyById('asm-laptop').composition.length===0 && s.assemblyById('asm-laptop').fields.length>0);
ok('AS','single-item assembly points at its source item', s.assemblyById('asm-laptop').source_item_id==='i-laptop');

console.log('\n=== RECEIVE: assembly-only item just goes to inventory (no prompt, no asset) ===');
{
  const po=s.purchaseOrders.find(p=>p.id==='po-192'); // gameshow line
  const taB=s.trackedAssets.length, cartsB=s.carts.length, gsB=onhand('i-gameshow');
  s.receivePO(po, po.items.map(l=>({id:l.id, qty:(l.qty-(l.qty_received||0))})), 0, null);
  ok('IT','receiving raises inventory but mints NO asset', onhand('i-gameshow')>gsB && s.trackedAssets.length===taB && s.carts.length===cartsB);
}

console.log('\n=== CART ASSEMBLY: build consumes parts, ONE asset, auto-fill, landed carries ===');
{
  const af=s.assemblyAutoFill('asm-vs8');
  ok('AS','auto-fill from composition (CTA Cart / CTA Key / VS8)', af.cart_type==='CTA Cart' && af.key_type==='CTA Key' && af.bp_device==='VS8');
  ok('AS','Cart Code is mandatory', !!s.buildAssembly({assembly_id:'asm-vs8'}).error);
  const exp=s.assemblyUnitCost('asm-vs8');
  const tabB=onhand('i-tab2'), bpB=onhand('i-bpdev'), cartsB=s.carts.length;
  const r=s.buildAssembly({assembly_id:'asm-vs8', code:'CART-V-AM1', cart_color:'Blue'});
  ok('AS','exactly one cart asset created', s.carts.length===cartsB+1 && r.cart.unit_kind==='cart' && r.cart.code==='CART-V-AM1');
  ok('AS','parts removed from inventory (tab2 -1, bpdev -1)', onhand('i-tab2')===tabB-1 && onhand('i-bpdev')===bpB-1);
  ok('AS','landed cost carries into the assembly (FIFO cost)', approx(r.cart.cost, exp), 'cart='+r.cart.cost+' exp='+exp);
  ok('AS','facility/regional NOT set at build', r.cart.facility_id===null && r.cart.regional_id===null);
  globalThis.__cart = r.cart;
}

console.log('\n=== SINGLE-ITEM ASSEMBLY: build = enter info only; consumes 1 source ===');
{
  const lapB=onhand('i-laptop'), cartsB=s.carts.length;
  ok('AS','Unit Code is mandatory', !!s.buildAssembly({assembly_id:'asm-laptop'}).error);
  const r=s.buildAssembly({assembly_id:'asm-laptop', code:'LAP-AM1', fields:{'RAM':'16 GB','Make / Company':'Dell','Price':'935','Serial No.':'SER-AM1'}});
  ok('AS','one laptop unit created, 1 source consumed', !r.error && s.carts.length===cartsB+1 && onhand('i-laptop')===lapB-1);
  ok('AS','the unit captures the entered info fields', r.cart.unit_kind==='single' && r.cart.fields.RAM==='16 GB' && r.cart.fields['Serial No.']==='SER-AM1');
  globalThis.__lap = r.cart;
}

console.log('\n=== SHIP-OUT ASSIGNMENT by type ===');
{
  // cart -> facility + Regional
  const cart=globalThis.__cart;
  const cartSO={id:'so-c', so_number:s.nextSoNumber(), recipient_type:'facility', recipient_id:'f-maple', ship_to_type:'facility', regional_id:'reg-rosa', facility_id:'f-maple', order_date:'2026-06-16', expected_date:'', delivery_method:'Freight', shipping_address:'Maple', shipping_cost:0, landed_costs:[], status:'in_progress', notes:'', backorder_of:null, attachments:[], groups:[],
    items:[{kind:'assembly', assembly_id:'asm-vs8', name:'VS8 Cart', facility_id:'f-maple', qty:1, qty_shipped:0}]};
  s.salesOrders.unshift(cartSO);
  s.shipSO(cartSO, [{idx:0, unit_ids:[cart.id]}], []);
  const c2=s.carts.find(c=>c.id===cart.id);
  ok('AS5','a shipped cart is assigned to the facility + Regional', c2.location==='Facility' && c2.facility_id==='f-maple' && c2.regional_id==='reg-rosa');

  // single-item -> the employee on the SO
  const lap=globalThis.__lap;
  const empSO={id:'so-e', so_number:s.nextSoNumber(), recipient_type:'employee', recipient_id:'u-carl', ship_to_type:'facility', regional_id:null, facility_id:'f-maple', order_date:'2026-06-16', expected_date:'', delivery_method:'Courier', shipping_address:'Maple', shipping_cost:0, landed_costs:[], status:'in_progress', notes:'', backorder_of:null, attachments:[], groups:[],
    items:[{kind:'assembly', assembly_id:'asm-laptop', name:'Dell Latitude Laptop', facility_id:'f-maple', qty:1, qty_shipped:0}]};
  s.salesOrders.unshift(empSO);
  const uaB=s.userAssets.length;
  s.shipSO(empSO, [{idx:0, unit_ids:[lap.id], employee_id:'u-carl'}], []);
  const l2=s.carts.find(c=>c.id===lap.id);
  ok('AS5','a shipped laptop is assigned to the employee (for retrieval)', s.userAssets.length===uaB+1 && s.userAssets[0].user==='Carl Chen' && l2.assigned_user==='Carl Chen');
  ok('AS6','an assembly unit can be edited after build', (s.editAssemblyUnit(lap.id,{fields:{...l2.fields, RAM:'32 GB'}}), s.carts.find(c=>c.id===lap.id).fields.RAM==='32 GB'));
}

console.log('\n======================================');
console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('FAILURES:'); fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
