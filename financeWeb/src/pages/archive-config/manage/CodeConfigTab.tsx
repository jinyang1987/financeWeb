/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * CodeConfigTab — 档案管理配置 · 档号规则（2026-08-21 并入档案管理配置）
 *
 * 2026-08-29 T11 双链合一改造（缺陷 #15）：原「可自定义配置项」5 张卡片写
 * code-custom.* 配置，后端从不消费（配置页是摆设）；后端真实消费 archive-code-config
 * 的 categoryPrefix/separator/serialDigitsVol/serialDigitsBox 四键却无 UI。
 * 本版改为：单一配置源 = useArchiveCodeConfigStore（persist → ams_config），
 * 表单直接编辑后端消费的四键 + 赋号时机，档号结构总览与实际产物严格一致。
 * 档号结构（T11）：{全宗}-{门类}·{类别}·{年度}-{期限代码}-{案卷号}-{件号}，无盒号段。
 */

import React, { useState } from 'react';
import {
  FileSpreadsheet, Lock, Settings,
  CheckCircle2, Clock, Package, Save,
} from 'lucide-react';
import { useArchiveCodeConfigStore, type ArchiveCodeConfig } from '../../../stores/archiveCodeConfigStore';

// ============================================================
// 参数字段定义（与后端 VolumeService 消费键严格同构）
// ============================================================

interface ParamField {
  key: keyof Omit<ArchiveCodeConfig, 'assignCodeTiming'>;
  name: string;
  description: string;
  kind: 'text' | 'number';
  /** 归档后生效说明 */
  effect: string;
}

const PARAM_FIELDS: ParamField[] = [
  {
    key: 'categoryPrefix',
    name: '门类代码前缀',
    description: '档号第 2 段的门类标识（会计惯例 KJ）。仅建议初始化时设定，归档后修改会造成前后档号门类不一致',
    kind: 'text',
    effect: '确认组卷赋号时生效',
  },
  {
    key: 'separator',
    name: '段分隔符',
    description: '档号段与段之间的分隔字符（默认 -）。段内层级仍固定用 ·',
    kind: 'text',
    effect: '确认组卷赋号时生效',
  },
  {
    key: 'serialDigitsVol',
    name: '案卷号位数',
    description: '案卷号流水数字位数（默认 4，如 0005）；凭证量大的单位建议 4 位',
    kind: 'number',
    effect: '确认组卷赋号时生效',
  },
  {
    key: 'serialDigitsBox',
    name: '盒号位数',
    description: '档案盒盒号流水位数（默认 3，如 003）。盒号由移交归盒时按流水表生成（BOX-年-类-序号），与档号解耦',
    kind: 'number',
    effect: '移交归盒建盒时生效',
  },
];

// ============================================================
// 参数编辑卡片（真配置源：archive-code-config / ams_config）
// ============================================================

