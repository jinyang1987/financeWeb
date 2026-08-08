import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';

export type MenuId =
  | 'dashboard'
  | 'directory-config' | 'config-fanzong' | 'report-config' | 'inspection-config' | 'archive-scope' | 'accounting-metadata'
  | 'view-finance' | 'view-project' | 'view-time'
  | 'config-workflow' | 'sys-org' | 'sys-user' | 'sys-log'
  | 'sys-unit' | 'sys-personnel' | 'sys-role'
  | 'archive-offline' | 'archive-rcv' | 'wf-control'
  | 'borrow-manage' | 'return-manage' | 'search-stats'
  | 'smart-data' | 'order-special' | 'digital-warehouse'
  | 'preserve-view-finance' | 'preserve-view-project' | 'preserve-view-time'
  | 'util-view-finance' | 'util-view-project' | 'util-view-time'
  | 'disposal-batch' | 'disposal-workflow';

export type SidebarGroupKey = 'rcv' | 'arrange' | 'config' | 'preserve' | 'util' | 'disposal' | 'stats' | 'archiveSettings' | 'system';

interface Toast {
  message: string;
  type: 'success' | 'info' | 'warning';
}

export const useAppStore = defineStore('app', () => {
  // ─── State ────────────────────────────────
  const activeMainMenu = ref<MenuId>('dashboard');
  const mobileSidebarOpen = ref(false);
  const isMenuSettingsOpen = ref(false);
  const toast = ref<Toast | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  const sidebarGroups = reactive<Record<SidebarGroupKey, boolean>>({
    rcv: true, arrange: true, config: true, preserve: true,
    util: true, disposal: true, stats: true, archiveSettings: true, system: true,
  });

  const visibleMenus = reactive<Record<string, boolean>>({
    rcv: true, config: true, arrange: true, preserve: true,
    util: true, disposal: true, stats: true, archiveSettings: true, system: true,
  });

  // ─── Actions ───────────────────────────────
  function setActiveMainMenu(menu: MenuId): void {
    activeMainMenu.value = menu;
  }

  function closeOtherGroups(keepOpen: SidebarGroupKey): void {
    Object.keys(sidebarGroups).forEach((key) => {
      sidebarGroups[key as SidebarGroupKey] = key === keepOpen;
    });
  }

  function toggleMenuVisibility(key: string): void {
    visibleMenus[key] = !visibleMenus[key];
  }

  function setMenuSettingsOpen(open: boolean): void {
    isMenuSettingsOpen.value = open;
  }

  function setMobileSidebarOpen(open: boolean): void {
    mobileSidebarOpen.value = open;
  }

  function triggerToast(message: string, type: Toast['type'] = 'success'): void {
    toast.value = { message, type };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.value = null; }, 4500);
  }

  return {
    activeMainMenu, mobileSidebarOpen, isMenuSettingsOpen, toast,
    sidebarGroups, visibleMenus,
    setActiveMainMenu, closeOtherGroups, toggleMenuVisibility,
    setMenuSettingsOpen, setMobileSidebarOpen, triggerToast,
  };
});
