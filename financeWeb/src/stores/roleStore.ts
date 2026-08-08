/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * roleStore — 角色→菜单 权限配置（2026-07-18）
 *
 * 角色管理页可视化编辑，Sidebar 实时按配置过滤。
 * 默认矩阵来自 types/user.ts ROLE_MENU_MATRIX，修改后 persist 到 localStorage。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createApiPersistStorage } from '../services/configStorage';
import { ROLE_MENU_MATRIX, type RoleKey } from '../types/user';

interface RoleState {
  /** 角色 → 可见菜单项 key 列表（'*' = 全部） */
  roleMenus: Record<RoleKey, string[]>;
  /** 切换某角色某菜单项的授权 */
  toggleMenu: (role: RoleKey, menuKey: string) => void;
  /** 整组授权/取消 */
  setGroupMenus: (role: RoleKey, menuKeys: string[], granted: boolean) => void;
  /** 恢复默认矩阵 */
  resetToDefault: () => void;
}

export const useRoleStore = create<RoleState>()(
  persist(
    (set) => ({
      roleMenus: structuredClone(ROLE_MENU_MATRIX),

      toggleMenu: (role, menuKey) =>
        set((s) => {
          const cur = s.roleMenus[role] || [];
          const has = cur.includes(menuKey);
          return {
            roleMenus: {
              ...s.roleMenus,
              [role]: has ? cur.filter((k) => k !== menuKey) : [...cur, menuKey],
            },
          };
        }),

      setGroupMenus: (role, menuKeys, granted) =>
        set((s) => {
          const cur = new Set(s.roleMenus[role] || []);
          menuKeys.forEach((k) => (granted ? cur.add(k) : cur.delete(k)));
          return { roleMenus: { ...s.roleMenus, [role]: [...cur] } };
        }),

      resetToDefault: () => set({ roleMenus: structuredClone(ROLE_MENU_MATRIX) }),
    }),
    { name: 'role-menus-v2', storage: createApiPersistStorage() },
  ),
);

/** 判断角色集合是否可见某菜单项（读 roleStore 配置） */
export function canSeeMenuConfigured(roles: RoleKey[], menuKey: string, roleMenus: Record<RoleKey, string[]>): boolean {
  if (roles.includes('admin')) return true;
  return roles.some((r) => (roleMenus[r] || []).includes(menuKey));
}
