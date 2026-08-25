/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * QuickCheckPage — 快速检测（2026-08-25 新增）
 *
 * 按规定（DA/T 94-2022），四性检测在「移交（推送至保管库）」环节自动执行：
 * 组卷工作台点「移交至档案保管」时服务端自动卷级检测，未通过即阻断移交。
 *
 * 本页职责：
 *   1. 全部检测报告明细展示（移交自动检测 + 手动检测 + 历史环节报告），
 *      不合格项逐条列出，并可跳转到对应页面直接查看；
 *   2. 手动发起卷级四性检测（选择案卷立即执行）。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Zap, RefreshCw, Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  ShieldCheck, ShieldAlert, Play, ExternalLink, Eye, X, Layers,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useArchiveStore } from '../../stores/archiveStore';
import { useVolumeStore } from '../../stores/volumeStore';
import {
  fetchInspectionReports, runVolumeInspection, parseReportDetail,
  PHASE_LABELS, DIMENSION_LABELS,
  type InspectionReport, type ReportDetail,
} from '../../services/inspectionService';
import RecordDetailPanel from '../../components/RecordDetailPanel';
import type { ArchiveRecord } from '../../types';

// ── 小工具 ──

const fmtTime = (s?: string | null) => (s ? s.replace('T', ' ').slice(0, 19) : '—');

const phaseLabel = (p: string) =>
  PHASE_LABELS[p] || (p === 'manual' ? '手动检测' : p || '—');

