<script setup lang="ts">
import { computed } from 'vue';
import { Search, Filter, Grid, FileInput, FileSpreadsheet, Briefcase, Layers, Trash2, Inbox, Eye, CheckSquare } from 'lucide-vue-next';
import { useArchiveStore } from '@/store/archive';
import type { ArchiveRecord } from '@/types';

defineOptions({ name: 'ArchiveTable' });

const props = defineProps<{
  filteredRecords: ArchiveRecord[];
  selectedRecordIds: string[];
  selectedNode: { id: string | number; label: string; code?: string } | null;
  showDashboard?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggleRowSelect', id: string): void;
  (e: 'toggleSelectAll', allIds: string[]): void;
  (e: 'openDrawer', row: ArchiveRecord): void;
  (e: 'setActiveFileIndex', idx: number): void;
  (e: 'deleteRecord', id: string): void;
}>();

const store = useArchiveStore();
const searchQuery = computed({ get: () => store.searchQuery, set: (v) => store.setSearchQuery(v) });

const allChecked = computed({
  get: () => props.filteredRecords.length > 0 && props.filteredRecords.every((r) => props.selectedRecordIds.includes(r.id)),
  set: () => emit('toggleSelectAll', props.filteredRecords.map((r) => r.id)),
});

function selectAll(): void {
  emit('toggleSelectAll', props.filteredRecords.map((r) => r.id));
}

function getTypeBadge(type: string): string {
  if (type === '记账凭证' || type === '会计凭证') return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200';
  if (type === '会计账簿') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  if (type === '财务报告' || type === '财务报表') return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  return 'bg-slate-50 text-slate-600 ring-1 ring-slate-200';
}

const dashboardCards = [
  { title: 'Vouchers', total: 1250, done: 1250, icon: FileInput, color: 'text-blue-600', bg: 'bg-blue-100', bar: 'bg-blue-500' },
  { title: 'Ledgers', total: 45, done: 42, icon: Briefcase, color: 'text-amber-600', bg: 'bg-amber-100', bar: 'bg-amber-500' },
  { title: 'Reports', total: 12, done: 12, icon: FileSpreadsheet, color: 'text-emerald-600', bg: 'bg-emerald-100', bar: 'bg-emerald-500' },
  { title: 'Other Files', total: 320, done: 156, icon: Layers, color: 'text-slate-600', bg: 'bg-slate-200', bar: 'bg-slate-500' },
];
</script>

