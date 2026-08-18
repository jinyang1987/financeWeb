/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * BorrowCartCheckout — 借阅车统一结算（PRD 2.1 借阅申请单生成）
 *
 * 明细行（每件档案）：
 *   自动带出：题名 / 档案类型 / 介质类型 / 密级 / 实时库存状态
 *   用户必填：电子权限（在线浏览/允许下载/允许打印）· 实体外借（原件/复印件）
 * 主单：借阅事由（下拉+说明）· 借阅周期（起止日期，最长30天可配置）
 * 提交前校验：黑名单 / 至少一行有权限 / 周期合法
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  ShoppingCart, Trash2, Send, Lock, AlertTriangle, Info,
} from 'lucide-react';
import { useBorrowStore, volumeStockStatus } from '../../../stores/borrowStore';
import { useArchiveStore } from '../../../stores/archiveStore';
import { useVolumeStore } from '../../../stores/volumeStore';
import { useAuthStore } from '../../../stores/authStore';
import { useAppStore } from '../../../stores/appStore';
import {
  REASON_OPTIONS, MAX_BORROW_DAYS, PERM_LABELS,
  MEDIA_TYPE_LABELS, STOCK_LABELS,
  type BorrowOrderItem, type ElectronicPerm, type PhysicalMode,
} from '../../../types/borrow';
import { computeApprovalRoute, todayStr } from '../../../utils/borrowEngine';
import { useWorkflowConfigStore, getChainRules } from '../../../stores/workflowConfigStore';
import type { ArchiveRecord } from '../../../types';
import type { Volume } from '../../../types/volume';

interface BorrowCartCheckoutProps {
  blacklisted: boolean;
  onSubmitted: () => void;
}

interface LineDraft {
  perms: Set<ElectronicPerm>;
  physical: PhysicalMode;
}

const SECURITY_COLORS: Record<string, string> = {
  普通: 'bg-slate-100 text-slate-500',
  内部: 'bg-sky-100 text-sky-600',
  秘密: 'bg-amber-100 text-amber-700',
  机密: 'bg-red-100 text-red-700',
};

