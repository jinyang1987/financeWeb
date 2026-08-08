/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * VolumeGroupingConfigPage — 组卷盒号配置
 *
 * 依据：
 *   DA/T 39-2008《会计档案案卷格式》
 *   DA/T 13-2022《档号编制规则》
 *   DA/T 42-2022《会计档案整理规范》
 *   DA/T 94-2022《电子会计档案管理规范》
 *
 * 原则：底层规则强制固化、上层配置按需开放、流程逻辑自动校验、全周期可追溯。
 * 盒号为实体档案容器排架管理编码，不属于法定档号核心构成元素，不替代案卷号/件号。
 *
 * 整理流程：先组卷 → 后装盒 → 再编号（系统流程权限强管控，逻辑不可逆）。
 *
 * ★ 配置直接写入 volumeGroupingStore → generateRecommendations 实时读取
 */

import React, { useState, useCallback } from 'react';
import {
  Save, Settings, RotateCcw, Layers, Box, Shield, Lock,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2,
  Ban, BookOpen, Hash, Package, ArrowRight, Cpu, FileText,
  Monitor, FileInput, Briefcase, FileSpreadsheet, FolderArchive, Ruler,
} from 'lucide-react';
import {
  useVolumeGroupingStore,
  DEFAULT_CONFIG,
  DEFAULT_PER_TYPE_RULES,
  PERIOD_OPTIONS,
  CARRIER_MODE_OPTIONS,
  type GroupPeriod,
  type CarrierMode,
  type PerTypeRule,
} from '../../stores/volumeGroupingStore';

// ============================================================
// 合规基础层（只读，自动同步档号模块）
// ============================================================

interface ComplianceBase {
  fondsCode: string;
  categoryCode: string;
  year: string;
  archiveTypeCodes: string[];
  retentionCode: string;
}

const COMPLIANCE_BASE: ComplianceBase = {
  fondsCode: 'Z001',
  categoryCode: 'KU',
  year: '2026',
  archiveTypeCodes: ['01=凭证', '02=账簿', '03=报告', '04=其他'],
  retentionCode: 'D30 / D10 / Y / D5',
};

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

const ARCHIVE_TYPE_CONFIG: { key: string; label: string; icon: React.ReactNode; color: string; defaultPeriod: GroupPeriod; defaultMax: number }[] = [
  { key: '记账凭证', label: '记账凭证', icon: <FileInput className="w-4 h-4 text-sky-500" />, color: 'blue', defaultPeriod: 'month', defaultMax: 50 },
  { key: '会计账簿', label: '会计账簿', icon: <Briefcase className="w-4 h-4 text-amber-500" />, color: 'amber', defaultPeriod: 'year', defaultMax: 200 },
  { key: '财务报告', label: '财务报告', icon: <FileSpreadsheet className="w-4 h-4 text-emerald-500" />, color: 'emerald', defaultPeriod: 'year', defaultMax: 200 },
  { key: '其他会计资料', label: '其他会计资料', icon: <FolderArchive className="w-4 h-4 text-slate-500" />, color: 'slate', defaultPeriod: 'year', defaultMax: 200 },
];

// ============================================================
// 子组件：可折叠区块
// ============================================================

const CollapsibleBlock: React.FC<{
  title: string;
  icon: React.ReactNode;
  defaultExpanded?: boolean;
  badge?: string;
  children: React.ReactNode;
}> = ({ title, icon, defaultExpanded = true, badge, children }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="text-sm font-bold text-slate-800">{title}</span>
          {badge && <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{badge}</span>}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {expanded && <div className="border-t border-slate-100 px-5 py-4">{children}</div>}
    </div>
  );
};

// ============================================================
// 主页面
// ============================================================

