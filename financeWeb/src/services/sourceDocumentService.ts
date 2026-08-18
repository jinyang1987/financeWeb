/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * sourceDocumentService — 原始凭证域 API（P1-④）
 */

import { http } from './http';
import { session } from './session';
import type { SourceDocument } from '../types/sourceDocument';

// ─── DTO ───
export interface SourceDocDto {
  nodeId: string;
  name: string;
  documentNo: string;
  docTypeCode: string;
  docTypeName: string;
  transactionDate: string;
  amountLower: number;
  amountUpper: string;
  counterpartyName: string;
  counterpartyTaxId: string;
  counterpartyAddress: string;
  counterpartyBankAccount: string;
  summary: string;
  businessCategory: string;
  preparer: string;
  reviewer: string;
  attachmentCount: number | null;
  parentVoucherNo: string;
  attachmentSequence: number | null;
  extFields: string;
  createdAt: string;
  modifiedAt: string;
  mimeType?: string;
  sizeInBytes?: number;
  /** 所属记账凭证节点 id（2026-08-16 后端补出，附件↔父件联动） */
  parentRecordId?: string;
}

// ─── API ───

export async function fetchSourceDocsByFonds(fondsCode: string): Promise<SourceDocument[]> {
  const list = await http.get<SourceDocDto[]>(
    `/source-docs?fondsCode=${encodeURIComponent(fondsCode)}`
  );
  return list.map(dtoToSourceDoc);
}

export async function fetchSourceDocsByRecord(recordId: string): Promise<SourceDocument[]> {
  const list = await http.get<SourceDocDto[]>(`/source-docs/by-record/${recordId}`);
  return list.map(dtoToSourceDoc);
}

/**
 * 上传原始凭证附件（真持久化，2026-08-16 贯通修复）：
 * 在指定记账凭证节点下建 finance:sourceDocument 子节点并写入文件内容。
 * 对应后端 POST /source-docs/by-record/{recordId}（multipart）。
 */
export async function uploadSourceDoc(
  recordId: string,
  file: File,
  fields: {
    documentNo: string;
    docTypeCode: string;
    docTypeName: string;
    transactionDate?: string;
    amountLower?: number;
    counterpartyName?: string;
    summary?: string;
    businessCategory?: string;
    parentVoucherNo?: string;
    attachmentSequence?: number;
  },
): Promise<SourceDocument> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
  });
  const dto = await http.upload<SourceDocDto>(`/source-docs/by-record/${recordId}`, fd);
  return dtoToSourceDoc(dto);
}

/** 读取原始凭证附件内容（预览/下载，经会话头鉴权） */
export async function fetchSourceDocContent(docId: string, download = false): Promise<Blob> {
  const res = await fetch(`/api/ams/source-docs/${docId}/content?download=${download}`, {
    headers: { ...session.amsHeaders() },
  });
  if (!res.ok) throw new Error(`附件内容读取失败 (${res.status})`);
  return res.blob();
}

// ─── DTO → 前端模型映射 ───

export function dtoToSourceDoc(dto: SourceDocDto): SourceDocument {
  let extFields: Record<string, string | number | boolean> = {};
  if (dto.extFields) {
    try { extFields = JSON.parse(dto.extFields); } catch { /* ignore */ }
  }
  const sizeKB = dto.sizeInBytes ? (dto.sizeInBytes / 1024).toFixed(1) + " KB" : "0 KB";
  return {
    id: dto.nodeId,
    documentNo: dto.documentNo || "",
    docTypeCode: dto.docTypeCode || "",
    docTypeName: dto.docTypeName || "",
    transactionDate: dto.transactionDate || "",
    amountLower: dto.amountLower ?? 0,
    amountUpper: dto.amountUpper || "",
    counterpartyName: dto.counterpartyName || "",
    counterpartyTaxId: dto.counterpartyTaxId || undefined,
    counterpartyAddress: dto.counterpartyAddress || undefined,
    counterpartyBankAccount: dto.counterpartyBankAccount || undefined,
    summary: dto.summary || "",
    businessCategory: (dto.businessCategory || "采购") as SourceDocument["businessCategory"],
    preparer: dto.preparer || undefined,
    reviewer: dto.reviewer || undefined,
    attachmentCount: dto.attachmentCount ?? 1,
    parentRecordId: dto.parentRecordId || "",
    parentVoucherNo: dto.parentVoucherNo || "",
    attachmentSequence: dto.attachmentSequence ?? 1,
    carrierType: "electronic",
    extFields,
    remarks: undefined,
    files: dto.mimeType ? [{ name: dto.name, type: "原件", size: sizeKB, contentType: "unknown" as const, hash: "", signatureVerified: false }] : [],
    source: "digital-native",
    checks: { real: false, complete: false, usable: false, safe: false },
    createdAt: dto.createdAt || "",
  };
}

