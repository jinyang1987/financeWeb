/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ReviewPanel — 审核面板（2026-08-16，自原「审核工作台」页面抽取）
 *
 * 核对工作台内嵌的审核职能，两种模式：
 *   mode='pending'   待审核：收集池中 recordStatus=待审核 的记录，可审核通过/驳回
 *   mode='processed' 已处理：审核通过/驳回过的记录与审核历史
 *
 * 审核权限：仅档案管理员/主管/admin（后端 403 兜底）。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, CheckCircle2, XCircle, Search, RefreshCw, Loader2,
  ChevronDown, ChevronRight, FileText, Clock, Eye,
} from 'lucide-react';
import { reviewService, type ReviewPendingItem } from '../../services/reviewService';
import { useArchiveStore } from '../../stores/archiveStore';
import { useAppStore } from '../../stores/appStore';
import { useAuthStore } from '../../stores/authStore';
import RecordDetailPanel from '../RecordDetailPanel';
import type { ArchiveRecord } from '../../types';

const ACTION_LABELS: Record<string, string> = {
  enter: '进审核库',
  approve: '审核通过',
  reject: '审核驳回',
};

const ReviewPanel: React.FC<{ mode: 'pending' | 'processed' }> = ({ mode }) => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const currentUser = useAuthStore((s) => s.currentUser);
  const fondsCode = useArchiveStore((s) => s.currentFanzongCode);

  const [items, setItems] = useState<ReviewPendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [commentInput, setCommentInput] = useState<Record<string, string>>({});
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [detailRecord, setDetailRecord] = useState<ArchiveRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const canReview = currentUser?.roles?.some((r) =>
    ['admin', 'archive_director', 'archivist'].includes(r)) ?? false;

  const refresh = useCallback(async () => {
    if (!fondsCode) return;
    setLoading(true);
    try {
      const list = mode === 'pending'
        ? await reviewService.pending({ fondsCode })
        : await reviewService.processed(fondsCode);
      setItems(list);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : '加载失败');
      if ((e as { status?: number }).status === 403) setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fondsCode, mode]);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((r) =>
      r.voucherNo?.toLowerCase().includes(q) ||
      r.archiveCode?.toLowerCase().includes(q) ||
      r.department?.toLowerCase().includes(q) ||
      (r.summary || '')?.toLowerCase().includes(q) ||
      String(r.amount || '').includes(q)
    );
  }, [items, searchQuery]);

  const doAction = async (item: ReviewPendingItem, action: 'approve' | 'reject') => {
    if (!canReview) { triggerToast('无审核权限', 'warning'); return; }
    const comment = commentInput[item.nodeId] || '';
    if (action === 'reject' && !comment.trim()) {
      triggerToast('驳回请填写审核意见', 'warning');
      return;
    }
    setActioningId(item.nodeId);
    try {
      if (action === 'approve') await reviewService.approve(item.nodeId, comment);
      else await reviewService.reject(item.nodeId, comment);
      triggerToast(action === 'approve'
        ? `${item.voucherNo || item.name} 审核通过，可前往组卷工作台组卷`
        : `${item.voucherNo || item.name} 已驳回`, 'success');
      await refresh();
      // 审核动作会改件状态（待审核→仅件数据/入库），刷新件域镜像保持各工作台同步（2026-08-16 贯通修复）
      void useArchiveStore.getState().loadRecords();
      void useArchiveStore.getState().loadAllRecords();
    } catch (e) {
      triggerToast('操作失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setActioningId(null);
    }
  };

  const statusBadge = (s: string) => {
    if (s === '待审核') return <span className="px-1.5 py-0.5 text-[11px] font-medium rounded-full bg-amber-100 text-amber-700">待审核</span>;
    if (s === '已组卷') return <span className="px-1.5 py-0.5 text-[11px] font-medium rounded-full bg-emerald-100 text-emerald-700">已组卷</span>;
    return <span className="px-1.5 py-0.5 text-[11px] font-medium rounded-full bg-slate-100 text-slate-600">仅件数据</span>;
  };

  const openDetail = (item: ReviewPendingItem) => {
    const rec: ArchiveRecord = {
      id: item.nodeId,
      archiveCode: item.archiveCode,
      voucherNo: item.voucherNo || item.name,
      archiveType: item.archiveType,
      department: item.department || '',
      amount: item.amount ?? 0,
      year: item.year != null ? String(item.year) : '',
      month: item.month != null ? String(item.month).padStart(2, '0') : '',
      retention: '',
      status: item.recordStatus as ArchiveRecord['status'],
      remarks: '',
      checks: { real: false, complete: false, usable: false, safe: false },
      checkDetails: [],
      components: [],
      auditLogs: [],
      numbered: false,
      source: (item.source as ArchiveRecord['source']) || 'digital-native',
      carrierType: (item.carrierType as ArchiveRecord['carrierType']) || 'electronic',
      sourceSystem: item.sourceSystem,
      externalId: item.externalId,
      period: item.period,
    };
    setDetailRecord(rec);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      {loadErr && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-sm px-6 py-2.5 shrink-0">{loadErr}</div>
      )}

      {/* 工具栏 */}
      <div className="px-6 py-2.5 bg-white border-b border-slate-100 shrink-0 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" placeholder="搜索凭证号、档号、摘要、金额..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>
        <span className="text-xs text-slate-500">
          {mode === 'pending' ? '待审核' : '已处理'} <strong className={mode === 'pending' ? 'text-amber-600' : 'text-slate-600'}>{filtered.length}</strong> 条
        </span>
        {!canReview && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">当前账号无审核权限</span>
        )}
        <div className="flex-1" />
        <button
          type="button" onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto min-h-0 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />加载审核数据…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 border border-dashed border-slate-300 rounded-xl bg-white">
            <ShieldCheck className="w-8 h-8 mb-2 text-slate-300" />
            <p className="text-sm">{mode === 'pending' ? '审核库为空' : '暂无已处理记录'}</p>
            <p className="text-xs mt-1">
              {mode === 'pending'
                ? '抓取/推送时选择「送核对工作台·待审核」去向，或在批次监控中「送审核」，数据进入本队列'
                : '审核通过/驳回的记录会出现在这里'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const expanded = expandedId === item.nodeId;
              const lastReview = item.lastReview;
              return (
                <div key={item.nodeId} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-slate-800">
                          {item.voucherNo || item.name}
                        </span>
                        {statusBadge(item.recordStatus)}
                        {mode === 'processed' && lastReview && (
                          <span className={`px-1.5 py-0.5 text-[11px] font-medium rounded-full ${
                            lastReview.action === 'approve' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {lastReview.action === 'approve' ? '已通过' : '已驳回'}
                          </span>
                        )}
                        {item.sourceSystem && (
                          <span className="text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">来源 {item.sourceSystem}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="font-mono">{item.archiveCode}</span>
                        <span>·</span>
                        <span>{item.archiveType}</span>
                        <span>·</span>
                        <span>{item.year}{item.month ? `-${item.month}` : ''}</span>
                        {item.amount != null && (
                          <>
                            <span>·</span>
                            <span className="font-mono">¥{item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
                          </>
                        )}
                        {item.department && (<><span>·</span><span>{item.department}</span></>)}
                      </div>
                      {lastReview && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          <Clock className="w-3 h-3 inline mr-0.5" />
                          {ACTION_LABELS[lastReview.action] || lastReview.action} ·
                          {lastReview.reviewer} · {lastReview.created_at?.replace('T', ' ').slice(0, 19)}
                          {lastReview.comment && <span className="text-slate-500"> · “{lastReview.comment}”</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : item.nodeId)}
                        className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-md"
                        title="审核历史"
                      >
                        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDetail(item)}
                        className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-md"
                        title="查看详情"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 审核操作行（仅待审核模式 + 有权限） */}
                  {mode === 'pending' && canReview && (
                    <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                      <input
                        type="text" value={commentInput[item.nodeId] || ''}
                        onChange={(e) => setCommentInput((c) => ({ ...c, [item.nodeId]: e.target.value }))}
                        placeholder="审核意见（驳回必填）"
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
                      />
                      <button
                        type="button"
                        disabled={actioningId === item.nodeId}
                        onClick={() => doAction(item, 'approve')}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {actioningId === item.nodeId ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        审核通过
                      </button>
                      <button
                        type="button"
                        disabled={actioningId === item.nodeId}
                        onClick={() => doAction(item, 'reject')}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
                      >
                        <XCircle className="w-3 h-3" />
                        驳回
                      </button>
                    </div>
                  )}

                  {/* 审核历史 */}
                  {expanded && (
                    <div className="px-4 py-3 border-t border-slate-100 bg-white">
                      <div className="text-xs font-semibold text-slate-500 mb-2">审核历史</div>
                      {item.reviewHistory && item.reviewHistory.length > 0 ? (
                        <div className="space-y-1.5">
                          {item.reviewHistory.map((h) => (
                            <div key={h.id} className="flex items-center gap-2 text-xs">
                              <span className={`px-1.5 py-0.5 rounded ${h.action === 'approve' ? 'bg-emerald-50 text-emerald-700' : h.action === 'reject' ? 'bg-red-50 text-red-700' : 'bg-sky-50 text-sky-700'}`}>
                                {ACTION_LABELS[h.action] || h.action}
                              </span>
                              <span className="text-slate-500">{h.reviewer}</span>
                              <span className="text-slate-400 font-mono text-[11px]">{h.created_at?.replace('T', ' ').slice(0, 19)}</span>
                              {h.comment && <span className="text-slate-500">“{h.comment}”</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">无审核记录</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 详情面板 */}
      {detailRecord && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20" onClick={() => setDetailRecord(null)} />
          <div className="relative w-[520px] max-w-[95vw] h-full shadow-2xl z-50">
            <RecordDetailPanel
              context="voucher"
              record={detailRecord}
              onClose={() => setDetailRecord(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewPanel;
