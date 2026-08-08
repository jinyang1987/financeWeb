/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * TransferManagePage — 案卷移交管理
 *
 * 功能：
 *   1. 查看待移交案卷（保管期满1年）
 *   2. 发起移交、生成移交清册
 *   3. 接收方确认签收
 *   4. 移交记录追溯
 */

import React, { useState, useMemo } from 'react';
import { FileText, CheckCircle2, XCircle, Clock, Send, Download, AlertCircle, Search, ChevronDown, ChevronRight, Printer } from 'lucide-react';
import { useVolumeStore, toCategoryCode } from '../../stores/volumeStore';

/** 大类代码 → 中文名 */
const CATEGORY_NAMES: Record<string, string> = {
  KP: '会计凭证', KB: '会计账簿', FB: '财务报表', QT: '其他会计资料',
};

// ── 移交记录 ──
interface TransferRecord {
  id: string;
  transferNo: string;
  fromDept: string;
  toDept: string;
  fromPerson: string;
  toPerson: string;
  volumeIds: string[];
  totalVolumes: number;
  totalItems: number;
  prepareDate: string;
  transferDate: string;
  custodyExpireDate: string;
  status: 'pending' | 'prepared' | 'transferred' | 'rejected';
}

// ── Mock 移交记录（预置示例，后续与真实 transferLog 合并显示） ──
const MOCK_TRANSFERS: TransferRecord[] = [
  { id: 'tr-1', transferNo: 'TJ-2026-001', fromDept: '财务部', toDept: '档案部', fromPerson: '李四', toPerson: '王五', volumeIds: ['v-1', 'v-2'], totalVolumes: 2, totalItems: 34, prepareDate: '2026-06-10', transferDate: '2026-06-13', custodyExpireDate: '2026-06-01', status: 'transferred' },
];

