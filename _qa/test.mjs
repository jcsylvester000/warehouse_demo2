// QA harness — exercises the warehouse Pinia store outside Vue.
// Mocks sessionStorage so hydrate() falls through to a fresh seed each run.
globalThis.sessionStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

import { createPinia, setActivePinia } from 'pinia';
import { useWarehouseStore } from './warehouse.mjs';

setActivePinia(createPinia());
const s = useWarehouseStore();

let pass = 0, fail = 0;
const fails = [];
const approx = (a, b, e = 0.011) => Math.abs(a - b) <= e;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}
const onhand = (id) => (s.itemById(id) || {}).qty_onhand;

console.log('\n=== Pre-flight: getters do not throw ===');
ok('catalog = items + groups + assemblies', s.catalog.length === s.items.length + s.groups.length + (s.assemblies||[]).length, 'got ' + s.catalog.length);
ok('recipients list builds', s.recipients.length === (s.facilities.length + s.regionals.length + s.providerList.length + s.users.filter(u => u.role !== 'Regional Director' && u.role !== 'Provider').length));
ok('fifoUnitCost(laptop) uses oldest lot (900 not field 920)', s.fifoUnitCost('i-laptop') === 900, 'got ' + s.fifoUnitCost('i-laptop'));
ok('groupOnHand(starter)=9 (stylus-limited)', s.groupOnHand('g-starter') === 9, 'got ' + s.groupOnHand('g-starter'));
ok('groupOnHand(facility nested)=6 (laptop-limited)', s.groupOnHand('g-facility') === 6, 'got ' + s.groupOnHand('g-facility'));
ok('calendarEvents include onboarding + ship', s.calendarEvents.some(e => e.type === 'onb') && s.calendarEvents.some(e => e.type === 'ship'));

