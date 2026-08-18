/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * roleStore — 角色三维授权配置（2026-08-18 v4 升级）
 *
 * 三维模型（对应参考模型 S_ROLERIGHT 功能×库×全宗 + 6 位 QX 操作码）：
 *   roleMenus      功能权限：菜单功能码 + 门户功能码（portal-*）
 *   roleDataScope  数据权限：全宗白名单 × 门类 × 部门范围 × 密级上限
 *   roleOperations 操作权限：catalog/view/download/print/borrow/copy
 *
 * 单一数据源：persist 名 role-auth-v1 即 ams_config key，角色管理页保存后
 * 服务端 PermissionService 30s 内生效（近实时，优于参考模型"重新登录生效"）。
 *
 * 旧键 role-menus-v3 已废弃（结构升级为三维文档，不再迁移；服务端向后兼容读取）。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createApiPersistStorage } from '../services/configStorage';
import {
  ROLE_MENU_MATRIX,
  ROLE_DATA_SCOPE_DEFAULT,
  ROLE_OPERATIONS_DEFAULT,
  isPortalKey,
  SYS_LOG_KEY,
  type DeptMode,
  type OperationKey,
  type RoleDataScope,
  type RoleKey,
} from '../types/user';

interface RoleState {
  /** 功能权限：角色 → 可见菜单/门户功能码（'*' = 全部） */
  roleMenus: Record<RoleKey, string[]>;
  /** 数据权限：角色 → 数据范围 */
  roleDataScope: Record<RoleKey, RoleDataScope>;
  /** 操作权限：角色 → 6 操作码开关 */
  roleOperations: Record<RoleKey, Record<OperationKey, boolean>>;

  /** 切换某角色某菜单项的授权 */
  toggleMenu: (role: RoleKey, menuKey: string) => void;
  /** 整组授权/取消 */
  setGroupMenus: (role: RoleKey, menuKeys: string[], granted: boolean) => void;
  /** 更新数据范围（部分字段补丁） */
  patchDataScope: (role: RoleKey, patch: Partial<RoleDataScope>) => void;
  /** 切换操作权限开关 */
  toggleOperation: (role: RoleKey, op: OperationKey) => void;
  /** 恢复默认三维矩阵 */
  resetToDefault: () => void;
}

export const useRoleStore = create<RoleState>()(
  persist(
    (set) => ({
      roleMenus: structuredClone(ROLE_MENU_MATRIX),
      roleDataScope: structuredClone(ROLE_DATA_SCOPE_DEFAULT),
      roleOperations: structuredClone(ROLE_OPERATIONS_DEFAULT),

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

      patchDataScope: (role, patch) =>
        set((s) => ({
          roleDataScope: {
            ...s.roleDataScope,
            [role]: { ...s.roleDataScope[role], ...patch },
          },
        })),

      toggleOperation: (role, op) =>
        set((s) => ({
          roleOperations: {
            ...s.roleOperations,
            [role]: { ...s.roleOperations[role], [op]: !s.roleOperations[role]?.[op] },
          },
        })),

      resetToDefault: () =>
        set({
          roleMenus: structuredClone(ROLE_MENU_MATRIX),
          roleDataScope: structuredClone(ROLE_DATA_SCOPE_DEFAULT),
          roleOperations: structuredClone(ROLE_OPERATIONS_DEFAULT),
        }),
    }),
    { name: 'role-auth-v1', storage: createApiPersistStorage() },
  ),
);

/** 判断角色集合是否可见某菜单项（读 roleStore 配置；sys-log 硬分立：仅安全审计员） */
export function canSeeMenuConfigured(roles: RoleKey[], menuKey: string, roleMenus: Record<RoleKey, string[]>): boolean {
  if (menuKey === SYS_LOG_KEY) return roles.includes('security_auditor');
  if (roles.includes('admin')) return true;
  return roles.some((r) => (roleMenus[r] || []).includes(menuKey));
}

/**
 * 判断角色集合是否拥有任何后台菜单（决定落地端与门户「进入后台管理」入口可见性）。
 * admin 恒 true；门户功能码（portal-*）不计入后台菜单。
 * 无任何后台菜单的用户（如普通员工）只使用检索门户。
 */
export function hasAnyBackendMenu(roles: RoleKey[], roleMenus: Record<RoleKey, string[]>): boolean {
  if (roles.includes('admin')) return true;
  return roles.some((r) => (roleMenus[r] || []).some((k) => !isPortalKey(k) && k !== '*'));
}

/** 判断角色集合是否拥有某操作权限（6 位 QX 码；admin 恒 true） */
export function hasOperation(
  roles: RoleKey[],
  op: OperationKey,
  roleOperations: Record<RoleKey, Record<OperationKey, boolean>>,
): boolean {
  if (roles.includes('admin')) return true;
  return roles.some((r) => Boolean(roleOperations[r]?.[op]));
}

/** 合并多角色数据范围（并集 = 各维最宽松；与服务端 PermissionService.dataScope 同规则） */
export function mergedDataScope(
  roles: RoleKey[],
  roleDataScope: Record<RoleKey, RoleDataScope>,
): RoleDataScope {
  const dft: RoleDataScope = { fonds: '*', types: '*', deptMode: 'all', maxClearance: 3 };
  if (roles.includes('admin')) return dft;
  const held = roles.map((r) => roleDataScope[r]).filter(Boolean);
  if (held.length === 0) return { fonds: [], types: [], deptMode: 'self', maxClearance: 0 };
  const union = (vals: ('*' | string[])[]) =>
    vals.includes('*') ? '*' as const : [...new Set(vals.flatMap((v) => (v === '*' ? [] : v)))];
  const deptOrder: DeptMode[] = ['self', 'own-dept', 'all'];
  return {
    fonds: union(held.map((s) => s.fonds)),
    types: union(held.map((s) => s.types)),
    deptMode: held.map((s) => s.deptMode).sort((a, b) => deptOrder.indexOf(b) - deptOrder.indexOf(a))[0],
    maxClearance: Math.max(...held.map((s) => s.maxClearance)),
  };
}
