import { createRouter, createWebHistory } from 'vue-router';
import DashboardPage from '@/pages/DashboardPage.vue';

/*
  Self-healing lazy import. After a new deploy, an old browser tab may hold an
  index.html that references a now-missing hashed chunk; Netlify's SPA fallback
  then returns index.html (text/html) for that .js request, which throws
  "Failed to fetch dynamically imported module". We catch that once and force a
  hard reload so the browser fetches the current index + current chunk hashes.
*/
function lazy(loader) {
  return () =>
    loader().catch((err) => {
      const msg = String(err && err.message);
      const isChunkError =
        /dynamically imported module|Loading chunk|Importing a module script failed|MIME type/i.test(msg);
      const flag = 'wms_chunk_reloaded';
      if (isChunkError && !sessionStorage.getItem(flag)) {
        sessionStorage.setItem(flag, '1');
        window.location.reload();
        return new Promise(() => {}); // never resolve; page is reloading
      }
      throw err;
    });
}

const routes = [
  { path: '/', name: 'dashboard', component: DashboardPage },
  { path: '/inventory', name: 'inventory', component: lazy(() => import('@/pages/InventoryPage.vue')) },
  { path: '/assets', name: 'assets', component: lazy(() => import('@/pages/AssetsPage.vue')) },
  { path: '/equipment-maps', name: 'equipment-maps', component: lazy(() => import('@/pages/EquipmentMapsPage.vue')) },
  { path: '/purchase-orders', name: 'purchase-orders', component: lazy(() => import('@/pages/PurchaseOrdersPage.vue')) },
  { path: '/sales-orders', name: 'sales-orders', component: lazy(() => import('@/pages/SalesOrdersPage.vue')) },
  { path: '/returns', name: 'returns', component: lazy(() => import('@/pages/ReturnsPage.vue')) },
  { path: '/roles', name: 'roles', component: lazy(() => import('@/pages/RolesPage.vue')) },
  { path: '/vendors', name: 'vendors', component: lazy(() => import('@/pages/VendorsPage.vue')) },
  { path: '/users', name: 'users', component: lazy(() => import('@/pages/UsersPage.vue')) },
  { path: '/facilities', name: 'facilities', component: lazy(() => import('@/pages/FacilitiesPage.vue')) },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

// Once a navigation succeeds (chunk loaded fine), clear the one-shot reload flag.
router.afterEach(() => {
  try { sessionStorage.removeItem('wms_chunk_reloaded'); } catch (e) { /* ignore */ }
});

// Also catch chunk errors that surface via the router's error hook.
router.onError((err) => {
  const msg = String(err && err.message);
  if (/dynamically imported module|Loading chunk|Importing a module script failed|MIME type/i.test(msg)) {
    if (!sessionStorage.getItem('wms_chunk_reloaded')) {
      sessionStorage.setItem('wms_chunk_reloaded', '1');
      window.location.reload();
    }
  }
});

export default router;
