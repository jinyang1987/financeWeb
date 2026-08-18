/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PortalGeneralSearch — 门户「综合检索」模式
 *
 * 2026-08-18 V10 页态化：全量拉取+JS 内存过滤退役，改走 /records/search 服务端
 * 真分页全文检索（pg_trgm，含 ocrText 正文）；下拉选项改走 /records/facets。
 * 列表观感延续 2026-08-18 规整化实验（参照 参照.png：表头灰带+列竖分隔、
 * 13/14px 字阶、~48px 行高、工具栏 h-9 等高）。
 */

import React, { useEffect, useState } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { usePortalStore } from '../../../stores/portalStore';
import { useArchiveStore } from '../../../stores/archiveStore';
import { useServerRecordSearch } from '../../../hooks/useServerRecordSearch';
import { fetchRecordFacets, type RecordFacets } from '../../../services/recordService';
import ArchiveStatusTags from '../../borrow/ArchiveStatusTags';
import PaginationBar from '../../PaginationBar';
import type { ArchiveRecord } from '../../../types';

interface PortalGeneralSearchProps {
  onOpenDetail: (record: ArchiveRecord) => void;
}

const fmtPeriod = (r: ArchiveRecord) => (r.month ? `${r.year}-${r.month.padStart(2, '0')}` : r.year || '—');

const PortalGeneralSearch: React.FC<PortalGeneralSearchProps> = ({ onOpenDetail }) => {
  const portalKeyword = usePortalStore((s) => s.portalKeyword);
  const setPortalKeyword = usePortalStore((s) => s.setPortalKeyword);
  const portalType = usePortalStore((s) => s.portalType);
  const setPortalType = usePortalStore((s) => s.setPortalType);
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);

  const [year, setYear] = useState('');
  const [subject, setSubject] = useState('');
  const [dept, setDept] = useState('');
  const [amountFrom, setAmountFrom] = useState('');
  const [amountTo, setAmountTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [facets, setFacets] = useState<RecordFacets>({ years: [], types: [], subjects: [], departments: [], preparers: [] });

  // 分面下拉（服务端，带权限下推）
  useEffect(() => {
    if (!currentFanzongCode) return;
    let cancel = false;
    fetchRecordFacets({ fondsCode: currentFanzongCode })
      .then((f) => { if (!cancel) setFacets(f); })
      .catch(() => { /* 离线/未登录保持空选项 */ });
    return () => { cancel = true; };
  }, [currentFanzongCode]);

  // 服务端真分页检索（页态：只持当前页）
  const { items, totalItems, currentPage, totalPages, pageSize, setPage, setPageSize, loading } =
    useServerRecordSearch({
      q: portalKeyword.trim() || undefined,
      category: portalType || undefined,
      year: year || undefined,
      subject: subject || undefined,
      dept: dept || undefined,
      amountFrom: amountFrom || undefined,
      amountTo: amountTo || undefined,
    });

  const activeFilterCount = [portalType, year, subject, dept, amountFrom, amountTo].filter(Boolean).length;

  return (
    <div className="h-full flex flex-col">
      {/* 搜索栏（工具栏控件统一 h-9 等高） */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0">
        <div className="flex items-center gap-3 max-w-7xl mx-auto flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={portalKeyword}
              onChange={(e) => setPortalKeyword(e.target.value)}
              placeholder="凭证号 / 摘要 / 往来单位 / 单据号 / 档号 / 科目 / 制单人 / 正文…"
              className="w-full h-9 pl-9 pr-3 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
          </div>
          <select
            value={portalType}
            onChange={(e) => setPortalType(e.target.value)}
            className="h-9 px-3 text-[13px] border border-slate-200 rounded-lg bg-white cursor-pointer hover:border-slate-300"
          >
            <option value="">全部类别</option>
            <option value="KP">会计凭证</option>
            <option value="KB">会计账簿</option>
            <option value="FB">财务报表</option>
            <option value="QT">其他资料</option>
          </select>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-9 px-3 text-[13px] border border-slate-200 rounded-lg bg-white cursor-pointer hover:border-slate-300"
          >
            <option value="">全部年度</option>
            {facets.years.map((y) => <option key={y} value={y}>{y}年</option>)}
          </select>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 h-9 px-3 text-[13px] rounded-lg border transition-colors cursor-pointer ${
              showFilters ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            高级筛选
            {activeFilterCount > 0 && (
              <span className="bg-sky-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>
          <span className="text-[13px] text-slate-400 shrink-0">共 {totalItems} 条</span>
        </div>

        {/* 高级筛选（可折叠） */}
        {showFilters && (
          <div className="max-w-7xl mx-auto mt-2.5 flex items-center gap-2 text-[13px] text-slate-500 flex-wrap">
            <span className="text-slate-400">科目：</span>
            <select value={subject} onChange={(e) => setSubject(e.target.value)}
              className="h-8 px-2 border border-slate-200 rounded-lg text-[13px] bg-white">
              <option value="">全部科目</option>
              {facets.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-slate-400">部门：</span>
            <select value={dept} onChange={(e) => setDept(e.target.value)}
              className="h-8 px-2 border border-slate-200 rounded-lg text-[13px] bg-white">
              <option value="">全部部门</option>
              {facets.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="text-slate-400">金额：</span>
            <input
              type="number" placeholder="最低"
              value={amountFrom} onChange={(e) => setAmountFrom(e.target.value)}
              className="h-8 px-2 border border-slate-200 rounded-lg w-24 text-[13px]"
            />
            <span>—</span>
            <input
              type="number" placeholder="最高"
              value={amountTo} onChange={(e) => setAmountTo(e.target.value)}
              className="h-8 px-2 border border-slate-200 rounded-lg w-24 text-[13px]"
            />
            <button
              type="button"
              onClick={() => { setYear(''); setSubject(''); setDept(''); setAmountFrom(''); setAmountTo(''); setPortalType(''); }}
              className="text-slate-400 hover:text-red-500 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />清除
            </button>
          </div>
        )}
      </div>

      {/* 结果表格（规整化实验样式） */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          {totalItems === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Search className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-sm font-medium">未找到匹配的档案</p>
              <p className="text-xs mt-1">请调整关键词或筛选条件</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-44">档号</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-24">凭证号</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold">摘要 / 题名</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-20">类别</th>
                    <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">期间</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-28">会计科目</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-20">部门</th>
                    <th className="px-4 py-3 text-right text-[13px] font-semibold w-28">金额</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-40">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => onOpenDetail(r)}
                      className="border-b border-slate-200/60 last:border-0 hover:bg-sky-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-[13px] text-slate-600 truncate" title={r.archiveCode}>
                        {r.archiveCode || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-slate-700 truncate" title={r.voucherNo}>
                        {r.voucherNo || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800 truncate" title={r.remarks || r.summary || ''}>
                        {r.remarks || r.summary || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap">
                          {r.archiveType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[13px] text-slate-600">{fmtPeriod(r)}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600 truncate" title={r.accountSubject || ''}>
                        {r.accountSubject || '—'}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-600 truncate" title={r.department || ''}>
                        {r.department || '—'}
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

export default PortalGeneralSearch;
