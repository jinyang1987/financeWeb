/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 借阅全生命周期数据模型（2026-07-18）
 *
 * 粒度设计（用户决策）：电子授权到「件」，实体外借到「卷」。
 *
 * 主单 BorrowOrder（借阅申请单）
 *   ├── items: BorrowOrderItem[]      明细行（件级，电子权限挂在行上）
 *   ├── approvalRoute: ApprovalStep[] 动态审批链（部门经理 → [CFO] → [HRVP] → 档案管理员）
 *   └── fulfillments: Fulfillment[]   审批通过后自动拆单（电子授权单 / 实体出库单 / 预约等待单）
 */

import type { RoleKey } from './user';

// ── 基础枚举 ──

/** 电子权限（件级勾选） */
export type ElectronicPerm = 'view' | 'download' | 'print';

/** 实体外借方式（卷级） */
export type PhysicalMode = 'none' | 'original' | 'copy';

/** 介质类型 */
export type MediaType = 'electronic' | 'paper' | 'mixed';

/** 实体库存状态（申请时实时校验快照） */
export type StockStatus = 'in_stock' | 'lent_out';

// ── 借阅车 ──

export interface CartItem {
  recordId: string;
  addedAt: string;
}

// ── 申请单明细行 ──

export interface BorrowOrderItem {
  id: string;
  recordId: string;
  volumeId: string;
  /** 件题名（冗余展示） */
  title: string;
  voucherNo: string;
  archiveType: string;
  archiveTypeCode: string;
  /** 介质类型（由所属案卷推导） */
  mediaType: MediaType;
  /** 密级（取记录与案卷中较高者） */
  securityLevel: string;
  /** 实体库存状态快照（提交申请时校验） */
  stockStatus: StockStatus;
  /** 申请的电子权限（件级） */
  electronicPerms: ElectronicPerm[];
  /** 申请的实体外借方式（卷级，同卷多行须一致） */
  physicalMode: PhysicalMode;
}

// ── 审批 ──

export interface ApprovalStep {
  seq: number;
  role: RoleKey;
  roleLabel: string;
  /** 该角色默认审批人（演示环境取角色首个用户） */
  assigneeName: string;
  status: 'pending' | 'approved' | 'rejected';
  actedBy?: string;
  actedAt?: string;
  comment?: string;
}

// ── 履约子单（拆单结果） ──

export type FulfillmentType = 'electronic' | 'physical';

export type FulfillmentStatus =
  | 'pending'         // 待履约（实体：待出库）
  | 'granted'         // 电子已授权（在线调阅生效中）
  | 'lent'            // 实体已借出
  | 'queued'          // 预约等待（卷被他人借出，归还后优先锁定）
  | 'returned'        // 实体已归还
  | 'auto_revoked'    // 电子到期自动收回（无感归还）
  | 'overdue'         // 实体逾期未还
  | 'terminated';     // 管理员中止

export interface Fulfillment {
  id: string;
  orderId: string;
  type: FulfillmentType;
  status: FulfillmentStatus;
  /** 关联件（电子=1件；实体=该卷全部件） */
  recordIds: string[];
  /** 所属案卷（实体外借单元） */
  volumeId: string;
  /** 卷题名（冗余展示） */
  volumeTitle: string;
  physicalMode?: 'original' | 'copy';
  /** 借阅期限（继承主单） */
  startDate: string;
  endDate: string;
  /** 电子授权时间 */
  grantedAt?: string;
  /** 实体出库时间 */
  lentAt?: string;
  /** 归还/收回时间 */
  returnedAt?: string;
  /** 出库/归还核销人 */
  operatorBy?: string;
}

// ── 借阅主单 ──

export type OrderStatus =
  | 'approving'   // 审批中
  | 'rejected'    // 已驳回
  | 'fulfilling'  // 履约中（部分子单已生效）
  | 'active'      // 借阅中（全部子单已生效：电子已授权/实体已借出）
  | 'returning'   // 部分归还
  | 'completed'   // 已完成（全部归还/收回）
  | 'terminated'; // 已中止

export interface BorrowOrder {
  id: string;
  /** 借阅单号 JY-YYYY-NNNN */
  orderNo: string;
  applicantId: string;
  applicantName: string;
  applicantEmpNo: string;
  applicantDept: string;
  createdAt: string;
  /** 借阅事由（下拉） */
  reasonType: string;
  /** 事由补充说明 */
  reasonDetail: string;
  /** 借阅周期 */
  startDate: string;
  endDate: string;
  status: OrderStatus;
  items: BorrowOrderItem[];
  approvalRoute: ApprovalStep[];
  /** 当前审批节点下标（-1 = 未开始/已结束） */
  currentStepIndex: number;
  fulfillments: Fulfillment[];
}

// ── 操作日志（等保：全链路不可篡改留痕） ──

export interface BorrowLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRoleLabel: string;
  /** 动作：发起申请/提交审批/审批通过/审批驳回/电子授权/实体出库/预约排队/归还核销/到期收回/逾期预警/中止借阅/在线查看/下载/打印 */
  action: string;
  /** 对象描述 */
  target: string;
  orderId?: string;
  detail?: string;
}

// ── 常量 ──

export const REASON_OPTIONS = ['外部审计', '税务稽查', '内部查账', '法律诉讼', '财务检查', '其他'] as const;

/** 系统可配置：最大借阅天数 */
export const MAX_BORROW_DAYS = 30;

/** 到期前预警天数 */
export const EXPIRY_WARN_DAYS = 3;

export const PERM_LABELS: Record<ElectronicPerm, string> = {
  view: '在线浏览',
  download: '允许下载',
  print: '允许打印',
};

export const PHYSICAL_MODE_LABELS: Record<PhysicalMode, string> = {
  none: '不外借实体',
  original: '原件外借',
  copy: '复印件',
};

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  electronic: '纯电子',
  paper: '纯实体',
  mixed: '混合',
};

export const STOCK_LABELS: Record<StockStatus, string> = {
  in_stock: '实体在库',
  lent_out: '实体借出',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  approving: '审批中',
  rejected: '已驳回',
  fulfilling: '履约中',
  active: '借阅中',
  returning: '归还中',
  completed: '已完成',
  terminated: '已中止',
};

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  pending: '待出库',
  granted: '已授权',
  lent: '已借出',
  queued: '预约等待',
  returned: '已归还',
  auto_revoked: '已收回',
  overdue: '已逾期',
  terminated: '已中止',
};
