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

/** 鉴定记录（2026-09-05 T13 法定化：签批链/清册/监销/验证字段） */
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
  // ── T13 三方签批链 ──
  signApplicant: string;      // 申请单位（保管部门）
  signApplicantAt: string;
  signArchives: string;       // 档案管理部门
  signArchivesAt: string;
  signSupervisor: string;     // 监销人（审计/监察）
  signSupervisorAt: string;
  supervisorNote: string;     // 共同监销记录
  unrecoverableVerified: boolean;
  unrecoverableNote: string;
  unsettledCheck: boolean;    // 未结清债权债务核查声明
  unsettledNote: string;
  registerNo: string;         // 销毁清册编号
  registerFileNode: string;   // 清册文件节点（随档留存）
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

/**
 * 销毁三方签批（T13）：role=applicant（须带 unsettledCheck=true + unsettledNote）
 * → archives → supervisor（三方签齐自动转 approved-destroy）。
 */
export async function signAppraisal(
  id: string,
  role: 'applicant' | 'archives' | 'supervisor',
  note?: string,
  unsettledCheck?: boolean,
  unsettledNote?: string,
): Promise<AppraisalRecord> {
  return http.post(`/appraisals/${id}/sign`, {
    role, note: note || '', unsettledCheck: !!unsettledCheck, unsettledNote: unsettledNote || '',
  });
}

/** 生成销毁清册（法定字段 HTML，随档留存；幂等） */
export async function generateDestroyRegister(id: string): Promise<AppraisalRecord> {
  return http.post(`/appraisals/${id}/register`, {});
}

/** 下载销毁清册（打印/备案；fetch 会话头 → Blob） */
export async function downloadDestroyRegister(id: string, filename: string): Promise<void> {
  const blob = await http.download(`/appraisals/${id}/register-file`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 销毁执行（须清册已生成 + 监销人已签批；supervisorNote 共同监销记录必填） */
export async function executeDestroy(id: string, supervisorNote: string): Promise<AppraisalRecord> {
  return http.post(`/appraisals/${id}/execute-destroy`, { supervisorNote });
}
