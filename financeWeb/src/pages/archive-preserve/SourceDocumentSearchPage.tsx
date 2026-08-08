/**
 * 原始凭证附件检索页面
 *
 * 会计实操：原始凭证是记账凭证的附属附件，不独立归档。
 * 检索入口以"所属记账凭证号"为核心，类型树用于附件分类参考。
 *
 * - 左侧类型树：96种原始凭证类型（附件分类参考目录）
 * - 顶部搜索：★ 所属凭证号（核心检索键）、单据编号、日期/金额范围、对方单位
 * - 中央表格：可配置列、排序、点击行展开详情
 * - 详情抽屉：9公共字段 + 类型扩展字段 + 所属记账凭证追溯
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Search, X, ChevronRight, ChevronDown, FileText, Filter, ArrowUpDown,
  Building2, Calendar, DollarSign, Tag, Package, User, Hash, FileSpreadsheet,
  CheckCircle2, AlertTriangle, XCircle, ExternalLink, Monitor, StickyNote,
} from 'lucide-react';
import { useSourceDocumentStore } from '../../stores/sourceDocumentStore';
import { useArchiveStore } from '../../stores/archiveStore';
import { SOURCE_DOC_TYPE_TREE, flattenTypeTree, getExtFieldDefs } from '../../types/sourceDocument';
import type { SourceDocument, SourceDocTypeNode, SourceDocExtFieldDef } from '../../types/sourceDocument';
import { FieldGrid } from '../../components/common/DetailTable';

// ── 工具 ──
const TYPE_LABEL_MAP = flattenTypeTree(SOURCE_DOC_TYPE_TREE);

const BUSINESS_CATEGORY_OPTIONS = [
  { value: '', label: '全部业务类型' },
  { value: '采购', label: '采购' },
  { value: '销售', label: '销售' },
  { value: '费用', label: '费用' },
  { value: '资产', label: '资产' },
  { value: '薪酬', label: '薪酬' },
  { value: '存货', label: '存货' },
  { value: '资金', label: '资金' },
  { value: '结算', label: '结算' },
  { value: '特殊', label: '特殊' },
];

// ── 金额格式化 ──
function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── 四性检测状态图标 ──
const CheckStatusIcon: React.FC<{ checks: SourceDocument['checks'] }> = ({ checks }) => {
  const allPassed = checks.real && checks.complete && checks.usable && checks.safe;
  const anyFailed = !checks.real || !checks.complete || !checks.usable || !checks.safe;
  if (allPassed) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (anyFailed) return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
  return <XCircle className="w-3.5 h-3.5 text-red-500" />;
};

// ═══════════════════════════════════════════════════════════════════
// 子组件：类型树
// ═══════════════════════════════════════════════════════════════════
const TypeTreePanel: React.FC<{
  selectedCode: string | null;
  selectedCategory: string | null;
  onSelect: (code: string | null, category: string | null) => void;
}> = ({ selectedCode, selectedCategory, onSelect }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['external', 'internal']));

  const toggleExpand = (code: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const handleNodeClick = (node: SourceDocTypeNode) => {
    if (node.children && node.children.length > 0) {
      // 有子节点 → 切换展开 + 按大类筛选
      toggleExpand(node.code);
      onSelect(null, node.code);
    } else {
      // 叶子节点 → 精确筛选
      onSelect(node.code, null);
    }
  };

  const renderNode = (node: SourceDocTypeNode, depth: number) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expanded.has(node.code);
    const isSelected = selectedCode === node.code;
    const isCategoryActive = selectedCategory === node.code;

    return (
      <div key={node.code}>
        <button
          onClick={() => handleNodeClick(node)}
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left rounded-md transition-colors
            ${isSelected
              ? 'bg-sky-50 text-sky-700 font-medium'
              : isCategoryActive
                ? 'bg-slate-100 text-slate-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
            }
          `}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {hasChildren ? (
            isExpanded
              ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          ) : (
            <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          )}
          <span className="text-xs truncate flex-1">{node.label}</span>
          {hasChildren && (
            <span className="text-[10px] text-slate-400 shrink-0">
              {node.children!.length}
            </span>
          )}
        </button>

        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-56 shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
      <div className="px-3 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">原始凭证类型</span>
        </div>
      </div>

      {/* 全部 */}
      <button
        onClick={() => onSelect(null, null)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors
          ${!selectedCode && !selectedCategory
            ? 'bg-sky-50 text-sky-700 font-medium'
            : 'text-slate-600 hover:bg-slate-50'
          }`}
      >
        <FileSpreadsheet className="w-3.5 h-3.5" />
        全部类型
      </button>

      <div className="border-t border-slate-100 pt-1">
        {SOURCE_DOC_TYPE_TREE.map(root => renderNode(root, 0))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 子组件：搜索结果表格
// ═══════════════════════════════════════════════════════════════════
const ResultsTable: React.FC<{
  documents: SourceDocument[];
  onRowClick: (doc: SourceDocument) => void;
}> = ({ documents, onRowClick }) => {
  const [sortField, setSortField] = useState<'transactionDate' | 'amountLower'>('transactionDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const arr = [...documents];
    arr.sort((a, b) => {
      let va: number, vb: number;
      if (sortField === 'transactionDate') {
        va = new Date(a.transactionDate).getTime();
        vb = new Date(b.transactionDate).getTime();
      } else {
        va = Math.abs(a.amountLower);
        vb = Math.abs(b.amountLower);
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [documents, sortField, sortDir]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortHeader: React.FC<{ field: typeof sortField; label: string }> = ({ field, label }) => (
    <th
      className="px-3 py-2 text-left cursor-pointer hover:bg-slate-50 select-none"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        <ArrowUpDown className={`w-3 h-3 ${sortField === field ? 'text-sky-500' : 'text-slate-300'}`} />
      </div>
    </th>
  );

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full">
        <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
          <tr>
            <th className="px-3 py-2 w-8"></th>
            <SortHeader field="transactionDate" label="业务日期" />
            <th className="px-3 py-2 text-left">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">单据编号</span>
            </th>
            <th className="px-3 py-2 text-left">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">凭证类型</span>
            </th>
            <SortHeader field="amountLower" label="金额" />
            <th className="px-3 py-2 text-left">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">对方单位</span>
            </th>
            <th className="px-3 py-2 text-left hidden xl:table-cell">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">业务分类</span>
            </th>
            <th className="px-3 py-2 text-left hidden xl:table-cell">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">载体</span>
            </th>
            <th className="px-3 py-2 text-center w-16">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">四性</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">
                未找到匹配的原始凭证
              </td>
            </tr>
          ) : (
            sorted.map((doc) => (
              <tr
                key={doc.id}
                className="hover:bg-sky-50/50 cursor-pointer transition-colors group"
                onClick={() => onRowClick(doc)}
              >
                <td className="px-3 py-2.5">
                  <div className="flex justify-center">
                    <CheckStatusIcon checks={doc.checks} />
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-xs text-slate-600 whitespace-nowrap">{doc.transactionDate}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-xs font-medium text-slate-800 font-mono">{doc.documentNo}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-xs text-slate-600">{doc.docTypeName}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs font-mono font-medium ${doc.amountLower < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    ¥{fmt(Math.abs(doc.amountLower))}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-xs text-slate-600 truncate max-w-[160px] block">{doc.counterpartyName}</span>
                </td>
                <td className="px-3 py-2.5 hidden xl:table-cell">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{doc.businessCategory}</span>
                </td>
                <td className="px-3 py-2.5 hidden xl:table-cell">
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                    doc.carrierType === 'electronic'
                      ? 'bg-sky-50 text-sky-600'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    {doc.carrierType === 'electronic' ? '电子' : '纸质'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <CheckStatusIcon checks={doc.checks} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 子组件：详情抽屉
// ═══════════════════════════════════════════════════════════════════
const SourceDocDrawer: React.FC<{
  doc: SourceDocument | null;
  onClose: () => void;
}> = ({ doc, onClose }) => {
  const parentRecord = useArchiveStore(s =>
    doc ? s.records.find(r => r.id === doc.parentRecordId) : null
  );

  const extDefs = useMemo(() =>
    doc ? getExtFieldDefs(doc.docTypeCode) : [],
  [doc]);

  if (!doc) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-sky-600" />
          <div>
            <div className="text-sm font-semibold text-slate-800">{doc.docTypeName}</div>
            <div className="text-xs text-slate-500 font-mono">{doc.documentNo}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* ── 1. 基础标识区 ── */}
        <Section title="基础标识" icon={<Hash className="w-3.5 h-3.5" />}>
          <FieldGrid columns={2} fields={[
            { label: '单据编号', value: doc.documentNo, mono: true },
            { label: '凭证类型', value: doc.docTypeName },
            { label: '业务日期', value: doc.transactionDate, mono: true },
            { label: '业务分类', value: <Badge>{doc.businessCategory}</Badge> },
            {
              label: '载体类型',
              value: (
                <Badge color={doc.carrierType === 'electronic' ? 'blue' : 'amber'}>
                  {doc.carrierType === 'electronic' ? (<span className="inline-flex items-center gap-0.5"><Monitor className="w-3 h-3" /> 纯电子</span>) : (<span className="inline-flex items-center gap-0.5"><FileText className="w-3 h-3" /> 纸质数字化</span>)}
                </Badge>
              ),
            },
          ]} />
        </Section>

        {/* ── 2. 主体信息区 ── */}
        <Section title="对方主体" icon={<Building2 className="w-3.5 h-3.5" />}>
          <FieldGrid columns={2} fields={[
            { label: '对方单位', value: doc.counterpartyName },
            ...(doc.counterpartyTaxId ? [{ label: '纳税人识别号', value: doc.counterpartyTaxId, mono: true }] : []),
            ...(doc.counterpartyAddress ? [{ label: '地址电话', value: doc.counterpartyAddress }] : []),
            ...(doc.counterpartyBankAccount ? [{ label: '开户行及账号', value: doc.counterpartyBankAccount, mono: true }] : []),
          ]} />
        </Section>

        {/* ── 3. 金额区 ── */}
        <Section title="金额信息" icon={<DollarSign className="w-3.5 h-3.5" />}>
          <FieldGrid columns={2} fields={[
            {
              label: '小写金额', value: `¥${fmt(Math.abs(doc.amountLower))}`, mono: true,
              valueClassName: doc.amountLower < 0 ? 'text-red-600 font-medium' : 'text-emerald-700 font-medium',
            },
            { label: '大写金额', value: doc.amountUpper },
          ]} />
        </Section>

        {/* ── 4. 业务摘要 ── */}
        <Section title="业务描述" icon={<FileText className="w-3.5 h-3.5" />}>
          <div className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3">
            {doc.summary}
          </div>
        </Section>

        {/* ── 5. 类型扩展字段 ── */}
        {extDefs.length > 0 && (
          <Section title={`${doc.docTypeName} - 专有字段`} icon={<Tag className="w-3.5 h-3.5" />}>
            <FieldGrid columns={1} fields={[
              ...extDefs
                .filter(def => {
                  const val = doc.extFields[def.key];
                  return val !== undefined && val !== null && val !== '';
                })
                .map(def => ({
                  label: def.isRequired
                    ? <span><span className="text-red-400 mr-0.5">*</span>{def.label}</span>
                    : def.label,
                  value: String(doc.extFields[def.key]),
                  mono: def.dataType === 'number',
                })),
              /* 未在定义中但存在于 extFields 的字段 */
              ...Object.entries(doc.extFields)
                .filter(([k, v]) => !extDefs.find(d => d.key === k) && v !== null && v !== undefined && v !== '')
                .map(([k, v]) => ({ label: k, value: String(v), mono: true })),
            ]} />
          </Section>
        )}

        {/* ── 6. 审批信息 ── */}
        {(doc.preparer || doc.reviewer) && (
          <Section title="审批信息" icon={<User className="w-3.5 h-3.5" />}>
            <FieldGrid columns={2} fields={[
              ...(doc.preparer ? [{ label: '制单人', value: doc.preparer }] : []),
              ...(doc.reviewer ? [{ label: '审核人', value: doc.reviewer }] : []),
              { label: '附件张数', value: String(doc.attachmentCount) },
            ]} />
          </Section>
        )}

        {/* ── 7. 四性检测 ── */}
        <Section title="四性检测状态" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
          <div className="grid grid-cols-2 gap-2">
            <CheckBadge label="真实性" passed={doc.checks.real} />
            <CheckBadge label="完整性" passed={doc.checks.complete} />
            <CheckBadge label="可用性" passed={doc.checks.usable} />
            <CheckBadge label="安全性" passed={doc.checks.safe} />
          </div>
        </Section>

        {/* ── 8. 关联追溯 ── */}
        <Section title="关联追溯" icon={<ExternalLink className="w-3.5 h-3.5" />}>
          {parentRecord ? (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-sky-50 border border-sky-200 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-sky-700">
                  所属记账凭证：{parentRecord.voucherNo}
                </div>
                <div className="text-[11px] text-sky-500 font-mono mt-0.5">
                  {parentRecord.archiveCode}
                </div>
                <div className="text-[11px] text-sky-500 mt-0.5">
                  {parentRecord.department} · {parentRecord.archiveType} · ¥{fmt(parentRecord.amount)}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-xs text-slate-400">未关联记账凭证</span>
          )}
          {doc.volumeId && (
            <div className="text-[11px] text-slate-500 mt-2">
              所属案卷：{doc.volumeId}
              {doc.boxId && <span className="ml-3">档案盒：{doc.boxId}</span>}
            </div>
          )}
        </Section>

        {/* ── 9. 电子文件 ── */}
        {doc.files.length > 0 && (
          <Section title={`电子文件 (${doc.files.length})`} icon={<FileText className="w-3.5 h-3.5" />}>
            {doc.files.map((f, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-700 truncate">{f.name}</div>
                  <div className="text-[10px] text-slate-500">{f.type} · {f.size}</div>
                </div>
                {f.signatureVerified && (
                  <span title="签名已验证"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 ml-2" /></span>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* ── 备注 ── */}
        {doc.remarks && (
          <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-3">
            <StickyNote className="w-3 h-3 inline mr-0.5" />{doc.remarks}
          </div>
        )}
      </div>
    </div>
  );
};

// ── 辅助组件 ──
const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-slate-500">{icon}</span>
      <span className="text-xs font-semibold text-slate-700">{title}</span>
    </div>
    <div className="space-y-2">
      {children}
    </div>
  </div>
);

const Badge: React.FC<{ children: React.ReactNode; color?: 'blue' | 'amber' | 'slate' }> = ({ children, color = 'slate' }) => {
  const colors = {
    blue: 'bg-sky-50 text-sky-600',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-600',
  };
  return <span className={`text-[11px] px-1.5 py-0.5 rounded ${colors[color]}`}>{children}</span>;
};

const CheckBadge: React.FC<{ label: string; passed: boolean }> = ({ label, passed }) => (
  <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] ${
    passed ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
  }`}>
    {passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
    {label}
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// 主页面
// ═══════════════════════════════════════════════════════════════════
const SourceDocumentSearchPage: React.FC = () => {
  const store = useSourceDocumentStore();

  const [showFilters, setShowFilters] = useState(false);

  const handleClearFilters = useCallback(() => {
    store.setSearchQuery('');
    store.setSelectedTypeCode(null);
    store.setSelectedCategory(null);
    store.setSelectedBusinessCategory(null);
    store.setDateFrom('');
    store.setDateTo('');
    store.setAmountMin(null);
    store.setAmountMax(null);
    store.setCounterpartyQuery('');
    store.setCarrierTypeFilter(null);
  }, [store]);

  const activeFilterCount = [
    store.selectedTypeCode, store.selectedCategory, store.selectedBusinessCategory,
    store.dateFrom, store.dateTo, store.amountMin, store.amountMax,
    store.counterpartyQuery, store.carrierTypeFilter,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ── 页面标题栏 ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">原始凭证附件检索</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            共 {store.filteredDocuments.length} 份附件 · 按所属记账凭证号查找 · 96种类型仅供参考
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors
              ${showFilters ? 'bg-sky-50 text-sky-600 border border-sky-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            <Filter className="w-3.5 h-3.5" />
            筛选
            {activeFilterCount > 0 && (
              <span className="bg-sky-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── 筛选栏（可折叠） ── */}
      {showFilters && (
        <div className="px-5 py-3 bg-white border-b border-slate-200 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* 全文搜索 */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="搜索所属凭证号、单据编号、摘要…"
                value={store.searchQuery}
                onChange={e => store.setSearchQuery(e.target.value)}
                className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-64 focus:outline-none focus:border-sky-300"
              />
            </div>

            {/* 日期范围 */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5" />
              <input type="date" value={store.dateFrom} onChange={e => store.setDateFrom(e.target.value)}
                className="border border-slate-200 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:border-sky-300" />
              <span>至</span>
              <input type="date" value={store.dateTo} onChange={e => store.setDateTo(e.target.value)}
                className="border border-slate-200 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:border-sky-300" />
            </div>

            {/* 金额范围 */}
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <DollarSign className="w-3.5 h-3.5" />
              <input type="number" placeholder="最低金额"
                value={store.amountMin ?? ''} onChange={e => store.setAmountMin(e.target.value ? Number(e.target.value) : null)}
                className="border border-slate-200 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:border-sky-300" />
              <span>至</span>
              <input type="number" placeholder="最高金额"
                value={store.amountMax ?? ''} onChange={e => store.setAmountMax(e.target.value ? Number(e.target.value) : null)}
                className="border border-slate-200 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:border-sky-300" />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* 对方单位 */}
            <div className="relative">
              <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="对方单位名称/税号…"
                value={store.counterpartyQuery}
                onChange={e => store.setCounterpartyQuery(e.target.value)}
                className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-48 focus:outline-none focus:border-sky-300"
              />
            </div>

            {/* 业务类型 */}
            <select
              value={store.selectedBusinessCategory || ''}
              onChange={e => store.setSelectedBusinessCategory(e.target.value || null)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-sky-300"
            >
              {BUSINESS_CATEGORY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* 载体类型 */}
            <select
              value={store.carrierTypeFilter || ''}
              onChange={e => store.setCarrierTypeFilter(e.target.value as 'paper' | 'electronic' | null || null)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-sky-300"
            >
              <option value="">全部载体</option>
              <option value="electronic">纯电子</option>
              <option value="paper">纸质数字化</option>
            </select>

            {/* 清除 */}
            {activeFilterCount > 0 && (
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors"
              >
                <X className="w-3 h-3" />
                清除筛选
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 主体：类型树 + 表格 ── */}
      <div className="flex flex-1 overflow-hidden">
        <TypeTreePanel
          selectedCode={store.selectedTypeCode}
          selectedCategory={store.selectedCategory}
          onSelect={(code, category) => {
            store.setSelectedTypeCode(code);
            store.setSelectedCategory(category);
          }}
        />

        <ResultsTable
          documents={store.filteredDocuments}
          onRowClick={(doc) => store.openDrawer(doc)}
        />
      </div>

      {/* ── 详情抽屉 ── */}
      {store.drawerVisible && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={store.closeDrawer} />
          <SourceDocDrawer
            doc={store.activeDocument}
            onClose={store.closeDrawer}
          />
        </>
      )}
    </div>
  );
};

export default SourceDocumentSearchPage;



