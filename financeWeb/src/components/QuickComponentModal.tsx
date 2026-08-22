/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * QuickComponentModal — 「快速组件」配对弹窗（2026-08）
 *
 * 更"放松"的配对交互：把右侧未挂接的原始凭证，通过
 *   · 拖拽：原始凭证卡片 → 记账凭证卡片
 *   · 点击：先点选原始凭证（可多选），再点击记账凭证
 * 配对到左侧记账凭证上，形成「件」单元。
 *
 * 特性：
 *   · 颜色区分：左侧凭证按 蓝/绿/紫… 取色，已配对到该凭证的原始凭证跟随同色，
 *     多凭证同时操作时一眼分清。
 *   · 键盘快捷键：Enter 确认组件，Esc 取消当前选择（无配对时等价关闭）。
 *   · 配对仅存于弹窗内（临时预览），点【确认组件】才批量落库并刷新列表。
 *
 * 本组件为纯 UI 壳：不直接调用服务，配对动作通过 onConfirm 上抛，由父组件
 * 调 linkRecordParent 并刷新——避免侵染既有组件逻辑。
 */

import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { X, Link2, Paperclip, Check, Lightbulb, Trash2, ArrowRight } from 'lucide-react';
import type { ArchiveRecord } from '../types';
import { isSourceDocument } from '../utils/recordType';
import {
  VOUCHER_COLORS,
  colorForIndex,
  emptyQuickComponentState,
  toggleSourceSelection,
  pairSelectedSourcesToVoucher,
  unpairSource,
  validateQuickPairs,
  collectPairActions,
} from '../utils/quickComponent';

export interface QuickComponentProps {
  /** 待配对目标（记账凭证/主体件） */
  vouchers: ArchiveRecord[];
  /** 未挂接的原始凭证（可配对源） */
  sources: ArchiveRecord[];
  open: boolean;
  onClose: () => void;
  /** 确认组件：pairs = 原始凭证id → 记账凭证id */
  onConfirm: (pairs: Map<string, string>) => Promise<void>;
}

