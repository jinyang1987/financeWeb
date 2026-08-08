/**
 * @license
 * Copyright (c) 2024. All rights reserved.
 * Smart Receive - Intelligent extraction patterns and logic
 */

import type { ExtractedField } from './types';

/** Pattern rules for structured field extraction */
export const EXTRACTION_RULES: { label: string; key: string; patterns: RegExp[] }[] = [
  {
    label: '发票号码',
    key: 'invoiceNo',
    patterns: [
      /发票[号码编][：:\s]*([A-Z0-9]{6,12})/i,
      /[Nn]o[.:]\s*([A-Z0-9]{6,12})/,
      /(?:发票|invoice)[#\s]*([A-Z0-9]{6,12})/i,
    ],
  },
  {
    label: '发票代码',
    key: 'invoiceCode',
    patterns: [/发票[代碼码][：:\s]*([0-9]{8,15})/, /代码[：:\s]*([0-9]{8,15})/],
  },
  {
    label: '开票日期',
    key: 'date',
    patterns: [
      /开票[日期][：:\s]*(\d{4}[-年]\d{1,2}[-月]\d{1,2})/,
      /日期[：:\s]*(\d{4}[-年]\d{1,2}[-月]\d{1,2})/,
      /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    ],
  },
  {
    label: '金额（小写）',
    key: 'amount',
    patterns: [
      /[金總额]计[（(]?[小]?[写]?[)）]?[：:\s]*[¥￥]?([0-9,.]+)/,
      /[Tt]otal[：:\s]*[¥￥$]?([0-9,.]+)/,
      /价税[合总]计[：:\s]*[¥￥]?([0-9,.]+)/,
      /金额[：:\s]*[¥￥]?([0-9,.]+)/,
    ],
  },
  {
    label: '金额（大写）',
    key: 'amountCN',
    patterns: [
      /[金總额]计[（(]大[写]?[)）][：:\s]*([壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分零整]+)/,
      /大写[：:\s]*([壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分零整]+)/,
    ],
  },
  {
    label: '购买方名称',
    key: 'buyerName',
    patterns: [
      /购买[方者][名名称][：:\s]*([\u4e00-\u9fa5（）()\w]+(?:\s*[\u4e00-\u9fa5（）()\w]+)*)/,
      /[名名称][：:\s]*([\u4e00-\u9fa5（）()\w]+(?:\s*[\u4e00-\u9fa5（）()\w]+)*)/,
    ],
  },
  {
    label: '购买方纳税人识别号',
    key: 'buyerTaxId',
    patterns: [
      /纳税人[识别号][：:\s]*([A-Z0-9]{15,20})/,
      /统一社会信用[代码][：:\s]*([A-Z0-9]{15,20})/,
    ],
  },
  {
    label: '销售方名称',
    key: 'sellerName',
    patterns: [/销售[方者][名名称][：:\s]*([\u4e00-\u9fa5（）()\w]+(?:\s*[\u4e00-\u9fa5（）()\w]+)*)/],
  },
  {
    label: '开户行及账号',
    key: 'bankAccount',
    patterns: [/开户[行账][：:\s]*([\u4e00-\u9fa5]+[\s]*[0-9]{10,25})/],
  },
  {
    label: '合同编号',
    key: 'contractNo',
    patterns: [
      /合同[编号][：:\s]*([A-Z0-9-]{8,25})/,
      /[Cc]ontract[#\s]*([A-Z0-9-]{8,25})/,
    ],
  },
  {
    label: '凭证字号',
    key: 'voucherNo',
    patterns: [
      /凭证[字号][：:\s]*([\u4e00-\u9fa5]+[-_\s]?\d{2,8})/,
      /记[账帐]凭证[：:\s]*([\u4e00-\u9fa5]+[-_\s]?\d{2,8})/,
    ],
  },
];

/** Run all extraction rules against the given text */
export function smartExtract(text: string): ExtractedField[] {
  const results: ExtractedField[] = [];
  for (const rule of EXTRACTION_RULES) {
    for (const pattern of rule.patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const val = match[1].trim();
        if (val.length >= 2) {
          const confidence: 'high' | 'medium' | 'low' =
            val.length >= 8 ? 'high' : val.length >= 4 ? 'medium' : 'low';
          results.push({ label: rule.label, key: rule.key, value: val, confidence });
          break;
        }
      }
    }
  }
  return results;
}
