﻿﻿﻿﻿﻿﻿﻿/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * borrowStore — 借阅全生命周期状态管理（已贯通 ams-server 关系型后端）
 *
 * 架构：后端 BorrowService 为唯一事实源（4 表 + 审批路由 + 智能拆单 + 履约状态机
 *       + 每日巡检 + 操作日志哈希链）。本 store 为纯 API 读写：
 *   - loadOrders / loadLogs：从后端拉取
 *   - 各动作：调 /borrow/** 端点 → 后端运算 → loadOrders 刷新
 *   - cart：纯前端暂态（借阅车），不入后端
 * 状态机不再前端运算（borrowEngine 仅作选择器与审批链预览的纯函数）。
 */

import { create } from 'zustand';
import * as borrowApi from '../services/borrowService';
import type {
  BorrowOrder,
  BorrowOrderItem,
  BorrowLog,
  CartItem,
  Fulfillment,
} from '../types/borrow';
import type { UserAccount } from '../types/user';
import { isVolumeLentOut, isBorrowerBlacklisted } from '../utils/borrowEngine';

// ── 申请入参 ──
export interface SubmitOrderInput {
  applicant: UserAccount;
  items: BorrowOrderItem[];
  reasonType: string;
  reasonDetail: string;
  startDate: string;
  endDate: string;
}

interface BorrowState {
  orders: BorrowOrder[];
  logs: BorrowLog[];
  cart: CartItem[];
  loading: boolean;

  // ── 数据加载 ──
  loadOrders: () => Promise<void>;
  loadLogs: () => Promise<void>;

  // ── 借阅车（本地暂态） ──
  addToCart: (recordId: string) => void;
  removeFromCart: (recordId: string) => void;
  clearCart: () => void;

  // ── 申请 ──
  submitOrder: (input: SubmitOrderInput) => Promise<BorrowOrder>;
  cancelOrder: (orderId: string, operator: UserAccount) => Promise<void>;

  // ── 审批 ──
  approveCurrentStep: (orderId: string, actor: UserAccount, comment?: string) => Promise<void>;
  rejectCurrentStep: (orderId: string, actor: UserAccount, comment: string) => Promise<void>;

  // ── 履约（档案管理员） ──
  checkoutPhysical: (fulfillmentId: string, operator: UserAccount) => Promise<void>;
  returnPhysical: (fulfillmentId: string, operator: UserAccount) => Promise<void>;
  terminateOrder: (orderId: string, operator: UserAccount, reason?: string) => Promise<void>;

  // ── 每日巡检 ──
  runDaily: (today?: string) => Promise<number>;

  // ── 留痕（后端自动写 ams_operation_log，此处触发日志刷新） ──
  logAction: (action: string, target: string, actor: UserAccount, orderId?: string, detail?: string) => void;
}

function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 后端操作日志行 → 前端 BorrowLog */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dtoToLog(d: any): BorrowLog {
  return {
    id: d.id,
    timestamp: (d.created_at || '').replace('T', ' ').slice(0, 19),
    actorId: d.actor_id,
    actorName: d.actor_name || d.actor_id,
    actorRoleLabel: '',
    action: d.action,
    target: d.target,
    orderId: d.order_id,
    detail: d.detail,
  };
}

