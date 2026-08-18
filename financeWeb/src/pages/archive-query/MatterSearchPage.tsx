/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * MatterSearchPage — 事项检索（2026-07-18 重写）
 *
 * 按经济业务定位档案：往来单位 / 发票号（单据编号）/ 业务类型 / 年度 / 金额 / 全文。
 * 数据源：sourceDocumentStore（原始凭证，OCR 全文可检索）→ 回溯所属记账凭证。
 * 找到事项后可一键将所属凭证加入借阅车。
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  ZoomIn, Search, DollarSign, Users, Receipt, Building2,
  BookOpenCheck, CheckCircle2, FileText,
} from 'lucide-react';
import { useSourceDocumentStore } from '../../stores/sourceDocumentStore';
import { useArchiveStore } from '../../stores/archiveStore';
import { useBorrowStore } from '../../stores/borrowStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import ArchiveStatusTags from '../../components/borrow/ArchiveStatusTags';
import BorrowCartBar from '../../components/borrow/BorrowCartBar';
import PaginationBar from '../../components/PaginationBar';
import { usePagination } from '../../hooks/usePagination';
import type { SourceDocument } from '../../types/sourceDocument';
import type { ArchiveRecord } from '../../types';

const BUSINESS_TYPE_OPTIONS = ['全部类型', '采购', '销售', '费用', '资产', '薪酬', '存货', '资金', '结算', '特殊'];

