/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * yonyouService — 用友BIP集成 API（2026-08-08）
 *
 * 对应 ams-server /yonyou/**：连接配置、连接测试、期间预览、手动同步、
 * 批次历史/明细、月度自动归档调度配置。
 */

import { http } from './http';

// ─── 类型 ───

export interface YonyouStatus {
  configured: boolean;
  gateway?: string;
  tenantId?: string;
  appKey?: string;
  accbookCode?: string;
  fondsCode?: string;
  syncRunning: boolean;
  schedule: { enabled: boolean; cron: string; autoGroup: boolean; nextRun: string };
  lastBatch: SyncBatch | null;
}

export interface YonyouConfig {
  configured: boolean;
  gateway?: string;
  appKey?: string;
  appSecret?: string;   // 回显恒为 ********（脱敏）
  tenantId?: string;
  accbookCode?: string;
  fondsCode?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  accbook?: { id: string; code: string; name: string };
  error?: string;
  elapsedMs: number;
}

export interface SyncBatch {
  id: number;
  batch_no: string;
  period: string;
  trigger_type: 'manual' | 'auto';
  status: 'running' | 'success' | 'partial' | 'failed';
  total_count: number;
  success_count: number;
  skip_count: number;
  fail_count: number;
  report_count: number;
  volume_node_id: string | null;
  message: string | null;
  operator: string;
  started_at: string;
  finished_at: string | null;
  elapsed_seconds: number | null;
}

export interface SyncItem {
  id: number;
  item_type: 'voucher' | 'report';
  external_id: string;
  voucher_no: string | null;
  summary: string | null;
  amount: number | null;
  status: 'success' | 'skipped' | 'failed';
  record_node_id: string | null;
  archive_code: string | null;
  error: string | null;
  created_at: string;
}

export interface SyncBatchDetail extends SyncBatch {
  items: SyncItem[];
}

export interface ScheduleConfig {
  enabled: boolean;
  cron: string;
  autoGroup: boolean;
  nextRun?: string;
  suggestedPeriod?: string;
}

// ─── API ───

export const yonyouService = {
  status: () => http.get<YonyouStatus>('/yonyou/status'),

  getConfig: () => http.get<YonyouConfig>('/yonyou/config'),

  saveConfig: (cfg: {
    gateway: string; appKey: string; appSecret: string;
    tenantId: string; accbookCode: string; fondsCode: string;
  }) => http.put<YonyouConfig>('/yonyou/config', cfg),

  testConnection: () => http.post<TestConnectionResult>('/yonyou/test-connection'),

  periods: () => http.get<{ periods: string[]; suggested: string }>('/yonyou/periods'),

  preview: (period: string) =>
    http.post<{ period: string; voucherCount: number }>('/yonyou/preview', { period }),

  sync: (period: string, autoGroup?: boolean, review?: boolean,
         destination?: 'auto-archive' | 'to-volume' | 'to-check' | 'to-review') =>
    http.post<SyncBatchDetail>('/yonyou/sync', { period, autoGroup, review, destination }),

  batches: (limit = 30) => http.get<SyncBatch[]>(`/yonyou/batches?limit=${limit}`),

  batchDetail: (id: number) => http.get<SyncBatchDetail>(`/yonyou/batches/${id}`),

  getSchedule: () => http.get<ScheduleConfig>('/yonyou/schedule'),

  saveSchedule: (cfg: { enabled: boolean; cron: string; autoGroup: boolean }) =>
    http.put<ScheduleConfig>('/yonyou/schedule', cfg),
};
