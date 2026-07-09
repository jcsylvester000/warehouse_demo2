<script setup>
import { ref, computed } from 'vue';
import { useWarehouseStore } from '@/stores/warehouse';
import { useToast } from '@/composables/useToast';
import Hero from '@/components/ui/Hero.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import Btn from '@/components/ui/BaseButton.vue';
import Modal from '@/components/ui/BaseModal.vue';
const store = useWarehouseStore();
const toast = useToast();
const search = ref('');
const isActive = (u) => u.active !== false;
const users = computed(() => { const q = search.value.trim().toLowerCase(); return (store.users || []).filter((u) => !q || [u.name, u.email, u.title, u.role, u.facility].join(' ').toLowerCase().includes(q)); });
const ROLE_TONE = { 'Regional Director':'violet','Provider':'blue','Care Companion':'emerald','Warehouse Manager':'amber' };
// Every role has a sensible default job title so the Title column is never blank.
// An explicit user.title always wins; otherwise we derive one from the role.
const ROLE_TITLE = { 'Regional Director':'Regional Director','Provider':'Provider','Care Companion':'Care Companion','Warehouse Manager':'Warehouse Manager','Warehouse Employee':'Warehouse Associate' };
const titleOf = (u) => (u && u.title) ? u.title : (ROLE_TITLE[u && u.role] || (u && u.role) || '—');
const initials = (n) => (n||'?').split(' ').map((p)=>p[0]).slice(0,2).join('').toUpperCase();
const chips = computed(() => [ { label:'Active', value:(store.users||[]).filter(isActive).length }, { label:'Inactive', value:(store.users||[]).filter((u)=>!isActive(u)).length }, { label:'Facilities linked', value:new Set((store.users||[]).map((u)=>u.facility).filter(Boolean)).size } ]);
function toggle(u){ store.toggleUserActive(u.id); toast.success(u.name + (isActive(u)?' set active':' set inactive')); }
const sel = ref(null);
const selFacility = computed(() => sel.value ? store.facilityByName(sel.value.facility) : null);
const selAssets = computed(() => sel.value ? store.userAssetsFor(sel.value.name) : []);
</script>
<template>
  <div>
    <Hero title="Users" subtitle="People across Carease and the facilities they are linked to." :chips="chips" />
    <Card title="All users" :sub="users.length + ' shown'">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <input v-model="search" placeholder="Search name, email, role, facility…" class="h-9 px-3 rounded-lg border border-slate-300 text-sm flex-1 min-w-[220px]" />
        <Btn size="sm" @click="toast.info('Add User — admin console coming soon.')">+ Add user</Btn>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider"><tr>
            <th class="text-left px-4 py-2">User</th><th class="text-left px-4 py-2">Title</th><th class="text-left px-4 py-2">Role</th>
            <th class="text-left px-4 py-2">Facility</th><th class="text-left px-4 py-2">Status</th><th class="px-4 py-2"></th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="u in users" :key="u.id" class="hover:bg-slate-50/60">
              <td class="px-4 py-2.5"><div class="flex items-center gap-2.5"><span class="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{{ initials(u.name) }}</span><div><div class="font-semibold text-slate-800">{{ u.name }}</div><div class="text-[11px] text-slate-400">{{ u.email }}</div></div></div></td>
              <td class="px-4 py-2.5 text-slate-600">{{ titleOf(u) }}</td>
              <td class="px-4 py-2.5"><Badge :tone="ROLE_TONE[u.role]||'slate'">{{ u.role }}</Badge></td>
              <td class="px-4 py-2.5"><button v-if="u.facility" class="text-indigo-600 hover:underline font-medium" @click="sel=u">{{ u.facility }}</button><span v-else class="text-slate-400">—</span></td>
              <td class="px-4 py-2.5"><button class="inline-flex items-center gap-1.5" @click="toggle(u)"><span class="w-9 h-5 rounded-full transition-colors relative inline-block" :class="isActive(u)?'bg-emerald-500':'bg-slate-300'"><span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="isActive(u)?'left-[18px]':'left-0.5'"></span></span><span class="text-xs" :class="isActive(u)?'text-emerald-700':'text-slate-400'">{{ isActive(u)?'Active':'Inactive' }}</span></button></td>
              <td class="px-4 py-2.5 text-right"><button class="text-xs font-semibold text-indigo-600 hover:underline" @click="sel=u">View</button></td>
            </tr>
            <tr v-if="!users.length"><td colspan="6" class="px-4 py-8 text-center text-slate-400">No users match.</td></tr>
          </tbody>
        </table>
      </div>
    </Card>
    <Modal v-if="sel" :title="sel.name" :sub="titleOf(sel)" wide @close="sel=null">
      <div class="grid md:grid-cols-2 gap-4">
        <div class="space-y-1.5 text-sm">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Account</div>
          <div><span class="text-slate-400">Email</span> · {{ sel.email }}</div>
          <div v-if="sel.phone"><span class="text-slate-400">Phone</span> · {{ sel.phone }}</div>
          <div><span class="text-slate-400">Role</span> · {{ sel.role }}<span v-if="sel.program"> · {{ sel.program }}</span></div>
          <div v-if="sel.address"><span class="text-slate-400">Address</span> · {{ sel.address }}</div>
        </div>
        <div class="space-y-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Linked facility</div>
          <div v-if="selFacility" class="rounded-lg ring-1 ring-slate-200 px-3 py-2"><div class="font-semibold text-slate-800">{{ selFacility.name }}</div><div class="text-[11px] text-slate-500">{{ selFacility.city }} · {{ selFacility.regional }} · {{ selFacility.status }}</div></div>
          <div v-else class="text-sm text-slate-400">{{ sel.facility || 'No facility linked.' }}</div>
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mt-3 mb-1">Assigned equipment</div>
          <div v-for="a in selAssets" :key="a.id" class="flex items-center gap-2 text-sm"><Badge tone="indigo">{{ a.item_type }}</Badge><span class="font-mono text-xs text-slate-600">{{ a.asset_tag }}</span><span class="text-slate-500">{{ a.item }}</span></div>
          <div v-if="!selAssets.length" class="text-sm text-slate-400">No equipment assigned.</div>
        </div>
      </div>
    </Modal>
  </div>
</template>
