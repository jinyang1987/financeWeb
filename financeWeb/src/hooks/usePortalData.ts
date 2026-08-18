/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * usePortalData — 检索门户数据装配
 *
 * 门户与后台共用同一数据源（ams-server 真后端）。本 hook 在门户挂载时
 * 拉取与后台等价的全部镜像：
 *   - archiveStore.allRecords    全量件（池 ∪ 案卷库卷内件 ∪ 盒库卷内件，scope=all）
 *   - volumeStore.volumes        案卷
 *   - archiveBoxStore.boxes      档案盒
 *   - sourceDocumentStore        原始凭证附件
 *   - borrowStore.orders         借阅单（在线调阅权限判定）
 *
 * 2026-08-16 贯通修复：原实现为「池 records ∪ volumeStore.volumeRecords」双源合并，
 * 依赖组卷工作台曾加载过卷内件才完整；统一改走后端 scope=all 单源（含归属信息，
 * 草稿卷内件「待审核」也覆盖），assemblePortalRecords 保留导出供测试/兜底。
 */

import { useEffect, useMemo } from 'react';
import { useArchiveStore } from '../stores/archiveStore';
import { useVolumeStore } from '../stores/volumeStore';
import { useArchiveBoxStore } from '../stores/archiveBoxStore';
import { useSourceDocumentStore } from '../stores/sourceDocumentStore';
import { useBorrowStore } from '../stores/borrowStore';
import type { ArchiveRecord } from '../types';

/** 旧版双源合并逻辑（保留：测试 fixture 与离线兜底用） */
export function assemblePortalRecords(
  volumeRecords: Record<string, ArchiveRecord[]>,
  poolRecords: ArchiveRecord[],
): ArchiveRecord[] {
  const byId = new Map<string, ArchiveRecord>();
  for (const recs of Object.values(volumeRecords)) {
    for (const r of recs) byId.set(r.id, r);
  }
  for (const r of poolRecords) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  return Array.from(byId.values());
}

export function usePortalData() {
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);

  useEffect(() => {
    if (!currentFanzongCode) return;
    void Promise.all([
      useArchiveStore.getState().loadAllRecords(),
      useVolumeStore.getState().loadVolumes(currentFanzongCode),
      useArchiveBoxStore.getState().loadBoxes(currentFanzongCode),
      useSourceDocumentStore.getState().loadSourceDocs(currentFanzongCode),
      useBorrowStore.getState().loadOrders(),
      useBorrowStore.getState().loadLogs(),
    ]);
  }, [currentFanzongCode]);

  const allRecords = useArchiveStore((s) => s.allRecords);
  const sourceDocs = useSourceDocumentStore((s) => s.documents);
  const orders = useBorrowStore((s) => s.orders);

  return { allRecords, sourceDocs, orders };
}
