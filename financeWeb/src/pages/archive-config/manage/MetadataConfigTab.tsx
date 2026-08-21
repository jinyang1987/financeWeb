/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * MetadataConfigTab — 档案管理配置 · 元数据（2026-08-21 并入档案管理配置）
 *
 * 展示 DA/T 94-2022 电子会计档案元数据方案（附录A）的全部元数据项，
 * 以及 DA/T 39 纸质会计档案卷级元数据方案。
 *
 * 交互：左侧导航（概览 + 卷级/件级/盒级 12 个分组 + 全局搜索 + 必选性筛选），
 * 右侧一次只展示一个分组。"页面设置"配置详情页展示哪些元数据字段以及顺序。
 *
 * 2026-08-21：页头标题/方案说明/来源注记等说教内容统一移至「原理说明」Tab，
 * 本 Tab 只保留方案查阅与展示设置操作。
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  FileText, Users, Briefcase, Link2, ChevronDown, ChevronRight,
  Settings, Save, Eye, EyeOff, GripVertical, Check, X,
  BookOpen, Folders, GitBranch, FileSpreadsheet, Archive, Package, Star, ArrowUp,
  Search, LayoutGrid,
} from 'lucide-react';
import { useMetadataDisplayStore } from '../../../stores/metadataDisplayStore';
import type { ContextFieldConfig } from '../../../stores/metadataDisplayStore';
import {
  ENTITY_CONTEXTS,
  getAllFieldDefs,
  getDefaultVisibleIds,
  getAllFieldIds,
} from '../../../config/metadataContexts';
import type { EntityContextId } from '../../../config/metadataContexts';
import SourceDocMetadataPanel from '../SourceDocMetadataPanel';
import {
  type MetadataItem, type MetadataMode, MODE_OPTIONS,
  fileEntityRaw, agentEntityRaw, businessEntityRaw, relationRaw,
  volumeEntityRaw, volumeAssociationRaw,
  boxIdentificationRaw, boxClassificationRaw, boxContentRangeRaw,
  boxPhysicalLocationRaw, boxProcessManagementRaw, boxDualSystemRaw,
  computeStats, getAllMetadata,
} from '../metadataCatalog';
// ============================================================
// 页面设置抽屉（卡片预览式布局）
// ============================================================

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  contextId: EntityContextId;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ open, onClose, contextId }) => {
  const { toggleVisibility, setVisibility, moveField, setAllVisible, toggleAdopted, toggleRecommended, applyPreset, getFields, getVisibleIds } = useMetadataDisplayStore();
  const allMetadata = useMemo(() => getAllMetadata(), []);

  const fields = useMemo(() => getFields(contextId), [getFields, contextId]);

  // 可见字段（按排序，仅 adopted）
  const visibleFields = useMemo(
    () => fields.filter((f) => f.adopted && f.visible).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );
  // 隐藏字段（adopted 但不 visible）
  const hiddenFields = useMemo(
    () => fields.filter((f) => f.adopted && !f.visible).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );
  // 未采用字段
  const notAdoptedFields = useMemo(
    () => fields.filter((f) => !f.adopted).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );

  const visibleCount = visibleFields.length;
  const totalCount = fields.length;
  const recommendedIds = useMemo(() => fields.filter(f => f.recommended).map(f => f.id), [fields]);

  // ── 拖拽排序（仅可见字段之间） ──
  const dragIdRef = useRef<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const dragId = e.dataTransfer.getData('text/plain');
    if (dragId && dragId !== targetId) {
      moveField(contextId, dragId, targetId);
    }
    dragIdRef.current = null;
  };

  // 模拟数值
  const mockValue = (id: string): string => {
    const commonMap: Record<string, string> = {
      M1: '件', M3: '北京市档案馆', M4: '110001', M5: 'XX集团有限公司',
      M6: 'Z001', M7: 'XX公司财务部', M8: 'KU-01', M9: '0023', M10: '—',
      M11: '0045', M12: '—', M13: 'Z001-KU·01·2026-D30-0005-0020',
      M14: '2026年05月记账凭证', M15: '2026-05-10', M16: '记-004',
      M17: '张三', M18: '采购发票-增值税专用.pdf', M19: '内部',
      M20: '30年', M21: '5月份采购办公用品', M22: '电子文件',
      M23: '202605_记账凭证.pdf', M24: '2.3 MB', M25: 'PDF',
      M26: '2026-05-10 14:30:00', M27: 'A3F2B8C1...', M28: '—',
      M29: '2026', M30: '会计凭证', M31: '记-004',
      M32: '2026-05-01', M33: '2026-05-31', M34: 'CNY',
      M35: '23,500.00', M36: '3', M37: '/archives/2026/...',
      M38: '—', M39: '—',
      M40: '责任者', M41: '张三', M42: 'EMP-001',
      M43: '归档', M44: '2026年5月凭证归档', M45: '5月份凭证整理归档',
      M46: '2026-05-31 17:00:00', M47: '文件-机构人员',
      M48: 'Z001-KU·01·2026-D30-0005-0020', M49: '张三',
      // 卷级元数据模拟值
      V1: 'Z001', V2: 'KU', V3: '2026', V4: 'PZ',
      V5: '0005', V6: 'Z001-KU·PZ·2026-D30-0005',
      V7: '2026年6月银行付款凭证（第1‒50号）', V8: '2026-06-01~2026-06-30',
      V9: '30年', V10: '50', V11: '102',
      V12: 'XX集团有限公司', V13: '李四', V14: '2026-07-05',
      V15: '王五', V16: '2026-07-08', V17: 'A区-03架-05层',
      V18: '已扫描', V19: 'E5B2A3C1...', V20: '—',
      // 卷件关联模拟值
      VA1: '纸质数字化', VA2: 'Z001-KU·PZ·2026-D30-0005',
      VA3: 'Z001-KU·PZ·2026-D30-0005-0020', VA4: '0020',
      VA5: '81', VA6: '83',
      // 盒级元数据模拟值（B1-B29）
      B1: 'BOX-2026-KP-001', B2: 'Z001', B3: 'KU',
      B4: '2026', B5: '记账凭证', B6: '30年', B7: '财务部',
      B8: '0001-0050', B9: '—', B10: '5', B11: '250',
      B12: '2026-06-01~2026-06-30', B13: '06', B14: '3', B15: '1',
      B16: 'A区', B17: '03架', B18: '05层', B19: '12位',
      B20: '李四', B21: '2026-07-05', B22: '张三', B23: '王五',
      B24: '已封盒', B25: 'YJ-2026-001', B26: '盒内第25号凭证存在补制件，见备考表',
      B27: 'ELEC-BATCH-2026-001', B28: 'DVD-2026-0032', B29: '一致',
    };
    return commonMap[id] || '—';
  };

  // 获取字段中文名
  const fieldName = (id: string): string => {
    return allMetadata.find((m) => m.id === id)?.name || id;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-[640px] max-w-[95vw] bg-white h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-bold text-slate-800">详情页布局设置</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 统计 + 快捷操作 */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">
              展示 <strong className="text-sky-600">{visibleCount}</strong> / {totalCount} 个字段
              <span className="ml-2 text-xs text-slate-400">
                | 未采用: {notAdoptedFields.length}
              </span>
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button type="button"
                onClick={() => applyPreset(contextId, recommendedIds)}
                className="px-2 py-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors"
                title="仅显示推荐常用字段">
                <Star className="w-3 h-3 inline mr-0.5" />推荐常用
              </button>
              <button type="button" onClick={() => setAllVisible(contextId, true)}
                className="px-2 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-md hover:bg-sky-100 transition-colors">
                全部显示
              </button>
              <button type="button" onClick={() => setAllVisible(contextId, false)}
                className="px-2 py-1 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">
                全部隐藏
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            拖拽手柄调整顺序，<Check className="w-3 h-3 inline mx-0.5" />采用 / <Eye className="w-3 h-3 inline mx-0.5" />展示 / <Star className="w-3 h-3 inline mx-0.5" />推荐常用 三层配置
          </p>
        </div>

        {/* 预览区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ── 可见字段预览卡片 ── */}
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700">
                <Package className="w-4 h-4 inline mr-1" />会计档案详情卡片（预览）—— 件级+卷级+盒级元数据
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">拖拽字段调整顺序，勾选控制可见性 — 字段从左到右排列，自动换行</p>
            </div>

            {visibleFields.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                <ArrowUp className="w-4 h-4 inline mr-1" />暂无可见字段，点击上方「全部显示」或从下方添加
              </div>
            ) : (
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {visibleFields.map((field) => {
                    const meta = allMetadata.find((m) => m.id === field.id);
                    const isMandatory = meta?.mandatory === '必选';
                    const isVolumeField = field.id.startsWith('V') || field.id.startsWith('VA');
                    const isBoxField = field.id.startsWith('B');
                    return (
                      <div
                        key={field.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, field.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, field.id)}
                        className={`group inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg bg-white hover:shadow-sm cursor-default transition-all ${
                          isBoxField
                            ? 'border-teal-200 hover:border-teal-300'
                            : isVolumeField
                            ? 'border-amber-200 hover:border-amber-300'
                            : 'border-slate-200 hover:border-sky-300'
                        }`}
                      >
                        {/* 拖拽手柄 */}
                        <span className="cursor-grab active:cursor-grabbing text-slate-200 group-hover:text-slate-400 transition-colors">
                          <GripVertical className="w-3 h-3" />
                        </span>

                        {/* 👁 展示开关 */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleVisibility(contextId, field.id); }}
                          className={`p-0.5 rounded transition-colors ${field.visible ? 'text-sky-500 hover:bg-sky-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                          title={field.visible ? '已展示（点击隐藏）' : '未展示（点击显示）'}
                        >
                          {field.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </button>

                        {/* 推荐常用开关 */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleRecommended(contextId, field.id); }}
                          className={`p-0.5 rounded transition-colors ${field.recommended ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                          title={field.recommended ? '推荐常用（点击取消）' : '非推荐（点击设为推荐）'}
                        >
                          <svg className="w-3 h-3" viewBox="0 0 20 20" fill={field.recommended ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                            <polygon points="10,1 13,7 19,8 14,13 15,19 10,16 5,19 6,13 1,8 7,7" />
                          </svg>
                        </button>

                        {/* 编号 */}
                        <span className={`text-[10px] font-mono font-bold shrink-0 ${
                          isBoxField ? 'text-teal-600' : isVolumeField ? 'text-amber-600' : 'text-sky-600'
                        }`}>{field.id}</span>

                        {/* 名称 */}
                        <span className="text-xs text-slate-700 font-medium whitespace-nowrap">{fieldName(field.id)}</span>

                        {/* 冒号 */}
                        <span className="text-xs text-slate-300">:</span>

                        {/* 模拟值 */}
                        <span className="text-xs text-slate-500 font-mono truncate max-w-[120px]">
                          {mockValue(field.id)}
                        </span>

                        {/* 必选标记 */}
                        {isMandatory && <span className="text-[9px] text-red-400 shrink-0">*</span>}

                        {/* 实体类型标记（卷级/盒级特殊标记） */}
                        {isBoxField && (
                          <span className="text-[8px] text-teal-500 bg-teal-50 px-1 rounded shrink-0">盒</span>
                        )}
                        {isVolumeField && (
                          <span className="text-[8px] text-amber-500 bg-amber-50 px-1 rounded shrink-0">卷</span>
                        )}

                        {/* ✓ 采用开关 */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleAdopted(contextId, field.id); }}
                          className="p-0.5 text-slate-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                          title="取消采用此字段"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── 隐藏字段区（已采用但未展示） ── */}
          {hiddenFields.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">已采用 · 可添加字段</span>
                <span className="text-xs text-slate-400">（{hiddenFields.length} 个）</span>
              </div>
              <div className="border border-dashed border-slate-300 rounded-xl bg-slate-50/50 p-2 space-y-0.5">
                {hiddenFields.map((field) => {
                  const isVolumeField = field.id.startsWith('V') || field.id.startsWith('VA');
                  const isBoxField = field.id.startsWith('B');
                  return (
                    <div
                      key={field.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer group ${
                        isBoxField ? 'hover:border-teal-200' : isVolumeField ? 'hover:border-amber-200' : ''
                      }`}
                      onClick={() => toggleVisibility(contextId, field.id)}
                    >
                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-md hover:bg-sky-100 transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        显示
                      </button>
                      <span className={`text-xs font-mono font-bold ${
                        isBoxField ? 'text-teal-400' : isVolumeField ? 'text-amber-400' : 'text-slate-300'
                      }`}>{field.id}</span>
                      <span className="text-xs text-slate-500">{fieldName(field.id)}</span>
                      <span className="text-[10px] text-slate-300 font-mono truncate">
                        {allMetadata.find((m) => m.id === field.id)?.englishName || ''}
                      </span>
                      {isBoxField && (
                        <span className="text-[9px] text-teal-400 bg-teal-50 px-1 rounded">盒级</span>
                      )}
                      {isVolumeField && (
                        <span className="text-[9px] text-amber-400 bg-amber-50 px-1 rounded">卷级</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 未采用字段区 ── */}
          {notAdoptedFields.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">未采用字段</span>
                <span className="text-xs text-slate-400">（{notAdoptedFields.length} 个）</span>
              </div>
              <div className="border border-dashed border-red-200 rounded-xl bg-red-50/30 p-2 space-y-0.5">
                {notAdoptedFields.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer group"
                    onClick={() => toggleAdopted(contextId, field.id)}
                  >
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      采用
                    </button>
                    <span className="text-xs font-mono font-bold text-slate-400">{field.id}</span>
                    <span className="text-xs text-slate-500">{fieldName(field.id)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white shrink-0">
          <button type="button" onClick={onClose}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors">
            <Check className="w-4 h-4" />
            确认布局（{visibleCount} 个字段可见）
          </button>
        </div>
      </div>
    </div>
  );
};

// ========== UI 组件 ==========
interface SectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  metadata: MetadataItem[];
  isExpanded: boolean;
  onToggle: () => void;
  /** 卷级标记（用于视觉区分，琥珀色） */
  isVolumeSection?: boolean;
  /** 盒级标记（用于视觉区分，青色） */
  isBoxSection?: boolean;
}

const MetadataSection: React.FC<SectionProps> = ({ title, description, icon, metadata, isExpanded, onToggle, isVolumeSection, isBoxSection }) => {
  const borderColor = isBoxSection ? 'border-teal-200' : isVolumeSection ? 'border-amber-200' : 'border-slate-200';
  const hoverBg = isBoxSection ? 'hover:bg-teal-50/50' : isVolumeSection ? 'hover:bg-amber-50/50' : 'hover:bg-slate-50';
  const iconBg = isBoxSection ? 'bg-teal-100' : isVolumeSection ? 'bg-amber-100' : 'bg-slate-100';
  const titleColor = isBoxSection ? 'text-teal-800' : isVolumeSection ? 'text-amber-800' : 'text-slate-800';
  const rowHoverBg = isBoxSection ? 'hover:bg-teal-50/30' : isVolumeSection ? 'hover:bg-amber-50/30' : 'hover:bg-sky-50/30';
  const idColor = isBoxSection ? 'text-teal-600' : isVolumeSection ? 'text-amber-600' : 'text-sky-600';
  const subIdColor = isBoxSection ? 'text-teal-500' : isVolumeSection ? 'text-amber-500' : 'text-sky-500';
  return (
    <div className={`border rounded-xl overflow-hidden bg-white ${borderColor}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-5 py-4 transition-colors cursor-pointer text-left ${hoverBg}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>
            {icon}
          </div>
          <div>
            <h3 className={`text-sm font-bold ${titleColor}`}>{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{description}（{metadata.length} 项）</p>
          </div>
        </div>
        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {isExpanded && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-12">编号</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-24">中文名称</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-28">英文名称</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold min-w-48">定义</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-16">必选性</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-16">可重复性</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-12">数据类型</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">值域</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-40">捕获节点</th>
              </tr>
            </thead>
            <tbody>
              {metadata.map((item, idx) => (
                <React.Fragment key={item.id}>
                  <tr className={`border-b border-slate-200/60 divide-x divide-slate-100 ${rowHoverBg} transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className={`px-4 py-3 font-mono text-[13px] font-bold ${idColor}`}>{item.id}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-800">{item.name}</td>
                    <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{item.englishName}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-600 leading-relaxed">{item.definition}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        item.mandatory === '必选' ? 'bg-red-50 text-red-600 border border-red-200' :
                        item.mandatory === '条件可选' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                        'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>{item.mandatory}</span>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-600">{item.repeatable}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-600">{item.dataType}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-600">{item.valueRange || '—'}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-600">{item.captureNode}</td>
                  </tr>
                  {item.subItems?.map((sub) => (
                    <tr key={sub.id} className={`border-b border-slate-200/60 divide-x divide-slate-100 bg-slate-50/20 ${rowHoverBg} transition-colors`}>
                      <td className={`px-4 py-3 pl-8 font-mono text-[13px] font-bold ${subIdColor}`}>{sub.id}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-600">├ {sub.name}</td>
                      <td className="px-4 py-3 font-mono text-[13px] text-slate-400">{sub.englishName}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-500 leading-relaxed">{sub.definition}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          sub.mandatory === '必选' ? 'bg-red-50 text-red-600 border border-red-200' :
                          'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>{sub.mandatory}</span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-400">{sub.repeatable}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-400">{sub.dataType}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-400">{sub.valueRange || '—'}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-400">{sub.captureNode}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============================================================
// 分组定义（左侧导航 ↔ 右侧内容）
// ============================================================

interface MetaGroup {
  key: string;
  title: string;
  desc: string;
  tone: 'item' | 'volume' | 'box';
  Icon: React.ElementType;
  items: MetadataItem[];
}

const GROUPS: MetaGroup[] = [
  { key: 'volumeEntity', title: '卷级元数据', desc: 'DA/T 39 会计档案案卷格式 — 描述案卷整卷实体的结构化元数据', tone: 'volume', Icon: BookOpen, items: volumeEntityRaw },
  { key: 'volumeAssociation', title: '卷件关联实体元数据', desc: '件级电子文件与卷级实体案卷的双向关联关系（纸质数字化副本 ↔ 原纸质案卷）', tone: 'volume', Icon: GitBranch, items: volumeAssociationRaw },
  { key: 'fileEntity', title: '文件实体元数据', desc: '表A.1 — 描述电子会计档案文件自身的内容、结构和形式特征', tone: 'item', Icon: FileText, items: fileEntityRaw },
  { key: 'agentEntity', title: '机构人员实体元数据', desc: '表A.2 — 描述与电子会计档案相关的机构或人员信息', tone: 'item', Icon: Users, items: agentEntityRaw },
  { key: 'businessEntity', title: '业务实体元数据', desc: '表A.3 — 描述对电子会计档案所执行的各项管理业务', tone: 'item', Icon: Briefcase, items: businessEntityRaw },
  { key: 'relation', title: '实体关系元数据', desc: '表A.4 — 描述各元数据实体之间的关联关系', tone: 'item', Icon: Link2, items: relationRaw },
  { key: 'boxIdentification', title: '基础标识元数据（盒级）', desc: 'DA/T 39-2008 · DA/T 13-2022 — 全系统统一的容器身份主键，盒号按编码规则自动生成', tone: 'box', Icon: Archive, items: boxIdentificationRaw },
  { key: 'boxClassification', title: '分类合规元数据（盒级）', desc: 'DA/T 42-2022 — 装盒合规性校验核心载体，同一年度+同一类别+同一保管期限方可装盒', tone: 'box', Icon: FileText, items: boxClassificationRaw },
  { key: 'boxContentRange', title: '内容范围元数据（盒级）', desc: 'DA/T 39-2008 — 卷盒封面、脊背法定必录项，可直接映射生成标准化卷盒打印模板', tone: 'box', Icon: BookOpen, items: boxContentRangeRaw },
  { key: 'boxPhysicalLocation', title: '物理位置元数据（盒级）', desc: '库房管理扩展 — 库房号·档案架号·架层号·层内位号，支持智能库房联动与快速盘点定位', tone: 'box', Icon: Folders, items: boxPhysicalLocationRaw },
  { key: 'boxProcessManagement', title: '流程管理元数据（盒级）', desc: '全生命周期流程追溯 — 装盒人/日期自动回填，档案状态关联审批流程', tone: 'box', Icon: Users, items: boxProcessManagementRaw },
  { key: 'boxDualSystem', title: '双套制关联元数据（盒级）', desc: 'DA/T 94-2022 — 纸质+电子双套归档对应关系，批次号+介质标识+校验状态', tone: 'box', Icon: Link2, items: boxDualSystemRaw },
];

const MAND_FILTERS = [
  { id: 'all', label: '全部必选性' },
  { id: '必选', label: '仅看必选' },
  { id: '可选', label: '仅看可选' },
  { id: '条件可选', label: '仅看条件可选' },
];

/** 分组统计（总数/必选） */
const groupStats = (items: MetadataItem[]) => {
  const flat: MetadataItem[] = [];
  items.forEach((i) => { flat.push(i); if (i.subItems) flat.push(...i.subItems); });
  return { total: flat.length, mandatory: flat.filter((m) => m.mandatory === '必选').length };
};

// ========== 主页面（左右主从布局） ==========
const MetadataConfigTab: React.FC = () => {
  const [mode, setMode] = useState<MetadataMode>('accounting-archive');
  const [activeKey, setActiveKey] = useState<string>('volumeEntity');
  const [searchQuery, setSearchQuery] = useState('');
  const [mandFilter, setMandFilter] = useState('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedContext, setSelectedContext] = useState<EntityContextId>('archive-item');
  const { initContext, getFields } = useMetadataDisplayStore();

  const stats = useMemo(() => computeStats(), []);

  // 上下文切换时初始化对应上下文
  useEffect(() => {
    const fieldIds = getAllFieldIds(selectedContext);
    const defaultIds = getDefaultVisibleIds(selectedContext);
    initContext(selectedContext, fieldIds, defaultIds);
  }, [selectedContext, initContext]);

  // 当前上下文的字段配置（页面设置按钮计数用）
  const contextFields = useMemo(() => getFields(selectedContext), [getFields, selectedContext]);
  const visibleCount = contextFields.filter((f) => f.adopted && f.visible).length;
  const totalCount = contextFields.length;

  // ── 全局搜索 + 必选性筛选（跨分组） ──
  const filtering = searchQuery.trim() !== '' || mandFilter !== 'all';
  const searchResults = useMemo(() => {
    if (!filtering) return [];
    const q = searchQuery.trim().toLowerCase();
    return getAllMetadata().filter((m) => {
      if (mandFilter !== 'all' && m.mandatory !== mandFilter) return false;
      if (!q) return true;
      return m.id.toLowerCase().includes(q)
        || m.name.toLowerCase().includes(q)
        || m.englishName.toLowerCase().includes(q)
        || m.definition.toLowerCase().includes(q);
    });
  }, [filtering, searchQuery, mandFilter]);

  const activeGroup = GROUPS.find((g) => g.key === activeKey);

  // ── 左侧导航按钮 ──
  const NavItem: React.FC<{ active: boolean; onClick: () => void; label: string; total: number; mandatory: number; tone: 'item' | 'volume' | 'box' | 'overview' }> = ({
    active, onClick, label, total, mandatory, tone,
  }) => (
    <button
      type="button" onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
        active ? 'bg-sky-50 border border-sky-200' : 'border border-transparent hover:bg-slate-50'
      }`}
    >
      <span className={`flex-1 text-xs font-medium truncate ${active ? 'text-sky-700' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-[10px] shrink-0 px-1.5 py-0.5 rounded-full ${
        tone === 'box' ? 'bg-teal-50 text-teal-600' : tone === 'volume' ? 'bg-amber-50 text-amber-600' : tone === 'item' ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-500'
      }`}>
        {total} 项{mandatory > 0 ? ` · 必选 ${mandatory}` : ''}
      </span>
    </button>
  );

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-full">
        {/* ── 操作行：模式 Tab + 详情页上下文 + 页面设置（说教内容已移「原理说明」Tab） ── */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMode(opt.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${
                  mode === opt.key
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                title={opt.description}
              >
                {opt.key === 'source-doc'
                  ? <FileSpreadsheet className="w-4 h-4" />
                  : <FileText className="w-4 h-4" />
                }
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {mode === 'accounting-archive' && (
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                详情页上下文
                <select
                  value={selectedContext}
                  onChange={(e) => setSelectedContext(e.target.value as EntityContextId)}
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {Object.values(ENTITY_CONTEXTS).map((ctx) => (
                    <option key={ctx.id} value={ctx.id}>{ctx.label}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
            >
              <Settings className="w-4 h-4" />
              页面设置
              <span className="text-xs text-sky-400">（{visibleCount}/{totalCount}）</span>
            </button>
          </div>
        </div>

        {/* ── 原始凭证元数据模式 ── */}
        {mode === 'source-doc' && <SourceDocMetadataPanel />}

        {/* ── 会计档案元数据：左右主从布局 ── */}
        {mode === 'accounting-archive' && (
          <div className="flex gap-4 items-start">
            {/* ══ 左侧导航 ══ */}
            <aside className="w-64 shrink-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-3 border-b border-slate-100 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text" value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索编号/名称/定义…"
                    className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
                  />
                </div>
                <select
                  value={mandFilter}
                  onChange={(e) => setMandFilter(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                >
                  {MAND_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <nav className="max-h-[72vh] overflow-y-auto p-2">
                <NavItem
                  active={!filtering && activeKey === 'overview'}
                  onClick={() => { setActiveKey('overview'); setSearchQuery(''); setMandFilter('all'); }}
                  label="概览总览" total={stats.totalCount} mandatory={stats.mandatoryCount} tone="overview"
                />
                <div className="px-2 pt-3 pb-1 text-[10px] font-bold text-amber-500 uppercase tracking-wider">卷级 · DA/T 39</div>
                {GROUPS.filter((g) => g.tone === 'volume').map((g) => {
                  const s = groupStats(g.items);
                  return (
                    <NavItem key={g.key} active={!filtering && activeKey === g.key}
                      onClick={() => { setActiveKey(g.key); setSearchQuery(''); setMandFilter('all'); }}
                      label={g.title} total={s.total} mandatory={s.mandatory} tone="volume" />
                  );
                })}
                <div className="px-2 pt-3 pb-1 text-[10px] font-bold text-sky-500 uppercase tracking-wider">件级 · DA/T 94 附录A</div>
                {GROUPS.filter((g) => g.tone === 'item').map((g) => {
                  const s = groupStats(g.items);
                  return (
                    <NavItem key={g.key} active={!filtering && activeKey === g.key}
                      onClick={() => { setActiveKey(g.key); setSearchQuery(''); setMandFilter('all'); }}
                      label={g.title} total={s.total} mandatory={s.mandatory} tone="item" />
                  );
                })}
                <div className="px-2 pt-3 pb-1 text-[10px] font-bold text-teal-500 uppercase tracking-wider">盒级 · DA/T 39/42/94</div>
                {GROUPS.filter((g) => g.tone === 'box').map((g) => {
                  const s = groupStats(g.items);
                  return (
                    <NavItem key={g.key} active={!filtering && activeKey === g.key}
                      onClick={() => { setActiveKey(g.key); setSearchQuery(''); setMandFilter('all'); }}
                      label={g.title} total={s.total} mandatory={s.mandatory} tone="box" />
                  );
                })}
              </nav>
            </aside>

            {/* ══ 右侧内容 ══ */}
            <div className="flex-1 min-w-0">
              {/* 搜索/筛选模式：跨分组结果 */}
              {filtering ? (
                <>
                  <div className="mb-2 text-xs text-slate-500">
                    跨分组检索结果 <strong className="text-sky-600">{searchResults.length}</strong> 项
                    {searchQuery.trim() && <>（关键词 “{searchQuery.trim()}”）</>}
                    {mandFilter !== 'all' && <>（{mandFilter}）</>}
                  </div>
                  {searchResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white border border-dashed border-slate-300 rounded-xl">
                      <Search className="w-8 h-8 mb-2 text-slate-300" />
                      <p className="text-sm">未找到匹配的元数据项</p>
                    </div>
                  ) : (
                    <MetadataSection
                      title="检索结果" description="匹配当前关键词/必选性条件的全部元数据项"
                      icon={<Search className="w-4 h-4 text-sky-600" />}
                      metadata={searchResults} isExpanded onToggle={() => {}}
                    />
                  )}
                </>
              ) : activeKey === 'overview' ? (
                /* ── 概览总览 ── */
                <div className="space-y-4">
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <LayoutGrid className="w-4 h-4 text-sky-600" />
                      <h3 className="text-sm font-bold text-slate-800">元数据概览</h3>
                      <span className="text-xs text-slate-400">盒→卷→件→凭证四级穿透 · 点左侧导航查看分组明细</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
                      <div className="bg-slate-50 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-slate-700">{stats.totalCount}</div>
                        <div className="text-xs text-slate-500 mt-0.5">元数据项总数</div>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-red-600">{stats.mandatoryCount}</div>
                        <div className="text-xs text-slate-500 mt-0.5">必选项</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-slate-500">{stats.optionalCount}</div>
                        <div className="text-xs text-slate-500 mt-0.5">可选项</div>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-amber-600">{stats.conditionalCount}</div>
                        <div className="text-xs text-slate-500 mt-0.5">条件可选</div>
                      </div>
                      <div className="bg-sky-50 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-sky-600">{stats.volumeEntityCount + stats.volumeAssociationCount}</div>
                        <div className="text-xs text-slate-500 mt-0.5">卷级项</div>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-emerald-600">{stats.fileEntityCount + stats.agentEntityCount + stats.businessEntityCount + stats.relationCount}</div>
                        <div className="text-xs text-slate-500 mt-0.5">件级项</div>
                      </div>
                      <div className="bg-teal-50 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-teal-600">{stats.boxTotalCount}</div>
                        <div className="text-xs text-slate-500 mt-0.5">盒级项</div>
                      </div>
                    </div>

                    {/* 实体类型分布 */}
                    <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 leading-relaxed">
                      <p className="font-bold text-slate-600 mb-1">实体类型分布：</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-block px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-full">件级文件实体 {stats.fileEntityCount} 项</span>
                        <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">件级机构人员实体 {stats.agentEntityCount} 项</span>
                        <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">件级业务实体 {stats.businessEntityCount} 项</span>
                        <span className="inline-block px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">件级实体关系 {stats.relationCount} 项</span>
                        <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-300 rounded-full font-bold">卷级元数据 {stats.volumeEntityCount} 项</span>
                        <span className="inline-block px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-300 rounded-full font-bold">卷件关联 {stats.volumeAssociationCount} 项</span>
                        <span className="inline-block px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-300 rounded-full font-bold">盒级元数据 {stats.boxTotalCount} 项</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activeGroup ? (
                /* ── 单个分组明细 ── */
                <MetadataSection
                  title={activeGroup.title}
                  description={activeGroup.desc}
                  icon={<activeGroup.Icon className={`w-4 h-4 ${
                    activeGroup.tone === 'box' ? 'text-teal-600' : activeGroup.tone === 'volume' ? 'text-amber-600' : 'text-sky-600'
                  }`} />}
                  metadata={activeGroup.items}
                  isExpanded
                  onToggle={() => {}}
                  isVolumeSection={activeGroup.tone === 'volume'}
                  isBoxSection={activeGroup.tone === 'box'}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* 页面设置抽屉 */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} contextId={selectedContext} />
    </div>
  );
};

export default MetadataConfigTab;