export const useBorrowStore = create<BorrowState>((set, get) => ({
  orders: [],
  logs: [],
  cart: [],
  loading: false,

  // ── 数据加载 ──
  loadOrders: async () => {
    set({ loading: true });
    try {
      const orders = await borrowApi.fetchOrders({});
      set({ orders });
    } catch (e) {
      console.warn('借阅单加载失败:', e);
    } finally {
      set({ loading: false });
    }
  },

  loadLogs: async () => {
    try {
      const res = (await borrowApi.fetchAuditLogs({ limit: 200 })) as { items?: unknown[] };
      set({ logs: (res.items || []).map(dtoToLog) });
    } catch (e) {
      console.warn('操作日志加载失败:', e);
    }
  },

  // ── 借阅车（本地） ──
  addToCart: (recordId) =>
    set((s) => (s.cart.some((c) => c.recordId === recordId)
      ? s
      : { cart: [...s.cart, { recordId, addedAt: nowStr() }] })),
  removeFromCart: (recordId) =>
    set((s) => ({ cart: s.cart.filter((c) => c.recordId !== recordId) })),
  clearCart: () => set({ cart: [] }),

  // ── 申请 ──
  submitOrder: async (input) => {
    const cmd: borrowApi.SubmitOrderCmd = {
      applicantName: input.applicant.name,
      applicantEmpNo: input.applicant.empNo,
      applicantDept: input.applicant.dept,
      reasonType: input.reasonType,
      reasonDetail: input.reasonDetail,
      startDate: input.startDate,
      endDate: input.endDate,
      items: input.items.map((it) => ({
        recordId: it.recordId,
        volumeId: it.volumeId,
        title: it.title,
        voucherNo: it.voucherNo,
        archiveType: it.archiveType,
        archiveTypeCode: it.archiveTypeCode,
        mediaType: it.mediaType,
        securityLevel: it.securityLevel,
        stockStatus: it.stockStatus,
        electronicPerms: [...it.electronicPerms],
        physicalMode: it.physicalMode,
      })),
    };
    const order = await borrowApi.submitOrder(cmd);
    await get().loadOrders();
    return order;
  },

  cancelOrder: async (orderId) => {
    await borrowApi.cancelOrderByApplicant(orderId);
    await get().loadOrders();
  },

  // ── 审批 ──
  approveCurrentStep: async (orderId, _actor, comment) => {
    await borrowApi.approveOrder(orderId, comment);
    await get().loadOrders();
  },

  rejectCurrentStep: async (orderId, _actor, comment) => {
    await borrowApi.rejectOrder(orderId, comment);
    await get().loadOrders();
  },

  // ── 履约 ──
  checkoutPhysical: async (fulfillmentId) => {
    await borrowApi.checkoutFulfillment(fulfillmentId);
    await get().loadOrders();
  },

  returnPhysical: async (fulfillmentId) => {
    await borrowApi.returnFulfillment(fulfillmentId);
    await get().loadOrders();
  },

  terminateOrder: async (orderId) => {
    await borrowApi.terminateOrder(orderId);
    await get().loadOrders();
  },

  // ── 每日巡检 ──
  runDaily: async () => {
    const r = await borrowApi.runDailyCheck();
    await get().loadOrders();
    return (r.autoRevoked || 0) + (r.overdue || 0) + (r.expiringSoon || 0);
  },

  // ── 留痕（后端已在各端点自动写日志，此处刷新日志列表） ──
  logAction: () => {
    void get().loadLogs();
  },
}));

// ──────────────────────────────────────────────
// 派生选择器（纯函数）
// ──────────────────────────────────────────────

/** 我的借阅单（按创建时间倒序） */
export function myOrders(orders: BorrowOrder[], userId: string): BorrowOrder[] {
  return orders.filter((o) => o.applicantId === userId);
}

/** 当前用户角色可审批的待办（订单当前节点角色 ∈ 我的角色） */
export function pendingApprovalsForRoles(orders: BorrowOrder[], roles: string[]): BorrowOrder[] {
  return orders.filter((o) => {
    if (o.status !== 'approving') return false;
    const step = o.approvalRoute[o.currentStepIndex];
    return !!step && roles.includes(step.role);
  });
}

/** 我的生效中电子授权（在线调阅列表） */
export function activeElectronicGrants(orders: BorrowOrder[], userId: string): { order: BorrowOrder; fulfillment: Fulfillment }[] {
  return orders
    .filter((o) => o.applicantId === userId)
    .flatMap((o) => o.fulfillments.map((f) => ({ order: o, fulfillment: f })))
    .filter((x) => x.fulfillment.type === 'electronic' && x.fulfillment.status === 'granted');
}

/** 档案管理员待出库任务 */
export function pendingCheckouts(orders: BorrowOrder[]): { order: BorrowOrder; fulfillment: Fulfillment }[] {
  return orders
    .filter((o) => o.status !== 'terminated' && o.status !== 'rejected')
    .flatMap((o) => o.fulfillments.map((f) => ({ order: o, fulfillment: f })))
    .filter((x) => x.fulfillment.type === 'physical' && x.fulfillment.status === 'pending');
}

/** 档案管理员待归还核销（借出中 + 已逾期） */
export function lentOutPhysical(orders: BorrowOrder[]): { order: BorrowOrder; fulfillment: Fulfillment }[] {
  return orders
    .filter((o) => o.status !== 'terminated' && o.status !== 'rejected')
    .flatMap((o) => o.fulfillments.map((f) => ({ order: o, fulfillment: f })))
    .filter((x) => x.fulfillment.type === 'physical' && (x.fulfillment.status === 'lent' || x.fulfillment.status === 'overdue'));
}

/** 预约等待队列 */
export function queuedReservations(orders: BorrowOrder[]): { order: BorrowOrder; fulfillment: Fulfillment }[] {
  return orders
    .filter((o) => o.status !== 'terminated' && o.status !== 'rejected')
    .flatMap((o) => o.fulfillments.map((f) => ({ order: o, fulfillment: f })))
    .filter((x) => x.fulfillment.status === 'queued');
}

/** 卷的实时库存状态（实体） */
export function volumeStockStatus(orders: BorrowOrder[], volumeId: string): 'in_stock' | 'lent_out' {
  return isVolumeLentOut(volumeId, orders) ? 'lent_out' : 'in_stock';
}

export { isBorrowerBlacklisted };
