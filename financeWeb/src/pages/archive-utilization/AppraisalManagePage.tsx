/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * AppraisalManagePage — 期满鉴定与销毁（2026-08-16 接真重构，启用 ams_appraisal）
 *
 * 最小闭环：
 *   1. 到期测算：实时扫描已入库案卷，按「年度+保管期限」算保管期满日
 *      （保管期限自会计年度终了后第一年起算；永久不期满）
 *   2. 一键登记鉴定任务（幂等）
 *   3. 鉴定评审：续存（retained）/ 同意销毁（approved-destroy），评审意见留痕
 *   4. 销毁执行：删除 Alfresco 卷节点（含卷内件）+ 盒计数回退 + 操作日志
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Trash2, AlertCircle, CheckCircle2, Clock, FileText, Shield, ChevronDown, ChevronRight, RefreshCw, ScanSearch } from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import {
  fetchDueVolumes, scanAppraisals, fetchAppraisals, reviewAppraisal, executeDestroy,
  type DueVolume, type AppraisalRecord,
} from '../../services/appraisalService';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '待鉴定', cls: 'bg-amber-100 text-amber-700' },
  'approved-destroy': { label: '同意销毁', cls: 'bg-red-100 text-red-700' },
  retained: { label: '续存', cls: 'bg-emerald-100 text-emerald-700' },
  destroyed: { label: '已销毁', cls: 'bg-slate-200 text-slate-500' },
};

