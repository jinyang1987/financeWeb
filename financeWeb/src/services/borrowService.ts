/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * borrowService — 借阅域 API（P2-1/2/3）
 */

import { http } from './http';
import type { BorrowOrder, BorrowOrderItem, ApprovalStep, Fulfillment } from '../types/borrow';
import { ROLE_LABELS, firstUserWithRole, type RoleKey } from '../types/user';

// ─── API ───

// ─── 后端 DTO（snake_case，对应 BorrowService.enrichOrder 返回） ───
interface OrderDto {
  id: string; order_no: string; applicant_id: string;
  applicant_name?: string; applicant_emp_no?: string; applicant_dept?: string;
  reason_type: string; reason_detail: string; start_date: string; end_date: string;
  status: string; current_step: number; created_at: string;
  items?: ItemDto[]; approvalRoute?: StepDto[]; fulfillments?: FulfillDto[];
}
interface ItemDto {
  id: string; record_node_id: string; volume_node_id: string; title: string;
  type_code: string; media_type: string; security_level: string; stock_status: string;
  perms: string | string[]; physical_mode: string; voucher_no?: string; archive_type?: string;
}
interface StepDto {
  seq: number; role: string; status: string;
  acted_by?: string; acted_at?: string; comment?: string;
}
interface FulfillDto {
  id: string; order_id: string; type: string; status: string;
  volume_node_id: string; record_node_ids: string | string[]; physical_mode?: string;
  start_date: string; end_date: string; granted_at?: string; lent_at?: string;
  returned_at?: string; operator_id?: string; volume_title?: string;
}

/** 后端 text[] 可能返回数组或逗号串，统一转字符串数组 */
function toStrArr(v: string | string[] | undefined | null): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.length > 0) return v.startsWith('{') ? v.replace(/^[{"]+|[}"]+$/g, '').split(',').filter(Boolean) : v.split(',').filter(Boolean);
  return [];
}

function dtoToItem(d: ItemDto): BorrowOrderItem {
  return {
    id: d.id, recordId: d.record_node_id, volumeId: d.volume_node_id, title: d.title,
    voucherNo: d.voucher_no || '', archiveType: d.archive_type || '', archiveTypeCode: d.type_code,
    mediaType: (d.media_type || 'electronic') as BorrowOrderItem['mediaType'],
    securityLevel: d.security_level || '普通',
    stockStatus: (d.stock_status || 'in_stock') as BorrowOrderItem['stockStatus'],
    electronicPerms: toStrArr(d.perms) as BorrowOrderItem['electronicPerms'],
    physicalMode: (d.physical_mode || 'none') as BorrowOrderItem['physicalMode'],
  };
}

function dtoToStep(d: StepDto): ApprovalStep {
  const role = d.role as RoleKey;
  return {
    seq: d.seq, role, roleLabel: ROLE_LABELS[role] || role,
    assigneeName: firstUserWithRole(role)?.name || ROLE_LABELS[role] || role,
    status: (d.status || 'pending') as ApprovalStep['status'],
    actedBy: d.acted_by, actedAt: d.acted_at ? d.acted_at.replace('T', ' ').slice(0, 19) : undefined,
    comment: d.comment,
  };
}

function dtoToFulfill(d: FulfillDto): Fulfillment {
  return {
    id: d.id, orderId: d.order_id,
    type: (d.type || 'electronic') as Fulfillment['type'],
    status: (d.status || 'pending') as Fulfillment['status'],
    recordIds: toStrArr(d.record_node_ids), volumeId: d.volume_node_id,
    volumeTitle: d.volume_title || '',
    physicalMode: d.physical_mode as Fulfillment['physicalMode'],
    startDate: d.start_date, endDate: d.end_date,
    grantedAt: d.granted_at, lentAt: d.lent_at, returnedAt: d.returned_at, operatorBy: d.operator_id,
  };
}

export function dtoToBorrowOrder(d: OrderDto): BorrowOrder {
  return {
    id: d.id, orderNo: d.order_no, applicantId: d.applicant_id,
    applicantName: d.applicant_name || '', applicantEmpNo: d.applicant_emp_no || '', applicantDept: d.applicant_dept || '',
    createdAt: (d.created_at || '').replace('T', ' ').slice(0, 19),
    reasonType: d.reason_type, reasonDetail: d.reason_detail || '',
    startDate: d.start_date, endDate: d.end_date,
    status: (d.status || 'approving') as BorrowOrder['status'],
    currentStepIndex: d.current_step ?? 0,
    items: (d.items || []).map(dtoToItem),
    approvalRoute: (d.approvalRoute || []).map(dtoToStep),
    fulfillments: (d.fulfillments || []).map(dtoToFulfill),
  };
}


