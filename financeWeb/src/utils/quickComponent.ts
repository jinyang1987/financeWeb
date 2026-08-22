/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * quickComponent — 「快速组件」交互核心纯函数（2026-08 智能组卷左侧·快速组件）
 *
 * 快速组件 = 一种更"放松"的配对交互：把右侧未挂接的原始凭证，通过
 *   · 拖拽：原始凭证卡片 → 记账凭证卡片
 *   · 点击：先点选原始凭证，再点记账凭证
 * 两种方式配对到左侧记账凭证上，形成「件」单元。确认后批量调用 linkRecordParent 落库。
 *
 * 本模块只承载与 UI 无关的纯逻辑（颜色分配 / 选中切换 / 配对 / 校验），
 * 便于单测且不侵染既有 VolumeWorkspacePage 逻辑。
 */

import type { ArchiveRecord } from '../types';
import { isSourceDocument } from './recordType';

// ── 色系（多凭证同时操作时一眼分清；从"蓝/绿/紫"起步，不足时循环复用） ──
export interface VoucherColor {
  key: string;
  name: string;
  /** 主题色 hex（右侧原始凭证跟随同色的主色） */
  hex: string;
  /** Tailwind 浅底 class（凭证/原始凭证卡片底色） */
  bgSoft: string;
  /** Tailwind 深边 class（当前配对中边框） */
  border: string;
  /** 文字色 */
  text: string;
  /** 左侧凭证卡片左侧色条 class */
  bar: string;
}

export const VOUCHER_COLORS: VoucherColor[] = [
  { key: 'blue',   name: '蓝', hex: '#0284c7', bgSoft: 'bg-sky-50',   border: 'border-sky-400',   text: 'text-sky-700',   bar: 'bg-sky-500' },
  { key: 'green',  name: '绿', hex: '#059669', bgSoft: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  { key: 'purple', name: '紫', hex: '#7c3aed', bgSoft: 'bg-violet-50',  border: 'border-violet-400',  text: 'text-violet-700',  bar: 'bg-violet-500' },
  { key: 'orange', name: '橙', hex: '#ea580c', bgSoft: 'bg-orange-50',  border: 'border-orange-400',  text: 'text-orange-700',  bar: 'bg-orange-500' },
  { key: 'rose',   name: '玫红', hex: '#e11d48', bgSoft: 'bg-rose-50',  border: 'border-rose-400',    text: 'text-rose-700',    bar: 'bg-rose-500' },
  { key: 'teal',   name: '青', hex: '#0d9488', bgSoft: 'bg-teal-50',   border: 'border-teal-400',   text: 'text-teal-700',   bar: 'bg-teal-500' },
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

// ── 状态模型 ──
export interface QuickComponentState {
  /** 右侧已点选的原始凭证 id 集 */
  selectedSourceIds: Set<string>;
  /** 已配对关系：原始凭证 id → 记账凭证 id（未落库，仅弹窗内临时预览） */
  pairs: Map<string, string>;
}

export const emptyQuickComponentState = (): QuickComponentState => ({
  selectedSourceIds: new Set(),
  pairs: new Map(),
});

/** 切换某原始凭证的"点选"态（未挂接的才允许点选；已配对的不参与点选） */
export function toggleSourceSelection(
  state: QuickComponentState,
  sourceId: string,
  pairedSourceIds: Set<string>,
): QuickComponentState {
  if (pairedSourceIds.has(sourceId)) return state; // 已配对的由"取消配对"管理
  const next = new Set(state.selectedSourceIds);
  if (next.has(sourceId)) next.delete(sourceId);
  else next.add(sourceId);
  return { ...state, selectedSourceIds: next };
}

/**
 * 把"当前点选的原始凭证"配对到某记账凭证。
 * 约束：①至少 1 张已点选原始凭证；②这些原始凭证须未挂接（未配对）。
 * 返回新状态；若无可配对（点选为空/含已配对）返回原状态。
 */
export function pairSelectedSourcesToVoucher(
  state: QuickComponentState,
  voucherId: string,
  pairedSourceIds: Set<string>,
): QuickComponentState {
  const sources = [...state.selectedSourceIds].filter((id) => !pairedSourceIds.has(id));
  if (sources.length === 0) return state;
  const pairs = new Map(state.pairs);
  for (const sid of sources) pairs.set(sid, voucherId);
  return { ...state, pairs, selectedSourceIds: new Set() };
}

/** 取消某原始凭证的配对（回到未配对态） */
export function unpairSource(
  state: QuickComponentState,
  sourceId: string,
): QuickComponentState {
  const pairs = new Map(state.pairs);
  pairs.delete(sourceId);
  return { ...state, pairs };
}

/** 批量确认前的校验：返回错误文案（null = 可确认）。规则：配对关系不得为空。 */
export function validateQuickPairs(pairs: Map<string, string>): string | null {
  if (pairs.size === 0) return '请先拖拽或点选原始凭证到记账凭证上，再确认组件';
  return null;
}

/**
 * 收集待落库的配对动作：原始凭证 id → 记账凭证 id 数组（按 voucherId 聚合，
 * 便于逐凭证批量调用 linkRecordParent）。返回顺序稳定的 { voucherId, sourceIds[] } 列表。
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
