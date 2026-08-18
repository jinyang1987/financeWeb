/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * WatermarkConfigPage — 水印策略配置（档案配置 → 报告配置 → 水印配置）
 *
 * 依据《水印需求.md》提供水印策略的可视化配置，管理员动态调整无需发版：
 *   策略总览 — 全局开关 / 三大触发场景（预览·下载·打印）/ 预设模板
 *   内容变量 — 姓名+工号 / 时间戳 / IP / 警示文案 / 文档状态（需求第3节）
 *   样式布局 — 倾斜平铺 / 颜色 / 透明度 / 字号 / 密度（需求第4节）
 *   安全豁免 — 防篡改 / 盲水印 / 防截屏 / 角色豁免 / 下载烧录（需求第5·6节）
 *
 * 右侧实时预览面板直接挂载 WatermarkLayer，所见即所得。
 * 配置项全为前端 mock（persist localStorage），对接后端后从 API 加载/保存。
 */

import React, { useMemo, useState } from 'react';
import {
  Droplets, Eye, Download, Printer, Shield, Type, Palette,
  Save, RotateCcw, ChevronDown, X, Lock, ScanEye, UserX,
  LayoutGrid, Square, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import {
  useWatermarkStore,
  buildWatermarkLines,
  WATERMARK_PRESETS,
  EXEMPTABLE_ROLES,
  BURN_FORMAT_OPTIONS,
  WARNING_TEXT_PRESETS,
  WATERMARK_COLOR_PRESETS,
} from '../../stores/watermarkStore';
import { WatermarkLayer } from '../../components/watermark';

type TabKey = 'overview' | 'content' | 'style' | 'security';

// ─── 小组件（与四性检测配置页同款风格） ──────────────────────

/** Toggle 开关 */
const Toggle: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    onClick={onChange}
    disabled={disabled}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
      disabled ? 'opacity-40 cursor-not-allowed' : ''
    } ${checked ? 'bg-sky-600' : 'bg-slate-300'}`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
      }`}
    />
  </button>
);

