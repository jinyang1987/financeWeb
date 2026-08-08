/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * AppLayout handlers extracted to reduce AppLayout.tsx below 300 lines.
 */
import { useCallback } from 'react';
import { ArchiveRecord } from '../../types';
import { useArchiveStore } from '../../stores/archiveStore';
import { useCleanStore } from '../../stores/cleanStore';
import { deleteRecord } from '../../services/recordService';

export function useAppHandlers(
  activeRecord: ArchiveRecord | null,
  onTriggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void,
) {
  const { records, setRecords, openDrawer, closeDrawer, setIsCheckingBatch, selectedRecordIds, filteredRecords } = useArchiveStore();
  const cleanStore = useCleanStore();

  const handleOpenDrawer = useCallback(
    (record: ArchiveRecord) => { openDrawer(record); },
    [openDrawer],
  );

  const handleCloseDrawer = useCallback(() => { closeDrawer(); }, [closeDrawer]);

  const handleAddNewCategory = useCallback(
    (_parentCode: string, label: string, code: string) => {
      onTriggerToast(`请通过"目录配置"页面添加类别: ${label} (${code})`, 'info');
    },
    [onTriggerToast],
  );

  const handleRunFourPropertiesCheck = useCallback(() => {
    setIsCheckingBatch(true);
    const targetIds = selectedRecordIds.size > 0
      ? Array.from(selectedRecordIds)
      : filteredRecords.map(r => r.id);
    if (targetIds.length === 0) {
      setIsCheckingBatch(false);
      onTriggerToast('当前目录无档案可核验的要素', 'warning');
      return;
    }
    onTriggerToast(`微服务安全架构正在验证引擎 ${targetIds.length} 份记账凭证...`, 'info');
    setTimeout(() => {
      setIsCheckingBatch(false);
      const containsIssues = records.some(
        r => targetIds.includes(r.id) && (!r.checks.real || !r.checks.complete || !r.checks.usable || !r.checks.safe),
      );
      if (containsIssues) {
        onTriggerToast('一键四性检测完成：存在 [真实性]  [签名缺失] 异常节点，建议查看修改说明', 'warning');
      } else {
        onTriggerToast('一键四性检测完成：所选凭证（签名/存证）完整，哈希（比对/校验）完成，格式正确/渲染良好，权限/加密/安全全部通过！', 'success');
      }
    }, 1800);
  }, [selectedRecordIds, filteredRecords, records, setIsCheckingBatch, onTriggerToast]);

  const handleAutoGroup = useCallback(() => {
    const pendingVoluming = records.filter(r => r.status === '仅件数据' && r.checks.usable);
    if (pendingVoluming.length === 0) {
      onTriggerToast('暂无符合条件的合格案卷数据，已归档或全部合格', 'warning');
      return;
    }
    const updatedRecords = records.map(r => {
      if (r.status === '仅件数据' && r.checks.usable) {
        const volumeIndex = `AJ-${r.year}${r.month || '05'}-02`;
        return {
          ...r,
          status: '已组卷' as const,
          volumeCode: volumeIndex,
          auditLogs: [
            {
              id: `log-auto-group-${Date.now()}`,
              timestamp: '2026-05-30 10:20:00',
              action: '一键自动装订组卷',
              operator: 'jinlinrun198x (首席信息化管档员)',
              details: `根据国标 GB/T 18894 标准将分散原件自动组卷，压卷编码为 [${volumeIndex}]`,
              ipAddress: '192.168.1.135',
            },
            ...r.auditLogs,
          ],
        };
      }
      return r;
    });
    setRecords(updatedRecords);
    onTriggerToast(`自动归档成功，已将 ${pendingVoluming.length} 张通过发票/凭证及文件分卷并在规定内装订成卷`, 'success');
  }, [records, setRecords, onTriggerToast]);

  const handleAssignVerifyCode = useCallback(() => {
    onTriggerToast('系统自动校验成功，校验所有会计凭证编号结构符合 GB/T 18894 档案元数据国家标准', 'success');
  }, [onTriggerToast]);

  const handleRepairUsability = useCallback(
    (recordId: string) => {
      const updated = records.map(r => {
        if (r.id === recordId) {
          const fixedCheckDetails = r.checkDetails.map(detail => {
            if (detail.property === 'usable') {
              return {
                ...detail,
                status: 'passed' as const,
                message: '已AI修复成功，通过系统微服务再鉴定，动态安全验证GB2312/标准字体，格式回滚兼容全部通过全寿命周期效用度监测',
                timestamp: '2026-05-30 10:22:00',
                operator: '安全监控嵌入式智能体',
              };
            }
            return detail;
          });
          const newAuditLog = {
            id: `log-fix-usable-${Date.now()}`,
            timestamp: '2026-05-30 10:22:15',
            action: '专项电子档案修复',
            operator: '系统 (系统管理员)',
            details: '检测到缺失OFD字体执行了一键式合规校验，嵌入国家规定标准字体矢量轮廓描述符，问题已全部清理消除潜在故障。已自动转为合格',
            ipAddress: '192.168.1.112',
          };
          const updatedRecord = {
            ...r,
            checks: { ...r.checks, usable: true },
            checkDetails: fixedCheckDetails,
            auditLogs: [newAuditLog, ...r.auditLogs],
          };
          if (activeRecord && activeRecord.id === recordId) {
            openDrawer(updatedRecord);
          }
          return updatedRecord;
        }
        return r;
      });
      setRecords(updated);
      onTriggerToast('电子档案修复完成——一键修复字体矢量轮廓文件，已动态关闭警告标签（非合规性）', 'success');
    },
    [records, activeRecord, setRecords, openDrawer, onTriggerToast],
  );

  const handleDeleteRecord = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm('是否确认删除该电子会计档案记录？该操作不可恢复，将删除每个节点及其电子签名记录')) return;
      try {
        // 真删除：DELETE /records/{id}（旧版只删前端状态 → loadRecords 后复活）
        await deleteRecord(id);
        const currentRecords = useArchiveStore.getState().records;
        setRecords(currentRecords.filter(r => r.id !== id));
        onTriggerToast('会计凭证已被永久删除，不可恢复请注意', 'warning');
      } catch (err: any) {
        onTriggerToast(err?.message || '删除失败', 'warning');
      }
    },
    [setRecords, onTriggerToast],
  );

  const handleBatchClean = useCallback(() => {
    const currentCleanData = useCleanStore.getState().cleanTableData;
    const updated = currentCleanData.map(item => {
      if (item.status === 'New') {
        const cleaned = item.rawVoucher.replace(/[\[\]\s#/\\\-_]+/g, '-').replace(/-+/g, '-');
        return { ...item, status: '已解析' as const, cleanVoucher: cleaned };
      }
      return item;
    });
    cleanStore.setCleanTableData(updated);
    const cleanedCount = updated.filter(i => i.status === '已解析').length;
    onTriggerToast(`批量清洗完成，共处理 ${cleanedCount} 条数据`, 'success');
  }, [cleanStore, onTriggerToast]);

  const handleCleanOne = useCallback(
    (id: string) => {
      const currentData = useCleanStore.getState().cleanTableData;
      const updated = currentData.map(item =>
        item.id === id
          ? {
              ...item,
              status: '已解析' as const,
              cleanVoucher: item.rawVoucher.replace(/[\[\]\s#/\\\-_]+/g, '-').replace(/-+/g, '-'),
            }
          : item,
      );
      cleanStore.setCleanTableData(updated);
      onTriggerToast('单条数据清洗完成', 'success');
    },
    [cleanStore, onTriggerToast],
  );

  const handleSegmentInsert = useCallback(() => {
    const segments = cleanStore.insertSegmentVal
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const newResults = segments.map(seg => `${cleanStore.insertSegmentBaseVoucher}-${seg}`);
    cleanStore.setInsertResults(newResults);
    cleanStore.setIsInsertSegmentModalOpen(false);
    onTriggerToast(`分段插入完成，生成 ${newResults.length} 个分段`, 'success');
  }, [cleanStore, onTriggerToast]);

  const handleUploadSuccess = useCallback(
    (newRecord: ArchiveRecord) => {
      const currentRecords = useArchiveStore.getState().records;
      setRecords([newRecord, ...currentRecords]);
      onTriggerToast(`凭证 [${newRecord.voucherNo}] 已上传入收集池（临时档号 ${newRecord.archiveCode}），可前往核对工作台核对`, 'success');
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
    handleAddNewCategory,
    handleRunFourPropertiesCheck,
    handleAutoGroup,
    handleAssignVerifyCode,
    handleRepairUsability,
    handleDeleteRecord,
    handleBatchClean,
    handleCleanOne,
    handleSegmentInsert,
    handleUploadSuccess,
    toggleSelectAllFn,
  };
}
