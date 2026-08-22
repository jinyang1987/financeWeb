/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * QuickComponentModal — 「快速组件」配对弹窗（2026-08 重设计：凭证优先）
 *
 * 更"放松"的配对交互，与用户原始设想一致：
 *   1. 左侧全是记账凭证——点一下，它"激活"并染上专属颜色；
 *   2. 右侧全是原始凭证——逐个点，点中的立刻配到激活凭证上、跟随同色
 *      （再点一下取消；切到别的凭证后再点 = 搬家）；
 *   3. 也支持直接把原始凭证拖到凭证上；
 *   4. 【确认组件】批量落库成「件」——弹窗保持打开可继续配，
 *      点【关闭】回到工作台，看到的已是组好件的列表。
 *
 * 修复记录（2026-08-22）：旧版把 useRef/useMemo 写在 `if (!open) return null`
 * 之后，违反 Hooks 规则，首次打开即抛 "Rendered more hooks than during the
 * previous render"。现全部 hooks 前置。
 *
 * 本组件为纯 UI 壳：不直接调用服务，配对动作通过 onConfirm 上抛，由父组件
 * 调 linkRecordParent 并刷新——避免侵染既有组件逻辑。
 */

import React, { Fragment, useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { X, Link2, Paperclip, Check, Lightbulb, Sparkles, Inbox } from 'lucide-react';
import type { ArchiveRecord } from '../types';
import { isSourceDocument } from '../utils/recordType';
import {
  colorForIndex,
  emptyQuickComponentState,
  activateVoucher,
  toggleSourcePair,
  pairSourceToVoucher,
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

const STEPS = [
  { n: 1, label: '点凭证选色' },
  { n: 2, label: '点原始凭证' },
  { n: 3, label: '确认组件' },
];

export const QuickComponentModal: React.FC<QuickComponentProps> = ({
  vouchers,
  sources,
  open,
  onClose,
  onConfirm,
}) => {
  // ── 全部 hooks 前置（修复：旧版在 early return 之后调用 hooks 导致崩溃） ──
  const [state, setState] = useState(emptyQuickComponentState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 确认成功后的闪光提示（弹窗保持打开，继续配或关闭） */
  const [flash, setFlash] = useState<string | null>(null);
  const [dragOverVoucherId, setDragOverVoucherId] = useState<string | null>(null);
  /** HTML5 DnD 拖拽源 id（拖拽起始时记录，drop 时读取） */
  const dragSourceIdRef = useRef<string | null>(null);

  // ── 派生：左列凭证取色（按列表顺序 蓝/绿/紫…） ──
  const voucherColors = useMemo(() => vouchers.map((_, i) => colorForIndex(i)), [vouchers]);

  // 弹窗内展示的原始凭证：未挂接的才参与配对
  const displaySources = useMemo(
    () => sources.filter((s) => isSourceDocument(s) && !s.parentRecordId),
    [sources],
  );

  const pairCount = state.pairs.size;
  const pairActions = useMemo(() => collectPairActions(state.pairs), [state.pairs]);

  const activeIndex = state.activeVoucherId
    ? vouchers.findIndex((v) => v.id === state.activeVoucherId)
    : -1;
  const activeColor = activeIndex >= 0 ? voucherColors[activeIndex] : null;
  const activeVoucherNo = activeIndex >= 0 ? (vouchers[activeIndex].voucherNo || '凭证') : '';
  /** 激活凭证当前已配的张数 */
  const activeMatchedCount = state.activeVoucherId
    ? displaySources.filter((s) => state.pairs.get(s.id) === state.activeVoucherId).length
    : 0;

  // 打开时重置临时状态
  useEffect(() => {
    if (open) {
      setState(emptyQuickComponentState());
      setError(null);
      setFlash(null);
      setSubmitting(false);
      setDragOverVoucherId(null);
    }
  }, [open]);

  // 成功闪光 5 秒后自动淡出
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
  }, [flash]);

  // ── 确认：批量落库由父组件执行；成功后弹窗保持打开（可继续配下一组） ──
  const handleConfirm = useCallback(async () => {
    if (submitting) return;
    const err = validateQuickPairs(state.pairs);
    if (err) {
      setError(err);
      return;
    }
    const total = state.pairs.size;
    const summary = collectPairActions(state.pairs)
      .map((a) => {
        const v = vouchers.find((x) => x.id === a.voucherId);
        return `${v?.voucherNo || '凭证'}×${a.sourceIds.length}`;
      })
      .join('、');
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(state.pairs);
      setState(emptyQuickComponentState());
      setFlash(`组件完成：${total} 张原始凭证已挂接（${summary}）。可以继续配对，或关闭查看组好的件`);
    } catch (e: any) {
      setError(e?.message || '组件失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [submitting, state.pairs, onConfirm, vouchers]);

  // ── 键盘快捷键：Enter 确认；Esc 先取消激活，再按则关闭 ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (state.activeVoucherId) {
          setState((s) => ({ ...s, activeVoucherId: null }));
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, state.activeVoucherId, handleConfirm, onClose]);

  // ── 交互：点击左侧凭证 = 激活/取消激活 ──
  const handleVoucherClick = useCallback((voucherId: string) => {
    setError(null);
    setFlash(null);
    setState((s) => activateVoucher(s, voucherId));
  }, []);

  // ── 交互：点击右侧原始凭证 = 配对/取消/搬家 ──
  const handleSourceClick = (sourceId: string) => {
    setError(null);
    setFlash(null);
    if (!state.activeVoucherId && !state.pairs.has(sourceId)) {
      // 无激活凭证且未配对：不改变状态，给出温柔引导
      setError('先点一下左侧记账凭证选个颜色，再点原始凭证配对');
      return;
    }
    setState((s) => toggleSourcePair(s, sourceId));
  };

  // ── 交互：拖拽配对（HTML5 DnD） ──
  const handleDrop = (voucherId: string) => {
    setError(null);
    setFlash(null);
    setDragOverVoucherId(null);
    const sid = dragSourceIdRef.current;
    dragSourceIdRef.current = null;
    if (!sid) return;
    setState((s) => pairSourceToVoucher(s, sid, voucherId));
  };

  // ── 底部引导文案（随状态流动） ──
  const guidance = (() => {
    if (pairCount === 0 && !state.activeVoucherId) {
      return '第 1 步 · 点一下左侧任意记账凭证，给它选个颜色';
    }
    if (state.activeVoucherId && activeColor) {
      return activeMatchedCount === 0
        ? `第 2 步 · 点右侧原始凭证，它们会染上「${activeColor.name}」色`
        : '继续点右侧原始凭证配对，或点【确认组件】落库';
    }
    return `已配对 ${pairCount} 张 · 继续点凭证配对，或直接确认`;
  })();

  if (!open) return null;

  const step = pairCount > 0 ? 3 : state.activeVoucherId ? 2 : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-[3px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-[min(1080px,96vw)] max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 头部：标题 + 三步引导 ── */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-sky-50/70 via-white to-white shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-sky-100 flex items-center justify-center shrink-0 shadow-sm">
            <Link2 className="w-5 h-5 text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              快速组件
              {pairCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-sky-600 text-white leading-none">
                  {pairCount}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              给每张记账凭证配上它的原始凭证，像拼积木一样轻松 · Enter 确认 · Esc 取消
            </p>
          </div>
          {/* 三步进度引导（随操作点亮） */}
          <div className="hidden md:flex items-center gap-1 mr-1" aria-hidden="true">
            {STEPS.map((s) => {
              const isCurrent = step === s.n;
              const isDone = step > s.n;
              return (
                <Fragment key={s.n}>
                  {s.n > 1 && <span className="w-3 h-px bg-slate-200" />}
                  <span
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      isCurrent
                        ? 'bg-sky-600 text-white shadow-sm'
                        : isDone
                          ? 'text-emerald-600 bg-emerald-50'
                          : 'text-slate-400 bg-slate-100'
                    }`}
                  >
                    {isDone ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <span
                        className={`w-3.5 h-3.5 rounded-full text-[9px] flex items-center justify-center leading-none ${
                          isCurrent ? 'bg-white/25' : 'bg-white border border-slate-200'
                        }`}
                      >
                        {s.n}
                      </span>
                    )}
                    {s.label}
                  </span>
                </Fragment>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="关闭（Esc）"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── 主体：左右分栏 ── */}
        <div className="flex flex-1 min-h-0 bg-slate-50/40">
          {/* 左：记账凭证（配对目标） */}
          <div className="w-[46%] border-r border-slate-200 flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-white/70">
              <span className="text-xs font-semibold text-slate-600">记账凭证 · 点一下选色</span>
              <span className="text-[11px] text-slate-400">{vouchers.length} 张</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {vouchers.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-center py-10">
                  <Inbox className="w-8 h-8 text-slate-300" />
                  <div className="text-xs text-slate-400">暂无可配对的记账凭证</div>
                  <div className="text-[11px] text-slate-300">件进入待组卷池后，记账凭证会出现在这里</div>
                </div>
              ) : (
                vouchers.map((v, i) => {
                  const color = voucherColors[i];
                  const isActive = state.activeVoucherId === v.id;
                  const matched = displaySources.filter((s) => state.pairs.get(s.id) === v.id);
                  const isDragOver = dragOverVoucherId === v.id;
                  return (
                    <div
                      key={v.id}
                      onClick={() => handleVoucherClick(v.id)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverVoucherId(v.id); }}
                      onDragLeave={() => setDragOverVoucherId((cur) => (cur === v.id ? null : cur))}
                      onDrop={(e) => { e.preventDefault(); handleDrop(v.id); }}
                      className={`group relative pl-3.5 pr-3 rounded-xl border-2 transition-all duration-150 cursor-pointer
                        ${isActive || isDragOver
                          ? `${color.border} ${color.bgActive} shadow-md ring-2 ${color.ring}`
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}
                      title={isActive
                        ? '已激活：再点一下取消激活；点右侧原始凭证配到此凭证'
                        : '点击激活这张凭证，开始为它配对'}
                    >
                      <span className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${color.bar}`} aria-hidden="true" />
                      <div className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${color.bar} shrink-0`} aria-hidden="true" />
                          <span className={`font-mono font-semibold text-sm ${color.text}`}>{v.voucherNo || '未编号'}</span>
                          <span className="px-1.5 py-px text-[10px] rounded bg-slate-100 text-slate-500">{v.archiveType}</span>
                          {isActive ? (
                            <span className={`ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-white ${color.bar}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse" aria-hidden="true" />
                              配对中
                            </span>
                          ) : matched.length > 0 ? (
                            <span className="ml-auto text-[10px] text-slate-400 shrink-0">已挂 {matched.length} 张</span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500 truncate">
                          {fmtAmount(v.amount)}{v.month ? ` · ${v.year}-${v.month}` : ''}
                        </div>
                        {/* 激活且还没配：虚线提示框（放松的引导感） */}
                        {isActive && matched.length === 0 && (
                          <div className={`mt-2 rounded-lg border border-dashed ${color.border} bg-white/60 px-2.5 py-1.5 text-[11px] ${color.text}`}>
                            点右侧原始凭证，它们会染上「{color.name}」色
                          </div>
                        )}
                        {/* 已配对的原始凭证（同色小条，× 可取消） */}
                        {matched.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {matched.map((m) => (
                              <div key={m.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] bg-white/75 border border-white shadow-sm">
                                <Paperclip className={`w-3 h-3 ${color.text} shrink-0`} />
                                <span className={`font-mono font-medium ${color.text}`}>{m.voucherNo || m.archiveCode}</span>
                                <span className="text-slate-400 flex-1 truncate">{m.summary || m.archiveType}</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setState((s) => unpairSource(s, m.id)); }}
                                  className="p-0.5 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 shrink-0 transition-colors"
                                  title="取消配对"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 右：原始凭证（配对源） */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-white/70">
              <span className="text-xs font-semibold text-slate-600">原始凭证 · 点一下就配对</span>
              <span className="text-[11px] text-slate-400">
                {displaySources.length} 张 · 已配 {pairCount}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {displaySources.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-center py-10">
                  <Paperclip className="w-8 h-8 text-slate-300" />
                  <div className="text-xs text-slate-400">暂无待配对的原始凭证</div>
                  <div className="text-[11px] text-slate-300">所有原始凭证都已名花有主</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {displaySources.map((s) => {
                    const pairedTo = state.pairs.get(s.id) || null;
                    const pairedIndex = pairedTo ? vouchers.findIndex((v) => v.id === pairedTo) : -1;
                    const color = pairedIndex >= 0 ? voucherColors[pairedIndex] : null;
                    const pairedVoucherNo = pairedIndex >= 0 ? (vouchers[pairedIndex].voucherNo || '凭证') : '';
                    const title = color
                      ? state.activeVoucherId === pairedTo
                        ? '点击取消配对'
                        : state.activeVoucherId
                          ? `点击搬家到凭证 ${activeVoucherNo}`
                          : '点击取消配对'
                      : state.activeVoucherId
                        ? `点击配对到凭证 ${activeVoucherNo}（${activeColor?.name}）`
                        : '先点左侧记账凭证选色，再点这里配对；也可直接拖拽';
                    return (
                      <div
                        key={s.id}
                        draggable
                        onDragStart={() => { dragSourceIdRef.current = s.id; }}
                        onDragEnd={() => { dragSourceIdRef.current = null; setDragOverVoucherId(null); }}
                        onClick={() => handleSourceClick(s.id)}
                        title={title}
                        className={`group relative rounded-xl border-2 p-2.5 cursor-pointer select-none transition-all duration-150
                          ${color
                            ? `${color.bgSoft} ${color.border} shadow-sm`
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm hover:-translate-y-px'}`}
                      >
                        {/* 未配对 + 有激活凭证：悬停时显示"将染上这个颜色"的虚线圆圈 */}
                        {!color && activeColor && (
                          <span
                            className="absolute top-2 right-2 w-3.5 h-3.5 rounded-full border-2 border-dashed opacity-0 group-hover:opacity-70 transition-opacity"
                            style={{ borderColor: activeColor.hex }}
                            aria-hidden="true"
                          />
                        )}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1 h-6 rounded-full shrink-0 ${color ? color.bar : 'bg-slate-200'}`} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <div className={`font-mono font-semibold text-xs truncate ${color ? color.text : 'text-slate-700'}`}>
                              {s.voucherNo || s.archiveCode}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">{s.archiveType}</div>
                          </div>
                          {color && pairedVoucherNo && (
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-white ${color.bar} shrink-0`}>
                              → {pairedVoucherNo}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 pl-2.5">
                          <div className="text-[12px] font-semibold text-slate-700">{fmtAmount(s.amount)}</div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{s.summary || '—'}</div>
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
        <div className="px-6 py-3.5 border-t border-slate-100 bg-white shrink-0">
          {flash && (
            <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="min-w-0 truncate">{flash}</span>
            </div>
          )}
          {error && (
            <div className="mb-2.5 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Lightbulb className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
              <Lightbulb className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span className="truncate">{guidance}</span>
            </span>
            <div className="flex-1" />
            {pairActions.length > 0 && (
              <span className="text-[11px] text-slate-400 hidden lg:inline">
                {pairActions.map((a) => `${vouchers.find((v) => v.id === a.voucherId)?.voucherNo || ''}×${a.sourceIds.length}`).join('、')}
              </span>
            )}
            {state.activeVoucherId && (
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, activeVoucherId: null }))}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
              >
                取消激活（Esc）
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
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 active:scale-[.98] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              {submitting ? '落库中…' : `确认组件${pairCount > 0 ? `（${pairCount}）` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickComponentModal;
