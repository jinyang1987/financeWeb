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
  MapPin, Warehouse,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useArchiveStore } from '../../stores/archiveStore';
import { useSourceDocumentStore } from '../../stores/sourceDocumentStore';
import { useVolumeStore, validateVoucherContinuity, inferTypeCode, inferRetentionCode, toCategoryCode } from '../../stores/volumeStore';
import { useArchiveBoxStore } from '../../stores/archiveBoxStore';
import { useMetadataDisplayStore } from '../../stores/metadataDisplayStore';
import { getVoucherColumns, getVoucherDefaultColumns } from '../../config/metadataColumnMaps/voucherColumns';
import { POOL_COLUMN_SETS, POOL_SORT_VALUES, POOL_SORTABLE_IDS } from '../../config/metadataColumnMaps/poolColumns';
import { compareVoucherDateNo } from '../../utils/voucherSort';
import {
  getAllFieldIds,
  getDefaultVisibleIds,
} from '../../config/metadataContexts';
import RecordDetailPanel from '../../components/RecordDetailPanel';
import ShelfPositionPicker from '../../components/ShelfPositionPicker';
import { isSourceDocument } from '../../utils/recordType';
import {
  toggleUnitSelection, selectPageWithUnits, isAllPageSelected,
  resolveLinkableSelection, resolveUnlinkableSelection, findUnitSplitViolation,
  attachedSourceIds,
} from '../../utils/unitSelection';
import { linkRecordParent } from '../../services/recordService';
import { collectPairActions } from '../../utils/quickComponent';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import { ConfirmModal } from '../../components/common';
import PaginationBar from '../../components/PaginationBar';
import { usePagination } from '../../hooks/usePagination';
import type { Volume, VolumeItem } from '../../types/volume';
import type { ArchiveBox } from '../../types/archiveBox';
import type { ArchiveRecord } from '../../types';
import VoucherUploadModal from './VoucherUploadModal';
import VolumePrintModal from './VolumePrintModal';
import MetadataEntryModal from './MetadataEntryModal';
import QuickComponentModal from '../../components/QuickComponentModal';
import { deleteRecord } from '../../services/recordService';
import {
  fetchInspectionReports, parseReportDetail,
  type InspectionIssue,
} from '../../services/inspectionService';
import {
  fetchBoxes, shelveBoxApi, shelveBoxAutoApi, type ShelfPosition,
} from '../../services/boxService';
import {
  fetchRacks, fetchPositions, locationText,
  type StorageRack, type BoxPosition,
} from '../../services/storageService';

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
  /** 快速组件：在智能组卷左侧新增的放松式配对入口（2026-08） */
  onQuickComponent: () => void;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

