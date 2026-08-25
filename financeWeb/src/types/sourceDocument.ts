/**
 * 原始凭证类型与元数据定义（附件级，依附于记账凭证）
 *
 * ── 规范依据（2026-08-25 对齐）──────────────────────────────────────────
 *  本文件是"原始凭证级"元数据的定义层。原始凭证（外来法定凭证 + 企业自制凭证）
 *  的字段来源与"会计档案级"元数据（DA/T 94-2022）不同，遵循如下权威依据：
 *
 *  1. DA/T 95-2022《行政事业单位一般公共预算支出财务报销电子会计凭证档案管理技术规范》
 *     —— 电子原始凭证元数据的直接行业标准：
 *        附录A = 单位内部形成（自制）电子原始凭证元数据与组织方式；
 *        附录B = 从外部接收电子原始凭证元数据与组织方式（第 6.3.4 条强制）。
 *  2. 外来法定凭证字段由主管部门官方制式固定，不可增删：
 *     - 发票类：《发票管理办法》《增值税专用发票使用规定》(国税发〔2006〕156号)、
 *       税务总局公告 2020 年第 22 号（电子专票，发票代码 12 位）、
 *       税务总局公告 2024 年第 11 号（数电票：无发票代码、无校验码，仅 20 位发票号码）。
 *     - 财政票据：《财政票据管理办法》(财政部令第 104 号)。
 *     - 银行单据：人民银行《支付结算办法》及银行票据格式。
 *     - 海关缴款书/报关单：海关总署制式。
 *     - 税收缴款书/完税证明：《税收征收管理法》、税收票证管理规定。
 *  3. 自制凭证无国家强制版式，遵循《会计基础工作规范》(财会字〔1996〕19号) 的
 *     基本要素要求（日期/金额大小写/经办签章等）+ 企业内控惯例。
 *
 * ── 设计：字段集复用 + 全量类型 ─────────────────────────────────────────
 *  - 公共字段（见 sourceDocFieldStore.SOURCE_DOC_COMMON_FIELDS）：全部类型共用。
 *  - 字段集（FIELD_SETS）：按"凭证族"抽取的可复用扩展字段模板（发票族/银行族/…），
 *    类型通过 fieldSetRefs 引用，避免逐类型重复抄写 —— 即"哪些可以共用"的答案。
 *  - 类型特有字段：extFieldDefs（字段集之外的补充）；
 *    excludeFields（从引用的字段集中剔除，如数电票去掉发票代码/校验码）；
 *    fieldOverrides（覆写字段集内某字段的属性，如必填性/标签）。
 *
 *  原始凭证不设独立档案编号，身份标识继承所属记账凭证号；
 *  归档层级：盒→卷→件(记账凭证)→附件(原始凭证)。
 */

// ── 原始凭证大类 ──
export type SourceDocCategory = 'external' | 'internal' | 'special';

// ── 原始凭证业务分类（公共字段之"分类元"） ──
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

// ── 扩展字段定义（用于元数据配置页的动态表单） ──
export interface SourceDocExtFieldDef {
  key: string;
  label: string;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'decimal';
  isRequired: boolean;
  /** 所属分组（用于详情面板分区展示） */
  group: 'basic' | 'entity' | 'business' | 'amount' | 'approval' | 'attachment';
}

// ── 字段集键 ──
export type FieldSetKey =
  | 'invoice'       // 发票族
  | 'bank'          // 银行族
  | 'fiscal'        // 财政票据族
  | 'taxPayment'    // 税收缴款族
  | 'customs'       // 海关族
  | 'passenger'     // 客运票据族
  | 'inventory'     // 存货族
  | 'payroll'       // 薪酬族
  | 'asset'         // 资产族
  | 'expense'       // 费用报销族
  | 'settlement'    // 结算/往来族
  | 'agreement';    // 协议/特殊业务族

/** 字段集：可复用的扩展字段模板 + 规范依据 */
export interface FieldSet {
  key: FieldSetKey;
  label: string;
  /** 规范依据（该族字段的法定/行业来源） */
  basis: string;
  fields: SourceDocExtFieldDef[];
}

// ── 可配置的原始凭证类型树节点 ──
export interface SourceDocTypeNode {
  /** 类型编码（唯一标识，一经使用不得改名——data.ts / 已落库节点依赖） */
  code: string;
  /** 类型名称 */
  label: string;
  /** 所属大类 */
  category: SourceDocCategory;
  /** 子类型 */
  children?: SourceDocTypeNode[];
  /** 引用的共享字段集（按顺序展开） */
  fieldSetRefs?: FieldSetKey[];
  /** 该类型的扩展字段定义（字段集之外的类型特有补充） */
  extFieldDefs?: SourceDocExtFieldDef[];
  /** 从引用字段集中剔除的字段 key（如数电票去掉发票代码/校验码） */
  excludeFields?: string[];
  /** 覆写引用字段集内某字段的属性（如标签/必填性） */
  fieldOverrides?: Record<string, Partial<SourceDocExtFieldDef>>;
  /** 规范依据（该类型字段来源的法规/标准） */
  standardBasis?: string;
}

// ── 原始凭证实体（附件级，依附于记账凭证） ──
export interface SourceDocument {
  /** 唯一标识 */
  id: string;

