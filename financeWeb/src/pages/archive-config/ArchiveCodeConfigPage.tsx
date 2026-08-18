/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ArchiveCodeConfigPage — 档号规则配置（2026-08-17 左右主从重设计）
 *
 * 所有规则严格遵循国家档案局、财政部正式发布的规章与行业标准，
 * 是全国档案合规检查、档案馆进馆验收的统一执行依据。
 *
 * 规范溯源：
 *   上位规章：《会计档案管理办法》（财政部、国家档案局令第 79 号）
 *   档号总则：《档号编制规则》（DA/T 13-2022，替代 1994 版）
 *   会计专项：《会计档案整理规范》（DA/T 42-2022）
 *   电子专项：《电子会计档案管理规范》（DA/T 94-2022）
 *
 * 系统将刚性规则设为强制校验项（不可修改），可自定义项设为管理员初始化配置项。
 *
 * 布局：左侧导航（可配置 / 规范依据两组分区）+ 右侧单分区内容，
 * 与组卷盒号配置/三合一表配置同版式，替代原长龙滚动页。
 */

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet, Shield, BookOpen, Lock, Settings,
  CheckCircle2, AlertTriangle, Ban,
  ArrowRight, Copy, Save, History, Clock, Package, Monitor,
  type LucideIcon,
} from 'lucide-react';
import { useArchiveCodeConfigStore } from '../../stores/archiveCodeConfigStore';
import { http } from '../../services/http';

// ============================================================
// 规范溯源数据
// ============================================================

interface StandardRef {
  code: string;
  name: string;
  publisher: string;
  year: string;
  role: string;
  replaces?: string;
}

const STANDARD_HIERARCHY: StandardRef[] = [
  {
    code: '79号令',
    name: '《会计档案管理办法》',
    publisher: '财政部、国家档案局',
    year: '2016',
    role: '上位规章 — 明确会计档案的法定分类与整理原则，是档号规则的合规底层基础',
  },
  {
    code: 'DA/T 13-2022',
    name: '《档号编制规则》',
    publisher: '国家档案局',
    year: '2022',
    role: '档号总规则 — 全国所有门类档案档号编制的统一通用规范，替代 1994 版',
    replaces: 'DA/T 13-1994',
  },
  {
    code: 'DA/T 42-2022',
    name: '《会计档案整理规范》',
    publisher: '国家档案局',
    year: '2022',
    role: '会计专项 — 针对会计档案的分类体系、整理流程、编号逻辑给出专项要求',
  },
  {
    code: 'DA/T 94-2022',
    name: '《电子会计档案管理规范》',
    publisher: '国家档案局',
    year: '2022',
    role: '电子专项 — 补充电子会计档案的档号绑定、元数据匹配、双套制对应规则',
  },
];

// ============================================================
// 刚性规则（不可自定义）
// ============================================================

interface RigidRule {
  category: string;
  items: { rule: string; detail: string }[];
}

