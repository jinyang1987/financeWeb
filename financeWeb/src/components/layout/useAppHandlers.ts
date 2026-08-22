/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * AppLayout handlers extracted to reduce AppLayout.tsx below 300 lines.
 *
 * 2026-08-16 贯通审计清理：删除全部演示期假处理器——
 *   handleRunFourPropertiesCheck（setTimeout 假检测+编造检测结论）
 *   handleAutoGroup（纯前端改状态+编造操作日志/操作人/IP）
 *   handleAssignVerifyCode（纯假 toast）
 *   handleRepairUsability（编造修复记录/审计日志）
 *   handleBatchClean/handleCleanOne/handleSegmentInsert（依附已下线的 cleanStore 清洗功能）
 *   handleAddNewCategory（无消费者）
 * 真实四性检测走后端 /inspection/run（推送批次管道或检测端点），档案修复待后端能力落地后再提供。
 */
import { useCallback } from 'react';
import { ArchiveRecord } from '../../types';
import { useArchiveStore } from '../../stores/archiveStore';
import { deleteRecord } from '../../services/recordService';

export function useAppHandlers(
  activeRecord: ArchiveRecord | null,
  onTriggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void,
) {
  const { setRecords, openDrawer, closeDrawer, selectedRecordIds, filteredRecords } = useArchiveStore();

  const handleOpenDrawer = useCallback(
    (record: ArchiveRecord) => { openDrawer(record); },
    [openDrawer],
  );

  const handleCloseDrawer = useCallback(() => { closeDrawer(); }, [closeDrawer]);

  const handleDeleteRecord = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm('是否确认删除该电子会计档案记录？删除后将移入回收站，可恢复')) return;
      try {
        // 逻辑删除：DELETE /records/{id}（移入回收站，可恢复；v2.6）
        await deleteRecord(id);
        const currentRecords = useArchiveStore.getState().records;
        setRecords(currentRecords.filter(r => r.id !== id));
        // 同步全量件镜像（读侧页面口径一致）
        void useArchiveStore.getState().loadAllRecords();
        onTriggerToast('记录已移入回收站', 'warning');
      } catch (err: any) {
        onTriggerToast(err?.message || '删除失败', 'warning');
      }
    },
    [setRecords, onTriggerToast],
  );

  const handleUploadSuccess = useCallback(
    (newRecord: ArchiveRecord) => {
      const currentRecords = useArchiveStore.getState().records;
      setRecords([newRecord, ...currentRecords]);
      onTriggerToast(`凭证 [${newRecord.voucherNo}] 已上传入收集池（临时档号 ${newRecord.archiveCode}），可前往组卷工作台组卷`, 'success');
    },
    [setRecords, onTriggerToast],
  );

  const toggleSelectAllFn = useCallback(() => {
    if (selectedRecordIds.size === filteredRecords.length) {
      useArchiveStore.getState().setSelectedRecordIds(new Set());
    } else {
      useArchiveStore.getState().setSelectedRecordIds(new Set(filteredRecords.map(r => r.id)));
    }
  }, [selectedRecordIds, filteredRecords]);

  return {
    handleOpenDrawer,
    handleCloseDrawer,
    handleDeleteRecord,
    handleUploadSuccess,
    toggleSelectAllFn,
  };
}
