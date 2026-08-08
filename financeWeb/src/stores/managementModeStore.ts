/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * managementModeStore — 全局管理模式切换
 *
 * 决定整个系统的界面形态：
 *   volume-mode → 按卷管理（纸质数字化），显示盒/卷/件层级
 *   item-mode   → 按件管理（纯电子文件），显示扁平列表
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ManagementMode, CarrierType } from '../types/managementMode';
import { CARRIER_TO_MODE } from '../types/managementMode';

interface ManagementModeState {
  /** 当前管理模式 */
  mode: ManagementMode;
  /** 设置模式 */
  setMode: (mode: ManagementMode) => void;
  /** 根据载体类型自动设置模式 */
  setModeByCarrier: (carrier: CarrierType) => void;
  /** 切换模式（volume ↔ item） */
  toggleMode: () => void;
}

export const useManagementModeStore = create<ManagementModeState>()(
  persist(
    (set, get) => ({
      mode: 'volume-mode',

      setMode: (mode) => set({ mode }),

      setModeByCarrier: (carrier) => set({ mode: CARRIER_TO_MODE[carrier] }),

      toggleMode: () => {
        const current = get().mode;
        set({ mode: current === 'volume-mode' ? 'item-mode' : 'volume-mode' });
      },
    }),
    { name: 'management-mode' },
  ),
);
