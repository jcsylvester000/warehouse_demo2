<script setup>
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useWarehouseStore, TODAY } from '@/stores/warehouse';
import { useToast } from '@/composables/useToast';
import { useDocViewer } from '@/composables/useDocViewer';
import { fmtDateTime } from '@/utils/format';
import Hero from '@/components/ui/Hero.vue';
import Card from '@/components/ui/Card.vue';
import Badge from '@/components/ui/Badge.vue';
import Btn from '@/components/ui/BaseButton.vue';
import Modal from '@/components/ui/BaseModal.vue';
import ReqTag from '@/components/ui/ReqTag.vue';

const store = useWarehouseStore();
const router = useRouter();
function onChip(c) { if (c.route) router.push(c.route); else if (c.tab) tab.value = c.tab; } // D1: dashboard tiles open the underlying view
const toast = useToast();
const docViewer = useDocViewer();
function viewDoc(name, kind, facility, order) { docViewer.open({ name, kind, facility, order }); }
const tab = ref('calendar');
const ticketFilter = ref('assigned');

/* Users — warehouse-scoped add / remove */
const showAddUser = ref(false);
const newUser = reactive({ name: '', role: 'Warehouse Employee', facility: 'All facilities' });
// Roles come from the defined warehouse role set (Roles & Permissions page) — extensible.
const roleOptions = computed(() => Array.from(new Set(['Warehouse Manager', 'Warehouse Employee', ...store.roles.map((r) => r.name)])));
function openAddUser() {
  Object.assign(newUser, { name: '', role: 'Warehouse Employee', facility: 'All facilities' });
  showAddUser.value = true;
}
function saveUser() {
  if (!newUser.name.trim()) return toast.error('Name is required.');
  store.addUser({ name: newUser.name, role: newUser.role, program: 'Warehouse', facility: newUser.facility });
  toast.success('User added (warehouse scope).');
  showAddUser.value = false;
}
function removeUser(u) {
  store.removeUser(u.id);
  toast.info('User removed from warehouse scope.');
}

/* Facility record management (manager: edit fields, notes, attachments, messages) */
const showFacility = ref(false);
const facility = ref(null);
const msgText = ref('');
function openFacility(f) {
  facility.value = f;
  msgText.value = '';
  showFacility.value = true;
}
function onFacilityFile(e) {
  const f = e.target.files && e.target.files[0];
  if (f && facility.value) store.addFacilityAttachment(facility.value.id, f.name);
  e.target.value = '';
}
function sendMessage() {
  if (!msgText.value.trim()) return;
  store.sendFacilityMessage(facility.value.id, msgText.value);
  msgText.value = '';
}

const YEAR = 2026;
const MONTH = 5; // June (0-based)
const monthName = 'June 2026';
const firstDow = new Date(YEAR, MONTH, 1).getDay();
const daysInMonth = new Date(YEAR, MONTH + 1, 0).getDate();

const cells = computed(() => {
  const events = store.calendarEvents;
  const out = [];
  for (let i = 0; i < firstDow; i++) out.push({ blank: true });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = '2026-06-' + String(d).padStart(2, '0');
    out.push({ day: d, date, isToday: date === TODAY, events: events.filter((e) => e.date === date) });
  }
  return out;
});

const chips = computed(() => [
  { label: 'Onboards (June)', value: store.facilities.filter((f) => f.onboard_date).length, clickable: true, tab: 'facilities' },
  { label: 'Carts to ship', value: store.facilities.reduce((s, f) => s + (f.cart_shipment_date && f.status !== 'Received' ? f.carts_needed || 0 : 0), 0), clickable: true, tab: 'facilities' },
  { label: 'To receive', value: store.facilitiesAwaitingReceipt.length, clickable: true, route: '/assets', danger: store.facilitiesAwaitingReceipt.length > 0 }, // D3: real inbound count, click → receive
  { label: 'Open tickets', value: store.tickets.filter((t) => t.kind === 'assigned').length, clickable: true, tab: 'tickets' },
  { label: 'New activity', value: store.newActivityCount, danger: store.newActivityCount > 0, clickable: true, tab: 'calendar' },
]);

