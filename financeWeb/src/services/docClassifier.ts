/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * docClassifier — 记账凭证 / 原始凭证 规则分类器（替换原 simulateOcr 随机桩）
 *
 * 原理：两类单据版式与语义差异稳定互斥，关键词加权打分即可高准确区分：
 *   - 记账凭证（系统机打）：标题「记账凭证」、凭证字号、会计科目表、借/贷方金额、制单/审核/记账签章
 *   - 原始凭证（外来/自制单据）：发票家族（发票代码/号码/税率/税额/价税合计）、
 *     报销单/审批单/银行回单/收据/行程单/对账单/合同/清单等（对齐原始凭证全量类型分类目录）
 *
 * 输入 = 文件名 + OCR 文本（可为空，空时仅按文件名识别，置信度自然降低）；
 * 输出 = 类别 + 置信度 + 抽取字段（凭证号/金额/日期）+ 命中证据（UI 可解释）。
 * 拿不准一律「未识别」，宁缺毋滥 —— 交给人工校验，不瞎猜。
 */

import { SOURCE_DOC_TYPE_TREE, flattenTypeTree } from '../types/sourceDocument';

export type DocCategory = '记账凭证' | '原始凭证' | '未识别';

export interface ClassifyInput {
  fileName: string;
  /** OCR 识别文本；空串表示仅按文件名识别 */
  ocrText: string;
}

export interface ClassifyResult {
  category: DocCategory;
  /** 0-97；<60 建议人工重点核对 */
  confidence: number;
  voucherNo: string;
  /** 金额字符串（可能含千分位逗号），空串 = 未抽到 */
  amount: string;
  /** YYYY-MM-DD，空串 = 未抽到 */
  date: string;
  /** 命中证据（可解释性） */
  hits: string[];
  /** 识别依据来源 */
  source: 'ocr' | 'filename';
  /** 原始凭证 96 类目录编码（仅 category='原始凭证' 且可推断时有值，2026-08-25） */
  docTypeCode?: string;
  /** 原始凭证类型名称 */
  docTypeName?: string;
}

// ── 规则表（权重 = 命中得分；strong 类单条即可定类） ──

interface Rule { kw: string; w: number; strong?: boolean }

/** 记账凭证：标题/凭证字号为强特征，表结构与签章栏为佐证 */
const VOUCHER_TEXT_RULES: Rule[] = [
  { kw: '记账凭证', w: 40, strong: true },
  { kw: '凭证字号', w: 30, strong: true },
  { kw: '会计科目', w: 12 },
  { kw: '借方金额', w: 10 },
  { kw: '贷方金额', w: 10 },
  { kw: '制单', w: 8 },
  { kw: '记账', w: 8 },
  { kw: '审核', w: 6 },
  { kw: '借方', w: 5 },
  { kw: '贷方', w: 5 },
  { kw: '附件', w: 3 },
  { kw: '摘要', w: 3 },
];

