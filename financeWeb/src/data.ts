/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mock 数据文件 — 对接后端后替换为 API 调用
 * 详见: API_INTEGRATION_GUIDE.md → 4. Mock 数据替换清单
 */

import { CategoryNode, ArchiveRecord } from './types';
import type { ArchiveBox } from './types/archiveBox';
import type { SourceDocument } from './types/sourceDocument';

export const initialCategoryTree: CategoryNode[] = [
  {
    id: 'fonds-1',
    label: '第一全宗（华北集团总部）',
    type: 'fonds',
    code: 'Z001',
    children: [
      {
        id: 'sub-111',
        label: '会计凭证',
        type: 'class',
        code: '01',
        children: [
          {
            id: 'period-2026',
            label: '2026年',
            type: 'period',
            code: '2026',
            children: [
              { id: 'period-202606', label: '06月', type: 'period', code: '202606' },
              { id: 'period-202605', label: '05月', type: 'period', code: '202605' },
              { id: 'period-202604', label: '04月', type: 'period', code: '202604' }
            ]
          },
          {
            id: 'period-2025',
            label: '2025年',
            type: 'period',
            code: '2025',
            children: [
              { id: 'period-202512', label: '12月', type: 'period', code: '202512' }
            ]
          }
        ]
      },
      {
        id: 'sub-112',
        label: '会计账簿',
        type: 'class',
        code: '02',
        children: [
          { id: 'period-book-2026', label: '2026年度总账', type: 'period', code: '2026' },
          { id: 'period-book-2025', label: '2025年度总账', type: 'period', code: '2025' }
        ]
      },
      {
        id: 'sub-113',
        label: '财务报表',
        type: 'class',
        code: '03',
        children: [
          { id: 'period-rep-2026Q1', label: '2026年Q1财务季报', type: 'period', code: '2026Q1' },
          { id: 'period-rep-2025', label: '2025年度审计报告', type: 'period', code: '2025' }
        ]
      },
      {
        id: 'sub-114',
        label: '其他会计资料',
        type: 'class',
        code: '04',
        children: []
      }
    ]
  },
  {
    id: 'fonds-2',
    label: '第二全宗（南方智造分公司）',
    type: 'fonds',
    code: 'Z002',
    children: [
      { id: 'sub-211', label: '会计凭证', type: 'class', code: '01' }
    ]
  }
];

