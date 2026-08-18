/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * VolumeWorkspacePage — 组卷工作台
 *
 * 核心功能：
 *   1. 查看未组卷条目 + 搜索 + 凭证号连续性检测
 *   2. 智能推荐分组
 *   3. 勾选直接组卷（建卷+加入一步）/ 加入已有草稿卷 / 指定位置插入
 *   4. 卷内管理：勾选件上移/下移排序、移出回池（2026-08-17）
 *   5. 卷级操作：拆卷（整卷打散回池）、拆分（勾选件出新卷）、
 *      合并（他卷并入本卷）、转卷（勾选件移入他卷）—— 全部草稿卷限定，
 *      合并/转卷强制同类别/年度/期限（2026-08-17 对齐组卷业务概念）
 *   6. 确认组卷（四性检测 + 赋卷号）/ 撤销确认 / 移交归盒
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Layers, FolderTree, Plus, Check, X, ChevronDown, ChevronRight,
  Search, Lightbulb, FileText, Printer, Archive, AlertCircle,
  Loader2, CheckCircle2, Trash2, Upload, Shield, Send, Clock,
  RefreshCw, Trash, Link2, Eye, AlertTriangle, Paperclip,
  ArrowUp, ArrowDown, FolderOutput, Split, Merge, Ungroup, ListChecks,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useArchiveStore } from '../../stores/archiveStore';
import { useSourceDocumentStore } from '../../stores/sourceDocumentStore';
import { useVolumeStore, validateVoucherContinuity, inferTypeCode, inferRetentionCode, toCategoryCode } from '../../stores/volumeStore';
import { useMetadataDisplayStore } from '../../stores/metadataDisplayStore';
import { getVoucherColumns, getVoucherDefaultColumns } from '../../config/metadataColumnMaps/voucherColumns';
import {
  getAllFieldIds,
  getDefaultVisibleIds,
} from '../../config/metadataContexts';
import RecordDetailPanel from '../../components/RecordDetailPanel';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import PaginationBar from '../../components/PaginationBar';
import { usePagination } from '../../hooks/usePagination';
import type { Volume, VolumeItem } from '../../types/volume';
import type { ArchiveRecord } from '../../types';
import VoucherUploadModal from './VoucherUploadModal';
import VolumePrintModal from './VolumePrintModal';
import { deleteRecord } from '../../services/recordService';
import { openPushService } from '../../services/openPushService';
import { runVolumeInspection, type InspectionIssue } from '../../services/inspectionService';

// ── 类型辅助 ──
const ARCHIVE_TYPES = ['全部', '记账凭证', '会计账簿', '财务报告', '其他会计资料'] as const;

/** 大类代码 → 中文名（案卷卡片展示用） */
const ARCHIVE_TYPE_CATEGORY_NAMES: Record<string, string> = {
  KP: '会计凭证',
  KB: '会计账簿',
  FB: '财务报表',
  QT: '其他会计资料',
};
const RETENTION_TYPES = ['全部', '30年', '永久', '10年'] as const;

/** 空选择集（避免每渲染新建 Set 的引用抖动） */
const EMPTY_SEL: Set<string> = new Set();

