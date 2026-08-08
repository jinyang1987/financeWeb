/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * AccountingMetadataPage — 会计档案元数据配置
 *
 * 展示 DA/T 94-2022 电子会计档案元数据方案（附录A）的全部元数据项，
 * 以及 DA/T 39 纸质会计档案卷级元数据方案。
 *
 * 会计档案统一按卷管理，件级元数据（M1-M49）与卷级元数据（V1-V20）
 * 及卷件关联（VA1-VA6）合并展示，不再区分纯电子/纸质数字化模式。
 *
 * 新增"页面设置"功能，用户可配置详情页展示哪些元数据字段以及顺序。
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  FileText, Users, Briefcase, Link2, ChevronDown, ChevronRight,
  Settings, Save, Eye, EyeOff, GripVertical, Check, X,
  BookOpen, Folders, GitBranch, FileSpreadsheet, Archive, Package, Star, ArrowUp,
} from 'lucide-react';
import { useMetadataDisplayStore } from '../../stores/metadataDisplayStore';
import type { ContextFieldConfig } from '../../stores/metadataDisplayStore';
import {
  ENTITY_CONTEXTS,
  getAllFieldDefs,
  getDefaultVisibleIds,
  getAllFieldIds,
} from '../../config/metadataContexts';
import type { EntityContextId } from '../../config/metadataContexts';
import SourceDocMetadataPanel from './SourceDocMetadataPanel';

// ============================================================
// 元数据项类型定义
// ============================================================

