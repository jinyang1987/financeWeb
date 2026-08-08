/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * docClassifier 规则分类器单测（2026-07-29 接真 OCR 后替换随机桩）
 * 覆盖：记账/原始凭证定类、字段抽取、仅文件名降级、未识别兜底、置信度语义
 */
import { describe, it, expect } from 'vitest';
import { classifyDocument } from '../services/docClassifier';

// ── 典型 OCR 文本（模拟 tesseract 输出，含 CJK 间空格噪音） ──

const VOUCHER_TEXT = `
记 账 凭 证
凭证字号：记-004
日期：2026年05月10日
摘要 会计科目 借方金额 贷方金额
报销差旅费 银行存款 23,500.00
报销差旅费 管理费用 23,500.00
合计 23,500.00 23,500.00
制单：张三 审核：李四 记账：王五 附件 2 张
`;

const INVOICE_TEXT = `
增 值 税 专 用 发 票
发票代码：011001900111 发票号码：00512366
开票日期：2026-05-08
购买方：华北集团总部 销售方：北京办公用品有限公司
合计金额：11,061.95 合计税额：1,438.05
价税合计（大写）壹万贰仟伍佰圆整 （小写）¥12,500.00
税率：13%
`;

const EXPENSE_TEXT = `
差 旅 费 报 销 单
报销人：张三 部门：财务部
出差事由：赴上海客户现场实施
交通费 1,280.00 住宿费 2,000.00
报销金额合计：3,280.00
审批：部门经理
`;

describe('docClassifier - 定类', () => {
  it('记账凭证全文 → 记账凭证，高置信', () => {
    const r = classifyDocument({ fileName: 'scan001.pdf', ocrText: VOUCHER_TEXT });
    expect(r.category).toBe('记账凭证');
    expect(r.confidence).toBeGreaterThanOrEqual(80);
    expect(r.source).toBe('ocr');
    expect(r.hits.length).toBeGreaterThan(0);
  });

  it('增值税专用发票 → 原始凭证，高置信', () => {
    const r = classifyDocument({ fileName: 'file1.pdf', ocrText: INVOICE_TEXT });
    expect(r.category).toBe('原始凭证');
    expect(r.confidence).toBeGreaterThanOrEqual(80);
  });

  it('差旅费报销单 → 原始凭证', () => {
    const r = classifyDocument({ fileName: 'file2.pdf', ocrText: EXPENSE_TEXT });
    expect(r.category).toBe('原始凭证');
    expect(r.confidence).toBeGreaterThanOrEqual(80);
  });

  it('仅文件名（OCR 文本为空）→ 按文件名识别，source=filename', () => {
    const v = classifyDocument({ fileName: '2026年05月记账凭证.pdf', ocrText: '' });
    expect(v.category).toBe('记账凭证');
    expect(v.source).toBe('filename');

    const s = classifyDocument({ fileName: '采购发票-增值税专用.pdf', ocrText: '' });
    expect(s.category).toBe('原始凭证');
  });

  it('无特征文件名 + 空文本 → 未识别（宁缺毋滥，不瞎猜）', () => {
    const r = classifyDocument({ fileName: 'scan001.pdf', ocrText: '' });
    expect(r.category).toBe('未识别');
    expect(r.confidence).toBeLessThan(50);
  });

  it('噪音文本（无关键词）→ 未识别', () => {
    const r = classifyDocument({ fileName: 'a.pdf', ocrText: 'asdf qwer zxcv 123 !@#' });
    expect(r.category).toBe('未识别');
  });
});

describe('docClassifier - 字段抽取', () => {
  it('凭证字号：记-004', () => {
    const r = classifyDocument({ fileName: 'x.pdf', ocrText: VOUCHER_TEXT });
    expect(r.voucherNo).toBe('记-004');
  });

  it('凭证字号变体：付第12号 → 付-12；转-8号 → 转-8', () => {
    expect(classifyDocument({ fileName: 'x', ocrText: '记账凭证 凭证字号：付第12号 会计科目 借方 贷方 制单' }).voucherNo).toBe('付-12');
    expect(classifyDocument({ fileName: 'x', ocrText: '记账凭证 凭证字号 转-8号 会计科目 借方 贷方 制单' }).voucherNo).toBe('转-8');
  });

  it('发票号码抽取（原始凭证单据号）', () => {
    const r = classifyDocument({ fileName: 'x.pdf', ocrText: INVOICE_TEXT });
    expect(r.voucherNo).toBe('00512366');
  });

  it('金额：优先合计/价税合计标签', () => {
    expect(classifyDocument({ fileName: 'x', ocrText: VOUCHER_TEXT }).amount).toBe('23,500.00');
    expect(classifyDocument({ fileName: 'x', ocrText: INVOICE_TEXT }).amount).toBe('12,500.00');
  });

  it('日期：中文与连字符两种格式归一', () => {
    expect(classifyDocument({ fileName: 'x', ocrText: VOUCHER_TEXT }).date).toBe('2026-05-10');
    expect(classifyDocument({ fileName: 'x', ocrText: INVOICE_TEXT }).date).toBe('2026-05-08');
  });

  it('无金额无日期 → 空串不编造', () => {
    const r = classifyDocument({ fileName: 'x', ocrText: '记账凭证 会计科目 制单' });
    expect(r.amount).toBe('');
    expect(r.date).toBe('');
  });
});