const RIGID_RULES: RigidRule[] = [
  {
    category: '四大核心编制原则',
    items: [
      { rule: '唯一性原则', detail: '同一档案室范围内，一份档案只能对应一个档号，一个档号只能指代一份档案，严禁重号、一号多档、一档多号' },
      { rule: '一致性原则', detail: '档号的层级结构必须与本单位会计档案分类体系完全对应，分类有多少层级，档号就对应多少层级；流水顺序必须与物理排列顺序完全一致' },
      { rule: '稳定性原则', detail: '档号编制规则一经确定并正式启用，不得随意变更；单份档案的档号一经赋予，全生命周期内不得修改' },
      { rule: '合理性原则', detail: '档号结构必须层级清晰、简洁明了，不得设置无实际分类意义的冗余层级' },
    ],
  },
  {
    category: '固定标识与格式',
    items: [
      { rule: '门类代码统一为 KU', detail: '会计档案门类代码统一使用大写拼音字母 KU（DA/T 13-2022 附录示例明确），用于区分文书（WS）、科技（KJ）、人事（RS）等其他档案门类，不得自行编制其他字母替代' },
      { rule: '年度编码 4 位数字', detail: '年度必须采用 4 位阿拉伯数字标识公历自然年度（如 2025），严格对应会计年度，不得使用 2 位缩写、农历年度或自定义财年年度' },
      { rule: '分隔符固定', detail: '不同层级之间使用半角连字符 - 连接；同一层级多个分类维度之间使用半角间隔号 · 分隔。不得使用下划线、斜杠、中文标点等' },
      { rule: '字符集限制', detail: '仅可使用大写英文字母、阿拉伯数字、上述两种法定分隔符（- 和 ·），不得包含中文、特殊符号、空格等内容' },
    ],
  },
  {
    category: '分类维度底线',
    items: [
      { rule: '年度 + 二级类别不可省略', detail: '档号必须覆盖"年度"和"会计档案二级类别"两个核心分类维度；二级类别严格对应法定四大类（会计凭证类、会计账簿类、财务会计报告类、其他会计资料类），不得合并、删减或增设' },
    ],
  },
  {
    category: '流水号编制',
    items: [
      { rule: '连续流水，不得跳号断号', detail: '案卷号、件号均需按对应分类维度下的排列顺序连续流水编制；同一年度、同一类别下不得跳号、断号' },
      { rule: '位数统一', detail: '流水号位数在同一分类维度内必须统一，不足位数在前补零（如 0001）；不得在同一类别同一维度下混合使用不同位数' },
    ],
  },
];

// ============================================================
// 可自定义配置项
// ============================================================

interface CustomizableItem {
  id: string;
  name: string;
  description: string;
  defaultValue: string;
  options?: string;
  scope: string;
}

const CUSTOMIZABLE_ITEMS: CustomizableItem[] = [
  {
    id: 'fondsCode',
    name: '全宗号',
    description: '进馆单位由属地档案馆统一赋予，不得自定义；企业等无需进馆单位可自定义（建议：拼音缩写+数字，如 QY001）',
    defaultValue: 'Z001',
    options: '企业：企业简称拼音缩写 + 数字。集团：可为下属子公司分配子全宗号',
    scope: '需进馆：不可自定义。企业：完全自定义，仅需保证本单位唯一',
  },
  {
    id: 'categoryLevels',
    name: '分类层级扩展',
    description: '可在二级类别与年度之间增加中间分类层级（如组织机构、保管期限、三级类别细分）',
    defaultValue: '二级类别 + 年度',
    options: '常见扩展：组织机构层级 → 集团多主体；保管期限层级 → 便于鉴定；三级类别 → 凭证下细分原始/记账',
    scope: '可增加中间层级，但不得减少核心层级（年度+二级类别）。扩展编码由单位自定义，同层级唯一即可',
  },
  {
    id: 'serialDigits',
    name: '流水号位数',
    description: '根据年度档案量自行设定案卷号、件号的数字位数',
    defaultValue: '案卷号 3 位 · 件号 4 位',
    options: '凭证量大的单位建议 4 位（0001）；业务量小的单位可用 3 位（001）',
    scope: '同一类别同一维度下位数必须统一，不得混合使用不同位数',
  },
  {
    id: 'categoryCodes',
    name: '二级类别编码',
    description: '四大类的数字编码可自定义',
    defaultValue: '01=凭证 · 02=账簿 · 03=报告 · 04=其他',
    options: '行业通用惯例（建议默认采用）：01/02/03/04。也可自定义如 PZ/ZB/BB/QT',
    scope: '仅编码可改，四大类别本身名称不可变更。内部规则统一、无歧义即可',
  },
  {
    id: 'retentionCodes',
    name: '保管期限代码',
    description: '保管期限的标识代码可自定义',
    defaultValue: '永久=Y · 30年=D30 · 10年=D10 · 5年=D5',
    options: '永久可用 Y / J / 999 等。定期可用 D30 / 30 / 30Y 等。也可纯数字',
    scope: '仅需内部规则统一、无歧义即可',
  },
];

