/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * package.ts — 档案封装包类型定义
 *
 * 依据：
 *   DA/T 48-2009  基于 XML 的电子文件封装规范
 *   DA/T 93-2022  电子档案移交接收操作规程
 *   DA/T 94-2022  电子会计档案管理规范
 */

import type { ArchiveRecord } from '../types';

/** 封装单元类型（对应 4 大会计档案类别） */
export type PackageUnitType = 'voucher' | 'ledger' | 'report' | 'other';

/** 封装前校验结果 */
export interface PreCheckResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

/** 封装单元（按规范规则自动分组的最小封装粒度） */
export interface PackageUnit {
  id: string;
  /** 封装单元类型 */
  type: PackageUnitType;
  /** 显示标签 */
  label: string;
  /** 档案类型名 */
  archiveType: string;
  /** 年度 */
  year: string;
  /** 保管期限 */
  retention: string;
  /** 关联案卷 ID（凭证类） */
  volumeId?: string;
  /** 案卷号 */
  volumeCode?: string;
  /** 全宗号 */
  fondsCode: string;
  /** 类别代码（01/02/03/04） */
  archiveTypeCode: string;
  /** 保管期限代码（D30/Y/D10） */
  retentionCode: string;
  /** 包含的记录 */
  records: ArchiveRecord[];
  /** 记录数量 */
  recordCount: number;
  /** 预估大小 */
  totalSize: string;
  /** 起始档号 */
  startArchiveCode: string;
  /** 结束档号 */
  endArchiveCode: string;
  /** 封装前校验结果 */
  preCheck: PreCheckResult;
}

/** 封装包状态 */
export type PackageStatus = 'draft' | 'generated' | 'transferred';

/** 已生成的封装包记录 */
export interface PackageRecord {
  id: string;
  /** 封装包文件名（不含扩展名，按规范命名） */
  packageName: string;
  /** 封装包格式：zip（日常归档）或 xml（正式进馆） */
  containerFormat: 'zip' | 'eep';
  /** 构成该封装包的封装单元 */
  unitIds: string[];
  /** 总记录数 */
  totalRecords: number;
  /** 总大小 */
  totalSize: string;
  /** 创建时间 */
  createdAt: string;
  /** 创建人 */
  createdBy: string;
  /** 整体 SHA-256 摘要 */
  checksum: string;
  /** 状态 */
  status: PackageStatus;
  /** 封装说明 XML 内容 */
  manifestXML: string;
  /** 封装备注 */
  remarks?: string;
}

/** 封装包 Store 状态 */
export interface PackageState {
  /** 待打包的封装单元列表（按规则自动分组） */
  packageUnits: PackageUnit[];
  /** 已生成的封装包列表 */
  generatedPackages: PackageRecord[];
  /** 选中的封装单元 ID */
  selectedUnitIds: Set<string>;
}
