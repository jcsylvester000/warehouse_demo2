// Lightweight offline "geocoder" for the Equipment Map.
// The uploaded inventory gives facility NAMES, not street addresses, so we map each
// facility to a real US city location: by a place-name token when the name contains one
// (e.g. "Laguna Hills", "St Augustine"), otherwise deterministically by a hash of the name.
// A small deterministic jitter spreads facilities that land in the same city.
// In production this function would be replaced by a real address geocoder (Nominatim / Google).

export const US_CITIES = [
  { c: 'new york', s: 'NY', lat: 40.7128, lng: -74.0060 },
  { c: 'brooklyn', s: 'NY', lat: 40.6782, lng: -73.9442 },
  { c: 'buffalo', s: 'NY', lat: 42.8864, lng: -78.8784 },
  { c: 'newark', s: 'NJ', lat: 40.7357, lng: -74.1724 },
  { c: 'lakewood', s: 'NJ', lat: 40.0978, lng: -74.2176 },
  { c: 'toms river', s: 'NJ', lat: 39.9537, lng: -74.1979 },
  { c: 'monroe', s: 'NJ', lat: 40.3137, lng: -74.4243 },
  { c: 'crofton', s: 'MD', lat: 39.0018, lng: -76.6863 },
  { c: 'baltimore', s: 'MD', lat: 39.2904, lng: -76.6122 },
  { c: 'philadelphia', s: 'PA', lat: 39.9526, lng: -75.1652 },
  { c: 'pittsburgh', s: 'PA', lat: 40.4406, lng: -79.9959 },
  { c: 'boston', s: 'MA', lat: 42.3601, lng: -71.0589 },
  { c: 'worcester', s: 'MA', lat: 42.2626, lng: -71.8023 },
  { c: 'hartford', s: 'CT', lat: 41.7658, lng: -72.6734 },
  { c: 'providence', s: 'RI', lat: 41.8240, lng: -71.4128 },
  { c: 'manchester', s: 'NH', lat: 42.9956, lng: -71.4548 },
  { c: 'portland', s: 'ME', lat: 43.6591, lng: -70.2568 },
  { c: 'richmond', s: 'VA', lat: 37.5407, lng: -77.4360 },
  { c: 'virginia beach', s: 'VA', lat: 36.8529, lng: -75.9780 },
  { c: 'charlotte', s: 'NC', lat: 35.2271, lng: -80.8431 },
  { c: 'raleigh', s: 'NC', lat: 35.7796, lng: -78.6382 },
  { c: 'columbia', s: 'SC', lat: 34.0007, lng: -81.0348 },
  { c: 'atlanta', s: 'GA', lat: 33.7490, lng: -84.3880 },
  { c: 'savannah', s: 'GA', lat: 32.0809, lng: -81.0912 },
  { c: 'jacksonville', s: 'FL', lat: 30.3322, lng: -81.6557 },
  { c: 'st augustine', s: 'FL', lat: 29.9012, lng: -81.3124 },
  { c: 'orlando', s: 'FL', lat: 28.5383, lng: -81.3792 },
  { c: 'miami', s: 'FL', lat: 25.7617, lng: -80.1918 },
  { c: 'tampa', s: 'FL', lat: 27.9506, lng: -82.4572 },
  { c: 'nashville', s: 'TN', lat: 36.1627, lng: -86.7816 },
  { c: 'memphis', s: 'TN', lat: 35.1495, lng: -90.0490 },
  { c: 'louisville', s: 'KY', lat: 38.2527, lng: -85.7585 },
  { c: 'columbus', s: 'OH', lat: 39.9612, lng: -82.9988 },
  { c: 'cleveland', s: 'OH', lat: 41.4993, lng: -81.6944 },
  { c: 'cincinnati', s: 'OH', lat: 39.1031, lng: -84.5120 },
  { c: 'detroit', s: 'MI', lat: 42.3314, lng: -83.0458 },
  { c: 'grand rapids', s: 'MI', lat: 42.9634, lng: -85.6681 },
  { c: 'indianapolis', s: 'IN', lat: 39.7684, lng: -86.1581 },
  { c: 'chicago', s: 'IL', lat: 41.8781, lng: -87.6298 },
  { c: 'peoria', s: 'IL', lat: 40.6936, lng: -89.5890 },
  { c: 'milwaukee', s: 'WI', lat: 43.0389, lng: -87.9065 },
  { c: 'waterloo', s: 'IA', lat: 42.4928, lng: -92.3426 },
  { c: 'minneapolis', s: 'MN', lat: 44.9778, lng: -93.2650 },
  { c: 'st louis', s: 'MO', lat: 38.6270, lng: -90.1994 },
  { c: 'kansas city', s: 'MO', lat: 39.0997, lng: -94.5786 },
  { c: 'dallas', s: 'TX', lat: 32.7767, lng: -96.7970 },
  { c: 'houston', s: 'TX', lat: 29.7604, lng: -95.3698 },
  { c: 'austin', s: 'TX', lat: 30.2672, lng: -97.7431 },
  { c: 'san antonio', s: 'TX', lat: 29.4241, lng: -98.4936 },
  { c: 'oklahoma city', s: 'OK', lat: 35.4676, lng: -97.5164 },
  { c: 'denver', s: 'CO', lat: 39.7392, lng: -104.9903 },
  { c: 'phoenix', s: 'AZ', lat: 33.4484, lng: -112.0740 },
  { c: 'las vegas', s: 'NV', lat: 36.1699, lng: -115.1398 },
  { c: 'salt lake city', s: 'UT', lat: 40.7608, lng: -111.8910 },
  { c: 'seattle', s: 'WA', lat: 47.6062, lng: -122.3321 },
  { c: 'portland or', s: 'OR', lat: 45.5152, lng: -122.6784 },
  { c: 'sacramento', s: 'CA', lat: 38.5816, lng: -121.4944 },
  { c: 'san francisco', s: 'CA', lat: 37.7749, lng: -122.4194 },
  { c: 'los angeles', s: 'CA', lat: 34.0522, lng: -118.2437 },
  { c: 'laguna hills', s: 'CA', lat: 33.5953, lng: -117.6981 },
  { c: 'san diego', s: 'CA', lat: 32.7157, lng: -117.1611 },
];

