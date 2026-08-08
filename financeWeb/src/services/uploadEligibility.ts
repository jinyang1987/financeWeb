/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * uploadEligibility — 上传入池资格判定（唯一事实源，纯函数）
 *
 * 背景（2026-07-29「丢件」报障）：入池过滤条件与按钮计数口径不一致，
 * 低置信度文件被静默拦下，用户视角=丢数据。判定逻辑抽为纯函数，
 * UI 计数、拦截提示、上传循环全部共用，杜绝口径漂移。
 */

/** 自动入池的最低置信度（人工校验 verified 不受此限） */
export const AUTO_POOL_MIN_CONFIDENCE = 80;

export interface EligibilityInput {
  status: string;
  confidence: number;
}

/** 可入池：已人工校验，或识别完成且置信度达标 */
export const isPoolEligible = (f: EligibilityInput): boolean =>
  f.status === 'verified' ||
  (f.status === 'ocr-done' && f.confidence >= AUTO_POOL_MIN_CONFIDENCE);

/** 被门槛拦下：识别完成但置信度不足，且未人工校验 */
export const isPoolBlocked = (f: EligibilityInput): boolean =>
  f.status === 'ocr-done' && f.confidence < AUTO_POOL_MIN_CONFIDENCE;

export interface PoolPartition<T> {
  /** 可入池（按钮计数、上传循环以此为准） */
  eligible: T[];
  /** 置信度不足被拦（警示条计数，上传后保留在列表） */
  blocked: T[];
  /** 其余（pending/processing/error，不参与入池也不提示） */
  waiting: T[];
}

/** 一次划分三桶，调用方各取所需，口径永不漂移 */
export function partitionForPool<T extends EligibilityInput>(files: T[]): PoolPartition<T> {
  const eligible = files.filter(isPoolEligible);
  const blocked = files.filter(isPoolBlocked);
  const waiting = files.filter((f) => !isPoolEligible(f) && !isPoolBlocked(f));
  return { eligible, blocked, waiting };
}
