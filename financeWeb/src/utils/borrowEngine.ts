/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 借阅引擎（纯函数，可单测）
 *
 * 职责：
 *   1. 动态审批路由（按权限 + 密级）
 *   2. 审批通过后的智能拆单（电子授权 / 实体出库 / 预约等待）
 *   3. 状态机推导（主单状态 ← 履约子单状态）
 *   4. 库存占用 / 逾期 / 黑名单判定
 *   5. 每日巡检（电子到期自动收回、实体逾期标记）
 */

import type {
  ApprovalStep,
  BorrowOrder,
  BorrowOrderItem,
  Fulfillment,
  FulfillmentStatus,
  OrderStatus,
} from '../types/borrow';
import { ROLE_LABELS, firstUserWithRole, type RoleKey } from '../types/user';
import { DEFAULT_BORROW_CHAIN_RULES, type ApprovalChainRules } from '../stores/workflowConfigStore';

// ──────────────────────────────────────────────
// 1. 动态审批路由
// ──────────────────────────────────────────────

/** 高危权限：下载/打印/原件外借/复印件 → 升级 CFO */
export function needsCfoApproval(items: BorrowOrderItem[]): boolean {
  return items.some(
    (it) =>
      it.electronicPerms.includes('download') ||
      it.electronicPerms.includes('print') ||
      it.physicalMode !== 'none',
  );
}

/** 涉密判定：秘密/机密 → 强制 HRVP 节点 */
export function hasSensitiveItems(items: BorrowOrderItem[]): boolean {
  return items.some((it) => it.securityLevel === '秘密' || it.securityLevel === '机密');
}

/**
 * 计算审批链（预览）：
 *   组链规则来自流程配置「借阅利用」（ApprovalChainRules），与服务端运行时同一份配置；
 *   未传 rules 时回退内置默认链（与历史硬编码一致）。
 *   base（基础链）→ escalation（条件追加）→ final（终审），去重保序。
 */
export function computeApprovalRoute(items: BorrowOrderItem[], rules?: ApprovalChainRules): ApprovalStep[] {
  const r = rules ?? DEFAULT_BORROW_CHAIN_RULES;
  const extended = needsCfoApproval(items);
  const sensitive = hasSensitiveItems(items);

  const roles: string[] = [];
  for (const role of r.base) if (!roles.includes(role)) roles.push(role);
  for (const esc of r.escalation) {
    if ((esc.when === 'extended_perms' && extended) || (esc.when === 'sensitive' && sensitive)) {
      if (esc.appendRole && !roles.includes(esc.appendRole)) roles.push(esc.appendRole);
    }
  }
  if (r.final && !roles.includes(r.final)) roles.push(r.final);

  return roles
    .filter((role): role is RoleKey => role in ROLE_LABELS)
    .map((role, i) => ({
      seq: i + 1,
      role,
      roleLabel: ROLE_LABELS[role],
      assigneeName: firstUserWithRole(role)?.name || ROLE_LABELS[role],
      status: 'pending' as const,
    }));
}

// ──────────────────────────────────────────────
// 2. 智能拆单
// ──────────────────────────────────────────────

/** 卷当前是否被借出（存在生效中的实体履约单） */
export function isVolumeLentOut(volumeId: string, orders: BorrowOrder[]): boolean {
  return orders.some((o) =>
    o.status !== 'terminated' && o.status !== 'rejected' &&
    o.fulfillments.some(
      (f) => f.type === 'physical' && f.volumeId === volumeId &&
        (f.status === 'lent' || f.status === 'overdue'),
    ),
  );
}

/** 卷是否有排队中的预约单 */
export function queuedFulfillmentsFor(volumeId: string, orders: BorrowOrder[]): Fulfillment[] {
  return orders
    .filter((o) => o.status !== 'terminated' && o.status !== 'rejected')
    .flatMap((o) => o.fulfillments)
    .filter((f) => f.type === 'physical' && f.volumeId === volumeId && f.status === 'queued');
}

/**
 * 审批通过瞬间拆单：
 *   电子：每行（件）一张授权单 → granted（即时履约）
 *   实体：按卷聚合成出库单 → 在库 pending（待出库）；已借出 queued（预约等待）
 */
export function splitFulfillments(order: BorrowOrder, existingOrders: BorrowOrder[]): Fulfillment[] {
  const result: Fulfillment[] = [];
  let seq = 1;

  // 电子授权：件级
  for (const item of order.items) {
    if (item.electronicPerms.length === 0) continue;
    result.push({
      id: `${order.id}-F${seq++}`,
      orderId: order.id,
      type: 'electronic',
      status: 'granted',
      recordIds: [item.recordId],
      volumeId: item.volumeId,
      volumeTitle: item.title,
      startDate: order.startDate,
      endDate: order.endDate,
      grantedAt: order.createdAt,
    });
  }

  // 实体出库：卷级聚合（同卷多行只出一张单，外借方式取该卷首个非 none）
  const physicalByVolume = new Map<string, BorrowOrderItem[]>();
  for (const item of order.items) {
    if (item.physicalMode === 'none') continue;
    const list = physicalByVolume.get(item.volumeId) || [];
    list.push(item);
    physicalByVolume.set(item.volumeId, list);
  }

  for (const [volumeId, items] of physicalByVolume) {
    const lentOut =
      isVolumeLentOut(volumeId, existingOrders) ||
      // 同一张主单内不允许两个实体子单重复占用（理论不会发生，防御）
      result.some((f) => f.type === 'physical' && f.volumeId === volumeId);
    result.push({
      id: `${order.id}-F${seq++}`,
      orderId: order.id,
      type: 'physical',
      status: lentOut ? 'queued' : 'pending',
      recordIds: items.map((i) => i.recordId),
      volumeId,
      volumeTitle: items[0].title,
      physicalMode: items[0].physicalMode === 'copy' ? 'copy' : 'original',
      startDate: order.startDate,
      endDate: order.endDate,
    });
  }

  return result;
}

