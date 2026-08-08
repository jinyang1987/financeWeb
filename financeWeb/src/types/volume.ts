/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 卷件融合模型 — 案卷(Volume)、卷内编目(VolumeItem)、档号规则(ArchiveCodeRule)
 */

import type { ManagementMode } from './managementMode';

// ──────────────────────────────────────────────
// 1. 案卷实体
// ──────────────────────────────────────────────

export type VolumeStatus =
  | 'draft'       // 草稿（组卷中，可增删条目）
  | 'confirmed'   // 组卷已确认（条目锁定，volumeCode 取决于赋号时机配置）
  /** @deprecated 使用 'confirmed' 代替 */
  | 'numbered'    // 已赋卷号（向后兼容，等价于 confirmed + volumeCode 已生成）
  /** @deprecated 使用 'confirmed' 代替 */
  | 'completed'   // 已完结（向后兼容，等价于 confirmed）
  | 'transferred' // 已移交档案部
  | 'destroyed';  // 已销毁

export interface Volume {
  id: string;
  /** 卷级档号(=案卷号, 按规则生成)，如 Z001-HJ-2026-KP-D30-V001 */
  volumeCode: string;
  /** 案卷题名，如 "2026年度会计凭证-第001卷" */
  title: string;
  /** 所属全宗号 */
  fondsCode: string;
  /** 档案类别（凭证/账簿/报表/其他） */
  archiveType: string;
  /** 档案类别代码（KP/KB/FB/QT） */
  archiveTypeCode: string;
  /** 年度 */
  year: number;
  /** 保管期限（10年/30年/永久） */
  retention: string;
  /** 保管期限代码（D10/D30/Y） */
  retentionCode: string;

  // ── 物理信息 ──
  /** 卷内件数（电子件计数） */
  totalItems: number;
  /** 卷内页数（纸质扫描页数） */
  totalPages: number;
  /** 起始页号 */
  pageStart: number;
  /** 终止页号 */
  pageEnd: number;
  /** 册号（同一卷有多册时） */
  volumeCount: number;
  /** 所属档案盒ID（关联 ArchiveBox.id），仅 volume-mode 使用 */
  boxId: string;
  /** 盒号（冗余显示，从 ArchiveBox.boxNo 同步） */
  boxNo?: string;
  /** 柜号（实体存放位置） */
  cabinetNo: string;
  /** 架号 */
  shelfNo: string;

  // ── 时间 ──
  /** 卷内日期起 */
  dateFrom: string;
  /** 卷内日期止 */
  dateTo: string;
  /** 组卷日期 */
  createdDate: string;
  /** 组卷人 */
  createdBy: string;

  // ── 状态 ──
  status: VolumeStatus;
  /** 数字化副本整体哈希 */
  digitalHash: string;
  /** 是否已完成数字化扫描 */
  scanned: boolean;

  // ── 借阅/库房扩展（2026-07-18 借阅全生命周期） ──
  /** 介质类型：纯电子 | 纯实体 | 混合（实体已数字化） */
  carrierType?: 'paper' | 'electronic' | 'mixed';
  /** 密级：普通/内部/秘密/机密（借阅审批路由依据） */
  securityLevel?: string;

  // ── 关联 ──
  /** 关联的目录配置ID */
  categoryConfigId: string;
}

// ──────────────────────────────────────────────
// 2. 卷内编目项
// ──────────────────────────────────────────────

export interface VolumeItem {
  id: string;
  /** 所属案卷ID */
  volumeId: string;
  /** 关联的ArchiveRecord ID */
  recordId: string;
  /** 关联记录的件级档号（冗余，方便查询） */
  recordArchiveCode: string;
  /** 卷内件号（顺序号，从1开始） */
  itemNo: number;
  /** 起始页号（纸质中的页码） */
  pageStart: number;
  /** 终止页号 */
  pageEnd: number;
  /** 件题名 */
  title: string;
  /** 日期 */
  date: string;
  备注?: string;
}

// ──────────────────────────────────────────────
// 3. 档号编码规则
// ──────────────────────────────────────────────

export type ArchiveCodeSegmentType =
  | 'fondsCode'       // 全宗号（固定）
  | 'categoryCode'    // 门类代码（如 HJ = 会计档案）
  | 'year'            // 年度
  | 'archiveTypeCode' // 档案类别代码（KP/KB/FB/QT）
  | 'retentionCode'   // 保管期限代码（Y/D30/D10）
  | 'orgCode'         // 机构/部门代码
  | 'boxSerial';      // 盒号段（仅 volume-mode 使用）

export interface ArchiveCodeSegment {
  type: ArchiveCodeSegmentType;
  /** 显示名称 */
  label: string;
  /** 定长（不足补位） */
  length?: number;
  /** 补位字符（默认"0"） */
  paddingChar?: string;
  /** 段分隔符（默认"-"，最后一段后可空） */
  separator?: string;
  /** 排序 */
  order: number;
  /** 固定值（如门类代码 HJ） */
  fixedValue?: string;
  /** 来源：固定/自动推导/用户选择 */
  source?: 'fixed' | 'auto' | 'config';
}

export interface ArchiveCodeSerialConfig {
  /** 显示名称，如 "案卷号" */
  label: string;
  /** 定长（如 4 位: 0001-9999） */
  length: number;
  /** 补位字符（默认"0"） */
  paddingChar: string;
  /** 前缀标记（通常为空字符串） */
  prefix: string;
  /** 与该流水号段之间的分隔符（如 "-"），在上一段之后、本段之前插入 */
  separator: string;
  /** 重置规则 */
  resetOn: 'year' | 'month' | 'never';
}

export interface ArchiveCodeRule {
  id: string;
  /** 规则名称，如 "标准会计档案档号规则" */
  ruleName: string;
  /** 是否默认规则 */
  isDefault: boolean;

