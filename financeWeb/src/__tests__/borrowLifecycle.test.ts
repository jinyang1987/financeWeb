/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 借阅全生命周期 引擎+Store 回归测试
 *
 * 覆盖 PRD 核心规则：
 *   1. 动态审批路由：仅浏览→经理+管理员；下载/打印/实体→+CFO；涉密→+HRVP
 *   2. 智能拆单：电子件级授权 / 实体卷级聚合 / 被借出→预约等待
 *   3. 主单状态机推导
 *   4. 归还触发预约队列锁定
 *   5. 到期自动收回 / 逾期黑名单熔断
 *   6. 一键中止
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeApprovalRoute,
  splitFulfillments,
  deriveOrderStatus,
  isBorrowerBlacklisted,
  isVolumeLentOut,
  runDailyChecks,
} from '../utils/borrowEngine';
import { useBorrowStore } from '../stores/borrowStore';
import * as borrowApi from '../services/borrowService';
import { findUserByAccount } from '../types/user';
import type { BorrowOrder, BorrowOrderItem, Fulfillment } from '../types/borrow';

// ── 夹具 ──

function makeItem(overrides: Partial<BorrowOrderItem> = {}): BorrowOrderItem {
  return {
    id: `it-${Math.random().toString(36).slice(2, 8)}`,
    recordId: 'r1',
    volumeId: 'v1',
    title: '2026年1月记账凭证 记-001',
    voucherNo: '记-001',
    archiveType: '记账凭证',
    archiveTypeCode: 'KP',
    mediaType: 'electronic',
    securityLevel: '普通',
    stockStatus: 'in_stock',
    electronicPerms: ['view'],
    physicalMode: 'none',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<BorrowOrder> = {}): BorrowOrder {
  const items = overrides.items || [makeItem()];
  return {
    id: `o-${Math.random().toString(36).slice(2, 8)}`,
    orderNo: 'JY-2026-0099',
    applicantId: 'u-zhangwei',
    applicantName: '张伟',
    applicantEmpNo: '004521',
    applicantDept: '财务部',
    createdAt: '2026-07-18 10:00:00',
    reasonType: '内部查账',
    reasonDetail: '',
    startDate: '2026-07-18',
    endDate: '2026-07-30',
    status: 'approving',
    items,
    approvalRoute: computeApprovalRoute(items),
    currentStepIndex: 0,
    fulfillments: [],
    ...overrides,
  };
}

function makeFulfillment(overrides: Partial<Fulfillment> = {}): Fulfillment {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    orderId: 'o1',
    type: 'physical',
    status: 'lent',
    recordIds: ['r1'],
    volumeId: 'v1',
    volumeTitle: '2025年3月凭证卷',
    startDate: '2026-07-01',
    endDate: '2026-07-20',
    ...overrides,
  };
}

// ── 1. 动态审批路由 ──


// mock 借阅后端 API（store 现为纯 API 读写，业务逻辑在后端，此处验证接线）
vi.mock('../services/borrowService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/borrowService')>();
  return {
    ...actual,
    fetchOrders: vi.fn().mockResolvedValue([]),
    submitOrder: vi.fn(),
    approveOrder: vi.fn(),
    rejectOrder: vi.fn(),
    terminateOrder: vi.fn(),
    checkoutFulfillment: vi.fn().mockResolvedValue(undefined),
    returnFulfillment: vi.fn().mockResolvedValue(undefined),
    runDailyCheck: vi.fn().mockResolvedValue({ autoRevoked: 1, overdue: 2, expiringSoon: 3, date: '2026-07-29' }),
    fetchAuditLogs: vi.fn().mockResolvedValue({ items: [] }),
  };
});

describe('动态审批路由', () => {
  it('仅在线浏览 → 部门经理 + 档案管理员（2级）', () => {
    const route = computeApprovalRoute([makeItem({ electronicPerms: ['view'], physicalMode: 'none' })]);
    expect(route.map((s) => s.role)).toEqual(['dept_manager', 'archivist']);
  });

  it('含下载/打印 → 上卷 CFO（3级）', () => {
    const route = computeApprovalRoute([makeItem({ electronicPerms: ['view', 'download'] })]);
    expect(route.map((s) => s.role)).toEqual(['dept_manager', 'cfo', 'archivist']);
  });

  it('含原件外借 → 上卷 CFO', () => {
    const route = computeApprovalRoute([makeItem({ electronicPerms: [], physicalMode: 'original' })]);
    expect(route.map((s) => s.role)).toEqual(['dept_manager', 'cfo', 'archivist']);
  });

  it('涉密（秘密/机密）→ 强制 HRVP 节点', () => {
    const route = computeApprovalRoute([makeItem({ securityLevel: '秘密' })]);
    expect(route.map((s) => s.role)).toEqual(['dept_manager', 'hrvp', 'archivist']);
  });

  it('涉密 + 下载 → 完整 4 级链', () => {
    const route = computeApprovalRoute([makeItem({ securityLevel: '机密', electronicPerms: ['view', 'print'] })]);
    expect(route.map((s) => s.role)).toEqual(['dept_manager', 'cfo', 'hrvp', 'archivist']);
  });
});

