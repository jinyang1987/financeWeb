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
}

export interface CategoryNode {
  id: string | number;
  label: string;
  type: 'root' | 'fonds' | 'class' | 'subclass' | 'period';
  children?: CategoryNode[];
  code?: string;
}

export interface Fonds {
  id: string;
  name: string;
  code: string;
  status: 'active' | 'inactive';
  recordCount: number;
  address: string;
  syncSource: string;
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
