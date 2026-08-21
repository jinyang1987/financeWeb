﻿﻿﻿﻿﻿﻿﻿import { create } from 'zustand';

// Menu identifier type (matches all possible activeMainMenu values)
export type MenuId =
  | 'stats-cockpit' | 'stats-inventory' | 'stats-lifecycle' | 'stats-compliance' | 'sys-cockpit-config'
  | 'dashboard'
  | 'directory-config' | 'config-fanzong' | 'report-config' | 'inspection-config' | 'archive-manage-config'
  | 'watermark-config'
  | 'view-finance' | 'view-project' | 'project-query'
  | 'config-workflow' | 'sys-org' | 'sys-user' | 'sys-log'
  | 'sys-unit' | 'sys-personnel' | 'sys-role'
  | 'sys-connection' | 'sys-storage'
  | 'archive-rcv' | 'wf-control'
  | 'approval-center' | 'borrow-manage' | 'borrow-ledger' | 'borrow-stats' | 'search-stats'
  | 'digital-warehouse'
  | 'volume-workspace' | 'volume-dir-print' | 'voucher-upload' | 'archive-api-receive'
  | 'volume-item-search' | 'transfer-manage'
  | 'retention-config'
  | 'source-doc-search' | 'voucher-query' | 'fuzzy-query'
  | 'voucher-search' | 'matter-search' | 'audit-trail'
  | 'archive-package' | 'archive-transfer' | 'appraisal-manage'
  | 'util-view-finance' | 'util-view-project' | 'util-view-time';

type SidebarGroupKey = 'query' | 'rcv' | 'arrange' | 'config' | 'preserve' | 'util' | 'disposal' | 'stats' | 'archiveSettings' | 'system';

interface Toast {
  message: string;
  type: 'success' | 'info' | 'warning';
}

interface AppState {
  // Navigation
  activeMainMenu: MenuId;
  setActiveMainMenu: (menu: MenuId) => void;

  // Sidebar accordion groups
  sidebarGroups: Record<SidebarGroupKey, boolean>;
  /** 展开指定组，关闭其他组（菜单项点击时使用） */
  closeOtherGroups: (keepOpen: SidebarGroupKey) => void;
  /** 切换指定组的展开/折叠（组标题点击时使用） */
  toggleSidebarGroup: (groupKey: SidebarGroupKey) => void;

  // Menu visibility settings
  visibleMenus: Record<string, boolean>;
  toggleMenuVisibility: (key: string) => void;
  isMenuSettingsOpen: boolean;
  setMenuSettingsOpen: (open: boolean) => void;

  // Toast
  toast: Toast | null;
  triggerToast: (message: string, type?: Toast['type']) => void;

  // Mobile sidebar
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  activeMainMenu: 'stats-cockpit',
  setActiveMainMenu: (menu) => set({ activeMainMenu: menu }),

  // Sidebar groups - all open by default except config
  sidebarGroups: {
    query: true,
    rcv: true,
    arrange: true,
    config: true,
    preserve: true,
    util: true,
    disposal: true,
    stats: true,
    archiveSettings: true,
    system: true,
  },
  /** 展开指定组，关闭其他组（菜单项点击时使用） */
  closeOtherGroups: (keepOpen) => {
    const groups = get().sidebarGroups;
    const updated = Object.keys(groups).reduce<Record<string, boolean>>((acc, key) => {
      acc[key] = key === keepOpen;
      return acc;
    }, {});
    set({ sidebarGroups: updated as Record<SidebarGroupKey, boolean> });
  },
  /** 切换指定组的展开/折叠（组标题点击时使用） */
  toggleSidebarGroup: (groupKey) => {
    const groups = get().sidebarGroups;
    const updated = { ...groups, [groupKey]: !groups[groupKey] };
    set({ sidebarGroups: updated as Record<SidebarGroupKey, boolean> });
  },

  // Menu visibility
  visibleMenus: {
    query: true,
    rcv: true,
    config: true,
    arrange: true,
    preserve: true,
    util: true,
    disposal: true,
    stats: true,
    archiveSettings: true,
    system: true,
  },
  toggleMenuVisibility: (key) =>
    set((state) => ({
      visibleMenus: { ...state.visibleMenus, [key]: !state.visibleMenus[key] },
    })),
  isMenuSettingsOpen: false,
  setMenuSettingsOpen: (open) => set({ isMenuSettingsOpen: open }),

  // Toast
  toast: null,
  triggerToast: (message, type = 'success') => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 4500);
  },

  // Mobile sidebar
  mobileSidebarOpen: false,
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
}));