// ── 工具函数 ──
const formatAmount = (n: number) =>
  `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

const formatDate = (y: string, m: string) =>
  `${y}-${String(m).padStart(2, '0')}`;

// ── 子组件：筛选栏 ──
interface FilterBarProps {
  year: number | null;
  month: string | null;
  archiveType: string | null;
  retention: string | null;
  unassignedCount: number;
  volumeCount: number;
  onChange: (f: { year?: number | null; month?: string | null; archiveType?: string | null; retention?: string | null }) => void;
  onRecommend: () => void;
  onUploadMaterial: () => void;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

const FilterBar: React.FC<FilterBarProps> = ({
  year, month, archiveType, retention,
  unassignedCount, volumeCount,
  onChange, onRecommend, onUploadMaterial,
}) => {
  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-white border-b border-slate-200 flex-wrap">
      {/* 筛选 */}
      <select
        className="px-3 py-1.5 text-sm border border-slate-400 rounded-lg bg-white"
        value={year ?? ''}
        onChange={(e) => onChange({ year: e.target.value ? parseInt(e.target.value) : null })}
      >
        <option value="">全部年度</option>
        <option value="2026">2026年</option>
        <option value="2025">2025年</option>
        <option value="2024">2024年</option>
      </select>

      {/* ★ 月份筛选（会计实操核心：按月份组卷） */}
      <select
        className="px-3 py-1.5 text-sm border border-slate-400 rounded-lg bg-white"
        value={month ?? ''}
        onChange={(e) => onChange({ month: e.target.value || null })}
      >
        <option value="">全部月份</option>
        {MONTHS.map((m) => (
          <option key={m} value={m}>{m}月</option>
        ))}
      </select>

      <select
        className="px-3 py-1.5 text-sm border border-slate-400 rounded-lg bg-white"
        value={archiveType ?? '全部'}
        onChange={(e) => onChange({ archiveType: e.target.value === '全部' ? null : e.target.value })}
      >
        {ARCHIVE_TYPES.map((t) => (
          <option key={t} value={t}>{t === '全部' ? '全部类别' : t}</option>
        ))}
      </select>

      <select
        className="px-3 py-1.5 text-sm border border-slate-400 rounded-lg bg-white"
        value={retention ?? '全部'}
        onChange={(e) => onChange({ retention: e.target.value === '全部' ? null : e.target.value })}
      >
        {RETENTION_TYPES.map((t) => (
          <option key={t} value={t}>{t === '全部' ? '全部期限' : t}</option>
        ))}
      </select>

      <span className="text-sm text-slate-500 ml-2">
        未组卷 <strong className="text-sky-600">{unassignedCount}</strong> 条
        &nbsp;|&nbsp; 案卷 <strong className="text-sky-600">{volumeCount}</strong> 卷
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onRecommend}
        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
      >
        <Lightbulb className="w-4 h-4" />
        智能组卷
      </button>

      <button
        type="button"
        onClick={onUploadMaterial}
        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
      >
        <Upload className="w-4 h-4" />
        资料上传
      </button>
    </div>
  );
};

// ── 子组件：未分配条目池（左面板） ──
interface UnassignedPoolProps {
  records: ArchiveRecord[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onAddToVolume: (volumeId: string) => void;
  onDeleteRecord: (id: string) => void;
  onBatchDelete: (ids: string[]) => void;
  volumes: Volume[];
  /** 一键创建案卷并加入选中凭证 */
  onCreateAndAdd: () => void;
  /** 每张凭证的附件数（凭证ID → 附件数） */
  attachmentCountMap: Map<string, number>;
  /** 查看凭证详情 */
  onViewDetail: (record: any) => void;
  /** 表格列定义（从凭证上下文配置读取） */
  tableColumns: DataTableColumn<ArchiveRecord>[];
}

const UnassignedPool: React.FC<UnassignedPoolProps> = ({
  records, selectedIds, onToggleSelect, onSelectAll,
  searchQuery, onSearchChange, onAddToVolume, onDeleteRecord, onBatchDelete, volumes,
  onCreateAndAdd,
  attachmentCountMap, onViewDetail, tableColumns,
}) => {
  const allIds = records.map((r) => r.id);
  const allSelected = records.length > 0 && selectedIds.size === records.length;
  const draftVolumes = volumes.filter((v) => v.status === 'draft');
  const [showVolumeMenu, setShowVolumeMenu] = useState(false);

  // 案卷状态标签
  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: '草稿', confirmed: '已确认', numbered: '已确认', completed: '已确认', transferred: '已移交', destroyed: '已销毁' };
    return map[s] || s;
  };
  const canAddTo = (v: Volume) => v.status === 'draft';

  // 点击外部关闭下拉
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowVolumeMenu(false);
    };
    if (showVolumeMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVolumeMenu]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 搜索 + 操作栏 */}
      <div className="p-3 border-b border-slate-200 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索凭证号/金额..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-400 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onSelectAll(allSelected ? [] : allIds)}
              className="rounded border-slate-400"
            />
            全选 ({records.length} 条)
          </label>

          {/* ★ 操作区——勾选后直接组卷（会计实操：不会先建空卷再添凭证） */}
          <div className="flex items-center gap-2" ref={menuRef}>
              {selectedIds.size > 0 ? (
                <>
                  {/* 主操作：直接组卷 → 一键创建案卷并加入选中凭证 */}
                  <button
                    type="button"
                    onClick={onCreateAndAdd}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 shadow-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    组卷 ({selectedIds.size} 件)
                  </button>
                  {/* 次操作：加入已有草稿案卷（仅当存在草稿时显示） */}
                  {draftVolumes.length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowVolumeMenu(!showVolumeMenu)}
                        className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-400 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        加入已有
                        <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-50" />
                      </button>
                  {showVolumeMenu && (
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-20 max-h-80 overflow-y-auto">
                      <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-100 font-medium">
                        选择已有案卷
                      </div>
                      {draftVolumes.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => { onAddToVolume(v.id); setShowVolumeMenu(false); }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 transition-colors flex items-center gap-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="font-medium text-slate-700 flex-1 truncate">{v.title || v.volumeCode || '未命名案卷'}</span>
                          <span className="text-[10px] text-slate-400">草稿</span>
                        </button>
                      ))}
                      {volumes.filter(v => v.status !== 'draft').length > 0 && (
                        <div className="py-1 border-t border-slate-100">
                          <div className="px-3 py-1 text-[10px] text-slate-400 uppercase tracking-wider">已确认 · 不可加入</div>
                          {volumes.filter(v => v.status !== 'draft').map((v) => (
                            <div
                              key={v.id}
                              className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 opacity-50 cursor-not-allowed"
                              title="案卷已赋号/已确认，档号不可变更"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                              <span className="text-slate-500 flex-1 truncate">{v.volumeCode || v.title || '未命名案卷'}</span>
                              <span className="text-[10px] text-slate-400">{statusLabel(v.status)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
                </>
            ) : (
              <span className="text-xs text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
                勾选左侧凭证后可组卷
              </span>
            )}
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => onBatchDelete(Array.from(selectedIds))}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                删除 ({selectedIds.size})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 凭证列表 — DataTable（TanStack 排序 + shadcn 样式） */}
      <div className="flex-1 overflow-auto min-h-0">
        <DataTable
          data={records}
          columns={tableColumns}
          selectedIds={selectedIds}
          onSelectionChange={(ids) => {
            // DataTable 已生成新 Set，直接触发对应的 toggle
            const added = [...ids].find(id => !selectedIds.has(id));
            if (added) { onToggleSelect(added); return; }
            const removed = [...selectedIds].find(id => !ids.has(id));
            if (removed) onToggleSelect(removed);
          }}
          onToggleAll={() => onSelectAll(allSelected ? [] : allIds)}
          onRowClick={(r) => onToggleSelect(r.id)}
          renderActions={(r) => (
            <span className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onViewDetail(r); }}
                className="p-1 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-md transition-colors"
                title="查看凭证详情"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDeleteRecord(r.id); }}
                className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                title="删除此记录"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
          actionsWidth={64}
          emptyLabel="暂无未组卷条目"
          selectedClassName="bg-sky-100 hover:bg-sky-200/70"
        />
      </div>
    </div>
  );
};

// ── 四性检测结果类型 ──
type CheckStatus = 'pending' | 'running' | 'passed' | 'failed';
interface VolumeChecks {
  real: CheckStatus;
  complete: CheckStatus;
  usable: CheckStatus;
  safe: CheckStatus;
}

// ── 子组件：案卷卡片（右面板） ──
interface VolumeCardProps {
  volume: Volume;
  items: VolumeItem[];
  recordMap: Map<string, { voucherNo: string; archiveType: string; amount: number; year: string; month: string }>;
  isActive: boolean;
  onSelect: () => void;
  onRemoveItem: (recordId: string) => void;
  onConfirm: (volumeId: string) => void;
  onDelete: (volumeId: string) => void;
  onRunChecks: (volumeId: string) => void;
  onTransfer: (volumeId: string) => void;
  onPrint: (volumeId: string) => void;
  onUpdateTitle: (volumeId: string, title: string) => void;
  onDecompose: (volumeId: string) => void;
  onUnconfirm: (volumeId: string) => void;
  onInsertAtPosition: (position: number) => void;
  checks: VolumeChecks;
  /** 四性检测问题明细（最近一次 run-volume 的未通过项） */
  issues: InspectionIssue[];
  /** 左侧选中件数，用于显示"加入当前案卷"按钮 */
  selectedCount: number;
  /** 将左侧选中件加入指定案卷 */
  onAddSelectedToVolume: (volumeId: string) => void;
  /** 每张凭证的附件数 */
  attachmentCountMap: Map<string, number>;
  /** 查看凭证详情 */
  onViewDetail: (recordId: string) => void;
  /** ── 卷内件勾选（2026-08-17 拆分/合并/转卷/重排） ── */
  /** 本卡被选中的 recordId 集（选择域在其他卷时为空集） */
  itemSelIds: Set<string>;
  onToggleItemSelect: (recordId: string) => void;
  /** 打开「合并案卷」弹窗（本卷为目标） */
  onMerge: () => void;
}

const CHECK_LABELS: Record<string, string> = {
  real: '真实性',
  complete: '完整性',
  usable: '可用性',
  safe: '安全性',
};

const VolumeCard: React.FC<VolumeCardProps> = ({
  volume, items, recordMap, isActive,
  onSelect, onRemoveItem, onConfirm, onDelete, onRunChecks, onTransfer, onPrint,
  onUpdateTitle, onDecompose, onUnconfirm, onInsertAtPosition, checks, issues, selectedCount, onAddSelectedToVolume, attachmentCountMap, onViewDetail,
  itemSelIds, onToggleItemSelect, onMerge,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(volume.title);
  const statusColors: Record<string, string> = {
    draft: 'text-amber-600 bg-amber-50 border-amber-200',
    confirmed: 'text-sky-600 bg-sky-100 border-sky-200',
    numbered: 'text-sky-600 bg-sky-100 border-sky-200',
    completed: 'text-sky-600 bg-sky-100 border-sky-200',
    transferred: 'text-sky-600 bg-sky-50 border-sky-200',
    destroyed: 'text-slate-400 bg-slate-50 border-slate-200',
  };
  const statusLabels: Record<string, string> = {
    draft: '草稿',
    confirmed: '已确认',
    numbered: '已确认',
    completed: '已确认',
    transferred: '已移交',
    destroyed: '已销毁',
  };

  const allChecksPassed = checks.real === 'passed' && checks.complete === 'passed' && checks.usable === 'passed' && checks.safe === 'passed';
  const checksRunning = checks.real === 'running' || checks.complete === 'running' || checks.usable === 'running' || checks.safe === 'running';

  const handleConfirm = () => {
    setConfirming(true);
    try {
      onConfirm(volume.id);
    } finally {
      setConfirming(false);
    }
  };

  const handleTransfer = () => {
    setTransferring(true);
    try {
      onTransfer(volume.id);
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div
      className={`border rounded-xl transition-all ${
        isActive ? 'border-sky-300 ring-2 ring-sky-100' : 'border-slate-200'
      } ${volume.status === 'draft' ? 'bg-white' : 'bg-slate-50'}`}
    >
      {/* 标题栏 — 紧凑型：展开按钮 + 标题 + 状态 + 件数，消除大段留白 */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => { onSelect(); setExpanded(!expanded); }}
      >
        <button type="button" className="p-0.5 text-slate-400 shrink-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <FolderTree className="w-4 h-4 text-slate-500 shrink-0" />

        {/* 案卷名称（适度弹性，不再占满全行） */}
        <span className="min-w-0 font-semibold text-slate-800 text-sm truncate max-w-[200px]">
          {editingTitle ? (
            <input
              type="text" value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={() => { setEditingTitle(false); if (draftTitle.trim() && draftTitle !== volume.title) onUpdateTitle(volume.id, draftTitle.trim()); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setEditingTitle(false); if (draftTitle.trim() && draftTitle !== volume.title) onUpdateTitle(volume.id, draftTitle.trim()); } if (e.key === 'Escape') { setDraftTitle(volume.title); setEditingTitle(false); } }}
              onClick={(e) => e.stopPropagation()}
              className="w-full border border-sky-300 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              autoFocus
            />
          ) : (
            <span onClick={(e) => { e.stopPropagation(); setDraftTitle(volume.title); setEditingTitle(true); }}
              className="cursor-text hover:text-sky-600 transition-colors" title="点击编辑案卷名称">
              {volume.volumeCode || volume.title || '未命名案卷'}
            </span>
          )}
        </span>

        {/* 状态标签 — 紧跟标题 */}
        <span className={`px-1.5 py-0.5 text-[11px] font-medium rounded-full border shrink-0 ${statusColors[volume.status] || ''}`}>
          {statusLabels[volume.status] || volume.status}
        </span>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-3 pb-2.5 space-y-2">
          {/* 元数据 — 空案卷不显示件数 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            {/* ★ 类别/期限显示中文名（archiveTypeCode 是档号用数字代码，直接显示不友好） */}
            <span>类别: {volume.archiveType || ARCHIVE_TYPE_CATEGORY_NAMES[toCategoryCode(volume.archiveTypeCode, volume.archiveType)] || '—'}</span>
            <span>期限: {volume.retention || volume.retentionCode || '—'}</span>
            <span>件数: {items.length}</span>
            <span>日期: {volume.dateFrom || '?'} ~ {volume.dateTo || '?'}</span>
            {(() => {
              const totalAtt = items.reduce((sum, item) => sum + (attachmentCountMap.get(item.recordId) || 0), 0);
              return totalAtt > 0 ? <span className="text-amber-600">附件: {totalAtt}份</span> : null;
            })()}
          </div>

          {/* ★ 从左侧选中 → 加入当前案卷 */}
          {volume.status === 'draft' && selectedCount > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddSelectedToVolume(volume.id); }}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 shadow-sm transition-all animate-pulse"
            >
              <Plus className="w-3.5 h-3.5" />
              加入当前案卷 ({selectedCount} 件)
            </button>
          )}

          {/* 卷内条目 */}
          <div className="space-y-0.5 max-h-48 overflow-y-auto bg-slate-50 rounded-lg p-1">
            {items.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                暂无条目，从左侧选择记录加入
              </div>
            ) : (
              items.map((item) => {
                const rec = recordMap.get(item.recordId);
                const checked = itemSelIds.has(item.recordId);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm group/item ${
                      checked ? 'bg-sky-100/70 hover:bg-sky-100' : 'hover:bg-white'
                    }`}
                  >
                    {/* ★ 勾选（草稿卷）：拆分/转卷/排序/移出的选择入口 */}
                    {volume.status === 'draft' && (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleItemSelect(item.recordId)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-slate-300 shrink-0 cursor-pointer"
                        title="勾选后可拆分/转卷/排序/移出"
                      />
                    )}
                    {/* ★ 插入按钮（悬浮显示）—— 在此位置之前插入 */}
                    {volume.status === 'draft' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onInsertAtPosition(item.itemNo); }}
                        className="p-0.5 text-slate-300 opacity-0 group-hover/item:opacity-100 hover:text-sky-500 hover:bg-sky-50 rounded transition-all shrink-0"
                        title={`在 #${item.itemNo} 之前插入`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                    <span className="text-xs text-slate-400 w-6 shrink-0">#{item.itemNo}</span>
                    <span className="flex-1 font-medium text-slate-700 truncate">
                      {rec?.voucherNo || item.recordArchiveCode || item.recordId}
                    </span>
                    {/* 该凭证的附件数 */}
                    {(attachmentCountMap.get(item.recordId) || 0) > 0 && (
                      <span className="text-[10px] text-amber-500 bg-amber-50 px-1 rounded shrink-0">
                        <Paperclip className="w-3 h-3 inline" />{attachmentCountMap.get(item.recordId)}
                      </span>
                    )}
                    {rec && (
                      <span className="text-xs text-slate-400">{formatAmount(rec.amount)}</span>
                    )}
                    {/* 查看详情 */}
                    <button
                      type="button"
                      onClick={() => onViewDetail(item.recordId)}
                      className="p-0.5 text-slate-300 hover:text-sky-500"
                      title="查看凭证详情"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    {volume.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.recordId)}
                        className="p-0.5 text-slate-300 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
            {/* ★ 末尾插入按钮 */}
            {volume.status === 'draft' && items.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onInsertAtPosition(items.length + 1); }}
                className="flex items-center gap-1 w-full px-3 py-1 text-xs text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-md transition-colors"
                title="在末尾插入"
              >
                <Plus className="w-3 h-3" />
                末尾插入
              </button>
            )}
          </div>

          {/* 四性检测状态 */}
          {volume.status === 'draft' && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-4 gap-1.5">
                {(['real', 'complete', 'usable', 'safe'] as const).map((key) => {
                  const status = checks[key];
                  const colors: Record<string, string> = {
                    pending: 'bg-slate-100 text-slate-500',
                    running: 'bg-sky-100 text-sky-600 animate-pulse',
                    passed: 'bg-green-100 text-green-700',
                    failed: 'bg-red-100 text-red-700',
                  };
                  const icons: Record<string, React.ReactNode> = {
                    pending: <Clock className="w-3 h-3" />,
                    running: <RefreshCw className="w-3 h-3 animate-spin" />,
                    passed: <CheckCircle2 className="w-3 h-3" />,
                    failed: <AlertCircle className="w-3 h-3" />,
                  };
                  return (
                    <div key={key} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium ${colors[status]}`}>
                      {icons[status]}
                      {CHECK_LABELS[key]}
                    </div>
                  );
                })}
              </div>
              {!allChecksPassed && !checksRunning && (
                <button
                  type="button"
                  onClick={() => onRunChecks(volume.id)}
                  disabled={items.length === 0}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50"
                >
                  <Shield className="w-3 h-3" />
                  运行四性检测
                </button>
              )}
              {/* ★ 检测问题明细（真实现：run-volume 未通过项） */}
              {issues.length > 0 && !checksRunning && (
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {issues.slice(0, 5).map((iss, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[10px] text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
                      <span className="min-w-0"><strong>{iss.name}</strong>：{iss.note}</span>
                    </div>
                  ))}
                  {issues.length > 5 && (
                    <div className="text-[10px] text-slate-400 px-1">…共 {issues.length} 项问题，处理后可重新运行检测</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 操作按钮 */}
          {volume.status === 'draft' && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={items.length === 0 || !allChecksPassed || confirming}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  {confirming ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3" />
                  )}
                  确认组卷{items.length > 0 ? ` (${items.length}件)` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => onPrint(volume.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-400 rounded-lg hover:bg-slate-50"
                >
                  <Printer className="w-3 h-3" />
                  目录预览
                </button>
                <div className="flex-1" />
                {/* 卷级操作：合并（他卷并入本卷）/ 拆卷（整卷打散回池） */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMerge(); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:border-sky-300 hover:text-sky-700 transition-colors"
                  title="将其他同类别/年度/期限的草稿案卷并入本卷（来源卷合并后删除）"
                >
                  <Merge className="w-3 h-3" />
                  合并
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDecompose(volume.id); }}
                  disabled={items.length === 0}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
                  title="拆卷：卷内全部件回到待组卷池，案卷删除"
                >
                  <Ungroup className="w-3 h-3" />
                  拆卷
                </button>
                {items.length === 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(volume.id); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    title="删除空案卷"
                  >
                    <Trash2 className="w-3 h-3" />
                    删除空卷
                  </button>
                )}
              </div>
              {!allChecksPassed && items.length > 0 && (
                <span className="text-[10px] text-amber-600 inline-flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> 需先通过四性检测</span>
              )}
            </div>
          )}

          {/* 已确认显示 + 移交/撤销按钮 */}
          {['confirmed', 'numbered', 'completed'].includes(volume.status) && (
            <div className="space-y-2">
              {volume.volumeCode ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-sky-700 bg-sky-100 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-500" />
                  档号: {volume.volumeCode}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 bg-slate-100 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                  已确认（未赋号 — 会计档案使用自身凭证号体系）
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTransfer}
                  disabled={transferring}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:bg-slate-300 transition-colors"
                >
                  {transferring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  移交至档案保管
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onUnconfirm(volume.id); }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  撤销确认
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── 子组件：推荐面板 ──
interface RecommendPanelProps {
  recommendations: Array<{ id: string; title: string; estimatedItems: number; estimatedPages: number; dateFrom: string; dateTo: string }>;
  onAccept: (index: number) => void;
  onAcceptAll: () => void;
  /** ★ 取消/关闭：中途终止本次智能组卷操作 */
  onCancel: () => void;
}

const RecommendPanel: React.FC<RecommendPanelProps> = ({ recommendations, onAccept, onAcceptAll, onCancel }) => {
  const [expanded, setExpanded] = useState(true);

  if (recommendations.length === 0) return null;

  return (
    <div className="border-t border-amber-200 bg-amber-50/50 shrink-0">
      <div
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <span className="flex-1 text-sm font-semibold text-amber-800">
          智能组卷 ({recommendations.length} 组)
        </span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-amber-400" /> : <ChevronRight className="w-3.5 h-3.5 text-amber-400" />}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAcceptAll(); }}
          className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-100 rounded-md hover:bg-amber-200"
        >
          全部接受
        </button>
        {/* ★ 取消本次智能组卷：清空推荐结果，不产生任何案卷 */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          className="px-2.5 py-1 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-md hover:bg-slate-100 hover:text-slate-700"
        >
          取消
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          title="关闭（放弃本次智能组卷）"
          className="p-1 text-amber-400 hover:text-amber-700 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {expanded && (
        /* ★ 高度受限 + 内部滚动：推荐组多时不再把条目池/分页栏顶出可视区（2026-08-08 修复） */
        <div className="px-4 pb-3 space-y-1.5 max-h-72 overflow-y-auto">
          {recommendations.map((rec, i) => (
            <div
              key={rec.id}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm"
            >
              <FileText className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-700 truncate">{rec.title}</div>
                <div className="text-xs text-slate-500">
                  {rec.estimatedItems} 件 | 约 {rec.estimatedPages} 页 | {rec.dateFrom} ~ {rec.dateTo}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onAccept(i)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100"
              >
                <Check className="w-3 h-3" />
                接受
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── 子组件：操作弹窗外壳（与拆卷确认弹窗同风格） ──
const OpModal: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}> = ({ title, subtitle, icon, iconBg = 'bg-sky-100', onClose, children, footer }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
    <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
    <div
      className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-in zoom-in-95 max-h-[85vh] flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>{icon}</div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate" title={subtitle}>{subtitle}</p>}
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto">{children}</div>
      <div className="flex items-center gap-3 justify-end mt-6 shrink-0">{footer}</div>
    </div>
  </div>
);

// ── 子组件：悬浮选择工具栏按钮（深色 pill 内） ──
const PillBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}> = ({ icon, label, onClick, disabled, title, danger }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-full transition-colors whitespace-nowrap disabled:opacity-35 disabled:hover:bg-transparent ${
      danger ? 'text-amber-300 hover:bg-amber-400/20' : 'text-slate-100 hover:bg-white/10'
    }`}
  >
    {icon}{label}
  </button>
);

/** 拆分为新案卷：选中件 → 新卷（继承源卷类别/年度/期限） */
const SplitVolumeModal: React.FC<{
  source: Volume;
  sourceCount: number;
  selectedCount: number;
  onCancel: () => void;
  onSubmit: (title: string) => Promise<void>;
}> = ({ source, sourceCount, selectedCount, onCancel, onSubmit }) => {
  const [title, setTitle] = useState(`${source.title || '案卷'}（拆分）`);
  const [busy, setBusy] = useState(false);
  const allSelected = selectedCount >= sourceCount;

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(title.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <OpModal
      title="拆分为新案卷"
      subtitle={`来源：${source.title || source.volumeCode || '未命名案卷'}`}
      icon={<Split className="w-5 h-5 text-sky-600" />}
      onClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !title.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            确认拆分（{selectedCount} 件）
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">新案卷题名</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-300"
            autoFocus
          />
        </label>
        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 leading-relaxed">
          <p>· 新案卷继承本卷类别 / 年度 / 保管期限，仍为草稿状态，确认组卷时统一赋号。</p>
          <p>· 选中 {selectedCount} 件按原顺序移入新卷，本卷其余 {sourceCount - selectedCount} 件保持原顺序。</p>
          {allSelected && (
            <p className="text-amber-700 font-medium">· 已勾选全部件：拆分后本卷为空，将自动销毁（如需整卷改名请直接编辑题名）。</p>
          )}
        </div>
      </div>
    </OpModal>
  );
};

/** 转卷：选中件移入其他草稿案卷 */
const MoveItemsModal: React.FC<{
  source: Volume;
  selectedCount: number;
  compatible: Volume[];
  incompatible: Volume[];
  itemsCountOf: (volumeId: string) => number;
  onCancel: () => void;
  onSubmit: (targetVolumeId: string) => Promise<void>;
}> = ({ source, selectedCount, compatible, incompatible, itemsCountOf, onCancel, onSubmit }) => {
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!targetId) return;
    setBusy(true);
    try {
      await onSubmit(targetId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <OpModal
      title="转卷（移入其他案卷）"
      subtitle={`从「${source.title || source.volumeCode || '未命名案卷'}」移出 ${selectedCount} 件`}
      icon={<FolderOutput className="w-5 h-5 text-sky-600" />}
      onClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !targetId}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            确认转卷（{selectedCount} 件）
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-slate-500">目标案卷（仅同类别 / 年度 / 保管期限的草稿卷可转入）：</p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {compatible.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              暂无可转入的草稿案卷（类别/年度/期限须与本卷一致）
            </div>
          )}
          {compatible.map((v) => (
            <label
              key={v.id}
              className={`flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-colors ${
                targetId === v.id ? 'border-sky-300 bg-sky-50/70' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input type="radio" name="move-target" checked={targetId === v.id} onChange={() => setTargetId(v.id)} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700 truncate">{v.title || v.volumeCode || '未命名案卷'}</div>
                <div className="text-[10px] text-slate-400">{v.year} 年 · {itemsCountOf(v.id)} 件 · 转入后追加至尾部</div>
              </div>
            </label>
          ))}
          {incompatible.length > 0 && (
            <div className="pt-1">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider px-1 pb-1">不可转入（类别/年度/期限不一致）</p>
              {incompatible.map((v) => (
                <div key={v.id} className="flex items-center gap-2.5 p-2 border border-slate-100 rounded-xl opacity-50">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 truncate">{v.title || v.volumeCode || '未命名案卷'}</div>
                    <div className="text-[10px] text-slate-400">{v.year} 年 · {itemsCountOf(v.id)} 件 · {v.retention || v.retentionCode || '期限未设'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </OpModal>
  );
};

/** 合并案卷：将其他草稿卷并入本卷 */
const MergeVolumesModal: React.FC<{
  target: Volume;
  targetCount: number;
  candidates: Volume[];
  itemsCountOf: (volumeId: string) => number;
  onCancel: () => void;
  onSubmit: (sourceVolumeIds: string[]) => Promise<void>;
}> = ({ target, targetCount, candidates, itemsCountOf, onCancel, onSubmit }) => {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pickedCount = candidates.filter((v) => picked.has(v.id)).reduce((s, v) => s + itemsCountOf(v.id), 0);

  const submit = async () => {
    if (picked.size === 0) return;
    setBusy(true);
    try {
      await onSubmit(Array.from(picked));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OpModal
      title="合并案卷"
      subtitle={`并入目标：${target.title || target.volumeCode || '未命名案卷'}（现有 ${targetCount} 件）`}
      icon={<Merge className="w-5 h-5 text-sky-600" />}
      onClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || picked.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            确认合并（{picked.size} 卷 / {pickedCount} 件）
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-slate-500">选择要并入本卷的案卷（其卷内件按顺序追加到本卷尾部）：</p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {candidates.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              暂无其他同类别 / 年度 / 保管期限的草稿案卷可合并
            </div>
          )}
          {candidates.map((v) => (
            <label
              key={v.id}
              className={`flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer transition-colors ${
                picked.has(v.id) ? 'border-sky-300 bg-sky-50/70' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input type="checkbox" checked={picked.has(v.id)} onChange={() => toggle(v.id)} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700 truncate">{v.title || v.volumeCode || '未命名案卷'}</div>
                <div className="text-[10px] text-slate-400">{v.year} 年 · {itemsCountOf(v.id)} 件</div>
              </div>
            </label>
          ))}
        </div>
        {picked.size > 0 && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            合并后来源 {picked.size} 卷将被删除，本卷共 {targetCount + pickedCount} 件；合并顺序 = 列表勾选顺序，可拆分/转卷再调整。
          </div>
        )}
      </div>
    </OpModal>
  );
};

// ── 主组件 ──
const VolumeWorkspacePage: React.FC = () => {
  // ── Stores ──
  const records = useArchiveStore((s) => s.records);
  const setRecords = useArchiveStore((s) => s.setRecords);
  const volumes = useVolumeStore((s) => s.volumes);
  const volumeItems = useVolumeStore((s) => s.volumeItems);
  const recommendations = useVolumeStore((s) => s.recommendations);
  const filters = useVolumeStore((s) => s.filters);
  const sourceDocs = useSourceDocumentStore((s) => s.documents);

  // ★ 每张凭证的附件数映射
  const attachmentCountMap = useMemo(() => {
    const map = new Map<string, number>();
    sourceDocs.forEach((sd) => {
      map.set(sd.parentRecordId, (map.get(sd.parentRecordId) || 0) + 1);
    });
    return map;
  }, [sourceDocs]);

  // ── 表格列（从凭证上下文配置读取） ──
  const metaStore = useMetadataDisplayStore();
  const voucherFieldIds = useMemo(() => getAllFieldIds('voucher'), []);
  const voucherDefaultIds = useMemo(() => getDefaultVisibleIds('voucher'), []);

  useEffect(() => {
    metaStore.initContext('voucher', voucherFieldIds, voucherDefaultIds);
  }, [metaStore.initContext, voucherFieldIds, voucherDefaultIds]);

  // 案卷数据由 AppLayout 按全宗全局加载（loadVolumes），本页直接消费 store 镜像

  // ── 核对闸门（2026-08-16 贯通修复） ──
  // 推送/抓取去向为「送核对」的件虽已入池（服务端统一建件），但核对通过前不得组卷。
  // 从收集台账拉取 pending 件 nodeId 集合，待组卷池排除之并给出提示。
  const [pendingCheckIds, setPendingCheckIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    openPushService.collectPendingCheck()
      .then((list) => setPendingCheckIds(new Set(list.map((c) => c.recordNodeId))))
      .catch(() => setPendingCheckIds(new Set()));
  }, [records]); // 池变化（核对通过/新采集入池）时同步重拉台账

  // ★ 将 columnDef 转为 DataTableColumn（接入排序 + 列缩放 + table-fixed）
  const tableColumns = useMemo((): DataTableColumn<ArchiveRecord>[] => {
    const visibleIds = metaStore.getVisibleIds('voucher');
    const rawCols = visibleIds.length === 0 ? getVoucherDefaultColumns() : getVoucherColumns(visibleIds);
    const SORTABLE_IDS = new Set(['DATE', 'AMOUNT', 'VOUCHER_NO']);
    const SORT_VALUES: Record<string, (r: ArchiveRecord) => string | number> = {
      DATE: (r) => `${r.year}-${r.month}`,
      AMOUNT: (r) => r.amount,
      VOUCHER_NO: (r) => r.voucherNo,
    };
    return rawCols.map(col => {
      const px = col.width ? parseInt(col.width) : 0;
      return {
        id: col.metaId,
        header: col.label,
        cell: (r: ArchiveRecord) => col.accessor(r),
        sortValue: SORT_VALUES[col.metaId],
        sortable: SORTABLE_IDS.has(col.metaId),
        align: col.align || 'left',
        size: px || 120,
        minSize: Math.max(40, (px || 120) - 30),
        maxSize: (px || 120) + 80,
      };
    });
  }, [metaStore.contexts['voucher']?.fields]);

  const {
    setFilters,
    createVolume,
    updateVolume,
    addItemsToVolume,
    removeItemFromVolume,
    confirmVolume,
    deleteVolume,
    generateRecommendations,
    acceptRecommendation,
    acceptAllRecommendations,
    setVolumes,
    reorderItems,
    splitVolume,
    mergeVolumes,
    moveItemsToVolume,
  } = useVolumeStore();

  // ── 本地状态 ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeVolumeId, setActiveVolumeId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [decomposeTarget, setDecomposeTarget] = useState<string | null>(null); // 拆卷确认目标
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [preselectedPrintVolumeId, setPreselectedPrintVolumeId] = useState<string | null>(null);
  const [volumeChecks, setVolumeChecks] = useState<Record<string, VolumeChecks>>({});
  const [detailRecord, setDetailRecord] = useState<ArchiveRecord | null>(null);

  // ── ★ 卷内件选择域（拆分/转卷/排序/移出；单域：跨卷勾选自动重置，2026-08-17） ──
  const [itemSel, setItemSel] = useState<{ volumeId: string; ids: Set<string> } | null>(null);
  // 弹窗目标：拆分（源卷）/ 转卷（源卷）/ 合并（目标卷）
  const [splitTarget, setSplitTarget] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);

  /** 案卷规格一致性（同大类/年度/期限才可合并/转卷，与服务端 requireCompatible 对齐） */
  const sameVolumeSpec = useCallback((a: Volume, b: Volume) => (
    toCategoryCode(a.archiveTypeCode, a.archiveType) === toCategoryCode(b.archiveTypeCode, b.archiveType)
    && String(a.year) === String(b.year)
    && (a.retentionCode || inferRetentionCode(a.retention)) === (b.retentionCode || inferRetentionCode(b.retention))
  ), []);

  // ── ★ 卷内件选择域信息（悬浮工具栏用：单选索引/卷内总数/卷名） ──
  const selInfo = useMemo(() => {
    if (!itemSel) return { idx: -1, total: 0, recordId: null as string | null, volumeTitle: '' };
    const items = volumeItems[itemSel.volumeId] || [];
    const idx = itemSel.ids.size === 1 ? items.findIndex((it) => itemSel.ids.has(it.recordId)) : -1;
    const vol = volumes.find((v) => v.id === itemSel.volumeId);
    return {
      idx,
      total: items.length,
      recordId: idx >= 0 ? items[idx].recordId : null,
      volumeTitle: vol?.title || vol?.volumeCode || '案卷',
    };
  }, [itemSel, volumeItems, volumes]);

  // ★ 查看凭证详情（从未分配池或案卷卡片中点击）
  const handleViewDetail = useCallback((r: { id: string }) => {
    const full = records.find((rec) => rec.id === r.id);
    if (full) setDetailRecord(full);
  }, [records]);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── 计算未组卷记录 ──
  // 双重过滤：volumeItems 中的 + 已有 volumeId 的记录（mock数据预分配）
  // + 核对闸门：收集台账待核对件核对通过前不入待组卷池（2026-08-16 贯通修复）
  const unassignedRecords = useMemo(() => {
    const volumeRecordIds = new Set<string>();
    for (const items of Object.values(volumeItems)) {
      for (const item of items) {
        volumeRecordIds.add(item.recordId);
      }
    }
    return records.filter((r) => !volumeRecordIds.has(r.id) && !r.volumeId && !pendingCheckIds.has(r.id));
  }, [records, volumeItems, pendingCheckIds]);

  // 被核对闸门拦下的件数（提示条展示）
  const gatedCount = useMemo(() => {
    const volumeRecordIds = new Set<string>();
    for (const items of Object.values(volumeItems)) {
      for (const item of items) volumeRecordIds.add(item.recordId);
    }
    return records.filter((r) => !volumeRecordIds.has(r.id) && !r.volumeId && pendingCheckIds.has(r.id)).length;
  }, [records, volumeItems, pendingCheckIds]);

  // 应用筛选 + ★ 按凭证号排序（会计实操：组卷唯一排序依据）
  const filteredUnassigned = useMemo(() => {
    let result = [...unassignedRecords];
    if (filters.year) {
      result = result.filter((r) => parseInt(r.year) === filters.year);
    }
    if (filters.month) {
      result = result.filter((r) => r.month === filters.month);
    }
    if (filters.archiveType && filters.archiveType !== '全部') {
      result = result.filter((r) => r.archiveType === filters.archiveType);
    }
    if (filters.retention && filters.retention !== '全部') {
      result = result.filter((r) => r.retention === filters.retention);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.voucherNo.toLowerCase().includes(q) ||
          r.archiveCode.toLowerCase().includes(q) ||
          r.amount.toString().includes(q)
      );
    }
    // ★ 按凭证号升序排序（会计实操：装订唯一依据是记账凭证编号升序）
    result.sort((a, b) => {
      const pa = a.voucherNo.match(/^(.+?)-(\d+)$/);
      const pb = b.voucherNo.match(/^(.+?)-(\d+)$/);
      if (!pa || !pb) return a.voucherNo.localeCompare(b.voucherNo);
      if (pa[1] !== pb[1]) return pa[1].localeCompare(pb[1]);
      return parseInt(pa[2]) - parseInt(pb[2]);
    });
    return result;
  }, [unassignedRecords, filters, searchQuery]);

  // ── 分页 ──
  const {
    pageData: pagedUnassigned,
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    setPage,
    setPageSize,
  } = usePagination(filteredUnassigned, { defaultPageSize: 20 });

  // 筛选条件变化时重置到第1页
  useEffect(() => { setPage(1); }, [filters, searchQuery, setPage]);

  // ★ 凭证号连续性检测结果
  const continuityCheck = useMemo(() => {
    const voucherNos = filteredUnassigned.map(r => r.voucherNo);
    return validateVoucherContinuity(voucherNos);
  }, [filteredUnassigned]);

  // 记录映射（供VolumeCard查找记录详情）
  const recordMap = useMemo(() => {
    const map = new Map<string, { voucherNo: string; archiveType: string; amount: number; year: string; month: string }>();
    for (const r of records) {
      map.set(r.id, { voucherNo: r.voucherNo, archiveType: r.archiveType, amount: r.amount, year: r.year, month: r.month });
    }
    return map;
  }, [records]);

  // ── 事件处理 ──
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const handleAddToVolume = useCallback(
    async (volumeId: string) => {
      if (selectedIds.size === 0) return;
      try {
        await addItemsToVolume(volumeId, Array.from(selectedIds));
        setSelectedIds(new Set());
        useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
        showToast(`已添加 ${selectedIds.size} 件到案卷`);
      } catch (e: any) {
        showToast(e.message || '加件失败', 'info');
      }
    },
    [selectedIds, addItemsToVolume]
  );

  // ★ 主操作：勾选凭证 → 直接组卷（创建案卷 + 加入凭证，一步完成）
  const handleCreateAndAdd = useCallback(async () => {
    if (selectedIds.size === 0) return;
    // ★ 从选中记录推断案卷属性（类别/期限/年度），归档归类依赖这些属性
    // 否则手动建卷属性为空，移交时会错误兜底归入"其他会计资料"（2026-07-18 Bug修复）
    const firstRecord = records.find((r) => selectedIds.has(r.id));
    try {
      const volume = await createVolume({
        year: firstRecord ? parseInt(firstRecord.year) || filters.year || 2026 : filters.year || 2026,
        archiveType: firstRecord?.archiveType || '',
        archiveTypeCode: firstRecord ? inferTypeCode(firstRecord.archiveType) : '',
        retention: firstRecord?.retention || '',
        retentionCode: firstRecord ? inferRetentionCode(firstRecord.retention) : '',
        fondsCode: filters.fondsCode,
      });
      await addItemsToVolume(volume.id, Array.from(selectedIds));
      setActiveVolumeId(volume.id);
      setSelectedIds(new Set());
      useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
      showToast(`已创建案卷并加入 ${selectedIds.size} 件`);
    } catch (e: any) {
      showToast(e.message || '组卷失败', 'info');
    }
  }, [selectedIds, records, createVolume, addItemsToVolume, filters]);

  // ★ 将左侧选中件加入指定案卷（右侧交互路径，直接使用卡片对应的案卷ID）
  const handleAddSelectedToActiveVolume = useCallback(async (volumeId: string) => {
    if (selectedIds.size === 0) return;
    const vol = volumes.find((v) => v.id === volumeId);
    if (!vol || vol.status !== 'draft') {
      showToast('请先选择一个草稿状态的案卷', 'info');
      return;
    }
    try {
      await addItemsToVolume(volumeId, Array.from(selectedIds));
      setSelectedIds(new Set());
      useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
      showToast(`已添加 ${selectedIds.size} 件到「${vol.title || vol.volumeCode || '案卷'}」`);
    } catch (e: any) {
      showToast(e.message || '加件失败', 'info');
    }
  }, [selectedIds, volumes, addItemsToVolume]);

  const handleRemoveItem = useCallback(
    async (recordId: string) => {
      // Find which volume this item belongs to
      for (const [vid, items] of Object.entries(volumeItems)) {
        if (items.some((it) => it.recordId === recordId)) {
          try {
            await removeItemFromVolume(vid, recordId);
            useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
            showToast('已移出案卷', 'info');
          } catch (e: any) {
            showToast(e.message || '移出失败', 'info');
          }
          return;
        }
      }
    },
    [volumeItems, removeItemFromVolume]
  );

  const handleConfirmVolume = useCallback(
    async (volumeId: string) => {
      try {
        const result = await confirmVolume(volumeId);
        // 收集池镜像刷新（件已随卷固化，pool 视图不再含已组卷件）
        useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
        showToast(result.volume.volumeCode ? `组卷完成！卷号: ${result.volume.volumeCode}` : '组卷完成！（按配置未赋档号）');
      } catch (e: any) {
        showToast(e.message || '组卷失败', 'info');
      }
    },
    [confirmVolume]
  );

  // ★ 拆卷：拆除草稿案卷，条目全部回到待组卷池
  const handleDecompose = useCallback(
    (volumeId: string) => {
      setDecomposeTarget(volumeId);
    },
    []
  );

  const handleConfirmDecompose = useCallback(async () => {
    if (!decomposeTarget) return;
    try {
      const count = await useVolumeStore.getState().decomposeVolume(decomposeTarget);
      useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
      showToast(`已拆除案卷，${count} 条记录回到待组卷池`, 'info');
    } catch (e: any) {
      showToast(e.message || '拆卷失败', 'info');
    }
    setDecomposeTarget(null);
  }, [decomposeTarget]);

  // ★ 撤销确认：将已确认案卷恢复为草稿
  const handleUnconfirm = useCallback(
    async (volumeId: string) => {
      try {
        await useVolumeStore.getState().unconfirmVolume(volumeId);
        useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
        showToast('已撤销确认，案卷恢复为草稿状态', 'info');
      } catch (e: any) {
        showToast(e.message || '撤销确认失败', 'info');
      }
    },
    []
  );

  // ★ 指定位置插入：将左侧选中的第一条凭证插入到卷内指定位置
  const handleInsertAtPosition = useCallback(
    async (position: number) => {
      if (!activeVolumeId) {
        showToast('请先选中一个案卷', 'info');
        return;
      }
      if (selectedIds.size !== 1) {
        showToast('请先在左侧选中一条要插入的凭证', 'info');
        return;
      }
      const recordId = Array.from(selectedIds)[0];
      try {
        await useVolumeStore.getState().insertItemIntoVolume(activeVolumeId, recordId, position);
        setSelectedIds(new Set());
        useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
        showToast(`已在位置 #${position} 插入凭证`);
      } catch (e: any) {
        showToast(e.message || '插入失败', 'info');
      }
    },
    [activeVolumeId, selectedIds]
  );

  // ── ★ 卷内件勾选（单选择域：切换案卷自动重置，避免跨卷误操作） ──
  const handleToggleItemSelect = useCallback((volumeId: string, recordId: string) => {
    setItemSel((prev) => {
      if (!prev || prev.volumeId !== volumeId) return { volumeId, ids: new Set([recordId]) };
      const next = new Set(prev.ids);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next.size === 0 ? null : { volumeId, ids: next };
    });
  }, []);

  // ── ★ 全选本卷（悬浮工具栏「全选」） ──
  const handleSelectAllInSelVolume = useCallback(() => {
    if (!itemSel) return;
    const items = volumeItems[itemSel.volumeId] || [];
    setItemSel({ volumeId: itemSel.volumeId, ids: new Set(items.map((it) => it.recordId)) });
  }, [itemSel, volumeItems]);

  // ── ★ 卷内排序：选中件上移/下移一位（调 reorder 端点整体重排） ──
  const handleMoveItemOrder = useCallback(
    async (volumeId: string, recordId: string, dir: -1 | 1) => {
      const items = volumeItems[volumeId] || [];
      const idx = items.findIndex((it) => it.recordId === recordId);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= items.length) return;
      const ordered = items.map((it) => it.id);
      [ordered[idx], ordered[swap]] = [ordered[swap], ordered[idx]];
      try {
        await reorderItems(volumeId, ordered);
        showToast('已调整卷内顺序');
      } catch (e: any) {
        showToast(e.message || '排序失败', 'info');
      }
    },
    [volumeItems, reorderItems]
  );

  // ── ★ 批量移出回待组卷池（逐件独立成败；最后一件移出时服务端自动销毁空卷） ──
  const handleBatchRemoveItems = useCallback(
    async (volumeId: string, recordIds: string[]) => {
      let ok = 0;
      let fail = 0;
      for (const rid of recordIds) {
        try {
          await removeItemFromVolume(volumeId, rid);
          ok++;
        } catch {
          fail++;
        }
      }
      setItemSel(null);
      useArchiveStore.getState().loadRecords();
      void useArchiveStore.getState().loadAllRecords();
      showToast(
        fail === 0 ? `已移出 ${ok} 件回待组卷池` : `已移出 ${ok} 件，${fail} 件失败`,
        fail === 0 ? 'success' : 'info'
      );
    },
    [removeItemFromVolume]
  );

  // ── ★ 拆分为新案卷（选中件 → 新卷，继承源卷属性） ──
  const handleSplitSubmit = useCallback(
    async (title: string) => {
      if (!itemSel) return;
      const { volumeId, ids } = itemSel;
      try {
        const newVol = await splitVolume(volumeId, Array.from(ids), title);
        setSplitTarget(null);
        setItemSel(null);
        setActiveVolumeId(newVol.id);
        showToast(`已拆出新案卷「${newVol.title || '未命名'}」（${ids.size} 件）`);
      } catch (e: any) {
        showToast(e.message || '拆分失败', 'info');
      }
    },
    [itemSel, splitVolume]
  );

  // ── ★ 转卷（选中件移入其他草稿卷，不回收集池） ──
  const handleMoveSubmit = useCallback(
    async (targetVolumeId: string) => {
      if (!itemSel) return;
      const { volumeId, ids } = itemSel;
      const tv = volumes.find((v) => v.id === targetVolumeId);
      try {
        const { moved, sourceDestroyed } = await moveItemsToVolume(volumeId, Array.from(ids), targetVolumeId);
        setMoveTarget(null);
        setItemSel(null);
        showToast(
          `已转卷 ${moved} 件至「${tv?.title || tv?.volumeCode || '目标案卷'}」${sourceDestroyed ? '，源卷已空自动销毁' : ''}`
        );
      } catch (e: any) {
        showToast(e.message || '转卷失败', 'info');
      }
    },
    [itemSel, moveItemsToVolume, volumes]
  );

  // ── ★ 合并案卷（来源卷并入目标卷，来源卷删除） ──
  const handleMergeSubmit = useCallback(
    async (sourceIds: string[]) => {
      if (!mergeTarget) return;
      try {
        const { volume, mergedCount, mergedVolumes } = await mergeVolumes(sourceIds, mergeTarget);
        setMergeTarget(null);
        showToast(`已合并 ${mergedVolumes} 卷（${mergedCount} 件）至「${volume.title || volume.volumeCode || '目标案卷'}」`);
      } catch (e: any) {
        showToast(e.message || '合并失败', 'info');
      }
    },
    [mergeTarget, mergeVolumes]
  );

  const handleRecommend = useCallback(() => {
    generateRecommendations(unassignedRecords);
    showToast(`已生成 ${unassignedRecords.length > 0 ? '推荐分组' : '暂无待组卷条目'}`, 'info');
  }, [generateRecommendations, unassignedRecords]);

  const handleAcceptRecommendation = useCallback(
    async (index: number) => {
      try {
        const id = await acceptRecommendation(index);
        if (id) {
          setActiveVolumeId(id);
          useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
          showToast('已接受推荐并创建案卷');
        }
      } catch (e: any) {
        showToast(e.message || '接受推荐失败', 'info');
      }
    },
    [acceptRecommendation]
  );

  // ── 补传文件（创建 SourceDocument 附件，而非假 ArchiveRecord） ──
  const handleSupplementUpload = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // 找到当前活跃的草稿案卷中的凭证
    let targetRecordId = '';
    if (activeVolumeId) {
      const items = volumeItems[activeVolumeId] || [];
      if (items.length > 0) targetRecordId = items[0].recordId;
    }

    if (!targetRecordId) {
      showToast('请先选择案卷并添加凭证后再上传附件', 'info');
      return;
    }

    const targetRecord = records.find((r) => r.id === targetRecordId);
    if (!targetRecord) return;

    // 使用 sourceDocumentStore 创建附件
    const { documents: existingDocs, setDocuments } = useSourceDocumentStore.getState();
    const existingAttachments = existingDocs.filter((d) => d.parentRecordId === targetRecordId);
    const nextSeq = existingAttachments.length + 1;

    const newDocs = fileArray.map((f, i) => ({
      id: `sd-supplement-${Date.now()}-${i}`,
      documentNo: `SCAN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(nextSeq + i).padStart(3, '0')}`,
      docTypeCode: 'generic-invoice',
      docTypeName: '扫描补传附件',
      transactionDate: `${targetRecord.year}-${targetRecord.month}-15`,
      amountLower: targetRecord.amount,
      amountUpper: '',
      counterpartyName: targetRecord.department,
      summary: targetRecord.remarks || '组卷补传',
      preparer: '档案管理员', reviewer: '',
      attachmentCount: 0, businessCategory: '费用' as const,
      parentVoucherNo: targetRecord.voucherNo,
      attachmentSequence: nextSeq + i,
      parentRecordId: targetRecord.id,
      carrierType: 'paper' as const, source: 'digitized' as const,
      files: [{ name: f.name, type: f.type || '', size: `${(f.size / 1024).toFixed(1)} KB`, contentType: 'pdf' as const, hash: `hash-${Date.now()}`, signatureVerified: false }],
      extFields: {},
      checks: { real: true, complete: true, usable: true, safe: true },
      remarks: `${targetRecord.voucherNo} 组卷时补传附件`,
      createdAt: new Date().toISOString(),
    }));

    setDocuments([...existingDocs, ...newDocs]);

    // 更新凭证的 sourceDocumentIds
    const updated = records.map((r) => {
      if (r.id === targetRecordId) {
        return { ...r, sourceDocumentIds: [...(r.sourceDocumentIds || []), ...newDocs.map((d: any) => d.id)] };
      }
      return r;
    });
    setRecords(updated);

    showToast(`已为 ${targetRecord.voucherNo} 补传 ${newDocs.length} 份附件`);
  }, [records, setRecords, volumes, activeVolumeId, volumeItems]);

  // ── 四性检测（真实现：/inspection/run-volume，2026-08-18 替换 setTimeout 假检测） ──
  const [volumeIssues, setVolumeIssues] = useState<Record<string, InspectionIssue[]>>({});

  const handleRunChecks = useCallback(async (volumeId: string) => {
    setVolumeChecks((prev) => ({
      ...prev,
      [volumeId]: { real: 'running', complete: 'running', usable: 'running', safe: 'running' },
    }));
    try {
      const r = await runVolumeInspection(volumeId);
      setVolumeChecks((prev) => ({
        ...prev,
        [volumeId]: {
          real: r.real ? 'passed' : 'failed',
          complete: r.complete ? 'passed' : 'failed',
          usable: r.usable ? 'passed' : 'failed',
          safe: r.safe ? 'passed' : 'failed',
        },
      }));
      setVolumeIssues((prev) => ({ ...prev, [volumeId]: r.issues || [] }));
      showToast(
        r.allPass
          ? `四性检测通过（${r.itemCount} 件）`
          : `四性检测未通过：${(r.issues || []).length} 项问题（展开案卷查看明细）`,
        r.allPass ? 'success' : 'info'
      );
    } catch (e: any) {
      setVolumeChecks((prev) => ({
        ...prev,
        [volumeId]: { real: 'failed', complete: 'failed', usable: 'failed', safe: 'failed' },
      }));
      setVolumeIssues((prev) => ({ ...prev, [volumeId]: [] }));
      showToast(e.message || '四性检测执行失败', 'info');
    }
  }, []);

  // ── 移交至档案保管（服务端自动分类归盒） ──
  const handleTransfer = useCallback(async (volumeId: string) => {
    const volumeStore = useVolumeStore.getState();
    try {
      const volume = volumeStore.volumes.find(v => v.id === volumeId);
      // ★ 类别名按归一化后的大类代码查表（数字代码 01 需先映射为 KP）
      const typeLabel: Record<string, string> = { KP: '会计凭证', KB: '会计账簿', FB: '财务报表', QT: '其他会计资料' };
      const categoryCode = toCategoryCode(volume?.archiveTypeCode || '', volume?.archiveType);
      const typeName = typeLabel[categoryCode] || '';
      // 移交（服务端自动按 archiveTypeCode 归入对应分类盒）
      await volumeStore.transferVolume(volumeId);
      useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
      const transferred = useVolumeStore.getState().volumes.find(v => v.id === volumeId);
      showToast(`已移交 1 卷（${typeName}）至档案保管${transferred?.boxNo ? ` · ${transferred.boxNo}` : ''}`);
    } catch (e: any) {
      showToast(e.message || '移交失败', 'info');
    }
  }, []);

  // ── 打开目录打印弹窗 ──
  const handleOpenPrint = useCallback((volumeId: string) => {
    setPreselectedPrintVolumeId(volumeId);
    setShowPrintModal(true);
  }, []);

  // ── 删除未组卷记录（真删除：调 DELETE /records/{id} 服务端永久删除；
  // 旧版只 filter 前端状态 → 下次 loadRecords 复活，2026-07-29 用户报障修复） ──
  const handleDeleteRecord = useCallback(async (recordId: string) => {
    try {
      await deleteRecord(recordId);
      setRecords(useArchiveStore.getState().records.filter((r) => r.id !== recordId));
      showToast('已删除记录');
    } catch (e: any) {
      showToast(e.message || '删除失败', 'info');
    }
  }, [setRecords]);

  // ── 批量删除未组卷记录（逐件独立成败，失败件保留并提示） ──
  const handleBatchDelete = useCallback(async (ids: string[]) => {
    const failedIds = new Set<string>();
    let firstErr = '';
    for (const id of ids) {
      try {
        await deleteRecord(id);
      } catch (e: any) {
        failedIds.add(id);
        if (!firstErr) firstErr = e?.message || '删除失败';
      }
    }
    setRecords(useArchiveStore.getState().records.filter(
      (r) => !ids.includes(r.id) || failedIds.has(r.id),
    ));
    setSelectedIds(new Set());
    if (failedIds.size === 0) {
      showToast(`已批量删除 ${ids.length} 条记录`);
    } else {
      showToast(`已删除 ${ids.length - failedIds.size} 条，${failedIds.size} 条失败（${firstErr}）`, 'info');
    }
  }, [setRecords]);

  // ── 获取案卷的四性检测状态 ──
  const getChecks = (volumeId: string): VolumeChecks => {
    return volumeChecks[volumeId] || { real: 'pending', complete: 'pending', usable: 'pending', safe: 'pending' };
  };

  // ── 渲染 ──
  const draftVolumes = volumes.filter((v) => v.status === 'draft');
  // ★ 已移交和已销毁的案卷从工作台消失
  const nonDraftVolumes = volumes.filter((v) => v.status !== 'draft' && v.status !== 'transferred' && v.status !== 'destroyed');

  return (
    <>
    <div className="flex flex-col h-full bg-slate-100">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-slate-700 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* 筛选栏 */}
      <FilterBar
        year={filters.year}
        month={filters.month}
        archiveType={filters.archiveType}
        retention={filters.retention}
        unassignedCount={unassignedRecords.length}
        volumeCount={volumes.length}
        onChange={(f) => setFilters(f)}
        onRecommend={handleRecommend}
        onUploadMaterial={() => {
          // 若无选中案卷，自动选中第一个草稿案卷
          if (!activeVolumeId) {
            const draft = volumes.find((v) => v.status === 'draft');
            if (draft) setActiveVolumeId(draft.id);
          }
          setShowUploadModal(true);
        }}
      />

      {/* ★ 凭证号连续性状态条（会计实操：组卷核心依据） */}
      {filteredUnassigned.length > 0 && (
        <div className={`px-6 py-2 text-xs flex items-center gap-3 border-b ${
          continuityCheck.isContinuous
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {continuityCheck.isContinuous ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>凭证号连续</span>
              <span className="font-mono font-semibold">{continuityCheck.range}</span>
              <span className="text-emerald-500">（{filteredUnassigned.length} 张，可直接组卷）</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>凭证号存在断号</span>
              {continuityCheck.gaps.length > 0 && (
                <span className="font-mono text-red-500">
                  缺号: {continuityCheck.gaps.slice(0, 5).join(', ')}
                  {continuityCheck.gaps.length > 5 && ` ...等${continuityCheck.gaps.length}处`}
                </span>
              )}
              <span className="text-amber-600">（仍可组卷，缺口将记录备考）</span>
            </>
          )}
        </div>
      )}

      {/* 主体：左右分栏（Grid：左3fr 右2fr = 60/40，凭证列表需要更多空间展示摘要） */}
      <div className="grid grid-cols-[3fr_2fr] flex-1 overflow-hidden">
        {/* 左侧：待分配条目池（min-h-0：grid 子项默认 min-height:auto 会被内容撑高，
            导致整行超高、底部推荐面板/分页栏被容器裁剪——2026-08-08 修复） */}
        <div className="border-r border-slate-200 bg-white flex flex-col overflow-hidden min-h-0">
          {/* 核对闸门提示（有待核对件被拦截时显示） */}
          {gatedCount > 0 && (
            <div className="mx-3 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-xs text-amber-800 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{gatedCount} 件来自推送/抓取的档案尚未核对通过，已按核对闸门规则暂不进入待组卷池。</span>
              <button
                type="button"
                onClick={() => useAppStore.getState().setActiveMainMenu('voucher-manager')}
                className="ml-auto px-2 py-0.5 text-amber-700 border border-amber-300 rounded-md hover:bg-amber-100 font-medium"
              >
                去核对工作台
              </button>
            </div>
          )}
          <UnassignedPool
            records={pagedUnassigned}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onAddToVolume={handleAddToVolume}
            onDeleteRecord={handleDeleteRecord}
            onBatchDelete={handleBatchDelete}
            volumes={draftVolumes}
            onCreateAndAdd={handleCreateAndAdd}
            attachmentCountMap={attachmentCountMap}
            onViewDetail={handleViewDetail}
            tableColumns={tableColumns}
          />

          {/* 智能推荐（在条目池下方） */}
          <RecommendPanel
            recommendations={recommendations}
            onAccept={handleAcceptRecommendation}
            onAcceptAll={async () => {
              try {
                const ids = await acceptAllRecommendations();
                if (ids.length > 0) {
                  setActiveVolumeId(ids[0]);
                  useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
                  showToast(`已接受全部 ${ids.length} 组推荐`);
                }
              } catch (e: any) {
                showToast(e.message || '接受推荐失败', 'info');
              }
            }}
            onCancel={() => {
              // ★ 中途终止本次智能组卷：清空推荐结果，不创建任何案卷
              useVolumeStore.getState().setRecommendations([]);
              showToast('已取消本次智能组卷推荐', 'info');
            }}
          />

          {/* ★ 分页栏 */}
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>

        {/* 右侧：案卷列表（min-h-0 同上防撑高；自身 overflow-y-auto 滚动） */}
        <div className="flex-1 bg-slate-50 flex flex-col overflow-y-auto min-h-0">
          <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center gap-2 shrink-0">
            <h3 className="text-sm font-semibold text-slate-700">案卷列表</h3>
            <span className="text-xs text-slate-400">
              {volumes.length > 0
                ? `共 ${volumes.length} 卷 · 草稿 ${draftVolumes.length} · 已确认 ${nonDraftVolumes.length}`
                : '暂无案卷'}
            </span>
            {/* ★ 2026-08-18：移除「新建案卷」空卷入口——会计实操不建空卷，组卷统一走左侧勾选→组卷 / 智能推荐 */}
          </div>

          <div className={`flex-1 space-y-3 p-4 ${itemSel ? 'pb-20' : ''}`}>
            {/* 草稿案卷 */}
            {draftVolumes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
                  草稿 ({draftVolumes.length})
                </h4>
                {draftVolumes.map((v) => (
                  <VolumeCard
                    key={v.id}
                    volume={v}
                    items={volumeItems[v.id] || []}
                    recordMap={recordMap}
                    isActive={activeVolumeId === v.id}
                    onSelect={() => setActiveVolumeId(v.id)}
                    onRemoveItem={handleRemoveItem}
                    onConfirm={handleConfirmVolume}
                    onDelete={(id) => {
                      deleteVolume(id);
                      showToast('已删除案卷', 'info');
                    }}
                    onRunChecks={handleRunChecks}
                    onTransfer={handleTransfer}
                    onPrint={handleOpenPrint}
                    onUpdateTitle={(volId, title) => {
                      updateVolume(volId, { title });
                      showToast(`案卷名称已更新: ${title}`);
                    }}
                    onDecompose={handleDecompose}
                    onUnconfirm={handleUnconfirm}
                    onInsertAtPosition={handleInsertAtPosition}
                    checks={getChecks(v.id)}
                    issues={volumeIssues[v.id] || []}
                    selectedCount={selectedIds.size}
                    onAddSelectedToVolume={handleAddSelectedToActiveVolume}
                    attachmentCountMap={attachmentCountMap}
                    onViewDetail={(recordId) => handleViewDetail({ id: recordId })}
                    itemSelIds={itemSel?.volumeId === v.id ? itemSel.ids : EMPTY_SEL}
                    onToggleItemSelect={(rid) => handleToggleItemSelect(v.id, rid)}
                    onMerge={() => setMergeTarget(v.id)}
                  />
                ))}
              </div>
            )}

            {/* 已确认案卷 */}
            {nonDraftVolumes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-sky-600 uppercase tracking-wider">
                  已确认 ({nonDraftVolumes.length})
                </h4>
                {nonDraftVolumes.map((v) => (
                  <VolumeCard
                    key={v.id}
                    volume={v}
                    items={volumeItems[v.id] || []}
                    recordMap={recordMap}
                    isActive={activeVolumeId === v.id}
                    onSelect={() => setActiveVolumeId(v.id)}
                    onRemoveItem={handleRemoveItem}
                    onConfirm={handleConfirmVolume}
                    onDelete={() => {}}
                    onRunChecks={handleRunChecks}
                    onTransfer={handleTransfer}
                    onPrint={handleOpenPrint}
                    onUpdateTitle={(volId, title) => {
                      updateVolume(volId, { title });
                      showToast(`案卷名称已更新: ${title}`);
                    }}
                    onDecompose={() => {}}
                    onUnconfirm={handleUnconfirm}
                    onInsertAtPosition={() => {}}
                    checks={getChecks(v.id)}
                    issues={volumeIssues[v.id] || []}
                    selectedCount={0}
                    onAddSelectedToVolume={() => {}}
                    attachmentCountMap={attachmentCountMap}
                    onViewDetail={(recordId) => handleViewDetail({ id: recordId })}
                    itemSelIds={EMPTY_SEL}
                    onToggleItemSelect={() => {}}
                    onMerge={() => {}}
                  />
                ))}
              </div>
            )}

            {/* 空状态 */}
            {volumes.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                <Archive className="w-10 h-10 mb-2" />
                <span className="text-sm">暂无案卷</span>
                <span className="text-xs mt-1">在左侧勾选凭证后点击"组卷"，或使用"智能推荐"开始组卷</span>
              </div>
            )}
          </div>

          {/* ★ 卷内件选择工具栏（悬浮底置 pill：选择域为面板级单域，不再挤在卡片内折行） */}
          {itemSel && (
            <div className="sticky bottom-3 z-20 flex justify-center pointer-events-none mt-2 shrink-0">
              <div className="pointer-events-auto flex items-center gap-0.5 pl-3 pr-1.5 py-1.5 bg-slate-800 text-white rounded-full shadow-2xl animate-in slide-in-from-bottom-3 fade-in duration-200 max-w-full">
                <span className="text-[11px] font-medium text-slate-300 whitespace-nowrap mr-1 truncate max-w-[140px]" title={selInfo.volumeTitle}>
                  「{selInfo.volumeTitle}」已选 {itemSel.ids.size} 件
                </span>
                <PillBtn
                  icon={<ListChecks className="w-3.5 h-3.5" />}
                  label="全选"
                  onClick={handleSelectAllInSelVolume}
                  disabled={itemSel.ids.size === selInfo.total}
                  title="选中本卷全部件"
                />
                <span className="w-px h-4 bg-white/15 mx-1 shrink-0" />
                <PillBtn
                  icon={<ArrowUp className="w-3.5 h-3.5" />}
                  label="上移"
                  disabled={selInfo.idx <= 0}
                  onClick={() => selInfo.recordId && handleMoveItemOrder(itemSel.volumeId, selInfo.recordId, -1)}
                  title="选中一件时可上移"
                />
                <PillBtn
                  icon={<ArrowDown className="w-3.5 h-3.5" />}
                  label="下移"
                  disabled={selInfo.idx < 0 || selInfo.idx >= selInfo.total - 1}
                  onClick={() => selInfo.recordId && handleMoveItemOrder(itemSel.volumeId, selInfo.recordId, 1)}
                  title="选中一件时可下移"
                />
                <span className="w-px h-4 bg-white/15 mx-1 shrink-0" />
                <PillBtn
                  icon={<FolderOutput className="w-3.5 h-3.5" />}
                  label="转卷"
                  onClick={() => setMoveTarget(itemSel.volumeId)}
                  title="选中件移入其他草稿案卷（不回收集池）"
                />
                <PillBtn
                  icon={<Split className="w-3.5 h-3.5" />}
                  label="拆分"
                  onClick={() => setSplitTarget(itemSel.volumeId)}
                  title="选中件拆出为新案卷（继承本卷类别/年度/期限）"
                />
                <PillBtn
                  icon={<X className="w-3.5 h-3.5" />}
                  label="移出回池"
                  danger
                  onClick={() => handleBatchRemoveItems(itemSel.volumeId, Array.from(itemSel.ids))}
                  title="选中件移回本卷外，回到左侧待组卷池"
                />
                <button
                  type="button"
                  onClick={() => setItemSel(null)}
                  title="清空勾选"
                  className="ml-1 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

      {/* 凭证归档上传弹窗 */}
      <VoucherUploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        targetVolumeId={activeVolumeId || undefined}
      />

      {/* 卷内目录打印弹窗 */}
      <VolumePrintModal
        open={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        preselectedVolumeId={preselectedPrintVolumeId}
      />

      {/* ★ 拆卷确认弹窗 */}
      {decomposeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setDecomposeTarget(null)}>
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">确认拆卷</h3>
                <p className="text-xs text-slate-500 mt-0.5">此操作不可撤销</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              卷内全部条目将回到左侧待组卷池，案卷本身将被删除。确定要继续吗？
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDecomposeTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDecompose}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors shadow-sm"
              >
                确认拆除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ★ 详情侧边面板（点击凭证"详情"按钮弹出） */}
      {detailRecord && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20" onClick={() => setDetailRecord(null)} />
          <div className="relative w-[520px] max-w-[95vw] h-full shadow-2xl z-50">
            <RecordDetailPanel
              context="voucher"
              record={detailRecord}
              onClose={() => setDetailRecord(null)}
            />
          </div>
        </div>
      )}

      {/* ★ 拆分为新案卷弹窗（针对卷内勾选件） */}
      {splitTarget && itemSel && itemSel.volumeId === splitTarget && (() => {
        const src = volumes.find((v) => v.id === splitTarget);
        if (!src) return null;
        return (
          <SplitVolumeModal
            source={src}
            sourceCount={(volumeItems[splitTarget] || []).length}
            selectedCount={itemSel.ids.size}
            onCancel={() => setSplitTarget(null)}
            onSubmit={handleSplitSubmit}
          />
        );
      })()}

      {/* ★ 转卷弹窗（卷内勾选件移入其他草稿卷） */}
      {moveTarget && itemSel && itemSel.volumeId === moveTarget && (() => {
        const src = volumes.find((v) => v.id === moveTarget);
        if (!src) return null;
        const others = draftVolumes.filter((v) => v.id !== src.id);
        return (
          <MoveItemsModal
            source={src}
            selectedCount={itemSel.ids.size}
            compatible={others.filter((v) => sameVolumeSpec(v, src))}
            incompatible={others.filter((v) => !sameVolumeSpec(v, src))}
            itemsCountOf={(vid) => (volumeItems[vid] || []).length}
            onCancel={() => setMoveTarget(null)}
            onSubmit={handleMoveSubmit}
          />
        );
      })()}

      {/* ★ 合并案卷弹窗（其他草稿卷并入目标卷） */}
      {mergeTarget && (() => {
        const target = volumes.find((v) => v.id === mergeTarget);
        if (!target) return null;
        return (
          <MergeVolumesModal
            target={target}
            targetCount={(volumeItems[mergeTarget] || []).length}
            candidates={draftVolumes.filter((v) => v.id !== target.id && sameVolumeSpec(v, target))}
            itemsCountOf={(vid) => (volumeItems[vid] || []).length}
            onCancel={() => setMergeTarget(null)}
            onSubmit={handleMergeSubmit}
          />
        );
      })()}
    </>
  );
};

export default VolumeWorkspacePage;