<template>
  <div class="bg-white border border-gray-200 shadow-sm rounded flex-1 flex flex-col min-h-0 overflow-hidden">
    <!-- Toolbar -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
      <div class="relative">
        <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input v-model="searchQuery" type="text" placeholder="Search archives..."
          class="bg-gray-100 border border-gray-300 rounded px-3 py-1 text-xs w-64 pl-9 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400" />
      </div>
      <div class="flex items-center gap-2 text-xs text-gray-400">
        <CheckSquare class="w-3.5 h-3.5" />
        <span>{{ props.selectedRecordIds.length }} / {{ props.filteredRecords.length }} selected</span>
      </div>
    </div>

    <!-- Filter banner -->
    <div v-if="selectedNode" class="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border-b border-blue-100/50">
      <span class="flex items-center gap-1.5 text-xs text-gray-600">
        <Filter class="w-3.5 h-3.5 text-blue-500" />
        <span>当前筛选：<strong class="text-blue-700">{{ selectedNode.label }}</strong>
          <span v-if="selectedNode.code" class="text-gray-400 ml-1">({{ selectedNode.code }})</span>
        </span>
      </span>
      <button @click="store.setSelectedNode(null)"
        class="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-white/50 transition-all">
        清除筛选
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto">
      <!-- Dashboard view -->
      <div v-if="showDashboard && selectedNode?.id === 'time-2026-05'" class="p-6 space-y-6">
        <div class="flex items-center gap-2 mb-4">
          <Grid class="w-5 h-5 text-indigo-500" />
          <h3 class="text-lg font-bold text-gray-800">2026 May Archive Digital Shelving Overview</h3>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div v-for="item in dashboardCards" :key="item.title"
            class="card-hover p-5">
            <div class="flex items-start justify-between mb-4">
              <div :class="[item.bg, 'p-3 rounded-xl']"><component :is="item.icon" :class="['w-5 h-5', item.color]" /></div>
              <span class="text-xs font-semibold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-md">
                {{ ((item.done / item.total) * 100).toFixed(0) }}% Done
              </span>
            </div>
            <h4 class="font-bold text-gray-800 text-lg mb-0.5">{{ item.title }}</h4>
            <p class="text-xs text-gray-400 mb-3">{{ item.done }} / {{ item.total }}</p>
            <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div :class="[item.bar, 'h-full rounded-full transition-all duration-500']"
                :style="{ width: `${(item.done / item.total) * 100}%` }" />
            </div>
          </div>
        </div>
      </div>

      <!-- Table -->
      <table v-else class="w-full text-xs text-left">
        <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-xs">
          <tr>
            <th class="p-3 w-10">
              <div class="flex items-center justify-center">
                <input type="checkbox" :checked="allChecked" @change="selectAll()"
                  class="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
              </div>
            </th>
            <th class="p-3">System ID</th>
            <th class="p-3">Voucher No.</th>
            <th class="p-3">Type</th>
            <th class="p-3 text-right">Amount (RMB)</th>
            <th class="p-3 text-center">Period</th>
            <th class="p-3 text-center">Retention</th>
            <th class="p-3">Integrity</th>
            <th class="p-3 text-center">Status</th>
            <th class="p-3 text-center w-28">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="row in filteredRecords" :key="row.id"
            class="hover:bg-blue-50 transition-colors cursor-pointer"
            :class="{ 'bg-blue-50/20': props.selectedRecordIds.includes(row.id) }"
            @click="$emit('openDrawer', row)">
            <td class="p-3" @click.stop>
              <div class="flex items-center justify-center">
                <input type="checkbox" :checked="props.selectedRecordIds.includes(row.id)"
                  @change="$emit('toggleRowSelect', row.id)"
                  class="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
              </div>
            </td>
            <td class="p-3 font-mono text-xs font-semibold text-gray-700">{{ row.archiveCode }}</td>
            <td class="p-3">
              <span class="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{{ row.voucherNo }}</span>
            </td>
            <td class="p-3">
              <span class="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full" :class="getTypeBadge(row.archiveType)">{{ row.archiveType }}</span>
            </td>
            <td class="p-3 text-right font-mono text-xs font-semibold text-gray-800">
              ¥{{ row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
            </td>
            <td class="p-3 text-center text-xs text-gray-400 font-mono">{{ row.year }}/{{ row.month }}</td>
            <td class="p-3 text-center">
              <span :class="row.retention === '永久' ? 'badge-orange' : 'badge-gray'">
                {{ row.retention }}
              </span>
            </td>
            <td class="p-3" @click.stop>
              <div class="flex items-center gap-1">
                <span :class="row.checks.real ? 'badge-green' : 'badge-orange'"
                  class="cursor-pointer"
                  @click="$emit('openDrawer', row); $emit('setActiveFileIndex', 1)">CA</span>
                <span :class="row.checks.complete ? 'badge-green' : 'badge-orange'"
                  class="cursor-pointer"
                  @click="$emit('openDrawer', row)">Hash</span>
                <span :class="row.checks.usable ? 'badge-green' : 'badge-orange'"
                  class="cursor-pointer"
                  @click="$emit('openDrawer', row)">Use</span>
                <span :class="row.checks.safe ? 'badge-green' : 'badge-orange'"
                  class="cursor-pointer"
                  @click="$emit('openDrawer', row)">Safe</span>
              </div>
            </td>
            <td class="p-3 text-center">
              <span :class="row.status === '已组卷' ? 'badge-gray' : 'badge-orange'">
                {{ row.status }}
              </span>
              <div v-if="row.volumeCode" class="text-[10px] font-mono text-gray-300 mt-0.5">{{ row.volumeCode }}</div>
            </td>
            <td class="p-3 text-center" @click.stop>
              <div class="flex items-center justify-center gap-1">
                <button @click="$emit('openDrawer', row)" class="btn-ghost text-xs">
                  View
                </button>
                <button @click="$emit('deleteRecord', row.id)" class="btn-ghost text-xs text-red-500 hover:text-red-700 hover:bg-red-50">
                  Delete
                </button>
              </div>
            </td>
          </tr>
          <!-- Empty state -->
          <tr v-if="filteredRecords.length === 0">
            <td colspan="10" class="py-20 text-center">
              <div class="flex flex-col items-center">
                <Inbox class="w-10 h-10 text-gray-200 mb-3" />
                <p class="text-sm font-medium text-gray-400">No records found</p>
                <p class="text-xs text-gray-300 mt-1">Try selecting a category or adjusting your search</p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
