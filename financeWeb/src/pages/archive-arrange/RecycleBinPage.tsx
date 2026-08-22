/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * RecycleBinPage — 回收站（v2.6.2）
 *
 * 组卷工作台删除的记录不再物理删除，而是「逻辑删除」：置 finance:deleted 标记后
 * 移入 /{全宗}/_回收站/，数据与元数据完整保留。本页提供：
 *   1. 回收站件列表（按删除时间倒序）
 *   2. 恢复（移回收集池 + 清除删除标记 + 刷新件域镜像，可重新组卷/检索）
 *
 * v2.6.2（2026-08-22）单元化：
 *   - 按「件」展示：凭证行可展开其所附原始凭证；原始凭证行带「附于 xx」徽标——
 *     与组卷工作台的单元视图一致，删除前组好的件在回收站里不再散开；
 *   - 恢复按件整体进行：凭证连同回收站内已挂接的原始凭证一并还原。
 *
 * 本页不提供「彻底删除」：物理销毁属档案鉴定业务，须走「档案利用 → 鉴定销毁」
 * 流程审批办理（2026-08-21 v2.6.1 移除彻底删除入口）。
 *
 * 权限：与组卷工作台一致，需 voucher-manager 功能码（后端校验）。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RotateCcw, Search, RefreshCw, FolderOpen, ChevronDown, ChevronRight, Paperclip,
} from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import {
  fetchRecycleItems, restoreRecycleItem,
  type RecordDto,
} from '../../services/recordService';
import { isSourceDocument } from '../../utils/recordType';
import { DataTable, type DataTableColumn } from '../../components/DataTable';

// ── 展示辅助 ──
const ARCHIVE_TYPE_COLORS: Record<string, string> = {
  记账凭证: 'bg-blue-50 text-blue-700 border-blue-200',
  会计账簿: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  财务报告: 'bg-amber-50 text-amber-700 border-amber-200',
  其他会计资料: 'bg-slate-50 text-slate-600 border-slate-200',
};

/** 删除时间：后端 OffsetDateTime 字符串 → 本地展示（yyyy-MM-dd HH:mm） */
const formatDeletedAt = (s?: string) => {
  if (!s) return '—';
  try {
    return s.replace('T', ' ').slice(0, 16);
  } catch {
    return s;
  }
};

/** 回收站条目视图（DTO 派生，与后端 toView 对齐的展示字段） */
interface RecycleRow {
  id: string;
  name: string;
  voucherNo: string;
  archiveType: string;
  voucherCategory: string;
  parentRecordId: string;
  department: string;
  year: string;
  month: string;
  retention: string;
  deletedAt: string;
  deletedBy: string;
}

const EMPTY_SEL: Set<string> = new Set();

