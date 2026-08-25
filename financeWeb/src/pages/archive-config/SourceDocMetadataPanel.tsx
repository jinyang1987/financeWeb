/**
 * 原始凭证元数据配置面板
 *
 * "大而全让客户选"模式：
 * 1. 从原始凭证类型目录（外来/自制/特殊，覆盖全量类型）中选择一种
 * 2. 查看该类型的全部字段（公共字段 + 引用字段集 + 类型特有）
 * 3. 独立开关每个字段的可见性
 * 4. 配置持久化到 localStorage
 *
 * 字段依据：DA/T 95-2022（附录A自制/附录B外来）+ 税务总局发票规定 + 财政票据办法（见 types/sourceDocument.ts）。
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronDown, ChevronRight, Eye, EyeOff, Check, RotateCcw,
  FileText, Tag, Hash, DollarSign, Building2, User, Package,
  FileSpreadsheet, Settings, CheckCircle2,
} from 'lucide-react';
import { SOURCE_DOC_TYPE_TREE, getExtFieldDefs, getStandardBasis, countLeafTypes } from '../../types/sourceDocument';
import type { SourceDocTypeNode } from '../../types/sourceDocument';
import { useSourceDocFieldStore, SOURCE_DOC_COMMON_FIELDS } from '../../stores/sourceDocFieldStore';

// ── 类型选择器（树形下拉） ──
const TypeSelector: React.FC<{
  selectedCode: string | null;
  onSelect: (code: string, label: string) => void;
}> = ({ selectedCode, onSelect }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['external', 'internal']));
  const [search, setSearch] = useState('');

  const toggleExpand = (code: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  // 查找所有叶子节点
  const allLeaves = useMemo(() => {
    const leaves: { code: string; label: string; path: string }[] = [];
    function walk(nodes: SourceDocTypeNode[], parents: string[]) {
      for (const n of nodes) {
        const path = [...parents, n.label].join(' > ');
        if (n.children && n.children.length > 0) {
          walk(n.children, [...parents, n.label]);
        } else {
          leaves.push({ code: n.code, label: n.label, path });
        }
      }
    }
    walk(SOURCE_DOC_TYPE_TREE, []);
    return leaves;
  }, []);

  // 搜索过滤
  const filteredLeaves = useMemo(() => {
    if (!search.trim()) return allLeaves;
    const q = search.toLowerCase();
    return allLeaves.filter(l =>
      l.label.toLowerCase().includes(q) || l.path.toLowerCase().includes(q)
    );
  }, [allLeaves, search]);

  const renderNode = (node: SourceDocTypeNode, depth: number) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expanded.has(node.code);
    const isSelected = selectedCode === node.code && !hasChildren;

    return (
      <div key={node.code}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleExpand(node.code);
            } else {
              onSelect(node.code, node.label);
            }
          }}
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left rounded-md transition-colors
            ${isSelected
              ? 'bg-sky-50 text-sky-700 font-medium'
              : 'text-slate-600 hover:bg-slate-50'
            }
          `}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {hasChildren ? (
            isExpanded
              ? <ChevronDown className="w-3 h-3 shrink-0 text-slate-400" />
              : <ChevronRight className="w-3 h-3 shrink-0 text-slate-400" />
          ) : (
            <FileText className="w-3 h-3 shrink-0 text-slate-400" />
          )}
          <span className="text-xs truncate flex-1">{node.label}</span>
        </button>
        {hasChildren && isExpanded && node.children!.map(c => renderNode(c, depth + 1))}
      </div>
    );
  };

  const selectedLabel = useMemo(() => {
    if (!selectedCode) return null;
    const leaf = allLeaves.find(l => l.code === selectedCode);
    return leaf ? `${leaf.label} (${leaf.path})` : selectedCode;
  }, [selectedCode, allLeaves]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Tag className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">选择原始凭证类型</span>
        {selectedLabel && (
          <span className="text-xs text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full font-medium">
            {selectedLabel}
          </span>
        )}
      </div>

      {/* 搜索框 */}
      <div className="relative mb-2">
        <input
          type="text"
          placeholder="搜索凭证类型…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-3 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-300"
        />
      </div>

      {/* 搜索结果（搜索时显示平铺列表） */}
      {search.trim() ? (
        <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg bg-white">
          {filteredLeaves.length === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-400 text-center">未找到匹配类型</div>
          ) : (
            filteredLeaves.map(l => (
              <button
                key={l.code}
                onClick={() => { onSelect(l.code, l.label); setSearch(''); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors
                  ${selectedCode === l.code
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <span className="font-medium">{l.label}</span>
                <span className="text-slate-400 ml-2 text-[10px]">{l.path}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        /* 树形选择器 */
        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg bg-white p-1">
          {SOURCE_DOC_TYPE_TREE.map(root => renderNode(root, 0))}
        </div>
      )}
    </div>
  );
};

// ── 字段显隐配置表 ──
const FieldConfigTable: React.FC<{ typeCode: string }> = ({ typeCode }) => {
  const { getConfig, toggleField, initConfig, setVisibleKeys } = useSourceDocFieldStore();

  // 获取该类型的扩展字段定义
  const extDefs = useMemo(() => getExtFieldDefs(typeCode), [typeCode]);

  // 初始化
  useEffect(() => {
    const extFields = extDefs.map(d => ({
      key: d.key,
      label: d.label,
      group: d.group,
      required: d.isRequired,
    }));
    initConfig(typeCode, extFields);
  }, [typeCode, extDefs, initConfig]);

  const fields = getConfig(typeCode);
  const visibleCount = fields.filter(f => f.visible).length;
  const totalCount = fields.length;

  const groupLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    basic: { label: '基础标识', icon: <Hash className="w-3.5 h-3.5" /> },
    entity: { label: '对方主体', icon: <Building2 className="w-3.5 h-3.5" /> },
    amount: { label: '金额信息', icon: <DollarSign className="w-3.5 h-3.5" /> },
    business: { label: '业务描述', icon: <FileText className="w-3.5 h-3.5" /> },
    approval: { label: '审批信息', icon: <User className="w-3.5 h-3.5" /> },
    attachment: { label: '附属信息', icon: <Package className="w-3.5 h-3.5" /> },
  };

  // 按分组聚合
  const grouped = useMemo(() => {
    const map = new Map<string, typeof fields>();
    for (const f of fields) {
      const g = f.group || 'basic';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(f);
    }
    return map;
  }, [fields]);

  const handleSelectAll = () => {
    setVisibleKeys(typeCode, fields.map(f => f.key));
  };
  const handleDeselectAll = () => {
    // 只取消非必填字段
    const requiredKeys = fields.filter(f => f.required).map(f => f.key);
    setVisibleKeys(typeCode, requiredKeys);
  };

  // 该类型的规范依据（字段来源的法规/标准）
  const basis = getStandardBasis(typeCode);

  return (
    <div>
      {/* 规范依据 */}
      {basis && (
        <div className="mb-3 px-3 py-2 bg-teal-50/60 border border-teal-200/70 rounded-lg">
          <span className="text-[10px] font-semibold text-teal-700 mr-1.5">字段依据</span>
          <span className="text-[11px] text-teal-600 leading-relaxed">{basis}</span>
        </div>
      )}

      {/* 统计 + 快捷操作 */}
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs text-slate-500">
          展示 <strong className="text-sky-600">{visibleCount}</strong> / {totalCount} 个字段
          {totalCount > SOURCE_DOC_COMMON_FIELDS.length && (
            <span className="text-slate-400 ml-1">
              （含 {totalCount - SOURCE_DOC_COMMON_FIELDS.length} 个类型特有字段）
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={handleSelectAll}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-sky-600 bg-sky-50 rounded-md hover:bg-sky-100 transition-colors">
            <Eye className="w-3 h-3" />
            全部显示
          </button>
          <button onClick={handleDeselectAll}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-500 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">
            <EyeOff className="w-3 h-3" />
            仅必填
          </button>
        </div>
      </div>

      {/* 按分组展示字段 */}
      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([group, groupFields]) => {
          const info = groupLabels[group] || { label: group, icon: <FileText className="w-3.5 h-3.5" /> };
          const groupVisible = groupFields.filter(f => f.visible).length;

          return (
            <div key={group} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                <span className="text-slate-400">{info.icon}</span>
                <span className="text-xs font-semibold text-slate-600">{info.label}</span>
                <span className="text-[10px] text-slate-400">
                  {groupVisible}/{groupFields.length}
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {groupFields.map((field) => (
                  <div
                    key={field.key}
                    className={`flex items-center justify-between px-3 py-2 transition-colors ${
                      field.visible ? 'bg-white' : 'bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <button
                        onClick={() => toggleField(typeCode, field.key)}
                        className={`shrink-0 p-0.5 rounded transition-colors ${
                          field.visible
                            ? 'text-sky-500 hover:text-sky-700 hover:bg-sky-50'
                            : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
                        }`}
                        title={field.visible ? '点击隐藏' : '点击显示'}
                      >
                        {field.visible
                          ? <Eye className="w-3.5 h-3.5" />
                          : <EyeOff className="w-3.5 h-3.5" />
                        }
                      </button>
                      <span className={`text-xs ${field.visible ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                        {field.label}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{field.key}</span>
                      {field.required && (
                        <span className="text-[9px] text-red-400 font-medium">必填</span>
                      )}
                    </div>
                    {/* 公共字段标记 */}
                    {SOURCE_DOC_COMMON_FIELDS.some(cf => cf.key === field.key) && (
                      <span className="text-[9px] text-slate-300 bg-slate-100 px-1 rounded shrink-0">公共</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};

// ── 导出的主面板 ──
const SourceDocMetadataPanel: React.FC = () => {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('');

  const handleSelect = (code: string, label: string) => {
    setSelectedCode(code);
    setSelectedLabel(label);
  };

  return (
    <div>
      {/* 类型总数 + 字段依据 */}
      <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          {countLeafTypes()} 种原始凭证类型 · 字段依据：DA/T 95-2022（附录A自制 / 附录B外来）、
          《发票管理办法》及税务总局公告、《财政票据管理办法》
        </span>
      </div>

      {/* items-start：左栏高度不随右栏字段列表伸缩（2026-08-25 左侧方框高度不定修复） */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* 左侧：类型选择器 */}
        <div className="lg:col-span-1 self-start">
          <div className="border border-slate-200 rounded-xl bg-white p-4 sticky top-4">
            <TypeSelector selectedCode={selectedCode} onSelect={handleSelect} />
          </div>
        </div>

        {/* 右侧：字段配置 */}
        <div className="lg:col-span-2">
          {selectedCode ? (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">
                  {selectedLabel} — 字段显隐配置
                </span>
              </div>
              <FieldConfigTable typeCode={selectedCode} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 border-2 border-dashed border-slate-300 rounded-xl bg-white">
              <div className="text-center">
                <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">请选择原始凭证类型</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SourceDocMetadataPanel;

