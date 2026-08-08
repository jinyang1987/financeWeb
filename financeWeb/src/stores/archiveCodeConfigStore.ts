/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * archiveCodeConfigStore — 档号规则配置（赋号时机等）
 *
 * 持久化到 localStorage，遵循与 volumeGroupingStore 相同的 zustand + persist 模式。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createApiPersistStorage } from '../services/configStorage';

/** 赋号时机 */
export type AssignCodeTiming = 'on-confirm' | 'never';

export const ASSIGN_CODE_TIMING_OPTIONS: { value: AssignCodeTiming; label: string; desc: string }[] = [
  {
    value: 'on-confirm',
    label: '组卷时赋号',
    desc: '确认组卷时自动生成档号，适用于需进馆/移交综合档案系统的单位',
  },
  {
    value: 'never',
    label: '不赋号',
    desc: '会计档案使用自身凭证号体系，无需系统档号',
  },
];

export interface ArchiveCodeConfig {
  /** 赋号时机: on-confirm=组卷时赋号, never=不赋号 */
  assignCodeTiming: AssignCodeTiming;
  /** 卷流水位数（默认 4，如 0001） */
  serialDigitsVol: number;
  /** 盒流水位数（默认 3，如 001） */
  serialDigitsBox: number;
  /** 段分隔符（默认 -） */
  separator: string;
  /** 类别前缀（默认 KU，DA/T 13 会计档案） */
  categoryPrefix: string;
}

const DEFAULT_CONFIG: ArchiveCodeConfig = {
  assignCodeTiming: 'on-confirm',
  serialDigitsVol: 4,
  serialDigitsBox: 3,
  separator: '-',
  categoryPrefix: 'KU',
};

interface ArchiveCodeConfigState {
  config: ArchiveCodeConfig;
  setConfig: (partial: Partial<ArchiveCodeConfig>) => void;
  resetConfig: () => void;
}

export const useArchiveCodeConfigStore = create<ArchiveCodeConfigState>()(
  persist(
    (set) => ({
      config: { ...DEFAULT_CONFIG },
      setConfig: (partial) =>
        set((state) => ({ config: { ...state.config, ...partial } })),
      resetConfig: () => set({ config: { ...DEFAULT_CONFIG } }),
    }),
    { name: 'archive-code-config', storage: createApiPersistStorage() },
  ),
);

