import { createRouter, createWebHistory } from 'vue-router';
import DashboardPage from '@/pages/DashboardPage.vue';

const routes = [
  { path: '/', name: 'dashboard', component: DashboardPage },
  { path: '/inventory', name: 'inventory', component: () => import('@/pages/InventoryPage.vue') },
  { path: '/assets', name: 'assets', component: () => import('@/pages/AssetsPage.vue') },
  { path: '/equipment-maps', name: 'equipment-maps', component: () => import('@/pages/EquipmentMapsPage.vue') },
  { path: '/purchase-orders', name: 'purchase-orders', component: () => import('@/pages/PurchaseOrdersPage.vue') },
  { path: '/sales-orders', name: 'sales-orders', component: () => import('@/pages/SalesOrdersPage.vue') },
  { path: '/returns', name: 'returns', component: () => import('@/pages/ReturnsPage.vue') },
  { path: '/roles', name: 'roles', component: () => import('@/pages/RolesPage.vue') },
  { path: '/vendors', name: 'vendors', component: () => import('@/pages/VendorsPage.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
