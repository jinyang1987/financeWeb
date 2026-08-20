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
import { useSourceDocumentStore } from '../stores/sourceDocumentStore';
import { useArchiveStore } from '../stores/archiveStore';
import type { ArchiveRecord } from '../types';
import type { SourceDocument } from '../types/sourceDocument';

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
    groupingNotice: null,
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

// ── 原始凭证附件夹具 ──
function makeSourceDoc(id: string, parentRecordId: string, overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id,
    documentNo: `FP-${id}`,
    docTypeCode: 'invoice',
    docTypeName: '发票',
    transactionDate: '2026-06-01',
    amountLower: 100,
    amountUpper: '壹佰元整',
    counterpartyName: '某供应商',
    summary: '采购',
    attachmentCount: 1,
    businessCategory: '采购',
    parentVoucherNo: '',
    attachmentSequence: 1,
    parentRecordId,
    ...overrides,
  } as SourceDocument;
}

describe('凭证+原始凭证＝【一件】单元化（2026-08-19 智能组卷修正）', () => {
  beforeEach(() => {
    useSourceDocumentStore.setState({ documents: [] });
  });

  it('富元数据原始凭证附件计入预估件数/页数，且不进入 recordIds（随父节点移动）', () => {
    const records = [makeVoucher('v1', '记-001'), makeVoucher('v2', '记-002')];
    // v1 挂 2 张原始凭证附件，v2 挂 1 张
    useSourceDocumentStore.setState({
      documents: [
        makeSourceDoc('sd-1', 'v1'),
        makeSourceDoc('sd-2', 'v1'),
        makeSourceDoc('sd-3', 'v2'),
      ],
    });

    useVolumeStore.getState().generateRecommendations(records);
    const recs = useVolumeStore.getState().recommendations;
    expect(recs.length).toBe(1);
    // 件数 = 2 凭证 + 3 附件 = 5
    expect(recs[0].estimatedItems).toBe(5);
    // 页数 = 2*2(凭证) + 3*1(附件) = 7
    expect(recs[0].estimatedPages).toBe(7);
    // recordIds 仅含凭证（附件是子节点，随父节点自动移动）
    expect(recs[0].recordIds).toEqual(['v1', 'v2']);
  });

  it('池内独立『原始凭证』记录随父件整体归卷，禁止单独成卷', () => {
    const records = [
      makeVoucher('v1', '记-001'),
      makeVoucher('v2', '记-002'),
      // 独立原始凭证记录，属主为 v1（父件在本池内）
      makeVoucher('s1', '记-001', { archiveType: '原始凭证', parentRecordId: 'v1' }),
    ];

    useVolumeStore.getState().generateRecommendations(records);
    const recs = useVolumeStore.getState().recommendations;
    // 只应生成 1 个凭证推荐（独立原始凭证被并入 v1 单元，不单独成卷）
    expect(recs.length).toBe(1);
    // recordIds 包含 v1 及其独立原始凭证 s1、v2
    expect(recs[0].recordIds).toEqual(['v1', 's1', 'v2']);
    // 件数 = 3
    expect(recs[0].estimatedItems).toBe(3);
  });
});

describe('原始凭证组卷规则（2026-08-19：组件＝1张记账凭证+N个原始凭证附件）', () => {
  beforeEach(() => {
    useSourceDocumentStore.setState({ documents: [] });
  });

  it('纯原始凭证池不出推荐并给出提示（真实数据形态：archiveType=记账凭证 + voucherCategory=原始凭证）', () => {
    // 用户场景：待组卷池里只有 2 件原始凭证，没有记账凭证 → 不满足组件逻辑，不能成卷
    const records = [
      makeVoucher('s1', '记-附件-1', { voucherCategory: '原始凭证' }),
      makeVoucher('s2', '记-附件-2', { voucherCategory: '原始凭证' }),
    ];

    useVolumeStore.getState().generateRecommendations(records);
    const st = useVolumeStore.getState();
    expect(st.recommendations).toHaveLength(0);
    expect(st.groupingNotice).toContain('2 件均为原始凭证');
  });

  it('混合池：孤儿原始凭证（无属主）被跳过、不进任何推荐卷，并提示件数', () => {
    const records = [
      makeVoucher('v1', '记-001'),
      makeVoucher('v2', '记-002'),
      // 孤儿原始凭证：无 parentRecordId（真实数据服务端不下发该字段）
      makeVoucher('s1', '记-附件-1', { voucherCategory: '原始凭证' }),
    ];

    useVolumeStore.getState().generateRecommendations(records);
    const st = useVolumeStore.getState();
    expect(st.recommendations.length).toBe(1);
    expect(st.recommendations[0].recordIds).toEqual(['v1', 'v2']);
    expect(st.groupingNotice).toContain('1 件原始凭证未参与组卷');
  });

  it('voucherCategory 形态的独立原始凭证，属主在池内时仍随父件整体归卷且无提示', () => {
    const records = [
      makeVoucher('v1', '记-001'),
      makeVoucher('v2', '记-002'),
      makeVoucher('s1', '记-001', { voucherCategory: '原始凭证', parentRecordId: 'v1' }),
    ];

    useVolumeStore.getState().generateRecommendations(records);
    const st = useVolumeStore.getState();
    expect(st.recommendations.length).toBe(1);
    expect(st.recommendations[0].recordIds).toEqual(['v1', 's1', 'v2']);
    expect(st.groupingNotice).toBeNull();
  });

  it('正常凭证池无跳过时不产生提示', () => {
    const records = [makeVoucher('v1', '记-001'), makeVoucher('v2', '记-002')];
    useVolumeStore.getState().generateRecommendations(records);
    const st = useVolumeStore.getState();
    expect(st.recommendations.length).toBe(1);
    expect(st.groupingNotice).toBeNull();
  });

  it('原始凭证挂接到池外父件 → 按孤儿跳过并提示（父件不在本池不随卷）', () => {
    const records = [
      makeVoucher('v1', '记-001'),
      // 父件已入卷/已移交/他全宗——不在待组卷池内
      makeVoucher('s1', '记-附件-1', { voucherCategory: '原始凭证', parentRecordId: 'v-not-in-pool' }),
    ];
    useVolumeStore.getState().generateRecommendations(records);
    const st = useVolumeStore.getState();
    expect(st.recommendations.length).toBe(1);
    expect(st.recommendations[0].recordIds).toEqual(['v1']);
    expect(st.groupingNotice).toContain('1 件原始凭证未参与组卷');
  });
});
