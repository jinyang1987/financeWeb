﻿﻿﻿﻿﻿﻿﻿import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building, Users, ChevronRight, ChevronDown, Plus, ListOrdered,
  Search, Edit3, Trash2, ToggleLeft, ToggleRight, UserPlus,
  Loader2, AlertCircle, Pencil, X, Check, Mail, KeyRound, User,
} from 'lucide-react';
import {
  fetchOrgTree, fetchPersonnel, createPersonnel, updatePersonnel, deletePersonnel,
} from '../services/api';
import type { OrgTreeNode, PersonnelItem } from '../services/api';
import { GroupService, personToPersonnel } from '../services/alfresco';

// ─── Modal 组件 ──────────────────────────────────────────
const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}> = ({ open, onClose, title, icon, children, width = 'max-w-md' }) => {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]" />

      {/* 弹窗卡片 */}
      <div
        className={`relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full ${width} mx-4 animate-[scaleIn_250ms_ease-out]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
                {icon}
              </div>
            )}
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-5">
          {children}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.92) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

// ─── 组件 ────────────────────────────────────────────────
export const PersonnelManagePanel: React.FC = () => {
  // 左侧树
  const [tree, setTree] = useState<OrgTreeNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<OrgTreeNode | null>(null);

  // 人员数据
  const [allPersonnel, setAllPersonnel] = useState<PersonnelItem[]>([]);
  const [deptPersonMap, setDeptPersonMap] = useState<Map<string, string>>(new Map());  // personId → deptName
  const [membersLoading, setMembersLoading] = useState(false);
  const [deptMembers, setDeptMembers] = useState<PersonnelItem[]>([]);  // 当前选中部门的成员

  // 右侧表格
  const [filterStatus, setFilterStatus] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [searchText, setSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // 状态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── 编辑 Modal 状态 ──────────────────────────────────
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonnelItem | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', email: '' });
  const [editSaving, setEditSaving] = useState(false);

  // ─── 添加 Modal 状态 ──────────────────────────────────
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    id: '',
    firstName: '',
    email: '',
    password: 'password',
  });
  const [addSaving, setAddSaving] = useState(false);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});

  // ─── 删除确认 Modal 状态 ──────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; person: PersonnelItem | null }>({
    open: false,
    person: null,
  });

  // ─── 加载全部组织树 ──────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const orgData = await fetchOrgTree();
      setTree(orgData);

      // 加载全部人员
      const allPeople = await fetchPersonnel();
      setAllPersonnel(allPeople);

      // 遍历所有部门，构建 personId → 部门名称 的映射
      const map = new Map<string, string>();
      const walk = async (nodes: OrgTreeNode[]) => {
        for (const n of nodes) {
          if (n.orgType === 'dept') {
            try {
              const members = await GroupService.getMembers(n.fullName);
              for (const m of members) {
                map.set(m.id, n.name);
              }
            } catch (_e) { /* 单个部门加载失败不影响整体 */ }
          }
          if (n.children) await walk(n.children);
        }
      };
      await walk(orgData);
      setDeptPersonMap(map);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── 选中节点变化时加载人员 ──────────────────────────────
  const loadDeptMembers = useCallback(async (node: OrgTreeNode) => {
    setMembersLoading(true);
    setError(null);
    try {
      // 选中部门：从该部门的 Group 成员中获取人员
      if (node.orgType === 'dept') {
        const members = await GroupService.getMembers(node.fullName);
        setDeptMembers(members.map(p => ({
          ...personToPersonnel(p),
          org: node.name,
        })));
      } else {
        setDeptMembers([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载部门人员失败');
      setDeptMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedNode) {
      loadDeptMembers(selectedNode);
    } else {
      setDeptMembers([]);
    }
  }, [selectedNode, loadDeptMembers]);

  // ─── 展开/折叠节点 ──────────────────────────────────
  const toggleExpand = (node: OrgTreeNode) => {
    const id = node.id;
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ─── 选中节点（单位自动展开，部门加载人员） ──────────────
  const handleSelectNode = (node: OrgTreeNode) => {
    setSelectedNode(node);
    setCurrentPage(1);
    // 选中单位时自动展开该节点
    if (node.orgType === 'unit' && node.children?.length) {
      setExpandedIds(prev => new Set(prev).add(node.id));
    }
  };

  // ─── 当前显示的人员列表（部门关联逻辑） ──────────────────────
  // 选中部门 → 展示该部门成员（含部门名称）
  // 选中单位/未选中 → 展示全部人员，并通过 person→dept 映射填充部门信息
  const activePersonnel = useMemo(() => {
    if (selectedNode?.orgType === 'dept') return deptMembers;

    // 将部门映射信息合并到全部人员列表中
    return allPersonnel.map(p => ({
      ...p,
      org: deptPersonMap.get(p.id) || p.org || '',
    }));
  }, [selectedNode, deptMembers, allPersonnel, deptPersonMap]);

  /** 当选中单位节点时，提示用户选择具体部门 */
  const isUnitSelected = selectedNode?.orgType === 'unit';

  // ─── 筛选 & 分页 ──────────────────────────────────────
  const filteredPersonnel = activePersonnel.filter(p => {
    if (filterStatus === 'enabled' && !p.enabled) return false;
    if (filterStatus === 'disabled' && p.enabled) return false;
    if (searchText && !p.name.includes(searchText) && !p.account.includes(searchText)) return false;
    return true;
  });

  const totalPages = Math.ceil(filteredPersonnel.length / pageSize) || 1;
  const pagedPersonnel = filteredPersonnel.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ─── 编辑操作 ──────────────────────────────────────────
  const openEditModal = (person: PersonnelItem) => {
    setEditingPerson(person);
    setEditForm({ firstName: person.name, email: person.email });
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingPerson(null);
    setEditForm({ firstName: '', email: '' });
  };

  const handleEditSave = async () => {
    if (!editingPerson) return;
    if (!editForm.firstName.trim()) {
      setError('姓名不能为空');
      return;
    }
    if (!editForm.email.trim()) {
      setError('邮箱不能为空');
      return;
    }
    setEditSaving(true);
    setError(null);
    try {
      const updated = await updatePersonnel(editingPerson.id, {
        firstName: editForm.firstName.trim(),
        email: editForm.email.trim(),
      });
      setAllPersonnel(prev => prev.map(p => p.id === updated.id ? updated : p));
      closeEditModal();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新人员失败');
    } finally {
      setEditSaving(false);
    }
  };

  // ─── 添加操作 ──────────────────────────────────────────
  const openAddModal = () => {
    setAddForm({ id: '', firstName: '', email: '', password: 'password' });
    setAddErrors({});
    setAddModalOpen(true);
  };

  const closeAddModal = () => {
    setAddModalOpen(false);
    setAddForm({ id: '', firstName: '', email: '', password: 'password' });
    setAddErrors({});
  };

  const validateAddForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!addForm.id.trim()) errors.id = '账号不能为空';
    if (!addForm.firstName.trim()) errors.firstName = '姓名不能为空';
    if (!addForm.email.trim()) errors.email = '邮箱不能为空';
    if (addForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addForm.email.trim())) {
      errors.email = '邮箱格式不正确';
    }
    setAddErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddSave = async () => {
    if (!validateAddForm()) return;
    setAddSaving(true);
    setError(null);
    try {
      const created = await createPersonnel({
        id: addForm.id.trim(),
        firstName: addForm.firstName.trim(),
        email: addForm.email.trim(),
        password: addForm.password,
      });
      // 如果当前选中了部门，自动将人员加入该部门
      if (selectedNode?.orgType === 'dept' && selectedNode.fullName) {
        try {
          await GroupService.addMember(selectedNode.fullName, created.id);
          // 刷新部门成员列表
          const updated = await GroupService.getMembers(selectedNode.fullName);
          setDeptMembers(updated.map(p => ({
            ...personToPersonnel(p),
            org: selectedNode.name,
          })));
          // 更新部门映射
          setDeptPersonMap(prev => new Map(prev).set(created.id, selectedNode.name));
        } catch {
          setError('人员已创建，但分配到部门失败，请手动分配');
        }
      }
      setAllPersonnel(prev => [...prev, created]);
      closeAddModal();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '创建人员失败');
    } finally {
      setAddSaving(false);
    }
  };

  // ─── 启用/停用 ──────────────────────────────────────
  const handleToggleEnabled = async (person: PersonnelItem) => {
    try {
      const updated = await updatePersonnel(person.id, { enabled: !person.enabled });
      setAllPersonnel(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '更新状态失败');
    }
  };

  // ─── 删除操作 ──────────────────────────────────────────
  const openDeleteConfirm = (person: PersonnelItem) => {
    setDeleteConfirm({ open: true, person });
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirm({ open: false, person: null });
  };

  const handleDelete = async () => {
    if (!deleteConfirm.person) return;
    try {
      // 如果当前在部门视图中，先从部门移除
      if (selectedNode?.orgType === 'dept' && selectedNode.fullName) {
        await GroupService.removeMember(selectedNode.fullName, deleteConfirm.person.id);
        setDeptMembers(prev => prev.filter(p => p.id !== deleteConfirm.person!.id));
        // 清理部门映射
        setDeptPersonMap(prev => {
          const next = new Map(prev);
          next.delete(deleteConfirm.person!.id);
          return next;
        });
      }
      await deletePersonnel(deleteConfirm.person.id);
      setAllPersonnel(prev => prev.filter(p => p.id !== deleteConfirm.person!.id));
      closeDeleteConfirm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除人员失败');
    }
  };

  // ─── 渲染左侧树节点 ──────────────────────────────────
  const renderTreeNode = (node: OrgTreeNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedNode?.id === node.id;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer transition-all text-sm ${
            isSelected
              ? 'bg-sky-50 text-sky-700 font-bold'
              : 'hover:bg-slate-100 text-slate-700'
          }`}
          style={{ paddingLeft: `${12 + level * 18}px` }}
          onClick={() => handleSelectNode(node)}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleExpand(node); }}
              className="p-0.5 hover:bg-slate-200 rounded cursor-pointer"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          {node.orgType === 'unit' ? (
            <Building className="w-4 h-4 text-sky-400 shrink-0" />
          ) : (
            <Users className="w-4 h-4 text-slate-400 shrink-0" />
          )}
          <span>{node.name}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // ─── 渲染表单字段 ────────────────────────────────────
  const FormField: React.FC<{
    label: string;
    required?: boolean;
    error?: string;
    children: React.ReactNode;
  }> = ({ label, required, error, children }) => (
    <div className="space-y-1.5">
      <label className="block text-sm font-bold text-slate-700">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );

  // ─── 加载状态 ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 to-sky-50/30">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500 mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">加载人员数据...</p>
        </div>
      </div>
    );
  }

  // ─── 主渲染 ────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 animate-[fadeIn_200ms_ease-out]">
      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-2 text-sm border-b border-red-100 animate-[fadeIn_200ms_ease-out]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer">
            关闭
          </button>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* ── 左侧树 ── */}
        <div className="w-56 shrink-0 border-r border-slate-200 bg-white overflow-y-auto p-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">组织结构</div>
          {tree.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-8">暂无数据</div>
          ) : (
            tree.map(node => renderTreeNode(node))
          )}
        </div>

        {/* ── 右侧内容 ── */}
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          {/* 工具栏 */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-gradient-to-r from-slate-50/80 to-white">
            <div className="flex items-center gap-2">
              {(selectedNode?.orgType === 'dept') && (
                <span className="text-xs text-sky-600 bg-sky-50 border border-sky-100 px-2.5 py-1 rounded-md font-bold mr-1">
                  <Building className="w-3 h-3 inline-block mr-1 align-text-bottom" />
                  {selectedNode.name}
                </span>
              )}
              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-sky-700 active:bg-sky-800 transition-all shadow-sm hover:shadow-sky-200 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                添加人员
              </button>
            </div>
            <div className="flex items-center gap-3">
              {/* 状态筛选 */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                {(['all', 'enabled', 'disabled'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setFilterStatus(s); setCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-all ${
                      filterStatus === s
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {s === 'all' ? '全部' : s === 'enabled' ? '有效' : '无效'}
                  </button>
                ))}
              </div>
              {/* 搜索 */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索名称或账号..."
                  value={searchText}
                  onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 w-48 bg-white"
                />
              </div>
            </div>
          </div>

          {/* ── 表格 ── */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-3 px-4">账号</th>
                  <th className="p-3 px-4">姓名</th>
                  <th className="p-3 px-4">邮箱</th>
                  <th className="p-3 px-4">部门</th>
                  <th className="p-3 px-4">岗位</th>
                  <th className="p-3 px-4">有效人员</th>
                  <th className="p-3 px-4 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {pagedPersonnel.map(p => (
                  <tr
                    key={p.id}
                    className="group hover:bg-sky-50/40 hover:shadow-[inset_0_0_0_1px_rgba(99,102,241,0.08)] transition-all duration-150"
                  >
                    <td className="p-3 px-4 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 text-xs font-bold shrink-0">
                          {p.name.charAt(0)}
                        </div>
                        <span>{p.account}</span>
                      </div>
                    </td>
                    <td className="p-3 px-4 text-slate-700">{p.name}</td>
                    <td className="p-3 px-4 text-slate-500 font-mono text-xs">{p.email}</td>
                    <td className="p-3 px-4">
                      {p.org ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-xs font-medium">
                          {p.org}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="p-3 px-4">
                      {p.position ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 text-sky-600 rounded-md text-xs font-medium">
                          {p.position}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="p-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(p)}
                        className="cursor-pointer transition-transform hover:scale-110"
                        title={p.enabled ? '点击停用' : '点击启用'}
                      >
                        {p.enabled ? (
                          <ToggleRight className="w-5 h-5 text-sky-600" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-slate-400" />
                        )}
                      </button>
                    </td>
                    <td className="p-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* 编辑按钮 */}
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                          title="编辑"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {/* 删除按钮 */}
                        <button
                          type="button"
                          onClick={() => openDeleteConfirm(p)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {membersLoading ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 text-sm">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
                        <span>加载部门人员...</span>
                      </div>
                    </td>
                  </tr>
                ) : pagedPersonnel.length === 0 && !membersLoading ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 text-sm">
                      <div className="flex flex-col items-center gap-2">
                        {isUnitSelected ? (
                          <>
                            <Building className="w-8 h-8 text-slate-300" />
                            <span>请选择左侧具体部门查看人员</span>
                            <span className="text-xs">人员数据与部门关联，需选中部门节点</span>
                          </>
                        ) : selectedNode?.orgType === 'dept' ? (
                          <>
                            <Users className="w-8 h-8 text-slate-300" />
                            <span>该部门暂无人员</span>
                            <span className="text-xs">点击"添加人员"为该部门分配人员</span>
                          </>
                        ) : (
                          <>
                            <Users className="w-8 h-8 text-slate-300" />
                            <span>暂无符合条件的人员</span>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* ── 分页 ── */}
          <div className="p-3 px-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500 shrink-0 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              {selectedNode?.orgType === 'dept' ? (
                <><span className="font-bold text-slate-700">{selectedNode.name}</span> · </>
              ) : selectedNode?.orgType === 'unit' ? (
                <><span className="text-slate-400">请选择具体部门</span> · </>
              ) : null}
              共 {filteredPersonnel.length} 条记录，{totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium hover:bg-white hover:border-sky-200 hover:text-sky-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-500 disabled:hover:bg-transparent cursor-pointer transition-all"
              >
                上一页
              </button>
              <span className="text-xs font-bold text-slate-700 min-w-[60px] text-center">
                第 {currentPage} 页
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium hover:bg-white hover:border-sky-200 hover:text-sky-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-500 disabled:hover:bg-transparent cursor-pointer transition-all"
              >
                下一页
              </button>
              <div className="flex items-center gap-1 ml-2">
                <span className="text-xs text-slate-400">跳至</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (v >= 1 && v <= totalPages) setCurrentPage(v);
                  }}
                  className="w-14 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
                <span className="text-xs text-slate-400">页</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 编辑人员 Modal ── */}
      <Modal
        open={editModalOpen}
        onClose={closeEditModal}
        title="编辑人员"
        icon={<Pencil className="w-5 h-5" />}
      >
        <div className="space-y-4">
          <FormField label="账号">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500">
              <User className="w-4 h-4 text-slate-400" />
              <span>{editingPerson?.account}</span>
            </div>
          </FormField>

          <FormField label="姓名" required>
            <input
              type="text"
              value={editForm.firstName}
              onChange={(e) => setEditForm(prev => ({ ...prev, firstName: e.target.value }))}
              placeholder="请输入姓名"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
            />
          </FormField>

          <FormField label="邮箱" required>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="请输入邮箱地址"
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
              />
            </div>
          </FormField>

          {/* 按钮 */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeEditModal}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleEditSave}
              disabled={editSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
            >
              {editSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  保存
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── 添加人员 Modal ── */}
      <Modal
        open={addModalOpen}
        onClose={closeAddModal}
        title="添加人员"
        icon={<UserPlus className="w-5 h-5" />}
      >
        <div className="space-y-4">
          <FormField label="账号" required error={addErrors.id}>
            <input
              type="text"
              value={addForm.id}
              onChange={(e) => setAddForm(prev => ({ ...prev, id: e.target.value }))}
              placeholder="请输入账号（唯一标识）"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all ${
                addErrors.id ? 'border-red-300 bg-red-50' : 'border-slate-200'
              }`}
            />
          </FormField>

          <FormField label="姓名" required error={addErrors.firstName}>
            <input
              type="text"
              value={addForm.firstName}
              onChange={(e) => setAddForm(prev => ({ ...prev, firstName: e.target.value }))}
              placeholder="请输入姓名"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all ${
                addErrors.firstName ? 'border-red-300 bg-red-50' : 'border-slate-200'
              }`}
            />
          </FormField>

          <FormField label="邮箱" required error={addErrors.email}>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="请输入邮箱地址"
                className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all ${
                  addErrors.email ? 'border-red-300 bg-red-50' : 'border-slate-200'
                }`}
              />
            </div>
          </FormField>

          <FormField label="密码">
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm(prev => ({ ...prev, password: e.target.value }))}
                placeholder="默认密码：password"
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
              />
            </div>
          </FormField>

          {/* 按钮 */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeAddModal}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleAddSave}
              disabled={addSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-700 active:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
            >
              {addSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  创建中...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  确认添加
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── 删除确认 Modal ── */}
      <Modal
        open={deleteConfirm.open}
        onClose={closeDeleteConfirm}
        title="确认删除"
        icon={<Trash2 className="w-5 h-5 text-red-500" />}
        width="max-w-sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">
              <p className="font-bold">确定要删除以下人员吗？</p>
              <p className="mt-1 text-red-600">此操作不可撤销。</p>
            </div>
          </div>

          {deleteConfirm.person && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 text-sm font-bold shrink-0">
                {deleteConfirm.person.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">{deleteConfirm.person.name}</p>
                <p className="text-xs text-slate-500">{deleteConfirm.person.account} · {deleteConfirm.person.email}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={closeDeleteConfirm}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 active:bg-red-800 transition-all shadow-sm cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              确认删除
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