const evClass = (t) => ({ onb: 'bg-indigo-50 text-indigo-700', ship: 'bg-amber-50 text-amber-700', reg: 'bg-slate-100 text-slate-500', rec: 'bg-emerald-50 text-emerald-700' }[t] || 'bg-slate-100');

/* Contextual day view — phase 1 (plan) + phase 2 (schedule), actionable here.
   Shows only this day's onboard + schedule and the facilities involved. */
const showDay = ref(false);
const dayDate = ref('');
const dayEvents = ref([]);
const dayFacilityIds = ref([]);
function openDay(c) {
  if (c.blank || !c.events.length) return;
  dayDate.value = c.date;
  dayEvents.value = c.events;
  dayFacilityIds.value = Array.from(new Set(c.events.map((e) => e.facility_id).filter(Boolean)));
  showDay.value = true;
}
const dayFacilities = computed(() => dayFacilityIds.value.map((id) => store.facilityById(id)).filter(Boolean));
function markShipped(f) {
  if (!f.cart_shipment_date) return toast.error('Set a cart shipment date first.');
  f.status = 'Shipping';
  toast.success('Carts marked shipped for ' + f.name + '.');
}

const tickets = computed(() => store.tickets.filter((t) => t.kind === ticketFilter.value));
const ticketTone = (p) => ({ High: 'rose', Medium: 'amber', Low: 'slate', Support: 'blue' }[p] || 'slate');
</script>

