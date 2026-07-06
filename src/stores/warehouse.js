import { defineStore } from 'pinia';
import { uid } from '@/utils/format';
import { assetSeed } from '@/data/assetSeed';
import { geoForFacility, eastCoastDemoFacilities, eastCoastDemoStaff } from '@/utils/geo';

const SKEY = 'carease_wms_app_v7';
// When false (set by the app at startup), the seed ships with NO Purchase Orders, Sales Orders or Returns
// so the supervisor can test with fresh data he inputs. Tests leave it true to exercise the demo transactions.
let SEED_TX = true;
export function setSeedTransactions(v) { SEED_TX = v; }
export const TODAY = '2026-06-16';
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Asset-class metadata: the 8 real classes, their assignment target, and the columns to show.
const ASSET_CLASSES = [
  { id: 'cart', label: 'Carts', prefix: '', assign: 'facility', cols: [['cart_type', 'Cart Type'], ['bp_machine', 'BP Machine'], ['key', 'Key'], ['tablet_type', 'Tablet Type'], ['tablet_number', 'Tablet #'], ['clini_omni', 'Clini/Omni'], ['basket_type', 'Basket'], ['lte', 'LTE'], ['regional', 'Regional']] },
  { id: 'laptop', label: 'Laptops', prefix: 'LT-', assign: 'employee', cols: [['brand', 'Brand'], ['model', 'Model'], ['serial', 'Serial'], ['ram', 'RAM'], ['processor', 'Processor'], ['clicrite', 'Clicrite ID'], ['price', 'Price'], ['trivia', 'Trivia']] },
  { id: 'gameshow', label: 'Game Shows', prefix: 'GS-', assign: 'employee', cols: [['tracking', 'Tracking'], ['return_tracking', 'Return Tracking'], ['personal_email', 'Personal Email']] },
  { id: 'tablet', label: 'Tablets', prefix: 'T-', assign: 'employee', cols: [['model', 'Model'], ['serial', 'Serial'], ['imei', 'IMEI'], ['lte', 'LTE'], ['sim', 'SIM'], ['phone', 'Phone #'], ['price', 'Price']] },
  { id: 'monitor', label: 'Monitors', prefix: 'CM-', assign: 'employee', cols: [['model', 'Model'], ['serial', 'Serial'], ['size', 'Size'], ['price', 'Price']] },
  { id: 'desktop', label: 'Desktops', prefix: 'DT-', assign: 'employee', cols: [['model', 'Model'], ['serial', 'Serial'], ['clicrite', 'Clicrite ID'], ['price', 'Price']] },
  { id: 'cellphone', label: 'Cell Phones', prefix: 'P-', assign: 'employee', cols: [['model', 'Model'], ['serial', 'Serial'], ['lte', 'Carrier'], ['imei', 'IMEI'], ['phone', 'Phone #'], ['price', 'Price']] },
  { id: 'ezpass', label: 'EZ Pass', prefix: '', assign: 'employee', cols: [['tag_number', 'Tag #']] },
];

