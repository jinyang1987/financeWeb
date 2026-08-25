/**
 * recordToSourceDoc — 方案A 载体统一：把"原始凭证件"（finance:record，
 * voucherCategory='原始凭证'）映射为富元数据 SourceDocument 视图。
 *
 * 背景（2026-08-25）：原始凭证的权威载体已是 finance:record（组件挂接 parentRecordId），
 * 遗留 finance:sourceDocument 轨道不再写入。本适配器让"原始凭证检索页 / 门户附件检索 /
 * 详情面板"继续以 SourceDocument 富元数据形状消费，数据源统一取自全量件（scope=all）。
 * 类型编码/扩展字段来自 record 的 srcDoc* 属性（finance-model v2.7）。
 */

import type { ArchiveRecord } from '../types';
import type { SourceDocument, BusinessCategory } from '../types/sourceDocument';
import { SOURCE_DOC_TYPE_TREE, flattenTypeTree } from '../types/sourceDocument';
import { isSourceDocument } from './recordType';

/** 类型编码 → 名称（兜底，record 未冗余 docTypeName 时用） */
const TYPE_LABEL_MAP = flattenTypeTree(SOURCE_DOC_TYPE_TREE);

/**
 * 将全量件（含记账凭证 + 原始凭证）映射为原始凭证 SourceDocument 列表。
 * - 仅取 isSourceDocument 的件；
 * - parentVoucherNo 由 parentRecordId 反查所属记账凭证的凭证号；
 * - attachmentSequence 按同一父件下的出现顺序生成（1-based）。
 */
export function recordsToSourceDocs(records: ArchiveRecord[]): SourceDocument[] {
  // 父件凭证号映射（全量件里既有原始凭证也有记账凭证）
  const voucherNoById = new Map<string, string>(records.map(r => [r.id, r.voucherNo]));

  const seqByParent = new Map<string, number>();

  return records.filter(isSourceDocument).map((r): SourceDocument => {
    const parentKey = r.parentRecordId || '';
    const seq = (seqByParent.get(parentKey) || 0) + 1;
    seqByParent.set(parentKey, seq);

    let extFields: Record<string, string | number | boolean | null> = {};
    if (r.srcDocExtFields) {
      try { extFields = JSON.parse(r.srcDocExtFields); } catch { /* 忽略解析失败 */ }
    }

    const docTypeCode = r.docTypeCode || '';
    return {
      id: r.id,
      documentNo: r.documentNo || r.voucherNo || '',
      docTypeCode,
      docTypeName: r.docTypeName || TYPE_LABEL_MAP.get(docTypeCode) || docTypeCode,
      transactionDate: r.voucherDate || '',
      amountLower: r.amount ?? 0,
      amountUpper: r.srcDocAmountUpper || '',
      counterpartyName: r.counterpartyName || '',
      counterpartyTaxId: r.srcDocCounterpartyTaxId || undefined,
      counterpartyAddress: undefined,
      counterpartyBankAccount: undefined,
      summary: r.summary || '',
      preparer: r.preparer || undefined,
      reviewer: r.auditor || undefined,
      attachmentCount: r.attachedBillCount ?? 1,
      businessCategory: (r.srcDocBusinessCategory || '采购') as BusinessCategory,
      parentVoucherNo: r.parentRecordId ? (voucherNoById.get(r.parentRecordId) || '') : '',
      attachmentSequence: seq,
      parentRecordId: r.parentRecordId || '',
      volumeId: r.volumeId || undefined,
      boxId: r.boxId || undefined,
      carrierType: r.carrierType === 'paper' ? 'paper' : 'electronic',
      files: (r.components || []).map(c => ({
        name: c.name,
        type: c.type,
        size: c.size,
        contentType: c.contentType,
        hash: c.hash,
        signatureVerified: c.signatureVerified,
        signer: c.signer,
      })),
      extFields,
      source: r.source || 'digital-native',
      checks: r.checks || { real: false, complete: false, usable: false, safe: false },
      remarks: r.remarks || undefined,
      createdAt: '',
    };
  });
}
