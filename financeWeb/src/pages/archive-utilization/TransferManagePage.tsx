/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * TransferManagePage — 案卷移交管理（对外移交发起，2026-08-16 接真重构）
 *
 * 业务定位（与组卷工作台「移交归盒」的区别）：
 *   - 移交归盒：所内归档动作（卷 → 盒库），在组卷工作台完成；
 *   - 本页：会计部临时保管期满后，向档案部（馆）的对外正式移交（79号令第十二条），
 *     批次台账落 ams_transfer_batch，全流程真实 API。
 *
 * 功能：
 *   1. 可移交案卷识别（已入库 transferred 状态的案卷）
 *   2. 发起移交（勾选案卷 → 建批次 pending → 生成清册 → 签收）
 *   3. 移交记录追溯（批次状态机 pending/prepared/received，卷明细实时解析）
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { FileText, CheckCircle2, XCircle, Clock, Send, Download, AlertCircle, ChevronDown, ChevronRight, Trash2, RefreshCw } from 'lucide-react';
import { useVolumeStore, toCategoryCode } from '../../stores/volumeStore';
import { useArchiveStore } from '../../stores/archiveStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import {
  fetchTransferBatches, createTransferBatch, prepareTransferBatch,
  receiveTransferBatch, rejectTransferBatch, deleteTransferBatch,
  type TransferBatch,
} from '../../services/transferService';

