/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PortalVoucherSearch — 门户「凭证检索」模式
 *
 * 对齐后台「档案查询 → 凭证检索」的多维组合查询能力：
 *   凭证号 / 会计科目 / 年度 / 公司主体(全宗) / 制单人 / 金额范围 / 摘要全文
 * 2026-08-18 V10 页态化：改走 /records/search 服务端真分页（已组卷记账凭证口径
 * 由 recordStatus=已组卷 + archiveType=记账凭证 服务端承载），下拉走 /records/facets。
 */

import React, { useEffect, useState } from 'react';
import { Search, Hash, Building2, User, DollarSign, X } from 'lucide-react';
import { useArchiveStore } from '../../../stores/archiveStore';
import { usePortalStore } from '../../../stores/portalStore';
import { useServerRecordSearch } from '../../../hooks/useServerRecordSearch';
import { fetchRecordFacets, type RecordFacets } from '../../../services/recordService';
import ArchiveStatusTags from '../../borrow/ArchiveStatusTags';
import PaginationBar from '../../PaginationBar';
import type { ArchiveRecord } from '../../../types';

interface PortalVoucherSearchProps {
  onOpenDetail: (record: ArchiveRecord) => void;
}

const PortalVoucherSearch: React.FC<PortalVoucherSearchProps> = ({ onOpenDetail }) => {
  const fanzongs = useArchiveStore((s) => s.fanzongs);
  const portalKeyword = usePortalStore((s) => s.portalKeyword);
  const setPortalKeyword = usePortalStore((s) => s.setPortalKeyword);

  const [voucherNo, setVoucherNo] = useState('');
  const [account, setAccount] = useState('');
  const [year, setYear] = useState('');
  const [fonds, setFonds] = useState('');
  const [preparer, setPreparer] = useState('');
  const [amountFrom, setAmountFrom] = useState('');
  const [amountTo, setAmountTo] = useState('');
  const [facets, setFacets] = useState<RecordFacets>({ years: [], types: [], subjects: [], departments: [], preparers: [] });

  // 科目/年度选项：记账凭证口径分面
  useEffect(() => {
    let cancel = false;
    const code = useArchiveStore.getState().currentFanzongCode;
    if (!code) return;
    fetchRecordFacets({ fondsCode: code, archiveType: '记账凭证' })
      .then((f) => { if (!cancel) setFacets(f); })
      .catch(() => { /* 离线保持空选项 */ });
    return () => { cancel = true; };
  }, []);

  // 服务端检索：已组卷的记账凭证
  const { items, totalItems, currentPage, totalPages, pageSize, setPage, setPageSize } =
    useServerRecordSearch({
      archiveType: '记账凭证',
      recordStatus: '已组卷',
      q: portalKeyword.trim() || undefined,
      voucherNo: voucherNo.trim() || undefined,
      subject: account || undefined,
      year: year || undefined,
      preparer: preparer.trim() || undefined,
      amountFrom: amountFrom || undefined,
      amountTo: amountTo || undefined,
      fondsCode: fonds || undefined,
    });

  const clearAll = () => {
    setVoucherNo(''); setAccount(''); setYear(''); setFonds('');
    setPreparer(''); setAmountFrom(''); setAmountTo(''); setPortalKeyword('');
  };

  return (
    <div className="h-full flex flex-col">
      {/* 检索栏 */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2.5 max-w-7xl mx-auto">
          <div className="relative">
            <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="凭证号"
              value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)}
              className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl w-32 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <select value={account} onChange={(e) => setAccount(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white">
            <option value="">全部科目</option>
            {facets.subjects.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white">
            <option value="">全部年度</option>
            {facets.years.map((y) => <option key={y} value={y}>{y}年</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select value={fonds} onChange={(e) => setFonds(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white max-w-[200px]">
              <option value="">全部主体</option>
              {fanzongs.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
            </select>
          </div>
          <div className="relative">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="制单人"
              value={preparer} onChange={(e) => setPreparer(e.target.value)}
              className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl w-28 focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
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
              type="text" placeholder="摘要全文检索（OCR）…"
              value={portalKeyword} onChange={(e) => setPortalKeyword(e.target.value)}
              className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl w-full focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <button type="button" onClick={clearAll}
            className="flex items-center gap-1 px-3 py-2 text-xs text-slate-400 hover:text-red-500 cursor-pointer">
            <X className="w-3 h-3" />清除
          </button>
          <span className="text-xs text-slate-400 shrink-0">共 {totalItems} 条</span>
        </div>
      </div>

      {/* 结果表格 */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          {totalItems === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Search className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-sm font-medium">未找到匹配的凭证</p>
              <p className="text-xs mt-1">请调整筛选条件后重新查询</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-28">凭证号</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold">摘要</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">会计科目</th>
                    <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">期间</th>
                    <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">制单人</th>
                    <th className="px-4 py-3 text-right text-[13px] font-semibold w-28">金额</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-40">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => onOpenDetail(r)}
                      className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-[13px] font-semibold text-slate-800 truncate" title={r.voucherNo}>
                        {r.voucherNo}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800 truncate" title={r.remarks || ''}>
                        {r.remarks || '—'}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-600 truncate" title={r.accountSubject || ''}>
                        {r.accountSubject || '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[13px] text-slate-600">
                        {r.year}{r.month ? `-${r.month.padStart(2, '0')}` : ''}
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] text-slate-600 truncate" title={r.preparer || ''}>
                        {r.preparer || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-800">
                        ¥{r.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <ArchiveStatusTags record={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 分页栏（底置，服务端分页） */}
      {totalItems > 0 && (
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

export default PortalVoucherSearch;