<template>
  <div>
    <Hero title="Warehouse Manager Dashboard" subtitle="Malky's purpose-built view — onboarding schedule, cart shipments, facilities, users and tickets." :chips="chips" @chip="onChip" />

    <div class="grid gap-5 lg:grid-cols-3 items-start">
    <Card :padded="false" class="lg:col-span-2">
      <div class="flex items-center border-b border-slate-100 px-5">
        <button class="px-4 py-3 text-sm font-semibold border-b-2 transition-colors" :class="tab === 'calendar' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'" @click="tab = 'calendar'">Calendar</button>
        <button class="px-4 py-3 text-sm font-semibold border-b-2 transition-colors" :class="tab === 'facilities' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'" @click="tab = 'facilities'">Facilities</button>
        <button class="px-4 py-3 text-sm font-semibold border-b-2 transition-colors" :class="tab === 'users' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'" @click="tab = 'users'">Users</button>
        <button class="px-4 py-3 text-sm font-semibold border-b-2 transition-colors" :class="tab === 'tickets' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'" @click="tab = 'tickets'">Tasks &amp; tickets</button>
      </div>

      <!-- Calendar -->
      <div v-show="tab === 'calendar'" class="p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-slate-800">{{ monthName }} — my view</h3>
          <div class="flex gap-3 text-[11px] text-slate-500">
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-indigo-200"></span>Onboarding</span>
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-amber-200"></span>Cart shipment</span>
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-slate-200"></span>Regional</span>
            <span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded bg-emerald-200"></span>Received</span>
            <span class="inline-flex items-center gap-1"><span class="text-rose-500 font-bold">!</span>New</span>
          </div>
        </div>
        <div class="grid grid-cols-7 gap-1.5">
          <div v-for="d in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']" :key="d" class="text-[10px] font-bold uppercase tracking-wide text-slate-400 text-center pb-1">{{ d }}</div>
          <div
            v-for="(c, idx) in cells"
            :key="idx"
            class="min-h-[58px] rounded-lg border p-1 text-[10px]"
            :class="[c.blank ? 'border-transparent' : 'border-slate-200', c.isToday ? 'ring-2 ring-indigo-500 border-indigo-300' : '', !c.blank && c.events.length ? 'cursor-pointer hover:bg-slate-50' : '']"
            @click="openDay(c)"
          >
            <template v-if="!c.blank">
              <div class="font-semibold text-slate-500 flex items-center justify-between"><span>{{ c.day }}</span><span v-if="c.events.some(e=>e.new)" class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold" title="New activity">!</span></div>
              <div v-for="(e, i) in c.events" :key="i" class="mt-1 px-1.5 py-0.5 rounded font-semibold truncate" :class="[evClass(e.type), e.new ? 'ring-1 ring-rose-300' : '']"><span v-if="e.new" class="text-rose-600 font-bold">! </span>{{ e.label }}</div>
            </template>
          </div>
        </div>
        <p class="mt-2 text-[11px] text-slate-400">Click a day with events for the contextual day view. <span class="text-rose-500 font-bold">!</span> marks new activity.</p>
      </div>

      <!-- Facilities (editable cart fields) -->
      <div v-show="tab === 'facilities'" class="overflow-x-auto">
        <div class="px-5 py-3 text-xs text-slate-500 flex items-center gap-2 border-b border-slate-100">Cart fields (<b>carts needed</b>, <b>cart shipment date</b>) are new, manager-fillable. Editing the shipment date drives the calendar entry.</div>
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider"><tr>
            <th class="px-5 py-2.5 text-left font-semibold">Facility</th><th class="px-5 py-2.5 text-left font-semibold">Provider</th><th class="px-5 py-2.5 text-left font-semibold">Care Companion</th><th class="px-5 py-2.5 text-left font-semibold">Regional</th><th class="px-5 py-2.5 text-left font-semibold">Floor plan</th><th class="px-5 py-2.5 text-left font-semibold">Carts needed</th><th class="px-5 py-2.5 text-left font-semibold">Cart ship date</th><th class="px-5 py-2.5 text-left font-semibold">Status</th><th class="px-5 py-2.5"></th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="f in store.facilities" :key="f.id" class="hover:bg-slate-50/60">
              <td class="px-5 py-3"><div class="font-medium text-slate-800">{{ f.name }}</div><div class="text-xs text-slate-500">{{ f.city }}</div></td>
              <td class="px-5 py-3 text-slate-600">{{ f.provider }}</td><td class="px-5 py-3 text-slate-600">{{ f.care_companion }}</td><td class="px-5 py-3 text-slate-600">{{ f.regional }}</td>
              <td class="px-5 py-3"><Badge v-if="f.floor_plan" tone="indigo" class="cursor-pointer hover:ring-2 hover:ring-indigo-200" @click="viewDoc(f.floor_plan,'floorplan',f)">📎 file</Badge><span v-else class="text-slate-400 text-xs">— none —</span></td>
              <td class="px-5 py-3"><input v-model.number="f.carts_needed" type="number" min="0" placeholder="—" class="w-16 h-8 px-2 rounded border border-amber-300 bg-amber-50/40 text-sm" /></td>
              <td class="px-5 py-3"><input v-model="f.cart_shipment_date" type="date" class="h-8 px-2 rounded border border-amber-300 bg-amber-50/40 text-sm" /></td>
              <td class="px-5 py-3"><Badge :tone="f.status === 'Received' ? 'emerald' : f.status === 'Shipping' ? 'amber' : 'slate'">{{ f.status }}</Badge></td>
              <td class="px-5 py-3 text-right"><Btn variant="ghost" size="sm" @click="openFacility(f)">Manage</Btn></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Users -->
      <div v-show="tab === 'users'" class="overflow-x-auto">
        <div class="px-5 py-3 flex items-center gap-2 border-b border-slate-100">
          <p class="text-xs text-slate-500">All users, regardless of program. Add / remove is <b>scoped to the warehouse</b> only — not global removal.</p>
          <Btn size="sm" class="ml-auto" @click="openAddUser()">+ Add user</Btn>
        </div>
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider"><tr><th class="px-5 py-2.5 text-left font-semibold">Name</th><th class="px-5 py-2.5 text-left font-semibold">Role</th><th class="px-5 py-2.5 text-left font-semibold">Program</th><th class="px-5 py-2.5 text-left font-semibold">Facility</th><th class="px-5 py-2.5"></th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="u in store.users" :key="u.id" class="hover:bg-slate-50/60">
              <td class="px-5 py-3 flex items-center gap-2.5"><span class="h-8 w-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 flex items-center justify-center text-xs font-bold">{{ u.name.split(' ').map((p) => p[0]).join('') }}</span><span class="font-medium text-slate-800">{{ u.name }}</span></td>
              <td class="px-5 py-3 text-slate-600">{{ u.role }}</td><td class="px-5 py-3"><Badge :tone="u.program === 'Warehouse' ? 'violet' : 'slate'">{{ u.program }}</Badge></td><td class="px-5 py-3 text-slate-600">{{ u.facility }}</td>
              <td class="px-5 py-3 text-right"><Btn v-if="u.program === 'Warehouse'" variant="ghost" size="sm" @click="removeUser(u)">Remove</Btn><span v-else class="text-[10px] text-slate-300 uppercase tracking-wide pr-2">out of scope</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Tickets -->
      <div v-show="tab === 'tickets'" class="p-5">
        <div class="flex gap-1 mb-3">
          <button v-for="k in [['assigned', 'Assigned to me'], ['system', 'All system'], ['support', 'Support']]" :key="k[0]" class="px-3 h-8 rounded-lg text-xs font-medium" :class="ticketFilter === k[0] ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'" @click="ticketFilter = k[0]">{{ k[1] }}</button>
        </div>
        <div class="divide-y divide-slate-100 rounded-xl border border-slate-200">
          <div v-for="t in tickets" :key="t.id" class="flex items-center gap-3 px-4 py-3">
            <Badge :tone="ticketTone(t.priority)">{{ t.priority }}</Badge>
            <span class="flex-1 text-sm text-slate-700">{{ t.subject }}</span>
            <span class="text-xs text-slate-400 font-mono">{{ t.id }}</span>
          </div>
          <div v-if="!tickets.length" class="px-4 py-8 text-center text-slate-400 text-sm">No tickets in this view.</div>
        </div>
      </div>
    </Card>

      <div class="space-y-5">
        <Card :padded="false">
          <template #header><div class="flex items-center gap-2"><h2 class="text-sm font-semibold text-slate-900">Activity tracker</h2><Badge v-if="store.newActivityCount" tone="rose">{{ store.newActivityCount }} new</Badge></div></template>
          <div class="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
            <div v-for="a in store.activity" :key="a.id" class="flex items-start gap-2.5 px-4 py-2">
              <span class="w-2 h-2 mt-1.5 rounded-full shrink-0" :class="a.new ? 'bg-rose-500' : 'bg-slate-200'"></span>
              <div class="flex-1 min-w-0"><div class="text-sm text-slate-700 leading-snug">{{ a.text }}</div><div class="text-[10px] text-slate-400">{{ fmtDateTime(a.at) }}</div></div>
              <Badge v-if="a.new" tone="rose">new</Badge>
            </div>
          </div>
        </Card>
        <Card>
          <template #header><h2 class="text-sm font-semibold text-slate-900">Cart-fulfillment flow</h2></template>
          <ol class="space-y-2 text-xs">
            <li class="flex items-start gap-2"><span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white text-[10px] font-bold">1</span><span class="text-slate-600"><b class="text-slate-800">Plan</b> from the calendar — review floor plan, enter carts needed.</span></li>
            <li class="flex items-start gap-2"><span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold">2</span><span class="text-slate-600"><b class="text-slate-800">Schedule &amp; ship</b> — set cart shipment date; mark carts shipped.</span></li>
            <li class="flex items-start gap-2"><span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white text-[10px] font-bold">3</span><span class="text-slate-600"><b class="text-slate-800">Confirm receipt</b> — Assets ▸ Cart Received (BOL + photos).</span></li>
            <li class="flex items-start gap-2"><span class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold">✓</span><span class="text-slate-600"><b class="text-slate-800">Closed</b> — carts fulfilled &amp; documented.</span></li>
          </ol>
        </Card>
      </div>
    </div>

    <!-- Contextual day view (actionable: plan + schedule) -->
    <Modal v-if="showDay" :title="'Day view · ' + dayDate" sub="This day's onboard and schedule only — not the full APCM record set." wide @close="showDay = false">
      <div class="space-y-3">
        <div v-for="(e, i) in dayEvents" :key="i" class="rounded-lg px-3 py-2 text-sm font-medium" :class="evClass(e.type)">{{ e.label }}</div>

        <div v-for="f in dayFacilities" :key="f.id" class="rounded-xl border border-slate-200 p-4">
          <div class="flex items-center justify-between">
            <div class="font-semibold text-slate-800">{{ f.name }} <span class="text-xs font-normal text-slate-500">· {{ f.city }}</span></div>
            <Badge :tone="f.status === 'Received' ? 'emerald' : f.status === 'Shipping' ? 'amber' : 'slate'">{{ f.status }}</Badge>
          </div>
          <div class="grid grid-cols-2 gap-y-1.5 gap-x-4 mt-2 text-sm">
            <div class="text-slate-500">Provider</div><div class="text-slate-800">{{ f.provider }}</div>
            <div class="text-slate-500">Care Companion</div><div class="text-slate-800">{{ f.care_companion }}</div>
            <div class="text-slate-500">Regional</div><div class="text-slate-800">{{ f.regional }}</div>
            <div class="text-slate-500">Floor plan</div><div><Badge v-if="f.floor_plan" tone="indigo" class="cursor-pointer hover:ring-2 hover:ring-indigo-200" @click="viewDoc(f.floor_plan,'floorplan',f)">📎 {{ f.floor_plan }}</Badge><span v-else class="text-slate-400">— none —</span></div>
          </div>
          <!-- Phase 1: enter carts needed · Phase 2: schedule cart shipment (required) -->
          <div class="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-amber-50/50 ring-1 ring-amber-100 p-3">
            <label class="text-sm"><span class="block text-slate-600 mb-1 text-xs font-semibold">Carts needed</span><input v-model.number="f.carts_needed" type="number" min="0" placeholder="—" class="w-full h-9 px-3 rounded-lg border border-amber-300 bg-white text-sm" /></label>
            <label class="text-sm"><span class="block text-slate-600 mb-1 text-xs font-semibold">Cart shipment date <span class="text-rose-500">*</span></span><input v-model="f.cart_shipment_date" type="date" class="w-full h-9 px-3 rounded-lg border border-amber-300 bg-white text-sm" /></label>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <Btn variant="soft-primary" size="sm" :disabled="f.status === 'Shipping' || f.status === 'Received'" @click="markShipped(f)">Mark carts shipped</Btn>
            <span class="text-xs text-slate-400">Then confirm receipt in <b>Assets ▸ Cart Received</b> (BOL + photos).</span>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Add user (warehouse-scoped) -->
    <Modal v-if="showAddUser" title="Add user" sub="Warehouse scope only — role comes from the warehouse role set; program is locked to Warehouse." @close="showAddUser = false">
      <div class="grid grid-cols-2 gap-4">
        <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Name *</span><input v-model="newUser.name" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm"><span class="block text-slate-600 mb-1">Role</span><select v-model="newUser.role" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option v-for="r in roleOptions" :key="r" :value="r">{{ r }}</option></select></label>
        <div class="text-sm"><span class="block text-slate-600 mb-1">Program</span><div class="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500 flex items-center justify-between"><span>Warehouse</span><span class="text-[10px] uppercase tracking-wide text-slate-400">scope-locked</span></div></div>
        <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Facility</span><select v-model="newUser.facility" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option>All facilities</option><option v-for="f in store.facilities" :key="f.id" :value="f.name">{{ f.name }}</option></select></label>
      </div>
      <p class="mt-3 text-xs text-slate-500">A Warehouse Manager can add/remove users <b>within the warehouse only</b> — these users are created under the Warehouse program, never global.</p>
      <template #footer><Btn variant="secondary" @click="showAddUser = false">Cancel</Btn><Btn @click="saveUser">Add user</Btn></template>
    </Modal>

    <!-- Facility manage: custom fields, notes, attachments, messages -->
    <Modal v-if="showFacility && facility" :title="'Manage · ' + facility.name" sub="Manager can edit custom fields & notes, manage attachments, and send messages." wide @close="showFacility = false">
      <div class="grid md:grid-cols-2 gap-5">
        <div class="space-y-4">
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Custom fields</div>
            <div class="grid grid-cols-2 gap-3">
              <label class="text-sm"><span class="block text-slate-600 mb-1">Carts needed</span><input v-model.number="facility.carts_needed" type="number" min="0" class="w-full h-9 px-3 rounded-lg border border-amber-300 bg-amber-50/40 text-sm" /></label>
              <label class="text-sm"><span class="block text-slate-600 mb-1">Cart shipment date</span><input v-model="facility.cart_shipment_date" type="date" class="w-full h-9 px-3 rounded-lg border border-amber-300 bg-amber-50/40 text-sm" /></label>
            </div>
          </div>
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Notes</div>
            <textarea v-model="facility.notes" rows="4" placeholder="Onboarding notes…" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"></textarea>
          </div>
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Attachments</div>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <Badge v-for="a in facility.attachments" :key="a" tone="indigo" class="cursor-pointer hover:ring-2 hover:ring-indigo-200" @click="viewDoc(a, '', facility)">📎 {{ a }}</Badge>
              <span v-if="!facility.attachments.length" class="text-xs text-slate-400">No attachments yet.</span>
            </div>
            <input type="file" class="text-xs" @change="onFacilityFile" />
          </div>
          <div>
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Shipment documents (from Sales Orders) <ReqTag code="SO-4" text="V3 SO #4 — Open any SO to edit and upload attachments (BOL / proof of delivery); they also appear under the destination Facility." /></div>
            <div class="space-y-1.5">
              <div v-for="(d,di) in store.facilityShipmentDocs(facility.id)" :key="di" class="flex items-center gap-2 text-sm"><Badge :tone="d.kind==='BOL'?'blue':d.kind==='Proof of delivery'?'emerald':'slate'">{{ d.kind }}</Badge><span class="flex-1 text-indigo-700 hover:underline cursor-pointer" @click="viewDoc(d.name, d.kind, facility)">📎 {{ d.name }}</span><span class="font-mono text-[10px] text-slate-400">{{ d.so_number }}</span></div>
              <p v-if="!store.facilityShipmentDocs(facility.id).length" class="text-xs text-slate-400">No shipment documents yet — upload a BOL/POD on the order (Sales Order ▸ Open).</p>
            </div>
          </div>
        </div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Messages on this facility</div>
          <div class="flex gap-2 mb-3">
            <input v-model="msgText" placeholder="Write a message…" class="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-sm" @keyup.enter="sendMessage" />
            <Btn size="sm" @click="sendMessage">Send</Btn>
          </div>
          <div class="space-y-2 max-h-72 overflow-y-auto">
            <div v-for="m in facility.messages" :key="m.id" class="rounded-lg bg-slate-50 ring-1 ring-slate-100 px-3 py-2">
              <div class="flex items-center justify-between"><span class="text-xs font-semibold text-slate-700">{{ m.author }}</span><span class="text-[10px] text-slate-400">{{ fmtDateTime(m.at) }}</span></div>
              <p class="text-sm text-slate-600 mt-0.5">{{ m.text }}</p>
            </div>
            <p v-if="!facility.messages.length" class="text-xs text-slate-400">No messages yet.</p>
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>