console.log('\n=== JOURNEY 1: Purchase Order — receive, FIFO, multi-vendor Vendor ===');
{
  const po = s.purchaseOrders.find(p => p.id === 'po-190'); // techsource: tab x24, mount x24
  const tabBefore = onhand('i-tab'), mountBefore = onhand('i-mount');
  const vbBefore = s.vendorBills.length, logsBefore = s.stockLogs.length;
  const res = s.receivePO(po, po.items.map(l => ({ id: l.id, qty: l.qty })), s.poLandedTotal(po), null);
  ok('tab on-hand +24', onhand('i-tab') === tabBefore + 24, `${tabBefore}->${onhand('i-tab')}`);
  ok('mount on-hand +24', onhand('i-mount') === mountBefore + 24, `${mountBefore}->${onhand('i-mount')}`);
  ok('PO status -> received', po.status === 'received', po.status);
  ok('one Vendor bill created (single vendor)', s.vendorBills.length === vbBefore + 1 && res.multi === false);
  ok('Vendor bill total = 4890', approx(s.vendorBills[0].total, 24 * 184 + 24 * 19.75), 'got ' + s.vendorBills[0].total);
  ok('two stock-in logs added', s.stockLogs.length === logsBefore + 2);
  ok('poRemaining owed = goods total (no payments)', approx(s.poRemaining(po), 24 * 184 + 24 * 19.75), 'got ' + s.poRemaining(po));

  // V4 SO-2: multi-vendor PO removed -> a PO has one vendor and one Vendor bill
  const sv = {
    id: 'po-sv', po_number: s.nextPoNumber(), vendor_id: 'v-techsource', order_date: '2026-06-16', expected_date: '', status: 'open', progress: 'Not started', sent: null, notes: '', landed_costs: [], payments: [], deposit: 0,
    items: [
      { id: 'svl1', kind: 'item', vendor_item_id: 'i-tab', name: 'Tab', qty: 2, qty_received: 0, unit_cost: 184 },
      { id: 'svl2', kind: 'item', vendor_item_id: 'i-mount', name: 'Mount', qty: 1, qty_received: 0, unit_cost: 19.75 },
    ],
  };
  s.purchaseOrders.unshift(sv);
  const r2 = s.receivePO(sv, sv.items.map(l => ({ id: l.id, qty: l.qty })), 0, null);
  ok('V4 single-vendor PO -> exactly one Vendor bill', r2.billIds.length === 1 && r2.multi === false, 'bills=' + r2.billIds.length);

  // V4 PO-1: a group line on a PO scales every member into stock on receive
  const gexp = s.expandGroup('g-tabmount', 1); // i-tab x1, i-mount x1
  const gmembers = Object.keys(gexp).map(k => ({ vendor_item_id: k, name: (s.itemById(k) || {}).name, per_group: gexp[k], unit_cost: (s.itemById(k) || {}).cost || 0 }));
  const tabB2 = onhand('i-tab'), mountB2 = onhand('i-mount');
  const gpo = {
    id: 'po-grp', po_number: s.nextPoNumber(), vendor_id: 'v-techsource', order_date: '2026-06-16', expected_date: '', status: 'open', progress: 'Not started', sent: null, notes: '', landed_costs: [], payments: [], deposit: 0,
    items: [{ id: 'gpl1', kind: 'group', group_id: 'g-tabmount', name: 'Tablet + Mount', qty: 3, qty_received: 0, members: gmembers }],
  };
  s.purchaseOrders.unshift(gpo);
  ok('PO group line goods scales (3 x (tab+mount))', approx(s.poGoodsTotal(gpo), 3 * (s.itemById('i-tab').cost + s.itemById('i-mount').cost)), 'got ' + s.poGoodsTotal(gpo));
  s.receivePO(gpo, [{ id: 'gpl1', qty: 3 }], 0, null);
  ok('PO group receive adds 3 tabs to stock', onhand('i-tab') === tabB2 + 3);
  ok('PO group receive adds 3 mounts to stock', onhand('i-mount') === mountB2 + 3);

  // FIFO ordering: issue 31 tabs — should drain oldest 30@180 then 1@184
  const tabNow = onhand('i-tab');
  const iss = s.issueFIFO('i-tab', 31);
  ok('FIFO consumes oldest lot first (30@180 + 1@184)', iss.lines[0].unit_cost === 180 && iss.lines[1].unit_cost === 184, JSON.stringify(iss.lines.slice(0, 2)));
  ok('FIFO base total = 30*180 + 1*184', approx(iss.baseTotal, 30 * 180 + 1 * 184), 'got ' + iss.baseTotal);
  ok('on-hand reduced by 31', onhand('i-tab') === tabNow - 31);
}

