/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * RecycleBinPage — 回收站（v2.6）
 *
 * 组卷工作台删除的记录不再物理删除，而是「逻辑删除」：置 finance:deleted 标记后
 * 移入 /{全宗}/_回收站/，数据与元数据完整保留。本页提供：
 *   1. 回收站件列表（按删除时间倒序）
 *   2. 恢复（移回收集池 + 清除删除标记，可重新组卷/检索）
 *   3. 彻底删除（不可恢复，物理删除，需二次确认）
 *
 * 权限：与组卷工作台一致，需 voucher-manager 功能码（后端校验）。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Trash2, RotateCcw, AlertTriangle, Search, RefreshCw, FolderOpen,
} from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import {
  fetchRecycleItems, restoreRecycleItem, purgeRecycleItem,
  type RecordDto,
} from '../../services/recordService';
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

  const [items, setItems] = useState<RecycleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(EMPTY_SEL);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<Set<string> | null>(null); // 二次确认集

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

  // ── 恢复 ──
  const handleRestore = useCallback(async (ids: string[]) => {
    const failedIds: string[] = [];
    let firstErr = '';
    for (const id of ids) {
      try {
        await restoreRecycleItem(id);
      } catch (e: any) {
        failedIds.push(id);
        if (!firstErr) firstErr = e?.message || '恢复失败';
      }
    }
    if (failedIds.length === 0) {
      showToast(`已恢复 ${ids.length} 条记录到待组卷池`);
    } else {
      showToast(`已恢复 ${ids.length - failedIds.length} 条，${failedIds.length} 条失败（${firstErr}）`, 'info');
    }
    setSelectedIds(new Set());
    void load();
  }, [load, showToast]);

  // ── 彻底删除（二次确认后物理删除，不可恢复） ──
  const handlePurge = useCallback(async (ids: string[]) => {
    const failedIds: string[] = [];
    let firstErr = '';
    for (const id of ids) {
      try {
        await purgeRecycleItem(id);
      } catch (e: any) {
        failedIds.push(id);
        if (!firstErr) firstErr = e?.message || '删除失败';
      }
    }
    if (failedIds.length === 0) {
      showToast(`已彻底删除 ${ids.length} 条记录`);
    } else {
      showToast(`已删除 ${ids.length - failedIds.length} 条，${failedIds.length} 条失败（${firstErr}）`, 'info');
    }
    setSelectedIds(new Set());
    setConfirmPurge(null);
    void load();
  }, [load, showToast]);

  // ── 列定义 ──
  const columns = useMemo<DataTableColumn<RecycleRow>[]>(() => [
    {
      id: 'voucherNo', header: '凭证字号', cell: (r) => r.voucherNo,
      sortValue: (r) => r.voucherNo, sortable: true, size: 130, minSize: 90,
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
        <span className="block max-w-[260px] truncate" title={r.name}>{r.name}</span>
      ),
      sortValue: (r) => r.name, sortable: true, size: 260, minSize: 120,
    },
    { id: 'deletedAt', header: '删除时间', cell: (r) => r.deletedAt, size: 140, minSize: 110 },
    { id: 'deletedBy', header: '删除人', cell: (r) => r.deletedBy, size: 100, minSize: 80 },
  ], []);

  const selectedCount = selectedIds.size;
  const allSelected = items.length > 0 && selectedCount === items.length;

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((r) => r.id)));
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* ── 顶栏 ── */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-800">回收站</h2>
          <span className="ml-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            全宗 {currentFanzongCode} · {items.length} 条
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
          <button
            onClick={() => { setConfirmPurge(new Set(selectedIds)); }}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-1 rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> 彻底删除{selectedCount > 0 ? `（${selectedCount}）` : ''}
          </button>
        </div>
      </div>

      {/* ── 二次确认条 ── */}
      {confirmPurge && confirmPurge.size > 0 && (
        <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-5 py-2.5">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            确认彻底删除 {confirmPurge.size} 条记录？<b>此操作不可恢复</b>，将永久清除数据与文件。
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePurge([...confirmPurge])}
              className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
            >
              确认彻底删除
            </button>
            <button
              onClick={() => setConfirmPurge(null)}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* ── 数据表格 ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">加载中…</div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            <FolderOpen className="h-10 w-10 opacity-40" />
            <p className="text-sm">回收站为空。组卷工作台删除的记录会暂存于此，可恢复或彻底删除。</p>
          </div>
        ) : (
          <DataTable<RecycleRow>
            data={items}
            columns={columns}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onToggleAll={toggleAll}
            emptyLabel="回收站暂无记录"
            renderActions={(r) => (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); handleRestore([r.id]); }}
                  title="恢复到待组卷池"
                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmPurge(new Set([r.id])); }}
                  title="彻底删除（不可恢复）"
                  className="rounded p-1 text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
            actionsWidth={90}
          />
        )}
      </div>

      {/* ── 提示 / Toast ── */}
      {items.length > 0 && (
        <div className="flex items-center gap-1.5 border-t border-slate-200 px-5 py-2 text-xs text-slate-400">
          <Search className="h-3.5 w-3.5" />
          提示：恢复后记录回到「组卷工作台」待组卷池，可重新挂接/组卷；彻底删除后无法找回。
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
