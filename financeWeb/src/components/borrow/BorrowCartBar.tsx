/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * BorrowCartBar — 全局借阅车浮条（PRD 1.2）
 *
 * 检索页右下角悬浮：显示车内件数，点击展开抽屉预览，
 * 「去结算」切换检索门户 → 我的借阅（购物车非空自动落「借阅车」Tab）统一发起申请。
 */

import React, { useMemo, useState, useEffect } from 'react';
import { ShoppingCart, X, Trash2, ArrowRight, FileText } from 'lucide-react';
import { useBorrowStore } from '../../stores/borrowStore';
import { useArchiveStore } from '../../stores/archiveStore';
import { useAppStore } from '../../stores/appStore';
import { usePortalStore } from '../../stores/portalStore';
import ArchiveStatusTags from './ArchiveStatusTags';

export const BorrowCartBar: React.FC = () => {
  const cart = useBorrowStore((s) => s.cart);
  const removeFromCart = useBorrowStore((s) => s.removeFromCart);
  const clearCart = useBorrowStore((s) => s.clearCart);
  const records = useArchiveStore((s) => s.records);
  const allRecords = useArchiveStore((s) => s.allRecords);
  const loadAllRecords = useArchiveStore((s) => s.loadAllRecords);
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [open, setOpen] = useState(false);

  // 自愈：车内存在池+全量都解析不出的条目时（如归档后首次打开），补拉全量件
  useEffect(() => {
    const known = new Set([...allRecords.map((r) => r.id), ...records.map((r) => r.id)]);
    if (cart.some((c) => !known.has(c.recordId))) void loadAllRecords();
  }, [cart, records, allRecords, loadAllRecords]);

  // 全量件优先（含已组卷卷内件归属信息），池件兜底——已归档档案加车后不再丢失（2026-08-16 贯通修复）
  const cartRecords = useMemo(() => {
    const byId = new Map([...allRecords, ...records].map((r) => [r.id, r]));
    return cart.map((c) => byId.get(c.recordId)).filter(Boolean) as typeof records;
  }, [cart, records, allRecords]);

  if (cart.length === 0) return null;

  const goCheckout = () => {
    setOpen(false);
    // 「我的借阅」归检索门户（前台）：切到门户并打开我的借阅（购物车非空自动落「借阅车」Tab）
    usePortalStore.getState().switchMode('portal');
    usePortalStore.getState().setPortalTab('my-borrow');
  };

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 pl-4 pr-5 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl hover:bg-slate-800 transition-all cursor-pointer group"
      >
        <span className="relative">
          <ShoppingCart className="w-5 h-5" />
          <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold flex items-center justify-center">
            {cart.length}
          </span>
        </span>
        <span className="text-sm font-semibold">借阅车</span>
        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
      </button>

      {/* 抽屉 */}
      {open && (
        <div className="fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div
            className="absolute right-0 top-0 bottom-0 w-[420px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-bold text-slate-800">借阅车</span>
                <span className="text-xs text-slate-400">{cart.length} 件档案</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { clearCart(); triggerToast('已清空借阅车', 'info'); }}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="清空"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cartRecords.map((r) => (
                <div key={r.id} className="border border-slate-200 rounded-xl p-3 hover:border-sky-200 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">{r.remarks || r.voucherNo}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{r.archiveCode}</div>
                        <div className="mt-1.5"><ArchiveStatusTags record={r} /></div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(r.id)}
                      className="p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                      title="移出借阅车"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={goCheckout}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-sky-600 text-white text-sm font-bold rounded-xl hover:bg-sky-700 transition-colors shadow-sm cursor-pointer"
              >
                去结算 · 发起借阅申请
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[10px] text-slate-400 text-center mt-2">跨年度、跨类型的多份档案将合并为一张借阅申请单</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BorrowCartBar;

