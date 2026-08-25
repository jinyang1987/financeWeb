﻿﻿﻿﻿﻿﻿﻿/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * BorrowManagePage — 借阅管理（档案管理员履约工作台，PRD 2.3/2.4/2.5）
 *
 * 五个工作区：
 *   待出库   — 实体子单扫码出库（PDA/PC 终端模拟）
 *   待归还   — 借出中/逾期扫码核销，归还瞬间触发预约队列锁定
 *   预约队列 — 排队中的预约单 + 当前持有人
 *   进行中   — 全部生效借阅单一键中止（收回线上权限+催还实体）
 *   黑名单与巡检 — 逾期熔断名单 + 手动执行每日巡检（到期收回/逾期标记/催还预警）
 */

import React, { useMemo, useState } from 'react';
import {
  ScanBarcode, PackageCheck, Undo2, Hourglass, Activity, ShieldAlert,
  PlayCircle, Ban, BellRing, User, CheckCircle2,
} from 'lucide-react';
import {
  useBorrowStore, pendingCheckouts, lentOutPhysical, queuedReservations,
} from '../../stores/borrowStore';
import { useAuthStore } from '../../stores/authStore';
import { useAppStore } from '../../stores/appStore';
import { isBorrowerBlacklisted, todayStr } from '../../utils/borrowEngine';
import { findUserById } from '../../types/user';
import {
  ORDER_STATUS_LABELS, PHYSICAL_MODE_LABELS,
  type BorrowOrder, type Fulfillment,
} from '../../types/borrow';

type TabKey = 'checkout' | 'return' | 'queue' | 'active' | 'blacklist';

