import { defineStore } from 'pinia';
import { ref, reactive, computed } from 'vue';
import type { ArchiveRecord, CategoryNode, Fonds, CategoryConfigItem } from '@/types';
import { initialRecords, initialCategoryTree } from '@/data';

export const useArchiveStore = defineStore('archive', () => {
  // ─── Records ───────────────────────────────
  const records = ref<ArchiveRecord[]>([...initialRecords]);
  const treeData = ref<CategoryNode[]>([...initialCategoryTree]);
  const selectedNode = ref<CategoryNode | null>(null);
  const searchQuery = ref('');

  // ─── Fonds ─────────────────────────────────
  const fanzongs = ref<Fonds[]>([]);
  const currentFanzongCode = ref('Z001');
  const fanzongCategories = reactive<Record<string, CategoryConfigItem[]>>({});

  // ─── Selection ─────────────────────────────
  const selectedRecordIds = ref<string[]>([]);

  // ─── Drawer ────────────────────────────────
  const drawerVisible = ref(false);
  const activeRecord = ref<ArchiveRecord | null>(null);
  const activeFileIndex = ref(0);

  // ─── Popups ────────────────────────────────
  const isUploadOpen = ref(false);
  const isCheckingBatch = ref(false);

  // ─── Computed ──────────────────────────────
  const filteredRecords = computed<ArchiveRecord[]>(() => {
    let result = records.value.filter((r) => r.archiveCode.startsWith(currentFanzongCode.value));

    if (selectedNode.value) {
      const node = selectedNode.value;
      if (node.type === 'fonds') {
        result = result.filter((r) => r.archiveCode.startsWith(node.code || ''));
      } else if (node.type === 'class') {
        const name = node.label;
        if (name === '会计凭证') result = result.filter((r) => r.archiveType === '记账凭证' || r.archiveType === '会计凭证');
        else if (name === '财务报表') result = result.filter((r) => r.archiveType === '财务报告' || r.archiveType === '财务报表');
        else result = result.filter((r) => r.archiveType === name);
      } else if (node.type === 'subclass') {
        const name = node.label.includes(' ') ? node.label.split(' ')[1] : node.label;
        if (name === '记账凭证') result = result.filter((r) => r.archiveType === '记账凭证' || r.archiveType === '会计凭证');
        else if (name === '财务报告') result = result.filter((r) => r.archiveType === '财务报告' || r.archiveType === '财务报表');
        else result = result.filter((r) => r.archiveType === name);
      } else if (node.type === 'period') {
        const code = node.code || '';
        result = result.filter((r) => r.year === code || r.archiveCode.includes(`-${code}-`) || r.month === code || (r.year + r.month) === code);
      }
    }

    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      result = result.filter((item) =>
        item.archiveCode.toLowerCase().includes(q) ||
        item.voucherNo.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q) ||
        item.amount.toString().includes(q) ||
        item.remarks?.toLowerCase().includes(q) ||
        item.components.some((c) => c.name.toLowerCase().includes(q)),
      );
    }

    return result;
  });

  // ─── Actions ───────────────────────────────
  function setRecords(data: ArchiveRecord[]): void { records.value = data; }
  function setTreeData(tree: CategoryNode[]): void { treeData.value = tree; }
  function setSelectedNode(node: CategoryNode | null): void { selectedNode.value = node; }
  function setSearchQuery(q: string): void { searchQuery.value = q; }
  function setFanzongs(f: Fonds[]): void { fanzongs.value = f; }
  function setCurrentFanzongCode(code: string): void { currentFanzongCode.value = code; }

  function setFanzongCategories(c: Record<string, CategoryConfigItem[]>): void {
    Object.keys(fanzongCategories).forEach((k) => delete fanzongCategories[k]);
    Object.entries(c).forEach(([k, v]) => { fanzongCategories[k] = v; });
  }

  function toggleRowSelect(id: string): void {
    const idx = selectedRecordIds.value.indexOf(id);
    if (idx > -1) selectedRecordIds.value.splice(idx, 1);
    else selectedRecordIds.value.push(id);
  }

  function toggleSelectAll(allIds: string[]): void {
    if (selectedRecordIds.value.length === allIds.length) selectedRecordIds.value = [];
    else selectedRecordIds.value = [...allIds];
  }

  function openDrawer(record: ArchiveRecord): void {
    drawerVisible.value = true;
    activeRecord.value = record;
    activeFileIndex.value = 0;
  }

  function closeDrawer(): void {
    drawerVisible.value = false;
    activeRecord.value = null;
  }

  function setActiveFileIndex(index: number): void { activeFileIndex.value = index; }
  function setIsUploadOpen(open: boolean): void { isUploadOpen.value = open; }
  function setIsCheckingBatch(checking: boolean): void { isCheckingBatch.value = checking; }

  return {
    records, treeData, selectedNode, searchQuery,
    fanzongs, currentFanzongCode, fanzongCategories,
    selectedRecordIds, drawerVisible, activeRecord, activeFileIndex,
    isUploadOpen, isCheckingBatch, filteredRecords,
    setRecords, setTreeData, setSelectedNode, setSearchQuery,
    setFanzongs, setCurrentFanzongCode, setFanzongCategories,
    toggleRowSelect, toggleSelectAll,
    openDrawer, closeDrawer, setActiveFileIndex,
    setIsUploadOpen, setIsCheckingBatch,
  };
});
