/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * AppraisalManagePage — 期满鉴定与销毁（2026-08-16 接真重构；2026-09-05 T13 法定化改造）
 *
 * 法定闭环（79号令第20/21条，缺陷 #18）：
 *   1. 到期测算：实时扫描已入库案卷，按「年度+保管期限」算保管期满日
 *      （保管期限自会计年度终了后第一年起算；永久不期满）
 *   2. 一键登记鉴定任务（幂等）
 *   3. 鉴定评审：续存单步（retained）；销毁必须走三方签批链——
 *      申请单位（须完成未结清债权债务核查声明）→ 档案管理部门 → 监销人
 *   4. 销毁清册：法定字段 HTML，随档留存 /{全宗}/_销毁清册/{年}/，可下载打印（一式两份报备案）
 *   5. 销毁执行：前置清册已生成 + 监销人已签批 + 共同监销记录必填；
 *      执行后服务端重取校验做不可恢复性验证并留痕
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Trash2, CheckCircle2, Clock, FileText, Shield, ChevronDown, ChevronRight, RefreshCw, ScanSearch, Download, FileSignature, X } from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import {
  fetchDueVolumes, scanAppraisals, fetchAppraisals, reviewAppraisal,
  signAppraisal, generateDestroyRegister, downloadDestroyRegister, executeDestroy,
  type DueVolume, type AppraisalRecord,
} from '../../services/appraisalService';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '待鉴定', cls: 'bg-amber-100 text-amber-700' },
  'approved-destroy': { label: '同意销毁', cls: 'bg-red-100 text-red-700' },
  retained: { label: '续存', cls: 'bg-emerald-100 text-emerald-700' },
  destroyed: { label: '已销毁', cls: 'bg-slate-200 text-slate-500' },
};

type SignRole = 'applicant' | 'archives' | 'supervisor';
const ROLE_META: Record<SignRole, { label: string; desc: string }> = {
  applicant: { label: '申请单位（保管部门）', desc: '发起销毁申请；必须先完成未结清债权债务核查' },
  archives: { label: '档案管理部门', desc: '复核鉴定结论并签批' },
  supervisor: { label: '监销人（审计/监察）', desc: '终审签批，签齐后进入待销毁执行' },
};

