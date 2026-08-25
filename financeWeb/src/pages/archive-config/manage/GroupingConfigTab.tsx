/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * GroupingConfigTab — 档案管理配置 · 组卷盒号（2026-08-21 并入档案管理配置）
 *
 * 只保留可操作配置：载体模式 / 四类组卷规则（驱动智能组卷）/ 全局分组维度 / 盒号编码。
 * 法定依据、整理流程、合规基础层、装盒校验、盒号管理规则等只读说教内容，
 * 统一移至「原理说明」Tab（整理流程 / 盒号与装盒分区）。
 *
 * ★ 配置直接写入 volumeGroupingStore → generateRecommendations 实时读取
 */

import React, { useState, useCallback } from 'react';
import {
  Save, RotateCcw, Layers, Box,
  CheckCircle2, Hash, Package, Cpu,
  Monitor, FileInput, Briefcase, FileSpreadsheet, FolderArchive, Ruler,
} from 'lucide-react';
import {
  useVolumeGroupingStore,
  DEFAULT_PER_TYPE_RULES,
  PERIOD_OPTIONS,
  CARRIER_MODE_OPTIONS,
  BOX_CAPACITY_MODE_OPTIONS,
  BOX_THICKNESS_PRESETS,
  calcItemsPerBox,
  type GroupPeriod,
  type PerTypeRule,
  type VolumeGroupingConfig,
} from '../../../stores/volumeGroupingStore';

// ============================================================
// 盒号编码结构选项
// ============================================================

interface BoxCodeOption {
  id: string;
  label: string;
  structure: string;
  example: string;
  desc: string;
}

const BOX_CODE_OPTIONS: BoxCodeOption[] = [
  {
    id: 'year-type-serial',
    label: '年度-二级类别-流水号',
    structure: '年度 - 二级类别编码 - 流水号',
    example: '2026-01-001',
    desc: '行业通用结构，按年度+类别隔离流水，推荐默认采用',
  },
  {
    id: 'fonds-serial',
    label: '全宗内分类大流水',
    structure: '全宗号 - 二级类别编码 - 流水号',
    example: 'Z001-01-0001',
    desc: '全宗范围内连续流水，适合档案量较小的单位',
  },
  {
    id: 'year-org-type-serial',
    label: '年度-组织机构-二级类别-流水号',
    structure: '年度 - 组织机构编码 - 二级类别编码 - 流水号',
    example: '2026-CW-01-001',
    desc: '集团多核算主体适用，各机构独立流水',
  },
];

// ============================================================
// 四大档案类别定义
// ============================================================

const ARCHIVE_TYPE_CONFIG: { key: string; label: string; icon: React.ReactNode; color: string; defaultMax: number }[] = [
  { key: '记账凭证', label: '记账凭证', icon: <FileInput className="w-4 h-4 text-sky-500" />, color: 'blue', defaultMax: 50 },
  { key: '会计账簿', label: '会计账簿', icon: <Briefcase className="w-4 h-4 text-amber-500" />, color: 'amber', defaultMax: 200 },
  { key: '财务报告', label: '财务报告', icon: <FileSpreadsheet className="w-4 h-4 text-emerald-500" />, color: 'emerald', defaultMax: 200 },
  { key: '其他会计资料', label: '其他会计资料', icon: <FolderArchive className="w-4 h-4 text-slate-500" />, color: 'slate', defaultMax: 200 },
];

// ============================================================
// 导航分区
// ============================================================

const NAV_SECTIONS: { key: string; label: string; badge?: string; badgeCls?: string; group?: string }[] = [
  { key: 'carrier', label: '载体模式', badge: '可配置', badgeCls: 'bg-violet-50 text-violet-600', group: '组卷规则' },
  { key: 'perType', label: '按档案类别独立配置', badge: '核心', badgeCls: 'bg-sky-50 text-sky-600' },
  { key: 'global', label: '全局分组维度', badge: '可配置', badgeCls: 'bg-emerald-50 text-emerald-600' },
  { key: 'boxCode', label: '盒号规则自定义', badge: '可配置', badgeCls: 'bg-sky-50 text-sky-600', group: '盒号规则' },
];

/** 分区卡片外壳 */
const SectionCard: React.FC<{ title: string; icon: React.ReactNode; badge?: string; children: React.ReactNode }> = ({
  title, icon, badge, children,
}) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
      {icon}
      <span className="text-sm font-bold text-slate-800">{title}</span>
      {badge && <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{badge}</span>}
    </div>
    <div className="px-5 py-4">{children}</div>
  </div>
);

