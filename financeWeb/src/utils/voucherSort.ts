/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * voucherSort — 凭证排序统一口径（2026-08-21）
 *
 * 会计实操：凭证卷的卷内排列（装订顺序）以「制单日期 + 凭证号」为准——
 * 同一制单日期内按凭证号升序；跨日期按制单日期先后。
 * 待组卷池里既有已成「件」的（记账凭证已挂接原始凭证），也有散件，
 * 两者统一按本比较器排序；该顺序同时是智能组卷凭证类的选取/切分顺序。
 *
 * 凭证号由会计核算系统生成（本系统不编造），常见形态「记-001」「记-12」，
 * 解析失败时退化为字符串字典序。
 */

import type { ArchiveRecord } from '../types';

/**
 * 日期串归一化到日（2026-08-22 显示修复）：
 *   「2026-08-21 10:30:00」「2026-08-21T10:30:00+08:00」「2026/8/2」→「2026-08-21」；
 *   「2026-08」→「2026-08」（补零）；空串返回 ''；无法识别的非标格式原样返回。
 * 上游 voucherDate 来源杂（BIP 推送可能带时间分量），展示与排序统一走本函数。
 */
export function normalizeDateDay(s?: string): string {
  const v = (s || '').trim();
  if (!v) return '';
  const d = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (d) return `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`;
  const ym = v.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, '0')}`;
  return v;
}

/**
 * 制单日期展示/排序统一键：优先 voucherDate（归一化到日），缺省回退「年-月」；
 * 月也缺省时只回到「年」——不编造「-01」（曾把无月份记录显示成 1 月，2026-08-22 修复）。
 */
export function voucherDateOf(r: Pick<ArchiveRecord, 'voucherDate' | 'year' | 'month'>): string {
  const vd = normalizeDateDay(r.voucherDate);
  if (vd) return vd;
  const m = parseInt(r.month);
  if (m >= 1 && m <= 12) return `${r.year}-${String(m).padStart(2, '0')}`;
  return r.year || '';
}

/** 凭证号解析：「记-001」→ { prefix: '记', number: 1 }；无法解析返回 null */
export function parseVoucherNo(voucherNo: string): { prefix: string; number: number } | null {
  const m = (voucherNo || '').match(/^(.+?)-(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], number: parseInt(m[2], 10) };
}

/** 凭证号自然序：同前缀按数字，跨前缀按前缀字典序，不可解析按整串字典序 */
export function compareVoucherNo(a: string, b: string): number {
  const pa = parseVoucherNo(a);
  const pb = parseVoucherNo(b);
  if (!pa || !pb) return (a || '').localeCompare(b || '');
  if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
  return pa.number - pb.number;
}

/** 制单日期 + 凭证号 复合比较器（凭证类组卷唯一排序依据） */
export function compareVoucherDateNo(
  a: Pick<ArchiveRecord, 'voucherDate' | 'year' | 'month' | 'voucherNo'>,
  b: Pick<ArchiveRecord, 'voucherDate' | 'year' | 'month' | 'voucherNo'>,
): number {
  const d = voucherDateOf(a).localeCompare(voucherDateOf(b));
  if (d !== 0) return d;
  return compareVoucherNo(a.voucherNo, b.voucherNo);
}
