/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * VolumeItemSearchPage — 关联查询
 *
 * 功能：
 *   1. 统一检索（跨卷/件）
 *   2. 结果展示卷位置 + 电子件信息
 *   3. 同屏对比纸质扫描件和原生电子件
 *   4. 元数据比对
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Search, FileText, FolderTree, BookOpen, CheckCircle2, ChevronDown, ExternalLink, Package } from 'lucide-react';
import { useVolumeStore, toCategoryCode } from '../../stores/volumeStore';
import { useArchiveStore } from '../../stores/archiveStore';
import ArchiveStatusTags from '../../components/borrow/ArchiveStatusTags';
import type { Volume } from '../../types/volume';

/** 大类代码 → 中文名 */
const CATEGORY_NAMES: Record<string, string> = {
  KP: '会计凭证', KB: '会计账簿', FB: '财务报表', QT: '其他会计资料',
};

// ── 搜索结果类型 ──
interface SearchResult {
  type: 'item' | 'volume';
  id: string;
  title: string;
  subtitle: string;
  matchField: string;
  volumeInfo?: string;       // 卷位置信息
  itemInfo?: string;         // 电子件信息
  recordId?: string;         // 关联的记录ID
  volume?: Volume;           // 关联的案卷
}

const VolumeItemSearchPage: React.FC = () => {
  // 全量件（含已组卷卷内件）：关联查询要能在归档态数据中定位件↔卷↔盒（2026-08-16 贯通修复）
  const records = useArchiveStore((s) => s.allRecords);
  const loadAllRecords = useArchiveStore((s) => s.loadAllRecords);
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);
  const volumes = useVolumeStore((s) => s.volumes);
  const volumeItems = useVolumeStore((s) => s.volumeItems);
  const loadVolumes = useVolumeStore((s) => s.loadVolumes);

  // 挂载刷新全量件与卷列表（归档/移交后的最新归属立即可查）
  useEffect(() => {
    void loadAllRecords();
    if (currentFanzongCode) void loadVolumes(currentFanzongCode);
  }, [loadAllRecords, loadVolumes, currentFanzongCode]);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [compareRecord, setCompareRecord] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  const recordById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  // 搜索
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();

    const res: SearchResult[] = [];

    // 搜索件（记录）
    for (const r of records) {
      if (
        r.voucherNo.toLowerCase().includes(q) ||
        r.archiveCode.toLowerCase().includes(q) ||
        r.amount.toString().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        r.archiveType.toLowerCase().includes(q)
      ) {
        // 查找所属卷
        let volInfo = '未组卷';
        let vol: Volume | undefined;
        if (r.volumeId) {
          vol = volumes.find((v) => v.id === r.volumeId);
          if (vol) volInfo = `${vol.volumeCode || vol.title}`;
        } else if (r.volumeCode) {
          vol = volumes.find((v) => v.volumeCode === r.volumeCode);
          if (vol) volInfo = `${vol.volumeCode || vol.title}`;
          else volInfo = `${r.volumeCode}`;
        }

        res.push({
          type: 'item',
          id: r.id,
          title: r.voucherNo,
          subtitle: `${r.archiveType} | ¥${r.amount.toLocaleString()} | ${r.year}-${r.month}`,
          matchField: '凭证号/档号/金额',
          volumeInfo: volInfo,
          itemInfo: (r.carrierType === 'electronic' || r.source === 'digital-native') ? '原生电子文件' : '纸质数字化副本',
          recordId: r.id,
          volume: vol,
        });
      }
    }

    // 搜索卷
    for (const v of volumes) {
      if (
        (v.volumeCode && v.volumeCode.toLowerCase().includes(q)) ||
        v.title.toLowerCase().includes(q) ||
        v.archiveType.includes(q)
      ) {
        const items = volumeItems[v.id] || [];
        res.push({
          type: 'volume',
          id: v.id,
          title: v.volumeCode || v.title,
          subtitle: `${v.archiveType || CATEGORY_NAMES[toCategoryCode(v.archiveTypeCode, v.archiveType)]} | ${v.retention || v.retentionCode} | ${v.totalItems}件 | ${v.dateFrom}~${v.dateTo}`,
          matchField: '案卷号/题名',
          volumeInfo: v.volumeCode || v.title,
          volume: v,
        });
      }
    }

    return res;
  }, [query, records, volumes, volumeItems]);

  const handleSearch = () => {
    setSearched(true);
    setShowCompare(false);
  };

  const handleCompare = (recordId: string) => {
    setCompareRecord(recordId);
    setShowCompare(true);
  };

  const record = compareRecord ? records.find((r) => r.id === compareRecord) : null;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="px-6 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-500 shrink-0" />
          <div className="relative flex-1 max-w-xl">
            <input
              type="text"
              placeholder="输入凭证号、档号、金额、摘要进行统一检索..."
              className="w-full pl-4 pr-10 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-200"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              type="button"
              onClick={handleSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white bg-sky-600 rounded-lg hover:bg-sky-700"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setSearched(false); setShowCompare(false); }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              清除
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* 未搜索状态 */}
        {!searched && !showCompare && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <BookOpen className="w-12 h-12 mb-3" />
            <span className="text-sm font-medium">关联查询</span>
          </div>
        )}

        {/* 搜索结果 */}
        {searched && !showCompare && (
          <div className="space-y-4 max-w-3xl mx-auto">
            <div className="text-sm text-slate-500">
              找到 <strong className="text-slate-700">{results.length}</strong> 条匹配结果
              {query && <span className="text-slate-400">（关键词: "{query}"）</span>}
            </div>

            {results.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
                <Search className="w-8 h-8 mx-auto mb-2" />
                <span className="text-sm">未找到匹配结果</span>
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((r) => (
                  <div
                    key={`${r.type}-${r.id}`}
                    className="bg-white border border-slate-200 rounded-xl p-4 hover:border-sky-200 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${r.type === 'volume' ? 'bg-amber-50' : 'bg-sky-50'}`}>
                        {r.type === 'volume' ? (
                          <FolderTree className="w-4 h-4 text-amber-500" />
                        ) : (
                          <FileText className="w-4 h-4 text-sky-500" />
                        )}
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
                        <div className="flex items-center gap-4 mt-1.5 text-xs">
                          {r.type === 'item' && r.recordId && recordById.get(r.recordId) && (
                            <>
                              <span className="text-slate-500">
                                <Package className="w-3.5 h-3.5 inline mr-0.5" /> 卷: <strong className="text-slate-700">{r.volumeInfo}</strong>
                              </span>
                              <ArchiveStatusTags record={recordById.get(r.recordId)!} />
                            </>
                          )}
                          {r.type === 'volume' && r.volume && (
                            <span className="text-slate-500">
                              全宗: {r.volume.fondsCode} | 状态: {r.volume.status}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {r.type === 'item' && r.recordId && (
                          <button
                            type="button"
                            onClick={() => handleCompare(r.recordId!)}
                            className="px-3 py-1.5 text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100"
                          >
                            同屏对比
                          </button>
                        )}
                        {r.type === 'volume' && (
                          <button
                            type="button"
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                          >
                            查看案卷
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
        {showCompare && record && (
          <div className="max-w-5xl mx-auto space-y-4">
            <button
              type="button"
              onClick={() => setShowCompare(false)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
              <ChevronDown className="w-3 h-3 rotate-90" />
              返回搜索结果
            </button>

            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-sky-500" />
              同屏对比 · {record.voucherNo}
            </h2>

            {/* 左右对比（2026-08-16 贯通修复：全部改真实数据，移除假页码/假签名/假比对表） */}
            <div className="grid grid-cols-2 gap-4">
              {/* 左：纸质扫描件 */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    纸质扫描件
                  </span>
                  <span className="text-xs text-amber-600">{record.carrierType === 'paper' ? '纸质数字化' : '非纸质件'}</span>
                </div>
                <div className="p-4 aspect-[3/4] bg-slate-100 flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    <BookOpen className="w-12 h-12 mx-auto mb-2" />
                    {record.carrierType === 'paper' || record.source === 'digitized' ? (
                      <>
                        <span className="text-xs block">该件含扫描版式文件</span>
                        <button
                          type="button"
                          onClick={() => window.open(`/api/ams/records/${record.id}/content`, '_blank')}
                          className="mt-2 px-3 py-1.5 text-xs text-sky-600 border border-sky-200 bg-white rounded-lg hover:bg-sky-50"
                        >
                          打开原件预览（新窗口）
                        </button>
                      </>
                    ) : (
                      <span className="text-xs block">原生电子件，无纸质扫描副本</span>
                    )}
                  </div>
                </div>
                <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
                  档号: {record.archiveCode || '未赋号'} {record.volumeCode ? `· 卷号: ${record.volumeCode}` : ''}
                </div>
              </div>

              {/* 右：原生电子件 */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-sky-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    原生电子件
                  </span>
                  <span className="text-xs text-sky-600">{record.numbered ? '已赋号' : '未赋号'}</span>
                </div>
                <div className="p-4 aspect-[3/4] bg-slate-100 flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    <FileText className="w-12 h-12 mx-auto mb-2" />
                    <span className="text-xs block">电子文件预览区域</span>
                    <button
                      type="button"
                      onClick={() => window.open(`/api/ams/records/${record.id}/content`, '_blank')}
                      className="mt-2 px-3 py-1.5 text-xs text-sky-600 border border-sky-200 bg-white rounded-lg hover:bg-sky-50"
                    >
                      打开原件预览（新窗口）
                    </button>
                  </div>
                </div>
                <div className="px-4 py-2 border-t border-slate-100 text-xs text-slate-500">
                  件号: {record.archiveCode || '—'} | 来源: {record.source === 'digital-native' ? '原生电子' : '纸质数字化'}
                </div>
              </div>
            </div>

            {/* 元数据比对（电子侧为真实元数据；扫描侧逐字段 OCR 抽取能力待建设，如实标注） */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                元数据比对
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                    <th className="px-3 py-2 text-xs font-semibold text-slate-600 text-left w-24">字段</th>
                    <th className="px-3 py-2 text-xs font-semibold text-amber-700 text-left">纸质扫描识别</th>
                    <th className="px-3 py-2 text-xs font-semibold text-sky-700 text-left">系统元数据（真实）</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { field: '凭证号', value: record.voucherNo },
                    { field: '金额', value: record.amount ? `¥${record.amount.toLocaleString()}` : '—' },
                    { field: '会计期间', value: `${record.year}${record.month ? '-' + record.month : ''}` },
                    { field: '部门', value: record.department || '—' },
                    { field: '摘要', value: record.remarks || '—' },
                  ].map((row) => (
                    <tr key={row.field} className="border-b border-slate-100 divide-x divide-slate-100">
                      <td className="px-3 py-2 text-xs text-slate-600 font-medium">{row.field}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">待逐字段 OCR 抽取</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{row.value}</td>
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

export default VolumeItemSearchPage;