export interface SubmitOrderCmd {
  applicantName: string;
  applicantEmpNo: string;
  applicantDept: string;
  reasonType: string;
  reasonDetail: string;
  startDate: string;
  endDate: string;
  items: Array<{
    recordId: string;
    volumeId: string;
    title: string;
    voucherNo?: string;
    archiveType?: string;
    archiveTypeCode: string;
    mediaType: string;
    securityLevel: string;
    stockStatus: string;
    electronicPerms: string[];
    physicalMode: string;
  }>;
}

export async function submitOrder(cmd: SubmitOrderCmd): Promise<BorrowOrder> {
  const dto = await http.post<OrderDto>('/borrow/orders', cmd);
  return dtoToBorrowOrder(dto);
}

export async function fetchOrders(params: { mine?: string; pendingForRole?: string; status?: string }): Promise<BorrowOrder[]> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
  const list = await http.get<OrderDto[]>(`/borrow/orders?${qs.toString()}`);
  return (Array.isArray(list) ? list : []).map(dtoToBorrowOrder);
}

export async function fetchOrder(id: string): Promise<BorrowOrder> {
  const dto = await http.get<OrderDto>(`/borrow/orders/${id}`);
  return dtoToBorrowOrder(dto);
}

export async function approveOrder(id: string, comment?: string): Promise<BorrowOrder> {
  const dto = await http.post<OrderDto>(`/borrow/orders/${id}/approve`, { comment });
  return dtoToBorrowOrder(dto);
}

export async function rejectOrder(id: string, comment?: string): Promise<BorrowOrder> {
  const dto = await http.post<OrderDto>(`/borrow/orders/${id}/reject`, { comment });
  return dtoToBorrowOrder(dto);
}

/** 申请人本人撤销（仅审批中；服务端按会话校验身份，防他人代撤） */
export async function cancelOrderByApplicant(id: string): Promise<BorrowOrder> {
  const dto = await http.post<OrderDto>(`/borrow/orders/${id}/cancel`);
  return dtoToBorrowOrder(dto);
}

export async function terminateOrder(id: string): Promise<BorrowOrder> {
  const dto = await http.post<OrderDto>(`/borrow/orders/${id}/terminate`);
  return dtoToBorrowOrder(dto);
}

export async function checkoutFulfillment(id: string) {
  return http.post(`/borrow/fulfillments/${id}/checkout`);
}

export async function returnFulfillment(id: string) {
  return http.post(`/borrow/fulfillments/${id}/return`);
}

export async function checkAvailability(volumeId: string) {
  return http.get(`/borrow/availability/${volumeId}`);
}

export async function checkBlacklist(userId: string) {
  return http.get(`/borrow/blacklist/${userId}`);
}

export interface DailyCheckResult { autoRevoked: number; overdue: number; expiringSoon: number; date: string; }
export async function runDailyCheck(): Promise<DailyCheckResult> {
  return http.post<DailyCheckResult>('/borrow/daily-check');
}

// P2-4 审计日志
export async function fetchAuditLogs(params: { actorId?: string; action?: string; orderId?: string; skip?: number; limit?: number }) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) qs.set(k, String(v)); });
  return http.get(`/audit/logs?${qs.toString()}`);
}

// P3-1 四性检测
export async function runInspection(nodeId: string, phase?: string) {
  return http.post('/inspection/run', { nodeId, phase });
}

export async function fetchInspectionReports(target?: string) {
  const qs = target ? `?target=${encodeURIComponent(target)}` : "";
  return http.get(`/inspection/reports${qs}`);
}

// P4-2 库房
export async function fetchStorageTree() {
  return http.get('/storage/tree');
}

export async function fetchStorageOccupancy() {
  return http.get('/storage/occupancy');
}

// P4-4 统计
export async function fetchInventoryStats() {
  return http.get('/stats/inventory');
}

export async function fetchBorrowStats() {
  return http.get('/stats/borrow');
}

export async function fetchLifecycleStats() {
  return http.get('/stats/lifecycle');
}

export async function fetchComplianceStats() {
  return http.get('/stats/compliance');
}

// P3-3 OCR
export async function triggerOcr(nodeId: string) {
  return http.post(`/records/${nodeId}/ocr`);
}



