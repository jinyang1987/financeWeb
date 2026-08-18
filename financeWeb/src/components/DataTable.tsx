/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * DataTable — TanStack Table + shadcn/ui 通用表格组件
 *
 * 遵循 shadcn/ui 官方 Table 模式：
 *   https://ui.shadcn.com/docs/components/table
 *
 * 能力：
 *   - 列头点击排序（asc → desc → 取消）
 *   - 列拖拽缩放（columnResizeMode: onChange）
 *   - 多选复选框（受控 selectedIds + onSelectionChange）
 *   - 自定义列渲染（cell 函数）
 *   - 行点击回调
 *   - 前置列插槽（如展开按钮）
 *   - 展开行（expandedRowId + renderExpandedRow）
 *   - 操作列插槽
 *   - 空状态
 *   - hover / 选中态
 *   - table-fixed 精确列宽
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  type RowSelectionState,
  type ColumnDef as TanColumnDef,
  flexRender,
} from '@tanstack/react-table';
import {
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

// ── 列定义（业务层使用） ──

export interface DataTableColumn<TData> {
  id: string;
  header: string;
  cell?: (record: TData) => React.ReactNode;
  /** 排序用的原始值（不返回 JSX），TanStack 按此值排序 */
  sortValue?: (record: TData) => string | number;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  size?: number;
  minSize?: number;
  maxSize?: number;
}

// ── 组件 Props ──

export interface DataTableProps<TData extends { id: string }> {
  data: TData[];
  columns: DataTableColumn<TData>[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onRowClick?: (record: TData) => void;
  onToggleAll?: () => void;
  renderExtraColumn?: (record: TData) => React.ReactNode;
  expandedRowId?: string | null;
  renderExpandedRow?: (record: TData) => React.ReactNode;
  renderActions?: (record: TData) => React.ReactNode;
  actionsWidth?: number;
  emptyLabel?: string;
  selectedClassName?: string;
  rowClassName?: string;
  disableResize?: boolean;
}

// ── 排序图标 ──

function SortIcon({ sorted }: { sorted: 'asc' | 'desc' | false }) {
  if (sorted === 'asc') return <ArrowUp className="w-3.5 h-3.5 text-sky-500" />;
  if (sorted === 'desc') return <ArrowDown className="w-3.5 h-3.5 text-sky-500" />;
  return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />;
}

// ── 对齐映射 ──

const alignClass: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const headerJustify: Record<string, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

const DEFAULT_SIZE = 150;
const CHECKBOX_SIZE = 40;
const EXTRA_COL_SIZE = 36;

// ── 组件 ──

export function DataTable<TData extends { id: string }>({
  data,
  columns,
  selectedIds,
  onSelectionChange,
  onRowClick,
  onToggleAll,
  renderExtraColumn,
  expandedRowId,
  renderExpandedRow,
  renderActions,
  actionsWidth = 100,
  emptyLabel = '暂无数据',
  selectedClassName = 'bg-sky-50',
  rowClassName,
  disableResize = false,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  // ★ 用 ref 稳定回调引用，避免 tanColumns useMemo 被触发重建
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onToggleAllRef = useRef(onToggleAll);
  onToggleAllRef.current = onToggleAll;
  const renderActionsRef = useRef(renderActions);
  renderActionsRef.current = renderActions;
  const renderExtraRef = useRef(renderExtraColumn);
  renderExtraRef.current = renderExtraColumn;

  // ★ 构建 TanStack 列定义（stable：只依赖 columns 和 disableResize）
  const tanColumns = useMemo<TanColumnDef<TData, unknown>[]>(() => {
    const cols: TanColumnDef<TData, unknown>[] = [];

    // 复选框列 — 通过 row.getIsSelected() 取值，不依赖 selectedIds
    cols.push({
      id: '_select',
      header: () => (
        <input
          type="checkbox"
          checked={data.length > 0 && selectedIds.size === data.length}
          onChange={() => onToggleAllRef.current?.()}
          className="rounded accent-sky-600 cursor-pointer"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={() => row.toggleSelected()}
          className="rounded accent-sky-600 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableResizing: false,
      size: CHECKBOX_SIZE,
      minSize: CHECKBOX_SIZE,
      maxSize: CHECKBOX_SIZE,
    });

    // 前置列插槽
    if (renderExtraColumn) {
      cols.push({
        id: '_extra',
        header: () => null,
        cell: ({ row }) => renderExtraRef.current?.(row.original),
        enableSorting: false,
        enableResizing: false,
        size: EXTRA_COL_SIZE,
        minSize: EXTRA_COL_SIZE,
        maxSize: EXTRA_COL_SIZE,
      });
    }

    // 业务列
    for (const col of columns) {
      cols.push({
        id: col.id,
        accessorFn: col.sortValue ? (row) => col.sortValue?.(row as TData) : undefined,
        header: ({ column }) => (
          <div className={`flex items-center gap-1 ${headerJustify[col.align || 'left']}`}>
            <button
              type="button"
              onClick={col.sortable ? () => column.toggleSorting(column.getIsSorted() === 'asc') : undefined}
              className={`inline-flex items-center gap-1 truncate ${
                col.sortable ? 'cursor-pointer hover:text-foreground select-none' : ''
              }`}
            >
              {col.header}
              {col.sortable && <SortIcon sorted={column.getIsSorted() as 'asc' | 'desc' | false} />}
            </button>
          </div>
        ),
        cell: ({ row }) => col.cell?.(row.original),
        enableSorting: col.sortable ?? false,
        enableResizing: !disableResize,
        size: col.size || DEFAULT_SIZE,
        minSize: col.minSize ?? 40,
        maxSize: col.maxSize ?? 600,
        meta: { align: col.align || 'left' },
      });
    }

    // 操作列
    if (renderActions) {
      cols.push({
        id: '_actions',
        header: () => null,
        cell: ({ row }) => renderActionsRef.current?.(row.original),
        enableSorting: false,
        enableResizing: false,
        size: actionsWidth,
        minSize: actionsWidth,
        maxSize: actionsWidth * 2,
      });
    }

    return cols;
    // ★ 只依赖 columns 结构，不依赖 selectedIds / callbacks（已走 ref）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, disableResize, actionsWidth]);

  // 行选择状态
  const rowSelection = useMemo<RowSelectionState>(() => {
    const sel: RowSelectionState = {};
    for (const id of selectedIds) {
      sel[id] = true;
    }
    return sel;
  }, [selectedIds]);

  const table = useReactTable({
    data,
    columns: tanColumns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: (updater) => {
      // TanStack 的 updater 可能是函数或直接值，统一处理
      const nextState = typeof updater === 'function' ? updater(rowSelection) : updater;
      const next = new Set<string>();
      for (const [id, checked] of Object.entries(nextState)) {
        if (checked) next.add(id);
      }
      onSelectionChangeRef.current(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: true,
    columnResizeMode: 'onChange',
  });

  return (
    <div className="w-full">
      <table className="w-full caption-bottom text-sm table-fixed">
        {/* sticky 表头需实色底（滚动时不透出行），灰带样式由 ui/table 原语统一 */}
        <TableHeader className="sticky top-0 z-10 bg-slate-100">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canResize = header.column.getCanResize();
                return (
                  <TableHead
                    key={header.id}
                    className={`relative ${alignClass[(header.column.columnDef.meta as any)?.align || 'left']}`}
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {canResize && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none bg-transparent hover:bg-sky-300 transition-colors group/resize"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-0.5 bg-slate-200 group-hover/resize:bg-sky-400 rounded-full opacity-0 group-hover/resize:opacity-100 transition-opacity" />
                      </div>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={tanColumns.length} className="h-32 text-center text-muted-foreground">
                <p className="font-medium">{emptyLabel}</p>
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => {
              const isSelected = row.getIsSelected();
              const isExpanded = expandedRowId === row.original.id;
              return (
                <React.Fragment key={row.id}>
                  <TableRow
                    onClick={() => onRowClick?.(row.original)}
                    className={`${onRowClick ? 'cursor-pointer' : ''} ${isSelected ? selectedClassName : ''} ${isExpanded ? 'bg-muted/30' : ''} ${rowClassName || ''}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={alignClass[(cell.column.columnDef.meta as any)?.align || 'left']}
                        style={{ width: cell.column.getSize() }}
                        onClick={
                          cell.column.id === '_select' || cell.column.id === '_actions' || cell.column.id === '_extra'
                            ? (e) => e.stopPropagation()
                            : undefined
                        }
                      >
                        <div className="truncate min-w-0">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                  {isExpanded && renderExpandedRow && (
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={tanColumns.length} className="p-0">
                        {renderExpandedRow(row.original)}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })
          )}
        </TableBody>
      </table>
    </div>
  );
}