/** 原始凭证：单据名称为强特征（对齐原始凭证全量类型目录的高频族），票据字段为佐证 */
const SOURCE_TEXT_RULES: Rule[] = [
  { kw: '增值税专用发票', w: 45, strong: true },
  { kw: '增值税普通发票', w: 42, strong: true },
  { kw: '电子发票', w: 40, strong: true },
  { kw: '发票代码', w: 25, strong: true },
  { kw: '发票号码', w: 25, strong: true },
  { kw: '费用报销单', w: 42, strong: true },
  { kw: '差旅费报销单', w: 42, strong: true },
  { kw: '报销单', w: 38, strong: true },
  { kw: '审批单', w: 38, strong: true },
  { kw: '银行回单', w: 40, strong: true },
  { kw: '进账单', w: 38, strong: true },
  { kw: '行程单', w: 38, strong: true },
  { kw: '对账单', w: 36, strong: true },
  { kw: '收据', w: 34, strong: true },
  { kw: '领料单', w: 34, strong: true },
  { kw: '出库单', w: 34, strong: true },
  { kw: '入库单', w: 34, strong: true },
  { kw: '纳税申报', w: 34, strong: true },
  { kw: '结算单', w: 30, strong: true },
  { kw: '火车票', w: 36, strong: true },
  { kw: '高铁票', w: 36, strong: true },
  { kw: '机票', w: 34, strong: true },
  { kw: '海关缴款书', w: 36, strong: true },
  { kw: '缴款书', w: 34, strong: true },
  { kw: '报关单', w: 34, strong: true },
  { kw: '完税证明', w: 34, strong: true },
  { kw: '缴费凭证', w: 32, strong: true },
  { kw: '验收单', w: 32, strong: true },
  { kw: '采购订单', w: 32, strong: true },
  { kw: '价税合计', w: 12 },
  { kw: '税率', w: 10 },
  { kw: '税额', w: 10 },
  { kw: '销售方', w: 8 },
  { kw: '购买方', w: 8 },
  { kw: '开户行', w: 6 },
  { kw: '报销人', w: 8 },
  { kw: '收款人', w: 6 },
  { kw: '付款人', w: 6 },
];

/** 文件名规则（弱于文本：命名可能不规范） */
const VOUCHER_NAME_RE = /记账凭证|(?:^|[^收付转])([记收付转])[-_—第]?\d{1,4}/;
const SOURCE_NAME_RE = /发票|报销|审批|回单|进账单|收据|行程单|对账单|结算单|合同|清单|出库|入库|领料|工资|申报|银行/;

/** 定类阈值：最高分低于此值 → 未识别 */
const DECIDE_MIN_SCORE = 25;

// ── 字段抽取 ──

/** 凭证字号：凭证字号：记-004 / 记-004 / 付第12号 / 转_8 → 归一化为 记-004 形态（保留前导零，与会计系统编号一致） */
function extractVoucherNo(compact: string, fileName: string): string {
  const labeled = compact.match(/凭证字号[:：]?([记收付转])[-—_第]?(\d{1,4})号?/);
  if (labeled) return `${labeled[1]}-${labeled[2]}`;
  const bare = compact.match(/([记收付转])[-—_第](\d{1,4})号/);
  if (bare) return `${bare[1]}-${bare[2]}`;
  const dash = compact.match(/([记收付转])[-—_第](\d{1,4})(?!\d)/);
  if (dash) return `${dash[1]}-${dash[2]}`;
  const fn = fileName.match(/([记收付转])[-_—](\d{1,4})/);
  if (fn) return `${fn[1]}-${fn[2]}`;
  return '';
}

/** 原始凭证单据号：发票号码 / 单据编号 */
function extractSourceDocNo(compact: string): string {
  const inv = compact.match(/发票号码[:：]?(\d{6,12})/);
  if (inv) return inv[1];
  const doc = compact.match(/单据编号[:：]?([A-Za-z0-9-]{4,20})/);
  if (doc) return doc[1];
  return '';
}

/** 金额：按行打标签优先级（价税合计 > 合计/总计 > 金额），取最高优先级行的首个金额；无标签行时取全文最大金额 */
function extractAmount(raw: string): string {
  const money = /[￥¥]?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})/;
  let bestP = 0;
  let bestAmt = '';
  for (const line of raw.split(/\r?\n/)) {
    const p = /价税合计/.test(line) ? 3 : /合计|总计/.test(line) ? 2 : /金额/.test(line) ? 1 : 0;
    if (p === 0 || p < bestP) continue;
    const m = line.match(money);
    if (m) { bestP = p; bestAmt = m[1]; }
  }
  if (bestAmt) return bestAmt;
  // 兜底：全文最大金额
  let max = '';
  let maxVal = -1;
  for (const m of raw.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})/g)) {
    const val = parseFloat(m[1].replace(/,/g, ''));
    if (val > maxVal && val < 1e12) { maxVal = val; max = m[1]; }
  }
  return max;
}