// ─── 原始凭证 Mock 数据 ───────────────────────────────────────────
// 覆盖：发票类 / 银行单据类 / 存货出入库类 / 费用报销类 / 薪酬工资类 / 采购资产类 / 特殊业务类
// 每个原始凭证通过 parentRecordId 关联到对应的记账凭证（ArchiveRecord）
export const initialSourceDocuments: SourceDocument[] = [
  {
    "id": "sd-001",
    "documentNo": "FP-2026-05001",
    "docTypeCode": "vat-special-invoice",
    "docTypeName": "增值税专用发票",
    "transactionDate": "2026-05-15",
    "amountLower": 8500,
    "amountUpper": "捌仟伍佰元整",
    "counterpartyName": "北京某科技有限公司",
    "counterpartyTaxId": "91110108MA01XXXXX",
    "summary": "采购云计算服务器内存扩容设备",
    "preparer": "张三",
    "reviewer": "李财务",
    "attachmentCount": 0,
    "businessCategory": "采购",
    "parentVoucherNo": "记-001",
    "attachmentSequence": 1,
    "parentRecordId": "voucher-202605-001",
    "volumeId": "vol-001",
    "carrierType": "electronic",
    "source": "digital-native",
    "files": [
      {
        "name": "北京某科技数电发票_92427ae.xml",
        "type": "数电发票XML",
        "size": "28.1 KB",
        "contentType": "xml",
        "hash": "a1b2c3d4",
        "signatureVerified": true,
        "signer": "国家税务总局数字印章"
      }
    ],
    "extFields": {
      "invoiceCode": "011002200311",
      "invoiceNo": "92427001",
      "taxRate": "13",
      "taxAmount": "1105.00",
      "amountExclTax": "7395.00",
      "buyerName": "华北集团总部",
      "sellerName": "北京某科技有限公司",
      "drawer": "王开票"
    },
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "remarks": "记-001 所附增值税专用发票",
    "createdAt": "2026-05-30"
  },
  {
    "id": "sd-002",
    "documentNo": "SQD-2026-05015",
    "docTypeCode": "expense-reimbursement",
    "docTypeName": "费用报销单",
    "transactionDate": "2026-05-15",
    "amountLower": 4000,
    "amountUpper": "肆仟元整",
    "counterpartyName": "北京某科技有限公司",
    "summary": "设备采购尾款-付款申请",
    "preparer": "张三",
    "reviewer": "李财务",
    "attachmentCount": 2,
    "businessCategory": "采购",
    "parentVoucherNo": "记-001",
    "attachmentSequence": 2,
    "parentRecordId": "voucher-202605-001",
    "volumeId": "vol-001",
    "carrierType": "paper",
    "source": "digitized",
    "files": [
      {
        "name": "付款申请单_05015.pdf",
        "type": "PDF",
        "size": "156.3 KB",
        "contentType": "pdf",
        "hash": "c3d4e5f6",
        "signatureVerified": true,
        "signer": "张三"
      }
    ],
    "extFields": {
      "expenseNo": "SQD-2026-05015",
      "expenseCategory": "设备采购",
      "applicant": "张三",
      "totalAttachments": "2"
    },
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "remarks": "记-001 付款申请审批单",
    "createdAt": "2026-05-30"
  },
  {
    "id": "sd-003",
    "documentNo": "CG-2026-05020",
    "docTypeCode": "purchase-order",
    "docTypeName": "采购订单",
    "transactionDate": "2026-05-20",
    "amountLower": 23500,
    "amountUpper": "贰万叁仟伍佰元整",
    "counterpartyName": "上海某材料有限公司",
    "counterpartyTaxId": "91310000MA02YYYYY",
    "summary": "采购电子元器件一批",
    "preparer": "李采购",
    "reviewer": "王经理",
    "attachmentCount": 1,
    "businessCategory": "采购",
    "parentVoucherNo": "记-002",
    "attachmentSequence": 1,
    "parentRecordId": "voucher-202605-002",
    "volumeId": "vol-001",
    "carrierType": "electronic",
    "source": "digital-native",
    "files": [
      {
        "name": "上海某材料采购订单.pdf",
        "type": "PDF",
        "size": "89.2 KB",
        "contentType": "pdf",
        "hash": "e5f6g7h8",
        "signatureVerified": true,
        "signer": "李采购"
      }
    ],
    "extFields": {
      "orderNo": "CG-2026-05020",
      "supplierName": "上海某材料有限公司",
      "deliveryDate": "2026-06-15",
      "paymentTerms": "货到30天"
    },
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "remarks": "记-002 供应商采购订单",
    "createdAt": "2026-05-30"
  },
  {
    "id": "sd-004",
    "documentNo": "CL-2026-0525",
    "docTypeCode": "travel-reimbursement",
    "docTypeName": "差旅费报销单",
    "transactionDate": "2026-05-25",
    "amountLower": 2000,
    "amountUpper": "贰仟元整",
    "counterpartyName": "中国国际航空",
    "summary": "北京-上海往返差旅",
    "preparer": "王销售",
    "reviewer": "赵经理",
    "attachmentCount": 3,
    "businessCategory": "费用",
    "parentVoucherNo": "记-003",
    "attachmentSequence": 1,
    "parentRecordId": "voucher-202605-003",
    "volumeId": "vol-001",
    "carrierType": "paper",
    "source": "digitized",
    "files": [
      {
        "name": "差旅报销单_0525.pdf",
        "type": "PDF",
        "size": "234.7 KB",
        "contentType": "pdf",
        "hash": "g7h8i9j0",
        "signatureVerified": true,
        "signer": "王销售"
      }
    ],
    "extFields": {
      "traveler": "王销售",
      "destination": "上海",
      "travelPeriod": "2026-05-22~2026-05-24"
    },
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "remarks": "记-003 出差上海拜访客户",
    "createdAt": "2026-05-30"
  },
  {
    "id": "sd-005",
    "documentNo": "FP-2026-0525B",
    "docTypeCode": "vat-electronic-invoice",
    "docTypeName": "增值税电子发票（全电）",
    "transactionDate": "2026-05-25",
    "amountLower": 1200,
    "amountUpper": "壹仟贰佰元整",
    "counterpartyName": "上海某酒店管理有限公司",
    "summary": "出差住宿费",
    "preparer": "王销售",
    "reviewer": "赵经理",
    "attachmentCount": 0,
    "businessCategory": "费用",
    "parentVoucherNo": "记-003",
    "attachmentSequence": 2,
    "parentRecordId": "voucher-202605-003",
    "volumeId": "vol-001",
    "carrierType": "electronic",
    "source": "digital-native",
    "files": [
      {
        "name": "上海酒店数电票.xml",
        "type": "数电发票XML",
        "size": "15.8 KB",
        "contentType": "xml",
        "hash": "i9j0k1l2",
        "signatureVerified": true,
        "signer": "国家税务总局数字印章"
      }
    ],
    "extFields": {
      "invoiceNo": "20260525001234567890",
      "qrCodeUrl": "https://inv-veri.chinatax.gov.cn/qr/xxx",
      "taxRate": "6",
      "taxAmount": "72.00",
      "buyerName": "华北集团总部",
      "sellerName": "上海某酒店管理有限公司"
    },
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "remarks": "记-003 上海出差住宿发票",
    "createdAt": "2026-05-30"
  },
  {
    "id": "sd-006",
    "documentNo": "FP-2026-06001",
    "docTypeCode": "vat-special-invoice",
    "docTypeName": "增值税专用发票",
    "transactionDate": "2026-06-03",
    "amountLower": 3600,
    "amountUpper": "叁仟陆佰元整",
    "counterpartyName": "深圳某电子有限公司",
    "counterpartyTaxId": "91440300MA03ZZZZZ",
    "summary": "采购电子元器件",
    "preparer": "李采购",
    "reviewer": "王经理",
    "attachmentCount": 0,
    "businessCategory": "采购",
    "parentVoucherNo": "记-001",
    "attachmentSequence": 1,
    "parentRecordId": "voucher-202606-001",
    "carrierType": "electronic",
    "source": "digital-native",
    "files": [
      {
        "name": "深圳电子数电发票_06001.xml",
        "type": "数电发票XML",
        "size": "26.5 KB",
        "contentType": "xml",
        "hash": "k1l2m3n4",
        "signatureVerified": true,
        "signer": "国家税务总局数字印章"
      }
    ],
    "extFields": {
      "invoiceCode": "011002200312",
      "invoiceNo": "92427002",
      "taxRate": "13",
      "taxAmount": "468.00",
      "amountExclTax": "3132.00",
      "buyerName": "华北集团总部",
      "sellerName": "深圳某电子有限公司",
      "drawer": "陈开票"
    },
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "remarks": "6月记-001 采购电子元器件发票",
    "createdAt": "2026-06-03"
  },
  {
    "id": "sd-007",
    "documentNo": "YH-2026-06005",
    "docTypeCode": "bank-receipt",
    "docTypeName": "银行回单/电汇凭证",
    "transactionDate": "2026-06-05",
    "amountLower": 18200,
    "amountUpper": "壹万捌仟贰佰元整",
    "counterpartyName": "招商银行",
    "summary": "支付供应商货款",
    "preparer": "张出纳",
    "reviewer": "李财务",
    "attachmentCount": 0,
    "businessCategory": "资金",
    "parentVoucherNo": "记-002",
    "attachmentSequence": 1,
    "parentRecordId": "voucher-202606-002",
    "carrierType": "paper",
    "source": "digitized",
    "files": [
      {
        "name": "银行回单_0605.pdf",
        "type": "PDF",
        "size": "78.3 KB",
        "contentType": "pdf",
        "hash": "m3n4o5p6",
        "signatureVerified": true,
        "signer": "招商银行电子章"
      }
    ],
    "extFields": {
      "bankName": "招商银行北京分行营业部",
      "bankSerialNo": "CMB202606050012345",
      "accountNo": "1109XXXXX8868",
      "accountName": "华北集团总部"
    },
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "remarks": "6月记-002 支付货款银行回单",
    "createdAt": "2026-06-05"
  },
  {
    "id": "sd-008",
    "documentNo": "BX-2026-06010",
    "docTypeCode": "expense-reimbursement",
    "docTypeName": "费用报销单",
    "transactionDate": "2026-06-10",
    "amountLower": 1500,
    "amountUpper": "壹仟伍佰元整",
    "counterpartyName": "北京某办公用品有限公司",
    "summary": "采购办公文具用品",
    "preparer": "刘行政",
    "reviewer": "赵经理",
    "attachmentCount": 1,
    "businessCategory": "费用",
    "parentVoucherNo": "记-005",
    "attachmentSequence": 1,
    "parentRecordId": "voucher-202606-005",
    "carrierType": "paper",
    "source": "digitized",
    "files": [
      {
        "name": "办公用品报销单_0610.pdf",
        "type": "PDF",
        "size": "112.6 KB",
        "contentType": "pdf",
        "hash": "o5p6q7r8",
        "signatureVerified": true
      }
    ],
    "extFields": {
      "expenseNo": "BX-2026-06010",
      "expenseCategory": "办公费",
      "applicant": "刘行政",
      "totalAttachments": "1"
    },
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "remarks": "6月记-005 办公用品费用报销",
    "createdAt": "2026-06-10"
  },
  {
    "id": "sd-009",
    "documentNo": "FP-2026-06015",
    "docTypeCode": "vat-normal-invoice",
    "docTypeName": "增值税普通发票",
    "transactionDate": "2026-06-15",
    "amountLower": 8200,
    "amountUpper": "捌仟贰佰元整",
    "counterpartyName": "广州某物流有限公司",
    "counterpartyTaxId": "91440100MA04WWWWW",
    "summary": "支付物流运输费",
    "preparer": "刘行政",
    "reviewer": "赵经理",
    "attachmentCount": 0,
    "businessCategory": "费用",
    "parentVoucherNo": "记-008",
    "attachmentSequence": 1,
    "parentRecordId": "voucher-202606-008",
    "carrierType": "electronic",
    "source": "digital-native",
    "files": [
      {
        "name": "物流费发票_0615.pdf",
        "type": "PDF",
        "size": "45.2 KB",
        "contentType": "pdf",
        "hash": "q7r8s9t0",
        "signatureVerified": true,
        "signer": "国家税务总局数字印章"
      }
    ],
    "extFields": {
      "invoiceCode": "044002200315",
      "invoiceNo": "88215003",
      "taxRate": "9",
      "taxAmount": "738.00",
      "buyerName": "华北集团总部",
      "sellerName": "广州某物流有限公司"
    },
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "remarks": "6月记-008 物流运输费发票",
    "createdAt": "2026-06-15"
  },
  {
    "id": "sd-010",
    "documentNo": "GZ-2026-06",
    "docTypeCode": "payroll-sheet",
    "docTypeName": "工资发放明细表",
    "transactionDate": "2026-06-30",
    "amountLower": 285000,
    "amountUpper": "贰拾捌万伍仟元整",
    "counterpartyName": "",
    "summary": "6月工资发放",
    "preparer": "张薪酬",
    "reviewer": "李财务",
    "attachmentCount": 1,
    "businessCategory": "薪酬",
    "parentVoucherNo": "记-030",
    "attachmentSequence": 1,
    "parentRecordId": "voucher-202606-030",
    "carrierType": "electronic",
    "source": "digital-native",
    "files": [
      {
        "name": "6月工资明细表.xlsx",
        "type": "Excel表格",
        "size": "345.8 KB",
        "contentType": "unknown",
        "hash": "s9t0u1v2",
        "signatureVerified": true,
        "signer": "张薪酬"
      }
    ],
    "extFields": {
      "payMonth": "2026-06",
      "employeeName": "全体员工",
      "department": "全部",
      "baseSalary": "285000.00",
      "grossPay": "285000.00",
      "netPay": "256500.00"
    },
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "remarks": "6月记-030 工资发放明细",
    "createdAt": "2026-06-30"
  }
];

