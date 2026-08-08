import { describe, it, expect, beforeEach } from 'vitest';
import { useArchiveStore } from '../stores/archiveStore';
import { initialRecords } from '../data';
import { simulatedRecords, normalizeLegacyRecords } from '../data/simulationData';

// 件域自 P1-① 起不再内置仿真种子：测试显式播种（生成器保留为 fixture）
const seedRecords = [...normalizeLegacyRecords(initialRecords), ...simulatedRecords];

describe('ArchiveStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useArchiveStore.setState({
      records: seedRecords,
      selectedRecordIds: new Set(),
      searchQuery: '',
      selectedNode: null,
      currentFanzongCode: 'Z001',
      drawerVisible: false,
      activeRecord: null,
      isUploadOpen: false,
      isCheckingBatch: false,
    });
    // Recompute filtered records to match initial state
    useArchiveStore.getState().updateFilteredRecords();
  });

  it('starts with the correct number of records', () => {
    const { records, filteredRecords } = useArchiveStore.getState();
    expect(records.length).toBeGreaterThan(0);
    expect(filteredRecords.length).toBeGreaterThan(0);
  });

  it('filters records by fanzong code', () => {
    const store = useArchiveStore.getState();
    // Initially filtered by 'Z001'
    const initialFiltered = store.filteredRecords;
    expect(initialFiltered.every(r => r.archiveCode.startsWith('Z001'))).toBe(true);
  });

  it('toggles row selection correctly', () => {
    const { records, toggleRowSelect } = useArchiveStore.getState();
    const testId = records[0].id;

    // Select the first record
    toggleRowSelect(testId);
    expect(useArchiveStore.getState().selectedRecordIds.has(testId)).toBe(true);

    // Deselect the same record
    toggleRowSelect(testId);
    expect(useArchiveStore.getState().selectedRecordIds.has(testId)).toBe(false);
  });

  it('selects all records', () => {
    const { records, toggleSelectAll } = useArchiveStore.getState();
    const allIds = records.map(r => r.id);

    toggleSelectAll(allIds);
    expect(useArchiveStore.getState().selectedRecordIds.size).toBe(allIds.length);

    // Deselect all
    toggleSelectAll(allIds);
    expect(useArchiveStore.getState().selectedRecordIds.size).toBe(0);
  });

  it('filters records by search query', () => {
    const store = useArchiveStore.getState();
    store.setSearchQuery(store.records[0].voucherNo);

    const filtered = useArchiveStore.getState().filteredRecords;
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(r =>
      r.voucherNo.toLowerCase().includes(store.records[0].voucherNo.toLowerCase())
    )).toBe(true);
  });

  it('shows all records when search query is empty', () => {
    const store = useArchiveStore.getState();
    store.setSearchQuery('');

    const total = useArchiveStore.getState().records.filter(r => r.archiveCode.startsWith('Z001')).length;
    const filtered = useArchiveStore.getState().filteredRecords;
    expect(filtered.length).toBe(total);
  });

  it('opens and closes the drawer', () => {
    const { records, openDrawer, closeDrawer } = useArchiveStore.getState();

    openDrawer(records[0]);
    expect(useArchiveStore.getState().drawerVisible).toBe(true);
    expect(useArchiveStore.getState().activeRecord).toEqual(records[0]);

    closeDrawer();
    expect(useArchiveStore.getState().drawerVisible).toBe(false);
    expect(useArchiveStore.getState().activeRecord).toBeNull();
  });

  it('sets upload and batch states', () => {
    const store = useArchiveStore.getState();

    store.setIsUploadOpen(true);
    expect(useArchiveStore.getState().isUploadOpen).toBe(true);

    store.setIsCheckingBatch(true);
    expect(useArchiveStore.getState().isCheckingBatch).toBe(true);
  });
});
