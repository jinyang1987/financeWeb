/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * useArchiveStats — 全库统计聚合 hook
 *
 * 四域统计一次性计算（statsEngine 纯函数），驾驶舱与各统计页共用。
 */

import { useMemo, useEffect } from 'react';
import { useArchiveStore } from '../stores/archiveStore';
import { useVolumeStore } from '../stores/volumeStore';
import { useArchiveBoxStore } from '../stores/archiveBoxStore';
import { useSourceDocumentStore } from '../stores/sourceDocumentStore';
import { useBorrowStore } from '../stores/borrowStore';
import {
  computeInventory, computeLifecycle, computeUtilization, computeCompliance,
  type InventoryStats, type LifecycleStats, type UtilizationStats, type ComplianceStats,
} from '../utils/statsEngine';
import { todayStr } from '../utils/borrowEngine';

export interface ArchiveStats {
  inventory: InventoryStats;
  lifecycle: LifecycleStats;
  utilization: UtilizationStats;
  compliance: ComplianceStats;
}

export function useArchiveStats(): ArchiveStats {
  // 件级统计口径 = 全量件（池 ∪ 卷内件 ∪ 盒内件），不再只算未组卷池（2026-08-16 贯通修复）
  const records = useArchiveStore((s) => s.allRecords);
  const volumes = useVolumeStore((s) => s.volumes);
  const boxes = useArchiveBoxStore((s) => s.boxes);
  const sourceDocuments = useSourceDocumentStore((s) => s.documents);
  const orders = useBorrowStore((s) => s.orders);
  const logs = useBorrowStore((s) => s.logs);
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);

  // 自给自足：统计页直接打开（未经 AppLayout 基线）也能拿到全量件
  useEffect(() => {
    if (currentFanzongCode) {
      void useArchiveStore.getState().loadAllRecords();
      void useVolumeStore.getState().loadVolumes(currentFanzongCode);
      void useArchiveBoxStore.getState().loadBoxes(currentFanzongCode);
      void useSourceDocumentStore.getState().loadSourceDocs(currentFanzongCode);
      void useBorrowStore.getState().loadOrders();
      void useBorrowStore.getState().loadLogs();
    }
  }, [currentFanzongCode]);

  // 移交归盒口径：从卷状态实时推导（transferred 卷即已归盒），
  // 替代会话内存 transferLog（刷新即丢的半链路，2026-08-16 贯通修复）
  const transferLog = useMemo(
    () => volumes
      .filter((v) => v.status === 'transferred')
      .map((v) => ({
        id: v.id,
        transferNo: v.volumeCode || v.id,
        fromDept: '',
        toDept: '',
        fromPerson: '',
        toPerson: '',
        volumeIds: [v.id],
        totalVolumes: 1,
        totalItems: v.totalItems ?? 0,
        transferDate: (v.createdDate || '').slice(0, 10),
        status: 'transferred' as const,
      })),
    [volumes],
  );

  return useMemo(() => {
    const today = todayStr();
    return {
      inventory: computeInventory(records, volumes, boxes, sourceDocuments),
      lifecycle: computeLifecycle(records, volumes, transferLog, today),
      utilization: computeUtilization(logs, orders),
      compliance: computeCompliance(records, volumes, orders, logs, today),
    };
  }, [records, volumes, transferLog, boxes, sourceDocuments, orders, logs]);
}
