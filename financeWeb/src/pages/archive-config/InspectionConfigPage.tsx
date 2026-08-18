/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * InspectionConfigPage — 四性检测配置
 *
 * 依据 DA/T 70 标准，提供四性检测规则的可视化配置：
 *   方案模板 — 预设模板选择与切换
 *   真实性   — 哈希/签名/日志/区块链
 *   完整性   — 文件/元数据/包结构/关联
 *   可用性   — 格式白名单/转换/渲染验证
 *   安全性   — 病毒/敏感/权限/加密/水印
 *
 * 配置项全为前端 mock，对接后端后从 API 加载/保存。
 */

import React, { useState, useEffect } from 'react';
import {
  Settings, Shield, CheckCircle2, FileText, Lock, Eye,
  Save, RotateCcw, Play, FileSpreadsheet, ChevronDown, Plus, X,
  ListChecks, Loader2,
} from 'lucide-react';
import { http } from '../../services/http';
import { useArchiveStore } from '../../stores/archiveStore';
import {
  fetchInspectionItems, setInspectionItemEnabled,
  PHASE_LABELS, DIMENSION_LABELS,
  type InspectionItem,
} from '../../services/inspectionService';

/** 持久化载荷（ams_config key=inspection.plan；与服务端 InspectionService 消费契约一致） */
interface PlanPayload {
  authenticity: AuthenticityConfig;
  completeness: CompletenessConfig;
  usability: UsabilityConfig;
  security: SecurityConfig;
  nodes: NodeConfig;
}

// ─── 类型定义 ───────────────────────────────────────────

interface AuthenticityConfig {
  hashEnabled: boolean;
  hashAlgorithm: string;
  signatureEnabled: boolean;
  signatureStandards: string[];
  caChainCheck: boolean;
  auditLogEnabled: boolean;
  logRetention: string;
  blockchainEnabled: boolean;
}

interface CompletenessConfig {
  fileCountCheck: boolean;
  fileSizeCheck: boolean;
  metadataRequiredCheck: boolean;
  requiredFields: string[];
  packageStructureCheck: boolean;
  attachmentRelationCheck: boolean;
  encodingCheck: boolean;
}

interface UsabilityConfig {
  formatWhitelist: string[];
  autoConvert: boolean;
  targetFormat: string;
  renderVerify: boolean;
  renderTimeout: number;
  dpiCheck: boolean;
  fontEmbedCheck: boolean;
  resolutionCheck: boolean;
}

interface SecurityConfig {
  virusScan: boolean;
  virusUpdateFreq: string;
  sensitiveCheck: boolean;
  sensitiveKeywords: string[];
  desensitize: boolean;
  classificationCheck: boolean;
  permissionCheck: boolean;
  transportEncryption: boolean;
  dynamicWatermark: boolean;
}

interface NodeConfig {
  preArchive: boolean;
  archiveTrigger: boolean;
  transferCheck: boolean;
  longTermSpotCheck: boolean;
  spotCheckPeriod: 'year' | 'quarter';
  spotCheckRatio: number;
}

type TabKey = 'items' | 'template' | 'authenticity' | 'completeness' | 'usability' | 'security';

// ─── 检测项标准库 Tab（V8：环节×四性×检测项，启用状态即检测方案） ───

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
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            检测引擎按「已启用」的检测项逐项执行，结果四性归并 + 问题明细落库；
            勾选集合即本单位的检测方案（归档/移交/长期保存三个环节独立生效）。标准依据列明 DA/T·GB/T 条款。
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

// ─── 默认配置（电子会计档案模板） ────────────────────────

const DEFAULT_AUTHENTICITY: AuthenticityConfig = {
  hashEnabled: true,
  hashAlgorithm: 'SHA-256',
  signatureEnabled: true,
  signatureStandards: ['GB/T 25064', 'SM2'],
  caChainCheck: true,
  auditLogEnabled: true,
  logRetention: '永久',
  blockchainEnabled: false,
};

