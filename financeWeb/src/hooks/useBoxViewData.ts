/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * useBoxViewData — 财务分类视图「盒→卷→件」数据装配 hook（P1-③ 读视图切 API）
 *
 * 统一 L1（盒列表）/ L2（盒内卷件）/ 页头统计 的数据口径：
 *   - 盒：按 大类 + 年度 过滤，且至少含 1 个已移交案卷
 *   - 件：盒内已移交案卷的卷内完整记录（volumeRecords，含全属性供筛选）
 *   - recordFilter：页内筛选（季度/月份/子类型/报表分类期间等）作用于件级，
 *     盒的件数统计与是否显示均以「筛选后件数」为准
 *
 * P1-③ 变更：件数据源从 archiveStore.records（仅收集池）切换为
 * volumeStore.volumeRecords（卷内完整记录，含 voucherCategory/subType 等筛选字段）。
 */

import { useMemo } from 'react';
import { useArchiveBoxStore } from '../stores/archiveBoxStore';
import { useVolumeStore } from '../stores/volumeStore';
import type { ArchiveRecord } from '../types';
import type { ArchiveBox } from '../types/archiveBox';
import type { Volume } from '../types/volume';

export interface BoxViewEntry {
  /** = box.id（DataTable 行主键约束） */
  id: string;
  box: ArchiveBox;
  /** 盒内已移交案卷 */
  volumes: Volume[];
  /** 盒内全部件（未应用页内筛选） */
  items: ArchiveRecord[];
  /** 应用页内筛选后的件 */
  matchedItems: ArchiveRecord[];
}

export interface BoxViewData {
  /** 含筛选后件的盒（L1 展示列表） */
  entries: BoxViewEntry[];
  /** 筛选后总件数（统计条数联动） */
  totalMatched: number;
  /** 盒总数（筛选前有已移交卷的盒） */
  totalBoxes: number;
}

/** 纯函数版装配逻辑（可单测） */
export function assembleBoxViewData(
  boxes: ArchiveBox[],
  volumes: Volume[],
  volumeRecords: Record<string, ArchiveRecord[]>,
  archiveTypeCode: string,
  archiveYear: string | undefined,
  recordFilter?: (r: ArchiveRecord) => boolean,
): BoxViewData {
  const filteredBoxes = boxes
    .filter((b) => !archiveTypeCode || b.archiveTypeCode === archiveTypeCode)
    .filter((b) => !archiveYear || String(b.year) === archiveYear)
    .filter((b) => volumes.some((v) => v.boxId === b.id && v.status === 'transferred'))
    .sort((a, b) => a.boxNo.localeCompare(b.boxNo));

  const entries: BoxViewEntry[] = [];
  let totalMatched = 0;

  for (const box of filteredBoxes) {
    const boxVolumes = volumes
      .filter((v) => v.boxId === box.id && v.status === 'transferred')
      .sort((a, b) => a.volumeCode.localeCompare(b.volumeCode));

    const items: ArchiveRecord[] = [];
    const seen = new Set<string>();
    for (const vol of boxVolumes) {
      for (const rec of volumeRecords[vol.id] || []) {
        if (seen.has(rec.id)) continue;
        seen.add(rec.id);
        items.push(rec);
      }
    }
    items.sort((a, b) => a.voucherNo.localeCompare(b.voucherNo, 'zh-CN'));

    const matchedItems = recordFilter ? items.filter(recordFilter) : items;
    totalMatched += matchedItems.length;
    entries.push({ id: box.id, box, volumes: boxVolumes, items, matchedItems });
  }

  // 应用筛选时：只展示含筛选后件的盒
  const visibleEntries = recordFilter ? entries.filter((e) => e.matchedItems.length > 0) : entries;

  return { entries: visibleEntries, totalMatched, totalBoxes: filteredBoxes.length };
}

export function useBoxViewData(
  archiveTypeCode: string,
  archiveYear: string | undefined,
  recordFilter?: (r: ArchiveRecord) => boolean,
): BoxViewData {
  const boxes = useArchiveBoxStore((s) => s.boxes);
  const volumes = useVolumeStore((s) => s.volumes);
  const volumeRecords = useVolumeStore((s) => s.volumeRecords);

  return useMemo(
    () => assembleBoxViewData(boxes, volumes, volumeRecords, archiveTypeCode, archiveYear, recordFilter),
    [boxes, volumes, volumeRecords, archiveTypeCode, archiveYear, recordFilter],
  );
}
