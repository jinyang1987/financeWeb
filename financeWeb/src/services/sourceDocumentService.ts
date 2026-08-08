/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * sourceDocumentService — 原始凭证域 API（P1-④）
 */

import { http } from './http';
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
    parentRecordId: "",
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