// extra place-name tokens that should snap to a known city
const TOKENS = [
  ['crofton', 'crofton'], ['laguna', 'laguna hills'], ['augustine', 'st augustine'],
  ['monroe', 'monroe'], ['hampton', 'new york'], ['peoria', 'peoria'], ['waterloo', 'waterloo'],
  ['milford', 'boston'], ['cedar', 'baltimore'], ['oak', 'columbus'], ['pine', 'charlotte'],
  ['river', 'pittsburgh'], ['harbor', 'virginia beach'], ['bay', 'tampa'], ['maple', 'lakewood'],
];

export const US_STATE_LIST = [...new Set(US_CITIES.map((x) => x.s))].sort();

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

export function geoForFacility(name) {
  const lower = String(name || '').toLowerCase();
  let base = null;
  // 1) exact city token in the name
  for (const city of US_CITIES) { if (lower.includes(city.c)) { base = city; break; } }
  // 2) fuzzy place tokens
  if (!base) { for (const [tok, cityName] of TOKENS) { if (lower.includes(tok)) { base = US_CITIES.find((x) => x.c === cityName); break; } } }
  // 3) deterministic fallback by hash
  const h = hash(lower || 'x');
  if (!base) base = US_CITIES[h % US_CITIES.length];
  const dlat = ((h % 1000) / 1000 - 0.5) * 0.5;
  const dlng = (((Math.floor(h / 1000)) % 1000) / 1000 - 0.5) * 0.5;
  return { lat: +(base.lat + dlat).toFixed(4), lng: +(base.lng + dlng).toFixed(4), state: base.s, city: base.c };
}

// Privacy-friendly display name: first name only, plus last initial (e.g. "Mordy F.").
export function shortName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[parts.length - 1][0].toUpperCase() + '.';
}

