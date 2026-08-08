<script setup lang="ts">
import { useArchiveStore } from '@/store/archive';
import ArchiveTable from '@/components/ArchiveTable.vue';
import type { ArchiveRecord } from '@/types';

defineOptions({ name: 'ProjectView' });

const store = useArchiveStore();

function handleRowSelect(id: string): void { store.toggleRowSelect(id); }
function handleSelectAll(allIds: string[]): void { store.toggleSelectAll(allIds); }
function handleOpenDrawer(row: ArchiveRecord): void { store.openDrawer(row); }
function handleSetActiveFileIndex(idx: number): void { store.setActiveFileIndex(idx); }
function handleDeleteRecord(id: string): void {
  store.setRecords(store.records.filter((r) => r.id !== id));
}
</script>

<template>
  <div class="p-6 flex flex-col h-full min-h-0">
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
