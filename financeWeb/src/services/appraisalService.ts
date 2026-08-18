/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * appraisalService — 鉴定销毁 API（2026-08-16 启用 ams_appraisal）
 *
 * 对应 ams-server /appraisals：
 *   GET  /appraisals/due-volumes?fondsCode=   到期案卷实时测算
 *   POST /appraisals/scan?fondsCode=          到期卷登记为待鉴定任务（幂等）
 *   GET  /appraisals?status=                  鉴定记录列表
 *   POST /appraisals/{id}/review              评审（decision=destroy/retain）
 *   POST /appraisals/{id}/execute-destroy     销毁执行（删卷节点+留痕）
 */

import { http } from './http';

/** 到期案卷（实时测算视图） */
export interface DueVolume {
  volumeNode: string;
  title: string;
  volumeCode: string;
  year: number;
  retention: string;
  dueDate: string;
  boxNo: string;
  totalItems: number | null;
  appraisalStatus: string;   // 已有未终结鉴定状态（pending/approved-destroy），空串=未登记
}

/** 鉴定记录 */
export interface AppraisalRecord {
  id: string;
  volumeNode: string;
  dueDate: string;
  status: 'pending' | 'approved-destroy' | 'retained' | 'destroyed' | string;
  decision: 'destroy' | 'retain' | null;
  meetingNote: string | null;
  reviewer: string | null;
  reviewedAt: string;
  destroyedAt: string;
}

export async function fetchDueVolumes(fondsCode: string): Promise<DueVolume[]> {
  return http.get<DueVolume[]>(`/appraisals/due-volumes?fondsCode=${encodeURIComponent(fondsCode)}`);
}

export async function scanAppraisals(fondsCode: string): Promise<{ dueVolumes: number; registered: number }> {
  return http.post(`/appraisals/scan?fondsCode=${encodeURIComponent(fondsCode)}`);
}

export async function fetchAppraisals(status?: string): Promise<AppraisalRecord[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return http.get<AppraisalRecord[]>(`/appraisals${qs}`);
}

export async function reviewAppraisal(
  id: string,
  decision: 'destroy' | 'retain',
  meetingNote: string,
): Promise<AppraisalRecord> {
  return http.post(`/appraisals/${id}/review`, { decision, meetingNote });
}

export async function executeDestroy(id: string): Promise<AppraisalRecord> {
  return http.post(`/appraisals/${id}/execute-destroy`);
}
