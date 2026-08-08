/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 统计引擎回归测试（会计档案统计维度与统计内容汇总.md）
 *
 * 验证四域统计均从真实数据计算且口径正确：
 *   1. 库藏：类型/年度/期限/全宗/部门/载体 与源数据一致
 *   2. 生命周期：待归档/已归档/四性/移交 口径正确
 *   3. 利用：行为计数/热点/部门利用
 *   4. 合规：元数据完整率/格式合规/到期计算/审计支撑
 */

import { describe, it, expect } from 'vitest';
import {
  computeInventory, computeLifecycle, computeUtilization, computeCompliance,
  parseSizeKB, formatCapacity, typeCodeOf,
} from '../utils/statsEngine';
import { simulatedRecords, simulatedVolumes, simulatedBoxes } from '../data/simulationData';
import { initialSourceDocuments, initialRecords } from '../data';
import { normalizeLegacyRecords } from '../data/simulationData';
import type { ArchiveRecord } from '../types';
import type { BorrowLog, BorrowOrder } from '../types/borrow';

const ALL_RECORDS = [...normalizeLegacyRecords(initialRecords), ...simulatedRecords];
const TODAY = '2026-07-18';

// ── 工具函数 ──

describe('统计工具函数', () => {
  it('parseSizeKB 解析各单位', () => {
    expect(parseSizeKB('512KB')).toBe(512);
    expect(parseSizeKB('2MB')).toBe(2048);
    expect(parseSizeKB('1.5GB')).toBe(1572864);
    expect(parseSizeKB('乱写')).toBe(0);
  });
  it('formatCapacity 人性化显示', () => {
    expect(formatCapacity(512)).toBe('512 KB');
    expect(formatCapacity(2048)).toBe('2.0 MB');
    expect(formatCapacity(1572864)).toBe('1.50 GB');
  });
  it('typeCodeOf 映射四大类', () => {
    expect(typeCodeOf({ archiveType: '记账凭证' } as ArchiveRecord)).toBe('KP');
    expect(typeCodeOf({ archiveType: '会计账簿' } as ArchiveRecord)).toBe('KB');
    expect(typeCodeOf({ archiveType: '财务报表' } as ArchiveRecord)).toBe('FB');
    expect(typeCodeOf({ archiveType: '其他会计资料' } as ArchiveRecord)).toBe('QT');
  });
});

// ── 1. 库藏 ──

describe('库藏总量统计', () => {
  const inv = computeInventory(ALL_RECORDS, simulatedVolumes, simulatedBoxes.length ? [...simulatedBoxes] : [], initialSourceDocuments);

  it('总量与源数据一致', () => {
    expect(inv.totals.records).toBe(ALL_RECORDS.length);
    expect(inv.totals.volumes).toBe(simulatedVolumes.length);
    expect(inv.totals.sourceDocs).toBe(initialSourceDocuments.length);
    expect(inv.totals.pages).toBe(simulatedVolumes.reduce((s, v) => s + v.totalPages, 0));
  });

  it('类型分布：四大类记录数合计 = 总记录数', () => {
    const sum = inv.byType.reduce((s, t) => s + t.records, 0);
    expect(sum).toBe(ALL_RECORDS.length);
    expect(inv.byType.find((t) => t.code === 'KP')!.records).toBeGreaterThan(200);
    expect(inv.byType.find((t) => t.code === 'KB')!.records).toBeGreaterThanOrEqual(13);
  });

  it('年度分布覆盖 2025/2026', () => {
    const years = inv.byYear.map((y) => y.year);
    expect(years).toContain('2025');
    expect(years).toContain('2026');
  });

  it('保管期限分布占比合计 ≈ 100', () => {
    const sumPct = inv.byRetention.reduce((s, r) => s + r.pct, 0);
    expect(Math.abs(sumPct - 100)).toBeLessThan(1);
    expect(inv.byRetention.find((r) => r.label === '永久')!.records).toBeGreaterThan(0);
  });

  it('载体分布：电子+纸质 = 总量', () => {
    const sum = inv.byCarrier.reduce((s, c) => s + c.records, 0);
    expect(sum).toBe(ALL_RECORDS.length);
    expect(inv.byCarrier.find((c) => c.key === 'paper')!.records).toBeGreaterThan(150);
  });
});

// ── 2. 生命周期 ──

describe('生命周期业务统计', () => {
  const lc = computeLifecycle(ALL_RECORDS, simulatedVolumes, [], TODAY);

  it('待归档 = 6月待组卷 49 张', () => {
    expect(lc.pendingArchive).toBe(49);
  });

  it('已归档记录均有已移交案卷', () => {
    expect(lc.archived).toBeGreaterThan(300);
    expect(lc.organizeCompletionRate).toBeGreaterThan(85);
  });

  it('四性检测：mock 数据全过', () => {
    expect(lc.checksPassRate).toBe(100);
    expect(lc.abnormalRecords).toBe(0);
    expect(lc.checksByProperty.every((p) => p.passRate === 100)).toBe(true);
  });

  it('卷状态计数一致', () => {
    expect(lc.transferredVolumes).toBe(simulatedVolumes.filter((v) => v.status === 'transferred').length);
    expect(lc.draftVolumes).toBe(0);
  });

  it('到期档案：2025年10年期 2035 才到期 → 0', () => {
    expect(lc.expiredNotDestroyed).toBe(0);
  });

  it('近6月归档趋势返回 6 个月', () => {
    expect(lc.monthlyArchived.length).toBe(6);
    expect(lc.monthlyArchived[5].month).toBe('2026-07');
  });
});