/** 把某条记录的金额格式化为 ¥x,xxx.xx */
const fmtAmount = (n: number) =>
  `¥${(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

export const QuickComponentModal: React.FC<QuickComponentProps> = ({
  vouchers,
  sources,
  open,
  onClose,
  onConfirm,
}) => {
  const [state, setState] = useState(emptyQuickComponentState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOverVoucherId, setDragOverVoucherId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // ── 派生：左列凭证取色（按列表顺序 蓝/绿/紫…） ──
  const voucherColors = useMemo(() => vouchers.map((_, i) => colorForIndex(i)), [vouchers]);

  // 已配对的原始凭证 id 集（用于右侧置灰/跟随颜色）
  const pairedSourceIds = useMemo(
    () => new Set(state.pairs.keys()),
    [state.pairs],
  );

  // 右侧未挂接原始凭证：弹窗内已配对的不再单列可拖；仍保留展示（跟随颜色）
  const displaySources = useMemo(
    () => sources.filter((s) => isSourceDocument(s) && !s.parentRecordId),
    [sources],
  );

  // 打开时重置临时状态
  useEffect(() => {
    if (open) {
      setState(emptyQuickComponentState());
      setError(null);
      setSubmitting(false);
      setDragOverVoucherId(null);
    }
  }, [open]);

  // ── 键盘快捷键：Enter 确认组件，Esc 取消选择/关闭 ──
  const handleConfirm = useCallback(async () => {
    if (submitting) return;
    const err = validateQuickPairs(state.pairs);
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(state.pairs);
      onClose();
    } catch (e: any) {
      setError(e.message || '组件失败');
      setSubmitting(false);
    }
  }, [state.pairs, submitting, onConfirm, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // 有点选或配对时先取消选择，再按则关闭
        if (state.selectedSourceIds.size > 0) {
          setState((s) => ({ ...s, selectedSourceIds: new Set() }));
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, state.selectedSourceIds.size, handleConfirm, onClose]);

  if (!open) return null;

  // HTML5 DnD 拖拽源 id（拖拽起始时记录，drop 时读取）
  const dragSourceIdRef = useRef<string | null>(null);

  // ── 交互：点击配对（先点选原始凭证，再点凭证） ──
  const handleVoucherClick = (voucherId: string) => {
    setError(null);
    setState((s) => pairSelectedSourcesToVoucher(s, voucherId, pairedSourceIds));
  };

  // ── 交互：拖拽配对（HTML5 DnD） ──
  const handleDrop = (voucherId: string) => {
    setError(null);
    setDragOverVoucherId(null);
    // 拖拽的是单张原始凭证 id（经 dataTransfer）
    const sid = dragSourceIdRef.current;
    dragSourceIdRef.current = null;
    if (!sid) return;
    // 拖拽配对 = 把该单张原始凭证直接配到目标凭证（覆盖其既有配对目标）
    setState((s) => {
      const pairs = new Map(s.pairs);
      pairs.set(sid, voucherId);
      return { ...s, pairs, selectedSourceIds: new Set() };
    });
  };

  const handleDragStart = (sid: string) => {
    dragSourceIdRef.current = sid;
  };

  const handleDragEnd = () => {
    dragSourceIdRef.current = null;
    setDragOverVoucherId(null);
  };

  // 确认动作收集
  const pairActions = useMemo(() => collectPairActions(state.pairs), [state.pairs]);

  const pairCount = state.pairs.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative bg-white rounded-2xl shadow-2xl w-[min(960px,96vw)] max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 头部 ── */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5 text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-800">快速组件</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              把右侧原始凭证拖到左侧记账凭证上，或先点选再点凭证完成配对 · Enter 确认 · Esc 取消
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── 主体：左右分栏 ── */}
        <div className="flex flex-1 min-h-0">
          {/* 左：记账凭证（配对目标） */}
          <div className="w-[46%] border-r border-slate-200 flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <span className="text-xs font-semibold text-slate-600">记账凭证（配对目标）</span>
              <span className="text-[11px] text-slate-400">{vouchers.length} 张</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {vouchers.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-8">暂无可配对的记账凭证</div>
              ) : (
                vouchers.map((v, i) => {
                  const color = voucherColors[i];
                  // 该凭证下已配对的原始凭证（跟随同色展示）
                  const matched = displaySources.filter((s) => state.pairs.get(s.id) === v.id);
                  const isDragOver = dragOverVoucherId === v.id;
                  return (
                    <div
                      key={v.id}
                      onClick={() => handleVoucherClick(v.id)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverVoucherId(v.id); }}
                      onDragLeave={() => setDragOverVoucherId((cur) => (cur === v.id ? null : cur))}
                      onDrop={(e) => { e.preventDefault(); handleDrop(v.id); }}
                      className={`group relative pl-3 rounded-xl border-2 transition-all cursor-pointer
                        ${isDragOver ? `${color.border} ring-2 ring-offset-1 bg-white` : 'border-slate-200 bg-white hover:border-slate-300'}
                        ${matched.length > 0 ? 'shadow-sm' : ''}`}
                      title={matched.length > 0 ? `已配对 ${matched.length} 张原始凭证` : '点击将点选的原始凭证配到此凭证'}
                    >
                      <span className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${color.bar}`} aria-hidden="true" />
                      <div className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${color.bar} shrink-0`} aria-hidden="true" />
                          <span className={`font-mono font-semibold text-sm ${color.text}`}>{v.voucherNo || '未编号'}</span>
                          <span className="px-1.5 py-px text-[10px] rounded bg-slate-100 text-slate-500">{v.archiveType}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500 truncate">
                          {fmtAmount(v.amount)}{v.month ? ` · ${v.year}-${v.month}` : ''}
                        </div>
                        {/* 该凭证下已配对的原始凭证（同色） */}
                        {matched.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {matched.map((m) => (
                              <div key={m.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] ${color.bgSoft}`}>
                                <Paperclip className={`w-3 h-3 ${color.text} shrink-0`} />
                                <span className={`font-mono font-medium ${color.text}`}>{m.voucherNo || m.archiveCode}</span>
                                <span className="text-slate-400 flex-1 truncate">{m.summary || m.archiveType}</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setState((s) => unpairSource(s, m.id)); }}
                                  className={`p-0.5 rounded ${color.text} hover:opacity-70 shrink-0`}
                                  title="取消配对"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className={`absolute top-1/2 right-2 -translate-y-1/2 opacity-0 group-hover:opacity-100 ${color.text}`}>
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 右：原始凭证（配对源） */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <span className="text-xs font-semibold text-slate-600">原始凭证（可拖拽/点选）</span>
              <span className="text-[11px] text-slate-400">{displaySources.length} 张 · 已配对 {pairCount}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {displaySources.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-8">暂无可配对的原始凭证</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {displaySources.map((s) => {
                    const pairedTo = state.pairs.get(s.id);
                    const isPaired = !!pairedTo;
                    const color = pairedTo
                      ? voucherColors[vouchers.findIndex((v) => v.id === pairedTo)]
                      : null;
                    const isSelected = state.selectedSourceIds.has(s.id);
                    return (
                      <div
                        key={s.id}
                        draggable={!isPaired}
                        onDragStart={() => handleDragStart(s.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => {
                          setError(null);
                          if (isPaired) return; // 已配对的走取消配对
                          setState((st) => toggleSourceSelection(st, s.id, pairedSourceIds));
                        }}
                        title={isPaired
                          ? `已配对到 ${vouchers.find((v) => v.id === pairedTo)?.voucherNo || '凭证'}（点击右侧 🗑 取消配对）`
                          : '点击点选（可多选），再点左侧凭证完成配对；或直接拖拽到左侧凭证'}
                        className={`relative rounded-xl border-2 p-2.5 cursor-pointer transition-all
                          ${isPaired
                            ? `${color?.bgSoft} ${color?.border} opacity-90`
                            : isSelected
                              ? 'border-sky-500 bg-sky-50 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        {isPaired && color && (
                          <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${color.bar}`} aria-hidden="true" />
                        )}
                        <div className="flex items-start gap-2 pl-1">
                          <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${color ? color.bar : isSelected ? 'bg-sky-500' : 'bg-slate-300'}`} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <div className={`font-mono font-semibold text-xs truncate ${color ? color.text : 'text-slate-700'}`}>
                              {s.voucherNo || s.archiveCode}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">{s.archiveType}</div>
                            <div className="text-[11px] text-slate-600 truncate mt-1">{s.summary || '—'}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{fmtAmount(s.amount)}</div>
                          </div>
                          {isPaired ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setState((st) => unpairSource(st, s.id)); }}
                              className={`p-1 rounded ${color?.text} hover:opacity-70 shrink-0`}
                              title="取消配对"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : isSelected ? (
                            <span className="w-4 h-4 rounded-full bg-sky-500 flex items-center justify-center shrink-0 mt-0.5">
                              <Check className="w-3 h-3 text-white" />
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 底部操作栏 ── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 shrink-0">
          {error && (
            <div className="mb-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Lightbulb className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">
              已配对 <strong className="text-slate-700">{pairCount}</strong> 张
              {pairActions.length > 0 && (
                <span className="ml-1 text-slate-400">（{pairActions.map((a) => `${vouchers.find((v) => v.id === a.voucherId)?.voucherNo || ''}×${a.sourceIds.length}`).join('、')}）</span>
              )}
            </span>
            <div className="flex-1" />
            {state.selectedSourceIds.size > 0 && (
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, selectedSourceIds: new Set() }))}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
              >
                取消选择（Esc）
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={submitting || pairCount === 0}
              title={pairCount === 0 ? '请先配对原始凭证' : '批量组件并刷新列表（Enter）'}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? '组件中…' : '确认组件'}
              {pairCount > 0 && !submitting && <span>（{pairCount}）</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickComponentModal;
