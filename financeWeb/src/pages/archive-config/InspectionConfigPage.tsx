/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * InspectionConfigPage — 四性检测配置
 *
 * 2026-08-29 T7 死配置治理重写：
 *   本页只保留「检测引擎真实消费」的配置项（对照 ams-server InspectionService.loadPlan）：
 *     真实性 authenticity.hashEnabled        —— 真实性维度总开关（哈希登记/重算比对）
 *     完整性 completeness.metadataRequiredCheck + requiredFields —— 必填元数据检测
 *     可用性 usability.formatWhitelist        —— 格式白名单（GD-3-01/YJ-3-01/CQ-3-01）
 *     安全性 security.sensitiveCheck + sensitiveKeywords —— 敏感信息检测
 *   检测项的启用/停用走「检测项库」Tab（ams_inspection_item.enabled，逐项真生效）。
 *
 *   已移除的死配置（保存成功但引擎从不读取，误导合规预期）：
 *     方案模板切换、哈希算法选择（口径固定 SHA-256）、签名标准/CA 链、区块链存证、
 *     日志保留时长、文件数量/大小开关（由检测项库 GD-2 系列覆盖）、包结构/主附件关联/编码校验、
 *     自动格式转换/渲染验证/DPI/字体嵌入、病毒扫描开关/病毒库频率、脱敏/权限/传输加密/动态水印、
 *     检测节点段配置（检测时机为系统行为：归档=确认组卷自动 gd、移交=gd∪yj 自动、
 *     长期保存=固化巡检定时任务 + 快速检测页手动，不由本页开关）。
 *
 *   未实现能力（电子签名验真/可信时间戳/病毒扫描）在本页如实标注「待接入」，不假装有开关。
 */

import React, { useState, useEffect } from 'react';
import {
  Settings, Shield, CheckCircle2, Eye,
  Save, RotateCcw, X, ListChecks, Loader2, Lock, Info,
} from 'lucide-react';
import { http } from '../../services/http';
import {
  fetchInspectionItems, setInspectionItemEnabled,
  PHASE_LABELS, DIMENSION_LABELS,
  type InspectionItem,
} from '../../services/inspectionService';

/** 持久化载荷（ams_config key=inspection.plan；与服务端 InspectionService.loadPlan 严格同构） */
interface PlanPayload {
  authenticity: { hashEnabled: boolean };
  completeness: { metadataRequiredCheck: boolean; requiredFields: string[] };
  usability: { formatWhitelist: string[] };
  security: { sensitiveCheck: boolean; sensitiveKeywords: string[] };
}

type TabKey = 'items' | 'plan';

// ─── 检测项标准库 Tab（环节×四性×检测项，启用状态即检测方案） ───

const DIM_ORDER = ['real', 'complete', 'usable', 'safe'] as const;
const DIM_BADGE: Record<string, string> = {
  real: 'bg-sky-50 text-sky-700 border-sky-200',
  complete: 'bg-violet-50 text-violet-700 border-violet-200',
  usable: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  safe: 'bg-rose-50 text-rose-700 border-rose-200',
};