/** 四性徽标（单维度） */
const DimBadge: React.FC<{ label: string; pass: boolean }> = ({ label, pass }) => (
  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${
    pass ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'
  }`}>
    {pass ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
    {label}
  </span>
);

// ═══════════════════════════════════════════════════════════
// 报告行（可展开明细）
// ═══════════════════════════════════════════════════════════

const ReportRow: React.FC<{
  report: InspectionReport;
  detail: ReportDetail;
  targetName: string;
  expanded: boolean;
  onToggle: () => void;
  onJumpVolume: (nodeId: string) => void;
  onViewRecord: (nodeId: string) => void;
}> = ({ report, detail, targetName, expanded, onToggle, onJumpVolume, onViewRecord }) => {
  const allPass = !!(report.real && report.complete && report.usable && report.safe);
  const items = detail.items || [];
  const failed = items.filter((it) => !it.pass);

  return (
    <>
      <tr
        className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/40 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-center">
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 inline" /> : <ChevronRight className="w-4 h-4 text-slate-400 inline" />}
        </td>
        <td className="px-4 py-3 font-mono text-[13px] text-slate-600 whitespace-nowrap">{fmtTime(report.created_at)}</td>
        <td className="px-4 py-3 text-[13px] text-slate-800">
          <div className="font-medium truncate max-w-[260px]" title={targetName}>{targetName}</div>
          <div className="text-[10px] text-slate-400 font-mono truncate max-w-[260px]">{report.target_node}</div>
        </td>
        <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap">
          {report.target_kind === 'volume' ? '案卷' : '件'}
        </td>
        <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap">{phaseLabel(report.phase)}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 flex-wrap">
            <DimBadge label="真实" pass={!!report.real} />
            <DimBadge label="完整" pass={!!report.complete} />
            <DimBadge label="可用" pass={!!report.usable} />
            <DimBadge label="安全" pass={!!report.safe} />
          </div>
        </td>
        <td className="px-4 py-3 text-center whitespace-nowrap">
          {allPass
            ? <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">通过</span>
            : <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-600">未通过（{failed.length} 项）</span>}
        </td>
        <td className="px-4 py-3 text-[13px] text-slate-500 whitespace-nowrap">{report.operator || '系统'}</td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={8} className="p-0 bg-slate-50">
            <div className="px-6 py-4 space-y-3">
              {detail.summary && (
                <div className={`text-xs px-3 py-2 rounded-lg border ${
                  allPass ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-red-600 bg-red-50 border-red-100'
                }`}>
                  {detail.summary}
                </div>
              )}

              {items.length === 0 ? (
                <div className="text-xs text-slate-400">本报告无检测项明细</div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 divide-x divide-slate-200/80">
                        <th className="px-4 py-2 text-left text-[12px] font-semibold w-24 whitespace-nowrap">四性</th>
                        <th className="px-4 py-2 text-left text-[12px] font-semibold w-64">检测项</th>
                        <th className="px-4 py-2 text-center text-[12px] font-semibold w-20 whitespace-nowrap">结果</th>
                        <th className="px-4 py-2 text-left text-[12px] font-semibold">问题说明</th>
                        <th className="px-4 py-2 text-right text-[12px] font-semibold w-28 whitespace-nowrap">定位</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i} className={`border-b border-slate-100 last:border-0 divide-x divide-slate-100 ${it.pass ? '' : 'bg-red-50/40'}`}>
                          <td className="px-4 py-2 text-[12px] text-slate-600 whitespace-nowrap">
                            {DIMENSION_LABELS[it.dimension] || it.dimension}
                          </td>
                          <td className="px-4 py-2 text-[12px] text-slate-700">{it.name}<span className="text-slate-300 font-mono ml-1.5">{it.code}</span></td>
                          <td className="px-4 py-2 text-center">
                            {it.pass
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                              : <XCircle className="w-4 h-4 text-red-500 inline" />}
                          </td>
                          <td className="px-4 py-2 text-[12px] text-slate-500">{it.pass ? '—' : (it.note || '未通过')}</td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            {!it.pass && it.target === 'volume' && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onJumpVolume(report.target_node); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100"
                              >
                                <Layers className="w-3 h-3" />查看案卷
                              </button>
                            )}
                            {!it.pass && it.target && it.target !== 'volume' && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onViewRecord(it.target!); }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100"
                              >
                                <Eye className="w-3 h-3" />查看该件
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(detail.reviews || []).length > 0 && (
                <div className="text-[11px] text-slate-500 space-y-1">
                  {(detail.reviews || []).map((rv, i) => (
                    <div key={i}>
                      人工复检：{DIMENSION_LABELS[rv.dimension] || rv.dimension} → {rv.status === 'pass' ? '通过' : '不通过'}
                      （{rv.reviewer}：{rv.reason}，{fmtTime(rv.at)}）
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end">
                {report.target_kind === 'volume' && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onJumpVolume(report.target_node); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-sky-700 bg-white border border-sky-200 rounded-md hover:bg-sky-50"
                  >
                    <ExternalLink className="w-3 h-3" />到组卷工作台查看该案卷
                  </button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════
// 主页面
// ═══════════════════════════════════════════════════════════

const QuickCheckPage: React.FC = () => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const setActiveMainMenu = useAppStore((s) => s.setActiveMainMenu);
  const allRecords = useArchiveStore((s) => s.allRecords);
  const volumes = useVolumeStore((s) => s.volumes);
  const setActiveVolume = useVolumeStore((s) => s.setActiveVolume);

  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState<'all' | 'failed' | 'passed'>('all');
  const [manualOpen, setManualOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  /** 件级问题「查看该件」：页内打开详情分栏 */
  const [viewRecord, setViewRecord] = useState<ArchiveRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReports(await fetchInspectionReports());
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : '检测报告加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── 统计 ──
  const stats = useMemo(() => {
    let passed = 0, failed = 0, volumeCount = 0;
    for (const r of reports) {
      const ok = !!(r.real && r.complete && r.usable && r.safe);
      if (ok) passed++; else failed++;
      if (r.target_kind === 'volume') volumeCount++;
    }
    return { total: reports.length, passed, failed, volumeCount };
  }, [reports]);

  const filtered = useMemo(() => reports.filter((r) => {
    if (resultFilter === 'passed') return !!(r.real && r.complete && r.usable && r.safe);
    if (resultFilter === 'failed') return !(r.real && r.complete && r.usable && r.safe);
    return true;
  }), [reports, resultFilter]);

  const detailCache = useMemo(() => {
    const m = new Map<string, ReportDetail>();
    for (const r of reports) m.set(r.id, parseReportDetail(r.detail_json));
    return m;
  }, [reports]);

  /** 目标名称：案卷取卷镜像，件取件域镜像（缺失时退化为节点 id 前缀） */
  const targetNameOf = useCallback((r: InspectionReport): string => {
    if (r.target_kind === 'volume') {
      const v = volumes.find((x) => x.id === r.target_node);
      if (v) return [v.title && v.title !== '未命名案卷' && v.title !== '新案卷' ? v.title : '', v.volumeCode].filter(Boolean).join(' · ') || r.target_node;
      return `案卷 ${r.target_node.slice(0, 8)}…`;
    }
    const rec = allRecords.find((x) => x.id === r.target_node);
    if (rec) return [rec.voucherNo, rec.archiveType].filter(Boolean).join(' · ');
    return `件 ${r.target_node.slice(0, 8)}…`;
  }, [volumes, allRecords]);

  // ── 跳转：卷 → 组卷工作台并选中该案卷 ──
  const jumpToVolume = useCallback((volumeId: string) => {
    const v = volumes.find((x) => x.id === volumeId);
    if (v) setActiveVolume(v);
    setActiveMainMenu('volume-workspace');
  }, [volumes, setActiveVolume, setActiveMainMenu]);

  // ── 件级定位：页内打开详情（件域镜像缺失时提示） ──
  const openRecordDetail = useCallback((nodeId: string) => {
    const rec = allRecords.find((x) => x.id === nodeId);
    if (!rec) {
      triggerToast('未在件域镜像中找到该件（可能已删除），请刷新后重试', 'info');
      return;
    }
    setViewRecord(rec);
  }, [allRecords, triggerToast]);

  // ── 手动检测 ──
  const runManual = useCallback(async (volumeId: string) => {
    setRunningId(volumeId);
    try {
      const r = await runVolumeInspection(volumeId, 'yj');
      triggerToast(
        r.allPass
          ? `四性检测通过（${r.itemCount} 件）`
          : `四性检测未通过：${(r.issues || []).length} 项问题（见明细）`,
        r.allPass ? 'success' : 'warning',
      );
      await load();
      const latest = (await fetchInspectionReports(volumeId))[0];
      if (latest) setExpandedId(latest.id);
    } catch (e) {
      triggerToast('检测失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setRunningId(null);
    }
  }, [load, triggerToast]);

  /** 可手动检测的案卷（草稿 + 已确认；已移交卷的检测在移交时已自动完成） */
  const checkableVolumes = useMemo(
    () => volumes.filter((v) => v.status === 'draft' || v.status === 'confirmed' || v.status === 'numbered' || v.status === 'completed'),
    [volumes],
  );

  // ── 件详情分栏视图 ──
  if (viewRecord) {
    return (
      <div className="flex-1 flex overflow-hidden animate-in fade-in duration-200">
        <div className="w-[280px] min-w-[240px] flex flex-col border-r border-slate-200 bg-white">
          <div className="shrink-0 px-4 py-3 border-b border-slate-100">
            <button
              onClick={() => setViewRecord(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-sky-50 hover:text-sky-700 hover:border-sky-300 transition-all shadow-sm mb-2.5"
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              返回检测列表
            </button>
            <div className="text-sm font-bold text-slate-800 truncate">{viewRecord.voucherNo || '档案详情'}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">检测问题定位 · 件级元数据与内容</div>
          </div>
        </div>
        <RecordDetailPanel context="archive" record={viewRecord} onClose={() => setViewRecord(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <Zap className="w-5 h-5 text-sky-600" />
        <h1 className="text-base font-bold text-slate-800">快速检测</h1>
        <span className="text-xs text-slate-400">
          四性检测结果中心 · 按规定检测在移交（推送至保管库）时自动执行，未通过即阻断移交
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100"
        >
          <Play className="w-3.5 h-3.5" />
          手动检测
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loadErr && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-xl">{loadErr}</div>
        )}

        {/* 统计卡 */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-slate-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
              <div className="text-xs text-slate-400">检测报告总数（卷级 {stats.volumeCount}）</div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">{stats.passed}</div>
              <div className="text-xs text-slate-400">四性全部通过</div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
              <div className="text-xs text-slate-400">存在不合格项</div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1.5">检测口径（DA/T 94-2022）</div>
            <div className="text-[11px] text-slate-500 leading-relaxed">
              移交（推送至保管库）= 法定检测节点：自动执行、未过即阻断；手动检测同口径
            </div>
          </div>
        </div>

        {/* 报告列表 */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-700">检测报告明细</h3>
            <span className="text-xs text-slate-400">{filtered.length} 条</span>
            <div className="flex-1" />
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {([['all', '全部'], ['failed', '仅未通过'], ['passed', '仅通过']] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setResultFilter(k)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    resultFilter === k ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">
              <Loader2 className="w-4 h-4 inline animate-spin mr-1.5" />加载检测报告…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-400">
              暂无检测报告 — 在组卷工作台执行「移交至档案保管」将自动触发四性检测；也可点右上角「手动检测」
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1080px]">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                    <th className="px-4 py-3 w-10"></th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-44 whitespace-nowrap">检测时间</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold min-w-[220px]">检测对象</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-16 whitespace-nowrap">类型</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-28 whitespace-nowrap">环节</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-64 whitespace-nowrap">四性结果</th>
                    <th className="px-4 py-3 text-center text-[13px] font-semibold w-36 whitespace-nowrap">结论</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-28 whitespace-nowrap">操作人</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <ReportRow
                      key={r.id}
                      report={r}
                      detail={detailCache.get(r.id) || {}}
                      targetName={targetNameOf(r)}
                      expanded={expandedId === r.id}
                      onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      onJumpVolume={jumpToVolume}
                      onViewRecord={openRecordDetail}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 手动检测弹窗 ═══ */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setManualOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-xl w-full mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3 shrink-0">
              <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center">
                <Play className="w-4 h-4 text-sky-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-800">手动四性检测</h3>
                <p className="text-xs text-slate-500 mt-0.5">选择案卷立即执行（与移交自动检测同口径：真实/完整/可用/安全全项）</p>
              </div>
              <button type="button" onClick={() => setManualOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {checkableVolumes.length === 0 && (
                <div className="text-sm text-slate-400 text-center py-8">
                  暂无可检测案卷 — 请先在组卷工作台组卷（检测对卷内件执行，空卷不可检测）
                </div>
              )}
              {checkableVolumes.map((v) => {
                const last = reports.find((r) => r.target_node === v.id && r.target_kind === 'volume');
                const lastOk = last && !!(last.real && last.complete && last.usable && last.safe);
                return (
                  <div key={v.id} className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3 hover:border-sky-200 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate" title={v.title}>
                        {v.title && v.title !== '未命名案卷' && v.title !== '新案卷' ? v.title : (v.volumeCode || '未命名案卷')}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{v.archiveType || '—'}</span>
                        <span>{v.year}年</span>
                        <span>{v.totalItems ?? 0} 件</span>
                        {v.volumeCode && <span className="font-mono">{v.volumeCode}</span>}
                        {last && (
                          <span className={lastOk ? 'text-emerald-600' : 'text-red-500'}>
                            上次：{lastOk ? '通过' : '未通过'}（{fmtTime(last.created_at).slice(5, 16)}）
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={runningId !== null || (v.totalItems ?? 0) === 0}
                      onClick={() => void runManual(v.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {runningId === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      {runningId === v.id ? '检测中…' : '执行检测'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickCheckPage;
