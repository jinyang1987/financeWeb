/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * quickComponent — 快速组件纯函数测试（2026-08）
 *
 * 覆盖：颜色分配（蓝/绿/紫打头 + 循环）/ 配对目标与源判定 /
 *      点选切换 / 点击配对 / 拖拽配对等价（同一函数）/ 取消配对 /
 *      确认前校验 / 配对动作收集。
 */

import { describe, it, expect } from 'vitest';
import {
  VOUCHER_COLORS,
  colorForIndex,
  isPairableVoucher,
  isPairableSource,
  emptyQuickComponentState,
  toggleSourceSelection,
  pairSelectedSourcesToVoucher,
  unpairSource,
  validateQuickPairs,
  collectPairActions,
} from '../utils/quickComponent';
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

function sourceDoc(id: string, parentRecordId?: string): ArchiveRecord {
  return rec(id, { voucherCategory: '原始凭证', parentRecordId, voucherNo: `票-${id}` });
}

describe('colorForIndex — 色系分配', () => {
  it('前三张凭证依次为蓝/绿/紫（多凭证一眼分清）', () => {
    expect(colorForIndex(0).key).toBe('blue');
    expect(colorForIndex(1).key).toBe('green');
    expect(colorForIndex(2).key).toBe('purple');
  });

  it('超出色板时循环复用，保证始终有可用颜色', () => {
    for (let i = 0; i < VOUCHER_COLORS.length * 2; i++) {
      expect(VOUCHER_COLORS).toContainEqual(colorForIndex(i));
    }
    // 第 N 张与第 0 张同色（循环）
    expect(colorForIndex(VOUCHER_COLORS.length).key).toBe(colorForIndex(0).key);
  });
});

describe('配对目标与源判定', () => {
  it('记账凭证可作配对目标；原始凭证不可', () => {
    expect(isPairableVoucher(rec('v1'))).toBe(true);
    expect(isPairableVoucher(sourceDoc('s1'))).toBe(false);
  });

  it('未挂接的原始凭证可配对；已挂接的不可', () => {
    expect(isPairableSource(sourceDoc('s1'))).toBe(true);
    expect(isPairableSource(sourceDoc('s2', 'v1'))).toBe(false);
    expect(isPairableSource(rec('v1'))).toBe(false);
  });
});

describe('toggleSourceSelection — 点选切换', () => {
  it('点选/再点取消', () => {
    const s0 = emptyQuickComponentState();
    const paired = new Set<string>();
    const s1 = toggleSourceSelection(s0, 's1', paired);
    expect(s1.selectedSourceIds.has('s1')).toBe(true);
    const s2 = toggleSourceSelection(s1, 's1', paired);
    expect(s2.selectedSourceIds.has('s1')).toBe(false);
  });

  it('已配对的原始凭证不可点选（走取消配对路径）', () => {
    const s0 = emptyQuickComponentState();
    const paired = new Set(['s1']);
    const s1 = toggleSourceSelection(s0, 's1', paired);
    expect(s1.selectedSourceIds.size).toBe(0);
  });
});

describe('pairSelectedSourcesToVoucher — 点击/拖拽配对', () => {
  it('把点选的原始凭证配对到目标凭证（点击配对）', () => {
    const s0 = emptyQuickComponentState();
    const paired = new Set<string>();
    const s1 = toggleSourceSelection(s0, 's1', paired);
    const s2 = toggleSourceSelection(s1, 's2', paired);
    const s3 = pairSelectedSourcesToVoucher(s2, 'v1', paired);
    expect(s3.pairs.get('s1')).toBe('v1');
    expect(s3.pairs.get('s2')).toBe('v1');
    // 配对后清空点选
    expect(s3.selectedSourceIds.size).toBe(0);
  });

  it('无点选时配对不产生任何关系', () => {
    const s0 = emptyQuickComponentState();
    const paired = new Set<string>();
    const s1 = pairSelectedSourcesToVoucher(s0, 'v1', paired);
    expect(s1.pairs.size).toBe(0);
  });

  it('点选中含已配对时，仅未配对的被配对（拖拽入同凭证也不冲突）', () => {
    const s0 = emptyQuickComponentState();
    const paired = new Set(['s2']);
    const s1 = toggleSourceSelection(s0, 's1', paired);
    const s2 = toggleSourceSelection(s1, 's2', paired); // s2 已配对，点选被拒
    const s3 = pairSelectedSourcesToVoucher(s2, 'v1', paired);
    expect(s3.pairs.get('s1')).toBe('v1');
    expect(s3.pairs.has('s2')).toBe(false); // 已配对的 s2 不在本次动作里
  });
});

describe('unpairSource — 取消配对', () => {
  it('移除某原始凭证的配对关系', () => {
    const s0 = emptyQuickComponentState();
    const paired = new Set<string>();
    const s1 = toggleSourceSelection(s0, 's1', paired);
    const s2 = pairSelectedSourcesToVoucher(s1, 'v1', paired);
    expect(s2.pairs.has('s1')).toBe(true);
    const s3 = unpairSource(s2, 's1');
    expect(s3.pairs.has('s1')).toBe(false);
  });
});

describe('validateQuickPairs — 确认前校验', () => {
  it('无配对时给出引导文案', () => {
    expect(validateQuickPairs(new Map())).toBe('请先拖拽或点选原始凭证到记账凭证上，再确认组件');
  });
  it('有配对时放行', () => {
    const m = new Map([['s1', 'v1']]);
    expect(validateQuickPairs(m)).toBeNull();
  });
});

describe('collectPairActions — 落库动作收集', () => {
  it('按凭证聚合原始凭证 id 并保持稳定顺序', () => {
    const pairs = new Map([
      ['s1', 'v1'],
      ['s2', 'v2'],
      ['s3', 'v1'],
    ]);
    const actions = collectPairActions(pairs);
    expect(actions).toEqual([
      { voucherId: 'v1', sourceIds: ['s1', 's3'] },
      { voucherId: 'v2', sourceIds: ['s2'] },
    ]);
  });
});
