/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * OperationLogPage — 操作日志（2026-08-25）
 *
 * 数据源：后端 ams_operation_log（哈希链防篡改，仅追加）。
 * 记录：用户登录/退出（含 IP）、上传建件、删除/恢复/彻底删除、
 * 组卷/移交/借阅/鉴定/配置变更等全部留痕操作。
 *
 * 权限：系统管理员 / 安全审计员可查（后端校验）。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, History } from 'lucide-react';
import { http } from '../../services/http';
import PaginationBar from '../../components/PaginationBar';

interface OpLogRow {
  id: number;
  ts: string;
  actor_id: string;
  actor_name?: string;
  action: string;
  target?: string;
  target_label?: string;
  detail?: string;
  ip?: string;
}

interface OpLogResult {
  items: OpLogRow[];
  total: number;
  skip: number;
  limit: number;
}

/** timestamptz ISO → yyyy-MM-dd HH:mm:ss */
const formatTs = (s?: string) => {
  if (!s) return '—';
  return s.replace('T', ' ').replace(/\.\d+/, '').replace(/([+-]\d{2}(:?\d{2})?)$/, '').slice(0, 19);
};

const OperationLogPage: React.FC = () => {
  const [items, setItems] = useState<OpLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── 筛选条件 ──
  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // ── 分页 ──
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(async (p: number, size: number) => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        skip: String((p - 1) * size),
        limit: String(size),
      });
      if (actorId.trim()) qs.set('actorId', actorId.trim());
      if (action.trim()) qs.set('action', action.trim());
      if (from) qs.set('from', `${from}T00:00:00`);
      if (to) qs.set('to', `${to}T23:59:59.999`);
      const r = await http.get<OpLogResult>(`/audit/logs?${qs.toString()}`);
      setItems(r.items || []);
      setTotal(r.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [actorId, action, from, to]);

  useEffect(() => {
    void load(page, pageSize);
  }, [page, pageSize, load]);

  const handleSearch = () => {
    setPage(1);
    void load(1, pageSize);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex h-full flex-col bg-white">
      {/* ── 顶栏 ── */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-800">操作日志</h2>
          <span className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            共 {total} 条
          </span>
        </div>
        <button
          onClick={() => void load(page, pageSize)}
          className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> 刷新
        </button>
      </div>

      {/* ── 筛选栏 ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2.5">
        <input
          type="text"
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="操作人账号"
          className="w-36 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
        />
        <input
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="操作类型（如：用户登录）"
          className="w-52 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
        />
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
          <span>至</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>
        <button
          onClick={handleSearch}
          className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          <Search className="h-4 w-4" /> 查询
        </button>
      </div>

      {/* ── 日志表格 ── */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="flex h-full items-center justify-center text-sm text-red-500">{error}</div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">加载中…</div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr className="border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-44">时间</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">操作人</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-32">IP 地址</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">操作</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-48">对象</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold">详情</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-slate-400">
                    暂无符合条件的操作日志
                  </td>
                </tr>
              ) : items.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/40 transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-[13px] text-slate-600 whitespace-nowrap">
                    {formatTs(row.ts)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[13px] font-medium text-slate-800">{row.actor_name || row.actor_id}</span>
                    {row.actor_name && row.actor_name !== row.actor_id && (
                      <span className="ml-1 text-[11px] text-slate-400 font-mono">{row.actor_id}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[13px] text-slate-600">{row.ip || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded border border-sky-100 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                      {row.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="block max-w-[200px] truncate font-mono text-[12px] text-slate-500" title={row.target_label || row.target || ''}>
                      {row.target_label || row.target || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="block max-w-[360px] truncate text-[13px] text-slate-600" title={row.detail || ''}>
                      {row.detail || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 分页 ── */}
      {total > 0 && (
        <div className="border-t border-slate-200 px-5 py-2">
          <PaginationBar
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </div>
      )}
    </div>
  );
};

export default OperationLogPage;
