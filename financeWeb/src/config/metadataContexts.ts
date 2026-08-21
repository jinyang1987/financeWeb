/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * metadataContexts — 实体上下文定义 + 字段注册表
 *
 * 将元数据显示体系按实体上下文拆分：
 *   - voucher：      记账凭证（组卷工作台待组卷池）
 *   - archive-item： 会计档案条目（财务视图 / 项目视图 / 时间视图）
 *   - volume：       案卷（组卷工作台案卷卡片）
 *   - box：          档案盒（盒管理）
 *
 * 每个上下文独立管理自己的字段采用/展示/推荐配置。
 */

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

export type EntityContextId = 'voucher' | 'archive-item' | 'volume' | 'box';

export interface EntityContextDef {
  id: EntityContextId;
  label: string;
  description: string;
}

export interface MetadataFieldDef {
  /** 字段标识（voucher 用描述性 ID，archive-item 用 M-ID，volume 用 V/VA-ID，box 用 B-ID） */
  id: string;
  /** 字段显示名 */
  label: string;
  /** 是否必填/核心字段 */
  mandatory: boolean;
  /** 分组（用于配置页分组展示） */
  group?: string;
  /** 标准定义说明 */
  definition?: string;
  /** 数据类型 */
  dataType?: string;
}

// ═══════════════════════════════════════════════════════════
// 实体上下文注册表
// ═══════════════════════════════════════════════════════════

export const ENTITY_CONTEXTS: Record<EntityContextId, EntityContextDef> = {
  'voucher': {
    id: 'voucher',
    label: '记账凭证',
    description: '组卷工作台（待组卷池）中展示的凭证字段',
  },
  'archive-item': {
    id: 'archive-item',
    label: '档案条目',
    description: '财务视图 / 项目视图 / 时间视图中展示的档案件级字段（DA/T 94-2022 M系列）',
  },
  'volume': {
    id: 'volume',
    label: '案卷',
    description: '组卷工作台案卷卡片中展示的案卷字段（DA/T 39 V系列 + VA系列）',
  },
  'box': {
    id: 'box',
    label: '档案盒',
    description: '盒管理中展示的档案盒字段（DA/T 42 B系列）',
  },
};

// ═══════════════════════════════════════════════════════════
// 凭证上下文字段定义（非 DA/T 94 — 这是凭证级属性）
// ═══════════════════════════════════════════════════════════

export const VOUCHER_FIELD_DEFS: MetadataFieldDef[] = [
  { id: 'VOUCHER_NO', label: '凭证号',   mandatory: true,  group: '标识' },
  { id: 'DATE',       label: '制单日期', mandatory: true,  group: '标识' },
  { id: 'SUMMARY',    label: '摘要',     mandatory: false, group: '内容' },
  { id: 'DEPARTMENT', label: '部门',     mandatory: true,  group: '标识' },
  { id: 'AMOUNT',     label: '金额',     mandatory: true,  group: '金额' },
  { id: 'ATTACHMENTS',label: '原始凭证附件', mandatory: false, group: '关联' },
];

// ═══════════════════════════════════════════════════════════
// 档案条目上下文字段定义（DA/T 94-2022 M系列 + SOURCE）
// ═══════════════════════════════════════════════════════════

