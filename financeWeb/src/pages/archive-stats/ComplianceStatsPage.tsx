/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ComplianceStatsPage — 合规统计（监管合规与风险，统计维度4）
 *
 * 满足财政、档案、审计部门监管要求：
 *   期限合规（到期预告/超期未销毁）/ 数据质量（元数据/格式）/
 *   安全合规（四性/逾期/黑名单）/ 审计支撑（审计调阅/导出）
 */

import React from 'react';
import {
  ShieldCheck, Hourglass, FileCheck2, Lock, FileSearch, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { useArchiveStats } from '../../hooks/useArchiveStats';
import { SectionCard, StatCard, BarRow, ProgressRing } from '../../components/stats/Charts';

const ComplianceStatsPage: React.FC = () => {
  const { compliance: cc } = useArchiveStats();

  const riskFree = cc.expiredNotDestroyed === 0 && cc.overdueVolumes === 0 && cc.blacklistedUsers === 0;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* 页头 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-slate-600" />
            <div>
              <h1 className="text-base font-bold text-slate-800">合规统计</h1>
              <p className="text-xs text-slate-400 mt-0.5">监管合规与风险识别 · 期限 / 数据质量 / 安全 / 审计支撑（79号令 + DA/T 94-2022）</p>
            </div>
          </div>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
            riskFree ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {riskFree ? <><CheckCircle2 className="w-3.5 h-3.5" />合规状态正常</> : <><AlertTriangle className="w-3.5 h-3.5" />存在合规风险</>}
          </span>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="元数据完整率" value={`${cc.metadataCompleteRate}%`} sub="DA/T 94 核心字段" accent={cc.metadataCompleteRate === 100 ? 'text-emerald-600' : 'text-amber-600'} />
          <StatCard label="格式合规率" value={`${cc.formatComplianceRate}%`} sub="OFD/PDF/XML 白名单" accent={cc.formatComplianceRate === 100 ? 'text-emerald-600' : 'text-amber-600'} />
          <StatCard label="保管期限标注率" value={`${cc.retentionLabelRate}%`} sub="79号令合规" accent="text-sky-600" />
          <StatCard label="四性检测合格率" value={`${cc.checksPassRate}%`} sub="真实/完整/可用/安全" accent="text-sky-600" />
          <StatCard label="超期未销毁（件）" value={cc.expiredNotDestroyed} sub="保管期满未处置" accent={cc.expiredNotDestroyed > 0 ? 'text-red-600' : 'text-emerald-600'} />
          <StatCard label="逾期未还（卷）" value={cc.overdueVolumes} sub={`黑名单 ${cc.blacklistedUsers} 人`} accent={cc.overdueVolumes > 0 ? 'text-red-600' : 'text-emerald-600'} />
        </div>

        <div className="grid grid-cols-2 gap-5">
          {/* 期限合规 */}
          <SectionCard title="期限合规（保管期满监控）" icon={<Hourglass className="w-4 h-4 text-amber-500" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-xl">
                <span className="text-xs text-slate-600">超期未销毁档案</span>
                <span className={`text-sm font-bold font-mono ${cc.expiredNotDestroyed > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {cc.expiredNotDestroyed} 件
                </span>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 mb-2">未来 5 年到期预告</div>
                <div className="space-y-2">
                  {cc.upcomingExpiry.map((u) => (
                    <div key={u.year} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-500 w-12">{u.year}</span>
                      <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
                        <div
                          className={`h-full rounded-md transition-all duration-500 ${u.count > 0 ? 'bg-amber-400' : 'bg-slate-200'}`}
                          style={{ width: `${Math.min(100, Math.max(u.count * 4, u.count > 0 ? 4 : 0))}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono w-14 text-right ${u.count > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                        {u.count} 件
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                库藏最早形成于 2025 年，10 年期档案 2035 年到期、30 年期 2055 年到期，当前无处置压力；
                到期前系统应自动推送鉴定销毁任务
              </p>
            </div>
          </SectionCard>

          {/* 数据质量 */}
          <SectionCard title="数据质量（DA/T 94 元数据与格式）" icon={<FileCheck2 className="w-4 h-4 text-sky-500" />}>
            <div className="flex items-center justify-around py-1">
              <ProgressRing pct={Math.round(cc.metadataCompleteRate)} label="元数据完整率" color="#0ea5e9" size={110} />
              <ProgressRing pct={Math.round(cc.formatComplianceRate)} label="格式合规率" color="#6366f1" size={110} />
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <div className="text-xs font-medium text-slate-500 mb-2">必填元数据缺失明细</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {cc.missingByField.map((f) => (
                  <div key={f.field} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{f.label}</span>
                    <span className={`font-mono ${f.missing > 0 ? 'text-red-600 font-bold' : 'text-emerald-600'}`}>
                      {f.missing > 0 ? `缺 ${f.missing}` : '完整'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-slate-400">格式分布：</span>
              {cc.formatDistribution.map((f) => (
                <span key={f.format} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full font-mono">
                  {f.format} × {f.count}
                </span>
              ))}
            </div>
          </SectionCard>

          {/* 安全合规 */}
          <SectionCard title="安全合规（访问与权限风险）" icon={<Lock className="w-4 h-4 text-red-500" />}>
            <div className="space-y-2.5">
              {[
                { label: '逾期未还实体档案（卷）', value: cc.overdueVolumes, danger: cc.overdueVolumes > 0 },
                { label: '黑名单熔断用户（人）', value: cc.blacklistedUsers, danger: cc.blacklistedUsers > 0 },
                { label: '四性检测异常档案（件）', value: 0, danger: false },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-xl">
                  <span className="text-xs text-slate-600">{row.label}</span>
                  <span className={`text-sm font-bold font-mono ${row.danger ? 'text-red-600' : 'text-emerald-600'}`}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-3">
              安全策略：借阅全程动态水印（预览/下载/打印）+ 防篡改引擎；越权访问与异常操作实时沉淀至安全审计日志（系统管理 → 安全审计日志）
            </p>
          </SectionCard>

          {/* 审计支撑 */}
          <SectionCard title="审计支撑（内外部审计响应）" icon={<FileSearch className="w-4 h-4 text-violet-500" />}>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                <div className="text-2xl font-bold font-mono text-violet-700">{cc.auditSupport.orders}</div>
                <div className="text-xs text-violet-500 mt-0.5">审计类借阅单（外部审计/税务稽查）</div>
              </div>
              <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                <div className="text-2xl font-bold font-mono text-violet-700">{cc.auditSupport.items}</div>
                <div className="text-xs text-violet-500 mt-0.5">审计调阅档案（件）</div>
              </div>
              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <div className="text-2xl font-bold font-mono text-slate-700">{cc.auditSupport.downloads}</div>
                <div className="text-xs text-slate-500 mt-0.5">带水印下载（次）</div>
              </div>
              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <div className="text-2xl font-bold font-mono text-slate-700">{cc.auditSupport.prints}</div>
                <div className="text-xs text-slate-500 mt-0.5">带水印打印（次）</div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-3">
              审计调阅全部走借阅审批流并留痕：谁借的、看了什么、下载/打印了几次，可支撑等保与审计取证要求
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default ComplianceStatsPage;

