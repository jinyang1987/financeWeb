/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * archiveBoxStore — 档案盒状态管理（P1-② 已切 ams-server 真后端）
 *
 * 职责：
 *   1. 盒列表的服务端数据镜像（loadBoxes 拉取，全宗切换时刷新）
 *   2. 盒内案卷查询（fetchBoxVolumes 按需拉取）
 *   3. 盒写操作（封盒/开封/上架/删空盒）——2026-08-16 起全部走真实服务端端点
 *      （原为本地乐观更新假持久化，贯通审计后接真；操作成功后重拉列表以服务端为准）
 *
 * 建盒由卷域移交归盒时自动完成（VolumeService.transfer），前端不主动建盒。
 * 仿真种子已清除（2026-07-20 决策：假数据分域随切随清）。
 */

import { create } from 'zustand';
import type { ArchiveBox, BoxStatus } from '../types/archiveBox';
import {
  fetchBoxes, sealBoxApi, unsealBoxApi, deleteBoxApi,
  shelveBoxApi, shelveBoxAutoApi, unshelveBoxApi,
  type ShelfPosition,
} from '../services/boxService';

interface ArchiveBoxState {
  /** 全量盒列表（服务端镜像） */
  boxes: ArchiveBox[];
  setBoxes: (boxes: ArchiveBox[]) => void;

  /** 加载状态 */
  loading: boolean;

  /** 拉取指定全宗的全部盒（服务端镜像重建） */
  loadBoxes: (fondsCode: string) => Promise<void>;

  /** 封盒（active → sealed，服务端持久化） */
  sealBox: (id: string, fondsCode: string) => Promise<void>;
  /** 开封（sealed → active，服务端持久化） */
  unsealBox: (id: string, fondsCode: string) => Promise<void>;
  /** 上架（密集架格位定位：'auto' 自动分配第一个空格位，或指定架位坐标；active/sealed → stored） */
  shelveBox: (id: string, pos: ShelfPosition | 'auto', fondsCode: string) => Promise<void>;
  /** 下架（stored → sealed，架位清除） */
  unshelveBox: (id: string, fondsCode: string) => Promise<void>;
  /** 删除空盒（盒内有卷或在架时服务端拒绝） */
  deleteBox: (id: string, fondsCode: string) => Promise<void>;

  /** 按年度筛选盒 */
  boxesByYear: (year: number) => ArchiveBox[];
  /** 按状态筛选盒 */
  boxesByStatus: (status: BoxStatus) => ArchiveBox[];
}

export const useArchiveBoxStore = create<ArchiveBoxState>((set, get) => ({
  // 切 API 后种子清空（原 initialBoxes + simulatedBoxes 已移除）
  boxes: [],
  setBoxes: (boxes) => set({ boxes }),

  loading: false,

  // ── 数据加载 ──
  loadBoxes: async (fondsCode) => {
    set({ loading: true });
    try {
      const boxes = await fetchBoxes({ fondsCode });
      set({ boxes });
    } catch (e) {
      console.warn('盒列表加载失败（首次可能无数据）:', e);
      set({ boxes: [] });
    } finally {
      set({ loading: false });
    }
  },

  // ── 盒写操作（真服务端，成功后重拉镜像） ──
  sealBox: async (id, fondsCode) => {
    await sealBoxApi(id);
    await get().loadBoxes(fondsCode);
  },

  unsealBox: async (id, fondsCode) => {
    await unsealBoxApi(id);
    await get().loadBoxes(fondsCode);
  },

  shelveBox: async (id, pos, fondsCode) => {
    if (pos === 'auto') {
      await shelveBoxAutoApi(id);
    } else {
      await shelveBoxApi(id, pos);
    }
    await get().loadBoxes(fondsCode);
  },

  unshelveBox: async (id, fondsCode) => {
    await unshelveBoxApi(id);
    await get().loadBoxes(fondsCode);
  },

  deleteBox: async (id, fondsCode) => {
    await deleteBoxApi(id);
    await get().loadBoxes(fondsCode);
  },

  boxesByYear: (year) => get().boxes.filter((b) => b.year === year),

  boxesByStatus: (status) => get().boxes.filter((b) => b.status === status),
}));