const ItemsLibraryTab: React.FC = () => {
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    fetchInspectionItems()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (item: InspectionItem) => {
    setToggling(item.code);
    try {
      const updated = await setInspectionItemEnabled(item.code, !item.enabled);
      setItems((prev) => prev.map((it) => (it.code === item.code ? updated : it)));
    } catch {
      /* 失败保持原状 */
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="p-10 text-center text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />检测项库加载中…
      </div>
    );
  }

  const phases = ['gd', 'yj', 'cq'] as const;

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">标准检测项库（环节 × 四性）</h3>
          <p className="text-xs text-slate-400 mt-1">
            启用的检测项即实际执行的检测方案：归档环节在确认组卷时自动执行、移交环节在移交归盒时自动执行（未过阻断），长期保存环节由固化巡检定时任务与快速检测页执行。
          </p>
        </div>
        <span className="text-[11px] text-slate-400 shrink-0 mt-0.5">
          {items.filter((i) => i.enabled).length} / {items.length} 项启用
        </span>
      </div>

      {phases.map((ph) => {
        const phaseItems = items.filter((i) => i.phase === ph);
        if (phaseItems.length === 0) return null;
        return (
          <div key={ph} className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">{PHASE_LABELS[ph]}</span>
              <span className="text-[10px] text-slate-400">
                {phaseItems.filter((i) => i.enabled).length}/{phaseItems.length} 项启用
              </span>
            </div>
            <div className="grid grid-cols-4 divide-x divide-slate-100">
              {DIM_ORDER.map((dim) => (
                <div key={dim} className="p-3 space-y-2">
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${DIM_BADGE[dim]}`}>
                    {DIMENSION_LABELS[dim]}
                  </span>
                  {phaseItems.filter((i) => i.dimension === dim).map((item) => (
                    <div key={item.code}
                      className={`flex items-start gap-2 p-2 rounded-lg border transition-colors ${
                        item.enabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
                      }`}>
                      <button
                        type="button"
                        onClick={() => void toggle(item)}
                        disabled={toggling === item.code}
                        title={item.enabled ? '点击停用' : '点击启用'}
                        className={`relative inline-flex h-4 w-7 mt-0.5 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                          item.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      >
                        <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                          item.enabled ? 'translate-x-[14px]' : 'translate-x-[2px]'
                        }`} />
                      </button>
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-slate-700 leading-snug">{item.name}</div>
                        <div className="text-[9.5px] text-slate-400 mt-0.5 font-mono">
                          {item.code}{item.standard_ref && item.standard_ref !== '—' ? ` · ${item.standard_ref}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                  {phaseItems.filter((i) => i.dimension === dim).length === 0 && (
                    <div className="text-[10px] text-slate-300 px-1">—</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── 默认配置（与服务端 defaultPlan 一致） ───────────────────

const DEFAULT_PLAN: PlanPayload = {
  authenticity: { hashEnabled: true },
  completeness: {
    metadataRequiredCheck: true,
    requiredFields: ['题名', '责任者', '日期', '档号', '格式', '凭证号', '金额合计', '会计年度'],
  },
  usability: { formatWhitelist: ['OFD', 'PDF/A', 'PDF', 'XML', 'TXT', 'JPG', 'TIFF'] },
  security: { sensitiveCheck: true, sensitiveKeywords: ['身份证号', '手机号', '银行卡号', '涉密'] },
};

/** 必填字段清单（2026-08-29 T4：与后端 REQUIRED_FIELD_CHECKS 一一对应，无件级语义的字段已移除） */
const METADATA_FIELDS = [
  '题名', '责任者', '日期', '档号', '格式',
  '凭证号', '金额合计', '会计年度', '保管期限', '密级',
];
const FORMAT_OPTIONS = ['OFD', 'PDF/A', 'PDF', 'XML', 'TXT', 'JPG', 'TIFF', 'PNG'];
const SENSITIVE_KEYWORD_OPTIONS = ['身份证号', '手机号', '银行卡号', '涉密', '军事', '外交', '国家安全', '企业核心商密'];

// ─── 小组件 ──────────────────────────────────────────────

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

/** 标签（可删除） */
const TagBadge: React.FC<{ label: string; onRemove?: () => void }> = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 rounded-full">
    {label}
    {onRemove && (
      <button type="button" onClick={onRemove} className="hover:text-red-600 cursor-pointer">
        <X className="w-3 h-3" />
      </button>
    )}
  </span>
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

/** 能力状态说明行（诚实标注：已实现/待接入） */
const CapabilityNote: React.FC<{ items: Array<{ label: string; state: 'on' | 'pending'; note: string }> }> = ({ items }) => (
  <div className="mx-4 my-3 border border-slate-200 rounded-lg divide-y divide-slate-100">
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-2 px-3 py-2 text-xs">
        <span className={`px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
          it.state === 'on' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
        }`}>
          {it.state === 'on' ? '已实现' : '待接入'}
        </span>
        <span className="font-medium text-slate-600 shrink-0">{it.label}</span>
        <span className="text-slate-400">{it.note}</span>
      </div>
    ))}
  </div>
);

// ─── 主页面 ──────────────────────────────────────────────

const InspectionConfigPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('items');
  const [plan, setPlan] = useState<PlanPayload>({
    authenticity: { ...DEFAULT_PLAN.authenticity },
    completeness: { ...DEFAULT_PLAN.completeness, requiredFields: [...DEFAULT_PLAN.completeness.requiredFields] },
    usability: { formatWhitelist: [...DEFAULT_PLAN.usability.formatWhitelist] },
    security: { ...DEFAULT_PLAN.security, sensitiveKeywords: [...DEFAULT_PLAN.security.sensitiveKeywords] },
  });

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [newKeyword, setNewKeyword] = useState('');

  // ── 加载已保存方案（ams_config: inspection.plan；旧格式多余键自动忽略——T7 契约收窄） ──
  useEffect(() => {
    http.get<{ key: string; value: unknown }>('/config/inspection.plan')
      .then((view) => {
        const v = view?.value as Partial<PlanPayload> | undefined;
        if (!v) return;
        setPlan((prev) => ({
          authenticity: { ...prev.authenticity, ...(v.authenticity || {}) },
          completeness: {
            ...prev.completeness, ...(v.completeness || {}),
            // 存量必填字段过滤到当前可映射集合（与服务端 loadPlan 自愈同口径）
            requiredFields: ((v.completeness?.requiredFields) || prev.completeness.requiredFields)
              .filter((f) => METADATA_FIELDS.includes(f)),
          },
          usability: { formatWhitelist: (v.usability?.formatWhitelist) || prev.usability.formatWhitelist },
          security: { ...prev.security, ...(v.security || {}) },
        }));
      })
      .catch(() => { /* 404 = 尚未保存过，用默认值 */ });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await http.put('/config/inspection.plan', { value: plan });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPlan({
      authenticity: { ...DEFAULT_PLAN.authenticity },
      completeness: { ...DEFAULT_PLAN.completeness, requiredFields: [...DEFAULT_PLAN.completeness.requiredFields] },
      usability: { formatWhitelist: [...DEFAULT_PLAN.usability.formatWhitelist] },
      security: { ...DEFAULT_PLAN.security, sensitiveKeywords: [...DEFAULT_PLAN.security.sensitiveKeywords] },
    });
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'items', label: '检测项库', icon: <ListChecks className="w-4 h-4" /> },
    { key: 'plan', label: '检测方案微调', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 overflow-auto animate-in fade-in duration-200">
      {/* 页面标题 */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center gap-3 mb-1">
          <Settings className="w-5 h-5 text-sky-600" />
          <h2 className="text-lg font-bold text-slate-800">四性检测配置</h2>
          {saved && (
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full animate-in fade-in">
              配置已保存（服务端检测引擎即时生效）
            </span>
          )}
          {saveError && (
            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              保存失败：{saveError}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
          <Info className="w-3.5 h-3.5" />
          本页仅含检测引擎真实消费的配置项；检测项粒度启停在「检测项库」。检测时机为系统行为：归档（确认组卷）与移交（归盒）自动执行、不合格阻断，长期保存环节由固化巡检定时任务执行。
        </div>
      </div>

      {/* Tab 栏 + 操作 */}
      <div className="px-6 mt-3 flex items-center gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === t.key
                ? 'border-sky-500 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        {activeTab === 'plan' && (
          <div className="flex items-center gap-2 pb-1.5">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              <RotateCcw className="w-3.5 h-3.5" />恢复默认
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              保存配置
            </button>
          </div>
        )}
      </div>

      {/* 内容区 */}
      <div className="p-6 max-w-5xl mx-auto">
        {activeTab === 'items' && (
          <div className="bg-white border border-slate-200 rounded-xl">
            <ItemsLibraryTab />
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="space-y-4">
            {/* ── 真实性 ── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
                <Shield className="w-4 h-4 text-sky-500" />
                <span className="text-sm font-bold text-slate-800">真实性</span>
              </div>
              <ConfigRow label="真实性维度检测" desc="文件摘要登记（GD-1-02）+ 重算比对（GD-1-04/YJ-1-02/CQ-1-02）；哈希口径固定 SHA-256，与固化登记表一致">
                <Toggle
                  checked={plan.authenticity.hashEnabled}
                  onChange={() => setPlan({ ...plan, authenticity: { hashEnabled: !plan.authenticity.hashEnabled } })}
                />
              </ConfigRow>
              <CapabilityNote items={[
                { label: '文件摘要登记/重算比对', state: 'on', note: '建件/推送/同步入口自动登记 SHA-256；检测时重算逐位比对' },
                { label: '定期固化巡检', state: 'on', note: '服务端定时任务（ams.fixity.cron，默认每周日 02:30）；快速检测页可手动触发' },
                { label: '电子签名验真 / 可信时间戳', state: 'pending', note: '需接入 CA/国家授时中心服务；当前采集签名存在性标记（数电票 XML 解析）' },
                { label: '病毒扫描', state: 'pending', note: '需接入杀毒引擎（如 ClamAV）；接入前安全性维度不含病毒项' },
              ]} />
            </div>

            {/* ── 完整性 ── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
                <CheckCircle2 className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-bold text-slate-800">完整性</span>
              </div>
              <ConfigRow label="必填元数据校验" desc="DA/T 94 核心必填项缺漏检测（GD-2-01/YJ-2-01）">
                <Toggle
                  checked={plan.completeness.metadataRequiredCheck}
                  onChange={() => setPlan({ ...plan, completeness: { ...plan.completeness, metadataRequiredCheck: !plan.completeness.metadataRequiredCheck } })}
                />
              </ConfigRow>
              {plan.completeness.metadataRequiredCheck && (
                <div className="py-3 px-4">
                  <span className="text-xs text-slate-500 mb-2 block">必填字段清单（仅含引擎可映射字段，逐字段真实校验）</span>
                  <div className="flex flex-wrap gap-1.5">
                    {METADATA_FIELDS.map((field) => {
                      const checked = plan.completeness.requiredFields.includes(field);
                      return (
                        <button
                          key={field}
                          type="button"
                          onClick={() => {
                            const next = checked
                              ? plan.completeness.requiredFields.filter((f) => f !== field)
                              : [...plan.completeness.requiredFields, field];
                            setPlan({ ...plan, completeness: { ...plan.completeness, requiredFields: next } });
                          }}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
                            checked
                              ? 'bg-sky-50 text-sky-700 border-sky-300'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {field}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <CapabilityNote items={[
                { label: '凭证号断号/卷内查重/件数一致', state: 'on', note: '卷级真校验（GD-2-02/GD-2-03/YJ-2-02），在检测项库启停' },
                { label: '有目无文（文件存在性）', state: 'on', note: 'GD-1-01/YJ-1-01，内容字节数核验' },
              ]} />
            </div>

            {/* ── 可用性 ── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
                <Eye className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-bold text-slate-800">可用性</span>
              </div>
              <div className="py-3 px-4">
                <span className="text-xs text-slate-500 mb-2 block">归档格式白名单（GD-3-01/YJ-3-01/CQ-3-01，按上传声明格式校验）</span>
                <div className="flex flex-wrap gap-1.5">
                  {FORMAT_OPTIONS.map((fmt) => {
                    const checked = plan.usability.formatWhitelist.includes(fmt);
                    return (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => {
                          const next = checked
                            ? plan.usability.formatWhitelist.filter((f) => f !== fmt)
                            : [...plan.usability.formatWhitelist, fmt];
                          setPlan({ ...plan, usability: { formatWhitelist: next } });
                        }}
                        className={`px-2.5 py-1 text-xs rounded-full border font-mono transition-colors cursor-pointer ${
                          checked
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {fmt}
                      </button>
                    );
                  })}
                </div>
              </div>
              <CapabilityNote items={[
                { label: '格式校验口径', state: 'on', note: '按上传时声明的 mimeType 校验（内容嗅探加固见修复计划第五批 T16）' },
                { label: '自动格式转换 / 渲染验证', state: 'pending', note: '版式转换引擎未接入；PDF/A 与 PDF 当前同口径' },
              ]} />
            </div>

            {/* ── 安全性 ── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
                <Lock className="w-4 h-4 text-rose-500" />
                <span className="text-sm font-bold text-slate-800">安全性</span>
              </div>
              <ConfigRow label="敏感信息检测" desc="身份证/银行卡号模式（GD-4-01）+ 自定义敏感词（GD-4-02），基于 OCR/XML 解析文本">
                <Toggle
                  checked={plan.security.sensitiveCheck}
                  onChange={() => setPlan({ ...plan, security: { ...plan.security, sensitiveCheck: !plan.security.sensitiveCheck } })}
                />
              </ConfigRow>
              {plan.security.sensitiveCheck && (
                <div className="py-3 px-4 space-y-2">
                  <span className="text-xs text-slate-500 block">敏感关键词表</span>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.security.sensitiveKeywords.map((kw) => (
                      <TagBadge
                        key={kw}
                        label={kw}
                        onRemove={() => setPlan({ ...plan, security: { ...plan.security, sensitiveKeywords: plan.security.sensitiveKeywords.filter((k) => k !== kw) } })}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const v = newKeyword.trim();
                          if (v && !plan.security.sensitiveKeywords.includes(v)) {
                            setPlan({ ...plan, security: { ...plan.security, sensitiveKeywords: [...plan.security.sensitiveKeywords, v] } });
                          }
                          setNewKeyword('');
                        }
                      }}
                      placeholder="输入关键词回车添加"
                      className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-rose-300"
                    />
                    <div className="flex flex-wrap gap-1">
                      {SENSITIVE_KEYWORD_OPTIONS.filter((k) => !plan.security.sensitiveKeywords.includes(k)).slice(0, 4).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setPlan({ ...plan, security: { ...plan.security, sensitiveKeywords: [...plan.security.sensitiveKeywords, k] } })}
                          className="px-2 py-0.5 text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-full hover:text-rose-600 hover:border-rose-300 cursor-pointer"
                        >
                          +{k}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <CapabilityNote items={[
                { label: '操作审计链', state: 'on', note: '全操作仅追加日志 + SHA-256 哈希链（ams_operation_log），检索门户可查证' },
                { label: '病毒扫描', state: 'pending', note: '需接入杀毒引擎；接入前归档环节不含病毒检测项（诚实声明，不设假开关）' },
              ]} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InspectionConfigPage;
