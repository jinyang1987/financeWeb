﻿﻿﻿﻿﻿﻿﻿import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  ChevronRight,
  ChevronDown,
  Save,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Check,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchUnitTree, createUnit, createSubUnit, deleteUnit,
} from '../services/api';
import type { UnitItem } from '../services/api';

// ─── 树节点类型（递归）────────────────────────────────
interface UnitTreeNode {
  data: UnitItem;
  children: UnitTreeNode[];
}

/** 将 UnitItem 列表包装成树节点 */
function toNodes(items: UnitItem[]): UnitTreeNode[] {
  return items.map(item => ({ data: item, children: [] }));
}

/** 递归统计所有节点数 */
function countAll(nodes: UnitTreeNode[]): number {
  let count = 0;
  for (const n of nodes) {
    count += 1 + countAll(n.children);
  }
  return count;
}

/** 递归在树中查找节点 */
function findNode(nodes: UnitTreeNode[], id: string): UnitTreeNode | null {
  for (const n of nodes) {
    if (n.data.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

/** 递归删除树中的节点 */
function removeNode(nodes: UnitTreeNode[], id: string): UnitTreeNode[] {
  return nodes
    .filter(n => n.data.id !== id)
    .map(n => ({ ...n, children: removeNode(n.children, id) }));
}

/** 递归更新树中的节点名称 */
function updateNodeName(nodes: UnitTreeNode[], id: string, name: string): UnitTreeNode[] {
  return nodes.map(n => {
    if (n.data.id === id) {
      return { ...n, data: { ...n.data, name } };
    }
    return { ...n, children: updateNodeName(n.children, id, name) };
  });
}

/** 递归添加子节点 */
function addChildNode(
  nodes: UnitTreeNode[],
  parentId: string,
  child: UnitTreeNode,
): UnitTreeNode[] {
  return nodes.map(n => {
    if (n.data.id === parentId) {
      return { ...n, children: [...n.children, child] };
    }
    return { ...n, children: addChildNode(n.children, parentId, child) };
  });
}

// ─── 组件 ──────────────────────────────────────────────
export const UnitManagePanel: React.FC = () => {
  const [tree, setTree] = useState<UnitTreeNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ─── 内联新增状态 ──────────────────────────────────
  // null = 不显示；'__root__' = 新增顶层单位；其他 = 在该 parentId 下新增子单位
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  // ─── 统计 ──────────────────────────────────────────
  const totalUnits = countAll(tree);

  // ─── 加载单位树 ────────────────────────────────────
  const loadUnits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const units = await fetchUnitTree();
      setTree(toNodes(units));
    } catch (err: any) {
      setError(err.message || '加载单位列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUnits(); }, [loadUnits]);

  // ─── 选中节点 ──────────────────────────────────────
  const handleSelect = (node: UnitTreeNode) => {
    setAddingParentId(null);
    setNewCode('');
    setNewName('');
    setSelectedId(node.data.id);
    setFormName(node.data.name);
    setSaved(false);
  };

  const selectedNode = selectedId ? findNode(tree, selectedId) : null;

  // ─── 新增（内联输入） ─────────────────────────────
  const startAdd = (parentId: string | null) => {
    setAddingParentId(parentId);
    setNewCode('');
    setNewName('');
    if (parentId && parentId !== '__root__') {
      setExpandedIds(prev => new Set(prev).add(parentId));
    }
  };

  const cancelAdd = () => {
    setAddingParentId(null);
    setNewCode('');
    setNewName('');
  };

  const handleCreate = async () => {
    const code = newCode.trim();
    const name = newName.trim();
    if (!code || !name) return;

    try {
      if (addingParentId === '__root__') {
        // 创建顶层单位
        const created = await createUnit({ id: code, title: name });
        setTree(prev => [...prev, { data: created, children: [] }]);
      } else if (addingParentId) {
        // 在父单位下创建子单位
        const parent = findNode(tree, addingParentId);
        if (!parent) return;
        const created = await createSubUnit(parent.data.id, { id: code, title: name });
        setTree(prev => addChildNode(prev, addingParentId, { data: created, children: [] }));
        // 自动展开父节点
        setExpandedIds(prev => new Set(prev).add(addingParentId));
      }
      setAddingParentId(null);
      setNewCode('');
      setNewName('');
    } catch (err: any) {
      setError(err.message || '创建单位失败');
    }
  };

  // ─── 展开/折叠 ──────────────────────────────────────
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── 删除单位（带确认） ────────────────────────────
  const handleDelete = async (node: UnitTreeNode) => {
    const subCount = countAll(node.children);
    const msg = subCount > 0
      ? `确定要删除单位「${node.data.name}」及其 ${subCount} 个子单位吗？此操作不可恢复。`
      : `确定要删除单位「${node.data.name}」吗？此操作不可恢复。`;
    if (!window.confirm(msg)) return;

    try {
      await deleteUnit(node.data.fullName);
      setTree(prev => removeNode(prev, node.data.id));
      if (selectedId === node.data.id) {
        setSelectedId(null);
        setFormName('');
      }
    } catch (err: any) {
      setError(err.message || '删除单位失败');
    }
  };

  // ─── 保存名称 ──────────────────────────────────────
  const handleSave = async () => {
    if (!selectedId) return;
    const name = formName.trim();
    if (!name) return;
    setTree(prev => updateNodeName(prev, selectedId, name));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // ─── 右侧删除 ──────────────────────────────────────
  const handleDeleteSelected = () => {
    if (!selectedNode) return;
    handleDelete(selectedNode);
  };

  // ─── 渲染树节点（递归） ────────────────────────────
  const renderNode = (node: UnitTreeNode, level: number = 0) => {
    const isExpanded = expandedIds.has(node.data.id);
    const isSelected = selectedId === node.data.id;
    const isAdding = addingParentId === node.data.id;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.data.id}>
        {/* ── 单位节点行 ── */}
        <div
          className={`flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer transition-all text-sm ${
            isSelected
              ? 'bg-sky-50 text-sky-700 font-bold'
              : 'hover:bg-slate-100 text-slate-700'
          }`}
          style={{ paddingLeft: `${12 + level * 18}px` }}
          onClick={() => handleSelect(node)}
        >
          {/* 展开/折叠按钮 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleExpand(node.data.id); }}
            className={`p-0.5 hover:bg-slate-200 rounded cursor-pointer transition-colors ${
              !hasChildren && 'invisible'
            }`}
          >
            {isExpanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />
            }
          </button>
          <Building2 className="w-4 h-4 text-sky-500 shrink-0" />
          <span className="truncate flex-1 min-w-0">{node.data.name}</span>
          <span className="text-[10px] text-slate-400 ml-0.5 shrink-0">{node.data.code}</span>

          {/* 添加子单位 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); startAdd(node.data.id); }}
            className="p-0.5 hover:bg-sky-100 rounded text-slate-300 hover:text-sky-500 cursor-pointer shrink-0"
            title="添加子单位"
          >
            <Plus className="w-3 h-3" />
          </button>

          {/* 删除 */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleDelete(node); }}
            className="p-0.5 hover:bg-red-100 rounded text-slate-300 hover:text-red-500 cursor-pointer shrink-0"
            title="删除单位"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        {/* ── 子单位区域 ── */}
        {isExpanded && (
          <div>
            {/* 内联新增输入框 */}
            {isAdding && (
              <div
                className="flex items-center gap-1.5 py-1.5 px-2"
                style={{ paddingLeft: `${12 + (level + 1) * 18}px` }}
              >
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="编码"
                  className="w-16 border border-sky-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-500 bg-sky-50/30"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') cancelAdd();
                  }}
                />
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="名称"
                  className="flex-1 min-w-0 border border-sky-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-500 bg-sky-50/30"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') cancelAdd();
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded cursor-pointer"
                  title="确认"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={cancelAdd}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                  title="取消"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 子节点 */}
            {node.children.map(child => renderNode(child, level + 1))}

            {/* 空状态提示 */}
            {!isAdding && node.children.length === 0 && (
              <div
                className="text-[11px] text-slate-400 italic py-1"
                style={{ paddingLeft: `${12 + (level + 1) * 18}px` }}
              >
                暂无子单位
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── 加载状态 ──────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 bg-slate-50">
        <div className="p-3 rounded-full bg-sky-50">
          <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
        </div>
        <span className="text-sm text-slate-500">加载中...</span>
      </div>
    );
  }

  // ─── 主渲染 ──────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-200 bg-slate-50">
      {/* ── 错误提示 ── */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-5 py-2.5 text-sm border-b border-red-100">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 font-bold cursor-pointer text-xs px-2 py-0.5 rounded hover:bg-red-100"
          >
            关闭
          </button>
        </div>
      )}

      {/* ── 顶部统计条 ── */}
      <div className="flex items-center gap-6 px-5 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-sky-500" />
          <span className="text-sm text-slate-500">
            共 <span className="font-bold text-slate-800">{totalUnits}</span> 个单位
          </span>
        </div>
      </div>

      {/* ── 主内容区域 ── */}
      <div className="flex-1 flex min-h-0">
        {/* ── 左侧树面板 ── */}
        <div className="w-64 shrink-0 border-r border-slate-200 bg-white overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-3 px-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">单位层级</span>
            <button
              type="button"
              onClick={() => startAdd('__root__')}
              className="inline-flex items-center gap-1 text-xs bg-sky-600 text-white px-2.5 py-1.5 rounded-md font-bold hover:bg-sky-700 transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              新增单位
            </button>
          </div>

          {/* 顶层单位内联新增 */}
          {addingParentId === '__root__' && (
            <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 bg-sky-50/50 rounded-lg border border-sky-100">
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="编码"
                className="w-16 border border-sky-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') cancelAdd();
                }}
              />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="单位名称"
                className="flex-1 min-w-0 border border-sky-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') cancelAdd();
                }}
              />
              <button
                type="button"
                onClick={handleCreate}
                className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded cursor-pointer"
                title="确认"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={cancelAdd}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                title="取消"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 空状态 */}
          {tree.length === 0 && addingParentId !== '__root__' && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Building2 className="w-10 h-10 mb-2 text-slate-300" />
              <p className="text-xs text-slate-400">暂无单位数据</p>
              <p className="text-xs text-slate-400 mt-1">点击上方"新增单位"创建</p>
            </div>
          )}

          {tree.map(node => renderNode(node))}
        </div>

        {/* ── 右侧表单面板 ── */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
          {selectedNode ? (
            <div className="max-w-xl mx-auto">
              {/* 表单头部 */}
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200">
                <div className="p-2 rounded-lg bg-sky-100">
                  <Building2 className="w-5 h-5 text-sky-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-800">单位信息</h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{selectedNode.data.name}</p>
                </div>
              </div>

              {/* 表单卡片 */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="space-y-5">
                  {/* 单位编码（只读） */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">单位编码</label>
                    <input
                      type="text"
                      value={selectedNode.data.code}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
                      disabled
                    />
                  </div>

                  {/* 单位名称（可编辑） */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">单位名称</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-shadow placeholder:text-slate-300"
                      placeholder="请输入单位名称"
                    />
                  </div>

                  {/* 操作按钮区 */}
                  <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleSave}
                      className="inline-flex items-center gap-2 bg-sky-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-sky-700 active:bg-sky-800 transition-colors shadow-sm cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      保存
                    </button>
                    {saved && (
                      <span className="text-green-600 text-sm font-bold animate-in fade-in shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-0.5" /> 已保存
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="inline-flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 active:bg-red-200 transition-colors ml-auto cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* 空选择状态 */
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <div className="p-4 rounded-full bg-slate-100 mb-4">
                <Building2 className="w-10 h-10 text-slate-300" />
              </div>
              <p className="text-sm text-slate-500 font-medium">请从左侧选择一个单位</p>
              <p className="text-xs text-slate-400 mt-1">选中后可在右侧编辑其属性</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


