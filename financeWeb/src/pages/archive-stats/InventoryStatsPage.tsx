/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * InventoryStatsPage — 库藏统计（家底盘点，统计维度1）
 *
 * 依据 79号令 + DA/T 94-2022 法定分类维度：
 *   档案类型 / 会计年度 / 保管期限 / 全宗组织 / 存储载体
 *   件数 / 卷数 / 页数 / 容量 全量盘点
 */

import React from 'react';
import {
  Database, FolderOpen, Boxes, Hourglass, Building2, Users, HardDrive,
} from 'lucide-react';
import { useArchiveStats } from '../../hooks/useArchiveStats';
import { formatCapacity } from '../../utils/statsEngine';
import { SectionCard, StatCard, Donut, BarRow, ColumnBars, CHART_COLORS } from '../../components/stats/Charts';

const InventoryStatsPage: React.FC = () => {
  const { inventory: inv } = useArchiveStats();

  const typeTotal = Math.max(1, inv.byType.reduce((s, t) => s + t.records, 0));

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* 页头 */}
        <div className="flex items-center gap-3">
          <Boxes className="w-5 h-5 text-slate-600" />
          <div>
            <h1 className="text-base font-bold text-slate-800">库藏统计</h1>
            <p className="text-xs text-slate-400 mt-0.5">家底盘点 · 按 类型/年度/保管期限/全宗/部门/载体 多维统计（79号令 + DA/T 94-2022 法定维度）</p>
          </div>
        </div>

        {/* 总量 KPI */}
        <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="档案盒（盒）" value={inv.totals.boxes} accent="text-amber-600" />
          <StatCard label="案卷（卷）" value={inv.totals.volumes} accent="text-sky-600" />
          <StatCard label="档案（件）" value={inv.totals.records} accent="text-sky-600" />
          <StatCard label="原始凭证（份）" value={inv.totals.sourceDocs} accent="text-pink-600" />
          <StatCard label="总页数（页）" value={inv.totals.pages.toLocaleString()} accent="text-violet-600" />
          <StatCard label="存储容量" value={formatCapacity(inv.totals.capacityKB)} accent="text-emerald-600" />
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* 类型分布 */}
          <SectionCard title="档案类型分布（一级对象维度）" icon={<FolderOpen className="w-4 h-4 text-sky-500" />}>
            <div className="flex items-center gap-6">
              <Donut
                segments={inv.byType.map((t, i) => ({ value: t.records, color: CHART_COLORS[i] }))}
                centerValue={inv.totals.records.toLocaleString()}
                centerLabel="总件数"
              />
              <div className="flex-1 space-y-2">
                {inv.byType.map((t, i) => (
                  <div key={t.code} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CHART_COLORS[i] }} />
                    <span className="text-slate-600 flex-1">{t.label}</span>
                    <span className="font-mono text-slate-500">{t.records} 件 / {t.volumes} 卷</span>
                    <span className="font-mono text-sky-600 w-12 text-right">{Math.round((t.records / typeTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
            {/* 明细表 */}
            <div className="mt-4 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                    <th className="px-4 py-3 text-left text-[13px] font-semibold">类型</th>
                    <th className="px-4 py-3 text-right text-[13px] font-semibold">件数</th>
                    <th className="px-4 py-3 text-right text-[13px] font-semibold">卷数</th>
                    <th className="px-4 py-3 text-right text-[13px] font-semibold">页数</th>
                    <th className="px-4 py-3 text-right text-[13px] font-semibold">容量</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.byType.map((t) => (
                    <tr key={t.code} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{t.label}</td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-600">{t.records}</td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-600">{t.volumes}</td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-600">{t.pages.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-600">{formatCapacity(t.capacityKB)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* 年度趋势 */}
          <SectionCard title="会计年度分布（各年度档案总量）" icon={<Database className="w-4 h-4 text-sky-500" />}>
            <ColumnBars
              data={inv.byYear.map((y) => ({ label: `${y.year}年`, value: y.records, sub: `${y.volumes} 卷` }))}
              color="#6366f1"
              height={200}
            />
            <p className="text-[11px] text-slate-400 mt-3">按会计年度统计档案总量与案卷数，可追溯历年增长趋势</p>
          </SectionCard>

          {/* 保管期限 */}
          <SectionCard title="保管期限结构（合规必选维度）" icon={<Hourglass className="w-4 h-4 text-amber-500" />}>
            <div className="space-y-4 pt-1">
              {inv.byRetention.map((r, i) => (
                <BarRow key={r.label} label={`${r.label}保管`} value={r.records} max={inv.totals.records} color={['#f59e0b', '#0ea5e9', '#6366f1'][i]} suffix={` 件 · ${r.pct}%`} />
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-4">依据《会计档案管理办法》（79号令）：定期保管 10 年 / 30 年，另有永久保管</p>
          </SectionCard>

          {/* 载体结构 */}
          <SectionCard title="存储载体结构（电子化进程）" icon={<HardDrive className="w-4 h-4 text-emerald-500" />}>
            <div className="flex items-center gap-6">
              <Donut
                segments={inv.byCarrier.map((c, i) => ({ value: c.records, color: ['#10b981', '#f59e0b', '#94a3b8'][i] }))}
                centerValue={`${Math.round(inv.electronicRatio)}%`}
                centerLabel="原生电子化率"
                size={140}
              />
              <div className="flex-1 space-y-3">
                {inv.byCarrier.map((c, i) => (
                  <div key={c.key} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: ['#10b981', '#f59e0b', '#94a3b8'][i] }} />
                    <span className="text-slate-600 flex-1">{c.label}</span>
                    <span className="font-mono text-slate-500">{c.records} 件</span>
                    <span className="font-mono text-emerald-600 w-12 text-right">{c.pct}%</span>
                  </div>
                ))}
                <p className="text-[11px] text-slate-400 pt-1">2025 年度档案为纸质+数字化副本（mixed），2026 年度为原生电子档案</p>
              </div>
            </div>
          </SectionCard>

          {/* 全宗分布 */}
          <SectionCard title="全宗分布（集团化管控维度）" icon={<Building2 className="w-4 h-4 text-violet-500" />}>
            <div className="space-y-3 pt-1">
              {inv.byFonds.map((f, i) => (
                <BarRow key={f.code} label={`全宗 ${f.code}`} value={f.records} max={Math.max(1, ...inv.byFonds.map((x) => x.records))} color={CHART_COLORS[i]} suffix=" 件" />
              ))}
            </div>
          </SectionCard>

          {/* 部门分布 */}
          <SectionCard title="部门归档分布（组织架构维度）" icon={<Users className="w-4 h-4 text-pink-500" />}>
            <div className="space-y-3 pt-1">
              {inv.byDepartment.slice(0, 6).map((d, i) => (
                <BarRow key={d.dept} label={d.dept} value={d.records} max={Math.max(1, ...inv.byDepartment.map((x) => x.records))} color={CHART_COLORS[i % CHART_COLORS.length]} suffix=" 件" />
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default InventoryStatsPage;

