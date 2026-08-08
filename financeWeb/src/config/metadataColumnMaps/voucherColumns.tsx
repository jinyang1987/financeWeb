/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * voucherColumns — 组卷工作台（紧凑）列映射
 *
 * 用于组卷工作台左侧未组卷池（VolumeWorkspacePage UnassignedPool）。
 * 在 60/40 分栏的左侧面板中使用，固定像素宽度以适配有限空间。
 */

import React from 'react';
import type { ArchiveRecord } from '../../types';

export interface ColumnDef {
  metaId: string;
  label: string;
  accessor: (record: ArchiveRecord) => React.ReactNode;
  width?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

export const VOUCHER_COLUMN_MAP: Record<string, ColumnDef> = {
  VOUCHER_NO: {
    metaId: 'VOUCHER_NO', label: '凭证号',
    accessor: (r) => <span className="font-mono font-bold text-slate-800 text-xs">{r.voucherNo}</span>,
    width: '80px', align: 'left',
  },
  DATE: {
    metaId: 'DATE', label: '日期',
    accessor: (r) => <span className="text-xs text-slate-500">{r.year}-{r.month}</span>,
    width: '64px', align: 'left',
  },
  SUMMARY: {
    metaId: 'SUMMARY', label: '摘要',
    accessor: (r) => (
      <span className="text-xs text-slate-700 truncate block" title={r.remarks || ''}>{r.remarks || '—'}</span>
    ),
    width: '140px', align: 'left',
  },
  DEPARTMENT: {
    metaId: 'DEPARTMENT', label: '部门',
    accessor: (r) => <span className="text-xs text-slate-600">{r.department}</span>,
    width: '64px', align: 'left',
  },
  AMOUNT: {
    metaId: 'AMOUNT', label: '金额',
    accessor: (r) => (
      <span className="font-mono text-xs font-medium text-slate-800">
        {'¥'}{r.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
      </span>
    ),
    width: '100px', align: 'right',
  },
  ATTACHMENTS: {
    metaId: 'ATTACHMENTS', label: '附件',
    accessor: (r) => {
      const count = r.sourceDocumentIds?.length || 0;
      return count > 0
        ? <span className="text-amber-600 font-medium text-xs">{count} 份</span>
        : <span className="text-slate-400 text-xs">无</span>;
    },
    width: '48px', align: 'left',
  },
};

export function getVoucherColumns(visibleIds: string[]): ColumnDef[] {
  return visibleIds.filter(id => VOUCHER_COLUMN_MAP[id]).map(id => VOUCHER_COLUMN_MAP[id]);
}

export function getVoucherDefaultColumns(): ColumnDef[] {
  return getVoucherColumns(['VOUCHER_NO', 'DATE', 'SUMMARY', 'DEPARTMENT', 'AMOUNT', 'ATTACHMENTS']);
}
