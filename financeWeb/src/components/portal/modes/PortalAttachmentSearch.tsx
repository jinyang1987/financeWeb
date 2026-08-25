/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PortalAttachmentSearch — 门户「附件检索」模式
 *
 * 对齐后台「档案查询 → 附件检索」的能力：
 *   - 左侧原始凭证类型树（全量类型分类参考，见 types/sourceDocument.ts）
 *   - 搜索：所属凭证号 / 单据编号 / 摘要 / 对方单位 / 业务类型 / 载体 / 日期 / 金额
 *   - 展示四性检测状态，点击行 → 所属记账凭证详情（附件权限门控）
 */

import React, { useMemo, useState } from 'react';
import {
  Search, FileText, ChevronDown, ChevronRight, Package, Calendar,
  DollarSign, Building2, Monitor, X,
} from 'lucide-react';
import { usePortalData } from '../../../hooks/usePortalData';
import { usePortalStore } from '../../../stores/portalStore';
import { usePagination } from '../../../hooks/usePagination';
import PaginationBar from '../../PaginationBar';
import { SOURCE_DOC_TYPE_TREE } from '../../../types/sourceDocument';
import type { SourceDocument, SourceDocTypeNode } from '../../../types/sourceDocument';
import type { ArchiveRecord } from '../../../types';

interface PortalAttachmentSearchProps {
  onOpenDetail: (record: ArchiveRecord) => void;
}

const BUSINESS_CATEGORY_OPTIONS = ['', '采购', '销售', '费用', '资产', '薪酬', '存货', '资金', '结算', '特殊'];

/** 四性检测状态汇总 */
function checkState(doc: SourceDocument): 'pass' | 'warn' | 'fail' {
  const { real, complete, usable, safe } = doc.checks;
  if (real && complete && usable && safe) return 'pass';
  if (real || complete || usable || safe) return 'warn';
  return 'fail';
}