// ---------------------------------------------------------------------------
// East-coast-weighted DEMO data for the Equipment Map. Used only when there is
// no real deployed-cart data yet (e.g. fresh-data mode). As soon as real carts
// are assigned to facilities, the live data takes over automatically.
// ---------------------------------------------------------------------------
const _CART_TYPES = [['EDAN Cart', 'EDAN'], ['VS8 Cart', 'VS8'], ['Accutor Cart', 'Accutor']];
const _REGIONALS = ['Rosa Diaz', 'Tim Boyd', 'Dana Ruiz', 'Marcus Lee'];
const _DEMO_FAC = [
  { name: 'Maple SNF', city: 'lakewood', s: 'NJ', lat: 40.0978, lng: -74.2176, carts: 9, reg: 0, oos: 1 },
  { name: 'Bayview Center', city: 'toms river', s: 'NJ', lat: 39.9537, lng: -74.1979, carts: 12, reg: 0, oos: 0 },
  { name: 'Newark Rehab', city: 'newark', s: 'NJ', lat: 40.7357, lng: -74.1724, carts: 7, reg: 1, oos: 0 },
  { name: 'Brooklyn Care', city: 'brooklyn', s: 'NY', lat: 40.6782, lng: -73.9442, carts: 14, reg: 1, oos: 1 },
  { name: 'Manhattan Health', city: 'new york', s: 'NY', lat: 40.7128, lng: -74.0060, carts: 11, reg: 1, oos: 0 },
  { name: 'Buffalo Senior Living', city: 'buffalo', s: 'NY', lat: 42.8864, lng: -78.8784, carts: 5, reg: 2, oos: 0 },
  { name: 'Liberty Rehab', city: 'philadelphia', s: 'PA', lat: 39.9526, lng: -75.1652, carts: 10, reg: 2, oos: 0 },
  { name: 'Steel City Care', city: 'pittsburgh', s: 'PA', lat: 40.4406, lng: -79.9959, carts: 6, reg: 2, oos: 1 },
  { name: 'Crofton Health', city: 'crofton', s: 'MD', lat: 39.0018, lng: -76.6863, carts: 8, reg: 3, oos: 0 },
  { name: 'Harbor View SNF', city: 'baltimore', s: 'MD', lat: 39.2904, lng: -76.6122, carts: 9, reg: 3, oos: 0 },
  { name: 'Bay State Rehab', city: 'boston', s: 'MA', lat: 42.3601, lng: -71.0589, carts: 13, reg: 3, oos: 0 },
  { name: 'Charter Oak Care', city: 'hartford', s: 'CT', lat: 41.7658, lng: -72.6734, carts: 6, reg: 3, oos: 1 },
  { name: 'Ocean State SNF', city: 'providence', s: 'RI', lat: 41.8240, lng: -71.4128, carts: 4, reg: 3, oos: 0 },
  { name: 'Old Dominion Care', city: 'richmond', s: 'VA', lat: 37.5407, lng: -77.4360, carts: 7, reg: 2, oos: 0 },
  { name: 'Tidewater Health', city: 'virginia beach', s: 'VA', lat: 36.8529, lng: -75.9780, carts: 5, reg: 2, oos: 0 },
  { name: 'Queen City Rehab', city: 'charlotte', s: 'NC', lat: 35.2271, lng: -80.8431, carts: 8, reg: 2, oos: 0 },
  { name: 'Palmetto Care', city: 'columbia', s: 'SC', lat: 34.0007, lng: -81.0348, carts: 5, reg: 2, oos: 1 },
  { name: 'St Augustine SNF', city: 'st augustine', s: 'FL', lat: 29.9012, lng: -81.3124, carts: 6, reg: 2, oos: 0 },
  { name: 'Sunshine Rehab', city: 'orlando', s: 'FL', lat: 28.5383, lng: -81.3792, carts: 10, reg: 2, oos: 0 },
  { name: 'Bayfront Care', city: 'tampa', s: 'FL', lat: 27.9506, lng: -82.4572, carts: 7, reg: 2, oos: 0 },
];
export function eastCoastDemoFacilities() {
  return _DEMO_FAC.map((f, idx) => {
    const carts = [];
    for (let i = 0; i < f.carts; i++) {
      const [ct, bp] = _CART_TYPES[(idx + i) % _CART_TYPES.length];
      let status = 'Deployed';
      if (i < f.oos) status = (i % 2 ? 'Incomplete' : 'Out of Service');
      carts.push({ id: 'demo-' + idx + '-' + i, code: 'CART-' + f.s + '-' + String(1001 + idx * 20 + i), cart_type: ct, bp_machine: bp, status, regional: _REGIONALS[f.reg] });
    }
    const statusCounts = {}; carts.forEach((c) => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });
    return { id: 'demo-fac-' + idx, name: f.name, regional: _REGIONALS[f.reg], state: f.s, city: f.city, lat: f.lat, lng: f.lng, cartCount: carts.length, statusCounts, carts };
  });
}
const _FIRST = ['Ava', 'Liam', 'Maya', 'Noah', 'Sofia', 'Ethan', 'Zoe', 'Owen', 'Nia', 'Eli', 'Iris', 'Leo', 'Mia', 'Jonah', 'Ruth', 'Shea', 'Dov', 'Rina', 'Ari', 'Tova'];
const _LAST = ['Reyes', 'Kaplan', 'Tran', 'Park', 'Gold', 'Brooks', 'Moss', 'Levin', 'Shah', 'Cohen', 'Weiss', 'Diaz'];
const _EAST_STATES = ['NJ', 'NY', 'PA', 'MD', 'MA', 'CT', 'RI', 'VA', 'NC', 'SC', 'FL'];
export function eastCoastDemoStaff() {
  const out = [];
  _EAST_STATES.forEach((st, si) => {
    const n = 2 + (si % 2);
    for (let i = 0; i < n; i++) {
      const nm = _FIRST[(si * 3 + i) % _FIRST.length] + ' ' + _LAST[(si + i) % _LAST.length];
      out.push({ name: nm, state: st, items: [
        { klass: 'laptop', code: 'LT-' + (2000 + si * 10 + i), status: 'Assigned' },
        { klass: 'cellphone', code: 'P-' + (300 + si * 10 + i), status: i % 3 === 0 ? 'Return Pending' : 'Assigned' },
      ] });
    }
  });
  return out;
}