  /** 管理模式 — 决定是否启用盒级/卷级流水号段 */
  managementMode: ManagementMode;

  /** 档号前缀段（卷和件共享） */
  segments: ArchiveCodeSegment[];

  /** 盒级流水号段配置（仅 volume-mode 使用） */
  boxSerial?: ArchiveCodeSerialConfig;

  /** 卷级流水号段配置 */
  volumeSerial: ArchiveCodeSerialConfig;

  /** 件级流水号段配置 */
  itemSerial: ArchiveCodeSerialConfig;

  /** 卷级档号示例，如 "Z001-HJ-2026-KP-D30-V001" */
  exampleVolumeCode: string;
  /** 件级档号示例，如 "Z001-HJ-2026-KP-D30-0001" */
  exampleItemCode: string;
}

// ──────────────────────────────────────────────
// 4. 组卷推荐
// ──────────────────────────────────────────────

export interface VolumeRecommendation {
  id: string;
  /** 推荐案卷题名 */
  title: string;
  /** 年度 */
  year: number;
  /** 档案类别代码（DA/T 数字代码 01-04，用于档号段） */
  archiveTypeCode: string;
  /** 档案类别中文名（如 记账凭证），接受推荐建卷时写入案卷 */
  archiveType?: string;
  /** 保管期限代码 */
  retentionCode: string;
  /** 保管期限中文名（如 30年），接受推荐建卷时写入案卷 */
  retention?: string;
  /** 预估件数 */
  estimatedItems: number;
  /** 预估页数 */
  estimatedPages: number;
  /** 日期范围起 */
  dateFrom: string;
  /** 日期范围止 */
  dateTo: string;
  /** 推荐的记录ID列表 */
  recordIds: string[];
}

// ──────────────────────────────────────────────
// 5. 默认值
// ──────────────────────────────────────────────

/**
 * 默认纸质档案档号规则（volume-mode，依据 DA/T 13-2022、DA/T 94-2022）
 *
 * 标准结构（含盒号段）：
 *   全宗号(4位) - KU·二级类别号(2位)·年度(4位) - 保管期限代码 - 盒号(3位) - 案卷号(4位) - 件号(4位)
 *
 * 示例：Z001-KU·01·2026-D30-B01-0005-0020
 *       ──── ── ── ──── ─── ─── ──── ────
 *       全宗  KU 01  2026  D30  B01  0005  0020
 */
export const defaultPaperCodeRule: ArchiveCodeRule = {
  id: 'rule-default-paper',
  ruleName: '纸质会计档案档号规则 (DA/T 13-2022)',
  isDefault: true,
  managementMode: 'volume-mode',
  segments: [
    { type: 'fondsCode', label: '全宗号', length: 4, separator: '-', order: 1, source: 'fixed' },
    { type: 'categoryCode', label: '门类代码', length: 2, separator: '·', order: 2, fixedValue: 'KU', source: 'fixed' },
    { type: 'archiveTypeCode', label: '档案类别', length: 2, separator: '·', order: 3, source: 'auto' },
    { type: 'year', label: '年度', length: 4, separator: '-', order: 4, source: 'auto' },
    { type: 'retentionCode', label: '保管期限', length: 3, separator: '', order: 5, source: 'auto' },
  ],
  boxSerial: { label: '盒号', length: 3, paddingChar: '0', prefix: 'B', separator: '-', resetOn: 'year' },
  volumeSerial: { label: '案卷号', length: 4, paddingChar: '0', prefix: '', separator: '-', resetOn: 'year' },
  itemSerial: { label: '件号', length: 4, paddingChar: '0', prefix: '', separator: '-', resetOn: 'never' },
  exampleVolumeCode: 'Z001-KU·01·2026-D30-B01-0005',
  exampleItemCode: 'Z001-KU·01·2026-D30-B01-0005-0020',
};

/**
 * 默认纯电子档案档号规则（item-mode，依据 DA/T 94-2022）
 *
 * 标准结构（无盒号/卷号段，仅件号）：
 *   全宗号(4位) - KU·二级类别号(2位)·年度(4位) - 保管期限代码 - 件号(4位)
 *
 * 示例：Z001-KU·01·2026-D30-0020
 */
export const defaultElectronicCodeRule: ArchiveCodeRule = {
  id: 'rule-default-electronic',
  ruleName: '纯电子会计档案档号规则 (DA/T 94-2022)',
  isDefault: true,
  managementMode: 'item-mode',
  segments: [
    { type: 'fondsCode', label: '全宗号', length: 4, separator: '-', order: 1, source: 'fixed' },
    { type: 'categoryCode', label: '门类代码', length: 2, separator: '·', order: 2, fixedValue: 'KU', source: 'fixed' },
    { type: 'archiveTypeCode', label: '档案类别', length: 2, separator: '·', order: 3, source: 'auto' },
    { type: 'year', label: '年度', length: 4, separator: '-', order: 4, source: 'auto' },
    { type: 'retentionCode', label: '保管期限', length: 3, separator: '', order: 5, source: 'auto' },
  ],
  // item-mode 无盒号段、无卷号段
  volumeSerial: { label: '案卷号', length: 4, paddingChar: '0', prefix: '', separator: '-', resetOn: 'year' },
  itemSerial: { label: '件号', length: 4, paddingChar: '0', prefix: '', separator: '-', resetOn: 'never' },
  exampleVolumeCode: 'Z001-KU·01·2026-D30-0005',
  exampleItemCode: 'Z001-KU·01·2026-D30-0020',
};

/** @deprecated 使用 defaultPaperCodeRule 代替 */
export const defaultArchiveCodeRule = defaultPaperCodeRule;
