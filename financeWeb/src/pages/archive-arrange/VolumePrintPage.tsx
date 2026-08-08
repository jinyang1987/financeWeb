/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * VolumePrintPage — 卷内目录/备考表查看与打印
 *
 * 功能：
 *   1. 列出所有已完成组卷的案卷
 *   2. 展示卷内目录（件号、档号、题名、日期、页号、备注）
 *   3. 展示备考表（立卷人、检查人、日期、说明）
 *   4. 浏览器打印支持
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FileText, Printer, Search, ChevronDown, ChevronRight, FolderTree, CheckCircle2 } from 'lucide-react';
import { useVolumeStore } from '../../stores/volumeStore';
import { useArchiveStore } from '../../stores/archiveStore';
import type { Volume, VolumeItem } from '../../types/volume';

// ── 模拟备考表数据 ──
interface VolumeMetadata {
  archiver: string;        // 立卷人
  checker: string;         // 检查人
  archiveDate: string;     // 归档日期
  description: string;     // 备注说明
  totalFiles: number;      // 本案卷共 X 件
  totalPages: number;      // 共 X 页
 保管期限: string;
}

function generateMetadata(volume: Volume, itemCount: number): VolumeMetadata {
  return {
    archiver: '系统管理员',
    checker: '档案主管',
    archiveDate: volume.createdDate,
    description: volume.title,
    totalFiles: itemCount,
    totalPages: itemCount * 2, // 粗略估算
    保管期限: volume.retention || '30年',
  };
}

// ── 子组件：案卷目录表格 ──
interface DirectoryTableProps {
  volume: Volume;
  items: VolumeItem[];
  recordMap: Map<string, { voucherNo: string; archiveType: string; amount: number; year: string; month: string }>;
  metadata: VolumeMetadata;
  printMode?: boolean;
}