// ── 2. 智能拆单 ──

describe('智能拆单', () => {
  it('电子到件：每行一张授权单，即时生效', () => {
    const order = makeOrder({
      items: [makeItem({ recordId: 'r1' }), makeItem({ recordId: 'r2' })],
      currentStepIndex: 2,
    });
    const fs = splitFulfillments(order, []);
    expect(fs.length).toBe(2);
    expect(fs.every((f) => f.type === 'electronic' && f.status === 'granted')).toBe(true);
  });

  it('实体到卷：同卷多行聚合为一张出库单', () => {
    const order = makeOrder({
      items: [
        makeItem({ recordId: 'r1', volumeId: 'v1', electronicPerms: [], physicalMode: 'original' }),
        makeItem({ recordId: 'r2', volumeId: 'v1', electronicPerms: [], physicalMode: 'original' }),
      ],
      currentStepIndex: 2,
    });
    const fs = splitFulfillments(order, []);
    expect(fs.length).toBe(1);
    expect(fs[0].type).toBe('physical');
    expect(fs[0].status).toBe('pending'); // 在库 → 待出库
    expect(fs[0].recordIds.sort()).toEqual(['r1', 'r2']);
  });

  it('卷已被借出 → 该卷实体子单转入预约等待', () => {
    const lentOrder = makeOrder({
      id: 'other',
      status: 'active',
      currentStepIndex: 2,
      fulfillments: [makeFulfillment({ volumeId: 'v1', status: 'lent' })],
    });
    const order = makeOrder({
      items: [makeItem({ volumeId: 'v1', electronicPerms: [], physicalMode: 'original' })],
      currentStepIndex: 2,
    });
    const fs = splitFulfillments(order, [lentOrder]);
    expect(fs[0].status).toBe('queued');
  });

  it('isVolumeLentOut：terminated/rejected 单不占库存', () => {
    const dead = makeOrder({
      status: 'terminated',
      fulfillments: [makeFulfillment({ volumeId: 'v1', status: 'lent' })],
    });
    expect(isVolumeLentOut('v1', [dead])).toBe(false);
  });
});

// ── 3. 状态机推导 ──

describe('主单状态机', () => {
  it('审批中 → approving', () => {
    expect(deriveOrderStatus(makeOrder())).toBe('approving');
  });
  it('全部生效 → active', () => {
    const o = makeOrder({ currentStepIndex: 2, fulfillments: [makeFulfillment({ type: 'electronic', status: 'granted' })] });
    expect(deriveOrderStatus(o)).toBe('active');
  });
  it('部分归还 → returning；全部归还 → completed', () => {
    const partial = makeOrder({
      currentStepIndex: 2,
      fulfillments: [
        makeFulfillment({ type: 'electronic', status: 'auto_revoked' }),
        makeFulfillment({ type: 'physical', status: 'lent' }),
      ],
    });
    expect(deriveOrderStatus(partial)).toBe('returning');
    const all = makeOrder({
      currentStepIndex: 2,
      fulfillments: [
        makeFulfillment({ type: 'electronic', status: 'auto_revoked' }),
        makeFulfillment({ type: 'physical', status: 'returned' }),
      ],
    });
    expect(deriveOrderStatus(all)).toBe('completed');
  });
});

// ── 4. 每日巡检 / 黑名单 ──

describe('每日巡检与黑名单', () => {
  it('电子到期自动收回（无感归还）', () => {
    const o = makeOrder({
      status: 'active', currentStepIndex: 2,
      fulfillments: [makeFulfillment({ type: 'electronic', status: 'granted', endDate: '2026-07-15' })],
    });
    const { orders, events } = runDailyChecks([o], '2026-07-18', 3);
    expect(orders[0].fulfillments[0].status).toBe('auto_revoked');
    expect(orders[0].status).toBe('completed');
    expect(events.some((e) => e.type === 'auto_revoked')).toBe(true);
  });

  it('实体逾期标记 + 黑名单熔断', () => {
    const o = makeOrder({
      status: 'active', currentStepIndex: 2,
      fulfillments: [makeFulfillment({ type: 'physical', status: 'lent', endDate: '2026-07-10' })],
    });
    const { orders } = runDailyChecks([o], '2026-07-18', 3);
    expect(orders[0].fulfillments[0].status).toBe('overdue');
    expect(isBorrowerBlacklisted('u-zhangwei', orders, '2026-07-18')).toBe(true);
    expect(isBorrowerBlacklisted('u-lina', orders, '2026-07-18')).toBe(false);
  });

  it('到期前 3 天预警事件（不变状态）', () => {
    const o = makeOrder({
      status: 'active', currentStepIndex: 2,
      fulfillments: [makeFulfillment({ type: 'physical', status: 'lent', endDate: '2026-07-20' })],
    });
    const { orders, events } = runDailyChecks([o], '2026-07-18', 3);
    expect(orders[0].fulfillments[0].status).toBe('lent');
    expect(events.some((e) => e.type === 'expiring_soon')).toBe(true);
  });
});

