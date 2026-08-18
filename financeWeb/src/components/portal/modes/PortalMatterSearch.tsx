/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PortalMatterSearch — 门户「事项检索」模式
 *
 * 对齐后台「档案查询 → 事项检索」的能力：
 *   按经济业务定位档案：往来单位 / 发票号(单据编号) / 业务类型 / 年度 / 金额 / 全文。
 * 事项（原始凭证）→ 回溯所属记账凭证。
 * 结果为规整表格（2026-08-17 卡片列表 → 表格 + 底置分页），点击行 → 所属凭证档案详情（附件权限门控）。
 */

import React, { useMemo, useState } from 'react';
import { Search, Users, Receipt, DollarSign, X } from 'lucide-react';
import { usePortalData } from '../../../hooks/usePortalData';
import { usePortalStore } from '../../../stores/portalStore';
import { usePagination } from '../../../hooks/usePagination';
import PaginationBar from '../../PaginationBar';
import type { SourceDocument } from '../../../types/sourceDocument';
import type { ArchiveRecord } from '../../../types';

interface PortalMatterSearchProps {
  onOpenDetail: (record: ArchiveRecord) => void;
}

const BUSINESS_TYPE_OPTIONS = ['', '采购', '销售', '费用', '资产', '薪酬', '存货', '资金', '结算', '特殊'];

