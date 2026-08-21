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
  // ── 卷/盒归属（scope=all 时返回；池件为空串） ──
  volumeId?: string;
  volumeCode?: string;
  boxId?: string;
  boxNo?: string;
  // ── V10 读模型透出（2026-08-18 全文检索） ──
  accountSubject?: string;
  counterpartyName?: string;
  documentNo?: string;
  ocrText?: string;
  // ── v2.3 组件挂接（2026-08-20）：原始凭证件 → 所属记账凭证件 ──
  parentRecordId?: string;
  // ── v2.6 回收站（2026-08-21）：仅回收站件有值 ──
  deletedAt?: string;
  deletedBy?: string;
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

/**
 * 全量件列表（scope=all，2026-08-16 贯通修复）：
 * 池件 ∪ 案卷库卷内件 ∪ 盒库卷内件，每条带 volumeId/volumeCode/boxId/boxNo 归属。
 * 供档案查询/档案打包/借阅车结算/统计等读侧场景使用（工作台的池口径不变，仍走 fetchPoolRecords）。
 */
export async function fetchAllRecords(params: {
  fondsCode: string;
  archiveType?: string;
  year?: number;
  month?: number;
  keyword?: string;
}): Promise<PoolResult> {
  const qs = new URLSearchParams({ scope: 'all', maxItems: '5000' });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return http.get<PoolResult>(`/records?${qs.toString()}`);
}

// ─── V10 全文检索读模型（2026-08-18） ───

export interface SearchParams {
  fondsCode: string;
  q?: string;
  archiveType?: string;
  /** 门户快捷分类：KP 凭证 / KB 账簿 / FB 报表 / QT 其他 */
  category?: string;
  year?: number | string;
  month?: number;
  subject?: string;
  dept?: string;
  preparer?: string;
  counterparty?: string;
  documentNo?: string;
  voucherNo?: string;
  amountFrom?: number | string;
  amountTo?: number | string;
  recordStatus?: string;
  skipCount?: number;
  maxItems?: number;
}

/** 服务端真分页全文检索（pg_trgm 任意子串，含 ocrText 正文）——门户页态化主入口 */
export async function searchRecords(params: SearchParams): Promise<PoolResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return http.get<PoolResult>(`/records/search?${qs.toString()}`);
}

export interface RecordFacets {
  years: number[];
  types: string[];
  subjects: string[];
  departments: string[];
  preparers: string[];
}

/** 分面下拉选项（带权限下推） */
export async function fetchRecordFacets(params: {
  fondsCode: string; archiveType?: string; year?: number | string;
}): Promise<RecordFacets> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return http.get<RecordFacets>(`/records/facets?${qs.toString()}`);
}

/** 门户首页统计（总量/已组卷凭证数，带权限下推） */
export async function fetchRecordStats(fondsCode: string): Promise<{ total: number; archivedVouchers: number }> {
  return http.get(`/records/stats?fondsCode=${encodeURIComponent(fondsCode)}`);
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

/** 删除收集池记录（v2.6 起为逻辑删除，入回收站可恢复；仅「仅件数据」状态可删，已组卷须先拆件） */
export async function deleteRecord(nodeId: string): Promise<void> {
  await http.delete(`/records/${nodeId}`);
}

// ─── 回收站（v2.6：逻辑删除件列表 / 恢复 / 彻底删除） ───

/** 回收站件列表（按删除时间倒序；不可搜索、不参与组卷） */
export async function fetchRecycleItems(fondsCode: string): Promise<RecordDto[]> {
  const qs = new URLSearchParams({ fondsCode });
  return http.get<RecordDto[]>(`/records/recycle?${qs.toString()}`);
}

/** 恢复回收站件：移回收集池 + 清除删除标记（可重新组卷/检索） */
export async function restoreRecycleItem(nodeId: string): Promise<void> {
  await http.post(`/records/recycle/${nodeId}/restore`, {});
}

/** 彻底删除回收站件（不可恢复，物理删除；仅回收站内件） */
export async function purgeRecycleItem(nodeId: string): Promise<void> {
  await http.delete(`/records/recycle/${nodeId}`);
}

/** 组件挂接（2026-08-20 先组件再组卷）：原始凭证件 → 所属记账凭证件；parentRecordId=null 解挂 */
export async function linkRecordParent(nodeId: string, parentRecordId: string | null): Promise<void> {
  await http.put(`/records/${nodeId}/parent`, { parentRecordId });
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
      details: `文件 ${dto.name}（${formatSize(dto.sizeInBytes)}）上传至收集池，等待组卷`,
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
    // 卷/盒归属（scope=all 返回；池件为空串 → undefined）
    volumeId: dto.volumeId || undefined,
    volumeCode: dto.volumeCode || undefined,
    boxId: dto.boxId || undefined,
    boxNo: dto.boxNo || undefined,
    // V10 读模型透出（科目/往来单位/单据号，门户检索维度；ocrText 详情展示）
    accountSubject: dto.accountSubject || undefined,
    counterpartyName: dto.counterpartyName || undefined,
    documentNo: dto.documentNo || undefined,
    ocrText: dto.ocrText || undefined,
    // 组件挂接（v2.3）：原始凭证件的所属记账凭证（空串 → undefined）
    parentRecordId: dto.parentRecordId || undefined,
  };
}