// ──────────────────────────────────────────────
// 3. 状态机推导
// ──────────────────────────────────────────────

const ACTIVE_SET: FulfillmentStatus[] = ['pending', 'granted', 'lent', 'queued', 'overdue'];
const DONE_SET: FulfillmentStatus[] = ['returned', 'auto_revoked', 'terminated'];

/** 主单状态 ← 履约子单集合 */
export function deriveOrderStatus(order: BorrowOrder): OrderStatus {
  if (order.status === 'rejected' || order.status === 'terminated') return order.status;
  if (order.currentStepIndex >= 0 && order.currentStepIndex < order.approvalRoute.length) {
    return 'approving';
  }
  const fs = order.fulfillments;
  if (fs.length === 0) return 'fulfilling';
  const doneCount = fs.filter((f) => DONE_SET.includes(f.status)).length;
  if (doneCount === fs.length) return 'completed';
  if (doneCount > 0) return 'returning';
  const allActive = fs.every((f) => ACTIVE_SET.includes(f.status));
  if (allActive && fs.some((f) => f.status === 'granted' || f.status === 'lent' || f.status === 'overdue')) return 'active';
  return 'fulfilling';
}

// ──────────────────────────────────────────────
// 4. 逾期 / 黑名单
// ──────────────────────────────────────────────

/** 今天（本地日期 YYYY-MM-DD） */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 履约单是否逾期（实体借出/待出库 且 超过应还日期） */
export function isOverdue(f: Fulfillment, today: string): boolean {
  return f.type === 'physical' && (f.status === 'lent' || f.status === 'overdue') && f.endDate < today;
}

/** 距到期天数（负数=已逾期） */
export function daysUntil(endDate: string, today: string): number {
  const ms = new Date(endDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime();
  return Math.round(ms / 86400000);
}

/** 黑名单判定：名下有逾期未还实体档案 → 锁死新建借阅单 */
export function isBorrowerBlacklisted(applicantId: string, orders: BorrowOrder[], today: string): boolean {
  return orders.some(
    (o) => o.applicantId === applicantId &&
      o.status !== 'terminated' && o.status !== 'rejected' &&
      o.fulfillments.some((f) => isOverdue(f, today)),
  );
}

// ──────────────────────────────────────────────
// 5. 每日巡检（到期自动收回 / 逾期标记）
// ──────────────────────────────────────────────

export interface DailyCheckEvent {
  type: 'auto_revoked' | 'overdue' | 'expiring_soon';
  order: BorrowOrder;
  fulfillment: Fulfillment;
}

/**
 * 每日巡检（纯函数，返回新订单数组 + 事件，不改原数组）：
 *   - 电子 granted 且到期日 < 今天 → auto_revoked（无感归还）
 *   - 实体 lent 且到期日 < 今天 → overdue
 *   - 实体 lent 且 0 ≤ 距到期 ≤ warnDays → expiring_soon（预警事件）
 */
export function runDailyChecks(orders: BorrowOrder[], today: string, warnDays: number): { orders: BorrowOrder[]; events: DailyCheckEvent[] } {
  const events: DailyCheckEvent[] = [];
  const next = orders.map((order) => {
    if (order.status === 'terminated' || order.status === 'rejected' || order.status === 'completed') return order;
    let changed = false;
    const fulfillments = order.fulfillments.map((f) => {
      if (f.type === 'electronic' && f.status === 'granted' && f.endDate < today) {
        changed = true;
        const nf = { ...f, status: 'auto_revoked' as const, returnedAt: today };
        events.push({ type: 'auto_revoked', order, fulfillment: nf });
        return nf;
      }
      if (f.type === 'physical' && f.status === 'lent') {
        if (f.endDate < today) {
          changed = true;
          const nf = { ...f, status: 'overdue' as const };
          events.push({ type: 'overdue', order, fulfillment: nf });
          return nf;
        }
        const rest = daysUntil(f.endDate, today);
        if (rest >= 0 && rest <= warnDays) {
          events.push({ type: 'expiring_soon', order, fulfillment: f });
        }
      }
      return f;
    });
    if (!changed) return order;
    const nextOrder = { ...order, fulfillments };
    return { ...nextOrder, status: deriveOrderStatus(nextOrder) };
  });
  return { orders: next, events };
}