const MatterSearchPage: React.FC = () => {
  const documents = useSourceDocumentStore((s) => s.documents);
  // 全量件（含已组卷卷内件）：原始凭证的所属记账凭证可能已归档，池口径会查不到（2026-08-16 贯通修复）
  const records = useArchiveStore((s) => s.allRecords);
  const loadAllRecords = useArchiveStore((s) => s.loadAllRecords);
  useEffect(() => { void loadAllRecords(); }, [loadAllRecords]);
  const cart = useBorrowStore((s) => s.cart);
  const addToCart = useBorrowStore((s) => s.addToCart);
  const removeFromCart = useBorrowStore((s) => s.removeFromCart);
  const logAction = useBorrowStore((s) => s.logAction);
  const currentUser = useAuthStore((s) => s.currentUser);
  const triggerToast = useAppStore((s) => s.triggerToast);

  // ── 筛选状态 ──
  const [counterparty, setCounterparty] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [businessType, setBusinessType] = useState('全部类型');
  const [year, setYear] = useState('全部年度');
  const [amountFrom, setAmountFrom] = useState('');
  const [amountTo, setAmountTo] = useState('');
  const [keyword, setKeyword] = useState('');

  const recordById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);
  const cartIds = useMemo(() => new Set(cart.map((c) => c.recordId)), [cart]);

  const yearOptions = useMemo(
    () => ['全部年度', ...Array.from(new Set(documents.map((d) => d.transactionDate.slice(0, 4))))].sort().reverse(),
    [documents],
  );

  /** 事项（原始凭证）→ 所属记账凭证（可借阅单元） */
  const parentRecordOf = (doc: SourceDocument): ArchiveRecord | undefined =>
    recordById.get(doc.parentRecordId);

  const filtered = useMemo(() => {
    let rows = documents;
    if (counterparty.trim()) rows = rows.filter((d) => d.counterpartyName.includes(counterparty.trim()));
    if (invoiceNo.trim()) rows = rows.filter((d) => d.documentNo.toLowerCase().includes(invoiceNo.trim().toLowerCase()));
    if (businessType !== '全部类型') rows = rows.filter((d) => d.businessCategory === businessType);
    if (year !== '全部年度') rows = rows.filter((d) => d.transactionDate.startsWith(year));
    if (amountFrom) rows = rows.filter((d) => d.amountLower >= Number(amountFrom));
    if (amountTo) rows = rows.filter((d) => d.amountLower <= Number(amountTo));
    if (keyword.trim()) {
      const kw = keyword.toLowerCase().trim();
      rows = rows.filter((d) =>
        d.summary.toLowerCase().includes(kw) ||
        d.docTypeName.toLowerCase().includes(kw) ||
        Object.values(d.extFields || {}).some((v) => String(v).toLowerCase().includes(kw)),
      );
    }
    return [...rows].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  }, [documents, counterparty, invoiceNo, businessType, year, amountFrom, amountTo, keyword]);

  const {
    pageData, currentPage, totalPages, totalItems, pageSize, setPage, setPageSize,
  } = usePagination(filtered, { defaultPageSize: 20 });

  const handleSearch = () => {
    if (!currentUser) return;
    const parts = [
      counterparty && `往来单位:${counterparty}`,
      invoiceNo && `单据号:${invoiceNo}`,
      businessType !== '全部类型' && `业务:${businessType}`,
      year !== '全部年度' && `年度:${year}`,
      (amountFrom || amountTo) && `金额:${amountFrom || '0'}~${amountTo || '∞'}`,
      keyword && `全文:${keyword}`,
    ].filter(Boolean).join(' ');
    logAction('档案检索', `事项检索 · ${totalItems} 条结果`, currentUser, undefined, parts || '无条件查询');
  };

  const handleToggleCart = (doc: SourceDocument) => {
    const parent = parentRecordOf(doc);
    if (!parent) {
      triggerToast('该事项所属凭证尚未归档，暂不可借阅', 'warning');
      return;
    }
    if (cartIds.has(parent.id)) {
      removeFromCart(parent.id);
      return;
    }
    addToCart(parent.id);
    if (currentUser) logAction('加入借阅车', parent.remarks || parent.voucherNo, currentUser, undefined, `经事项 ${doc.documentNo} 关联`);
    triggerToast(`已加入借阅车：${parent.voucherNo}（${doc.docTypeName} 所属凭证）`, 'success');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* 页头 */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <ZoomIn className="w-5 h-5 text-slate-600" />
          <h1 className="text-base font-bold text-slate-800">事项检索</h1>
          <span className="text-xs text-slate-400">按经济业务/往来单位/发票号全文定位 · 可穿透至所属凭证发起借阅</span>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="px-6 py-3 bg-white border-b border-slate-100 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="往来单位（购买方/销售方）"
              value={counterparty} onChange={(e) => setCounterparty(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <div className="relative">
            <Receipt className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="发票号 / 单据编号"
              value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-40 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <select value={businessType} onChange={(e) => setBusinessType(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white">
            {BUSINESS_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white">
            {yearOptions.map((y) => <option key={y} value={y}>{y === '全部年度' ? y : `${y}年`}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="number" placeholder="最低金额"
              value={amountFrom} onChange={(e) => setAmountFrom(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg w-24 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
            <span className="text-slate-300 text-xs">—</span>
            <input
              type="number" placeholder="最高金额"
              value={amountTo} onChange={(e) => setAmountTo(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg w-24 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="摘要/单据类型/扩展字段全文（OCR）..."
              value={keyword} onChange={(e) => setKeyword(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-700 text-white text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />查询
          </button>
          <span className="text-xs text-slate-400">共 {totalItems} 条</span>
        </div>
      </div>

      {/* 结果表格 */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-left">
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
              <th className="px-4 py-3 text-[13px] font-semibold">单据编号</th>
              <th className="px-4 py-3 text-[13px] font-semibold">类型</th>
              <th className="px-4 py-3 text-[13px] font-semibold">业务日期</th>
              <th className="px-4 py-3 text-[13px] font-semibold">往来单位</th>
              <th className="px-4 py-3 text-[13px] font-semibold text-right">金额</th>
              <th className="px-4 py-3 text-[13px] font-semibold">摘要</th>
              <th className="px-4 py-3 text-[13px] font-semibold">所属凭证 / 状态</th>
              <th className="px-4 py-3 text-[13px] font-semibold text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((doc) => {
              const parent = parentRecordOf(doc);
              const inCart = !!parent && cartIds.has(parent.id);
              return (
                <tr key={doc.id} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-[13px] font-bold text-slate-800 whitespace-nowrap">{doc.documentNo}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">{doc.docTypeName}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] text-slate-600 whitespace-nowrap">{doc.transactionDate}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 max-w-[160px] truncate" title={doc.counterpartyName}>
                    <Building2 className="w-3 h-3 inline mr-1 text-slate-400" />{doc.counterpartyName}
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] font-medium text-slate-800 text-right whitespace-nowrap">
                    ¥{doc.amountLower.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-800 max-w-[180px] truncate" title={doc.summary}>{doc.summary}</td>
                  <td className="px-4 py-3">
                    {parent ? (
                      <div className="space-y-1">
                        <span className="flex items-center gap-1 text-[13px] font-mono text-slate-700">
                          <FileText className="w-3 h-3 text-slate-400" />{parent.voucherNo}
                        </span>
                        <ArchiveStatusTags record={parent} />
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400">未归档</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center">
                      {parent && (
                        <button
                          type="button"
                          onClick={() => handleToggleCart(doc)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                            inCart
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm'
                          }`}
                          title={inCart ? '所属凭证已在借阅车中，点击移出' : '将所属凭证加入借阅车'}
                        >
                          {inCart ? <><CheckCircle2 className="w-3.5 h-3.5" />已加入</> : <><BookOpenCheck className="w-3.5 h-3.5" />加入借阅</>}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageData.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-16 text-center text-slate-400">
                  <Search className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">未找到匹配的经济业务事项</p>
                  <p className="text-xs mt-1">请调整筛选条件后重新查询</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="bg-white border-t border-slate-200 shrink-0">
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* 借阅车浮条 */}
      <BorrowCartBar />
    </div>
  );
};

export default MatterSearchPage;

