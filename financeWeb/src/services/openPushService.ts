/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * openPushService — 推送接入 API v2（统一四类契约，2026-08-16）
 *
 * 对应 ams-server /open/v1/**：
 *   档案侧管理（会话认证）：
 *     GET  /open/v1/apps                        接入应用列表
 *     POST /open/v1/apps                        签发接入应用（含默认去向）
 *     PUT  /open/v1/apps/{id}/destination       修改应用默认去向
 *     GET  /open/v1/batches                     推送批次历史
 *     POST /open/v1/batches/{batchNo}/four-checks 批次运行四性检测
 *     POST /open/v1/batches/{batchNo}/auto-group  批次自动组卷
 *     GET  /open/v1/logs                        推送全链路日志
 *     POST /open/v1/simulate                    模拟推送（演示）
 *     （2026-08-21 收敛：核对工作台已移除；collect/pending-check、to-review 等
 *      历史端点服务端仍在但前端不再消费，遗留去向归一为送组卷工作台）
 *     GET/PUT /open/v1/field-maps/{sourceSystem} 字段映射（低代码集成）
 *     POST /open/v1/field-maps/test             试映射
 *
 *   推送方（业务系统）调用端点（Bearer）：
 *     POST /open/v1/token | /archives | /archives/batch | GET /batches/{batchNo}
 */

import { http } from './http';

// ─── 类型 ───

/** 四大类（79号令第六条）：凭证/账簿/报表/其他 */
export type PushCategory = 'voucher' | 'ledger' | 'report' | 'other';

/** 去向：直接入库 | 送组卷工作台（2026-08-21 收敛：核对工作台已移除，
 *  to-check/to-review 为历史遗留值，服务端归一为 to-volume 处理，仅用于历史批次展示） */
export type PushDestination = 'auto-archive' | 'to-volume' | 'to-check' | 'to-review';

export const CATEGORY_LABELS: Record<PushCategory, string> = {
  voucher: '会计凭证',
  ledger: '会计账簿',
  report: '财务会计报告',
  other: '其他会计资料',
};

export const DESTINATION_LABELS: Record<PushDestination, string> = {
  'auto-archive': '直接入库·自动组卷',
  'to-volume': '送组卷工作台',
  'to-check': '送核对（历史去向，已并入组卷工作台）',
  'to-review': '送审核（历史去向，已并入组卷工作台）',
};

/** 当前可选的推送去向（UI 选择器只提供这两项；历史 to-check/to-review 仅用于批次回显） */
export const ACTIVE_DESTINATIONS: PushDestination[] = ['to-volume', 'auto-archive'];

export interface OpenApp {
  id: number;
  appKey: string;
  appName: string;
  sourceSystem: string;
  fondsCode: string;
  status: 'active' | 'disabled';
  remark?: string;
  createdBy?: string;
  createdAt?: string;
  defaultDestination?: PushDestination;
}

export interface OpenAppIssued extends OpenApp {
  appSecret: string;   // 仅签发时返回一次
}

export interface OpenPushBatch {
  id: number;
  batch_no: string;
  fonds_code: string;
  status: 'accepted' | 'processing' | 'success' | 'partial' | 'failed';
  total_count: number;
  success_count: number;
  fail_count: number;
  message?: string;
  app_name?: string;
  source_system?: string;
  period?: string;
  category?: string;
  destination?: string;
  created_at?: string;
  finished_at?: string;
}

export interface OpenPushItem {
  id: number;
  external_id: string;
  voucher_no: string;
  archive_type: string;
  category?: string;
  summary: string;
  amount: number | null;
  record_node_id: string;
  archive_code: string;
  status: 'success' | 'failed' | 'skipped';
  error: string;
  created_at: string;
}

export interface OpenPushBatchDetail extends OpenPushBatch {
  items: OpenPushItem[];
}

export interface PushLogEntry {
  id: number;
  batchNo: string;
  level: 'info' | 'warn' | 'error';
  step: string;
  message: string;
  detail?: string;
  createdAt: string;
}

