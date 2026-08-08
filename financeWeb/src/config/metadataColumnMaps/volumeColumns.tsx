/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * volumeColumns — 案卷上下文列映射（V1-V20，对齐 finance:volume 模型 + DA/T 39）
 *
 * accessor 以 Volume 为数据源（非 ArchiveRecord）。供组卷工作台案卷列表、
 * 盒内案卷列表等视图按 metadataDisplayStore 的可见字段动态取列。
 */

import React from 'react';
import type { Volume, VolumeStatus } from '../../types/volume';

export interface ColumnDef {
  metaId: string;
  label: string;
  accessor: (volume: Volume) => React.ReactNode;
  width?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

// ── 卷状态徽章 ──
const VOL_STATUS_META: Record<VolumeStatus, { label: string; cls: string }> = {
  draft:       { label: '草稿',   cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  confirmed:   { label: '已确认', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  numbered:    { label: '已赋号', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  completed:   { label: '已完结', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  transferred: { label: '已移交', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  destroyed:   { label: '已销毁', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const StatusBadge: React.FC<{ status: VolumeStatus }> = ({ status }) => {
  const m = VOL_STATUS_META[status] || VOL_STATUS_META.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
};

const CARRIER_LABELS: Record<string, string> = {
  paper: '纸质', electronic: '电子', mixed: '混合',
};

// ── V1-V20 列定义 ──
export const VOLUME_COLUMN_MAP: Record<string, ColumnDef> = {
  V1: {
    metaId: 'V1', label: '案卷档号', width: '220px', align: 'left', sortable: true,
    accessor: (v) => v.volumeCode
      ? <span className="font-mono font-bold text-slate-800 text-xs tracking-tight">{v.volumeCode}</span>
      : <span className="text-slate-300 text-xs">未赋号</span>,
  },
  V2: {
    metaId: 'V2', label: '案卷题名', width: '240px', align: 'left', sortable: true,
    accessor: (v) => <span className="text-slate-700 text-sm font-medium">{v.title}</span>,
  },
  V3: {
    metaId: 'V3', label: '类别号', width: '80px', align: 'center',
    accessor: (v) => <span className="font-mono text-xs text-slate-600">{v.archiveTypeCode}</span>,
  },
  V4: {
    metaId: 'V4', label: '档案类型', width: '110px', align: 'left',
    accessor: (v) => <span className="text-slate-600 text-xs">{v.archiveType || '—'}</span>,
  },
  V5: {
    metaId: 'V5', label: '会计年度', width: '90px', align: 'center', sortable: true,
    accessor: (v) => <span className="text-slate-700 text-sm font-medium">{v.year}</span>,
  },
  V6: {
    metaId: 'V6', label: '保管期限', width: '90px', align: 'center', sortable: true,
    accessor: (v) => <span className="text-slate-600 text-xs">{v.retention || '—'}</span>,
  },
  V7: {
    metaId: 'V7', label: '期限代码', width: '80px', align: 'center',
    accessor: (v) => <span className="font-mono text-xs text-slate-500">{v.retentionCode || '—'}</span>,
  },
  V8: {
    metaId: 'V8', label: '卷状态', width: '90px', align: 'center', sortable: true,
    accessor: (v) => <StatusBadge status={v.status} />,
  },
  V9: {
    metaId: 'V9', label: '卷内件数', width: '80px', align: 'right', sortable: true,
    accessor: (v) => <span className="font-mono text-sm text-slate-700">{v.totalItems}</span>,
  },
  V10: {
    metaId: 'V10', label: '卷内页数', width: '80px', align: 'right',
    accessor: (v) => <span className="font-mono text-xs text-slate-500">{v.totalPages || '—'}</span>,
  },
  V11: {
    metaId: 'V11', label: '载体类型', width: '90px', align: 'center',
    accessor: (v) => <span className="text-xs text-slate-600">{v.carrierType ? CARRIER_LABELS[v.carrierType] : '—'}</span>,
  },
  V12: {
    metaId: 'V12', label: '密级', width: '80px', align: 'center',
    accessor: (v) => v.securityLevel
      ? <span className="text-xs text-amber-700 font-medium">{v.securityLevel}</span>
      : <span className="text-slate-300 text-xs">普通</span>,
  },
  V13: {
    metaId: 'V13', label: '柜号', width: '80px', align: 'center',
    accessor: (v) => <span className="font-mono text-xs text-slate-500">{v.cabinetNo || '—'}</span>,
  },
  V14: {
    metaId: 'V14', label: '架号', width: '80px', align: 'center',
    accessor: (v) => <span className="font-mono text-xs text-slate-500">{v.shelfNo || '—'}</span>,
  },
  V15: {
    metaId: 'V15', label: '起始日期', width: '110px', align: 'center',
    accessor: (v) => <span className="text-xs text-slate-500">{v.dateFrom || '—'}</span>,
  },
  V16: {
    metaId: 'V16', label: '截止日期', width: '110px', align: 'center',
    accessor: (v) => <span className="text-xs text-slate-500">{v.dateTo || '—'}</span>,
  },
  V17: {
    metaId: 'V17', label: '组卷日期', width: '110px', align: 'center', sortable: true,
    accessor: (v) => <span className="text-xs text-slate-500">{v.createdDate || '—'}</span>,
  },
  V18: {
    metaId: 'V18', label: '组卷人', width: '100px', align: 'left',
    accessor: (v) => <span className="text-xs text-slate-600">{v.createdBy || '—'}</span>,
  },
  V19: {
    metaId: 'V19', label: '数字化副本哈希', width: '160px', align: 'left',
    accessor: (v) => v.digitalHash
      ? <span className="font-mono text-[10px] text-slate-400">{v.digitalHash.slice(0, 16)}…</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  V20: {
    metaId: 'V20', label: '所属盒号', width: '140px', align: 'left',
    accessor: (v) => v.boxNo
      ? <span className="font-mono text-xs text-slate-600">{v.boxNo}</span>
      : <span className="text-slate-300 text-xs">未装盒</span>,
  },
};

export function getVolumeColumns(visibleIds: string[]): ColumnDef[] {
  return visibleIds.filter((id) => VOLUME_COLUMN_MAP[id]).map((id) => VOLUME_COLUMN_MAP[id]);
}

export function getVolumeDefaultColumns(): ColumnDef[] {
  return getVolumeColumns(['V1', 'V2', 'V3', 'V5', 'V6', 'V8', 'V9', 'V11', 'V20']);
}

