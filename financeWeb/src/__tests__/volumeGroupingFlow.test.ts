/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 组卷推荐引擎 + 类别代码归一化 回归测试
 *
 * 覆盖（纯前端部分）：
 *   1. toCategoryCode 类别代码归一化（DA/T数字码 → 视图字母码）
 *   2. 智能组卷推荐携带类别属性（generateRecommendations 纯计算）
 *   3. archiveStore.setRecords 同步重算派生视图数据
 *   4. 智能组卷取消（清空推荐不建卷）
 *
 * 注：建卷/加件/确认/移交/退回 全流程已切 ams-server 真后端（P1-②），
 * 端到端回归由 seed/test-volumes-smoke.mjs 覆盖（30 断言全链路）。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useVolumeStore,
  toCategoryCode,
  inferTypeCode,
  inferRetentionCode,
} from '../stores/volumeStore';
import { useArchiveStore } from '../stores/archiveStore';
import type { ArchiveRecord } from '../types';

// ── 测试夹具：2026年6月记账凭证（待组卷） ──
function makeVoucher(id: string, voucherNo: string, overrides: Partial<ArchiveRecord> = {}): ArchiveRecord {
  return {
    id,
    archiveCode: `Z001-KU·01·2026-D30-0000-${voucherNo.split('-')[1]}`,
    voucherNo,
    archiveType: '记账凭证',
    department: '财务部',
    amount: 1000,
    year: '2026',
    month: '06',
    retention: '30年',
    status: '仅件数据',
    numbered: false,
    source: 'digital-native',
    carrierType: 'electronic',
    managementMode: 'volume-mode',
    checks: { real: true, complete: true, usable: true, safe: true },
    checkDetails: [],
    components: [],
    auditLogs: [],
    remarks: '',
    ...overrides,
  } as ArchiveRecord;
}

beforeEach(() => {
  // 重置相关 store 状态，避免测试间污染
  useVolumeStore.setState({
    volumes: [],
    volumeItems: {},
    recommendations: [],
    transferLog: [],
  });
  // 件域自 P1-① 起不再内置仿真种子：依赖 records 的用例显式播种
  useArchiveStore.setState({ records: [makeVoucher('fx-1', '记-901'), makeVoucher('fx-2', '记-902')] });
  useArchiveStore.getState().updateFilteredRecords();
});

describe('toCategoryCode — 类别代码归一化（Bug2 根因A）', () => {
  it('DA/T 数字代码映射为视图字母代码', () => {
    expect(toCategoryCode('01')).toBe('KP');
    expect(toCategoryCode('02')).toBe('KB');
    expect(toCategoryCode('03')).toBe('FB');
    expect(toCategoryCode('04')).toBe('QT');
  });

  it('字母代码原样返回', () => {
    expect(toCategoryCode('KP')).toBe('KP');
    expect(toCategoryCode('QT')).toBe('QT');
  });

  it('空值按中文类别名推断', () => {
    expect(toCategoryCode('', '记账凭证')).toBe('KP');
    expect(toCategoryCode('', '会计账簿')).toBe('KB');
    expect(toCategoryCode('', '财务报告')).toBe('FB');
    expect(toCategoryCode('', '其他会计资料')).toBe('QT');
  });

  it('无法识别时兜底为 QT', () => {
    expect(toCategoryCode('')).toBe('QT');
    expect(toCategoryCode('99')).toBe('QT');
  });

  it('inferTypeCode / inferRetentionCode 辅助函数', () => {
    expect(inferTypeCode('记账凭证')).toBe('01');
    expect(inferTypeCode('会计账簿')).toBe('02');
    expect(inferRetentionCode('永久')).toBe('Y');
    expect(inferRetentionCode('30年')).toBe('D30');
    expect(inferRetentionCode('10年')).toBe('D10');
  });
});

describe('智能组卷推荐（纯前端引擎）', () => {
  it('推荐结果携带类别与期限属性', () => {
    const records = [makeVoucher('v1', '记-001'), makeVoucher('v2', '记-002')];
    useVolumeStore.getState().generateRecommendations(records);

    const recs = useVolumeStore.getState().recommendations;
    expect(recs.length).toBe(1);
    expect(recs[0].archiveType).toBe('记账凭证');
    expect(recs[0].archiveTypeCode).toBe('01');
    expect(recs[0].retention).toBe('30年');
    expect(recs[0].year).toBe(2026);
  });

  it('凭证号跳号时按连续号段拆分推荐', () => {
    const records = [makeVoucher('v1', '记-001'), makeVoucher('v2', '记-002'), makeVoucher('v3', '记-005')];
    useVolumeStore.getState().generateRecommendations(records);

    const recs = useVolumeStore.getState().recommendations;
    // 记-001~002 一段、记-005 一段
    expect(recs.length).toBe(2);
    expect(recs[0].recordIds).toEqual(['v1', 'v2']);
    expect(recs[1].recordIds).toEqual(['v3']);
  });
});

describe('archiveStore.setRecords — 同步重算派生视图数据（Bug2 根因C）', () => {
  it('setRecords 后 filteredRecords 同步更新', () => {
    const store = useArchiveStore.getState();
    const originalRecords = store.records;
    const originalFiltered = useArchiveStore.getState().filteredRecords;

    // 模拟组卷确认：更新一条记录的状态与档号
    const target = originalRecords[0];
    const updated = originalRecords.map((r) =>
      r.id === target.id ? { ...r, status: '已组卷' as const, archiveCode: `${r.archiveCode}-X` } : r,
    );
    store.setRecords(updated);

    const after = useArchiveStore.getState();
    // 派生数组必须已重算（引用变化且内容与 records 一致）
    expect(after.filteredRecords).not.toBe(originalFiltered);
    const recomputed = after.filteredRecords.find((r) => r.id === target.id);
    expect(recomputed?.status).toBe('已组卷');
    expect(recomputed?.archiveCode).toBe(`${target.archiveCode}-X`);

    // 还原
    store.setRecords(originalRecords);
  });

  it('新档号仍以全宗号开头时不会被全宗过滤丢失', () => {
    const store = useArchiveStore.getState();
    const original = store.records;
    const target = original[0];

    // 模拟 on-confirm 赋号：新档号 Z001 开头 → 视图保留
    store.setRecords(original.map((r) => (r.id === target.id ? { ...r, archiveCode: 'Z001-KU·01·2026-D30-B01-0001-0001' } : r)));
    expect(useArchiveStore.getState().filteredRecords.some((r) => r.id === target.id)).toBe(true);

    store.setRecords(original);
  });
});

describe('智能组卷取消（Bug1）', () => {
  it('setRecommendations([]) 清空推荐即中途终止', () => {
    const records = [makeVoucher('v1', '记-001'), makeVoucher('v2', '记-002')];
    useVolumeStore.getState().generateRecommendations(records);
    expect(useVolumeStore.getState().recommendations.length).toBeGreaterThan(0);

    // 模拟用户点击"取消"
    useVolumeStore.getState().setRecommendations([]);
    expect(useVolumeStore.getState().recommendations).toHaveLength(0);
    // 未创建任何案卷
    expect(useVolumeStore.getState().volumes).toHaveLength(0);
  });
});
