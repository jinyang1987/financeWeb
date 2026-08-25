/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ArchiveBoxTreeView — 财务分类视图「盒→件」两级浏览（2026-07-18 重构）
 *
 * L1：案卷盒列表（进入分类仅展示盒，无全局平铺列表）
 * L2：点开盒 → 盒内卷件列表（面包屑可返回盒列表）
 *
 * 数据由 useBoxViewData 装配：页内筛选（季度/月份/子类型/报表期间等）
 * 已作用于件级，盒的件数统计与是否展示均以筛选后件数为准。
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Box, FileText, MapPin,
  Shield, Undo2, AlertTriangle,
  ChevronLeft, FolderOpen, Lock,
} from 'lucide-react';
import { useVolumeStore } from '../stores/volumeStore';
import { useMetadataDisplayStore } from '../stores/metadataDisplayStore';
import { BOX_STATUS_LABELS } from '../types/archiveBox';
import { DataTable, type DataTableColumn } from './DataTable';
import {
  getAllFieldIds,
  getDefaultVisibleIds,
} from '../config/metadataContexts';
import { getArchiveItemColumns, getArchiveItemDefaultColumns } from '../config/metadataColumnMaps/archiveItemColumns';
import type { ArchiveBox } from '../types/archiveBox';
import type { ArchiveRecord } from '../types';
import type { BoxViewEntry } from '../hooks/useBoxViewData';

// ── 档案类型配置 ──
const ARCHIVE_TYPE_CONFIG: Record<string, { label: string }> = {
  KP: { label: '会计凭证' },
  KB: { label: '会计账簿' },
  FB: { label: '财务报表' },
  QT: { label: '其他会计资料' },
};

interface ArchiveBoxTreeViewProps {
  /** useBoxViewData 装配结果（类型/年度/页内筛选均已应用） */
  entries: BoxViewEntry[];
  /** 当前聚焦盒（L2），null = L1 盒列表 */
  focusedBoxId: string | null;
  onFocusBox: (boxId: string | null) => void;
  onItemClick: (record: ArchiveRecord) => void;
  archiveTypeCode?: string;
}

/** 盒状态徽标颜色 */
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-sky-50 text-sky-700 border-sky-200',
  sealed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  stored: 'bg-slate-100 text-slate-600 border-slate-200',
  destroyed: 'bg-red-50 text-red-700 border-red-200',
};

/** 密级徽标颜色 */
const SECURITY_COLORS: Record<string, string> = {
  普通: 'bg-slate-50 text-slate-500 border-slate-200',
  内部: 'bg-sky-50 text-sky-600 border-sky-200',
  秘密: 'bg-amber-50 text-amber-700 border-amber-200',
  机密: 'bg-red-50 text-red-700 border-red-200',
};