const BorrowManagePage: React.FC = () => {
  const orders = useBorrowStore((s) => s.orders);
  const checkoutPhysical = useBorrowStore((s) => s.checkoutPhysical);
  const returnPhysical = useBorrowStore((s) => s.returnPhysical);
  const terminateOrder = useBorrowStore((s) => s.terminateOrder);
  const runDaily = useBorrowStore((s) => s.runDaily);
  const logAction = useBorrowStore((s) => s.logAction);
  const currentUser = useAuthStore((s) => s.currentUser);
  const triggerToast = useAppStore((s) => s.triggerToast);

  const [tab, setTab] = useState<TabKey>('checkout');
  const [confirmAction, setConfirmAction] = useState<{ type: 'checkout' | 'return' | 'terminate' | 'urge'; order: BorrowOrder; fulfillment?: Fulfillment } | null>(null);

  const checkouts = useMemo(() => pendingCheckouts(orders), [orders]);
  const lentOut = useMemo(() => lentOutPhysical(orders), [orders]);
  const queue = useMemo(() => queuedReservations(orders), [orders]);
  const activeOrders = useMemo(
    () => orders.filter((o) => o.status === 'active' || o.status === 'fulfilling' || o.status === 'returning'),
    [orders],
  );
  const blacklistedUsers = useMemo(() => {
    const ids = new Set<string>();
    orders.forEach((o) => {
      if (isBorrowerBlacklisted(o.applicantId, orders, todayStr())) ids.add(o.applicantId);
    });
    return [...ids].map((id) => findUserById(id)).filter(Boolean);
  }, [orders]);

  if (!currentUser) return null;

  const handleConfirm = () => {
    if (!confirmAction) return;
    const { type, order, fulfillment } = confirmAction;
    if (type === 'checkout' && fulfillment) {
      checkoutPhysical(fulfillment.id, currentUser);
      triggerToast(`已出库：${fulfillment.volumeTitle}，交接给 ${order.applicantName}`, 'success');
    } else if (type === 'return' && fulfillment) {
      returnPhysical(fulfillment.id, currentUser);
      triggerToast(`归还核销完成：${fulfillment.volumeTitle}，库存已释放（如有预约将自动锁定）`, 'success');
    } else if (type === 'terminate') {
      terminateOrder(order.id, currentUser);
      triggerToast(`已中止 ${order.orderNo}：全部线上权限已收回，实体档案已发起催还`, 'warning');
    } else if (type === 'urge' && fulfillment) {
      logAction('催还通知', fulfillment.volumeTitle, currentUser, order.id, `催还 ${order.applicantName}（${order.applicantDept}），抄送直属主管`);
      triggerToast(`已向 ${order.applicantName} 发送催还通知并抄送其直属主管`, 'info');
    }
    setConfirmAction(null);
  };

  const handleRunDaily = async () => {
    const n = await runDaily();
    triggerToast(
      n > 0 ? `每日巡检完成：处理 ${n} 个事件（到期收回/逾期标记/催还预警）` : '每日巡检完成：无待处理事件',
      n > 0 ? 'success' : 'info',
    );
  };

  const TABS: { key: TabKey; label: string; Icon: typeof ScanBarcode; count?: number; alert?: boolean }[] = [
    { key: 'checkout', label: '待出库', Icon: ScanBarcode, count: checkouts.length },
    { key: 'return', label: '待归还核销', Icon: PackageCheck, count: lentOut.length, alert: lentOut.some((x) => x.fulfillment.status === 'overdue') },
    { key: 'queue', label: '预约队列', Icon: Hourglass, count: queue.length },
    { key: 'active', label: '进行中借阅', Icon: Activity, count: activeOrders.length },
    { key: 'blacklist', label: '黑名单与巡检', Icon: ShieldAlert, count: blacklistedUsers.length, alert: blacklistedUsers.length > 0 },
  ];

  const renderFulfillmentRow = (order: BorrowOrder, f: Fulfillment, action: 'checkout' | 'return') => (
    <div key={f.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${f.status === 'overdue' ? 'bg-red-50' : 'bg-amber-50'}`}>
        <ScanBarcode className={`w-5 h-5 ${f.status === 'overdue' ? 'text-red-500' : 'text-amber-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-800 truncate">{f.volumeTitle}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
            {PHYSICAL_MODE_LABELS[f.physicalMode || 'original']}
          </span>
          {f.status === 'overdue' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">已逾期</span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 mt-1">
          {order.orderNo} · {order.applicantName}（{order.applicantDept}）· 应还 {f.endDate}
          {f.lentAt && ` · 借出 ${f.lentAt.slice(0, 10)}`}
        </div>
      </div>
      {action === 'checkout' && (
        <button
          type="button"
          onClick={() => setConfirmAction({ type: 'checkout', order, fulfillment: f })}
          className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 text-white text-xs font-bold rounded-xl hover:bg-sky-700 transition-colors shadow-sm cursor-pointer shrink-0"
        >
          <ScanBarcode className="w-3.5 h-3.5" />扫码出库
        </button>
      )}
      {action === 'return' && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setConfirmAction({ type: 'urge', order, fulfillment: f })}
            className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors"
          >
            <BellRing className="w-3.5 h-3.5" />催还
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction({ type: 'return', order, fulfillment: f })}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm cursor-pointer"
          >
            <PackageCheck className="w-3.5 h-3.5" />扫码归还
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* 页头 + Tab */}
      <div className="px-6 pt-4 pb-0 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <ScanBarcode className="w-5 h-5 text-slate-600" />
            <h1 className="text-base font-bold text-slate-800">借阅管理</h1>
          </div>
          <button
            type="button"
            onClick={handleRunDaily}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-xl hover:bg-sky-100 transition-colors"
            title="手动触发每日定时任务：电子到期自动收回、实体逾期标记、到期前3天催还预警"
          >
            <PlayCircle className="w-3.5 h-3.5" />执行每日巡检
          </button>
        </div>
        <div className="flex items-center gap-1">
          {TABS.map(({ key, label, Icon, count, alert }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-xl transition-all cursor-pointer border-b-2 ${
                tab === key ? 'bg-slate-50 text-sky-700 border-sky-600' : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />{label}
              {count !== undefined && count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${alert ? 'bg-red-500 text-white' : tab === key ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* 待出库 */}
          {tab === 'checkout' && (
            checkouts.length === 0 ? (
              <Empty text="暂无待出库任务" sub="审批通过的实体借阅单会自动推送到这里" />
            ) : checkouts.map(({ order, fulfillment }) => renderFulfillmentRow(order, fulfillment, 'checkout'))
          )}

          {/* 待归还 */}
          {tab === 'return' && (
            lentOut.length === 0 ? (
              <Empty text="暂无借出中的实体档案" sub="实体出库后可在此核销归还" />
            ) : lentOut.map(({ order, fulfillment }) => renderFulfillmentRow(order, fulfillment, 'return'))
          )}

          {/* 预约队列 */}
          {tab === 'queue' && (
            queue.length === 0 ? (
              <Empty text="预约队列为空" sub="被借出的档案有新申请时会自动排队" />
            ) : queue.map(({ order, fulfillment }, idx) => {
              // 当前持有该卷的人
              const holder = orders.find((o) =>
                o.fulfillments.some((f) => f.type === 'physical' && f.volumeId === fulfillment.volumeId && (f.status === 'lent' || f.status === 'overdue')),
              );
              return (
                <div key={fulfillment.id} className="bg-white border border-purple-200 rounded-2xl shadow-sm px-5 py-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{fulfillment.volumeTitle}</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {order.orderNo} · {order.applicantName}（{order.applicantDept}）排队中
                      {holder && ` · 当前由 ${holder.applicantName} 持有（应还 ${holder.fulfillments.find((f) => f.volumeId === fulfillment.volumeId)?.endDate}）`}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium shrink-0">
                    <Hourglass className="w-3 h-3" />归还后自动锁定并通知
                  </span>
                </div>
              );
            })
          )}

          {/* 进行中借阅 */}
          {tab === 'active' && (
            activeOrders.length === 0 ? (
              <Empty text="暂无进行中的借阅" />
            ) : activeOrders.map((order) => (
              <div key={order.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-sky-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-slate-800">{order.orderNo}</span>
                      <span className="text-xs text-slate-500">{order.applicantName} · {order.applicantDept}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">{ORDER_STATUS_LABELS[order.status]}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {order.reasonType} · {order.startDate} ~ {order.endDate} ·
                      电子 {order.fulfillments.filter((f) => f.type === 'electronic').length} 项 ·
                      实体 {order.fulfillments.filter((f) => f.type === 'physical').length} 项
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ type: 'terminate', order })}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors shrink-0"
                    title="一键中止：瞬间收回所有线上权限，并催还实体档案"
                  >
                    <Ban className="w-3.5 h-3.5" />中止借阅
                  </button>
                </div>
              </div>
            ))
          )}

          {/* 黑名单与巡检 */}
          {tab === 'blacklist' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-bold text-slate-700">逾期黑名单（信用熔断）</span>
                </div>
                {blacklistedUsers.length === 0 ? (
                  <p className="text-xs text-slate-400">当前无被熔断用户</p>
                ) : (
                  <div className="space-y-2">
                    {blacklistedUsers.map((u) => u && (
                      <div key={u.id} className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                        <div className={`w-8 h-8 rounded-full ${u.avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                          {u.name.slice(0, 1)}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-red-800">{u.name} <span className="text-xs font-normal text-red-500">{u.dept} · 工号 {u.empNo}</span></div>
                          <div className="text-[11px] text-red-500">名下有逾期未还实体档案 · 新建借阅已锁死 · 已每日抄送直属主管</div>
                        </div>
                        <span className="text-[10px] px-2 py-1 rounded-full bg-red-600 text-white font-bold shrink-0">熔断中</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-2">
                  <PlayCircle className="w-4 h-4 text-sky-500" />
                  <span className="text-sm font-bold text-slate-700">每日巡检任务</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  生产环境由定时任务每日 00:05 执行：① 电子借阅到期 23:59:59 自动撤销权限（无感归还）；
                  ② 实体档案逾期未还标记并抄送直属主管；③ 到期前 3 天发送催还预警。演示环境点击按钮手动触发。
                </p>
                <button
                  type="button"
                  onClick={handleRunDaily}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition-colors shadow-sm cursor-pointer"
                >
                  <PlayCircle className="w-3.5 h-3.5" />立即执行一次巡检
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 确认弹窗 */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmAction(null)}>
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                confirmAction.type === 'terminate' ? 'bg-red-100' : 'bg-sky-100'
              }`}>
                {confirmAction.type === 'terminate' ? <Ban className="w-5 h-5 text-red-600" />
                  : confirmAction.type === 'urge' ? <BellRing className="w-5 h-5 text-amber-600" />
                  : <ScanBarcode className="w-5 h-5 text-sky-600" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {confirmAction.type === 'checkout' && '确认扫码出库'}
                  {confirmAction.type === 'return' && '确认归还核销'}
                  {confirmAction.type === 'terminate' && '确认中止借阅'}
                  {confirmAction.type === 'urge' && '发送催还通知'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {confirmAction.type === 'checkout' && '扫描卷宗条码/RFID，档案交接给借阅人'}
                  {confirmAction.type === 'return' && '检查档案完好后扫码入库，释放库存'}
                  {confirmAction.type === 'terminate' && '瞬间收回所有线上权限，并催还实体档案'}
                  {confirmAction.type === 'urge' && '通知借阅人并抄送其直属主管'}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              {confirmAction.type === 'terminate'
                ? <>借阅单 <strong>{confirmAction.order.orderNo}</strong>（{confirmAction.order.applicantName}）的全部生效权限将被立即收回。确定继续？</>
                : <><strong>{confirmAction.fulfillment?.volumeTitle}</strong>（{confirmAction.order.orderNo} · {confirmAction.order.applicantName}）</>}
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >取消</button>
              <button
                type="button"
                onClick={handleConfirm}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors shadow-sm ${
                  confirmAction.type === 'terminate' ? 'bg-red-500 hover:bg-red-600' : 'bg-sky-600 hover:bg-sky-700'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Empty: React.FC<{ text: string; sub?: string }> = ({ text, sub }) => (
  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
    <Undo2 className="w-12 h-12 text-slate-200 mb-3" />
    <p className="text-sm font-medium">{text}</p>
    {sub && <p className="text-xs mt-1">{sub}</p>}
  </div>
);

export default BorrowManagePage;


