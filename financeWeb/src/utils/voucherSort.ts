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

/** 制单日期排序键：优先 voucherDate（yyyy-MM-dd），缺省回退 year-month（月初） */
export function voucherDateOf(r: Pick<ArchiveRecord, 'voucherDate' | 'year' | 'month'>): string {
  if (r.voucherDate && r.voucherDate.length >= 7) return r.voucherDate;
  const m = parseInt(r.month);
  return `${r.year}-${m >= 1 && m <= 12 ? String(m).padStart(2, '0') : '01'}`;
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