const PortalMatterSearch: React.FC<PortalMatterSearchProps> = ({ onOpenDetail }) => {
  const { allRecords, sourceDocs } = usePortalData();
  const portalKeyword = usePortalStore((s) => s.portalKeyword);
  const setPortalKeyword = usePortalStore((s) => s.setPortalKeyword);

  const [counterparty, setCounterparty] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [year, setYear] = useState('');
  const [amountFrom, setAmountFrom] = useState('');
  const [amountTo, setAmountTo] = useState('');

  const recordById = useMemo(() => new Map(allRecords.map((r) => [r.id, r])), [allRecords]);

  const yearOptions = useMemo(
    () => ['', ...Array.from(new Set(sourceDocs.map((d) => d.transactionDate.slice(0, 4))))].sort().reverse(),
    [sourceDocs],
  );

  /** 事项（原始凭证）→ 所属记账凭证 */
  const parentRecordOf = (doc: SourceDocument): ArchiveRecord | undefined =>
    recordById.get(doc.parentRecordId);

  const filtered = useMemo(() => {
    let rows = sourceDocs;
    if (counterparty.trim()) rows = rows.filter((d) => d.counterpartyName.includes(counterparty.trim()));
    if (invoiceNo.trim()) rows = rows.filter((d) => d.documentNo.toLowerCase().includes(invoiceNo.trim().toLowerCase()));
    if (businessType) rows = rows.filter((d) => d.businessCategory === businessType);
    if (year) rows = rows.filter((d) => d.transactionDate.startsWith(year));
    if (amountFrom) rows = rows.filter((d) => d.amountLower >= Number(amountFrom));
    if (amountTo) rows = rows.filter((d) => d.amountLower <= Number(amountTo));
    const kw = portalKeyword.trim().toLowerCase();
    if (kw) {
      rows = rows.filter((d) =>
        d.summary.toLowerCase().includes(kw) ||
        d.docTypeName.toLowerCase().includes(kw) ||
        d.documentNo.toLowerCase().includes(kw) ||
        d.counterpartyName.toLowerCase().includes(kw) ||
        Object.values(d.extFields || {}).some((v) => String(v).toLowerCase().includes(kw)),
      );
    }
    return [...rows].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  }, [sourceDocs, counterparty, invoiceNo, businessType, year, amountFrom, amountTo, portalKeyword]);

  const { pageData, currentPage, totalPages, totalItems, pageSize, setPage, setPageSize } =
    usePagination(filtered, { defaultPageSize: 20 });

  const clearAll = () => {
    setCounterparty(''); setInvoiceNo(''); setBusinessType('');
    setYear(''); setAmountFrom(''); setAmountTo(''); setPortalKeyword('');
  };

  return (
    <div className="h-full flex flex-col">
      {/* 检索栏 */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2.5 max-w-7xl mx-auto">
          <div className="relative">
            <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="往来单位（购买方/销售方）"
              value={counterparty} onChange={(e) => setCounterparty(e.target.value)}
              className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl w-44 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <div className="relative">
            <Receipt className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="发票号 / 单据编号"
              value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
              className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl w-40 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <select value={businessType} onChange={(e) => setBusinessType(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white">
            {BUSINESS_TYPE_OPTIONS.map((t) => <option key={t || 'all'} value={t}>{t || '全部业务类型'}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white">
            {yearOptions.map((y) => <option key={y || 'all'} value={y}>{y ? `${y}年` : '全部年度'}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-slate-400" />
            <input type="number" placeholder="最低" value={amountFrom} onChange={(e) => setAmountFrom(e.target.value)}
              className="px-2 py-2 text-xs border border-slate-200 rounded-xl w-24 focus:outline-none focus:ring-1 focus:ring-sky-400" />
            <span className="text-slate-300 text-xs">—</span>
            <input type="number" placeholder="最高" value={amountTo} onChange={(e) => setAmountTo(e.target.value)}
              className="px-2 py-2 text-xs border border-slate-200 rounded-xl w-24 focus:outline-none focus:ring-1 focus:ring-sky-400" />
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="摘要 / 单据类型 / 扩展字段全文（OCR）…"
              value={portalKeyword} onChange={(e) => setPortalKeyword(e.target.value)}
              className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl w-full focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <button type="button" onClick={clearAll}
            className="flex items-center gap-1 px-3 py-2 text-xs text-slate-400 hover:text-red-500 cursor-pointer">
            <X className="w-3 h-3" />清除
          </button>
          <span className="text-xs text-slate-400 shrink-0">共 {filtered.length} 条</span>
        </div>
      </div>

      {/* 结果表格 */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Search className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-sm font-medium">未找到匹配的经济业务事项</p>
              <p className="text-xs mt-1">请调整筛选条件后重新查询</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">单据编号</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-28">单据类型</th>
                    <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">业务类型</th>
                    <th className="px-4 py-3 text-center text-[13px] font-semibold w-24">日期</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-40">往来单位</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold">摘要</th>
                    <th className="px-4 py-3 text-right text-[13px] font-semibold w-28">金额</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-28">所属凭证</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((doc) => {
                    const parent = parentRecordOf(doc);
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => parent && onOpenDetail(parent)}
                        title={parent ? '点击查看所属凭证详情' : '该事项所属凭证尚未归档，暂不可查看详情'}
                        className={`border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 transition-colors ${
                          parent ? 'hover:bg-sky-50/50 cursor-pointer' : 'opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <td className="px-4 py-3 font-mono text-[13px] font-semibold text-slate-800 truncate" title={doc.documentNo}>
                          {doc.documentNo}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">
                            {doc.docTypeName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-[13px] text-slate-600">{doc.businessCategory || '—'}</td>
                        <td className="px-4 py-3 text-center font-mono text-[13px] text-slate-600">{doc.transactionDate}</td>
                        <td className="px-4 py-3 text-[13px] text-slate-600 truncate" title={doc.counterpartyName}>
                          {doc.counterpartyName || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-800 truncate" title={doc.summary}>
                          {doc.summary || '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-800">
                          ¥{doc.amountLower.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 font-mono text-[13px] truncate">
                          {parent
                            ? <span className="text-sky-700" title={`所属凭证 ${parent.voucherNo}`}>{parent.voucherNo}</span>
                            : <span className="text-slate-300">未归档</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 分页栏（底置） */}
      {filtered.length > 0 && (
        <div className="shrink-0 px-6 pb-3">
          <div className="max-w-7xl mx-auto">
            <PaginationBar
              centered
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalMatterSearch;