export interface CollectItem {
  id: number;
  recordNodeId: string;
  fondsCode: string;
  sourceType: string;
  batchNo: string;
  category: string;
  destination: string;
  externalId: string;
  voucherNo: string;
  archiveType: string;
  createdAt: string;
}

export interface FieldMappingRule {
  category: string;      // * 或 voucher|ledger|report|other
  stdField: string;      // 标准字段（支持点路径 voucher.voucherNo）
  sourcePath: string;    // 来源字段路径（支持嵌套）
  transform: 'direct' | 'constant' | 'divide100' | 'yearOf' | 'monthOf' | 'prefix' | 'upper';
  defaultValue: string;
}

export interface FieldMapConfig {
  sourceSystem: string;
  enabled: boolean;
  mappings: FieldMappingRule[];
  mappingCount?: number;
}

// ─── API ───

export const openPushService = {
  // 接入应用
  apps: () => http.get<OpenApp[]>('/open/v1/apps'),

  createApp: (body: {
    appName: string; sourceSystem: string; fondsCode?: string;
    remark?: string; defaultDestination?: PushDestination;
  }) => http.post<OpenAppIssued>('/open/v1/apps', body),

  updateAppDestination: (id: number, destination: PushDestination) =>
    http.put<{ ok: boolean }>(`/open/v1/apps/${id}/destination`, { destination }),

  // 批次
  batches: (limit = 30) => http.get<OpenPushBatch[]>(`/open/v1/batches?limit=${limit}`),

  batchDetail: (batchNo: string) =>
    http.get<OpenPushBatchDetail>(`/open/v1/batches/${batchNo}`),

  batchFourChecks: (batchNo: string) =>
    http.post<{ checked: number; passed: number; failed: number }>(
      `/open/v1/batches/${batchNo}/four-checks`, {}),

  batchToReview: (batchNo: string) =>
    http.post<{ routed: number }>(`/open/v1/batches/${batchNo}/to-review`, {}),

  batchAutoGroup: (batchNo: string) =>
    http.post<{ volumes: number; items: number }>(`/open/v1/batches/${batchNo}/auto-group`, {}),

  // 日志
  logs: (params?: { batchNo?: string; level?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.batchNo) sp.set('batchNo', params.batchNo);
    if (params?.level) sp.set('level', params.level);
    sp.set('limit', String(params?.limit ?? 200));
    return http.get<PushLogEntry[]>(`/open/v1/logs?${sp.toString()}`);
  },

  // 模拟推送（演示：四类样例走真实管道）
  simulate: (body: { category: PushCategory | 'all'; count: number;
    destination: PushDestination; runFourChecks: boolean }) =>
    http.post<{ batchNo: string; status: string; total: number; success: number;
      skipped: number; failed: number; fourChecksPassed: number; route: string;
      message: string }>('/open/v1/simulate', body),

  // 收集台账（待核对）
  collectPendingCheck: (fondsCode?: string) =>
    http.get<CollectItem[]>(`/open/v1/collect/pending-check${fondsCode ? `?fondsCode=${fondsCode}` : ''}`),

  collectPass: (id: number, to: 'volume' | 'review', comment?: string) =>
    http.post<CollectItem & { routedTo: string }>(`/open/v1/collect/${id}/pass`, { to, comment }),

  // 字段映射（低代码集成）
  fieldMaps: () => http.get<FieldMapConfig[]>('/open/v1/field-maps'),

  fieldMap: (sourceSystem: string) =>
    http.get<FieldMapConfig>(`/open/v1/field-maps/${encodeURIComponent(sourceSystem)}`),

  saveFieldMap: (sourceSystem: string, body: { enabled: boolean; mappings: FieldMappingRule[] }) =>
    http.put<FieldMapConfig>(`/open/v1/field-maps/${encodeURIComponent(sourceSystem)}`, body),

  testFieldMap: (body: { mappings: FieldMappingRule[]; category: string; sample: Record<string, unknown> }) =>
    http.post<Record<string, unknown>>('/open/v1/field-maps/test', body),
};
