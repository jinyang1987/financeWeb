/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * CodeConfigTab — 档案管理配置 · 档号规则（2026-08-21 并入档案管理配置）
 *
 * 只保留可操作配置：档号结构总览 + 可自定义配置项 + 赋号时机。
 * 刚性规则/标准示例/规范溯源/电子专项/合规红线等只读说教内容，
 * 统一移至「原理说明」Tab（档号体系分区）。
 *
 * 赋号引擎在服务端执行：确认组卷时按本配置取号（ams_code_serial 原子流水），即配即生效。
 */

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet, Lock, Settings,
  CheckCircle2, Clock, Package, Save, History,
} from 'lucide-react';
import { useArchiveCodeConfigStore } from '../../../stores/archiveCodeConfigStore';
import { http } from '../../../services/http';

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
// 导航分区
// ============================================================

const NAV_SECTIONS: { key: string; label: string; badge?: string; badgeCls?: string }[] = [
  { key: 'structure', label: '档号规则定义', badge: '5 项可配置', badgeCls: 'bg-sky-50 text-sky-600' },
  { key: 'timing', label: '赋号时机', badge: '核心', badgeCls: 'bg-emerald-50 text-emerald-600' },
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

const CodeConfigTab: React.FC = () => {
  const [saved, setSaved] = useState(false);
  const [activeKey, setActiveKey] = useState('structure');
  const { config, setConfig } = useArchiveCodeConfigStore();
  const assignCodeTiming = config.assignCodeTiming;

  const handleSaveConfig = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-100">
      {/* ═══ 操作栏（说教内容已移「原理说明」Tab） ═══ */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-white border-b border-slate-200 shrink-0">
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium"
          title="赋号引擎在服务端执行：确认组卷时按本配置取号（ams_code_serial 原子流水），段结构/赋号时机即配即生效">
          服务端赋号引擎实时消费 · 即配即生效
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <History className="w-3 h-3" />
          变更留痕可审计 · 历史档号保持原样
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleSaveConfig}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saved ? (<span className="inline-flex items-center gap-1">已保存 <CheckCircle2 className="w-3.5 h-3.5" /></span>) : '保存配置'}
        </button>
      </div>

      {/* ═══ 主体：左右主从 ═══ */}
      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="max-w-6xl mx-auto flex gap-4 items-start">

          {/* ══ 左侧导航 ══ */}
          <aside className="w-64 shrink-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <nav className="p-2 space-y-0.5">
              {NAV_SECTIONS.map((sec) => (
                <button
                  key={sec.key}
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
              ))}
            </nav>
            <div className="p-3 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed">
              <p>刚性规则、标准示例与规范依据见「原理说明 → 档号体系」。</p>
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

          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeConfigTab;
