/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * metadataCatalog — 会计档案元数据标准目录（2026-08-16 自 AccountingMetadataPage 抽取）
 *
 * DA/T 94-2022 附录A 件级（M1-M49）· DA/T 39 卷级（V1-V20）·
 * 卷件关联（VA1-VA6）· DA/T 39/42/94 盒级（B1-B29）全部元数据项定义。
 */

// ============================================================
// 元数据项类型定义
// ============================================================

export interface MetadataItem {
  id: string;
  name: string;
  englishName: string;
  definition: string;
  mandatory: '必选' | '可选' | '条件可选';
  repeatable: '不可重复' | '可重复';
  dataType: string;
  valueRange?: string;
  captureNode: string;
  subItems?: MetadataItem[];
  /** 所属实体类型 */
  entityType: string;
}

// ============================================================
// 模式定义
// ============================================================

export type MetadataMode = 'accounting-archive' | 'source-doc';

export interface ModeOption {
  key: MetadataMode;
  label: string;
  description: string;
}

export const MODE_OPTIONS: ModeOption[] = [
  { key: 'accounting-archive', label: '会计档案元数据', description: '件级元数据（M1-M49）+ 卷级元数据（V1-V20）+ 卷件关联（VA1-VA6）+ 盒级元数据（B1-B29），盒→卷→件→凭证四级穿透' },
  { key: 'source-doc', label: '原始凭证元数据', description: '96种原始凭证独立元数据配置，公共字段+类型特有扩展字段，支持逐类型定制显隐' },
];

// ============================================================
// 表A.1 文件实体元数据（件级）
// ============================================================

