/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * unitSelection — 「件」单元化勾选纯函数（2026-08-20 先组件再组卷）
 *
 * 「件」＝ 1 张记账凭证 + 其全部已挂接原始凭证（原始凭证 record.parentRecordId → 凭证 id）。
 * 勾选语义：
 *   勾/取消记账凭证 → 整单元联动（自动带上/移除其已挂接原始凭证）；
 *   单勾/取消原始凭证 → 只影响自己；
 *   全选 → 并集 + 单元扩展（不丢跨页/被过滤的既有选择）。
 */

import type { ArchiveRecord } from '../types';
import { isSourceDocument } from './recordType';

/** 池内某凭证的全部已挂接原始凭证 id */
export function attachedSourceIds(pool: ArchiveRecord[], voucherId: string): string[] {
  return pool
    .filter((r) => isSourceDocument(r) && r.parentRecordId === voucherId)
    .map((r) => r.id);
}

/**
 * 单元化勾选切换（单笔）。pool 必须是全量池（非当前页切片），否则跨页附件扩展不到。
 */
export function toggleUnitSelection(
  pool: ArchiveRecord[],
  selected: Set<string>,
  recordId: string,
): Set<string> {
  const next = new Set(selected);
  const wasSelected = next.has(recordId);
  if (wasSelected) next.delete(recordId);
  else next.add(recordId);

  const rec = pool.find((r) => r.id === recordId);
  if (rec && !isSourceDocument(rec)) {
    // 凭证：对称联动其全部已挂接原始凭证
    for (const sid of attachedSourceIds(pool, recordId)) {
      if (wasSelected) next.delete(sid);
      else next.add(sid);
    }
  }
  return next;
}

/**
 * 单元化全选（当前页）：并集 + 单元扩展。
 * pageIds = 当前页可见行；fullPool = 全量池（跨页/被过滤附件的解析源）。
 */
export function selectPageWithUnits(
  fullPool: ArchiveRecord[],
  pageIds: string[],
  current: Set<string>,
): Set<string> {
  const next = new Set(current);
  for (const id of pageIds) {
    next.add(id);
    const rec = fullPool.find((r) => r.id === id);
    if (rec && !isSourceDocument(rec)) {
      for (const sid of attachedSourceIds(fullPool, id)) next.add(sid);
    }
  }
  return next;
}

/** 页级全选判定（容忍选择集含页外 id——单元扩展会让 selectedIds ⊋ 当前页） */
export function isAllPageSelected(pageIds: string[], selected: Set<string>): boolean {
  return pageIds.length > 0 && pageIds.every((id) => selected.has(id));
}

/**
 * 组件（挂接）操作解析：选择集 → 可挂接的 {voucherId, sourceIds}，不可挂返回 null。
 * 规则：恰好 1 张非原始凭证（记账凭证/账簿等主体件）+ ≥1 张原始凭证；
 *       原始凭证须未挂接或已挂在本凭证上（幂等跳过）；挂到别的凭证上的须先解挂。
 */
export function resolveLinkableSelection(
  pool: ArchiveRecord[],
  selected: Set<string>,
): { voucherId: string; sourceIds: string[] } | null {
  const sel = pool.filter((r) => selected.has(r.id));
  if (sel.length === 0) return null;
  const vouchers = sel.filter((r) => !isSourceDocument(r));
  if (vouchers.length !== 1) return null;
  const voucher = vouchers[0];
  const sources = sel.filter(isSourceDocument);
  if (sources.length === 0) return null;
  // 挂到其他凭证上的原始凭证不混在一次操作里（先解挂再改挂，意图更清晰）
  if (sources.some((s) => s.parentRecordId && s.parentRecordId !== voucher.id)) return null;
  const targets = sources.filter((s) => !s.parentRecordId);
  if (targets.length === 0) return null; // 全部已挂在本凭证上 → 幂等无事可做
  return { voucherId: voucher.id, sourceIds: targets.map((s) => s.id) };
}

/**
 * 解挂操作解析：选择集全部为已挂接原始凭证 → 返回其 id 列表，否则 null。
 */
export function resolveUnlinkableSelection(pool: ArchiveRecord[], selected: Set<string>): string[] | null {
  const sel = pool.filter((r) => selected.has(r.id));
  if (sel.length === 0) return null;
  if (!sel.every((r) => isSourceDocument(r) && !!r.parentRecordId)) return null;
  return sel.map((r) => r.id);
}

/**
 * 卷内单元闭合校验（拆分/转卷/移出前置）：选择集中的原始凭证，其所属记账凭证在同卷
 * 但未同选 → 违反「原始凭证随所属记账凭证」铁律，返回违规描述；无违规返回 null。
 * resolveRec：recordId → ArchiveRecord（调用方提供 allRecords/池记录解析）。
 */
export function findUnitSplitViolation(
  volumeItemRecordIds: string[],
  selIds: Set<string>,
  resolveRec: (recordId: string) => ArchiveRecord | undefined,
): string | null {
  const inVolume = new Set(volumeItemRecordIds);
  for (const rid of selIds) {
    const rec = resolveRec(rid);
    if (!rec || !isSourceDocument(rec) || !rec.parentRecordId) continue;
    if (inVolume.has(rec.parentRecordId) && !selIds.has(rec.parentRecordId)) {
      return `原始凭证「${rec.voucherNo}」须随其所属记账凭证整体操作（请把该凭证一并勾选）`;
    }
  }
  return null;
}