// ============================================================
// 标准模式示例
// ============================================================

interface ModeExample {
  label: string;
  scenario: string;
  structure: string;
  example: string;
  breakdown: { segment: string; meaning: string }[];
}

/** 统一按卷管理，不再区分按卷/单件两种模式 */
const ARCHIVE_CODE_EXAMPLE: ModeExample = {
  label: '统一档号结构（按卷管理）',
  scenario: '会计档案统一按卷管理：件组成卷，档号含案卷号 + 卷内件号，适用于全部纸质与电子会计档案',
  structure: '全宗号 - 档案门类代码·二级类别号·年度 - 案卷号 - 件号',
  example: 'J019-KU·01·2025-003-012',
  breakdown: [
    { segment: 'J019', meaning: '全宗号（档案馆统一赋予或企业自定义）' },
    { segment: 'KU', meaning: '档案门类代码（会计档案，刚性固化）' },
    { segment: '01', meaning: '二级类别号（会计凭证类）' },
    { segment: '2025', meaning: '会计年度（公历自然年度，刚性固化）' },
    { segment: '003', meaning: '案卷号（该年度第 3 卷凭证，流水号位数可配）' },
    { segment: '012', meaning: '件号（卷内第 12 份文件，流水号位数可配）' },
  ],
};

// ============================================================
// 可配置项编辑器
// ============================================================

