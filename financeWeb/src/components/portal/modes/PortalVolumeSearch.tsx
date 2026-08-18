/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PortalVolumeSearch — 门户「关联查询」模式
 *
 * 对齐后台「档案查询 → 关联查询」的能力：
 *   统一检索（跨卷/件）→ 卷位置 + 电子件信息 → 纸质扫描件 vs 原生电子件同屏对比 → 元数据比对。
 * 2026-08-18 V10 页态化：件级结果改走 /records/search 服务端全文检索；
 * 案卷结果仍本地匹配（卷集合小，volumeStore 已驻留）。
 */

import React, { useMemo, useState } from 'react';
import {
  Search, FileText, FolderTree, BookOpen, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronRight, ExternalLink, Package, X,
} from 'lucide-react';
import { usePortalStore } from '../../../stores/portalStore';
import { useVolumeStore } from '../../../stores/volumeStore';
import { useServerRecordSearch } from '../../../hooks/useServerRecordSearch';
import ArchiveStatusTags from '../../borrow/ArchiveStatusTags';
import type { Volume } from '../../../types/volume';
import type { ArchiveRecord } from '../../../types';

interface PortalVolumeSearchProps {
  onOpenDetail: (record: ArchiveRecord) => void;
}

interface SearchResult {
  type: 'item' | 'volume';
  id: string;
  title: string;
  subtitle: string;
  matchField: string;
  volumeInfo?: string;
  itemInfo?: string;
  record?: ArchiveRecord;
  volume?: Volume;
}

interface MetaCompare {
  field: string;
  scanned: string;
  electronic: string;
  match: boolean;
}

const MOCK_COMPARE_DATA: MetaCompare[] = [
  { field: '凭证号', scanned: '记-001', electronic: '记-001', match: true },
  { field: '金额', scanned: '¥12,500.00', electronic: '¥12,500.00', match: true },
  { field: '日期', scanned: '2026-01-15', electronic: '2026-01-15', match: true },
  { field: '部门', scanned: '财务部', electronic: '财务部', match: true },
  { field: '摘要', scanned: '差旅费报销', electronic: '差旅费报销-北京出差', match: false },
];