/** 日期：2026年5月10日 / 2026-05-10 / 2026/5/10 → YYYY-MM-DD */
function extractDate(raw: string): string {
  const cn = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?/);
  if (cn) return `${cn[1]}-${cn[2].padStart(2, '0')}-${cn[3].padStart(2, '0')}`;
  const iso = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  return '';
}

// ── 原始凭证 96 类目录推断（2026-08-25 方案A：类型编码落库） ──
// 有序规则表：从最具体到一般，命中即返回。覆盖高频族；未命中返回 null（类型留待人工选择）。
const SOURCE_TYPE_RULES: Array<{ re: RegExp; code: string }> = [
  { re: /机动车销售/, code: 'vehicle-invoice' },
  { re: /二手车/, code: 'used-vehicle-invoice' },
  { re: /货物运输/, code: 'transport-invoice' },
  { re: /增值税电子专用/, code: 'vat-e-special-invoice' },
  { re: /增值税专用发票/, code: 'vat-special-invoice' },
  { re: /增值税电子普通/, code: 'vat-e-normal-invoice' },
  { re: /增值税普通发票/, code: 'vat-normal-invoice' },
  { re: /全面数字化|数电票|数电发票/, code: 'vat-electronic-invoice' },
  { re: /火车票|高铁/, code: 'passenger-train-ticket' },
  { re: /行程单|航空|飞机票/, code: 'passenger-flight-itinerary' },
  { re: /出租车/, code: 'taxi-invoice' },
  { re: /网约车/, code: 'ridehailing-invoice' },
  { re: /通行费|过路费/, code: 'toll-invoice' },
  { re: /农产品收购/, code: 'agricultural-invoice' },
  { re: /海关.{0,6}缴款书|进口增值税/, code: 'customs-vat-payment' },
  { re: /关税缴款/, code: 'customs-tariff-payment' },
  { re: /报关单/, code: 'export-declaration' },
  { re: /行政事业性收费/, code: 'admin-fee-receipt' },
  { re: /医疗收费/, code: 'medical-receipt' },
  { re: /捐赠票据/, code: 'donation-receipt' },
  { re: /非税收入/, code: 'non-tax-receipt' },
  { re: /政府性基金/, code: 'gov-fund-receipt' },
  { re: /进账单/, code: 'bank-deposit-slip' },
  { re: /电汇|汇款/, code: 'bank-remittance' },
  { re: /银行回单|回单/, code: 'bank-receipt' },
  { re: /对账单/, code: 'bank-statement' },
  { re: /支票/, code: 'check-stub' },
  { re: /手续费/, code: 'bank-fee-receipt' },
  { re: /差旅费报销/, code: 'travel-reimbursement' },
  { re: /报销单|费用报销/, code: 'expense-reimbursement' },
  { re: /借款单/, code: 'loan-form' },
  { re: /备用金/, code: 'petty-cash' },
  { re: /招待费/, code: 'entertainment-approval' },
  { re: /领料单|限额领料/, code: 'material-requisition' },
  { re: /退料单/, code: 'material-return' },
  { re: /盘点/, code: 'inventory-count' },
  { re: /入库单/, code: 'warehouse-receipt' },
  { re: /出库单|发货单|提货单/, code: 'delivery-note' },
  { re: /调拨/, code: 'material-transfer' },
  { re: /工资|薪酬/, code: 'payroll-sheet' },
  { re: /考勤/, code: 'attendance-sheet' },
  { re: /奖金|绩效/, code: 'bonus-sheet' },
  { re: /采购订单|采购申请/, code: 'purchase-order' },
  { re: /验收单/, code: 'asset-acceptance' },
  { re: /折旧/, code: 'depreciation-schedule' },
  { re: /报废/, code: 'asset-scrap' },
  { re: /收款收据|收据/, code: 'cash-receipt' },
  { re: /完税证明|税收缴款|印花税/, code: 'tax-payment-cert' },
  { re: /社保|公积金/, code: 'social-insurance-notice' },
  { re: /工会经费/, code: 'union-fee' },
  { re: /残疾人保障金/, code: 'disability-fund' },
  { re: /红字发票|红字信息/, code: 'red-invoice-info' },
  { re: /资产评估/, code: 'asset-evaluation' },
  { re: /股权转让|投资协议/, code: 'equity-transfer' },
  { re: /债务重组/, code: 'debt-restructure' },
  { re: /拆迁补偿/, code: 'demolition-compensation' },
  { re: /违约金|赔偿金/, code: 'penalty-settlement' },
  { re: /发票/, code: 'generic-invoice' }, // 兜底：仅"发票"字样 → 通用发票族
];