const ParamCard: React.FC<{ field: ParamField }> = ({ field }) => {
  const { config, setConfig } = useArchiveCodeConfigStore();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(config[field.key] ?? ''));
  const [saved, setSaved] = useState(false);

  const save = () => {
    const trimmed = value.trim();
    if (field.kind === 'number') {
      const n = parseInt(trimmed, 10);
      if (!Number.isFinite(n) || n < 1 || n > 8) return; // 位数限 1-8，非法不落盘
      setConfig({ [field.key]: n } as Partial<ArchiveCodeConfig>);
    } else {
      if (!trimmed) return; // 空值不落盘
      setConfig({ [field.key]: trimmed } as Partial<ArchiveCodeConfig>);
    }
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-3.5 h-3.5 text-sky-500" />
            <span className="text-sm font-bold text-slate-700">{field.name}</span>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{field.effect}</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{field.description}</p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {editing ? (
            <>
              <input
                type={field.kind === 'number' ? 'number' : 'text'}
                min={field.kind === 'number' ? 1 : undefined}
                max={field.kind === 'number' ? 8 : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="px-2 py-1 text-xs border border-sky-300 rounded bg-white font-mono w-28 focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <button type="button" onClick={save}
                className="px-2.5 py-1 text-xs font-medium text-white bg-sky-600 rounded hover:bg-sky-700">
                确定
              </button>
              <button type="button" onClick={() => { setEditing(false); setValue(String(config[field.key] ?? '')); }}
                className="px-2.5 py-1 text-xs font-medium text-slate-500 bg-slate-100 rounded hover:bg-slate-200">
                取消
              </button>
            </>
          ) : (
            <>
              <span className="text-sm font-mono font-bold text-slate-700 bg-slate-50 px-2.5 py-1 rounded border border-slate-200 min-w-14 text-center">
                {String(config[field.key] ?? '')}
              </span>
              {saved && (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 已保存
                </span>
              )}
              <button type="button" onClick={() => { setValue(String(config[field.key] ?? '')); setEditing(true); }}
                className="px-2 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded hover:bg-sky-100">
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
  { key: 'structure', label: '档号规则定义', badge: '4 项可配置', badgeCls: 'bg-sky-50 text-sky-600' },
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
      {badge && <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{badge}</span>}
    </div>
    <div className="px-5 py-4">{children}</div>
  </div>
);

// ============================================================
// 主页面
// ============================================================

const CodeConfigTab: React.FC = () => {
  const [saved] = useState(false);
  const [activeKey, setActiveKey] = useState('structure');
  const { config } = useArchiveCodeConfigStore();
  const assignCodeTiming = config.assignCodeTiming;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-100">
      {/* ═══ 操作栏（配置即改即存；说明内容移「原理说明」Tab） ═══ */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-white border-b border-slate-200 shrink-0">
        <span className="text-xs text-slate-400">配置项修改后自动持久化至配置中心（ams_config），赋号引擎即配即生效</span>
        <div className="flex-1" />
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-600">已保存 <CheckCircle2 className="w-3.5 h-3.5" /></span>
        )}
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-slate-500 bg-slate-100 rounded-lg">
          <Save className="w-4 h-4" /> 即改即存
        </span>
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
                  <span className={`flex-1 text-sm font-medium truncate ${activeKey === sec.key ? 'text-sky-700' : 'text-slate-600'}`}>
                    {sec.label}
                  </span>
                  {sec.badge && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${sec.badgeCls || 'bg-slate-100 text-slate-500'}`}>
                      {sec.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </aside>

          {/* ══ 右侧内容 ══ */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* ── 档号规则定义 ── */}
            {activeKey === 'structure' && (
              <>
                {/* 档号结构总览（与后端 buildVolumeCode 严格一致，T11 起） */}
                <div className="bg-gradient-to-r from-slate-50 to-sky-50/20 border border-slate-200 rounded-xl p-5">
                  <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-sky-500" />
                    当前档号结构总览
                  </h3>

                  <div className="bg-white border border-sky-100 rounded-lg p-4">
                    <p className="text-xs font-semibold text-sky-600 mb-3"><Package className="w-3.5 h-3.5 inline mr-1" />统一档号结构（按卷管理 · 纸质与电子统一）</p>
                    <div className="flex items-center flex-wrap gap-x-1 gap-y-1.5 font-mono text-sm">
                      <span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700 font-bold" title="全宗号（全宗管理赋值）">{config.separator === '-' ? 'Z001' : 'Z001'}</span>
                      <span className="text-slate-400 font-sans">{config.separator}</span>
                      <span className="px-2 py-1 bg-red-50 border border-red-200 rounded text-red-700 font-bold" title="门类代码前缀（可配置，当前值即生效）">
                        <Lock className="w-2.5 h-2.5 inline mr-0.5" />{config.categoryPrefix}
                      </span>
                      <span className="text-slate-300 font-sans">·</span>
                      <span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700 font-bold" title="二级类别编码：01=凭证 · 02=账簿 · 03=报告 · 04=其他">01</span>
                      <span className="text-slate-300 font-sans">·</span>
                      <span className="px-2 py-1 bg-red-50 border border-red-200 rounded text-red-700 font-bold" title="4位公历年度">
                        <Lock className="w-2.5 h-2.5 inline mr-0.5" />2026
                      </span>
                      <span className="text-slate-400 font-sans">{config.separator}</span>
                      <span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700 font-bold" title="保管期限代码：永久=Y（不补零） · 30年=D30 · 10年=D10">D30</span>
                      <span className="text-slate-400 font-sans">{config.separator}</span>
                      <span className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded text-emerald-700 font-bold" title={`案卷号流水（${config.serialDigitsVol}位）`}>{'0'.repeat(Math.max(1, config.serialDigitsVol - 1)) + '5'}</span>
                      <span className="text-slate-400 font-sans">{config.separator}</span>
                      <span className="px-2 py-1 bg-emerald-50 border border-emerald-200 rounded text-emerald-700 font-bold" title="件号流水（4位）= 卷内件号">0012</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-3 font-mono break-all">
                      完整示例：<span className="font-bold text-slate-700">Z001-{config.categoryPrefix}·01·2026-D30-{String(5).padStart(config.serialDigitsVol, '0')}-0012</span>
                      <span className="text-slate-400">（永久卷示例：Z001-{config.categoryPrefix}·01·2026-Y-{String(5).padStart(config.serialDigitsVol, '0')}，Y 不补零）</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                      档案盒盒号与档号解耦（T11）：盒号由移交归盒时按流水表生成（BOX-年度-类别-{String(1).padStart(config.serialDigitsBox, '0')}），不再嵌入档号 B 段。
                    </p>
                  </div>

                  {/* 图例 */}
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 border border-red-200" /> 刚性固化</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200" /> 可自定义</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200" /> 流水号</span>
                  </div>
                </div>

                {/* 可配置项（真配置源：archive-code-config） */}
                <SectionCard title="档号参数配置" icon={<Settings className="w-4 h-4 text-sky-500" />} badge="与后端赋号引擎同源（archive-code-config）">
                  <div className="space-y-3">
                    {PARAM_FIELDS.map((f) => <ParamCard key={f.key} field={f} />)}
                    <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-800">
                      <strong>配置锁定规则：</strong>所有自定义规则需在本单位档案管理制度中书面固化，保持长期一致。
                      门类前缀建议初始化时一次定死——归档后修改会造成新旧档号门类段不一致。
                    </div>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ── 赋号时机配置 ── */}
            {activeKey === 'timing' && (
              <AssignTimingSection assignCodeTiming={assignCodeTiming} />
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

/** 赋号时机分区（读同一 store，即改即存） */
const AssignTimingSection: React.FC<{ assignCodeTiming: ArchiveCodeConfig['assignCodeTiming'] }> = ({ assignCodeTiming }) => {
  const { setConfig } = useArchiveCodeConfigStore();
  return (
    <SectionCard title="赋号时机配置" icon={<Clock className="w-4 h-4 text-emerald-500" />} badge="组卷确认时的档号分配策略">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3">
          <label
            className={`flex items-start gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
              assignCodeTiming === 'on-confirm' ? 'border-sky-400 bg-sky-50/50' : 'border-slate-200 hover:border-slate-300'
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
              <div className="text-xs text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full inline-block mt-2">
                默认推荐
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
              assignCodeTiming === 'never' ? 'border-sky-400 bg-sky-50/50' : 'border-slate-200 hover:border-slate-300'
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
              <div className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full inline-block mt-2">
                适用于记账凭证类档案
              </div>
            </div>
          </label>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          当前设置: <strong className="text-slate-700">
            {assignCodeTiming === 'on-confirm' ? '组卷时赋号' : '不赋号（会计档案自有用号体系）'}
          </strong>
        </div>
      </div>
    </SectionCard>
  );
};

export default CodeConfigTab;