interface MetadataItem {
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

type MetadataMode = 'accounting-archive' | 'source-doc';

interface ModeOption {
  key: MetadataMode;
  label: string;
  description: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { key: 'accounting-archive', label: '会计档案元数据', description: '件级元数据（M1-M49）+ 卷级元数据（V1-V20）+ 卷件关联（VA1-VA6）+ 盒级元数据（B1-B29），盒→卷→件→凭证四级穿透' },
  { key: 'source-doc', label: '原始凭证元数据', description: '96种原始凭证独立元数据配置，公共字段+类型特有扩展字段，支持逐类型定制显隐' },
];

// ============================================================
// 表A.1 文件实体元数据（件级）
// ============================================================

const fileEntityRaw: MetadataItem[] = [
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

const agentEntityRaw: MetadataItem[] = [
  { id: 'M40', name: '机构人员类型', englishName: 'AgentType', definition: '与电子会计档案相关的机构或人员的类型', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '责任者 / 经办人 / 审核人 / 审批人 / 会计主管 / 记账人 / 制单人 / 其他', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M41', name: '机构人员名称', englishName: 'AgentName', definition: '与电子会计档案相关的机构或人员的全称', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '会计核算系统', entityType: '件级元数据' },
  { id: 'M42', name: '机构人员代码', englishName: 'AgentCode', definition: '机构或人员在信息系统中的唯一标识', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', captureNode: '会计核算系统/电子会计档案管理信息系统', entityType: '件级元数据' },
];

// ============================================================
// 表A.3 业务实体元数据（件级）
// ============================================================

const businessEntityRaw: MetadataItem[] = [
  { id: 'M43', name: '业务类型', englishName: 'BusinessType', definition: '产生电子会计档案的业务活动的类别', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '归档 / 移交 / 鉴定 / 销毁 / 利用 / 迁移 / 检测 / 其他', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M44', name: '业务名称', englishName: 'BusinessName', definition: '产生电子会计档案的业务活动名称', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M45', name: '业务描述', englishName: 'BusinessDescription', definition: '业务活动的内容、目的和结果的说明', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '自由文本', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
  { id: 'M46', name: '业务时间', englishName: 'BusinessTime', definition: '业务活动发生的起止时间', mandatory: '必选', repeatable: '不可重复', dataType: '日期时间型', valueRange: 'YYYY-MM-DD HH:mm:ss', captureNode: '电子会计档案管理信息系统', entityType: '件级元数据' },
];

// ============================================================
// 表A.4 实体关系元数据（件级）
// ============================================================

const relationRaw: MetadataItem[] = [
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

const volumeEntityRaw: MetadataItem[] = [
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

const volumeAssociationRaw: MetadataItem[] = [
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
const boxIdentificationRaw: MetadataItem[] = [
  { id: 'B1', name: '盒号', englishName: 'BoxNo', definition: '档案盒在全系统内的唯一标识编号，按系统配置的编码规则自动生成，遵循同一分类维度下唯一、连续流水原则', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 BOX-2026-KP-001', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B2', name: '全宗号', englishName: 'FondsCode', definition: '归档单位在档案馆的唯一代码，与档号体系全宗号规则完全一致', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 Z001、Z002', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B3', name: '档案门类代码', englishName: 'CategoryCode', definition: '会计档案的门类代码，固定为 KU，与案卷级、件级元数据保持口径统一', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: 'KU（会计档案）', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
];

// 第二类：分类合规元数据（B4-B7）
// 装盒合规性校验核心载体，严格对应 DA/T 42-2022 "同一年度、同一类别、同一保管期限"强制要求
const boxClassificationRaw: MetadataItem[] = [
  { id: 'B4', name: '会计年度', englishName: 'FiscalYear', definition: '档案盒所属的会计年度，装盒时自动继承所选案卷/件的年度属性，跨年度自动拦截', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '4位阿拉伯数字，如 2026', captureNode: '会计核算系统', entityType: '盒级元数据' },
  { id: 'B5', name: '会计档案二级类别', englishName: 'SubCategory', definition: '盒内档案的会计资料二级分类，装盒时自动继承所选档案的类别属性，跨类别自动拦截', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '记账凭证 / 原始凭证 / 总账 / 明细账 / 日记账 / 月报 / 季报 / 年报 / 其他', captureNode: '会计核算系统', entityType: '盒级元数据' },
  { id: 'B6', name: '保管期限', englishName: 'RetentionPeriod', definition: '盒内档案依据《会计档案管理办法》需要保存的时间长度，装盒时自动继承，跨保管期限自动拦截', mandatory: '必选', repeatable: '不可重复', dataType: '字符型', valueRange: '永久 / 30年 / 10年', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B7', name: '组织机构', englishName: 'Organization', definition: '档案盒所属的组织机构维度（集团型单位可扩展），用于多组织架构下的分类管理', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "财务部"、"XX子公司财务处"', captureNode: '会计核算系统', entityType: '盒级元数据' },
];

// 第三类：内容范围元数据（B8-B15）
// DA/T 39-2008 明确规定的卷盒封面、脊背必填项，属于法定必录元数据
const boxContentRangeRaw: MetadataItem[] = [
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
const boxPhysicalLocationRaw: MetadataItem[] = [
  { id: 'B16', name: '库房号', englishName: 'StorageRoom', definition: '档案盒实体存放的库房编号，用于精准定位档案盒的实体存放位置', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "A区"、"1号库房"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B17', name: '档案架号', englishName: 'ShelfCode', definition: '档案盒实体存放的密集架/档案柜编号，支持与智能库房管理系统联动', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "03架"、"B12柜"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B18', name: '架层号', englishName: 'TierCode', definition: '档案盒在档案架/柜中的具体层位编号，用于档案调取的路径指引', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "05层"、"第3层"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B19', name: '层内位号', englishName: 'PositionCode', definition: '档案盒在架层内的排列顺序编号，用于盘点的快速定位，编码规则可由单位按需自定义', mandatory: '可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "12位"、"A位"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
];

// 第五类：流程管理元数据（B20-B26）
// 对应档案全生命周期管理的流程追溯要求，符合《会计档案管理办法》流程留痕要求
const boxProcessManagementRaw: MetadataItem[] = [
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
const boxDualSystemRaw: MetadataItem[] = [
  { id: 'B27', name: '对应电子档案批次号', englishName: 'ElectronicBatchNo', definition: '实行纸质+电子双套归档的单位，纸质档案装盒生成的盒号自动同步至对应电子档案的批次编号', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "ELEC-BATCH-2026-001"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B28', name: '电子存储介质标识', englishName: 'ElectronicMediaId', definition: '电子档案脱机存储载体的唯一标识编号（如光盘编号、硬盘序列号），与盒建立一一映射关系', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: '如 "DVD-2026-0032"、"HD-SN-ABC123"', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
  { id: 'B29', name: '双套校验状态', englishName: 'DualCheckStatus', definition: '电子与纸质档案的一致性核验结果标识，确保双套档案的对应关系可查、可追溯', mandatory: '条件可选', repeatable: '不可重复', dataType: '字符型', valueRange: '未校验 / 一致 / 不一致 / 异常', captureNode: '电子会计档案管理信息系统', entityType: '盒级元数据' },
];

// ============================================================
// 元数据聚合
// ============================================================

// 件级元数据（始终存在）
const allItemLevelMetadata: MetadataItem[] = [];
for (const item of [...fileEntityRaw, ...agentEntityRaw, ...businessEntityRaw, ...relationRaw]) {
  allItemLevelMetadata.push(item);
  if (item.subItems) {
    allItemLevelMetadata.push(...item.subItems);
  }
}

// 卷级元数据（纸质数字化模式增加）
const allVolumeLevelMetadata: MetadataItem[] = [];
for (const item of [...volumeEntityRaw, ...volumeAssociationRaw]) {
  allVolumeLevelMetadata.push(item);
  if (item.subItems) {
    allVolumeLevelMetadata.push(...item.subItems);
  }
}

// 盒级元数据（容器级元数据，B1-B29）
const allBoxLevelMetadata: MetadataItem[] = [];
for (const item of [...boxIdentificationRaw, ...boxClassificationRaw, ...boxContentRangeRaw, ...boxPhysicalLocationRaw, ...boxProcessManagementRaw, ...boxDualSystemRaw]) {
  allBoxLevelMetadata.push(item);
  if (item.subItems) {
    allBoxLevelMetadata.push(...item.subItems);
  }
}

const ALL_ITEM_METADATA_IDS = allItemLevelMetadata.map((m) => m.id);
const ALL_VOLUME_METADATA_IDS = allVolumeLevelMetadata.map((m) => m.id);
const ALL_BOX_METADATA_IDS = allBoxLevelMetadata.map((m) => m.id);
const ALL_METADATA_IDS = [...ALL_ITEM_METADATA_IDS, ...ALL_VOLUME_METADATA_IDS, ...ALL_BOX_METADATA_IDS];

// ============================================================
// 统计
// ============================================================

function computeStats() {
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
function getAllMetadata() {
  return [...allItemLevelMetadata, ...allVolumeLevelMetadata, ...allBoxLevelMetadata];
}

// ============================================================
// 页面设置抽屉（卡片预览式布局）
// ============================================================

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  contextId: EntityContextId;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ open, onClose, contextId }) => {
  const { toggleVisibility, setVisibility, moveField, setAllVisible, toggleAdopted, toggleRecommended, applyPreset, getFields, getVisibleIds } = useMetadataDisplayStore();
  const allMetadata = useMemo(() => getAllMetadata(), []);

  const fields = useMemo(() => getFields(contextId), [getFields, contextId]);

  // 可见字段（按排序，仅 adopted）
  const visibleFields = useMemo(
    () => fields.filter((f) => f.adopted && f.visible).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );
  // 隐藏字段（adopted 但不 visible）
  const hiddenFields = useMemo(
    () => fields.filter((f) => f.adopted && !f.visible).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );
  // 未采用字段
  const notAdoptedFields = useMemo(
    () => fields.filter((f) => !f.adopted).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );

  const visibleCount = visibleFields.length;
  const totalCount = fields.length;
  const recommendedIds = useMemo(() => fields.filter(f => f.recommended).map(f => f.id), [fields]);

  // ── 拖拽排序（仅可见字段之间） ──
  const dragIdRef = useRef<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const dragId = e.dataTransfer.getData('text/plain');
    if (dragId && dragId !== targetId) {
      moveField(contextId, dragId, targetId);
    }
    dragIdRef.current = null;
  };

  // 模拟数值
  const mockValue = (id: string): string => {
    const commonMap: Record<string, string> = {
      M1: '件', M3: '北京市档案馆', M4: '110001', M5: 'XX集团有限公司',
      M6: 'Z001', M7: 'XX公司财务部', M8: 'KU-01', M9: '0023', M10: '—',
      M11: '0045', M12: '—', M13: 'Z001-KU·01·2026-D30-0005-0020',
      M14: '2026年05月记账凭证', M15: '2026-05-10', M16: '记-004',
      M17: '张三', M18: '采购发票-增值税专用.pdf', M19: '内部',
      M20: '30年', M21: '5月份采购办公用品', M22: '电子文件',
      M23: '202605_记账凭证.pdf', M24: '2.3 MB', M25: 'PDF',
      M26: '2026-05-10 14:30:00', M27: 'A3F2B8C1...', M28: '—',
      M29: '2026', M30: '会计凭证', M31: '记-004',
      M32: '2026-05-01', M33: '2026-05-31', M34: 'CNY',
      M35: '23,500.00', M36: '3', M37: '/archives/2026/...',
      M38: '—', M39: '—',
      M40: '责任者', M41: '张三', M42: 'EMP-001',
      M43: '归档', M44: '2026年5月凭证归档', M45: '5月份凭证整理归档',
      M46: '2026-05-31 17:00:00', M47: '文件-机构人员',
      M48: 'Z001-KU·01·2026-D30-0005-0020', M49: '张三',
      // 卷级元数据模拟值
      V1: 'Z001', V2: 'KU', V3: '2026', V4: 'PZ',
      V5: '0005', V6: 'Z001-KU·PZ·2026-D30-0005',
      V7: '2026年6月银行付款凭证（第1‒50号）', V8: '2026-06-01~2026-06-30',
      V9: '30年', V10: '50', V11: '102',
      V12: 'XX集团有限公司', V13: '李四', V14: '2026-07-05',
      V15: '王五', V16: '2026-07-08', V17: 'A区-03架-05层',
      V18: '已扫描', V19: 'E5B2A3C1...', V20: '—',
      // 卷件关联模拟值
      VA1: '纸质数字化', VA2: 'Z001-KU·PZ·2026-D30-0005',
      VA3: 'Z001-KU·PZ·2026-D30-0005-0020', VA4: '0020',
      VA5: '81', VA6: '83',
      // 盒级元数据模拟值（B1-B29）
      B1: 'BOX-2026-KP-001', B2: 'Z001', B3: 'KU',
      B4: '2026', B5: '记账凭证', B6: '30年', B7: '财务部',
      B8: '0001-0050', B9: '—', B10: '5', B11: '250',
      B12: '2026-06-01~2026-06-30', B13: '06', B14: '3', B15: '1',
      B16: 'A区', B17: '03架', B18: '05层', B19: '12位',
      B20: '李四', B21: '2026-07-05', B22: '张三', B23: '王五',
      B24: '已封盒', B25: 'YJ-2026-001', B26: '盒内第25号凭证存在补制件，见备考表',
      B27: 'ELEC-BATCH-2026-001', B28: 'DVD-2026-0032', B29: '一致',
    };
    return commonMap[id] || '—';
  };

  // 获取字段中文名
  const fieldName = (id: string): string => {
    return allMetadata.find((m) => m.id === id)?.name || id;
  };

  // 获取字段所属实体类型
  const fieldEntityType = (id: string): string => {
    return allMetadata.find((m) => m.id === id)?.entityType || '';
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-[640px] max-w-[95vw] bg-white h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-bold text-slate-800">详情页布局设置</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 统计 + 快捷操作 */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">
              展示 <strong className="text-sky-600">{visibleCount}</strong> / {totalCount} 个字段
              <span className="ml-2 text-xs text-slate-400">
                | 未采用: {notAdoptedFields.length}
              </span>
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button type="button"
                onClick={() => applyPreset(contextId, recommendedIds)}
                className="px-2 py-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors"
                title="仅显示推荐常用字段">
                <Star className="w-3 h-3 inline mr-0.5" />推荐常用
              </button>
              <button type="button" onClick={() => setAllVisible(contextId, true)}
                className="px-2 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-md hover:bg-sky-100 transition-colors">
                全部显示
              </button>
              <button type="button" onClick={() => setAllVisible(contextId, false)}
                className="px-2 py-1 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors">
                全部隐藏
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            拖拽手柄调整顺序，<Check className="w-3 h-3 inline mx-0.5" />采用 / <Eye className="w-3 h-3 inline mx-0.5" />展示 / <Star className="w-3 h-3 inline mx-0.5" />推荐常用 三层配置
          </p>
        </div>

        {/* 预览区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ── 可见字段预览卡片 ── */}
          <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700">
                <Package className="w-4 h-4 inline mr-1" />会计档案详情卡片（预览）—— 件级+卷级+盒级元数据
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">拖拽字段调整顺序，勾选控制可见性 — 字段从左到右排列，自动换行</p>
            </div>

            {visibleFields.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                <ArrowUp className="w-4 h-4 inline mr-1" />暂无可见字段，点击上方「全部显示」或从下方添加
              </div>
            ) : (
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {visibleFields.map((field) => {
                    const meta = allMetadata.find((m) => m.id === field.id);
                    const isMandatory = meta?.mandatory === '必选';
                    const isVolumeField = field.id.startsWith('V') || field.id.startsWith('VA');
                    const isBoxField = field.id.startsWith('B');
                    return (
                      <div
                        key={field.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, field.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, field.id)}
                        className={`group inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg bg-white hover:shadow-sm cursor-default transition-all ${
                          isBoxField
                            ? 'border-teal-200 hover:border-teal-300'
                            : isVolumeField
                            ? 'border-amber-200 hover:border-amber-300'
                            : 'border-slate-200 hover:border-sky-300'
                        }`}
                      >
                        {/* 拖拽手柄 */}
                        <span className="cursor-grab active:cursor-grabbing text-slate-200 group-hover:text-slate-400 transition-colors">
                          <GripVertical className="w-3 h-3" />
                        </span>

                        {/* 👁 展示开关 */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleVisibility(contextId, field.id); }}
                          className={`p-0.5 rounded transition-colors ${field.visible ? 'text-sky-500 hover:bg-sky-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                          title={field.visible ? '已展示（点击隐藏）' : '未展示（点击显示）'}
                        >
                          {field.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </button>

                        {/* <Star className="w-3 h-3 inline mr-0.5" />推荐常用开关 */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleRecommended(contextId, field.id); }}
                          className={`p-0.5 rounded transition-colors ${field.recommended ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'}`}
                          title={field.recommended ? '推荐常用（点击取消）' : '非推荐（点击设为推荐）'}
                        >
                          <svg className="w-3 h-3" viewBox="0 0 20 20" fill={field.recommended ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                            <polygon points="10,1 13,7 19,8 14,13 15,19 10,16 5,19 6,13 1,8 7,7" />
                          </svg>
                        </button>

                        {/* 编号 */}
                        <span className={`text-[10px] font-mono font-bold shrink-0 ${
                          isBoxField ? 'text-teal-600' : isVolumeField ? 'text-amber-600' : 'text-sky-600'
                        }`}>{field.id}</span>

                        {/* 名称 */}
                        <span className="text-xs text-slate-700 font-medium whitespace-nowrap">{fieldName(field.id)}</span>

                        {/* 冒号 */}
                        <span className="text-xs text-slate-300">:</span>

                        {/* 模拟值 */}
                        <span className="text-xs text-slate-500 font-mono truncate max-w-[120px]">
                          {mockValue(field.id)}
                        </span>

                        {/* 必选标记 */}
                        {isMandatory && <span className="text-[9px] text-red-400 shrink-0">*</span>}

                        {/* 实体类型标记（卷级/盒级特殊标记） */}
                        {isBoxField && (
                          <span className="text-[8px] text-teal-500 bg-teal-50 px-1 rounded shrink-0">盒</span>
                        )}
                        {isVolumeField && (
                          <span className="text-[8px] text-amber-500 bg-amber-50 px-1 rounded shrink-0">卷</span>
                        )}

                        {/* ✓ 采用开关 */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleAdopted(contextId, field.id); }}
                          className="p-0.5 text-slate-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                          title="取消采用此字段"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── 隐藏字段区（已采用但未展示） ── */}
          {hiddenFields.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">已采用 · 可添加字段</span>
                <span className="text-xs text-slate-400">（{hiddenFields.length} 个）</span>
              </div>
              <div className="border border-dashed border-slate-300 rounded-xl bg-slate-50/50 p-2 space-y-0.5">
                {hiddenFields.map((field) => {
                  const isVolumeField = field.id.startsWith('V') || field.id.startsWith('VA');
                  const isBoxField = field.id.startsWith('B');
                  return (
                    <div
                      key={field.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer group ${
                        isBoxField ? 'hover:border-teal-200' : isVolumeField ? 'hover:border-amber-200' : ''
                      }`}
                      onClick={() => toggleVisibility(contextId, field.id)}
                    >
                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-md hover:bg-sky-100 transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        显示
                      </button>
                      <span className={`text-xs font-mono font-bold ${
                        isBoxField ? 'text-teal-400' : isVolumeField ? 'text-amber-400' : 'text-slate-300'
                      }`}>{field.id}</span>
                      <span className="text-xs text-slate-500">{fieldName(field.id)}</span>
                      <span className="text-[10px] text-slate-300 font-mono truncate">
                        {allMetadata.find((m) => m.id === field.id)?.englishName || ''}
                      </span>
                      {isBoxField && (
                        <span className="text-[9px] text-teal-400 bg-teal-50 px-1 rounded">盒级</span>
                      )}
                      {isVolumeField && (
                        <span className="text-[9px] text-amber-400 bg-amber-50 px-1 rounded">卷级</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 未采用字段区 ── */}
          {notAdoptedFields.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">未采用字段</span>
                <span className="text-xs text-slate-400">（{notAdoptedFields.length} 个）</span>
              </div>
              <div className="border border-dashed border-red-200 rounded-xl bg-red-50/30 p-2 space-y-0.5">
                {notAdoptedFields.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white hover:shadow-sm transition-all cursor-pointer group"
                    onClick={() => toggleAdopted(contextId, field.id)}
                  >
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      采用
                    </button>
                    <span className="text-xs font-mono font-bold text-slate-400">{field.id}</span>
                    <span className="text-xs text-slate-500">{fieldName(field.id)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white shrink-0">
          <button type="button" onClick={onClose}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors">
            <Check className="w-4 h-4" />
            确认布局（{visibleCount} 个字段可见）
          </button>
        </div>
      </div>
    </div>
  );
};

// ========== UI 组件 ==========
interface SectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  metadata: MetadataItem[];
  isExpanded: boolean;
  onToggle: () => void;
  /** 卷级标记（用于视觉区分，琥珀色） */
  isVolumeSection?: boolean;
  /** 盒级标记（用于视觉区分，青色） */
  isBoxSection?: boolean;
}

const MetadataSection: React.FC<SectionProps> = ({ title, description, icon, metadata, isExpanded, onToggle, isVolumeSection, isBoxSection }) => {
  const borderColor = isBoxSection ? 'border-teal-200' : isVolumeSection ? 'border-amber-200' : 'border-slate-200';
  const hoverBg = isBoxSection ? 'hover:bg-teal-50/50' : isVolumeSection ? 'hover:bg-amber-50/50' : 'hover:bg-slate-50';
  const iconBg = isBoxSection ? 'bg-teal-100' : isVolumeSection ? 'bg-amber-100' : 'bg-slate-100';
  const titleColor = isBoxSection ? 'text-teal-800' : isVolumeSection ? 'text-amber-800' : 'text-slate-800';
  const headerBg = isBoxSection ? 'bg-teal-50/50' : isVolumeSection ? 'bg-amber-50/50' : 'bg-slate-50';
  const rowHoverBg = isBoxSection ? 'hover:bg-teal-50/30' : isVolumeSection ? 'hover:bg-amber-50/30' : 'hover:bg-sky-50/30';
  const idColor = isBoxSection ? 'text-teal-600' : isVolumeSection ? 'text-amber-600' : 'text-sky-600';
  const subIdColor = isBoxSection ? 'text-teal-500' : isVolumeSection ? 'text-amber-500' : 'text-sky-500';
  return (
    <div className={`border rounded-xl overflow-hidden bg-white ${borderColor}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-5 py-4 transition-colors cursor-pointer text-left ${hoverBg}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>
            {icon}
          </div>
          <div>
            <h3 className={`text-sm font-bold ${titleColor}`}>{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{description}（{metadata.length} 项）</p>
          </div>
        </div>
        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {isExpanded && (
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className={`border-b border-slate-100 ${headerBg}`}>
                <th className="text-left px-4 py-2.5 font-bold text-slate-600 w-12">编号</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-600 w-24">中文名称</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-600 w-28">英文名称</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-600 min-w-48">定义</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-600 w-16">必选性</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-600 w-16">可重复性</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-600 w-12">数据类型</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-600 w-36">值域</th>
                <th className="text-left px-4 py-2.5 font-bold text-slate-600 w-40">捕获节点</th>
              </tr>
            </thead>
            <tbody>
              {metadata.map((item, idx) => (
                <React.Fragment key={item.id}>
                  <tr className={`border-b border-slate-50 ${rowHoverBg} transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                    <td className={`px-4 py-2.5 font-mono font-bold ${idColor}`}>{item.id}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-700">{item.name}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px]">{item.englishName}</td>
                    <td className="px-4 py-2.5 text-slate-600 leading-relaxed">{item.definition}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        item.mandatory === '必选' ? 'bg-red-50 text-red-600 border border-red-200' :
                        item.mandatory === '条件可选' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                        'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>{item.mandatory}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{item.repeatable}</td>
                    <td className="px-4 py-2.5 text-slate-500">{item.dataType}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-[11px]">{item.valueRange || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-[11px]">{item.captureNode}</td>
                  </tr>
                  {item.subItems?.map((sub) => (
                    <tr key={sub.id} className={`border-b border-slate-50 bg-slate-50/20 ${rowHoverBg} transition-colors`}>
                      <td className={`px-4 py-2 pl-8 font-mono font-bold ${subIdColor}`}>{sub.id}</td>
                      <td className="px-4 py-2 font-bold text-slate-600">├ {sub.name}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono text-[11px]">{sub.englishName}</td>
                      <td className="px-4 py-2 text-slate-500 leading-relaxed">{sub.definition}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          sub.mandatory === '必选' ? 'bg-red-50 text-red-600 border border-red-200' :
                          'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>{sub.mandatory}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-400">{sub.repeatable}</td>
                      <td className="px-4 py-2 text-slate-400">{sub.dataType}</td>
                      <td className="px-4 py-2 text-slate-400 text-[11px]">{sub.valueRange || '—'}</td>
                      <td className="px-4 py-2 text-slate-400 text-[11px]">{sub.captureNode}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ========== 主页面 ==========
const AccountingMetadataPage: React.FC = () => {
  const [mode, setMode] = useState<MetadataMode>('accounting-archive');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    fileEntity: true,
    agentEntity: false,
    businessEntity: false,
    relation: false,
    volumeEntity: false,
    volumeAssociation: false,
    boxIdentification: false,
    boxClassification: false,
    boxContentRange: false,
    boxPhysicalLocation: false,
    boxProcessManagement: false,
    boxDualSystem: false,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedContext, setSelectedContext] = useState<EntityContextId>('archive-item');
  const { initContext, getFields, getVisibleIds } = useMetadataDisplayStore();

  const stats = useMemo(() => computeStats(), []);
  const allMetadata = useMemo(() => getAllMetadata(), []);
  const allIds = useMemo(() => ALL_METADATA_IDS, []);

  // 上下文切换时初始化对应上下文
  useEffect(() => {
    const fieldIds = getAllFieldIds(selectedContext);
    const defaultIds = getDefaultVisibleIds(selectedContext);
    initContext(selectedContext, fieldIds, defaultIds);
  }, [selectedContext, initContext]);

  // 当前上下文的字段配置
  const contextFields = useMemo(() => getFields(selectedContext), [getFields, selectedContext]);
  const visibleCount = contextFields.filter(f => f.adopted && f.visible).length;
  const totalCount = contextFields.length;

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex-1 overflow-auto animate-in fade-in duration-200 p-6">
      <div className="max-w-full">
        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">元数据配置</h2>
            <p className="text-sm text-slate-500 mt-1">依据《DA/T 94—2022》附录A（件级）·《DA/T 39》（卷级/盒级）·《DA/T 42—2022》（装盒规范）· 件级+卷级+盒级全部元数据</p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
          >
            <Settings className="w-4 h-4" />
            页面设置
            <span className="text-xs text-sky-400">
              （{visibleCount}/{totalCount}）
            </span>
          </button>
        </div>

        {/* ── Tab 切换：会计档案元数据 | 原始凭证元数据 ── */}
        <div className="mb-2 flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMode(opt.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer ${
                mode === opt.key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {opt.key === 'source-doc'
                ? <FileSpreadsheet className="w-4 h-4" />
                : <FileText className="w-4 h-4" />
              }
              {opt.label}
            </button>
          ))}
        </div>

        {/* ── 实体上下文选择器（仅在会计档案模式下显示） ── */}
        {mode === 'accounting-archive' && (
          <div className="mb-4 flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            {Object.values(ENTITY_CONTEXTS).map((ctx) => (
              <button
                key={ctx.id}
                type="button"
                onClick={() => setSelectedContext(ctx.id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                  selectedContext === ctx.id
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {ctx.label}
                <span className="text-[10px] text-slate-400 ml-0.5">
                  ({getAllFieldIds(ctx.id).length})
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ── 原始凭证元数据模式 ── */}
        {mode === 'source-doc' && (
          <SourceDocMetadataPanel />
        )}

        {/* ── 会计档案元数据（件级+卷级，始终完整展示） ── */}
        {mode === 'accounting-archive' && (
          <>
        {/* 概览统计卡片 */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white mb-4">
          <button
            type="button"
            onClick={() => toggleSection('overview')}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center">
                <FileText className="w-4 h-4 text-sky-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">元数据概览</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  DA/T 39 卷级+盒级 + DA/T 42 装盒规范 + DA/T 94-2022 附录A 件级 · 盒→卷→件→凭证四级穿透
                </p>
              </div>
            </div>
            {expandedSections.overview ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedSections.overview && (
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-4">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-slate-700">{stats.totalCount}</div>
                  <div className="text-xs text-slate-500 mt-0.5">元数据项总数</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-red-600">{stats.mandatoryCount}</div>
                  <div className="text-xs text-slate-500 mt-0.5">必选项</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-slate-500">{stats.optionalCount}</div>
                  <div className="text-xs text-slate-500 mt-0.5">可选项</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-amber-600">{stats.conditionalCount}</div>
                  <div className="text-xs text-slate-500 mt-0.5">条件可选</div>
                </div>
                <div className="bg-sky-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-sky-600">7</div>
                  <div className="text-xs text-slate-500 mt-0.5">实体类型</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-600">3</div>
                  <div className="text-xs text-slate-500 mt-0.5">来源系统类型</div>
                </div>
                <div className="bg-violet-50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-violet-600">DA/T 39+42+94</div>
                  <div className="text-xs text-slate-500 mt-0.5">参考标准</div>
                </div>
              </div>

              {/* 实体类型分布 */}
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 leading-relaxed mb-3">
                <p className="font-bold text-slate-600 mb-1">实体类型分布：</p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-block px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-full">
                    件级文件实体 {stats.fileEntityCount} 项
                  </span>
                  <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                    件级机构人员实体 {stats.agentEntityCount} 项
                  </span>
                  <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                    件级业务实体 {stats.businessEntityCount} 项
                  </span>
                  <span className="inline-block px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">
                    件级实体关系 {stats.relationCount} 项
                  </span>
                  <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-300 rounded-full font-bold">
                    卷级元数据 {stats.volumeEntityCount} 项
                  </span>
                  <span className="inline-block px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-300 rounded-full font-bold">
                    卷件关联 {stats.volumeAssociationCount} 项
                  </span>
                  <span className="inline-block px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-300 rounded-full font-bold">
                    盒级元数据 {stats.boxTotalCount} 项
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 leading-relaxed">
                <p className="font-bold text-slate-600 mb-1">方案说明：</p>
                本元数据方案参考 DA/T 46《文书类电子文件元数据方案》、DA/T 39《会计档案案卷格式》、
                DA/T 94《电子会计档案管理规范》、DA/T 42《会计档案整理规范》制定。件级元数据依据 DA/T 94-2022 附录A（M1~M49），
                卷级元数据依据 DA/T 39 卷皮格式要求（V1~V20），卷件关联元数据依据"纸质数字化副本与原件关联"实务要求（VA1~VA6），
                盒级元数据依据 DA/T 39-2008 卷盒封面脊背必填项 + DA/T 42-2022 装盒分类边界规范 + DA/T 94-2022 双套制关联扩展（B1~B29）。
                会计档案统一按卷管理，盒→卷→件→原始凭证四级数据自上而下穿透与自下而上溯源体系已完整构建。
              </div>
            </div>
          )}
        </div>

        {/* ── 卷级元数据（始终展示） ── */}
            <div className="mb-4">
              <MetadataSection
                title="卷级元数据"
                description="DA/T 39 会计档案案卷格式 — 描述案卷整卷实体的结构化元数据"
                icon={<BookOpen className="w-4 h-4 text-amber-600" />}
                metadata={volumeEntityRaw}
                isExpanded={expandedSections.volumeEntity}
                onToggle={() => toggleSection('volumeEntity')}
                isVolumeSection
              />
            </div>

            <div className="mb-4">
              <MetadataSection
                title="卷件关联实体元数据"
                description="件级电子文件与卷级实体案卷的双向关联关系"
                icon={<GitBranch className="w-4 h-4 text-orange-600" />}
                metadata={volumeAssociationRaw}
                isExpanded={expandedSections.volumeAssociation}
                onToggle={() => toggleSection('volumeAssociation')}
                isVolumeSection
              />
            </div>

        {/* ── 盒级元数据（B1-B29，六大类） ── */}

            <div className="mb-4">
              <MetadataSection
                title="基础标识元数据（盒级）"
                description="DA/T 39-2008 · DA/T 13-2022 — 全系统统一的容器身份主键，盒号按编码规则自动生成"
                icon={<Archive className="w-4 h-4 text-teal-600" />}
                metadata={boxIdentificationRaw}
                isExpanded={expandedSections.boxIdentification}
                onToggle={() => toggleSection('boxIdentification')}
                isBoxSection
              />
            </div>

            <div className="mb-4">
              <MetadataSection
                title="分类合规元数据（盒级）"
                description="DA/T 42-2022 — 装盒合规性校验核心载体，同一年度+同一类别+同一保管期限方可装盒"
                icon={<FileText className="w-4 h-4 text-teal-600" />}
                metadata={boxClassificationRaw}
                isExpanded={expandedSections.boxClassification}
                onToggle={() => toggleSection('boxClassification')}
                isBoxSection
              />
            </div>

            <div className="mb-4">
              <MetadataSection
                title="内容范围元数据（盒级）"
                description="DA/T 39-2008 — 卷盒封面、脊背法定必录项，系统自动提取起止号/数量/日期，可直接映射生成标准化卷盒打印模板"
                icon={<BookOpen className="w-4 h-4 text-teal-600" />}
                metadata={boxContentRangeRaw}
                isExpanded={expandedSections.boxContentRange}
                onToggle={() => toggleSection('boxContentRange')}
                isBoxSection
              />
            </div>

            <div className="mb-4">
              <MetadataSection
                title="物理位置元数据（盒级）"
                description="库房管理扩展元数据 — 库房号·档案架号·架层号·层内位号，支持智能库房联动与快速盘点定位"
                icon={<Folders className="w-4 h-4 text-teal-600" />}
                metadata={boxPhysicalLocationRaw}
                isExpanded={expandedSections.boxPhysicalLocation}
                onToggle={() => toggleSection('boxPhysicalLocation')}
                isBoxSection
              />
            </div>

            <div className="mb-4">
              <MetadataSection
                title="流程管理元数据（盒级）"
                description="全生命周期流程追溯 — 装盒人/日期自动回填，档案状态关联审批流程，备考说明对应备考表内容"
                icon={<Users className="w-4 h-4 text-teal-600" />}
                metadata={boxProcessManagementRaw}
                isExpanded={expandedSections.boxProcessManagement}
                onToggle={() => toggleSection('boxProcessManagement')}
                isBoxSection
              />
            </div>

            <div className="mb-4">
              <MetadataSection
                title="双套制关联元数据（盒级）"
                description="DA/T 94-2022 — 纸质+电子双套归档对应关系，电子档案批次号+存储介质标识+双套校验状态"
                icon={<Link2 className="w-4 h-4 text-teal-600" />}
                metadata={boxDualSystemRaw}
                isExpanded={expandedSections.boxDualSystem}
                onToggle={() => toggleSection('boxDualSystem')}
                isBoxSection
              />
            </div>

        {/* ── 件级元数据 ── */}

        {/* 文件实体元数据 */}
        <div className="mb-4">
          <MetadataSection
            title="文件实体元数据"
            description="表A.1 — 描述电子会计档案文件自身的内容、结构和形式特征"
            icon={<FileText className="w-4 h-4 text-sky-600" />}
            metadata={fileEntityRaw}
            isExpanded={expandedSections.fileEntity}
            onToggle={() => toggleSection('fileEntity')}
          />
        </div>

        {/* 机构人员实体元数据 */}
        <div className="mb-4">
          <MetadataSection
            title="机构人员实体元数据"
            description="表A.2 — 描述与电子会计档案相关的机构或人员信息"
            icon={<Users className="w-4 h-4 text-emerald-600" />}
            metadata={agentEntityRaw}
            isExpanded={expandedSections.agentEntity}
            onToggle={() => toggleSection('agentEntity')}
          />
        </div>

        {/* 业务实体元数据 */}
        <div className="mb-4">
          <MetadataSection
            title="业务实体元数据"
            description="表A.3 — 描述对电子会计档案所执行的各项管理业务"
            icon={<Briefcase className="w-4 h-4 text-amber-600" />}
            metadata={businessEntityRaw}
            isExpanded={expandedSections.businessEntity}
            onToggle={() => toggleSection('businessEntity')}
          />
        </div>

        {/* 实体关系元数据 */}
        <div className="mb-4">
          <MetadataSection
            title="实体关系元数据"
            description="表A.4 — 描述各元数据实体之间的关联关系"
            icon={<Link2 className="w-4 h-4 text-purple-600" />}
            metadata={relationRaw}
            isExpanded={expandedSections.relation}
            onToggle={() => toggleSection('relation')}
          />
        </div>

        <div className="text-xs text-slate-400 mt-4 text-right space-y-0.5">
          <div>件级数据来源：《DA/T 94—2022 电子会计档案管理规范》附录A（规范性）电子会计档案元数据方案 · 国家档案局 2022-07-01 实施</div>
          <div>卷级数据来源：《DA/T 39—2008 会计档案案卷格式》卷皮/卷盒格式 · 卷件关联依据"纸质数字化副本与原件关联"实务规范</div>
          <div>盒级数据来源：《DA/T 39—2008》卷盒封面脊背必填项 +《DA/T 42—2022》装盒分类边界规则 +《DA/T 94—2022》双套制电子关联扩展</div>
        </div>

          </>
        )}

      </div>

      {/* 页面设置抽屉 */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} contextId={selectedContext} />
    </div>
  );
};

export default AccountingMetadataPage;