// ── 子组件 ──
const StatusBadge: React.FC<{ status: TransferRecord['status'] }> = ({ status }) => {
  const config: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
    pending: { label: '待移交', bg: 'bg-slate-100', color: 'text-slate-600', icon: <Clock className="w-3 h-3" /> },
    prepared: { label: '已准备', bg: 'bg-sky-100', color: 'text-sky-700', icon: <FileText className="w-3 h-3" /> },
    transferred: { label: '已移交', bg: 'bg-green-100', color: 'text-green-700', icon: <CheckCircle2 className="w-3 h-3" /> },
    rejected: { label: '退回', bg: 'bg-red-100', color: 'text-red-700', icon: <XCircle className="w-3 h-3" /> },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${c.bg} ${c.color}`}>
      {c.icon}
      {c.label}
    </span>
  );
};

const TransferManagePage: React.FC = () => {
  const volumes = useVolumeStore((s) => s.volumes);
  const transferLog = useVolumeStore((s) => s.transferLog);
  // 合并 mock 示例 + 真实移交日志
  const allTransfers = useMemo<TransferRecord[]>(() => {
    const real: TransferRecord[] = transferLog.map((log) => ({
      id: log.id,
      transferNo: log.transferNo,
      fromDept: log.fromDept,
      toDept: log.toDept,
      fromPerson: log.fromPerson,
      toPerson: log.toPerson,
      volumeIds: log.volumeIds,
      totalVolumes: log.totalVolumes,
      totalItems: log.totalItems,
      prepareDate: log.transferDate,
      transferDate: log.transferDate,
      custodyExpireDate: '',
      status: 'transferred' as const,
    }));
    return [...real, ...MOCK_TRANSFERS];
  }, [transferLog]);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 可移交案卷（已确认但未移交）
  const availableVolumes = useMemo(() => {
    return volumes.filter((v) =>
      ['confirmed', 'numbered', 'completed'].includes(v.status)
    );
  }, [volumes]);

  const filteredTransfers = useMemo(() => {
    if (activeTab === 'pending') return allTransfers.filter((t) => t.status !== 'transferred');
    return allTransfers;
  }, [allTransfers, activeTab]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrepareTransfer = () => {
    if (selected.size === 0) return;
    const store = useVolumeStore.getState();
    let totalItems = 0;
    for (const vid of selected) {
      const vol = store.volumes.find((v) => v.id === vid);
      if (vol && ['confirmed', 'numbered', 'completed'].includes(vol.status)) {
        store.transferVolume(vid);
        totalItems += (store.volumeItems[vid] || []).length;
      }
    }
    alert(`已移交 ${selected.size} 卷，共 ${totalItems} 件`);
    setSelected(new Set());
  };

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200">
        <FileText className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">案卷移交管理</h1>
        <div className="flex items-center gap-1 ml-4 bg-slate-100 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'pending' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'}`}
          >
            待处理
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'all' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'}`}
          >
            全部记录
          </button>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handlePrepareTransfer}
          disabled={selected.size === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:bg-slate-300 transition-colors"
        >
          <Send className="w-4 h-4" />
          发起移交{selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 可移交案卷 */}
        {activeTab === 'pending' && availableVolumes.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              可移交案卷（会计部临时保管期满）
              <span className="text-xs font-normal text-slate-400">({availableVolumes.length} 卷)</span>
            </h3>
            <div className="space-y-1.5">
              {availableVolumes.map((v) => (
                <label
                  key={v.id}
                  className="flex items-center gap-3 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggleSelect(v.id)}
                    className="rounded border-slate-300"
                  />
                  <span className="flex-1 font-medium text-slate-700">{v.volumeCode || v.title}</span>
                  <span className="text-xs text-slate-500">{v.archiveType || CATEGORY_NAMES[toCategoryCode(v.archiveTypeCode, v.archiveType)]} | {v.retention || v.retentionCode} | {v.totalItems}件</span>
                  <span className="text-xs text-green-600 inline-flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> 可移交</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 移交记录 */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">移交记录</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredTransfers.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-slate-400">暂无移交记录</div>
            ) : (
              filteredTransfers.map((tr) => {
                const isExpanded = expandedId === tr.id;
                return (
                  <div key={tr.id}>
                    <div
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : tr.id)}
                    >
                      <button type="button" className="p-0.5 text-slate-400">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <span className="font-mono text-sm font-semibold text-slate-700 w-28">{tr.transferNo}</span>
                      <span className="text-xs text-slate-500 w-24">{tr.prepareDate || '—'}</span>
                      <span className="text-xs text-slate-600 w-28">{tr.fromDept} → {tr.toDept}</span>
                      <span className="text-xs text-slate-500 w-16">{tr.totalVolumes} 卷</span>
                      <StatusBadge status={tr.status} />
                      <div className="flex-1" />
                      {tr.status === 'prepared' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); alert('确认签收'); }}
                          className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100"
                        >
                          确认签收
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); alert('下载移交清册'); }}
                        className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="px-5 pb-3 bg-slate-50 grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400">移交人:</span> {tr.fromPerson}
                        </div>
                        <div>
                          <span className="text-slate-400">接收人:</span> {tr.toPerson || '待确认'}
                        </div>
                        <div>
                          <span className="text-slate-400">保管期满:</span> {tr.custodyExpireDate}
                        </div>
                        <div>
                          <span className="text-slate-400">移交日期:</span> {tr.transferDate || '—'}
                        </div>
                        <div>
                          <span className="text-slate-400">总件数:</span> {tr.totalItems}
                        </div>
                        <div>
                          <span className="text-slate-400">案卷:</span> {tr.volumeIds.join(', ')}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 法规提示 */}
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
          <div className="flex items-start gap-2 text-xs text-sky-800">
            <AlertCircle className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">依据 79号令 第十二条</p>
              <p className="mt-0.5">会计档案临时保管期满（1年，最长不超过3年）后，应由会计机构编制移交清册，向档案机构正式移交。移交时保持原卷封装，电子档案需同步移交元数据和数字签名。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransferManagePage;


