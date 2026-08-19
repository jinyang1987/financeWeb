/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 借阅「档案类别」归一化回归测试（2026-08-19）
 *
 * 背景：PR #9 修复了数字档案室归类展示（数字码 01-04 → 字母大类码 KP/KB/FB/QT）。
 * 但同一类 Bug（后端返回 DA/T 数字码、前端却按字母码 KP/KB/FB/QT 比较/统计）还存在于：
 *   - BorrowStatsPage  借阅热力图按类型统计（数字码查 counts[字母码] → 恒 undefined → 全 0）
 *   - BorrowLedgerPage 借阅台账按类型筛选（数字码 === 字母码选项 → 永远筛不出）
 * 本用例守护「借阅链路中的 archiveTypeCode 必须经 toCategoryCode 归一后再比较/统计」这一口径。
 */

import { describe, it, expect } from 'vitest';
import { toCategoryCode } from '../stores/volumeStore';

// 后端卷/盒返回的 archiveTypeCode 是 DA/T 数字码（01-04），见 boxService/volumeService：
//   archiveTypeCode: string; // DA/T 数字代码 01-04
describe('借阅链路归档类别归一化', () => {
  const cases: Array<[string, string | undefined, string]> = [
    ['01', '记账凭证', 'KP'],
    ['02', '会计账簿', 'KB'],
    ['03', '财务报表', 'FB'],
    ['04', '其他会计资料', 'QT'],
  ];

  it('数字码(01-04) 经 toCategoryCode 归一为字母大类码（KP/KB/FB/QT）', () => {
    for (const [num, zh, expected] of cases) {
      expect(toCategoryCode(num, zh)).toBe(expected);
    }
  });

  it('字母码直接透传，不二次转换', () => {
    expect(toCategoryCode('KP', '记账凭证')).toBe('KP');
    expect(toCategoryCode('KB', '会计账簿')).toBe('KB');
  });

  it('数字码不得再按字母码 key 直接参与比较/统计（否则全部失配）', () => {
    // 模拟 BorrowStatsPage 修复前的错误口径：counts 以字母码为 key
    const counts: Record<string, number> = { KP: 0, KB: 0, FB: 0, QT: 0 };
    const backendItems = [
      { archiveTypeCode: '01', archiveType: '记账凭证' },
      { archiveTypeCode: '02', archiveType: '会计账簿' },
      { archiveTypeCode: '03', archiveType: '财务报表' },
      { archiveTypeCode: '04', archiveType: '其他会计资料' },
    ];
    for (const it of backendItems) {
      const cat = toCategoryCode(it.archiveTypeCode, it.archiveType); // 修复后口径
      if (counts[cat] !== undefined) counts[cat]++;
    }
    expect(counts).toEqual({ KP: 1, KB: 1, FB: 1, QT: 1 });

    // 若沿用修复前错误口径（数字码直接查 counts），全部为 0
    const wrongCounts: Record<string, number> = { KP: 0, KB: 0, FB: 0, QT: 0 };
    for (const it of backendItems) {
      if (wrongCounts[it.archiveTypeCode] !== undefined) wrongCounts[it.archiveTypeCode]++;
    }
    expect(wrongCounts).toEqual({ KP: 0, KB: 0, FB: 0, QT: 0 });
  });
});