// ============================================================
// 主页面
// ============================================================

const GroupingConfigTab: React.FC = () => {
  // ★ 从 store 读写配置（替代本地 useState）
  const config = useVolumeGroupingStore((s) => s.config);
  const setConfig = useVolumeGroupingStore((s) => s.setConfig);
  const setPerTypeRule = useVolumeGroupingStore((s) => s.setPerTypeRule);
  const resetConfig = useVolumeGroupingStore((s) => s.resetConfig);

  const [saved, setSaved] = useState(false);
  const [activeKey, setActiveKey] = useState('carrier');

  // 盒号模式、编码结构、流水号位数仍为本地 UI 状态（暂不与 store 同步）
  const [boxMode, setBoxMode] = useState<'self' | 'archive'>('self');
  const [boxCodeStructure, setBoxCodeStructure] = useState('year-type-serial');
  const [serialDigits, setSerialDigits] = useState(3);
  const [archiveRule, setArchiveRule] = useState('');

  // ── 全局分组维度 ──
  const toggleGlobalRule = useCallback((id: string) => {
    const key = id as keyof Pick<typeof config, 'groupByYear' | 'groupByArchiveType' | 'groupByRetention' | 'groupByDepartment'>;
    setConfig({ [key]: !config[key] });
  }, [config, setConfig]);

  const globalRules = [
    { id: 'groupByYear' as const, name: '按年度分组', desc: '相同年度的记录归入同一案卷' },
    { id: 'groupByArchiveType' as const, name: '按档案类别分组', desc: '相同类别归入同一案卷' },
    { id: 'groupByRetention' as const, name: '按保管期限分组', desc: '相同保管期限归入同一案卷' },
    { id: 'groupByDepartment' as const, name: '按部门分组', desc: '按部门归集（预留）' },
  ];

  // ── 保存提示 ──
  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // ── 恢复默认 ──
  const handleReset = () => {
    resetConfig();
    setBoxMode('self');
    setBoxCodeStructure('year-type-serial');
    setSerialDigits(3);
    setArchiveRule('');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-100">
      {/* ═══ 操作栏（说教内容已移「原理说明」Tab） ═══ */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-white border-b border-slate-200 shrink-0">
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium"
          title="本页配置实时写入组卷引擎，驱动组卷工作台「智能组卷」推荐与「组卷」操作">
          配置实时驱动智能组卷
        </span>
        <div className="flex-1" />
        <button type="button" onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
          <RotateCcw className="w-4 h-4" />恢复默认
        </button>
        <button type="button" onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors">
          <Save className="w-4 h-4" />{saved ? '已保存' : '保存配置'}
        </button>
      </div>

      {/* ═══ 主体：左右主从 ═══ */}
      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="max-w-6xl mx-auto flex gap-4 items-start">
          {/* ══ 左侧导航 ══ */}
          <aside className="w-64 shrink-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <nav className="p-2 space-y-0.5">
              {NAV_SECTIONS.map((sec) => (
                <React.Fragment key={sec.key}>
                  {sec.group && (
                    <div className="px-2 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{sec.group}</div>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveKey(sec.key)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                      activeKey === sec.key ? 'bg-sky-50 border border-sky-200' : 'border border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <span className={`flex-1 text-xs font-medium truncate ${activeKey === sec.key ? 'text-sky-700' : 'text-slate-600'}`}>
                      {sec.label}
                    </span>
                    {sec.badge && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${sec.badgeCls || 'bg-slate-100 text-slate-500'}`}>
                        {sec.badge}
                      </span>
                    )}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          </aside>

          {/* ══ 右侧内容 ══ */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* ═══ 载体模式 ═══ */}
            {activeKey === 'carrier' && (
              <SectionCard title="载体模式" icon={<Monitor className="w-4 h-4 text-violet-500" />} badge="影响组卷策略">
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {CARRIER_MODE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setConfig({ carrierMode: opt.value })}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          config.carrierMode === opt.value
                            ? 'border-violet-500 bg-violet-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {opt.value === 'electronic' && <Cpu className="w-4 h-4 text-violet-600" />}
                          {opt.value === 'paper' && <Package className="w-4 h-4 text-amber-600" />}
                          {opt.value === 'mixed' && <Layers className="w-4 h-4 text-teal-600" />}
                          <span className="text-sm font-bold text-slate-700">{opt.label}</span>
                        </div>
                        <p className="text-xs text-slate-500">{opt.desc}</p>
                      </button>
                    ))}
                  </div>

                  {/* 纸质模式下显示每盒上限（档案盒厚度 → 装盒件数，2026-08-25） */}
                  {(config.carrierMode === 'paper' || config.carrierMode === 'mixed') && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-bold text-amber-800">纸质盒容量约束（一盒装多少件）</span>
                      </div>

                      {/* 容量模式 */}
                      <div className="grid grid-cols-2 gap-2">
                        {BOX_CAPACITY_MODE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              const next: Partial<VolumeGroupingConfig> = { boxCapacityMode: opt.value };
                              if (opt.value === 'auto') {
                                next.itemsPerBox = calcItemsPerBox(config.boxThicknessMm, config.perItemThicknessMm);
                              }
                              setConfig(next);
                            }}
                            className={`p-3 rounded-lg border-2 text-left transition-all ${
                              config.boxCapacityMode === opt.value
                                ? 'border-amber-500 bg-white'
                                : 'border-amber-200/60 hover:border-amber-300 bg-white/60'
                            }`}
                          >
                            <div className="text-xs font-bold text-slate-700">{opt.label}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                          </button>
                        ))}
                      </div>

                      {config.boxCapacityMode === 'auto' ? (
                        <div className="space-y-2.5 bg-white/70 border border-amber-200 rounded-lg p-3">
                          {/* 档案盒厚度 */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-slate-600 w-28 shrink-0">档案盒厚度</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {BOX_THICKNESS_PRESETS.map((p) => (
                                <button
                                  key={p.mm}
                                  type="button"
                                  onClick={() => setConfig({
                                    boxThicknessMm: p.mm,
                                    itemsPerBox: calcItemsPerBox(p.mm, config.perItemThicknessMm),
                                  })}
                                  className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors cursor-pointer ${
                                    config.boxThicknessMm === p.mm
                                      ? 'bg-amber-600 text-white border-amber-600 font-medium'
                                      : 'bg-white text-slate-600 border-slate-300 hover:border-amber-400'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                              <span className="inline-flex items-center gap-1 ml-1">
                                <input
                                  type="number" min={5} max={300}
                                  value={config.boxThicknessMm}
                                  onChange={(e) => {
                                    const mm = Math.max(5, Math.min(300, parseInt(e.target.value) || 30));
                                    setConfig({ boxThicknessMm: mm, itemsPerBox: calcItemsPerBox(mm, config.perItemThicknessMm) });
                                  }}
                                  className="w-20 px-2 py-1 text-xs border border-amber-300 rounded-lg text-center bg-white"
                                />
                                <span className="text-xs text-slate-500">mm（自定义）</span>
                              </span>
                            </div>
                          </div>
                          {/* 单件平均厚度 */}
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-slate-600 w-28 shrink-0">单件平均厚度</span>
                            <input
                              type="number" min={0.5} max={50} step={0.5}
                              value={config.perItemThicknessMm}
                              onChange={(e) => {
                                const mm = Math.max(0.5, Math.min(50, parseFloat(e.target.value) || 3));
                                setConfig({ perItemThicknessMm: mm, itemsPerBox: calcItemsPerBox(config.boxThicknessMm, mm) });
                              }}
                              className="w-20 px-2 py-1 text-xs border border-amber-300 rounded-lg text-center bg-white"
                            />
                            <span className="text-xs text-slate-500">mm/件（记账凭证+所附原始凭证的纸张厚度，A4 纸约 0.1mm/页）</span>
                          </div>
                          {/* 测算结果 */}
                          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            测算：{config.boxThicknessMm}mm ÷ {config.perItemThicknessMm}mm/件 ≈{' '}
                            <strong className="text-sm">{config.itemsPerBox}</strong> 件/盒
                            <span className="text-amber-600 ml-2">（装盒达到上限后自动封盒、另开新盒）</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 bg-white/70 border border-amber-200 rounded-lg p-3">
                          <span className="text-sm text-slate-600">每盒最多</span>
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={config.itemsPerBox}
                            onChange={(e) => setConfig({ itemsPerBox: Math.max(1, Math.min(500, parseInt(e.target.value) || 50)) })}
                            className="w-24 px-3 py-1.5 text-sm border border-amber-300 rounded-lg text-center bg-white"
                          />
                          <span className="text-sm text-slate-600">件</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

            {/* ═══ 按档案类别独立配置（核心） ═══ */}
            {activeKey === 'perType' && (
              <SectionCard title="按档案类别独立配置" icon={<Layers className="w-4 h-4 text-sky-500" />} badge="四类独立规则 · 驱动智能组卷">
                <div className="space-y-3">
                  {ARCHIVE_TYPE_CONFIG.map((at) => {
                    const rule: PerTypeRule = config.perTypeRules[at.key] || DEFAULT_PER_TYPE_RULES['其他会计资料'];
                    const borderColor = at.color === 'blue' ? 'border-sky-200' :
                      at.color === 'amber' ? 'border-amber-200' :
                      at.color === 'emerald' ? 'border-emerald-200' : 'border-slate-200';
                    const bgColor = at.color === 'blue' ? 'bg-sky-50' :
                      at.color === 'amber' ? 'bg-amber-50' :
                      at.color === 'emerald' ? 'bg-emerald-50' : 'bg-slate-50';

                    return (
                      <div key={at.key} className={`border ${borderColor} rounded-xl p-4 ${bgColor}`}>
                        <div className="flex items-center gap-2.5 mb-3">
                          {at.icon}
                          <span className="text-sm font-bold text-slate-800">{at.label}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          {/* 分组周期 */}
                          <div>
                            <label className="text-xs font-medium text-slate-600 mb-1.5 block">分组周期</label>
                            <select
                              value={rule.period}
                              onChange={(e) => setPerTypeRule(at.key, { period: e.target.value as GroupPeriod })}
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                            >
                              {PERIOD_OPTIONS.map((po) => (
                                <option key={po.value} value={po.value}>{po.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* 每卷上限 */}
                          <div>
                            <label className="text-xs font-medium text-slate-600 mb-1.5 block">每卷件数上限</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                max={500}
                                value={rule.maxItemsPerVolume}
                                onChange={(e) => setPerTypeRule(at.key, { maxItemsPerVolume: Math.max(1, Math.min(500, parseInt(e.target.value) || at.defaultMax)) })}
                                className="w-28 px-3 py-2 text-sm border border-slate-300 rounded-lg text-center bg-white"
                              />
                              <span className="text-xs text-slate-500">件/卷</span>
                            </div>
                          </div>
                        </div>

                        {/* ★ 子类型分离选项（按业务规则差异显示不同控件） */}
                        {/* 凭证：按收/付/转子类型分段归集（2026-08-21 新增，机关事业场景） */}
                        {at.key === '记账凭证' && (
                          <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rule.separateByVoucherCategory ?? false}
                              onChange={(e) => setPerTypeRule(at.key, { separateByVoucherCategory: e.target.checked })}
                              className="rounded border-slate-300 text-sky-600"
                            />
                            <span className="text-xs text-slate-600">按凭证子类型分段（收款/付款/转账分段归集）</span>
                          </label>
                        )}
                        {/* 账簿：按子类型独立组卷 */}
                        {at.key === '会计账簿' && (
                          <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rule.separateByBookType ?? true}
                              onChange={(e) => setPerTypeRule(at.key, { separateByBookType: e.target.checked })}
                              className="rounded border-slate-300 text-sky-600"
                            />
                            <span className="text-xs text-slate-600">按账簿子类型独立组卷</span>
                          </label>
                        )}
                        {/* 报告：年度报告与中期报告分开 */}
                        {(at.key === '财务报告' || at.key === '财务报表') && (
                          <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rule.separateAnnualFromInterim ?? true}
                              onChange={(e) => setPerTypeRule(at.key, { separateAnnualFromInterim: e.target.checked })}
                              className="rounded border-slate-300 text-sky-600"
                            />
                            <span className="text-xs text-slate-600">年度报告(永久)与中期报告(10年)分开组卷</span>
                          </label>
                        )}
                        {/* 其他：按子类别分别组卷 */}
                        {at.key === '其他会计资料' && (
                          <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rule.separateBySubCategory ?? true}
                              onChange={(e) => setPerTypeRule(at.key, { separateBySubCategory: e.target.checked })}
                              className="rounded border-slate-300 text-sky-600"
                            />
                            <span className="text-xs text-slate-600">按资料子类别分别组卷</span>
                          </label>
                        )}

                        {/* 规则预览 */}
                        <p className="text-[11px] text-slate-500 mt-2.5">
                          <Ruler className="w-3.5 h-3.5 inline mr-0.5" />{at.label} →
                          {rule.period === 'month' ? ' 按月度分组，每月一卷' :
                           rule.period === 'quarter' ? ' 按季度分组，每季一卷' :
                           rule.period === 'halfYear' ? ' 按半年分组' : ' 按年度分组，一年一卷'}
                          {rule.separateByVoucherCategory && ' · 收/付/转分段'}
                          {rule.separateByBookType && ' · 按账簿子类型独立'}
                          {rule.separateAnnualFromInterim && ' · 年度/中期分离'}
                          {rule.separateBySubCategory && ' · 按子类别独立'}
                          · 每卷≤{rule.maxItemsPerVolume}件
                          {(config.carrierMode === 'paper' || config.carrierMode === 'mixed') &&
                            ` · 纸质每盒≤${config.itemsPerBox}件`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {/* ═══ 全局分组维度 ═══ */}
            {activeKey === 'global' && (
              <SectionCard title="全局分组维度" icon={<Layers className="w-4 h-4 text-emerald-500" />} badge="默认规则 · 可被类别规则覆盖">
                <div className="space-y-2">
                  {globalRules.map((rule) => (
                    <label
                      key={rule.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        config[rule.id] ? 'border-sky-200 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={config[rule.id]}
                        onChange={() => toggleGlobalRule(rule.id)}
                        className="mt-0.5 rounded border-slate-300 text-sky-600"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-700">{rule.name}</span>
                        <p className="text-xs text-slate-500 mt-0.5">{rule.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* ═══ 盒号规则自定义配置 ═══ */}
            {activeKey === 'boxCode' && (
              <SectionCard title="盒号规则自定义配置" icon={<Box className="w-4 h-4 text-sky-500" />} badge="可配置">
                <div className="space-y-5">
                  {/* 管理模式 */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2">管理模式</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setBoxMode('self')}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          boxMode === 'self' ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Box className={`w-4 h-4 ${boxMode === 'self' ? 'text-sky-600' : 'text-slate-400'}`} />
                          <span className={`text-sm font-bold ${boxMode === 'self' ? 'text-sky-700' : 'text-slate-600'}`}>企业自主管理</span>
                        </div>
                        <p className="text-xs text-slate-500">默认「年度-二级类别-3位流水号」</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBoxMode('archive')}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          boxMode === 'archive' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle2 className={`w-4 h-4 ${boxMode === 'archive' ? 'text-amber-600' : 'text-slate-400'}`} />
                          <span className={`text-sm font-bold ${boxMode === 'archive' ? 'text-amber-700' : 'text-slate-600'}`}>档案馆进馆适配</span>
                        </div>
                        <p className="text-xs text-slate-500">按接收方要求配置盒号结构与流水范围</p>
                      </button>
                    </div>
                    {boxMode === 'archive' && (
                      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs font-semibold text-amber-800 mb-1">进馆盒号细则</p>
                        <textarea
                          value={archiveRule}
                          onChange={e => setArchiveRule(e.target.value)}
                          placeholder="录入属地档案馆的进馆盒号细则要求..."
                          className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white resize-none h-20 focus:outline-none focus:ring-2 focus:ring-amber-200"
                        />
                      </div>
                    )}
                  </div>

                  {/* 编码结构 */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2">盒号编码结构</h3>
                    <div className="space-y-2">
                      {BOX_CODE_OPTIONS.map((opt) => (
                        <label
                          key={opt.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            boxCodeStructure === opt.id ? 'border-sky-200 bg-sky-50' : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="boxCodeStructure"
                            checked={boxCodeStructure === opt.id}
                            onChange={() => setBoxCodeStructure(opt.id)}
                            className="mt-0.5 text-sky-600"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-slate-700">{opt.label}</span>
                              <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{opt.structure}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                            <p className="text-xs text-sky-600 font-mono mt-1">示例：{opt.example}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 流水号位数 */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2">流水号位数</h3>
                    <div className="flex items-center gap-3">
                      <select
                        value={serialDigits}
                        onChange={e => setSerialDigits(parseInt(e.target.value))}
                        className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        {[3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>{n} 位</option>
                        ))}
                      </select>
                      <span className="text-xs text-slate-400">（默认 3 位，范围 3~6 位）</span>
                    </div>
                  </div>

                  {/* 盒号预览 */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                    <Hash className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-slate-500">当前规则预览：</span>
                    <span className="font-mono text-sm font-bold text-slate-700">
                      2026-01-{'0'.repeat(serialDigits - 1)}1
                    </span>
                  </div>
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupingConfigTab;