console.log('\n=== JOURNEY 2: Sales Order — ship, shortage→backorder, employee-assign, reverse ===');
{
  const so = s.salesOrders.find(o => o.id === 'so-142'); // maple: cart x4, basket x8 (in_progress)
  const cartBefore = onhand('i-cart'), basketBefore = onhand('i-basket');
  const rows = so.items.map((l, idx) => ({ idx, qty: l.qty, employee_id: '' }));
  const shipRes = s.shipSO(so, rows, so.landed_costs);
  ok('SO ships fully -> status shipped', so.status === 'shipped', so.status);
  ok('cart stock -4', onhand('i-cart') === cartBefore - 4, `${cartBefore}->${onhand('i-cart')}`);
  ok('basket stock -8', onhand('i-basket') === basketBefore - 8);
  ok('captured cost = 4*640 + 8*28.5 = 2788', approx(shipRes.captured, 4 * 640 + 8 * 28.5), 'got ' + shipRes.captured);

  // reverse the shipment -> stock restored, status back to in_progress
  s.reverseShip(so);
  ok('reverse restores cart stock', onhand('i-cart') === cartBefore, `${onhand('i-cart')} vs ${cartBefore}`);
  ok('reverse restores basket stock', onhand('i-basket') === basketBefore);
  ok('reverse sets status in_progress', so.status === 'in_progress', so.status);

  // shortage -> backorder: order more carts than exist
  const avail = onhand('i-cart');
  const bo = {
    id: 'so-bo', so_number: s.nextSoNumber(), recipient_type: 'facility', recipient_id: 'f-bayview', ship_to_type: 'facility', regional_id: null, facility_id: 'f-bayview',
    order_date: '2026-06-16', expected_date: '', delivery_method: 'Freight', shipping_address: 'Bayview', shipping_cost: 0, landed_costs: [], status: 'in_progress', notes: '', backorder_of: null, attachments: [], groups: [],
    items: [{ kind: 'item', vendor_item_id: 'i-cart', name: 'Care Cart — Standard', facility_id: 'f-bayview', qty: avail + 5, qty_shipped: 0, shipped_cost_total: 0, unit_cost: 640 }],
  };
  s.salesOrders.unshift(bo);
  const r = s.shipAndBackorder(bo, [{ idx: 0, qty: avail, employee_id: '' }], []);
  ok('partial ship completes original SO', bo.status === 'completed', bo.status);
  ok('back order (…BC) created', !!r.backorder && r.backorder.so_number.endsWith('BC'), r.backorder && r.backorder.so_number);
  ok('back order carries the shortfall qty (5)', r.backorder && r.backorder.items[0].qty === 5, r.backorder && r.backorder.items[0].qty);
  ok('cart stock fully drained by partial ship', onhand('i-cart') === 0, 'got ' + onhand('i-cart'));

  // Amendment: a raw laptop is ASSEMBLY-ONLY — it can't ship loose; only an assembled unit can.
  ok('laptop item is assembly-only', s.itemAssemblyOnly('i-laptop') === true);
  ok('a single is never an asset (itemIsAsset always false)', s.itemIsAsset('i-laptop') === false);
  ok('assembly-only laptop is excluded from the SO loose picker', !s.catalogShip.some((c) => c.id === 'i-laptop'));
  // assemble a single-item laptop unit (consumes 1 from stock), then ship the unit to an employee
  const lapBefore = onhand('i-laptop'), uaBefore = s.userAssets.length;
  const built = s.buildAssembly({ assembly_id: 'asm-laptop', code: 'LAP-T-1', fields: { 'RAM': '16 GB', 'Make / Company': 'Dell', 'Price': '935', 'Serial No.': 'SER-T1' } });
  ok('assembling a single-item laptop consumes 1 from stock', !built.error && onhand('i-laptop') === lapBefore - 1, built.error || ('' + onhand('i-laptop')));
  ok('built laptop lands in the warehouse as one asset unit', s.availableUnits('asm-laptop').some((u) => u.id === built.cart.id));
  const lapSO = {
    id: 'so-lap', so_number: s.nextSoNumber(), recipient_type: 'employee', recipient_id: 'u-carl', ship_to_type: 'facility', regional_id: null, facility_id: 'f-maple',
    order_date: '2026-06-16', expected_date: '', delivery_method: 'Courier', shipping_address: 'Maple', shipping_cost: 0, landed_costs: [], status: 'in_progress', notes: '', backorder_of: null, attachments: [], groups: [],
    items: [{ kind: 'assembly', assembly_id: 'asm-laptop', name: 'Dell Latitude Laptop', facility_id: 'f-maple', qty: 1, qty_shipped: 0 }],
  };
  s.salesOrders.unshift(lapSO);
  s.shipSO(lapSO, [{ idx: 0, unit_ids: [built.cart.id], employee_id: 'u-carl' }], []);
  ok('shipping the laptop assembly assigns the unit to the employee (Carl Chen)', s.userAssets.length === uaBefore + 1 && s.userAssets[0].user === 'Carl Chen', 'count ' + s.userAssets.length);
  ok('the shipped laptop unit leaves the warehouse pool', !s.availableUnits('asm-laptop').some((u) => u.id === built.cart.id));

  // reversing the shipment returns the unit to the warehouse and unwinds the employee assignment
  s.reverseShip(lapSO);
  ok('reverse returns the laptop unit to the warehouse', s.availableUnits('asm-laptop').some((u) => u.id === built.cart.id));
  ok('reverse removes the employee asset (no double-count)', s.userAssets.length === uaBefore, 'count ' + s.userAssets.length);
}

