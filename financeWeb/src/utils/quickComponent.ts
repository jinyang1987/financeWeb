/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * quickComponent — 「快速组件」交互核心纯函数（2026-08）
 *
 * 快速组件 = 一种更"放松"的配对交互，**凭证优先**：
 *   1. 点一下左侧记账凭证 → 它成为"激活"凭证，染上专属颜色；
 *   2. 逐个点右侧原始凭证 → 立刻配到激活凭证上、跟随同色
 *      （再点一下取消配对；切到别的凭证后再点则直接"搬家"）；
 *   3. 也可以直接把原始凭证拖拽到凭证上配对；
 *   4. 【确认组件】批量调用 linkRecordParent 落库，形成「件」单元。
 *
 * 本模块只承载与 UI 无关的纯逻辑（颜色分配 / 激活 / 配对 / 校验），
 * 便于单测且不侵染既有 VolumeWorkspacePage 逻辑。
 */

import type { ArchiveRecord } from '../types';
import { isSourceDocument } from './recordType';

// ── 色系（多凭证同时操作时一眼分清；从"蓝/绿/紫"起步，不足时循环复用） ──
export interface VoucherColor {
  key: string;
  name: string;
  /** 主题色 hex（渐变/内联样式用） */
  hex: string;
  /** Tailwind 浅底 class（已配对原始凭证卡片底色） */
  bgSoft: string;
  /** Tailwind 深底 class（激活凭证卡片底色，比 bgSoft 深一档） */
  bgActive: string;
  /** Tailwind 边框 class（激活/已配对） */
  border: string;
  /** 激活光晕 ring class */
  ring: string;
  /** 文字色 */
  text: string;
  /** 左侧凭证卡片左侧色条 / 圆点 class */
  bar: string;
}

