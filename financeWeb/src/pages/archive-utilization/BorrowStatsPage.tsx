/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * BorrowStatsPage — 借阅统计分析（管理驾驶舱，PRD 2.6）
 *
 * 借阅热力图：哪些类型档案被借阅最频繁（提示审计重点）
 * 逾期红黑榜：按部门统计实体档案逾期情况（纳入部门考核）
 * 全链路操作日志：搜索/借阅/查看/打印 全量留痕
 */

import React, { useMemo, useState } from 'react';
import {
  BarChart3, Flame, AlertOctagon, ScrollText, TrendingUp,
  ClipboardList, Activity, Timer, CalendarPlus,
  Search, MonitorPlay, Download, Printer, ShoppingCart,
} from 'lucide-react';
import { useBorrowStore } from '../../stores/borrowStore';
import { isOverdue, todayStr } from '../../utils/borrowEngine';
import { computeUtilization } from '../../utils/statsEngine';
import type { BorrowLog } from '../../types/borrow';

const TYPE_LABELS: Record<string, string> = {
  KP: '会计凭证', KB: '会计账簿', FB: '财务报表', QT: '其他会计资料',
};

const TYPE_COLORS: Record<string, string> = {
  KP: 'bg-sky-500', KB: 'bg-emerald-500', FB: 'bg-violet-500', QT: 'bg-amber-500',
};

const LOG_ACTION_COLORS: Record<string, string> = {
  发起申请: 'bg-sky-100 text-sky-700',
  审批通过: 'bg-emerald-100 text-emerald-700',
  审批驳回: 'bg-red-100 text-red-700',
  电子授权: 'bg-sky-100 text-sky-700',
  实体出库: 'bg-amber-100 text-amber-700',
  归还核销: 'bg-teal-100 text-teal-700',
  预约排队: 'bg-purple-100 text-purple-700',
  预约锁定: 'bg-purple-100 text-purple-700',
  到期收回: 'bg-slate-200 text-slate-600',
  逾期预警: 'bg-red-100 text-red-700',
  催还预警: 'bg-amber-100 text-amber-700',
  催还通知: 'bg-amber-100 text-amber-700',
  中止借阅: 'bg-red-100 text-red-700',
  在线查看: 'bg-sky-100 text-sky-700',
  下载: 'bg-sky-100 text-sky-700',
  打印: 'bg-sky-100 text-sky-700',
  档案检索: 'bg-slate-100 text-slate-600',
  加入借阅车: 'bg-sky-50 text-sky-600',
  撤销申请: 'bg-slate-200 text-slate-600',
};

