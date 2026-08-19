/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * BorrowLedgerPage — 借阅台账（PRD 2.6）
 *
 * 全生命周期借阅记录追溯：谁 → 何时 → 借了什么 → 审批链 → 应还/实还 → 状态。
 * 数据全部由真实借阅单派生，不再是独立 mock。
 */

import React, { useMemo, useState } from 'react';
import {
  Notebook, Search, ChevronDown, ChevronRight, Cloud, HardDrive,
} from 'lucide-react';
import { useBorrowStore } from '../../stores/borrowStore';
import { toCategoryCode } from '../../stores/volumeStore';
import {
  ORDER_STATUS_LABELS, FULFILLMENT_STATUS_LABELS, PERM_LABELS, PHYSICAL_MODE_LABELS,
  type BorrowOrder,
} from '../../types/borrow';
import PaginationBar from '../../components/PaginationBar';
import { usePagination } from '../../hooks/usePagination';

const STATUS_COLORS: Record<string, string> = {
  approving: 'bg-sky-100 text-sky-700',
  rejected: 'bg-red-100 text-red-700',
  fulfilling: 'bg-sky-100 text-sky-700',
  active: 'bg-emerald-100 text-emerald-700',
  returning: 'bg-cyan-100 text-cyan-700',
  completed: 'bg-slate-200 text-slate-600',
  terminated: 'bg-slate-300 text-slate-600',
};

const FULFILLMENT_COLORS: Record<string, string> = {
  pending: 'bg-sky-100 text-sky-700',
  granted: 'bg-emerald-100 text-emerald-700',
  lent: 'bg-amber-100 text-amber-700',
  queued: 'bg-purple-100 text-purple-700',
  returned: 'bg-slate-200 text-slate-600',
  auto_revoked: 'bg-slate-200 text-slate-500',
  overdue: 'bg-red-100 text-red-700',
  terminated: 'bg-slate-300 text-slate-500',
};

const FILTER_OPTIONS = ['全部状态', 'approving', 'active', 'returning', 'completed', 'rejected', 'terminated'] as const;

const BorrowLedgerPage: React.FC = () => {
  const orders = useBorrowStore((s) => s.orders);
  const [statusFilter, setStatusFilter] = useState<string>('全部状态');
  const [typeFilter, setTypeFilter] = useState<string>('全部类型');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let rows = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (statusFilter !== '全部状态') rows = rows.filter((o) => o.status === statusFilter);
    if (typeFilter !== '全部类型') rows = rows.filter((o) => o.items.some((i) => toCategoryCode(i.archiveTypeCode, i.archiveType) === typeFilter));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((o) =>
        o.orderNo.toLowerCase().includes(q) ||
        o.applicantName.includes(q) ||
        o.applicantDept.includes(q) ||
        o.items.some((i) => i.title.toLowerCase().includes(q) || i.voucherNo.includes(q)),
      );
    }
    return rows;
  }, [orders, statusFilter, typeFilter, query]);

  const {
    pageData, currentPage, totalPages, totalItems, pageSize, setPage, setPageSize,
  } = usePagination(filtered, { defaultPageSize: 15 });

  const approverChain = (o: BorrowOrder) =>
    o.approvalRoute.map((s) => s.actedBy || s.assigneeName).filter(Boolean).join(' → ');

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* 页头 */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <Notebook className="w-5 h-5 text-slate-600" />
          <h1 className="text-base font-bold text-slate-800">借阅台账</h1>
          <span className="text-xs text-slate-400">全生命周期借阅记录追溯 · 谁/何时/借了什么/应还/实还</span>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="px-6 py-3 bg-white border-b border-slate-100 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white">
            {FILTER_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === '全部状态' ? s : ORDER_STATUS_LABELS[s as BorrowOrder['status']]}</option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white">
            <option value="全部类型">全部档案类型</option>
            <option value="KP">会计凭证</option>
            <option value="KB">会计账簿</option>
            <option value="FB">财务报表</option>
            <option value="QT">其他会计资料</option>
          </select>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="单号 / 借阅人 / 部门 / 题名..."
              value={query} onChange={(e) => setQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <span className="text-xs text-slate-400">共 {totalItems} 条</span>
        </div>
      </div>

      {/* 台账表格 */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
              <th className="px-4 py-3 w-8"></th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">借阅单号</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">借阅人</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">事由</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">档案数</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">审批链</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">借阅周期</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">状态</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((o) => {
              const expanded = expandedId === o.id;
              return (
                <React.Fragment key={o.id}>
                  <tr
                    onClick={() => setExpandedId(expanded ? null : o.id)}
                    className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-slate-400">
                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px] font-bold text-slate-800">{o.orderNo}</td>
                    <td className="px-4 py-3 text-sm text-slate-800">{o.applicantName}<span className="text-slate-400 ml-1">{o.applicantDept}</span></td>
                    <td className="px-4 py-3 text-[13px] text-slate-600">{o.reasonType}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-600">{o.items.length} 件</td>
                    <td className="px-4 py-3 text-[13px] text-slate-600 max-w-[180px] truncate" title={approverChain(o)}>{approverChain(o) || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[13px] text-slate-600 whitespace-nowrap">{o.startDate} ~ {o.endDate}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status]}`}>
                        {ORDER_STATUS_LABELS[o.status]}
                      </span>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-slate-50/70 border-b border-slate-200/60">
                      <td></td>
                      <td colSpan={7} className="px-4 py-3">
                        <div className="space-y-1.5">
                          {o.fulfillments.length === 0 && (
                            <div className="text-[11px] text-slate-400">审批中，待终审通过后生成履约子单</div>
                          )}
                          {o.fulfillments.map((f) => (
                            <div key={f.id} className="flex items-center gap-3 text-[11px] bg-white border border-slate-100 rounded-lg px-3 py-2">
                              {f.type === 'electronic'
                                ? <Cloud className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                                : <HardDrive className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                              <span className="text-slate-700 font-medium truncate flex-1">{f.volumeTitle}</span>
                              <span className="text-slate-400 shrink-0">
                                {f.type === 'electronic' ? '电子授权' : PHYSICAL_MODE_LABELS[f.physicalMode || 'original']}
                              </span>
                              {f.lentAt && <span className="text-slate-400 shrink-0">借出 {f.lentAt.slice(0, 10)}</span>}
                              {f.returnedAt && <span className="text-slate-400 shrink-0">归还 {f.returnedAt.slice(0, 10)}</span>}
                              {f.operatorBy && <span className="text-slate-400 shrink-0">核销 {f.operatorBy}</span>}
                              <span className={`px-1.5 py-0.5 rounded-full font-medium shrink-0 ${FULFILLMENT_COLORS[f.status]}`}>
                                {FULFILLMENT_STATUS_LABELS[f.status]}
                              </span>
                            </div>
                          ))}
                          <div className="text-[10px] text-slate-400 pt-1">
                            申请权限：{o.items.map((i) => `${i.voucherNo}(${i.electronicPerms.map((p) => PERM_LABELS[p]).join('/') || '无电子'}${i.physicalMode !== 'none' ? '+' + PHYSICAL_MODE_LABELS[i.physicalMode] : ''})`).join('、')}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {pageData.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-16 text-center text-slate-400">
                  <Notebook className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">暂无符合条件的借阅记录</p>
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
    </div>
  );
};

export default BorrowLedgerPage;