  // ── 公共字段 ──

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

// ══════════════════════════════════════════════════════════════════════
// 字段集定义（可复用的扩展字段模板）——"哪些可以共用"的答案
// ══════════════════════════════════════════════════════════════════════

export const FIELD_SETS: Record<FieldSetKey, FieldSet> = {
  invoice: {
    key: 'invoice',
    label: '发票族字段集',
    basis: '《发票管理办法》《增值税专用发票使用规定》(国税发〔2006〕156号)；税务总局公告2020年第22号(电子专票12位代码)、2024年第11号(数电票仅20位号码、无代码无校验码)。票面要素为税局强制，不可增删。',
    fields: [
      { key: 'invoiceCode', label: '发票代码', dataType: 'string', isRequired: true, group: 'basic' },
      { key: 'invoiceNo', label: '发票号码', dataType: 'string', isRequired: true, group: 'basic' },
      { key: 'checkCode', label: '校验码', dataType: 'string', isRequired: true, group: 'basic' },
      { key: 'machineNo', label: '税控机器编号', dataType: 'string', isRequired: false, group: 'basic' },
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
  bank: {
    key: 'bank',
    label: '银行单据族字段集',
    basis: '人民银行《支付结算办法》、银行票据格式规范。收付双方 + 账号 + 流水号为法定要素。',
    fields: [
      { key: 'bankName', label: '银行机构/网点名称', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'bankSerialNo', label: '银行流水号/凭证号', dataType: 'string', isRequired: true, group: 'basic' },
      { key: 'payerName', label: '付款方名称', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'payerAccount', label: '付款方银行账号', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'payeeName', label: '收款方名称', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'payeeAccount', label: '收款方银行账号', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'paymentPurpose', label: '用途/款项摘要', dataType: 'string', isRequired: true, group: 'business' },
    ],
  },
  fiscal: {
    key: 'fiscal',
    label: '财政票据族字段集',
    basis: '《财政票据管理办法》(财政部令第104号)。财政监制标识、票据编号、收费项目为法定要素。',
    fields: [
      { key: 'receiptNo', label: '票据编号', dataType: 'string', isRequired: true, group: 'basic' },
      { key: 'payerName', label: '交款人/缴款单位', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'chargeItem', label: '收费项目', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'chargeStandard', label: '收费标准', dataType: 'string', isRequired: false, group: 'business' },
      { key: 'collectUnit', label: '收费单位', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'fiscalMark', label: '财政监制标识', dataType: 'string', isRequired: false, group: 'basic' },
    ],
  },
  taxPayment: {
    key: 'taxPayment',
    label: '税收缴款族字段集',
    basis: '《税收征收管理法》、税收票证管理规定。纳税人 + 税种 + 所属期 + 应纳税额为法定要素。',
    fields: [
      { key: 'taxCertNo', label: '税票号码/凭证编号', dataType: 'string', isRequired: true, group: 'basic' },
      { key: 'taxpayerName', label: '纳税人名称', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'taxpayerTaxId', label: '纳税人识别号', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'taxPeriod', label: '税款所属期', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'taxType', label: '税种', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'taxAuthority', label: '主管税务机关', dataType: 'string', isRequired: false, group: 'entity' },
    ],
  },
  customs: {
    key: 'customs',
    label: '海关族字段集',
    basis: '海关总署制式（进口增值税/关税/消费税缴款书、报关单）。缴款书编号 + 完税价格 + 税额为法定要素。',
    fields: [
      { key: 'customsNo', label: '缴款书/报关单编号', dataType: 'string', isRequired: true, group: 'basic' },
      { key: 'importerName', label: '进出口企业名称', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'importerTaxId', label: '企业税号/统一社会信用代码', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'goodsName', label: '货物名称', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'dutiableValue', label: '完税价格', dataType: 'decimal', isRequired: true, group: 'amount' },
      { key: 'customsTax', label: '关税/增值税/消费税税额', dataType: 'decimal', isRequired: true, group: 'amount' },
      { key: 'customsSeal', label: '海关签章', dataType: 'string', isRequired: false, group: 'approval' },
    ],
  },
  passenger: {
    key: 'passenger',
    label: '客运票据族字段集',
    basis: '铁路/民航/公路客运票据制式；旅客运输服务进项抵扣需出行人 + 起止站点 + 票价。',
    fields: [
      { key: 'traveler', label: '出行人/旅客姓名', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'departure', label: '出发站/起点', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'arrival', label: '到达站/终点', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'travelDate', label: '出行日期', dataType: 'date', isRequired: true, group: 'basic' },
      { key: 'carrierName', label: '承运公司/运输企业', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'ticketNo', label: '票号/车次/航班号', dataType: 'string', isRequired: false, group: 'basic' },
    ],
  },
  inventory: {
    key: 'inventory',
    label: '存货族字段集',
    basis: '自制凭证，无国家强制版式；《会计基础工作规范》基本要素 + 企业仓储内控惯例。',
    fields: [
      { key: 'materialCode', label: '物料/存货编码', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'materialName', label: '物料/存货名称', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'spec', label: '规格型号', dataType: 'string', isRequired: false, group: 'business' },
      { key: 'unit', label: '计量单位', dataType: 'string', isRequired: false, group: 'business' },
      { key: 'quantity', label: '数量', dataType: 'number', isRequired: true, group: 'business' },
      { key: 'warehouseKeeper', label: '仓库保管员/经办人', dataType: 'string', isRequired: true, group: 'approval' },
      { key: 'dept', label: '领用/经办部门', dataType: 'string', isRequired: true, group: 'entity' },
    ],
  },
  payroll: {
    key: 'payroll',
    label: '薪酬族字段集',
    basis: '自制凭证；《会计基础工作规范》基本要素 + 薪酬发放内控（逐人明细 + 审批链）。',
    fields: [
      { key: 'payMonth', label: '发放所属月份/期间', dataType: 'string', isRequired: true, group: 'basic' },
      { key: 'employeeName', label: '员工姓名', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'department', label: '所属部门', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'baseSalary', label: '基本工资/基数', dataType: 'decimal', isRequired: false, group: 'amount' },
      { key: 'grossPay', label: '应发合计', dataType: 'decimal', isRequired: true, group: 'amount' },
      { key: 'deductions', label: '代扣合计(社保/公积金/个税)', dataType: 'decimal', isRequired: false, group: 'amount' },
      { key: 'netPay', label: '实发金额', dataType: 'decimal', isRequired: true, group: 'amount' },
    ],
  },
  asset: {
    key: 'asset',
    label: '资产族字段集',
    basis: '自制凭证；《企业会计准则第4号——固定资产》《企业会计准则第6号——无形资产》+ 资产内控。',
    fields: [
      { key: 'assetCode', label: '资产编号', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'assetName', label: '资产名称', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'assetCategory', label: '资产类别', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'originalValue', label: '资产原值', dataType: 'decimal', isRequired: false, group: 'amount' },
      { key: 'usingDept', label: '使用/归口部门', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'usefulLife', label: '预计使用年限/摊销期', dataType: 'number', isRequired: false, group: 'business' },
      { key: 'brandModel', label: '品牌型号/规格', dataType: 'string', isRequired: false, group: 'business' },
    ],
  },
  expense: {
    key: 'expense',
    label: '费用报销族字段集',
    basis: '自制凭证；《会计基础工作规范》+ 报销审批内控（报销人→主管→财务→分管领导）。差旅参考差旅费管理办法。',
    fields: [
      { key: 'expenseCategory', label: '费用类别', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'applicant', label: '报销人/申请人', dataType: 'string', isRequired: true, group: 'approval' },
      { key: 'totalAttachments', label: '附件张数合计', dataType: 'number', isRequired: true, group: 'attachment' },
    ],
  },
  settlement: {
    key: 'settlement',
    label: '结算/往来族字段集',
    basis: '往来结算单据行业惯例；双方确认 + 结算期间 + 金额为核心要素。',
    fields: [
      { key: 'settleNo', label: '结算单/对账单编号', dataType: 'string', isRequired: true, group: 'basic' },
      { key: 'counterpartyUnit', label: '往来单位', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'settlePeriod', label: '结算/对账期间', dataType: 'string', isRequired: true, group: 'business' },
      { key: 'settleAmount', label: '结算/确认金额', dataType: 'decimal', isRequired: true, group: 'amount' },
      { key: 'confirmSeal', label: '双方签字/盖章确认', dataType: 'string', isRequired: false, group: 'approval' },
    ],
  },
  agreement: {
    key: 'agreement',
    label: '协议/特殊业务族字段集',
    basis: '特殊业务凭证；协议/评估/鉴定类文件需编号 + 相关方 + 基准日 + 审批意见。',
    fields: [
      { key: 'agreementNo', label: '协议/报告编号', dataType: 'string', isRequired: true, group: 'basic' },
      { key: 'agreementParties', label: '协议双方/相关方', dataType: 'string', isRequired: true, group: 'entity' },
      { key: 'agreementDate', label: '协议/评估基准日期', dataType: 'date', isRequired: true, group: 'basic' },
      { key: 'agreementAmount', label: '涉及金额/评估值', dataType: 'decimal', isRequired: false, group: 'amount' },
      { key: 'approvalChain', label: '审批/鉴定意见', dataType: 'string', isRequired: false, group: 'approval' },
    ],
  },
};

// ══════════════════════════════════════════════════════════════════════
// 原始凭证类型树（全量，覆盖《原始凭证完整大全》目录）
// 说明：类型编码（code）一经使用不得改名；新增类型追加，勿删改既有 code。
// ══════════════════════════════════════════════════════════════════════

export const SOURCE_DOC_TYPE_TREE: SourceDocTypeNode[] = [
  // ═══════════ 一、外来原始凭证 ═══════════
  {
    code: 'external',
    label: '外来原始凭证',
    category: 'external',
    standardBasis: '外部单位开具，带外部公章/税局监制章；缺失则不具备入账效力。',
    children: [
      // ── （一）发票类 ──
      {
        code: 'invoice',
        label: '发票类',
        category: 'external',
        standardBasis: '《发票管理办法》及税务总局相关规定。',
        children: [
          { code: 'vat-special-invoice', label: '增值税专用发票', category: 'external', fieldSetRefs: ['invoice'],
            standardBasis: '国税发〔2006〕156号《增值税专用发票使用规定》；购销双方名称+税号+地址电话+开户行账号全部必填。' },
          { code: 'vat-normal-invoice', label: '增值税普通发票', category: 'external', fieldSetRefs: ['invoice'],
            fieldOverrides: { buyerTaxId: { isRequired: false } },
            standardBasis: '普通发票；购买方纳税人识别号可选（个人消费者可无）。' },
          { code: 'vat-e-special-invoice', label: '增值税电子专用发票', category: 'external', fieldSetRefs: ['invoice'],
            standardBasis: '税务总局公告2020年第22号：发票代码12位、发票号码8位；电子签名代替发票专用章。' },
          { code: 'vat-e-normal-invoice', label: '增值税电子普通发票', category: 'external', fieldSetRefs: ['invoice'],
            fieldOverrides: { buyerTaxId: { isRequired: false } },
            standardBasis: '税务总局公告2015年第84号；电子签名代替发票专用章。' },
          { code: 'vat-electronic-invoice', label: '全面数字化电子发票（数电票）', category: 'external', fieldSetRefs: ['invoice'],
            excludeFields: ['invoiceCode', 'checkCode', 'machineNo'],
            fieldOverrides: { invoiceNo: { label: '发票号码（20位数电票号）' } },
            standardBasis: '税务总局公告2024年第11号：数电票无发票代码、无校验码，仅20位发票号码+动态二维码；开票人系统自动标注。' },
          { code: 'vehicle-invoice', label: '机动车销售统一发票', category: 'external', fieldSetRefs: ['invoice'],
            extFieldDefs: [
              { key: 'vin', label: '车辆识别代号/车架号', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'vehicleType', label: '车辆类型/厂牌型号', dataType: 'string', isRequired: false, group: 'business' },
            ],
            standardBasis: '机动车销售统一发票票样（税局监制）；含车架号等机动车特有要素。' },
          { code: 'used-vehicle-invoice', label: '二手车销售统一发票', category: 'external', fieldSetRefs: ['invoice'],
            standardBasis: '二手车流通管理办法；二手车交易发票票样。' },
          { code: 'transport-invoice', label: '货物运输业增值税专用发票', category: 'external', fieldSetRefs: ['invoice'],
            extFieldDefs: [
              { key: 'routeFrom', label: '起运地', dataType: 'string', isRequired: false, group: 'business' },
              { key: 'routeTo', label: '到达地', dataType: 'string', isRequired: false, group: 'business' },
              { key: 'vehicleNo', label: '车种车号', dataType: 'string', isRequired: false, group: 'business' },
            ],
            standardBasis: '货物运输业营改增发票票样；含运输线路/车种要素。' },
          { code: 'generic-invoice', label: '通用机打发票/通用定额发票', category: 'external', fieldSetRefs: ['invoice'],
            excludeFields: ['checkCode', 'machineNo', 'taxRate', 'taxAmount', 'amountExclTax'],
            fieldOverrides: { buyerTaxId: { isRequired: false }, sellerTaxId: { isRequired: false } },
            standardBasis: '通用机打/定额（手撕票）发票；无税额明细，票面要素简化。' },
          { code: 'passenger-train-ticket', label: '火车票/高铁票', category: 'external', fieldSetRefs: ['passenger'],
            standardBasis: '铁路客票；旅客运输进项抵扣需出行人+起止站+票价。' },
          { code: 'passenger-flight-itinerary', label: '航空运输电子客票行程单', category: 'external', fieldSetRefs: ['passenger'],
            standardBasis: '民航行程单（税务监制）；含票价+民航发展基金+燃油附加费。' },
          { code: 'passenger-bus-ticket', label: '汽车客票', category: 'external', fieldSetRefs: ['passenger'],
            standardBasis: '公路客运票据；注明旅客身份信息方可抵扣。' },
          { code: 'taxi-invoice', label: '出租车发票', category: 'external', fieldSetRefs: ['passenger'],
            excludeFields: ['departure', 'arrival', 'traveler'],
            fieldOverrides: { carrierName: { label: '出租车公司' } },
            standardBasis: '出租车机打发票；发票代码+号码+金额+日期为核心。' },
          { code: 'ridehailing-invoice', label: '网约车电子发票', category: 'external', fieldSetRefs: ['invoice'],
            fieldOverrides: { buyerTaxId: { isRequired: false } },
            standardBasis: '网约车平台开具的电子普通发票。' },
          { code: 'toll-invoice', label: '过路费/通行费电子票据', category: 'external', fieldSetRefs: ['invoice'],
            excludeFields: ['checkCode', 'machineNo'],
            fieldOverrides: { buyerTaxId: { isRequired: false } },
            standardBasis: '通行费电子发票（征税/不征税）；纸质通行费发票按政策抵扣。' },
          { code: 'service-invoice', label: '服务业发票（住宿/餐饮/广告/租赁/服务）', category: 'external', fieldSetRefs: ['invoice'],
            fieldOverrides: { buyerTaxId: { isRequired: false } },
            standardBasis: '按服务内容开具的增值税普通/专用发票；与专票/普票同构，业务分类按费用类别区分。' },
          { code: 'agricultural-invoice', label: '农产品销售发票/农产品收购发票', category: 'external', fieldSetRefs: ['invoice'],
            fieldOverrides: { buyerTaxId: { isRequired: false }, sellerTaxId: { isRequired: false } },
            standardBasis: '农业生产者销售自产农产品发票/收购发票；可按买价计算抵扣进项。' },
          { code: 'customs-vat-payment', label: '海关进口增值税专用缴款书', category: 'external', fieldSetRefs: ['customs'],
            standardBasis: '海关总署制式；进口环节增值税抵扣凭证。' },
          { code: 'customs-tariff-payment', label: '关税缴款书', category: 'external', fieldSetRefs: ['customs'],
            standardBasis: '海关总署制式；关税完税凭证。' },
          { code: 'customs-consumption-payment', label: '消费税缴款书', category: 'external', fieldSetRefs: ['customs'],
            standardBasis: '海关总署制式；进口环节消费税完税凭证。' },
          { code: 'export-declaration', label: '出口货物报关单（退税用）', category: 'external', fieldSetRefs: ['customs'],
            standardBasis: '海关出口货物报关单；出口退税联。' },
        ],
      },
      // ── （二）财政票据类 ──
      {
        code: 'fiscal',
        label: '财政票据类',
        category: 'external',
        standardBasis: '《财政票据管理办法》(财政部令第104号)。',
        children: [
          { code: 'admin-fee-receipt', label: '行政事业性收费票据', category: 'external', fieldSetRefs: ['fiscal'] },
          { code: 'gov-fund-receipt', label: '政府性基金票据', category: 'external', fieldSetRefs: ['fiscal'] },
          { code: 'donation-receipt', label: '公益事业捐赠票据', category: 'external', fieldSetRefs: ['fiscal'] },
          { code: 'medical-receipt', label: '医疗收费票据（门诊/住院）', category: 'external', fieldSetRefs: ['fiscal'] },
          { code: 'non-tax-receipt', label: '非税收入一般缴款书', category: 'external', fieldSetRefs: ['fiscal'] },
          { code: 'land-transfer-receipt', label: '土地出让金票据/不动产登记收费票据', category: 'external', fieldSetRefs: ['fiscal'] },
        ],
      },
      // ── （三）银行类外来单据 ──
      {
        code: 'bank',
        label: '银行单据类',
        category: 'external',
        standardBasis: '人民银行《支付结算办法》及银行票据格式。',
        children: [
          { code: 'bank-deposit-slip', label: '银行进账单', category: 'external', fieldSetRefs: ['bank'] },
          { code: 'check-stub', label: '转账支票存根', category: 'external', fieldSetRefs: ['bank'] },
          { code: 'cash-deposit-receipt', label: '现金缴款单回执', category: 'external', fieldSetRefs: ['bank'] },
          { code: 'bank-fee-receipt', label: '银行手续费/账户管理费回单', category: 'external', fieldSetRefs: ['bank'] },
          { code: 'loan-interest-receipt', label: '贷款利息回单/贷款放款凭证', category: 'external', fieldSetRefs: ['bank'] },
          { code: 'bank-receipt', label: '银行回单/电汇凭证', category: 'external', fieldSetRefs: ['bank'] },
          { code: 'bank-remittance', label: '汇兑凭证', category: 'external', fieldSetRefs: ['bank'] },
          { code: 'bank-collection', label: '托收承付凭证/委托收款凭证', category: 'external', fieldSetRefs: ['bank'] },
          { code: 'bank-statement', label: '银行对账单', category: 'external', fieldSetRefs: ['bank'],
            fieldOverrides: { payerName: { label: '账户主体/户名' }, payeeName: { isRequired: false } },
            standardBasis: '银行对账单（余额对账）；非记账凭证附件时作为核对依据。' },
          { code: 'acceptance-bill', label: '信用证单据/银行承兑汇票/商业承兑汇票', category: 'external', fieldSetRefs: ['bank'] },
          { code: 'forex-water', label: '外汇结汇/购汇水单', category: 'external', fieldSetRefs: ['bank'] },
        ],
      },
      // ── （四）外部往来结算单据 ──
      {
        code: 'external-trade',
        label: '外部往来结算类',
        category: 'external',
        standardBasis: '外部往来结算单据；涉及完税/缴费的另有主管部门制式。',
        children: [
          { code: 'supplier-delivery', label: '供应商送货单/销货方出库单', category: 'external', fieldSetRefs: ['settlement'] },
          { code: 'logistics-waybill', label: '物流运单/货运清单/快递运单', category: 'external', fieldSetRefs: ['settlement'] },
          { code: 'insurance-policy', label: '保险公司保单/保费发票/理赔结算单', category: 'external', fieldSetRefs: ['settlement'] },
          { code: 'legal-audit-invoice', label: '公证处/律所服务费单据、审计评估费发票', category: 'external', fieldSetRefs: ['invoice'],
            fieldOverrides: { buyerTaxId: { isRequired: false } } },
          { code: 'utility-bill', label: '供电/供水/燃气缴费单据', category: 'external', fieldSetRefs: ['settlement'] },
          { code: 'lease-settlement', label: '租赁公司租金结算单', category: 'external', fieldSetRefs: ['settlement'] },
          { code: 'third-party-inspection', label: '第三方检测报告/验收单', category: 'external', fieldSetRefs: ['settlement'] },
          { code: 'litigation-receipt', label: '法院诉讼费票据/执行款收据', category: 'external', fieldSetRefs: ['settlement'] },
          { code: 'social-insurance-notice', label: '社保/公积金缴费通知单/缴费凭证', category: 'external', fieldSetRefs: ['settlement'],
            extFieldDefs: [
              { key: 'insuranceType', label: '险种/公积金类型', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'unitPart', label: '单位缴费部分', dataType: 'decimal', isRequired: false, group: 'amount' },
              { key: 'personalPart', label: '个人缴费部分', dataType: 'decimal', isRequired: false, group: 'amount' },
            ],
            standardBasis: '社保/公积金经办机构制式；五险种逐行明细。' },
          { code: 'tax-payment-cert', label: '税务局完税证明/税收缴款书/印花税完税凭证', category: 'external', fieldSetRefs: ['taxPayment'] },
        ],
      },
    ],
  },

  // ═══════════ 二、自制原始凭证 ═══════════
  {
    code: 'internal',
    label: '自制原始凭证',
    category: 'internal',
    standardBasis: '企业内部填制，内部签字审批；《会计基础工作规范》基本要素 + 内控惯例。',
    children: [
      // ── （一）存货出入库类 ──
      {
        code: 'inventory',
        label: '存货出入库类',
        category: 'internal',
        children: [
          { code: 'material-requisition', label: '领料单', category: 'internal', fieldSetRefs: ['inventory'],
            extFieldDefs: [
              { key: 'plannedQty', label: '计划领用数量', dataType: 'number', isRequired: true, group: 'business' },
              { key: 'actualQty', label: '实际发放数量', dataType: 'number', isRequired: true, group: 'business' },
            ] },
          { code: 'quota-requisition', label: '限额领料单', category: 'internal', fieldSetRefs: ['inventory'] },
          { code: 'material-return', label: '退料单', category: 'internal', fieldSetRefs: ['inventory'] },
          { code: 'warehouse-receipt', label: '原材料/外购入库单', category: 'internal', fieldSetRefs: ['inventory'] },
          { code: 'finished-inbound', label: '产成品/半成品入库单', category: 'internal', fieldSetRefs: ['inventory'] },
          { code: 'delivery-note', label: '销售出库单/发货单/提货单', category: 'internal', fieldSetRefs: ['inventory'],
            extFieldDefs: [
              { key: 'unitPrice', label: '单价', dataType: 'decimal', isRequired: false, group: 'amount' },
              { key: 'relatedOrderNo', label: '对应订单/合同号', dataType: 'string', isRequired: false, group: 'basic' },
            ] },
          { code: 'entrusted-processing', label: '委托加工物资出库单/入库单', category: 'internal', fieldSetRefs: ['inventory'] },
          { code: 'material-transfer', label: '材料调拨单', category: 'internal', fieldSetRefs: ['inventory'] },
          { code: 'inventory-count', label: '存货盘点表/盘盈盘亏报告单', category: 'internal', fieldSetRefs: ['inventory'],
            extFieldDefs: [
              { key: 'bookQty', label: '账面数量', dataType: 'number', isRequired: true, group: 'business' },
              { key: 'actualCountQty', label: '实盘数量', dataType: 'number', isRequired: true, group: 'business' },
              { key: 'diffReason', label: '差异原因', dataType: 'string', isRequired: false, group: 'business' },
            ] },
          { code: 'scrap-inbound', label: '废品入库单/废料出售出库单', category: 'internal', fieldSetRefs: ['inventory'] },
        ],
      },
      // ── （二）费用报销支出类 ──
      {
        code: 'expense',
        label: '费用报销支出类',
        category: 'internal',
        children: [
          { code: 'expense-reimbursement', label: '费用报销单', category: 'internal', fieldSetRefs: ['expense'] },
          { code: 'travel-reimbursement', label: '差旅费报销单', category: 'internal', fieldSetRefs: ['expense'],
            extFieldDefs: [
              { key: 'destination', label: '出差地点', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'travelPeriod', label: '出差周期', dataType: 'string', isRequired: true, group: 'business' },
            ] },
          { code: 'loan-form', label: '借款单', category: 'internal', fieldSetRefs: ['expense'],
            extFieldDefs: [
              { key: 'borrower', label: '借款人', dataType: 'string', isRequired: true, group: 'entity' },
              { key: 'loanPurpose', label: '借款用途', dataType: 'string', isRequired: true, group: 'business' },
              { key: 'expectedRepayDate', label: '预计归还日期', dataType: 'date', isRequired: true, group: 'business' },
              { key: 'paymentMethod', label: '付款方式', dataType: 'string', isRequired: true, group: 'business' },
            ] },
          { code: 'repayment-receipt', label: '还款收据', category: 'internal', fieldSetRefs: ['expense'] },
          { code: 'petty-cash', label: '备用金申领单/核销单', category: 'internal', fieldSetRefs: ['expense'] },
          { code: 'office-supplies', label: '办公用品领用登记单', category: 'internal', fieldSetRefs: ['expense'] },
          { code: 'entertainment-approval', label: '业务招待费审批单', category: 'internal', fieldSetRefs: ['expense'] },
          { code: 'ad-promo-approval', label: '广告费/宣传费支出审批单', category: 'internal', fieldSetRefs: ['expense'] },
          { code: 'repair-approval', label: '维修费用审批单/设备维修结算单', category: 'internal', fieldSetRefs: ['expense'] },
        ],
      },
      // ── （三）薪酬工资类 ──
      {
        code: 'payroll',
        label: '薪酬工资类',
        category: 'internal',
        children: [
          { code: 'payroll-sheet', label: '工资表/工资发放明细表', category: 'internal', fieldSetRefs: ['payroll'] },
          { code: 'attendance-sheet', label: '考勤表/加班统计表/请假单', category: 'internal', fieldSetRefs: ['payroll'],
            fieldOverrides: { baseSalary: { isRequired: false }, grossPay: { isRequired: false }, netPay: { isRequired: false } } },
          { code: 'social-insurance-accrual', label: '社保公积金计提表/分摊表', category: 'internal', fieldSetRefs: ['payroll'] },
          { code: 'welfare-list', label: '福利费发放清单', category: 'internal', fieldSetRefs: ['payroll'] },
          { code: 'bonus-sheet', label: '奖金发放表/绩效核算表', category: 'internal', fieldSetRefs: ['payroll'] },
          { code: 'tax-withholding', label: '代扣个税明细表', category: 'internal', fieldSetRefs: ['payroll'] },
          { code: 'severance-settlement', label: '离职补偿结算单', category: 'internal', fieldSetRefs: ['payroll'] },
        ],
      },
      // ── （四）收款销售自制单据 ──
      {
        code: 'sales-collection',
        label: '收款销售自制单据',
        category: 'internal',
        children: [
          { code: 'cash-receipt', label: '收款收据', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'sales-quotation', label: '销售报价单/销售合同', category: 'internal', fieldSetRefs: ['agreement'] },
          { code: 'sales-settlement', label: '销售结算单/销售汇总表', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'daily-cash-report', label: '现金收款日报表', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'ar-reconciliation', label: '应收款对账确认单', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'advance-receipt', label: '预收款/定金收款单', category: 'internal', fieldSetRefs: ['settlement'] },
        ],
      },
      // ── （五）采购资产类内部单据 ──
      {
        code: 'procurement',
        label: '采购资产类',
        category: 'internal',
        children: [
          { code: 'purchase-order', label: '采购申请单/采购订单', category: 'internal', fieldSetRefs: ['asset', 'settlement'],
            standardBasis: '采购订单；含双方信息+明细行+合同条款。' },
          { code: 'goods-acceptance', label: '物资验收单/设备验收单', category: 'internal', fieldSetRefs: ['asset'] },
          { code: 'asset-acceptance', label: '固定资产入库单/验收单', category: 'internal', fieldSetRefs: ['asset'],
            extFieldDefs: [
              { key: 'invoiceRef', label: '对应发票号码', dataType: 'string', isRequired: false, group: 'basic' },
              { key: 'contractRef', label: '合同编号', dataType: 'string', isRequired: false, group: 'basic' },
              { key: 'residualRate', label: '残值率', dataType: 'decimal', isRequired: false, group: 'amount' },
            ] },
          { code: 'asset-transfer', label: '固定资产调拨单', category: 'internal', fieldSetRefs: ['asset'] },
          { code: 'asset-scrap', label: '固定资产报废审批单', category: 'internal', fieldSetRefs: ['asset'],
            extFieldDefs: [
              { key: 'accumDepreciation', label: '累计折旧', dataType: 'decimal', isRequired: false, group: 'amount' },
              { key: 'disposalIncome', label: '处置收入', dataType: 'decimal', isRequired: false, group: 'amount' },
            ] },
          { code: 'depreciation-schedule', label: '固定资产折旧计提表', category: 'internal', fieldSetRefs: ['asset'] },
          { code: 'intangible-amortization', label: '无形资产摊销计算表', category: 'internal', fieldSetRefs: ['asset'] },
          { code: 'construction-settlement', label: '在建工程结算单/工程进度确认单', category: 'internal', fieldSetRefs: ['asset'] },
        ],
      },
      // ── （六）财务计提结转内部结算 ──
      {
        code: 'finance-internal',
        label: '财务计提结转类',
        category: 'internal',
        children: [
          { code: 'cost-calculation', label: '材料成本计算单/产品成本计算单', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'overhead-allocation', label: '制造费用分配表', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'deferred-amortization', label: '待摊费用摊销表', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'accrued-expense', label: '预提费用计提表', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'internal-settlement', label: '内部往来结算单', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'bad-debt-provision', label: '坏账准备计提表', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'tax-accrual', label: '税金计提表', category: 'internal', fieldSetRefs: ['taxPayment'] },
        ],
      },
      // ── （七）现金出纳类自制凭证 ──
      {
        code: 'cashier',
        label: '现金出纳类',
        category: 'internal',
        children: [
          { code: 'cash-payment-voucher', label: '现金支出凭单', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'cash-receipt-voucher', label: '现金收入凭单', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'cash-count-sheet', label: '现金盘点表', category: 'internal', fieldSetRefs: ['settlement'] },
          { code: 'check-register', label: '支票领用登记簿/支票存根', category: 'internal', fieldSetRefs: ['bank'] },
        ],
      },
    ],
  },

  // ═══════════ 三、特殊业务原始凭证 ═══════════
  {
    code: 'special',
    label: '特殊业务类',
    category: 'special',
    standardBasis: '专项、少见但合规的特殊业务凭证。',
    children: [
      { code: 'property-check', label: '财产清查报告单', category: 'special', fieldSetRefs: ['agreement'] },
      { code: 'debt-restructure', label: '债务重组协议/债权债务抵消协议', category: 'special', fieldSetRefs: ['agreement'] },
      { code: 'equity-transfer', label: '投资协议/股权转让协议/股权交割单', category: 'special', fieldSetRefs: ['agreement'] },
      { code: 'asset-evaluation', label: '资产评估报告', category: 'special', fieldSetRefs: ['agreement'] },
      { code: 'donation-agreement', label: '捐赠协议/资产接收单', category: 'special', fieldSetRefs: ['agreement'] },
      { code: 'demolition-compensation', label: '拆迁补偿协议/补偿收款单据', category: 'special', fieldSetRefs: ['agreement'] },
      { code: 'penalty-settlement', label: '违约金/赔偿金结算确认单', category: 'special', fieldSetRefs: ['settlement'] },
      { code: 'bad-debt-writeoff', label: '坏账核销审批文件', category: 'special', fieldSetRefs: ['agreement'] },
      { code: 'loss-compensation', label: '亏损弥补专项资料', category: 'special', fieldSetRefs: ['agreement'] },
      { code: 'union-fee', label: '工会经费计提上缴单据', category: 'special', fieldSetRefs: ['settlement'] },
      { code: 'disability-fund', label: '残疾人保障金缴费单据', category: 'special', fieldSetRefs: ['settlement'] },
      { code: 'red-invoice-info', label: '红字发票信息表', category: 'special', fieldSetRefs: ['invoice'],
        excludeFields: ['checkCode', 'machineNo', 'taxRate', 'taxAmount', 'amountExclTax'],
        extFieldDefs: [
          { key: 'blueInvoiceRef', label: '对应蓝字发票代码号码', dataType: 'string', isRequired: true, group: 'basic' },
          { key: 'redReason', label: '红冲原因', dataType: 'string', isRequired: true, group: 'business' },
        ],
        standardBasis: '红字发票信息表；含对应蓝字发票+红冲原因+税局审核栏。' },
      { code: 'discount-allowance', label: '折扣折让确认单', category: 'special', fieldSetRefs: ['settlement'] },
      { code: 'inventory-damage', label: '存货毁损鉴定报告/保险理赔核对单', category: 'special', fieldSetRefs: ['agreement'] },
    ],
  },
];

// ══════════════════════════════════════════════════════════════════════
// 辅助函数
// ══════════════════════════════════════════════════════════════════════

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

/** 在树中查找某类型节点 */
export function findTypeNode(typeCode: string): SourceDocTypeNode | null {
  function find(nodes: SourceDocTypeNode[]): SourceDocTypeNode | null {
    for (const n of nodes) {
      if (n.code === typeCode) return n;
      if (n.children) {
        const found = find(n.children);
        if (found) return found;
      }
    }
    return null;
  }
  return find(SOURCE_DOC_TYPE_TREE);
}

/**
 * 获取某个类型的扩展字段定义。
 * 解析顺序：引用的字段集（fieldSetRefs）展开 → 追加类型特有字段（extFieldDefs）
 *   → 剔除 excludeFields → 应用 fieldOverrides。
 * 保持既有签名不变，供配置面板/详情面板/检索页复用。
 */
export function getExtFieldDefs(typeCode: string): SourceDocExtFieldDef[] {
  const node = findTypeNode(typeCode);
  if (!node) return [];

  const out: SourceDocExtFieldDef[] = [];
  const seen = new Set<string>();

  // 1. 展开引用字段集
  for (const ref of node.fieldSetRefs || []) {
    const fs = FIELD_SETS[ref];
    if (!fs) continue;
    for (const f of fs.fields) {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        out.push({ ...f });
      }
    }
  }

  // 2. 追加类型特有字段
  for (const f of node.extFieldDefs || []) {
    if (!seen.has(f.key)) {
      seen.add(f.key);
      out.push({ ...f });
    }
  }

  // 3. 剔除（如数电票去掉发票代码/校验码）
  let result = out;
  if (node.excludeFields && node.excludeFields.length > 0) {
    const excl = new Set(node.excludeFields);
    result = result.filter(f => !excl.has(f.key));
  }

  // 4. 覆写（修改字段集内某字段的属性）
  if (node.fieldOverrides) {
    result = result.map(f =>
      node.fieldOverrides![f.key] ? { ...f, ...node.fieldOverrides![f.key] } : f
    );
  }

  return result;
}

/** 获取某类型的规范依据（类型自身 → 向上取父节点 → 大类兜底） */
export function getStandardBasis(typeCode: string): string {
  const node = findTypeNode(typeCode);
  if (!node) return '';
  if (node.standardBasis) return node.standardBasis;
  // 向上找父节点的依据
  function findPath(nodes: SourceDocTypeNode[], trail: SourceDocTypeNode[]): SourceDocTypeNode[] | null {
    for (const n of nodes) {
      const next = [...trail, n];
      if (n.code === typeCode) return next;
      if (n.children) {
        const found = findPath(n.children, next);
        if (found) return found;
      }
    }
    return null;
  }
  const path = findPath(SOURCE_DOC_TYPE_TREE, []);
  if (path) {
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i].standardBasis) return path[i].standardBasis!;
    }
  }
  return '';
}

/** 统计叶子类型总数（用于校验"覆盖 90 多种"） */
export function countLeafTypes(): number {
  let count = 0;
  function walk(nodes: SourceDocTypeNode[]) {
    for (const n of nodes) {
      if (n.children && n.children.length > 0) walk(n.children);
      else count++;
    }
  }
  walk(SOURCE_DOC_TYPE_TREE);
  return count;
}
