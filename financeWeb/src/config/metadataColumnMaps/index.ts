/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * metadataColumnMaps — 统一导出入口
 */

// ColumnDef 类型（所有列映射共享同一接口）
export type { ColumnDef } from './voucherColumns';

// 凭证上下文
export {
  VOUCHER_COLUMN_MAP,
  getVoucherColumns,
  getVoucherDefaultColumns,
} from './voucherColumns';

// 档案条目上下文
export {
  ARCHIVE_ITEM_COLUMN_MAP,
  getArchiveItemColumns,
  getArchiveItemDefaultColumns,
  DEFAULT_ARCHIVE_ITEM_COLUMN_IDS,
} from './archiveItemColumns';

// 案卷上下文
export {
  VOLUME_COLUMN_MAP,
  getVolumeColumns,
  getVolumeDefaultColumns,
} from './volumeColumns';

// 盒上下文
export {
  BOX_COLUMN_MAP,
  getBoxColumns,
  getBoxDefaultColumns,
} from './boxColumns';