/** 签批链下一步（null=三方已签齐） */
function nextSignRole(a: AppraisalRecord): SignRole | null {
  if (!a.signApplicant) return 'applicant';
  if (!a.signArchives) return 'archives';
  if (!a.signSupervisor) return 'supervisor';
  return null;
}

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
  // T13 签批弹窗
  const [signTarget, setSignTarget] = useState<{ a: AppraisalRecord; role: SignRole } | null>(null);
  const [signNote, setSignNote] = useState('');
  const [unsettledCheck, setUnsettledCheck] = useState(false);
  const [unsettledNote, setUnsettledNote] = useState('');
  // T13 执行弹窗（共同监销记录）
  const [destroyTarget, setDestroyTarget] = useState<AppraisalRecord | null>(null);
  const [supervisorNote, setSupervisorNote] = useState('');

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

  /** 续存单步评审 */
  const handleRetain = async () => {
    if (!reviewTarget) return;
    if (!meetingNote.trim()) {
      triggerToast('续存请填写评审意见（延期理由）', 'warning');
      return;
    }
    setActioning(reviewTarget.id);
    try {
      await reviewAppraisal(reviewTarget.id, 'retain', meetingNote.trim());
      triggerToast('评审完成：续存', 'success');
      setReviewTarget(null);
      setMeetingNote('');
      await reload();
    } catch (e) {
      triggerToast('评审失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setActioning(null);
    }
  };

  /** 三方签批（T13） */
  const openSign = (a: AppraisalRecord, role: SignRole) => {
    setSignTarget({ a, role });
    setSignNote('');
    setUnsettledCheck(false);
    setUnsettledNote('');
  };

  const handleSign = async () => {
    if (!signTarget) return;
    const { a, role } = signTarget;
    if (role === 'applicant' && !unsettledCheck) {
      triggerToast('申请销毁必须完成「未结清债权债务核查」并勾选声明（79号令第20条）', 'warning');
      return;
    }
    if (role === 'applicant' && !unsettledNote.trim()) {
      triggerToast('请填写核查说明（如：已逐笔核查，无未结清债权债务凭证）', 'warning');
      return;
    }
    setActioning(a.id);
    try {
      await signAppraisal(a.id, role, signNote.trim(), unsettledCheck, unsettledNote.trim());
      triggerToast(`${ROLE_META[role].label} 签批完成`, 'success');
      setSignTarget(null);
      await reload();
    } catch (e) {
      triggerToast('签批失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setActioning(null);
    }
  };

  /** 生成销毁清册 */
  const handleRegister = async (a: AppraisalRecord) => {
    setActioning(a.id);
    try {
      const r = await generateDestroyRegister(a.id);
      triggerToast(`销毁清册已生成（${r.registerNo}），文件已随档留存，可下载打印报备案`, 'success');
      await reload();
    } catch (e) {
      triggerToast('清册生成失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setActioning(null);
    }
  };

  /** 下载清册 */
  const handleDownload = async (a: AppraisalRecord) => {
    try {
      await downloadDestroyRegister(a.id, `销毁清册-${a.registerNo}.html`);
    } catch (e) {
      triggerToast('清册下载失败：' + (e instanceof Error ? e.message : ''), 'warning');
    }
  };

  /** 执行销毁（共同监销记录必填；服务端前置全检） */
  const handleDestroy = async () => {
    if (!destroyTarget) return;
    if (!supervisorNote.trim()) {
      triggerToast('请填写共同监销记录（监销人、监销时间、销毁方式）', 'warning');
      return;
    }
    setActioning(destroyTarget.id);
    try {
      await executeDestroy(destroyTarget.id, supervisorNote.trim());
      triggerToast('销毁执行完成：案卷已删除、不可恢复性验证与监销记录已留痕', 'success');
      setDestroyTarget(null);
      setSupervisorNote('');
      await reload();
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
        <span className="text-xs text-slate-400">销毁法定要件：三方签批 · 未结清核查 · 销毁清册 · 共同监销 · 不可恢复验证</span>
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
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700">
                    <th className="px-4 py-3 text-left text-sm font-semibold">案卷题名</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold w-44">档号</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold w-14">年度</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold w-16">期限</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold w-24">期满日</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold w-28">所在盒</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold w-20">鉴定状态</th>
                  </tr>
                </thead>
                <tbody>
                  {dueVolumes.map((v) => (
                    <tr key={v.volumeNode} className="border-b border-slate-200/60 last:border-0 hover:bg-sky-50/50 transition-colors">
                      <td className="px-4 py-3.5 text-sm text-slate-800">{v.title}</td>
                      <td className="px-4 py-3.5 font-mono text-sm text-slate-600">{v.volumeCode || '—'}</td>
                      <td className="px-4 py-3.5 font-mono text-sm text-slate-600">{v.year}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">{v.retention}</td>
                      <td className="px-4 py-3.5 font-mono text-sm font-medium text-red-600">{v.dueDate}</td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">{v.boxNo || '—'}</td>
                      <td className="px-4 py-3.5">
                        {v.appraisalStatus
                          ? <span className={`px-2 py-0.5 rounded-full font-medium text-xs ${STATUS_META[v.appraisalStatus]?.cls || 'bg-slate-100 text-slate-500'}`}>{STATUS_META[v.appraisalStatus]?.label || v.appraisalStatus}</span>
                          : <span className="text-slate-400">未登记</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 待鉴定任务（签批链） */}
        <AppraisalSection
          title={`鉴定评审中（${pendingList.length}）`}
          icon={<FileText className="w-4 h-4 text-amber-500" />}
          empty="暂无待鉴定任务"
          list={pendingList}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          volTitle={volTitle}
          detail={(a) => <SignChainDetail a={a} />}
          actions={(a) => {
            const role = nextSignRole(a);
            if (!role) return null;
            return (
              <React.Fragment>
                <button type="button" onClick={() => { setReviewTarget(a); setMeetingNote(''); }}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50">
                  续存评审
                </button>
                <button type="button" onClick={() => openSign(a, role)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700">
                  <FileSignature className="w-3 h-3" />
                  {ROLE_META[role].label.split('（')[0]}签批
                </button>
              </React.Fragment>
            );
          }}
        />

        {/* 待销毁执行（清册 + 监销） */}
        <AppraisalSection
          title={`待销毁执行（${approvedList.length}）`}
          icon={<Trash2 className="w-4 h-4 text-red-500" />}
          empty="暂无待销毁案卷"
          list={approvedList}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          volTitle={volTitle}
          detail={(a) => <SignChainDetail a={a} />}
          actions={(a) => (
            <React.Fragment>
              {!a.registerFileNode ? (
                <button type="button" disabled={actioning === a.id} onClick={() => void handleRegister(a)}
                  className="px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 disabled:opacity-50">
                  生成销毁清册
                </button>
              ) : (
                <button type="button" onClick={() => void handleDownload(a)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100">
                  <Download className="w-3 h-3" /> 下载清册
                </button>
              )}
              <button type="button" disabled={actioning === a.id || !a.registerFileNode} onClick={() => { setDestroyTarget(a); setSupervisorNote(''); }}
                title={a.registerFileNode ? '' : '法定前置：请先生成销毁清册'}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                执行销毁
              </button>
            </React.Fragment>
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
          detail={(a) => <SignChainDetail a={a} />}
          actions={(a) => a.registerFileNode ? (
            <button type="button" onClick={() => void handleDownload(a)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100">
              <Download className="w-3 h-3" /> 清册
            </button>
          ) : null}
        />
      </div>

      {/* 续存评审弹窗 */}
      {reviewTarget && (
        <ModalShell onClose={() => setReviewTarget(null)} width="w-[500px]">
          <h3 className="text-sm font-bold text-slate-800">续存评审 · {volTitle(reviewTarget.volumeNode)}</h3>
          <p className="text-xs text-slate-500">期满日 {reviewTarget.dueDate} · 评审人 {currentUser?.name || currentUser?.account}</p>
          <textarea
            value={meetingNote}
            onChange={(e) => setMeetingNote(e.target.value)}
            rows={3}
            placeholder="鉴定小组评审意见（延期理由，留痕保存）"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
          />
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            如需销毁：法定销毁须走三方签批链（申请单位→档案管理部门→监销人），请关闭本弹窗后点「签批」。
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReviewTarget(null)}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
            <button type="button" disabled={actioning === reviewTarget.id} onClick={() => void handleRetain()}
              className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50">
              续存
            </button>
          </div>
        </ModalShell>
      )}

      {/* T13 三方签批弹窗 */}
      {signTarget && (
        <ModalShell onClose={() => setSignTarget(null)} width="w-[560px]">
          <h3 className="text-sm font-bold text-slate-800">
            {ROLE_META[signTarget.role].label} 签批 · {volTitle(signTarget.a.volumeNode)}
          </h3>
          <p className="text-xs text-slate-500">{ROLE_META[signTarget.role].desc} · 签批人 {currentUser?.name || currentUser?.account}</p>
          {signTarget.role === 'applicant' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={unsettledCheck} onChange={(e) => setUnsettledCheck(e.target.checked)}
                  className="mt-0.5 rounded accent-amber-600" />
                <span className="text-xs text-amber-800 leading-relaxed">
                  <b>未结清债权债务核查声明</b>：已逐笔核查本卷原始凭证，不含保管期满但未结清的债权债务凭证
                  （79号令第20条：此类凭证不得销毁，应单独抽出立卷保管到结清为止）。
                </span>
              </label>
              <textarea value={unsettledNote} onChange={(e) => setUnsettledNote(e.target.value)} rows={2}
                placeholder="核查说明（必填）：核查范围、方式与结论"
                className="w-full px-2.5 py-1.5 text-xs border border-amber-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-200" />
            </div>
          )}
          <textarea value={signNote} onChange={(e) => setSignNote(e.target.value)} rows={2}
            placeholder={signTarget.role === 'supervisor' ? '签批意见（可填监销安排）' : '签批意见（选填）'}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSignTarget(null)}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
            <button type="button" disabled={actioning === signTarget.a.id} onClick={() => void handleSign()}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
              签批
            </button>
          </div>
        </ModalShell>
      )}

      {/* 执行销毁弹窗（共同监销记录） */}
      {destroyTarget && (
        <ModalShell onClose={() => setDestroyTarget(null)} width="w-[560px]" danger>
          <h3 className="text-sm font-bold text-slate-800">执行销毁 · {volTitle(destroyTarget.volumeNode)}</h3>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
            <div>清册编号：<span className="font-mono">{destroyTarget.registerNo}</span>（已随档留存，下载打印一式两份报备案）</div>
            <div>签批链：申请 {destroyTarget.signApplicant || '—'} → 档案 {destroyTarget.signArchives || '—'} → 监销 {destroyTarget.signSupervisor || '—'}</div>
            <div>执行后将删除案卷及全部卷内件，系统自动做不可恢复性验证并留痕。</div>
          </div>
          <textarea value={supervisorNote} onChange={(e) => setSupervisorNote(e.target.value)} rows={3}
            placeholder="共同监销记录（必填）：监销人、监销时间、销毁方式（如：2026-09-05 由监销人张三现场监销，送专业销毁机构纸质粉碎+电子介质消磁）"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDestroyTarget(null)}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
            <button type="button" disabled={actioning === destroyTarget.id} onClick={() => void handleDestroy()}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
              确认执行销毁
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
};

/** 签批链明细（展开区） */
const SignChainDetail: React.FC<{ a: AppraisalRecord }> = ({ a }) => (
  <div className="px-8 pb-3 bg-slate-50 text-xs text-slate-500 space-y-1">
    <div>案卷节点：<span className="font-mono">{a.volumeNode}</span></div>
    <div>
      签批链：
      <span className={a.signApplicant ? 'text-emerald-600' : 'text-slate-400'}>申请 {a.signApplicant || '待签'}</span>
      {' → '}
      <span className={a.signArchives ? 'text-emerald-600' : 'text-slate-400'}>档案 {a.signArchives || '待签'}</span>
      {' → '}
      <span className={a.signSupervisor ? 'text-emerald-600' : 'text-slate-400'}>监销 {a.signSupervisor || '待签'}</span>
    </div>
    {a.unsettledCheck && <div>未结清核查：已声明（{a.unsettledNote || '无说明'}）</div>}
    {a.reviewer && <div>评审人：{a.reviewer} · {a.reviewedAt?.slice(0, 19).replace('T', ' ')}</div>}
    {a.meetingNote && <div>评审意见：{a.meetingNote}</div>}
    {a.registerNo && <div>销毁清册：<span className="font-mono">{a.registerNo}</span>{a.registerFileNode ? '（随档留存）' : ''}</div>}
    {a.supervisorNote && <div>监销记录：{a.supervisorNote}</div>}
    {a.destroyedAt && (
      <div>
        销毁时间：{a.destroyedAt.slice(0, 19).replace('T', ' ')} ·
        不可恢复验证：<span className={a.unrecoverableVerified ? 'text-emerald-600' : 'text-red-600'}>{a.unrecoverableVerified ? '通过' : '未通过'}</span>
        {a.unrecoverableNote && <span className="text-slate-400">（{a.unrecoverableNote}）</span>}
      </div>
    )}
  </div>
);

/** 弹窗外壳 */
const ModalShell: React.FC<{ onClose: () => void; width?: string; danger?: boolean; children: React.ReactNode }> = ({ onClose, width = 'w-[500px]', children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
    <div className={`${width} bg-white rounded-2xl shadow-2xl p-6 space-y-4`} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={onClose}
        className="absolute top-4 right-4 p-1 text-slate-300 hover:text-slate-500 rounded">
        <X className="w-4 h-4" />
      </button>
      {children}
    </div>
  </div>
);

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
  detail?: (a: AppraisalRecord) => React.ReactNode;
}> = ({ title, icon, empty, list, expandedId, setExpandedId, volTitle, actions, detail }) => (
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
            {isExpanded && (detail ? detail(a) : (
              <div className="px-8 pb-3 bg-slate-50 text-xs text-slate-500 space-y-1">
                <div>案卷节点：<span className="font-mono">{a.volumeNode}</span></div>
                {a.reviewer && <div>评审人：{a.reviewer} · {a.reviewedAt?.slice(0, 19).replace('T', ' ')}</div>}
                {a.meetingNote && <div>评审意见：{a.meetingNote}</div>}
                {a.destroyedAt && <div>销毁时间：{a.destroyedAt.slice(0, 19).replace('T', ' ')}</div>}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  </div>
);

export default AppraisalManagePage;