// ── 类型树面板 ──
const TypeTree: React.FC<{
  selectedCode: string | null;
  selectedCategory: string | null;
  onSelect: (code: string | null, category: string | null) => void;
}> = ({ selectedCode, selectedCategory, onSelect }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['external', 'internal']));

  const toggleExpand = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const handleNodeClick = (node: SourceDocTypeNode) => {
    if (node.children && node.children.length > 0) {
      toggleExpand(node.code);
      onSelect(null, node.code);
    } else {
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
          type="button"
          onClick={() => handleNodeClick(node)}
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left rounded-md transition-colors cursor-pointer ${
            isSelected
              ? 'bg-sky-50 text-sky-700 font-medium'
              : isCategoryActive
                ? 'bg-slate-100 text-slate-800'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          ) : (
            <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          )}
          <span className="text-xs truncate flex-1">{node.label}</span>
        </button>
        {hasChildren && isExpanded && (
          <div>{node.children!.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="w-52 shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
      <div className="px-3 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">原始凭证类型</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSelect(null, null)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
          !selectedCode && !selectedCategory ? 'bg-sky-50 text-sky-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
        }`}
      >
        <FileText className="w-3.5 h-3.5" />全部类型
      </button>
      <div className="border-t border-slate-100 pt-1">
        {SOURCE_DOC_TYPE_TREE.map((root) => renderNode(root, 0))}
      </div>
    </div>
  );
};

const PortalAttachmentSearch: React.FC<PortalAttachmentSearchProps> = ({ onOpenDetail }) => {
  const { sourceDocs, allRecords } = usePortalData();
  const portalKeyword = usePortalStore((s) => s.portalKeyword);
  const setPortalKeyword = usePortalStore((s) => s.setPortalKeyword);

  const [selectedTypeCode, setSelectedTypeCode] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [businessCategory, setBusinessCategory] = useState('');
  const [carrierType, setCarrierType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [counterpartyQuery, setCounterpartyQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const recordById = useMemo(() => new Map(allRecords.map((r) => [r.id, r])), [allRecords]);

  const filtered = useMemo(() => {
    let rows = sourceDocs;

    if (selectedTypeCode) rows = rows.filter((d) => d.docTypeCode === selectedTypeCode);
    if (selectedCategory) {
      const codes = new Set<string>();
      const collect = (n: SourceDocTypeNode) => {
        codes.add(n.code);
        if (n.children) n.children.forEach(collect);
      };
      const catNode = SOURCE_DOC_TYPE_TREE.find((n) => n.code === selectedCategory);
      if (catNode) collect(catNode);
      rows = rows.filter((d) => codes.has(d.docTypeCode));
    }
    if (businessCategory) rows = rows.filter((d) => d.businessCategory === businessCategory);
    if (carrierType) rows = rows.filter((d) => d.carrierType === carrierType);
    if (dateFrom) rows = rows.filter((d) => d.transactionDate >= dateFrom);
    if (dateTo) rows = rows.filter((d) => d.transactionDate <= dateTo);
    if (amountMin) rows = rows.filter((d) => Math.abs(d.amountLower) >= Number(amountMin));
    if (amountMax) rows = rows.filter((d) => Math.abs(d.amountLower) <= Number(amountMax));
    if (counterpartyQuery.trim()) {
      const q = counterpartyQuery.toLowerCase().trim();
      rows = rows.filter((d) =>
        d.counterpartyName.toLowerCase().includes(q) || (d.counterpartyTaxId || '').toLowerCase().includes(q));
    }
    const kw = portalKeyword.trim().toLowerCase();
    if (kw) {
      rows = rows.filter((d) =>
        d.documentNo.toLowerCase().includes(kw) ||
        d.parentVoucherNo.toLowerCase().includes(kw) ||
        d.docTypeName.toLowerCase().includes(kw) ||
        d.counterpartyName.toLowerCase().includes(kw) ||
        d.summary.toLowerCase().includes(kw) ||
        Object.values(d.extFields || {}).some((v) => String(v).toLowerCase().includes(kw)),
      );
    }
    return [...rows].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  }, [sourceDocs, selectedTypeCode, selectedCategory, businessCategory, carrierType, dateFrom, dateTo, amountMin, amountMax, counterpartyQuery, portalKeyword]);

  const { pageData, currentPage, totalPages, totalItems, pageSize, setPage, setPageSize } =
    usePagination(filtered, { defaultPageSize: 20 });

  const activeFilterCount = [
    selectedTypeCode, selectedCategory, businessCategory, carrierType,
    dateFrom, dateTo, amountMin, amountMax, counterpartyQuery, portalKeyword,
  ].filter(Boolean).length;

  const clearAll = () => {
    setSelectedTypeCode(null); setSelectedCategory(null); setBusinessCategory('');
    setCarrierType(''); setDateFrom(''); setDateTo(''); setAmountMin(''); setAmountMax('');
    setCounterpartyQuery(''); setPortalKeyword('');
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部：标题 + 筛选开关 */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-slate-700">原始凭证附件检索</span>
          <span className="text-[11px] text-slate-400">共 {filtered.length} 份附件 · 按所属记账凭证号查找 · 点击行查看所属凭证</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer border ${
              showFilters ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            筛选{activeFilterCount > 0 && <span className="bg-sky-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearAll}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 cursor-pointer">
              <X className="w-3 h-3" />清除
            </button>
          )}
        </div>
      </div>

      {/* 筛选栏（可折叠） */}
      {showFilters && (
        <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5 max-w-6xl">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text" placeholder="搜索所属凭证号、单据编号、摘要…"
                value={portalKeyword} onChange={(e) => setPortalKeyword(e.target.value)}
                className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl w-full focus:outline-none focus:border-sky-300"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5" />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="border border-slate-200 rounded px-2 py-1.5 text-xs w-32" />
              <span>至</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="border border-slate-200 rounded px-2 py-1.5 text-xs w-32" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <DollarSign className="w-3.5 h-3.5" />
              <input type="number" placeholder="最低" value={amountMin} onChange={(e) => setAmountMin(e.target.value)}
                className="border border-slate-200 rounded px-2 py-1.5 text-xs w-24" />
              <span>至</span>
              <input type="number" placeholder="最高" value={amountMax} onChange={(e) => setAmountMax(e.target.value)}
                className="border border-slate-200 rounded px-2 py-1.5 text-xs w-24" />
            </div>
            <div className="relative">
              <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input type="text" placeholder="对方单位" value={counterpartyQuery} onChange={(e) => setCounterpartyQuery(e.target.value)}
                className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl w-44" />
            </div>
            <select value={businessCategory} onChange={(e) => setBusinessCategory(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2 py-2 bg-white">
              {BUSINESS_CATEGORY_OPTIONS.map((o) => <option key={o || 'all'} value={o}>{o || '全部业务类型'}</option>)}
            </select>
            <select value={carrierType} onChange={(e) => setCarrierType(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-2 py-2 bg-white">
              <option value="">全部载体</option>
              <option value="electronic">纯电子</option>
              <option value="paper">纸质数字化</option>
            </select>
          </div>
        </div>
      )}

      {/* 主体：类型树 + 结果表格 */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <TypeTree
          selectedCode={selectedTypeCode}
          selectedCategory={selectedCategory}
          onSelect={(code, category) => { setSelectedTypeCode(code); setSelectedCategory(category); }}
        />
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Search className="w-12 h-12 text-slate-200 mb-3" />
                <p className="text-sm font-medium">未找到匹配的原始凭证附件</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                      <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">单据编号</th>
                      <th className="px-4 py-3 text-left text-[13px] font-semibold w-28">类型</th>
                      <th className="px-4 py-3 text-center text-[13px] font-semibold w-16">载体</th>
                      <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">四性</th>
                      <th className="px-4 py-3 text-center text-[13px] font-semibold w-24">日期</th>
                      <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">对方单位</th>
                      <th className="px-4 py-3 text-left text-[13px] font-semibold">摘要</th>
                      <th className="px-4 py-3 text-right text-[13px] font-semibold w-28">金额</th>
                      <th className="px-4 py-3 text-left text-[13px] font-semibold w-24">所属凭证</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((doc) => {
                      const parent = recordById.get(doc.parentRecordId);
                      const st = checkState(doc);
                      return (
                        <tr
                          key={doc.id}
                          onClick={() => parent && onOpenDetail(parent)}
                          title={parent ? '点击查看所属凭证详情' : '该附件所属凭证尚未归档'}
                          className={`border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 transition-colors ${
                            parent ? 'hover:bg-sky-50/50 cursor-pointer' : 'opacity-60 cursor-not-allowed'
                          }`}
                        >
                          <td className="px-4 py-3 font-mono text-[13px] font-semibold text-slate-800 truncate" title={doc.documentNo}>
                            {doc.documentNo}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">
                              {doc.docTypeName}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {doc.carrierType === 'electronic' ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 whitespace-nowrap">
                                <Monitor className="w-2.5 h-2.5" />电子
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">纸质</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                              st === 'pass' ? 'bg-emerald-50 text-emerald-600' : st === 'warn' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'
                            }`}>
                              {st === 'pass' ? '四性通过' : st === 'warn' ? '部分异常' : '四性失败'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-[13px] text-slate-600">{doc.transactionDate}</td>
                          <td className="px-4 py-3 text-[13px] text-slate-600 truncate" title={doc.counterpartyName}>
                            {doc.counterpartyName || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-800 truncate" title={doc.summary}>
                            {doc.summary || '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-800">
                            ¥{doc.amountLower.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 font-mono text-[13px] truncate">
                            {parent
                              ? <span className="text-sky-700" title={`所属凭证 ${parent.voucherNo}`}>{parent.voucherNo}</span>
                              : <span className="text-slate-300">未归档</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 分页栏（底置） */}
          {filtered.length > 0 && (
            <div className="shrink-0 px-5 pb-3">
              <PaginationBar
                centered
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortalAttachmentSearch;
