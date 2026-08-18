/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 会计档案管理系统 - 主入口
 * 仅负责登录态路由与会话恢复，业务逻辑全部分派给 AppLayout / PortalApp
 */

import React, { useEffect } from 'react';
import { DirectoryConfigProvider } from './DirectoryConfigContext';
import { useAuthStore } from './stores/authStore';
import { usePortalStore } from './stores/portalStore';
import { useRoleStore, hasAnyBackendMenu } from './stores/roleStore';
import { LoginPage } from './components/LoginPage';
import AppLayout from './components/layout/AppLayout';
import PortalApp from './components/portal/PortalApp';

export default function App() {
  const { isLoggedIn, restoring, loggedUser, restore, logout } = useAuthStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const roleMenus = useRoleStore((s) => s.roleMenus);
  const mode = usePortalStore((s) => s.mode);

  // 启动时恢复会话（用持久化的 ticket 调 /auth/me 校验）
  useEffect(() => {
    restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 按角色落地：无任何后台菜单的用户（如普通员工）直接进检索门户，有后台菜单的落后台管理。
  // 登录/会话恢复/切换身份/角色矩阵变更时重新判定；手动切换端不受影响。
  useEffect(() => {
    if (!isLoggedIn || restoring || !currentUser) return;
    usePortalStore.getState().switchMode(
      hasAnyBackendMenu(currentUser.roles, roleMenus) ? 'admin' : 'portal',
    );
  }, [isLoggedIn, restoring, currentUser, roleMenus]);

  if (restoring) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-sky-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-slate-400">正在恢复会话…</span>
        </div>
      </div>
    );
  }

  return (
    <DirectoryConfigProvider>
      {!isLoggedIn ? (
        <LoginPage />
      ) : mode === 'portal' ? (
        <PortalApp loggedUser={loggedUser} onLogout={logout} />
      ) : (
        <AppLayout loggedUser={loggedUser} onLogout={logout} />
      )}
    </DirectoryConfigProvider>
  );
}
