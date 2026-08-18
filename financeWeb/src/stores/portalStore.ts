/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * portalStore — 检索门户（前台）状态管理
 *
 * 前台门户与后台管理共用同一登录态/同一数据源（ams-server 真后端）：
 *   - mode: 'admin' = 后台管理（默认，完整菜单）；'portal' = 检索门户（百度式检索首页）
 *   - 门户首页 = 搜索框 + 快捷分类；检索结果 → 详情 → 附件（权限门控）
 *   - 门户侧重「检索 + 详情 + 借阅申请 + 我的借阅/在线调阅」，隐藏档案整理/配置等后台功能
 */

import { create } from 'zustand';

export type PortalMode = 'admin' | 'portal';

/** 检索门户顶层 Tab（详情页为页内临时状态，不入 store） */
export type PortalTab = 'home' | 'search' | 'my-borrow';

/** 检索门户检索模式（与后台「档案查询」二级菜单一一对应） */
export type PortalSearchMode =
  | 'general'      // 综合检索（百度式全库）
  | 'voucher'      // 凭证检索
  | 'matter'       // 事项检索
  | 'attachment'   // 附件检索
  | 'volume'       // 关联查询
  | 'audit';       // 审计追踪

interface PortalState {
  /** 当前所在端：后台管理 / 检索门户 */
  mode: PortalMode;
  /** 切换到指定端 */
  switchMode: (mode: PortalMode) => void;
  /** 门户顶层 Tab（提升到 store，供借阅车结算等外部入口定向跳转） */
  portalTab: PortalTab;
  setPortalTab: (tab: PortalTab) => void;
  /** 门户侧当前检索关键词（跨页面保持） */
  portalKeyword: string;
  setPortalKeyword: (kw: string) => void;
  /** 门户侧当前选中的档案大类（KP/KB/FB/QT / ''=全部） */
  portalType: string;
  setPortalType: (t: string) => void;
  /** 门户侧当前检索模式（对应后台档案查询二级菜单） */
  searchMode: PortalSearchMode;
  setSearchMode: (mode: PortalSearchMode) => void;
}

export const usePortalStore = create<PortalState>((set) => ({
  mode: 'admin',
  switchMode: (mode) => set({ mode }),
  portalTab: 'home',
  setPortalTab: (tab) => set({ portalTab: tab }),
  portalKeyword: '',
  setPortalKeyword: (kw) => set({ portalKeyword: kw }),
  portalType: '',
  setPortalType: (t) => set({ portalType: t }),
  searchMode: 'general',
  setSearchMode: (mode) => set({ searchMode: mode }),
}));
