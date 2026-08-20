/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * unitSelection — 「件」单元化勾选纯函数测试（2026-08-20 先组件再组卷）
 *
 * 覆盖：勾凭证联动附件 / 反勾对称移除 / 单勾原始凭证 / 全选并集+跨页扩展 /
 *      页级全选判定 / 组件与解挂的选择集解析 / 卷内单元闭合校验。
 */

import { describe, it, expect } from 'vitest';
import {
  attachedSourceIds,
  toggleUnitSelection,
  selectPageWithUnits,
  isAllPageSelected,
  resolveLinkableSelection,
  resolveUnlinkableSelection,
  findUnitSplitViolation,
} from '../utils/unitSelection';
import { dtoToRecord, type RecordDto } from '../services/recordService';
import type { ArchiveRecord } from '../types';

// ── 夹具 ──
function rec(id: string, overrides: Partial<ArchiveRecord> = {}): ArchiveRecord {
  return {
    id,
    archiveCode: `Z001-PEND-${id}`,
    voucherNo: `记-${id}`,
    archiveType: '记账凭证',
    department: '财务部',
    amount: 100,
    year: '2026',
    month: '06',
    retention: '30年',
    status: '仅件数据',
    numbered: false,
    source: 'digitized',
    carrierType: 'electronic',
    checks: { real: false, complete: false, usable: false, safe: false },
    checkDetails: [],
    components: [],
    auditLogs: [],
    remarks: '',
    ...overrides,
  } as ArchiveRecord;
}

/** 原始凭证件（真实数据形态：archiveType=记账凭证 + voucherCategory=原始凭证） */
function sourceDoc(id: string, parentRecordId?: string): ArchiveRecord {
  return rec(id, { voucherCategory: '原始凭证', parentRecordId, voucherNo: `票-${id}` });
}

const pool: ArchiveRecord[] = [
  rec('v1'), rec('v2'),
  sourceDoc('s1', 'v1'), sourceDoc('s2', 'v1'), // v1 的两个附件
  sourceDoc('s3'),                              // 未挂接孤儿
];

describe('toggleUnitSelection — 单笔勾选单元化', () => {
  it('勾选记账凭证自动带上其全部已挂接原始凭证', () => {
    const out = toggleUnitSelection(pool, new Set(), 'v1');
    expect([...out].sort()).toEqual(['s1', 's2', 'v1']);
  });

  it('取消凭证对称移除其附件', () => {
    const out = toggleUnitSelection(pool, new Set(['v1', 's1', 's2', 's3']), 'v1');
    expect([...out]).toEqual(['s3']); // 手动勾的孤儿 s3 不受影响
  });

  it('单勾/取消原始凭证只影响自己', () => {
    const add = toggleUnitSelection(pool, new Set(), 's1');
    expect([...add]).toEqual(['s1']);
    const del = toggleUnitSelection(pool, new Set(['s1', 'v2']), 's1');
    expect([...del]).toEqual(['v2']);
  });

  it('勾选无附件凭证只选自己', () => {
    const out = toggleUnitSelection(pool, new Set(), 'v2');
    expect([...out]).toEqual(['v2']);
  });
});

describe('selectPageWithUnits — 全选并集 + 跨页扩展', () => {
  it('当前页全选：并集保留既有选择，附件跨页也扩展', () => {
    // 当前页只有 v1、s3；v1 的附件 s1/s2 在"其他页"
    const out = selectPageWithUnits(pool, ['v1', 's3'], new Set(['v2']));
    expect([...out].sort()).toEqual(['s1', 's2', 's3', 'v1', 'v2']);
  });

  it('isAllPageSelected：选择集含页外 id 仍判全选', () => {
    expect(isAllPageSelected(['v1', 's3'], new Set(['v1', 's3', 's1', 's2']))).toBe(true);
    expect(isAllPageSelected(['v1', 's3'], new Set(['v1']))).toBe(false);
    expect(isAllPageSelected([], new Set())).toBe(false);
  });
});