const AppraisalManagePage: React.FC = () => {
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);
  const currentUser = useAuthStore((s) => s.currentUser);
  const triggerToast = useAppStore((s) => s.triggerToast);

  const [dueVolumes, setDueVolumes] = useState<DueVolume[]>([]);
  const [appraisals, setAppraisals] = useState<AppraisalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<AppraisalRecord | null>(null);
  const [meetingNote, setMeetingNote] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!currentFanzongCode) return;
    setLoading(true);
    try {
      const [dues, aps] = await Promise.all([
        fetchDueVolumes(currentFanzongCode),
        fetchAppraisals(),
      ]);
      setDueVolumes(dues);
      setAppraisals(aps);
    } catch (e) {
      triggerToast('鉴定数据加载失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setLoading(false);
    }
  }, [currentFanzongCode, triggerToast]);

  useEffect(() => { void reload(); }, [reload]);

  // 未登记鉴定的到期卷
  const unregistered = useMemo(() => dueVolumes.filter((v) => !v.appraisalStatus), [dueVolumes]);
  const pendingList = useMemo(() => appraisals.filter((a) => a.status === 'pending'), [appraisals]);
  const approvedList = useMemo(() => appraisals.filter((a) => a.status === 'approved-destroy'), [appraisals]);
  const closedList = useMemo(() => appraisals.filter((a) => a.status === 'retained' || a.status === 'destroyed'), [appraisals]);

  const handleScan = async () => {
    if (!currentFanzongCode) return;
    setActioning('scan');
    try {
      const r = await scanAppraisals(currentFanzongCode);
      triggerToast(`鉴定扫描完成：到期 ${r.dueVolumes} 卷，新登记 ${r.registered} 卷`, 'success');
      await reload();
    } catch (e) {
      triggerToast('扫描失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setActioning(null);
    }
  };

  const handleReview = async (decision: 'destroy' | 'retain') => {
    if (!reviewTarget) return;
    if (decision === 'retain' && !meetingNote.trim()) {
      triggerToast('续存请填写评审意见（延期理由）', 'warning');
      return;
    }
    setActioning(reviewTarget.id);
    try {
      await reviewAppraisal(reviewTarget.id, decision, meetingNote.trim());
      triggerToast(decision === 'destroy' ? '评审完成：同意销毁（待执行）' : '评审完成：续存', 'success');
      setReviewTarget(null);
      setMeetingNote('');
      await reload();
    } catch (e) {
      triggerToast('评审失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setActioning(null);
    }
  };

  const handleDestroy = async (a: AppraisalRecord) => {
    if (!window.confirm(`销毁将永久删除案卷节点及其全部卷内件（不可恢复）。\n确认执行销毁？`)) return;
    setActioning(a.id);
    try {
      await executeDestroy(a.id);
      triggerToast('销毁执行完成，案卷及卷内件已删除并留痕', 'success');
      await reload();
      // 销毁后卷/件镜像失效，后台静默刷新
      void useArchiveStore.getState().loadAllRecords();
    } catch (e) {
      triggerToast('销毁失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setActioning(null);
    }
  };

  const volTitle = (nodeId: string) => dueVolumes.find((v) => v.volumeNode === nodeId)?.title || nodeId.slice(0, 8) + '…';

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <Shield className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">期满鉴定与销毁</h1>
        <div className="flex-1" />
        <button type="button" onClick={() => void reload()} title="刷新"
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button type="button" onClick={() => void handleScan()} disabled={actioning === 'scan'}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition-colors">
          <ScanSearch className="w-4 h-4" />
          {actioning === 'scan' ? '扫描中…' : `登记到期鉴定${unregistered.length > 0 ? `（${unregistered.length}）` : ''}`}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 到期预警 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            保管期满案卷（实时测算）
            <span className="text-xs font-normal text-slate-400">{dueVolumes.length} 卷到期 · 其中 {unregistered.length} 卷未登记鉴定</span>
          </h3>
          {dueVolumes.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-3">当前全宗暂无保管期满案卷</p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                    <th className="px-4 py-3 text-left text-[13px] font-semibold">案卷题名</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-44">档号</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-14">年度</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-16">期限</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-24">期满日</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-28">所在盒</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-20">鉴定状态</th>
                  </tr>
                </thead>
                <tbody>
                  {dueVolumes.map((v) => (
                    <tr key={v.volumeNode} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-800">{v.title}</td>
                      <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{v.volumeCode || '—'}</td>
                      <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{v.year}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600">{v.retention}</td>
                      <td className="px-4 py-3 font-mono text-[13px] font-medium text-red-600">{v.dueDate}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600">{v.boxNo || '—'}</td>
                      <td className="px-4 py-3">
                        {v.appraisalStatus
                          ? <span className={`px-1.5 py-0.5 rounded-full font-medium ${STATUS_META[v.appraisalStatus]?.cls || 'bg-slate-100 text-slate-500'}`}>{STATUS_META[v.appraisalStatus]?.label || v.appraisalStatus}</span>
                          : <span className="text-slate-400">未登记</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 待鉴定任务 */}
        <AppraisalSection
          title={`鉴定评审中（${pendingList.length}）`}
          icon={<FileText className="w-4 h-4 text-amber-500" />}
          empty="暂无待鉴定任务"
          list={pendingList}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          volTitle={volTitle}
          actions={(a) => (
            <button type="button" onClick={() => { setReviewTarget(a); setMeetingNote(''); }}
              className="px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100">
              评审
            </button>
          )}
        />

        {/* 待销毁执行 */}
        <AppraisalSection
          title={`待销毁执行（${approvedList.length}）`}
          icon={<Trash2 className="w-4 h-4 text-red-500" />}
          empty="暂无待销毁案卷"
          list={approvedList}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          volTitle={volTitle}
          actions={(a) => (
            <button type="button" disabled={actioning === a.id} onClick={() => void handleDestroy(a)}
              className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50">
              执行销毁
            </button>
          )}
        />

        {/* 已办结 */}
        <AppraisalSection
          title={`已办结（${closedList.length}）`}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          empty="暂无已办结鉴定"
          list={closedList}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          volTitle={volTitle}
          actions={() => null}
        />

      </div>

      {/* 评审弹窗 */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setReviewTarget(null)}>
          <div className="w-[480px] bg-white rounded-2xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800">鉴定评审 · {volTitle(reviewTarget.volumeNode)}</h3>
            <p className="text-xs text-slate-500">期满日 {reviewTarget.dueDate} · 评审人 {currentUser?.name || currentUser?.account}</p>
            <textarea
              value={meetingNote}
              onChange={(e) => setMeetingNote(e.target.value)}
              rows={3}
              placeholder="鉴定小组评审意见（续存理由/销毁依据，留痕保存）"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReviewTarget(null)}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
              <button type="button" disabled={actioning === reviewTarget.id} onClick={() => void handleReview('retain')}
                className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50">
                续存
              </button>
              <button type="button" disabled={actioning === reviewTarget.id} onClick={() => void handleReview('destroy')}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                同意销毁
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── 鉴定记录分组卡片 ──
const AppraisalSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  empty: string;
  list: AppraisalRecord[];
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  volTitle: (nodeId: string) => string;
  actions: (a: AppraisalRecord) => React.ReactNode;
}> = ({ title, icon, empty, list, expandedId, setExpandedId, volTitle, actions }) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
      {icon}
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
    </div>
    <div className="divide-y divide-slate-100">
      {list.length === 0 ? (
        <div className="px-5 py-5 text-center text-sm text-slate-400">{empty}</div>
      ) : list.map((a) => {
        const isExpanded = expandedId === a.id;
        return (
          <div key={a.id}>
            <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : a.id)}>
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
              <span className="text-sm text-slate-700 flex-1 truncate">{volTitle(a.volumeNode)}</span>
              <span className="text-xs text-slate-400">期满 {a.dueDate}</span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_META[a.status]?.cls || 'bg-slate-100 text-slate-500'}`}>
                {STATUS_META[a.status]?.label || a.status}
              </span>
              {actions(a)}
            </div>
            {isExpanded && (
              <div className="px-8 pb-3 bg-slate-50 text-xs text-slate-500 space-y-1">
                <div>案卷节点：<span className="font-mono">{a.volumeNode}</span></div>
                {a.reviewer && <div>评审人：{a.reviewer} · {a.reviewedAt?.slice(0, 19).replace('T', ' ')}</div>}
                {a.meetingNote && <div>评审意见：{a.meetingNote}</div>}
                {a.destroyedAt && <div>销毁时间：{a.destroyedAt.slice(0, 19).replace('T', ' ')}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

export default AppraisalManagePage;
