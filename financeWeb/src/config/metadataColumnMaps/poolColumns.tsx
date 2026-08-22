/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * poolColumns — 组卷工作台待组卷池 · 分档案类别列映射（2026-08-21）
 *
 * 背景：凭证/账簿/报告/其他四类会计档案的业务元数据不同（DA/T 94-2022
 * 各类有类专用字段）——账簿没有金额与凭证号、报告有期间与报表分类。
 * 此前待组卷池不论切到哪类都套凭证列，是不对的。
 *
 * 方案：列随「类别筛选」联动——
 *   KP（记账凭证）：仍由 metadataDisplayStore 'voucher' 上下文驱动（页面设置可配），
 *     不在本文件；本文件提供 ALL（全部混合）/ KB / FB / QT 四套固定默认列。
 *   每套首列 id 统一为 VOUCHER_NO（承载「件」单元展开/挂接徽标的包装逻辑）。
 */

import React from 'react';
import type { ArchiveRecord } from '../../types';
import type { ColumnDef } from './voucherColumns';
import { voucherDateOf } from '../../utils/voucherSort';

/** 待组卷池类别（与筛选栏「全部/记账凭证/会计账簿/财务报告/其他会计资料」对应） */
export type PoolCategory = 'ALL' | 'KB' | 'FB' | 'QT';

// ── 单元格渲染小件 ──
const text = (v: React.ReactNode, cls = 'text-xs text-slate-600') => <span className={cls}>{v}</span>;

const nameCell = (r: ArchiveRecord) => (
  <span className="font-mono font-bold text-slate-800 text-xs truncate block" title={r.voucherNo}>{r.voucherNo}</span>
);

const summaryCell = (r: ArchiveRecord) => (
  <span className="text-xs text-slate-700 truncate block" title={r.remarks || r.summary || ''}>
    {r.remarks || r.summary || '—'}
  </span>
);