const DEFAULT_COMPLETENESS: CompletenessConfig = {
  fileCountCheck: true,
  fileSizeCheck: true,
  metadataRequiredCheck: true,
  requiredFields: ['题名', '责任者', '日期', '档号', '格式', '凭证号', '金额合计', '会计年度'],
  packageStructureCheck: true,
  attachmentRelationCheck: true,
  encodingCheck: true,
};

const DEFAULT_USABILITY: UsabilityConfig = {
  formatWhitelist: ['OFD', 'PDF/A', 'PDF', 'XML', 'TXT', 'JPG', 'TIFF'],
  autoConvert: true,
  targetFormat: 'OFD',
  renderVerify: true,
  renderTimeout: 30,
  dpiCheck: true,
  fontEmbedCheck: true,
  resolutionCheck: false,
};

const DEFAULT_SECURITY: SecurityConfig = {
  virusScan: true,
  virusUpdateFreq: '每日',
  sensitiveCheck: true,
  sensitiveKeywords: ['身份证号', '手机号', '银行卡号', '涉密'],
  desensitize: true,
  classificationCheck: true,
  permissionCheck: true,
  transportEncryption: true,
  dynamicWatermark: true,
};

const DEFAULT_NODES: NodeConfig = {
  preArchive: true,
  archiveTrigger: true,
  transferCheck: true,
  longTermSpotCheck: true,
  spotCheckPeriod: 'year',
  spotCheckRatio: 10,
};

// ─── 可选值常量 ──────────────────────────────────────────

const HASH_ALGORITHMS = ['SHA-256', 'SM3', 'MD5（不推荐）'];
const SIGNATURE_STANDARDS = ['GB/T 25064', 'SM2', 'SM3', 'SM4'];
const LOG_RETENTIONS = ['1年', '3年', '5年', '10年', '永久'];
const METADATA_FIELDS = [
  '题名', '责任者', '日期', '档号', '格式',
  '凭证号', '金额合计', '会计年度', '保管期限',
  '档案馆名称', '全宗号', '目录号', '案卷号', '件号',
  '附件数', '页数', '摘要', '密级',
];
const FORMAT_OPTIONS = ['OFD', 'PDF/A', 'PDF', 'XML', 'TXT', 'JPG', 'TIFF', 'PNG', 'DOC', 'DOCX', 'XLS', 'XLSX'];
const TARGET_FORMATS = ['OFD', 'PDF/A'];
const VIRUS_UPDATE_FREQS = ['每小时', '每日', '每周'];
const SENSITIVE_KEYWORD_OPTIONS = ['身份证号', '手机号', '银行卡号', '涉密', '军事', '外交', '国家安全', '企业核心商密'];

// ─── 模板预设 ────────────────────────────────────────────

interface TemplatePreset {
  id: string;
  name: string;
  desc: string;
}

const TEMPLATES: TemplatePreset[] = [
  { id: 'accounting', name: '电子会计档案模板', desc: '适用于会计凭证/账簿/报表/其他会计资料' },
  { id: 'official', name: '电子公文模板', desc: '适用于文书类电子档案（OA公文流转）' },
  { id: 'engineering', name: '工程图纸模板', desc: '适用于CAD/工程图纸类档案' },
  { id: 'media', name: '照片音视频模板', desc: '适用于照片/音频/视频多媒体档案' },
];

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

/** 下拉选择 */
const Select: React.FC<{
  value: string; options: string[]; onChange: (v: string) => void;
}> = ({ value, options, onChange }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="appearance-none bg-white border border-slate-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
  </div>
);

/** 数字输入 */
const NumberInput: React.FC<{ value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string }> = (
  { value, onChange, min = 0, max = 100, suffix }
) => (
  <div className="flex items-center gap-1">
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10);
        if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
      }}
      className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-700 outline-none focus:border-sky-400"
      min={min}
      max={max}
    />
    {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
  </div>
);

