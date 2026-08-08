/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * voucherManagerColumns — 核对工作台（全宽）列映射
 *
 * 用于核对工作台（VoucherManagerPage）。
 * 全宽页面，使用 fr 比例分配，自动填满可用宽度。
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

export const VOUCHER_MANAGER_COLUMN_MAP: Record<string, ColumnDef> = {
  VOUCHER_NO: {
    metaId: 'VOUCHER_NO', label: '凭证号',
    accessor: (r) => <span className="font-mono font-bold text-slate-800 text-xs">{r.voucherNo}</span>,
    width: '1fr', align: 'left',
  },
  DATE: {
    metaId: 'DATE', label: '日期',
    accessor: (r) => <span className="text-xs text-slate-500">{r.year}-{r.month}</span>,
    width: '0.8fr', align: 'left',
  },
  SUMMARY: {
    metaId: 'SUMMARY', label: '摘要',
    accessor: (r) => (
      <span className="text-xs text-slate-700 truncate block" title={r.remarks || ''}>
        {r.remarks || '—'}
      </span>
    ),
    width: '2.5fr', align: 'left',
  },
  DEPARTMENT: {
    metaId: 'DEPARTMENT', label: '部门',
    accessor: (r) => <span className="text-xs text-slate-600">{r.department}</span>,
    width: '0.8fr', align: 'left',
  },
  AMOUNT: {
    metaId: 'AMOUNT', label: '金额',
    accessor: (r) => (
      <span className="font-mono text-xs font-medium text-slate-800">
        {'¥'}{r.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
      </span>
    ),
    width: '1fr', align: 'left',
  },
  ATTACHMENTS: {
    metaId: 'ATTACHMENTS', label: '附件',
    accessor: (r) => {
      const count = r.sourceDocumentIds?.length || 0;
      return count > 0
        ? <span className="text-amber-600 font-medium text-xs">{count} 份</span>
        : <span className="text-slate-400 text-xs">无</span>;
    },
    width: '0.6fr', align: 'left',
  },
};

export function getVoucherManagerColumns(visibleIds: string[]): ColumnDef[] {
  return visibleIds.filter(id => VOUCHER_MANAGER_COLUMN_MAP[id]).map(id => VOUCHER_MANAGER_COLUMN_MAP[id]);
}

export function getVoucherManagerDefaultColumns(): ColumnDef[] {
  return getVoucherManagerColumns(['VOUCHER_NO', 'DATE', 'SUMMARY', 'DEPARTMENT', 'AMOUNT', 'ATTACHMENTS']);
}
