/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * archiveItemColumns — 会计档案条目上下文列映射
 *
 * 用于财务视图 / 项目视图 / 时间视图。
 * 字段使用 DA/T 94-2022 元数据 M-ID 命名。
 *
 * 从原 metadataColumnMap.tsx 迁移而来。
 */

import React from 'react';
import { Monitor, FileText, Check } from 'lucide-react';
import type { ArchiveRecord } from '../../types';

// ═══════════════════════════════════════════════════════════
// ColumnDef（与 voucherColumns 共享接口）
// ═══════════════════════════════════════════════════════════

export interface ColumnDef {
  metaId: string;
  label: string;
  accessor: (record: ArchiveRecord) => React.ReactNode;
  width?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

// ═══════════════════════════════════════════════════════════
// 来源列
// ═══════════════════════════════════════════════════════════

const SOURCE_COLUMN: ColumnDef = {
  metaId: 'SOURCE',
  label: '管理模式',
  accessor: (r) => {
    const isElectronic = r.carrierType === 'electronic' || r.source === 'digital-native';
    const modeLabel = isElectronic ? '电子文件' : '纸质副本';
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${
        isElectronic
          ? 'bg-sky-50 text-sky-700 border-sky-200'
          : 'bg-amber-50 text-amber-700 border-amber-200'
      }`}>
        {isElectronic ? (
          <>
            <Monitor className="w-3 h-3 text-sky-500" /> {modeLabel}
          </>
        ) : (
          <>
            <FileText className="w-3 h-3 text-amber-500" /> {modeLabel}
          </>
        )}
      </span>
    );
  },
  width: '100px',
  align: 'center',
  sortable: true,
};

// ═══════════════════════════════════════════════════════════
// 档案件级 M-ID → 列定义（DA/T 94-2022）
// ═══════════════════════════════════════════════════════════

export const ARCHIVE_ITEM_COLUMN_MAP: Record<string, ColumnDef> = {
  SOURCE: SOURCE_COLUMN,

  // M13: 档号 → archiveCode
  M13: {
    metaId: 'M13',
    label: '档号',
    accessor: (r) => (
      <span className="font-mono font-bold text-slate-800 text-xs tracking-tight">{r.archiveCode}</span>
    ),
    width: '220px',
    align: 'left',
  },
  // M31: 凭证号 → voucherNo
  M31: {
    metaId: 'M31',
    label: '凭证号',
    accessor: (r) => (
      <span className="font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">{r.voucherNo}</span>
    ),
    width: '90px',
    align: 'center',
  },
  // M30: 会计资料形式 → archiveType
  M30: {
    metaId: 'M30',
    label: '档案类型',
    accessor: (r) => {
      const colorMap: Record<string, string> = {
        '记账凭证': 'bg-sky-50 text-sky-700',
        '会计账簿': 'bg-amber-50 text-amber-700 border border-amber-200',
        '财务报告': 'bg-purple-50 text-purple-700',
        '财务报表': 'bg-purple-50 text-purple-700',
        '原始凭证': 'bg-emerald-50 text-emerald-700',
      };
      const cls = colorMap[r.archiveType] || 'bg-slate-50 text-slate-600';
      return <span className={`px-2 py-0.5 rounded-full font-bold text-[10.5px] ${cls}`}>{r.archiveType}</span>;
    },
    width: '90px',
    align: 'center',
  },
  // M17: 责任者 → department
  M17: {
    metaId: 'M17',
    label: '责任部门',
    accessor: (r) => <span className="text-slate-700">{r.department}</span>,
    width: '100px',
    align: 'left',
  },
  // M35: 金额合计 → amount
  M35: {
    metaId: 'M35',
    label: '合计金额',
    accessor: (r) => (
      <span className="font-mono font-bold text-slate-900">
        ¥ {r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </span>
    ),
    width: '130px',
    align: 'right',
  },
  // M29: 会计年度 → year
  M29: {
    metaId: 'M29',
    label: '会计年度',
    accessor: (r) => <span className="font-mono text-slate-500">{r.year}</span>,
    width: '80px',
    align: 'center',
  },
  // M15: 日期 → year + month
  M15: {
    metaId: 'M15',
    label: '日期',
    accessor: (r) => (
      <span className="font-mono text-slate-500">{r.year}/{r.month || '--'}</span>
    ),
    width: '80px',
    align: 'center',
  },
  // M20: 保管期限 → retention
  M20: {
    metaId: 'M20',
    label: '保管期限',
    accessor: (r) => {
      const isPermanent = r.retention === '永久';
      return (
        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
          isPermanent ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-600'
        }`}>
          {r.retention}
        </span>
      );
    },
    width: '80px',
    align: 'center',
  },
  // M14: 题名 → remarks
  M14: {
    metaId: 'M14',
    label: '题名/摘要',
    accessor: (r) => (
      <span className="text-slate-600 text-xs max-w-[200px] truncate block" title={r.remarks}>
        {r.remarks || '—'}
      </span>
    ),
    width: '180px',
    align: 'left',
  },
  // M34: 币种 → 固定 CNY
  M34: {
    metaId: 'M34',
    label: '币种',
    accessor: () => <span className="text-slate-400">CNY</span>,
    width: '60px',
    align: 'center',
  },
  // M19: 密级 → 暂无，显示默认
  M19: {
    metaId: 'M19',
    label: '密级',
    accessor: () => (
      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-50 text-slate-400">内部</span>
    ),
    width: '60px',
    align: 'center',
  },
  // M22: 格式信息 → components 文件类型统计
  M22: {
    metaId: 'M22',
    label: '格式信息',
    accessor: (r) => {
      const types = [...new Set(r.components.map(c => c.contentType.toUpperCase()))];
      return (
        <div className="flex gap-1 flex-wrap">
          {types.map(t => (
            <span key={t} className="px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-600 rounded font-mono">{t}</span>
          ))}
        </div>
      );
    },
    width: '100px',
    align: 'left',
  },
  // M23: 计算机文件名 → 主件文件名
  M23: {
    metaId: 'M23',
    label: '主文件名',
    accessor: (r) => {
      const main = r.components[0];
      return (
        <span className="text-xs text-slate-500 max-w-[150px] truncate block font-mono" title={main?.name}>
          {main?.name || '—'}
        </span>
      );
    },
    width: '160px',
    align: 'left',
  },
  // M24: 计算机文件大小 → 总大小
  M24: {
    metaId: 'M24',
    label: '文件大小',
    accessor: (r) => {
      const main = r.components[0];
      return <span className="text-xs text-slate-500 font-mono">{main?.size || '—'}</span>;
    },
    width: '80px',
    align: 'center',
  },
  // M9: 室编案卷号 → volumeCode
  M9: {
    metaId: 'M9',
    label: '案卷号',
    accessor: (r) => r.volumeCode
      ? <span className="font-mono text-slate-600 text-xs">{r.volumeCode}</span>
      : <span className="text-slate-300">—</span>,
    width: '140px',
    align: 'left',
  },
  // M11: 室编件号 → volumeItemNo
  M11: {
    metaId: 'M11',
    label: '件号',
    accessor: (r) => r.volumeItemNo != null
      ? <span className="font-mono text-slate-600 text-xs">{String(r.volumeItemNo).padStart(4, '0')}</span>
      : <span className="text-slate-300">—</span>,
    width: '60px',
    align: 'center',
  },
  // M21: 摘要 → remarks
  M21: {
    metaId: 'M21',
    label: '摘要',
    accessor: (r) => (
      <span className="text-slate-600 text-xs max-w-[180px] truncate block" title={r.remarks}>
        {r.remarks || '—'}
      </span>
    ),
    width: '160px',
    align: 'left',
  },
  // M25: 计算机文件格式 → components[0].contentType
  M25: {
    metaId: 'M25',
    label: '文件格式',
    accessor: (r) => {
      const main = r.components[0];
      return main
        ? <span className="px-1.5 py-0.5 text-[10px] bg-slate-100 text-slate-600 rounded font-mono">{main.contentType.toUpperCase()}</span>
        : <span className="text-slate-300">—</span>;
    },
    width: '70px',
    align: 'center',
  },
  // M27: 哈希值 → components[0].hash
  M27: {
    metaId: 'M27',
    label: '哈希值',
    accessor: (r) => {
      const main = r.components[0];
      const hash = main?.hash;
      return hash
        ? <span className="font-mono text-[10px] text-slate-500 max-w-[120px] truncate block" title={hash}>{hash.slice(0, 12)}…</span>
        : <span className="text-slate-300">—</span>;
    },
    width: '100px',
    align: 'left',
  },
  // M28: 电子签名 → components[0].signatureVerified
  M28: {
    metaId: 'M28',
    label: '电子签名',
    accessor: (r) => {
      const main = r.components[0];
      if (!main) return <span className="text-slate-300">—</span>;
      return main.signatureVerified
        ? <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 font-medium"><Check className="w-2.5 h-2.5 inline mr-0.5" />{main.signer || '已验证'}</span>
        : <span className="px-2 py-0.5 rounded text-[10px] bg-slate-50 text-slate-400">未签名</span>;
    },
    width: '100px',
    align: 'center',
  },
  // M32: 起始日期 → year
  M32: {
    metaId: 'M32',
    label: '起始日期',
    accessor: (r) => (
      <span className="font-mono text-slate-500 text-xs">{r.year}-{r.month || '01'}-01</span>
    ),
    width: '100px',
    align: 'center',
  },
  // M36: 页数 → pageNo
  M36: {
    metaId: 'M36',
    label: '页数',
    accessor: (r) => r.pageNo != null
      ? <span className="font-mono text-slate-600">{r.pageNo}</span>
      : <span className="text-slate-300">—</span>,
    width: '50px',
    align: 'center',
  },
  // M39: 关联档案号 → parentRecordId / sourceDocumentIds
  M39: {
    metaId: 'M39',
    label: '关联档案',
    accessor: (r) => {
      const linkedCount = (r.sourceDocumentIds?.length || 0) + (r.childRecordIds?.length || 0) + (r.parentRecordId ? 1 : 0);
      return linkedCount > 0
        ? <span className="text-sky-600 font-medium text-xs">{linkedCount} 条关联</span>
        : <span className="text-slate-300">无</span>;
    },
    width: '90px',
    align: 'center',
  },
  // M18: 附件 → 子件数量
  M18: {
    metaId: 'M18',
    label: '附件',
    accessor: (r) => {
      const count = r.childRecordIds?.length || 0;
      return count > 0
        ? <span className="text-sky-600 font-medium">{count} 件</span>
        : <span className="text-slate-300">无</span>;
    },
    width: '60px',
    align: 'center',
  },
  // M8: 类别号 → 从 archiveCode 提取
  M8: {
    metaId: 'M8',
    label: '类别号',
    accessor: (r) => {
      const parts = r.archiveCode.split('-');
      return <span className="font-mono text-slate-500 text-xs">{parts[1] || '—'}</span>;
    },
    width: '80px',
    align: 'center',
  },
  // M16: 文件编号 → voucherNo
  M16: {
    metaId: 'M16',
    label: '文件编号',
    accessor: (r) => <span className="font-mono text-slate-500 text-xs">{r.voucherNo}</span>,
    width: '80px',
    align: 'center',
  },
};

// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════

export function getArchiveItemColumns(visibleIds: string[]): ColumnDef[] {
  return visibleIds
    .filter(id => ARCHIVE_ITEM_COLUMN_MAP[id])
    .map(id => ARCHIVE_ITEM_COLUMN_MAP[id]);
}

export const DEFAULT_ARCHIVE_ITEM_COLUMN_IDS = [
  'SOURCE', 'M13', 'M31', 'M30', 'M17', 'M35', 'M29', 'M15', 'M20', 'M18',
];

export function getArchiveItemDefaultColumns(): ColumnDef[] {
  return getArchiveItemColumns(DEFAULT_ARCHIVE_ITEM_COLUMN_IDS);
}



