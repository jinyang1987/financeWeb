// 核心业务类型

export interface ComponentFile {
  name: string; type: string; size: string;
  contentType: 'xml' | 'ofd' | 'pdf' | 'png' | 'unknown';
  hash: string; signatureVerified: boolean; signer?: string;
}

export interface VerificationCheck {
  real: boolean; complete: boolean; usable: boolean; safe: boolean;
}

export interface VerificationDetail {
  property: 'real' | 'complete' | 'usable' | 'safe';
  name: string; status: 'passed' | 'failed' | 'warning';
  method: string; timestamp: string; message: string; operator: string;
}

export interface AuditLog {
  id: string; timestamp: string; action: string; operator: string; details: string; ipAddress: string;
}

export interface ArchiveRecord {
  id: string; archiveCode: string; voucherNo: string; archiveType: string;
  department: string; amount: number; year: string; month: string;
  retention: string; status: '已组卷' | '仅件数据' | '待审核';
  volumeCode?: string; checks: VerificationCheck; checkDetails: VerificationDetail[];
  components: ComponentFile[]; auditLogs: AuditLog[]; remarks?: string;
}

export interface CategoryNode {
  id: string | number; label: string; type: 'root' | 'fonds' | 'class' | 'subclass' | 'period';
  children?: CategoryNode[]; code?: string;
}

export interface Fonds {
  id: string; name: string; code: string; status: 'active' | 'inactive';
  recordCount: number; address: string; syncSource: string;
}

export interface MetadataProperty {
  id: string; key: string; label: string; dataType: 'string' | 'number' | 'date' | 'boolean' | 'decimal';
  isRequired: boolean; ocrEnabled: boolean; gbStandardCode: string; description: string;
}

export interface CategoryConfigItem {
  id: string; name: string; alfrescoType: string;
  creator: string; createTime: string; properties: MetadataProperty[];
}
