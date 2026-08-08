/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * volumeGroupingStore — 智能组卷规则配置
 *
 * 用户可在"组卷盒号配置"中自定义这些规则，generateRecommendations
 * 从本 store 读取配置执行组卷。
 *
 * 设计原则：
 *   - 不同档案类别（凭证/账簿/报告/其他）有独立的组卷周期和件数上限
 *   - 载体模式（纯电子/纸质/混合）影响盒容量约束
 *   - 配置持久化到 localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createApiPersistStorage } from '../services/configStorage';

/** 排序方式 */
export type SortField = 'month' | 'voucherNo' | 'amount';
export const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'month', label: '按月份排序' },
  { value: 'voucherNo', label: '按凭证号排序' },
  { value: 'amount', label: '按金额排序' },
];

/** 分组周期 */
export type GroupPeriod = 'month' | 'quarter' | 'halfYear' | 'year';
export const PERIOD_OPTIONS: { value: GroupPeriod; label: string }[] = [
  { value: 'month', label: '按月度' },
  { value: 'quarter', label: '按季度' },
  { value: 'halfYear', label: '按半年' },
  { value: 'year', label: '按年度' },
];

/** 载体模式 */
export type CarrierMode = 'electronic' | 'paper' | 'mixed';
export const CARRIER_MODE_OPTIONS: { value: CarrierMode; label: string; desc: string }[] = [
  { value: 'electronic', label: '纯电子', desc: '卷=盒，无厚度限制，一月一卷' },
  { value: 'paper', label: '纸质实体', desc: '需设置每盒件数上限，按盒厚度约束' },
  { value: 'mixed', label: '混合', desc: '电子+纸质并存，纸质部分受盒约束' },
];

/** 每种档案类别独立的组卷规则 */
export interface PerTypeRule {
  /** 分组周期 */
  period: GroupPeriod;
  /** 每卷最多件数 */
  maxItemsPerVolume: number;

  /** ★ 账簿类：是否按子类型（总账/明细账/日记账等）独立组卷 */
  separateByBookType?: boolean;
  /** ★ 报告类：是否将年度报告(永久)与中期报告(10年)分开组卷 */
  separateAnnualFromInterim?: boolean;
  /** ★ 其他类：是否按子类别独立组卷 */
  separateBySubCategory?: boolean;
}

/** 组卷配置 */
export interface VolumeGroupingConfig {
  /** 按年度分组 */
  groupByYear: boolean;
  /** 按档案类别分组 */
  groupByArchiveType: boolean;
  /** 按保管期限分组 */
  groupByRetention: boolean;
  /** 按部门分组（预留） */
  groupByDepartment: boolean;
  /** 卷内排序方式 */
  sortField: SortField;

  /** ★ 载体模式 */
  carrierMode: CarrierMode;
  /** ★ 纸质件每盒上限（仅 paper/mixed 模式下生效） */
  itemsPerBox: number;

  /** ★ 按档案类别的独立规则 */
  perTypeRules: Record<string, PerTypeRule>;
}

/** 默认按类别规则（严格依据 DA/T 42-2022 会计档案整理规范） */
export const DEFAULT_PER_TYPE_RULES: Record<string, PerTypeRule> = {
  '记账凭证': { period: 'month', maxItemsPerVolume: 50 },
  '会计凭证': { period: 'month', maxItemsPerVolume: 50 },
  // 账簿：按年、按子类型独立组卷（总账/明细账/日记账/辅助账簿各一卷）
  '会计账簿': { period: 'year', maxItemsPerVolume: 200, separateByBookType: true },
  // 报告：年度(永久)与中期(10年)分开组卷
  '财务报告': { period: 'year', maxItemsPerVolume: 200, separateAnnualFromInterim: true },
  '财务报表': { period: 'year', maxItemsPerVolume: 200, separateAnnualFromInterim: true },
  // 其他：按子类别+保管期限分别组卷
  '其他会计资料': { period: 'year', maxItemsPerVolume: 200, separateBySubCategory: true },
};

export const DEFAULT_CONFIG: VolumeGroupingConfig = {
  groupByYear: true,
  groupByArchiveType: true,
  groupByRetention: true,
  groupByDepartment: false,
  sortField: 'voucherNo',
  carrierMode: 'paper',
  itemsPerBox: 50,
  perTypeRules: { ...DEFAULT_PER_TYPE_RULES },
};

interface VolumeGroupingState {
  config: VolumeGroupingConfig;
  setConfig: (partial: Partial<VolumeGroupingConfig>) => void;
  /** 更新某个类别的规则 */
  setPerTypeRule: (archiveType: string, rule: Partial<PerTypeRule>) => void;
  resetConfig: () => void;
}

export const useVolumeGroupingStore = create<VolumeGroupingState>()(
  persist(
    (set) => ({
      config: { ...DEFAULT_CONFIG, perTypeRules: { ...DEFAULT_PER_TYPE_RULES } },
      setConfig: (partial) =>
        set((state) => ({ config: { ...state.config, ...partial } })),
      setPerTypeRule: (archiveType, rule) =>
        set((state) => ({
          config: {
            ...state.config,
            perTypeRules: {
              ...state.config.perTypeRules,
              [archiveType]: {
                ...(state.config.perTypeRules[archiveType] || DEFAULT_PER_TYPE_RULES['其他会计资料']),
                ...rule,
              },
            },
          },
        })),
      resetConfig: () => set({ config: { ...DEFAULT_CONFIG, perTypeRules: { ...DEFAULT_PER_TYPE_RULES } } }),
    }),
    { name: 'volume-grouping-config', storage: createApiPersistStorage() },
  ),
);
