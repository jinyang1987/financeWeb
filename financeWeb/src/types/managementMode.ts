/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 管理模式 — 全局区分按卷管理（纸质数字化）与按件管理（纯电子）
 */

/** 载体类型（物理属性） */
export type CarrierType = 'paper' | 'electronic';

/** 管理模式（与载体类型绑定） */
export type ManagementMode = 'volume-mode' | 'item-mode';

/** 载体类型 → 管理模式 */
export const CARRIER_TO_MODE: Record<CarrierType, ManagementMode> = {
  paper: 'volume-mode',
  electronic: 'item-mode',
};

/** 管理模式 → 载体类型 */
export const MODE_TO_CARRIER: Record<ManagementMode, CarrierType> = {
  'volume-mode': 'paper',
  'item-mode': 'electronic',
};

/** 模式中文标签 */
export const MODE_LABELS: Record<ManagementMode, string> = {
  'volume-mode': '按卷管理（纸质数字化）',
  'item-mode': '按件管理（纯电子文件）',
};

/** 载体类型中文标签 */
export const CARRIER_LABELS: Record<CarrierType, string> = {
  paper: '纸质会计档案',
  electronic: '纯电子会计档案',
};
