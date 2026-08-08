/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 财务分类视图「筛选联动」回归测试（bug以及借阅需求.txt 一.2）
 *
 * 覆盖：
 *   1. 盒→件 装配：只显示有已移交案卷的盒，件来自卷内编目
 *   2. 筛选谓词实时作用于盒内件、盒件数统计、总条数
 *   3. 应用筛选时不含匹配件的盒被隐藏
 *   4. 字段级筛选：月份/凭证类型/账簿子类型/报表分类+期间
 *
 * P1-③ 适配：assembleBoxViewData 签名变更，件数据源从 (volumeItems + records)
 * 改为 volumeRecords（Record<string, ArchiveRecord[]>，keyed by volumeId）。
 */

import { describe, it, expect } from 'vitest';
import { assembleBoxViewData } from '../hooks/useBoxViewData';
import { simulatedVolumes, simulatedVolumeItems, simulatedBoxes, simulatedRecords } from '../data/simulationData';
import { initialBoxes } from '../data';
import type { ArchiveRecord } from '../types';

const ALL_BOXES = [...initialBoxes, ...simulatedBoxes];

/** 将仿真 volumeItems + records 转换为 volumeRecords（Record<volumeId, ArchiveRecord[]>） */
function buildVolumeRecords(): Record<string, ArchiveRecord[]> {
  const recordById = new Map(simulatedRecords.map((r) => [r.id, r]));
  const result: Record<string, ArchiveRecord[]> = {};
  for (const [volId, items] of Object.entries(simulatedVolumeItems)) {
    result[volId] = items
      .map((vi) => recordById.get(vi.recordId))
      .filter(Boolean) as ArchiveRecord[];
  }
  return result;
}

const VOLUME_RECORDS = buildVolumeRecords();

function assemble(typeCode: string, year: string | undefined, filter?: (r: ArchiveRecord) => boolean) {
  return assembleBoxViewData(ALL_BOXES, simulatedVolumes, VOLUME_RECORDS, typeCode, year, filter);
}

describe('财务分类视图 盒→件 装配', () => {
  it('KP 2026：只显示有已移交卷的盒，件数与卷内编目一致', () => {
    const { entries, totalMatched } = assemble('KP', '2026');
    expect(entries.length).toBeGreaterThanOrEqual(2); // box-001 + box-002
    for (const e of entries) {
      expect(e.box.archiveTypeCode).toBe('KP');
      expect(e.volumes.every((v) => v.status === 'transferred')).toBe(true);
      expect(e.matchedItems.length).toBe(e.items.length); // 无筛选时全量
    }
    expect(totalMatched).toBe(entries.reduce((s, e) => s + e.items.length, 0));
  });

  it('KB 2025 纸质盒可见（仿真数据）', () => {
    const { entries } = assemble('KB', '2025');
    expect(entries.length).toBe(1);
    expect(entries[0].box.id).toBe('box-kb-2025-01');
    expect(entries[0].matchedItems.length).toBe(7); // 总账1+日记账2+明细账3+辅助账1
  });
});

describe('筛选联动（统计条数同步）', () => {
  it('KP 月份筛选：只保留该月凭证，统计条数同步', () => {
    const monthFilter = (r: ArchiveRecord) => parseInt(r.month, 10) === 3;
    const { entries, totalMatched } = assemble('KP', '2026', monthFilter);
    const all = entries.flatMap((e) => e.matchedItems);
    expect(all.every((r) => r.month === '03')).toBe(true);
    expect(totalMatched).toBe(all.length);
    // 2026年3月凭证都在 box-001 → 只剩 1 个盒
    expect(entries.length).toBe(1);
    expect(entries[0].box.id).toBe('box-001');
  });

  it('KP 凭证类型筛选（voucherCategory 字段级）', () => {
    const catFilter = (r: ArchiveRecord) => r.voucherCategory === '收款凭证';
    const { entries, totalMatched } = assemble('KP', '2026', catFilter);
    const all = entries.flatMap((e) => e.matchedItems);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((r) => r.voucherCategory === '收款凭证')).toBe(true);
    expect(totalMatched).toBe(all.length);
  });

  it('KB 账簿类型筛选（subType 字段级）', () => {
    const ledgerFilter = (r: ArchiveRecord) => r.subType === '明细账';
    const { entries, totalMatched } = assemble('KB', '2025', ledgerFilter);
    const all = entries.flatMap((e) => e.matchedItems);
    expect(all.length).toBe(3); // 资产/负债权益/损益 三本明细账
    expect(totalMatched).toBe(3);
  });

  it('FB 报表分类+期间交叉筛选（reportCategory/reportPeriod 字段级）', () => {
    const filter = (r: ArchiveRecord) => r.reportCategory === '法定对外' && r.reportPeriod === '年度';
    const { entries, totalMatched } = assemble('FB', '2025', filter);
    const all = entries.flatMap((e) => e.matchedItems);
    expect(all.length).toBe(3); // 年报+现金流量表+所有者权益变动表
    expect(all.every((r) => r.reportCategory === '法定对外' && r.reportPeriod === '年度')).toBe(true);
    expect(totalMatched).toBe(3);
  });

  it('QT 子类型筛选', () => {
    const filter = (r: ArchiveRecord) => r.subType === '银行对账单';
    const { entries, totalMatched } = assemble('QT', '2025', filter);
    const all = entries.flatMap((e) => e.matchedItems);
    expect(all.length).toBe(4); // 四个季度
    expect(totalMatched).toBe(4);
  });

  it('筛选无结果时盒列表为空（而非显示空盒）', () => {
    const impossible = (r: ArchiveRecord) => r.voucherCategory === '不存在的类型';
    const { entries, totalMatched } = assemble('KP', '2026', impossible);
    expect(entries.length).toBe(0);
    expect(totalMatched).toBe(0);
  });
});
