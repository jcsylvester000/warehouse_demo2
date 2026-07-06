<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useWarehouseStore, persistWarehouse } from '@/stores/warehouse';
import { useBackendSync } from '@/composables/useBackendSync';
import { useToast } from '@/composables/useToast';
import { useLightbox } from '@/composables/useLightbox';
import { useAnnotations } from '@/composables/useAnnotations';
import { fmtDateTime } from '@/utils/format';
import { backendEnabled, apiHealth } from '@/utils/api';
import ToastStack from '@/components/ui/ToastStack.vue';
import DocumentViewer from '@/components/ui/DocumentViewer.vue';
import Modal from '@/components/ui/BaseModal.vue';
import Badge from '@/components/ui/Badge.vue';

const router = useRouter();
const store = useWarehouseStore();
const toast = useToast();
const lb = useLightbox();
const { showAnnotations, toggle: toggleNotes } = useAnnotations();

// Persist store → sessionStorage (cleared by the browser on tab/window close).
persistWarehouse(store);
// Live backend (Prisma + Neon): loads & saves shared data when VITE_API_URL is set.
useBackendSync(store);
// Sidebar indicator: is the shared (Neon) backend live?
const backendStatus = ref(backendEnabled() ? 'checking' : 'local');
if (backendEnabled()) apiHealth().then((h) => { backendStatus.value = h && h.ok ? 'live' : 'offline'; }).catch(() => { backendStatus.value = 'offline'; });