const DirectoryTable: React.FC<DirectoryTableProps> = ({
  volume, items, recordMap, metadata, printMode,
}) => {
  return (
    <div className={`${printMode ? '' : 'border border-slate-200 rounded-xl bg-white'}`}>
      {/* 标题 */}
      <div className={`${printMode ? 'text-center mb-6' : 'px-5 py-3 border-b border-slate-200'}`}>
        <h2 className="text-base font-bold text-slate-800">
          {printMode ? '卷 内 目 录' : `卷内目录 · ${volume.volumeCode || volume.title}`}
        </h2>
        {!printMode && (
          <p className="text-xs text-slate-500 mt-0.5">
            {volume.title} | {volume.archiveTypeCode} | {volume.retentionCode}
          </p>
        )}
      </div>

      {/* 表头信息 */}
      {printMode && (
        <div className="text-sm text-slate-700 mb-4 space-y-1">
          <div className="flex gap-8">
            <span>全宗号: <strong>{volume.fondsCode}</strong></span>
            <span>案卷号: <strong>{volume.volumeCode}</strong></span>
            <span>保管期限: <strong>{metadata.保管期限}</strong></span>
          </div>
        </div>
      )}

      {/* 目录表格 */}
      <div className={`${printMode ? 'px-0' : 'p-5'}`}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-300">
              <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-center w-12">件号</th>
              <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-center w-24">档号</th>
              <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-left">题名</th>
              <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-center w-20">日期</th>
              <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-center w-16">页号</th>
              <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-center w-24">备注</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">暂无卷内条目</td>
              </tr>
            ) : (
              items.map((item) => {
                const rec = recordMap.get(item.recordId);
                return (
                  <tr key={item.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-3 py-2 text-center text-slate-600 font-mono text-xs">{item.itemNo}</td>
                    <td className={`px-3 py-2 text-center font-mono text-xs ${printMode ? 'text-slate-700' : 'text-sky-700'}`}>
                      {item.recordArchiveCode || rec?.voucherNo || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {item.title || `${rec?.voucherNo || ''} ${rec?.archiveType || ''}`.trim() || '—'}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600 text-xs">
                      {item.date || (rec ? `${rec.year}-${String(rec.month).padStart(2, '0')}` : '—')}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600 font-mono text-xs">
                      {item.pageStart > 0 ? `${item.pageStart}~${item.pageEnd}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-400 text-xs">—</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* 备考表 */}
        <div className={`mt-8 ${printMode ? 'border-t-2 border-slate-800 pt-6' : 'border-t border-slate-200 pt-4'}`}>
          <h3 className={`font-bold text-slate-800 mb-3 ${printMode ? 'text-center text-base' : 'text-sm'}`}>
            {printMode ? '备  考  表' : '备考表'}
          </h3>

          <div className="text-sm space-y-2">
            <div className="flex gap-8">
              <span className="text-slate-500">本案卷共 <strong className="text-slate-700">{metadata.totalFiles}</strong> 件</span>
              <span className="text-slate-500">共 <strong className="text-slate-700">{metadata.totalPages}</strong> 页</span>
            </div>
            <div className="text-slate-500">
              说明: <span className="text-slate-700">{metadata.description}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div>
                <span className="text-slate-500">立卷人: </span>
                <span className="text-slate-700 font-medium">{metadata.archiver}</span>
              </div>
              <div>
                <span className="text-slate-500">检查人: </span>
                <span className="text-slate-700 font-medium">{metadata.checker}</span>
              </div>
              <div>
                <span className="text-slate-500">归档日期: </span>
                <span className="text-slate-700 font-medium">{metadata.archiveDate}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── 主组件 ──
const VolumePrintPage: React.FC = () => {
  const volumes = useVolumeStore((s) => s.volumes);
  const volumeItems = useVolumeStore((s) => s.volumeItems);
  const records = useArchiveStore((s) => s.records);
  const printRef = useRef<HTMLDivElement>(null);

  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'numbered' | 'completed'>('numbered');

  // 记录映射
  const recordMap = useMemo(() => {
    const map = new Map<string, { voucherNo: string; archiveType: string; amount: number; year: string; month: string }>();
    for (const r of records) {
      map.set(r.id, { voucherNo: r.voucherNo, archiveType: r.archiveType, amount: r.amount, year: r.year, month: r.month });
    }
    return map;
  }, [records]);

  // 筛选后的案卷列表
  const filteredVolumes = useMemo(() => {
    let result = [...volumes];
    if (filter === 'numbered') result = result.filter((v) => ['confirmed', 'numbered', 'completed'].includes(v.status));
    else if (filter === 'completed') result = result.filter((v) => ['confirmed', 'numbered', 'completed'].includes(v.status));
    return result;
  }, [volumes, filter]);

  const selectedVolume = volumes.find((v) => v.id === selectedVolumeId);
  const selectedItems = selectedVolumeId ? volumeItems[selectedVolumeId] || [] : [];

  // 设置默认选中第一个
  useEffect(() => {
    if (filteredVolumes.length > 0 && !selectedVolumeId) {
      setSelectedVolumeId(filteredVolumes[0].id);
    }
  }, [filteredVolumes, selectedVolumeId]);

  // 打印
  const handlePrint = () => {
    const printContent = document.getElementById('print-area');
    if (!printContent) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
      <head>
        <title>卷内目录 - ${selectedVolume?.volumeCode || ''}</title>
        <style>
          body { font-family: 'SimSun', '宋体', serif; padding: 40px; color: #333; }
          table { width: 100%; border-collapse: collapse; font-size: 12pt; }
          th, td { border: 1px solid #333; padding: 6px 8px; text-align: center; }
          th { background: #f0f0f0; font-weight: bold; }
          h2 { text-align: center; font-size: 18pt; margin-bottom: 20px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶部栏 */}
      <div className="flex items-center gap-4 px-6 py-3 bg-white border-b border-slate-200">
        <FileText className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">卷内目录打印</h1>
        <div className="flex items-center gap-2 ml-4">
          <button
            type="button"
            onClick={() => setFilter('numbered')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === 'numbered' ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            已赋号
          </button>
          <button
            type="button"
            onClick={() => setFilter('completed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === 'completed' ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            已完结
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === 'all' ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            全部
          </button>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-slate-400">{filteredVolumes.length} 卷</span>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!selectedVolume}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:bg-slate-300 transition-colors"
        >
          <Printer className="w-4 h-4" />
          打印目录
        </button>
      </div>

      {/* 主体 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：案卷列表 */}
        <div className="w-72 border-r border-slate-200 bg-white overflow-y-auto">
          {filteredVolumes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 p-4">
              <FolderTree className="w-8 h-8 mb-2" />
              <span className="text-sm">暂无案卷</span>
              <span className="text-xs mt-1">请先在组卷工作台中完成组卷</span>
            </div>
          ) : (
            filteredVolumes.map((v) => {
              const isSelected = selectedVolumeId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVolumeId(v.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                    isSelected ? 'bg-sky-50 border-l-4 border-l-sky-500' : 'border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-3.5 h-3.5 ${['confirmed', 'completed'].includes(v.status) ? 'text-green-500' : 'text-sky-500'}`} />
                    <span className="text-sm font-medium text-slate-700 truncate">{v.volumeCode || v.title}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 ml-5.5">
                    {v.archiveTypeCode} | {v.retentionCode} | {v.totalItems}件
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* 右侧：目录预览 */}
        <div className="flex-1 overflow-y-auto p-6" ref={printRef}>
          <div id="print-area">
            {selectedVolume && (
              <DirectoryTable
                volume={selectedVolume}
                items={selectedItems}
                recordMap={recordMap}
                metadata={generateMetadata(selectedVolume, selectedItems.length)}
              />
            )}
            {!selectedVolume && (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                <FileText className="w-10 h-10 mb-2" />
                <span className="text-sm">请选择一个案卷查看目录</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VolumePrintPage;

