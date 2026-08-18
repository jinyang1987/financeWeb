/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * MyBorrowOrders — 我的申请（审批进度 + 履约状态跟踪）
 *
 * 每张借阅单：
 *   审批链进度（节点/审批人/意见，当前节点高亮）
 *   履约子单状态（电子已授权 / 实体待出库·借出·预约等待 / 已归还·已收回）
 *   审批中可撤销
 */

import React, { useMemo, useState } from 'react';
import {
  ClipboardList, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  Clock, Cloud, HardDrive, Hourglass, Ban, Undo2,
} from 'lucide-react';
import { useBorrowStore, myOrders } from '../../../stores/borrowStore';
import { useAuthStore } from '../../../stores/authStore';
import { useAppStore } from '../../../stores/appStore';
import {
  ORDER_STATUS_LABELS, FULFILLMENT_STATUS_LABELS, PERM_LABELS, PHYSICAL_MODE_LABELS,
  type BorrowOrder, type Fulfillment,
} from '../../../types/borrow';

const ORDER_STATUS_COLORS: Record<string, string> = {
  approving: 'bg-sky-100 text-sky-700',
  rejected: 'bg-red-100 text-red-700',
  fulfilling: 'bg-sky-100 text-sky-700',
  active: 'bg-emerald-100 text-emerald-700',
  returning: 'bg-cyan-100 text-cyan-700',
  completed: 'bg-slate-200 text-slate-600',
  terminated: 'bg-slate-300 text-slate-600',
};

const FULFILLMENT_COLORS: Record<string, string> = {
  pending: 'bg-sky-100 text-sky-700',
  granted: 'bg-emerald-100 text-emerald-700',
  lent: 'bg-amber-100 text-amber-700',
  queued: 'bg-purple-100 text-purple-700',
  returned: 'bg-slate-200 text-slate-600',
  auto_revoked: 'bg-slate-200 text-slate-500',
  overdue: 'bg-red-100 text-red-700',
  terminated: 'bg-slate-300 text-slate-500',
};

function FulfillmentRow({ f }: { f: Fulfillment }) {
  const Icon = f.type === 'electronic' ? Cloud : HardDrive;
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg">
      <Icon className={`w-4 h-4 shrink-0 ${f.type === 'electronic' ? 'text-sky-500' : 'text-amber-500'}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-700 truncate">{f.volumeTitle}</div>
        <div className="text-[10px] text-slate-400">
          {f.type === 'electronic' ? '电子授权（件级）' : `实体外借（整卷 · ${f.physicalMode === 'copy' ? '复印件' : '原件'}）`}
          {f.lentAt && ` · 借出 ${f.lentAt.slice(0, 10)}`}
          {f.returnedAt && ` · 归还 ${f.returnedAt.slice(0, 10)}`}
        </div>
      </div>
      {f.status === 'queued' && (
        <span className="flex items-center gap-1 text-[10px] text-purple-600">
          <Hourglass className="w-3 h-3" />优先预约队列中
        </span>
      )}
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${FULFILLMENT_COLORS[f.status]}`}>
        {FULFILLMENT_STATUS_LABELS[f.status]}
      </span>
    </div>
  );
}

