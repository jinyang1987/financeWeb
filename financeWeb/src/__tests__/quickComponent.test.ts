/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * quickComponent — 快速组件纯函数测试（2026-08-22 凭证优先重设计）
 *
 * 覆盖：颜色分配（蓝/绿/紫打头 + 循环）/ 配对目标与源判定 /
 *      激活·取消激活·切换 / 点按配对·再点取消·跨凭证搬家 /
 *      拖拽配对 / 取消配对 / 确认前校验 / 配对动作收集。
 */

import { describe, it, expect } from 'vitest';
import {
  VOUCHER_COLORS,
  colorForIndex,
  isPairableVoucher,
  isPairableSource,
  emptyQuickComponentState,
  activateVoucher,
  toggleSourcePair,
  pairSourceToVoucher,
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

describe('activateVoucher — 激活 / 取消激活 / 切换', () => {
  it('点击凭证激活；再点同一张取消激活（放松式反悔）', () => {
    const s0 = emptyQuickComponentState();
    const s1 = activateVoucher(s0, 'v1');
    expect(s1.activeVoucherId).toBe('v1');
    const s2 = activateVoucher(s1, 'v1');
    expect(s2.activeVoucherId).toBeNull();
  });

  it('点击另一张凭证直接切换激活目标', () => {
    const s1 = activateVoucher(emptyQuickComponentState(), 'v1');
    const s2 = activateVoucher(s1, 'v2');
    expect(s2.activeVoucherId).toBe('v2');
  });
});

describe('toggleSourcePair — 点按配对（凭证优先核心）', () => {
  it('有激活凭证时，点未配对原始凭证 → 配到激活凭证', () => {
    const s0 = activateVoucher(emptyQuickComponentState(), 'v1');
    const s1 = toggleSourcePair(s0, 's1');
    expect(s1.pairs.get('s1')).toBe('v1');
  });

  it('点已配给当前激活凭证的原始凭证 → 取消配对', () => {
    const s0 = activateVoucher(emptyQuickComponentState(), 'v1');
    const s1 = toggleSourcePair(s0, 's1');
    const s2 = toggleSourcePair(s1, 's1');
    expect(s2.pairs.has('s1')).toBe(false);
  });

  it('切换激活凭证后再点已配对原始凭证 → 搬家到新凭证', () => {
    let s = activateVoucher(emptyQuickComponentState(), 'v1');
    s = toggleSourcePair(s, 's1'); // s1 → v1
    s = activateVoucher(s, 'v2');
    s = toggleSourcePair(s, 's1'); // 搬家：s1 → v2
    expect(s.pairs.get('s1')).toBe('v2');
  });

  it('无激活凭证时点未配对原始凭证 → 无操作（UI 层给引导）', () => {
    const s0 = emptyQuickComponentState();
    const s1 = toggleSourcePair(s0, 's1');
    expect(s1).toBe(s0);
    expect(s1.pairs.size).toBe(0);
  });

  it('无激活凭证时点已配对原始凭证 → 取消配对', () => {
    let s = activateVoucher(emptyQuickComponentState(), 'v1');
    s = toggleSourcePair(s, 's1');
    s = activateVoucher(s, 'v1'); // 取消激活
    expect(s.activeVoucherId).toBeNull();
    s = toggleSourcePair(s, 's1');
    expect(s.pairs.has('s1')).toBe(false);
  });
});

describe('pairSourceToVoucher — 拖拽配对', () => {
  it('不依赖激活态，直接把原始凭证配到指定凭证', () => {
    const s0 = emptyQuickComponentState();
    const s1 = pairSourceToVoucher(s0, 's1', 'v2');
    expect(s1.pairs.get('s1')).toBe('v2');
  });

  it('拖拽可覆盖既有配对目标（跨凭证搬家）', () => {
    let s = activateVoucher(emptyQuickComponentState(), 'v1');
    s = toggleSourcePair(s, 's1');
    s = pairSourceToVoucher(s, 's1', 'v3');
    expect(s.pairs.get('s1')).toBe('v3');
  });

  it('已配到同一目标时返回原状态（幂等）', () => {
    let s = pairSourceToVoucher(emptyQuickComponentState(), 's1', 'v2');
    const s2 = pairSourceToVoucher(s, 's1', 'v2');
    expect(s2).toBe(s);
  });
});

describe('unpairSource — 取消配对', () => {
  it('移除某原始凭证的配对关系', () => {
    const s0 = activateVoucher(emptyQuickComponentState(), 'v1');
    const s1 = toggleSourcePair(s0, 's1');
    expect(s1.pairs.has('s1')).toBe(true);
    const s2 = unpairSource(s1, 's1');
    expect(s2.pairs.has('s1')).toBe(false);
  });

  it('对未配对源无副作用（幂等）', () => {
    const s0 = emptyQuickComponentState();
    const s1 = unpairSource(s0, 'sX');
    expect(s1).toBe(s0);
  });
});

describe('validateQuickPairs — 确认前校验', () => {
  it('无配对时给出引导文案', () => {
    expect(validateQuickPairs(new Map())).toBe('还没有配对哦——先点一张记账凭证，再点右侧原始凭证试试');
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