const FilterBar: React.FC<FilterBarProps> = ({
  year, month, archiveType, retention,
  unassignedCount, volumeCount,
  onChange, onRecommend, onUploadMaterial, onQuickComponent,
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
        onClick={onQuickComponent}
        title="快速组件：点记账凭证选色，再点原始凭证即配对成件"
        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
      >
        <Link2 className="w-4 h-4" />
        快速组件
      </button>

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
  /** 全量待组卷池（单元扩展/挂接解析的数据源；records 为当前页切片，2026-08-20） */
  allPoolRecords: ArchiveRecord[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  /** 搜索框占位文案（随待组卷池类别联动，2026-08-21） */
  searchPlaceholder: string;
  onAddToVolume: (volumeId: string) => void;
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
  /** 组件（挂接）可用时的待挂接原始凭证数；0 = 置灰 */
  linkableCount: number;
  /** 解挂可用时的已挂接原始凭证数；>0 时按钮切换为【解挂】 */
  unlinkableCount: number;
  onLinkSelection: () => void;
  onUnlinkSelection: () => void;
  /** 凭证单元展开行 id（页面持有；凭证号列内的展开钮控制，2026-08-20） */
  expandedId: string | null;
}

const UnassignedPool: React.FC<UnassignedPoolProps> = ({
  records, allPoolRecords, selectedIds, onToggleSelect, onSelectAll,
  searchQuery, onSearchChange, searchPlaceholder, onAddToVolume, onBatchDelete, volumes,
  onCreateAndAdd,
  attachmentCountMap, onViewDetail, tableColumns,
  linkableCount, unlinkableCount, onLinkSelection, onUnlinkSelection, expandedId,
}) => {
  const allIds = records.map((r) => r.id);
  // ★ 单元化选择下 selectedIds 可能含页外附件 id，用 every 判定（2026-08-20）
  const allSelected = isAllPageSelected(allIds, selectedIds);
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
            placeholder={searchPlaceholder}
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

          {/* ★ 操作区：按钮常显等高（h-8），未勾选时置灰——不再用占位文字，杜绝行高跳动（2026-08-19） */}
          <div className="flex items-center gap-1.5" ref={menuRef}>
            {/* 主操作：直接组卷 → 一键创建案卷并加入选中凭证 */}
            <button
              type="button"
              onClick={onCreateAndAdd}
              disabled={selectedIds.size === 0}
              title={selectedIds.size === 0 ? '请先勾选左侧凭证' : '以选中凭证创建案卷'}
              className="flex h-8 items-center gap-1.5 px-3 text-[13px] font-medium rounded-lg transition-colors bg-sky-600 text-white hover:bg-sky-700 shadow-sm disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              组卷{selectedIds.size > 0 ? `（${selectedIds.size}）` : ''}
            </button>
            {/* 次操作：加入已有草稿案卷（常显；未选凭证或无草稿卷时置灰） */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowVolumeMenu(!showVolumeMenu)}
                disabled={selectedIds.size === 0 || draftVolumes.length === 0}
                title={selectedIds.size === 0 ? '请先勾选左侧凭证' : draftVolumes.length === 0 ? '暂无草稿状态的案卷' : '加入已有草稿案卷'}
                className="flex h-8 items-center gap-1 px-3 text-[13px] font-medium rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                加入已有
                <ChevronDown className="w-3.5 h-3.5 opacity-50" />
              </button>{showVolumeMenu && selectedIds.size > 0 && draftVolumes.length > 0 && (
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
            {/* 组件/解挂（2026-08-20 先组件再组卷：原始凭证挂接到记账凭证形成「件」单元） */}
            {unlinkableCount > 0 ? (
              <button
                type="button"
                onClick={onUnlinkSelection}
                title="解除所选原始凭证与其记账凭证的挂接"
                className="flex h-8 items-center gap-1.5 px-3 text-[13px] font-medium rounded-lg border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" />
                解挂（{unlinkableCount}）
              </button>
            ) : (
              <button
                type="button"
                onClick={onLinkSelection}
                disabled={linkableCount === 0}
                title={linkableCount === 0 ? '勾选 1 张记账凭证 + N 张未挂接的原始凭证后可组件' : '将所选原始凭证挂接到记账凭证，形成「件」单元'}
                className="flex h-8 items-center gap-1.5 px-3 text-[13px] font-medium rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                <Link2 className="w-3.5 h-3.5" />
                组件{linkableCount > 0 ? `（${linkableCount}）` : ''}
              </button>
            )}
            <span className="w-px h-4 bg-slate-200 mx-0.5" aria-hidden="true" />
            <button
              type="button"
              onClick={() => onBatchDelete(Array.from(selectedIds))}
              disabled={selectedIds.size === 0}
              title={selectedIds.size === 0 ? '请先勾选左侧凭证' : '删除选中记录'}
              className="flex h-8 items-center gap-1.5 px-3 text-[13px] font-medium rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除{selectedIds.size > 0 ? `（${selectedIds.size}）` : ''}
            </button>
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
          expandedRowId={expandedId}
          renderExpandedRow={(r) => {
            const atts = attachedSourceIds(allPoolRecords, r.id)
              .map((id) => allPoolRecords.find((x) => x.id === id)!)
              .filter(Boolean);
            return (
              <div className="px-4 py-2 bg-sky-50/60 border-l-2 border-sky-300 space-y-1">
                <div className="text-[11px] font-medium text-sky-700">所附原始凭证（{atts.length} 张，随本凭证整体组卷）</div>
                {atts.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 text-xs text-slate-600 py-0.5">
                    <Paperclip className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="font-mono font-medium text-slate-700">{a.voucherNo}</span>
                    {a.amount > 0 && <span>¥{a.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>}
                    {a.year && <span className="text-slate-400">{a.year}-{a.month}</span>}
                    <span className="px-1 py-px text-[10px] rounded bg-amber-100 text-amber-700">原始凭证</span>
                  </div>
                ))}
              </div>
            );
          }}
          renderActions={(r) => (
            // 行内仅保留「详情」；删除走顶部工具栏批量删除（避免每行都带危险操作，2026-08-22）
            <span className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onViewDetail(r); }}
                className="p-1 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-md transition-colors"
                title="查看凭证详情"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
          actionsWidth={40}
          emptyLabel="暂无未组卷条目"
          selectedClassName="bg-sky-100 hover:bg-sky-200/70"
        />
      </div>
    </div>
  );
};

// ── 四性检测状态（2026-08-25：检测统一在移交时自动执行；工作台只读展示最近结果） ──
export interface VolumeLastCheck {
  allPass: boolean;
  real: boolean;
  complete: boolean;
  usable: boolean;
  safe: boolean;
  checkedAt: string;
  issueCount: number;
}

// ── 子组件：案卷卡片（右面板） ──
interface VolumeCardProps {
  volume: Volume;
  items: VolumeItem[];
  recordMap: Map<string, { voucherNo: string; archiveType: string; amount: number; year: string; month: string; parentRecordId?: string }>;
  isActive: boolean;
  onSelect: () => void;
  onRemoveItem: (recordId: string) => void;
  onConfirm: (volumeId: string) => void;
  onDelete: (volumeId: string) => void;
  onTransfer: (volumeId: string) => void;
  onPrint: (volumeId: string) => void;
  onUpdateTitle: (volumeId: string, title: string) => void;
  onDecompose: (volumeId: string) => void;
  onUnconfirm: (volumeId: string) => void;
  onInsertAtPosition: (position: number) => void;
  /** 打开元数据录入弹窗（仅草稿卷，2026-08-25） */
  onMetadataEntry: (volumeId: string) => void;
  /** 最近一次四性检测结果（移交时自动检测产生；未检测为 null） */
  lastCheck: VolumeLastCheck | null;
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
  onSelect, onRemoveItem, onConfirm, onDelete, onTransfer, onPrint,
  onUpdateTitle, onDecompose, onUnconfirm, onInsertAtPosition, onMetadataEntry, lastCheck, selectedCount, onAddSelectedToVolume, attachmentCountMap, onViewDetail,
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

  // ★ 单元化分组（2026-08-20 先组件再组卷）：主体件为主行，已挂接原始凭证收进其下的
  //   附件组块（列表化整齐呈现）；父件不在本卷的悬挂件作为普通主行显示（避免"消失"）
  const unitGroups = useMemo(() => {
    const groups: Array<{ item: VolumeItem; children: VolumeItem[] }> = [];
    const handled = new Set<string>();
    for (const it of items) {
      if (handled.has(it.recordId)) continue;
      const pid = recordMap.get(it.recordId)?.parentRecordId;
      if (pid && items.some((x) => x.recordId === pid)) continue; // 附件，等所属凭证带出
      const children = items.filter(
        (sub) => !handled.has(sub.recordId) && recordMap.get(sub.recordId)?.parentRecordId === it.recordId,
      );
      children.forEach((c) => handled.add(c.recordId));
      handled.add(it.recordId);
      groups.push({ item: it, children });
    }
    return groups;
  }, [items, recordMap]);

  /** 卷内已挂接原始凭证数（件数行展示"含 N 张原始凭证附件"） */
  const linkedCount = useMemo(
    () => items.filter((it) => recordMap.get(it.recordId)?.parentRecordId).length,
    [items, recordMap],
  );

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
            <span>件数: {items.length}{linkedCount > 0 ? `（含 ${linkedCount} 张原始凭证附件）` : ''}</span>
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
              unitGroups.map(({ item, children }) => {
                const rec = recordMap.get(item.recordId);
                const checked = itemSelIds.has(item.recordId);
                return (
                  <React.Fragment key={item.id}>
                    {/* 主行（凭证/普通件） */}
                    <div
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
                      <span className="flex-1 truncate font-medium text-slate-700">
                        {rec?.voucherNo || item.recordArchiveCode || item.recordId}
                      </span>
                      {/* 该凭证的附件数 */}
                      {(attachmentCountMap.get(item.recordId) || 0) > 0 && (
                        <span className="text-[10px] text-amber-500 bg-amber-50 px-1 rounded shrink-0">
                          <Paperclip className="w-3 h-3 inline" />{attachmentCountMap.get(item.recordId)}
                        </span>
                      )}
                      {/* 悬挂归属徽标：父件不在本卷的原始凭证才需要（在卷的已收进附件组块） */}
                      {rec?.parentRecordId && children.length === 0 && (
                        <span className="text-[10px] text-sky-600 bg-sky-50 px-1 rounded shrink-0" title="所属记账凭证（不在本卷）">
                          附于 {recordMap.get(rec.parentRecordId)?.voucherNo || rec.parentRecordId.slice(0, 8)}
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

                    {/* ★ 附件组块：所附原始凭证列表化呈现（与主行同样的列表感，2026-08-20） */}
                    {children.length > 0 && (
                      <div className="ml-7 mr-1 mb-1 rounded-lg border border-sky-100 bg-sky-50/40 overflow-hidden">
                        <div className="px-2.5 py-1 text-[10px] font-medium text-sky-700 bg-sky-100/60 border-b border-sky-100 flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          所附原始凭证（{children.length} 张 · 与本凭证为一件）
                        </div>
                        {children.map((sub) => {
                          const subRec = recordMap.get(sub.recordId);
                          const subChecked = itemSelIds.has(sub.recordId);
                          return (
                            <div
                              key={sub.id}
                              className={`flex items-center gap-2 px-2.5 py-1 text-xs transition-colors ${
                                subChecked ? 'bg-sky-100/70' : 'hover:bg-white/70'
                              }`}
                            >
                              {volume.status === 'draft' && (
                                <input
                                  type="checkbox"
                                  checked={subChecked}
                                  onChange={() => onToggleItemSelect(sub.recordId)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded border-slate-300 shrink-0 cursor-pointer"
                                  title="随所属凭证为一件"
                                />
                              )}
                              <span className="text-[10px] text-slate-400 w-6 shrink-0">#{sub.itemNo}</span>
                              <span className="flex-1 truncate text-slate-600">
                                {subRec?.voucherNo || sub.recordArchiveCode || sub.recordId}
                              </span>
                              {subRec && (
                                <span className="text-[11px] text-slate-400">{formatAmount(subRec.amount)}</span>
                              )}
                              <button
                                type="button"
                                onClick={() => onViewDetail(sub.recordId)}
                                className="p-0.5 text-slate-300 hover:text-sky-500"
                                title="查看原始凭证详情"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                              {volume.status === 'draft' && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveItem(sub.recordId)}
                                  className="p-0.5 text-slate-300 hover:text-red-400"
                                  title="移出（须随所属凭证整体移出）"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </React.Fragment>
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

          {/* 四性检测提示（2026-08-25：检测统一在移交=推送至保管库时自动执行，组卷环节不检测） */}
          {volume.status === 'draft' && (
            <div className="flex items-start gap-1.5 text-[10px] text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
              <Shield className="w-3 h-3 shrink-0 mt-px" />
              <span>四性检测在「移交至档案保管」时按规定自动执行，未通过将阻断移交；检测明细见 档案整理→快速检测</span>
            </div>
          )}

          {/* 操作按钮 */}
          {volume.status === 'draft' && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={items.length === 0 || confirming}
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
                {/* ★ 元数据录入（2026-08-25：组卷环节的卷/件元数据录入与修正入口） */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMetadataEntry(volume.id); }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:border-sky-300 hover:text-sky-700 transition-colors"
                  title="录入/修改案卷与卷内件的元数据（确认组卷前完成）"
                >
                  <FileText className="w-3 h-3" />
                  元数据录入
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
              {/* ★ 四性检测状态（移交时自动执行；展示最近一次结果，2026-08-25） */}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium ${
                lastCheck == null
                  ? 'bg-slate-100 text-slate-500'
                  : lastCheck.allPass
                    ? 'bg-green-50 text-green-700 border border-green-100'
                    : 'bg-red-50 text-red-700 border border-red-100'
              }`}>
                {lastCheck == null ? (
                  <><Clock className="w-3 h-3" /> 待移交时自动执行四性检测（按规定：移交=检测节点）</>
                ) : lastCheck.allPass ? (
                  <><CheckCircle2 className="w-3 h-3" /> 四性检测通过（{lastCheck.checkedAt.slice(0, 16).replace('T', ' ')}）</>
                ) : (
                  <><AlertCircle className="w-3 h-3" /> 四性检测未通过：{lastCheck.issueCount} 项问题（详见 快速检测）</>
                )}
              </div>
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
  /** ★ 组卷提示（纯原始凭证池 / 孤儿原始凭证被跳过等，2026-08-19） */
  notice: string | null;
  onAccept: (index: number) => void;
  onAcceptAll: () => void;
  /** ★ 取消/关闭：中途终止本次智能组卷操作 */
  onCancel: () => void;
}

const RecommendPanel: React.FC<RecommendPanelProps> = ({ recommendations, notice, onAccept, onAcceptAll, onCancel }) => {
  const [expanded, setExpanded] = useState(true);

  if (recommendations.length === 0 && !notice) return null;

  // ★ 无推荐但有提示（如池中只有原始凭证）：渲染纯提示条，说明不出推荐的原因
  if (recommendations.length === 0) {
    return (
      <div className="border-t border-amber-200 bg-amber-50/50 shrink-0">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="flex-1 text-xs text-amber-800 leading-relaxed">{notice}</span>
          <button
            type="button"
            onClick={onCancel}
            title="关闭"
            className="p-1 text-amber-400 hover:text-amber-700 rounded shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

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
      {/* ★ 部分原始凭证被跳过时的说明（2026-08-19） */}
      {notice && (
        <div className="flex items-center gap-1.5 px-4 pb-2 -mt-1 text-xs text-amber-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {notice}
        </div>
      )}
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
          <p>· 选中 {selectedCount} 件按原顺序移入新卷，本卷其余 {sourceCount - selectedCount} 件保持原顺序。</p>
          {allSelected && (
            <p className="text-amber-700 font-medium">· 已勾选全部件：拆分后本卷为空，将自动销毁。</p>
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

/** 移交上架方式（2026-08-20）：none=仅移交归盒（默认）；auto=移交并自动上架；pick=移交并指定架位 */
type ShelveMode = 'none' | 'auto' | 'pick';

/** 移交至档案保管弹窗：案卷摘要 + 归盒预测 + 是否上架（联通实体库房密集架点选格位） */
const TransferVolumeModal: React.FC<{
  volume: Volume;
  itemCount: number;
  fondsCode: string;
  onCancel: () => void;
  /** 父组件执行 移交(+上架)；移交失败抛异常由本弹窗内联展示（弹窗保持打开），
   *  上架失败由父组件兜底提示后正常返回（弹窗关闭，盒可在实体档案库房补上架） */
  onSubmit: (choice: { mode: ShelveMode; position?: ShelfPosition }) => Promise<void>;
}> = ({ volume, itemCount, fondsCode, onCancel, onSubmit }) => {
  const [mode, setMode] = useState<ShelveMode>('none');
  const [pickPos, setPickPos] = useState<ShelfPosition | null>(null);
  const [racks, setRacks] = useState<StorageRack[]>([]);
  const [positions, setPositions] = useState<BoxPosition[]>([]);
  const [boxes, setBoxes] = useState<ArchiveBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  /** 移交四性检测未通过的问题明细（INSPECTION_FAILED 时随异常带回，2026-08-25） */
  const [submitIssues, setSubmitIssues] = useState<InspectionIssue[]>([]);

  // 弹窗打开即拉取：密集架布局 + 格位占用 + 本全宗盒列表（归盒预测）
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r, p, b] = await Promise.all([fetchRacks(), fetchPositions(), fetchBoxes({ fondsCode })]);
        if (!alive) return;
        setRacks(r);
        setPositions(p);
        setBoxes(b);
      } catch (e) {
        if (alive) setLoadErr(e instanceof Error ? e.message : '库房数据加载失败');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fondsCode]);

  const categoryCode = toCategoryCode(volume.archiveTypeCode, volume.archiveType);
  const typeName = ARCHIVE_TYPE_CATEGORY_NAMES[categoryCode] || '其他会计资料';

  // ── 归盒预测：同类别/年度的「装盒中」盒（与服务端 transfer 取首个 active 盒的口径一致；
  //    极少数情况下同目录存在多个 active 盒（如开封造成），则以服务端实际归盒为准） ──
  const predictedBox = useMemo(
    () => boxes.find((b) => b.status === 'active' && b.year === volume.year
      && toCategoryCode(b.archiveTypeCode) === categoryCode) || null,
    [boxes, volume.year, categoryCode],
  );

  const storageReady = racks.length > 0;
  const canSubmit = !busy && !loading && (mode !== 'pick' || (!!pickPos && storageReady));

  const submit = async () => {
    setBusy(true);
    setSubmitErr('');
    setSubmitIssues([]);
    try {
      await onSubmit({ mode, position: mode === 'pick' ? pickPos ?? undefined : undefined });
      // 成功：父组件关闭弹窗
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : '移交失败');
      setSubmitIssues((e as { issues?: InspectionIssue[] })?.issues || []);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => { if (!busy) onCancel(); }}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 animate-in zoom-in-95 max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center gap-3 mb-4 shrink-0">
          <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5 text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-800">移交至档案保管</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate" title={volume.title || volume.volumeCode}>
              {volume.title || volume.volumeCode || '未命名案卷'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            title="关闭"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto space-y-4 pr-0.5">
          {/* 案卷摘要 */}
          <div className="grid grid-cols-4 gap-2 text-xs">
            {([
              ['档案类别', typeName],
              ['年度', `${volume.year} 年`],
              ['保管期限', volume.retention || volume.retentionCode || '—'],
              ['卷内件数', `${itemCount} 件`],
            ] as const).map(([k, v]) => (
              <div key={k} className="bg-slate-50 rounded-lg px-3 py-2">
                <div className="text-[10px] text-slate-400">{k}</div>
                <div className="font-medium text-slate-700 mt-0.5 truncate" title={v}>{v}</div>
              </div>
            ))}
          </div>

          {/* 归盒预测 */}
          <div className="flex items-start gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
            <Archive className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-px" />
            {loading ? (
              <span className="text-slate-400">正在查询归盒位置…</span>
            ) : loadErr ? (
              <span className="text-slate-500">归盒位置查询失败（不影响移交；服务端将自动找/建同类别盒）</span>
            ) : predictedBox ? (
              <span className="text-slate-600">
                预计归入盒 <strong className="font-mono text-slate-800">{predictedBox.boxNo}</strong>
                （装盒中，已有 {predictedBox.volumeCount} 卷，本卷为第 {predictedBox.volumeCount + 1} 卷）
                <span className="text-slate-400"> · 以服务端实际归盒为准</span>
              </span>
            ) : (
              <span className="text-slate-600">
                同类别/年度暂无装盒中的档案盒，移交时将<strong className="text-slate-800">自动新建盒</strong>
                <span className="text-slate-400"> · 以服务端实际归盒为准</span>
              </span>
            )}
          </div>

          {/* 上架方式 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Warehouse className="w-3.5 h-3.5 text-slate-400" />
              上架方式（是否随本次移交一并上架）
            </div>
            {([
              {
                key: 'none' as ShelveMode,
                title: '仅移交归盒',
                desc: '盒进入库房「待上架区」，稍后在 档案保管 → 实体档案库房 上架（默认）',
                disabled: false,
              },
              {
                key: 'auto' as ShelveMode,
                title: '移交并自动上架',
                desc: '服务端自动分配密集架第一个空格位',
                disabled: !storageReady,
              },
              {
                key: 'pick' as ShelveMode,
                title: '移交并指定架位',
                desc: '点选密集架空格位（库房 → 架 → 列 → 层 → 位）',
                disabled: !storageReady,
              },
            ]).map((opt) => (
              <label
                key={opt.key}
                className={`flex items-start gap-2.5 p-2.5 border rounded-xl transition-colors ${
                  opt.disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'
                } ${mode === opt.key ? 'border-sky-300 bg-sky-50/70' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <input
                  type="radio"
                  name="shelve-mode"
                  className="mt-0.5"
                  checked={mode === opt.key}
                  disabled={opt.disabled}
                  onChange={() => setMode(opt.key)}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-700">{opt.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* 密集架格位选择器（指定架位时展开） */}
          {mode === 'pick' && storageReady && (
            <div className="pl-1 space-y-2">
              <ShelfPositionPicker racks={racks} positions={positions} value={pickPos} onChange={setPickPos} />
              {pickPos ? (
                <div className="flex items-center gap-2 text-xs">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-medium text-emerald-700">
                    已选：{locationText(pickPos.room, pickPos.rack, pickPos.column, pickPos.layer, pickPos.cell)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickPos(null)}
                    className="text-[11px] text-slate-400 hover:text-slate-600 underline"
                  >
                    重选
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400">请点击上方虚线空格位选定上架位置（灰块为已占用）</div>
              )}
            </div>
          )}

          {/* 业务后果披露（选择上架时） */}
          {mode !== 'none' && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
              上架以「盒」为单位：本卷归入的档案盒（含盒内既有案卷）将整体定位在架；
              盒上架后不再接收新卷，后续同类别案卷移交将自动开新盒。
            </div>
          )}

          {/* 库房未配置密集架时的降级说明 */}
          {!loading && !storageReady && !loadErr && (
            <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
              库房尚未配置密集架，本次仅可移交归盒；如需上架，请先在 档案保管 → 实体档案库房 新增密集架，
              或移交后在「待上架区」补上架。
            </div>
          )}

          {loadErr && (
            <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              库房数据加载失败：{loadErr}（仍可仅移交归盒，上架可在实体档案库房补做）
            </div>
          )}
          {submitErr && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-2">
              <div>{submitErr}</div>
              {submitIssues.length > 0 && (
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {submitIssues.map((iss, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-700 bg-white/70 border border-red-100 rounded px-2 py-1">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
                      <span className="min-w-0">
                        <strong>{iss.name}</strong>：{iss.note}
                        {iss.target && iss.target !== 'volume' && (
                          <span className="text-red-400 ml-1">（件 {iss.target.slice(0, 8)}…）</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => useAppStore.getState().setActiveMainMenu('quick-check')}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:text-sky-900 underline"
              >
                到「档案整理 → 快速检测」查看完整报告
              </button>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center gap-3 justify-end mt-5 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            title={mode === 'pick' && !pickPos ? '请先点选一个空格位' : undefined}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {mode === 'auto' ? '确认移交并自动上架' : mode === 'pick' ? '确认移交并上架' : '确认移交'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── 主组件 ──
const VolumeWorkspacePage: React.FC = () => {
  // ── Stores ──
  const records = useArchiveStore((s) => s.records);
  const setRecords = useArchiveStore((s) => s.setRecords);
  // 全量件视图（含已入卷件）：卷内件详情/类型判定的回退数据源（2026-08-19）
  const allRecords = useArchiveStore((s) => s.allRecords);
  const volumes = useVolumeStore((s) => s.volumes);
  const volumeItems = useVolumeStore((s) => s.volumeItems);
  const recommendations = useVolumeStore((s) => s.recommendations);
  const groupingNotice = useVolumeStore((s) => s.groupingNotice);
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

  // ── 待组卷池类别（2026-08-21 统一入池：抓取/推送/手动三路件全部入池，无核对闸门） ──
  // 列随类别筛选联动：四类元数据不同，账簿/报告/其他不再套凭证列。
  const poolCategory = useMemo((): 'KP' | 'ALL' | 'KB' | 'FB' | 'QT' => {
    const t = filters.archiveType;
    if (!t || t === '全部') return 'ALL';
    if (t.includes('账簿')) return 'KB';
    if (t.includes('报告') || t.includes('报表')) return 'FB';
    if (t.includes('其他')) return 'QT';
    return 'KP';
  }, [filters.archiveType]);

  // ★ 将 columnDef 转为 DataTableColumn（接入排序 + 列缩放 + table-fixed）
  //   凭证类列由 metadataDisplayStore 'voucher' 上下文驱动（元数据配置·页面设置可配）；
  //   全部/账簿/报告/其他用 poolColumns 固定默认列（2026-08-21 四类分列）
  const tableColumns = useMemo((): DataTableColumn<ArchiveRecord>[] => {
    const rawCols = poolCategory === 'KP'
      ? (metaStore.getVisibleIds('voucher').length === 0
          ? getVoucherDefaultColumns()
          : getVoucherColumns(metaStore.getVisibleIds('voucher')))
      : POOL_COLUMN_SETS[poolCategory];
    const sortableIds = poolCategory === 'KP'
      ? new Set(['DATE', 'AMOUNT', 'VOUCHER_NO'])
      : POOL_SORTABLE_IDS;
    return rawCols.map(col => {
      const px = col.width ? parseInt(col.width) : 0;
      return {
        id: col.metaId,
        header: col.label,
        cell: (r: ArchiveRecord) => col.accessor(r),
        sortValue: POOL_SORT_VALUES[col.metaId],
        sortable: sortableIds.has(col.metaId),
        align: col.align || 'left',
        size: px || 120,
        minSize: Math.max(40, (px || 120) - 30),
        maxSize: (px || 120) + 80,
      };
    });
  }, [poolCategory, metaStore.contexts['voucher']?.fields]);

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
  // 支持外部深链（快速检测页「查看案卷」→ setActiveVolume 后跳转，2026-08-25）
  const [activeVolumeId, setActiveVolumeId] = useState<string | null>(
    () => useVolumeStore.getState().activeVolume?.id ?? null,
  );
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [decomposeTarget, setDecomposeTarget] = useState<string | null>(null); // 拆卷确认目标
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  /** ★ 快速组件配对弹窗（2026-08：智能组卷左侧的放松式配对入口） */
  const [showQuickComponent, setShowQuickComponent] = useState(false);
  const [preselectedPrintVolumeId, setPreselectedPrintVolumeId] = useState<string | null>(null);
  const [detailRecord, setDetailRecord] = useState<ArchiveRecord | null>(null);
  /** 详情件所属卷的检测是否实际运行过（passed/failed 任一），未运行 → 徽标显示「未检测」（2026-08-20） */
  const [detailInspectionRan, setDetailInspectionRan] = useState(false);
  /** ★ 纯原始凭证确认：所选件全为原始凭证时，组卷/加入已有案卷需二次确认（2026-08-19） */
  const [pureSourceConfirm, setPureSourceConfirm] = useState<{ kind: 'create' } | { kind: 'add'; volumeId: string } | null>(null);

  // ── ★ 卷内件选择域（拆分/转卷/排序/移出；单域：跨卷勾选自动重置，2026-08-17） ──
  const [itemSel, setItemSel] = useState<{ volumeId: string; ids: Set<string> } | null>(null);
  // 弹窗目标：拆分（源卷）/ 转卷（源卷）/ 合并（目标卷）/ 移交上架（2026-08-20）
  const [splitTarget, setSplitTarget] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);

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

  // ── 四性检测（2026-08-25：统一在移交=推送至保管库时由服务端自动执行） ──
  // 工作台只读展示各卷最近一次检测结果（移交尝试后刷新）；手动检测入口在 快速检测 页
  const [volumeLastCheck, setVolumeLastCheck] = useState<Record<string, VolumeLastCheck>>({});

  const refreshLastChecks = useCallback(async () => {
    try {
      const reports = await fetchInspectionReports();
      const latest: Record<string, VolumeLastCheck> = {};
      for (const r of reports) { // reports 按时间倒序，首次命中即最新
        if (r.target_kind !== 'volume' || latest[r.target_node]) continue;
        const detail = parseReportDetail(r.detail_json);
        latest[r.target_node] = {
          allPass: !!(r.real && r.complete && r.usable && r.safe),
          real: !!r.real, complete: !!r.complete, usable: !!r.usable, safe: !!r.safe,
          checkedAt: r.created_at || '',
          issueCount: (detail.items || []).filter((it) => !it.pass).length,
        };
      }
      setVolumeLastCheck(latest);
    } catch {
      /* 检测历史不可读不影响工作台主流程 */
    }
  }, []);

  useEffect(() => {
    void refreshLastChecks();
  }, [refreshLastChecks]);

  // ★ 查看凭证详情（从未分配池或案卷卡片中点击）
  const handleViewDetail = useCallback((r: { id: string }) => {
    // ★ 2026-08-19 修复：卷内件不在待组卷池 records 里，必须回退全量件视图 allRecords，
    //   否则案卷卡片上的小眼睛永远查不到记录 → 详情打不开（静默失效）
    const full = records.find((rec) => rec.id === r.id)
      ?? allRecords.find((rec) => rec.id === r.id);
    if (!full) {
      showToast('未找到该件的详情数据', 'info');
      return;
    }
    // ★ 四性检测在卷级（移交时自动执行，2026-08-25）：件在卷内时，详情徽标继承所属案卷最近检测结果
    let volId: string | null = null;
    for (const [vid, items] of Object.entries(volumeItems)) {
      if (items.some((it) => it.recordId === full.id)) { volId = vid; break; }
    }
    const vc = volId ? volumeLastCheck[volId] : undefined;
    setDetailInspectionRan(!!vc);
    setDetailRecord(
      vc
        ? {
            ...full,
            checks: { real: vc.real, complete: vc.complete, usable: vc.usable, safe: vc.safe },
          }
        : full,
    );
  }, [records, allRecords, volumeItems, volumeLastCheck]);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── 计算未组卷记录 ──
  // 双重过滤：volumeItems 中的 + 已有 volumeId 的记录
  // （2026-08-21 统一入池：抓取/推送/手动三路件全部直接进待组卷池，不再有核对闸门）
  const unassignedRecords = useMemo(() => {
    const volumeRecordIds = new Set<string>();
    for (const items of Object.values(volumeItems)) {
      for (const item of items) {
        volumeRecordIds.add(item.recordId);
      }
    }
    return records.filter((r) => !volumeRecordIds.has(r.id) && !r.volumeId);
  }, [records, volumeItems]);

  /** 当前选中的凭证记录 */
  const selectedRecords = useMemo(
    () => records.filter((r) => selectedIds.has(r.id)),
    [records, selectedIds],
  );
  /** 所选是否全为原始凭证（无记账凭证主体，2026-08-19 组卷规则） */
  const pureSourceSelected = selectedRecords.length > 0 && selectedRecords.every(isSourceDocument);

  // ★ 快速组件弹窗数据源（2026-08）：
  //   左列 = 未组卷的记账凭证/主体件（配对目标）；右列 = 未组卷且未挂接的原始凭证（配对源）
  const quickVouchers = useMemo(
    () => unassignedRecords.filter((r) => !isSourceDocument(r)),
    [unassignedRecords],
  );
  const quickSources = useMemo(
    () => unassignedRecords.filter((r) => isSourceDocument(r) && !r.parentRecordId),
    [unassignedRecords],
  );

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
      const matchSelf = (r: ArchiveRecord) =>
        r.voucherNo.toLowerCase().includes(q) ||
        r.archiveCode.toLowerCase().includes(q) ||
        r.amount.toString().includes(q) ||
        (r.remarks || '').toLowerCase().includes(q) ||
        (r.summary || '').toLowerCase().includes(q) ||
        (r.subType || '').toLowerCase().includes(q);
      // ★ 单元化搜索（2026-08-20）：附件命中时其所属凭证单元也要显示
      result = result.filter((r) =>
        matchSelf(r) ||
        attachedSourceIds(unassignedRecords, r.id).some((sid) => {
          const s = unassignedRecords.find((x) => x.id === sid);
          return s ? matchSelf(s) : false;
        })
      );
    }
    // ★ 统一排序口径（2026-08-21）：制单日期 + 凭证号升序（会计实操装订顺序；
    //   散件与已成「件」的凭证同序排列，该顺序即智能组卷凭证类的选取顺序）
    result.sort(compareVoucherDateNo);
    return result;
  }, [unassignedRecords, filters, searchQuery]);

  // ★ 按件显示（2026-08-20）：已挂接且父件在池内的原始凭证不再平铺为独立行，
  //   收进所属凭证的「件」单元（凭证号列展开可见）；父件不在池的悬挂件仍单列，避免"消失"
  const unassignedIds = useMemo(() => new Set(unassignedRecords.map((r) => r.id)), [unassignedRecords]);
  const poolDisplayRecords = useMemo(
    () => filteredUnassigned.filter((r) => {
      if (!isSourceDocument(r) || !r.parentRecordId) return true;
      return !unassignedIds.has(r.parentRecordId);
    }),
    [filteredUnassigned, unassignedIds],
  );

  // ── 分页（按件口径：pageData = 单元行） ──
  const {
    pageData: pagedUnassigned,
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    setPage,
    setPageSize,
  } = usePagination(poolDisplayRecords, { defaultPageSize: 20 });

  // 筛选条件变化时重置到第1页
  useEffect(() => { setPage(1); }, [filters, searchQuery, setPage]);

  // 凭证号查表（归属徽标"附于 {凭证号}"用，2026-08-20）
  const voucherNoById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRecords) m.set(r.id, r.voucherNo);
    for (const r of records) m.set(r.id, r.voucherNo);
    return m;
  }, [allRecords, records]);

  /** 池列表凭证单元展开态（所附原始凭证查看，2026-08-20） */
  const [expandedPoolId, setExpandedPoolId] = useState<string | null>(null);

  // ★ 凭证号列包装（2026-08-20）：凭证号 + [单元展开钮] + 原始凭证归属徽标（附于/待挂接）
  //   2026-08-22 重排：展开钮移到凭证号【后】（尾随），去掉行首 18px 占位——
  //   凭证号文字与表头/其他列左对齐，不再整列后移空出一块。
  //   ⚠ 依赖 unassignedRecords，声明位置必须在其后（TDZ）
  const poolColumns = useMemo((): DataTableColumn<ArchiveRecord>[] => {
    return tableColumns.map((col) => {
      // ★ 附件列计数修复（2026-08-22）：列映射里的默认实现读历史遗留字段 sourceDocumentIds
      //   （DTO 从不下发 → 恒显 0/无）；真实附件数必须按组件挂接关系统计（原始凭证 parentRecordId → 本凭证）
      if (col.id === 'ATTACHMENTS') {
        return {
          ...col,
          cell: (r: ArchiveRecord) => {
            const n = isSourceDocument(r) ? 0 : attachedSourceIds(unassignedRecords, r.id).length;
            return n > 0
              ? <span className="text-amber-600 font-medium text-xs" title={`${n} 张所附原始凭证`}>{n} 份</span>
              : <span className="text-slate-400 text-xs">无</span>;
          },
        };
      }
      if (col.id !== 'VOUCHER_NO') return col;
      return {
        ...col,
        cell: (r: ArchiveRecord) => {
          const isSrc = isSourceDocument(r);
          const attCount = isSrc ? 0 : attachedSourceIds(unassignedRecords, r.id).length;
          const parentNo = isSrc && r.parentRecordId ? voucherNoById.get(r.parentRecordId) : undefined;
          return (
            <span className="flex items-center gap-1 min-w-0 w-full">
              <span className="truncate min-w-0">{col.cell?.(r)}</span>
              {attCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setExpandedPoolId((prev) => (prev === r.id ? null : r.id)); }}
                  className="ml-auto p-0.5 text-slate-400 hover:text-sky-600 rounded transition-colors shrink-0"
                  title={`展开查看 ${attCount} 张所附原始凭证`}
                >
                  {expandedPoolId === r.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}
              {isSrc && (r.parentRecordId ? (
                <span className="shrink-0 px-1 py-px text-[10px] rounded bg-sky-100 text-sky-700" title="所属记账凭证（随其整体组卷）">
                  附于 {parentNo || r.parentRecordId!.slice(0, 8)}
                </span>
              ) : (
                <span className="shrink-0 px-1 py-px text-[10px] rounded bg-amber-100 text-amber-700" title="未挂接：不会随任何凭证成单元；勾选 1 张记账凭证 + 本件后点【组件】">
                  待挂接
                </span>
              ))}
            </span>
          );
        },
      };
    });
  }, [tableColumns, voucherNoById, unassignedRecords, expandedPoolId]);

  // ★ 凭证号连续性检测结果
  const continuityCheck = useMemo(() => {
    const voucherNos = filteredUnassigned.map(r => r.voucherNo);
    return validateVoucherContinuity(voucherNos);
  }, [filteredUnassigned]);

  // 记录映射（供VolumeCard查找记录详情；parentRecordId 供「附于」徽标，2026-08-20）
  const recordMap = useMemo(() => {
    const map = new Map<string, { voucherNo: string; archiveType: string; amount: number; year: string; month: string; parentRecordId?: string }>();
    // ★ 卷内件不在池内 records，需并入全量件视图，否则卷内只显示档号不显示凭证号（2026-08-19）
    for (const r of allRecords) {
      map.set(r.id, { voucherNo: r.voucherNo, archiveType: r.archiveType, amount: r.amount, year: r.year, month: r.month, parentRecordId: r.parentRecordId });
    }
    for (const r of records) {
      map.set(r.id, { voucherNo: r.voucherNo, archiveType: r.archiveType, amount: r.amount, year: r.year, month: r.month, parentRecordId: r.parentRecordId });
    }
    return map;
  }, [records, allRecords]);

  /** recordId → ArchiveRecord 解析（全量件视图优先，池内兜底；单元闭合校验用，2026-08-20）
   *  ⚠ 声明位置须在 handleRemoveItem/handleToggleItemSelect 等使用点之前（TDZ） */
  const resolveRecById = useCallback(
    (rid: string): ArchiveRecord | undefined =>
      allRecords.find((r) => r.id === rid) ?? records.find((r) => r.id === rid),
    [allRecords, records],
  );

  // ── 事件处理 ──
  // ★ 单元化勾选（2026-08-20 先组件再组卷）：勾/取消凭证联动其已挂接原始凭证
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => toggleUnitSelection(unassignedRecords, prev, id));
  }, [unassignedRecords]);

  // ★ 全选：并集 + 单元扩展（不丢跨页/被过滤的既有选择）；传空数组 = 清空
  const handleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => (ids.length === 0 ? new Set() : selectPageWithUnits(unassignedRecords, ids, prev)));
  }, [unassignedRecords]);

  /** 目标卷（含卷内件）是否已有非原始凭证的主体件——经全量件视图解析卷内件类型（2026-08-19） */
  const volumeHasMainRecord = useCallback(
    (volumeId: string): boolean => {
      const items = volumeItems[volumeId] || [];
      if (items.length === 0) return false;
      const allById = new Map(useArchiveStore.getState().allRecords.map((r) => [r.id, r]));
      return items.some((it) => {
        const rec = allById.get(it.recordId);
        // 查不到记录时按"非原始凭证"放行——宁可不弹窗也不误拦
        return rec ? !isSourceDocument(rec) : true;
      });
    },
    [volumeItems]
  );

  /** ★ 凭证卷守卫（2026-08-19）：移出/拆分/转卷后，源卷不得只剩原始凭证——
   *  《会计基础工作规范》：凭证卷以记账凭证为主体，原始凭证是其附件。
   *  移空不受限（服务端自动销毁空卷）；仅凭证卷（KP）适用，账簿/报告卷天然无此约束。 */
  const wouldLeaveOrphanSources = useCallback(
    (volumeId: string, leavingIds: Set<string>): boolean => {
      const vol = volumes.find((v) => v.id === volumeId);
      if (!vol || toCategoryCode(vol.archiveTypeCode, vol.archiveType) !== 'KP') return false;
      const items = volumeItems[volumeId] || [];
      const remaining = items.filter((it) => !leavingIds.has(it.recordId));
      if (remaining.length === 0) return false;
      const allById = new Map(allRecords.map((r) => [r.id, r]));
      return remaining.every((it) => {
        const rec = allById.get(it.recordId) ?? records.find((r) => r.id === it.recordId);
        return rec ? isSourceDocument(rec) : false; // 查不到按主体件放行，不误拦
      });
    },
    [volumes, volumeItems, allRecords, records]
  );

  const ORPHAN_GUARD_MSG = '移出后该卷将只剩原始凭证：凭证卷至少要保留一张记账凭证作为主体。如需整卷清空，请使用【拆卷】。';

  // ── ★ 组件/解挂（2026-08-20 先组件再组卷：原始凭证挂接到记账凭证形成「件」单元） ──
  const linkableSelection = useMemo(
    () => resolveLinkableSelection(unassignedRecords, selectedIds),
    [unassignedRecords, selectedIds],
  );
  const unlinkableSelection = useMemo(
    () => resolveUnlinkableSelection(unassignedRecords, selectedIds),
    [unassignedRecords, selectedIds],
  );

  const handleLinkSelection = useCallback(async () => {
    if (!linkableSelection) return;
    const voucherNo = records.find((r) => r.id === linkableSelection.voucherId)?.voucherNo || '记账凭证';
    try {
      for (const sid of linkableSelection.sourceIds) {
        await linkRecordParent(sid, linkableSelection.voucherId);
      }
      setSelectedIds(new Set());
      useArchiveStore.getState().loadRecords();
      void useArchiveStore.getState().loadAllRecords();
      showToast(`已组件：${linkableSelection.sourceIds.length} 张原始凭证挂接到「${voucherNo}」`);
    } catch (e: any) {
      showToast(e.message || '组件失败', 'info');
    }
  }, [linkableSelection, records]);

  const handleUnlinkSelection = useCallback(async () => {
    if (!unlinkableSelection) return;
    try {
      for (const sid of unlinkableSelection) {
        await linkRecordParent(sid, null);
      }
      setSelectedIds(new Set());
      useArchiveStore.getState().loadRecords();
      void useArchiveStore.getState().loadAllRecords();
      showToast(`已解挂 ${unlinkableSelection.length} 张原始凭证`);
    } catch (e: any) {
      showToast(e.message || '解挂失败', 'info');
    }
  }, [unlinkableSelection]);

  // ★ 快速组件确认（2026-08-22 凭证优先重设计：把弹窗内临时配对批量落库 +
  //   await 刷新列表——弹窗确认后保持打开可继续配，关闭后工作台呈现的
  //   一定是已组好件的状态；反馈由弹窗内闪光承接，不再在此 toast）
  const handleQuickComponentConfirm = useCallback(
    async (pairs: Map<string, string>) => {
      const actions = collectPairActions(pairs);
      for (const action of actions) {
        for (const sid of action.sourceIds) {
          await linkRecordParent(sid, action.voucherId);
        }
      }
      // 清空当前选择 + 刷新（先组件再组卷，列表立刻呈现已挂接的「件」单元）
      setSelectedIds(new Set());
      await useArchiveStore.getState().loadRecords();
      void useArchiveStore.getState().loadAllRecords();
    },
    [],
  );

  const doAddToVolume = useCallback(
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

  // ★ 加入已有案卷：纯原始凭证且目标卷内也没有记账凭证时，先弹确认（2026-08-19）
  const handleAddToVolume = useCallback(
    async (volumeId: string) => {
      if (selectedIds.size === 0) return;
      if (pureSourceSelected && !volumeHasMainRecord(volumeId)) {
        setPureSourceConfirm({ kind: 'add', volumeId });
        return;
      }
      await doAddToVolume(volumeId);
    },
    [selectedIds, pureSourceSelected, volumeHasMainRecord, doAddToVolume]
  );

  // ★ 主操作：勾选凭证 → 直接组卷（创建案卷 + 加入凭证，一步完成）
  const doCreateAndAdd = useCallback(async () => {
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

  // ★ 纯原始凭证拦截（2026-08-19）：所选全为原始凭证时先弹确认框——按《会计基础
  //   工作规范》原始凭证应随所属记账凭证组卷，仅确需单独装订成册时才放行
  const handleCreateAndAdd = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (pureSourceSelected) {
      setPureSourceConfirm({ kind: 'create' });
      return;
    }
    await doCreateAndAdd();
  }, [selectedIds, pureSourceSelected, doCreateAndAdd]);

  /** 确认框「仍要组卷/仍要加入」：按确认来源执行原动作 */
  const handlePureSourceConfirm = useCallback(async () => {
    const action = pureSourceConfirm;
    setPureSourceConfirm(null);
    if (!action) return;
    if (action.kind === 'create') await doCreateAndAdd();
    else await doAddToVolume(action.volumeId);
  }, [pureSourceConfirm, doCreateAndAdd, doAddToVolume]);

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
          // ★ 单元闭合（2026-08-20）：凭证有同卷附件时不允许单独移出；原始凭证须随父件整体移出
          const rec = resolveRecById(recordId);
          if (rec && !isSourceDocument(rec)) {
            const attachedInVol = items.filter((it) => {
              const rr = resolveRecById(it.recordId);
              return rr && isSourceDocument(rr) && rr.parentRecordId === recordId;
            });
            if (attachedInVol.length > 0) {
              showToast(`该凭证还有 ${attachedInVol.length} 张原始凭证附件在本卷——请勾选凭证（自动带上附件）后批量移出，保持「件」单元完整`, 'info');
              return;
            }
          }
          if (rec && isSourceDocument(rec) && rec.parentRecordId && items.some((it) => it.recordId === rec.parentRecordId)) {
            showToast('原始凭证须随所属记账凭证整体移出（勾选其父凭证会自动带上本件）', 'info');
            return;
          }
          // ★ 凭证卷守卫（2026-08-19）：移出后不得只剩原始凭证
          if (wouldLeaveOrphanSources(vid, new Set([recordId]))) {
            showToast(ORPHAN_GUARD_MSG, 'info');
            return;
          }
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
    [volumeItems, removeItemFromVolume, wouldLeaveOrphanSources, resolveRecById]
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
      const base = (!prev || prev.volumeId !== volumeId)
        ? { volumeId, ids: new Set<string>() }
        : { volumeId, ids: new Set(prev.ids) };
      const adding = !base.ids.has(recordId);
      if (adding) base.ids.add(recordId); else base.ids.delete(recordId);
      // ★ 单元闭合（2026-08-20）：勾/取消凭证时，同卷内其已挂接原始凭证联动
      const rec = resolveRecById(recordId);
      if (rec && !isSourceDocument(rec)) {
        for (const it of volumeItems[volumeId] || []) {
          if (it.recordId === recordId) continue;
          const rr = resolveRecById(it.recordId);
          if (rr && isSourceDocument(rr) && rr.parentRecordId === recordId) {
            if (adding) base.ids.add(it.recordId); else base.ids.delete(it.recordId);
          }
        }
      }
      return base.ids.size === 0 ? null : { volumeId, ids: base.ids };
    });
  }, [volumeItems, resolveRecById]);

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
      // ★ 凭证卷守卫（2026-08-19）：批量移出后不得只剩原始凭证
      if (wouldLeaveOrphanSources(volumeId, new Set(recordIds))) {
        showToast(ORPHAN_GUARD_MSG, 'info');
        return;
      }
      // ★ 单元闭合（2026-08-20）：原始凭证须随所属记账凭证整体移出
      const removeViolation = findUnitSplitViolation(
        (volumeItems[volumeId] || []).map((it) => it.recordId), new Set(recordIds), resolveRecById);
      if (removeViolation) {
        showToast(removeViolation, 'info');
        return;
      }
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
    [removeItemFromVolume, wouldLeaveOrphanSources, volumeItems, resolveRecById]
  );

  // ── ★ 拆分为新案卷（选中件 → 新卷，继承源卷属性） ──
  const handleSplitSubmit = useCallback(
    async (title: string) => {
      if (!itemSel) return;
      const { volumeId, ids } = itemSel;
      // ★ 凭证卷守卫（2026-08-19）：拆分后源卷不得只剩原始凭证（弹窗保持打开，可调整勾选）
      if (wouldLeaveOrphanSources(volumeId, ids)) {
        showToast(ORPHAN_GUARD_MSG, 'info');
        return;
      }
      // ★ 单元闭合（2026-08-20）：原始凭证须随所属记账凭证整体拆分
      const splitViolation = findUnitSplitViolation(
        (volumeItems[volumeId] || []).map((it) => it.recordId), ids, resolveRecById);
      if (splitViolation) {
        showToast(splitViolation, 'info');
        return;
      }
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
    [itemSel, splitVolume, wouldLeaveOrphanSources, volumeItems, resolveRecById]
  );

  // ── ★ 转卷（选中件移入其他草稿卷，不回收集池） ──
  const handleMoveSubmit = useCallback(
    async (targetVolumeId: string) => {
      if (!itemSel) return;
      const { volumeId, ids } = itemSel;
      // ★ 凭证卷守卫（2026-08-19）：转卷后源卷不得只剩原始凭证（弹窗保持打开，可调整勾选）
      if (wouldLeaveOrphanSources(volumeId, ids)) {
        showToast(ORPHAN_GUARD_MSG, 'info');
        return;
      }
      // ★ 单元闭合（2026-08-20）：原始凭证须随所属记账凭证整体转卷
      const moveViolation = findUnitSplitViolation(
        (volumeItems[volumeId] || []).map((it) => it.recordId), ids, resolveRecById);
      if (moveViolation) {
        showToast(moveViolation, 'info');
        return;
      }
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
    [itemSel, moveItemsToVolume, volumes, wouldLeaveOrphanSources, volumeItems, resolveRecById]
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
    // ★ 按实际生成结果给文案（2026-08-19：纯原始凭证池不再产生推荐，原因由面板提示条承载）
    const n = useVolumeStore.getState().recommendations.length;
    showToast(
      n > 0 ? `已生成 ${n} 组推荐` : unassignedRecords.length > 0 ? '未发现可组卷的记账凭证' : '暂无待组卷条目',
      'info',
    );
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

  // ── 移交至档案保管（弹窗选择上架方式，2026-08-20） ──
  const handleTransfer = useCallback((volumeId: string) => {
    setTransferTarget(volumeId);
  }, []);

  /** 移交弹窗「确认移交」：服务端先自动四性检测（移交=法定检测节点），通过后移交归盒，再按选择上架。
   *  四性未通过 → INSPECTION_FAILED 携带问题明细抛回弹窗内联展示（弹窗保持打开）；
   *  移交失败 → 异常抛回弹窗内联展示（弹窗保持打开，可重试）；
   *  上架失败 → 不回滚移交，提示盒已入「待上架区」可补上架（兜底闭环）。 */
  const handleTransferSubmit = useCallback(async (choice: { mode: ShelveMode; position?: ShelfPosition }) => {
    const volumeId = transferTarget;
    if (!volumeId) return;
    const volumeStore = useVolumeStore.getState();
    const volume = volumeStore.volumes.find((v) => v.id === volumeId);
    // ★ 类别名按归一化后的大类代码查表（数字代码 01 需先映射为 KP）
    const categoryCode = toCategoryCode(volume?.archiveTypeCode || '', volume?.archiveType);
    const typeName = ARCHIVE_TYPE_CATEGORY_NAMES[categoryCode] || '';
    // 第一步：移交归盒（服务端在归盒前自动执行四性检测，未通过即阻断）
    try {
      await volumeStore.transferVolume(volumeId);
    } catch (e: any) {
      void refreshLastChecks(); // 无论成败，检测都已产生报告 → 刷新卷卡检测状态
      if (e?.code === 'INSPECTION_FAILED') {
        // 拉取本报告的问题明细，随异常抛给弹窗内联展示
        try {
          const reports = await fetchInspectionReports(volumeId);
          const latest = reports[0];
          if (latest) {
            const detail = parseReportDetail(latest.detail_json);
            e.issues = (detail.items || []).filter((it) => !it.pass);
          }
        } catch { /* 明细不可读时仅显示错误文案 */ }
      }
      throw e;
    }
    void refreshLastChecks();
    useArchiveStore.getState().loadRecords();
    void useArchiveStore.getState().loadAllRecords(); // 同步刷新全量件视图（2026-08-16 贯通修复）
    const transferred = useVolumeStore.getState().volumes.find((v) => v.id === volumeId);
    const boxId = transferred?.boxId || '';
    const boxNo = transferred?.boxNo || '';
    // 第二步：按选择上架（仅当有盒且非「仅移交」时）
    if (boxId && choice.mode !== 'none') {
      try {
        if (choice.mode === 'auto') {
          const shelved = await shelveBoxAutoApi(boxId);
          showToast(`已移交并上架：${boxNo || '档案盒'} → ${shelved.location || '已自动分配架位'}`);
        } else if (choice.mode === 'pick' && choice.position) {
          const p = choice.position;
          await shelveBoxApi(boxId, p);
          showToast(`已移交并上架：${boxNo || '档案盒'} → ${locationText(p.room, p.rack, p.column, p.layer, p.cell)}`);
        }
        // 刷新盒镜像，实体档案库房页数据保持新鲜
        const fonds = volume?.fondsCode || filters.fondsCode;
        if (fonds) void useArchiveBoxStore.getState().loadBoxes(fonds);
      } catch (e: any) {
        setTransferTarget(null);
        showToast(
          `已移交归盒${boxNo ? `（${boxNo}）` : ''}，但上架失败：${e?.message || '未知原因'}。`
          + '盒已进入待上架区，可在 档案保管 → 实体档案库房 补上架',
          'info',
        );
        return;
      }
    } else {
      showToast(`已移交 1 卷（${typeName}）至档案保管${boxNo ? ` · ${boxNo}` : ''}`);
    }
    setTransferTarget(null);
  }, [transferTarget, filters.fondsCode, refreshLastChecks]);

  // ── 打开目录打印弹窗 ──
  const handleOpenPrint = useCallback((volumeId: string) => {
    setPreselectedPrintVolumeId(volumeId);
    setShowPrintModal(true);
  }, []);

  // ── 元数据录入（2026-08-25）：卷/件元数据录入弹窗；保存后刷新卷内件与件域镜像 ──
  const [metadataVolumeId, setMetadataVolumeId] = useState<string | null>(null);

  const handleMetadataSaved = useCallback(async () => {
    const vid = metadataVolumeId;
    if (vid) {
      try { await useVolumeStore.getState().loadVolumeItems(vid); } catch { /* 忽略 */ }
    }
    void useArchiveStore.getState().loadRecords();
    void useArchiveStore.getState().loadAllRecords();
  }, [metadataVolumeId]);

  // ── 删除未组卷记录（v2.6 起逻辑删除：移入回收站，可恢复；已删件不再出现于列表） ──
  // 删除确认（2026-08-22 重做）：站内 ConfirmModal 替代 window.confirm（原生弹窗与整站风格不符），
  // 单个/批量统一只询问一次；凭证的已挂接原始凭证随凭证一并入站
  // （「原始凭证随所属记账凭证」铁律在删除侧的体现，恢复时整件还原）。
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; attachCount: number } | null>(null);

  /** 待删 id 集的单元闭包：凭证自动带上其已挂接原始凭证（单元化勾选通常已含，此处兜底） */
  const closeUnitIds = useCallback((ids: string[]): { all: string[]; attachCount: number } => {
    const set = new Set(ids);
    for (const id of ids) {
      const r = records.find((x) => x.id === id);
      if (r && !isSourceDocument(r)) {
        for (const sid of attachedSourceIds(records, id)) set.add(sid);
      }
    }
    const attachCount = [...set].filter((id) => {
      const r = records.find((x) => x.id === id);
      return !!r && isSourceDocument(r) && !!r.parentRecordId;
    }).length;
    return { all: [...set], attachCount };
  }, [records]);

  // ── 批量删除未组卷记录（工具栏；单元闭包后一次确认） ──
  // （行内单删按钮已于 2026-08-22 移除：删除统一走勾选 + 工具栏「删除」）
  const handleBatchDelete = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const { all, attachCount } = closeUnitIds(ids);
    setDeleteConfirm({ ids: all, attachCount });
  }, [closeUnitIds]);

  /** 确认后执行删除（逐件独立成败，失败件保留并提示） */
  const executeDelete = useCallback(async (ids: string[]) => {
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
    const okIds = ids.filter((id) => !failedIds.has(id));
    setRecords(useArchiveStore.getState().records.filter((r) => !okIds.includes(r.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      okIds.forEach((id) => next.delete(id));
      return next;
    });
    if (failedIds.size === 0) {
      showToast(ids.length === 1 ? '已移入回收站' : `已移入回收站 ${ids.length} 条记录`);
    } else {
      showToast(`已移入 ${okIds.length} 条，${failedIds.size} 条失败（${firstErr}）`, 'info');
    }
  }, [setRecords]);

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
        onQuickComponent={() => setShowQuickComponent(true)}
        onUploadMaterial={() => {
          // 若无选中案卷，自动选中第一个草稿案卷
          if (!activeVolumeId) {
            const draft = volumes.find((v) => v.status === 'draft');
            if (draft) setActiveVolumeId(draft.id);
          }
          setShowUploadModal(true);
        }}
      />

      {/* ★ 凭证号连续性状态条（会计实操：组卷核心依据；仅凭证类/混合视图显示，
          账簿/报告/其他无凭证号连续概念，2026-08-21 四类分列配套） */}
      {(poolCategory === 'KP' || poolCategory === 'ALL') && filteredUnassigned.length > 0 && (
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
          <UnassignedPool
            records={pagedUnassigned}
            allPoolRecords={unassignedRecords}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={poolCategory === 'KP' ? '搜索凭证号/摘要/金额…'
              : poolCategory === 'KB' ? '搜索账簿名称/子类型/摘要…'
              : poolCategory === 'FB' ? '搜索报告名称/摘要…'
              : poolCategory === 'QT' ? '搜索资料名称/子类型/摘要…'
              : '搜索凭证号/名称/摘要/金额…'}
            onAddToVolume={handleAddToVolume}
            onBatchDelete={handleBatchDelete}
            volumes={draftVolumes}
            onCreateAndAdd={handleCreateAndAdd}
            attachmentCountMap={attachmentCountMap}
            onViewDetail={handleViewDetail}
            tableColumns={poolColumns}
            linkableCount={linkableSelection?.sourceIds.length ?? 0}
            unlinkableCount={unlinkableSelection?.length ?? 0}
            onLinkSelection={() => void handleLinkSelection()}
            onUnlinkSelection={() => void handleUnlinkSelection()}
            expandedId={expandedPoolId}
          />

          {/* 智能推荐（在条目池下方） */}
          <RecommendPanel
            recommendations={recommendations}
            notice={groupingNotice}
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
              // ★ 中途终止本次智能组卷：清空推荐结果与提示，不创建任何案卷
              useVolumeStore.getState().setRecommendations([]);
              useVolumeStore.getState().setGroupingNotice(null);
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
                    onTransfer={handleTransfer}
                    onPrint={handleOpenPrint}
                    onUpdateTitle={(volId, title) => {
                      updateVolume(volId, { title });
                      showToast(`案卷名称已更新: ${title}`);
                    }}
                    onDecompose={handleDecompose}
                    onUnconfirm={handleUnconfirm}
                    onInsertAtPosition={handleInsertAtPosition}
                    onMetadataEntry={(id) => setMetadataVolumeId(id)}
                    lastCheck={volumeLastCheck[v.id] || null}
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
                    onTransfer={handleTransfer}
                    onPrint={handleOpenPrint}
                    onUpdateTitle={(volId, title) => {
                      updateVolume(volId, { title });
                      showToast(`案卷名称已更新: ${title}`);
                    }}
                    onDecompose={() => {}}
                    onUnconfirm={handleUnconfirm}
                    onInsertAtPosition={() => {}}
                    onMetadataEntry={() => {}}
                    lastCheck={volumeLastCheck[v.id] || null}
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

      {/* ★ 快速组件配对弹窗（2026-08：智能组卷左侧的放松式配对入口） */}
      <QuickComponentModal
        open={showQuickComponent}
        vouchers={quickVouchers}
        sources={quickSources}
        onClose={() => setShowQuickComponent(false)}
        onConfirm={handleQuickComponentConfirm}
      />

      {/* 凭证归档上传弹窗 */}
      <VoucherUploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        targetVolumeId={activeVolumeId || undefined}
      />

      {/* 删除确认弹窗（替代 window.confirm；单个/批量统一只问一次） */}
      <ConfirmModal
        open={!!deleteConfirm}
        danger
        title="移入回收站"
        message={deleteConfirm && (
          <>
            <p>
              将把 <b className="text-slate-800">{deleteConfirm.ids.length}</b> 条记录移入回收站，
              数据与文件完整保留，可随时在「回收站」恢复。
            </p>
            {deleteConfirm.attachCount > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-700 text-[13px]">
                其中含 {deleteConfirm.attachCount} 张随凭证挂接的原始凭证，将随凭证一并移入（恢复时整件还原）。
              </p>
            )}
          </>
        )}
        confirmLabel="移入回收站"
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => {
          const ids = deleteConfirm?.ids;
          setDeleteConfirm(null);
          if (ids?.length) void executeDelete(ids);
        }}
      />

      {/* 卷内目录打印弹窗 */}
      <VolumePrintModal
        open={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        preselectedVolumeId={preselectedPrintVolumeId}
      />

      {/* ★ 元数据录入弹窗（2026-08-25：卷级+件级元数据录入/修正） */}
      <MetadataEntryModal
        open={!!metadataVolumeId}
        volume={volumes.find((v) => v.id === metadataVolumeId) || null}
        items={metadataVolumeId ? (volumeItems[metadataVolumeId] || []) : []}
        onClose={() => setMetadataVolumeId(null)}
        onSaved={() => void handleMetadataSaved()}
      />

      {/* ★ 纯原始凭证组卷确认（2026-08-19：组件＝1张记账凭证+N个原始凭证附件，
          原始凭证一般应随记账凭证组卷；确需单独装订成册时经确认放行） */}
      {pureSourceConfirm && (
        <OpModal
          title={pureSourceConfirm.kind === 'create' ? '仅含原始凭证，确认组卷？' : '目标案卷缺少记账凭证'}
          subtitle="原始凭证组卷规则"
          icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
          iconBg="bg-amber-100"
          onClose={() => setPureSourceConfirm(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setPureSourceConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handlePureSourceConfirm()}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-xl hover:bg-amber-700 transition-colors shadow-sm"
              >
                {pureSourceConfirm.kind === 'create' ? '仍要组卷' : '仍要加入'}
              </button>
            </>
          }
        >
          <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5 leading-relaxed">
            <p>· 所选 {selectedIds.size} 件均为原始凭证{pureSourceConfirm.kind === 'add' ? '，且目标案卷内也没有记账凭证' : ''}，缺少记账凭证作为主体。</p>
          </div>
        </OpModal>
      )}

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
              inspectionRan={detailInspectionRan}
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

      {/* ★ 移交至档案保管弹窗（可选同时上架，联通实体库房密集架，2026-08-20） */}
      {transferTarget && (() => {
        const vol = volumes.find((v) => v.id === transferTarget);
        if (!vol) return null;
        return (
          <TransferVolumeModal
            volume={vol}
            itemCount={(volumeItems[transferTarget] || []).length}
            fondsCode={vol.fondsCode || filters.fondsCode}
            onCancel={() => setTransferTarget(null)}
            onSubmit={handleTransferSubmit}
          />
        );
      })()}
    </>
  );
};

export default VolumeWorkspacePage;