/** 配置行容器 */
const ConfigRow: React.FC<{ label: string; desc?: string; children: React.ReactNode }> = ({ label, desc, children }) => (
  <div className="flex items-center justify-between py-3 px-4 hover:bg-slate-50/50 rounded-lg transition-colors">
    <div className="flex-1 mr-4">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {desc && <span className="text-xs text-slate-400 ml-2">{desc}</span>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

/** 分组标题 */
const SectionTitle: React.FC<{ title: string; desc?: string }> = ({ title, desc }) => (
  <div className="px-4 pt-4 pb-2">
    <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
    {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
  </div>
);

/** 下拉选择 */
const Select: React.FC<{ value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }> = ({
  value, options, onChange,
}) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="appearance-none bg-white border border-slate-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
  </div>
);

/** 滑块（带数值显示与建议区间标注） */
const SliderRow: React.FC<{
  value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void; hint?: string; disabled?: boolean;
}> = ({ value, min, max, step = 1, unit = '', onChange, hint, disabled }) => (
  <div className={`flex items-center gap-3 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-40 accent-sky-600 cursor-pointer"
    />
    <span className="text-sm font-semibold text-slate-700 tabular-nums w-16 text-right">
      {value}{unit}
    </span>
    {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
  </div>
);

/** 可选 chips（单选/多选） */
const Chip: React.FC<{ label: string; selected: boolean; onClick: () => void; tone?: 'sky' | 'slate' }> = ({
  label, selected, onClick, tone = 'sky',
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2.5 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
      selected
        ? tone === 'sky'
          ? 'bg-sky-50 text-sky-700 border-sky-300 font-medium'
          : 'bg-slate-700 text-white border-slate-700 font-medium'
        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
    }`}
  >
    {label}
  </button>
);

// ─── 实时预览面板 ──────────────────────────────────────────

/** 预览用的示例身份（需求第3节示例：张三(004521)） */
const PREVIEW_CONTEXT = { userName: '张三', userId: '004521', ip: '192.168.1.100' };

const LivePreview: React.FC = () => {
  const config = useWatermarkStore((s) => s.config);

  // 时间戳每秒走动，演示动态变量效果
  const [now, setNow] = useState(() => new Date());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const lines = useMemo(
    () => buildWatermarkLines(config, { ...PREVIEW_CONTEXT, docStatus: '已作废', now }),
    [config, now],
  );

  return (
    <div className="flex flex-col h-full">
      {/* 预览头部 */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ScanEye className="w-4 h-4 text-sky-600" />
          <span className="text-sm font-semibold text-slate-700">实时预览</span>
        </div>
        <span className="text-[11px] text-slate-400">示例身份：{PREVIEW_CONTEXT.userName}({PREVIEW_CONTEXT.userId})</span>
      </div>

      {/* 模拟凭证文档 + 水印 */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-100/70">
        <div className="relative bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mx-auto max-w-[380px]">
          {/* 模拟记账凭证 */}
          <div className="p-5">
            <div className="text-center border-b-2 border-slate-700 pb-2 mb-3">
              <h4 className="text-base font-bold text-slate-800 tracking-[0.5em] pl-2">记 账 凭 证</h4>
              <p className="text-[10px] text-slate-400 mt-1 tracking-normal">2026年7月18日 · 记字第 12 号 · 附件 3 张</p>
            </div>
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-300 px-1.5 py-1 font-semibold text-slate-600">摘要</th>
                  <th className="border border-slate-300 px-1.5 py-1 font-semibold text-slate-600">会计科目</th>
                  <th className="border border-slate-300 px-1.5 py-1 font-semibold text-slate-600 text-right">借方金额</th>
                  <th className="border border-slate-300 px-1.5 py-1 font-semibold text-slate-600 text-right">贷方金额</th>
                </tr>
              </thead>
              <tbody className="text-slate-500">
                <tr>
                  <td className="border border-slate-300 px-1.5 py-1">报销差旅费</td>
                  <td className="border border-slate-300 px-1.5 py-1">管理费用-差旅费</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right font-mono">8,500.00</td>
                  <td className="border border-slate-300 px-1.5 py-1" />
                </tr>
                <tr>
                  <td className="border border-slate-300 px-1.5 py-1">报销差旅费</td>
                  <td className="border border-slate-300 px-1.5 py-1">银行存款</td>
                  <td className="border border-slate-300 px-1.5 py-1" />
                  <td className="border border-slate-300 px-1.5 py-1 text-right font-mono">8,500.00</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-1.5 py-1">采购办公用品</td>
                  <td className="border border-slate-300 px-1.5 py-1">管理费用-办公费</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right font-mono">4,000.00</td>
                  <td className="border border-slate-300 px-1.5 py-1" />
                </tr>
                <tr className="bg-slate-50/60 font-semibold text-slate-600">
                  <td className="border border-slate-300 px-1.5 py-1 text-center" colSpan={2}>合 计</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right font-mono">¥12,500.00</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right font-mono">¥8,500.00</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-between mt-3 text-[9px] text-slate-400">
              <span>会计主管：李敏</span>
              <span>记账：王芳</span>
              <span>出纳：赵强</span>
              <span>制单：张三</span>
            </div>
            {/* 模拟印章 */}
            <div className="absolute bottom-8 right-6 w-16 h-16 rounded-full border-[3px] border-red-400/60 flex items-center justify-center rotate-[-15deg]">
              <span className="text-[8px] text-red-500/70 font-bold text-center leading-tight">财务专用章</span>
            </div>
          </div>

          {/* 水印层：直接使用全局配置实时渲染 */}
          {config.enabled ? (
            <WatermarkLayer
              lines={lines}
              style={config.style}
              zIndex={10}
            />
          ) : (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
              <span className="text-xs text-slate-400 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
                水印已全局停用
              </span>
            </div>
          )}
        </div>

        {/* 水印文本内容 */}
        <div className="mt-4 mx-auto max-w-[380px]">
          <p className="text-[11px] font-medium text-slate-500 mb-1.5">水印文本（动态变量实时绑定）</p>
          <div className="bg-slate-800 rounded-lg px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-200">
            {lines.map((line, i) => (
              <p key={i} className="truncate">{line}</p>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${config.scenes.preview ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              <Eye className="w-3 h-3" />预览
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${config.scenes.download ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              <Download className="w-3 h-3" />下载
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${config.scenes.print ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              <Printer className="w-3 h-3" />打印
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${config.security.antiTamper ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-400'}`}>
              <Shield className="w-3 h-3" />防篡改
            </span>
            {config.security.blindWatermark && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                <Lock className="w-3 h-3" />盲水印
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── 主页面 ──────────────────────────────────────────────

const WatermarkConfigPage: React.FC = () => {
  const config = useWatermarkStore((s) => s.config);
  const {
    setEnabled, updateScenes, updateContent, updateStyle,
    updateExemptions, updateSecurity, updateDownload,
    applyPreset, resetToDefault,
  } = useWatermarkStore();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [selectedPreset, setSelectedPreset] = useState('standard');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // persist 中间件已自动持久化，此处仅做反馈
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    resetToDefault();
    setSelectedPreset('standard');
  };

  const handleApplyPreset = (id: string) => {
    setSelectedPreset(id);
    applyPreset(id);
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: '策略总览', icon: <Droplets className="w-4 h-4" /> },
    { key: 'content', label: '内容与变量', icon: <Type className="w-4 h-4" /> },
    { key: 'style', label: '样式与布局', icon: <Palette className="w-4 h-4" /> },
    { key: 'security', label: '安全与豁免', icon: <Shield className="w-4 h-4" /> },
  ];

  // 内容变量启用计数（总览摘要用）
  const enabledVarsCount = [
    config.content.showUserName, config.content.showUserId, config.content.showTimestamp,
    config.content.showIp, !!config.content.warningText, config.content.showDocStatus,
    !!config.content.customText,
  ].filter(Boolean).length;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden animate-in fade-in duration-200">
      {/* ═══ 页面标题 ═══ */}
      <div className="px-6 pt-6 pb-2 shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <Droplets className="w-5 h-5 text-sky-600" />
          <h2 className="text-lg font-bold text-slate-800">水印配置</h2>
          {saved && (
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full animate-in fade-in">
              配置已保存
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-1">
          安全溯源 · 警示防泄露 · 防篡改 — 档案预览 / 下载 / 打印全链路动态水印策略
        </p>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
          <span>策略状态：{config.enabled ? '已启用' : '已停用'}</span>
          <span>·</span>
          <span>规则版本 v1.0.0</span>
        </div>
      </div>

      {/* ═══ Tab 切换 + 操作按钮 ═══ */}
      <div className="px-6 mt-4 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            恢复默认
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-sky-600 rounded-lg hover:bg-sky-700 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            保存配置
          </button>
        </div>
      </div>

      {/* ═══ 内容区：左配置 + 右预览 ═══ */}
      <div className="flex-1 flex min-h-0 mt-4">
        {/* 左侧：配置区 */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="bg-white rounded-xl border border-slate-200">

            {/* ==================== 策略总览 ==================== */}
            {activeTab === 'overview' && (
              <div className="p-5">
                {/* 全局开关 */}
                <div
                  className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                    config.enabled ? 'border-sky-300 bg-sky-50/50' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${config.enabled ? 'bg-sky-600 text-white' : 'bg-slate-300 text-slate-500'}`}>
                      <Droplets className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">全局启用水印策略</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        停用后，预览 / 下载 / 打印三个场景均不再注入任何水印
                      </p>
                    </div>
                  </div>
                  <Toggle checked={config.enabled} onChange={() => setEnabled(!config.enabled)} />
                </div>

                {/* 三大触发场景 */}
                <h3 className="text-sm font-semibold text-slate-700 mt-6 mb-1">三大触发场景</h3>
                <p className="text-xs text-slate-400 mb-3">在以下关键节点强制注入水印（需求第2节）</p>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { key: 'preview' as const, icon: Eye, title: '在线预览', desc: '前端 Canvas 渲染水印覆盖文档图层，MutationObserver 防篡改' },
                    { key: 'download' as const, icon: Download, title: '下载 / 导出', desc: '后端将水印烧录进文件本体后返回文件流，绝不依赖前端' },
                    { key: 'print' as const, icon: Printer, title: '打印文档', desc: '强制调用带水印的预览流打印，屏蔽浏览器原生无水印打印' },
                  ]).map(({ key, icon: Icon, title, desc }) => (
                    <div
                      key={key}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        config.scenes[key] && config.enabled
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : 'border-slate-200 bg-white opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className={`p-2 rounded-lg ${config.scenes[key] && config.enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <Toggle
                          checked={config.scenes[key]}
                          onChange={() => updateScenes({ [key]: !config.scenes[key] })}
                          disabled={!config.enabled}
                        />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>

                {/* 预设模板 */}
                <h3 className="text-sm font-semibold text-slate-700 mt-6 mb-3">预设策略模板</h3>
                <div className="grid grid-cols-3 gap-3">
                  {WATERMARK_PRESETS.map((tpl) => (
                    <div
                      key={tpl.id}
                      onClick={() => handleApplyPreset(tpl.id)}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedPreset === tpl.id
                          ? 'border-sky-400 bg-sky-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selectedPreset === tpl.id ? 'border-sky-500' : 'border-slate-300'
                        }`}>
                          {selectedPreset === tpl.id && <div className="w-2 h-2 rounded-full bg-sky-500" />}
                        </div>
                        <span className="text-sm font-semibold text-slate-700">{tpl.name}</span>
                      </div>
                      <p className="text-xs text-slate-500 ml-6 leading-relaxed">{tpl.desc}</p>
                    </div>
                  ))}
                </div>

                {/* 当前策略摘要 */}
                <h3 className="text-sm font-semibold text-slate-700 mt-6 mb-3">当前策略摘要</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">内容变量</span>
                    <span className="text-slate-700">{enabledVarsCount} 项启用</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">布局样式</span>
                    <span className="text-slate-700">
                      {config.style.layout === 'tile' ? '全屏平铺' : '居中单个'} · {config.style.rotation}° · 透明度 {Math.round(config.style.opacity * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">安全机制</span>
                    <span className="text-slate-700">
                      {[
                        config.security.antiTamper && '防篡改',
                        config.security.blindWatermark && '盲水印',
                        config.security.preventScreenshot && '防截屏',
                      ].filter(Boolean).join(' + ') || '未启用'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">下载烧录</span>
                    <span className="text-slate-700">
                      {config.download.supportedFormats.join('/')}
                      {config.download.failSecure && ' · 安全失败'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">角色豁免</span>
                    <span className="text-slate-700">
                      {config.exemptions.enabled
                        ? config.exemptions.roles.length > 0
                          ? `${config.exemptions.roles.length} 个角色豁免`
                          : '已启用但未选角色'
                        : '未启用'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 内容与变量 ==================== */}
            {activeTab === 'content' && (
              <div className="pb-4">
                <SectionTitle
                  title="动态变量"
                  desc="水印内容与当前操作上下文动态绑定（需求第3节），泄露时可精准定位泄露人、时间与 IP"
                />
                <div className="divide-y divide-slate-50">
                  <ConfigRow label="操作人姓名" desc="如：张三">
                    <Toggle
                      checked={config.content.showUserName}
                      onChange={() => updateContent({ showUserName: !config.content.showUserName })}
                    />
                  </ConfigRow>
                  <ConfigRow label="工号 / 账号" desc="如：(004521)，与姓名拼接为 张三(004521)">
                    <Toggle
                      checked={config.content.showUserId}
                      onChange={() => updateContent({ showUserId: !config.content.showUserId })}
                    />
                  </ConfigRow>
                  <ConfigRow label="时间戳" desc="操作发生的精确时间">
                    <div className="flex items-center gap-2">
                      {config.content.showTimestamp && (
                        <Select
                          value={config.content.timestampFormat}
                          options={[
                            { value: 'datetime', label: '精确到秒' },
                            { value: 'date', label: '精确到天' },
                          ]}
                          onChange={(v) => updateContent({ timestampFormat: v as 'datetime' | 'date' })}
                        />
                      )}
                      <Toggle
                        checked={config.content.showTimestamp}
                        onChange={() => updateContent({ showTimestamp: !config.content.showTimestamp })}
                      />
                    </div>
                  </ConfigRow>
                  <ConfigRow label="终端 IP 地址" desc="如：IP: 192.168.1.100（由后端下发）">
                    <Toggle
                      checked={config.content.showIp}
                      onChange={() => updateContent({ showIp: !config.content.showIp })}
                    />
                  </ConfigRow>
                  <ConfigRow label="文档状态标注" desc="档案已作废 / 归档中时追加【已作废】等字样">
                    <Toggle
                      checked={config.content.showDocStatus}
                      onChange={() => updateContent({ showDocStatus: !config.content.showDocStatus })}
                    />
                  </ConfigRow>
                </div>

                <SectionTitle title="警示文案" desc="醒目的视觉警示，提醒查阅者文件机密性（需求第3节）" />
                <div className="px-4 pb-2">
                  <input
                    type="text"
                    value={config.content.warningText}
                    onChange={(e) => updateContent({ warningText: e.target.value })}
                    placeholder="留空则不显示警示文案"
                    maxLength={30}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {WARNING_TEXT_PRESETS.map((text) => (
                      <Chip
                        key={text}
                        label={text}
                        selected={config.content.warningText === text}
                        onClick={() => updateContent({ warningText: text })}
                      />
                    ))}
                    {config.content.warningText && (
                      <button
                        type="button"
                        onClick={() => updateContent({ warningText: '' })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />清除
                      </button>
                    )}
                  </div>
                </div>

                <SectionTitle title="自定义附加文字" desc="追加在水印末尾的一行自定义文本（如单位名称、项目代号）" />
                <div className="px-4 pb-2">
                  <input
                    type="text"
                    value={config.content.customText}
                    onChange={(e) => updateContent({ customText: e.target.value })}
                    placeholder="留空则不显示，如：华北集团总部有限公司"
                    maxLength={40}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                  />
                </div>

                {/* 变量说明表 */}
                <SectionTitle title="变量说明" desc="后端对接时的占位符约定" />
                <div className="px-4 pb-2">
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                          <th className="px-4 py-3 text-left text-[13px] font-semibold">变量</th>
                          <th className="px-4 py-3 text-left text-[13px] font-semibold">示例</th>
                          <th className="px-4 py-3 text-left text-[13px] font-semibold">来源</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ['{userName}', '张三', '登录会话'],
                          ['{userId}', '004521', '人员管理'],
                          ['{timestamp}', '2026-07-18 10:30:15', '服务器时间'],
                          ['{ip}', 'IP: 192.168.1.100', '请求上下文'],
                          ['{docStatus}', '【已作废】', '档案状态字段'],
                        ].map(([v, ex, src]) => (
                          <tr key={v} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-[13px] text-sky-700">{v}</td>
                            <td className="px-4 py-3 text-[13px] text-slate-600">{ex}</td>
                            <td className="px-4 py-3 text-[13px] text-slate-600">{src}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 样式与布局 ==================== */}
            {activeTab === 'style' && (
              <div className="pb-4">
                <SectionTitle title="布局模式" desc="全屏倾斜平铺可确保截图任意局部均含完整溯源信息（需求第4节）" />
                <div className="grid grid-cols-2 gap-3 px-4">
                  {([
                    { key: 'tile' as const, icon: LayoutGrid, title: '全屏倾斜平铺', desc: '水印按密度铺满整个页面，任意局部截图均可溯源（推荐）' },
                    { key: 'center' as const, icon: Square, title: '居中单个', desc: '页面中心单个水印，视觉干扰最小' },
                  ]).map(({ key, icon: Icon, title, desc }) => (
                    <div
                      key={key}
                      onClick={() => updateStyle({ layout: key })}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        config.style.layout === key
                          ? 'border-sky-400 bg-sky-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${config.style.layout === key ? 'text-sky-600' : 'text-slate-400'}`} />
                        <span className="text-sm font-semibold text-slate-700">{title}</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>

                <SectionTitle title="视觉呈现" desc="透明度建议 15% ~ 30%，既能看清字迹又不遮挡关键数字与印章" />
                <div className="divide-y divide-slate-50">
                  <ConfigRow label="倾斜角度" desc="建议 30° ~ 45°">
                    <SliderRow
                      value={config.style.rotation}
                      min={-45}
                      max={45}
                      unit="°"
                      onChange={(v) => updateStyle({ rotation: v })}
                      hint="负值向左倾斜"
                    />
                  </ConfigRow>
                  <ConfigRow label="水印颜色" desc="默认浅灰色系">
                    <div className="flex items-center gap-1.5">
                      {WATERMARK_COLOR_PRESETS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          title={c.label}
                          onClick={() => updateStyle({ color: c.value })}
                          className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${
                            config.style.color === c.value ? 'border-sky-500 scale-110' : 'border-slate-200 hover:scale-105'
                          }`}
                          style={{ backgroundColor: c.value }}
                        />
                      ))}
                      <input
                        type="color"
                        value={config.style.color}
                        onChange={(e) => updateStyle({ color: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer border border-slate-200"
                        title="自定义颜色"
                      />
                    </div>
                  </ConfigRow>
                  <ConfigRow label="透明度" desc="建议区间 15% ~ 30%">
                    <SliderRow
                      value={Math.round(config.style.opacity * 100)}
                      min={5}
                      max={60}
                      unit="%"
                      onChange={(v) => updateStyle({ opacity: v / 100 })}
                      hint={Math.round(config.style.opacity * 100) < 15 || Math.round(config.style.opacity * 100) > 30 ? '超出建议区间' : ''}
                    />
                  </ConfigRow>
                  <ConfigRow label="字体大小" desc="默认 14px ~ 18px">
                    <SliderRow
                      value={config.style.fontSize}
                      min={12}
                      max={28}
                      unit="px"
                      onChange={(v) => updateStyle({ fontSize: v })}
                    />
                  </ConfigRow>
                  <ConfigRow label="平铺密度" desc={config.style.layout === 'tile' ? '数值越大排布越紧密' : '仅平铺模式生效'}>
                    <SliderRow
                      value={config.style.density}
                      min={1}
                      max={5}
                      onChange={(v) => updateStyle({ density: v })}
                      disabled={config.style.layout !== 'tile'}
                      hint={['', '最稀疏', '较稀疏', '适中', '较紧密', '最紧密'][config.style.density]}
                    />
                  </ConfigRow>
                </div>
              </div>
            )}

            {/* ==================== 安全与豁免 ==================== */}
            {activeTab === 'security' && (
              <div className="pb-4">
                <SectionTitle
                  title="防前端篡改"
                  desc="MutationObserver 监听 DOM 树，水印节点被删除或修改时按策略处置并记录安全日志（需求第2.1节）"
                />
                <div className="divide-y divide-slate-50">
                  <ConfigRow label="防篡改监听" desc="实时监听水印节点状态">
                    <Toggle
                      checked={config.security.antiTamper}
                      onChange={() => updateSecurity({ antiTamper: !config.security.antiTamper })}
                    />
                  </ConfigRow>
                  <ConfigRow label="篡改处置动作" desc="检测到篡改时的响应方式">
                    <Select
                      value={config.security.tamperAction}
                      options={[
                        { value: 'restore', label: '自动恢复水印' },
                        { value: 'close', label: '强制关闭预览' },
                      ]}
                      onChange={(v) => updateSecurity({ tamperAction: v as 'restore' | 'close' })}
                    />
                  </ConfigRow>
                </div>

                <SectionTitle title="高阶安全（高密级档案）" desc="常规明水印之外的进阶防护（需求第5节）" />
                <div className="divide-y divide-slate-50">
                  <ConfigRow label="盲水印（暗水印）" desc="频域数字水印：拍照/截图/裁剪/压缩后仍可提取泄露人工号">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">高阶</span>
                      <Toggle
                        checked={config.security.blindWatermark}
                        onChange={() => updateSecurity({ blindWatermark: !config.security.blindWatermark })}
                      />
                    </div>
                  </ConfigRow>
                  <ConfigRow label="防截屏控制" desc="移动端/桌面客户端禁用截屏键，截屏时黑屏">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">高阶</span>
                      <Toggle
                        checked={config.security.preventScreenshot}
                        onChange={() => updateSecurity({ preventScreenshot: !config.security.preventScreenshot })}
                      />
                    </div>
                  </ConfigRow>
                </div>

                <SectionTitle title="策略豁免" desc="对特定角色免除水印，视单位安全规定启用（需求第4节）" />
                <div className="divide-y divide-slate-50">
                  <ConfigRow label="启用角色豁免" desc="命中豁免角色的用户不加水印">
                    <Toggle
                      checked={config.exemptions.enabled}
                      onChange={() => updateExemptions({ enabled: !config.exemptions.enabled })}
                    />
                  </ConfigRow>
                  {config.exemptions.enabled && (
                    <div className="px-4 py-3">
                      <p className="text-xs text-slate-400 mb-2">选择豁免角色（可多选）</p>
                      <div className="flex flex-wrap gap-1.5">
                        {EXEMPTABLE_ROLES.map((role) => {
                          const selected = config.exemptions.roles.includes(role);
                          return (
                            <Chip
                              key={role}
                              label={role}
                              selected={selected}
                              tone="slate"
                              onClick={() =>
                                updateExemptions({
                                  roles: selected
                                    ? config.exemptions.roles.filter((r) => r !== role)
                                    : [...config.exemptions.roles, role],
                                })
                              }
                            />
                          );
                        })}
                      </div>
                      {config.exemptions.roles.length > 0 && (
                        <p className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-3">
                          <UserX className="w-3.5 h-3.5 shrink-0" />
                          豁免角色用户的所有操作均无水印，泄露风险请自行评估
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <SectionTitle title="下载烧录" desc="后端将水印作为图层烧录进文件本体（需求第2.2节·第6节）" />
                <div className="divide-y divide-slate-50">
                  <ConfigRow label="支持烧录的格式" desc="PDF / OFD / JPG / PNG">
                    <div className="flex flex-wrap gap-1.5">
                      {BURN_FORMAT_OPTIONS.map((fmt) => {
                        const selected = config.download.supportedFormats.includes(fmt);
                        return (
                          <Chip
                            key={fmt}
                            label={fmt}
                            selected={selected}
                            onClick={() =>
                              updateDownload({
                                supportedFormats: selected
                                  ? config.download.supportedFormats.filter((f) => f !== fmt)
                                  : [...config.download.supportedFormats, fmt],
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  </ConfigRow>
                  <ConfigRow label="Office 统一转 PDF" desc="Excel/Word 导出时先转 PDF 再烧录水印">
                    <Toggle
                      checked={config.download.officeToPdf}
                      onChange={() => updateDownload({ officeToPdf: !config.download.officeToPdf })}
                    />
                  </ConfigRow>
                  <ConfigRow label="异步排队" desc="大文件/批量下载进入队列，防服务器内存溢出">
                    <Toggle
                      checked={config.download.asyncQueue}
                      onChange={() => updateDownload({ asyncQueue: !config.download.asyncQueue })}
                    />
                  </ConfigRow>
                  <ConfigRow label="失败降级（安全失败）" desc="加水印服务故障时阻断下载，绝不暴露无水印原文件">
                    <div className="flex items-center gap-2">
                      {config.download.failSecure && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                          <CheckCircle2 className="w-3 h-3" />推荐
                        </span>
                      )}
                      <Toggle
                        checked={config.download.failSecure}
                        onChange={() => updateDownload({ failSecure: !config.download.failSecure })}
                      />
                    </div>
                  </ConfigRow>
                </div>

                {/* 安全提示 */}
                <div className="mx-4 mt-4 mb-2 flex items-start gap-2.5 bg-sky-50 border border-sky-200 rounded-xl p-3.5">
                  <AlertTriangle className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-sky-700 leading-relaxed">
                    水印服务属于安全链路：下载场景由后端烧录（PDFBox / iText），前端仅负责预览与打印场景。
                    「失败降级」开启时，加水印服务异常将直接阻断下载请求并告警，遵循安全失败原则。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：实时预览面板 */}
        <div className="w-[440px] shrink-0 border-l border-slate-200 bg-white flex flex-col min-h-0">
          <LivePreview />
        </div>
      </div>
    </div>
  );
};

export default WatermarkConfigPage;
