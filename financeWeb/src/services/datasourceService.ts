/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * datasourceService — 多数据源配置 API（2026-08-09）
 *
 * 对应 ams-server /datasources/**：
 *   GET  /datasources            数据源列表（secret 脱敏）
 *   GET  /datasources/{id}       单个数据源
 *   PUT  /datasources/{id}       保存/更新（secret 传空=保持原值）
 *   DELETE /datasources/{id}     删除
 *
 * 权限：仅 档案管理员/档案主管/admin 可读写（服务端 403 拦截）。
 */

import { http } from './http';

// ─── 类型 ───

export interface DatasourceView {
  id: string;
  name: string;
  type: string;
  direction: 'pull' | 'push' | 'both';
  enabled: boolean;
  config: Record<string, string>;
  updatedAt?: string;
  updatedBy?: string;
}

export const DATASOURCE_TYPE_LABELS: Record<string, string> = {
  yonyou: '用友 BIP',
  kingdee: '金蝶云·星空',
  invoice: '电子发票平台',
  bank: '银行流水接口',
  reimburse: '报销审批系统',
  other: '其他业务系统',
};

export const DIRECTION_LABELS: Record<string, string> = {
  pull: '抓取（Pull）',
  push: '推送（Push）',
  both: '双向',
};

// ─── API ───

export const datasourceService = {
  list: () => http.get<DatasourceView[]>('/datasources'),

  get: (id: string) => http.get<DatasourceView>(`/datasources/${id}`),

  save: (id: string, body: Partial<DatasourceView>) =>
    http.put<DatasourceView>(`/datasources/${id}`, body),

  remove: (id: string) => http.delete<{ deleted: string }>(`/datasources/${id}`),
};