export const ARCHIVE_ITEM_FIELD_DEFS: MetadataFieldDef[] = [
  { id: 'SOURCE', label: '管理模式',     mandatory: true,  group: '来源' },
  { id: 'M8',     label: '类别号',       mandatory: true,  group: '标识', definition: 'DA/T 94 M8' },
  { id: 'M9',     label: '室编案卷号',   mandatory: true,  group: '标识', definition: 'DA/T 94 M9' },
  { id: 'M11',    label: '室编件号',     mandatory: true,  group: '标识', definition: 'DA/T 94 M11' },
  { id: 'M13',    label: '档号',         mandatory: true,  group: '标识', definition: 'DA/T 94 M13' },
  { id: 'M14',    label: '题名',         mandatory: true,  group: '内容', definition: 'DA/T 94 M14' },
  { id: 'M15',    label: '日期',         mandatory: true,  group: '内容', definition: 'DA/T 94 M15' },
  { id: 'M16',    label: '文件编号',     mandatory: false, group: '标识', definition: 'DA/T 94 M16' },
  { id: 'M17',    label: '责任者',       mandatory: true,  group: '责任者', definition: 'DA/T 94 M17' },
  { id: 'M18',    label: '附件',         mandatory: false, group: '关联', definition: 'DA/T 94 M18' },
  { id: 'M19',    label: '密级',         mandatory: false, group: '安全', definition: 'DA/T 94 M19' },
  { id: 'M20',    label: '保管期限',     mandatory: true,  group: '管理', definition: 'DA/T 94 M20' },
  { id: 'M21',    label: '摘要',         mandatory: false, group: '内容', definition: 'DA/T 94 M21' },
  { id: 'M22',    label: '格式信息',     mandatory: true,  group: '技术', definition: 'DA/T 94 M22' },
  { id: 'M23',    label: '计算机文件名', mandatory: true,  group: '技术', definition: 'DA/T 94 M23' },
  { id: 'M24',    label: '计算机文件大小', mandatory: true,group: '技术', definition: 'DA/T 94 M24' },
  { id: 'M25',    label: '计算机文件格式', mandatory: true,group: '技术', definition: 'DA/T 94 M25' },
  { id: 'M27',    label: '哈希值',       mandatory: true,  group: '技术', definition: 'DA/T 94 M27' },
  { id: 'M28',    label: '电子签名',     mandatory: false, group: '技术', definition: 'DA/T 94 M28' },
  { id: 'M29',    label: '会计年度',     mandatory: true,  group: '内容', definition: 'DA/T 94 M29' },
  { id: 'M30',    label: '会计资料形式', mandatory: true,  group: '内容', definition: 'DA/T 94 M30' },
  { id: 'M31',    label: '凭证号',       mandatory: false, group: '标识', definition: 'DA/T 94 M31' },
  { id: 'M32',    label: '起始日期',     mandatory: false, group: '内容', definition: 'DA/T 94 M32' },
  { id: 'M34',    label: '币种',         mandatory: false, group: '金额', definition: 'DA/T 94 M34' },
  { id: 'M35',    label: '合计金额',     mandatory: false, group: '金额', definition: 'DA/T 94 M35' },
  { id: 'M36',    label: '页数',         mandatory: false, group: '内容', definition: 'DA/T 94 M36' },
  { id: 'M39',    label: '关联档案号',   mandatory: false, group: '关联', definition: 'DA/T 94 M39' },
];

// ═══════════════════════════════════════════════════════════
// 案卷 + 盒上下文字段（桩，后续按需补充完整定义）
// ═══════════════════════════════════════════════════════════

export const VOLUME_FIELD_DEFS: MetadataFieldDef[] = [
  { id: 'V1',  label: '案卷档号',     mandatory: true,  group: '标识', definition: 'DA/T 39 V1 · finance:volumeCode' },
  { id: 'V2',  label: '案卷题名',     mandatory: true,  group: '内容', definition: 'DA/T 39 V2 · finance:title' },
  { id: 'V3',  label: '类别号',       mandatory: true,  group: '分类', definition: 'DA/T 39 V3 · finance:volumeTypeCode (KP/KB/FB/QT)' },
  { id: 'V4',  label: '档案类型',     mandatory: false, group: '分类', definition: 'finance:volumeArchiveType（中文类别名）' },
  { id: 'V5',  label: '会计年度',     mandatory: true,  group: '内容', definition: 'DA/T 39 V5 · finance:volumeYear' },
  { id: 'V6',  label: '保管期限',     mandatory: true,  group: '管理', definition: 'DA/T 39 V6 · finance:volumeRetention' },
  { id: 'V7',  label: '期限代码',     mandatory: false, group: '管理', definition: 'finance:retentionCode (Y/D30/D10)' },
  { id: 'V8',  label: '卷状态',       mandatory: true,  group: '管理', definition: 'finance:volumeStatus (draft/confirmed/transferred)' },
  { id: 'V9',  label: '卷内件数',     mandatory: true,  group: '内容', definition: 'DA/T 39 V9 · finance:volumeTotalItems' },
  { id: 'V10', label: '卷内页数',     mandatory: false, group: '内容', definition: 'DA/T 39 V10 · finance:totalPages' },
  { id: 'V11', label: '载体类型',     mandatory: false, group: '技术', definition: 'finance:volumeCarrierType (paper/electronic/mixed)' },
  { id: 'V12', label: '密级',         mandatory: false, group: '安全', definition: 'DA/T 39 V12 · finance:volumeSecurityLevel' },
  { id: 'V13', label: '柜号',         mandatory: false, group: '位置', definition: 'finance:cabinetNo' },
  { id: 'V14', label: '架号',         mandatory: false, group: '位置', definition: 'finance:shelfNo' },
  { id: 'V15', label: '起始日期',     mandatory: false, group: '内容', definition: 'DA/T 39 V15 · finance:dateFrom' },
  { id: 'V16', label: '截止日期',     mandatory: false, group: '内容', definition: 'DA/T 39 V16 · finance:dateTo' },
  { id: 'V17', label: '组卷日期',     mandatory: false, group: '管理', definition: 'finance:createdDate' },
  { id: 'V18', label: '组卷人',       mandatory: false, group: '管理', definition: 'finance:createdBy' },
  { id: 'V19', label: '数字化副本哈希', mandatory: false, group: '技术', definition: 'finance:digitalHash' },
  { id: 'V20', label: '所属盒号',     mandatory: false, group: '位置', definition: 'boxNo（移交归盒后回填）' },
];

