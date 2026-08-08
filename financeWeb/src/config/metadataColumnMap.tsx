/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * metadataColumnMap — 兼容性 re-export
 *
 * @deprecated 使用 context-specific 列映射替代：
 *   - 凭证核对/组卷工作台 → `./metadataColumnMaps/voucherColumns`
 *   - 财务/项目/时间视图  → `./metadataColumnMaps/archiveItemColumns`
 *
 * 此文件保留以确保渐进迁移期间旧导入不中断。
 */

export type { ColumnDef } from './metadataColumnMaps/archiveItemColumns';
export {
  ARCHIVE_ITEM_COLUMN_MAP as METADATA_COLUMN_MAP,
  getArchiveItemColumns as getColumnsFromMetaIds,
  getArchiveItemDefaultColumns as getDefaultColumns,
  DEFAULT_ARCHIVE_ITEM_COLUMN_IDS as DEFAULT_VOUCHER_COLUMN_IDS,
} from './metadataColumnMaps/archiveItemColumns';
