/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * uploadEligibility 单测 —— 2026-07-29「丢件」报障的回归防线
 * 核心：97 置信度原始凭证入池、67 置信度记账凭证被拦（且不丢、进 blocked 桶）
 */
import { describe, it, expect } from 'vitest';
import {
  AUTO_POOL_MIN_CONFIDENCE,
  isPoolEligible,
  isPoolBlocked,
  partitionForPool,
} from '../services/uploadEligibility';

const f = (status: string, confidence: number) => ({ status, confidence });

describe('uploadEligibility - 入池门槛', () => {
  it('识别完成 + 置信度 97（原始凭证实测值）→ 可入池', () => {
    expect(isPoolEligible(f('ocr-done', 97))).toBe(true);
    expect(isPoolBlocked(f('ocr-done', 97))).toBe(false);
  });

  it('识别完成 + 置信度 67（记账凭证薄文本层实测值）→ 被拦，进 blocked 不静默消失', () => {
    expect(isPoolEligible(f('ocr-done', 67))).toBe(false);
    expect(isPoolBlocked(f('ocr-done', 67))).toBe(true);
  });

  it('边界值：置信度恰好 80 → 可入池；79 → 被拦', () => {
    expect(isPoolEligible(f('ocr-done', AUTO_POOL_MIN_CONFIDENCE))).toBe(true);
    expect(isPoolEligible(f('ocr-done', AUTO_POOL_MIN_CONFIDENCE - 1))).toBe(false);
  });

  it('人工校验过的文件：任何置信度都可入池（人工优先于门槛）', () => {
    expect(isPoolEligible(f('verified', 30))).toBe(true);
    expect(isPoolBlocked(f('verified', 30))).toBe(false);
  });

  it('pending/processing/error → 既不可入池也不算被拦（归入 waiting）', () => {
    for (const s of ['pending', 'processing', 'error']) {
      expect(isPoolEligible(f(s, 97))).toBe(false);
      expect(isPoolBlocked(f(s, 10))).toBe(false);
    }
  });
});

describe('uploadEligibility - partitionForPool 三桶划分', () => {
  it('混合列表：计数/拦截/等待口径一致，总量守恒', () => {
    const files = [
      f('ocr-done', 97),   // eligible（原始凭证场景）
      f('ocr-done', 67),   // blocked（记账凭证薄文本层场景）
      f('verified', 55),   // eligible（人工确认）
      f('processing', 0),  // waiting
      f('pending', 0),     // waiting
      f('error', 0),       // waiting
    ];
    const p = partitionForPool(files);
    expect(p.eligible).toHaveLength(2);
    expect(p.blocked).toHaveLength(1);
    expect(p.waiting).toHaveLength(3);
    expect(p.eligible.length + p.blocked.length + p.waiting.length).toBe(files.length);
  });

  it('按钮计数口径 = eligible.length（丢件报障的修复点）', () => {
    const files = [f('ocr-done', 97), f('ocr-done', 67)];
    const p = partitionForPool(files);
    // 旧 bug：按钮显示 2（done 数）实际只传 1；新口径按钮必须显示 1
    expect(p.eligible.length).toBe(1);
    expect(p.blocked.length).toBe(1);
  });
});