const RecycleBinPage: React.FC = () => {
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);
  // 「附于」徽标的凭证号解析源（所属凭证可能已被先恢复回池/入卷，需并集兜底）
  const poolRecords = useArchiveStore((s) => s.records);
  const allRecords = useArchiveStore((s) => s.allRecords);

  const [items, setItems] = useState<RecycleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(EMPTY_SEL);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  /** 凭证行的附件展开态（单元视图，与组卷工作台一致） */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  // ── 加载回收站列表 ──
  const load = useCallback(async () => {
    if (!currentFanzongCode) return;
    setLoading(true);
    try {
      const list = await fetchRecycleItems(currentFanzongCode);
      const rows: RecycleRow[] = list.map((d: RecordDto) => ({
        id: d.nodeId,
        name: d.name,
        voucherNo: d.voucherNo || '—',
        archiveType: d.archiveType || '—',
        voucherCategory: d.voucherCategory || '',
        parentRecordId: d.parentRecordId || '',
        department: d.department || '—',
        year: d.year != null ? String(d.year) : '—',
        month: d.month != null ? String(d.month).padStart(2, '0') : '—',
        retention: d.retention || '—',
        deletedAt: formatDeletedAt(d.deletedAt),
        deletedBy: d.deletedBy || '—',
      }));
      setItems(rows);
    } catch (e: any) {
      showToast(e?.message || '回收站加载失败', 'info');
    } finally {
      setLoading(false);
    }
  }, [currentFanzongCode, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── 单元视图辅助（2026-08-22：删除前组好的件在回收站不散开） ──

  /** 回收站内某凭证的已挂接原始凭证（附件展开行与整体恢复的依据） */
  const attachmentsOf = useCallback(
    (voucherId: string) => items.filter((r) => isSourceDocument(r) && r.parentRecordId === voucherId),
    [items],
  );

  /** 凭证号解析表：全量件 ∪ 池件 ∪ 回收站件（所属凭证可能已被先恢复/入卷，需并集兜底） */
  const voucherNoById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRecords) m.set(r.id, r.voucherNo);
    for (const r of poolRecords) m.set(r.id, r.voucherNo);
    for (const r of items) m.set(r.id, r.voucherNo);
    return m;
  }, [items, poolRecords, allRecords]);

  /**
   * 顶层行（按件聚合，2026-08-22）：随凭证一并删除的原始凭证不占独立行，
   * 收进所属凭证行的展开区；只有「所属凭证不在回收站」的散件原始凭证才单列。
   * 即：删除一个件（1 凭证 + N 原始凭证）= 回收站里一行。
   */
  const displayRows = useMemo(() => {
    const inBin = new Set(items.map((r) => r.id));
    return items.filter((r) => !(isSourceDocument(r) && r.parentRecordId && inBin.has(r.parentRecordId)));
  }, [items]);

  // ── 恢复（按件整体：凭证连同回收站内已挂接原始凭证一并还原） ──
  const handleRestore = useCallback(async (ids: string[]) => {
    // 单元闭包：凭证自动带上回收站内的附件
    const idSet = new Set(ids);
    for (const id of ids) for (const a of attachmentsOf(id)) idSet.add(a.id);
    const all = [...idSet];
    const failedIds: string[] = [];
    let firstErr = '';
    for (const id of all) {
      try {
        await restoreRecycleItem(id);
      } catch (e: any) {
        failedIds.push(id);
        if (!firstErr) firstErr = e?.message || '恢复失败';
      }
    }
    if (failedIds.length === 0) {
      showToast(`已恢复 ${all.length} 条记录到待组卷池`);
    } else {
      showToast(`已恢复 ${all.length - failedIds.length} 条，${failedIds.length} 条失败（${firstErr}）`, 'info');
    }
    setSelectedIds(new Set());
    setExpandedId(null);
    void load();
    // 恢复成功 → 刷新件域镜像：组卷工作台与读侧页面无需手动刷新即可见（v2.6.1 修复"恢复后工作台不见件"）
    if (failedIds.length < all.length) {
      void useArchiveStore.getState().loadRecords();
      void useArchiveStore.getState().loadAllRecords();
    }
  }, [load, showToast, attachmentsOf]);

  // ── 列定义 ──
  const columns = useMemo<DataTableColumn<RecycleRow>[]>(() => [
    {
      id: 'voucherNo', header: '凭证字号',
      sortValue: (r) => r.voucherNo, sortable: true, size: 210, minSize: 130,
      // 单元化：凭证行尾随附件展开钮（列右缘对齐，不占行首）；原始凭证行带「附于」徽标
      cell: (r) => {
        const src = isSourceDocument(r);
        const atts = src ? [] : attachmentsOf(r.id);
        const parentNo = src && r.parentRecordId ? voucherNoById.get(r.parentRecordId) : undefined;
        return (
          <span className="flex items-center gap-1 min-w-0 w-full">
            <span className="truncate min-w-0" title={r.voucherNo}>{r.voucherNo}</span>
            {atts.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpandedId((prev) => (prev === r.id ? null : r.id)); }}
                className="ml-auto p-0.5 text-slate-400 hover:text-sky-600 rounded transition-colors shrink-0"
                title={`展开查看 ${atts.length} 张所附原始凭证（随本凭证一并恢复）`}
              >
                {expandedId === r.id
                  ? <ChevronDown className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            )}
            {src && (r.parentRecordId ? (
              <span
                className="shrink-0 px-1 py-px text-[10px] rounded bg-sky-100 text-sky-700"
                title="所属记账凭证（不在本页回收站内——或已先恢复/入卷）"
              >
                附于 {parentNo || r.parentRecordId.slice(0, 8)}
              </span>
            ) : (
              <span
                className="shrink-0 px-1 py-px text-[10px] rounded bg-amber-100 text-amber-700"
                title="未挂接的原始凭证"
              >
                待挂接
              </span>
            ))}
          </span>
        );
      },
    },
    {
      id: 'archiveType', header: '档案类别',
      cell: (r) => (
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${ARCHIVE_TYPE_COLORS[r.archiveType] || 'border-slate-200 text-slate-600 bg-slate-50'}`}>
          {r.archiveType}
        </span>
      ),
      sortValue: (r) => r.archiveType, sortable: true, size: 120, minSize: 90,
    },
    { id: 'department', header: '部门', cell: (r) => r.department, size: 100, minSize: 80 },
    {
      id: 'year', header: '年度', cell: (r) => r.year,
      sortValue: (r) => r.year, sortable: true, size: 80, minSize: 60,
    },
    { id: 'month', header: '月份', cell: (r) => r.month, size: 70, minSize: 55 },
    { id: 'retention', header: '保管期限', cell: (r) => r.retention, size: 90, minSize: 70 },
    {
      id: 'name', header: '文件名', cell: (r) => (
        <span className="block max-w-[200px] truncate" title={r.name}>{r.name}</span>
      ),
      sortValue: (r) => r.name, sortable: true, size: 200, minSize: 120,
    },
    { id: 'deletedAt', header: '删除时间', cell: (r) => r.deletedAt, size: 140, minSize: 110 },
    { id: 'deletedBy', header: '删除人', cell: (r) => r.deletedBy, size: 100, minSize: 80 },
  ], [attachmentsOf, expandedId, voucherNoById]);

  const selectedCount = selectedIds.size;
  const allSelected = displayRows.length > 0 && displayRows.every((r) => selectedIds.has(r.id));

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(displayRows.map((r) => r.id)));
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* ── 顶栏 ── */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-800">回收站</h2>
          <span className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            全宗 {currentFanzongCode} · {displayRows.length} 件
            {items.length !== displayRows.length && `（共 ${items.length} 条记录）`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> 刷新
          </button>
          <button
            onClick={() => handleRestore([...selectedIds])}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" /> 恢复{selectedCount > 0 ? `（${selectedCount}）` : ''}
          </button>
        </div>
      </div>

      {/* ── 数据表格 ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">加载中…</div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <FolderOpen className="h-10 w-10 opacity-40" />
            <p className="text-sm">回收站为空。组卷工作台删除的记录会暂存于此，可随时恢复回待组卷池。</p>
          </div>
        ) : (
          <DataTable<RecycleRow>
            data={displayRows}
            columns={columns}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onToggleAll={toggleAll}
            emptyLabel="回收站暂无记录"
            expandedRowId={expandedId}
            renderExpandedRow={(r) => {
              const atts = attachmentsOf(r.id);
              return (
                <div className="px-4 py-2 bg-sky-50/60 border-l-2 border-sky-300 space-y-1">
                  <div className="text-[11px] font-medium text-sky-700">
                    所附原始凭证（{atts.length} 张，恢复本凭证时一并还原回待组卷池）
                  </div>
                  {atts.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 text-xs text-slate-600 py-0.5">
                      <Paperclip className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="font-mono font-medium text-slate-700">{a.voucherNo}</span>
                      <span className="truncate max-w-[240px]" title={a.name}>{a.name}</span>
                      <span className="text-slate-400 shrink-0">删于 {a.deletedAt}</span>
                    </div>
                  ))}
                </div>
              );
            }}
            renderActions={(r) => {
              const attCount = isSourceDocument(r) ? 0 : attachmentsOf(r.id).length;
              return (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRestore([r.id]); }}
                    title={attCount > 0 ? `恢复（含 ${attCount} 张所附原始凭证）` : '恢复到待组卷池'}
                    className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              );
            }}
            actionsWidth={60}
          />
        )}
      </div>

      {/* ── 提示 / Toast ── */}
      {items.length > 0 && (
        <div className="flex items-center gap-1.5 border-t border-slate-200 px-5 py-2 text-xs text-slate-400">
          <Search className="h-3.5 w-3.5" />
          提示：恢复按件整体进行——凭证连同其所附原始凭证一并还原回「组卷工作台」待组卷池。回收站不提供彻底删除，到期档案的物理销毁须走「档案利用 → 鉴定销毁」流程审批办理。
        </div>
      )}
      {toast && (
        <div className={`pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded px-4 py-2 text-sm text-white shadow-lg ${
          toast.type === 'success' ? 'bg-slate-800' : 'bg-amber-600'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default RecycleBinPage;
