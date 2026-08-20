/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * recordType — 件级类型判定工具（2026-08-19）
 *
 * 背景：上传链路（VoucherUploadModal）统一以 archiveType=记账凭证 +
 * voucherCategory=原始凭证 入池；部分历史/mock 路径 archiveType 直接为
 * 「原始凭证」。因此原始凭证判定必须两种形态都认，全站统一用本 helper，
 * 不要各自内联（详情面板/门户详情/组卷引擎已三处拷贝过一次）。
 */

import type { ArchiveRecord } from '../types';

/** 是否原始凭证（archiveType 含「原始凭证」或 voucherCategory=原始凭证） */
export const isSourceDocument = (
  r: Pick<ArchiveRecord, 'voucherCategory' | 'archiveType'>,
): boolean =>
  r.voucherCategory === '原始凭证' || (r.archiveType || '').includes('原始凭证');