export const initialBoxes: ArchiveBox[] = [
  {
    id: 'box-001',
    boxId: 'BX-001',
    boxNo: 'BOX-2026-KP-001',
    boxName: '2026年会计凭证 第001盒',
    archiveTypeCode: 'KP',
    location: '柜A-架3-层2',
    retention: '30年',
    year: 2026,
    carrierType: 'paper',
    status: 'sealed',
    volumeCount: 1,
    totalItems: 50,
    createdDate: '2026-05-30',
    createdBy: '张三',
    remarks: '含2026年1-3月会计凭证',
  },
  {
    id: 'box-002',
    boxId: 'BX-002',
    boxNo: 'BOX-2026-KP-002',
    boxName: '2026年会计凭证 第002盒',
    archiveTypeCode: 'KP',
    location: '柜A-架3-层3',
    retention: '30年',
    year: 2026,
    carrierType: 'paper',
    status: 'active',
    volumeCount: 2,
    totalItems: 89,
    createdDate: '2026-06-10',
    createdBy: '李四',
    remarks: '含2026年4-6月会计凭证',
  },
  {
    id: 'box-003',
    boxId: 'BX-003',
    boxNo: 'BOX-2025-FB-001',
    boxName: '2025年财务报表审计 第001盒',
    archiveTypeCode: 'FB',
    location: '柜B-架1-层1',
    retention: '永久',
    year: 2025,
    carrierType: 'paper',
    status: 'stored',
    volumeCount: 1,
    totalItems: 8,
    createdDate: '2026-02-15',
    createdBy: '王五',
    remarks: '2025年度审计财务报告及附注',
  },
  {
    id: 'box-004',
    boxId: 'BX-004',
    boxNo: 'BOX-2026-KB-001',
    boxName: '2026年会计账簿 第001盒',
    archiveTypeCode: 'KB',
    location: '柜A-架5-层1',
    retention: '30年',
    year: 2026,
    carrierType: 'paper',
    status: 'active',
    volumeCount: 1,
    totalItems: 12,
    createdDate: '2026-06-15',
    createdBy: '李四',
    remarks: '2026年度总账及明细账',
  },
];

