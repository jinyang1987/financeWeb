import React, { useMemo, useEffect } from 'react';
import { useArchiveStore } from '../../stores/archiveStore';
import { useMetadataDisplayStore } from '../../stores/metadataDisplayStore';
import { getArchiveItemColumns, getArchiveItemDefaultColumns } from '../../config/metadataColumnMaps/archiveItemColumns';
import {
  getAllFieldIds,
  getDefaultVisibleIds,
} from '../../config/metadataContexts';
import { ArchiveTable } from '../../components/ArchiveTable';
import type { ArchiveRecord } from '../../types';

interface ViewPageProps {
  toggleRowSelect: (id: string) => void;
  toggleSelectAll: () => void;
  handleOpenDrawer: (row: ArchiveRecord) => void;
  setActiveFileIndex: (idx: number) => void;
  handleDeleteRecord: (id: string, e: React.MouseEvent) => void;
}

const TimeViewPage: React.FC<ViewPageProps> = (props) => {
  const store = useArchiveStore();
  const metaStore = useMetadataDisplayStore();

  // ── 表格列（从 archive-item 上下文配置读取） ──
  const archiveItemFieldIds = useMemo(() => getAllFieldIds('archive-item'), []);
  const archiveItemDefaultIds = useMemo(() => getDefaultVisibleIds('archive-item'), []);

  useEffect(() => {
    metaStore.initContext('archive-item', archiveItemFieldIds, archiveItemDefaultIds);
  }, [metaStore.initContext, archiveItemFieldIds, archiveItemDefaultIds]);

  const tableColumns = useMemo(() => {
    const visibleIds = metaStore.getVisibleIds('archive-item');
    if (visibleIds.length === 0) return getArchiveItemDefaultColumns();
    return getArchiveItemColumns(visibleIds);
  }, [metaStore.contexts['archive-item']?.fields]);

  return (
    <div className="flex-1 overflow-auto animate-in fade-in duration-200 p-6">
      <ArchiveTable
        filteredRecords={store.filteredRecords}
        selectedRecordIds={store.selectedRecordIds}
        selectedNode={store.selectedNode}
        toggleRowSelect={store.toggleRowSelect}
        toggleSelectAll={() => store.toggleSelectAll(store.filteredRecords.map(r => r.id))}
        handleOpenDrawer={props.handleOpenDrawer}
        setActiveFileIndex={props.setActiveFileIndex}
        handleDeleteRecord={props.handleDeleteRecord}
        columns={tableColumns}
      />
    </div>
  );
};

export default TimeViewPage;
