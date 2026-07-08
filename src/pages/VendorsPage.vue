<script setup>
import { ref, reactive, computed } from 'vue';
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
const vendors = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (store.vendors || []).filter((v) => !q || [v.name, v.contact, v.email, v.phone].join(' ').toLowerCase().includes(q));
});
const linkedCount = (id) => (store.items || []).filter((i) => i.vendor_id === id).length + (store.groups || []).filter((g) => g.vendor_id === id).length;

const show = ref(false);
const editingId = ref(null);
const form = reactive({ name: '', contact: '', email: '', phone: '', address: '', pay_terms: 'Net 30', deposit_percent: 0 });
function reset() { Object.assign(form, { name: '', contact: '', email: '', phone: '', address: '', pay_terms: 'Net 30', deposit_percent: 0 }); }
function openAdd() { editingId.value = null; reset(); show.value = true; }
function openEdit(v) { editingId.value = v.id; Object.assign(form, { name: v.name || '', contact: v.contact || '', email: v.email || '', phone: v.phone || '', address: v.address || '', pay_terms: v.pay_terms || 'Net 30', deposit_percent: v.deposit_percent || 0 }); show.value = true; }
function save() {
  if (!form.name.trim()) return toast.error('A vendor name is required.');
  if (editingId.value) { const r = store.updateVendor(editingId.value, { ...form }); if (r && r.error) return toast.error(r.error); toast.success('Vendor updated.'); }
  else { const r = store.addVendor({ ...form }); if (r && r.error) return toast.error(r.error); toast.success('Vendor added.'); }
  show.value = false;
}
function remove(v) { const r = store.removeVendor(v.id); if (r && r.error) return toast.error(r.error); toast.success(v.name + ' removed.'); }

const chips = computed(() => [
  { label: 'Vendors', value: (store.vendors || []).length },
  { label: 'Linked items & groups', value: (store.items || []).filter((i) => i.vendor_id).length + (store.groups || []).filter((g) => g.vendor_id).length },
]);
</script>

<template>
  <div>
    <Hero title="Vendors" subtitle="Suppliers you order from. Vendors link to items and item groups — never to assets." :chips="chips" />

    <Card title="All vendors" :sub="vendors.length + ' total'">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <input v-model="search" placeholder="Search name, contact, email…" class="h-9 px-3 rounded-lg border border-slate-300 text-sm flex-1 min-w-[220px]" />
        <Btn size="sm" @click="openAdd">+ Add vendor</Btn>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider"><tr>
            <th class="text-left px-4 py-2">Vendor</th>
            <th class="text-left px-4 py-2">Contact</th>
            <th class="text-left px-4 py-2">Email</th>
            <th class="text-left px-4 py-2">Phone</th>
            <th class="text-left px-4 py-2">Terms</th>
            <th class="text-right px-4 py-2">Linked</th>
            <th class="px-4 py-2"></th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="v in vendors" :key="v.id" class="hover:bg-slate-50/60">
              <td class="px-4 py-2.5"><div class="font-semibold text-slate-800">{{ v.name }}</div><div v-if="v.address" class="text-[11px] text-slate-400">{{ v.address }}</div></td>
              <td class="px-4 py-2.5 text-slate-600">{{ v.contact || '—' }}</td>
              <td class="px-4 py-2.5 text-slate-600">{{ v.email || '—' }}</td>
              <td class="px-4 py-2.5 text-slate-600">{{ v.phone || '—' }}</td>
              <td class="px-4 py-2.5"><Badge tone="slate">{{ v.pay_terms || 'Net 30' }}</Badge><span v-if="v.deposit_percent" class="text-[11px] text-slate-400 ml-1">{{ v.deposit_percent }}% dep</span></td>
              <td class="px-4 py-2.5 text-right tabular-nums text-slate-600">{{ linkedCount(v.id) }}</td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap"><button class="text-xs font-semibold text-indigo-600 hover:underline mr-2" @click="openEdit(v)">Edit</button><button class="text-xs font-semibold text-rose-600 hover:underline" @click="remove(v)">Remove</button></td>
            </tr>
            <tr v-if="!vendors.length"><td colspan="7" class="px-4 py-8 text-center text-slate-400">No vendors yet — add your first supplier.</td></tr>
          </tbody>
        </table>
      </div>
    </Card>

    <Modal v-if="show" :title="editingId ? 'Edit vendor' : 'Add vendor'" sub="Vendor master data — name, contact, and terms. Links to items and item groups." @close="show=false">
      <div class="grid grid-cols-2 gap-3">
        <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Vendor name <span class="text-rose-500">*</span></span><input v-model="form.name" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm"><span class="block text-slate-600 mb-1">Contact person</span><input v-model="form.contact" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm"><span class="block text-slate-600 mb-1">Phone</span><input v-model="form.phone" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Email</span><input v-model="form.email" type="email" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm col-span-2"><span class="block text-slate-600 mb-1">Address</span><input v-model="form.address" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
        <label class="text-sm"><span class="block text-slate-600 mb-1">Payment terms</span><select v-model="form.pay_terms" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm"><option>Net 30</option><option>Net 15</option><option>Net 60</option><option>Prepaid</option><option>Due on receipt</option></select></label>
        <label class="text-sm"><span class="block text-slate-600 mb-1">Deposit %</span><input v-model.number="form.deposit_percent" type="number" min="0" max="100" class="w-full h-9 px-3 rounded-lg border border-slate-300 text-sm" /></label>
      </div>
      <template #footer><Btn variant="secondary" @click="show=false">Cancel</Btn><Btn @click="save">{{ editingId ? 'Save vendor' : 'Add vendor' }}</Btn></template>
    </Modal>
  </div>
</template>