export const fileEntityRaw: MetadataItem[] = [
  { id: 'M1', name: '聚合层次', englishName: 'AggregationLevel', definition: '电子会计档案在分类整理后作为个体和群体的控制层次，如全宗、类别、案卷、件等', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '全宗 / 类别 / 案卷 / 件 / 其他', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M2', name: '来源', englishName: 'Source', definition: '电子会计档案的来源信息，含全宗名称、档案馆名称等', mandatory: '必选', repeatable: '不可重复', dataType: '复合型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据',
    subItems: [
      { id: 'M3', name: '档案馆名称', englishName: 'RepositoryName', definition: '保管电子会计档案的档案馆全称', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
      { id: 'M4', name: '档案馆代码', englishName: 'RepositoryCode', definition: '档案馆的唯一标识代码', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
      { id: 'M5', name: '全宗名称', englishName: 'FondsName', definition: '归档单位的全称', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '件级元数据' },
      { id: 'M6', name: '全宗号', englishName: 'FondsCode', definition: '归档单位在档案馆的唯一代码', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
      { id: 'M7', name: '立档单位名称', englishName: 'CreatorName', definition: '形成电子会计档案的机构全称', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '会计核算系统', entityType: '件级元数据' },
    ],
  },
  { id: 'M8', name: '类别号', englishName: 'CategoryCode', definition: '电子会计档案在分类方案中的类别代码', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '大写汉语拼音字母、阿拉伯数字或组合', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M9', name: '室编案卷号', englishName: 'OfficeArchiveCode', definition: '会计管理机构对案卷编制的顺序号', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '4位阿拉伯数字', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M10', name: '馆编案卷号', englishName: 'RepositoryArchiveCode', definition: '档案馆对案卷编制的顺序号', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M11', name: '室编件号', englishName: 'OfficeItemCode', definition: '会计管理机构对卷内文件编制的顺序号', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '4位阿拉伯数字', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M12', name: '馆编件号', englishName: 'RepositoryItemCode', definition: '档案馆对卷内文件编制的顺序号', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M13', name: '档号', englishName: 'ArchivalCode', definition: '电子会计档案的唯一标识符', mandatory: '必选', repeatable: '不可重复', dataType: '复合型', valueRange: '[全宗号-]类别号-案卷号-件号(卷内序号)', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M14', name: '题名', englishName: 'Title', definition: '表达电子会计档案中心主题内容和形式特征的词组', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本', captureNode: '会计核算系统/业务系统', entityType: '件级元数据' },
  { id: 'M15', name: '日期', englishName: 'Date', definition: '电子会计档案的形成日期或起止日期', mandatory: '必选', repeatable: '不可重复', dataType: '日期型', valueRange: 'YYYY-MM-DD 或 YYYY-MM-DD~YYYY-MM-DD', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M16', name: '文件编号', englishName: 'DocumentNumber', definition: '电子会计资料在形成时由责任者赋予的顺序号', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', captureNode: '会计核算系统/业务系统', entityType: '件级元数据' },
  { id: 'M17', name: '责任者', englishName: 'Agent', definition: '对电子会计资料的形成负有责任的机构或人员', mandatory: '必选', repeatable: '可重复', dataType: '字符型', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M18', name: '附件', englishName: 'Attachment', definition: '与电子会计档案正件相关联的其他文件信息', mandatory: '可选', repeatable: '可重复', dataType: '字符型', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M19', name: '密级', englishName: 'SecurityClassification', definition: '电子会计档案的保密等级', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '绝密 / 机密 / 秘密 / 内部 / 公开', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M20', name: '保管期限', englishName: 'RetentionPeriod', definition: '电子会计档案需要保存的时间长度', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '永久 / 30年 / 10年 / 其他', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M21', name: '摘要', englishName: 'Abstract', definition: '对电子会计档案核心内容的简要描述', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M22', name: '格式信息', englishName: 'FormatInformation', definition: '电子会计档案的计算机文件格式描述', mandatory: '必选', repeatable: '可重复', dataType: '字符型', valueRange: 'OFD/PDF/XML/其他', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M23', name: '计算机文件名', englishName: 'ComputerFileName', definition: '电子会计档案在计算机中的文件名称', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '会计核算系统/业务系统', entityType: '件级元数据' },
  { id: 'M24', name: '计算机文件大小', englishName: 'ComputerFileSize', definition: '电子会计档案的字节数', mandatory: '必选', repeatable: '不可重复', dataType: '数值型', valueRange: '单位为字节(B)', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M25', name: '计算机文件格式', englishName: 'ComputerFileFormat', definition: '电子会计档案文件的具体存储格式', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: 'OFD / PDF / DOCX / XLSX / XML 等', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M26', name: '创建时间', englishName: 'CreatedTime', definition: '电子会计档案在计算机系统中的生成时间', mandatory: '必选', repeatable: '不可重复', dataType: '日期时间型', valueRange: 'YYYY-MM-DD HH:mm:ss', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M27', name: '哈希值', englishName: 'HashValue', definition: '用于验证电子会计档案真实性和完整性的哈希算法计算值', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: 'MD5 / SHA-1 / SHA-256 等', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M28', name: '电子签名', englishName: 'ElectronicSignature', definition: '对电子会计档案进行数字签名的信息', mandatory: '条件可选', repeatable: '可重复', dataType: '字符型', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M29', name: '会计年度', englishName: 'FiscalYear', definition: '电子会计档案所属的会计年度', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '4位阿拉伯数字，如 2024', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M30', name: '会计资料形式', englishName: 'AccountingDocumentType', definition: '电子会计资料按内容形式分类', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '会计凭证 / 会计账簿 / 财务会计报告 / 其他会计资料', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M31', name: '凭证号', englishName: 'VoucherNumber', definition: '记账凭证的顺序编号', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M32', name: '起始日期', englishName: 'StartDate', definition: '会计资料所记录业务的开始日期', mandatory: '可选', repeatable: '不可重复', dataType: '日期型', valueRange: 'YYYY-MM-DD', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M33', name: '终止日期', englishName: 'EndDate', definition: '会计资料所记录业务的结束日期', mandatory: '可选', repeatable: '不可重复', dataType: '日期型', valueRange: 'YYYY-MM-DD', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M34', name: '币种', englishName: 'Currency', definition: '电子会计档案涉及的货币种类', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: 'CNY / USD / EUR 等 ISO 4217 货币代码', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M35', name: '金额合计', englishName: 'TotalAmount', definition: '电子会计档案涉及的总金额', mandatory: '可选', repeatable: '不可重复', dataType: '数值型', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M36', name: '页数', englishName: 'PageCount', definition: '电子会计档案对应实体形式的页数', mandatory: '可选', repeatable: '不可重复', dataType: '数值型', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M37', name: '存储位置', englishName: 'StorageLocation', definition: '电子会计档案在线存储的物理或逻辑位置', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M38', name: '脱机载体编号', englishName: 'OfflineMediaNumber', definition: '离线存储载体的唯一标识编号', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M39', name: '关联档案号', englishName: 'RelatedArchivalCode', definition: '与本电子会计档案相关联的其他档案的档号', mandatory: '可选', repeatable: '可重复', dataType: '字符型', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '件级元数据' },
];

// ============================================================
// 表A.2 机构人员实体元数据（件级）
// ============================================================

export const agentEntityRaw: MetadataItem[] = [
  { id: 'M40', name: '机构人员类型', englishName: 'AgentType', definition: '与电子会计档案相关的机构或人员的类型', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '责任者 / 经办人 / 审核人 / 审批人 / 会计主管 / 记账人 / 制单人 / 其他', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M41', name: '机构人员名称', englishName: 'AgentName', definition: '与电子会计档案相关的机构或人员的全称', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M42', name: '机构人员代码', englishName: 'AgentCode', definition: '机构或人员在信息系统中的唯一标识', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '件级元数据' },
];

// ============================================================
// 表A.3 业务实体元数据（件级）
// ============================================================

export const businessEntityRaw: MetadataItem[] = [
  { id: 'M43', name: '业务类型', englishName: 'BusinessType', definition: '产生电子会计档案的业务活动的类别', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '归档 / 移交 / 鉴定 / 销毁 / 利用 / 迁移 / 检测 / 其他', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M44', name: '业务名称', englishName: 'BusinessName', definition: '产生电子会计档案的业务活动名称', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M45', name: '业务描述', englishName: 'BusinessDescription', definition: '业务活动的内容、目的和结果的说明', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M46', name: '业务时间', englishName: 'BusinessTime', definition: '业务活动发生的起止时间', mandatory: '必选', repeatable: '不可重复', dataType: '日期时间型', valueRange: 'YYYY-MM-DD HH:mm:ss', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
];

// ============================================================
// 表A.4 实体关系元数据（件级）
// ============================================================

export const relationRaw: MetadataItem[] = [
  { id: 'M47', name: '关系类型', englishName: 'RelationType', definition: '实体之间关联关系的类别', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '文件-文件 / 文件-机构人员 / 文件-业务 / 业务-业务 等', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M48', name: '关系实体', englishName: 'SourceEntity', definition: '关系中的源实体标识', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M49', name: '关联实体', englishName: 'TargetEntity', definition: '关系中的目标实体标识', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
];

// ============================================================
// 卷级元数据（DA/T 39 纸质会计档案卷级 + DA/T 94 卷级部分）
//
// 适用场景：纸质原件组卷保存，数字化副本在系统中按件管理，
// 但必须保留卷级元数据做"桥梁"，让电子件能精准对应回物理案卷。
// ============================================================

export const volumeEntityRaw: MetadataItem[] = [
  { id: 'V1', name: '全宗号', englishName: 'FondsCode', definition: '单位档案整体编号，标识案卷所属的全宗', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 Z001、Z002', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V2', name: '档案门类代码', englishName: 'CategoryCode', definition: '会计档案的门类代码，固定为 KU', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: 'KU（会计档案）', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V3', name: '年度', englishName: 'Year', definition: '案卷所属会计年度', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '4位阿拉伯数字，如 2026', captureNode: '会计核算系统', entityType: '卷级元数据' },
  { id: 'V4', name: '类别号', englishName: 'ArchiveTypeCode', definition: '案卷的会计资料类别代码', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: 'PZ(凭证) / ZB(账簿) / BB(报表) / QT(其他)', captureNode: '会计核算系统', entityType: '卷级元数据' },
  { id: 'V5', name: '案卷号', englishName: 'VolumeNumber', definition: '本年度内该类案卷的顺序号', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '4位阿拉伯数字，如 0001', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V6', name: '案卷档号', englishName: 'VolumeArchivalCode', definition: '案卷的唯一标识符，由全宗号、门类代码、年度、类别号、保管期限、案卷号组合而成', mandatory: '必选', repeatable: '不可重复', dataType: '复合型', valueRange: '如 Z001-KU·PZ·2026-D30-0001', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V7', name: '案卷题名', englishName: 'VolumeTitle', definition: '概括案卷内文件核心内容的词组', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本，如 "2026年6月银行付款凭证（第1‒50号）"', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V8', name: '起止日期', englishName: 'DateRange', definition: '案卷内文件的起始日期至截止日期', mandatory: '必选', repeatable: '不可重复', dataType: '日期型', valueRange: 'YYYY-MM-DD~YYYY-MM-DD', captureNode: '会计核算系统', entityType: '卷级元数据' },
  { id: 'V9', name: '保管期限', englishName: 'RetentionPeriod', definition: '案卷依据《会计档案管理办法》需要保存的时间长度', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '永久 / 30年 / 10年', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V10', name: '卷内件数', englishName: 'TotalItems', definition: '案卷中包含的电子文件总件数', mandatory: '必选', repeatable: '不可重复', dataType: '数值型', valueRange: '正整数', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V11', name: '卷内总页数', englishName: 'TotalPages', definition: '案卷对应的纸质原件总页数（含封面、卷内目录、备考表）', mandatory: '必选', repeatable: '不可重复', dataType: '数值型', valueRange: '正整数', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V12', name: '立档单位', englishName: 'ArchivalUnit', definition: '形成案卷的法人单位全称', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "XX集团有限公司"', captureNode: '会计核算系统', entityType: '卷级元数据' },
  { id: 'V13', name: '立卷人', englishName: 'Filer', definition: '进行组卷操作的财务整理人员姓名', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V14', name: '立卷日期', englishName: 'FilingDate', definition: '案卷组卷装订完成的日期', mandatory: '必选', repeatable: '不可重复', dataType: '日期型', valueRange: 'YYYY-MM-DD', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V15', name: '检查人', englishName: 'Inspector', definition: '对案卷进行质量检查的档案部门验收人员姓名', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V16', name: '检查日期', englishName: 'InspectionDate', definition: '案卷质量检查验收完成的日期', mandatory: '可选', repeatable: '不可重复', dataType: '日期型', valueRange: 'YYYY-MM-DD', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V17', name: '存放位置', englishName: 'StorageLocation', definition: '纸质案卷实体在库房中的存放位置（库房-柜架-层位）', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "A区-03架-05层"', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V18', name: '数字化状态', englishName: 'DigitizationStatus', definition: '案卷纸质原件的数字化扫描完成状态', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: '未扫描 / 已扫描 / 部分扫描', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V19', name: '数字化副本哈希', englishName: 'DigitalHash', definition: '案卷全部电子化文件的整体哈希校验值，用于确保数字化副本未被篡改', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: 'SHA-256 值', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
  { id: 'V20', name: '备注', englishName: 'Remarks', definition: '案卷的特殊情况说明（如缺号、补制、损毁、移出等）', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本', captureNode: '电子会计档案管理信息系统', entityType: '卷级元数据' },
];

// ============================================================
// 卷件关联实体（纸质数字化副本 ↔ 原纸质案卷）
//
// 核心逻辑：纸质档案以卷为管理单元，数字化后电子端以件为管理单元，
// 通过卷件关联元数据建立"双向关联"——电子件能定位到实体案卷，
// 实体案卷能查到所有关联电子件。
// ============================================================

export const volumeAssociationRaw: MetadataItem[] = [
  { id: 'VA1', name: '关联类型', englishName: 'AssociationType', definition: '数字化副本与纸质案卷之间的关联方式', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '纸质数字化 / 纸质复印件关联 / 纸质原件引用', captureNode: '电子会计档案管理信息系统', entityType: '卷件关联' },
  { id: 'VA2', name: '案卷档号', englishName: 'VolumeArchivalCode', definition: '所关联的纸质案卷的完整卷级档号', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 Z001-KU·PZ·2026-D30-0001', captureNode: '电子会计档案管理信息系统', entityType: '卷件关联' },
  { id: 'VA3', name: '件档号', englishName: 'ItemArchivalCode', definition: '数字化副本电子件的完整件级档号', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 Z001-KU·PZ·2026-D30-0001-0020', captureNode: '电子会计档案管理信息系统', entityType: '卷件关联' },
  { id: 'VA4', name: '卷内件号', englishName: 'ItemNoInVolume', definition: '电子件在其所属案卷内的顺序编号', mandatory: '必选', repeatable: '不可重复', dataType: '数值型', valueRange: '4位阿拉伯数字，如 0020', captureNode: '电子会计档案管理信息系统', entityType: '卷件关联' },
  { id: 'VA5', name: '起始页号', englishName: 'PageStart', definition: '该电子件对应纸质原件在卷内的起始页号', mandatory: '可选', repeatable: '不可重复', dataType: '数值型', valueRange: '正整数', captureNode: '电子会计档案管理信息系统', entityType: '卷件关联' },
  { id: 'VA6', name: '终止页号', englishName: 'PageEnd', definition: '该电子件对应纸质原件在卷内的终止页号', mandatory: '可选', repeatable: '不可重复', dataType: '数值型', valueRange: '正整数', captureNode: '电子会计档案管理信息系统', entityType: '卷件关联' },
];

// ============================================================
// 盒级元数据（DA/T 39-2008 卷盒格式 + DA/T 42-2022 装盒规范 + DA/T 94-2022 电子档案关联）
//
// 盒是物理存储容器，位于卷之上。其元数据项全部可溯源至现行有效档案行业标准：
// - DA/T 39-2008：卷盒封面、脊背的必填填写项目
// - DA/T 42-2022：装盒分类边界与排列规则（同一年度、同一类别、同一保管期限方可装盒）
// - DA/T 94-2022：双套制下盒级电子关联元数据扩展
//
// 盒元数据的法定定位为物理存储容器的管理标识元数据，不属于法定档号的组成部分，
// 核心服务于实体档案的库房定位、批量盘点、范围快速识别与全流程追溯。
// ============================================================

// 第一类：基础标识元数据（B1-B3）
// 全系统统一的容器身份主键，盒号按编码规则自动生成
export const boxIdentificationRaw: MetadataItem[] = [
  { id: 'B1', name: '盒号', englishName: 'BoxNo', definition: '档案盒在全系统内的唯一标识编号，按系统配置的编码规则自动生成，遵循同一分类维度下唯一、连续流水原则', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 BOX-2026-KP-001', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B2', name: '全宗号', englishName: 'FondsCode', definition: '归档单位在档案馆的唯一代码，与档号体系全宗号规则完全一致', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 Z001、Z002', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B3', name: '档案门类代码', englishName: 'CategoryCode', definition: '会计档案的门类代码，固定为 KU，与案卷级、件级元数据保持口径统一', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: 'KU（会计档案）', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
];

// 第二类：分类合规元数据（B4-B7）
// 装盒合规性校验核心载体，严格对应 DA/T 42-2022 "同一年度、同一类别、同一保管期限"强制要求
export const boxClassificationRaw: MetadataItem[] = [
  { id: 'B4', name: '会计年度', englishName: 'FiscalYear', definition: '档案盒所属的会计年度，装盒时自动继承所选案卷/件的年度属性，跨年度自动拦截', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '4位阿拉伯数字，如 2026', captureNode: '会计核算系统', entityType: '盒级元数据' },
  { id: 'B5', name: '会计档案二级类别', englishName: 'SubCategory', definition: '盒内档案的会计资料二级分类，装盒时自动继承所选档案的类别属性，跨类别自动拦截', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '记账凭证 / 原始凭证 / 总账 / 明细账 / 日记账 / 月报 / 季报 / 年报 / 其他', captureNode: '会计核算系统', entityType: '盒级元数据' },
  { id: 'B6', name: '保管期限', englishName: 'RetentionPeriod', definition: '盒内档案依据《会计档案管理办法》需要保存的时间长度，装盒时自动继承，跨保管期限自动拦截', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '永久 / 30年 / 10年', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B7', name: '组织机构', englishName: 'Organization', definition: '档案盒所属的组织机构维度（集团型单位可扩展），用于多组织架构下的分类管理', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "财务部"、"XX子公司财务处"', captureNode: '会计核算系统', entityType: '盒级元数据' },
];

// 第三类：内容范围元数据（B8-B15）
// DA/T 39-2008 明确规定的卷盒封面、脊背必填项，属于法定必录元数据
export const boxContentRangeRaw: MetadataItem[] = [
  { id: 'B8', name: '起止案卷号', englishName: 'VolumeRange', definition: '盒内首末案卷的案卷号范围（按卷整理模式），系统根据选定连续案卷自动提取', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "0001-0050"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B9', name: '起止件号', englishName: 'ItemRange', definition: '盒内首末件的件号范围（单件整理模式），系统根据选定连续件自动提取', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "0001-0200"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B10', name: '盒内卷数', englishName: 'VolumeCount', definition: '档案盒内包含的案卷总数量，系统根据选定档案自动统计', mandatory: '条件可选', repeatable: '不可重复', dataType: '数值型', valueRange: '正整数', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B11', name: '盒内件数', englishName: 'ItemCount', definition: '档案盒内包含的电子文件总件数，系统根据选定档案自动统计', mandatory: '条件可选', repeatable: '不可重复', dataType: '数值型', valueRange: '正整数', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B12', name: '档案起止日期', englishName: 'DateRange', definition: '盒内档案的形成日期范围，自动匹配盒内最早与最晚的档案形成日期，严格对应 DA/T 39-2008 卷盒封面标准填写项', mandatory: '必选', repeatable: '不可重复', dataType: '日期型', valueRange: 'YYYY-MM-DD~YYYY-MM-DD', captureNode: '会计核算系统', entityType: '盒级元数据' },
  { id: 'B13', name: '所属月份', englishName: 'Month', definition: '会计凭证类档案盒对应的会计月份，凭证类自动识别并回填，可直接映射生成标准化卷盒打印模板', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "01"、"06"（2位月份）', captureNode: '会计核算系统', entityType: '盒级元数据' },
  { id: 'B14', name: '总册数', englishName: 'TotalVolumes', definition: '同一会计月份凭证类档案的总分册数量（凭证类额外字段），用于卷盒脊背标注', mandatory: '条件可选', repeatable: '不可重复', dataType: '数值型', valueRange: '正整数，如 3（共3册）', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B15', name: '本册次', englishName: 'VolumeSequence', definition: '当前档案盒在总册数中的顺序编号（凭证类额外字段），如"第1册/共3册"，用于卷盒封面标注', mandatory: '条件可选', repeatable: '不可重复', dataType: '数值型', valueRange: '如 1、2、3', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
];

// 第四类：物理位置元数据（B16-B19）
// 库房管理扩展元数据，用于精准定位档案盒实体存放位置，支持智能库房联动
export const boxPhysicalLocationRaw: MetadataItem[] = [
  { id: 'B16', name: '库房号', englishName: 'StorageRoom', definition: '档案盒实体存放的库房编号，用于精准定位档案盒的实体存放位置', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "A区"、"1号库房"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B17', name: '档案架号', englishName: 'ShelfCode', definition: '档案盒实体存放的密集架/档案柜编号，支持与智能库房管理系统联动', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "03架"、"B12柜"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B18', name: '架层号', englishName: 'TierCode', definition: '档案盒在档案架/柜中的具体层位编号，用于档案调取的路径指引', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "05层"、"第3层"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B19', name: '层内位号', englishName: 'PositionCode', definition: '档案盒在架层内的排列顺序编号，用于盘点的快速定位，编码规则可由单位按需自定义', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "12位"、"A位"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
];

// 第五类：流程管理元数据（B20-B26）
// 对应档案全生命周期管理的流程追溯要求，符合《会计档案管理办法》流程留痕要求
export const boxProcessManagementRaw: MetadataItem[] = [
  { id: 'B20', name: '装盒人', englishName: 'BoxingPerson', definition: '执行装盒操作的财务整理人员姓名，系统在完成装盒操作时自动回填，确保操作可追溯', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B21', name: '装盒日期', englishName: 'BoxingDate', definition: '装盒操作完成的日期，系统在完成装盒操作时自动回填', mandatory: '必选', repeatable: '不可重复', dataType: '日期型', valueRange: 'YYYY-MM-DD', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B22', name: '整理人', englishName: 'Organizer', definition: '对盒内档案进行整理、排序、编目的档案管理人员姓名', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B23', name: '审核人', englishName: 'Reviewer', definition: '对装盒成果进行质量检查验收的档案部门人员姓名', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B24', name: '档案状态', englishName: 'BoxStatus', definition: '档案盒在保管、移交、销毁全流程中的当前状态，状态变更需关联对应审批流程与清册编号', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '使用中 / 已封盒 / 已上架 / 已移交 / 已销毁', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B25', name: '关联清册编号', englishName: 'RelatedRegisterNo', definition: '档案盒关联的移交清册或销毁清册编号，状态变更时关联对应审批流程', mandatory: '条件可选', repeatable: '可重复', dataType: '字符型', valueRange: '如 "YJ-2026-001"、"XH-2026-003"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B26', name: '备考说明', englishName: 'Remarks', definition: '对应卷盒内的备考表内容，用于记录盒内档案的破损、补充、缺失等特殊情况，完全匹配档案整理的通用规范要求', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
];

// 第六类：双套制关联元数据（B27-B29）
// 依据 DA/T 94-2022 电子档案管理要求设计，确保纸质+电子双套归档对应关系可查可追溯
export const boxDualSystemRaw: MetadataItem[] = [
  { id: 'B27', name: '对应电子档案批次号', englishName: 'ElectronicBatchNo', definition: '实行纸质+电子双套归档的单位，纸质档案装盒生成的盒号自动同步至对应电子档案的批次编号', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "ELEC-BATCH-2026-001"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B28', name: '电子存储介质标识', englishName: 'ElectronicMediaId', definition: '电子档案脱机存储载体的唯一标识编号（如光盘编号、硬盘序列号），与盒建立一一映射关系', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "DVD-2026-0032"、"HD-SN-ABC123"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B29', name: '双套校验状态', englishName: 'DualCheckStatus', definition: '电子与纸质档案的一致性核验结果标识，确保双套档案的对应关系可查、可追溯', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: '未校验 / 一致 / 不一致 / 异常', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
];

// ============================================================
// 元数据聚合
// ============================================================

// 件级元数据（始终存在）
export const allItemLevelMetadata: MetadataItem[] = [];
for (const item of [...fileEntityRaw, ...agentEntityRaw, ...businessEntityRaw, ...relationRaw]) {
  allItemLevelMetadata.push(item);
  if (item.subItems) {
    allItemLevelMetadata.push(...item.subItems);
  }
}

// 卷级元数据（纸质数字化模式增加）
export const allVolumeLevelMetadata: MetadataItem[] = [];
for (const item of [...volumeEntityRaw, ...volumeAssociationRaw]) {
  allVolumeLevelMetadata.push(item);
  if (item.subItems) {
    allVolumeLevelMetadata.push(...item.subItems);
  }
}

// 盒级元数据（容器级元数据，B1-B29）
export const allBoxLevelMetadata: MetadataItem[] = [];
for (const item of [...boxIdentificationRaw, ...boxClassificationRaw, ...boxContentRangeRaw, ...boxPhysicalLocationRaw, ...boxProcessManagementRaw, ...boxDualSystemRaw]) {
  allBoxLevelMetadata.push(item);
  if (item.subItems) {
    allBoxLevelMetadata.push(...item.subItems);
  }
}

export const ALL_ITEM_METADATA_IDS = allItemLevelMetadata.map((m) => m.id);
export const ALL_VOLUME_METADATA_IDS = allVolumeLevelMetadata.map((m) => m.id);
export const ALL_BOX_METADATA_IDS = allBoxLevelMetadata.map((m) => m.id);
export const ALL_METADATA_IDS = [...ALL_ITEM_METADATA_IDS, ...ALL_VOLUME_METADATA_IDS, ...ALL_BOX_METADATA_IDS];

// ============================================================
// 统计
// ============================================================

export function computeStats() {
  const itemStats = {
    totalCount: allItemLevelMetadata.length,
    fileEntityCount: fileEntityRaw.length,
    agentEntityCount: agentEntityRaw.length,
    businessEntityCount: businessEntityRaw.length,
    relationCount: relationRaw.length,
    mandatoryCount: allItemLevelMetadata.filter((m) => m.mandatory === '必选').length,
    optionalCount: allItemLevelMetadata.filter((m) => m.mandatory === '可选').length,
    conditionalCount: allItemLevelMetadata.filter((m) => m.mandatory === '条件可选').length,
  };

  const volMandatory = allVolumeLevelMetadata.filter((m) => m.mandatory === '必选').length;
  const volOptional = allVolumeLevelMetadata.filter((m) => m.mandatory === '可选').length;
  const volConditional = allVolumeLevelMetadata.filter((m) => m.mandatory === '条件可选').length;

  const boxMandatory = allBoxLevelMetadata.filter((m) => m.mandatory === '必选').length;
  const boxOptional = allBoxLevelMetadata.filter((m) => m.mandatory === '可选').length;
  const boxConditional = allBoxLevelMetadata.filter((m) => m.mandatory === '条件可选').length;

  return {
    ...itemStats,
    volumeEntityCount: volumeEntityRaw.length,
    volumeAssociationCount: volumeAssociationRaw.length,
    volMandatoryCount: volMandatory,
    volOptionalCount: volOptional,
    volConditionalCount: volConditional,
    boxIdentificationCount: boxIdentificationRaw.length,
    boxClassificationCount: boxClassificationRaw.length,
    boxContentRangeCount: boxContentRangeRaw.length,
    boxPhysicalLocationCount: boxPhysicalLocationRaw.length,
    boxProcessManagementCount: boxProcessManagementRaw.length,
    boxDualSystemCount: boxDualSystemRaw.length,
    boxTotalCount: allBoxLevelMetadata.length,
    boxMandatoryCount: boxMandatory,
    boxOptionalCount: boxOptional,
    boxConditionalCount: boxConditional,
    totalCount: itemStats.totalCount + allVolumeLevelMetadata.length + allBoxLevelMetadata.length,
    mandatoryCount: itemStats.mandatoryCount + volMandatory + boxMandatory,
    optionalCount: itemStats.optionalCount + volOptional + boxOptional,
    conditionalCount: itemStats.conditionalCount + volConditional + boxConditional,
  };
}

// 获取所有元数据（含子项）—— 始终包含件级+卷级+盒级
export function getAllMetadata() {
  return [...allItemLevelMetadata, ...allVolumeLevelMetadata, ...allBoxLevelMetadata];
}