const BorrowStatsPage: React.FC = () => {
  const orders = useBorrowStore((s) => s.orders);
  const logs = useBorrowStore((s) => s.logs);
  const [logLimit, setLogLimit] = useState(30);

  const today = todayStr();

  // ── KPI ──
  const kpi = useMemo(() => {
    const active = orders.filter((o) => o.status === 'active' || o.status === 'fulfilling' || o.status === 'returning').length;
    const overdueCount = orders.reduce(
      (n, o) => n + o.fulfillments.filter((f) => isOverdue(f, today)).length, 0,
    );
    const thisMonth = today.slice(0, 7);
    const monthNew = orders.filter((o) => o.createdAt.startsWith(thisMonth)).length;
    return { total: orders.length, active, overdueCount, monthNew };
  }, [orders, today]);

  // ── 借阅热力图（按档案类型，按明细行数） ──
  const heatByType = useMemo(() => {
    const counts: Record<string, number> = { KP: 0, KB: 0, FB: 0, QT: 0 };
    orders.forEach((o) => o.items.forEach((i) => {
      if (counts[i.archiveTypeCode] !== undefined) counts[i.archiveTypeCode]++;
    }));
    const max = Math.max(1, ...Object.values(counts));
    return Object.entries(counts).map(([code, count]) => ({ code, label: TYPE_LABELS[code], count, pct: (count / max) * 100 }));
  }, [orders]);

  // ── 月度趋势（近6个月申请量） ──
  const monthlyTrend = useMemo(() => {
    const months: string[] = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`);
    }
    const counts = months.map((m) => ({
      month: m,
      count: orders.filter((o) => o.createdAt.startsWith(m)).length,
    }));
    const max = Math.max(1, ...counts.map((c) => c.count));
    return counts.map((c) => ({ ...c, pct: (c.count / max) * 100 }));
  }, [orders]);

  // ── 逾期红黑榜（按部门） ──
  const deptBoard = useMemo(() => {
    const map = new Map<string, { total: number; overdue: number; onTime: number }>();
    orders.forEach((o) => {
      const cur = map.get(o.applicantDept) || { total: 0, overdue: 0, onTime: 0 };
      o.fulfillments.forEach((f) => {
        if (f.type !== 'physical') return;
        cur.total++;
        if (isOverdue(f, today)) cur.overdue++;
        else if (f.status === 'returned') cur.onTime++;
      });
      map.set(o.applicantDept, cur);
    });
    return [...map.entries()]
      .map(([dept, v]) => ({ dept, ...v, rate: v.total > 0 ? Math.round((v.overdue / v.total) * 100) : 0 }))
      .sort((a, b) => b.overdue - a.overdue || b.rate - a.rate);
  }, [orders, today]);

  const shownLogs = logs.slice(0, logLimit);

  // ── 利用行为统计（统计维度3：检索/调阅/下载/打印/借阅） ──
  const utilization = useMemo(() => computeUtilization(logs, orders), [logs, orders]);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* 页头 */}
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-slate-600" />
          <h1 className="text-base font-bold text-slate-800">借阅统计分析</h1>
          <span className="text-xs text-slate-400">管理驾驶舱 · 借阅热力 / 逾期红黑榜 / 全链路日志</span>
        </div>

        {/* KPI 卡片 */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '借阅单总数', value: kpi.total, Icon: ClipboardList, color: 'border-sky-200 bg-sky-50', text: 'text-sky-700', icon: 'text-sky-500' },
            { label: '进行中借阅', value: kpi.active, Icon: Activity, color: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-500' },
            { label: '逾期未还（卷）', value: kpi.overdueCount, Icon: Timer, color: 'border-red-200 bg-red-50', text: 'text-red-700', icon: 'text-red-500' },
            { label: '本月新增申请', value: kpi.monthNew, Icon: CalendarPlus, color: 'border-violet-200 bg-violet-50', text: 'text-violet-700', icon: 'text-violet-500' },
          ].map((c) => (
            <div key={c.label} className={`rounded-2xl border ${c.color} p-4 flex items-center gap-3`}>
              <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center shadow-sm">
                <c.Icon className={`w-5 h-5 ${c.icon}`} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${c.text}`}>{c.value}</div>
                <div className="text-xs text-slate-500">{c.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 利用行为统计（检索/调阅/下载/打印/加车） */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: '档案检索（次）', value: utilization.totals.searches, Icon: Search },
            { label: '在线调阅（次）', value: utilization.totals.views, Icon: MonitorPlay },
            { label: '下载（次）', value: utilization.totals.downloads, Icon: Download },
            { label: '打印（次）', value: utilization.totals.prints, Icon: Printer },
            { label: '加入借阅车（次）', value: utilization.totals.cartAdds, Icon: ShoppingCart },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-slate-200 rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
              <c.Icon className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <div className="text-lg font-bold font-mono text-slate-800">{c.value}</div>
                <div className="text-[10px] text-slate-400">{c.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* 借阅热力图 */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-bold text-slate-700">借阅热力图</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">高频借阅类型可能提示财务争议或审计重点</p>
            <div className="space-y-3">
              {heatByType.map((t) => (
                <div key={t.code}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">{t.label}</span>
                    <span className="font-mono text-slate-500">{t.count} 件次</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${TYPE_COLORS[t.code]} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.max(t.pct, t.count > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* 月度趋势 */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-sky-500" />
                <span className="text-xs font-bold text-slate-600">近 6 个月申请趋势</span>
              </div>
              <div className="flex items-end gap-2 h-24">
                {monthlyTrend.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono text-slate-500">{m.count}</span>
                    <div className="w-full bg-slate-100 rounded-t-md relative" style={{ height: '100%' }}>
                      <div
                        className="absolute bottom-0 w-full bg-sky-500/80 rounded-t-md transition-all duration-500"
                        style={{ height: `${Math.max(m.pct, m.count > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">{m.month.slice(5)}月</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 逾期红黑榜 */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <AlertOctagon className="w-4 h-4 text-red-500" />
              <span className="text-sm font-bold text-slate-700">逾期红黑榜</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">按部门统计实体档案逾期率，纳入部门考核</p>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                  <th className="px-4 py-3 text-left text-[13px] font-semibold">部门</th>
                  <th className="px-4 py-3 text-center text-[13px] font-semibold">实体借阅</th>
                  <th className="px-4 py-3 text-center text-[13px] font-semibold">按期归还</th>
                  <th className="px-4 py-3 text-center text-[13px] font-semibold">逾期未还</th>
                  <th className="px-4 py-3 text-right text-[13px] font-semibold">逾期率</th>
                </tr>
              </thead>
              <tbody>
                {deptBoard.map((d) => (
                  <tr key={d.dept} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{d.dept}</td>
                    <td className="px-4 py-3 text-center font-mono text-[13px] text-slate-600">{d.total}</td>
                    <td className="px-4 py-3 text-center font-mono text-[13px] text-emerald-600">{d.onTime}</td>
                    <td className="px-4 py-3 text-center font-mono text-[13px]">
                      <span className={d.overdue > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}>{d.overdue}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        d.rate === 0 ? 'bg-emerald-100 text-emerald-700' : d.rate < 30 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {d.rate}%
                      </span>
                    </td>
                  </tr>
                ))}
                {deptBoard.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-xs text-slate-400">暂无实体借阅数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 全链路操作日志 */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-bold text-slate-700">全链路操作日志</span>
              <span className="text-[10px] text-slate-400">谁在什么时间搜索了什么、借了什么、看了什么、打印了几次（等保要求，不可篡改）</span>
            </div>
            <span className="text-xs text-slate-400">共 {logs.length} 条</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                  <th className="px-4 py-3 text-left text-[13px] font-semibold">时间</th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold">操作人</th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold">角色</th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold">动作</th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold">对象</th>
                  <th className="px-4 py-3 text-left text-[13px] font-semibold">详情</th>
                </tr>
              </thead>
              <tbody>
                {shownLogs.map((log: BorrowLog) => (
                  <tr key={log.id} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-[13px] text-slate-600 whitespace-nowrap">{log.timestamp}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800 whitespace-nowrap">{log.actorName}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap">{log.actorRoleLabel}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${LOG_ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-600'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-600 max-w-[220px] truncate" title={log.target}>{log.target}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-600 max-w-[240px] truncate" title={log.detail}>{log.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {logs.length > logLimit && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setLogLimit((n) => n + 50)}
                className="px-4 py-1.5 text-xs text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors"
              >加载更多（剩余 {logs.length - logLimit} 条）</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BorrowStatsPage;

