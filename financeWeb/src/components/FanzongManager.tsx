﻿﻿﻿﻿﻿﻿﻿import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2, ChevronRight, ChevronDown, Plus, Download,
  SortAsc, Search, Edit3, Save, Trash2, X,
  RefreshCw, Database, FileText, Loader2, AlertCircle,
  FolderTree, Shield, Layers,
} from 'lucide-react';
import { fetchFondsList, createFonds, updateFonds, deleteFonds } from '../services/fondsService';
import { fetchOrgTree } from '../services/api';
import type { OrgTreeNode } from '../services/api';
import { useArchiveStore } from '../stores/archiveStore';

// ---------- Types ----------
interface FondsItem {
  id: string;
  code: string;
  name: string;
  type: 'active' | 'custodial';
  companyId: string;
  custodianCode?: string;
  archiveDept: string;
  enableYear: string;
  remark: string;
}

// ---------- 工具函数 ----------

/** 拍平组织树，返回所有节点的一维数组 */
function flattenTree(nodes: OrgTreeNode[]): OrgTreeNode[] {
  const result: OrgTreeNode[] = [];
  const walk = (list: OrgTreeNode[]) => {
    for (const n of list) {
      result.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return result;
}

/** 在树中按 ID 查找节点 */
function findNodeById(nodes: OrgTreeNode[], id: string): OrgTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** 获取所有单位类型节点（过滤出 orgType === 'unit'） */
function getUnitNodes(nodes: OrgTreeNode[]): OrgTreeNode[] {
  return flattenTree(nodes).filter(n => n.orgType === 'unit');
}

/** 递归过滤组织树，只保留单位（公司/子公司）节点，移除部门节点 */
function filterUnitTree(nodes: OrgTreeNode[]): OrgTreeNode[] {
  return nodes
    .filter(n => n.orgType === 'unit')
    .map(n => ({
      ...n,
      children: n.children ? filterUnitTree(n.children) : [],
    }));
}

// ---------- 组件 ----------
export const FanzongManager: React.FC = () => {
  // ─── 组织树状态 ──────────────────────────────────────────
  const [orgTree, setOrgTree] = useState<OrgTreeNode[]>([]);
  const [orgTreeLoading, setOrgTreeLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [orgExpanded, setOrgExpanded] = useState<Set<string>>(new Set());

  // ─── 全宗列表状态 ────────────────────────────────────────
  const [fondsList, setFondsList] = useState<FondsItem[]>([]);
  const [fondsLoading, setFondsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ─── 编辑/新建弹窗状态 ────────────────────────────────────
  const [editingFonds, setEditingFonds] = useState<FondsItem | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editForm, setEditForm] = useState({
    code: '', name: '', type: 'active' as 'active' | 'custodial',
    custodianCode: '', companyId: '',
    enableYear: '', remark: '',
  });
  const [newForm, setNewForm] = useState({
    name: '', code: '', type: 'active' as 'active' | 'custodial',
    companyId: '', custodianCode: '',
  });

  // ─── 拍平后的单位列表（用于下拉选择） ──────────────────────
  const unitOptions = useMemo(() => getUnitNodes(orgTree), [orgTree]);

  /** 只含公司/子公司的组织树（过滤掉部门），用于左侧树渲染 */
  const unitTree = useMemo(() => filterUnitTree(orgTree), [orgTree]);

  // 第一个单位ID（用于归一化无 companyId 的全宗）
  const firstUnitId = useMemo(() => unitOptions[0]?.id || '', [unitOptions]);

  // 首次加载自动展开所有一级节点
  const allTopIds = useMemo(() => orgTree.map(n => n.id), [orgTree]);

  // ─── 数据加载 ──────────────────────────────────────────────

  /** 加载组织树 */
  const loadOrgTree = useCallback(async () => {
    setOrgTreeLoading(true);
    try {
      const data = await fetchOrgTree();
      setOrgTree(data);
      // 默认展开所有一级单位
      if (data.length > 0) {
        setOrgExpanded(new Set(data.map(n => n.id)));
        // 默认选中第一个单位
        const firstUnit = getUnitNodes(data)[0];
        if (firstUnit && !selectedOrg) {
          setSelectedOrg(firstUnit.id);
        }
      }
    } catch (err) {
      setError('加载组织树失败，请确认单位管理已创建单位数据');
    } finally {
      setOrgTreeLoading(false);
    }
  }, []);

  /** 加载全宗列表（优先 API，失败或为空则降级到本地 store） */
  const loadFonds = useCallback(async () => {
    setFondsLoading(true);
    setError(null);
    try {
      const data = await fetchFondsList();
      if (data.length > 0) {
        setFondsList(data.map(f => ({
          id: f.id,
          code: f.code,
          name: f.name,
          type: f.status as 'active' | 'custodial',
          companyId: f.companyId || '',
          custodianCode: f.custodianCode || '',
          archiveDept: '',
          enableYear: '',
          remark: '',
        })));
        // 同步回 store 供其他页面使用
        useArchiveStore.getState().setFanzongs(data.map(f => ({
          id: f.id,
          code: f.code,
          name: f.name,
          status: f.status,
          recordCount: 0,
          address: f.address || '',
          syncSource: f.syncSource || '',
          companyId: f.companyId || '',
          custodianCode: f.custodianCode || '',
        })));
      } else {
        // API 返回空 — 尝试自动从 store 同步到 Alfresco
        const storeFonds = useArchiveStore.getState().fanzongs;
        if (storeFonds?.length) {
          setFondsList(storeFonds.map(f => ({
            id: f.id,
            code: f.code,
            name: f.name,
            type: f.status as 'active' | 'custodial',
            companyId: f.companyId || '',
            custodianCode: f.custodianCode || '',
            archiveDept: '',
            enableYear: '',
            remark: '',
          })));
          // 自动将 store 种子数据同步到 Alfresco（静默，失败不阻塞）
          for (const f of storeFonds) {
            try {
              await createFonds({
                code: f.code,
                name: f.name,
                status: f.status,
                companyId: f.companyId,
                custodianCode: f.custodianCode,
                address: f.address,
                syncSource: f.syncSource,
              });
            } catch { /* 重复创建静默跳过 */ }
          }
          // 同步完成后重新加载
          setTimeout(() => loadFonds(), 1500);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载全宗列表失败');
      // 降级到 store 数据
      const storeFonds = useArchiveStore.getState().fanzongs;
      if (storeFonds?.length) {
        setFondsList(storeFonds.map(f => ({
          id: f.id,
          code: f.code,
          name: f.name,
          type: f.status as 'active' | 'custodial',
          companyId: f.companyId || '',
          custodianCode: f.custodianCode || '',
          archiveDept: '',
          enableYear: '',
          remark: '',
        })));
      }
    } finally {
      setFondsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrgTree();
    loadFonds();
  }, [loadOrgTree, loadFonds]);

  // ─── 派生数据 ────────────────────────────────────────────

  /** 归一化后的全宗列表（空或无效 companyId 自动关联到第一个单位） */
  const normalizedFonds = useMemo(() => {
    if (!firstUnitId) return fondsList;
    const validIds = new Set(unitOptions.map(u => u.id));
    return fondsList.map(f => ({
      ...f,
      companyId: (f.companyId && validIds.has(f.companyId)) ? f.companyId : firstUnitId,
    }));
  }, [fondsList, unitOptions, firstUnitId]);

  /** 根据选中的组织和搜索词筛选全宗 */
  const filteredFonds = useMemo(() => {
    const companyFonds = selectedOrg
      ? normalizedFonds.filter(f => f.companyId === selectedOrg)
      : normalizedFonds;
    const queried = companyFonds.filter(f =>
      f.name.includes(searchQuery) || f.code.includes(searchQuery)
    );
    return {
      all: queried,
      active: queried.filter(f => f.type === 'active'),
      custodial: queried.filter(f => f.type === 'custodial'),
    };
  }, [normalizedFonds, selectedOrg, searchQuery]);

  /** 选中公司名称（从公司树中查找） */
  const selectedOrgName = useMemo(() => {
    if (!selectedOrg) return '';
    const node = findNodeById(unitTree, selectedOrg);
    return node?.name || selectedOrg;
  }, [selectedOrg, unitTree]);

  // ─── 交互处理 ────────────────────────────────────────────

  const toggleOrgExpand = (id: string) => {
    setOrgExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSaveSuccess = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleEditSave = async () => {
    if (!editingFonds) return;
    try {
      await updateFonds(editingFonds.id, {
        code: editForm.code,
        name: editForm.name,
        status: editForm.type,
        custodianCode: editForm.type === 'custodial' ? editForm.custodianCode : '',
        companyId: editForm.companyId,
        enableYear: editForm.enableYear ? parseInt(editForm.enableYear, 10) : undefined,
        remark: editForm.remark || '',
      });
      handleSaveSuccess();
      setShowEditModal(false);
      await loadFonds();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存全宗失败');
    }
  };

  const handleDelete = async (nodeId: string) => {
    try {
      await deleteFonds(nodeId);
      setShowEditModal(false);
      await loadFonds();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除全宗失败');
    }
  };

  const handleCreate = async () => {
    if (!newForm.name || !newForm.code || !newForm.companyId) return;
    try {
      await createFonds({
        code: newForm.code,
        name: newForm.name,
        status: newForm.type,
        companyId: newForm.companyId,
        custodianCode: newForm.type === 'custodial' ? newForm.custodianCode : undefined,
      });
      setShowNewModal(false);
      setNewForm({ name: '', code: '', type: 'active', companyId: '', custodianCode: '' });
      await loadFonds();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建全宗失败');
    }
  };

  const openEditModal = (f: FondsItem) => {
    setEditingFonds(f);
    setEditForm({
      code: f.code,
      name: f.name,
      type: f.type,
      custodianCode: f.custodianCode || '',
      companyId: f.companyId || (unitOptions[0]?.id || ''),
      enableYear: f.enableYear || '',
      remark: f.remark || '',
    });
    setShowEditModal(true);
  };

  // ─── 渲染：组织树 ────────────────────────────────────────

  const renderOrgNode = (node: OrgTreeNode, level = 0) => {
    const hasChildren = !!node.children?.length;
    const isExpanded = orgExpanded.has(node.id);
    const isSelected = selectedOrg === node.id;
    const count = normalizedFonds.filter(f => f.companyId === node.id).length;
    const activeCount = normalizedFonds.filter(f => f.companyId === node.id && f.type === 'active').length;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer text-sm ${
            isSelected ? 'bg-sky-50 text-sky-700 font-bold' : 'hover:bg-slate-100 text-slate-700'
          }`}
          style={{ paddingLeft: `${12 + level * 18}px` }}
          onClick={() => setSelectedOrg(node.id)}
        >
          {hasChildren ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); toggleOrgExpand(node.id); }}
              className="p-0.5 hover:bg-slate-200 rounded cursor-pointer">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : <span className="w-4" />}
          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="truncate">{node.name}</span>
          {count > 0 && (
            <span className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0 ${
              isSelected ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {activeCount}现
            </span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children!.map(c => renderOrgNode(c, level + 1))}</div>
        )}
      </div>
    );
  };

  // ─── 渲染：全宗行 ────────────────────────────────────────

  const renderFondsRow = (f: FondsItem) => (
    <tr key={f.id} className="hover:bg-slate-50 transition-colors">
      <td className="p-3 px-4 text-center">
        <div className="flex items-center justify-center gap-1">
          <button type="button" onClick={() => openEditModal(f)}
            className="p-1 hover:bg-slate-100 rounded cursor-pointer text-slate-500 hover:text-sky-600" title="编辑">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
      <td className="p-3 px-4 font-mono text-xs text-slate-700 font-bold">{f.code}</td>
      <td className="p-3 px-4 font-medium text-slate-800">{f.name}</td>
      <td className="p-3 px-4">
        {f.type === 'active' ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
            <Shield className="w-3 h-3" /> 现行
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">
            <FolderTree className="w-3 h-3" /> 代管
          </span>
        )}
      </td>
      <td className="p-3 px-4 text-xs text-slate-500">
        {f.type === 'custodial' && f.custodianCode ? (
          <span>由 <span className="font-mono font-bold text-slate-700">{f.custodianCode}</span> 代管</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
    </tr>
  );

  // ─── 渲染：主界面 ────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-200">
      <div className="flex-1 flex min-h-0">
        {/* ===== 左侧：组织树面板 ===== */}
        <div className="w-56 shrink-0 border-r border-slate-200 bg-white overflow-y-auto p-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            公司组织
          </div>

          {orgTreeLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              加载中...
            </div>
          ) : unitTree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Building2 className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-xs text-center">暂无公司数据</p>
              <p className="text-xs text-center mt-1">请先在"系统管理→单位管理"中创建单位</p>
            </div>
          ) : (
            unitTree.map(n => renderOrgNode(n))
          )}
        </div>

        {/* ===== 右侧：全宗列表 ===== */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* 工具栏 */}
          <div className="p-3 border-b border-slate-100 flex items-center justify-between shrink-0 flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => {
                  if (!unitOptions.length) {
                    setError('请先在系统设置-单位管理中创建单位');
                    return;
                  }
                  setNewForm(prev => ({ ...prev, companyId: selectedOrg || unitOptions[0]?.id || '' }));
                  setShowNewModal(true);
                }}
                className="inline-flex items-center gap-1 bg-sky-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-sky-700 transition-colors cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> 新建全宗
              </button>
              <button type="button"
                className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 cursor-pointer">
                <Download className="w-3.5 h-3.5" /> 导出
              </button>
              <button type="button"
                className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 cursor-pointer">
                <SortAsc className="w-3.5 h-3.5" /> 排序
              </button>
              <button type="button" onClick={() => { loadOrgTree(); loadFonds(); }}
                className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" /> 刷新
              </button>
            </div>
            {/* 搜索 */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="搜索全宗号/名称..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 w-48" />
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mx-3 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)}
                className="p-0.5 hover:bg-red-100 rounded cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 选中组织信息头 */}
          <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2 text-xs text-slate-500">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            {selectedOrgName ? (
              <>
                <span className="font-bold text-slate-700">{selectedOrgName}</span>
                <span className="text-slate-300">|</span>
              </>
            ) : (
              <span className="text-slate-400">未选择组织</span>
            )}
            <span>全宗 <strong className="text-slate-700">{filteredFonds.active.length}</strong> 现行</span>
            <span className="text-slate-300">·</span>
            <span>代管 <strong className="text-slate-700">{filteredFonds.custodial.length}</strong></span>
            {filteredFonds.all.length > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span>共 <strong className="text-slate-700">{filteredFonds.all.length}</strong> 个</span>
              </>
            )}
          </div>

          {/* 全宗表格 */}
          <div className="flex-1 overflow-auto">
            {fondsLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                加载全宗数据...
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0">
                    <th className="p-3 px-4 w-20 text-center">操作</th>
                    <th className="p-3 px-4">全宗号</th>
                    <th className="p-3 px-4">全宗名称</th>
                    <th className="p-3 px-4">类型</th>
                    <th className="p-3 px-4">代管关系</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredFonds.all.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-400 text-sm">
                        {selectedOrg
                          ? `"${selectedOrgName}" 暂无全宗数据`
                          : unitTree.length === 0
                            ? '请先在左侧创建公司单位'
                            : '请选择左侧公司组织'}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {filteredFonds.active.length > 0 && (
                        <>
                          <tr className="bg-emerald-50/50">
                            <td colSpan={5} className="px-4 py-2 text-xs font-bold text-emerald-700">
                              <Shield className="w-3.5 h-3.5 inline-block mr-1.5 align-text-bottom" />
                              现行全宗（运行中）
                            </td>
                          </tr>
                          {filteredFonds.active.map(renderFondsRow)}
                        </>
                      )}
                      {filteredFonds.custodial.length > 0 && (
                        <>
                          <tr className="bg-amber-50/50">
                            <td colSpan={5} className="px-4 py-2 text-xs font-bold text-amber-700">
                              <FolderTree className="w-3.5 h-3.5 inline-block mr-1.5 align-text-bottom" />
                              代管全宗（历史遗留，由现行全宗代管）
                            </td>
                          </tr>
                          {filteredFonds.custodial.map(renderFondsRow)}
                        </>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ===== 编辑全宗弹窗 ===== */}
      {showEditModal && editingFonds && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center" onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-sky-600" />
                编辑全宗 - {editingFonds.name}
              </h3>
              <button type="button" onClick={() => setShowEditModal(false)}
                className="p-1 hover:bg-slate-100 rounded cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">全宗号</label>
                <input type="text" value={editForm.code} onChange={e => setEditForm({...editForm, code: e.target.value})}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">全宗名称</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">所属公司</label>
                <select value={editForm.companyId} onChange={e => setEditForm({...editForm, companyId: e.target.value})}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
                  {unitOptions.length === 0 && <option value="">暂无可选单位</option>}
                  {unitOptions.map(n => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">全宗类型</label>
                <div className="flex items-center gap-3 mt-1">
                  <button type="button" onClick={() => setEditForm({...editForm, type: 'active'})}
                    className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      editForm.type === 'active'
                        ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                    <Shield className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" />
                    现行全宗
                  </button>
                  <button type="button" onClick={() => setEditForm({...editForm, type: 'custodial'})}
                    className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      editForm.type === 'custodial'
                        ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                    <FolderTree className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" />
                    代管全宗
                  </button>
                </div>
              </div>
              {editForm.type === 'custodial' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">代管方现行全宗号</label>
                  <select value={editForm.custodianCode} onChange={e => setEditForm({...editForm, custodianCode: e.target.value})}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50/30">
                    <option value="">选择代管方全宗</option>
                    {fondsList.filter(f => f.type === 'active' && f.companyId === editForm.companyId).map(f => (
                      <option key={f.code} value={f.code}>{f.code} - {f.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-amber-600 mt-1">
                    该全宗已被现行全宗代管，"一套人马两块牌子"的历史全宗
                  </p>
                </div>
              )}
              {editForm.type === 'active' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">启用年度</label>
                  <input type="text" value={editForm.enableYear} onChange={e => setEditForm({...editForm, enableYear: e.target.value})}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">备注</label>
                <textarea value={editForm.remark} onChange={e => setEditForm({...editForm, remark: e.target.value})}
                  rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-500" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100">
              <button type="button" onClick={handleEditSave}
                className="inline-flex items-center gap-1.5 bg-sky-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-sky-700 cursor-pointer">
                <Save className="w-4 h-4" /> 保存
              </button>
              <button type="button" onClick={() => handleDelete(editingFonds.id)}
                className="inline-flex items-center gap-1.5 bg-red-50 text-red-600 border border-red-200 px-5 py-2 rounded-lg text-sm font-bold hover:bg-red-100 cursor-pointer">
                <Trash2 className="w-4 h-4" /> 删除
              </button>
              <button type="button"
                className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-slate-50 cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" /> 重建索引
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 新建全宗弹窗 ===== */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center" onClick={() => setShowNewModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-600" /> 新建全宗
              </h3>
              <button type="button" onClick={() => setShowNewModal(false)}
                className="p-1 hover:bg-slate-100 rounded cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">所属公司</label>
                <select value={newForm.companyId} onChange={e => setNewForm({...newForm, companyId: e.target.value})}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
                  {unitOptions.length === 0 && <option value="">暂无可选单位</option>}
                  {unitOptions.map(n => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">全宗号</label>
                <input type="text" value={newForm.code} onChange={e => setNewForm({...newForm, code: e.target.value})}
                  placeholder="如 Z004" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">全宗名称</label>
                <input type="text" value={newForm.name} onChange={e => setNewForm({...newForm, name: e.target.value})}
                  placeholder="如 第四全宗（华东分公司）" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">全宗类型</label>
                <div className="flex items-center gap-3 mt-1">
                  <button type="button" onClick={() => setNewForm({...newForm, type: 'active'})}
                    className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      newForm.type === 'active'
                        ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                    <Shield className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" />
                    现行全宗（运行中）
                  </button>
                  <button type="button" onClick={() => setNewForm({...newForm, type: 'custodial'})}
                    className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                      newForm.type === 'custodial'
                        ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                    <FolderTree className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" />
                    代管全宗（历史遗留）
                  </button>
                </div>
              </div>
              {newForm.type === 'custodial' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">由哪个现行全宗代管</label>
                  <select value={newForm.custodianCode} onChange={e => setNewForm({...newForm, custodianCode: e.target.value})}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50/30">
                    <option value="">选择代管方全宗</option>
                    {fondsList.filter(f => f.type === 'active' && f.companyId === newForm.companyId).map(f => (
                      <option key={f.code} value={f.code}>{f.code} - {f.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-amber-600 mt-1">
                    该全宗将被现行全宗代管，适用于公司重组、全宗号变更等场景
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">取消</button>
              <button type="button" onClick={handleCreate}
                className="bg-sky-600 text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-sky-700 cursor-pointer">创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

