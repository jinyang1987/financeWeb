/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Tag, Edit, RefreshCw, Layers, ShieldCheck, Plus, Trash2, Info, 
  ArrowLeft, Check, Code, Settings, HelpCircle, Database, FileCode, CheckCircle, AlertCircle
} from 'lucide-react';
import { CategoryConfigItem, MetadataProperty, Fonds } from '../types';

interface CategoryConfigPanelProps {
  currentFanzongCode: string;
  setCurrentFanzongCode: (code: string) => void;
  fanzongs: Fonds[];
  fanzongCategories: Record<string, CategoryConfigItem[]>;
  setFanzongCategories: React.Dispatch<React.SetStateAction<Record<string, CategoryConfigItem[]>>>;
  triggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const CategoryConfigPanel: React.FC<CategoryConfigPanelProps> = ({
  currentFanzongCode,
  setCurrentFanzongCode,
  fanzongs,
  fanzongCategories,
  setFanzongCategories,
  triggerToast
}) => {
  // Navigation inside the panel: list vs detailed editing
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  // XML preview state
  const [xmlVisible, setXmlVisible] = useState(false);
  
  // Sync state for loading feedback
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  // Temp form state for adding a category
  const [showAddCatForm, setShowAddCatForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('');

  // Temp form state for adding a property
  const [newProp, setNewProp] = useState<Partial<MetadataProperty>>({
    label: '',
    key: '',
    dataType: 'string',
    isRequired: false,
    ocrEnabled: true,
    gbStandardCode: '',
    description: ''
  });

  // Fetch categories of current Fanzong
  const currentCategories = useMemo(() => {
    return fanzongCategories[currentFanzongCode] || [];
  }, [fanzongCategories, currentFanzongCode]);

  // Current editing category
  const activeCategory = useMemo(() => {
    if (!editingCategoryId) return null;
    return currentCategories.find(c => c.id === editingCategoryId) || null;
  }, [currentCategories, editingCategoryId]);

  // Sync current Fanzong to baseline DB
  const handleSyncToAlfresco = (id: string, name: string) => {
    setIsSyncing(id);
    setTimeout(() => {
      setIsSyncing(null);
      triggerToast(
        `【Alfresco 内容引擎同步成功】「${name}」对应的国档元数据属性集已提交至底层 Spring bean DictionaryService 动态生效，对应的 contentModel.xml 缓存表已被重构刷新！`,
        'success'
      );
    }, 1500);
  };

  // Add new archival category
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName || !newCatType) {
      triggerToast('请输入门类名称及 Alfresco 模型类型绑定。', 'warning');
      return;
    }

    const typePrefix = newCatType.startsWith('archive:') ? newCatType : `archive:${newCatType}`;
    const newId = `cat-${Date.now()}`;
    const newCategory: CategoryConfigItem = {
      id: newId,
      name: newCatName,
      alfrescoType: typePrefix,
      creator: 'admin (首席审计官)',
      createTime: new Date().toISOString().split('T')[0],
      properties: [
        { id: `p-${Date.now()}-1`, key: 'archiveCode', label: '档号', dataType: 'string', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-A.1', description: '会计档案之规范化系统档号' },
        { id: `p-${Date.now()}-2`, key: 'retention', label: '保管期限', dataType: 'string', isRequired: true, ocrEnabled: false, gbStandardCode: 'GB/T 18894-A.4', description: '档案法规定之保管期限：30年/永久' }
      ]
    };

    setFanzongCategories(prev => {
      const currentList = prev[currentFanzongCode] || [];
      return {
        ...prev,
        [currentFanzongCode]: [...currentList, newCategory]
      };
    });

    setNewCatName('');
    setNewCatType('');
    setShowAddCatForm(false);
    triggerToast(`成功扩展当前全宗门类：${newCatName}，已自动挂载国标基础核查元数据。`, 'success');
  };

  // Delete category
  const handleDeleteCategory = (catId: string, name: string) => {
    if (confirm(`警告：此操作将永久废除该门类模型 (类型: ${name}) 及其可能产生的一百多项元属性配置。该操作不可逆，是否继续？`)) {
      setFanzongCategories(prev => {
        const currentList = prev[currentFanzongCode] || [];
        return {
          ...prev,
          [currentFanzongCode]: currentList.filter(c => c.id !== catId)
        };
      });
      triggerToast(`已成功移除档案门类：${name}`, 'info');
    }
  };

  // Save properties inside detailed editor
  const handleSavePropertyEdit = (updatedProps: MetadataProperty[]) => {
    if (!editingCategoryId) return;
    setFanzongCategories(prev => {
      const currentList = prev[currentFanzongCode] || [];
      const updatedList = currentList.map(c => {
        if (c.id === editingCategoryId) {
          return { ...c, properties: updatedProps };
        }
        return c;
      });
      return {
        ...prev,
        [currentFanzongCode]: updatedList
      };
    });
  };

  // Add new Metadata Property
  const handleAddPropertySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCategory || !newProp.label || !newProp.key) {
      triggerToast('请补充完整的元数据中文标识与物理属性键。', 'warning');
      return;
    }