console.log('\n=== JOURNEY 3: Cart assemble → assign → return make-whole + cart receipt ===');
{
  const basketBefore = onhand('i-basket'), mountBefore = onhand('i-mount');
  const cart = s.assembleCart({ code: null, cart_type: 'Standard', components: [{ vendor_item_id: 'i-basket', qty: 2 }, { vendor_item_id: 'i-mount', qty: 1 }] });
  ok('assemble consumes 2 baskets', onhand('i-basket') === basketBefore - 2, `${basketBefore}->${onhand('i-basket')}`);
  ok('assemble consumes 1 mount', onhand('i-mount') === mountBefore - 1);
  ok('cart cost = 2*28.5 + 1*19.75 = 76.75', approx(cart.cost, 2 * 28.5 + 19.75), 'got ' + cart.cost);
  ok('new cart available in warehouse', cart.location === 'Warehouse' && cart.status === 'Available');

  s.setCartLocation(cart, 'Facility', 'f-cedar');
  ok('assigning cart sets status Assigned', cart.status === 'Assigned' && cart.facility_id === 'f-cedar');

  const returnable = s.returnableAssetsFor('facility', 'f-cedar');
  ok('returnable assets include the assigned cart', returnable.some(a => a.cart_id === cart.id), 'keys ' + returnable.map(a => a.key).join(','));

  const ret = s.startAssetReturn({ source_type: 'facility', source_id: 'f-cedar', so_ref: '', assets: returnable.filter(a => a.cart_id === cart.id) });
  ok('return started in transit', ret.status === 'in_transit');

  const basketBeforeMakeWhole = onhand('i-basket');
  const done = s.confirmAssetReturn(ret.id, [{ key: 'cart:' + cart.id, received: true, missing: [{ vendor_item_id: 'i-basket', qty: 1 }] }]);
  ok('refund to facility = cart cost (76.75)', approx(done.refund_total, 76.75), 'got ' + done.refund_total);
  ok('make-whole charge = 1 basket @ fifo (28.5)', approx(done.replacement_charge, 28.5), 'got ' + done.replacement_charge);
  ok('make-whole pulls 1 basket from inventory', onhand('i-basket') === basketBeforeMakeWhole - 1);
  const restored = s.carts.find(c => c.id === cart.id);
  ok('cart returned to warehouse after make-whole', restored.location === 'Warehouse' && restored.status === 'Available');

  // cart receipt closes the fulfillment loop
  const f = s.facilityById('f-maple'); // has cart_shipment_date
  s.confirmCartReceipt({ facility_id: 'f-maple', received_on: '2026-06-16', bol: 'BOL-maple.pdf', photos: ['p1.jpg', 'p2.jpg'] });
  ok('cart receipt recorded', s.cartReceipts.some(r => r.facility_id === 'f-maple' && r.bol_name === 'BOL-maple.pdf'));
  ok('facility status flips to Received', f.status === 'Received', f.status);
  ok('calendar gains a "received" event', s.calendarEvents.some(e => e.type === 'rec' && e.facility_id === 'f-maple'));
}

console.log('\n=== EDGE PROBES ===');
{
  const mdm = s.itemById('i-mdm');
  s.issueFIFO('i-mdm', onhand('i-mdm'));
  ok('fully depleted item reports 0 on-hand', onhand('i-mdm') === 0);
  ok('fifoUnitCost falls back to base cost when no lots', s.fifoUnitCost('i-mdm') === mdm.cost, 'got ' + s.fifoUnitCost('i-mdm'));
  const basket = s.itemById('i-basket');
  const before = onhand('i-basket');
  s.adjustStock(basket, 5, 'cycle count');
  ok('adjustStock +5 adds a lot', onhand('i-basket') === before + 5);
  s.adjustStock(basket, -3, 'damage');
  ok('adjustStock -3 issues FIFO', onhand('i-basket') === before + 2);
}

console.log('\n======================================');
console.log('RESULT: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('FAILURES:'); fails.forEach(function (f) { console.log('  - ' + f); }); process.exit(1); }