// ── 3. 利用 ──

describe('利用与价值统计', () => {
  const logs: BorrowLog[] = [
    { id: 'l1', timestamp: '2026-07-18 09:00:00', actorId: 'u1', actorName: '张伟', actorRoleLabel: '员工', action: '档案检索', target: '凭证检索' },
    { id: 'l2', timestamp: '2026-07-18 09:01:00', actorId: 'u1', actorName: '张伟', actorRoleLabel: '员工', action: '在线查看', target: '记-001' },
    { id: 'l3', timestamp: '2026-07-18 09:02:00', actorId: 'u1', actorName: '张伟', actorRoleLabel: '员工', action: '下载', target: '记-001' },
    { id: 'l4', timestamp: '2026-07-18 09:03:00', actorId: 'u1', actorName: '张伟', actorRoleLabel: '员工', action: '打印', target: '记-002' },
  ];
  const orders: BorrowOrder[] = [{
    id: 'o1', orderNo: 'JY-2026-0001', applicantId: 'u1', applicantName: '张伟', applicantEmpNo: '004521',
    applicantDept: '财务部', createdAt: '2026-07-18 10:00:00', reasonType: '外部审计', reasonDetail: '',
    startDate: '2026-07-18', endDate: '2026-07-30', status: 'active',
    items: [
      { id: 'i1', recordId: 'r1', volumeId: 'v1', title: '3月凭证', voucherNo: '记-001', archiveType: '记账凭证', archiveTypeCode: 'KP', mediaType: 'mixed', securityLevel: '普通', stockStatus: 'in_stock', electronicPerms: ['view'], physicalMode: 'none' },
      { id: 'i2', recordId: 'r2', volumeId: 'v1', title: '3月凭证', voucherNo: '记-002', archiveType: '记账凭证', archiveTypeCode: 'KP', mediaType: 'mixed', securityLevel: '普通', stockStatus: 'in_stock', electronicPerms: ['view'], physicalMode: 'original' },
    ],
    approvalRoute: [], currentStepIndex: 2, fulfillments: [],
  }];

  it('行为计数正确', () => {
    const u = computeUtilization(logs, orders);
    expect(u.totals.searches).toBe(1);
    expect(u.totals.views).toBe(1);
    expect(u.totals.downloads).toBe(1);
    expect(u.totals.prints).toBe(1);
    expect(u.totals.orders).toBe(1);
  });

  it('热点档案按件次聚合', () => {
    const u = computeUtilization(logs, orders);
    expect(u.topArchives[0].title).toBe('3月凭证');
    expect(u.topArchives[0].count).toBe(2);
    expect(u.byTypeHeat.find((h) => h.code === 'KP')!.count).toBe(2);
  });

  it('部门利用聚合', () => {
    const u = computeUtilization(logs, orders);
    expect(u.byDeptUsage[0].dept).toBe('财务部');
    expect(u.byDeptUsage[0].items).toBe(2);
    expect(u.topUsers[0].name).toBe('张伟');
  });
});

// ── 4. 合规 ──

describe('合规与风险统计', () => {
  const cc = computeCompliance(ALL_RECORDS, simulatedVolumes, [], [], TODAY);

  it('元数据完整率：仿真数据全量填充 → 100%', () => {
    expect(cc.metadataCompleteRate).toBe(100);
    expect(cc.missingByField.every((f) => f.missing === 0)).toBe(true);
  });

  it('格式合规率：OFD/PDF 白名单 → 100%', () => {
    expect(cc.formatComplianceRate).toBe(100);
    expect(cc.formatDistribution.length).toBeGreaterThan(0);
  });

  it('保管期限标注率 100%，超期未销毁 0', () => {
    expect(cc.retentionLabelRate).toBe(100);
    expect(cc.expiredNotDestroyed).toBe(0);
  });

  it('未来 5 年到期预告覆盖 2026-2030', () => {
    expect(cc.upcomingExpiry.map((u) => u.year)).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(cc.upcomingExpiry.every((u) => u.count === 0)).toBe(true);
  });

  it('元数据缺失能被准确识别（构造缺制单人的记录）', () => {
    const dirty: ArchiveRecord[] = [{
      ...ALL_RECORDS[0],
      id: 'dirty-1',
      preparer: undefined,
    }];
    const r = computeCompliance(dirty, [], [], [], TODAY);
    expect(r.missingByField.find((f) => f.label === '制单人')!.missing).toBe(1);
    expect(r.metadataCompleteRate).toBe(0);
  });
});
