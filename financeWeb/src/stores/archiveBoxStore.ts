/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * archiveBoxStore — 档案盒状态管理（P1-② 已切 ams-server 真后端）
 *
 * 职责：
 *   1. 盒列表的服务端数据镜像（loadBoxes 拉取，全宗切换时刷新）
 *   2. 盒内案卷查询（fetchBoxVolumes 按需拉取）
 *   3. 本地辅助操作（封盒/上架等状态变更暂为乐观更新，服务端写端点属 P3）
 *
 * 建盒由卷域移交归盒时自动完成（VolumeService.transfer），前端不主动建盒。
 * 仿真种子已清除（2026-07-20 决策：假数据分域随切随清）。
 */

import { create } from 'zustand';
import type { ArchiveBox, BoxStatus } from '../types/archiveBox';
import { fetchBoxes } from '../services/boxService';

interface ArchiveBoxState {
  /** 全量盒列表（服务端镜像） */
  boxes: ArchiveBox[];
  setBoxes: (boxes: ArchiveBox[]) => void;

  /** 加载状态 */
  loading: boolean;

  /** 拉取指定全宗的全部盒（服务端镜像重建） */
  loadBoxes: (fondsCode: string) => Promise<void>;

  /** 创建新盒（本地乐观操作；正式建盒由移交归盒自动完成） */
  createBox: (partial: Partial<ArchiveBox>) => ArchiveBox;
  /** 更新盒信息（本地乐观操作） */
  updateBox: (id: string, partial: Partial<ArchiveBox>) => void;
  /** 删除盒（本地乐观操作） */
  deleteBox: (id: string) => void;

  /** 封盒 */
  sealBox: (id: string) => void;
  /** 上架 */
  storeBox: (id: string) => void;

  /** 按年度筛选盒 */
  boxesByYear: (year: number) => ArchiveBox[];
  /** 按状态筛选盒 */
  boxesByStatus: (status: BoxStatus) => ArchiveBox[];

  /** 更新盒内卷数 */
  incrementVolumeCount: (boxId: string) => void;
  decrementVolumeCount: (boxId: string) => void;
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

  // ── 本地辅助操作（乐观更新，服务端写端点属 P3 阶段） ──
  createBox: (partial) => {
    const now = new Date().toISOString().slice(0, 10);
    const box: ArchiveBox = {
      id: `box-local-${Date.now()}`,
      boxId: `BX-${Date.now()}`,
      boxNo: partial.boxNo || `BOX-${partial.year || 2026}-${partial.archiveTypeCode || 'QT'}-001`,
      boxName: partial.boxName || '新档案盒',
      archiveTypeCode: partial.archiveTypeCode || 'QT',
      location: partial.location || '',
      retention: partial.retention || '30年',
      year: partial.year || 2026,
      carrierType: 'paper',
      status: 'active',
      volumeCount: 0,
      createdDate: now,
      createdBy: partial.createdBy || '当前用户',
      remarks: partial.remarks || '',
    };
    set((s) => ({ boxes: [...s.boxes, box] }));
    return box;
  },

  updateBox: (id, partial) =>
    set((s) => ({
      boxes: s.boxes.map((b) => (b.id === id ? { ...b, ...partial } : b)),
    })),

  deleteBox: (id) =>
    set((s) => ({ boxes: s.boxes.filter((b) => b.id !== id) })),

  sealBox: (id) =>
    set((s) => ({
      boxes: s.boxes.map((b) =>
        b.id === id ? { ...b, status: 'sealed' as BoxStatus } : b,
      ),
    })),

  storeBox: (id) =>
    set((s) => ({
      boxes: s.boxes.map((b) =>
        b.id === id ? { ...b, status: 'stored' as BoxStatus } : b,
      ),
    })),

  boxesByYear: (year) => get().boxes.filter((b) => b.year === year),

  boxesByStatus: (status) => get().boxes.filter((b) => b.status === status),

  incrementVolumeCount: (boxId) =>
    set((s) => ({
      boxes: s.boxes.map((b) =>
        b.id === boxId ? { ...b, volumeCount: b.volumeCount + 1 } : b,
      ),
    })),

  decrementVolumeCount: (boxId) =>
    set((s) => ({
      boxes: s.boxes.map((b) =>
        b.id === boxId ? { ...b, volumeCount: Math.max(0, b.volumeCount - 1) } : b,
      ),
    })),
}));