const nav = [
  { name: 'Warehouse Dashboard', to: '/', icon: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10', isNew: true },
  { name: 'Inventory', to: '/inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10' },
  { name: 'Assets', to: '/assets', icon: 'M4 7h16M4 12h16M4 17h10' },
  { name: 'Equipment Maps', to: '/equipment-maps', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m0 0L9 7', isNew: true },
  { name: 'Purchase Order', to: '/purchase-orders', icon: 'M3 7h18M5 7v13a1 1 0 001 1h12a1 1 0 001-1V7M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2' },
  { name: 'Sales Order', to: '/sales-orders', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2' },
  { name: 'Returns', to: '/returns', icon: 'M3 7h13a4 4 0 010 8h-3m0 0l3-3m-3 3l3 3' },
  { name: 'Roles & Permissions', to: '/roles', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', isNew: true },
];

const showNotif = ref(false);
function openNotif() { showNotif.value = true; }
const notifTone = (k) => ({ inventory: 'amber', po: 'blue', so: 'emerald', returns: 'violet', assets: 'indigo', dashboard: 'slate' }[k] || 'slate');
function goNotif(n) { store.markNotificationRead(n.id); showNotif.value = false; if (n.route && router.currentRoute.value.path !== n.route) router.push(n.route); }

function reset() {
  store.resetDemo();
  toast.info('Demo data reset.');
  if (router.currentRoute.value.path !== '/') router.push('/');
}
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- Sidebar -->
    <div class="hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col lg:w-64">
      <div class="flex flex-col h-full bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950">
        <div class="flex items-center h-16 px-4 border-b border-white/10 shrink-0 gap-2.5">
          <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-bold shadow-lg shadow-indigo-950/40">C</span>
          <span class="text-base font-bold tracking-tight text-white truncate">Carease Health</span>
        </div>
        <nav class="flex-1 overflow-y-auto mt-3 px-3 space-y-1">
          <p class="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400/70">Warehouse</p>
          <RouterLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors text-slate-300 hover:bg-white/10 hover:text-white"
            active-class="!bg-indigo-600 !text-white shadow-sm"
            exact-active-class="!bg-indigo-600 !text-white shadow-sm"
          >
            <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" :d="item.icon" />
            </svg>
            <span class="truncate">{{ item.name }}</span>
            <span v-if="item.isNew && showAnnotations" class="ml-auto text-[8px] font-extrabold tracking-wide px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-900">NEW</span>
          </RouterLink>

          <p class="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400/70">Other</p>
          <a class="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-slate-300/70 cursor-default">
            <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 17v-2a4 4 0 014-4h0a4 4 0 014 4v2M3 7h18" /></svg>
            <span class="truncate">Onboarding</span>
          </a>
          <a class="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-slate-300/70 cursor-default">
            <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
            <span class="truncate">Settings</span>
          </a>
        </nav>
        <div class="px-3 py-3 border-t border-white/10">
          <div class="px-3 pb-2 flex items-center gap-1.5 text-[10px] font-semibold" :title="'Backend: ' + backendStatus">
            <span class="w-2 h-2 rounded-full" :class="backendStatus==='live' ? 'bg-emerald-400' : backendStatus==='offline' ? 'bg-amber-400' : 'bg-slate-500'"></span>
            <span class="text-slate-300/80">{{ backendStatus==='live' ? 'Live · saving to Neon' : backendStatus==='offline' ? 'Backend offline — local' : backendStatus==='checking' ? 'Checking backend…' : 'Local demo (browser)' }}</span>
          </div>
          <button class="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-slate-300 rounded-lg hover:bg-white/10 hover:text-white transition-colors" @click="reset">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Reset demo data
          </button>
          <p class="px-3 pt-2 text-[10px] leading-snug text-slate-400/60">{{ backendStatus==='live' ? 'Data is saved to your shared database and persists across devices.' : 'Data lives in browser memory and is erased when this tab is closed.' }}</p>
        </div>
      </div>
    </div>

    <!-- Main column -->
    <div class="lg:pl-64">
      <header class="sticky top-0 z-30 flex items-center h-16 bg-white/90 backdrop-blur border-b border-slate-200 px-4 sm:px-6 lg:px-8">
        <div class="lg:hidden font-bold text-slate-900">Carease · Warehouse</div>
        <span class="hidden lg:inline text-xs font-semibold uppercase tracking-wider text-slate-400">Internal Operations Platform</span>
        <div class="ml-auto flex items-center gap-3">
          <!-- Demo "Change notes" toggle: ON shows the NEW labels + notes; OFF previews the real product -->
          <button
            class="hidden sm:inline-flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-full border text-xs font-semibold transition-colors"
            :class="showAnnotations ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'"
            :title="showAnnotations ? 'Change notes are showing — click to preview the real product' : 'Change notes hidden — click to show what changed'"
            @click="toggleNotes"
          >
            <span class="relative inline-flex h-4 w-7 items-center rounded-full transition-colors" :class="showAnnotations ? 'bg-emerald-500' : 'bg-slate-300'">
              <span class="inline-block h-3 w-3 transform rounded-full bg-white transition-transform" :class="showAnnotations ? 'translate-x-3.5' : 'translate-x-0.5'"></span>
            </span>
            <span>{{ showAnnotations ? 'Change notes: On' : 'Change notes: Off' }}</span>
          </button>
          <button class="relative inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 transition-colors" title="Notifications" @click="openNotif">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
            <span v-if="store.unreadNotifications" class="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">{{ store.unreadNotifications }}</span>
          </button>
          <div class="text-right leading-tight">
            <div class="text-sm font-semibold text-slate-800">Malky Locker</div>
            <div class="text-[11px] text-slate-500">Warehouse Manager</div>
          </div>
          <span class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 font-bold">ML</span>
        </div>
      </header>

      <!-- Loud warning: shown only when the backend is expected but unreachable (data is NOT being saved). -->
      <div v-if="backendStatus==='offline'" class="bg-amber-500 text-white text-[13px] font-semibold px-4 py-2 flex items-center justify-center gap-2 text-center">
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.74-3l-7.07-12a2 2 0 00-3.48 0L3.19 16a2 2 0 001.74 3z" /></svg>
        <span>Not connected to the database — changes are only kept in this browser and will be lost when the tab closes. Ask an admin to set the database connection.</span>
      </div>
      <main class="py-6 px-4 sm:px-6 lg:px-8 max-w-[1400px] mx-auto">
        <RouterView v-slot="{ Component }">
          <transition name="fade" mode="out-in"><component :is="Component" /></transition>
        </RouterView>
      </main>
    </div>

    <ToastStack />
    <DocumentViewer />

    <!-- Image lightbox: click any item/group picture anywhere to view it large -->
    <div v-if="lb.state.open" class="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-10" @click="lb.close()">
      <img :src="lb.state.src" :alt="lb.state.alt" class="max-w-full max-h-full rounded-xl shadow-2xl object-contain" @click.stop />
      <div v-if="lb.state.alt" class="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/90 text-sm font-medium bg-black/50 px-3 py-1 rounded-full">{{ lb.state.alt }}</div>
      <button class="absolute top-4 right-6 text-white/80 hover:text-white text-3xl leading-none" title="Close" @click="lb.close()">&times;</button>
    </div>

    <Modal v-if="showNotif" title="Notifications" :sub="store.unreadNotifications + ' unread of ' + store.notifications.length" wide @close="showNotif=false">
      <div class="flex items-center justify-end mb-3">
        <button class="text-xs font-semibold text-indigo-600 hover:underline" @click="store.markAllNotificationsRead()">Mark all as read</button>
      </div>
      <div class="space-y-2 max-h-[60vh] overflow-y-auto">
        <div v-for="n in store.notifications" :key="n.id" class="flex items-start gap-3 rounded-xl border px-3 py-2.5" :class="n.read ? 'border-slate-200 bg-white' : 'border-indigo-200 bg-indigo-50/40'">
          <span class="mt-0.5"><Badge :tone="notifTone(n.kind)">{{ n.kind }}</Badge></span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2"><span class="font-semibold text-slate-800 text-sm">{{ n.title }}</span><span v-if="!n.read" class="w-2 h-2 rounded-full bg-rose-500"></span></div>
            <p class="text-sm text-slate-600">{{ n.body }}</p>
            <div class="text-[10px] text-slate-400 mt-0.5">{{ fmtDateTime(n.at) }}</div>
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0">
            <button class="text-xs font-semibold text-indigo-600 hover:underline" @click="goNotif(n)">Go to area →</button>
            <button v-if="!n.read" class="text-[11px] text-slate-500 hover:underline" @click="store.markNotificationRead(n.id)">Mark read</button>
          </div>
        </div>
        <p v-if="!store.notifications.length" class="text-center text-slate-400 text-sm py-6">No notifications.</p>
      </div>
    </Modal>
  </div>
</template>