// ── 5. Store 集成（申请→审批→拆单→出库→归还→队列锁定） ──

describe('borrowStore API 接线（后端为事实源，此处验证 store 调用与状态刷新）', () => {
  const zhangwei = findUserByAccount('zhangwei')!;
  const wangqiang = findUserByAccount('wangqiang')!;
  const chenjing = findUserByAccount('chenjing')!;

  beforeEach(() => {
    useBorrowStore.setState({ orders: [], logs: [], cart: [] });
    vi.clearAllMocks();
  });

  it('loadOrders 从后端拉取并写入 state', async () => {
    const sample = makeOrder({ id: 'o1' });
    vi.mocked(borrowApi.fetchOrders).mockResolvedValue([sample]);
    await useBorrowStore.getState().loadOrders();
    expect(borrowApi.fetchOrders).toHaveBeenCalled();
    expect(useBorrowStore.getState().orders).toEqual([sample]);
  });

  it('submitOrder 调后端建单并刷新列表，返回新单', async () => {
    const newOrder = makeOrder({ id: 'new1' });
    vi.mocked(borrowApi.submitOrder).mockResolvedValue(newOrder);
    vi.mocked(borrowApi.fetchOrders).mockResolvedValue([newOrder]);
    const result = await useBorrowStore.getState().submitOrder({
      applicant: zhangwei, items: [makeItem()], reasonType: '外部审计', reasonDetail: '',
      startDate: '2026-07-18', endDate: '2026-07-30',
    });
    expect(borrowApi.submitOrder).toHaveBeenCalled();
    expect(result.id).toBe('new1');
    expect(useBorrowStore.getState().orders).toEqual([newOrder]);
  });

  it('approveCurrentStep 调后端审批（带意见）并刷新', async () => {
    vi.mocked(borrowApi.approveOrder).mockResolvedValue(makeOrder({ id: 'o1' }));
    vi.mocked(borrowApi.fetchOrders).mockResolvedValue([]);
    await useBorrowStore.getState().approveCurrentStep('o1', wangqiang, '同意');
    expect(borrowApi.approveOrder).toHaveBeenCalledWith('o1', '同意');
    expect(borrowApi.fetchOrders).toHaveBeenCalled();
  });

  it('rejectCurrentStep 调后端驳回并刷新', async () => {
    vi.mocked(borrowApi.rejectOrder).mockResolvedValue(makeOrder({ id: 'o1', status: 'rejected' }));
    vi.mocked(borrowApi.fetchOrders).mockResolvedValue([]);
    await useBorrowStore.getState().rejectCurrentStep('o1', wangqiang, '事由不充分');
    expect(borrowApi.rejectOrder).toHaveBeenCalledWith('o1', '事由不充分');
  });

  it('checkoutPhysical / returnPhysical 调后端履约并刷新', async () => {
    vi.mocked(borrowApi.fetchOrders).mockResolvedValue([]);
    await useBorrowStore.getState().checkoutPhysical('f1', chenjing);
    expect(borrowApi.checkoutFulfillment).toHaveBeenCalledWith('f1');
    await useBorrowStore.getState().returnPhysical('f1', chenjing);
    expect(borrowApi.returnFulfillment).toHaveBeenCalledWith('f1');
  });

  it('terminateOrder 调后端中止并刷新', async () => {
    vi.mocked(borrowApi.terminateOrder).mockResolvedValue(makeOrder({ id: 'o1', status: 'terminated' }));
    vi.mocked(borrowApi.fetchOrders).mockResolvedValue([]);
    await useBorrowStore.getState().terminateOrder('o1', chenjing);
    expect(borrowApi.terminateOrder).toHaveBeenCalledWith('o1');
  });

  it('runDaily 调后端巡检并返回处理总数（1+2+3=6）', async () => {
    vi.mocked(borrowApi.fetchOrders).mockResolvedValue([]);
    const n = await useBorrowStore.getState().runDaily();
    expect(borrowApi.runDailyCheck).toHaveBeenCalled();
    expect(n).toBe(6);
  });

  it('借阅车为本地暂态（不调后端）', () => {
    useBorrowStore.getState().addToCart('r1');
    useBorrowStore.getState().addToCart('r1'); // 去重
    useBorrowStore.getState().addToCart('r2');
    expect(useBorrowStore.getState().cart.length).toBe(2);
    useBorrowStore.getState().removeFromCart('r1');
    expect(useBorrowStore.getState().cart.length).toBe(1);
    useBorrowStore.getState().clearCart();
    expect(useBorrowStore.getState().cart.length).toBe(0);
  });
});