/** 格式化金额 */
const formatAmount = (n: number) =>
  `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

export const ArchiveBoxTreeView: React.FC<ArchiveBoxTreeViewProps> = ({
  entries, focusedBoxId, onFocusBox, onItemClick, archiveTypeCode,
}) => {
  const volumes = useVolumeStore((s) => s.volumes);
  const returnVolumes = useVolumeStore((s) => s.returnVolumes);

  // ── 本地状态 ──
  const [selectedBoxIds, setSelectedBoxIds] = useState<Set<string>>(new Set());
  /** 盒内件勾选（2026-08-25 修复：原为 new Set()+空回调，复选框点了没反应） */
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  /** 单卷退回目标（盒内件列表行级入口，2026-08-19） */
  const [returnVolumeId, setReturnVolumeId] = useState<string | null>(null);
  /** 轻量提示（退回成败反馈——此前盒级退回静默无反馈） */
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── 当前聚焦盒 ──
  const focusedEntry = useMemo(
    () => entries.find((e) => e.box.id === focusedBoxId) || null,
    [entries, focusedBoxId],
  );

  // 切换/离开盒时清空件勾选（避免跨盒残留）
  React.useEffect(() => {
    setSelectedItemIds(new Set());
  }, [focusedBoxId]);

  // ── 盒的 DataTable 列定义 ──
  const boxColumns = useMemo((): DataTableColumn<BoxViewEntry>[] => [
    {
      id: 'boxNo', header: '盒号',
      cell: (e) => <span className="font-mono font-semibold text-slate-800 text-xs">{e.box.boxNo}</span>,
      sortValue: (e) => e.box.boxNo, sortable: true, size: 150,
    },
    {
      id: 'boxName', header: '盒名称',
      cell: (e) => <span className="text-xs text-slate-600 truncate block max-w-[220px]">{e.box.boxName}</span>,
      sortValue: (e) => e.box.boxName, sortable: true, size: 220,
    },
    {
      id: 'year', header: '年度',
      cell: (e) => <span className="text-xs text-slate-500">{e.box.year}年</span>,
      sortValue: (e) => e.box.year, sortable: true, size: 70,
    },
    {
      id: 'retention', header: '保管期限',
      cell: (e) => <span className="text-xs text-slate-600">{e.box.retention}</span>,
      size: 96,
    },
    {
      id: 'volumeCount', header: '卷数',
      cell: (e) => <span className="text-xs font-mono text-slate-700">{e.volumes.length}</span>,
      sortValue: (e) => e.volumes.length, sortable: true, size: 60, align: 'right',
    },
    {
      id: 'itemCount', header: '件数',
      cell: (e) => <span className="text-xs font-mono font-semibold text-sky-700">{e.matchedItems.length}</span>,
      sortValue: (e) => e.matchedItems.length, sortable: true, size: 60, align: 'right',
    },
    {
      id: 'location', header: '存放位置',
      cell: (e) => (
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="w-3 h-3 shrink-0" />
          {e.box.location || '未设置'}
        </span>
      ),
      size: 130,
    },
    {
      id: 'security', header: '密级',
      cell: (e) => {
        const level = e.box.securityLevel || '普通';
        return (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${SECURITY_COLORS[level] || SECURITY_COLORS['普通']}`}>
            {level}
          </span>
        );
      },
      size: 70,
    },
    {
      id: 'status', header: '状态',
      cell: (e) => (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${STATUS_COLORS[e.box.status]}`}>
          {BOX_STATUS_LABELS[e.box.status]}
        </span>
      ),
      size: 80,
    },
    {
      id: 'createdDate', header: '创建日期',
      cell: (e) => <span className="text-xs text-slate-500">{e.box.createdDate}</span>,
      sortValue: (e) => e.box.createdDate, sortable: true, size: 100,
    },
  ], []);

  // ── 件表格列（从 archive-item 上下文配置读取） ──
  const metaStore = useMetadataDisplayStore();
  const archiveItemFieldIds = useMemo(() => getAllFieldIds('archive-item'), []);
  const archiveItemDefaultIds = useMemo(() => getDefaultVisibleIds('archive-item'), []);

  React.useEffect(() => {
    metaStore.initContext('archive-item', archiveItemFieldIds, archiveItemDefaultIds);
  }, [metaStore.initContext, archiveItemFieldIds, archiveItemDefaultIds]);

  const itemColumns = useMemo((): DataTableColumn<ArchiveRecord>[] => {
    const visibleIds = metaStore.getVisibleIds('archive-item');
    const rawCols = visibleIds.length === 0 ? getArchiveItemDefaultColumns() : getArchiveItemColumns(visibleIds);
    const SORTABLE_IDS = new Set(['DATE', 'AMOUNT', 'VOUCHER_NO']);
    const SORT_VALUES: Record<string, (r: ArchiveRecord) => string | number> = {
      DATE: (r) => `${r.year}-${r.month}`,
      AMOUNT: (r) => r.amount,
      VOUCHER_NO: (r) => r.voucherNo,
    };
    const dynamicCols = rawCols.map(col => {
      const px = col.width ? parseInt(col.width) : 0;
      return {
        id: col.metaId,
        header: col.label,
        cell: (r: ArchiveRecord) => col.accessor(r),
        sortValue: SORT_VALUES[col.metaId],
        sortable: SORTABLE_IDS.has(col.metaId),
        align: col.align || 'left' as const,
        size: px || 120,
        minSize: Math.max(40, (px || 120) - 30),
        maxSize: (px || 120) + 80,
      };
    });
    // 前置「所属案卷」列：盒内视角下标明件的归属卷
    // （装盒必然已组卷：后端 by-volume 读取已带 volumeId/volumeCode，2026-08-25 修复空白）
    const volumeCol: DataTableColumn<ArchiveRecord> = {
      id: 'volumeTitle', header: '所属案卷', size: 220,
      cell: (r) => {
        const vol = volumes.find((v) => v.id === r.volumeId);
        const name = vol?.title && vol.title !== '未命名案卷' && vol.title !== '新案卷'
          ? vol.title
          : (r.volumeCode || vol?.volumeCode || '');
        const full = [name, r.volumeCode && name !== r.volumeCode ? r.volumeCode : ''].filter(Boolean).join(' · ');
        return (
          <span className="text-[11px] text-slate-500 truncate block max-w-[210px]" title={full || undefined}>
            {name || '—'}
          </span>
        );
      },
    };
    return [volumeCol, ...dynamicCols];
  }, [metaStore.contexts['archive-item']?.fields, volumes]);

  // ── 勾选/取消盒 ──
  const toggleBoxSelect = useCallback((boxId: string) => {
    setSelectedBoxIds((prev) => {
      const next = new Set(prev);
      if (next.has(boxId)) next.delete(boxId);
      else next.add(boxId);
      return next;
    });
  }, []);

  // ── 退回选中的盒 ──
  const handleReturnSelected = useCallback(async () => {
    const boxesToReturn = Array.from(selectedBoxIds);
    const volumeIdsToReturn = volumes
      .filter((v) => boxesToReturn.includes(v.boxId || '') && v.status === 'transferred')
      .map((v) => v.id);

    if (volumeIdsToReturn.length === 0) return;

    try {
      await returnVolumes(volumeIdsToReturn);
      setSelectedBoxIds(new Set());
      onFocusBox(null);
      setShowReturnConfirm(false);
      showToast(`已退回 ${volumeIdsToReturn.length} 卷至组卷工作台`);
    } catch (e: any) {
      console.error('退回失败:', e);
      setShowReturnConfirm(false);
      showToast(e?.message || '退回失败', 'info');
    }
  }, [selectedBoxIds, volumes, returnVolumes, onFocusBox]);

  // ── 单卷退回组卷工作台（盒内件列表行级入口，2026-08-19：档案保管侧可直接打回拆卷/调整） ──
  const handleReturnVolume = useCallback(async () => {
    if (!returnVolumeId) return;
    const vol = volumes.find((v) => v.id === returnVolumeId);
    try {
      await returnVolumes([returnVolumeId]);
      setReturnVolumeId(null);
      showToast(`案卷「${vol?.title || vol?.volumeCode || '未命名'}」已退回组卷工作台`);
    } catch (e: any) {
      setReturnVolumeId(null);
      showToast(e?.message || '退回失败', 'info');
    }
  }, [returnVolumeId, volumes, returnVolumes]);

  const focusedTotalAmount = useMemo(
    () => (focusedEntry?.matchedItems || []).reduce((sum, r) => sum + r.amount, 0),
    [focusedEntry],
  );

  const focusedBox: ArchiveBox | null = focusedEntry?.box || null;

  return (
    <>
    <div className="flex flex-col flex-1 gap-3 min-h-0">
      {/* ════════ L1：案卷盒列表 ════════ */}
      {!focusedBoxId && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col min-h-0 flex-1">
          {/* 工具栏 */}
          <div className="bg-slate-50 border-b border-slate-100 p-3 flex items-center justify-between shrink-0 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-bold text-slate-700">
                {archiveTypeCode
                  ? `${ARCHIVE_TYPE_CONFIG[archiveTypeCode]?.label || ''} · 案卷盒`
                  : '全部案卷盒'}
              </span>
              <span className="text-[10px] text-slate-400">
                ({entries.length} 盒)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedBoxIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setShowReturnConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  退回至组卷工作台 ({selectedBoxIds.size} 盒)
                </button>
              )}
            </div>
          </div>

          {/* 盒表格 */}
          <div className="flex-1 overflow-auto min-h-0 p-1">
            <DataTable
              data={entries}
              columns={boxColumns}
              selectedIds={selectedBoxIds}
              onSelectionChange={(ids) => setSelectedBoxIds(ids)}
              onRowClick={(e) => onFocusBox(e.box.id)}
              emptyLabel="暂无符合条件的案卷盒 — 调整筛选条件，或在组卷工作台完成组卷并移交"
            />
          </div>
        </div>
      )}

      {/* ════════ L2：盒内卷件列表 ════════ */}
      {focusedBoxId && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col min-h-0 flex-1">
          {/* 顶栏 */}
          <div className="bg-slate-50 border-b border-slate-100 p-3 flex items-center justify-between shrink-0 rounded-t-2xl">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => onFocusBox(null)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-sky-600 hover:text-sky-800 hover:bg-sky-50 rounded-lg font-medium transition-colors shrink-0"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                返回盒列表
              </button>
              <span className="text-slate-300 mx-1">|</span>
              <FolderOpen className="w-4 h-4 text-sky-500 shrink-0" />
              <span className="text-sm font-bold text-slate-700 font-mono shrink-0">
                {focusedBox?.boxNo || ''}
              </span>
              <span className="text-xs text-slate-500 truncate">
                {focusedBox?.boxName || ''}
              </span>
              <span className="text-[10px] text-slate-400 shrink-0">
                ({focusedEntry?.volumes.length || 0} 卷 · {focusedEntry?.matchedItems.length || 0} 件 · {formatAmount(focusedTotalAmount)})
              </span>
              {selectedItemIds.size > 0 && (
                <span className="text-[10px] font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5 shrink-0">
                  已选 {selectedItemIds.size} 件
                </span>
              )}
            </div>

            {/* 盒关键元数据标签 */}
            {focusedBox && (
              <div className="flex items-center gap-3 text-[10px] text-slate-500 shrink-0">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{focusedBox.location || '未设置'}
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />{focusedBox.retention}
                </span>
                {focusedBox.securityLevel && focusedBox.securityLevel !== '普通' && (
                  <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border font-medium ${SECURITY_COLORS[focusedBox.securityLevel] || ''}`}>
                    <Lock className="w-3 h-3" />{focusedBox.securityLevel}
                  </span>
                )}
                <span className={`px-1.5 py-0.5 rounded-full border font-medium ${STATUS_COLORS[focusedBox.status]}`}>
                  {BOX_STATUS_LABELS[focusedBox.status]}
                </span>
              </div>
            )}
          </div>

          {/* 件表格 */}
          <div className="flex-1 overflow-auto min-h-0 p-1">
            <DataTable
              key={focusedBoxId || 'box-items'}
              data={focusedEntry?.matchedItems || []}
              columns={itemColumns}
              selectedIds={selectedItemIds}
              onSelectionChange={setSelectedItemIds}
              onToggleAll={() => {
                const ids = (focusedEntry?.matchedItems || []).map((r) => r.id);
                setSelectedItemIds((prev) =>
                  prev.size >= ids.length ? new Set() : new Set(ids));
              }}
              onRowClick={(r) => onItemClick(r)}
              renderActions={(r) => {
                // ★ 行级操作：查看详情 + 退回组卷（仅已移交卷可退回，2026-08-19）
                const vol = volumes.find((v) => v.id === r.volumeId);
                const canReturn = vol?.status === 'transferred';
                return (
                  <span className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onItemClick(r); }}
                      className="p-1 text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-md transition-colors"
                      title="查看档案详情"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                    {canReturn && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setReturnVolumeId(vol.id); }}
                        className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                        title="退回组卷工作台（案卷恢复草稿，可拆卷/调整）"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                );
              }}
              actionsWidth={76}
              emptyLabel="此盒内暂无符合筛选条件的档案"
            />
          </div>
        </div>
      )}
    </div>

      {/* ★ 退回确认弹窗 */}
      {showReturnConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowReturnConfirm(false)}>
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">确认退回</h3>
                <p className="text-xs text-slate-500 mt-0.5">此操作将案卷退回至组卷工作台</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              选中的 <strong>{selectedBoxIds.size}</strong> 个档案盒内的全部已移交案卷将退回至组卷工作台，
              案卷状态恢复为"草稿"，可重新整理后再次"移交至档案保管"。
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowReturnConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleReturnSelected}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition-colors shadow-sm"
              >
                <Undo2 className="w-4 h-4" />
                确认退回
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ★ 单卷退回确认弹窗（盒内件列表行级入口，2026-08-19） */}
      {returnVolumeId && (() => {
        const vol = volumes.find((v) => v.id === returnVolumeId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setReturnVolumeId(null)}>
            <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
            <div
              className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Undo2 className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">退回组卷工作台</h3>
                  <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[260px]">{vol?.title || vol?.volumeCode || '未命名案卷'}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                该案卷将从本盒移出、状态恢复为"草稿"，可在组卷工作台进行拆卷/拆件/调整后重新移交。
              </p>
              <div className="flex items-center gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setReturnVolumeId(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleReturnVolume}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition-colors shadow-sm"
                >
                  <Undo2 className="w-4 h-4" />
                  确认退回
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 轻量提示 */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[70] px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-slate-700 text-white'}`}>
          {toast.message}
        </div>
      )}
    </>
  );
};

