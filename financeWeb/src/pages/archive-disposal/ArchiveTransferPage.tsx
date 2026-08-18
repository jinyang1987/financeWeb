/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ArchiveTransferPage — 档案移交（批次执行看板，2026-08-16 接真实现）
 *
 * 与「档案利用 → 案卷移交管理」同一份台账（ams_transfer_batch）：
 *   - 移交管理页：发起移交 + 记录追溯（卷视角）；
 *   - 本页：批次状态流转执行（批次视角）：待准备 → 生成清册 → 待签收 → 已签收归档。
 *
 * 三栏看板：待准备 / 待签收 / 已移交，操作按钮调用真实 API。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Send, FileText, CheckCircle2, Clock, RefreshCw, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import {
  fetchTransferBatches, prepareTransferBatch, receiveTransferBatch,
  rejectTransferBatch, deleteTransferBatch,
  type TransferBatch,
} from '../../services/transferService';

const COLUMNS: { status: string; label: string; hint: string; Icon: typeof Clock }[] = [
  { status: 'pending', label: '待准备', hint: '已发起，待编制移交清册', Icon: Clock },
  { status: 'prepared', label: '待签收', hint: '清册已生成，待接收方确认签收', Icon: FileText },
  { status: 'received', label: '已移交', hint: '双方签收完成，批次归档', Icon: CheckCircle2 },
];

const ArchiveTransferPage: React.FC = () => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [batches, setBatches] = useState<TransferBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setBatches(await fetchTransferBatches({ resolveVolumes: true }));
    } catch (e) {
      triggerToast('批次加载失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setLoading(false);
    }
  }, [triggerToast]);

  useEffect(() => { void reload(); }, [reload]);

  const runAction = async (id: string, action: 'prepare' | 'receive' | 'reject' | 'delete') => {
    setActioning(id + action);
    try {
      if (action === 'prepare') await prepareTransferBatch(id);
      else if (action === 'receive') await receiveTransferBatch(id);
      else if (action === 'reject') await rejectTransferBatch(id);
      else await deleteTransferBatch(id);
      triggerToast({ prepare: '清册已生成', receive: '签收完成', reject: '已退回待准备', delete: '批次已删除' }[action], 'success');
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
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <Send className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">档案移交</h1>
        <span className="text-xs text-slate-400">会计部 → 档案部 正式移交 · 批次状态流转执行板</span>
        <div className="flex-1" />
        <button type="button" onClick={() => void reload()} title="刷新"
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 三栏看板 */}
      <div className="flex-1 overflow-hidden grid grid-cols-3 gap-4 p-6">
        {COLUMNS.map((col) => {
          const list = batches.filter((b) => b.status === col.status);
          return (
            <div key={col.status} className="flex flex-col bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-white border-b border-slate-100 flex items-center gap-2">
                <col.Icon className={`w-4 h-4 ${col.status === 'received' ? 'text-green-500' : col.status === 'prepared' ? 'text-sky-500' : 'text-slate-400'}`} />
                <span className="text-sm font-bold text-slate-700">{col.label}</span>
                <span className="text-xs text-slate-400">{list.length}</span>
                <div className="flex-1" />
                <span className="text-[10px] text-slate-400">{col.hint}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {list.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">暂无批次</p>
                ) : list.map((b) => {
                  const isExpanded = expandedId === b.id;
                  return (
                    <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                      <div className="flex items-center gap-2 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : b.id)}>
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        <span className="font-mono text-xs font-bold text-slate-700">{b.transferNo}</span>
                        <div className="flex-1" />
                        <span className="text-[10px] text-slate-400">{b.transferDate}</span>
                      </div>
                      <div className="mt-1.5 text-xs text-slate-500">
                        {b.fromDept || '—'} → {b.toDept} · {b.totalVolumes} 卷 / {b.totalItems} 件
                      </div>
                      {isExpanded && (
                        <div className="mt-2 border-t border-slate-100 pt-2 space-y-1">
                          {(b.volumes || []).map((v) => (
                            <div key={v.nodeId} className="flex items-center gap-2 text-[11px] text-slate-600">
                              <FileText className="w-3 h-3 text-slate-300 shrink-0" />
                              <span className="truncate flex-1">{v.title}</span>
                              <span className="font-mono text-slate-400">{v.volumeCode || '—'}</span>
                            </div>
                          ))}
                          <div className="text-[10px] text-slate-400 pt-1">
                            移交人 {b.fromPerson || '—'} · 接收人 {b.toPerson || '待确认'}
                            {b.receivedAt && ` · 签收于 ${b.receivedAt.slice(0, 19).replace('T', ' ')}`}
                          </div>
                        </div>
                      )}
                      {/* 状态操作 */}
                      <div className="mt-2.5 flex items-center gap-1.5">
                        {b.status === 'pending' && (
                          <>
                            <button type="button" disabled={actioning === b.id + 'prepare'}
                              onClick={() => void runAction(b.id, 'prepare')}
                              className="flex-1 px-2 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50">
                              生成清册 → 待签收
                            </button>
                            <button type="button" disabled={actioning === b.id + 'delete'}
                              onClick={() => { if (window.confirm(`确认删除批次 ${b.transferNo}？`)) void runAction(b.id, 'delete'); }}
                              className="p-1.5 text-slate-300 hover:text-red-500 transition-colors" title="删除批次">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {b.status === 'prepared' && (
                          <>
                            <button type="button" disabled={actioning === b.id + 'receive'}
                              onClick={() => void runAction(b.id, 'receive')}
                              className="flex-1 px-2 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50">
                              确认签收 → 已移交
                            </button>
                            <button type="button" disabled={actioning === b.id + 'reject'}
                              onClick={() => void runAction(b.id, 'reject')}
                              className="px-2 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
                              退回
                            </button>
                          </>
                        )}
                        {b.status === 'received' && (
                          <span className="flex items-center gap-1 text-[11px] text-green-600">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 双方确认完成
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ArchiveTransferPage;
