/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * cockpitStore — 统计驾驶舱大屏模块配置（2026-07-18）
 *
 * 系统管理 → 驾驶舱配置：模块开关 / 排序 / 宽度（半栏/全栏）。
 * persist 到 localStorage（cockpit-config-v1），大屏页按配置渲染。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createApiPersistStorage } from '../services/configStorage';

/** 大屏模块标识 */
export type CockpitModuleId =
  | 'kpi-overview'
  | 'type-distribution'
  | 'year-trend'
  | 'retention-structure'
  | 'carrier-progress'
  | 'process-monitor'
  | 'borrow-heat'
  | 'borrow-alerts'
  | 'fonds-distribution'
  | 'dept-usage'
  | 'data-quality'
  | 'realtime-feed';

export interface CockpitModule {
  id: CockpitModuleId;
  title: string;
  /** 模块说明（配置页展示） */
  description: string;
  /** 所属统计维度（配置页分组展示） */
  domain: '库藏' | '流程' | '利用' | '合规';
  enabled: boolean;
  /** 宽度：half=半栏 / full=全栏 */
  size: 'half' | 'full';
}

/** 默认模块目录（顺序即大屏初始布局） */
export const DEFAULT_COCKPIT_MODULES: CockpitModule[] = [
  { id: 'kpi-overview', title: '库藏总览', description: '卷/件/盒/页数/容量/原始凭证 六宫格 KPI', domain: '库藏', enabled: true, size: 'full' },
  { id: 'type-distribution', title: '档案类型分布', description: '凭证/账簿/报表/其他 环形图与明细', domain: '库藏', enabled: true, size: 'half' },
  { id: 'year-trend', title: '年度归档趋势', description: '各会计年度档案量与卷数柱状图', domain: '库藏', enabled: true, size: 'half' },
  { id: 'retention-structure', title: '保管期限结构', description: '永久/30年/10年 占比（79号令合规维度）', domain: '库藏', enabled: true, size: 'half' },
  { id: 'carrier-progress', title: '电子化进程', description: '电子档案占比与载体结构仪表盘', domain: '库藏', enabled: true, size: 'half' },
  { id: 'process-monitor', title: '流程监控', description: '待归档/待组卷/已移交/四性通过率实时指标', domain: '流程', enabled: true, size: 'half' },
  { id: 'borrow-heat', title: '借阅热力', description: '各类型档案借阅件次热度条形图', domain: '利用', enabled: true, size: 'half' },
  { id: 'borrow-alerts', title: '逾期与黑名单预警', description: '逾期未还卷、熔断用户、预约队列实时预警', domain: '利用', enabled: true, size: 'half' },
  { id: 'dept-usage', title: '部门利用排行', description: '按部门统计借阅单量与件数 TOP', domain: '利用', enabled: true, size: 'half' },
  { id: 'fonds-distribution', title: '全宗分布', description: '各全宗档案数量分布（集团化管控）', domain: '库藏', enabled: false, size: 'half' },
  { id: 'data-quality', title: '数据质量与合规', description: '元数据完整率/格式合规率/四性通过率', domain: '合规', enabled: true, size: 'half' },
  { id: 'realtime-feed', title: '实时动态', description: '检索/借阅/审批/履约 实时操作滚动播报', domain: '合规', enabled: true, size: 'full' },
];

interface CockpitState {
  modules: CockpitModule[];
  /** 开关模块 */
  toggleModule: (id: CockpitModuleId) => void;
  /** 调整宽度 */
  setSize: (id: CockpitModuleId, size: 'half' | 'full') => void;
  /** 上移/下移 */
  moveModule: (id: CockpitModuleId, direction: 'up' | 'down') => void;
  /** 恢复默认布局 */
  resetToDefault: () => void;
}

export const useCockpitStore = create<CockpitState>()(
  persist(
    (set) => ({
      modules: structuredClone(DEFAULT_COCKPIT_MODULES),

      toggleModule: (id) =>
        set((s) => ({
          modules: s.modules.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
        })),

      setSize: (id, size) =>
        set((s) => ({
          modules: s.modules.map((m) => (m.id === id ? { ...m, size } : m)),
        })),

      moveModule: (id, direction) =>
        set((s) => {
          const idx = s.modules.findIndex((m) => m.id === id);
          if (idx < 0) return s;
          const swapWith = direction === 'up' ? idx - 1 : idx + 1;
          if (swapWith < 0 || swapWith >= s.modules.length) return s;
          const modules = [...s.modules];
          [modules[idx], modules[swapWith]] = [modules[swapWith], modules[idx]];
          return { modules };
        }),

      resetToDefault: () => set({ modules: structuredClone(DEFAULT_COCKPIT_MODULES) }),
    }),
    { name: 'cockpit-config-v1', storage: createApiPersistStorage() },
  ),
);
