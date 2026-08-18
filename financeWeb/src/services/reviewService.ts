/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * reviewService — 审核库 API（2026-08-09）
 *
 * 对应 ams-server /review/**：
 *   GET  /review/pending                 审核库列表（fondsCode 必传）
 *   GET  /review/records/{nodeId}/history 审核历史
 *   POST /review/records/{nodeId}/enter   进审核库（仅件数据 → 待审核）
 *   POST /review/records/{nodeId}/approve 审核通过（待审核 → 仅件数据）
 *   POST /review/records/{nodeId}/reject  审核驳回
 */

import { http } from './http';

// ─── 类型 ───

export interface ReviewActionLog {
  id: number;
  record_node_id: string;
  action: 'enter' | 'approve' | 'reject';
  reviewer: string;
  comment: string;
  created_at: string;
}

export interface ReviewPendingItem {
  nodeId: string;
  name: string;
  voucherNo: string;
  archiveCode: string;
  archiveType: string;
  year: number | null;
  month: number | null;
  amount: number | null;
  department: string;
  recordStatus: string;
  sourceSystem?: string;
  externalId?: string;
  period?: string;
  source?: string;
  carrierType?: string;
  createdBy?: string;
  createdAt?: string;
  summary?: string;
  reviewHistory?: ReviewActionLog[];
  lastReview?: ReviewActionLog;
}

// ─── API ───

export const reviewService = {
  pending: (params: { fondsCode: string; archiveType?: string; year?: number; month?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    return http.get<ReviewPendingItem[]>(`/review/pending?${qs.toString()}`);
  },

  /** 已处理（审核通过/驳回过）的记录，按最近动作倒序 */
  processed: (fondsCode: string) =>
    http.get<ReviewPendingItem[]>(`/review/processed?fondsCode=${encodeURIComponent(fondsCode)}`),

  history: (nodeId: string) =>
    http.get<ReviewActionLog[]>(`/review/records/${nodeId}/history`),

  enter: (nodeId: string, comment?: string) =>
    http.post<ReviewPendingItem>(`/review/records/${nodeId}/enter`, { comment: comment || '' }),

  approve: (nodeId: string, comment?: string) =>
    http.post<ReviewPendingItem>(`/review/records/${nodeId}/approve`, { comment: comment || '' }),

  reject: (nodeId: string, comment?: string) =>
    http.post<ReviewPendingItem>(`/review/records/${nodeId}/reject`, { comment: comment || '' }),
};
