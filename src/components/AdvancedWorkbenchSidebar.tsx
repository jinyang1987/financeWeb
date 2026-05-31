import React, { useState } from 'react';
import { 
  FolderTree, Briefcase, Clock, Plus, Library, MapPin, 
  FileInput, FileSpreadsheet, Layers, BookOpen, Calendar,
  ChevronDown, ChevronRight, FolderOpen, Folder, FileText
} from 'lucide-react';
import { CategoryNode } from '../types';

interface AdvancedWorkbenchSidebarProps {
  treeData: CategoryNode[];
  onNodeSelect: (node: CategoryNode | null) => void;
  selectedNode: CategoryNode | null;
  onAddCategory: (parentCode: string, label: string, code: string) => void;
  activeView: 'finance' | 'project' | 'time';
}

export const AdvancedWorkbenchSidebar: React.FC<AdvancedWorkbenchSidebarProps> = ({
  treeData,
  onNodeSelect,
  selectedNode,
  onAddCategory,
  activeView
}) => {
  // States for standard Finance tree
  const [expandedFinance, setExpandedFinance] = useState<Record<string, boolean>>({
    'fonds-1': true,
    'sub-111': true,
    'period-2026': true,
  });
  
  // States for Project tree mockup
  const [expandedProject, setExpandedProject] = useState<Record<string, boolean>>({
    'proj-1': true
  });
  
  // States for Time tree mockup
  const [expandedTime, setExpandedTime] = useState<Record<string, boolean>>({
    'time-2026': true,
    'time-2026-05': true
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    parentCode: '01',
    label: '',
    code: ''
  });

  const getFinanceIcon = (node: CategoryNode, isExpanded: boolean) => {
    if (node.type === 'fonds') return <Library className="w-4 h-4 text-indigo-600 shrink-0" />;
    
    if (node.type === 'class' || node.type === 'subclass') {
      if (node.label.includes('凭证')) return <FileInput className="w-4 h-4 text-blue-500 shrink-0" />;
      if (node.label.includes('账簿')) return <Briefcase className="w-4 h-4 text-amber-500 shrink-0" />;
      if (node.label.includes('报表') || node.label.includes('报告')) return <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />;
      return <Layers className="w-4 h-4 text-slate-500 shrink-0" />;
    }
    
    if (node.type === 'period') return <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    
    return isExpanded ? <FolderOpen className="w-4 h-4 text-slate-500 shrink-0" /> : <Folder className="w-4 h-4 text-slate-500 shrink-0" />;
  };

  const handleCreateCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.label || !formData.code) return;
    onAddCategory(formData.parentCode, formData.label, formData.code);
    setFormData({ parentCode: '01', label: '', code: '' });
    setShowAddForm(false);
  };

  const renderFinanceNode = (node: CategoryNode, depth = 0) => {
    const isExpanded = !!expandedFinance[node.id.toString()];
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedNode?.id === node.id;

    return (
      <div key={node.id} className="select-none">
        <div 
          className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg cursor-pointer transition-colors text-sm ${
            isSelected ? 'bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600' : 'hover:bg-slate-50 text-slate-700'
          }`}
          style={{ paddingLeft: `${Math.max(10, depth * 14)}px` }}
          onClick={() => onNodeSelect(isSelected ? null : node)}
        >
          {hasChildren ? (
            <button 
              className="p-0.5 hover:bg-slate-200 rounded transition-transform text-slate-400 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedFinance(p => ({ ...p, [node.id.toString()]: !p[node.id.toString()] }));
              }}
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : <span className="w-4.5 shrink-0" />}
          {getFinanceIcon(node, isExpanded)}
          <span className="truncate flex-1 py-0.5">{node.label}</span>
          {node.code && (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded font-mono uppercase">
              {node.code}
            </span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="mt-0.5">
            {node.children?.map(child => renderFinanceNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm flex flex-col h-full font-sans">
      {activeView === 'finance' && (
        <div className="bg-slate-900 text-white p-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Library className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold tracking-wide">标准会计类目 (纵向)</span>
          </div>
          <button onClick={() => setShowAddForm(p => !p)} className="p-1 hover:bg-slate-800 rounded">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showAddForm && activeView === 'finance' && (
        <form onSubmit={handleCreateCategorySubmit} className="p-3 bg-slate-50 border-b border-slate-200 text-xs shrink-0 space-y-2">
          {/* Form simplified for space, keeping core function */}
          <div className="flex flex-col gap-2">
            <input required value={formData.label} onChange={e => setFormData(p => ({ ...p, label: e.target.value }))} placeholder="类目名称" className="w-full border p-1 rounded" />
            <input required value={formData.code} onChange={e => setFormData(p => ({ ...p, code: e.target.value }))} placeholder="编码" className="w-full border p-1 rounded font-mono uppercase" />
            <div className="flex justify-end gap-2"><button type="submit" className="bg-blue-600 text-white px-2 py-1 rounded">新建</button></div>
          </div>
        </form>
      )}

      {/* Main Tree List */}
      <div className="flex-1 p-2 overflow-y-auto w-full max-w-full">
        {activeView === 'finance' && treeData.map(node => renderFinanceNode(node))}

        {activeView === 'project' && (
          <div className="space-y-1">
            <div className="text-xs font-bold text-emerald-800 px-2 py-1 flex items-center gap-1 bg-emerald-50 rounded mb-2">
               <Briefcase className="w-3.5 h-3.5"/> 跨维度项目映射
            </div>
            
            {/* Mock Project Tree */}
            <div className="select-none">
              <div 
                className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg cursor-pointer transition-colors text-sm ${selectedNode?.id === 'proj-1' ? 'bg-emerald-50 text-emerald-800 font-bold border-l-2 border-emerald-600' : 'hover:bg-slate-50 text-slate-700'}`}
                onClick={() => onNodeSelect({ id: 'proj-1', label: '华北数据中心建设项目', type: 'fonds', code: '' } as CategoryNode)}
              >
                <button className="p-0.5 hover:bg-slate-200 rounded text-slate-400 shrink-0" onClick={(e) => { e.stopPropagation(); setExpandedProject(p => ({...p, 'proj-1': !p['proj-1']})) }}>
                  {expandedProject['proj-1'] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                <Briefcase className="w-3.5 h-3.5 text-emerald-600" />
                <span className="truncate flex-1 py-0.5">华北数据中心建设项目</span>
              </div>
              
              {expandedProject['proj-1'] && (
                <div className="pl-6 space-y-1 mt-1">
                  {[
                    { id: 'proj-1-contract', icon: <FileText className="w-3.5 h-3.5 text-amber-500" />, label: '合同及协议'},
                    { id: 'proj-1-voucher', icon: <FileInput className="w-3.5 h-3.5 text-blue-500" />, label: '关联会计凭证'},
                    { id: 'proj-1-report', icon: <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />, label: '项目独立报表'}
                  ].map(n => (
                    <div 
                      key={n.id}
                      onClick={() => onNodeSelect({ id: n.id, label: n.label, type: 'subclass', code: '' } as CategoryNode)}
                      className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg cursor-pointer transition-colors text-xs ${selectedNode?.id === n.id ? 'bg-emerald-100 text-emerald-800 font-bold' : 'hover:bg-slate-100 text-slate-600'}`}
                    >
                      {n.icon}
                      <span>{n.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="select-none opacity-60">
              <div className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg cursor-not-allowed text-sm hover:bg-slate-50 text-slate-700`}>
                <button className="p-0.5 rounded text-slate-400 shrink-0"><ChevronRight className="w-3 h-3" /></button>
                <Briefcase className="w-3.5 h-3.5 text-teal-600" />
                <span className="truncate flex-1 py-0.5">AI平台研发三期</span>
              </div>
            </div>
          </div>
        )}

        {activeView === 'time' && (
          <div className="space-y-1">
            <div className="text-xs font-bold text-blue-800 px-2 py-1 flex items-center gap-1 bg-blue-50 rounded mb-2">
               <Clock className="w-3.5 h-3.5"/> 新时间轴核心模式
            </div>
            
            {/* Mock Time Tree */}
            <div className="select-none">
              <div 
                className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg cursor-pointer transition-colors text-sm ${selectedNode?.id === 'time-2026' ? 'bg-indigo-100 text-indigo-900 font-bold border-l-2 border-indigo-600' : 'hover:bg-slate-50 text-slate-700'}`}
                onClick={() => onNodeSelect({ id: 'time-2026', label: '2026年', type: 'period', code: '2026' } as CategoryNode)}
              >
                <button 
                  className="p-0.5 hover:bg-slate-200 rounded text-slate-400 shrink-0"
                  onClick={(e) => { e.stopPropagation(); setExpandedTime(p => ({...p, 'time-2026': !p['time-2026']})) }}
                >
                  {expandedTime['time-2026'] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span className="truncate flex-1 py-0.5 font-bold">2026年</span>
              </div>
              
              {expandedTime['time-2026'] && (
                <div className="pl-6 space-y-1 mt-1">
                  {/* Inside 2026, show Month node */}
                  <div 
                    className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg cursor-pointer transition-colors text-sm ${selectedNode?.id === 'time-2026-05' ? 'bg-indigo-100 text-indigo-900 font-bold border-l-2 border-indigo-600' : 'hover:bg-slate-50 text-slate-700'}`}
                    onClick={() => onNodeSelect({ id: 'time-2026-05', label: '05月', type: 'period', code: '202605' } as CategoryNode)}
                  >
                    <button className="p-0.5 hover:bg-slate-200 rounded text-slate-400 shrink-0" onClick={(e) => { e.stopPropagation(); setExpandedTime(p => ({...p, 'time-2026-05': !p['time-2026-05']})) }}>
                      {expandedTime['time-2026-05'] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    <FolderOpen className="w-3.5 h-3.5 text-indigo-500" />
                    <span>05月</span>
                  </div>

                  {expandedTime['time-2026-05'] && (
                    <div className="pl-6 space-y-1 mt-1">
                      {[
                        { id: 'time-2026-05-voucher', icon: <FileInput className="w-3.5 h-3.5 text-blue-500" />, label: '会计凭证'},
                        { id: 'time-2026-05-book', icon: <Briefcase className="w-3.5 h-3.5 text-amber-500" />, label: '会计账簿'},
                        { id: 'time-2026-05-report', icon: <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />, label: '财务报表'},
                        { id: 'time-2026-05-other', icon: <Layers className="w-3.5 h-3.5 text-slate-400" />, label: '其他会计资料'}
                      ].map(n => (
                        <div 
                          key={n.id}
                          onClick={() => onNodeSelect({ id: n.id, label: n.label, type: 'class', code: '' } as CategoryNode)}
                          className={`flex items-center gap-2 py-1.5 px-2.5 rounded-lg cursor-pointer transition-colors text-xs ${selectedNode?.id === n.id ? 'bg-indigo-50 text-indigo-800 font-bold' : 'hover:bg-slate-100 text-slate-600'}`}
                        >
                          {n.icon}
                          <span>{n.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg opacity-50 cursor-not-allowed text-sm">
                    <button className="p-0.5 rounded text-slate-400 shrink-0"><ChevronRight className="w-3 h-3" /></button>
                    <Folder className="w-3.5 h-3.5 text-slate-400" />
                    <span>04月</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
