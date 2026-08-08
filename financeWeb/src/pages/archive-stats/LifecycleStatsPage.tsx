/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * LifecycleStatsPage — 流程统计（生命周期业务统计，统计维度2）
 *
 * 监控档案从采集到处置的全流程作业进度：
 *   采集归档 / 整理组卷 / 质量检测（四性）/ 移交接收 / 鉴定处置
 */

import React from 'react';
import {
  GitBranch, Hourglass, PackageCheck, ShieldCheck, Send, Trash2, AlertTriangle,
} from 'lucide-react';
import { useArchiveStats } from '../../hooks/useArchiveStats';
import { SectionCard, StatCard, BarRow, ProgressRing, ColumnBars } from '../../components/stats/Charts';

const LifecycleStatsPage: React.FC = () => {
  const { lifecycle: lc } = useArchiveStats();

  const CHECK_COLORS: Record<string, string> = {
    real: '#0ea5e9', complete: '#6366f1', usable: '#10b981', safe: '#f59e0b',
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* 页头 */}
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-slate-600" />
          <div>
            <h1 className="text-base font-bold text-slate-800">流程统计</h1>
            <p className="text-xs text-slate-400 mt-0.5">全生命周期作业监控 · 采集归档 → 整理组卷 → 四性检测 → 移交接收 → 鉴定处置</p>
          </div>
        </div>

        {/* 流程 KPI */}
        <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="待归档（件）" value={lc.pendingArchive} sub="仅件数据·待组卷" accent={lc.pendingArchive > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <StatCard label="已归档（件）" value={lc.archived} sub="已组卷且卷已移交" accent="text-sky-600" />
          <StatCard label="本月新增归档" value={lc.monthlyNewArchived} sub="当月赋号件数" accent="text-sky-600" />
          <StatCard label="案卷总数（卷）" value={lc.groupedVolumes} sub={`草稿 ${lc.draftVolumes} · 已确认 ${lc.confirmedVolumes}`} accent="text-violet-600" />
          <StatCard label="已移交（卷）" value={lc.transferredVolumes} sub={`${lc.transferBatches} 个移交批次`} accent="text-teal-600" />
          <StatCard label="异常档案（件）" value={lc.abnormalRecords} sub="任一四性未通过" accent={lc.abnormalRecords > 0 ? 'text-red-600' : 'text-emerald-600'} />
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* 采集归档 + 整理组卷 */}
          <SectionCard title="采集归档与整理组卷进度" icon={<Hourglass className="w-4 h-4 text-amber-500" />}>
            <div className="flex items-center justify-around py-2">
              <ProgressRing pct={Math.round(lc.organizeCompletionRate)} label="整理完成率" color="#0ea5e9" size={130} />
              <div className="space-y-3 flex-1 max-w-[240px]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">待归档（积压风险）</span>
                  <span className={`font-mono font-bold ${lc.pendingArchive > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{lc.pendingArchive} 件</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">已归档</span>
                  <span className="font-mono font-bold text-sky-600">{lc.archived} 件</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">已组卷册数</span>
                  <span className="font-mono font-bold text-sky-600">{lc.groupedVolumes} 卷</span>
                </div>
                {lc.pendingArchive > 0 && (
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    当前有 {lc.pendingArchive} 件凭证待组卷，请及时在组卷工作台完成整理归档
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* 近6月归档趋势 */}
          <SectionCard title="近 6 个月归档作业量" icon={<PackageCheck className="w-4 h-4 text-sky-500" />}>
            <ColumnBars
              data={lc.monthlyArchived.map((m) => ({ label: `${Number(m.month.slice(5))}月`, value: m.count }))}
              color="#0ea5e9"
              height={190}
            />
            <p className="text-[11px] text-slate-400 mt-3">按赋号日期统计每月归档件数，监控归档积压与效率</p>
          </SectionCard>

          {/* 四性检测 */}
          <SectionCard title="质量检测（四性检测通过率）" icon={<ShieldCheck className="w-4 h-4 text-emerald-500" />}>
            <div className="space-y-3 pt-1">
              {lc.checksByProperty.map((p) => (
                <BarRow
                  key={p.key}
                  label={`${p.label}${p.failCount > 0 ? `（${p.failCount} 件异常）` : ''}`}
                  value={p.passRate}
                  max={100}
                  color={CHECK_COLORS[p.key]}
                  suffix="%"
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-xl">
              <span className="text-xs text-slate-500">全项通过（真实性+完整性+可用性+安全性）</span>
              <span className={`text-sm font-bold font-mono ${lc.checksPassRate === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {lc.checksPassRate}%
              </span>
            </div>
          </SectionCard>

          {/* 移交接收 + 鉴定处置 */}
          <SectionCard title="移交接收与鉴定处置" icon={<Send className="w-4 h-4 text-sky-500" />}>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-center">
                  <div className="text-lg font-bold font-mono text-sky-600">{lc.transferBatches}</div>
                  <div className="text-[10px] text-slate-500">移交批次</div>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-center">
                  <div className="text-lg font-bold font-mono text-sky-600">{lc.transferredVolumes}</div>
                  <div className="text-[10px] text-slate-500">已移交卷</div>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2.5 text-center">
                  <div className="text-lg font-bold font-mono text-sky-600">{lc.transferredItems}</div>
                  <div className="text-[10px] text-slate-500">移交件数</div>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600"><Trash2 className="w-3.5 h-3.5 text-slate-400" />已销毁案卷</span>
                  <span className="font-mono text-slate-700 font-medium">{lc.destroyedVolumes} 卷</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" />保管期满未处置（超期未销毁）</span>
                  <span className={`font-mono font-bold ${lc.expiredNotDestroyed > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{lc.expiredNotDestroyed} 件</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                鉴定处置依据 79号令：保管期满档案应经鉴定后销毁或续存；当前库藏最早形成于 2025 年（10/30 年期限），尚无期满档案
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default LifecycleStatsPage;

