/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * useArchiveStats — 全库统计聚合 hook
 *
 * 四域统计一次性计算（statsEngine 纯函数），驾驶舱与各统计页共用。
 */

import { useMemo } from 'react';
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
  const records = useArchiveStore((s) => s.records);
  const volumes = useVolumeStore((s) => s.volumes);
  const transferLog = useVolumeStore((s) => s.transferLog);
  const boxes = useArchiveBoxStore((s) => s.boxes);
  const sourceDocuments = useSourceDocumentStore((s) => s.documents);
  const orders = useBorrowStore((s) => s.orders);
  const logs = useBorrowStore((s) => s.logs);

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