const VolumeGroupingConfigPage: React.FC = () => {
  // ★ 从 store 读写配置（替代本地 useState）
  const config = useVolumeGroupingStore((s) => s.config);
  const setConfig = useVolumeGroupingStore((s) => s.setConfig);
  const setPerTypeRule = useVolumeGroupingStore((s) => s.setPerTypeRule);
  const resetConfig = useVolumeGroupingStore((s) => s.resetConfig);

  const [saved, setSaved] = useState(false);

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
    <div className="flex flex-col h-full bg-slate-100">
      {/* ═══════ 顶栏 ═══════ */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <Settings className="w-5 h-5 text-sky-600" />
        <h1 className="text-base font-bold text-slate-800">组卷盒号配置</h1>
        <span className="text-xs text-slate-400">| 组卷→装盒→编号 · DA/T 39-2008</span>
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

      {/* ═══════ 主体 ═══════ */}
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-5">

        {/* ── 法规横幅 ── */}
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
            <div className="text-sm text-sky-900 space-y-1">
              <p className="font-bold">法定依据</p>
              <p className="text-xs leading-relaxed">
                DA/T 39-2008《会计档案案卷格式》· DA/T 13-2022《档号编制规则》· DA/T 42-2022《会计档案整理规范》· DA/T 94-2022《电子会计档案管理规范》
              </p>
              <p className="text-xs text-sky-600 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                盒号为实体档案容器排架管理编码，不属于法定档号核心构成元素
              </p>
            </div>
          </div>
        </div>

        {/* ── 一、合规基础层（只读） ── */}
        <CollapsibleBlock
          title="合规基础层"
          icon={<Shield className="w-4 h-4 text-red-500" />}
          badge="系统强制固化 · 自动同步档号模块"
        >
          <p className="text-xs text-slate-500 mb-3">
            以下维度自动同步档号编制规则，确保盒号分类口径与档案分类体系、档号编制规则完全一致。
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: '全宗号', value: COMPLIANCE_BASE.fondsCode },
              { label: '门类代码', value: COMPLIANCE_BASE.categoryCode },
              { label: '二级类别', value: COMPLIANCE_BASE.archiveTypeCodes.join(' / ') },
              { label: '保管期限', value: COMPLIANCE_BASE.retentionCode },
              { label: '年度', value: COMPLIANCE_BASE.year },
            ].map((item) => (
              <div key={item.label} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                <div className="text-[10px] text-slate-400 mb-0.5">{item.label}</div>
                <div className="text-xs font-bold text-slate-700 font-mono">{item.value}</div>
              </div>
            ))}
          </div>
        </CollapsibleBlock>

        {/* ═══════ ★ 二、载体模式（新增） ═══════ */}
        <CollapsibleBlock
          title="载体模式"
          icon={<Monitor className="w-4 h-4 text-violet-500" />}
          badge="影响组卷策略"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              纯电子档案卷=盒无厚度限制；纸质实体受盒厚度约束，需设置每盒件数上限。
            </p>
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

            {/* 纸质模式下显示每盒上限 */}
            {(config.carrierMode === 'paper' || config.carrierMode === 'mixed') && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-bold text-amber-800">纸质盒容量约束</span>
                </div>
                <div className="flex items-center gap-3">
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
                  <span className="text-xs text-slate-400">（标准凭证盒约50件，账簿盒视厚度而定）</span>
                </div>
              </div>
            )}
          </div>
        </CollapsibleBlock>

        {/* ═══════ ★ 三、按档案类别独立配置（新增·核心） ═══════ */}
        <CollapsibleBlock
          title="按档案类别独立配置"
          icon={<Layers className="w-4 h-4 text-sky-500" />}
          badge="四类独立规则 · 驱动智能组卷"
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-500 mb-1">
              不同档案类别有不同整理周期：凭证按月装订、账簿按年归档、报告按季度/半年/年整理。
              以下配置直接驱动组卷工作台的「智能组卷」和「组卷」操作。
            </p>

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
                      <span className="text-[10px] text-slate-400">（总账/明细账/日记账/辅助账簿各独立一卷，DA/T 42-2022）</span>
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
                      <span className="text-[10px] text-slate-400">（不同周期、不同保管期限严禁合并，DA/T 42-2022）</span>
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
                      <span className="text-[10px] text-slate-400">（银行对账单/纳税申报表/管理清册等按类别+期限独立，DA/T 42-2022）</span>
                    </label>
                  )}

                  {/* 规则预览 */}
                  <p className="text-[11px] text-slate-500 mt-2.5">
                    <Ruler className="w-3.5 h-3.5 inline mr-0.5" />{at.label} →
                    {rule.period === 'month' ? ' 按月度分组，每月一卷' :
                     rule.period === 'quarter' ? ' 按季度分组，每季一卷' :
                     rule.period === 'halfYear' ? ' 按半年分组' : ' 按年度分组，一年一卷'}
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
        </CollapsibleBlock>

        {/* ── 四、全局分组维度 ── */}
        <CollapsibleBlock
          title="全局分组维度"
          icon={<Layers className="w-4 h-4 text-emerald-500" />}
          badge="默认规则 · 可被类别规则覆盖"
        >
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
        </CollapsibleBlock>

        {/* ── 五、盒号规则自定义配置 ── */}
        <CollapsibleBlock
          title="盒号规则自定义配置"
          icon={<Box className="w-4 h-4 text-sky-500" />}
          badge="可配置"
        >
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
                  <p className="text-xs text-slate-500">按需配置盒号编码结构，系统默认「年度-二级类别-3位流水号」</p>
                </button>
                <button
                  type="button"
                  onClick={() => setBoxMode('archive')}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    boxMode === 'archive' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className={`w-4 h-4 ${boxMode === 'archive' ? 'text-amber-600' : 'text-slate-400'}`} />
                    <span className={`text-sm font-bold ${boxMode === 'archive' ? 'text-amber-700' : 'text-slate-600'}`}>档案馆进馆适配</span>
                  </div>
                  <p className="text-xs text-slate-500">按接收方要求配置盒号结构与流水范围，确保移交验收合规</p>
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
        </CollapsibleBlock>

        {/* ── 六、装盒流程与自动校验 ── */}
        <CollapsibleBlock
          title="装盒流程与自动校验"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          badge="三重自动合规校验"
          defaultExpanded={false}
        >
          <div className="flex items-center gap-2 mb-5 text-xs">
            <span className="px-3 py-1.5 bg-sky-100 text-sky-700 rounded-lg font-bold">组卷完成</span>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <span className="px-3 py-1.5 bg-sky-100 text-sky-700 rounded-lg font-bold">装盒操作</span>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg font-bold">生成盒号</span>
            <ArrowRight className="w-4 h-4 text-slate-300" />
            <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-bold">锁定编码</span>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <strong>流程权限强管控：</strong>仅完成组卷、已生成正式档号的案卷或归档件，才可进入装盒操作界面。
              </p>
            </div>
          </div>

          <h3 className="text-sm font-bold text-slate-700 mb-2">三重自动合规校验</h3>
          <div className="space-y-3">
            {[
              { title: '一、分类边界校验', desc: '自动过滤非同一年度、同一二级类别、同一保管期限的档案，禁止跨类混装。' },
              { title: '二、排列顺序校验', desc: '仅支持按档号连续排列的档案装入同一档案盒，打乱顺序将被自动拦截。' },
              { title: '三、容量适配校验', desc: '根据选定档案盒厚度规格自动测算装盒容量，避免超量装订导致档案破损。' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-slate-700">{item.title}</p>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleBlock>

        {/* ── 七、盒号管理规则（折叠） ── */}
        <CollapsibleBlock
          title="盒号管理规则"
          icon={<Shield className="w-4 h-4 text-amber-500" />}
          badge="锁定 · 关联 · 追溯"
          defaultExpanded={false}
        >
          <div className="space-y-3">
            {[
              { color: 'red', icon: <Lock className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />, title: '盒号锁定与变更审批', desc: '盒号一经正式生成即默认锁定，变更需提交专属审批流程，全程留痕。' },
              { color: 'blue', icon: <Hash className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />, title: '盒号与档号双向关联', desc: '单份档案元数据同步存储盒号；档案盒信息展示盒内起止档号与完整明细。' },
              { color: 'sky', icon: <CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />, title: '纸质+电子双套制一致', desc: '纸质盒号自动同步至电子档案，双套档案的盒号、档号双重匹配。' },
              { color: 'emerald', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />, title: '集团多主体分级隔离', desc: '盒号规则支持按组织机构维度分级隔离，各独立核算单元独立流水。' },
              { color: 'violet', icon: <BookOpen className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />, title: '标准化卷盒封面自动生成', desc: '根据盒号与盒内档案信息自动填充法定必填项，支持直接打印输出。' },
              { color: 'red', icon: <Ban className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />, title: '合规红线', desc: '尝试突破法定底线（跨类混装、流水号不隔离、跳号断号）将被自动拦截。' },
            ].map((item, idx) => (
              <div key={idx} className={`flex items-start gap-3 p-3 bg-${item.color}-50 border border-${item.color}-100 rounded-lg`}>
                {item.icon}
                <div>
                  <p className={`text-sm font-bold text-${item.color}-800`}>{item.title}</p>
                  <p className={`text-xs text-${item.color}-700 mt-0.5 leading-relaxed`}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleBlock>

        {/* 页脚 */}
        <div className="text-xs text-slate-400 text-right pb-4 space-y-0.5">
          <p>法定依据：DA/T 39-2008 · DA/T 13-2022 · DA/T 42-2022 · DA/T 94-2022</p>
          <p>先组卷 → 后装盒 → 再编号 · 全周期可追溯 · 配置实时生效</p>
        </div>

      </div>
    </div>
  );
};

export default VolumeGroupingConfigPage;



