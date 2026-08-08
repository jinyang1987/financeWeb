/**
 * 原始凭证类型定义（附件级，依附于记账凭证）
 *
 * 依据：DA/T 94-2022、会计实操（原始凭证=记账凭证的附属附件）
 * 核心原则：
 *   - 原始凭证不设独立档案编号，身份标识继承所属记账凭证号
 *   - 编号时序：会计制单→系统生成凭证号→原始凭证绑定凭证号（不可逆）
 *   - 1 张记账凭证对应 N 张原始凭证，为从属关系
 *   - 归档层级：盒→卷→件(记账凭证)→附件(原始凭证)
 * 设计：9 个公共字段 + extFields 扩展 = 覆盖 96 种原始凭证
 */

// ── 原始凭证大类 ──
export type SourceDocCategory = 'external' | 'internal' | 'special';

// ── 原始凭证业务分类（9 公共字段之"分类元"） ──
export type BusinessCategory =
  | '采购'
  | '销售'
  | '费用'
  | '资产'
  | '薪酬'
  | '存货'
  | '资金'
  | '结算'
  | '特殊';

// ── 可配置的原始凭证类型树节点 ──
export interface SourceDocTypeNode {
  /** 类型编码（唯一标识） */
  code: string;
  /** 类型名称 */
  label: string;
  /** 所属大类 */
  category: SourceDocCategory;
  /** 子类型 */
  children?: SourceDocTypeNode[];
  /** 该类型的扩展字段定义（元数据配置页使用） */
  extFieldDefs?: SourceDocExtFieldDef[];
}

// ── 扩展字段定义（用于元数据配置页的动态表单） ──
export interface SourceDocExtFieldDef {
  key: string;
  label: string;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'decimal';
  isRequired: boolean;
  /** 所属分组（用于详情面板分区展示） */
  group: 'basic' | 'entity' | 'business' | 'amount' | 'approval' | 'attachment';
}

// ── 原始凭证实体（附件级，依附于记账凭证） ──
export interface SourceDocument {
  /** 唯一标识 */
  id: string;

  // ── 9 个公共字段 ──

  /** 1. 单据编号（业务标识，如发票号码、报销单编号等外部业务系统赋予的编号，非档案编号） */
  documentNo: string;

  /** 2. 原始凭证类型编码（对应 SourceDocTypeNode.code） */
  docTypeCode: string;

  /** 原始凭证类型名称（冗余，方便列表展示） */
  docTypeName: string;

  /** 3. 业务发生/制单日期 */
  transactionDate: string;

  /** 4. 小写金额 */
  amountLower: number;

  /** 5. 人民币大写金额（防篡改法律要件） */
  amountUpper: string;

  /** 6a. 对方单位名称 */
  counterpartyName: string;

  /** 6b. 对方纳税人识别号（发票类必填） */
  counterpartyTaxId?: string;

  /** 6c. 对方地址电话（发票类） */
  counterpartyAddress?: string;

  /** 6d. 对方开户行及账号（发票/银行类） */
  counterpartyBankAccount?: string;

  /** 7. 摘要/事由/备注 — 业务描述 */
  summary: string;

  /** 8. 制单人 */
  preparer?: string;

  /** 9. 审核人 */
  reviewer?: string;

  /** 10. 附件张数 */
  attachmentCount: number;

  /** 11. 业务类型标记（采购/销售/费用/资产/薪酬/存货/资金/结算/特殊） */
  businessCategory: BusinessCategory;

  // ── 关联字段（依附记账凭证） ──

  /** ★ 所属记账凭证号（核心检索键，继承自记账凭证，非独立编号） */
  parentVoucherNo: string;

  /** ★ 附件顺序号（在该记账凭证下的第几个附件，1-based） */
  attachmentSequence: number;

  /** 所属记账凭证 ID（关联 ArchiveRecord.id） */
  parentRecordId: string;

  /** 所属案卷 ID */
  volumeId?: string;

  /** 所属盒 ID（纸质模式） */
  boxId?: string;

  /** 载体类型 */
  carrierType: 'paper' | 'electronic';

  // ── 电子文件 ──

  /** 关联的电子文件列表 */
  files: SourceDocFile[];

  // ── 扩展字段（类型特有，如发票代码/号码、银行流水号、物料编码等） ──
  extFields: Record<string, string | number | boolean | null>;

  // ── 来源 ──
  source: 'digital-native' | 'digitized';

  /** 四性检测结果 */
  checks: {
    real: boolean;
    complete: boolean;
    usable: boolean;
    safe: boolean;
  };

  /** 备注 */
  remarks?: string;

  /** 创建时间 */
  createdAt: string;
}