const PortalVolumeSearch: React.FC<PortalVolumeSearchProps> = ({ onOpenDetail }) => {
  const volumes = useVolumeStore((s) => s.volumes);
  const portalKeyword = usePortalStore((s) => s.portalKeyword);
  const setPortalKeyword = usePortalStore((s) => s.setPortalKeyword);

  const [searched, setSearched] = useState(false);
  const [compareRecord, setCompareRecord] = useState<ArchiveRecord | null>(null);

  // 件级结果：服务端全文检索（点「搜索」后才查）
  const { items: recordHits } = useServerRecordSearch({
    q: portalKeyword.trim() || undefined,
    enabled: searched,
  });

  // 卷级结果：本地匹配（卷集合小）
  const volumeHits = useMemo(() => {
    const q = portalKeyword.trim().toLowerCase();
    if (!searched || !q) return [] as Volume[];
    return volumes.filter((v) =>
      (v.volumeCode && v.volumeCode.toLowerCase().includes(q)) ||
      v.title.toLowerCase().includes(q) ||
      v.archiveType.includes(q),
    );
  }, [searched, portalKeyword, volumes]);

  const results = useMemo<SearchResult[]>(() => {
    const out: SearchResult[] = [];
    for (const r of recordHits) {
      out.push({
        type: 'item',
        id: r.id,
        title: r.voucherNo,
        subtitle: `${r.archiveType} | ¥${r.amount.toLocaleString()} | ${r.year}-${r.month}`,
        matchField: '凭证号/档号/金额/正文',
        volumeInfo: r.volumeCode || r.volumeId || '未组卷',
        itemInfo: r.carrierType === 'electronic' || r.source === 'digital-native' ? '原生电子文件' : '纸质数字化副本',
        record: r,
        volume: r.volumeId ? volumes.find((v) => v.id === r.volumeId) : undefined,
      });
    }
    for (const v of volumeHits) {
      out.push({
        type: 'volume',
        id: v.id,
        title: v.volumeCode || v.title,
        subtitle: `${v.archiveType} | ${v.retention} | ${v.totalItems}件 | ${v.dateFrom}~${v.dateTo}`,
        matchField: '案卷号/题名',
        volumeInfo: v.volumeCode || v.title,
        volume: v,
      });
    }
    return out;
  }, [recordHits, volumeHits, volumes]);

  const handleSearch = () => setSearched(true);

  const record = compareRecord;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 检索栏 */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0">
        <div className="flex items-center gap-3 max-w-6xl mx-auto">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <div className="relative flex-1 max-w-xl">
            <input
              type="text"
              placeholder="输入凭证号、档号、金额、摘要进行统一检索（跨卷/件，含正文）…"
              className="w-full pl-4 pr-10 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-200"
              value={portalKeyword}
              onChange={(e) => setPortalKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              type="button"
              onClick={handleSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white bg-sky-600 rounded-lg hover:bg-sky-700 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
          {portalKeyword && (
            <button
              type="button"
              onClick={() => { setPortalKeyword(''); setSearched(false); setCompareRecord(null); }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />清除
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* 未搜索状态 */}
        {!searched && !record && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <BookOpen className="w-12 h-12 mb-3" />
            <span className="text-sm font-medium">关联查询</span>
            <span className="text-xs mt-1">输入凭证号或档号，同时检索纸质卷位置和电子件信息</span>
          </div>
        )}

        {/* 搜索结果 */}
        {searched && !record && (
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="text-sm text-slate-500">
              找到 <strong className="text-slate-700">{results.length}</strong> 条匹配结果
              {portalKeyword && <span className="text-slate-400">（关键词: "{portalKeyword}"）</span>}
            </div>
            {results.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
                <Search className="w-8 h-8 mx-auto mb-2" />
                <span className="text-sm">未找到匹配结果</span>
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((r) => (
                  <div key={`${r.type}-${r.id}`} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-sky-200 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${r.type === 'volume' ? 'bg-amber-50' : 'bg-sky-50'}`}>
                        {r.type === 'volume'
                          ? <FolderTree className="w-4 h-4 text-amber-500" />
                          : <FileText className="w-4 h-4 text-sky-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 text-sm">{r.title}</span>
                          <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                            r.type === 'volume' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                          }`}>
                            {r.type === 'volume' ? '案卷' : '件'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{r.subtitle}</div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs flex-wrap">
                          {r.type === 'item' && r.record && (
                            <>
                              <span className="text-slate-500">
                                <Package className="w-3.5 h-3.5 inline mr-0.5" />卷: <strong className="text-slate-700">{r.volumeInfo}</strong>
                              </span>
                              <ArchiveStatusTags record={r.record} />
                            </>
                          )}
                          {r.type === 'volume' && r.volume && (
                            <span className="text-slate-500">
                              全宗: {r.volume.fondsCode} | 状态: {r.volume.status}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {r.type === 'item' && r.record && (
                          <button
                            type="button"
                            onClick={() => setCompareRecord(r.record!)}
                            className="px-3 py-1.5 text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 cursor-pointer"
                          >
                            同屏对比
                          </button>
                        )}
                        {r.type === 'item' && r.record && (
                          <button
                            type="button"
                            onClick={() => onOpenDetail(r.record!)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 cursor-pointer"
                          >
                            查看详情
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 同屏对比模式 */}
        {record && (
          <div className="max-w-5xl mx-auto space-y-4">
            <button
              type="button"
              onClick={() => setCompareRecord(null)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              <ChevronDown className="w-3 h-3 rotate-90" />
              返回搜索结果
            </button>

            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-sky-500" />
              同屏对比 · {record.voucherNo}
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />纸质扫描件（卷内页）
                  </span>
                  <span className="text-xs text-amber-500">第 12 页 / 共 48 页</span>
                </div>
                <div className="p-4 aspect-[3/4] bg-slate-100 flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    <BookOpen className="w-12 h-12 mx-auto mb-2" />
                    <span className="text-xs block">扫描件预览区域</span>
                    <span className="text-xs text-slate-300 mt-1 block">{record.volumeCode || record.archiveCode}</span>
                  </div>
                </div>
                <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
                  卷号: {record.volumeCode || '—'} | 件号: {record.volumeItemNo || '#'} | 页号: {record.pageNo || '—'}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />原生电子件
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span className="text-xs text-green-600">签名有效</span>
                  </span>
                </div>
                <div className="p-4 aspect-[3/4] bg-slate-100 flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    <FileText className="w-12 h-12 mx-auto mb-2" />
                    <span className="text-xs block">电子文件预览区域</span>
                    <span className="text-xs text-slate-300 mt-1 block">
                      {record.components?.length ? `${record.components[0]?.contentType?.toUpperCase()} · ${record.components[0]?.size}` : 'PDF/A · 哈希匹配'}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
                  件号: {record.archiveCode} | 来源: {record.source === 'digital-native' ? '原生电子' : '纸质数字化'}
                </div>
              </div>
            </div>

            {/* 元数据比对 */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />元数据比对
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                    <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-left w-24">字段</th>
                    <th className="px-3 py-2 text-xs font-semibold text-amber-700 text-left">纸质扫描识别</th>
                    <th className="px-3 py-2 text-xs font-semibold text-sky-700 text-left">原生电子元数据</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-center w-16">匹配</th>
                  </tr>
                </thead>
                <tbody>
                  {MOCK_COMPARE_DATA.map((item, i) => (
                    <tr key={i} className="border-b border-slate-100 divide-x divide-slate-100">
                      <td className="px-3 py-2 text-xs text-slate-600 font-medium">{item.field}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{item.scanned}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{item.electronic}</td>
                      <td className="px-3 py-2 text-center">
                        {item.match
                          ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                          : <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortalVolumeSearch;
