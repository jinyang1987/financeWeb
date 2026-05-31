/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Network, Users, Plus, Shield, UserPlus, Info, CheckCircle2, 
  ChevronDown, ChevronRight, Search, Settings, Save, Trash2, Sliders, ListFilter,
  Folder, FolderOpen
} from 'lucide-react';

interface OrgUser {
  username: string;
  name: string;
  role: string;
  departmentId: string;
  alfrescoGroup: string;
  email: string;
}

interface TreeItem {
  id: string;
  label: string;
  children?: TreeItem[];
}

export const OrgManagePanel: React.FC<{ triggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void }> = ({ triggerToast }) => {
  // Hardcoded departments tree matching the customer mock & Vue template orgTreeData
  const [departmentTree] = useState<TreeItem[]>([
    {
      id: 'dep-root',
      label: '集团总部大账套',
      children: [
        {
          id: 'dep-tech',
          label: '信息科技公司',
          children: [
            { id: 'dep-tech-1', label: '综合一部' },
            { id: 'dep-tech-archive', label: '档案管理室' },
            { id: 'dep-tech-dev', label: '研发项目部' }
          ]
        },
        {
          id: 'dep-culture',
          label: '文化产业公司',
          children: [
            { id: 'dep-culture-1', label: '综合二部' },
            { id: 'dep-culture-finance', label: '财务核算部' }
          ]
        },
        { id: 'dep-smart', label: '智能制造研究院' },
        { id: 'dep-energy', label: '南方能源分公司' }
      ]
    }
  ]);

  // Initial user mapping per department (matching the updated Tree IDs)
  const [usersList, setUsersList] = useState<OrgUser[]>([
    { username: '10023', name: '张三', role: '全宗档案管理员', departmentId: 'dep-tech-archive', alfrescoGroup: 'GROUP_ARCHIVE_ADMIN', email: 'zhangsan@corp-archives.com' },
    { username: '10024', name: '李四', role: '凭证录入与核对员', departmentId: 'dep-culture-finance', alfrescoGroup: 'GROUP_FINANCE_ENTRY', email: 'lisi_finance@corp-archives.com' },
    { username: '10088', name: '王首席', role: '首席财务官(只读审计)', departmentId: 'dep-root', alfrescoGroup: 'GROUP_FINANCE_DIRECTOR', email: 'jinlinrun198x@gmail.com' },
    { username: '10091', name: '赵大勇', role: '综合部会计负责人', departmentId: 'dep-tech-1', alfrescoGroup: 'GROUP_FINANCE_ENTRY', email: 'zhaoyong@corp-archives.com' },
    { username: '10099', name: '钱妙妙', role: '研发项目签批核销专员', departmentId: 'dep-tech-dev', alfrescoGroup: 'GROUP_ARCHIVE_ADMIN', email: 'qianmiaomiao@corp-archives.com' },
    { username: '10102', name: '陈创创', role: '文化产业出纳柜员', departmentId: 'dep-culture-1', alfrescoGroup: 'GROUP_FINANCE_ENTRY', email: 'chenchuang@corp-archives.com' }
  ]);

  const [selectedDeptId, setSelectedDeptId] = useState<string>('dep-root');
  const [filterQuery, setFilterQuery] = useState('');
  const [treeFilterText, setTreeFilterText] = useState('');
  const [activeTab, setActiveTab] = useState<'config' | 'users'>('config');

  // Form properties (from Vue template)
  const [orgCode, setOrgCode] = useState('1001');
  const [orgName, setOrgName] = useState('集团总部财务中心');
  const [isEffectiveUnit, setIsEffectiveUnit] = useState(true);
  const [multiSortType, setMultiSortType] = useState('1');
  const [syncArchiveDept, setSyncArchiveDept] = useState(true);
  const [remark, setRemark] = useState('');

  // Create user state
  const [isNewUserOpen, setIsNewUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRealName, setNewRealName] = useState('');
  const [newRole, setNewRole] = useState('凭证录入员');
  const [newAlfrescoGroup, setNewAlfrescoGroup] = useState('GROUP_FINANCE_ENTRY');
  const [newUserEmail, setNewUserEmail] = useState('');

  // Recursive tree render helper
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'dep-root': true,
    'dep-tech': true,
    'dep-culture': true
  });

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSelectDept = (id: string, label: string) => {
    setSelectedDeptId(id);
    setOrgName(label);
    
    // Auto-compute simulated organization codes based on the node
    const codes: Record<string, string> = {
      'dep-root': '1001',
      'dep-tech': '1002',
      'dep-tech-1': '1002A',
      'dep-tech-archive': '1002B',
      'dep-tech-dev': '1002C',
      'dep-culture': '1003',
      'dep-culture-1': '1003A',
      'dep-culture-finance': '1003B',
      'dep-smart': '1004',
      'dep-energy': '1005'
    };
    setOrgCode(codes[id] || '1020');
  };

  const handleAddNewUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newRealName) {
      triggerToast('请补充完整的账号与姓名。', 'warning');
      return;
    }
    const exists = usersList.some(u => u.username === newUsername);
    if (exists) {
      triggerToast(`工号 ${newUsername} 已经挂载过物理人员，请核照。`, 'warning');
      return;
    }

    const newUser: OrgUser = {
      username: newUsername,
      name: newRealName,
      role: newRole,
      departmentId: selectedDeptId,
      alfrescoGroup: newAlfrescoGroup,
      email: newUserEmail || `${newUsername}@corp-archives.com`
    };

    setUsersList([...usersList, newUser]);
    setIsNewUserOpen(false);
    setNewUsername('');
    setNewRealName('');
    setNewUserEmail('');
    triggerToast(`成功在新权限链下登记人员 ${newRealName}，对应同步的 Alfresco 组为: ${newAlfrescoGroup}`, 'success');
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    triggerToast('单位属性保存成功，Alfresco 动态权限域同步就绪！', 'success');
    // Switch to users view automatically
    setActiveTab('users');
  };

  const handleDeleteNode = () => {
    if (selectedDeptId === 'dep-root') {
      triggerToast('根节点 [集团总部大账套] 为保全主锁链，拦截注销！', 'warning');
      return;
    }
    if (confirm(`是否确认删除组织节点 [${orgName}] 及其下辖权限集？此不可逆行为会级联解绑所有柜员！`)) {
      triggerToast(`已成功移除 ${orgName} 单位归档域。`, 'warning');
      handleSelectDept('dep-root', '集团总部大账套');
    }
  };

  // Get active department title for label display
  const getDeptLabel = (nodes: TreeItem[], id: string): string => {
    for (let node of nodes) {
      if (node.id === id) return node.label;
      if (node.children) {
        const childLabel = getDeptLabel(node.children, id);
        if (childLabel) return childLabel;
      }
    }
    return '全局账套';
  };

  // Filter function for tree nodes
  const filterTreeNodes = (nodes: TreeItem[], query: string): TreeItem[] => {
    if (!query) return nodes;
    const mapped = nodes.map((node): TreeItem | null => {
      const matchesThis = node.label.toLowerCase().includes(query.toLowerCase());
      const filteredChildren = node.children ? filterTreeNodes(node.children, query) : [];
      const hasMatchingChildren = filteredChildren.length > 0;
      
      if (matchesThis || hasMatchingChildren) {
        return {
          ...node,
          children: node.children ? filteredChildren : undefined
        };
      }
      return null;
    });
    return mapped.filter((n): n is TreeItem => n !== null);
  };

  const activeDeptLabel = getDeptLabel(departmentTree, selectedDeptId);
  const filteredTreeData = filterTreeNodes(departmentTree, treeFilterText);

  const matchedUsers = usersList.filter(u => {
    const deptMatch = selectedDeptId === 'dep-root' ? true : u.departmentId === selectedDeptId;
    const queryMatch = filterQuery 
      ? u.name.includes(filterQuery) || u.username.includes(filterQuery) || u.role.includes(filterQuery)
      : true;
    return deptMatch && queryMatch;
  });

  const renderTreeNodes = (nodes: TreeItem[]) => {
    return nodes.map(node => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedNodes[node.id] || !!treeFilterText; // Auto expand when searching
      const isSelected = selectedDeptId === node.id;

      return (
        <div key={node.id} className="space-y-1">
          <div 
            onClick={() => handleSelectDept(node.id, node.label)}
            className={`flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer select-none transition-all ${
              isSelected 
                ? 'bg-[#EEF2FF] text-[#4F46E5] font-extrabold shadow-sm border border-indigo-150/80' 
                : 'hover:bg-slate-50 text-slate-650 hover:text-slate-900'
            }`}
          >
            <span className="flex items-center gap-1.5 truncate">
              {hasChildren ? (
                <button 
                  type="button"
                  onClick={(e) => toggleExpand(node.id, e)}
                  className="p-0.5 hover:bg-slate-200/50 rounded-md text-slate-400 focus:outline-none cursor-pointer"
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-indigo-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                </button>
              ) : (
                <span className="w-4.5" />
              )}
              {isExpanded ? (
                <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[#4F46E5]' : 'text-slate-400'}`} />
              ) : (
                <Folder className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[#4F46E5]' : 'text-slate-400'}`} />
              )}
              <span className="truncate">{node.label}</span>
            </span>
            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
              isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-200/50 text-slate-500 font-semibold'
            }`}>
              {usersList.filter(u => u.departmentId === node.id).length}人
            </span>
          </div>

          {hasChildren && isExpanded && (
            <div className="pl-4 border-l border-slate-150/80 ml-2.5 space-y-1">
              {renderTreeNodes(node.children!)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div id="org-manage-dashboard" className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>组织架构属性配置 (分级管理授权)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            建立组织、单位、工号及审计分级。这里的组织树变动将自动激活后台 Alfresco Acl 权限大账套 Authority 深度合并。
          </p>
        </div>
      </div>

      <div className="p-4 bg-[#f8fafc] border border-slate-200 rounded-2xl flex items-start gap-3 text-xs text-slate-700">
        <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="block font-bold text-slate-900">全方财务大账套与 AD-LDAP 网关策略域</strong>
          <span className="block text-slate-500 leading-normal font-sans">
            本模块全面对接集团总账。点击左侧树过滤组织，在右侧即可针对该单位配置“分级整理多态方式”，或进行具体凭证核销员的多维角色管理。
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        
        {/* Left Tree Section spanning 4 cols */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4.5 space-y-4 flex flex-col min-h-[420px]">
          <div className="flex items-center justify-between border-b border-slate-150 pb-2.5">
            <h3 className="font-bold text-slate-800 text-xs">行政组织层级</h3>
            <button
              type="button"
              onClick={() => triggerToast('安全权限网络：开始动态同步并新增组织节点。', 'success')}
              className="px-2.5 py-1.5 bg-[#EEF2FF] text-[#4F46E5] hover:bg-indigo-100 rounded-lg text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition-colors border border-indigo-150"
            >
              <Plus className="w-3 h-3" />
              <span>添加组织</span>
            </button>
          </div>
          
          <div className="relative">
            <input 
              type="text" 
              placeholder="检索法人单位/部门..."
              value={treeFilterText}
              onChange={e => setTreeFilterText(e.target.value)}
              className="w-full bg-white border border-slate-200 py-2 pl-8 pr-3 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-sans"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {filteredTreeData.length > 0 ? (
              renderTreeNodes(filteredTreeData)
            ) : (
              <div className="text-center py-8 text-xs text-slate-400">
                无匹配组织
              </div>
            )}
          </div>
        </div>

        {/* Right Tabbed Panel Section spanning 8 cols */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col min-h-[420px] overflow-hidden">
          
          {/* Header tabs */}
          <div className="bg-[#f8fafc] border-b border-slate-200 p-2 flex items-center justify-between shrink-0">
            <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveTab('config')}
                className={`py-1.5 px-4 font-bold rounded-lg transition-all text-xs cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'config'
                    ? 'bg-white text-[#4F46E5] shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-505" />
                <span>当前选定组织/单位属性配置</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`py-1.5 px-4 font-bold rounded-lg transition-all text-xs cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'users'
                    ? 'bg-white text-[#4F46E5] shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-indigo-505" />
                <span>成员角色授权 ({matchedUsers.length}人)</span>
              </button>
            </div>

            <div className="px-3">
              <span className="text-[10px] font-bold text-slate-400 font-mono">ID: {selectedDeptId}</span>
            </div>
          </div>

          <div className="p-6 flex-1 flex flex-col">
            
            {/* Tab 1: Config Form */}
            {activeTab === 'config' && (
              <form onSubmit={handleSaveConfig} className="space-y-4 max-w-[650px] text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">单位/组织编码 <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={orgCode}
                    onChange={(e) => setOrgCode(e.target.value)}
                    placeholder="请输入系统唯一组织编码"
                    className="w-full bg-white border border-slate-250 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">单位/组织名称 <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="请输入单位全称"
                    className="w-full bg-white border border-slate-250 p-2.5 rounded-lg focus:outline-none focus:border-blue-500 text-xs font-sans"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5Packed">是否为有效单位/组织</label>
                  <div className="flex gap-6 mt-1.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer font-semibold select-none text-slate-750">
                      <input
                        type="radio"
                        checked={isEffectiveUnit}
                        onChange={() => setIsEffectiveUnit(true)}
                        className="text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-slate-300"
                      />
                      <span>是 (激活物理权限域)</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer font-semibold select-none text-slate-750">
                      <input
                        type="radio"
                        checked={!isEffectiveUnit}
                        onChange={() => setIsEffectiveUnit(false)}
                        className="text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-slate-300"
                      />
                      <span>否 (锁定该归档树)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5 font-sans">多状态整理方式</label>
                  <select
                    value={multiSortType}
                    onChange={(e) => setMultiSortType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-indigo-500 text-xs font-sans text-slate-800"
                  >
                    <option value="1">案卷级-文件级二级多状态整理方式</option>
                    <option value="2">文件级一级扁平化极简整理方式</option>
                  </select>
                </div>

                <div className="flex items-start gap-2.5 pt-1">
                  <input
                    type="checkbox"
                    id="syncArchiveDept"
                    checked={syncArchiveDept}
                    onChange={(e) => setSyncArchiveDept(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                  />
                  <label htmlFor="syncArchiveDept" className="cursor-pointer font-semibold text-slate-650 select-none text-[11px]">
                    快捷安全特性：同步更新“全生命周期共享阅档安全审计”授权
                  </label>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">单位备注与描述说明</label>
                  <textarea
                    rows={3}
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="请输入针对该单位/部门的会计记账专属财务备注，例如：对应SAP中 1008 全资法人域"
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-indigo-500 text-xs font-sans text-slate-800"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold rounded-xl shadow-md shadow-indigo-600/10 transition-colors flex items-center gap-2 cursor-pointer text-xs font-sans"
                    >
                      <Save className="w-3.5 h-3.5 text-white" />
                      <span>保存配置修改</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('users');
                        triggerToast('已无缝过渡到成员角色管理。', 'success');
                      }}
                      className="px-5 py-2.5 bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] hover:bg-[#D1FAE5] font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer text-xs"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>进入人员管理</span>
                    </button>
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleDeleteNode}
                    className="px-4.5 py-2.5 border border-red-200 text-red-600 hover:bg-[#FFF5F5] font-bold rounded-xl transition-colors flex items-center gap-2 cursor-pointer text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>注销该节点</span>
                  </button>
                </div>
              </form>
            )}

            {/* Tab 2: Users List */}
            {activeTab === 'users' && (
              <div className="flex-1 flex flex-col space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">类目：{activeDeptLabel} 成员授权控制台</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">控制在当前单位及子集内有权处理影像的物理账户</p>
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="检索姓名/工号/角色..."
                        value={filterQuery}
                        onChange={e => setFilterQuery(e.target.value)}
                        className="bg-slate-50 border border-slate-200 py-1.5 pl-8 pr-3 rounded-xl text-xs text-slate-750 w-44 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-sans"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsNewUserOpen(true)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-white" />
                      <span>新增人员</span>
                    </button>
                  </div>
                </div>

                {/* Table for personnel */}
                <div className="flex-1 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse font-sans">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-slate-400 text-[10.5px] uppercase font-bold tracking-wider select-none">
                        <th className="p-3 w-28">工号/账号</th>
                        <th className="p-3">姓名</th>
                        <th className="p-3">安全内置角色</th>
                        <th className="p-3">绑定的 Alfresco Group ID</th>
                        <th className="p-3">所有权信箱</th>
                        <th className="p-3 text-center w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11.5px] text-slate-7000">
                      {matchedUsers.map(user => (
                        <tr key={user.username} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 font-mono font-bold text-slate-900">{user.username}</td>
                          <td className="p-3 font-extrabold text-slate-900">{user.name}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded text-[10px] font-bold">
                              {user.role}
                            </span>
                          </td>
                          <td className="p-3">
                            <code className="bg-slate-100 font-mono text-[10.5px] px-1.5 py-0.5 rounded text-slate-500">
                              {user.alfrescoGroup}
                            </code>
                          </td>
                          <td className="p-3 font-mono text-slate-450 text-[10.5px]">{user.email}</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => triggerToast(`用户「${user.name}」已经进行国盾盾安全绑定核销，暂不开放单点调拨删除。`, 'info')}
                              className="text-blue-600 hover:text-blue-800 text-[11px] font-bold hover:underline"
                            >
                              配置编辑
                            </button>
                          </td>
                        </tr>
                      ))}
                      {matchedUsers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400">
                            该部门/检索词下当前无录入的人员数据。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Insert personnel modal */}
      {isNewUserOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md border border-slate-200 p-6 shadow-2xl relative space-y-4">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm">新增归档柜员 / ERP账户映射</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">将其归档至「{activeDeptLabel}」物理分组，获得对应的电子归档和签名安全权限。</p>
            </div>

            <form onSubmit={handleAddNewUserSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block">新柜员工号/账号 <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="如: 10122"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block">柜员姓名 <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="如: 王强强"
                    value={newRealName}
                    onChange={e => setNewRealName(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs font-sans"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">系统专属职责</label>
                <input
                  type="text"
                  placeholder="如: 出纳审计复核专家"
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">专属安全权限映射组</label>
                <select
                  value={newAlfrescoGroup}
                  onChange={e => setNewAlfrescoGroup(e.target.value)}
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                >
                  <option value="GROUP_FINANCE_ENTRY">GROUP_FINANCE_ENTRY (凭证录入与核验员)</option>
                  <option value="GROUP_ARCHIVE_ADMIN">GROUP_ARCHIVE_ADMIN (全宗档案管理员-高权组)</option>
                  <option value="GROUP_FINANCE_DIRECTOR">GROUP_FINANCE_DIRECTOR (主管与外部审计师-只读监视)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">企业安全核验邮箱</label>
                <input
                  type="email"
                  placeholder="如: wangqiang@corporation-archives.com"
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs font-mono"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsNewUserOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 font-semibold rounded-lg cursor-pointer hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg cursor-pointer hover:bg-blue-700 shadow-sm"
                >
                  提报存盘且同步
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
