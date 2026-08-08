/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * boxColumns — 档案盒上下文列映射（B1-B12，对齐 finance:archiveBox 模型 + DA/T 42）
 *
 * accessor 以 ArchiveBox 为数据源（非 ArchiveRecord）。供盒管理、
 * 财务分类视图盒列表等按 metadataDisplayStore 的可见字段动态取列。
 */

import React from 'react';
import type { ArchiveBox, BoxStatus } from '../../types/archiveBox';
import { BOX_STATUS_LABELS } from '../../types/archiveBox';

export interface ColumnDef {
  metaId: string;
  label: string;
  accessor: (box: ArchiveBox) => React.ReactNode;
  width?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

// ── 盒状态徽章 ──
const BOX_STATUS_CLS: Record<BoxStatus, string> = {
  active:    'bg-sky-50 text-sky-700 border-sky-200',
  sealed:    'bg-amber-50 text-amber-700 border-amber-200',
  stored:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  destroyed: 'bg-rose-50 text-rose-700 border-rose-200',
};

const StatusBadge: React.FC<{ status: BoxStatus }> = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${BOX_STATUS_CLS[status] || BOX_STATUS_CLS.active}`}>
    {BOX_STATUS_LABELS[status] || status}
  </span>
);

// ── B1-B12 列定义 ──
export const BOX_COLUMN_MAP: Record<string, ColumnDef> = {
  B1: {
    metaId: 'B1', label: '盒号', width: '160px', align: 'left', sortable: true,
    accessor: (b) => <span className="font-mono font-bold text-slate-800 text-xs tracking-tight">{b.boxNo}</span>,
  },
  B2: {
    metaId: 'B2', label: '盒名称', width: '220px', align: 'left',
    accessor: (b) => <span className="text-slate-700 text-sm font-medium">{b.boxName}</span>,
  },
  B3: {
    metaId: 'B3', label: '类别代码', width: '90px', align: 'center',
    accessor: (b) => <span className="font-mono text-xs text-slate-600">{b.archiveTypeCode}</span>,
  },
  B4: {
    metaId: 'B4', label: '会计年度', width: '90px', align: 'center', sortable: true,
    accessor: (b) => <span className="text-slate-700 text-sm font-medium">{b.year}</span>,
  },
  B5: {
    metaId: 'B5', label: '保管期限', width: '90px', align: 'center', sortable: true,
    accessor: (b) => <span className="text-slate-600 text-xs">{b.retention || '—'}</span>,
  },
  B6: {
    metaId: 'B6', label: '盒状态', width: '90px', align: 'center', sortable: true,
    accessor: (b) => <StatusBadge status={b.status} />,
  },
  B7: {
    metaId: 'B7', label: '密级', width: '80px', align: 'center',
    accessor: (b) => b.securityLevel
      ? <span className="text-xs text-amber-700 font-medium">{b.securityLevel}</span>
      : <span className="text-slate-300 text-xs">普通</span>,
  },
  B8: {
    metaId: 'B8', label: '存放位置', width: '140px', align: 'left',
    accessor: (b) => <span className="text-xs text-slate-600">{b.location || '—'}</span>,
  },
  B9: {
    metaId: 'B9', label: '盒内卷数', width: '80px', align: 'right', sortable: true,
    accessor: (b) => <span className="font-mono text-sm text-slate-700">{b.volumeCount}</span>,
  },
  B10: {
    metaId: 'B10', label: '盒内件数', width: '80px', align: 'right',
    accessor: (b) => <span className="font-mono text-xs text-slate-500">{b.totalItems ?? '—'}</span>,
  },
  B11: {
    metaId: 'B11', label: '卷号起止', width: '180px', align: 'left',
    accessor: (b) => b.volumeCodeRange
      ? <span className="font-mono text-[10px] text-slate-500">{b.volumeCodeRange}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  B12: {
    metaId: 'B12', label: '备注', width: '160px', align: 'left',
    accessor: (b) => <span className="text-xs text-slate-500">{b.remarks || '—'}</span>,
  },
};

export function getBoxColumns(visibleIds: string[]): ColumnDef[] {
  return visibleIds.filter((id) => BOX_COLUMN_MAP[id]).map((id) => BOX_COLUMN_MAP[id]);
}

export function getBoxDefaultColumns(): ColumnDef[] {
  return getBoxColumns(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B9', 'B10']);
}
