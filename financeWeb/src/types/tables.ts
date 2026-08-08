/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 表格数据类型定义 — 消除 any[] 的精准类型
 */

/** 档案接收业务台账 */
export interface RcvTableItem {
  id: string;
  voucherNo: string;
  matchStatus: string;
  volume: string;
}

/** 工作流审批记录 */
export interface WfTableItem {
  id: string;
  orderId: string;
  borrower: string;
  reason: string;
  status: string;
}

/** 借阅记录（列表视图） */
export interface BorrowListItem {
  id: string;
  onShelfTime: string;
  borrowTime: string;
  person: string;
  dept: string;
  vouchers: string;
}

/** 归还/催缴记录 */
export interface ReturnTableItem {
  id: string;
  code: string;
  deadline: string;
  overdueDays: number;
  status: string;
}

/** 特殊借阅工单 */
export interface SpecialOrderItem {
  id: string;
  orderNum: string;
  borrower: string;
  category: string;
  sameUnit: string;
  stepActive: number;
}

/** 数据清洗记录 */
export interface CleanTableItem {
  id: string;
  rawVoucher: string;
  cleanVoucher: string;
  archiveCode: string;
  isSegment: boolean;
  status: string;
}

/** 借阅订单（带节点状态） */
export interface BorrowOrderItem {
  id: string;
  orderId: string;
  borrower: string;
  dept: string;
  vouchers: string;
  nodeStatus: string;
}