/* ------------------------------------------------------------------ seed */
function seed() {
  // FIFO lots per item: oldest first. Each lot = { id, qty, unit_cost (base), landed (per-unit), received_at, ref }
  const mkLots = (rows) => rows.map((x) => ({ id: uid('lot'), qty: x.q, unit_cost: x.c, landed: x.l || 0, received_at: x.d, ref: x.r || 'opening' }));
  const items = [
    { id: 'i-tab', sku: '100001', name: 'Samsung Galaxy Tab A9', vendor_id: 'v-techsource', item_type_id: 't-tablet', cost: 184.0, threshold: 20, bin_location: 'A-12', is_active: true,
      lots: mkLots([{ q: 30, c: 180.0, l: 0, d: '2026-05-20' }, { q: 26, c: 184.0, l: 0, d: '2026-06-11' }]) },
    { id: 'i-cart', sku: '100002', name: 'Care Cart — Standard', vendor_id: 'v-medcarts', item_type_id: 't-cart', cost: 640.0, threshold: 10, bin_location: 'C-03', is_active: true,
      lots: mkLots([{ q: 7, c: 640.0, l: 0, d: '2026-06-12' }]) },
    { id: 'i-basket', sku: '100003', name: 'Supply Basket', vendor_id: 'v-basketco', item_type_id: 't-basket', cost: 28.5, threshold: 40, bin_location: 'B-07', is_active: true,
      lots: mkLots([{ q: 132, c: 28.5, l: 0, d: '2026-06-09' }]) },
    { id: 'i-mdm', sku: '100004', name: 'MDM License Seat', vendor_id: 'v-ourmdm', item_type_id: 't-mdm', cost: 12.0, threshold: 15, bin_location: '—', is_active: true,
      lots: mkLots([{ q: 88, c: 12.0, l: 0, d: '2026-06-01' }]) },
    { id: 'i-mount', sku: '100005', name: 'Wall Mount Bracket', vendor_id: 'v-techsource', item_type_id: 't-mount', cost: 19.75, threshold: 25, bin_location: 'A-14', is_active: true,
      lots: mkLots([{ q: 64, c: 19.75, l: 0, d: '2026-06-05' }]) },
    { id: 'i-stylus', sku: '100006', name: 'Active Stylus Pen', vendor_id: 'v-techsource', item_type_id: 't-tablet', cost: 22.0, threshold: 20, bin_location: 'A-15', is_active: false,
      lots: mkLots([{ q: 9, c: 22.0, l: 0, d: '2026-06-03' }]) },
    { id: 'i-laptop', sku: '100007', name: 'Dell Latitude Laptop', vendor_id: 'v-techsource', item_type_id: 't-laptop', cost: 920.0, threshold: 5, bin_location: 'D-01', is_active: true,
      lots: mkLots([{ q: 6, c: 900.0, l: 0, d: '2026-05-28' }]) },
    { id: 'i-trivia', sku: '100008', name: 'Trivia Machine (Portable)', vendor_id: 'v-techsource', item_type_id: 't-trivia', cost: 350.0, threshold: 5, bin_location: 'D-02', is_active: true,
      lots: mkLots([{ q: 8, c: 340.0, l: 0, d: '2026-06-02' }]) },
  ];
  const db = {
    // sku counter drives numeric item numbers (numbers only, auto-generated)
    counters: { po: 190, so: 145, ro: 42, vbill: 0, cart: 192, ship: 0, asset: 2210, ret: 0, sku: 100011 },
    vendors: [
      { id: 'v-medcarts', name: 'MedCarts Inc', email: 'orders@medcarts.com', pay_terms: 'Net 30', deposit_percent: 30 },
      { id: 'v-techsource', name: 'TechSource', email: 'sales@techsource.io', pay_terms: 'Net 15', deposit_percent: 0 },
      { id: 'v-ourmdm', name: 'Our MDM', email: 'billing@ourmdm.com', pay_terms: 'Prepaid', deposit_percent: 0 },
      { id: 'v-basketco', name: 'BasketCo Supply', email: 'hello@basketco.com', pay_terms: 'Net 30', deposit_percent: 0 },
    ],
    // trackable = prompts (optionally) for asset info on receipt. Per supervisor R2: Laptops + Trivia Equipment.
    itemTypes: [
      { id: 't-tablet', name: 'Tablet', trackable: false }, { id: 't-cart', name: 'Cart', trackable: false },
      { id: 't-basket', name: 'Basket', trackable: false }, { id: 't-mdm', name: 'Our MDM', trackable: false },
      { id: 't-mount', name: 'Mount', trackable: false }, { id: 't-laptop', name: 'Laptop', trackable: true },
      { id: 't-trivia', name: 'Trivia Equipment', trackable: true },
    ],
    items,
    // Groups are first-class ITEMS (numeric sku, live in the same inventory list). Members: single items OR nested groups.
    groups: [
      { id: 'g-starter', sku: '100009', name: 'Starter Kit A', description: 'Tablet + mount + stylus + basket + MDM.', is_active: true, is_group: true,
        members: [{ kind: 'item', ref_id: 'i-tab', qty: 1 }, { kind: 'item', ref_id: 'i-mount', qty: 1 }, { kind: 'item', ref_id: 'i-stylus', qty: 1 }, { kind: 'item', ref_id: 'i-basket', qty: 2 }, { kind: 'item', ref_id: 'i-mdm', qty: 1 }] },
      { id: 'g-tabmount', sku: '100010', name: 'Tablet + Mount', description: 'Two-item bundle.', is_active: true, is_group: true,
        members: [{ kind: 'item', ref_id: 'i-tab', qty: 1 }, { kind: 'item', ref_id: 'i-mount', qty: 1 }] },
      { id: 'g-facility', sku: '100011', name: 'Facility Onboard Bundle', description: 'Nested: Starter Kit A (group) + 1 cart + 1 laptop.', is_active: true, is_group: true,
        members: [{ kind: 'group', ref_id: 'g-starter', qty: 1 }, { kind: 'item', ref_id: 'i-cart', qty: 1 }, { kind: 'item', ref_id: 'i-laptop', qty: 1 }] },
    ],
    // Assembled carts (Inventory ▸ Carts) — mirror of warehouse assets. components capture FIFO cost.
    carts: [
      { id: 'c-1', code: 'CART-A-0188', cart_type: 'Standard', status: 'Available', location: 'Warehouse', facility_id: null, cost: 0, components: [] },
    ],
    stockLogs: [
      { id: uid('l'), vendor_item_id: 'i-tab', kind: 'in', qty: 24, source_label: 'Purchase Order', ref: 'PO-2026-0190', reason: null, created_at: '2026-06-11T10:12:00' },
      { id: uid('l'), vendor_item_id: 'i-cart', kind: 'in', qty: 10, source_label: 'PO Receiving', ref: 'RO-2026-0042', reason: null, created_at: '2026-06-12T09:30:00' },
      { id: uid('l'), vendor_item_id: 'i-cart', kind: 'out', qty: 3, source_label: 'SO Shipment', ref: 'SO-2026-0138', reason: null, created_at: '2026-06-13T14:05:00' },
    ],
    facilities: [
      { id: 'f-maple', name: 'Maple SNF', city: 'Lakewood, NJ', address: '120 Maple Ave, Lakewood, NJ 08701', regional_id: 'reg-rosa', provider: 'Dr. Priya Tan', care_companion: 'Carl Chen', regional: 'Rosa Diaz', floor_plan: 'maple_floorplan.pdf', onboard_date: '2026-06-16', carts_needed: 8, cart_shipment_date: '2026-06-16', status: 'Shipping', notes: '', messages: [], attachments: ['maple_floorplan.pdf'] },
      { id: 'f-bayview', name: 'Bayview Center', city: 'Toms River, NJ', address: '88 Bay Blvd, Toms River, NJ 08753', regional_id: 'reg-rosa', provider: 'Dr. Kwesi Ofori', care_companion: 'Lena Ross', regional: 'Rosa Diaz', floor_plan: 'bayview_floorplan.pdf', onboard_date: '2026-06-17', carts_needed: 12, cart_shipment_date: '2026-06-18', status: 'Planned', notes: '', messages: [], attachments: ['bayview_floorplan.pdf'] },
      { id: 'f-cedar', name: 'Cedar Grove', city: 'Brick, NJ', address: '15 Cedar Rd, Brick, NJ 08723', regional_id: 'reg-tim', provider: 'Dr. Maya Singh', care_companion: 'Omar Vance', regional: 'Tim Boyd', floor_plan: null, onboard_date: '2026-06-22', carts_needed: null, cart_shipment_date: null, status: 'Onboarding', notes: '', messages: [], attachments: [] },
      { id: 'f-river', name: 'Riverside Care', city: 'Red Bank, NJ', address: '40 River St, Red Bank, NJ 07701', regional_id: 'reg-tim', provider: 'Dr. Alan Pierce', care_companion: 'Nina Park', regional: 'Tim Boyd', floor_plan: 'riverside_floorplan.pdf', onboard_date: '2026-06-25', carts_needed: null, cart_shipment_date: null, status: 'Onboarding', notes: '', messages: [], attachments: ['riverside_floorplan.pdf'] },
    ],
    regionals: [
      { id: 'reg-rosa', name: 'Rosa Diaz', area: 'NJ — North', email: 'rosa.diaz@carease.com', address: '200 North Office Pkwy, Newark, NJ 07102' },
      { id: 'reg-tim', name: 'Tim Boyd', area: 'NJ — South', email: 'tim.boyd@carease.com', address: '15 South Center Dr, Cherry Hill, NJ 08002' },
    ],
    facilityAssets: [
      { id: uid('fa'), facility_id: 'f-maple', item: 'Care Cart — Standard', asset_tag: 'CRT-A-0188', qty: 8, assigned: '2026-06-12', status: 'Active' },
      { id: uid('fa'), facility_id: 'f-bayview', item: 'Care Cart — Standard', asset_tag: 'CRT-A-0190', qty: 12, assigned: '2026-06-14', status: 'In transit' },
    ],
    userAssets: [
      { id: uid('ua'), user: 'Carl Chen', facility: 'Maple SNF', item: 'Dell Latitude Laptop', item_type: 'Laptop', asset_tag: 'LAP-U-3001', serial: 'DL5-6610', cost: 920, assigned: '2026-06-10', status: 'Active' },
      { id: uid('ua'), user: 'Omar Vance', facility: 'Cedar Grove', item: 'Trivia Machine (Portable)', item_type: 'Trivia Equipment', asset_tag: 'TRV-U-3002', serial: 'TRV-2231', cost: 350, assigned: '2026-06-12', status: 'Active' },
    ],
    // Tracked assets created when a trackable item is received on a PO (serialized).
    trackedAssets: [
      { id: uid('ta'), item: 'Dell Latitude Laptop', item_type: 'Laptop', asset_tag: 'LAP-A-2208', serial: 'DL5-7721', status: 'In warehouse', received_at: '2026-05-28', po: 'opening' },
    ],
    users: [
      { id: 'u-rosa', name: 'Rosa Diaz', role: 'Regional Director', program: 'Regional', facility: 'NJ — North', email: 'rosa.diaz@carease.com', address: '200 North Office Pkwy, Newark, NJ 07102' },
      { id: 'u-carl', name: 'Carl Chen', role: 'Care Companion', program: 'APCM', facility: 'Maple SNF', email: 'carl.chen@carease.com', address: '120 Maple Ave, Lakewood, NJ 08701' },
      { id: 'u-priya', name: 'Priya Tan', role: 'Provider', program: 'CoCM', facility: 'Bayview Center', email: 'priya.tan@carease.com', address: '88 Bay Blvd, Toms River, NJ 08753' },
      { id: 'u-omar', name: 'Omar Vance', role: 'Care Companion', program: 'APCM', facility: 'Cedar Grove', email: 'omar.vance@carease.com', address: '15 Cedar Rd, Brick, NJ 08723' },
      { id: 'u-tim', name: 'Tim Boyd', role: 'Regional Director', program: 'Regional', facility: 'NJ — South', email: 'tim.boyd@carease.com', address: '15 South Center Dr, Cherry Hill, NJ 08002' },
      { id: 'u-shaya', name: 'Shaya Karmel', role: 'Care Companion', program: 'APCM', facility: 'Riverside Care', email: 'shaya.karmel@carease.com', address: '40 River St, Red Bank, NJ 07701' },
      { id: 'u-malky', name: 'Malky Locker', role: 'Warehouse Manager', program: 'Warehouse', facility: 'All facilities', email: 'malky.locker@carease.com', address: '1 Warehouse Way, Lakewood, NJ 08701' },
    ],
    tickets: [
      { id: '#4821', priority: 'High', subject: 'BOL missing — Maple SNF receipt', kind: 'assigned' },
      { id: '#4830', priority: 'Medium', subject: 'Confirm cart count — Bayview', kind: 'assigned' },
      { id: '#4811', priority: 'Support', subject: 'Tablet swap request — Cedar Grove', kind: 'support' },
      { id: '#4799', priority: 'Low', subject: 'Update MDM enrollment batch', kind: 'system' },
      { id: '#4840', priority: 'Medium', subject: 'Floor plan re-upload — Riverside', kind: 'system' },
    ],
    regionalSchedule: [
      { date: '2026-06-15', label: 'Regional sync' },
      { date: '2026-06-19', label: 'Regional visit — Bayview' },
      { date: '2026-06-26', label: 'Regional sync' },
    ],
    purchaseOrders: [
      { id: 'po-188', po_number: 'PO-2026-0188', vendor_id: 'v-medcarts', multi_vendor: false, order_date: '2026-06-08', expected_date: '2026-06-20', status: 'partial', progress: 'Shipping', sent: null, notes: 'Standard carts for June onboards.', landed_costs: [], payments: [], deposit: 0,
        items: [{ id: uid('pol'), vendor_item_id: 'i-cart', name: 'Care Cart — Standard', vendor_id: 'v-medcarts', qty: 10, qty_received: 5, unit_cost: 640 }] },
      { id: 'po-190', po_number: 'PO-2026-0190', vendor_id: 'v-techsource', multi_vendor: false, order_date: '2026-06-11', expected_date: '2026-06-24', status: 'open', progress: 'Deposit Sent', sent: null, notes: '', landed_costs: [], payments: [], deposit: 0,
        items: [{ id: uid('pol'), vendor_item_id: 'i-tab', name: 'Samsung Galaxy Tab A9', vendor_id: 'v-techsource', qty: 24, qty_received: 0, unit_cost: 184 },
                { id: uid('pol'), vendor_item_id: 'i-mount', name: 'Wall Mount Bracket', vendor_id: 'v-techsource', qty: 24, qty_received: 0, unit_cost: 19.75 }] },
    ],
    salesOrders: [
      { id: 'so-142', so_number: 'SO-2026-0142', recipient_type: 'facility', recipient_id: 'f-maple', ship_to_type: 'facility', regional_id: null, facility_id: 'f-maple', order_date: '2026-06-09', expected_date: '2026-06-16', delivery_method: 'Freight', shipping_address: 'Maple SNF · 120 Maple Ave, Lakewood, NJ 08701', shipping_cost: 120, landed_costs: [], status: 'in_progress', notes: '', backorder_of: null, attachments: [{ id: uid('att'), name: 'BOL-SO-2026-0142.pdf', kind: 'BOL', at: '2026-06-13T09:00:00' }, { id: uid('att'), name: 'POD-Maple-carts.jpg', kind: 'Proof of delivery', at: '2026-06-14T15:00:00' }],
        items: [{ vendor_item_id: 'i-cart', name: 'Care Cart — Standard', facility_id: 'f-maple', qty: 4, qty_shipped: 0, shipped_cost_total: 0, unit_cost: 640 }, { vendor_item_id: 'i-basket', name: 'Supply Basket', facility_id: 'f-maple', qty: 8, qty_shipped: 0, shipped_cost_total: 0, unit_cost: 28.5 }], groups: [] },
      { id: 'so-145', so_number: 'SO-2026-0145', recipient_type: 'facility', recipient_id: 'f-bayview', ship_to_type: 'facility', regional_id: null, facility_id: 'f-bayview', order_date: '2026-06-12', expected_date: '2026-06-19', delivery_method: 'Courier', shipping_address: 'Bayview Center · 88 Bay Blvd, Toms River, NJ 08753', shipping_cost: 95, landed_costs: [], status: 'draft', notes: '', backorder_of: null, attachments: [],
        items: [{ vendor_item_id: 'i-tab', name: 'Samsung Galaxy Tab A9', facility_id: 'f-bayview', qty: 12, qty_shipped: 0, shipped_cost_total: 0, unit_cost: 184 }], groups: [] },
    ],
    cartReceipts: [],
    vendorBills: [],
    shipments: [],     // combined shipments (S3)
    shipQueue: [],     // V6 SO-3: confirming an SO queues a shipment here
    returns: [],       // asset return orders (R1–R4)
    settings: { refurbCreditRate: 0.8 }, // V6 CA-3: returned-cart credit/value = book cost × this rate (placeholder formula; change when the real refund formula is provided)
    emails: [],        // simulated sent/notification log

    // --- Role & Permissions (unchanged) ---
    roles: [
      { id: 'warehouse-manager', name: 'Warehouse Manager', model_user: 'Malky Locker', derived_from: null, renamed_from: 'Manager', custom: false },
    ],
    employeeRoleCreated: false,
    capabilities: [
      { id: 'cap-1', group: 'Facilities (global)', label: 'View all facilities (dedicated Facilities tab)', grant: 'yes', note: 'Sees every facility, its providers, Care Companions, regionals', employee: true },
      { id: 'cap-2', group: 'Facilities (global)', label: 'View all users', grant: 'yes', note: 'All users regardless of program', employee: false },
      { id: 'cap-3', group: 'Facility Onboarding', label: 'View facility in the onboarding pipeline', grant: 'yes', note: '', employee: true },
      { id: 'cap-4', group: 'Facility Onboarding', label: 'Fill in & manage facility custom fields', grant: 'yes', note: 'Includes the carts-needed field', employee: true },
      { id: 'cap-5', group: 'Facility Onboarding', label: 'Edit facility onboarding details (custom fields)', grant: 'yes', note: 'Needed to edit the cart fields', employee: false },
      { id: 'cap-6', group: 'Facility Onboarding', label: 'Edit notes on facility onboarding', grant: 'yes', note: '', employee: true },
      { id: 'cap-7', group: 'Facility Onboarding', label: 'Upload & manage facility attachments', grant: 'yes', note: 'Cart shipping info / BOL / photos', employee: true },
      { id: 'cap-8', group: 'Facility Onboarding', label: 'Send message on a facility record', grant: 'yes', note: '', employee: true },
      { id: 'cap-9', group: 'Facility Onboarding', label: 'Manage facility context during onboarding', grant: 'no', note: '', employee: false },
      { id: 'cap-10', group: 'Facility Onboarding', label: "Change a facility's onboarding status", grant: 'no', note: 'Owned by another department', employee: false },
      { id: 'cap-11', group: 'Facility Onboarding', label: 'Add a new facility to the pipeline', grant: 'no', note: '', employee: false },
      { id: 'cap-12', group: 'Facility Onboarding', label: 'Delete a facility from the pipeline', grant: 'no', note: '', employee: false },
      { id: 'cap-13', group: 'Sales Onboarding', label: 'View sales in the pipeline', grant: 'no', note: 'No sales onboarding access at all', employee: false },
      { id: 'cap-13b', group: 'Sales Onboarding', label: 'Add new leads / add sales records', grant: 'no', note: '', employee: false },
      { id: 'cap-13c', group: 'Sales Onboarding', label: 'Edit sales onboarding records', grant: 'no', note: '', employee: false },
      { id: 'cap-13d', group: 'Sales Onboarding', label: 'Add notes / manage contact / update status', grant: 'no', note: '', employee: false },
      { id: 'cap-13e', group: 'Sales Onboarding', label: 'Delete sales onboarding records', grant: 'no', note: '', employee: false },
      { id: 'cap-14', group: 'Programs', label: 'APCM program access', grant: 'no', note: 'Nothing APCM-specific is needed', employee: false },
      { id: 'cap-15', group: 'Programs', label: 'CoCM program access', grant: 'no', note: 'Nothing CoCM-specific is needed', employee: false },
      { id: 'cap-16', group: 'Regional', label: 'Regional Director dashboard (their own view)', grant: 'no', note: 'She gets her own dashboard instead', employee: false },
      { id: 'cap-17', group: 'Regional', label: 'See / access the regional schedule', grant: 'yes', note: 'Surfaced inside her view', employee: false },
      { id: 'cap-18', group: 'Regional', label: 'Access to calendars', grant: 'yes', note: '', employee: true },
      { id: 'cap-19', group: 'Tasks & Tickets', label: 'View tickets assigned to her', grant: 'yes', note: '', employee: true },
      { id: 'cap-20', group: 'Tasks & Tickets', label: 'View all tickets in the system', grant: 'yes', note: '', employee: false },
      { id: 'cap-21', group: 'Tasks & Tickets', label: 'View support tickets', grant: 'yes', note: '', employee: true },
      { id: 'cap-22', group: 'Tasks & Tickets', label: 'Admin view on all support tickets', grant: 'confirm', note: 'Likely yes — confirm if enabled', employee: false },
      { id: 'cap-23', group: 'Purchasing & Assets', label: 'View & manage purchase orders', grant: 'yes', note: '', employee: false },
      { id: 'cap-24', group: 'Purchasing & Assets', label: 'Assets — all asset items', grant: 'yes', note: 'Full asset visibility', employee: true },
      { id: 'cap-25', group: 'User Management', label: 'Add / remove users within warehouse', grant: 'partial', note: 'Warehouse scope only — not global removal', employee: false },
      { id: 'cap-26', group: 'User Management', label: 'Admin dashboard access', grant: 'confirm', note: 'Needed to a degree — scope to be defined', employee: false },
      { id: 'cap-27', group: 'System Settings', label: 'Manage condition triggers', grant: 'no', note: 'Administrator-only', employee: false },
      { id: 'cap-28', group: 'System Settings', label: 'Manage notification template emails', grant: 'no', note: 'Administrator-only', employee: false },
      { id: 'cap-29', group: 'Open / Cross-cutting', label: 'Geolocation / geo-capping permission', grant: 'confirm', note: 'Removed? Location only worked in-app — clarify', employee: false },
    ],
  };
  /* ------------------------------------------------------------------ V4 mock-data depth (additive only — existing ids unchanged) */
  db.vendors.push(
    { id: 'v-edan', name: 'EDAN Medical', email: 'orders@edan.com', pay_terms: 'Net 30', deposit_percent: 50 },
    { id: 'v-accutor', name: 'Accutor Devices', email: 'sales@accutor.com', pay_terms: 'Net 15', deposit_percent: 25 },
    { id: 'v-cables', name: 'CablesPlus', email: 'hello@cablesplus.com', pay_terms: 'Prepaid', deposit_percent: 0 },
  );
  db.itemTypes.push(
    { id: 't-gameshow', name: 'Gameshow', trackable: true },
    { id: 't-cable', name: 'Cable', trackable: false },
    { id: 't-bp', name: 'BP Device', trackable: false },
    { id: 't-key', name: 'Key', trackable: false },
    { id: 't-spo2', name: 'SPO2 Sensor', trackable: false },
  );
  db.items.push(
    { id: 'i-tab2', sku: '100012', name: 'Samsung Galaxy Tab A9 (Gen2)', vendor_id: 'v-techsource', item_type_id: 't-tablet', cost: 188.0, threshold: 20, bin_location: 'A-16', is_active: true, lots: mkLots([{ q: 40, c: 188.0, d: '2026-06-10' }]) },
    { id: 'i-laptop2', sku: '100013', name: 'HP ProBook Laptop', vendor_id: 'v-techsource', item_type_id: 't-laptop', cost: 870.0, threshold: 5, bin_location: 'D-03', is_active: true, lots: mkLots([{ q: 8, c: 860.0, d: '2026-06-04' }]) },
    { id: 'i-gameshow', sku: '100014', name: 'Trivia Gameshow Console', vendor_id: 'v-techsource', item_type_id: 't-gameshow', cost: 410.0, threshold: 4, bin_location: 'D-04', is_active: true, lots: mkLots([{ q: 12, c: 400.0, d: '2026-06-02' }]) },
    { id: 'i-cable-usb', sku: '100015', name: 'USB-C Cable', vendor_id: 'v-cables', item_type_id: 't-cable', cost: 6.5, threshold: 100, bin_location: 'B-10', is_active: true, lots: mkLots([{ q: 300, c: 6.0, d: '2026-06-05' }]) },
    { id: 'i-cable-pwr', sku: '100016', name: 'Power Cable', vendor_id: 'v-cables', item_type_id: 't-cable', cost: 8.0, threshold: 80, bin_location: 'B-11', is_active: true, lots: mkLots([{ q: 200, c: 7.5, d: '2026-06-05' }]) },
    { id: 'i-spo2', sku: '100017', name: 'SPO2 Sensor', vendor_id: 'v-edan', item_type_id: 't-spo2', cost: 35.0, threshold: 30, bin_location: 'E-01', is_active: true, lots: mkLots([{ q: 80, c: 34.0, d: '2026-06-07' }]) },
    { id: 'i-bphose', sku: '100018', name: 'BP Hose', vendor_id: 'v-edan', item_type_id: 't-bp', cost: 12.0, threshold: 40, bin_location: 'E-02', is_active: true, lots: mkLots([{ q: 120, c: 11.5, d: '2026-06-07' }]) },
    { id: 'i-bpdev', sku: '100019', name: 'VS8 BP Device', vendor_id: 'v-edan', item_type_id: 't-bp', cost: 220.0, threshold: 10, bin_location: 'E-03', is_active: true, attrs: { bp_device: 'VS8' }, lots: mkLots([{ q: 30, c: 210.0, d: '2026-06-08' }]) },
    { id: 'i-edancart', sku: '100020', name: 'EDAN Cart Frame', vendor_id: 'v-edan', item_type_id: 't-cart', cost: 480.0, threshold: 6, bin_location: 'C-04', is_active: true, attrs: { cart_type: 'EDAN Cart' }, lots: mkLots([{ q: 15, c: 470.0, d: '2026-06-09' }]) },
    { id: 'i-key', sku: '100021', name: 'CTA Cart Key', vendor_id: 'v-edan', item_type_id: 't-key', cost: 9.0, threshold: 20, bin_location: 'C-05', is_active: true, attrs: { key_type: 'CTA Key' }, lots: mkLots([{ q: 60, c: 9.0, d: '2026-06-09' }]) },
    { id: 'i-accutor', sku: '100022', name: 'Accutor BP Monitor', vendor_id: 'v-accutor', item_type_id: 't-bp', cost: 260.0, threshold: 8, bin_location: 'E-04', is_active: true, attrs: { bp_device: 'Accutor' }, lots: mkLots([{ q: 18, c: 255.0, d: '2026-06-06' }]) },
    { id: 'i-basket2', sku: '100023', name: 'Supply Basket (Large)', vendor_id: 'v-basketco', item_type_id: 't-basket', cost: 34.0, threshold: 30, bin_location: 'B-08', is_active: true, lots: mkLots([{ q: 90, c: 33.0, d: '2026-06-09' }]) },
  );
  db.groups.push(
    { id: 'g-vs8bp', sku: '100024', name: 'VS8 BP Device Kit', description: 'BP device + hose + SPO2 sensor.', is_active: true, is_group: true,
      members: [{ kind: 'item', ref_id: 'i-bpdev', qty: 1 }, { kind: 'item', ref_id: 'i-bphose', qty: 1 }, { kind: 'item', ref_id: 'i-spo2', qty: 1 }] },
    { id: 'g-cta', sku: '100025', name: 'CTA Cart Kit', description: 'EDAN cart frame + key + large basket.', is_active: true, is_group: true,
      members: [{ kind: 'item', ref_id: 'i-edancart', qty: 1 }, { kind: 'item', ref_id: 'i-key', qty: 1 }, { kind: 'item', ref_id: 'i-basket2', qty: 1 }] },
    { id: 'g-edanstarter', sku: '100026', name: 'EDAN Starter Bundle', description: 'Nested: CTA Cart Kit + tablet + 2 USB cables.', is_active: true, is_group: true,
      members: [{ kind: 'group', ref_id: 'g-cta', qty: 1 }, { kind: 'item', ref_id: 'i-tab2', qty: 1 }, { kind: 'item', ref_id: 'i-cable-usb', qty: 2 }] },
  );
  db.regionals.push({ id: 'reg-ana', name: 'Ana Reyes', area: 'NJ — Central', email: 'ana.reyes@carease.com', address: '9 Central Plaza, Freehold, NJ 07728' });
  db.facilities.push(
    { id: 'f-oak', name: 'Oakwood SNF', city: 'Jackson, NJ', address: '12 Oak Ln, Jackson, NJ 08527', regional_id: 'reg-ana', provider: 'Dr. Lina Cho', care_companion: 'Dana White', regional: 'Ana Reyes', floor_plan: 'oakwood_floorplan.pdf', onboard_date: '2026-06-23', carts_needed: 6, cart_shipment_date: '2026-06-24', status: 'Shipping', notes: '', messages: [], attachments: ['oakwood_floorplan.pdf'] },
    { id: 'f-pine', name: 'Pinegrove Center', city: 'Brick, NJ', address: '77 Pine St, Brick, NJ 08724', regional_id: 'reg-tim', provider: 'Dr. Owen Hale', care_companion: 'Lee Park', regional: 'Tim Boyd', floor_plan: null, onboard_date: '2026-06-29', carts_needed: null, cart_shipment_date: null, status: 'Onboarding', notes: '', messages: [], attachments: [] },
    { id: 'f-harbor', name: 'Harborview Care', city: 'Long Branch, NJ', address: '5 Harbor Rd, Long Branch, NJ 07740', regional_id: 'reg-ana', provider: 'Dr. Sara Lin', care_companion: 'Mia Tran', regional: 'Ana Reyes', floor_plan: 'harborview_floorplan.pdf', onboard_date: '2026-07-02', carts_needed: 10, cart_shipment_date: null, status: 'Planned', notes: '', messages: [], attachments: ['harborview_floorplan.pdf'] },
  );
  db.users.push(
    { id: 'u-dana', name: 'Dana White', role: 'Care Companion', program: 'APCM', facility: 'Oakwood SNF', email: 'dana.white@carease.com', address: '12 Oak Ln, Jackson, NJ 08527' },
    { id: 'u-lee', name: 'Lee Park', role: 'Provider', program: 'CoCM', facility: 'Pinegrove Center', email: 'lee.park@carease.com', address: '77 Pine St, Brick, NJ 08724' },
    { id: 'u-wh2', name: 'Yossi Klein', role: 'Warehouse Employee', program: 'Warehouse', facility: 'All facilities', email: 'yossi.klein@carease.com', address: '1 Warehouse Way, Lakewood, NJ 08701' },
    { id: 'u-wh3', name: 'Rivka Stern', role: 'Warehouse Employee', program: 'Warehouse', facility: 'All facilities', email: 'rivka.stern@carease.com', address: '1 Warehouse Way, Lakewood, NJ 08701' },
  );
  db.carts.push(
    { id: 'c-2', code: 'CART-A-0189', cart_type: 'Standard', status: 'Available', location: 'Warehouse', facility_id: null, cost: 0, components: [] },
    { id: 'c-3', code: 'CART-V-0001', assembly_id: 'asm-vs8', cart_type: 'CTA Cart', key_type: 'CTA Key', bp_device: 'VS8', cart_color: 'Graphite', tablet_number: 'TBL-0001', status: 'Assigned', location: 'Facility', facility_id: 'f-maple', regional_id: 'reg-rosa', cost: 255.5, components: [{ vendor_item_id: 'i-bpdev', name: 'VS8 BP Device', qty: 1, unit_cost: 210 }, { vendor_item_id: 'i-bphose', name: 'BP Hose', qty: 1, unit_cost: 11.5 }, { vendor_item_id: 'i-spo2', name: 'SPO2 Sensor', qty: 1, unit_cost: 34 }] },
    { id: 'c-4', code: 'CART-E-0001', assembly_id: 'asm-edan', unit_kind: 'cart', cart_type: 'EDAN Cart', key_type: 'EDAN Key', bp_device: '—', cart_color: 'White', tablet_number: 'TBL-0002', status: 'Available', location: 'Warehouse', facility_id: null, regional_id: null, cost: 512, components: [{ vendor_item_id: 'i-edancart', name: 'EDAN Cart Frame', qty: 1, unit_cost: 470 }, { vendor_item_id: 'i-key', name: 'CTA Cart Key', qty: 1, unit_cost: 9 }, { vendor_item_id: 'i-basket2', name: 'Supply Basket (Large)', qty: 1, unit_cost: 33 }] },
    { id: 'u-lap-1', code: 'LAP-0001', assembly_id: 'asm-laptop', unit_kind: 'single', cart_type: 'Dell Latitude Laptop', fields: { 'RAM': '16 GB', 'Make / Company': 'Dell', 'Price': '935', 'Serial No.': 'DL7420-0001' }, status: 'Available', location: 'Warehouse', facility_id: null, regional_id: null, cost: 935, components: [{ vendor_item_id: 'i-laptop', name: 'Dell Latitude Laptop', qty: 1, unit_cost: 935 }] },
    { id: 'u-lap-2', code: 'LAP-0002', assembly_id: 'asm-laptop', unit_kind: 'single', cart_type: 'Dell Latitude Laptop', fields: { 'RAM': '32 GB', 'Make / Company': 'Dell', 'Price': '935', 'Serial No.': 'DL7420-0002' }, status: 'Available', location: 'Warehouse', facility_id: null, regional_id: null, cost: 935, components: [{ vendor_item_id: 'i-laptop', name: 'Dell Latitude Laptop', qty: 1, unit_cost: 935 }] },
    { id: 'u-gs-1', code: 'GS-0001', assembly_id: 'asm-gameshow', unit_kind: 'single', cart_type: 'Trivia Gameshow Console', fields: { 'Make / Company': 'TriviaCo', 'Price': '415', 'Serial No.': 'GS9000-0001' }, status: 'Available', location: 'Warehouse', facility_id: null, regional_id: null, cost: 415, components: [{ vendor_item_id: 'i-gameshow', name: 'Trivia Gameshow Console', qty: 1, unit_cost: 415 }] },
  );
  db.trackedAssets.push(
    { id: uid('ta'), item: 'HP ProBook Laptop', item_type: 'Laptop', asset_tag: 'LAP-A-2211', serial: 'HP-9001', status: 'In warehouse', received_at: '2026-06-10', po: 'opening' },
    { id: uid('ta'), item: 'Trivia Gameshow Console', item_type: 'Gameshow', asset_tag: 'GMS-A-2212', serial: 'GMS-77', status: 'In warehouse', received_at: '2026-06-12', po: 'opening' },
  );
  db.facilityAssets.push({ id: uid('fa'), facility_id: 'f-oak', item: 'Care Cart — Standard', asset_tag: 'CRT-A-0191', qty: 6, assigned: '2026-06-20', status: 'In transit' });
  db.userAssets.push({ id: uid('ua'), user: 'Dana White', facility: 'Oakwood SNF', item: 'HP ProBook Laptop', item_type: 'Laptop', asset_tag: 'LAP-U-3003', serial: '', cost: 870, assigned: '2026-06-19', status: 'Active' });
  db.tickets.push(
    { id: '#4852', priority: 'High', subject: 'EDAN cart key missing — Oakwood', kind: 'assigned' },
    { id: '#4861', priority: 'Low', subject: 'Cable reorder — Central region', kind: 'system' },
    { id: '#4870', priority: 'Support', subject: 'Gameshow console swap — Pinegrove', kind: 'support' },
  );
  db.regionalSchedule.push({ date: '2026-06-24', label: 'Regional visit — Oakwood' }, { date: '2026-07-01', label: 'Regional sync (Central)' });
  db.purchaseOrders.push(
    { id: 'po-191', po_number: 'PO-2026-0191', vendor_id: 'v-edan', order_date: '2026-06-18', expected_date: '2026-06-30', status: 'open', progress: 'Deposit Sent', sent: null, notes: 'EDAN carts + keys for July onboards.', landed_costs: [{ id: uid('lc'), label: 'Freight', amount: 150 }], payments: [{ id: uid('pay'), amount: 2395, original_amount: 2395, edited: false, file: '', note: 'Deposit', at: '2026-06-18T10:00:00' }], deposit: 2395,
      items: [{ id: uid('pol'), kind: 'item', vendor_item_id: 'i-edancart', name: 'EDAN Cart Frame', qty: 10, qty_received: 0, unit_cost: 470 }, { id: uid('pol'), kind: 'item', vendor_item_id: 'i-key', name: 'CTA Cart Key', qty: 10, qty_received: 0, unit_cost: 9 }] },
    { id: 'po-192', po_number: 'PO-2026-0192', vendor_id: 'v-techsource', order_date: '2026-06-15', expected_date: '2026-06-26', status: 'partial', progress: 'Shipping', sent: null, notes: '', landed_costs: [], payments: [], deposit: 0,
      items: [{ id: uid('pol'), kind: 'item', vendor_item_id: 'i-tab2', name: 'Samsung Galaxy Tab A9 (Gen2)', qty: 20, qty_received: 10, unit_cost: 188 }, { id: uid('pol'), kind: 'item', vendor_item_id: 'i-gameshow', name: 'Trivia Gameshow Console', qty: 12, qty_received: 0, unit_cost: 400 }] },
    { id: 'po-193', po_number: 'PO-2026-0193', vendor_id: 'v-edan', order_date: '2026-06-19', expected_date: '2026-07-01', status: 'open', progress: 'Not started', sent: null, notes: 'VS8 BP device kits (group line).', landed_costs: [], payments: [], deposit: 0,
      items: [{ id: uid('pol'), kind: 'group', group_id: 'g-vs8bp', name: 'VS8 BP Device Kit', qty: 5, qty_received: 0, members: [{ vendor_item_id: 'i-bpdev', name: 'VS8 BP Device', per_group: 1, unit_cost: 210 }, { vendor_item_id: 'i-bphose', name: 'BP Hose', per_group: 1, unit_cost: 11.5 }, { vendor_item_id: 'i-spo2', name: 'SPO2 Sensor', per_group: 1, unit_cost: 34 }] }] },
    { id: 'po-194', po_number: 'PO-2026-0194', vendor_id: 'v-accutor', order_date: '2026-06-20', expected_date: '2026-07-03', status: 'open', progress: 'Not started', sent: null, notes: '', landed_costs: [], payments: [], deposit: 1147.5,
      items: [{ id: uid('pol'), kind: 'item', vendor_item_id: 'i-accutor', name: 'Accutor BP Monitor', qty: 18, qty_received: 0, unit_cost: 255 }] },
  );
  db.salesOrders.push(
    { id: 'so-150', so_number: 'SO-2026-0150', recipient_type: 'facility', recipient_id: 'f-oak', ship_to_type: 'facility', regional_id: null, facility_id: 'f-oak', order_date: '2026-06-20', expected_date: '2026-06-27', delivery_method: 'Freight', shipping_address: 'Oakwood SNF · 12 Oak Ln, Jackson, NJ 08527', shipping_cost: 110, landed_costs: [], status: 'draft', notes: '', backorder_of: null, attachments: [], groups: [],
      items: [{ kind: 'item', vendor_item_id: 'i-tab2', name: 'Samsung Galaxy Tab A9 (Gen2)', facility_id: 'f-oak', qty: 6, qty_shipped: 0, shipped_cost_total: 0, unit_cost: 188 }, { kind: 'item', vendor_item_id: 'i-cable-usb', name: 'USB-C Cable', facility_id: 'f-oak', qty: 6, qty_shipped: 0, shipped_cost_total: 0, unit_cost: 6 }] },
    { id: 'so-151', so_number: 'SO-2026-0151', recipient_type: 'regional', recipient_id: 'reg-ana', ship_to_type: 'regional', regional_id: 'reg-ana', facility_id: 'f-oak', order_date: '2026-06-21', expected_date: '2026-06-28', delivery_method: 'Courier', shipping_address: 'Ana Reyes · 9 Central Plaza, Freehold, NJ 07728', shipping_cost: 60, landed_costs: [], status: 'in_progress', notes: '', backorder_of: null, attachments: [], groups: [],
      items: [{ kind: 'item', vendor_item_id: 'i-basket2', name: 'Supply Basket (Large)', facility_id: 'f-oak', qty: 10, qty_shipped: 0, shipped_cost_total: 0, unit_cost: 33 }] },
    { id: 'so-152', so_number: 'SO-2026-0152', recipient_type: 'employee', recipient_id: 'u-dana', ship_to_type: 'facility', regional_id: null, facility_id: 'f-oak', order_date: '2026-06-21', expected_date: '2026-06-25', delivery_method: 'Courier', shipping_address: 'Oakwood SNF · 12 Oak Ln, Jackson, NJ 08527', shipping_cost: 0, landed_costs: [], status: 'in_progress', notes: '', backorder_of: null, attachments: [], groups: [],
      items: [{ kind: 'item', vendor_item_id: 'i-laptop2', name: 'HP ProBook Laptop', facility_id: 'f-oak', qty: 1, qty_shipped: 0, shipped_cost_total: 0, unit_cost: 860 }] },
    { id: 'so-153', so_number: 'SO-2026-0153', recipient_type: 'facility', recipient_id: 'f-harbor', ship_to_type: 'facility', regional_id: null, facility_id: 'f-harbor', order_date: '2026-06-22', expected_date: '2026-07-05', delivery_method: 'Freight', shipping_address: 'Harborview Care · 5 Harbor Rd, Long Branch, NJ 07740', shipping_cost: 130, landed_costs: [], status: 'draft', notes: '', backorder_of: null, attachments: [], groups: [],
      items: [{ kind: 'group', group_id: 'g-cta', name: 'CTA Cart Kit', facility_id: 'f-harbor', qty: 3, qty_shipped: 0, shipped_cost_total: 0, members: [{ vendor_item_id: 'i-edancart', name: 'EDAN Cart Frame', per_group: 1 }, { vendor_item_id: 'i-key', name: 'CTA Cart Key', per_group: 1 }, { vendor_item_id: 'i-basket2', name: 'Supply Basket (Large)', per_group: 1 }] }] },
  );
  db.assemblyTypes = [
    { id: 'at-edan', name: 'EDAN cart' },
    { id: 'at-vs8', name: 'VS8 cart' },
    { id: 'at-accutor', name: 'Accutor cart' },
  ];
  db.assemblies = [
    { id: 'asm-vs8', sku: '100027', name: 'VS8 Cart', assembly_kind: 'cart', assembly_type_id: 'at-vs8', is_active: true, is_assembly: true,
      composition: [{ kind: 'group', ref_id: 'g-cta', qty: 1 }, { kind: 'group', ref_id: 'g-vs8bp', qty: 1 }, { kind: 'item', ref_id: 'i-tab2', qty: 1 }],
      asset_defaults: { cart_type: 'CTA Cart', key_type: 'CTA Key', bp_device: 'VS8' } },
    { id: 'asm-edan', sku: '100028', name: 'EDAN Cart', assembly_kind: 'cart', assembly_type_id: 'at-edan', is_active: true, is_assembly: true,
      composition: [{ kind: 'group', ref_id: 'g-cta', qty: 1 }, { kind: 'item', ref_id: 'i-tab', qty: 1 }],
      asset_defaults: { cart_type: 'EDAN Cart', key_type: 'EDAN Key', bp_device: '—' } },
    { id: 'asm-accutor', sku: '100029', name: 'Accutor Cart', assembly_kind: 'cart', assembly_type_id: 'at-accutor', is_active: true, is_assembly: true,
      composition: [{ kind: 'group', ref_id: 'g-cta', qty: 1 }, { kind: 'item', ref_id: 'i-accutor', qty: 1 }],
      asset_defaults: { cart_type: 'Accutor Cart', key_type: 'Accutor Key', bp_device: 'Accutor' } },
    // Single-item assemblies (no parts to put together) — assembling = entering the unit's info.
    { id: 'asm-laptop', sku: '100030', name: 'Dell Latitude Laptop', assembly_kind: 'single', source_item_id: 'i-laptop', assembly_type_id: '', is_active: true, is_assembly: true, composition: [], asset_defaults: {}, fields: ['RAM', 'Make / Company', 'Price', 'Serial No.'] },
    { id: 'asm-laptop2', sku: '100031', name: 'HP ProBook Laptop', assembly_kind: 'single', source_item_id: 'i-laptop2', assembly_type_id: '', is_active: true, is_assembly: true, composition: [], asset_defaults: {}, fields: ['RAM', 'Make / Company', 'Price', 'Serial No.'] },
    { id: 'asm-gameshow', sku: '100032', name: 'Trivia Gameshow Console', assembly_kind: 'single', source_item_id: 'i-gameshow', assembly_type_id: '', is_active: true, is_assembly: true, composition: [], asset_defaults: {}, fields: ['Make / Company', 'Price', 'Serial No.'] },
    { id: 'asm-trivia', sku: '100033', name: 'Trivia Machine (Portable)', assembly_kind: 'single', source_item_id: 'i-trivia', assembly_type_id: '', is_active: true, is_assembly: true, composition: [], asset_defaults: {}, fields: ['Make / Company', 'Price', 'Serial No.'] },
  ];
  db.poDraft = [];
  db.items.push(
    { id: 'i-charger', sku: '100030', name: 'USB-C Charger 45W', vendor_id: 'v-techsource', item_type_id: 't-cable', cost: 18.0, threshold: 60, bin_location: 'B-12', is_active: true, lots: mkLots([{ q: 150, c: 17.0, d: '2026-06-05' }]) },
    { id: 'i-screen', sku: '100031', name: 'Tablet Screen Protector', vendor_id: 'v-techsource', item_type_id: 't-mount', cost: 5.0, threshold: 50, bin_location: 'A-17', is_active: true, lots: mkLots([{ q: 30, c: 4.5, d: '2026-06-05' }]) },
    { id: 'i-wipes', sku: '100032', name: 'Sanitizing Wipes (tub)', vendor_id: 'v-basketco', item_type_id: 't-basket', cost: 7.0, threshold: 40, bin_location: 'B-13', is_active: true, lots: mkLots([{ q: 25, c: 6.5, d: '2026-06-08' }]) },
  );
  const _oak = db.facilities.find((f) => f.id === 'f-oak'); if (_oak) _oak._new_ship = true;
  const _harbor = db.facilities.find((f) => f.id === 'f-harbor'); if (_harbor) _harbor._new_onb = true;
  db.regionalSchedule.push({ date: '2026-06-25', label: 'New: cart audit — Cedar Grove', new: true });
  db.cartReceipts.push({ id: 'rcpt-1', facility_id: 'f-maple', shipped_qty: 8, shipment_date: '2026-06-16', received_on: '2026-06-16', bol_name: 'BOL-Maple-carts.pdf', photos: ['maple-dock-1.jpg', 'maple-dock-2.jpg'], _new: true });
  db.vendorBills.push({ id: 'BILL-1001', vendor_id: 'v-medcarts', po_number: 'PO-2026-0188', receiving_no: 'RO-2026-0042', total: 3200, created_at: '2026-06-12T09:30:00', lines: [{ name: 'Care Cart — Standard', qty: 5, unit_cost: 640, landed: 0 }] });
  db.emails.push(
    { id: 'em-1', kind: 'PO to vendor', to: 'orders@medcarts.com', cc: '', subject: 'Purchase Order PO-2026-0188', at: '2026-06-08T10:00:00' },
    { id: 'em-2', kind: 'Customer order', to: 'rosa.diaz@carease.com', cc: '', subject: 'Shipped — SO-2026-0142', at: '2026-06-14T15:00:00' },
  );
  db.returns.push(
    { id: 'ret-1', ret_no: 'RET-2026-0041', source_type: 'facility', source_id: 'f-maple', source_label: 'Maple SNF', so_ref: 'SO-2026-0142', assets: [{ key: 'fa:seed1', kind: 'facility', label: 'Care Cart — Standard x2', asset_tag: 'CRT-A-0188', cost: 0 }], status: 'in_transit', refund_total: 0, replacement_charge: 0, created_at: '2026-06-15T09:00:00', received_at: null },
    { id: 'ret-2', ret_no: 'RET-2026-0040', source_type: 'employee', source_id: 'u-omar', source_label: 'Omar Vance', so_ref: '', assets: [{ key: 'ua:seed1', kind: 'trivia', label: 'Trivia Machine (Portable) · Omar Vance', asset_tag: 'TRV-U-3002', cost: 350 }], status: 'received', refund_total: 350, replacement_charge: 0, created_at: '2026-06-13T10:00:00', received_at: '2026-06-14T12:00:00', charge_facility: '' },
  );
  db.activity = [
    { id: 'ac-1', at: '2026-06-16T08:10:00', text: 'New facility added: Oakwood SNF', new: true },
    { id: 'ac-2', at: '2026-06-16T08:25:00', text: 'Cart shipment scheduled: Oakwood SNF (6 carts)', new: true },
    { id: 'ac-3', at: '2026-06-15T16:40:00', text: 'Return RET-2026-0041 started from Maple SNF', new: true },
    { id: 'ac-4', at: '2026-06-14T15:02:00', text: 'Shipped SO-2026-0142 to Maple SNF', new: false },
    { id: 'ac-5', at: '2026-06-12T09:31:00', text: 'Received PO-2026-0188 -> RO-2026-0042', new: false },
    { id: 'ac-6', at: '2026-06-11T10:12:00', text: 'Adjusted stock: Supply Basket +5 (cycle count)', new: false },
    { id: 'ac-7', at: '2026-06-10T13:00:00', text: 'Built VS8 Cart CART-V-0001', new: false },
    { id: 'ac-8', at: '2026-06-08T10:00:00', text: 'Vendor added: EDAN Medical', new: false },
  ];
  db.notifications = [
    { id: 'n-1', kind: 'inventory', title: 'Low stock alert', body: 'Care Cart — Standard is low (7 of 10 threshold). Consider reordering.', at: '2026-06-16T08:30:00', read: false, route: '/inventory' },
    { id: 'n-2', kind: 'po', title: 'Deposit pending', body: 'A deposit is pending on PO-2026-0191 (EDAN Medical).', at: '2026-06-16T08:05:00', read: false, route: '/purchase-orders' },
    { id: 'n-3', kind: 'dashboard', title: 'Cart shipment scheduled', body: '8 carts scheduled to ship to Maple SNF on 2026-06-16.', at: '2026-06-15T17:20:00', read: false, route: '/' },
    { id: 'n-4', kind: 'so', title: 'Back order ready', body: 'A back order is ready to ship — items are back in stock.', at: '2026-06-15T14:10:00', read: false, route: '/sales-orders' },
    { id: 'n-5', kind: 'returns', title: 'Return received', body: 'RET-2026-0040 received from Omar Vance — $350 refunded.', at: '2026-06-14T12:05:00', read: true, route: '/returns' },
    { id: 'n-6', kind: 'so', title: 'BOL uploaded', body: 'BOL uploaded to SO-2026-0142 (Maple SNF).', at: '2026-06-14T09:00:00', read: true, route: '/sales-orders' },
    { id: 'n-7', kind: 'dashboard', title: 'New facility onboarding', body: 'Harborview Care onboarding scheduled for 2026-07-02.', at: '2026-06-13T11:00:00', read: false, route: '/' },
    { id: 'n-8', kind: 'po', title: 'Vendor terms updated', body: 'EDAN Medical payment terms changed to Net 60.', at: '2026-06-12T15:30:00', read: true, route: '/purchase-orders' },
    { id: 'n-9', kind: 'assets', title: 'Asset assigned', body: 'Dell Latitude Laptop assigned to Carl Chen (Maple SNF).', at: '2026-06-10T10:20:00', read: true, route: '/assets' },
    { id: 'n-10', kind: 'inventory', title: 'Low stock alert', body: 'Sanitizing Wipes (tub) is low (25 of 40 threshold).', at: '2026-06-09T16:00:00', read: false, route: '/inventory' },
  ];
  db.counters.sku = 100034; db.counters.po = 194; db.counters.so = 153; db.counters.cart = 193; db.counters.asset = 2212; db.counters.ret = 41; db.counters.vbill = 1;
  // Fresh-data mode for the supervisor: no seeded Purchase Orders / Sales Orders / Returns (and their generated bills, shipments, emails).

  // normalize qty_onhand/qty_available from lots
  // Amendment: ONLY assemblies are assets. Raw laptops / trivia / gameshows are "assembly-only" parts:
  // they sit in inventory and can only leave the warehouse after being assembled into a tracked unit.
  const ASSEMBLY_ONLY_TYPES = ['t-laptop', 't-trivia', 't-gameshow'];
  db.items.forEach((it) => { const q = it.lots.reduce((s, l) => s + l.qty, 0); it.qty_onhand = q; it.qty_available = q; if (it.assembly_only === undefined) it.assembly_only = ASSEMBLY_ONLY_TYPES.includes(it.item_type_id); it.is_tracked_asset = false; });
  // V6 INV-2: the "master" full-cart groups can only ship as an assembly; their member parts still ship loose.
  ['g-edanstarter', 'g-facility'].forEach((id) => { const g = db.groups.find((x) => x.id === id); if (g) g.assembly_only = true; });
  (db.groups || []).forEach((g) => { if (g.assembly_only === undefined) g.assembly_only = false; });
  // V6 CA + Q2: every assembled cart unit carries a condition (New vs Refurbished) and a real cart type.
  (db.carts || []).forEach((c) => { if (c.condition === undefined) c.condition = 'New'; if (c.cart_type === 'Standard') c.cart_type = 'EDAN Cart';
    // V4 SO-4: a warehouse cart with no assembly link was invisible to every assembly pool (read as 0 available). Tie it to a real pool so availability reflects real stock.
    if (!c.assembly_id && c.location === 'Warehouse') { c.assembly_id = 'asm-edan'; c.unit_kind = c.unit_kind || 'cart'; } });

  // ---- Real Asset Registry (seeded from the Cart List inventory) ----
  // Adheres to the amendment: a Cart is a cart-assembly (assigned to a Facility + Regional);
  // every IT class is a single-item assembly (assigned to an Employee). Holder is Employee or Facility only.
  db.assetClasses = ASSET_CLASSES;
  let _an = 0;
  const mkA = (klass, rec) => ({ id: 'as-' + (++_an), klass, ...rec });
  db.assets = [];
  (assetSeed.carts || []).forEach((r) => db.assets.push(mkA('cart', r)));
  (assetSeed.laptops || []).forEach((r) => db.assets.push(mkA('laptop', r)));
  (assetSeed.laptops_old || []).forEach((r) => db.assets.push(mkA('laptop', { ...r, legacy: true })));
  (assetSeed.gameshows || []).forEach((r) => db.assets.push(mkA('gameshow', r)));
  (assetSeed.tablets || []).forEach((r) => db.assets.push(mkA('tablet', r)));
  (assetSeed.monitors || []).forEach((r) => db.assets.push(mkA('monitor', r)));
  (assetSeed.desktops || []).forEach((r) => db.assets.push(mkA('desktop', r)));
  (assetSeed.cellphones || []).forEach((r) => db.assets.push(mkA('cellphone', r)));
  (assetSeed.ezpass || []).forEach((r) => db.assets.push(mkA('ezpass', r)));
  db.terminatedEmployees = (assetSeed.terminated_employees || []).map((t, i) => ({ id: 'te-' + (i + 1), ...t }));
  db.counters.asn = _an;
  if (!SEED_TX) {
    // Transactions
    db.purchaseOrders = []; db.salesOrders = []; db.returns = [];
    db.vendorBills = []; db.shipments = []; db.shipQueue = []; db.emails = [];
    // Inventory (single items, groups, assembly definitions)
    db.items = []; db.groups = []; db.assemblies = [];
    // Assets (built units + the asset registry + tracked/facility/user assets + recovery)
    db.carts = []; db.assets = []; db.trackedAssets = []; db.facilityAssets = []; db.userAssets = [];
    db.terminatedEmployees = [];
    // Logs / receipts / dashboard noise tied to demo data
    db.stockLogs = []; db.cartReceipts = []; db.notifications = []; db.activity = [];
    db.counters.po = 0; db.counters.so = 0; db.counters.ret = 0; db.counters.ship = 0; db.counters.vbill = 0; db.counters.cart = 0;
    // Kept (master data + config the supervisor builds against): vendors, facilities, regionals, users,
    // itemTypes, assemblyTypes, assetClasses, roles/capabilities, settings.
  }
  return db;
}