export const VOUCHER_COLORS: VoucherColor[] = [
  { key: 'blue',   name: '蓝',   hex: '#0284c7', bgSoft: 'bg-sky-50',     bgActive: 'bg-sky-100/70',     border: 'border-sky-400',     ring: 'ring-sky-200',     text: 'text-sky-700',     bar: 'bg-sky-500' },
  { key: 'green',  name: '绿',   hex: '#059669', bgSoft: 'bg-emerald-50', bgActive: 'bg-emerald-100/70', border: 'border-emerald-400', ring: 'ring-emerald-200', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  { key: 'purple', name: '紫',   hex: '#7c3aed', bgSoft: 'bg-violet-50',  bgActive: 'bg-violet-100/70',  border: 'border-violet-400',  ring: 'ring-violet-200',  text: 'text-violet-700',  bar: 'bg-violet-500' },
  { key: 'orange', name: '橙',   hex: '#ea580c', bgSoft: 'bg-orange-50',  bgActive: 'bg-orange-100/70',  border: 'border-orange-400',  ring: 'ring-orange-200',  text: 'text-orange-700',  bar: 'bg-orange-500' },
  { key: 'rose',   name: '玫红', hex: '#e11d48', bgSoft: 'bg-rose-50',    bgActive: 'bg-rose-100/70',    border: 'border-rose-400',    ring: 'ring-rose-200',    text: 'text-rose-700',    bar: 'bg-rose-500' },
  { key: 'teal',   name: '青',   hex: '#0d9488', bgSoft: 'bg-teal-50',    bgActive: 'bg-teal-100/70',    border: 'border-teal-400',    ring: 'ring-teal-200',    text: 'text-teal-700',    bar: 'bg-teal-500' },
];

/** 按凭证在待配对列表中的顺序分配颜色（index 取模复用，保证每组至少蓝/绿/紫打头） */
export function colorForIndex(index: number): VoucherColor {
  return VOUCHER_COLORS[index % VOUCHER_COLORS.length];
}

/** 凭证是否可作配对目标：非原始凭证主体件（记账凭证/账簿/报告等） */
export function isPairableVoucher(r: ArchiveRecord): boolean {
  return !isSourceDocument(r);
}

/** 原始凭证是否可配对：未挂接（parentRecordId 为空） */
export function isPairableSource(r: ArchiveRecord): boolean {
  return isSourceDocument(r) && !r.parentRecordId;
}

// ── 状态模型（凭证优先） ──
export interface QuickComponentState {
  /** 当前激活的记账凭证：先点左侧选中，之后点右侧原始凭证都配到它上面；再点一次取消激活 */
  activeVoucherId: string | null;
  /** 已配对关系：原始凭证 id → 记账凭证 id（未落库，仅弹窗内临时预览） */
  pairs: Map<string, string>;
}

export const emptyQuickComponentState = (): QuickComponentState => ({
  activeVoucherId: null,
  pairs: new Map(),
});

/**
 * 激活/切换记账凭证。
 * 点击已激活的凭证 = 取消激活（放松式交互，随时可反悔）。
 */
export function activateVoucher(
  state: QuickComponentState,
  voucherId: string,
): QuickComponentState {
  const next = state.activeVoucherId === voucherId ? null : voucherId;
  if (next === state.activeVoucherId) return state;
  return { ...state, activeVoucherId: next };
}

/**
 * 点按右侧原始凭证的配对切换（凭证优先模型的核心）：
 *   · 已配给当前激活凭证 → 再点一下取消配对；
 *   · 未配对 / 配给了别的凭证，且存在激活凭证 → 配对 / 搬家到激活凭证；
 *   · 无激活凭证但已配对 → 点按取消配对；
 *   · 无激活凭证且未配对 → 无操作（UI 层给出"先选凭证"引导）。
 */
export function toggleSourcePair(
  state: QuickComponentState,
  sourceId: string,
): QuickComponentState {
  const pairedTo = state.pairs.get(sourceId);
  const pairs = new Map(state.pairs);
  if (pairedTo && pairedTo === state.activeVoucherId) {
    pairs.delete(sourceId);
    return { ...state, pairs };
  }
  if (state.activeVoucherId) {
    pairs.set(sourceId, state.activeVoucherId);
    return { ...state, pairs };
  }
  if (pairedTo) {
    pairs.delete(sourceId);
    return { ...state, pairs };
  }
  return state;
}

/** 把某原始凭证直接配到指定凭证（拖拽配对；已配到同一目标时无操作） */
export function pairSourceToVoucher(
  state: QuickComponentState,
  sourceId: string,
  voucherId: string,
): QuickComponentState {
  if (state.pairs.get(sourceId) === voucherId) return state;
  const pairs = new Map(state.pairs);
  pairs.set(sourceId, voucherId);
  return { ...state, pairs };
}

/** 取消某原始凭证的配对（回到未配对态） */
export function unpairSource(
  state: QuickComponentState,
  sourceId: string,
): QuickComponentState {
  if (!state.pairs.has(sourceId)) return state;
  const pairs = new Map(state.pairs);
  pairs.delete(sourceId);
  return { ...state, pairs };
}

/** 批量确认前的校验：返回错误文案（null = 可确认）。规则：配对关系不得为空。 */
export function validateQuickPairs(pairs: Map<string, string>): string | null {
  if (pairs.size === 0) return '还没有配对哦——先点一张记账凭证，再点右侧原始凭证试试';
  return null;
}

/**
 * 收集待落库的配对动作：按 voucherId 聚合，
 * 便于逐凭证批量调用 linkRecordParent。返回顺序稳定的 { voucherId, sourceIds[] } 列表。
 */
export function collectPairActions(pairs: Map<string, string>): Array<{ voucherId: string; sourceIds: string[] }> {
  const byVoucher = new Map<string, string[]>();
  pairs.forEach((voucherId, sourceId) => {
    const arr = byVoucher.get(voucherId) || [];
    arr.push(sourceId);
    byVoucher.set(voucherId, arr);
  });
  return Array.from(byVoucher.entries()).map(([voucherId, sourceIds]) => ({ voucherId, sourceIds }));
}