describe('resolveLinkableSelection — 组件选择集解析', () => {
  it('1 凭证 + N 张未挂接原始凭证 → 可挂接', () => {
    const out = resolveLinkableSelection(pool, new Set(['v1', 's3']));
    expect(out).toEqual({ voucherId: 'v1', sourceIds: ['s3'] });
  });

  it('已挂在本凭证上的附件幂等跳过，只挂未挂接的', () => {
    const out = resolveLinkableSelection(pool, new Set(['v1', 's1', 's3']));
    expect(out).toEqual({ voucherId: 'v1', sourceIds: ['s3'] });
  });

  it('全部已挂在本凭证 → null（无事可做）', () => {
    expect(resolveLinkableSelection(pool, new Set(['v1', 's1', 's2']))).toBeNull();
  });

  it('2 张凭证 / 纯原始凭证 / 挂到别凭证的混合 → null', () => {
    expect(resolveLinkableSelection(pool, new Set(['v1', 'v2', 's3']))).toBeNull();
    expect(resolveLinkableSelection(pool, new Set(['s3']))).toBeNull();
    expect(resolveLinkableSelection(pool, new Set(['v2', 's1']))).toBeNull(); // s1 挂在 v1
  });
});

describe('resolveUnlinkableSelection — 解挂选择集解析', () => {
  it('纯已挂接原始凭证 → 返回 id 列表', () => {
    expect(resolveUnlinkableSelection(pool, new Set(['s1', 's2']))?.sort()).toEqual(['s1', 's2']);
  });

  it('含未挂接原始凭证或凭证 → null', () => {
    expect(resolveUnlinkableSelection(pool, new Set(['s1', 's3']))).toBeNull();
    expect(resolveUnlinkableSelection(pool, new Set(['s1', 'v1']))).toBeNull();
  });
});

describe('findUnitSplitViolation — 卷内单元闭合校验', () => {
  const volumeItems = ['v1', 's1', 's2', 'v2']; // 卷内件
  const resolve = (id: string) => pool.find((r) => r.id === id);

  it('附件入选但其父件在同卷未同选 → 违规', () => {
    const msg = findUnitSplitViolation(volumeItems, new Set(['s1']), resolve);
    expect(msg).toContain('票-s1');
  });

  it('父件同选 → 通过', () => {
    expect(findUnitSplitViolation(volumeItems, new Set(['v1', 's1', 's2']), resolve)).toBeNull();
  });

  it('父件不在本卷（已属他卷/池）→ 不拦', () => {
    expect(findUnitSplitViolation(volumeItems, new Set(['s3']), resolve)).toBeNull();
    expect(findUnitSplitViolation(volumeItems, new Set(['v2']), resolve)).toBeNull();
  });

  it('attachedSourceIds 辅助', () => {
    expect(attachedSourceIds(pool, 'v1').sort()).toEqual(['s1', 's2']);
    expect(attachedSourceIds(pool, 'v2')).toEqual([]);
  });
});

describe('dtoToRecord — parentRecordId 透出（v2.3）', () => {
  const baseDto: RecordDto = {
    nodeId: 'n1', name: 'a.pdf', nodeType: 'finance:record', archiveCode: 'Z001-PEND-x',
    voucherNo: '记-1', archiveType: '记账凭证', department: '', amount: 1, year: 2026, month: 6,
    retention: '30年', recordStatus: '仅件数据', source: 'digitized', carrierType: 'electronic',
    preparer: '', voucherCategory: '原始凭证', remarks: '', numbered: false,
    createdAt: '', modifiedAt: '', mimeType: 'application/pdf', sizeInBytes: 10,
  };

  it('有值透出 / 空串与缺省容忍', () => {
    expect(dtoToRecord({ ...baseDto, parentRecordId: 'v-9' }).parentRecordId).toBe('v-9');
    expect(dtoToRecord({ ...baseDto, parentRecordId: '' }).parentRecordId).toBeUndefined();
    expect(dtoToRecord(baseDto).parentRecordId).toBeUndefined();
  });
});