const amountCell = (r: ArchiveRecord) => (
  r.amount > 0
    ? <span className="font-mono text-xs font-medium text-slate-800">{'¥'}{r.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
    : <span className="text-slate-300 text-xs">—</span>
);

const attachCell = (r: ArchiveRecord) => {
  // ⚠ 同 voucherColumns：默认实现读遗留字段（恒 0）；工作台按挂接关系覆盖，见 VolumeWorkspacePage.poolColumns
  const count = r.sourceDocumentIds?.length || 0;
  return count > 0
    ? <span className="text-amber-600 font-medium text-xs">{count} 份</span>
    : <span className="text-slate-400 text-xs">无</span>;
};

/** 类别徽标（混合视图专用：一眼区分本行属于哪类；两字短标签，2026-08-21） */
const TYPE_BADGE: Record<string, string> = {
  '记账凭证': 'bg-sky-50 text-sky-700 border-sky-200',
  '原始凭证': 'bg-amber-50 text-amber-700 border-amber-200',
  '会计账簿': 'bg-violet-50 text-violet-700 border-violet-200',
  '财务报告': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '财务报表': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '其他会计资料': 'bg-slate-100 text-slate-600 border-slate-200',
};
/** 全称 → 两字短标签（列宽窄，全称四字起步太挤） */
const TYPE_SHORT: Record<string, string> = {
  '记账凭证': '凭证',
  '原始凭证': '原始',
  '会计账簿': '账簿',
  '财务报告': '报表',
  '财务报表': '报表',
  '其他会计资料': '其他',
};
const typeBadgeCell = (r: ArchiveRecord) => {
  const full = r.voucherCategory === '原始凭证' ? '原始凭证' : (r.archiveType || '—');
  const cls = TYPE_BADGE[full] || 'bg-slate-100 text-slate-600 border-slate-200';
  const short = TYPE_SHORT[full] || full;
  return (
    <span className={`inline-block px-1.5 py-px text-[10px] font-medium rounded border ${cls}`} title={full}>
      {short}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════
// 四套列定义
// ═══════════════════════════════════════════════════════════

/** 全部（混合视图）：通用列 + 类别徽标。
 *  列宽口径（2026-08-22 重排）：表头全显优先——宽 ≥ 表头字数×13 + 排序图标 18 + 内边距 32，
 *  截断时 hover 悬浮见全名（DataTable 表头/单元格均已挂 title）。 */
const ALL_COLUMNS: ColumnDef[] = [
  { metaId: 'VOUCHER_NO', label: '凭证号/名称', accessor: nameCell, width: '134px', align: 'left' },
  { metaId: 'ARCHIVE_TYPE', label: '类别', accessor: typeBadgeCell, width: '72px', align: 'left' },
  { metaId: 'DATE', label: '制单日期', accessor: (r) => text(voucherDateOf(r), 'text-xs text-slate-500'), width: '104px', align: 'left' },
  { metaId: 'SUMMARY', label: '摘要', accessor: summaryCell, width: '130px', align: 'left' },
  { metaId: 'AMOUNT', label: '金额', accessor: amountCell, width: '104px', align: 'right' },
  { metaId: 'ATTACHMENTS', label: '附件', accessor: attachCell, width: '64px', align: 'left' },
];

/** 会计账簿：名称 + 子类型（总账/明细账/日记账…）+ 年度/期限 */
const KB_COLUMNS: ColumnDef[] = [
  { metaId: 'VOUCHER_NO', label: '账簿名称', accessor: nameCell, width: '130px', align: 'left' },
  { metaId: 'SUB_TYPE', label: '账簿子类型', accessor: (r) => text(r.subType || '—'), width: '100px', align: 'left' },
  { metaId: 'YEAR', label: '年度', accessor: (r) => text(r.year, 'text-xs text-slate-500'), width: '84px', align: 'left' },
  { metaId: 'RETENTION', label: '保管期限', accessor: (r) => text(r.retention || '—'), width: '88px', align: 'left' },
  { metaId: 'SUMMARY', label: '摘要', accessor: summaryCell, width: '120px', align: 'left' },
];

/** 财务报告：名称 + 期间/报表分类 + 年度/期限 */
const FB_COLUMNS: ColumnDef[] = [
  { metaId: 'VOUCHER_NO', label: '报告名称', accessor: nameCell, width: '130px', align: 'left' },
  { metaId: 'REPORT_PERIOD', label: '报告期间', accessor: (r) => text(r.reportPeriod || '—'), width: '88px', align: 'left' },
  { metaId: 'REPORT_CATEGORY', label: '报表分类', accessor: (r) => text(r.reportCategory || '—'), width: '88px', align: 'left' },
  { metaId: 'YEAR', label: '年度', accessor: (r) => text(r.year, 'text-xs text-slate-500'), width: '84px', align: 'left' },
  { metaId: 'RETENTION', label: '保管期限', accessor: (r) => text(r.retention || '—'), width: '88px', align: 'left' },
];

/** 其他会计资料：名称 + 子类型 + 日期/期限 */
const QT_COLUMNS: ColumnDef[] = [
  { metaId: 'VOUCHER_NO', label: '资料名称', accessor: nameCell, width: '120px', align: 'left' },
  { metaId: 'SUB_TYPE', label: '资料子类型', accessor: (r) => text(r.subType || '—'), width: '100px', align: 'left' },
  { metaId: 'DATE', label: '日期', accessor: (r) => text(voucherDateOf(r), 'text-xs text-slate-500'), width: '104px', align: 'left' },
  { metaId: 'RETENTION', label: '保管期限', accessor: (r) => text(r.retention || '—'), width: '88px', align: 'left' },
  { metaId: 'SUMMARY', label: '摘要', accessor: summaryCell, width: '110px', align: 'left' },
];

export const POOL_COLUMN_SETS: Record<PoolCategory, ColumnDef[]> = {
  ALL: ALL_COLUMNS,
  KB: KB_COLUMNS,
  FB: FB_COLUMNS,
  QT: QT_COLUMNS,
};

/** 各类别下允许排序的列与取值（接入 DataTable 排序） */
export const POOL_SORT_VALUES: Record<string, (r: ArchiveRecord) => string | number> = {
  VOUCHER_NO: (r) => r.voucherNo,
  DATE: (r) => voucherDateOf(r),
  AMOUNT: (r) => r.amount,
  YEAR: (r) => r.year,
};
export const POOL_SORTABLE_IDS = new Set(['VOUCHER_NO', 'DATE', 'AMOUNT', 'YEAR']);
