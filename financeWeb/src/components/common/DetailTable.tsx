/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * DetailTable — 详情展示统一组件族（2026-08-08）
 *
 * 背景：全站详情面板曾有 5 种键值对风格并存（flex 行/grid 色块/字段卡片/
 * inline 文本/冒号句），无一用真表格。本组件族统一为规整表格语言：
 *
 *   <DetailSection>  分区容器（图标 + 标题 + 徽标位 + 内容）
 *   <FieldGrid>      单条记录的键值对表格（真 <table>：label 灰底列 + value 列，1~3 对/行）
 *   <DetailRows>     明细行集合表格（表头 + 数据行，支持对齐/等宽列）
 *
 * 使用：RecordDetailPanel / DrawerPanel / smart-receive 三面板 / SourceDocDrawer 等
 * 详情区一律经此渲染，禁止再造私有键值对组件。
 */

import React from 'react';

// ═══════════════════ FieldGrid：键值对表格 ═══════════════════

export interface FieldItem {
  /** 字段名（label 列） */
  label: React.ReactNode;
  /** 字段值（value 列），空值自动显示 — */
  value: React.ReactNode;
  /** 值等宽字体（编号/档号/日期/金额） */
  mono?: boolean;
  /** 值附加样式（如金额红绿） */
  valueClassName?: string;
  /** 跨几对列（默认 1；columns=2 时 span=2 即整行） */
  span?: number;
}

interface FieldGridProps {
  fields: FieldItem[];
  /** 每行键值对数（默认 2） */
  columns?: 1 | 2 | 3;
  className?: string;
}

export const FieldGrid: React.FC<FieldGridProps> = ({ fields, columns = 2, className }) => {
  // 按 span 分行：累加 span 满 columns 即换行
  const rows: FieldItem[][] = [];
  let cur: FieldItem[] = [];
  let curSpan = 0;
  for (const f of fields) {
    const span = Math.min(f.span ?? 1, columns);
    if (curSpan + span > columns) {
      rows.push(cur);
      cur = [];
      curSpan = 0;
    }
    cur.push({ ...f, span });
    curSpan += span;
  }
  if (cur.length > 0) rows.push(cur);

  const empty = (v: React.ReactNode) =>
    v === null || v === undefined || v === '' ? <span className="text-slate-300">—</span> : v;

  return (
    <div className={`border border-slate-200 rounded-lg overflow-hidden ${className || ''}`}>
      <table className="w-full text-xs border-collapse">
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri > 0 ? 'border-t border-slate-100' : ''}>
              {row.map((f, fi) => (
                <React.Fragment key={fi}>
                  <th
                    className="bg-slate-50 text-slate-500 font-medium text-left px-3 py-1.5 align-top whitespace-nowrap border-r border-slate-100"
                    style={{ width: columns === 1 ? '120px' : '88px' }}
                    scope="row"
                  >
                    {f.label}
                  </th>
                  <td
                    colSpan={(f.span! - 1) * 2 + 1}
                    className={`px-3 py-1.5 align-top text-slate-700 break-all ${f.mono ? 'font-mono' : ''} ${f.valueClassName || ''}`}
                  >
                    {empty(f.value)}
                  </td>
                </React.Fragment>
              ))}
              {/* 补齐整行不足 columns 对的空缺 */}
              {(() => {
                const used = row.reduce((s, f) => s + f.span!, 0);
                const pad = columns - used;
                return pad > 0 ? <td colSpan={pad * 2} className="bg-white" /> : null;
              })()}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ═══════════════════ DetailSection：分区容器 ═══════════════════

interface DetailSectionProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** 标题右侧徽标/计数区 */
  badges?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const DetailSection: React.FC<DetailSectionProps> = ({ icon, title, badges, children, className }) => (
  <section className={`bg-white border border-slate-200 rounded-xl p-4 ${className || ''}`}>
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <span className="text-xs font-semibold text-slate-700">{title}</span>
      {badges}
    </div>
    {children}
  </section>
);

// ═══════════════════ DetailRows：明细行集合表格 ═══════════════════

interface DetailRowsProps {
  heads: React.ReactNode[];
  rows: React.ReactNode[][];
  /** 列对齐（默认左） */
  aligns?: Array<'left' | 'right' | 'center'>;
  /** 等宽字体列下标 */
  monoCols?: number[];
  className?: string;
  emptyText?: string;
}

export const DetailRows: React.FC<DetailRowsProps> = ({
  heads, rows, aligns, monoCols, className, emptyText = '暂无数据',
}) => {
  const alignOf = (i: number) => aligns?.[i] ?? (monoCols?.includes(i) ? 'right' : 'left');
  const alignCls = (a: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  if (rows.length === 0) {
    return (
      <div className={`border border-slate-200 rounded-lg px-4 py-6 text-center text-xs text-slate-400 ${className || ''}`}>
        {emptyText}
      </div>
    );
  }

  return (
    <div className={`border border-slate-200 rounded-lg overflow-hidden ${className || ''}`}>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {heads.map((h, i) => (
              <th key={i} className={`px-3 py-2 font-semibold text-slate-600 ${alignCls(alignOf(i))}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-1.5 text-slate-700 ${alignCls(alignOf(ci))} ${monoCols?.includes(ci) ? 'font-mono' : ''}`}
                >
                  {cell === null || cell === undefined || cell === ''
                    ? <span className="text-slate-300">—</span>
                    : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ═══════════════════ DetailPanelHeader：详情面板头部（smart-receive 三面板共用） ═══════════════════

interface DetailPanelHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}

export const DetailPanelHeader: React.FC<DetailPanelHeaderProps> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-200">
    {icon}
    <div className="min-w-0 flex-1">
      <div className="text-sm font-semibold text-slate-700 truncate">{title}</div>
      {subtitle && <div className="text-[11px] text-slate-400 mt-0.5">{subtitle}</div>}
    </div>
  </div>
);
