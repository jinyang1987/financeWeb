/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 仿真数据引用完整性回归测试
 *
 * 保证 records ↔ volumes ↔ volumeItems ↔ boxes 四层引用闭环：
 *   1. 每条含 volumeId 的仿真记录 → 案卷存在且 status='transferred'
 *   2. 每个案卷的 volumeItems → 记录存在且回指同一案卷
 *   3. 每个案卷的 boxId → 盒存在；盒的 volumeCount 与实际一致
 *   4. 四大类（KP/KB/FB/QT）× 2025/2026 均有已归档数据
 *   5. 新增分类字段（voucherCategory/subType/reportCategory/reportPeriod）填充率
 */

import { describe, it, expect } from 'vitest';
import {
  simulatedRecords,
  simulatedVolumes,
  simulatedVolumeItems,
  simulatedBoxes,
  LEGACY_BOX_PATCHES,
} from '../data/simulationData';
import { initialBoxes, initialRecords } from '../data';

const ALL_BOXES = [
  ...initialBoxes.map((b) => {
    const patch = LEGACY_BOX_PATCHES[b.id];
    return patch ? { ...b, volumeCount: patch.volumeCount, totalItems: patch.totalItems } : b;
  }),
  ...simulatedBoxes,
];

describe('仿真数据引用完整性', () => {
  it('每条仿真记录的 volumeId 都能解析到已移交案卷', () => {
    const volById = new Map(simulatedVolumes.map((v) => [v.id, v]));
    for (const r of simulatedRecords) {
      expect(r.volumeId, `记录 ${r.id} 缺 volumeId`).toBeTruthy();
      const vol = volById.get(r.volumeId!);
      expect(vol, `记录 ${r.id} 引用不存在的案卷 ${r.volumeId}`).toBeTruthy();
      expect(vol!.status).toBe('transferred');
      expect(r.boxId).toBe(vol!.boxId);
    }
  });

  it('每个案卷的 volumeItems 与记录双向一致', () => {
    const recById = new Map(simulatedRecords.map((r) => [r.id, r]));
    for (const vol of simulatedVolumes) {
      const items = simulatedVolumeItems[vol.id] || [];
      expect(items.length, `案卷 ${vol.id} 的 volumeItems 与 totalItems 不符`).toBe(vol.totalItems);
      items.forEach((vi, idx) => {
        expect(vi.volumeId).toBe(vol.id);
        expect(vi.itemNo).toBe(idx + 1);
        const rec = recById.get(vi.recordId);
        expect(rec, `volumeItem ${vi.id} 引用不存在的记录 ${vi.recordId}`).toBeTruthy();
        expect(rec!.volumeId).toBe(vol.id);
      });
    }
  });

  it('案卷的 boxId 都能解析到盒，且盒计数一致', () => {
    const boxById = new Map(ALL_BOXES.map((b) => [b.id, b]));
    for (const vol of simulatedVolumes) {
      const box = boxById.get(vol.boxId);
      expect(box, `案卷 ${vol.id} 引用不存在的盒 ${vol.boxId}`).toBeTruthy();
      expect(box!.archiveTypeCode).toBe(vol.archiveTypeCode);
    }
    // 盒 volumeCount = 实际卷数
    for (const box of ALL_BOXES) {
      const actual = simulatedVolumes.filter((v) => v.boxId === box.id).length;
      expect(actual, `盒 ${box.id} volumeCount=${box.volumeCount} 与实际 ${actual} 不符`).toBe(box.volumeCount);
    }
  });

  it('四大类 × 2025/2026 均有已归档数据', () => {
    for (const code of ['KP', 'KB', 'FB', 'QT']) {
      for (const year of [2025, 2026]) {
        const vols = simulatedVolumes.filter((v) => v.archiveTypeCode === code && v.year === year);
        expect(vols.length, `${code} ${year} 无案卷`).toBeGreaterThan(0);
      }
    }
  });

  it('分类字段填充：凭证 voucherCategory / 账簿 subType / 报表 report 双字段 / 其他 subType', () => {
    const kp = simulatedRecords.filter((r) => r.archiveType === '记账凭证');
    expect(kp.every((r) => !!r.voucherCategory)).toBe(true);
    expect(kp.every((r) => !!r.accountSubject && !!r.preparer)).toBe(true);

    const kb = simulatedRecords.filter((r) => r.archiveType === '会计账簿');
    expect(kb.length).toBeGreaterThanOrEqual(10);
    expect(kb.every((r) => !!r.subType)).toBe(true);
    expect(new Set(kb.map((r) => r.subType))).toEqual(new Set(['总账', '日记账', '明细账', '辅助账簿']));

    const fb = simulatedRecords.filter((r) => r.archiveType === '财务报表');
    expect(fb.every((r) => !!r.reportCategory && !!r.reportPeriod)).toBe(true);
    expect(new Set(fb.map((r) => r.reportPeriod))).toEqual(new Set(['月度', '季度', '年度']));

    const qt = simulatedRecords.filter((r) => r.archiveType === '其他会计资料');
    expect(qt.length).toBeGreaterThanOrEqual(10);
    expect(qt.every((r) => !!r.subType)).toBe(true);
  });

  it('薪酬敏感卷存在且密级为秘密（HRVP 路由演示数据）', () => {
    const salaryVol = simulatedVolumes.find((v) => v.id === 'vol-kp-2026-salary');
    expect(salaryVol).toBeTruthy();
    expect(salaryVol!.securityLevel).toBe('秘密');
    const items = simulatedVolumeItems['vol-kp-2026-salary'];
    expect(items.length).toBeGreaterThanOrEqual(6);
  });

  it('2025 凭证为纸质载体（实体借阅演示），2026 为电子载体', () => {
    const kp2025 = simulatedRecords.filter((r) => r.archiveType === '记账凭证' && r.year === '2025');
    expect(kp2025.every((r) => r.carrierType === 'paper')).toBe(true);
    const kp2026 = simulatedRecords.filter((r) => r.archiveType === '记账凭证' && r.year === '2026');
    expect(kp2026.every((r) => r.carrierType === 'electronic')).toBe(true);
  });

  it('既有手写记录被生成器版本覆盖（无重复 ID）', () => {
    const simIds = new Set(simulatedRecords.map((r) => r.id));
    const dup = initialRecords.filter((r) => simIds.has(r.id)).map((r) => r.id);
    // data.ts 中 vol-001/004/005 的 5 条会被生成器重建（normalizeLegacyRecords 负责去重）
    expect(dup.sort()).toEqual([
      'voucher-202605-001', 'voucher-202605-002', 'voucher-202605-003',
      'voucher-book-001', 'voucher-rpt-001',
    ].sort());
  });
});
