/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FolderPlus, Folder, FolderOpen, ChevronDown, ChevronRight, 
  BookOpen, Layers, Library, Calendar, Plus, Trash2, Tag
} from 'lucide-react';
import { CategoryNode } from '../types';

interface ArchiveTreeProps {
  treeData: CategoryNode[];
  onNodeSelect: (node: CategoryNode | null) => void;
  selectedNode: CategoryNode | null;
  onAddCategory: (parentCode: string, label: string, code: string) => void;
}

export const ArchiveTree: React.FC<ArchiveTreeProps> = ({ 
  treeData, 
  onNodeSelect, 
  selectedNode, 
  onAddCategory 
}) => {
  // Simple state to track expanded nodes by ID/code
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'fonds-1': true,
    'cat-11': true,
    'sub-111': true,
  });

  // State for the "Add New Category" popup form
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    parentCode: '01', // defaults to 01 会计档案类
    label: '',
    code: ''
  });

  const toggleNode = (id: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    const nodeKey = id.toString();
    setExpandedNodes(prev => ({
      ...prev,
      [nodeKey]: !prev[nodeKey]
    }));
  };

  const selectNode = (node: CategoryNode) => {
    if (selectedNode?.id === node.id) {
      onNodeSelect(null); // Deselect on clicking again
    } else {
      onNodeSelect(node);
    }
  };

  const getIcon = (type: CategoryNode['type'], isExpanded: boolean) => {
    switch (type) {
      case 'fonds':
        return <Library className="w-4 h-4 text-indigo-600 shrink-0" />;
      case 'class':
        return <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />;
      case 'subclass':
        return <Layers className="w-4 h-4 text-teal-600 shrink-0" />;
      case 'period':
        return <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
      default:
        return isExpanded 
          ? <FolderOpen className="w-4 h-4 text-slate-500 shrink-0" /> 
          : <Folder className="w-4 h-4 text-slate-500 shrink-0" />;
    }
  };

  const handleCreateCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.label || !formData.code) return;
    onAddCategory(formData.parentCode, formData.label, formData.code);
    setFormData({ parentCode: '01', label: '', code: '' });
    setShowAddForm(false);
  };

  // Pre-load parents in the dropdown for assigning
  const renderNode = (node: CategoryNode, depth = 0) => {
    const isExpanded = !!expandedNodes[node.id.toString()];
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedNode?.id === node.id;

    return (
      <div key={node.id} className="select-none">
        {/* Row element */}
        <div 
          className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg cursor-pointer transition-colors text-sm ${
            isSelected 
              ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600' 
              : 'hover:bg-slate-50 text-slate-700'
          }`}
          style={{ paddingLeft: `${Math.max(10, depth * 14)}px` }}
          onClick={() => selectNode(node)}
        >
          {/* Chevron expander */}
          {hasChildren ? (
            <button 
              className="p-0.5 hover:bg-slate-200 rounded transition-transform text-slate-400 shrink-0"
              onClick={(e) => toggleNode(node.id, e)}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4.5 shrink-0" /> // spacer
          )}

          {/* Icon */}
          {getIcon(node.type, isExpanded)}

          {/* Node text */}
          <span className="truncate flex-1 py-0.5">{node.label}</span>

          {/* Code badge */}
          {node.code && (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded font-mono uppercase">
              {node.code}
            </span>
          )}
        </div>

        {/* Children node list */}
        {hasChildren && isExpanded && (
          <div className="mt-0.5" id={`children-of-${node.id}`}>
            {node.children?.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div id="archive-category-tree" className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Library className="w-4.5 h-4.5 text-blue-400" />
          <span className="text-sm font-bold tracking-wide">会计档案会计类目</span>
        </div>
        <button 
          title="新建类目"
          onClick={() => setShowAddForm(prev => !prev)}
          className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Dynamic insertion form */}
      {showAddForm && (
        <form onSubmit={handleCreateCategorySubmit} className="p-3 bg-slate-50 border-b border-slate-200 text-xs shrink-0 space-y-2">
          <div className="font-semibold text-slate-700 flex items-center gap-1">
            <FolderPlus className="w-3.5 h-3.5 text-blue-600" />
            <span>新增二级类目/期间</span>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-0.5">隶属父级</label>
            <select 
              value={formData.parentCode} 
              onChange={e => setFormData(prev => ({ ...prev, parentCode: e.target.value }))}
              className="w-full bg-white border border-slate-200 p-1.5 rounded focus:outline-blue-500 inline-block text-xs"
            >
              <option value="01">01 会计档案类</option>
              <option value="01-01">01-01 记账凭证</option>
              <option value="01-02">01-02 会计账簿</option>
              <option value="01-03">01-03 财务报告</option>
              <option value="02">02 行政公文及凭证</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-slate-500 mb-0.5">类目名称</label>
              <input
                type="text"
                placeholder="例: 2026年06月"
                required
                value={formData.label}
                onChange={e => setFormData(prev => ({ ...prev, label: e.target.value }))}
                className="w-full bg-white border border-slate-200 p-1 rounded focus:outline-blue-500 text-xs text-slate-700"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-0.5">类目编码</label>
              <input
                type="text"
                placeholder="例: 202606"
                required
                value={formData.code}
                onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))}
                className="w-full bg-white border border-slate-200 p-1 rounded focus:outline-blue-500 text-xs font-mono text-slate-700"
              />
            </div>
          </div>
          <div className="flex justify-end gap-1 pt-1">
            <button 
              type="button" 
              onClick={() => setShowAddForm(false)} 
              className="px-2 py-1 border border-slate-200 bg-white rounded text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              取消
            </button>
            <button 
              type="submit" 
              className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
            >
              创建
            </button>
          </div>
        </form>
      )}

      {/* Tree list rendering */}
      <div className="flex-1 p-3 overflow-y-auto space-y-1">
        {treeData.map(node => renderNode(node))}
        
        {treeData.length === 0 && (
          <div className="text-center text-slate-400 py-10 text-xs">
            暂无类目架构
          </div>
        )}
      </div>

      {/* Quick filters guide */}
      <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 shrink-0">
        <p className="flex items-center gap-1.5">
          <Tag className="w-3 h-3 text-indigo-500" />
          <span>点击类目即可进行级联过滤</span>
        </p>
      </div>
    </div>
  );
};
