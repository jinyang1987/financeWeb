/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * recordService — 件域 API（P1-① 件域读写闭环）
 *
 * 对应 ams-server /records：
 *   POST   /records                  上传建件（multipart：file + 元数据字段）
 *   GET    /records                  收集池列表（未组卷件）
 *   GET    /records/{nodeId}/content 内容读取（预览/下载，经 fetch 携带会话头）
 *
 * 数据形状：对外暴露的 dtoToRecord 把后端 RecordDto 映射为前端 ArchiveRecord，
 * 页面/store 无感知（形状不变，内部换调用）。
 */

import { http } from './http';
import { session } from './session';
import type { ArchiveRecord, ComponentFile } from '../types';

// ─── DTO（与 ams-server RecordService.toView 对齐） ───
export interface RecordDto {
  nodeId: string;
  name: string;
  nodeType: string;
  archiveCode: string;
  voucherNo: string;
  archiveType: string;
  department: string;
  amount: number | null;
  year: number | null;
  month: number | null;
  retention: string;
  recordStatus: string;
  source: 'digital-native' | 'digitized' | string;
  carrierType: 'electronic' | 'paper' | string;
  preparer: string;
  voucherCategory: string;
  remarks: string;
  numbered: boolean;
  createdAt: string;
  modifiedAt: string;
  createdBy?: string;
  mimeType: string | null;
  sizeInBytes: number;
  // ── finance-model v2.2 凭证扩展（用友BIP同步） ──
  voucherWord?: string;
  voucherDate?: string;
  period?: string;
  auditor?: string;
  tallyMan?: string;
  entries?: string;          // 凭证分录 JSON
  attachedBillCount?: number | null;
  sourceSystem?: string;
  externalId?: string;
  description?: string;      // cm:description（摘要）
}

export interface PoolResult {
  items: RecordDto[];
  totalItems: number;
  skipCount: number;
  maxItems: number;
}

export interface UploadMeta {
  fondsCode: string;
  voucherNo: string;
  archiveType: string;
  department?: string;
  amount?: number;
  year: number;
  month?: number;
  retention?: string;
  source: 'digital-native' | 'digitized';
  carrierType: 'electronic' | 'paper';
  preparer?: string;
  voucherCategory?: string;
  remarks?: string;
}

// ─── API ───

/** 上传建件：真实文件 + 元数据 → Alfresco finance:record 节点 */
export async function uploadRecord(file: File, meta: UploadMeta): Promise<ArchiveRecord> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  Object.entries(meta).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
  });
  const dto = await http.upload<RecordDto>('/records', fd);
  return dtoToRecord(dto);
}

/** 收集池列表（未组卷件） */
export async function fetchPoolRecords(params: {
  fondsCode: string;
  archiveType?: string;
  year?: number;
  month?: number;
  keyword?: string;
  skipCount?: number;
  maxItems?: number;
}): Promise<PoolResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return http.get<PoolResult>(`/records?${qs.toString()}`);
}

/** 读取文件内容（带会话头，预览/下载统一入口） */
export async function fetchRecordContent(nodeId: string): Promise<Blob> {
  const res = await fetch(`/api/ams/records/${nodeId}/content`, {
    headers: { ...session.amsHeaders() },
  });
  if (!res.ok) throw new Error(`内容读取失败 (${res.status})`);
  return res.blob();
}

// ─── OCR 预识别（无状态，不建节点） ───

export interface OcrScanResult {
  enabled: boolean;
  name: string;
  ocrText: string;
  length: number;
  elapsedMs: number;
}

/** 上传向导用：文件 → 后端 OCR → 识别文本（不建档案节点，识别失败返回空文本） */
export async function scanRecordOcr(file: File): Promise<OcrScanResult> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  return http.upload<OcrScanResult>('/records/ocr-scan', fd);
}

/** 触发浏览器下载 */
export async function downloadRecord(nodeId: string, filename: string): Promise<void> {
  const blob = await fetchRecordContent(nodeId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 删除收集池记录（服务端永久删除；仅「仅件数据」状态可删，已组卷须先拆件） */
export async function deleteRecord(nodeId: string): Promise<void> {
  await http.delete(`/records/${nodeId}`);
}

/** 卷内件全量读取（完整 RecordView，含 voucherCategory/subType 等筛选字段）——P1-③ 读视图 */
export async function fetchVolumeRecords(volumeId: string): Promise<ArchiveRecord[]> {
  const list = await http.get<RecordDto[]>(`/records/by-volume/${volumeId}`);
  return list.map(dtoToRecord);
}

/** 盒内件全量读取（遍历盒下所有案卷的子件）——P1-③ 读视图 */
export async function fetchBoxRecords(boxId: string): Promise<ArchiveRecord[]> {
  const list = await http.get<RecordDto[]>(`/records/by-box/${boxId}`);
  return list.map(dtoToRecord);
}

// ─── DTO → ArchiveRecord 映射 ───

const EXT_TO_CONTENT_TYPE: Record<string, ComponentFile['contentType']> = {
  pdf: 'pdf', xml: 'xml', ofd: 'ofd', png: 'png', jpg: 'png', jpeg: 'png',
};

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function dtoToRecord(dto: RecordDto): ArchiveRecord {
  const ext = dto.name.split('.').pop()?.toLowerCase() || '';
  // 上传的文件即节点的内容：组件列表第一项就是它本身（哈希/验签待四性检测引擎补齐）
  const components: ComponentFile[] = dto.mimeType
    ? [{
        name: dto.name,
        type: '上传原件',
        size: formatSize(dto.sizeInBytes),
        contentType: EXT_TO_CONTENT_TYPE[ext] || 'unknown',
        hash: '',
        signatureVerified: false,
      }]
    : [];

  return {
    id: dto.nodeId,
    archiveCode: dto.archiveCode,
    voucherNo: dto.voucherNo,
    archiveType: dto.archiveType,
    department: dto.department || '',
    amount: dto.amount ?? 0,
    year: dto.year != null ? String(dto.year) : '',
    month: dto.month != null ? String(dto.month).padStart(2, '0') : '',
    retention: dto.retention || '',
    status: (dto.recordStatus || '仅件数据') as ArchiveRecord['status'],
    remarks: dto.remarks || '',
    // 四性检测真实引擎接入（P3-1）前一律未检测，不再伪造通过结果
    checks: { real: false, complete: false, usable: false, safe: false },
    checkDetails: [],
    components,
    auditLogs: [{
      id: `log-${dto.nodeId}`,
      timestamp: (dto.createdAt || '').replace('T', ' ').slice(0, 19),
      action: '上传入库',
      operator: dto.createdBy || '',
      details: `文件 ${dto.name}（${formatSize(dto.sizeInBytes)}）上传至收集池，等待核对与组卷`,
      ipAddress: '',
    }],
    numbered: dto.numbered,
    source: (dto.source || 'digital-native') as ArchiveRecord['source'],
    carrierType: dto.carrierType as ArchiveRecord['carrierType'],
    preparer: dto.preparer || undefined,
    voucherCategory: dto.voucherCategory || undefined,
    // v2.2 凭证扩展
    voucherWord: dto.voucherWord || undefined,
    voucherDate: dto.voucherDate || undefined,
    period: dto.period || undefined,
    auditor: dto.auditor || undefined,
    tallyMan: dto.tallyMan || undefined,
    entries: dto.entries || undefined,
    attachedBillCount: dto.attachedBillCount ?? undefined,
    sourceSystem: dto.sourceSystem || undefined,
    externalId: dto.externalId || undefined,
    summary: dto.description || undefined,
  };
}