const MyBorrowOrders: React.FC = () => {
  const orders = useBorrowStore((s) => s.orders);
  const cancelOrder = useBorrowStore((s) => s.cancelOrder);
  const currentUser = useAuthStore((s) => s.currentUser);
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const mine = useMemo(
    () => (currentUser ? myOrders(orders, currentUser.id) : []),
    [orders, currentUser],
  );

  if (!currentUser) return null;

  if (mine.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <ClipboardList className="w-12 h-12 text-slate-200 mb-3" />
        <p className="text-sm font-medium">还没有借阅申请</p>
        <p className="text-xs mt-1">去检索页找到档案加入借阅车，统一结算发起申请</p>
      </div>
    );
  }

  const handleCancel = (order: BorrowOrder) => {
    cancelOrder(order.id, currentUser);
    setConfirmCancelId(null);
    triggerToast(`已撤销借阅申请 ${order.orderNo}`, 'info');
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-3">
        {mine.map((order) => {
          const expanded = expandedId === order.id;
          const currentStep = order.approvalRoute[order.currentStepIndex];
          return (
            <div key={order.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              {/* 单头 */}
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : order.id)}
                className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50/60 transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-sm font-bold text-slate-800">{order.orderNo}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ORDER_STATUS_COLORS[order.status]}`}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                    {order.status === 'approving' && currentStep && (
                      <span className="flex items-center gap-1 text-[10px] text-sky-600">
                        <Clock className="w-3 h-3" />待{currentStep.roleLabel}（{currentStep.assigneeName}）审批
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {order.reasonType} · {order.items.length} 件档案 · {order.startDate} ~ {order.endDate} · 申请于 {order.createdAt.slice(0, 16)}
                  </div>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {expanded && (
                <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
                  {/* 事由 */}
                  {order.reasonDetail && (
                    <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                      事由说明：{order.reasonDetail}
                    </div>
                  )}

                  {/* 审批链 */}
                  <div>
                    <div className="text-xs font-bold text-slate-600 mb-2">审批进度</div>
                    <div className="flex items-center gap-0 flex-wrap">
                      {order.approvalRoute.map((step, i) => {
                        const isCurrent = order.status === 'approving' && i === order.currentStepIndex;
                        return (
                          <React.Fragment key={step.seq}>
                            {i > 0 && <div className={`w-6 h-px ${step.status === 'approved' ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                              step.status === 'approved'
                                ? 'bg-emerald-50 border-emerald-200'
                                : step.status === 'rejected'
                                  ? 'bg-red-50 border-red-200'
                                  : isCurrent
                                    ? 'bg-sky-50 border-sky-300 shadow-sm'
                                    : 'bg-slate-50 border-slate-200'
                            }`}>
                              {step.status === 'approved'
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                : step.status === 'rejected'
                                  ? <XCircle className="w-4 h-4 text-red-500" />
                                  : <Clock className={`w-4 h-4 ${isCurrent ? 'text-sky-500' : 'text-slate-300'}`} />}
                              <div>
                                <div className="text-xs font-semibold text-slate-700">{step.roleLabel}</div>
                                <div className="text-[10px] text-slate-400">
                                  {step.actedBy || step.assigneeName}
                                  {step.comment ? ` · ${step.comment}` : isCurrent ? ' · 审批中' : ''}
                                </div>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* 明细 */}
                  <div>
                    <div className="text-xs font-bold text-slate-600 mb-2">借阅明细（{order.items.length} 件）</div>
                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                            <th className="px-4 py-3 text-left text-[13px] font-semibold">题名</th>
                            <th className="px-4 py-3 text-left text-[13px] font-semibold">类型</th>
                            <th className="px-4 py-3 text-left text-[13px] font-semibold">介质</th>
                            <th className="px-4 py-3 text-left text-[13px] font-semibold">密级</th>
                            <th className="px-4 py-3 text-left text-[13px] font-semibold">申请权限</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.items.map((item) => (
                            <tr key={item.id} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                              <td className="px-4 py-3 text-sm text-slate-800 max-w-[240px] truncate">{item.title}</td>
                              <td className="px-4 py-3 text-[13px] text-slate-600">{item.archiveType}</td>
                              <td className="px-4 py-3 text-[13px] text-slate-600">
                                {item.mediaType === 'electronic' ? '纯电子' : item.mediaType === 'paper' ? '纯实体' : '混合'}
                              </td>
                              <td className="px-4 py-3 text-[13px]">
                                <span className={item.securityLevel === '普通' ? 'text-slate-400' : 'text-amber-600 font-medium'}>
                                  {item.securityLevel}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-[13px] text-slate-600">
                                {item.electronicPerms.map((p) => PERM_LABELS[p]).join('/') || '—'}
                                {item.physicalMode !== 'none' && ` + ${PHYSICAL_MODE_LABELS[item.physicalMode]}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 履约子单 */}
                  {order.fulfillments.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-slate-600 mb-2">履约状态（智能拆单）</div>
                      <div className="space-y-1.5">
                        {order.fulfillments.map((f) => <FulfillmentRow key={f.id} f={f} />)}
                      </div>
                    </div>
                  )}

                  {/* 操作 */}
                  {order.status === 'approving' && (
                    <div className="flex justify-end">
                      {confirmCancelId === order.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">确认撤销该申请？</span>
                          <button
                            type="button"
                            onClick={() => handleCancel(order)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                          >确认撤销</button>
                          <button
                            type="button"
                            onClick={() => setConfirmCancelId(null)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                          >再想想</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmCancelId(order.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200 hover:text-slate-700 transition-colors"
                        >
                          <Undo2 className="w-3.5 h-3.5" />撤销申请
                        </button>
                      )}
                    </div>
                  )}
                  {order.status === 'terminated' && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Ban className="w-3.5 h-3.5" />该单已终止，全部权限已收回
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MyBorrowOrders;