export const initialRecords: ArchiveRecord[] = [
  {
    "id": "voucher-202605-001",
    "archiveCode": "Z001-KU·01·2026-D30-0001-0001",
    "voucherNo": "记-001",
    "archiveType": "记账凭证",
    "department": "财务部",
    "amount": 12500,
    "year": "2026",
    "month": "05",
    "retention": "30年",
    "status": "已组卷",
    "volumeCode": "Z001-KU·01·2026-D30-0001",
    "volumeId": "vol-001",
    "numbered": true,
    "numberedDate": "2026-05-30",
    "numberRuleId": "rule-default",
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [
      "sd-001",
      "sd-002"
    ],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-may01",
        "timestamp": "2026-05-30 10:00:00",
        "action": "确认组卷",
        "operator": "张三",
        "details": "组卷完成，卷号 Z001-KU·01·2026-D30-0001",
        "ipAddress": "192.168.1.101"
      }
    ],
    "remarks": "5月采购办公设备及差旅费"
  },
  {
    "id": "voucher-202605-002",
    "archiveCode": "Z001-KU·01·2026-D30-0001-0002",
    "voucherNo": "记-002",
    "archiveType": "记账凭证",
    "department": "采购部",
    "amount": 23500,
    "year": "2026",
    "month": "05",
    "retention": "30年",
    "status": "已组卷",
    "volumeCode": "Z001-KU·01·2026-D30-0001",
    "volumeId": "vol-001",
    "numbered": true,
    "numberedDate": "2026-05-30",
    "numberRuleId": "rule-default",
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [
      "sd-003"
    ],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-may02",
        "timestamp": "2026-05-30 10:05:00",
        "action": "确认组卷",
        "operator": "张三",
        "details": "组卷完成",
        "ipAddress": "192.168.1.101"
      }
    ],
    "remarks": "5月供应商货款支付"
  },
  {
    "id": "voucher-202605-003",
    "archiveCode": "Z001-KU·01·2026-D30-0001-0003",
    "voucherNo": "记-003",
    "archiveType": "记账凭证",
    "department": "销售部",
    "amount": 3200,
    "year": "2026",
    "month": "05",
    "retention": "30年",
    "status": "已组卷",
    "volumeCode": "Z001-KU·01·2026-D30-0001",
    "volumeId": "vol-001",
    "numbered": true,
    "numberedDate": "2026-05-30",
    "numberRuleId": "rule-default",
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [
      "sd-004",
      "sd-005"
    ],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-may03",
        "timestamp": "2026-05-30 10:10:00",
        "action": "确认组卷",
        "operator": "张三",
        "details": "组卷完成",
        "ipAddress": "192.168.1.101"
      }
    ],
    "remarks": "5月差旅费报销"
  },
  {
    "id": "voucher-202606-001",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0001",
    "voucherNo": "记-001",
    "archiveType": "记账凭证",
    "department": "采购部",
    "amount": 9697.11,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [
      "sd-006"
    ],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-1",
        "timestamp": "2026-06-01 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付保险费"
  },
  {
    "id": "voucher-202606-002",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0002",
    "voucherNo": "记-002",
    "archiveType": "记账凭证",
    "department": "销售部",
    "amount": 49502.72,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [
      "sd-007"
    ],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-2",
        "timestamp": "2026-06-02 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付物流费"
  },
  {
    "id": "voucher-202606-003",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0003",
    "voucherNo": "记-003",
    "archiveType": "记账凭证",
    "department": "行政部",
    "amount": 615384.67,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-3",
        "timestamp": "2026-06-03 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "收到政府补贴"
  },
  {
    "id": "voucher-202606-004",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0004",
    "voucherNo": "记-004",
    "archiveType": "记账凭证",
    "department": "研发部",
    "amount": 17063.67,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-4",
        "timestamp": "2026-06-04 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "结转利润"
  },
  {
    "id": "voucher-202606-005",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0005",
    "voucherNo": "记-005",
    "archiveType": "记账凭证",
    "department": "财务部",
    "amount": 1516.81,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [
      "sd-008"
    ],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-5",
        "timestamp": "2026-06-05 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付检测费"
  },
  {
    "id": "voucher-202606-006",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0006",
    "voucherNo": "记-006",
    "archiveType": "记账凭证",
    "department": "采购部",
    "amount": 55159.37,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-6",
        "timestamp": "2026-06-06 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付印刷费"
  },
  {
    "id": "voucher-202606-007",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0007",
    "voucherNo": "记-007",
    "archiveType": "记账凭证",
    "department": "销售部",
    "amount": 54693.25,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-7",
        "timestamp": "2026-06-07 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付展会费"
  },
  {
    "id": "voucher-202606-008",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0008",
    "voucherNo": "记-008",
    "archiveType": "记账凭证",
    "department": "行政部",
    "amount": 1002.97,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [
      "sd-009"
    ],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-8",
        "timestamp": "2026-06-08 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付物业费"
  },
  {
    "id": "voucher-202606-009",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0009",
    "voucherNo": "记-009",
    "archiveType": "记账凭证",
    "department": "研发部",
    "amount": 99378.4,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-9",
        "timestamp": "2026-06-09 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "收到退税款"
  },
  {
    "id": "voucher-202606-010",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0010",
    "voucherNo": "记-010",
    "archiveType": "记账凭证",
    "department": "财务部",
    "amount": 4913.02,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-10",
        "timestamp": "2026-06-10 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付培训费"
  },
  {
    "id": "voucher-202606-011",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0011",
    "voucherNo": "记-011",
    "archiveType": "记账凭证",
    "department": "采购部",
    "amount": 23814.14,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-11",
        "timestamp": "2026-06-11 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "收到赔偿款"
  },
  {
    "id": "voucher-202606-012",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0012",
    "voucherNo": "记-012",
    "archiveType": "记账凭证",
    "department": "销售部",
    "amount": 2235.23,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-12",
        "timestamp": "2026-06-12 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "计提利息"
  },
  {
    "id": "voucher-202606-013",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0013",
    "voucherNo": "记-013",
    "archiveType": "记账凭证",
    "department": "行政部",
    "amount": 548054.73,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-13",
        "timestamp": "2026-06-13 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付水电费"
  },
  {
    "id": "voucher-202606-014",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0014",
    "voucherNo": "记-014",
    "archiveType": "记账凭证",
    "department": "研发部",
    "amount": 23812.64,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-14",
        "timestamp": "2026-06-14 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "缴纳税款"
  },
  {
    "id": "voucher-202606-015",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0015",
    "voucherNo": "记-015",
    "archiveType": "记账凭证",
    "department": "财务部",
    "amount": 292.36,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-15",
        "timestamp": "2026-06-15 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "结转收入"
  },
  {
    "id": "voucher-202606-016",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0016",
    "voucherNo": "记-016",
    "archiveType": "记账凭证",
    "department": "采购部",
    "amount": 200884.41,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-16",
        "timestamp": "2026-06-16 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "计提本月折旧"
  },
  {
    "id": "voucher-202606-017",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0017",
    "voucherNo": "记-017",
    "archiveType": "记账凭证",
    "department": "销售部",
    "amount": 54377.56,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-17",
        "timestamp": "2026-06-17 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "结转成本"
  },
  {
    "id": "voucher-202606-018",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0018",
    "voucherNo": "记-018",
    "archiveType": "记账凭证",
    "department": "行政部",
    "amount": 91271.71,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-18",
        "timestamp": "2026-06-18 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "购买固定资产"
  },
  {
    "id": "voucher-202606-019",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0019",
    "voucherNo": "记-019",
    "archiveType": "记账凭证",
    "department": "研发部",
    "amount": 5726.21,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-19",
        "timestamp": "2026-06-19 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "报销医药费"
  },
  {
    "id": "voucher-202606-020",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0020",
    "voucherNo": "记-020",
    "archiveType": "记账凭证",
    "department": "财务部",
    "amount": 49708.45,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-20",
        "timestamp": "2026-06-20 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "报销取证费"
  },
  {
    "id": "voucher-202606-021",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0021",
    "voucherNo": "记-021",
    "archiveType": "记账凭证",
    "department": "采购部",
    "amount": 43395.96,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-21",
        "timestamp": "2026-06-21 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "报销书报费"
  },
  {
    "id": "voucher-202606-022",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0022",
    "voucherNo": "记-022",
    "archiveType": "记账凭证",
    "department": "销售部",
    "amount": 32801.37,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-22",
        "timestamp": "2026-06-22 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付赔款"
  },
  {
    "id": "voucher-202606-023",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0023",
    "voucherNo": "记-023",
    "archiveType": "记账凭证",
    "department": "行政部",
    "amount": 509849.5,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-23",
        "timestamp": "2026-06-23 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "计提工资"
  },
  {
    "id": "voucher-202606-024",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0024",
    "voucherNo": "记-024",
    "archiveType": "记账凭证",
    "department": "研发部",
    "amount": 1914.25,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-24",
        "timestamp": "2026-06-24 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "收到客户回款"
  },
  {
    "id": "voucher-202606-026",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0026",
    "voucherNo": "记-026",
    "archiveType": "记账凭证",
    "department": "采购部",
    "amount": 22807.82,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-26",
        "timestamp": "2026-06-26 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "计提坏账准备"
  },
  {
    "id": "voucher-202606-027",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0027",
    "voucherNo": "记-027",
    "archiveType": "记账凭证",
    "department": "销售部",
    "amount": 14993.71,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-27",
        "timestamp": "2026-06-27 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "购买无形资产"
  },
  {
    "id": "voucher-202606-028",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0028",
    "voucherNo": "记-028",
    "archiveType": "记账凭证",
    "department": "行政部",
    "amount": 250599.93,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-28",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "报销差旅费"
  },
  {
    "id": "voucher-202606-029",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0029",
    "voucherNo": "记-029",
    "archiveType": "记账凭证",
    "department": "研发部",
    "amount": 41918.3,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-29",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "采购办公用品"
  },
  {
    "id": "voucher-202606-030",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0030",
    "voucherNo": "记-030",
    "archiveType": "记账凭证",
    "department": "财务部",
    "amount": 16641.18,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [
      "sd-010"
    ],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-30",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付咨询费"
  },
  {
    "id": "voucher-202606-031",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0031",
    "voucherNo": "记-031",
    "archiveType": "记账凭证",
    "department": "采购部",
    "amount": 11749.06,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-31",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付手续费"
  },
  {
    "id": "voucher-202606-032",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0032",
    "voucherNo": "记-032",
    "archiveType": "记账凭证",
    "department": "销售部",
    "amount": 116761.9,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-32",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "收到保证金"
  },
  {
    "id": "voucher-202606-033",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0033",
    "voucherNo": "记-033",
    "archiveType": "记账凭证",
    "department": "行政部",
    "amount": 9303.07,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-33",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "收到投资收益"
  },
  {
    "id": "voucher-202606-034",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0034",
    "voucherNo": "记-034",
    "archiveType": "记账凭证",
    "department": "研发部",
    "amount": 47888.82,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-34",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "收到定金"
  },
  {
    "id": "voucher-202606-035",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0035",
    "voucherNo": "记-035",
    "archiveType": "记账凭证",
    "department": "财务部",
    "amount": 103700.06,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-35",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "报销招待费"
  },
  {
    "id": "voucher-202606-036",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0036",
    "voucherNo": "记-036",
    "archiveType": "记账凭证",
    "department": "采购部",
    "amount": 48325.34,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-36",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "发放工资"
  },
  {
    "id": "voucher-202606-037",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0037",
    "voucherNo": "记-037",
    "archiveType": "记账凭证",
    "department": "销售部",
    "amount": 198306.91,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-37",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "收到捐赠"
  },
  {
    "id": "voucher-202606-038",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0038",
    "voucherNo": "记-038",
    "archiveType": "记账凭证",
    "department": "行政部",
    "amount": 16396.56,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-38",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "结转费用"
  },
  {
    "id": "voucher-202606-039",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0039",
    "voucherNo": "记-039",
    "archiveType": "记账凭证",
    "department": "研发部",
    "amount": 42704.93,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-39",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "计提福利费"
  },
  {
    "id": "voucher-202606-040",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0040",
    "voucherNo": "记-040",
    "archiveType": "记账凭证",
    "department": "财务部",
    "amount": 573057.24,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-40",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付劳务费"
  },
  {
    "id": "voucher-202606-041",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0041",
    "voucherNo": "记-041",
    "archiveType": "记账凭证",
    "department": "采购部",
    "amount": 2963.54,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-41",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "计提摊销"
  },
  {
    "id": "voucher-202606-042",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0042",
    "voucherNo": "记-042",
    "archiveType": "记账凭证",
    "department": "销售部",
    "amount": 30617.39,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-42",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "购买原材料"
  },
  {
    "id": "voucher-202606-043",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0043",
    "voucherNo": "记-043",
    "archiveType": "记账凭证",
    "department": "行政部",
    "amount": 1659.34,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-43",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "报销通讯费"
  },
  {
    "id": "voucher-202606-044",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0044",
    "voucherNo": "记-044",
    "archiveType": "记账凭证",
    "department": "研发部",
    "amount": 46480.05,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-44",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付广告费"
  },
  {
    "id": "voucher-202606-045",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0045",
    "voucherNo": "记-045",
    "archiveType": "记账凭证",
    "department": "财务部",
    "amount": 4964.96,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-45",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付快递费"
  },
  {
    "id": "voucher-202606-046",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0046",
    "voucherNo": "记-046",
    "archiveType": "记账凭证",
    "department": "采购部",
    "amount": 524842.16,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-46",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付维修费"
  },
  {
    "id": "voucher-202606-047",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0047",
    "voucherNo": "记-047",
    "archiveType": "记账凭证",
    "department": "销售部",
    "amount": 3300.8,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-47",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付租金"
  },
  {
    "id": "voucher-202606-048",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0048",
    "voucherNo": "记-048",
    "archiveType": "记账凭证",
    "department": "行政部",
    "amount": 46843.32,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-48",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付研发费"
  },
  {
    "id": "voucher-202606-049",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0049",
    "voucherNo": "记-049",
    "archiveType": "记账凭证",
    "department": "研发部",
    "amount": 34640.9,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-49",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付运费"
  },
  {
    "id": "voucher-202606-050",
    "archiveCode": "Z001-KU·01·2026-D30-0000-0050",
    "voucherNo": "记-050",
    "archiveType": "记账凭证",
    "department": "财务部",
    "amount": 37405.9,
    "year": "2026",
    "month": "06",
    "retention": "30年",
    "status": "仅件数据",
    "numbered": false,
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "sourceDocumentIds": [],
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [],
    "auditLogs": [
      {
        "id": "log-50",
        "timestamp": "2026-06-28 09:30:00",
        "action": "系统导入",
        "operator": "会计核算系统",
        "details": "从ERP系统导入记账凭证",
        "ipAddress": "192.168.1.100"
      }
    ],
    "remarks": "支付供应商货款"
  },
  {
    "id": "voucher-book-001",
    "archiveCode": "Z001-KU·02·2026-Y-0001-0007",
    "voucherNo": "账-007",
    "archiveType": "会计账簿",
    "department": "财务部",
    "amount": 0,
    "year": "2026",
    "month": "06",
    "retention": "永久",
    "status": "已组卷",
    "volumeCode": "Z001-KU·02·2026-Y-0001",
    "volumeId": "vol-004",
    "numbered": true,
    "numberedDate": "2026-06-30",
    "numberRuleId": "rule-default",
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [
      {
        "name": "2026年6月总账.xml",
        "type": "电子账簿XML",
        "size": "2.3 MB",
        "contentType": "xml",
        "hash": "abc123def",
        "signatureVerified": true,
        "signer": "财务主管"
      }
    ],
    "auditLogs": [
      {
        "id": "log-book",
        "timestamp": "2026-06-30 17:00:00",
        "action": "确认组卷",
        "operator": "李四",
        "details": "账簿组卷完成",
        "ipAddress": "192.168.1.102"
      }
    ],
    "remarks": "2026年6月总账"
  },
  {
    "id": "voucher-rpt-001",
    "archiveCode": "Z001-KU·03·2025-Y-0001-0011",
    "voucherNo": "报-011",
    "archiveType": "财务报告",
    "department": "财务部",
    "amount": 0,
    "year": "2025",
    "month": "12",
    "retention": "永久",
    "status": "已组卷",
    "volumeCode": "Z001-KU·03·2025-Y-0001",
    "volumeId": "vol-005",
    "numbered": true,
    "numberedDate": "2026-02-15",
    "numberRuleId": "rule-default",
    "source": "digital-native",
    "carrierType": "electronic",
    "managementMode": "volume-mode",
    "checks": {
      "real": true,
      "complete": true,
      "usable": true,
      "safe": true
    },
    "checkDetails": [],
    "components": [
      {
        "name": "2025年度财务报告.pdf",
        "type": "财务报告PDF",
        "size": "5.1 MB",
        "contentType": "pdf",
        "hash": "def456abc",
        "signatureVerified": true,
        "signer": "CFO电子签章"
      }
    ],
    "auditLogs": [
      {
        "id": "log-rpt",
        "timestamp": "2026-02-15 11:00:00",
        "action": "确认组卷",
        "operator": "王五",
        "details": "年报组卷完成",
        "ipAddress": "192.168.1.103"
      }
    ],
    "remarks": "2025年度审计财务报告及附注"
  }
];