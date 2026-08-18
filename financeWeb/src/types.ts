/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ComponentFile {
  name: string;
  type: string;
  size: string;
  contentType: 'xml' | 'ofd' | 'pdf' | 'png' | 'unknown';
  hash: string;
  signatureVerified: boolean;
  signer?: string;
}

export interface VerificationCheck {
  real: boolean;       // 真实性 (Authenticity) - 数字签名验签
  complete: boolean;   // 完整性 (Integrity) - 哈希值及篡改检测
  usable: boolean;     // 可用性 (Usability) - OFD/PDF/XML标准格式检测
  safe: boolean;       // 安全性 (Security) - 脱敏、权限及内容加密
}

export interface VerificationDetail {
  property: 'real' | 'complete' | 'usable' | 'safe';
  name: string;
  status: 'passed' | 'failed' | 'warning';
  method: string;
  timestamp: string;
  message: string;
  operator: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  operator: string;
  details: string;
  ipAddress: string;
}

export interface ArchiveRecord {
  id: string;
  archiveCode: string;          // 系统档号 (Conforms to national GB/T structure)
  voucherNo: string;            // 记账凭证号 (e.g. 记-001)
  archiveType: string;          // 档案类型 (e.g., 记账凭证, 会计账簿, 财务报告, 原始凭证)
  department: string;           // 部门 (e.g., 财务部, 采购部, 销售部)
  amount: number;               // 金额 (Yuan RMB)
  year: string;                 // 年度
  month: string;                // 月份
  retention: string;            // 保管期限 (e.g. 30年, 永久)
  status: '已组卷' | '仅件数据' | '待审核'; // 组卷状态 (Voluming status)
  volumeCode?: string;          // 所属案卷号 (Volume ID if grouped)
  checks: VerificationCheck;
  checkDetails: VerificationDetail[];
  components: ComponentFile[];
  auditLogs: AuditLog[];
  remarks?: string;

  // ── 卷件融合扩展字段 ──
  /** 是否已完成赋号 */
  numbered: boolean;
  /** 赋号日期 */
  numberedDate?: string;
  /** 所用赋号规则ID */
  numberRuleId?: string;

  /** 所属案卷ID（关联 Volume.id） */
  volumeId?: string;
  /** 卷内件号 */
  volumeItemNo?: number;
  /** 纸质扫描页号（如属于某卷） */
  pageNo?: number;

  /** 来源标记：原生电子 | 纸质数字化 */
  source: 'digital-native' | 'digitized';

  /** 父件ID（如记账凭证下挂原始凭证） */
  parentRecordId?: string;
  /** 子件IDs（旧版 ArchiveRecord-based 原始凭证，向后兼容） */
  childRecordIds?: string[];
  /** 富元数据原始凭证IDs（关联 SourceDocument.id，优先使用） */
  sourceDocumentIds?: string[];

  // ── 双模式扩展字段 ──
  /** 载体类型：纸质档案 | 纯电子档案 */
  carrierType?: import('./types/managementMode').CarrierType;
  /** 管理模式：组卷模式 | 按件模式（冗余，方便查询过滤） */
  managementMode?: import('./types/managementMode').ManagementMode;
  /** 所属档案盒ID（关联 ArchiveBox.id），仅 volume-mode 使用 */
  boxId?: string;
  /** 所属档案盒盒号（冗余显示，scope=all 列表携带） */
  boxNo?: string;
  /** 保管库存储位置（组卷确认/移交后由库房管理员填写） */
  storageLocation?: string;

  // ── 分类与检索扩展字段（2026-07-18 财务视图筛选字段级化） ──
  /** 记账凭证子类型：收款凭证/付款凭证/转账凭证/通用记账凭证/凭证汇总/调整凭证 */
  voucherCategory?: string;
  /** 账簿/其他类子类型：总账/明细账/日记账/辅助账簿；银行对账单/纳税申报表/移交清册 等 */
  subType?: string;
  /** 报表分类：法定对外/内部管理/专项报告 */
  reportCategory?: string;
  /** 报表期间：月度/季度/年度 */
  reportPeriod?: string;
  /** 制单人 */
  preparer?: string;
  /** 会计科目（检索维度） */
  accountSubject?: string;
  /** 往来单位（事项检索维度，V10 读模型透出） */
  counterpartyName?: string;
  /** 单据号/发票号（事项检索维度，V10 读模型透出） */
  documentNo?: string;
  /** OCR 双通道识别正文（PDF 文本层/tesseract，详情页展示） */
  ocrText?: string;
  /** 密级：普通/内部/秘密/机密（借阅审批路由依据） */
  securityLevel?: string;

  // ── 凭证扩展字段（finance-model v2.2 / 用友BIP集成 2026-08-08） ──
  /** 凭证字：收/付/转/记 */
  voucherWord?: string;
  /** 凭证日期（制单日期） */
  voucherDate?: string;
  /** 会计期间 yyyy-MM */
  period?: string;
  /** 审核人 */
  auditor?: string;
  /** 记账人 */
  tallyMan?: string;
  /** 凭证分录 JSON：[{line,summary,subjectCode,subjectName,debit,credit}] */
  entries?: string;
  /** 附单据数 */
  attachedBillCount?: number;
  /** 来源业务系统（如 用友BIP） */
  sourceSystem?: string;
  /** 外部系统单据ID（同步幂等键） */
  externalId?: string;
  /** 摘要（cm:description） */
  summary?: string;
}

export interface CategoryNode {
  id: string | number;
  label: string;
  type: 'root' | 'fonds' | 'class' | 'subclass' | 'period' | 'project' | 'archiveItem';
  children?: CategoryNode[];
  code?: string;
}

export interface Fonds {
  id: string;
  name: string;
  code: string;
  /** 现行 = active(运行中), 代管 = custodial(历史遗留由现行全宗代管) */
  status: 'active' | 'custodial';
  recordCount: number;
  address: string;
  syncSource: string;
  /** 所属公司组织 ID（如 org-1, org-2） */
  companyId: string;
  /** 代管方全宗号：若本全宗为代管，此字段标记由哪个现行全宗代管（如 Z002 代管 Z001） */
  custodianCode?: string;
}

export interface MetadataProperty {
  id: string;
  key: string;
  label: string;
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'decimal';
  isRequired: boolean;
  ocrEnabled: boolean;
  gbStandardCode: string;
  description: string;
}

export interface CategoryConfigItem {
  id: string;
  name: string;
  alfrescoType: string;
  creator: string;
  createTime: string;
  properties: MetadataProperty[];
}
