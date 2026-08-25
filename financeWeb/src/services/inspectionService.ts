/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * inspectionService — 四性检测 API（V8 检测项库体系，2026-08-18）
 *
 * 对应 ams-server /inspection：
 *   GET /inspection/items           检测项标准库（环节×四性×检测项）
 *   PUT /inspection/items/{code}    启用/停用检测项
 *   POST /inspection/run-volume     卷级四性检测（移交时自动执行；快速检测页手动执行）
 *   POST /inspection/review         人工复检（留痕）
 *   GET  /inspection/reports        检测报告
 *
 * 2026-08-25 检测时机：按规定四性检测在移交（推送至保管库）环节执行，
 * 组卷环节不再提供检测按钮；结果展示与手动检测在 档案整理→快速检测。
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

/** 检测报告（ams_inspection_report 行） */
export interface InspectionReport {
  id: string;
  target_node: string;
  target_kind: 'record' | 'volume';
  phase: string;
  real: boolean;
  complete: boolean;
  usable: boolean;
  safe: boolean;
  detail_json: string;
  operator: string;
  created_at: string;
}

export interface ReportDetail {
  allPass?: boolean;
  summary?: string;
  items?: Array<{ code: string; name: string; dimension: string; pass: boolean; note?: string; target?: string }>;
  volumeIssues?: Array<{ code: string; note: string }>;
  reviews?: Array<{ dimension: string; status: string; reason: string; reviewer: string; at: string }>;
}

export function parseReportDetail(json: string | null | undefined): ReportDetail {
  if (!json) return {};
  try {
    return JSON.parse(json) as ReportDetail;
  } catch {
    return {};
  }
}

// ─── API ───

export async function fetchInspectionItems(): Promise<InspectionItem[]> {
  return http.get<InspectionItem[]>('/inspection/items');
}

export async function setInspectionItemEnabled(code: string, enabled: boolean): Promise<InspectionItem> {
  return http.put<InspectionItem>(`/inspection/items/${encodeURIComponent(code)}`, { enabled });
}

/** 卷级四性检测（卷内件逐项 + 卷级断号/查重/件数一致）。
 *  phase 缺省 'yj'（移交环节=推送至保管库，法定检测节点；合并归档环节启用项全口径执行） */
export async function runVolumeInspection(volumeId: string, phase: string = 'yj'): Promise<VolumeInspectionResult> {
  return http.post<VolumeInspectionResult>('/inspection/run-volume', { volumeId, phase });
}

/** 检测报告列表（target 缺省=最近 100 条；传 nodeId=该节点历史） */
export async function fetchInspectionReports(target?: string): Promise<InspectionReport[]> {
  const qs = target ? `?target=${encodeURIComponent(target)}` : '';
  return http.get<InspectionReport[]>(`/inspection/reports${qs}`);
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
