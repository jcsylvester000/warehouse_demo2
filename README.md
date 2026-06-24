#  Warehouse Demo - (WMS) · Vue 3 + Vite

A full Vue 3 single-page application (scaffolded the way you'd scaffold a React app
with `npm create vite`) that recreates the Warehouse section UI from the
`Carease-Portal` codebase and layers in the proposed enhancements from the four
access-review docs — so you can demo current behavior **and** what we want to build,
to the supervisor.

## Stack

- **Vue 3** (Composition API, `<script setup>` SFCs)
- **Vite 5** build tooling
- **Vue Router 4** (history mode)
- **Pinia** for state (one warehouse store)
- **Tailwind CSS v4** via `@tailwindcss/vite` (same Tailwind setup as the original app)

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Build / preview a production bundle:

```bash
npm run build
npm run preview
```

> Verified: `npm install` + `npm run build` complete cleanly (45 modules, per-page
> code-splitting, Tailwind compiled).

## Storage — wiped when the app closes

State lives in a **Pinia store mirrored to `sessionStorage`**:

- It persists while you click around and reload **within the same tab**.
- When you **close the tab or browser, the browser erases it automatically** — no
  data is written to disk. (We deliberately avoid `localStorage`, which would
  survive a close.)
- The sidebar has a **“Reset demo data”** button to restore the seed instantly.

See `src/stores/warehouse.js` → `persistWarehouse()` (called once from
`AppLayout.vue`) and the `resetDemo` action.

## Project structure

```
index.html
vite.config.js              # Vue + Tailwind v4 plugins, '@' → /src alias
src/
├── main.js                 # createApp + Pinia + Router
├── App.vue
├── assets/main.css         # @import "tailwindcss" + Inter theme
├── router/index.js         # 5 routes (lazy-loaded pages)
├── stores/warehouse.js     # seed data, getters, actions, sessionStorage persistence
├── composables/useToast.js
├── utils/format.js         # money / date / id helpers
├── components/
│   ├── AppLayout.vue       # sidebar (Warehouse nav incl. NEW Dashboard) + topbar
│   └── ui/                 # Card, Badge, BaseButton, Hero, BaseModal, Tag, ToastStack
└── pages/
    ├── DashboardPage.vue   # NEW Warehouse Manager dashboard
    ├── InventoryPage.vue
    ├── AssetsPage.vue
    ├── PurchaseOrdersPage.vue
    └── SalesOrdersPage.vue
```

## What it demonstrates

| Page | What's in the app | New in this update (NEW UPDATE) |
|---|---|---|
| **Warehouse Manager Dashboard** *(NEW)* | — | Whole page: calendar (onboarding + cart shipments + regional), contextual day view, Facilities tab with **editable cart fields**, Users directory, Tasks & tickets, cart-fulfillment flow |
| **Inventory** | Items / Group Items / Carts, search & filters, add/edit, adjust stock, stock logs | Group read-only counts + receiving fan-out — **NEW UPDATE** |
| **Assets** | Overview / Facility / User assets, assign | **Cart Received** step with **BOL + photo upload** — **NEW UPDATE** |
| **Purchase Order** | PO list + receiving that fans out to stock | **Multi-vendor toggle** + per-line vendor, and **Vendor-bill fan-out** on receive — **NEW UPDATE** |
| **Sales Order** | Draft → In Progress → Shipped → Completed, ship w/ short-stock | Multi-vendor sourcing via groups — **NEW UPDATE** |

In-app legend: a green **NEW UPDATE** tag marks features delivered in this update — they are built and part of the application, not optional suggestions.

### Try this in the demo

- **Dashboard ▸ Facilities** — set a *cart shipment date*; it appears on the
  **Calendar** instantly. Click a calendar day with events for the contextual view.
- **Purchase Order ▸ New PO** — tick *Allow multiple vendors*, give lines different
  vendors, save, **Receive** → stock rises on Inventory and **separate Vendor Bills**
  generate (open *Vendor Bills*).
- **Assets ▸ Cart Received** — confirm a receipt with a BOL + photos; the facility
  flips to *Received* and a receipt lands on the dashboard calendar.
- **Sales Order** — Confirm → Ship (capped by available stock) → Complete.

## Fidelity & scope

UI matches the original component system (Card, Badge, Button, gradient hero banner,
tab bars, table styling, Inter font, Tailwind, the dark indigo sidebar). This is a
**front-end showcase**: no backend, no real accounting-system call, and uploaded files are
referenced by name only (no binary is stored). It communicates intent to the
supervisor and the developer; it is not production code.

> `npm run dev` serves locally with no internet dependency. Only the Inter webfont
> loads from Google Fonts; everything else is bundled by Vite from `node_modules`.

## Action-register coverage (showcased in the app)

Every item from the action register is represented in the running app:

**Role & Permissions** → new **Roles & Permissions** page (`/roles`):
- Dedicated **Warehouse Manager** role/profile (not the Regional Director profile).
- “Manager” shown **renamed to “Warehouse Manager”** (renamed tag).
- Full line-by-line **permissions matrix** from the doc, grants editable (click to cycle).
- **Scope user add/remove to warehouse only** — Dashboard ▸ Users has scoped Add / Remove (non-warehouse users show “out of scope”).
- **Allow additional manager roles** — “+ Add manager role”.
- **Warehouse Employee** derived as a trimmed copy — “Derive Warehouse Employee”, then un-tick capabilities.
- **TO CONFIRM** items flagged with a CONFIRM chip: admin-dashboard access scope, admin view on all support tickets, facility-onboarding view/edit-only, and the **geolocation / geo-capping** clarification.

**Dashboard & Calendar** → Dashboard page: purpose-built WM dashboard; calendar with **Onboarding Schedule** entries (replacing “Visit APCM”), **cart shipment dates**, and the **regional schedule**; **date → facility → contextual day view**; **Facilities** tab; **Users directory**. Onboard date drives the calendar (the “confirm onboard date shows” / “locate field source” items are TO CONFIRM in the register).

**Facility Fields & Attachments** → **carts-needed** and **cart-shipment-date** custom fields (editable on Dashboard ▸ Facilities and the Manage modal); **Cart Received** step with **BOL + photos** (Assets); manager can **edit notes & custom fields, manage attachments, send messages** (Dashboard ▸ Facilities ▸ Manage).

**Multi-Vendor PO & Grouping** → multi-vendor PO toggle + **Vendor-bill fan-out** on receive; group **read-only** counts + **receiving fan-out** (Inventory); SO **multi-vendor sourcing** — all **NEW UPDATE**.

> The only remaining **TO CONFIRM** items are open permission decisions (e.g., geolocation, admin-dashboard scope), shown as **CONFIRM** chips on the Roles & Permissions page. Every delivered feature is badged **NEW UPDATE** — part of the application.

## Address lookup (Sales Order ▸ new address)

The "new address" picker uses **live autocomplete via OpenStreetMap (Nominatim)** for
the demo. It is debounced and US-scoped, and degrades gracefully:

- If the live service is reachable, you get real address suggestions.
- If it is blocked, offline, or rate-limited, the field falls back to a **local
  suggestion pool** (the app's own facility/regional addresses plus common NJ
  destinations) and shows a "live lookup unavailable" note — free-text entry always works.

> Production note: in the live build this control is swapped for **Google Maps Places
> Autocomplete**. OpenStreetMap is used here only to showcase the interaction without
> requiring an API key.