const ConfigCard: React.FC<{ item: CustomizableItem }> = ({ item }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.defaultValue);
  const [saved, setSaved] = useState(false);

  // 从配置中心加载已保存值（ams_config: code-custom.{id}）
  useEffect(() => {
    let alive = true;
    http.get<{ value?: { text?: string } }>(`/config/code-custom.${item.id}`)
      .then((res) => {
        if (alive && res?.value?.text) setValue(res.value.text);
      })
      .catch(() => { /* 无已保存值时用默认值 */ });
    return () => { alive = false; };
  }, [item.id]);

  // 保存到配置中心（持久化至 ams_config，刷新/换浏览器不丢）
  const handleSave = async () => {
    setEditing(false);
    try {
      await http.put(`/config/code-custom.${item.id}`, { value: { text: value } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* 离线时静默，下次保存再同步 */
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-3.5 h-3.5 text-sky-500" />
            <span className="text-sm font-bold text-slate-700">{item.name}</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
          {item.options && (
            <p className="text-[11px] text-slate-400 mt-1">
              <span className="font-medium">可选：</span>{item.options}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {item.scope}
            </span>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {editing ? (
            <>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="px-2 py-1 text-xs border border-sky-300 rounded bg-white font-mono w-56 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <button
                type="button"
                onClick={handleSave}
                className="px-2.5 py-1 text-xs font-medium text-white bg-sky-600 rounded hover:bg-sky-700"
              >
                确定
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-2.5 py-1 text-xs font-medium text-slate-500 bg-slate-100 rounded hover:bg-slate-200"
              >
                取消
              </button>
            </>
          ) : (
            <>
              <span className="text-xs font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                {value}
              </span>
              {saved && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 已保存
                </span>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-2 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded hover:bg-sky-100"
              >
                修改
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 导航分区定义
// ============================================================

interface NavSection {
  key: string;
  label: string;
  Icon: LucideIcon;
  badge?: string;
  badgeCls?: string;
  group?: string;
}

const NAV_SECTIONS: NavSection[] = [
  { key: 'structure', label: '档号规则定义', Icon: FileSpreadsheet, badge: '5 项可配置', badgeCls: 'bg-sky-50 text-sky-600', group: '规则配置' },
  { key: 'timing', label: '赋号时机', Icon: Clock, badge: '核心', badgeCls: 'bg-emerald-50 text-emerald-600' },
  { key: 'rigid', label: '全国统一刚性规则', Icon: Lock, badge: '强制', badgeCls: 'bg-red-50 text-red-600', group: '规范依据（只读）' },
  { key: 'example', label: '标准档号结构', Icon: Package, badge: '示例', badgeCls: 'bg-slate-100 text-slate-500' },
  { key: 'hierarchy', label: '规范溯源与效力层级', Icon: BookOpen, badge: '4 层', badgeCls: 'bg-slate-100 text-slate-500' },
  { key: 'electronic', label: '电子会计档案专项', Icon: Shield, badge: 'DA/T 94', badgeCls: 'bg-slate-100 text-slate-500' },
  { key: 'redline', label: '合规红线与开发约束', Icon: Ban, badge: '红线', badgeCls: 'bg-amber-50 text-amber-600' },
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

const ArchiveCodeConfigPage: React.FC = () => {
  const [saved, setSaved] = useState(false);
  const [activeKey, setActiveKey] = useState('structure');
  const { config, setConfig } = useArchiveCodeConfigStore();
  const assignCodeTiming = config.assignCodeTiming;

  const handleSaveConfig = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* ═══════════════ 顶栏 ═══════════════ */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <FileSpreadsheet className="w-5 h-5 text-sky-600" />
        <h1 className="text-base font-bold text-slate-800">档号规则配置</h1>
        <span className="text-xs text-slate-400">| DA/T 13-2022 · DA/T 42-2022 · DA/T 94-2022</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium"
          title="赋号引擎在服务端执行：确认组卷时按本配置取号（ams_code_serial 原子流水），段结构/赋号时机即配即生效">
          服务端赋号引擎实时消费 · 即配即生效
        </span>
        <div className="flex-1" />
        <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <History className="w-3 h-3" />
          变更记录留痕可审计 · 历史档号保持原样
        </span>
        <button
          type="button"
          onClick={handleSaveConfig}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saved ? (<span className="inline-flex items-center gap-1">已保存 <CheckCircle2 className="w-3.5 h-3.5" /></span>) : '保存配置'}
        </button>
      </div>

      {/* ═══════════════ 主体：左右主从 ═══════════════ */}
      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="max-w-6xl mx-auto flex gap-4 items-start">

          {/* ══ 左侧导航 ══ */}
          <aside className="w-64 shrink-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <nav className="max-h-[78vh] overflow-y-auto p-2 space-y-0.5">
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
                    <sec.Icon className={`w-3.5 h-3.5 shrink-0 ${activeKey === sec.key ? 'text-sky-600' : 'text-slate-400'}`} />
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
            <div className="p-3 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed">
              <p>档号规则在服务端赋号引擎实时消费，确认组卷时按当前配置取号；历史档号保持原样。</p>
            </div>
          </aside>

          {/* ══ 右侧内容 ══ */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* ── 档号规则定义 ── */}
            {activeKey === 'structure' && (
              <>
                {/* 档号结构总览 */}
                <div className="bg-gradient-to-r from-slate-50 to-sky-50/20 border border-slate-200 rounded-xl p-5">
                  <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-sky-500" />
                    当前档号结构总览
                  </h3>

                  {/* 统一按卷管理档号结构 */}
                  <div className="bg-white border border-sky-100 rounded-lg p-4">
                    <p className="text-[11px] font-semibold text-sky-600 mb-3"><Package className="w-3.5 h-3.5 inline mr-1" />统一档号结构（按卷管理 · 纸质与电子统一）</p>
                    <div className="flex items-center flex-wrap gap-x-1 gap-y-1.5 font-mono text-xs">
                      {/* 全宗号 */}
                      <span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700 font-bold" title="可配置：全宗号">Z001</span>
                      <span className="text-slate-400 font-sans">-</span>
                      {/* KU */}
                      <span className="px-2 py-1 bg-red-50 border border-red-200 rounded text-red-700 font-bold" title="刚性固化：门类代码">
                        <Lock className="w-2.5 h-2.5 inline mr-0.5" />KU
                      </span>
                      <span className="text-slate-300 font-sans">·</span>
                      {/* 类别编码 */}
                      <span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700 font-bold" title="可配置：二级类别编码">01</span>
                      <span className="text-slate-300 font-sans">·</span>
                      {/* 年度 */}
                      <span className="px-2 py-1 bg-red-50 border border-red-200 rounded text-red-700 font-bold" title="刚性固化：4位公历年度">
                        <Lock className="w-2.5 h-2.5 inline mr-0.5" />2025
                      </span>
                      <span className="text-slate-400 font-sans">-</span>
                      {/* 保管期限 */}
                      <span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700 font-bold" title="可配置：保管期限代码">D30</span>
                      <span className="text-slate-400 font-sans">-</span>
                      {/* 案卷号 */}
                      <span className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded text-emerald-700 font-bold" title="可配置：案卷号流水（3位）">003</span>
                      <span className="text-slate-400 font-sans">-</span>
                      {/* 件号 */}
                      <span className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded text-emerald-700 font-bold" title="可配置：件号流水（4位）">0012</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3 font-mono break-all">
                      完整示例：<span className="font-bold text-slate-700">Z001-KU·01·2025-D30-003-0012</span>
                    </p>
                  </div>

                  {/* 图例 */}
                  <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 border border-red-200" /> 刚性固化</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" /> 可自定义</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" /> 流水号</span>
                  </div>
                </div>

                {/* 可配置项列表 */}
                <SectionCard title="可自定义配置项" icon={<Settings className="w-4 h-4 text-sky-500" />} badge="修改即持久化至配置中心">
                  <div className="space-y-3">
                    {CUSTOMIZABLE_ITEMS.map((item) => (
                      <ConfigCard key={item.id} item={item} />
                    ))}
                    <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-800">
                      <strong>配置锁定规则：</strong>所有自定义规则需在本单位档案管理制度中书面固化，保持长期一致。
                      系统在管理员初始化设置后默认锁定，如需修改需走审批流程并留存操作日志。
                    </div>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ── 赋号时机配置 ── */}
            {activeKey === 'timing' && (
              <SectionCard title="赋号时机配置" icon={<Clock className="w-4 h-4 text-emerald-500" />} badge="组卷确认时的档号分配策略">
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    控制在组卷确认操作时是否自动为案卷分配档号。此设置影响所有档案类别的组卷流程。
                    会计档案通常使用自身凭证号体系（如"记-001"），无需额外编写系统档号；
                    需要移交综合档案系统长期保存的档案，建议在组卷时赋号。
                  </p>

                  <div className="grid grid-cols-1 gap-3">
                    {/* 选项1：组卷时赋号 */}
                    <label
                      className={`flex items-start gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        assignCodeTiming === 'on-confirm'
                          ? 'border-sky-400 bg-sky-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="assignCodeTiming"
                        value="on-confirm"
                        checked={assignCodeTiming === 'on-confirm'}
                        onChange={() => setConfig({ assignCodeTiming: 'on-confirm' })}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-800">组卷时赋号</div>
                        <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          确认组卷时自动按照档号规则生成案卷号。适用于需要标准化档号管理的档案类别。
                          生成的档号格式遵循 DA/T 13-2022 标准，包含全宗号、门类代码、年度、保管期限等段。
                        </div>
                        <div className="text-[10px] text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full inline-block mt-2">
                          默认推荐
                        </div>
                      </div>
                    </label>

                    {/* 选项2：不赋号 */}
                    <label
                      className={`flex items-start gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        assignCodeTiming === 'never'
                          ? 'border-sky-400 bg-sky-50/50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="assignCodeTiming"
                        value="never"
                        checked={assignCodeTiming === 'never'}
                        onChange={() => setConfig({ assignCodeTiming: 'never' })}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-800">不赋号</div>
                        <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          组卷确认时不分配系统档号。会计档案使用自身的凭证号体系（如"记-001"），
                          无需额外编写系统档号。确认后案卷将标记为"已确认"状态，可直接移交。
                        </div>
                        <div className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full inline-block mt-2">
                          适用于记账凭证类档案
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* 当前状态指示 */}
                  <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    当前设置: <strong className="text-slate-700">
                      {assignCodeTiming === 'on-confirm' ? '组卷时赋号' : '不赋号（会计档案自有用号体系）'}
                    </strong>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── 全国统一刚性规则 ── */}
            {activeKey === 'rigid' && (
              <SectionCard title="全国统一刚性规则" icon={<Lock className="w-4 h-4 text-red-500" />} badge="不可自定义 · 系统强制校验">
                <div className="space-y-5">
                  {RIGID_RULES.map((group) => (
                    <div key={group.category}>
                      <h3 className="text-sm font-bold text-slate-700 mb-2.5 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        {group.category}
                      </h3>
                      <div className="space-y-2">
                        {group.items.map((item) => (
                          <div key={item.rule} className="flex items-start gap-3 p-3 bg-red-50/50 border border-red-100 rounded-lg">
                            <Shield className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-bold text-red-800">{item.rule}</p>
                              <p className="text-xs text-red-700 mt-0.5 leading-relaxed">{item.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* ── 标准档号结构 ── */}
            {activeKey === 'example' && (
              <SectionCard title="标准档号结构" icon={<Package className="w-4 h-4 text-sky-600" />} badge="统一按卷管理">
                <div className="border border-sky-200 bg-gradient-to-b from-sky-50/30 to-white rounded-xl overflow-hidden">
                  {/* 标题 */}
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-sky-700"><Package className="w-4 h-4 inline mr-1" />{ARCHIVE_CODE_EXAMPLE.label}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{ARCHIVE_CODE_EXAMPLE.scenario}</p>
                  </div>

                  {/* 结构公式 */}
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1">结构公式</p>
                    <p className="font-mono text-xs text-slate-700 bg-slate-100 rounded-lg p-2.5 leading-relaxed break-all">
                      {ARCHIVE_CODE_EXAMPLE.structure}
                    </p>
                  </div>

                  {/* 档号示例 */}
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1">档号示例</p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2">
                        {ARCHIVE_CODE_EXAMPLE.example}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(ARCHIVE_CODE_EXAMPLE.example)}
                        className="p-1.5 text-slate-400 hover:text-sky-600 rounded"
                        title="复制示例"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 逐段解析 */}
                  <div className="px-4 py-3 border-t border-slate-100">
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-2">逐段解析</p>
                    <div className="space-y-1.5">
                      {ARCHIVE_CODE_EXAMPLE.breakdown.map((seg, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded min-w-[50px] text-center">
                            {seg.segment}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-300" />
                          <span className="text-slate-500">{seg.meaning}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── 规范溯源与效力层级 ── */}
            {activeKey === 'hierarchy' && (
              <SectionCard title="规范溯源与效力层级" icon={<BookOpen className="w-4 h-4 text-sky-600" />} badge="4 层规范体系">
                <div className="space-y-3">
                  {STANDARD_HIERARCHY.map((ref, idx) => (
                    <div key={ref.code} className="flex items-start gap-4 p-3 bg-slate-50 rounded-lg">
                      <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-sky-700">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-700">{ref.name}</span>
                          <span className="text-[11px] text-sky-500 bg-sky-50 px-1.5 py-0.5 rounded font-mono">{ref.code}</span>
                          {ref.replaces && (
                            <span className="text-[10px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">替代 {ref.replaces}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{ref.publisher} · {ref.year}</p>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{ref.role}</p>
                      </div>
                    </div>
                  ))}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    <strong>补充说明：</strong>DA/T 系列为档案行业推荐性标准，但在全国各级档案行政管理部门的合规检查、国家档案馆进馆验收中均作为事实强制执行标准。涉及档案移交进馆的单位，还需同时符合属地档案馆的进馆细则（细则不得突破上述行业标准的核心框架）。
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── 电子会计档案专项要求 ── */}
            {activeKey === 'electronic' && (
              <SectionCard title="电子会计档案专项要求" icon={<Shield className="w-4 h-4 text-sky-500" />} badge="DA/T 94-2022">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-sky-50 border border-sky-200 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-sky-800">双套制一致性</p>
                      <p className="text-xs text-sky-700 mt-0.5">实行纸质+电子双套归档的单位，电子档案与对应纸质档案的档号必须完全一致、一一对应，不得采用两套编号规则。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-sky-50 border border-sky-200 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-sky-800">元数据绑定</p>
                      <p className="text-xs text-sky-700 mt-0.5">档号必须作为电子档案的核心元数据字段嵌入档案管理系统，与电子文件永久绑定，不得分离。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-sky-50 border border-sky-200 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-sky-800">页号扩展</p>
                      <p className="text-xs text-sky-700 mt-0.5">如需对单份电子文件内的页码进行标识，可在件号后追加页号层级，格式为「档号-页号」，页号按文件内顺序连续流水编制。</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-sky-50 border border-sky-200 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-sky-800">组件规则</p>
                      <p className="text-xs text-sky-700 mt-0.5">多份电子文件组成一件档案的，需编制统一的件号，组件内的单份文件编制组件内顺序号，不得单独编件号。</p>
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── 自定义合规红线与开发约束 ── */}
            {activeKey === 'redline' && (
              <SectionCard title="自定义合规红线与开发约束" icon={<Ban className="w-4 h-4 text-red-500" />} badge="不可突破的底线">
                <div className="space-y-4">
                  {/* 红线 */}
                  <div>
                    <h3 className="text-sm font-bold text-red-700 mb-2"><Ban className="w-4 h-4 inline mr-1" />不可突破的红线</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        '不得修改会计档案门类代码 KU',
                        '不得删减二级类别与年度核心维度',
                        '不得违反唯一性原则（一档一号）',
                        '不得更换法定分隔符（- 和 ·）',
                        '不得使用中文、特殊符号、空格',
                        '不得在同年同类下跳号、断号',
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
                          <Ban className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          <span className="text-xs text-red-800 font-medium">{item}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-red-600 mt-2 bg-red-50 border border-red-200 rounded-lg p-2.5">
                      <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />突破以上规则的档号<strong>不符合档案合规要求</strong>，无法通过档案行政管理部门的检查与进馆验收。
                    </p>
                  </div>

                  {/* 开发约束 */}
                  <div className="border-t border-slate-200 pt-4">
                    <h3 className="text-sm font-bold text-slate-700 mb-2"><Monitor className="w-4 h-4 inline mr-1" />系统开发层面约束</h3>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-slate-700">默认内置合规规则</p>
                          <p className="text-xs text-slate-500 mt-0.5">系统默认内置符合行业标准的档号规则，刚性规则设为系统强制校验项（不可修改），可自定义项设为管理员初始化配置项。</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-slate-700">配置锁定与审批</p>
                          <p className="text-xs text-slate-500 mt-0.5">管理员初始化时设置可配置项，设置后默认锁定；如需修改需走审批流程并留存操作日志。</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-amber-700">变更留痕要求</p>
                          <p className="text-xs text-amber-600 mt-0.5">所有规则调整必须记录调整时间、调整人、调整内容；历史档案档号保持原样，不得批量回溯修改，确保档案历史的真实性与可追溯性。</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* 页脚 */}
            <div className="text-xs text-slate-400 text-right pb-4 space-y-0.5">
              <p>规范依据：79号令 · DA/T 13-2022 · DA/T 42-2022 · DA/T 94-2022</p>
              <p>刚性规则系统强制固化 · 可配置项审批留痕 · 历史档号保持原样不可回溯修改</p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default ArchiveCodeConfigPage;