    // Check duplicate key
    const duplicate = activeCategory.properties.some(p => p.key.toLowerCase() === newProp.key?.toLowerCase());
    if (duplicate) {
      triggerToast(`元属性键 「${newProp.key}」 在当前门类已定义，请勿重复注册！`, 'warning');
      return;
    }

    const cleanProperty: MetadataProperty = {
      id: `prop-${Date.now()}`,
      key: newProp.key,
      label: newProp.label,
      dataType: (newProp.dataType as any) || 'string',
      isRequired: !!newProp.isRequired,
      ocrEnabled: !!newProp.ocrEnabled,
      gbStandardCode: newProp.gbStandardCode || '自定义字段',
      description: newProp.description || ''
    };

    const nextProps = [...activeCategory.properties, cleanProperty];
    handleSavePropertyEdit(nextProps);

    // reset fields
    setNewProp({
      label: '',
      key: '',
      dataType: 'string',
      isRequired: false,
      ocrEnabled: true,
      gbStandardCode: '',
      description: ''
    });

    triggerToast(`成功登记元属性：${newProp.label} (${newProp.key})`, 'success');
  };

  // Delete single Metadata Property
  const handleDeleteProperty = (propId: string, label: string) => {
    if (!activeCategory) return;
    const nextProps = activeCategory.properties.filter(p => p.id !== propId);
    handleSavePropertyEdit(nextProps);
    triggerToast(`已废止物理元数据字段：「${label}」`, 'info');
  };

  // Switch "isRequired"
  const handleToggleRequired = (propId: string) => {
    if (!activeCategory) return;
    const nextProps = activeCategory.properties.map(p => {
      if (p.id === propId) {
        return { ...p, isRequired: !p.isRequired };
      }
      return p;
    });
    handleSavePropertyEdit(nextProps);
    triggerToast(`字段约束策略更新`, 'info');
  };

  // Switch "ocrEnabled"
  const handleToggleOcr = (propId: string) => {
    if (!activeCategory) return;
    const nextProps = activeCategory.properties.map(p => {
      if (p.id === propId) {
        return { ...p, ocrEnabled: !p.ocrEnabled };
      }
      return p;
    });
    handleSavePropertyEdit(nextProps);
    triggerToast(`OCR自动捕捉识别配置已更改`, 'info');
  };

  // Modify individual property property in grid (e.g. key pattern details)
  const handleFieldChange = (propId: string, field: keyof MetadataProperty, value: any) => {
    if (!activeCategory) return;
    const nextProps = activeCategory.properties.map(p => {
      if (p.id === propId) {
        return { ...p, [field]: value };
      }
      return p;
    });
    handleSavePropertyEdit(nextProps);
  };

  // XML contentModel generator
  const generatedXml = useMemo(() => {
    if (!activeCategory) return '';
    const propertiesString = activeCategory.properties.map(p => {
      let alfType = 'd:text';
      if (p.dataType === 'number') alfType = 'd:int';
      else if (p.dataType === 'decimal') alfType = 'd:double';
      else if (p.dataType === 'date') alfType = 'd:date';
      else if (p.dataType === 'boolean') alfType = 'd:boolean';

      return `            <property name="${activeCategory.alfrescoType}:${p.key}">
               <title>${p.label}</title>
               <description>${p.description || p.label}</description>
               <type>${alfType}</type>
               <mandatory>${p.isRequired ? 'true' : 'false'}</mandatory>
               <index-enabled>true</index-enabled>
               <!-- GB/T Standard alignment alignment: ${p.gbStandardCode} -->
               <!-- intelligent_ocr: ${p.ocrEnabled ? 'active' : 'disabled'} -->
            </property>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated Dynamically by Antigravity Model System under GB/T 18894 -->
<model name="${activeCategory.alfrescoType}Model" xmlns="http://www.alfresco.org/model/dictionary/1.0">
   <description>Dynamic schema definition for ${activeCategory.name}</description>
   <author>admin (Chief Audit Officer)</author>
   <version>1.0</version>

   <namespaces>
      <namespace uri="http://www.china-audit.gov.cn/model/${activeCategory.alfrescoType}/1.0" prefix="${activeCategory.alfrescoType.split(':')[1]}"/>
   </namespaces>

   <types>
      <type name="${activeCategory.alfrescoType}">
         <title>${activeCategory.name} 电子档案基础门类</title>
         <parent>cm:content</parent>
         <properties>
${propertiesString}
         </properties>
      </type>
   </types>
</model>`;
  }, [activeCategory]);

  return (
    <div id="category-config-dashboard" className="space-y-5 animate-in fade-in duration-200">
      
      {/* SECTION 1: GLOBAL TOP BAR & FONDS SWITCHER */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-3xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 bg-blue-100 text-blue-800 font-bold text-[10.5px] rounded-lg tracking-wider uppercase font-mono">
              Fonds Config Space
            </span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs font-semibold text-slate-600">独立全宗元数据隔离区</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <span>每个全宗独立配置：档案门类与元数据模型映射</span>
          </h2>
          <p className="text-xs text-slate-500">
            国档 GB/T 18894 标准规定，各全宗（Fonds）所涉及的业务各异，应当单独设置其专属的档案门类及细粒度元数据字段。
          </p>
        </div>

        {/* Beautiful full-fonds visual clickable capsules */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 border border-slate-200/60 rounded-2xl w-full md:w-auto">
          <span className="text-xs text-slate-500 font-bold pl-1.5 shrink-0 hidden lg:inline">切换至其他全宗:</span>
          {fanzongs.map(f => {
            const isActive = f.code === currentFanzongCode;
            const isInactive = f.status === 'inactive';
            return (
              <button
                key={f.code}
                type="button"
                onClick={() => {
                  setCurrentFanzongCode(f.code);
                  setEditingCategoryId(null); // Reset back to list on switch
                  triggerToast(`正在查阅和配置：${f.name}`, 'info');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                  isActive 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-1 ring-blue-500/10' 
                    : isInactive 
                      ? 'bg-slate-100/50 text-slate-400 border-slate-200 cursor-not-allowed hover:bg-slate-100'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-350 hover:bg-slate-50'
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : isInactive ? 'bg-slate-300' : 'bg-emerald-500'}`} />
                <span>{f.code}</span>
                <span className="max-w-[70px] lg:max-w-[120px] truncate font-sans font-medium text-[10px] opacity-90">{f.name.split('（')[1]?.split('）')[0] || f.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {editingCategoryId === null ? (
        /* =========================================================================
           VIEW A: ARCHIVAL CATEGORIES GRID (LIST VIEW) UNDER CURRENT SELECTED FONDS
           ========================================================================= */
        <div className="space-y-4 animate-in fade-in duration-200 animate-slide-in-from-bottom-3">
          
          <div className="p-4 bg-indigo-50/50 border border-indigo-150/60 rounded-2xl flex items-start gap-3.5 text-xs text-slate-700">
            <Info className="w-4.5 h-4.5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="text-indigo-900 font-bold flex items-center gap-1.5">
                <span>当前全宗模型：{fanzongs.find(f => f.code === currentFanzongCode)?.name || currentFanzongCode}</span>
                <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-mono font-bold rounded">Active</span>
              </strong>
              <p className="text-slate-600 leading-relaxed">
                当前所选全宗下共有 <span className="font-bold text-indigo-600 font-mono text-sm">{currentCategories.length}</span> 个独立的档案门类可用。所有档案门类的元数据映射都使用逻辑分区独立处理，更改后将物理同步至该账套。
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-slate-500" />
              <span>当前全宗下挂档案分类门类集列表</span>
            </h3>

            <button
              type="button"
              onClick={() => setShowAddCatForm(!showAddCatForm)}
              className="px-3 py-1.5 border border-indigo-200 text-indigo-600 hover:bg-slate-50 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增当前全宗门类</span>
            </button>
          </div>

          {/* New Category creation form */}
          {showAddCatForm && (
            <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-2xl space-y-3.5 max-w-xl text-xs">
              <div className="font-bold text-slate-700">在 {currentFanzongCode} 创建新的独立会计档案门类</div>
              <form onSubmit={handleAddCategory} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-500 font-semibold block">门类名称 (Chinese Title)</label>
                  <input 
                    type="text" 
                    placeholder="例如: 差旅审批凭单 / 固定资产调拨单"
                    required
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500 font-semibold block">Alfresco Content Model Type</label>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono text-[11px] font-semibold">archive:</span>
                    <input 
                      type="text" 
                      placeholder="例如: trav_approval"
                      required
                      value={newCatType}
                      onChange={e => setNewCatType(e.target.value)}
                      className="w-full bg-white border border-slate-200 p-2 rounded-xl focus:outline-none focus:border-blue-500 text-xs text-slate-700 font-mono"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2 pt-2 flex justify-end gap-2">
                  <button 
                    type="button" 
                    onClick={() => setShowAddCatForm(false)}
                    className="px-3 py-1.5 border border-slate-200 bg-white text-slate-600 rounded-lg cursor-pointer hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-1.5 bg-blue-650 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer shadow-3xs"
                  >
                    创建新门类
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Grid Layout of categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
            {currentCategories.map(c => (
              <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs hover:border-slate-350 hover:shadow-sm transition-all flex flex-col justify-between group h-[190px]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[9.5px] font-mono font-bold rounded">
                      Type: {c.alfrescoType}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {c.createTime}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{c.name}</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-normal line-clamp-2">
                    已挂接元数据属性：{c.properties.map(p => p.label).join('、')}
                  </p>
                </div>

                <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(c.id, c.name)}
                    className="p-1.5 border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 rounded-lg transition-colors cursor-pointer"
                    title="废弃分类"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <button
                      type="button"
                      disabled={isSyncing !== null}
                      onClick={() => handleSyncToAlfresco(c.id, c.name)}
                      className={`px-2 py-1.5 font-bold text-[10.5px] rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer ${
                        isSyncing === c.id 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-emerald-50 border border-emerald-250 hover:bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isSyncing === c.id ? (
                        <>
                          <RefreshCw className="w-2.5 h-2.5 animate-spin text-emerald-600" />
                          <span>同步中</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                          <span>同步物理容器</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategoryId(c.id);
                        triggerToast(`切换至完整页面，进入门类「${c.name}」元数据工作室`, 'success');
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10.5px] rounded-lg transition-all shadow-3xs flex items-center gap-1 cursor-pointer flex-1 justify-center"
                    >
                      <Edit className="w-2.5 h-2.5" />
                      <span>元数据配置工作室</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {currentCategories.length === 0 && (
              <div className="col-span-full bg-slate-50 border border-slate-200 border-dashed rounded-3xl p-10 text-center space-y-2">
                <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
                <h4 className="font-bold text-slate-700 text-xs">当前全宗未定义任何档案分类!</h4>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">请点击右上角【新增当前全宗门类】为 {currentFanzongCode} 挂载专属的归档会计或审计分类定义。</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* =========================================================================
           VIEW B: EXHAUSTIVE METADATA CONFIGURATION STUDIO (FULL-PAGE DETAILED PANEL)
           ========================================================================= */
        activeCategory && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-6 animate-in fade-in duration-200 animate-slide-in-from-right-4">
            
            {/* Top Back-control bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditingCategoryId(null)}
                  className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl cursor-pointer text-slate-600 transition-colors"
                  title="返回门类列表"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9.5px] tracking-wider font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                      Model Namespace URI: http:// china-audit.gov.cn/model/{activeCategory.alfrescoType}
                    </span>
                    <span className="text-slate-350">/</span>
                    <span className="text-[10px] text-slate-500 font-semibold font-mono">
                      全宗: {currentFanzongCode} 专属
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-1 flex items-center gap-2">
                    <Tag className="w-5 h-5 text-indigo-600" />
                    <span>{activeCategory.name} ： 元数据及国标属性工作室</span>
                  </h3>
                </div>
              </div>

              {/* Action shortcuts */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setXmlVisible(!xmlVisible)}
                  className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Code className="w-3.5 h-3.5 text-slate-500" />
                  <span>{xmlVisible ? '隐藏 XML 契约预览' : '查看 ContentModel XML'}</span>
                </button>

                <button
                  type="button"
                  disabled={isSyncing !== null}
                  onClick={() => handleSyncToAlfresco(activeCategory.id, activeCategory.name)}
                  className={`px-3.5 py-1.5 text-white font-bold rounded-xl shadow-3xs flex items-center gap-1.5 cursor-pointer transition-all ${
                    isSyncing === activeCategory.id 
                      ? 'bg-emerald-600 text-white' 
                      : 'bg-emerald-650 hover:bg-emerald-700'
                  }`}
                >
                  {isSyncing === activeCategory.id ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>正在布控部署...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 text-white" />
                      <span>发布并同步至物理库模型集</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Splitted Sub-view: XML Preview on Top if selected */}
            {xmlVisible && (
              <div className="bg-slate-900 text-slate-200 border border-slate-800 p-4.5 rounded-2xl shadow-inner font-mono text-[11px] relative select-all animate-in zoom-in-95 duration-150">
                <div className="absolute right-3.5 top-3.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Dynamically Compiled XML (Alfresco Content Model Standard Definition)</span>
                </div>
                <pre className="max-h-[250px] overflow-y-auto whitespace-pre leading-relaxed">{generatedXml}</pre>
              </div>
            )}

            {/* Studio Workspace Content Grid split */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              
              {/* PRIMARY LEFT BLOCK: DECLARED PROPERTIES TABLE GRID (Stretched full-width for maximum space) */}
              <div className="xl:col-span-12 space-y-4">
                <div className="border border-slate-200/90 rounded-2xl bg-white overflow-hidden shadow-3xs">
                  <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">国档属性体系集 ({activeCategory.properties.length}项字段已定义)</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">所有的元数据直接约束财务发票/记账凭证的一致性校验, 直接匹配 OCR 四性自动识别审计底线</p>
                    </div>
                    <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full font-bold font-mono text-[10px]">
                      GB/T 18894 标准兼容
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs" id="metadata-studio-table">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-400 text-[10px] font-bold uppercase tracking-wider select-none">
                          <th className="p-3.5 pl-4 w-32">元属性标题（中文）</th>
                          <th className="p-3.5 w-36">物理字段Key（XML）</th>
                          <th className="p-3.5 w-28">元数据类型</th>
                          <th className="p-3.5 text-center w-20">必填约束</th>
                          <th className="p-3.5 text-center w-24">智能捕获ocr</th>
                          <th className="p-3.5 w-32">国标规范代码</th>
                          <th className="p-3.5 text-center w-14">危险项</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeCategory.properties.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50/40 transition-colors select-none">
                            {/* Chinese Indicator */}
                            <td className="p-3.5 pl-4">
                              <input 
                                type="text"
                                value={p.label}
                                onChange={e => handleFieldChange(p.id, 'label', e.target.value)}
                                className="bg-transparent border-b border-transparent focus:border-indigo-400 font-bold text-slate-800 focus:outline-none w-full py-0.5 text-xs"
                              />
                            </td>

                            {/* Property key in database */}
                            <td className="p-3.5">
                              <code className="bg-indigo-50/60 text-indigo-700 font-mono text-[11px] px-1.5 py-0.5 rounded border border-indigo-100/60">
                                {p.key}
                              </code>
                            </td>

                            {/* Type select */}
                            <td className="p-3.5">
                              <select
                                value={p.dataType}
                                onChange={e => handleFieldChange(p.id, 'dataType', e.target.value)}
                                className="bg-slate-50/80 border border-slate-200/80 hover:border-slate-350 p-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-[11px] font-medium font-sans w-full"
                              >
                                <option value="string">文本 (string)</option>
                                <option value="number">整数 (number)</option>
                                <option value="decimal">浮点数 (decimal)</option>
                                <option value="date">日期 (date)</option>
                                <option value="boolean">布尔 (boolean)</option>
                              </select>
                            </td>

                            {/* Mandatory checkbox */}
                            <td className="p-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleRequired(p.id)}
                                className={`inline-flex p-1 rounded-lg transition-colors cursor-pointer ${
                                  p.isRequired 
                                    ? 'bg-amber-100 text-amber-700' 
                                    : 'bg-slate-100 text-slate-400 hover:text-slate-600'
                                }`}
                                title={p.isRequired ? '必填字段：四性校验无法通过如缺失' : '选填字段'}
                              >
                                {p.isRequired ? <Check className="w-3.5 h-3.5 stroke-[3px]" /> : <span className="w-3.5 text-[10px] block font-bold">-</span>}
                              </button>
                            </td>

                            {/* OCR enable toggle */}
                            <td className="p-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleOcr(p.id)}
                                className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-bold border transition-colors cursor-pointer ${
                                  p.ocrEnabled 
                                    ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                    : 'bg-slate-50 text-slate-400 border-slate-200/80'
                                }`}
                              >
                                {p.ocrEnabled ? '触发捕获' : '跳过自动'}
                              </button>
                            </td>

                            {/* GB Code */}
                            <td className="p-3.5">
                              <input 
                                type="text"
                                placeholder="..."
                                value={p.gbStandardCode}
                                onChange={e => handleFieldChange(p.id, 'gbStandardCode', e.target.value)}
                                className="bg-transparent border-b border-transparent focus:border-slate-350 text-slate-600 focus:outline-none w-full py-0.5 text-[11px]"
                              />
                            </td>

                            {/* Delete single field */}
                            <td className="p-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteProperty(p.id, p.label)}
                                className="p-1 text-slate-400 hover:text-rose-500 rounded-md transition-colors cursor-pointer"
                                title="废止该属性"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}

                        {activeCategory.properties.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-400 space-y-1">
                              <span>当前门类处于空模型状态，归档校验时将不会审核任何核心元数据！</span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Properties list footer hint */}
                  <div className="p-3 bg-slate-50 text-[10.5px] text-slate-400 border-t border-slate-100 flex items-center justify-between">
                    <span>* 提示：中文标题与国标代码可以在表格单元格中直接点击修改并即时存盘。</span>
                    <span className="font-mono text-slate-500">Schema ID: {activeCategory.alfrescoType}</span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex gap-4 text-xs font-semibold text-slate-600">
                  <div className="p-2.5 bg-slate-200 rounded-xl flex items-center justify-center text-slate-700">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-slate-800 font-bold">同步生效与数据库映射 (Database Migration)</div>
                    <div className="text-slate-500 font-sans font-medium text-[11px] leading-normal mt-0.5">
                      通过元数据配置面板所作的属性增加或废除将首先在本地反应。点击页面右上角 <strong>“发布并同步至物理库模型集”</strong> 将在 Alfresco 表存储中提交静态 content model 刷新，同时触发底层 PostgreSQL 对于元数据大宽表的动态扩展重挂，并不会造成业务停摆或丢数。
                    </div>
                  </div>
                </div>
              </div>

              {/* SECONDARY RIGHT BLOCK: CREATION CORNER (Stretched full-width) */}
              <div className="xl:col-span-12 space-y-4">
                
                {/* Form to Append New Metadata Property */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 shadow-3xs space-y-3.5">
                  <div className="border-b border-slate-200 pb-2">
                    <h4 className="font-bold text-slate-800 text-xs">登记/开发新元数据字段 (Append Metadata)</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">将新的财务报销账目数据项，追加绑定到此门类。</p>
                  </div>

                  <form onSubmit={handleAddPropertySubmit} className="space-y-3 text-xs">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600 block">元数据中文标识 <span className="text-rose-500">*</span></label>
                      <input 
                        type="text"
                        required
                        placeholder="例：付款代理行 / 凭证字号"
                        value={newProp.label}
                        onChange={e => setNewProp(prev => ({ ...prev, label: e.target.value }))}
                        className="w-full bg-white border border-slate-200 p-2 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-600 block">物理属性键 (Must match backend key) <span className="text-rose-500">*</span></label>
                      <input 
                        type="text"
                        required
                        placeholder="例：agentBank / voucherNo (驼峰)"
                        value={newProp.key}
                        onChange={e => setNewProp(prev => ({ ...prev, key: e.target.value }))}
                        className="w-full bg-white border border-slate-200 p-2 rounded-xl focus:outline-none focus:border-blue-500 text-xs font-mono text-slate-700"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">元数据类型</label>
                        <select
                          value={newProp.dataType}
                          onChange={e => setNewProp(prev => ({ ...prev, dataType: e.target.value as any }))}
                          className="w-full bg-white border border-slate-200 p-2 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                        >
                          <option value="string">文本 (string)</option>
                          <option value="number">整数 (number)</option>
                          <option value="decimal">浮点数 (decimal)</option>
                          <option value="date">日期 (date)</option>
                          <option value="boolean">布尔 (boolean)</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-slate-600 block">GB/T国标规范前缀</label>
                        <input 
                          type="text"
                          placeholder="例：GB/T-A.1.5"
                          value={newProp.gbStandardCode}
                          onChange={e => setNewProp(prev => ({ ...prev, gbStandardCode: e.target.value }))}
                          className="w-full bg-white border border-slate-200 p-2 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 select-none">
                      <div className="flex items-center gap-1.5 p-1.5 hover:bg-slate-100 rounded-lg">
                        <input 
                          type="checkbox"
                          id="new-is-required"
                          checked={newProp.isRequired}
                          onChange={e => setNewProp(prev => ({ ...prev, isRequired: e.target.checked }))}
                          className="w-3.5 h-3.5 cursor-pointer accent-blue-600"
                        />
                        <label htmlFor="new-is-required" className="text-[10.5px] font-semibold text-slate-600 cursor-pointer">硬性必填规范</label>
                      </div>

                      <div className="flex items-center gap-1.5 p-1.5 hover:bg-slate-100 rounded-lg">
                        <input 
                          type="checkbox"
                          id="new-ocr-enabled"
                          checked={newProp.ocrEnabled}
                          onChange={e => setNewProp(prev => ({ ...prev, ocrEnabled: e.target.checked }))}
                          className="w-3.5 h-3.5 cursor-pointer accent-blue-600"
                        />
                        <label htmlFor="new-ocr-enabled" className="text-[10.5px] font-semibold text-slate-600 cursor-pointer">智能OCR自动捕捉</label>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-600 block">字段含义与约束描述</label>
                      <textarea
                        rows={2}
                        placeholder="键入关于此属性在业务上的校验参考线，例如「应与纸质凭证右上顶端编号严格一致」..."
                        value={newProp.description}
                        onChange={e => setNewProp(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full bg-white border border-slate-200 p-2 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
                    >
                      追加注册此属性
                    </button>
                  </form>
                </div>

                {/* Info and help widget */}
                <div className="bg-blue-50/50 border border-blue-150 rounded-2xl p-4.5 space-y-2.5 text-xs text-blue-800">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <HelpCircle className="w-4 h-4 text-blue-600" />
                    <span>关于国档 GB/T 18894 元数据</span>
                  </div>
                  <p className="text-slate-600 font-sans font-medium text-[11px] leading-normal">
                    根据国家《电子会计档案建设指导标准第六章》，所有档案必须强制挂载真实有效的元属性，如 <code>archiveCode</code> (档号 prefix)、<code>retention</code> (年限限制等)。
                  </p>
                  <p className="text-slate-600 font-sans font-medium text-[11px] leading-normal">
                    如果您希望属性在校验时关联深度比对规则，物理字段 Key 必须严格采用首字母小写驼峰，不能带特殊符号，以便底层 XML 进行 <code>DictionaryService</code> 动态加载解析。
                  </p>
                </div>

              </div>

            </div>

            {/* Editor Bottom Footer panel controls */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setEditingCategoryId(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-xl cursor-pointer transition-colors"
              >
                ← 保存并返回档案门类概览
              </button>

              <span className="text-slate-400 text-[10px] font-mono">
                当前开发模式: 堆内XML重谱直接生效 (Active-Hot-Reload)
              </span>
            </div>

          </div>
        )
      )}
    </div>
  );
};