const TYPE_LABEL_MAP = flattenTypeTree(SOURCE_DOC_TYPE_TREE);

/** 按 OCR 文本 + 文件名推断原始凭证 96 类编码；未命中返回 null */
export function classifySourceDocType(ocrText: string, fileName: string): { code: string; label: string } | null {
  const compact = ((ocrText || '') + ' ' + (fileName || '')).replace(/\s+/g, '');
  for (const rule of SOURCE_TYPE_RULES) {
    if (rule.re.test(compact)) {
      return { code: rule.code, label: TYPE_LABEL_MAP.get(rule.code) || rule.code };
    }
  }
  return null;
}

// ── 主入口 ──

export function classifyDocument({ fileName, ocrText }: ClassifyInput): ClassifyResult {
  // tesseract 常在 CJK 间插入空格，关键词一律在「去空白紧凑串」上匹配
  const compact = (ocrText || '').replace(/\s+/g, '');
  const name = fileName || '';

  let voucherScore = 0;
  let sourceScore = 0;
  const hits: string[] = [];

  if (compact) {
    for (const r of VOUCHER_TEXT_RULES) {
      if (compact.includes(r.kw)) {
        voucherScore += r.w;
        if (r.strong || r.w >= 8) hits.push(`文本「${r.kw}」`);
      }
    }
    for (const r of SOURCE_TEXT_RULES) {
      if (compact.includes(r.kw)) {
        sourceScore += r.w;
        if (r.strong || r.w >= 8) hits.push(`文本「${r.kw}」`);
      }
    }
  }

  // 文件名规则
  if (SOURCE_NAME_RE.test(name)) {
    sourceScore += 40;
    hits.push('文件名含原始凭证单据词');
  } else if (VOUCHER_NAME_RE.test(name)) {
    voucherScore += 40;
    hits.push('文件名含记账凭证特征');
  }

  // ── 定类与置信度 ──
  const top = Math.max(voucherScore, sourceScore);
  let category: DocCategory = '未识别';
  let confidence: number;

  if (top < DECIDE_MIN_SCORE) {
    confidence = 20 + top; // 20-44，明确低置信
  } else {
    category = voucherScore >= sourceScore ? '记账凭证' : '原始凭证';
    const margin = Math.abs(voucherScore - sourceScore);
    confidence = Math.min(97, Math.round(45 + top * 0.45 + margin * 0.1));
  }

  // ── 字段抽取 ──
  const voucherNo = category === '原始凭证'
    ? extractSourceDocNo(compact) || extractVoucherNo(compact, name)
    : extractVoucherNo(compact, name);
  const amount = extractAmount(ocrText || '');
  const date = extractDate(ocrText || '');

  // 原始凭证 96 类目录推断（方案A：类型编码随件落库，2026-08-25）
  let docTypeCode: string | undefined;
  let docTypeName: string | undefined;
  if (category === '原始凭证') {
    const t = classifySourceDocType(ocrText || '', fileName || '');
    if (t) {
      docTypeCode = t.code;
      docTypeName = t.label;
    }
  }

  return {
    category,
    confidence,
    voucherNo,
    amount,
    date,
    hits,
    source: compact ? 'ocr' : 'filename',
    docTypeCode,
    docTypeName,
  };
}