// ── 原始凭证关联的电子文件 ──
export interface SourceDocFile {
  name: string;
  type: string;
  size: string;
  contentType: 'xml' | 'ofd' | 'pdf' | 'png' | 'jpg' | 'tiff' | 'unknown';
  hash: string;
  signatureVerified: boolean;
  signer?: string;
}

// ── 可配置的原始凭证类型树（完整 96 种，结构化为树） ──
export const SOURCE_DOC_TYPE_TREE: SourceDocTypeNode[] = [
  // ── 外来原始凭证 ──
  {
    code: 'external',
    label: '外来原始凭证',
    category: 'external',
    children: [
      {
        code: 'invoice',
        label: '发票类',
        category: 'external',
        children: [
          {
            code: 'vat-special-invoice',
            label: '增值税专用发票',
            category: 'external',
            extFieldDefs: [
              { key: 'invoiceCode', label: '发票代码', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'invoiceNo', label: '发票号码', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'checkCode', label: '校验码', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'taxRate', label: '适用税率(%)', dataType: 'decimal', isRequired: true, group: 'amount' },
              { key: 'taxAmount', label: '税额', dataType: 'decimal', isRequired: true, group: 'amount' },
              { key: 'amountExclTax', label: '不含税金额', dataType: 'decimal', isRequired: true, group: 'amount' },
              { key: 'buyerName', label: '购买方名称', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'buyerTaxId', label: '购买方纳税人识别号', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'sellerName', label: '销售方名称', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'sellerTaxId', label: '销售方纳税人识别号', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'drawer', label: '开票人', dataType: 'string', isRequired: false, group: 'approval' },
            ],
          },
          {
            code: 'vat-normal-invoice',
            label: '增值税普通发票',
            category: 'external',
            extFieldDefs: [
              { key: 'invoiceCode', label: '发票代码', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'invoiceNo', label: '发票号码', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'checkCode', label: '校验码', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'taxRate', label: '适用税率(%)', dataType: 'decimal', isRequired: false, group: 'amount' },
              { key: 'taxAmount', label: '税额', dataType: 'decimal', isRequired: false, group: 'amount' },
              { key: 'buyerName', label: '购买方名称', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'sellerName', label: '销售方名称', dataType: 'string', isRequired: true, group: 'entity' },
            ],
          },
          {
            code: 'vat-electronic-invoice',
            label: '增值税电子发票（全电）',
            category: 'external',
            extFieldDefs: [
              { key: 'invoiceNo', label: '发票号码(20位全电票号)', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'checkCode', label: '校验码', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'qrCodeUrl', label: '查验二维码', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'taxRate', label: '适用税率(%)', dataType: 'decimal', isRequired: true, group: 'amount' },
              { key: 'taxAmount', label: '税额', dataType: 'decimal', isRequired: true, group: 'amount' },
              { key: 'buyerName', label: '购买方名称', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'sellerName', label: '销售方名称', dataType: 'string', isRequired: true, group: 'entity' },
            ],
          },
          { code: 'vehicle-invoice', label: '机动车销售统一发票', category: 'external' },
          { code: 'transport-invoice', label: '货物运输业增值税专用发票', category: 'external' },
          { code: 'generic-invoice', label: '通用机打/定额发票', category: 'external' },
          { code: 'passenger-ticket', label: '客运票据', category: 'external' },
          { code: 'toll-invoice', label: '通行费票据', category: 'external' },
          { code: 'customs-payment', label: '海关缴款书', category: 'external' },
          { code: 'export-declaration', label: '出口货物报关单', category: 'external' },
        ],
      },
      {
        code: 'fiscal',
        label: '财政票据类',
        category: 'external',
        children: [
          { code: 'admin-fee-receipt', label: '行政事业性收费票据', category: 'external' },
          { code: 'gov-fund-receipt', label: '政府性基金票据', category: 'external' },
          { code: 'donation-receipt', label: '公益事业捐赠票据', category: 'external' },
          { code: 'medical-receipt', label: '医疗收费票据', category: 'external' },
          { code: 'non-tax-receipt', label: '非税收入一般缴款书', category: 'external' },
        ],
      },
      {
        code: 'bank',
        label: '银行单据类',
        category: 'external',
        children: [
          {
            code: 'bank-deposit-slip',
            label: '银行进账单',
            category: 'external',
            extFieldDefs: [
              { key: 'bankName', label: '银行机构名称', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'bankSerialNo', label: '银行流水凭证号', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'payerName', label: '付款方名称', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'payerAccount', label: '付款方银行账号', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'payeeName', label: '收款方名称', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'payeeAccount', label: '收款方银行账号', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'paymentPurpose', label: '用途/款项摘要', dataType: 'string', isRequired: true, group: 'business' },
            ],
          },
          {
            code: 'bank-receipt',
            label: '银行回单/电汇凭证',
            category: 'external',
            extFieldDefs: [
              { key: 'bankName', label: '银行网点名称', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'bankSerialNo', label: '业务流水号', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'accountNo', label: '收付账号', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'accountName', label: '户名', dataType: 'string', isRequired: true, group: 'entity' },
            ],
          },
          { code: 'check-stub', label: '转账支票存根', category: 'external' },
          { code: 'cash-deposit-receipt', label: '现金缴款单回执', category: 'external' },
          { code: 'bank-fee-receipt', label: '银行手续费回单', category: 'external' },
          { code: 'loan-interest-receipt', label: '贷款利息回单', category: 'external' },
          { code: 'bank-statement', label: '银行对账单', category: 'external' },
          { code: 'forex-water', label: '外汇结汇/购汇水单', category: 'external' },
        ],
      },
      {
        code: 'external-trade',
        label: '外部往来类',
        category: 'external',
        children: [
          { code: 'supplier-delivery', label: '供应商送货单', category: 'external' },
          { code: 'logistics-waybill', label: '物流运单/快递运单', category: 'external' },
          { code: 'insurance-policy', label: '保险公司保单/发票', category: 'external' },
          { code: 'utility-bill', label: '供电/供水/燃气缴费单', category: 'external' },
          { code: 'tax-payment-cert', label: '税收缴款书/完税证明', category: 'external' },
          { code: 'social-insurance-notice', label: '社保/公积金缴费通知单', category: 'external' },
        ],
      },
    ],
  },

  // ── 自制原始凭证 ──
  {
    code: 'internal',
    label: '自制原始凭证',
    category: 'internal',
    children: [
      {
        code: 'inventory',
        label: '存货出入库类',
        category: 'internal',
        children: [
          {
            code: 'material-requisition',
            label: '领料单',
            category: 'internal',
            extFieldDefs: [
              { key: 'requisitionNo', label: '领料单编号', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'materialCode', label: '物料编码', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'materialName', label: '物料名称', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'spec', label: '规格型号', dataType: 'string', isRequired: false, group: 'business' },
              { key: 'plannedQty', label: '计划领用数量', dataType: 'number', isRequired: true, group: 'business' },
              { key: 'actualQty', label: '实际发放数量', dataType: 'number', isRequired: true, group: 'business' },
              { key: 'warehouseKeeper', label: '仓库保管员', dataType: 'string', isRequired: true, group: 'approval' },
            ],
          },
          { code: 'material-return', label: '退料单', category: 'internal' },
          { code: 'warehouse-receipt', label: '入库单', category: 'internal' },
          { code: 'delivery-note', label: '销售出库单/发货单', category: 'internal' },
          { code: 'inventory-count', label: '存货盘点表', category: 'internal' },
          { code: 'material-transfer', label: '材料调拨单', category: 'internal' },
        ],
      },
      {
        code: 'expense',
        label: '费用报销类',
        category: 'internal',
        children: [
          {
            code: 'expense-reimbursement',
            label: '费用报销单',
            category: 'internal',
            extFieldDefs: [
              { key: 'expenseNo', label: '报销单编号', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'expenseCategory', label: '费用类别', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'applicant', label: '报销人', dataType: 'string', isRequired: true, group: 'approval' },
              { key: 'totalAttachments', label: '总附件张数', dataType: 'number', isRequired: true, group: 'attachment' },
            ],
          },
          {
            code: 'travel-reimbursement',
            label: '差旅费报销单',
            category: 'internal',
            extFieldDefs: [
              { key: 'traveler', label: '出差人', dataType: 'string', isRequired: true, group: 'approval' },
              { key: 'destination', label: '出差地点', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'travelPeriod', label: '出差周期', dataType: 'string', isRequired: true, group: 'business' },
            ],
          },
          {
            code: 'loan-form',
            label: '借款单',
            category: 'internal',
            extFieldDefs: [
              { key: 'borrower', label: '借款人', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'loanPurpose', label: '借款用途', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'expectedRepayDate', label: '预计归还日期', dataType: 'date', isRequired: true, group: 'business' },
              { key: 'paymentMethod', label: '付款方式', dataType: 'string', isRequired: true, group: 'business' },
            ],
          },
          { code: 'entertainment-approval', label: '业务招待费审批单', category: 'internal' },
        ],
      },
      {
        code: 'payroll',
        label: '薪酬工资类',
        category: 'internal',
        children: [
          {
            code: 'payroll-sheet',
            label: '工资发放明细表',
            category: 'internal',
            extFieldDefs: [
              { key: 'payMonth', label: '发放所属月份', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'employeeName', label: '员工姓名', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'department', label: '所属部门', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'baseSalary', label: '基本工资', dataType: 'decimal', isRequired: true, group: 'amount' },
              { key: 'grossPay', label: '应发合计', dataType: 'decimal', isRequired: true, group: 'amount' },
              { key: 'netPay', label: '实发金额', dataType: 'decimal', isRequired: true, group: 'amount' },
            ],
          },
          { code: 'attendance-sheet', label: '考勤统计表', category: 'internal' },
          { code: 'bonus-sheet', label: '奖金发放表', category: 'internal' },
        ],
      },
      {
        code: 'procurement',
        label: '采购资产类',
        category: 'internal',
        children: [
          {
            code: 'purchase-order',
            label: '采购订单',
            category: 'internal',
            extFieldDefs: [
              { key: 'orderNo', label: '订单编号', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'supplierName', label: '供应商名称', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'deliveryDate', label: '交货日期', dataType: 'date', isRequired: true, group: 'business' },
              { key: 'paymentTerms', label: '付款账期', dataType: 'string', isRequired: false, group: 'business' },
            ],
          },
          {
            code: 'asset-acceptance',
            label: '固定资产验收单',
            category: 'internal',
            extFieldDefs: [
              { key: 'acceptanceNo', label: '验收单编号', dataType: 'string', isRequired: true, group: 'basic' },
              { key: 'assetName', label: '资产名称', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'assetCode', label: '资产编号', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'assetCategory', label: '资产类别', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'usefulLife', label: '预计使用年限', dataType: 'number', isRequired: true, group: 'business' },
              { key: 'usingDept', label: '使用部门', dataType: 'string', isRequired: true, group: 'entity' },
            ],
          },
          { code: 'depreciation-schedule', label: '固定资产折旧计提表', category: 'internal' },
          { code: 'asset-scrap', label: '固定资产报废审批单', category: 'internal' },
        ],
      },
      {
        code: 'finance-internal',
        label: '财务计提结转类',
        category: 'internal',
        children: [
          { code: 'cost-calculation', label: '产品成本计算单', category: 'internal' },
          { code: 'overhead-allocation', label: '制造费用分配表', category: 'internal' },
          { code: 'bad-debt-writeoff', label: '坏账核销审批单', category: 'internal' },
          { code: 'red-invoice-info', label: '红字发票信息表', category: 'internal' },
        ],
      },
      {
        code: 'cashier',
        label: '现金出纳类',
        category: 'internal',
        children: [
          { code: 'cash-payment-voucher', label: '现金支出凭单', category: 'internal' },
          { code: 'cash-receipt-voucher', label: '现金收入凭单/收款收据', category: 'internal' },
          { code: 'cash-count-sheet', label: '现金盘点表', category: 'internal' },
        ],
      },
    ],
  },

  // ── 特殊业务原始凭证 ──
  {
    code: 'special',
    label: '特殊业务类',
    category: 'special',
    children: [
      { code: 'asset-evaluation', label: '资产评估报告', category: 'special' },
      { code: 'debt-restructure', label: '债务重组协议', category: 'special' },
      { code: 'equity-transfer', label: '股权转让协议', category: 'special' },
      { code: 'donation-agreement', label: '捐赠协议/资产接收单', category: 'special' },
      { code: 'demolition-compensation', label: '拆迁补偿协议', category: 'special' },
      { code: 'penalty-settlement', label: '违约金/赔偿金结算确认单', category: 'special' },
      { code: 'property-check', label: '财产清查报告单', category: 'special' },
    ],
  },
];

/** 将类型树展平为 code → label 映射，方便查找 */
export function flattenTypeTree(tree: SourceDocTypeNode[]): Map<string, string> {
  const map = new Map<string, string>();
  function walk(nodes: SourceDocTypeNode[]) {
    for (const n of nodes) {
      map.set(n.code, n.label);
      if (n.children) walk(n.children);
    }
  }
  walk(tree);
  return map;
}

/** 获取某个类型的扩展字段定义 */
export function getExtFieldDefs(typeCode: string): SourceDocExtFieldDef[] {
  function find(nodes: SourceDocTypeNode[]): SourceDocExtFieldDef[] | null {
    for (const n of nodes) {
      if (n.code === typeCode) return n.extFieldDefs || null;
      if (n.children) {
        const found = find(n.children);
        if (found) return found;
      }
    }
    return null;
  }
  return find(SOURCE_DOC_TYPE_TREE) || [];
}