/** 大类代码 → 中文名 */
const CATEGORY_NAMES: Record<string, string> = {
  KP: '会计凭证', KB: '会计账簿', FB: '财务报表', QT: '其他会计资料',
};

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: '待准备', bg: 'bg-slate-100', color: 'text-slate-600' },
  prepared: { label: '待签收', bg: 'bg-sky-100', color: 'text-sky-700' },
  received: { label: '已移交', bg: 'bg-green-100', color: 'text-green-700' },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const c = STATUS_META[status] || STATUS_META.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${c.bg} ${c.color}`}>
      {status === 'received' ? <CheckCircle2 className="w-3 h-3" /> : status === 'prepared' ? <FileText className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {c.label}
    </span>
  );
};

const TransferManagePage: React.FC = () => {
  const volumes = useVolumeStore((s) => s.volumes);
  const loadVolumes = useVolumeStore((s) => s.loadVolumes);
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);
  const currentUser = useAuthStore((s) => s.currentUser);
  const triggerToast = useAppStore((s) => s.triggerToast);

  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [batches, setBatches] = useState<TransferBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setBatches(await fetchTransferBatches({ resolveVolumes: true }));
    } catch (e) {
      triggerToast('移交批次加载失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setLoading(false);
    }
  }, [triggerToast]);

  useEffect(() => {
    void reload();
    if (currentFanzongCode) void loadVolumes(currentFanzongCode);
  }, [reload, currentFanzongCode, loadVolumes]);

  // ── 可移交案卷 = 已入库（transferred）且未被任何未终结批次引用的案卷 ──
  const inFlightVolumeIds = useMemo(() => {
    const set = new Set<string>();
    batches.filter((b) => b.status !== 'received').forEach((b) => b.volumeNodes.forEach((id) => set.add(id)));
    return set;
  }, [batches]);

  const availableVolumes = useMemo(
    () => volumes.filter((v) => v.status === 'transferred' && !inFlightVolumeIds.has(v.id)),
    [volumes, inFlightVolumeIds],
  );

  const filteredBatches = useMemo(() => {
    if (activeTab === 'pending') return batches.filter((b) => b.status !== 'received');
    return batches;
  }, [batches, activeTab]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runAction = async (id: string, action: 'prepare' | 'receive' | 'reject' | 'delete') => {
    setActioning(id + action);
    try {
      if (action === 'prepare') await prepareTransferBatch(id);
      else if (action === 'receive') await receiveTransferBatch(id);
      else if (action === 'reject') await rejectTransferBatch(id);
      else await deleteTransferBatch(id);
      triggerToast({ prepare: '清册已生成，批次转待签收', receive: '签收完成，批次已归档', reject: '批次已退回待准备', delete: '批次已删除' }[action], 'success');
      await reload();
    } catch (e) {
      triggerToast('操作失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200">
        <FileText className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">案卷移交管理</h1>
        <div className="flex items-center gap-1 ml-4 bg-slate-100 rounded-lg p-0.5">
          {(['pending', 'all'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === t ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'}`}>
              {t === 'pending' ? '待处理' : '全部记录'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button type="button" onClick={() => void reload()} title="刷新"
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button type="button" onClick={() => setCreateOpen(true)} disabled={selected.size === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:bg-slate-300 transition-colors">
          <Send className="w-4 h-4" />
          发起移交{selected.size > 0 ? ` (${selected.size})` : ''}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 可移交案卷（已入库） */}
        {activeTab === 'pending' && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              可移交案卷（已入库，会计部临时保管期满可发起对外移交）
              <span className="text-xs font-normal text-slate-400">({availableVolumes.length} 卷)</span>
            </h3>
            {availableVolumes.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">暂无可移交案卷（案卷须先在组卷工作台完成移交归盒入库）</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {availableVolumes.map((v) => (
                  <label key={v.id}
                    className="flex items-center gap-3 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                    <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleSelect(v.id)}
                      className="rounded border-slate-300" />
                    <span className="flex-1 font-medium text-slate-700 truncate">{v.title}</span>
                    <span className="font-mono text-xs text-slate-400">{v.volumeCode || '未赋号'}</span>
                    <span className="text-xs text-slate-500">
                      {v.archiveType || CATEGORY_NAMES[toCategoryCode(v.archiveTypeCode, v.archiveType)]} · {v.year}年 · {v.retention || v.retentionCode} · {v.totalItems}件
                      {v.boxNo ? ` · ${v.boxNo}` : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 移交批次记录 */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">移交批次记录</h3>
            <span className="text-xs text-slate-400">{filteredBatches.length} 个批次</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredBatches.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-slate-400">{loading ? '加载中…' : '暂无移交批次'}</div>
            ) : (
              filteredBatches.map((tr) => {
                const isExpanded = expandedId === tr.id;
                return (
                  <div key={tr.id}>
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : tr.id)}>
                      <button type="button" className="p-0.5 text-slate-400">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <span className="font-mono text-sm font-semibold text-slate-700 w-40">{tr.transferNo}</span>
                      <span className="text-xs text-slate-500 w-24">{tr.transferDate || '—'}</span>
                      <span className="text-xs text-slate-600 w-36 truncate">{tr.fromDept || '—'} → {tr.toDept}</span>
                      <span className="text-xs text-slate-500 w-20">{tr.totalVolumes} 卷/{tr.totalItems} 件</span>
                      <StatusBadge status={tr.status} />
                      <div className="flex-1" />
                      {tr.status === 'pending' && (
                        <>
                          <button type="button" disabled={actioning === tr.id + 'prepare'}
                            onClick={(e) => { e.stopPropagation(); void runAction(tr.id, 'prepare'); }}
                            className="px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 disabled:opacity-50">
                            生成清册
                          </button>
                          <button type="button" disabled={actioning === tr.id + 'delete'}
                            onClick={(e) => { e.stopPropagation(); if (window.confirm(`确认删除批次 ${tr.transferNo}？`)) void runAction(tr.id, 'delete'); }}
                            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors" title="删除批次">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {tr.status === 'prepared' && (
                        <>
                          <button type="button" disabled={actioning === tr.id + 'receive'}
                            onClick={(e) => { e.stopPropagation(); void runAction(tr.id, 'receive'); }}
                            className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 disabled:opacity-50">
                            确认签收
                          </button>
                          <button type="button" disabled={actioning === tr.id + 'reject'}
                            onClick={(e) => { e.stopPropagation(); void runAction(tr.id, 'reject'); }}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50">
                            退回
                          </button>
                        </>
                      )}
                      <button type="button" title="打印移交清册"
                        onClick={(e) => { e.stopPropagation(); setExpandedId(tr.id); setTimeout(() => window.print(), 200); }}
                        className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50">
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="px-5 pb-4 bg-slate-50 text-xs space-y-3">
                        <div className="grid grid-cols-3 gap-3 pt-3">
                          <div><span className="text-slate-400">移交人:</span> {tr.fromPerson || '—'}</div>
                          <div><span className="text-slate-400">接收人:</span> {tr.toPerson || '待确认'}</div>
                          <div><span className="text-slate-400">签收时间:</span> {tr.receivedAt ? tr.receivedAt.slice(0, 19).replace('T', ' ') : '—'}</div>
                        </div>
                        {/* 移交清册（卷明细实时解析） */}
                        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                          <div className="px-3 py-2 bg-slate-100 text-slate-600 font-medium">移交清册（{tr.volumes?.length ?? tr.totalVolumes} 卷）</div>
                          <table className="w-full">
                            <thead>
                              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                                <th className="px-4 py-3 text-left text-[13px] font-semibold">案卷题名</th>
                                <th className="px-4 py-3 text-left text-[13px] font-semibold w-44">档号</th>
                                <th className="px-4 py-3 text-left text-[13px] font-semibold w-16">件数</th>
                                <th className="px-4 py-3 text-left text-[13px] font-semibold w-20">状态</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(tr.volumes || []).map((v) => (
                                <tr key={v.nodeId} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                                  <td className="px-4 py-3 text-sm text-slate-800">{v.title}</td>
                                  <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{v.volumeCode || '—'}</td>
                                  <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{v.totalItems}</td>
                                  <td className="px-4 py-3 text-[13px] text-slate-600">{v.status === 'missing' ? '已删除' : v.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
      </div>

      {/* 发起移交弹窗 */}
      {createOpen && (
        <CreateTransferModal
          volumeIds={[...selected]}
          onClose={() => setCreateOpen(false)}
          onDone={async () => {
            setCreateOpen(false);
            setSelected(new Set());
            await reload();
          }}
          defaultFromPerson={currentUser?.name || ''}
        />
      )}
    </div>
  );
};

// ── 发起移交弹窗 ──
const CreateTransferModal: React.FC<{
  volumeIds: string[];
  onClose: () => void;
  onDone: () => Promise<void>;
  defaultFromPerson: string;
}> = ({ volumeIds, onClose, onDone, defaultFromPerson }) => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [fromDept, setFromDept] = useState('财务部');
  const [toDept, setToDept] = useState('档案部');
  const [fromPerson, setFromPerson] = useState(defaultFromPerson);
  const [toPerson, setToPerson] = useState('');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!toDept.trim()) { triggerToast('接收单位不能为空', 'warning'); return; }
    setSubmitting(true);
    try {
      const r = await createTransferBatch({
        fromDept: fromDept.trim(), toDept: toDept.trim(),
        fromPerson: fromPerson.trim(), toPerson: toPerson.trim(),
        volumeNodes: volumeIds, transferDate,
      });
      triggerToast(`移交批次 ${r.transferNo} 已创建（${r.totalVolumes} 卷/${r.totalItems} 件），待生成清册`, 'success');
      await onDone();
    } catch (e) {
      triggerToast('发起移交失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[460px] bg-white rounded-2xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-slate-800">发起对外移交（{volumeIds.length} 卷）</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="block">
            <span className="text-xs text-slate-500">移交单位</span>
            <input value={fromDept} onChange={(e) => setFromDept(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">接收单位 *</span>
            <input value={toDept} onChange={(e) => setToDept(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">移交人</span>
            <input value={fromPerson} onChange={(e) => setFromPerson(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">接收人（签收时可补）</span>
            <input value={toPerson} onChange={(e) => setToPerson(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </label>
          <label className="block col-span-2">
            <span className="text-xs text-slate-500">移交日期</span>
            <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">取消</button>
          <button type="button" onClick={() => void submit()} disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50">
            {submitting ? '创建中…' : '创建移交批次'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransferManagePage;
