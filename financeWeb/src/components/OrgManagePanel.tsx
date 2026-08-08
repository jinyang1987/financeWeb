import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  FolderTree,
  Save,
  Trash2,
  X,
  Check,
  Loader2,
  RefreshCw,
  FolderPlus,
  AlertCircle,
} from 'lucide-react';
import {
  fetchOrgTree,
  createDepartment,
  deleteDepartment,
  deleteUnit,
} from '../services/api';
import type { OrgTreeNode } from '../services/api';

// ─── 已选中节点 ──────────────────────────────────────
interface SelectedNode {
  type: 'unit' | 'dept';
  data: OrgTreeNode;
}

// ─── Component ────────────────────────────────────────
export const OrgManagePanel: React.FC = () => {
  // ─── Data State ────────────────────────────────────
  const [orgTree, setOrgTree] = useState<OrgTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  // ─── UI State（内联新增） ──────────────────────────
  const [addingDeptParentId, setAddingDeptParentId] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState('');

  // ─── 编辑表单 ─────────────────────────────────────
  const [editName, setEditName] = useState('');

  // ─── Toast ─────────────────────────────────────────
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // ─── 加载组织树 ───────────────────────────────────
  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const tree = await fetchOrgTree();
      setOrgTree(tree);
    } catch {
      showToast('error', '加载组织树失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // ─── 在树中查找节点 ───────────────────────────────
  const findNode = (nodes: OrgTreeNode[], id: string): OrgTreeNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) {
        const found = findNode(n.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  // ─── 选中节点 ─────────────────────────────────────
  const handleSelectNode = useCallback((node: OrgTreeNode) => {
    setSelectedNode({ type: node.orgType, data: node });
    setEditName(node.name);
    setAddingDeptParentId(null);
  }, []);

  // ─── 新增部门/下级部门（单位和部门均可创建） ────
  const handleCreateDept = async (parentId: string) => {
    const name = newDeptName.trim();
    if (!name) {
      showToast('error', '请填写部门名称');
      return;
    }
    try {
      await createDepartment(parentId, { name });
      const parent = findNode(orgTree, parentId);
      const label = parent?.orgType === 'unit' ? '部门' : '下级部门';
      showToast('success', `${label}「${name}」创建成功`);
      setAddingDeptParentId(null);
      setNewDeptName('');
      await loadTree();
    } catch {
      showToast('error', '创建部门失败');
    }
  };

  // ─── 删除节点 ─────────────────────────────────────
  const handleDeleteNode = async (node: OrgTreeNode) => {
    const isUnit = node.orgType === 'unit';
    const label = isUnit ? '单位' : '部门';
    if (!window.confirm(`确定要删除${label}「${node.name}」吗？\n此操作不可撤销。`)) return;
    try {
      if (isUnit) {
        await deleteUnit(node.fullName);
      } else {
        await deleteDepartment(node.fullName);
      }
      showToast('success', `${label}「${node.name}」已删除`);
      if (selectedNode?.data.id === node.id) setSelectedNode(null);
      await loadTree();
    } catch {
      showToast('error', `删除${label}失败`);
    }
  };

  // ─── 更新部门名称（本地乐观更新） ─────────────────
  const handleSaveName = () => {
    if (!selectedNode || selectedNode.type !== 'dept') return;
    const name = editName.trim();
    if (!name) {
      showToast('error', '名称不能为空');
      return;
    }

    const updateInTree = (nodes: OrgTreeNode[]): OrgTreeNode[] =>
      nodes.map((n) => {
        if (n.id === selectedNode.data.id) return { ...n, name };
        if (n.children?.length) return { ...n, children: updateInTree(n.children) };
        return n;
      });

    setOrgTree(updateInTree(orgTree));
    setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, name } });
    showToast('success', '部门名称已更新');
  };

  // ─── 渲染树节点（递归） ───────────────────────────
  const renderTreeNode = (node: OrgTreeNode, depth: number = 0): React.ReactNode => {
    const isUnit = node.orgType === 'unit';
    const isSelected = selectedNode?.data.id === node.id;
    const isAdding = addingDeptParentId === node.id;
    const Icon = isUnit ? Building2 : FolderTree;

    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer transition-all text-sm ${
            isSelected
              ? 'bg-amber-50 text-amber-700 font-bold'
              : 'hover:bg-slate-100 text-slate-700'
          }`}
          style={{ paddingLeft: `${12 + depth * 20}px` }}
          onClick={() => handleSelectNode(node)}
        >
          <Icon className="w-4 h-4 shrink-0 text-slate-400" />
          <span className="truncate flex-1 min-w-0">{node.name}</span>

          <div className="flex items-center gap-0.5 shrink-0">
            {isAdding ? (
              /* ── 内联新增部门/下级部门 ── */
              <>
                <input type="text" value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder={isUnit ? '部门名称' : '下级部门名称'}
                  className="w-24 border border-amber-300 rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"
                  autoFocus onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateDept(node.id);
                    if (e.key === 'Escape') { setAddingDeptParentId(null); setNewDeptName(''); }
                  }} />
                <button type="button" onClick={(e) => { e.stopPropagation(); handleCreateDept(node.id); }}
                  className="p-0.5 text-green-600 hover:bg-green-50 rounded cursor-pointer"><Check className="w-3 h-3" /></button>
                <button type="button" onClick={(e) => { e.stopPropagation(); setAddingDeptParentId(null); setNewDeptName(''); }}
                  className="p-0.5 text-slate-400 hover:bg-slate-100 rounded cursor-pointer"><X className="w-3 h-3" /></button>
              </>
            ) : (
              <>
                {/* 单位：仅显示"添加部门" */}
                {isUnit && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); setAddingDeptParentId(node.id); setNewDeptName(''); }}
                    className="p-0.5 text-amber-600 hover:bg-amber-50 rounded cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                    title="添加部门">
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                )}
                {/* 部门：添加下级部门 + 删除 */}
                {!isUnit && (
                  <>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setAddingDeptParentId(node.id); setNewDeptName(''); }}
                      className="p-0.5 text-amber-600 hover:bg-amber-50 rounded cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                      title="添加下级部门">
                      <FolderPlus className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteNode(node); }}
                      className="p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                      title="删除部门">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {node.children?.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  // ─── Main Render ────────────────────────────────────
  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      {/* ── Toast 通知 ── */}
      {toast && (
        <div className={`absolute top-3 right-3 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-md text-sm font-bold animate-in slide-in-from-top-2 ${
          toast.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.message}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* ═══════════════════════════════════════════════ */}
        {/* 左侧面板 — 组织树                              */}
        {/* ═══════════════════════════════════════════════ */}
        <div className="w-72 shrink-0 border-r border-slate-200 bg-white overflow-y-auto p-3">
          {/* ── 头部 ── */}
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">组织层级</span>
            <button type="button" onClick={loadTree}
              className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded cursor-pointer transition-colors" title="刷新">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 提示：单位由单位管理维护 */}
          <div className="mb-3 px-3 py-2 text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg">
            <Building2 className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" />
            单位管理请前往「系统设置 → 单位管理」
          </div>

          {/* ── 树内容 ── */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : orgTree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-sm">
              <Building2 className="w-8 h-8 mb-2 text-slate-300" />
              暂无组织数据
            </div>
          ) : (
            <div className="space-y-0.5">{orgTree.map((node) => renderTreeNode(node))}</div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* 右侧面板 — 属性编辑                            */}
        {/* ═══════════════════════════════════════════════ */}
        <div className="flex-1 p-5 overflow-y-auto">
          {!selectedNode ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Building2 className="w-12 h-12 mb-3 text-slate-300" />
              <span className="text-sm">请从左侧选择一个单位或部门</span>
            </div>
          ) : selectedNode.type === 'unit' ? (
            /* ── 单位详情（只读） ── */
            <div className="max-w-xl">
              <h3 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-600" />
                单位信息 <span className="text-sm font-normal text-slate-400 ml-1">— {selectedNode.data.name}</span>
                <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">只读</span>
              </h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">组织编码</label>
                  <input type="text" value={selectedNode.data.id} disabled
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">单位名称</label>
                  <input type="text" value={selectedNode.data.name} disabled
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">下属节点</label>
                  <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <FolderTree className="w-4 h-4 text-slate-400" />
                    <span>{selectedNode.data.children?.length || 0} 个</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── 部门详情（可编辑名称） ── */
            <div className="max-w-xl">
              <h3 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-amber-600" />
                部门属性配置 <span className="text-sm font-normal text-slate-400 ml-1">— {selectedNode.data.name}</span>
              </h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">部门名称</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">部门编号</label>
                  <input type="text" value={selectedNode.data.id} disabled
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-400 cursor-not-allowed" />
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button type="button" onClick={handleSaveName}
                    className="inline-flex items-center gap-2 bg-amber-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-amber-700 transition-colors shadow-sm cursor-pointer">
                    <Save className="w-4 h-4" /> 保存
                  </button>
                  <button type="button" onClick={() => handleDeleteNode(selectedNode.data)}
                    className="inline-flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors cursor-pointer">
                    <Trash2 className="w-4 h-4" /> 删除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