function hydrate() {
  const base = seed();
  try {
    const raw = sessionStorage.getItem(SKEY);
    // Merge persisted state OVER a fresh seed so any newly-added fields always exist (resilient to version upgrades).
    if (raw) { const p = JSON.parse(raw); return { ...base, ...p, counters: { ...base.counters, ...(p.counters || {}) } }; }
  } catch (e) { /* ignore */ }
  return base;
}

export const useWarehouseStore = defineStore('warehouse', {
  state: () => hydrate(),
  getters: {
    // ---- Real Asset Registry getters ----
    assetClassList(s) { return s.assetClasses || []; },
    // A1/S8: every assembled cart IS a tracked asset. The Assets ▸ Carts registry reads the live `carts`
    // collection (single source of truth) so a freshly built cart appears immediately, and a shipped cart
    // carries over to its facility/holder automatically (carts already update on ship/return). Other
    // asset classes (laptop, tablet, …) still read the seeded asset registry.
    cartToAssetRow(s) {
      return (c) => {
        const fac = c.facility_id ? this.facilityById(c.facility_id) : null;
        const reg = c.regional_id ? this.regionalById(c.regional_id) : (fac ? this.regionalById(fac.regional_id) : null);
        let holder_type = '', holder = '';
        if (c.location === 'Facility') { holder_type = 'facility'; holder = fac ? fac.name : ''; }
        else if (c.location === 'Assigned') { holder_type = 'employee'; holder = c.assigned_user || ''; }
        const smap = { Available: 'In Warehouse', Assigned: (c.location === 'Facility' ? 'Deployed' : 'Assigned') };
        return {
          id: c.id, klass: 'cart', code: c.code, holder_type, holder, emp_state: '',
          status: c.status ? (smap[c.status] || c.status) : 'In Warehouse',
          cart_type: c.cart_type || '', bp_machine: c.bp_device || '', key: c.key_type || '',
          tablet_type: (c.fields && c.fields.tablet_type) || '', tablet_number: c.tablet_number || '',
          clini_omni: '', basket_type: '', lte: '', regional: reg ? reg.name : (c.regional || ''),
          condition: c.condition || 'New', refurbished: !!c.refurbished, ready: c.ready !== false, cost: c.cost || 0, fields: c.fields || {}, _cart: true,
        };
      };
    },
    assetsOf(s) { return (klass) => klass === 'cart' ? (s.carts || []).map((c) => this.cartToAssetRow(c)) : (s.assets || []).filter((a) => a.klass === klass); },
    assetClassCount(s) { return (klass) => klass === 'cart' ? (s.carts || []).length : (s.assets || []).filter((a) => a.klass === klass).length; },
    assetTotal(s) { return (s.assets || []).filter((a) => a.klass !== 'cart').length + (s.carts || []).length; },
    assetClassMeta(s) { return (klass) => (s.assetClasses || []).find((c) => c.id === klass) || { id: klass, label: klass, cols: [] }; },
    assetStatusOptions() { return ['In Warehouse', 'Deployed', 'Assigned', 'Out of Service', 'Incomplete', 'Retired', 'Return Pending', 'Returned', 'Active', 'Deactivated']; },
    assetCountByStatus(s) { return (klass, status) => {
      const fromAssets = (s.assets || []).filter((a) => a.klass !== 'cart' && (!klass || a.klass === klass) && a.status === status).length;
      const fromCarts = (!klass || klass === 'cart') ? (s.carts || []).map((c) => this.cartToAssetRow(c)).filter((a) => a.status === status).length : 0;
      return fromAssets + fromCarts;
    }; },
    terminatedList(s) { return s.terminatedEmployees || []; },
    assetsForEmployee(s) { return (name) => (s.assets || []).filter((a) => a.holder_type === 'employee' && (a.holder || '') === name); },
    // assets that still need to be recovered from a terminated employee (amendment-aligned returns)
    assetsToRecover(s) {
      const term = new Set((s.terminatedEmployees || []).map((t) => (t.name || '').toLowerCase()));
      return (s.assets || []).filter((a) => a.holder_type === 'employee' && a.status !== 'Returned' && (a.terminated || term.has((a.holder || '').toLowerCase())));
    },
    // ---- Equipment Map: facilities (carts deployed there) + staff (their equipment) ----
    mapFacilities(s) {
      const byName = new Map();
      (s.assets || []).forEach((a) => { if (a.klass === 'cart' && a.holder_type === 'facility' && a.holder) { if (!byName.has(a.holder)) byName.set(a.holder, []); byName.get(a.holder).push(a); } });
      // A1/S8: also show live carts that have been shipped to a facility (tracked in `carts`), so the map reflects real deployments.
      (s.carts || []).forEach((c) => { if (c.location === 'Facility' && c.facility_id) { const fac = this.facilityById(c.facility_id); const nm = fac ? fac.name : null; if (!nm) return; if (!byName.has(nm)) byName.set(nm, []); byName.get(nm).push(this.cartToAssetRow(c)); } });
      const out = [];
      byName.forEach((carts, name) => {
        const geo = geoForFacility(name);
        const regCount = {}; carts.forEach((c) => { const r = c.regional || '—'; regCount[r] = (regCount[r] || 0) + 1; });
        const regional = Object.keys(regCount).sort((x, y) => regCount[y] - regCount[x])[0] || '—';
        const statusCounts = {}; carts.forEach((c) => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });
        out.push({ id: 'fac-' + out.length, name, regional, state: geo.state, city: geo.city, lat: geo.lat, lng: geo.lng, cartCount: carts.length, statusCounts, carts });
      });
      if (!out.length) return eastCoastDemoFacilities(); // V5 MAP — east-coast demo pins when no real carts are deployed yet
      return out.sort((a, b) => b.cartCount - a.cartCount);
    },
    mapStates() { return [...new Set(this.mapFacilities.map((f) => f.state))].sort(); },
    mapRegionals() { return [...new Set(this.mapFacilities.map((f) => f.regional))].filter((r) => r && r !== '—').sort(); },
    staffWithEquipment(s) {
      const by = new Map();
      (s.assets || []).forEach((a) => { if (a.holder_type !== 'employee' || !a.holder) return; if (!by.has(a.holder)) by.set(a.holder, { name: a.holder, state: a.emp_state || '', items: [] }); const rec = by.get(a.holder); if (!rec.state && a.emp_state) rec.state = a.emp_state; rec.items.push({ klass: a.klass, code: a.code, status: a.status }); });
      const list = [...by.values()];
      if (!list.length) return eastCoastDemoStaff().sort((a, b) => a.name.localeCompare(b.name)); // demo team when no real staff records yet
      return list.sort((a, b) => a.name.localeCompare(b.name));
    },
    staffInState() { return (st) => this.staffWithEquipment.filter((u) => u.state === st); },
    // For the prototype: guarantee at least 2 people per facility so the data presents itself.
    // Real state records are used first; if fewer than 2, deterministic demo people (clearly flagged) fill in.
    // In production this returns the actual employees assigned to each facility.
    facilityStaff() {
      const pool = ['Ava R.', 'Liam K.', 'Maya T.', 'Noah P.', 'Sofia G.', 'Ethan B.', 'Zoe M.', 'Owen L.', 'Nia S.', 'Eli C.', 'Iris W.', 'Leo D.'];
      return (f) => {
        const real = this.staffInState(f.state);
        if (real.length >= 2) return real;
        let h = 0; const str = String((f && (f.name || f.id)) || 'x'); for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
        const demos = [];
        for (let i = 0; i < 2 - real.length; i++) {
          const nm = pool[(h + i * 7) % pool.length];
          demos.push({ name: nm, state: f.state, placeholder: true, items: [ { klass: 'laptop', code: 'LT-' + (1000 + ((h + i) % 8999)), status: 'Assigned' }, { klass: 'cellphone', code: 'P-' + (100 + ((h + i * 3) % 800)), status: 'Assigned' } ] });
        }
        return [...real, ...demos];
      };
    },
    vendorName: (s) => { const m = new Map(s.vendors.map((v) => [v.id, v])); return (id) => (m.get(id) || {}).name || '—'; },
    typeName: (s) => (id) => (s.itemTypes.find((t) => t.id === id) || {}).name || '—',
    itemById: (s) => { const m = new Map(s.items.map((i) => [i.id, i])); return (id) => m.get(id); },
    groupById: (s) => { const m = new Map(s.groups.map((g) => [g.id, g])); return (id) => m.get(id); },
    facilityById: (s) => (id) => s.facilities.find((f) => f.id === id),
    // X2/S9: facilities that actually have something in transit to them (a shipped/in-progress SO or a
    // shipment not yet delivered). The Cart-Received flow should only offer THESE facilities, never any facility.
    // X1/S7: how many REAL tracked carts were shipped to a facility and not yet acknowledged received.
    cartsInboundTo(s) { return (fid) => (s.carts || []).filter((c) => c.facility_id === fid && c.location === 'Facility' && !c.received).length; },
    facilitiesAwaitingReceipt(s) {
      const ids = new Set();
      (s.shipments || []).forEach((sh) => { if (sh.status !== 'Delivered' && sh.byFacility) Object.keys(sh.byFacility).forEach((fid) => ids.add(fid)); });
      (s.salesOrders || []).forEach((so) => { if (['in_progress', 'shipped'].includes(so.status)) { if (so.facility_id) ids.add(so.facility_id); (so.items || []).forEach((l) => { if (l.facility_id) ids.add(l.facility_id); }); } });
      (s.facilities || []).forEach((f) => { if (f.cart_shipment_date && f.status !== 'Received') ids.add(f.id); });
      return (s.facilities || []).filter((f) => ids.has(f.id));
    },
    regionalById: (s) => (id) => s.regionals.find((r) => r.id === id),
    userById: (s) => (id) => s.users.find((u) => u.id === id),
    providerList: (s) => s.users.filter((u) => u.role === 'Provider'),
    employeeList: (s) => s.users.filter((u) => u.role !== 'Regional Director'),
    isTrackableItem() { return (id) => { const it = this.itemById(id); const t = it && this.itemTypes.find((x) => x.id === it.item_type_id); return !!(t && t.trackable); }; },
    isLaptopItem() { return (id) => { const it = this.itemById(id); return !!(it && it.item_type_id === 't-laptop'); }; },
    isTriviaItem() { return (id) => { const it = this.itemById(id); return !!(it && it.item_type_id === 't-trivia'); }; },
    isEmployeeAssignable() { return (id) => { const it = this.itemById(id); return !!(it && (it.item_type_id === 't-laptop' || it.item_type_id === 't-trivia')); }; },
    // effective FIFO unit cost = oldest lot (base + landed); used for SO locked price
    fifoUnitCost() { return (id) => { const it = this.itemById(id); if (!it || !it.lots.length) return it ? it.cost : 0; const lot = it.lots[0]; return r2(lot.unit_cost + (lot.landed || 0)); }; },
    // group on-hand = how many full groups can be built from current stock
    groupOnHand() {
      return (id) => {
        const exp = this.expandGroup(id, 1); const ks = Object.keys(exp);
        if (!ks.length) return 0;
        return Math.floor(Math.min(...ks.map((k) => { const it = this.itemById(k); return it ? (it.qty_onhand || 0) / exp[k] : 0; })));
      };
    },
    // --- V4 Item Types: assemblies + tracked-asset helpers ---
    assemblyById(s) { const m = new Map((s.assemblies || []).map((a) => [a.id, a])); return (id) => m.get(id); },
    assemblyTypeName(s) { return (id) => ((s.assemblyTypes || []).find((t) => t.id === id) || {}).name || '—'; },
    itemAssemblyOnly() { return (id) => { const it = this.itemById(id); return !!(it && it.assembly_only); }; },
    itemIsAsset() { return () => false; }, // amendment: a single is never an asset
    isSingleAssembly(s) { return (defId) => { const a = this.assemblyById(defId); return !!(a && a.assembly_kind === 'single'); }; },
    expandAssembly() {
      return (defId, mult = 1) => {
        const a = this.assemblyById(defId); const out = {};
        if (!a) return out;
        if (a.assembly_kind === 'single') { if (a.source_item_id) out[a.source_item_id] = (out[a.source_item_id] || 0) + mult; return out; }
        (a.composition || []).forEach((m) => {
          if (m.kind === 'group') { const sub = this.expandGroup(m.ref_id, mult * m.qty); Object.keys(sub).forEach((k) => { out[k] = (out[k] || 0) + sub[k]; }); }
          else { out[m.ref_id] = (out[m.ref_id] || 0) + m.qty * mult; }
        });
        return out;
      };
    },
    assemblyUnitCost() { return (defId) => { const exp = this.expandAssembly(defId, 1); return r2(Object.keys(exp).reduce((s, k) => s + exp[k] * this.fifoUnitCost(k), 0)); }; },
    assemblyBuildable() { return (defId) => { const exp = this.expandAssembly(defId, 1); const ks = Object.keys(exp); if (!ks.length) return 0; return Math.floor(Math.min(...ks.map((k) => { const it = this.itemById(k); return it ? (it.qty_onhand || 0) / exp[k] : 0; }))); }; },
    availableUnits(s) { return (defId) => (s.carts || []).filter((c) => c.assembly_id === defId && c.location === 'Warehouse' && !(c.condition === 'Refurbished' && c.ready === false)); },
    refurbAwaitingQC(s) { return (s.carts || []).filter((c) => c.condition === 'Refurbished' && c.ready === false); }, // R3
    // V6 CA/SO-5: pick from a specific pool — New vs Refurbished — never auto-mixed.
    availableUnitsByCondition(s) { return (defId, condition) => (s.carts || []).filter((c) => c.assembly_id === defId && c.location === 'Warehouse' && (!condition || (c.condition || 'New') === condition) && !(c.condition === 'Refurbished' && c.ready === false)); },
    refurbCreditRate(s) { return (s.settings && s.settings.refurbCreditRate != null) ? s.settings.refurbCreditRate : 0.8; },
    // V6 CA-3: the refund logic — how much we credit the facility on return, and what the refurbished cart is then worth.
    // Placeholder until the real refund formula is provided; swap this one function and the whole app follows.
    refurbishedValue() { return (bookCost) => r2(Math.max(0, (Number(bookCost) || 0) * this.refurbCreditRate)); },
    groupAssemblyOnly(s) { return (id) => { const g = (s.groups || []).find((x) => x.id === id); return !!(g && g.assembly_only); }; },
    // V4 OQ2: real Cart Type / Key / BP suggestions drawn from the carts + assemblies actually in the system — editable, no fictional values.
    cartTypeOptions(s) { const set = new Set(); (s.carts || []).forEach((c) => { if (c.cart_type) set.add(c.cart_type); }); (s.assemblies || []).forEach((a) => { if (a.asset_defaults && a.asset_defaults.cart_type) set.add(a.asset_defaults.cart_type); }); (s.assemblyTypes || []).forEach((t) => { if (t.name) set.add(t.name); }); return [...set].sort(); },
    keyTypeOptions(s) { const set = new Set(); (s.carts || []).forEach((c) => { if (c.key_type) set.add(c.key_type); }); (s.assemblies || []).forEach((a) => { if (a.asset_defaults && a.asset_defaults.key_type) set.add(a.asset_defaults.key_type); }); return [...set].sort(); },
    bpDeviceOptions(s) { const set = new Set(); (s.carts || []).forEach((c) => { if (c.bp_device && c.bp_device !== '\u2014') set.add(c.bp_device); }); (s.assemblies || []).forEach((a) => { if (a.asset_defaults && a.asset_defaults.bp_device && a.asset_defaults.bp_device !== '\u2014') set.add(a.asset_defaults.bp_device); }); (s.items || []).forEach((i) => { if (i.attrs && i.attrs.bp_device) set.add(i.attrs.bp_device); }); return [...set].sort(); },
    // V6 SO-4: one robust availability number per SO line (assembly -> built units; group -> min member; item -> on hand).
    soLineAvailable() { return (l) => this.soLineMaxShippable(l); },
    shippingQueue(s) { return s.shipQueue || []; },
    availableAssetUnits(s) { return (itemName) => (s.trackedAssets || []).filter((a) => a.status === 'In warehouse' && (!itemName || a.item === itemName)); },
    // unified catalog: single items + groups, all behaving as "items" in one searchable list
    catalog(s) {
      const singles = s.items.map((i) => ({ id: i.id, kind: 'item', sku: i.sku, name: i.name, is_group: false, is_active: i.is_active, on_hand: i.qty_onhand, bin: i.bin_location, image: i.image || '', type: this.typeName(i.item_type_id), unit_cost: this.fifoUnitCost(i.id) }));
      const grps = s.groups.map((g) => ({ id: g.id, kind: 'group', sku: g.sku, name: g.name, is_group: true, is_active: g.is_active !== false, on_hand: this.groupOnHand(g.id), bin: '— group —', image: g.image || '', type: 'Group', unit_cost: this.groupUnitCost(g.id) }));
      const asms = (s.assemblies || []).map((a) => ({ id: a.id, kind: 'assembly', sku: a.sku, name: a.name, is_group: false, is_assembly: true, is_active: a.is_active !== false, on_hand: this.availableUnits(a.id).length, bin: '— assembly —', type: 'Assembly', unit_cost: this.assemblyUnitCost(a.id) }));
      return [...singles, ...grps, ...asms];
    },
    // lightweight options for searchable pickers (no cost computation → fast typing)
    catalogLite(s) {
      const singles = s.items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, is_group: false, on_hand: i.qty_onhand, image: i.image }));
      const grps = s.groups.map((g) => ({ id: g.id, sku: g.sku, name: g.name, is_group: true, on_hand: this.groupOnHand(g.id), image: g.image }));
      return [...singles, ...grps];
    },
    // SO picker also includes assemblies (built carts you can ship). PO picker keeps catalogLite (parts only).
    catalogShip(s) {
      // assembly-only items (raw laptops/gameshows) cannot be shipped loose — only their assembled units can.
      const singles = s.items.filter((i) => !i.assembly_only).map((i) => ({ id: i.id, sku: i.sku, name: i.name, is_group: false, on_hand: i.qty_onhand, image: i.image }));
      const grps = s.groups.filter((g) => !g.assembly_only).map((g) => ({ id: g.id, sku: g.sku, name: g.name, is_group: true, on_hand: this.groupOnHand(g.id), image: g.image }));
      const asms = (s.assemblies || []).map((a) => ({ id: a.id, sku: a.sku, name: a.name, is_group: false, is_assembly: true, on_hand: this.availableUnits(a.id).length }));
      return [...singles, ...grps, ...asms];
    },
    // R3 SO #1: one unified recipient list (facility / regional / provider / employee)
    recipients(s) {
      const out = [];
      s.facilities.forEach((f) => out.push({ id: 'facility:' + f.id, kind: 'facility', name: f.name, sub: 'Facility · ' + f.city, address: f.name + ' · ' + f.address, facility_id: f.id, regional_id: f.regional_id }));
      s.regionals.forEach((r) => out.push({ id: 'regional:' + r.id, kind: 'regional', name: r.name, sub: 'Regional · ' + r.area, address: r.name + ' · ' + r.address, regional_id: r.id }));
      s.users.filter((u) => u.role === 'Provider').forEach((u) => out.push({ id: 'provider:' + u.id, kind: 'provider', name: u.name, sub: 'Provider · ' + u.facility, address: u.name + ' · ' + u.address, user_id: u.id, facility_name: u.facility }));
      s.users.filter((u) => u.role !== 'Regional Director' && u.role !== 'Provider').forEach((u) => out.push({ id: 'employee:' + u.id, kind: 'employee', name: u.name, sub: u.role + ' · ' + u.facility, address: u.name + ' · ' + u.address, user_id: u.id, facility_name: u.facility }));
      return out;
    },
    calendarEvents(s) {
      const ev = [];
      s.facilities.forEach((f) => {
        if (f.onboard_date) ev.push({ date: f.onboard_date, type: 'onb', label: 'Onboarding · ' + f.name, facility_id: f.id, new: !!f._new_onb });
        if (f.cart_shipment_date) ev.push({ date: f.cart_shipment_date, type: 'ship', label: 'Ship ' + (f.carts_needed || '?') + ' carts · ' + f.name, facility_id: f.id, new: !!f._new_ship });
      });
      s.regionalSchedule.forEach((r) => ev.push({ date: r.date, type: 'reg', label: r.label, new: !!r.new }));
      s.cartReceipts.forEach((r) => { const f = s.facilities.find((x) => x.id === r.facility_id); if (r.received_on) ev.push({ date: r.received_on, type: 'rec', label: 'Received · ' + (f ? f.name : ''), facility_id: r.facility_id, new: !!r._new }); });
      return ev;
    },
    unreadNotifications(s) { return (s.notifications || []).filter((n) => !n.read).length; },
    newActivityCount(s) { return (s.activity || []).filter((a) => a.new).length; },
    lowStockList(s) { return s.items.filter((i) => i.is_active !== false && (i.qty_onhand || 0) <= (i.threshold || 0)); },
  },
  actions: {
    // ---- Real Asset Registry actions ----
    setAssetUnitStatus(id, status) {
      const c = (this.carts || []).find((x) => x.id === id);
      if (c) { const rev = { 'In Warehouse': 'Available', Deployed: 'Assigned', Assigned: 'Assigned' }; c.status = rev[status] || status; this.logActivity('Cart ' + c.code + ' status -> ' + status); return; }
      const a = (this.assets || []).find((x) => x.id === id); if (a) { a.status = status; this.logActivity('Asset ' + a.code + ' status -> ' + status); }
    },
    reassignAsset(id, holder_type, holder) { const a = (this.assets || []).find((x) => x.id === id); if (!a) return; a.holder_type = holder_type || ''; a.holder = holder || ''; a.status = holder ? (holder_type === 'facility' ? 'Deployed' : 'Assigned') : 'In Warehouse'; this.logActivity('Asset ' + a.code + ' reassigned to ' + (holder || 'warehouse')); },
    returnAsset(id, tracking) { const a = (this.assets || []).find((x) => x.id === id); if (!a) return; a.status = 'Returned'; if (tracking) a.return_tracking = tracking; this.logActivity('Asset ' + a.code + ' returned by ' + (a.holder || '—')); },
    // terminated employee -> flag every asset they hold for recovery (then returnAsset finalises it)
    recoverTerminatedAssets(name) { const list = (this.assets || []).filter((a) => a.holder_type === 'employee' && (a.holder || '') === name && a.status !== 'Returned'); list.forEach((a) => { a.status = 'Return Pending'; }); this.logActivity('Recovery started for ' + name + ' (' + list.length + ' asset' + (list.length === 1 ? '' : 's') + ')'); return list.length; },
    // add / edit a tracked asset unit (Warehouse Manager). Holder is employee or facility only.
    addAsset(klass, rec) { this.counters.asn = (this.counters.asn || 0) + 1; const a = { id: 'as-' + this.counters.asn, klass, holder_type: '', holder: '', emp_state: '', status: 'In Warehouse', ...rec }; this.assets.unshift(a); this.logActivity('Asset added: ' + (a.code || a.id) + ' (' + klass + ')'); return a; },
    updateAsset(id, patch) {
      const c = (this.carts || []).find((x) => x.id === id);
      if (c) { const map = { cart_type: 'cart_type', bp_machine: 'bp_device', key: 'key_type', tablet_number: 'tablet_number', code: 'code' }; Object.keys(patch || {}).forEach((k) => { if (map[k]) c[map[k]] = patch[k]; }); this.logActivity('Cart updated: ' + c.code); return c; }
      const a = (this.assets || []).find((x) => x.id === id); if (a) { Object.assign(a, patch); this.logActivity('Asset updated: ' + (a.code || id)); } return a;
    },
    nextAssetCode(klass) { const meta = (this.assetClasses || []).find((c) => c.id === klass) || {}; const pre = meta.prefix || ''; let max = 0; (this.assets || []).filter((a) => a.klass === klass).forEach((a) => { const m = String(a.code || '').match(/(\d+)\s*$/); if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; } }); return (klass === 'cart' ? '' : pre) + String(max + 1).padStart(4, '0'); },
    _sync(item) { const q = item.lots.reduce((s, l) => s + l.qty, 0); item.qty_onhand = q; item.qty_available = q; },
    nextSku() { this.counters.sku += 1; return String(this.counters.sku); },

    // Recursively flatten a group (or item) reference into single-item quantities. Handles nested groups.
    expandGroup(refId, mult = 1, seen = []) {
      const out = {};
      const g = this.groupById(refId);
      if (!g || seen.includes(refId)) return out;
      const members = g.members || [];
      members.forEach((m) => {
        if (m.kind === 'group') {
          const sub = this.expandGroup(m.ref_id, mult * m.qty, [...seen, refId]);
          Object.keys(sub).forEach((k) => { out[k] = (out[k] || 0) + sub[k]; });
        } else {
          out[m.ref_id] = (out[m.ref_id] || 0) + m.qty * mult;
        }
      });
      return out;
    },
    groupUnitCost(refId) { const exp = this.expandGroup(refId, 1); return r2(Object.keys(exp).reduce((s, k) => s + exp[k] * this.fifoUnitCost(k), 0)); },
    // R3 SO group-line helpers: a group is ONE line whose qty scales every member.
    soLineUnitCost(l) { if (l && l.kind === 'assembly') return this.assemblyUnitCost(l.assembly_id); if (l && l.kind === 'group') return r2((l.members || []).reduce((s, m) => s + (Number(m.per_group) || 0) * this.fifoUnitCost(m.vendor_item_id), 0)); return this.fifoUnitCost(l.vendor_item_id); },
    soLineEffective(l, qty) { const q = Number(qty) || 0; if (l && l.kind === 'assembly') return []; if (l && l.kind === 'group') return (l.members || []).map((m) => ({ vendor_item_id: m.vendor_item_id, qty: (Number(m.per_group) || 0) * q })); return [{ vendor_item_id: l.vendor_item_id, qty: q }]; },
    // max units/groups this line can actually ship given current stock (the store self-protects against over-shipping)
    soLineMaxShippable(l) { if (l && l.kind === 'assembly') return this.availableUnits(l.assembly_id).length; if (l && l.kind === 'group') { const ms = l.members || []; if (!ms.length) return 0; return Math.floor(Math.min(...ms.map((m) => { const it = this.itemById(m.vendor_item_id); return (it ? (it.qty_onhand || 0) : 0) / (Number(m.per_group) || 1); }))); } const it = this.itemById(l.vendor_item_id); return it ? (it.qty_onhand || 0) : 0; },

    logStock(vendor_item_id, kind, qty, source_label, ref, reason) {
      this.stockLogs.unshift({ id: uid('l'), vendor_item_id, kind, qty: Math.abs(qty), source_label, ref: ref || null, reason: reason || null, created_at: new Date().toISOString() });
    },
    addLot(item, qty, unit_cost, landed, ref) {
      item.lots.push({ id: uid('lot'), qty, unit_cost: r2(unit_cost), landed: r2(landed || 0), received_at: TODAY, ref: ref || null });
      this._sync(item);
    },
    // FIFO issue: consume oldest lots first, capturing their locked-in cost (base + landed).
    issueFIFO(item_id, qty) {
      const it = this.itemById(item_id); if (!it) return { lines: [], baseTotal: 0, landedTotal: 0, total: 0, qty: 0 };
      let need = qty; const lines = []; let baseTotal = 0, landedTotal = 0;
      for (const lot of it.lots) {
        if (need <= 0) break;
        const take = Math.min(lot.qty, need);
        if (take <= 0) continue;
        lines.push({ qty: take, unit_cost: lot.unit_cost, landed: lot.landed || 0 });
        baseTotal += take * lot.unit_cost; landedTotal += take * (lot.landed || 0); need -= take; lot.qty -= take;
      }
      it.lots = it.lots.filter((l) => l.qty > 0);
      this._sync(it);
      return { lines, baseTotal: r2(baseTotal), landedTotal: r2(landedTotal), total: r2(baseTotal + landedTotal), qty: qty - need };
    },
    // Adjust Stock (R2 Inventory #4): add or remove total on hand, mandatory reason, no FIFO option exposed.
    adjustStock(item, delta, reason) {
      if (delta >= 0) { this.addLot(item, delta, item.cost, 0, 'Manual adding'); this.logStock(item.id, 'in', delta, 'Manual adding', null, reason); }
      else { const r = this.issueFIFO(item.id, -delta); this.logStock(item.id, 'out', -delta, 'Manual removal', null, reason); return r; }
    },

    // ---- Inventory items / groups ----
    addItem({ name, vendor_id, item_type_id, cost, qty_onhand, threshold, bin_location, is_active, assembly_only, image }) {
      const q = Number(qty_onhand) || 0;
      const it = { id: uid('i'), sku: this.nextSku(), name, vendor_id: vendor_id || '', item_type_id: item_type_id || '', cost: Number(cost) || 0, threshold: Number(threshold) || 0, bin_location: bin_location || '', is_active: is_active !== false, assembly_only: !!assembly_only, image: image || '', is_tracked_asset: false, lots: [] };
      if (q > 0) it.lots.push({ id: uid('lot'), qty: q, unit_cost: Number(cost) || 0, landed: 0, received_at: TODAY, ref: 'opening' });
      it.qty_onhand = q; it.qty_available = q; this.items.unshift(it); return it;
    },
    updateItem(id, patch) { const it = this.itemById(id); if (it) Object.assign(it, patch); },
    deactivateItem(id) { const it = this.itemById(id); if (it) it.is_active = false; const g = this.groupById(id); if (g) g.is_active = false; },
    addGroup({ name, description, members, assembly_only, vendor_id, image }) { const g = { id: uid('g'), sku: this.nextSku(), name, description: description || '', vendor_id: vendor_id || '', image: image || '', is_active: true, is_group: true, assembly_only: !!assembly_only, members: members || [] }; this.groups.unshift(g); return g; },
    updateGroup(id, patch) { const g = this.groupById(id); if (g) Object.assign(g, patch); },

    // ---- Purchase Orders ----
    nextPoNumber() { this.counters.po += 1; return 'PO-2026-' + String(this.counters.po).padStart(4, '0'); },
    nextSoNumber() { this.counters.so += 1; return 'SO-2026-' + String(this.counters.so).padStart(4, '0'); },
    addVendor({ name, email, pay_terms, deposit_percent }) { const v = { id: uid('v'), name, email: email || '', pay_terms: pay_terms || 'Net 30', deposit_percent: Number(deposit_percent) || 0 }; this.vendors.push(v); return v; },
    updateVendor(id, patch) { const v = this.vendors.find((x) => x.id === id); if (v) Object.assign(v, patch.deposit_percent != null ? { ...patch, deposit_percent: Number(patch.deposit_percent) || 0 } : patch); return v; }, // V4 PO-4: edit vendor terms
    advancePoProgress(po, stage) { po.progress = stage; },
    setPoStatus(po, stage) { po.progress = stage; },           // R2 PO #2: dropdown sets status
    updatePO(id, patch) { const i = this.purchaseOrders.findIndex((p) => p.id === id); if (i > -1) this.purchaseOrders[i] = { ...this.purchaseOrders[i], ...patch }; },
    poLandedTotal(po) { return r2((po.landed_costs || []).reduce((s, x) => s + (Number(x.amount) || 0), 0)); },
    addPoLanded(po, label, amount, attach_to_owed) { (po.landed_costs = po.landed_costs || []).push({ id: uid('lc'), label: label || 'Landed', amount: Number(amount) || 0, attach_to_owed: !!attach_to_owed }); }, // R2 PO #5 + V6 PO-4 owed toggle
    setLandedOwed(po, lcId, owed) { const x = (po.landed_costs || []).find((l) => l.id === lcId); if (x) x.attach_to_owed = !!owed; }, // V6 PO-4
    removePoLanded(po, lcId) { po.landed_costs = (po.landed_costs || []).filter((x) => x.id !== lcId); },
    addPoPayment(po, { amount, file, note }) { const amt = Number(amount) || 0; (po.payments = po.payments || []).push({ id: uid('pay'), amount: amt, original_amount: amt, edited: false, file: file || '', note: note || '', at: new Date().toISOString() }); }, // R2 PO #4
    updatePoPayment(po, payId, patch) { const p = (po.payments || []).find((x) => x.id === payId); if (!p) return; if (patch.amount != null) { p.amount = Number(patch.amount) || 0; p.edited = p.amount !== p.original_amount; } if (patch.note != null) p.note = patch.note; }, // R3 PO #4 editable + changed flag
    removePoPayment(po, payId) { po.payments = (po.payments || []).filter((x) => x.id !== payId); },
    voidPoPayment(po, payId) { const p = (po.payments || []).find((x) => x.id === payId); if (p) { p.voided = !p.voided; this.logActivity('Payment ' + (p.voided ? 'voided' : 'restored') + ' on ' + po.po_number); } }, // P5: strike a payment but keep the record
    cancelPO(po, reason) { po.cancelled = true; po.status = 'cancelled'; po.progress = 'Cancelled'; po.cancel_reason = reason || ''; po.cancelled_at = new Date().toISOString(); this.logActivity('PO ' + po.po_number + ' cancelled — record kept'); }, // P5
    reopenPO(po) { po.cancelled = false; const full = (po.items || []).every((l) => (l.qty_received || 0) >= (l.qty || 0)); const any = (po.items || []).some((l) => (l.qty_received || 0) > 0); po.status = full ? 'received' : (any ? 'partial' : 'open'); po.progress = po.progress === 'Cancelled' ? 'Not started' : po.progress; this.logActivity('PO ' + po.po_number + ' reopened'); },
    poPaymentsTotal(po) { return r2((po.payments || []).reduce((s, p) => s + (p.voided ? 0 : (Number(p.amount) || 0)), 0)); }, // R3 PO #4 total (P5: voided payments excluded)
    poLineGoods(l) { if (l && l.kind === 'group') return r2((Number(l.qty) || 0) * (l.members || []).reduce((s, m) => s + (Number(m.per_group) || 0) * (Number(m.unit_cost) || 0), 0)); return r2((Number(l.qty) || 0) * (Number(l.unit_cost) || 0)); }, // V4 PO-1: group line scales
    poGoodsTotal(po) { return r2((po.items || []).reduce((s, l) => s + this.poLineGoods(l), 0)); },
    poTotalWithLanded(po) { return r2(this.poGoodsTotal(po) + this.poLandedTotal(po)); }, // R3 SO #3: reconciles with SO cost
    poLandedOwed(po) { return r2((po.landed_costs || []).reduce((s, x) => s + (x.attach_to_owed ? (Number(x.amount) || 0) : 0), 0)); }, // V6 PO-4: landed billed by the vendor adds to what we owe
    poRemaining(po) { return r2(this.poGoodsTotal(po) + this.poLandedOwed(po) - this.poPaymentsTotal(po)); }, // R3 PO #3 + V6 PO-4
    poDepositFor(vendor_id, total) { const v = this.vendors.find((x) => x.id === vendor_id); const pct = v ? (Number(v.deposit_percent) || 0) : 0; return r2((Number(total) || 0) * pct / 100); }, // R3 PO #1: deposit auto-fills from vendor rules
    sendPoToVendor(po, cc, resend) {
      const v = this.vendors.find((x) => x.id === po.vendor_id);
      const to = v ? v.email : 'vendor@example.com';
      po.sent = { to, cc: cc || '', at: new Date().toISOString(), resent: !!resend };
      // NOTE: landed costs are INTERNAL ONLY and are intentionally excluded from the vendor send payload (R2 PO #5).
      this.emails.unshift({ id: uid('em'), kind: 'PO to vendor', to, cc: cc || '', subject: (resend ? 'Updated Purchase Order ' : 'Purchase Order ') + po.po_number + ' (landed costs withheld)', at: new Date().toISOString() });
      return po.sent;
    },
    // Receive: spread total landed cost per unit into new FIFO lots; optionally create tracked assets.
    receivePO(po, lines, landedTotalIn, assetEntries) {
      this.counters.ro += 1;
      const ro = 'RO-2026-' + String(this.counters.ro).padStart(4, '0');
      // physical units = expanded item units (a group line fans out by per_group); landed spreads per physical unit
      const physUnits = (pl, q) => (pl && pl.kind === 'group' ? (pl.members || []).reduce((s, m) => s + (Number(m.per_group) || 0), 0) * q : q);
      // P6: a group line may receive specific per-member quantities (e.g. 20 tablets but only 15 wheelbases).
      const lineUnits = (pl, ln) => { if (pl && pl.kind === 'group' && ln.memberQtys) return Object.values(ln.memberQtys).reduce((s, v) => s + (Number(v) || 0), 0); const rem = (pl.qty || 0) - (pl.qty_received || 0); return physUnits(pl, Math.min(ln.qty || 0, rem)); };
      let totalUnits = 0;
      lines.forEach((ln) => { const pl = po.items.find((l) => l.id === ln.id); if (pl) totalUnits += lineUnits(pl, ln); });
      const landedTotal = r2(landedTotalIn != null ? landedTotalIn : this.poLandedTotal(po));
      const landedPerUnit = totalUnits > 0 ? r2(landedTotal / totalUnits) : 0;
      const billLines = []; const assetsCreated = [];
      lines.forEach((ln) => {
        const poLine = po.items.find((l) => l.id === ln.id);
        if (!poLine) return;
        if (poLine.kind === 'group' && ln.memberQtys) {
          // P6: receive exact quantities per member; the group's "received" = min complete carts across members.
          (poLine.members || []).forEach((m) => {
            const mq = Number(ln.memberQtys[m.vendor_item_id]) || 0; if (mq <= 0) return;
            const it = this.itemById(m.vendor_item_id);
            if (it) this.addLot(it, mq, m.unit_cost, landedPerUnit, ro);
            this.logStock(m.vendor_item_id, 'in', mq, 'PO Receiving', ro, landedPerUnit ? ('landed +$' + landedPerUnit + '/unit') : null);
            m.qty_received = (m.qty_received || 0) + mq;
            billLines.push({ name: (it ? it.name : m.name) + ' (' + poLine.name + ')', qty: mq, unit_cost: Number(m.unit_cost) || 0, landed: landedPerUnit });
          });
          poLine.qty_received = Math.min(...(poLine.members || []).map((m) => Math.floor((m.qty_received || 0) / (Number(m.per_group) || 1))));
          return;
        }
        if (ln.qty <= 0) return;
        const remaining = (poLine.qty || 0) - (poLine.qty_received || 0);
        const q = Math.min(ln.qty, remaining); if (q <= 0) return;
        poLine.qty_received = (poLine.qty_received || 0) + q;
        if (poLine.kind === 'group') {
          (poLine.members || []).forEach((m) => {
            const mq = (Number(m.per_group) || 0) * q; if (mq <= 0) return;
            const it = this.itemById(m.vendor_item_id);
            if (it) this.addLot(it, mq, m.unit_cost, landedPerUnit, ro);
            this.logStock(m.vendor_item_id, 'in', mq, 'PO Receiving', ro, landedPerUnit ? ('landed +$' + landedPerUnit + '/unit') : null);
            m.qty_received = (m.qty_received || 0) + mq;
            billLines.push({ name: (it ? it.name : m.name) + ' (' + poLine.name + ')', qty: mq, unit_cost: Number(m.unit_cost) || 0, landed: landedPerUnit });
          });
        } else {
          const it = this.itemById(poLine.vendor_item_id);
          if (it) this.addLot(it, q, poLine.unit_cost, landedPerUnit, ro); // landed rides on top; base unchanged; carries via FIFO
          this.logStock(poLine.vendor_item_id, 'in', q, 'PO Receiving', ro, landedPerUnit ? ('landed +$' + landedPerUnit + '/unit') : null);
          billLines.push({ name: poLine.name, qty: q, unit_cost: poLine.unit_cost, landed: landedPerUnit });
          // V4 IT-3: tracked assets are no longer minted at receive — they are created at ship-out (singles) / assembly (carts).
        }
      });
      const allFull = po.items.every((l) => (l.qty_received || 0) >= (l.qty || 0));
      const anyRecv = po.items.some((l) => (l.qty_received || 0) > 0);
      po.status = allFull ? 'received' : anyRecv ? 'partial' : po.status;
      // V4 SO-2: single vendor per PO -> one Vendor Bill
      const billIds = [];
      if (billLines.length) {
        this.counters.vbill += 1;
        const total = r2(billLines.reduce((sum, x) => sum + x.qty * (x.unit_cost + x.landed), 0));
        const bill = { id: 'BILL-' + String(1000 + this.counters.vbill), vendor_id: po.vendor_id, po_number: po.po_number, receiving_no: ro, total, created_at: new Date().toISOString(), lines: billLines };
        this.vendorBills.unshift(bill); billIds.push(bill.id);
      }
      return { ro, billIds, multi: false, landedPerUnit, assetsCreated };
    },

    // ---- Cart assembly + asset/inventory mirror ----
    assembleCart({ code, cart_type, components }) {
      let cost = 0; const comp = [];
      components.forEach((c) => { const r = this.issueFIFO(c.vendor_item_id, c.qty); const it = this.itemById(c.vendor_item_id); cost += r.total; comp.push({ vendor_item_id: c.vendor_item_id, name: it ? it.name : '', qty: r.qty, unit_cost: r2(r.total / Math.max(1, r.qty)) }); this.logStock(c.vendor_item_id, 'out', c.qty, 'Cart assembly', code, null); });
      this.counters.cart += 1;
      const cart = { id: uid('cart'), code: code || ('CART-A-' + String(this.counters.cart).padStart(4, '0')), cart_type: cart_type || ((this.assemblyTypes[0] || {}).name) || 'EDAN Cart', condition: 'New', status: 'Available', location: 'Warehouse', facility_id: null, cost: r2(cost), components: comp };
      this.carts.unshift(cart);
      return cart;
    },
    setCartLocation(cart, location, facility_id) { cart.location = location; cart.facility_id = facility_id || null; cart.status = location === 'Warehouse' ? 'Available' : 'Assigned'; },
    setRefurbCreditRate(rate) { this.settings = this.settings || {}; this.settings.refurbCreditRate = Math.max(0, Math.min(1, Number(rate) || 0)); }, // V6 CA-3

    // Ship SO: FIFO-issue (captures base+landed so landed RIDES ALONG on ship-out — R2 PO #5 bug fix).
    shipSO(so, rows, outboundLanded) {
      let captured = 0;
      rows.forEach((row) => {
        const l = so.items[row.idx]; if (!l) return;
        // V4 SO-1 + AS-5: an assembly line ships specific built units (no stock decrement; parts consumed at build).
        if (l.kind === 'assembly') {
          const a = this.assemblyById(l.assembly_id);
          const isSingle = a && a.assembly_kind === 'single';
          // AS-5: assignment auto-fills at ship-out, by type. Carts -> facility + Regional.
          // Single-item assemblies (laptops/gameshows) -> the employee they're shipped to (for retrieval later).
          const emp = isSingle ? (this.userById(row.employee_id) || (so.recipient_type === 'employee' ? this.userById(so.recipient_id) : null)) : null;
          const remaining = (l.qty || 0) - (l.qty_shipped || 0);
          let shipped = 0;
          (row.unit_ids || []).forEach((cid) => {
            if (shipped >= remaining) return;
            const cart = this.carts.find((c) => c.id === cid && c.location === 'Warehouse'); if (!cart) return;
            if (isSingle) {
              cart.location = 'Assigned'; cart.status = 'Assigned'; cart.facility_id = null; cart.so = so.so_number;
              cart.assigned_user = emp ? emp.name : '';
              if (emp) this.userAssets.unshift({ id: uid('ua'), user: emp.name, facility: emp.facility, item: (a ? a.name : cart.cart_type), item_type: cart.cart_type, asset_tag: cart.code, serial: (cart.fields && (cart.fields['Serial No.'] || cart.fields['Serial'])) || '', cost: Number(cart.cost) || 0, assigned: TODAY, status: 'Active', so: so.so_number });
            } else {
              cart.location = 'Facility'; cart.status = 'Assigned'; cart.facility_id = l.facility_id || so.facility_id; cart.regional_id = so.regional_id || (this.facilityById(cart.facility_id) || {}).regional_id || null; cart.so = so.so_number;
            }
            captured += Number(cart.cost) || 0;
            (l.shipped_units = l.shipped_units || []).push(cart.id);
            shipped += 1;
          });
          l.qty_shipped = (l.qty_shipped || 0) + shipped;
          return;
        }
        const remaining = (l.qty || 0) - (l.qty_shipped || 0);
        const q = Math.min(Number(row.qty) || 0, remaining, this.soLineMaxShippable(l)); if (q <= 0) return;
        l.shipped_detail = l.shipped_detail || [];
        let lineTotal = 0;
        this.soLineEffective(l, q).forEach((e) => {
          if (e.qty <= 0) return;
          const r = this.issueFIFO(e.vendor_item_id, e.qty);
          lineTotal += r.total; captured += r.total;
          r.lines.forEach((li) => l.shipped_detail.push({ vendor_item_id: e.vendor_item_id, qty: li.qty, unit_cost: li.unit_cost, landed: li.landed || 0 }));
          this.logStock(e.vendor_item_id, 'out', r.qty, 'SO Shipment', so.so_number, r.landedTotal ? ('incl landed $' + r.landedTotal) : null);
          // Amendment: loose singles are never assets — no tracked-asset minting on ship. Assets exist only as assembled units.
        });
        l.qty_shipped = (l.qty_shipped || 0) + q;
        l.shipped_cost_total = r2((l.shipped_cost_total || 0) + lineTotal);
      });
      if (Array.isArray(outboundLanded)) so.landed_costs = outboundLanded;
      const allShipped = so.items.every((l) => (l.qty_shipped || 0) >= (l.qty || 0));
      if (allShipped && so.status !== 'completed') so.status = 'shipped';
      else if (!allShipped && so.status === 'draft') so.status = 'in_progress';
      // S2/C4: shipping an SO creates a shipment record so it shows under Shipments (not only when combining).
      if (so.items.some((l) => (l.qty_shipped || 0) > 0)) { this.ensureShipmentForSO(so, { status: allShipped ? 'Shipped' : 'Partial' }); this.markQueuedShipped(so.so_number); }
      return { captured: r2(captured) };
    },
    // R2 SO #8: ship the in-stock items, then move the shortfall to a back-order SO ("BC" suffix) and complete the original.
    shipAndBackorder(so, rows, outboundLanded) {
      const res = this.shipSO(so, rows, outboundLanded);
      const short = so.items.filter((l) => (l.qty_shipped || 0) < (l.qty || 0)).map((l) => {
        const base = { name: l.name, facility_id: l.facility_id, qty: (l.qty || 0) - (l.qty_shipped || 0), qty_shipped: 0, shipped_cost_total: 0, shipped_detail: [] };
        if (l.kind === 'group') return { ...base, kind: 'group', group_id: l.group_id, members: JSON.parse(JSON.stringify(l.members || [])) };
        return { ...base, kind: 'item', vendor_item_id: l.vendor_item_id, unit_cost: l.unit_cost };
      });
      let backorder = null;
      if (short.length) {
        backorder = {
          id: uid('so'), so_number: so.so_number + 'BC', recipient_type: so.recipient_type, recipient_id: so.recipient_id,
          ship_to_type: so.ship_to_type, regional_id: so.regional_id, facility_id: so.facility_id, order_date: TODAY, expected_date: '',
          delivery_method: so.delivery_method, shipping_address: so.shipping_address, shipping_cost: 0, landed_costs: [], status: 'backorder',
          notes: 'Back order of ' + so.so_number + ' — ships when items are back in stock.', backorder_of: so.so_number, groups: [], attachments: [], items: short,
        };
        this.salesOrders.unshift(backorder);
        so.notes = (so.notes ? so.notes + ' · ' : '') + short.map((l) => l.qty + '× ' + l.name).join(', ') + ' out of stock → back order ' + backorder.so_number;
      }
      so.status = 'completed';
      this.emailCustomer(so, 'Shipped (partial — back order created)');
      return { ...res, backorder };
    },
    // R2 SO #6: reverse a step — unmark shipped, return stock to inventory.
    reverseShip(so) {
      so.items.forEach((l) => {
        if ((l.qty_shipped || 0) <= 0) return;
        if (l.kind === 'assembly') {
          (l.shipped_units || []).forEach((cid) => { const c = this.carts.find((x) => x.id === cid); if (c) { c.location = 'Warehouse'; c.status = 'Available'; c.facility_id = null; c.regional_id = null; c.so = null; } });
          l.shipped_units = []; l.qty_shipped = 0; l.shipped_cost_total = 0; return;
        }
        const det = l.shipped_detail || [];
        if (det.length) {
          det.forEach((d) => { const it = this.itemById(d.vendor_item_id); if (it) this.addLot(it, d.qty, d.unit_cost, d.landed || 0, 'reversal ' + so.so_number); this.logStock(d.vendor_item_id, 'in', d.qty, 'Ship reversal', so.so_number, 'shipment reversed'); });
        } else {
          // legacy line (no detail captured) — re-add the aggregate at base + derived landed
          const q = l.qty_shipped || 0; const it = this.itemById(l.vendor_item_id);
          const unit = (l.shipped_cost_total || 0) / q; const base = it ? it.cost : unit; const landed = r2(unit - base);
          if (it) this.addLot(it, q, base, landed > 0 ? landed : 0, 'reversal ' + so.so_number);
          this.logStock(l.vendor_item_id, 'in', q, 'Ship reversal', so.so_number, 'shipment reversed');
        }
        l.qty_shipped = 0; l.shipped_cost_total = 0; l.shipped_detail = [];
      });
      // also unwind any employee asset assignments this shipment created (laptops/trivia) — otherwise the
      // unit is double-counted: it returns to inventory AND stays assigned to the employee.
      this.userAssets = this.userAssets.filter((a) => a.so !== so.so_number);
      this.trackedAssets = this.trackedAssets.filter((a) => a.so !== so.so_number);
      // return any assembled units this shipment sent back into the warehouse, and clear their line tracking
      (so.items || []).forEach((l) => { if (l.kind === 'assembly') { (l.shipped_units || []).forEach((cid) => { const c = this.carts.find((x) => x.id === cid); if (c) { c.location = 'Warehouse'; c.status = 'Available'; c.facility_id = null; c.regional_id = null; c.assigned_user = ''; c.so = null; } }); l.shipped_units = []; l.qty_shipped = 0; } });
      so.status = 'in_progress';
      // reversing a shipment also removes its single-SO shipment record (avoid a phantom shipment).
      this.shipments = (this.shipments || []).filter((sh) => sh.single_so !== so.so_number);
      // reversing restores the full order — drop any unshipped back orders it spawned (avoid phantom over-demand)
      this.salesOrders = this.salesOrders.filter((x) => !(x.backorder_of === so.so_number && (x.items || []).every((l) => (l.qty_shipped || 0) === 0)));
      return so;
    },
    backordersReady() {
      return this.salesOrders.filter((so) => so.status === 'backorder' && so.items.every((l) => this.soLineEffective(l, (l.qty || 0) - (l.qty_shipped || 0)).every((e) => { const it = this.itemById(e.vendor_item_id); return it && (it.qty_onhand || 0) >= e.qty; })));
    },

    addSalesOrder(so) { this.salesOrders.unshift(so); this.emailCustomer(so, 'Order received'); },
    addSoAttachment(soId, name, kind) { const so = this.salesOrders.find((s) => s.id === soId); if (so && name) { (so.attachments = so.attachments || []).push({ id: uid('att'), name, kind: kind || 'Attachment', at: new Date().toISOString() }); } }, // R3 SO #4
    removeSoAttachment(soId, attId) { const so = this.salesOrders.find((s) => s.id === soId); if (so) so.attachments = (so.attachments || []).filter((a) => a.id !== attId); },
    facilityShipmentDocs(facility_id) { const out = []; this.salesOrders.forEach((so) => { const targets = so.facility_id === facility_id || (so.items || []).some((l) => l.facility_id === facility_id); if (targets) (so.attachments || []).forEach((a) => out.push({ so_number: so.so_number, name: a.name, kind: a.kind, at: a.at })); }); return out; }, // R3 SO #4: docs visible under the facility
    updateSalesOrder(id, patch) { const i = this.salesOrders.findIndex((s) => s.id === id); if (i > -1) this.salesOrders[i] = { ...this.salesOrders[i], ...patch }; },
    soOutboundTotal(so) { return r2((Number(so.shipping_cost) || 0) + (so.landed_costs || []).reduce((s, x) => s + (Number(x.amount) || 0), 0)); },
    // SO total with landed riding along: shipped portion at captured cost (incl landed) + remainder at FIFO + outbound.
    soGoodsTotal(so) {
      return r2(so.items.reduce((s, l) => {
        const shipped = l.qty_shipped || 0; const rem = Math.max(0, (l.qty || 0) - shipped);
        return s + (l.shipped_cost_total || 0) + rem * this.soLineUnitCost(l);
      }, 0));
    },
    facilityCharges(so) {
      const out = {};
      so.items.forEach((l) => { const fid = l.facility_id || so.facility_id; const shipped = l.qty_shipped || 0; const rem = Math.max(0, (l.qty || 0) - shipped); const cost = (l.shipped_cost_total || 0) + rem * this.soLineUnitCost(l); out[fid] = r2((out[fid] || 0) + cost); });
      return out;
    },
    // V6 SO-3 + S5: confirming an SO moves it to in-progress AND queues a shipment. Confirmation may be done
    // by the Warehouse Manager OR the Regional receiving the order; who/role/when is recorded on the SO and
    // persists to the shared database with the rest of the workspace state.
    confirmSo(so, actor) {
      if (so.status === 'draft' || so.status === 'backorder') so.status = 'in_progress';
      if (actor) { so.confirmed_by = actor.name || String(actor); so.confirmed_by_role = actor.role || ''; so.confirmed_at = new Date().toISOString(); }
      const exists = (this.shipQueue || []).some((q) => q.so_number === so.so_number && q.status !== 'Shipped');
      if (!exists) {
        this.shipQueue.unshift({ id: uid('sq'), so_number: so.so_number, recipient_type: so.recipient_type, recipient_id: so.recipient_id, facility_id: so.facility_id || null, regional_id: so.regional_id || null, confirmed_by: (actor && (actor.name || String(actor))) || '', confirmed_by_role: (actor && actor.role) || '', status: 'Queued', created_at: new Date().toISOString() });
        this.logActivity('Shipment queued for ' + so.so_number + (actor ? ' · confirmed by ' + (actor.name || actor) + (actor.role ? ' (' + actor.role + ')' : '') : ''));
      }
      return so;
    },
    markQueuedShipped(so_number) { (this.shipQueue || []).forEach((q) => { if (q.so_number === so_number) q.status = 'Shipped'; }); },
    // C1/C3: destination identity of an SO (recipient + address) + a human label used on shipment rows.
    soDestKey(so) { const t = so.recipient_type || (so.facility_id ? 'facility' : (so.regional_id ? 'regional' : '')); const id = so.recipient_id || so.facility_id || so.regional_id || ''; return t + ':' + id + '|' + (so.shipping_address || '').trim().toLowerCase(); },
    shipmentRecipientLabel(so) { if (so.facility_id) return (this.facilityById(so.facility_id) || {}).name || so.shipping_address || 'Facility'; if (so.regional_id) return (this.regionalById(so.regional_id) || {}).name || so.shipping_address || 'Regional'; return so.shipping_address || 'Recipient'; },
    // S6: completing an SO = proof of delivery / received; also marks its shipment delivered.
    completeSalesOrder(so) { so.status = 'completed'; so.completed_at = new Date().toISOString(); so.delivered = true; if (!so.proof_of_delivery) so.proof_of_delivery = 'Delivered ' + TODAY; (this.shipments || []).forEach((sh) => { if (sh.single_so === so.so_number || (sh.so_numbers || []).includes(so.so_number)) sh.status = 'Delivered'; }); this.logActivity(so.so_number + ' completed — proof of delivery recorded'); return so; },
    // S2/C4: create (or refresh) a single-SO shipment record so a shipped order appears under Shipments.
    ensureShipmentForSO(so, opts = {}) {
      this.shipments = this.shipments || [];
      const byFacility = {};
      so.items.forEach((l) => { const fid = l.facility_id || so.facility_id; (byFacility[fid] = byFacility[fid] || []).push({ so: so.so_number, name: l.name, qty: (l.qty_shipped || l.qty), vendor_item_id: l.vendor_item_id }); });
      const regional_id = so.regional_id || (this.facilityById(so.facility_id) || {}).regional_id || null;
      let sh = this.shipments.find((x) => x.single_so === so.so_number);
      if (!sh) {
        this.counters.ship = (this.counters.ship || 0) + 1;
        sh = { id: uid('shp'), shipment_no: 'SHP-2026-' + String(this.counters.ship).padStart(3, '0'), regional_id, recipient_label: this.shipmentRecipientLabel(so), single_so: so.so_number, so_numbers: [so.so_number], shipping_cost: Number(so.shipping_cost) || 0, byFacility, status: opts.status || 'Shipped', created_at: new Date().toISOString() };
        this.shipments.unshift(sh);
        this.logActivity('Shipment ' + sh.shipment_no + ' created for ' + so.so_number);
      } else { sh.byFacility = byFacility; sh.shipping_cost = Number(so.shipping_cost) || 0; sh.regional_id = regional_id; if (opts.status) sh.status = opts.status; }
      return sh;
    },
    combineSOs(soIds, shipping_cost) {
      const sos = this.salesOrders.filter((s) => soIds.includes(s.id)); if (sos.length < 2) return { error: 'Select at least two orders to combine.' };
      // C1: only orders shipping to the SAME destination (same recipient + address) can be combined.
      const key0 = this.soDestKey(sos[0]);
      if (!sos.every((s) => this.soDestKey(s) === key0)) return { error: 'These orders ship to different places — only orders going to the same recipient and address can be combined.' };
      const regional_id = sos[0].regional_id || (this.facilityById(sos[0].facility_id) || {}).regional_id;
      const byFacility = {};
      sos.forEach((so) => { so.items.forEach((l) => { const fid = l.facility_id || so.facility_id; (byFacility[fid] = byFacility[fid] || []).push({ so: so.so_number, name: l.name, qty: l.qty, vendor_item_id: l.vendor_item_id }); }); so.combined_into = true; });
      // fold any single-SO shipments for these orders into the combined one (avoid duplicate shipment rows).
      const _nums = sos.map((s) => s.so_number); this.shipments = (this.shipments || []).filter((sh) => !(sh.single_so && _nums.includes(sh.single_so)));
      this.counters.ship += 1;
      const shipment = { id: uid('shp'), shipment_no: 'SHP-2026-' + String(this.counters.ship).padStart(3, '0'), regional_id, recipient_label: this.shipmentRecipientLabel(sos[0]), combined: true, so_numbers: sos.map((s) => s.so_number), shipping_cost: Number(shipping_cost) || 0, byFacility, status: 'Combined', created_at: new Date().toISOString() };
      this.shipments.unshift(shipment);
      return shipment;
    },
    emailCustomer(so, event) {
      const reg = this.regionalById(so.regional_id); const fac = this.facilityById(so.facility_id);
      const rec = so.recipient_id ? (this.facilityById(so.recipient_id) || this.regionalById(so.recipient_id) || this.userById(so.recipient_id)) : null;
      const to = (rec && rec.email) ? rec.email : (reg ? reg.email : (fac ? (fac.name.toLowerCase().replace(/\s+/g, '.') + '@carease.com') : 'customer@carease.com'));
      this.emails.unshift({ id: uid('em'), kind: 'Customer order', to, cc: '', subject: (event || 'Order update') + ' — ' + so.so_number, at: new Date().toISOString() });
    },

    /* ---- Returns (R1–R4): only ASSETS are returned. Start by source, confirm on arrival, make carts whole. ---- */
    nextReturnNo() { this.counters.ret += 1; return 'RET-2026-' + String(this.counters.ret).padStart(4, '0'); },
    // Returnable assets for a source (facility or employee): assigned carts + facility/user assets.
    returnableAssetsFor(source_type, source_id) {
      const out = [];
      if (source_type === 'facility') {
        const f = this.facilityById(source_id); const fname = f ? f.name : '';
        this.carts.filter((c) => c.facility_id === source_id).forEach((c) => out.push({ key: 'cart:' + c.id, kind: 'cart', cart_id: c.id, label: c.code + ' (' + c.cart_type + ' cart)', asset_tag: c.code, cost: c.cost, components: c.components }));
        // X1: legacy facilityAssets aggregate retired — facility returns use the REAL tracked carts (above) + user assets (below).
        this.userAssets.filter((a) => a.facility === fname && a.status !== 'Returned').forEach((a) => out.push({ key: 'ua:' + a.id, kind: a.item_type === 'Trivia Equipment' ? 'trivia' : 'laptop', ua_id: a.id, label: a.item + ' · ' + a.user, asset_tag: a.asset_tag, cost: a.cost || 0 }));
      } else if (source_type === 'employee') {
        const u = this.userById(source_id); const uname = u ? u.name : '';
        this.userAssets.filter((a) => a.user === uname && a.status !== 'Returned').forEach((a) => out.push({ key: 'ua:' + a.id, kind: a.item_type === 'Trivia Equipment' ? 'trivia' : 'laptop', ua_id: a.id, label: a.item + ' · ' + a.asset_tag, asset_tag: a.asset_tag, cost: a.cost || 0 }));
      } else if (source_type === 'regional') {
        // R4: returns from a Regional — the tracked carts assigned to that regional.
        this.carts.filter((c) => c.regional_id === source_id).forEach((c) => out.push({ key: 'cart:' + c.id, kind: 'cart', cart_id: c.id, label: c.code + ' (' + c.cart_type + ' cart)', asset_tag: c.code, cost: c.cost, components: c.components }));
      }
      return out;
    },
    sourceLabel(source_type, source_id) {
      if (source_type === 'facility') return (this.facilityById(source_id) || {}).name || '';
      if (source_type === 'employee') return (this.userById(source_id) || {}).name || '';
      if (source_type === 'regional') return (this.regionalById(source_id) || {}).name || '';
      return '';
    },
    startAssetReturn({ source_type, source_id, so_ref, assets }) {
      const ret = { id: uid('ret'), ret_no: this.nextReturnNo(), source_type, source_id, source_label: this.sourceLabel(source_type, source_id), so_ref: so_ref || '', assets: JSON.parse(JSON.stringify(assets || [])), status: 'in_transit', refund_total: 0, replacement_charge: 0, created_at: new Date().toISOString(), received_at: null };
      this.returns.unshift(ret);
      return ret;
    },
    // Confirm arrival: tick received assets, compute refund (PC), make returned carts whole (replace missing from inventory, charge facility).
    confirmAssetReturn(retId, decisions) {
      const ret = this.returns.find((r) => r.id === retId); if (!ret) return null;
      let refund = 0, charge = 0;
      (decisions || []).forEach((d) => {
        if (!d.received) return;
        const a = ret.assets.find((x) => x.key === d.key); if (!a) return;
        a.received = true;
        if (a.kind !== 'cart') refund += Number(a.cost) || 0; // PC refunded to the facility (carts are credited via the refurb formula below)
        if (a.kind === 'cart' && a.cart_id) {
          const cart = this.carts.find((c) => c.id === a.cart_id);
          if (cart) {
            (d.missing || []).forEach((m) => {
              const q = Number(m.qty) || 0; if (q <= 0) return;
              const r = this.issueFIFO(m.vendor_item_id, q); // pull replacements from inventory
              charge += r.total;                              // cost charged to the source facility
              this.logStock(m.vendor_item_id, 'out', q, 'Return make-whole', ret.ret_no, 'replace missing in ' + cart.code);
            });
            // V6 CA-2/CA-3: a returned cart comes back as a REFURBISHED unit in its own pool,
            // valued by the refund logic (the same credit the facility receives) — not its original build cost.
            const bookCost = r2(cart.components.reduce((s, c) => s + (Number(c.qty) || 0) * this.fifoUnitCost(c.vendor_item_id), 0));
            const credit = this.refurbishedValue(bookCost);
            refund += credit; // the facility is credited this amount for the returned cart
            cart.original_cost = bookCost;
            cart.cost = credit;
            cart.condition = 'Refurbished';
            cart.refurbished = true;
            cart.ready = false; // R3: a returned/refurbished cart must pass a quality check before it can ship again
            cart.refurb_date = TODAY;
            cart.returned_from = ret.source_label;
            this.setCartLocation(cart, 'Warehouse', null);
            this.logActivity('Cart ' + cart.code + ' returned → Refurbished (credit ' + credit + ')');
          }
        } else if ((a.kind === 'laptop' || a.kind === 'trivia') && a.ua_id) {
          const ua = this.userAssets.find((x) => x.id === a.ua_id); if (ua) ua.status = 'Returned';
          this.counters.asset += 1;
          this.trackedAssets.unshift({ id: uid('ta'), item: a.label.split(' · ')[0], item_type: a.kind === 'trivia' ? 'Trivia Equipment' : 'Laptop', asset_tag: a.asset_tag, serial: '', status: 'In warehouse', received_at: TODAY, po: 'return ' + ret.ret_no });
        }
      });
      ret.status = 'received';
      ret.received_at = new Date().toISOString();
      ret.refund_total = r2(refund);
      ret.replacement_charge = r2(charge);
      ret.charge_facility = ret.source_type === 'facility' ? ret.source_label : '';
      return ret;
    },

    /* Users (warehouse-scoped) */
    addUser({ name, role, program, facility }) { this.users.push({ id: uid('u'), name, role: role || 'Warehouse Employee', program: program || 'Warehouse', facility: facility || 'All facilities', email: '', address: '' }); },
    removeUser(id) { const i = this.users.findIndex((u) => u.id === id); if (i > -1) this.users.splice(i, 1); },
    /* Roles & permissions */
    cycleGrant(capId) { const order = ['yes', 'partial', 'confirm', 'no']; const cap = this.capabilities.find((c) => c.id === capId); if (cap) cap.grant = order[(order.indexOf(cap.grant) + 1) % order.length]; },
    toggleEmployeeCap(capId) { const cap = this.capabilities.find((c) => c.id === capId); if (cap) cap.employee = !cap.employee; },
    deriveEmployeeRole() { if (this.employeeRoleCreated) return; this.roles.push({ id: 'warehouse-employee', name: 'Warehouse Employee', model_user: '—', derived_from: 'warehouse-manager', renamed_from: null, custom: false }); this.employeeRoleCreated = true; },
    addManagerRole(name) { const id = 'role-' + uid('r'); this.roles.push({ id, name: name || 'New Manager Role', model_user: '—', derived_from: 'warehouse-manager', renamed_from: null, custom: true }); return id; },
    /* Facility record management */
    addFacilityAttachment(facId, fileName) { const f = this.facilityById(facId); if (f && fileName) f.attachments.push(fileName); },
    sendFacilityMessage(facId, text) { const f = this.facilityById(facId); if (f && text && text.trim()) f.messages.unshift({ id: uid('m'), author: 'Malky Locker', text: text.trim(), at: new Date().toISOString() }); },
    confirmCartReceipt({ facility_id, received_on, bol, photos, qty }) {
      const f = this.facilityById(facility_id);
      // X1/S7: received quantity = REAL count of tracked carts shipped here (not the seeded carts_needed, which caused '3 shows 6').
      const inbound = (this.carts || []).filter((c) => c.facility_id === facility_id && c.location === 'Facility' && !c.received);
      const n = (qty != null && qty !== '') ? Math.max(0, Number(qty)) : inbound.length;
      inbound.slice(0, n).forEach((c) => { c.received = true; c.status = 'Deployed'; }); // acknowledge delivery
      this.cartReceipts.unshift({ id: uid('rcpt'), facility_id, shipped_qty: n, shipment_date: f ? f.cart_shipment_date : null, received_on, bol_name: bol, photos: (photos || []).slice() });
      if (f) f.status = 'Received';
    },

    /* ---- V4 Assemblies (Single / Group / Assembly model) ---- */
    addAssemblyDef({ name, assembly_kind, source_item_id, assembly_type_id, composition, asset_defaults, fields }) {
      const a = { id: uid('asm'), sku: this.nextSku(), name: name || 'New Assembly', assembly_kind: assembly_kind || 'cart', source_item_id: source_item_id || '', assembly_type_id: assembly_type_id || '', composition: composition || [], asset_defaults: asset_defaults || {}, fields: fields || [], is_active: true, is_assembly: true };
      this.assemblies.unshift(a); return a;
    },
    updateAssemblyDef(id, patch) { const a = this.assemblyById(id); if (a) Object.assign(a, patch); },
    addAssemblyType(name) { const id = 'at-' + uid('t'); this.assemblyTypes.push({ id, name: name || 'New Type' }); return id; },
    updateAssemblyType(id, name) { const t = (this.assemblyTypes || []).find((x) => x.id === id); if (t) t.name = name; },
    assemblyAutoFill(defId) {
      const a = this.assemblyById(defId); if (!a) return {};
      const out = { ...(a.asset_defaults || {}) };
      // V4 AS-2: trace the asset fields from the ACTUAL inventory items pulled in (item -> group -> assembly),
      // reading each component item's stored attrs. Curated per-assembly defaults win; attrs fill any blanks.
      const leaves = this.expandAssembly(defId, 1);
      Object.keys(leaves).forEach((k) => {
        const it = this.itemById(k);
        if (it && it.attrs) Object.keys(it.attrs).forEach((f) => { if (!out[f] && it.attrs[f]) out[f] = it.attrs[f]; });
      });
      // last-resort name inference, only for components that carry no attrs of their own.
      (a.composition || []).forEach((c) => {
        const nm = (c.kind === 'group' ? (this.groupById(c.ref_id) || {}).name : (this.itemById(c.ref_id) || {}).name) || '';
        const n = nm.toLowerCase();
        if (!out.cart_type && /cta/.test(n)) out.cart_type = 'CTA Cart';
        if (!out.key_type && /cta/.test(n)) out.key_type = 'CTA Key';
        if (!out.bp_device && /vs8/.test(n)) out.bp_device = 'VS8';
        if (!out.bp_device && /edan/.test(n)) out.bp_device = 'EDAN';
        if (!out.bp_device && /accut/.test(n)) out.bp_device = 'Accutor';
      });
      return out;
    },
    // AS-1..7 + IT-5: consume the parts (FIFO incl landed) and create exactly ONE tracked cart asset. Code mandatory.
    buildAssembly({ assembly_id, code, cart_color, tablet_number, fields }) {
      const a = this.assemblyById(assembly_id); if (!a) return { error: 'Unknown assembly.' };
      const isSingle = a.assembly_kind === 'single';
      // IT-4: a unit code/asset tag is mandatory for every assembled unit (cart or single-item).
      if (!code || !String(code).trim()) return { error: isSingle ? 'Unit Code is required.' : 'Cart Code is required.' };
      // A2: cart/unit codes must be unique across all built units — block a duplicate.
      if ((this.carts || []).some((c) => (c.code || '').trim().toLowerCase() === String(code).trim().toLowerCase())) return { error: (isSingle ? 'Unit' : 'Cart') + ' Code "' + String(code).trim() + '" already exists — codes must be unique.' };
      const exp = this.expandAssembly(assembly_id, 1);
      for (const k of Object.keys(exp)) { const it = this.itemById(k); if (!it || (it.qty_onhand || 0) < exp[k]) return { error: 'Not enough ' + (it ? it.name : k) + ' in stock.' }; }
      // marking assembled removes the parts from inventory (FIFO, landed rides along) and creates exactly ONE asset.
      let cost = 0; const comp = [];
      Object.keys(exp).forEach((k) => { const r = this.issueFIFO(k, exp[k]); const it = this.itemById(k); cost += r.total; comp.push({ vendor_item_id: k, name: it ? it.name : '', qty: exp[k], unit_cost: r2(r.total / Math.max(1, exp[k])) }); this.logStock(k, 'out', exp[k], 'Assembly build', String(code).trim(), null); });
      this.counters.cart += 1;
      if (isSingle) {
        // single-item assembly: no composition to pull from — just the unit's entered info (RAM, make, price, …).
        const unit = { id: uid('cart'), code: String(code).trim(), assembly_id, unit_kind: 'single', cart_type: a.name, condition: 'New', fields: { ...(fields || {}) }, status: 'Available', location: 'Warehouse', facility_id: null, regional_id: null, assigned_user: '', cost: r2(cost), components: comp };
        this.carts.unshift(unit); this.logActivity('Assembled ' + a.name + ' · ' + unit.code);
        return { cart: unit };
      }
      const af = { ...this.assemblyAutoFill(assembly_id), ...(fields || {}) }; // V4 AS-2: fields traced from inventory carry onto the built unit
      const cart = { id: uid('cart'), code: String(code).trim(), assembly_id, unit_kind: 'cart', cart_type: af.cart_type || this.assemblyTypeName(a.assembly_type_id), key_type: af.key_type || '', bp_device: af.bp_device || '', cart_color: cart_color || '', tablet_number: tablet_number || '', condition: 'New', status: 'Available', location: 'Warehouse', facility_id: null, regional_id: null, cost: r2(cost), components: comp };
      this.carts.unshift(cart); this.logActivity('Assembled ' + a.name + ' · ' + cart.code);
      return { cart };
    },
    buildAssembliesBatch(rows) {
      const built = [], errors = [];
      (rows || []).forEach((r, i) => {
        if (!r || !r.assembly_id) return;
        const res = this.buildAssembly({ assembly_id: r.assembly_id, code: r.code, cart_color: r.cart_color, tablet_number: r.tablet_number, fields: r.fields || {} });
        if (res && res.cart) { if (r.condition === 'Refurbished') res.cart.condition = 'Refurbished'; built.push(res.cart); }
        else errors.push({ row: i + 1, code: r.code || '(no code)', error: (res && res.error) || 'failed' });
      });
      return { built, errors };
    },
    editAssemblyUnit(cartId, patch) { const c = this.carts.find((x) => x.id === cartId); if (c) Object.assign(c, patch); return c; },
    markCartReady(cartId) { const c = (this.carts || []).find((x) => x.id === cartId); if (c) { c.ready = true; this.logActivity('Refurbished cart ' + c.code + ' passed QC — ready to ship'); } return c; }, // R3

    markNotificationRead(id) { const n = (this.notifications || []).find((x) => x.id === id); if (n) n.read = true; },
    markAllNotificationsRead() { (this.notifications || []).forEach((n) => { n.read = true; }); },
    logActivity(text) { (this.activity = this.activity || []).unshift({ id: uid('ac'), at: new Date().toISOString(), text, new: true }); },
    setAssetStatus(collection, id, status) { const arr = this[collection]; if (!Array.isArray(arr)) return; const r = arr.find((x) => x.id === id); if (r) { r.status = status; this.logActivity('Status: ' + (r.asset_tag || r.code || r.item || id) + ' -> ' + status); } },
    queuePO(itemIds) { this.poDraft = (itemIds || []).slice(); },
    takePoDraft() { const d = (this.poDraft || []).slice(); this.poDraft = []; return d; },

    resetDemo() { this.$patch(seed()); try { sessionStorage.removeItem(SKEY); } catch (e) { /* ignore */ } },
    // History: restore the whole workspace to an earlier saved version (then it re-saves as a new version — non-destructive).
    restoreState(state, version) { if (!state || typeof state !== 'object') return; this.$patch(state); this.logActivity('⤺ Workspace restored to version ' + (version != null ? version : 'earlier') + ''); },
  },
});

export function persistWarehouse(store) {
  let timer = null;
  store.$subscribe((_m, state) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { try { sessionStorage.setItem(SKEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }, 400);
  });
}
