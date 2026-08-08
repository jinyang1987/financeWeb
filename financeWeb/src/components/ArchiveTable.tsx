/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Grid, FileInput, FileSpreadsheet, Briefcase, Layers,
  Search, Trash2
} from 'lucide-react';
import { ArchiveRecord, CategoryNode } from '../types';
import { useArchiveStore } from '../stores/archiveStore';
import type { ColumnDef } from '../config/metadataColumnMaps/archiveItemColumns';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';

interface ArchiveTableProps {
  filteredRecords: ArchiveRecord[];
  selectedRecordIds: Set<string>;
  selectedNode: CategoryNode | null;
  toggleRowSelect: (id: string) => void;
  toggleSelectAll: () => void;
  handleOpenDrawer: (row: ArchiveRecord) => void;
  setActiveFileIndex: (idx: number) => void;
  handleDeleteRecord: (id: string, e: React.MouseEvent) => void;
  /** 动态列定义（来自元数据配置）。不传则使用默认固定列 */
  columns?: ColumnDef[];
}

export const ArchiveTable: React.FC<ArchiveTableProps> = ({
  filteredRecords,
  selectedRecordIds,
  selectedNode,
  toggleRowSelect,
  toggleSelectAll,
  handleOpenDrawer,
  setActiveFileIndex,
  handleDeleteRecord,
  columns,
}) => {
  const searchQuery = useArchiveStore((s) => s.searchQuery);
  const setSearchQuery = useArchiveStore((s) => s.setSearchQuery);
  const setSelectedNode = useArchiveStore((s) => s.setSelectedNode);

  const hasDynamicColumns = columns && columns.length > 0;

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col flex-1 min-h-0">
      {/* Action Bar Header */}
      <div className="bg-slate-50 border-b border-slate-100 p-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search archives..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 w-48"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto" style={{ minHeight: 'calc(100vh - 260px)' }}>
        {selectedNode?.id === 'time-2026-05' && !hasDynamicColumns ? (
          <div className="p-6 space-y-6 animate-in fade-in duration-200">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                <Grid className="w-6 h-6 text-sky-500" />
                2026 May Archive Digital Shelving Overview
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: 'Vouchers', total: 1250, done: 1250, icon: <FileInput className="w-6 h-6 text-sky-600" />, bg: 'bg-sky-100', bar: 'bg-sky-500' },
                { title: 'Ledgers', total: 45, done: 42, icon: <Briefcase className="w-6 h-6 text-amber-600" />, bg: 'bg-amber-100', bar: 'bg-amber-500' },
                { title: 'Reports', total: 12, done: 12, icon: <FileSpreadsheet className="w-6 h-6 text-emerald-600" />, bg: 'bg-emerald-100', bar: 'bg-emerald-500' },
                { title: 'Other Files', total: 320, done: 156, icon: <Layers className="w-6 h-6 text-slate-600" />, bg: 'bg-slate-200', bar: 'bg-slate-500' }
              ].map((item, idx) => (
                <div key={idx} className="p-5 border border-slate-200 rounded-xl bg-slate-50/80 hover:bg-slate-50 hover:shadow-md transition-all flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div className={`p-3 rounded-xl ${item.bg}`}>{item.icon}</div>
                    <span className="text-sm font-bold text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg shadow-xs">{((item.done / item.total) * 100).toFixed(0)}% Done</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-lg mb-1">{item.title}</h4>
                    <p className="text-xs text-slate-500 font-medium tracking-wide">Total {item.done} / Of {item.total}</p>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5 mt-2 overflow-hidden shadow-inner">
                    <div className={`${item.bar} h-full rounded-full`} style={{ width: `${(item.done / item.total) * 100}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                {/* Checkbox column — always visible */}
                <TableHead className="w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredRecords.length > 0 && selectedRecordIds.size === filteredRecords.length}
                    onChange={toggleSelectAll}
                    className="rounded accent-sky-600 cursor-pointer"
                  />
                </TableHead>

                {/* Dynamic columns from metadata config */}
                {hasDynamicColumns ? (
                  columns!.map(col => (
                    <TableHead
                      key={col.metaId}
                      className={
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      }
                    >
                      {col.label}
                    </TableHead>
                  ))
                ) : (
                  <>
                    <TableHead>System ID</TableHead>
                    <TableHead>Voucher No.</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount (RMB)</TableHead>
                    <TableHead className="text-center">Period</TableHead>
                    <TableHead className="text-center">Retention</TableHead>
                  </>
                )}

                {/* Integrity Checks — always visible */}
                <TableHead className="w-[320px]">Integrity Checks</TableHead>

                {/* Status — always visible */}
                <TableHead className="text-center">Status</TableHead>

                {/* Actions — always visible */}
                <TableHead className="text-center w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.map((row) => {
                const isChecked = selectedRecordIds.has(row.id);

                return (
                  <TableRow
                    key={row.id}
                    id={`archive-row-${row.id}`}
                    onClick={() => handleOpenDrawer(row)}
                    className={`cursor-pointer ${isChecked ? 'bg-sky-50/30' : ''}`}
                  >
                    {/* Checkbox */}
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRowSelect(row.id)}
                        className="rounded accent-sky-600 cursor-pointer animate-in fade-in"
                      />
                    </TableCell>

                    {/* Dynamic data columns */}
                    {hasDynamicColumns ? (
                      columns!.map(col => (
                        <TableCell
                          key={col.metaId}
                          className={
                            col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                          }
                        >
                          {col.accessor(row)}
                        </TableCell>
                      ))
                    ) : (
                      <>
                        <TableCell className="font-mono font-bold text-foreground select-all tracking-tight">
                          {row.archiveCode}
                        </TableCell>
                        <TableCell>
                          <span className="font-bold bg-muted text-foreground px-2 py-0.5 rounded">
                            {row.voucherNo}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full font-bold text-xs ${
                            row.archiveType === '记账凭证' ? 'bg-sky-50 text-sky-700' :
                            row.archiveType === '会计账簿' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                            'bg-purple-50 text-purple-700'
                          }`}>{row.archiveType}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-foreground">
                          ¥ {row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground font-mono">
                          {row.year}/{row.month || ''}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                            row.retention === '永久' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-muted text-muted-foreground'
                          }`}>{row.retention}</span>
                        </TableCell>
                      </>
                    )}

                    {/* Integrity Checks */}
                    <TableCell className="max-w-[320px]" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button
                          title="Real (CA)"
                          onClick={() => { handleOpenDrawer(row); setActiveFileIndex(1); }}
                          className={`px-1.5 py-0.5 rounded font-bold text-[10px] flex items-center gap-0.5 pointer-events-auto border transition-colors cursor-pointer ${
                            row.checks.real ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100' : 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100'
                          }`}
                        >
                          <span></span><span className="text-[8px] opacity-75">(CA)</span>
                        </button>
                        <button
                          title="Complete (SHA256)"
                          className={`px-1.5 py-0.5 rounded font-bold text-[10px] flex items-center gap-0.5 border cursor-pointer ${
                            row.checks.complete ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100' : 'bg-red-50 border-red-200 text-red-800'
                          }`}
                          onClick={() => handleOpenDrawer(row)}
                        >
                          <span></span><span className="text-[8px] opacity-75">(Hash)</span>
                        </button>
                        <button
                          title="Usable (Format)"
                          className={`px-1.5 py-0.5 rounded font-bold text-[10px] flex items-center gap-0.5 border transition-all cursor-pointer ${
                            row.checks.usable ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-100 border-amber-300 text-amber-800 animate-pulse'
                          }`}
                          onClick={() => { handleOpenDrawer(row); const ofdIdx = row.components.findIndex(c => c.contentType === 'ofd'); if (ofdIdx >= 0) setActiveFileIndex(ofdIdx); }}
                        >
                          <span>Usable</span><span className="text-[8px] opacity-75">({row.checks.usable ? 'OK' : 'Missing?'})</span>
                        </button>
                        <button
                          title="Safe (Security)"
                          className={`px-1.5 py-0.5 rounded font-bold text-[10px] flex items-center gap-0.5 border cursor-pointer ${
                            row.checks.safe ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                          }`}
                          onClick={() => handleOpenDrawer(row)}
                        >
                          <span></span><span className="text-[8px] opacity-75"></span>
                        </button>
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        row.status === '已组卷' ? 'bg-muted text-muted-foreground border border-slate-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>{row.status}</span>
                      {row.volumeCode && (
                        <span className="block font-mono text-[9px] text-muted-foreground mt-0.5 tracking-tight">{row.volumeCode}</span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenDrawer(row)}
                          className="text-sky-600 hover:text-sky-800 font-bold hover:underline py-1.5 cursor-pointer text-xs"
                        >
                          View/Edit
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteRecord(row.id, e)}
                          className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer"
                          title="Delete this voucher"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {filteredRecords.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={hasDynamicColumns ? (columns!.length + 4) : 10}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <p className="font-bold">No electronic accounting archive records found</p>
                    <p className="text-xs mt-1">Try selecting a catalog tree node or refining your search keywords</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