// ─── 主页面 ──────────────────────────────────────────────

const InspectionConfigPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('template');
  const [selectedTemplate, setSelectedTemplate] = useState('accounting');

  // 各维度配置状态
  const [authenticity, setAuthenticity] = useState<AuthenticityConfig>({ ...DEFAULT_AUTHENTICITY });
  const [completeness, setCompleteness] = useState<CompletenessConfig>({ ...DEFAULT_COMPLETENESS });
  const [usability, setUsability] = useState<UsabilityConfig>({ ...DEFAULT_USABILITY });
  const [security, setSecurity] = useState<SecurityConfig>({ ...DEFAULT_SECURITY });
  const [nodes, setNodes] = useState<NodeConfig>({ ...DEFAULT_NODES });

  // 保存状态
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string>('');
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);

  // ── 立即执行检测（真：对当前全宗收集池批量跑四性检测，走本页保存的方案口径） ──
  const handleRunBatch = async () => {
    if (!currentFanzongCode) return;
    setRunning(true);
    setRunResult('');
    try {
      const r = await http.post<{ checked: number; passed: number; failed: number; failedNames: string[] }>(
        '/inspection/run-batch', { fondsCode: currentFanzongCode, phase: 'manual-config-page' });
      setRunResult(`检测完成：共 ${r.checked} 件，通过 ${r.passed} 件，不通过 ${r.failed} 件`
        + (r.failedNames.length > 0 ? `（${r.failedNames.slice(0, 3).join('；')}${r.failedNames.length > 3 ? ' 等' : ''}）` : ''));
    } catch (e) {
      setRunResult('检测失败：' + (e instanceof Error ? e.message : ''));
    } finally {
      setRunning(false);
    }
  };

  // ── 加载已保存方案（ams_config: inspection.plan，2026-08-16 贯通修复——原为假保存） ──
  useEffect(() => {
    http.get<{ key: string; value: unknown }>('/config/inspection.plan')
      .then((view) => {
        const v = view?.value as Partial<PlanPayload> | undefined;
        if (!v) return;
        if (v.authenticity) setAuthenticity({ ...DEFAULT_AUTHENTICITY, ...v.authenticity });
        if (v.completeness) setCompleteness({ ...DEFAULT_COMPLETENESS, ...v.completeness });
        if (v.usability) setUsability({ ...DEFAULT_USABILITY, ...v.usability });
        if (v.security) setSecurity({ ...DEFAULT_SECURITY, ...v.security });
        if (v.nodes) setNodes({ ...DEFAULT_NODES, ...v.nodes });
      })
      .catch(() => { /* 404 = 尚未保存过，用默认值 */ });
  }, []);

  // —— 标签增删辅助 ——
  const addTag = (list: string[], setList: (v: string[]) => void, max: number, newTag: string) => {
    const trimmed = newTag.trim();
    if (trimmed && !list.includes(trimmed) && list.length < max) {
      setList([...list, trimmed]);
    }
  };
  const removeTag = (list: string[], setList: (v: string[]) => void, tag: string) => {
    setList(list.filter((t) => t !== tag));
  };

  // —— 保存（真持久化：PUT /config/inspection.plan，服务端检测引擎读取执行） ——
  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const payload: PlanPayload = { authenticity, completeness, usability, security, nodes };
      await http.put('/config/inspection.plan', { value: payload });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // —— 恢复默认 ——
  const handleReset = () => {
    setAuthenticity({ ...DEFAULT_AUTHENTICITY });
    setCompleteness({ ...DEFAULT_COMPLETENESS });
    setUsability({ ...DEFAULT_USABILITY });
    setSecurity({ ...DEFAULT_SECURITY });
    setNodes({ ...DEFAULT_NODES });
  };

  // —— 切换模板 ——
  const handleTemplateChange = (id: string) => {
    setSelectedTemplate(id);
    handleReset(); // 切换模板时重置配置
  };

  // Tab 配置
  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'items', label: '检测项库', icon: <ListChecks className="w-4 h-4" /> },
    { key: 'template', label: '方案模板', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { key: 'authenticity', label: '真实性', icon: <Shield className="w-4 h-4" /> },
    { key: 'completeness', label: '完整性', icon: <CheckCircle2 className="w-4 h-4" /> },
    { key: 'usability', label: '可用性', icon: <Eye className="w-4 h-4" /> },
    { key: 'security', label: '安全性', icon: <Lock className="w-4 h-4" /> },
  ];

  // ─── 渲染 ──────────────────────────────────────────────

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
          {runResult && (
            <span className="text-xs font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">
              {runResult}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-1">
          遵循 DA/T 70 标准，配置电子档案四性（真实性/完整性/可用性/安全性）检测规则与方案模板
        </p>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
          <span>当前方案：{TEMPLATES.find((t) => t.id === selectedTemplate)?.name}</span>
          <span>·</span>
          <span>规则版本 v2.1.0</span>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="px-6 mt-4">
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
      </div>

      {/* Tab 内容 */}
      <div className="px-6 py-4">
        <div className="bg-white rounded-xl border border-slate-200">

          {/* ======================== 检测项库 ======================== */}
          {activeTab === 'items' && <ItemsLibraryTab />}

          {/* ======================== 模板 ======================== */}
          {activeTab === 'template' && (
            <div className="p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">选择方案模板</h3>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() => handleTemplateChange(tpl.id)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      selectedTemplate === tpl.id
                        ? 'border-sky-400 bg-sky-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        selectedTemplate === tpl.id ? 'border-sky-500' : 'border-slate-300'
                      }`}>
                        {selectedTemplate === tpl.id && <div className="w-2 h-2 rounded-full bg-sky-500" />}
                      </div>
                      <span className="text-sm font-semibold text-slate-700">{tpl.name}</span>
                    </div>
                    <p className="text-xs text-slate-500 ml-6">{tpl.desc}</p>
                  </div>
                ))}
              </div>

              <h3 className="text-sm font-semibold text-slate-700 mb-3">当前方案概览</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">真实性</span>
                  <span className="text-slate-700">
                    {[
                      authenticity.hashEnabled && 'SHA-256',
                      authenticity.signatureEnabled && `签名(${authenticity.signatureStandards.join('/')})`,
                      authenticity.blockchainEnabled && '区块链',
                    ].filter(Boolean).join(' + ') || '未启用'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">完整性</span>
                  <span className="text-slate-700">
                    {[
                      completeness.fileCountCheck && '文件校验',
                      completeness.metadataRequiredCheck && `元数据(${completeness.requiredFields.length}字段)`,
                      completeness.packageStructureCheck && '包结构',
                    ].filter(Boolean).join(' + ') || '未启用'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">可用性</span>
                  <span className="text-slate-700">
                    {[
                      `格式白名单(${usability.formatWhitelist.length}种)`,
                      usability.autoConvert && `自动转${usability.targetFormat}`,
                      usability.renderVerify && '渲染验证',
                    ].filter(Boolean).join(' + ')}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">安全性</span>
                  <span className="text-slate-700">
                    {[
                      security.virusScan && '病毒扫描',
                      security.sensitiveCheck && '敏感筛查',
                      security.permissionCheck && 'RBAC',
                    ].filter(Boolean).join(' + ') || '未启用'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">检测节点</span>
                  <span className="text-slate-700">
                    {[
                      nodes.preArchive && '前置',
                      nodes.archiveTrigger && '归档',
                      nodes.transferCheck && '移交',
                      nodes.longTermSpotCheck && `长期(${nodes.spotCheckPeriod === 'year' ? '每年' : '每季度'} ${nodes.spotCheckRatio}%)`,
                    ].filter(Boolean).join(' → ')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ======================== 真实性 ======================== */}
          {activeTab === 'authenticity' && (
            <div className="divide-y divide-slate-100">
              <div className="p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-1">真实性检测配置</h3>
                <p className="text-xs text-slate-400 mb-4">来源可靠 · 内容未篡改 · 行为可追溯</p>

                <ConfigRow label="启用哈希校验" desc="SHA-256 哈希值比对，防止文件篡改">
                  <Toggle checked={authenticity.hashEnabled} onChange={() => setAuthenticity({ ...authenticity, hashEnabled: !authenticity.hashEnabled })} />
                </ConfigRow>
                {authenticity.hashEnabled && (
                  <ConfigRow label="哈希算法" desc="选择哈希算法标准">
                    <Select value={authenticity.hashAlgorithm} options={HASH_ALGORITHMS} onChange={(v) => setAuthenticity({ ...authenticity, hashAlgorithm: v })} />
                  </ConfigRow>
                )}

                <ConfigRow label="启用数字签名验证" desc="电子签章 / CA 证书有效性验证">
                  <Toggle checked={authenticity.signatureEnabled} onChange={() => setAuthenticity({ ...authenticity, signatureEnabled: !authenticity.signatureEnabled })} />
                </ConfigRow>
                {authenticity.signatureEnabled && (
                  <>
                    <ConfigRow label="签名标准" desc="选择适用的签名/签章标准（可多选）">
                      <div className="flex flex-wrap gap-1.5">
                        {SIGNATURE_STANDARDS.map((std) => {
                          const checked = authenticity.signatureStandards.includes(std);
                          return (
                            <button
                              key={std}
                              type="button"
                              onClick={() => {
                                const next = checked
                                  ? authenticity.signatureStandards.filter((s) => s !== std)
                                  : [...authenticity.signatureStandards, std];
                                setAuthenticity({ ...authenticity, signatureStandards: next });
                              }}
                              className={`px-2.5 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
                                checked
                                  ? 'bg-sky-50 text-sky-700 border-sky-300'
                                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              {std}
                            </button>
                          );
                        })}
                      </div>
                    </ConfigRow>
                    <ConfigRow label="CA 证书链校验" desc="验证证书链完整性和有效期">
                      <Toggle checked={authenticity.caChainCheck} onChange={() => setAuthenticity({ ...authenticity, caChainCheck: !authenticity.caChainCheck })} />
                    </ConfigRow>
                  </>
                )}

                <ConfigRow label="操作日志追溯" desc="记录创建/修改/流转操作日志">
                  <Toggle checked={authenticity.auditLogEnabled} onChange={() => setAuthenticity({ ...authenticity, auditLogEnabled: !authenticity.auditLogEnabled })} />
                </ConfigRow>
                {authenticity.auditLogEnabled && (
                  <ConfigRow label="日志保留时长">
                    <Select value={authenticity.logRetention} options={LOG_RETENTIONS} onChange={(v) => setAuthenticity({ ...authenticity, logRetention: v })} />
                  </ConfigRow>
                )}

                <ConfigRow label="区块链存证" desc="操作日志写入不可篡改链（实验性功能）">
                  <Toggle checked={authenticity.blockchainEnabled} onChange={() => setAuthenticity({ ...authenticity, blockchainEnabled: !authenticity.blockchainEnabled })} />
                </ConfigRow>
              </div>
            </div>
          )}

          {/* ======================== 完整性 ======================== */}
          {activeTab === 'completeness' && (
            <div className="divide-y divide-slate-100">
              <div className="p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-1">完整性检测配置</h3>
                <p className="text-xs text-slate-400 mb-4">文件 · 元数据 · 附件 · 结构无缺失</p>

                <ConfigRow label="文件数量校验" desc="主件 + 附件数量匹配检查">
                  <Toggle checked={completeness.fileCountCheck} onChange={() => setCompleteness({ ...completeness, fileCountCheck: !completeness.fileCountCheck })} />
                </ConfigRow>
                <ConfigRow label="文件大小校验" desc="文件大小合规性检查">
                  <Toggle checked={completeness.fileSizeCheck} onChange={() => setCompleteness({ ...completeness, fileSizeCheck: !completeness.fileSizeCheck })} />
                </ConfigRow>
                <ConfigRow label="元数据必填校验" desc="DA/T 13 标准元数据字段检查">
                  <Toggle checked={completeness.metadataRequiredCheck} onChange={() => setCompleteness({ ...completeness, metadataRequiredCheck: !completeness.metadataRequiredCheck })} />
                </ConfigRow>
                {completeness.metadataRequiredCheck && (
                  <div className="py-3 px-4">
                    <span className="text-xs text-slate-500 mb-2 block">必填字段清单（勾选需要校验的元数据字段）</span>
                    <div className="flex flex-wrap gap-1.5">
                      {METADATA_FIELDS.map((field) => {
                        const checked = completeness.requiredFields.includes(field);
                        return (
                          <button
                            key={field}
                            type="button"
                            onClick={() => {
                              const next = checked
                                ? completeness.requiredFields.filter((f) => f !== field)
                                : [...completeness.requiredFields, field];
                              setCompleteness({ ...completeness, requiredFields: next });
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

                <ConfigRow label="包结构校验" desc="ZIP / XML 封装规范检查">
                  <Toggle checked={completeness.packageStructureCheck} onChange={() => setCompleteness({ ...completeness, packageStructureCheck: !completeness.packageStructureCheck })} />
                </ConfigRow>
                <ConfigRow label="主附件关联校验" desc="通过唯一 ID 绑定校验主附件关系">
                  <Toggle checked={completeness.attachmentRelationCheck} onChange={() => setCompleteness({ ...completeness, attachmentRelationCheck: !completeness.attachmentRelationCheck })} />
                </ConfigRow>
                <ConfigRow label="编码格式校验" desc="UTF-8 编码，防止乱码">
                  <Toggle checked={completeness.encodingCheck} onChange={() => setCompleteness({ ...completeness, encodingCheck: !completeness.encodingCheck })} />
                </ConfigRow>
              </div>
            </div>
          )}

          {/* ======================== 可用性 ======================== */}
          {activeTab === 'usability' && (
            <div className="divide-y divide-slate-100">
              <div className="p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-1">可用性检测配置</h3>
                <p className="text-xs text-slate-400 mb-4">格式长期可读 · 能正常打开渲染</p>

                <div className="py-3 px-4">
                  <span className="text-sm font-medium text-slate-700">格式白名单</span>
                  <span className="text-xs text-slate-400 ml-2">仅允许白名单内格式通过检测</span>
                  <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
                    {usability.formatWhitelist.map((fmt) => (
                      <TagBadge
                        key={fmt}
                        label={fmt}
                        onRemove={() => removeTag(usability.formatWhitelist, (v) => setUsability({ ...usability, formatWhitelist: v }), fmt)}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-sky-400"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) { addTag(usability.formatWhitelist, (list) => setUsability({ ...usability, formatWhitelist: list }), 20, v); e.target.value = ''; }
                      }}
                    >
                      <option value="">+ 添加格式</option>
                      {FORMAT_OPTIONS.filter((f) => !usability.formatWhitelist.includes(f)).map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <ConfigRow label="自动格式转换" desc="非长期格式（.doc / .xls）自动转换为长期格式">
                  <Toggle checked={usability.autoConvert} onChange={() => setUsability({ ...usability, autoConvert: !usability.autoConvert })} />
                </ConfigRow>
                {usability.autoConvert && (
                  <ConfigRow label="转换目标格式" desc="自动转换的目标长期格式">
                    <Select value={usability.targetFormat} options={TARGET_FORMATS} onChange={(v) => setUsability({ ...usability, targetFormat: v })} />
                  </ConfigRow>
                )}

                <ConfigRow label="渲染验证" desc="调用标准阅读器渲染，截图 + 文本提取验证">
                  <Toggle checked={usability.renderVerify} onChange={() => setUsability({ ...usability, renderVerify: !usability.renderVerify })} />
                </ConfigRow>
                {usability.renderVerify && (
                  <ConfigRow label="渲染超时阈值" desc="单个文件渲染验证超时时间">
                    <NumberInput value={usability.renderTimeout} onChange={(v) => setUsability({ ...usability, renderTimeout: v })} min={5} max={120} suffix="秒" />
                  </ConfigRow>
                )}

                <ConfigRow label="扫描件 DPI 检测" desc="扫描件分辨率 ≥ 300 DPI">
                  <Toggle checked={usability.dpiCheck} onChange={() => setUsability({ ...usability, dpiCheck: !usability.dpiCheck })} />
                </ConfigRow>
                <ConfigRow label="字体嵌入检测" desc="OFD 必备字体（标宋/仿宋/楷体/黑体）嵌入检查">
                  <Toggle checked={usability.fontEmbedCheck} onChange={() => setUsability({ ...usability, fontEmbedCheck: !usability.fontEmbedCheck })} />
                </ConfigRow>
                <ConfigRow label="分辨率检测" desc="图像文件分辨率合规检查">
                  <Toggle checked={usability.resolutionCheck} onChange={() => setUsability({ ...usability, resolutionCheck: !usability.resolutionCheck })} />
                </ConfigRow>
              </div>
            </div>
          )}

          {/* ======================== 安全性 ======================== */}
          {activeTab === 'security' && (
            <div className="divide-y divide-slate-100">
              <div className="p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-1">安全性检测配置</h3>
                <p className="text-xs text-slate-400 mb-4">无病毒 · 权限可控 · 涉密合规 · 防泄露</p>

                <ConfigRow label="病毒扫描" desc="集成 ClamAV 引擎，实时扫描文件">
                  <Toggle checked={security.virusScan} onChange={() => setSecurity({ ...security, virusScan: !security.virusScan })} />
                </ConfigRow>
                {security.virusScan && (
                  <ConfigRow label="病毒库更新频率">
                    <Select value={security.virusUpdateFreq} options={VIRUS_UPDATE_FREQS} onChange={(v) => setSecurity({ ...security, virusUpdateFreq: v })} />
                  </ConfigRow>
                )}

                <ConfigRow label="敏感信息筛查" desc="基于正则/词库筛查敏感信息">
                  <Toggle checked={security.sensitiveCheck} onChange={() => setSecurity({ ...security, sensitiveCheck: !security.sensitiveCheck })} />
                </ConfigRow>
                {security.sensitiveCheck && (
                  <>
                    <div className="py-3 px-4">
                      <span className="text-xs text-slate-500 mb-2 block">敏感词库（检测到以下类型信息时触发预警或脱敏）</span>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {security.sensitiveKeywords.map((kw) => (
                          <TagBadge
                            key={kw}
                            label={kw}
                            onRemove={() => removeTag(security.sensitiveKeywords, (v) => setSecurity({ ...security, sensitiveKeywords: v }), kw)}
                          />
                        ))}
                      </div>
                      <select
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-sky-400"
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v) { addTag(security.sensitiveKeywords, (list) => setSecurity({ ...security, sensitiveKeywords: list }), 20, v); e.target.value = ''; }
                        }}
                      >
                        <option value="">+ 添加敏感词</option>
                        {SENSITIVE_KEYWORD_OPTIONS.filter((k) => !security.sensitiveKeywords.includes(k)).map((k) => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                    </div>
                    <ConfigRow label="脱敏处理" desc="检测到敏感信息时自动脱敏处理">
                      <Toggle checked={security.desensitize} onChange={() => setSecurity({ ...security, desensitize: !security.desensitize })} />
                    </ConfigRow>
                  </>
                )}

                <ConfigRow label="密级匹配校验" desc="档案密级与用户安全级别匹配检查">
                  <Toggle checked={security.classificationCheck} onChange={() => setSecurity({ ...security, classificationCheck: !security.classificationCheck })} />
                </ConfigRow>
                <ConfigRow label="权限校验" desc="RBAC 归档 / 检测操作权限校验">
                  <Toggle checked={security.permissionCheck} onChange={() => setSecurity({ ...security, permissionCheck: !security.permissionCheck })} />
                </ConfigRow>
                <ConfigRow label="传输加密" desc="HTTPS 强制加密传输">
                  <Toggle checked={security.transportEncryption} onChange={() => setSecurity({ ...security, transportEncryption: !security.transportEncryption })} />
                </ConfigRow>
                <ConfigRow label="动态水印" desc="预览/下载时自动添加动态水印">
                  <Toggle checked={security.dynamicWatermark} onChange={() => setSecurity({ ...security, dynamicWatermark: !security.dynamicWatermark })} />
                </ConfigRow>
              </div>
            </div>
          )}

        </div>

        {/* ======================== 检测节点配置（始终显示） ======================== */}
        <div className="bg-white rounded-xl border border-slate-200 mt-4 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">检测节点配置</h3>
          <p className="text-xs text-slate-400 mb-4">PDF 方案强调"归档、移交、长期保存三节点都要检"，避免一检了之</p>

          <div className="divide-y divide-slate-100">
            <ConfigRow label="前置检测（归档前）" desc="元数据必填项校验 + 附件关联 + 格式预警">
              <Toggle checked={nodes.preArchive} onChange={() => setNodes({ ...nodes, preArchive: !nodes.preArchive })} />
            </ConfigRow>
            <ConfigRow label="归档触发检测" desc="四性全项检测，必须 100% 通过方可归档">
              <Toggle checked={nodes.archiveTrigger} onChange={() => setNodes({ ...nodes, archiveTrigger: !nodes.archiveTrigger })} />
            </ConfigRow>
            <ConfigRow label="移交进馆检测" desc="二次校验，报告互认，交叉验证，避免前端过后端卡">
              <Toggle checked={nodes.transferCheck} onChange={() => setNodes({ ...nodes, transferCheck: !nodes.transferCheck })} />
            </ConfigRow>
            <ConfigRow label="长期保存抽检" desc="定期随机抽取档案复测可用性/真实性/安全性">
              <Toggle checked={nodes.longTermSpotCheck} onChange={() => setNodes({ ...nodes, longTermSpotCheck: !nodes.longTermSpotCheck })} />
            </ConfigRow>
            {nodes.longTermSpotCheck && (
              <div className="flex items-center gap-6 py-3 px-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">抽检周期：</span>
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setNodes({ ...nodes, spotCheckPeriod: 'year' })}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        nodes.spotCheckPeriod === 'year' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
                      }`}
                    >
                      每年
                    </button>
                    <button
                      type="button"
                      onClick={() => setNodes({ ...nodes, spotCheckPeriod: 'quarter' })}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        nodes.spotCheckPeriod === 'quarter' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'
                      }`}
                    >
                      每季度
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">抽取比例：</span>
                  <NumberInput value={nodes.spotCheckRatio} onChange={(v) => setNodes({ ...nodes, spotCheckRatio: v })} min={1} max={100} suffix="%" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ======================== 底部操作区 ======================== */}
        <div className="flex items-center justify-between mt-6 pb-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              恢复默认
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleRunBatch()}
              disabled={running}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
              {running ? '检测中…' : '立即执行检测'}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中…' : '保存配置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InspectionConfigPage;

