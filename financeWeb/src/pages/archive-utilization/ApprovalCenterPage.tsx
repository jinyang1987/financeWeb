/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ApprovalCenterPage — 审批中心（PRD 2.2 动态审批流）
 *
 * 待办：当前登录人角色命中的审批节点（部门经理/CFO/HRVP/档案管理员）
 * 已办：我处理过的审批记录
 * 审批动作：同意（末级通过 → 自动拆单履约）/ 驳回（必须填原因）
 */

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2, XCircle, Clock, User, FileText, Lock,
  ClipboardCheck, History, AlertTriangle, Cloud, HardDrive,
} from 'lucide-react';
import { useBorrowStore, pendingApprovalsForRoles } from '../../stores/borrowStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import {
  PERM_LABELS, PHYSICAL_MODE_LABELS, ORDER_STATUS_LABELS,
  type BorrowOrder,
} from '../../types/borrow';

const SECURITY_COLORS: Record<string, string> = {
  普通: 'bg-slate-100 text-slate-500',
  内部: 'bg-sky-100 text-sky-600',
  秘密: 'bg-amber-100 text-amber-700',
  机密: 'bg-red-100 text-red-700',
};

const ApprovalCenterPage: React.FC = () => {
  const orders = useBorrowStore((s) => s.orders);
  const approveCurrentStep = useBorrowStore((s) => s.approveCurrentStep);
  const rejectCurrentStep = useBorrowStore((s) => s.rejectCurrentStep);
  const currentUser = useAuthStore((s) => s.currentUser);
  const triggerToast = useAppStore((s) => s.triggerToast);

  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentMap, setCommentMap] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const roles = currentUser?.roles || [];

  const pending = useMemo(
    () => pendingApprovalsForRoles(orders, roles),
    [orders, roles],
  );

  // 我处理过的（审批链中有我署名的节点）
  const done = useMemo(() => {
    if (!currentUser) return [];
    return orders.filter((o) =>
      o.approvalRoute.some((s) => s.actedBy === currentUser.name),
    );
  }, [orders, currentUser]);

  if (!currentUser) return null;

  const handleApprove = (order: BorrowOrder) => {
    const isLast = order.currentStepIndex === order.approvalRoute.length - 1;
    approveCurrentStep(order.id, currentUser, commentMap[order.id]?.trim() || undefined);
    triggerToast(
      isLast
        ? `已终审通过 ${order.orderNo}，系统已自动拆单履约（电子授权即时生效）`
        : `已同意 ${order.orderNo}，流转至下一审批节点`,
      'success',
    );
    setExpandedId(null);
  };

  const handleReject = (order: BorrowOrder) => {
    const comment = (commentMap[order.id] || '').trim();
    if (!comment) {
      triggerToast('驳回必须填写原因', 'warning');
      return;
    }
    rejectCurrentStep(order.id, currentUser, comment);
    triggerToast(`已驳回 ${order.orderNo}`, 'info');
    setRejectingId(null);
    setExpandedId(null);
  };

  const renderOrder = (order: BorrowOrder, actionable: boolean) => {
    const expanded = expandedId === order.id;
    const step = order.approvalRoute[order.currentStepIndex];
    return (
      <div key={order.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandedId(expanded ? null : order.id)}
          className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-slate-50/60 transition-colors cursor-pointer"
        >
          <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-sky-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-sm font-bold text-slate-800">{order.orderNo}</span>
              <span className="text-xs text-slate-500">{order.applicantName} · {order.applicantDept}</span>
              {actionable && step && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">
                  待您审批：{step.roleLabel}
                </span>
              )}
              {order.items.some((i) => i.securityLevel === '秘密' || i.securityLevel === '机密') && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                  <Lock className="w-2.5 h-2.5" />涉密档案
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {order.reasonType} · {order.items.length} 件档案 · {order.startDate} ~ {order.endDate} · {order.createdAt.slice(0, 16)} 提交
            </div>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
            order.status === 'approving' ? 'bg-sky-100 text-sky-700'
            : order.status === 'rejected' ? 'bg-red-100 text-red-700'
            : 'bg-emerald-100 text-emerald-700'
          }`}>
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </button>

        {expanded && (
          <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
            {/* 事由 */}
            <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2.5 leading-relaxed">
              <span className="font-semibold">借阅事由：</span>{order.reasonType}
              {order.reasonDetail && <span className="text-slate-500"> — {order.reasonDetail}</span>}
            </div>

            {/* 明细 */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                    <th className="px-4 py-3 text-left text-[13px] font-semibold">题名</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold">介质</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold">库存</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold">密级</th>
                    <th className="px-4 py-3 text-left text-[13px] font-semibold">申请权限</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-800 max-w-[220px] truncate">
                        <FileText className="w-3 h-3 inline mr-1 text-slate-400" />{item.title}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-[13px] text-slate-600">
                          {item.mediaType === 'electronic' ? <Cloud className="w-3 h-3 text-sky-400" /> : <HardDrive className="w-3 h-3 text-amber-400" />}
                          {item.mediaType === 'electronic' ? '纯电子' : item.mediaType === 'paper' ? '纯实体' : '混合'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px]">
                        {item.mediaType === 'electronic'
                          ? <span className="text-slate-300">—</span>
                          : item.stockStatus === 'in_stock'
                            ? <span className="text-emerald-600">在库</span>
                            : <span className="text-amber-600">已借出</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${SECURITY_COLORS[item.securityLevel]}`}>
                          {item.securityLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-slate-600">
                        {item.electronicPerms.map((p) => PERM_LABELS[p]).join('/') || '—'}
                        {item.physicalMode !== 'none' && (
                          <span className="text-amber-700 font-medium"> + {PHYSICAL_MODE_LABELS[item.physicalMode]}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 审批链 */}
            <div className="flex items-center gap-0 flex-wrap">
              {order.approvalRoute.map((s, i) => {
                const isCurrent = order.status === 'approving' && i === order.currentStepIndex;
                return (
                  <React.Fragment key={s.seq}>
                    {i > 0 && <div className={`w-5 h-px ${s.status === 'approved' ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                      s.status === 'approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : s.status === 'rejected' ? 'bg-red-50 border-red-200 text-red-700'
                      : isCurrent ? 'bg-sky-50 border-sky-300 text-sky-700 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}>
                      {s.status === 'approved' ? <CheckCircle2 className="w-3.5 h-3.5" />
                        : s.status === 'rejected' ? <XCircle className="w-3.5 h-3.5" />
                        : <Clock className="w-3.5 h-3.5" />}
                      {s.roleLabel}{s.actedBy ? `·${s.actedBy}` : `·${s.assigneeName}`}
                      {s.comment ? `（${s.comment}）` : ''}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* 审批操作 */}
            {actionable && (
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <textarea
                  value={commentMap[order.id] || ''}
                  onChange={(e) => setCommentMap((m) => ({ ...m, [order.id]: e.target.value }))}
                  rows={2}
                  placeholder={rejectingId === order.id ? '请填写驳回原因（必填）…' : '审批意见（可选）…'}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 resize-none"
                />
                <div className="flex items-center justify-end gap-2">
                  {rejectingId === order.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setRejectingId(null)}
                        className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                      >取消</button>
                      <button
                        type="button"
                        onClick={() => handleReject(order)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors shadow-sm"
                      >
                        <XCircle className="w-3.5 h-3.5" />确认驳回
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setRejectingId(order.id)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />驳回
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(order)}
                        className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {order.currentStepIndex === order.approvalRoute.length - 1 ? '终审通过并拆单履约' : '同意'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const list = tab === 'pending' ? pending : done;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="px-6 pt-4 pb-0 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <ClipboardCheck className="w-5 h-5 text-slate-600" />
          <h1 className="text-base font-bold text-slate-800">审批中心</h1>
          <span className="text-xs text-slate-400">
            {currentUser.name}（{currentUser.roles.map((r) => ({ employee: '员工', dept_manager: '部门经理', archivist: '档案管理员', archive_director: '档案主管', cfo: '财务总监', hrvp: 'HR副总裁', admin: '系统管理员' } as Record<string, string>)[r]).join('/')}）的待办审批
          </span>
        </div>
        <div className="flex items-center gap-1">
          {([
            { key: 'pending' as const, label: '待办审批', Icon: Clock, count: pending.length },
            { key: 'done' as const, label: '已办记录', Icon: History, count: done.length },
          ]).map(({ key, label, Icon, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-xl transition-all cursor-pointer border-b-2 ${
                tab === key ? 'bg-slate-50 text-sky-700 border-sky-600' : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />{label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${tab === key ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-3">
          {list.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <ClipboardCheck className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-sm font-medium">{tab === 'pending' ? '没有待您审批的借阅单' : '暂无已办审批记录'}</p>
              <p className="text-xs mt-1">{tab === 'pending' ? '借阅单按权限与密级动态路由到对应角色审批' : ''}</p>
            </div>
          )}
          {list.map((o) => renderOrder(o, tab === 'pending'))}
        </div>
      </div>

      {pending.length > 0 && tab === 'pending' && (
        <div className="px-6 py-2.5 bg-amber-50 border-t border-amber-100 shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" />
            动态路由规则：仅在线浏览 → 部门经理+档案管理员；含下载/打印/实体外借 → 升级财务总监；涉密（薪酬/高管报销）→ 强制 HRVP 会签
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalCenterPage;

