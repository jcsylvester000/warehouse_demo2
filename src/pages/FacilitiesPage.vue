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
const isActive = (f) => f.active !== false;
const facilities = computed(() => { const q = search.value.trim().toLowerCase(); return (store.facilities || []).filter((f) => !q || [f.name, f.city, f.state, f.group, f.regional, f.status].join(' ').toLowerCase().includes(q)); });
const STATUS_TONE = { 'Onboarding':'blue','Planned':'amber','Shipping':'amber','Received':'emerald','Active':'emerald' };
const linkedUsers = (f) => store.usersByFacility(f.name);
const stateOf = (f) => f.state || ((f.city||'').split(', ').pop()) || '—';
const chips = computed(() => [ { label:'Facilities', value:(store.facilities||[]).length }, { label:'Active', value:(store.facilities||[]).filter(isActive).length }, { label:'Users linked', value:(store.users||[]).filter((u)=>store.facilityByName(u.facility)).length } ]);
function toggle(f){ store.toggleFacilityActive(f.id); toast.success(f.name + (isActive(f)?' set active':' set inactive')); }
const sel = ref(null);
const selUsers = computed(() => sel.value ? store.usersByFacility(sel.value.name) : []);
</script>
<template>
  <div>
    <Hero title="Facilities" subtitle="Healthcare facilities, their region and onboarding, and the users linked to them." :chips="chips" />
    <Card title="All facilities" :sub="facilities.length + ' shown'">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <input v-model="search" placeholder="Search name, state, group…" class="h-9 px-3 rounded-lg border border-slate-300 text-sm flex-1 min-w-[220px]" />
        <Btn size="sm" @click="toast.info('Add Facility — admin console coming soon.')">+ Add facility</Btn>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider"><tr>
            <th class="text-left px-4 py-2">Facility</th><th class="text-left px-4 py-2">State</th><th class="text-left px-4 py-2">Group</th>
            <th class="text-left px-4 py-2">Onboard</th><th class="text-left px-4 py-2">Ambassador</th><th class="text-left px-4 py-2">Users</th>
            <th class="text-left px-4 py-2">Status</th><th class="px-4 py-2"></th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="f in facilities" :key="f.id" class="hover:bg-slate-50/60">
              <td class="px-4 py-2.5"><div class="font-semibold text-slate-800">{{ f.name }}</div><div class="text-[11px] text-slate-400">{{ f.city }}</div></td>
              <td class="px-4 py-2.5"><Badge tone="slate">{{ stateOf(f) }}</Badge></td>
              <td class="px-4 py-2.5 text-slate-600">{{ f.group || '—' }}</td>
              <td class="px-4 py-2.5"><Badge :tone="STATUS_TONE[f.status]||'slate'">{{ f.status || '—' }}</Badge></td>
              <td class="px-4 py-2.5 text-slate-600">{{ f.ambassador || f.regional || '—' }}</td>
              <td class="px-4 py-2.5"><button v-if="linkedUsers(f).length" class="text-indigo-600 hover:underline font-medium" @click="sel=f">{{ linkedUsers(f).length }} linked</button><span v-else class="text-slate-400">—</span></td>
              <td class="px-4 py-2.5"><button class="inline-flex items-center" @click="toggle(f)"><span class="w-9 h-5 rounded-full transition-colors relative inline-block" :class="isActive(f)?'bg-emerald-500':'bg-slate-300'"><span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" :class="isActive(f)?'left-[18px]':'left-0.5'"></span></span></button></td>
              <td class="px-4 py-2.5 text-right"><button class="text-xs font-semibold text-indigo-600 hover:underline" @click="sel=f">View</button></td>
            </tr>
            <tr v-if="!facilities.length"><td colspan="8" class="px-4 py-8 text-center text-slate-400">No facilities match.</td></tr>
          </tbody>
        </table>
      </div>
    </Card>
    <Modal v-if="sel" :title="sel.name" :sub="sel.city" wide @close="sel=null">
      <div class="grid md:grid-cols-2 gap-4">
        <div class="space-y-1.5 text-sm">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Facility</div>
          <div><span class="text-slate-400">Address</span> · {{ sel.address }}</div>
          <div><span class="text-slate-400">Group</span> · {{ sel.group || '—' }} · EMR {{ sel.emr || '—' }}</div>
          <div><span class="text-slate-400">Regional</span> · {{ sel.regional }}</div>
          <div><span class="text-slate-400">Onboard</span> · {{ sel.status }}<span v-if="sel.onboard_date"> · {{ sel.onboard_date }}</span></div>
        </div>
        <div class="space-y-2">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Linked users</div>
          <div v-for="u in selUsers" :key="u.id" class="flex items-center gap-2.5 rounded-lg ring-1 ring-slate-200 px-3 py-2">
            <span class="h-7 w-7 shrink-0 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px] font-bold">{{ (u.name||'?').split(' ').map((p)=>p[0]).slice(0,2).join('') }}</span>
            <div class="flex-1 min-w-0"><div class="font-semibold text-slate-800 text-sm">{{ u.name }}</div><div class="text-[11px] text-slate-400">{{ u.title || u.role }}</div></div>
            <Badge tone="slate">{{ u.role }}</Badge>
          </div>
          <div v-if="!selUsers.length" class="text-sm text-slate-400">No users linked to this facility.</div>
        </div>
      </div>
    </Modal>
  </div>
</template>