export const BOX_FIELD_DEFS: MetadataFieldDef[] = [
  { id: 'B1',  label: '盒号',         mandatory: true,  group: '标识', definition: 'DA/T 42 B1 · finance:boxNo' },
  { id: 'B2',  label: '盒名称',       mandatory: false, group: '标识', definition: 'DA/T 42 B2 · finance:boxName' },
  { id: 'B3',  label: '类别代码',     mandatory: true,  group: '分类', definition: 'DA/T 42 B3 · finance:typeCode (KP/KB/FB/QT)' },
  { id: 'B4',  label: '会计年度',     mandatory: true,  group: '内容', definition: 'DA/T 42 B4 · finance:boxYear' },
  { id: 'B5',  label: '保管期限',     mandatory: true,  group: '管理', definition: 'DA/T 42 B5 · finance:boxRetention' },
  { id: 'B6',  label: '盒状态',       mandatory: true,  group: '管理', definition: 'finance:boxStatus (active/sealed/stored/destroyed)' },
  { id: 'B7',  label: '密级',         mandatory: false, group: '安全', definition: 'DA/T 42 B7 · finance:boxSecurityLevel' },
  { id: 'B8',  label: '存放位置',     mandatory: false, group: '位置', definition: 'DA/T 42 B8 · finance:location（柜-架-层）' },
  { id: 'B9',  label: '盒内卷数',     mandatory: false, group: '内容', definition: 'DA/T 42 B9 · finance:volumeCount' },
  { id: 'B10', label: '盒内件数',     mandatory: false, group: '内容', definition: 'DA/T 42 B10 · finance:boxTotalItems' },
  { id: 'B11', label: '卷号起止范围', mandatory: false, group: '标识', definition: 'finance:volumeCodeRange' },
  { id: 'B12', label: '备注',         mandatory: false, group: '管理', definition: 'finance:boxRemark' },
];

// ═══════════════════════════════════════════════════════════
// 各上下文推荐默认展示字段
// ═══════════════════════════════════════════════════════════

export const DEFAULT_VOUCHER_VISIBLE_IDS = [
  'VOUCHER_NO', 'DATE', 'SUMMARY', 'DEPARTMENT', 'AMOUNT', 'ATTACHMENTS',
];

export const DEFAULT_ARCHIVE_ITEM_VISIBLE_IDS = [
  'SOURCE', 'M13', 'M31', 'M30', 'M17', 'M35', 'M29', 'M15', 'M20', 'M18',
];

export const DEFAULT_VOLUME_VISIBLE_IDS = [
  'V1', 'V2', 'V3', 'V5', 'V6', 'V8', 'V9', 'V11', 'V20',
];

export const DEFAULT_BOX_VISIBLE_IDS = [
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B9', 'B10',
];

// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════

/**
 * 获取某上下文所有字段 ID（按定义顺序）
 */
export function getAllFieldIds(contextId: EntityContextId): string[] {
  switch (contextId) {
    case 'voucher':      return VOUCHER_FIELD_DEFS.map(f => f.id);
    case 'archive-item': return ARCHIVE_ITEM_FIELD_DEFS.map(f => f.id);
    case 'volume':       return VOLUME_FIELD_DEFS.map(f => f.id);
    case 'box':          return BOX_FIELD_DEFS.map(f => f.id);
  }
}

/**
 * 获取某上下文的字段定义
 */
export function getFieldDef(contextId: EntityContextId, fieldId: string): MetadataFieldDef | undefined {
  switch (contextId) {
    case 'voucher':      return VOUCHER_FIELD_DEFS.find(f => f.id === fieldId);
    case 'archive-item': return ARCHIVE_ITEM_FIELD_DEFS.find(f => f.id === fieldId);
    case 'volume':       return VOLUME_FIELD_DEFS.find(f => f.id === fieldId);
    case 'box':          return BOX_FIELD_DEFS.find(f => f.id === fieldId);
  }
}

/**
 * 获取某上下文所有字段定义（按定义顺序）
 */
export function getAllFieldDefs(contextId: EntityContextId): MetadataFieldDef[] {
  switch (contextId) {
    case 'voucher':      return VOUCHER_FIELD_DEFS;
    case 'archive-item': return ARCHIVE_ITEM_FIELD_DEFS;
    case 'volume':       return VOLUME_FIELD_DEFS;
    case 'box':          return BOX_FIELD_DEFS;
  }
}

/**
 * 获取某上下文的推荐默认展示字段 ID
 */
export function getDefaultVisibleIds(contextId: EntityContextId): string[] {
  switch (contextId) {
    case 'voucher':      return DEFAULT_VOUCHER_VISIBLE_IDS;
    case 'archive-item': return DEFAULT_ARCHIVE_ITEM_VISIBLE_IDS;
    case 'volume':       return DEFAULT_VOLUME_VISIBLE_IDS;
    case 'box':          return DEFAULT_BOX_VISIBLE_IDS;
  }
}