const BorrowCartCheckout: React.FC<BorrowCartCheckoutProps> = ({ blacklisted, onSubmitted }) => {
  const cart = useBorrowStore((s) => s.cart);
  const orders = useBorrowStore((s) => s.orders);
  const removeFromCart = useBorrowStore((s) => s.removeFromCart);
  const clearCart = useBorrowStore((s) => s.clearCart);
  const submitOrder = useBorrowStore((s) => s.submitOrder);
  const records = useArchiveStore((s) => s.records);
  const allRecords = useArchiveStore((s) => s.allRecords);
  const loadAllRecords = useArchiveStore((s) => s.loadAllRecords);
  const volumes = useVolumeStore((s) => s.volumes);
  const currentUser = useAuthStore((s) => s.currentUser);
  const triggerToast = useAppStore((s) => s.triggerToast);

  // ── 明细行编辑状态 ──
  const [drafts, setDrafts] = useState<Map<string, LineDraft>>(new Map());
  const [reasonType, setReasonType] = useState<string>(REASON_OPTIONS[0]);
  const [reasonDetail, setReasonDetail] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [submitting, setSubmitting] = useState(false);

  // 全量件优先（含已组卷卷内件的 volumeId/卷信息），池件兜底——已归档档案可正常结算（2026-08-16 贯通修复）
  const cartRecords = useMemo(() => {
    const byId = new Map([...allRecords, ...records].map((r) => [r.id, r]));
    return cart.map((c) => byId.get(c.recordId)).filter(Boolean) as ArchiveRecord[];
  }, [cart, records, allRecords]);

  // 自愈：车内条目解析不出时补拉全量件（例如归档后首次进入结算）
  useEffect(() => {
    const known = new Set([...allRecords.map((r) => r.id), ...records.map((r) => r.id)]);
    if (cart.some((c) => !known.has(c.recordId))) void loadAllRecords();
  }, [cart, records, allRecords, loadAllRecords]);

  const volumeById = useMemo(() => new Map(volumes.map((v) => [v.id, v])), [volumes]);

  const draftOf = (recordId: string): LineDraft =>
    drafts.get(recordId) || { perms: new Set<ElectronicPerm>(['view']), physical: 'none' };

  const updateDraft = (recordId: string, patch: Partial<LineDraft>) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(recordId, { ...draftOf(recordId), ...patch });
      return next;
    });
  };

  const togglePerm = (recordId: string, perm: ElectronicPerm) => {
    const cur = draftOf(recordId);
    const perms = new Set(cur.perms);
    if (perms.has(perm)) perms.delete(perm);
    else perms.add(perm);
    updateDraft(recordId, { perms });
  };

  const mediaOf = (r: ArchiveRecord, v?: Volume) =>
    v?.carrierType === 'paper' ? 'paper' : v?.carrierType === 'mixed' ? 'mixed' : 'electronic';

  const securityOf = (r: ArchiveRecord, v?: Volume) => {
    const levels = [r.securityLevel, v?.securityLevel];
    if (levels.includes('机密')) return '机密';
    if (levels.includes('秘密')) return '秘密';
    if (levels.includes('内部')) return '内部';
    return '普通';
  };

  // ── 校验 ──
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (cartRecords.length === 0) errors.push('借阅车为空');
    const hasAnyPerm = cartRecords.some((r) => {
      const d = draftOf(r.id);
      return d.perms.size > 0 || d.physical !== 'none';
    });
    if (cartRecords.length > 0 && !hasAnyPerm) errors.push('请至少为一份档案勾选借阅权限');
    if (!startDate || !endDate) errors.push('请选择借阅周期');
    if (startDate && endDate) {
      if (endDate < startDate) errors.push('结束日期不能早于开始日期');
      const days = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
      if (days > MAX_BORROW_DAYS) errors.push(`借阅周期 ${days} 天，超过系统最大借阅天数（${MAX_BORROW_DAYS} 天）`);
    }
    if (blacklisted) errors.push('您名下有逾期未还档案，已暂停新建借阅');
    return errors;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartRecords, drafts, startDate, endDate, blacklisted]);

  // ── 预览审批链（动态路由提示；组链规则来自流程配置「借阅利用」，与服务端运行时同一份） ──
  const borrowWf = useWorkflowConfigStore((s) => s.workflows.find((w) => w.id === 'wf-borrow-approval'));
  const routePreview = useMemo(() => {
    const rules = getChainRules(borrowWf);
    const items = cartRecords.map((r) => {
      const v = volumeById.get(r.volumeId || '');
      const d = draftOf(r.id);
      return {
        electronicPerms: [...d.perms],
        physicalMode: d.physical,
        securityLevel: securityOf(r, v),
      } as BorrowOrderItem;
    });
    if (items.length === 0) return [];
    return computeApprovalRoute(items, rules);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartRecords, drafts, volumeById, borrowWf]);

  const handleSubmit = async () => {
    if (!currentUser || validation.length > 0) return;
    setSubmitting(true);
    try {
      const items: BorrowOrderItem[] = cartRecords.map((r, i) => {
        const v = volumeById.get(r.volumeId || '');
        const d = draftOf(r.id);
        const media = mediaOf(r, v);
        const stock = v ? volumeStockStatus(orders, v.id) : 'in_stock';
        return {
          id: `item-${Date.now()}-${i}`,
          recordId: r.id,
          volumeId: r.volumeId || '',
          title: r.remarks || `${r.year}年${r.month}月${r.voucherNo}`,
          voucherNo: r.voucherNo,
          archiveType: r.archiveType,
          archiveTypeCode: v?.archiveTypeCode || '',
          mediaType: media as BorrowOrderItem['mediaType'],
          securityLevel: securityOf(r, v),
          stockStatus: stock as BorrowOrderItem['stockStatus'],
          electronicPerms: [...d.perms],
          physicalMode: d.physical,
        };
      });
      await submitOrder({
        applicant: currentUser,
        items,
        reasonType,
        reasonDetail: reasonDetail.trim(),
        startDate,
        endDate,
      });
      clearCart();
      triggerToast('借阅申请已提交，进入审批流程', 'success');
      onSubmitted();
    } catch (e: any) {
      triggerToast(e.message || '提交失败', 'warning');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 空态 ──
  if (cartRecords.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <ShoppingCart className="w-12 h-12 text-slate-200 mb-3" />
        <p className="text-sm font-medium">借阅车是空的</p>
        <p className="text-xs mt-1 text-slate-400">去「凭证检索 / 事项检索 / 关联查询」找到档案，点击「加入借阅」</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* 明细行 */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">借阅明细（{cartRecords.length} 件）</span>
            <button
              type="button"
              onClick={() => { clearCart(); triggerToast('已清空借阅车', 'info'); }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />清空
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {cartRecords.map((r, idx) => {
              const v = volumeById.get(r.volumeId || '');
              const d = draftOf(r.id);
              const media = mediaOf(r, v);
              const sec = securityOf(r, v);
              const stock = v ? volumeStockStatus(orders, v.id) : 'in_stock';
              const canPhysical = media !== 'electronic';
              return (
                <div key={r.id} className="px-5 py-4">
                  <div className="flex items-start gap-4">
                    {/* 档案信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                        <span className="text-sm font-semibold text-slate-800 truncate">{r.remarks || r.voucherNo}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${SECURITY_COLORS[sec]}`}>
                          {sec !== '普通' && <Lock className="w-2.5 h-2.5 inline mr-0.5" />}{sec}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 flex-wrap">
                        <span className="font-mono">{r.archiveCode}</span>
                        <span>{r.archiveType}</span>
                        <span>介质：{MEDIA_TYPE_LABELS[media]}</span>
                        {canPhysical && (
                          <span className={stock === 'lent_out' ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
                            {STOCK_LABELS[stock]}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 权限勾选 */}
                    <div className="shrink-0 w-[300px] space-y-2">
                      <div>
                        <div className="text-[10px] font-medium text-slate-400 mb-1">电子权限（件级）</div>
                        <div className="flex gap-1.5">
                          {(['view', 'download', 'print'] as ElectronicPerm[]).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => togglePerm(r.id, p)}
                              className={`px-2 py-1 text-[11px] rounded-lg border font-medium transition-all cursor-pointer ${
                                d.perms.has(p)
                                  ? 'bg-sky-100 text-sky-700 border-sky-300'
                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                              }`}
                            >{PERM_LABELS[p]}</button>
                          ))}
                        </div>
                      </div>
                      {canPhysical && (
                        <div>
                          <div className="text-[10px] font-medium text-slate-400 mb-1">实体外借（整卷）</div>
                          <div className="flex gap-1.5">
                            {(['none', 'original', 'copy'] as PhysicalMode[]).map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => updateDraft(r.id, { physical: m })}
                                className={`px-2 py-1 text-[11px] rounded-lg border font-medium transition-all cursor-pointer ${
                                  d.physical === m
                                    ? m === 'none' ? 'bg-slate-200 text-slate-700 border-slate-300' : 'bg-amber-100 text-amber-700 border-amber-300'
                                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                              >{m === 'none' ? '不外借' : m === 'original' ? '原件外借' : '复印件'}</button>
                            ))}
                          </div>
                          {d.physical !== 'none' && stock === 'lent_out' && (
                            <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-600">
                              <AlertTriangle className="w-3 h-3" />该卷当前被借出，审批通过后将进入优先预约队列
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromCart(r.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                      title="移出"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 申请信息 */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="text-sm font-bold text-slate-700 mb-4">申请信息</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">借阅事由</label>
              <select
                value={reasonType}
                onChange={(e) => setReasonType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
              >
                {REASON_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">开始日期</label>
                <input
                  type="date"
                  value={startDate}
                  min={todayStr()}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1.5">结束日期（最长 {MAX_BORROW_DAYS} 天）</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs font-medium text-slate-500 block mb-1.5">事由说明（审批人可见）</label>
            <textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              rows={2}
              placeholder="请说明借阅用途，如：会计师事务所年审需查阅2025年3月采购凭证原件…"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 resize-none"
            />
          </div>

          {/* 动态审批链预览 */}
          {routePreview.length > 0 && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2.5 bg-sky-50/60 border border-sky-100 rounded-xl">
              <Info className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span className="text-[11px] text-sky-700">
                审批链（按权限与密级动态路由）：
                {routePreview.map((s, i) => (
                  <span key={s.seq}>
                    {i > 0 && <span className="text-sky-300 mx-1">→</span>}
                    <span className="font-semibold">{s.roleLabel}（{s.assigneeName}）</span>
                  </span>
                ))}
              </span>
            </div>
          )}

          {/* 校验错误 */}
          {validation.length > 0 && (
            <div className="mt-4 space-y-1">
              {validation.map((err) => (
                <div key={err} className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{err}
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-3">
            <span className="text-xs text-slate-400 mr-auto">
              申请人：{currentUser?.name} · {currentUser?.dept} · 工号 {currentUser?.empNo}
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={validation.length > 0 || submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 text-white text-sm font-bold rounded-xl hover:bg-sky-700 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Send className="w-4 h-4" />
              {submitting ? '提交中…' : `提交借阅申请（${cartRecords.length} 件）`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BorrowCartCheckout;



