/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * inspectionService — 四性检测 API（V8 检测项库体系，2026-08-18）
 *
 * 对应 ams-server /inspection：
 *   GET /inspection/items           检测项标准库（环节×四性×检测项）
 *   PUT /inspection/items/{code}    启用/停用检测项
 *   POST /inspection/run-volume     卷级四性检测（组卷工作台真实现）
 *   POST /inspection/review         人工复检（留痕）
 *   GET  /inspection/reports        检测报告（borrowService.fetchInspectionReports 已有，不重复）
 */

import { http } from './http';

// ─── 类型 ───

export interface InspectionItem {
  code: string;
  phase: 'gd' | 'yj' | 'cq';
  dimension: 'real' | 'complete' | 'usable' | 'safe';
  seq: number;
  name: string;
  standard_ref: string;
  check_type: string;
  enabled: boolean;
  sort: number;
}

export interface InspectionIssue {
  dimension: string;
  code: string;
  name: string;
  note: string;
  target: string;
}

export interface VolumeInspectionResult {
  reportId: string;
  nodeId: string;
  real: boolean;
  complete: boolean;
  usable: boolean;
  safe: boolean;
  allPass: boolean;
  checkedAt: string;
  itemCount: number;
  issues: InspectionIssue[];
}

// ─── API ───

export async function fetchInspectionItems(): Promise<InspectionItem[]> {
  return http.get<InspectionItem[]>('/inspection/items');
}

export async function setInspectionItemEnabled(code: string, enabled: boolean): Promise<InspectionItem> {
  return http.put<InspectionItem>(`/inspection/items/${encodeURIComponent(code)}`, { enabled });
}

/** 卷级四性检测（卷内件逐项 + 卷级断号/查重/件数一致） */
export async function runVolumeInspection(volumeId: string): Promise<VolumeInspectionResult> {
  return http.post<VolumeInspectionResult>('/inspection/run-volume', { volumeId });
}

/** 人工复检（留痕：复检人/原因/时间） */
export async function reviewInspection(reportId: string, dimension: string, pass: boolean, reason: string) {
  return http.post('/inspection/review', { reportId, dimension, pass, reason });
}

// ─── 展示辅助 ───

export const PHASE_LABELS: Record<string, string> = {
  gd: '归档环节',
  yj: '移交环节',
  cq: '长期保存环节',
};

export const DIMENSION_LABELS: Record<string, string> = {
  real: '真实性',
  complete: '完整性',
  usable: '可用性',
  safe: '安全性',
};
