/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * VoucherSearchPage — 凭证检索（2026-07-18 重写）
 *
 * 全息智能检索（PRD 1.1）：
 *   多维组合查询：凭证号 / 会计科目 / 年度 / 公司主体 / 金额范围 / 制单人 / 摘要全文
 *   档案状态可视化：【电子版可用】【实体在库】【实体借出】
 *   加入借阅车：跨年度、跨类型合并发起一张借阅申请单
 *
 * 数据源：archiveStore.allRecords（scope=all：池 ∪ 卷内件，本页过滤已组卷记账凭证），与保管视图同源。
 * 2026-08-16 贯通修复：原读 records（仅未组卷池）导致已归档凭证永远查不到。
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText, Search, DollarSign, Tag, Hash, User, Building2,
  BookOpenCheck, CheckCircle2,
} from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import { useBorrowStore } from '../../stores/borrowStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import ArchiveStatusTags from '../../components/borrow/ArchiveStatusTags';
import BorrowCartBar from '../../components/borrow/BorrowCartBar';
import PaginationBar from '../../components/PaginationBar';
import { usePagination } from '../../hooks/usePagination';
import type { ArchiveRecord } from '../../types';

const VoucherSearchPage: React.FC = () => {
  const allRecords = useArchiveStore((s) => s.allRecords);
  const loadAllRecords = useArchiveStore((s) => s.loadAllRecords);
  const fanzongs = useArchiveStore((s) => s.fanzongs);
  const cart = useBorrowStore((s) => s.cart);
  const addToCart = useBorrowStore((s) => s.addToCart);
  const removeFromCart = useBorrowStore((s) => s.removeFromCart);
  const logAction = useBorrowStore((s) => s.logAction);
  const currentUser = useAuthStore((s) => s.currentUser);
  const triggerToast = useAppStore((s) => s.triggerToast);

  // 挂载刷新全量件（保证归档/移交后的最新状态可见）
  useEffect(() => { void loadAllRecords(); }, [loadAllRecords]);

  // ── 筛选状态 ──
  const [voucherNo, setVoucherNo] = useState('');
  const [account, setAccount] = useState('全部科目');
  const [year, setYear] = useState('全部年度');
  const [fonds, setFonds] = useState('全部主体');
  const [preparer, setPreparer] = useState('');
  const [amountFrom, setAmountFrom] = useState('');
  const [amountTo, setAmountTo] = useState('');
  const [keyword, setKeyword] = useState('');

  // ── 可检索数据集：已组卷归档的记账凭证 ──
  const archivedVouchers = useMemo(
    () => allRecords.filter((r) => r.archiveType === '记账凭证' && r.status === '已组卷' && r.volumeId),
    [allRecords],
  );

  // ── 下拉选项（从真实数据派生） ──
  const accountOptions = useMemo(
    () => ['全部科目', ...Array.from(new Set(archivedVouchers.map((r) => r.accountSubject).filter(Boolean)))].sort() as string[],
    [archivedVouchers],
  );
  const yearOptions = useMemo(
    () => ['全部年度', ...Array.from(new Set(archivedVouchers.map((r) => r.year)))].sort().reverse(),
    [archivedVouchers],
  );

  const cartIds = useMemo(() => new Set(cart.map((c) => c.recordId)), [cart]);

  const filtered = useMemo(() => {
    let rows = archivedVouchers;
    if (voucherNo.trim()) rows = rows.filter((r) => r.voucherNo.includes(voucherNo.trim()));
    if (account !== '全部科目') rows = rows.filter((r) => r.accountSubject === account);
    if (year !== '全部年度') rows = rows.filter((r) => r.year === year);
    if (fonds !== '全部主体') rows = rows.filter((r) => r.archiveCode.startsWith(fonds));
    if (preparer.trim()) rows = rows.filter((r) => (r.preparer || '').includes(preparer.trim()));
    if (amountFrom) rows = rows.filter((r) => r.amount >= Number(amountFrom));
    if (amountTo) rows = rows.filter((r) => r.amount <= Number(amountTo));
    if (keyword.trim()) {
      const kw = keyword.toLowerCase().trim();
      rows = rows.filter((r) => (r.remarks || '').toLowerCase().includes(kw));
    }
    return rows.sort((a, b) => `${b.year}${b.month}${b.voucherNo}`.localeCompare(`${a.year}${a.month}${a.voucherNo}`));
  }, [archivedVouchers, voucherNo, account, year, fonds, preparer, amountFrom, amountTo, keyword]);

  const {
    pageData, currentPage, totalPages, totalItems, pageSize, setPage, setPageSize,
  } = usePagination(filtered, { defaultPageSize: 20 });

  const handleSearch = () => {
    if (!currentUser) return;
    const parts = [
      voucherNo && `凭证号:${voucherNo}`,
      account !== '全部科目' && `科目:${account}`,
      year !== '全部年度' && `年度:${year}`,
      fonds !== '全部主体' && `主体:${fonds}`,
      preparer && `制单人:${preparer}`,
      (amountFrom || amountTo) && `金额:${amountFrom || '0'}~${amountTo || '∞'}`,
      keyword && `摘要:${keyword}`,
    ].filter(Boolean).join(' ');
    logAction('档案检索', `凭证检索 · ${totalItems} 条结果`, currentUser, undefined, parts || '无条件查询');
  };

  const handleToggleCart = (r: ArchiveRecord) => {
    if (cartIds.has(r.id)) {
      removeFromCart(r.id);
      return;
    }
    addToCart(r.id);
    if (currentUser) logAction('加入借阅车', r.remarks || r.voucherNo, currentUser, undefined, r.archiveCode);
    triggerToast(`已加入借阅车：${r.voucherNo}`, 'success');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* 页头 */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-slate-600" />
          <h1 className="text-base font-bold text-slate-800">凭证检索</h1>
          <span className="text-xs text-slate-400">多维组合查询 · 找到档案后点击「加入借阅」统一结算</span>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="px-6 py-3 bg-white border-b border-slate-100 shrink-0 space-y-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="凭证号"
              value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-32 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <select value={account} onChange={(e) => setAccount(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white">
            {accountOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white">
            {yearOptions.map((y) => <option key={y} value={y}>{y === '全部年度' ? y : `${y}年`}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select value={fonds} onChange={(e) => setFonds(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white max-w-[220px]">
              <option value="全部主体">全部公司主体</option>
              {fanzongs.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
            </select>
          </div>
          <div className="relative">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="制单人"
              value={preparer} onChange={(e) => setPreparer(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-28 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
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
              type="text" placeholder="摘要全文检索（OCR 识别内容）..."
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
              <th className="px-4 py-3 text-[13px] font-semibold">凭证号</th>
              <th className="px-4 py-3 text-[13px] font-semibold">日期</th>
              <th className="px-4 py-3 text-[13px] font-semibold">会计科目</th>
              <th className="px-4 py-3 text-[13px] font-semibold">摘要</th>
              <th className="px-4 py-3 text-[13px] font-semibold text-right">金额</th>
              <th className="px-4 py-3 text-[13px] font-semibold">制单人</th>
              <th className="px-4 py-3 text-[13px] font-semibold">档案状态</th>
              <th className="px-4 py-3 text-[13px] font-semibold text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((row) => {
              const inCart = cartIds.has(row.id);
              return (
                <tr key={row.id} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-[13px] font-bold text-slate-800">{row.voucherNo}</td>
                  <td className="px-4 py-3 font-mono text-[13px] text-slate-600 whitespace-nowrap">{row.year}-{row.month}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap">
                    <Tag className="w-3 h-3 inline mr-1 text-slate-400" />{row.accountSubject || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-800 max-w-[220px] truncate" title={row.remarks}>{row.remarks}</td>
                  <td className="px-4 py-3 font-mono text-[13px] font-medium text-slate-800 text-right whitespace-nowrap">
                    ¥{row.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600">{row.preparer || '—'}</td>
                  <td className="px-4 py-3"><ArchiveStatusTags record={row} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => handleToggleCart(row)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                          inCart
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm'
                        }`}
                        title={inCart ? '已在借阅车中，点击移出' : '加入借阅车，统一结算发起申请'}
                      >
                        {inCart ? <><CheckCircle2 className="w-3.5 h-3.5" />已加入</> : <><BookOpenCheck className="w-3.5 h-3.5" />加入借阅</>}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageData.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-16 text-center text-slate-400">
                  <Search className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">未找到匹配的凭证记录</p>
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

export default VoucherSearchPage;

