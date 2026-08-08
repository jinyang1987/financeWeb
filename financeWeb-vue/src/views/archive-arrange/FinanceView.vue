<script setup lang="ts">
import { ref, computed } from 'vue';
import { useArchiveStore } from '@/store/archive';
import ArchiveTable from '@/components/ArchiveTable.vue';
import type { ArchiveRecord } from '@/types';

defineOptions({ name: 'FinanceView' });

const store = useArchiveStore();

const quarters = [
  { id: 'Q1', name: 'Q1', months: [1, 2, 3] },
  { id: 'Q2', name: 'Q2', months: [4, 5, 6] },
  { id: 'Q3', name: 'Q3', months: [7, 8, 9] },
  { id: 'Q4', name: 'Q4', months: [10, 11, 12] },
];

const selectedQuarter = ref('Q2');
const selectedMonth = ref(5);
const currentQuarter = computed(() => quarters.find((q) => q.id === selectedQuarter.value));

function handleRowSelect(id: string): void { store.toggleRowSelect(id); }
function handleSelectAll(allIds: string[]): void { store.toggleSelectAll(allIds); }
function handleOpenDrawer(row: ArchiveRecord): void { store.openDrawer(row); }
function handleSetActiveFileIndex(idx: number): void { store.setActiveFileIndex(idx); }
function handleDeleteRecord(id: string): void {
  store.setRecords(store.records.filter((r) => r.id !== id));
}
</script>

<template>
  <div class="page-container flex flex-col min-h-0">
    <!-- Quarter/Month Selector -->
    <div class="shrink-0 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-4">
      <div class="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
        <div class="flex gap-2">
          <button v-for="q in quarters" :key="q.id"
            class="px-5 py-2 rounded-full text-sm font-medium transition-all cursor-pointer"
            :class="selectedQuarter === q.id ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'"
            @click="selectedQuarter = q.id; selectedMonth = q.months[0]">
            {{ q.name }}
          </button>
        </div>
        <div class="flex gap-1.5 ml-2">
          <button v-for="m in (currentQuarter?.months || [])" :key="m"
            class="w-9 h-9 rounded-lg text-xs font-medium transition-all cursor-pointer"
            :class="selectedMonth === m ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'"
            @click="selectedMonth = m">
            {{ m }}月
          </button>
        </div>
        <div class="text-xs text-slate-400 ml-auto">
          <span class="font-mono">{{ new Date().toLocaleDateString() }}</span>
        </div>
      </div>
    </div>

    <ArchiveTable
      :filteredRecords="store.filteredRecords"
      :selectedRecordIds="store.selectedRecordIds"
      :selectedNode="store.selectedNode"
      :showDashboard="false"
      @toggleRowSelect="handleRowSelect"
      @toggleSelectAll="handleSelectAll"
      @openDrawer="handleOpenDrawer"
      @setActiveFileIndex="handleSetActiveFileIndex"
      @deleteRecord="handleDeleteRecord"
    />
  </div>
</template>
