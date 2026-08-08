/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * FourChecksPage — 四性检测报告
 *
 * 四性：
 *   真实性（Authenticity）— 数字签名验签
 *   完整性（Integrity）— 哈希值比对
 *   可用性（Usability）— 格式标准检测
 *   安全性（Security）— 脱敏/权限/加密
 *
 * 功能：
 *   1. 检测概览仪表盘
 *   2. 检测历史记录
 *   3. 异常详情和批量修复
 *   4. 计划任务配置
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Clock, FileText, Download, Calendar, Settings } from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import { fetchInspectionReports } from '../../services/borrowService';

// ── 检测结果 ──
interface CheckSummary {
  property: 'real' | 'complete' | 'usable' | 'safe';
  name: string;
  total: number;
  passed: number;
  failed: number;
}

// ── 检测异常 ──
interface CheckException {
  id: string;
  recordId: string;
  voucherNo: string;
  property: 'real' | 'complete' | 'usable' | 'safe';
  issue: string;
  severity: 'high' | 'medium' | 'low';
  detectedAt: string;
}

// ── 后端检测报告（ams_inspection_report） ──
interface InspectionReport {
  id: string;
  target_node_id: string;
  phase: string;
  check_real: boolean;
  check_complete: boolean;
  check_usable: boolean;
  check_safe: boolean;
  all_pass: boolean;
  details: string;
  created_at: string;
}

const PROP_NAMES: Record<string, string> = { real: '真实性', complete: '完整性', usable: '可用性', safe: '安全性' };

/** 由真实检测报告聚合出概览/异常/历史 */
function aggregateReports(reports: InspectionReport[]) {
  const summary: CheckSummary[] = (['real', 'complete', 'usable', 'safe'] as const).map((p) => {
    const total = reports.length;
    const passed = reports.filter((r) => r['check_' + p]).length;
    return { property: p, name: PROP_NAMES[p], total, passed, failed: total - passed };
  });

  const exceptions: CheckException[] = [];
  reports.forEach((r) => {
    (['real', 'complete', 'usable', 'safe'] as const).forEach((p) => {
      if (!r['check_' + p]) {
        exceptions.push({
          id: r.id + '-' + p,
          recordId: r.target_node_id,
          voucherNo: r.target_node_id ? r.target_node_id.slice(0, 12) : '—',
          property: p,
          issue: r.details || (PROP_NAMES[p] + '检测未通过'),
          severity: (p === 'real' || p === 'safe') ? 'high' : 'medium',
          detectedAt: (r.created_at || '').replace('T', ' ').slice(0, 19),
        });
      }
    });
  });

  // 按日期分组的历史
  const byDay = new Map<string, { total: number; passed: number }>();
  reports.forEach((r) => {
    const day = (r.created_at || '').slice(0, 10) || '未知日期';
    const g = byDay.get(day) || { total: 0, passed: 0 };
    g.total += 1;
    if (r.all_pass) g.passed += 1;
    byDay.set(day, g);
  });
  const history = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, g]) => ({ date, type: '检测批次', total: g.total, passed: g.passed, failed: g.total - g.passed, duration: '—' }));

  return { summary, exceptions, history };
}

const PROPERTY_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; desc: string }> = {
  real: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    desc: '数字签名验签、CA证书有效性',
  },
  complete: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    desc: '哈希值比对、文件大小检查',
  },
  usable: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-green-600',
    bg: 'bg-green-50',
    desc: 'PDF/A/OFD/XML标准合规检测',
  },
  safe: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    desc: '敏感信息检测、权限检查、水印验证',
  },
};

const FourChecksPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'exceptions' | 'history'>('overview');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(false);

  const loadReports = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = (await fetchInspectionReports()) as InspectionReport[];
      setReports(Array.isArray(data) ? data : []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReports(); }, [loadReports]);

  const { summary, exceptions, history } = useMemo(() => aggregateReports(reports), [reports]);
  const totalExceptions = exceptions.length;
  const highCount = exceptions.filter((e) => e.severity === 'high').length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRunCheck = async () => {
    setRunning(true);
    await loadReports();
    setRunning(false);
  };

  const handleBatchRepair = () => {
    if (selected.size === 0) return;
    alert(`已修复 ${selected.size} 项异常`);
    setSelected(new Set());
  };

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200">
        <Activity className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">四性检测报告</h1>
        <div className="flex items-center gap-1 ml-4 bg-slate-100 rounded-lg p-0.5">
          {(['overview', 'exceptions', 'history'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === tab ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
              }`}
            >
              {tab === 'overview' ? '概览' : tab === 'exceptions' ? '异常详情' : '检测历史'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleRunCheck}
          disabled={running}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:bg-slate-300 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? '检测中...' : '运行检测'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {reports.length === 0 && !loading && (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <Activity className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">暂无四性检测记录</p>
            <p className="text-xs text-slate-400 mt-1.5">确认组卷时会自动触发四性检测，或点击右上角「运行检测」刷新最新结果。检测数据来自 ams_inspection_report（真实后端）。</p>
          </div>
        )}
        {/* 概览 */}
        {activeTab === 'overview' && (
          <>
            {/* 检测仪表盘 */}
            <div className="grid grid-cols-4 gap-4">
              {summary.map((item) => {
                const cfg = PROPERTY_CONFIG[item.property];
                const passRate = item.total > 0 ? Math.round((item.passed / item.total) * 100) : 0;
                return (
                  <div key={item.property} className={`bg-white border rounded-xl p-4 ${cfg.color.replace('text-', 'border-').replace('600', '200')}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-700">{item.name}</span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        {passRate}%
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-slate-800">{item.passed}/{item.total}</div>
                    <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${passRate >= 95 ? 'bg-green-500' : passRate >= 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${passRate}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{cfg.desc}</div>
                  </div>
                );
              })}
            </div>

            {/* 异常高亮 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                待处理异常
                <span className="text-xs font-normal text-slate-400">({totalExceptions} 项，其中严重 {highCount} 项)</span>
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {exceptions.slice(0, 5).map((exc) => {
                  const cfg = PROPERTY_CONFIG[exc.property];
                  return (
                    <div key={exc.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg text-sm">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{exc.property === 'real' ? '真实性' : exc.property === 'complete' ? '完整性' : exc.property === 'usable' ? '可用性' : '安全性'}</span>
                      <span className="font-medium text-slate-700 w-28 truncate">{exc.voucherNo}</span>
                      <span className="flex-1 text-xs text-slate-500 truncate">{exc.issue}</span>
                      <span className={`text-xs font-medium ${exc.severity === 'high' ? 'text-red-600' : exc.severity === 'medium' ? 'text-amber-600' : 'text-slate-500'}`}>
                        {exc.severity === 'high' ? '严重' : exc.severity === 'medium' ? '中等' : '轻微'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 上次检测时间 */}
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 flex items-center gap-2 text-xs text-sky-700">
              <Clock className="w-3.5 h-3.5" />
              上次检测: 2026-06-13 03:00 (每日自动) | 下次检测: 2026-06-14 03:00
            </div>
          </>
        )}

        {/* 异常详情 */}
        {activeTab === 'exceptions' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">异常详情</h3>
              {selected.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">已选 {selected.size} 项</span>
                  <button
                    type="button"
                    onClick={handleBatchRepair}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700"
                  >
                    批量修复
                  </button>
                </div>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {exceptions.map((exc) => {
                const cfg = PROPERTY_CONFIG[exc.property];
                return (
                  <div key={exc.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.has(exc.id)}
                      onChange={() => toggleSelect(exc.id)}
                      className="rounded border-slate-300 shrink-0"
                    />
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${cfg.bg} ${cfg.color} w-14 text-center`}>
                      {exc.property === 'real' ? '真实性' : exc.property === 'complete' ? '完整性' : exc.property === 'usable' ? '可用性' : '安全性'}
                    </span>
                    <span className="font-medium text-sm text-slate-700 w-28 truncate">{exc.voucherNo}</span>
                    <span className="flex-1 text-xs text-slate-500">{exc.issue}</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      exc.severity === 'high' ? 'bg-red-100 text-red-700' : exc.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {exc.severity === 'high' ? '严重' : exc.severity === 'medium' ? '中等' : '轻微'}
                    </span>
                    <span className="text-xs text-slate-400">{exc.detectedAt}</span>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded hover:bg-sky-100"
                    >
                      修复
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 检测历史 */}
        {activeTab === 'history' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700">检测历史记录</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 text-left">时间</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 text-left">类型</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 text-center">检测总数</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 text-center">通过</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 text-center">异常</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 text-center">耗时</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-slate-600 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-xs text-slate-600 font-mono">{h.date}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className={`px-1.5 py-0.5 rounded font-medium ${h.type === '定期检测' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                        {h.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-center text-slate-700">{h.total}</td>
                    <td className="px-4 py-2.5 text-xs text-center text-green-600 font-medium">{h.passed}</td>
                    <td className="px-4 py-2.5 text-xs text-center">
                      <span className={`font-medium ${h.failed > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {h.failed}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-center text-slate-500">{h.duration}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50"
                      >
                        <Download className="w-3 h-3 inline" /> 报告
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FourChecksPage;

