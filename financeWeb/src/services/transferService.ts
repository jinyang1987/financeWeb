/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * transferService — 对外移交批次 API（2026-08-16 启用 ams_transfer_batch）
 *
 * 对应 ams-server /transfers：
 *   GET    /transfers                  批次列表（status 过滤；resolveVolumes 附卷明细）
 *   GET    /transfers/{id}             批次详情
 *   POST   /transfers                  发起移交（pending）
 *   POST   /transfers/{id}/prepare     生成移交清册（→ prepared）
 *   POST   /transfers/{id}/receive     签收（→ received）
 *   POST   /transfers/{id}/reject      退回（prepared → pending）
 *   DELETE /transfers/{id}             删除（仅 pending）
 *
 * 语义边界：本域是「对外正式移交」（会计部 → 档案部/馆）的批次台账；
 * 组卷工作台的「移交归盒」是所内归档动作（卷→盒库），两者不同。
 */

import { http } from './http';

// ─── 视图（与 TransferService.row 对齐） ───
export interface TransferBatchVolume {
  nodeId: string;
  title: string;
  volumeCode: string;
  status: string;
  totalItems: number;
}

export interface TransferBatch {
  id: string;
  transferNo: string;          // TJ-yyyyMMdd-NNN
  fromDept: string;
  toDept: string;
  fromPerson: string;
  toPerson: string;
  volumeNodes: string[];
  totalVolumes: number;
  totalItems: number;
  status: 'pending' | 'prepared' | 'received' | string;
  transferDate: string;
  receivedAt: string;
  volumes?: TransferBatchVolume[];   // resolveVolumes=true 时返回
}

// ─── API ───

export async function fetchTransferBatches(params?: {
  status?: string;
  resolveVolumes?: boolean;
}): Promise<TransferBatch[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.resolveVolumes) qs.set('resolveVolumes', 'true');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return http.get<TransferBatch[]>(`/transfers${suffix}`);
}

export async function fetchTransferBatch(id: string): Promise<TransferBatch> {
  return http.get<TransferBatch>(`/transfers/${id}`);
}

export async function createTransferBatch(cmd: {
  fromDept: string;
  toDept: string;
  fromPerson: string;
  toPerson: string;
  volumeNodes: string[];
  transferDate?: string;
}): Promise<{ transferNo: string; totalVolumes: number; totalItems: number }> {
  return http.post('/transfers', cmd);
}

export async function prepareTransferBatch(id: string): Promise<TransferBatch> {
  return http.post(`/transfers/${id}/prepare`);
}

export async function receiveTransferBatch(id: string): Promise<TransferBatch> {
  return http.post(`/transfers/${id}/receive`);
}

export async function rejectTransferBatch(id: string, reason?: string): Promise<TransferBatch> {
  return http.post(`/transfers/${id}/reject`, { reason: reason || '' });
}

export async function deleteTransferBatch(id: string): Promise<void> {
  await http.delete(`/transfers/${id}`);
}
