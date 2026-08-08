import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService, type AuthUserPayload } from '../services/authService';
import { session } from '../services/session';
import { findUserByAccount, type RoleKey, type UserAccount } from '../types/user';

/** 演示环境统一密码（P0-6 seed 的 8 个演示账号同密码） */
export const DEMO_PASSWORD = '123456';

/** API 用户视图 → 前端 UserAccount */
function toUserAccount(u: AuthUserPayload): UserAccount {
  // 演示账号头像色沿用内置表（seed 前），seed 后以 ams_user_ext 为准
  const demo = findUserByAccount(u.account);
  return {
    id: u.id,
    account: u.account,
    name: u.name,
    empNo: u.empNo || demo?.empNo || '',
    dept: u.dept || demo?.dept || '',
    position: u.position || demo?.position || '',
    roles: u.roles,
    supervisorId: u.supervisorId ?? demo?.supervisorId,
    avatarColor: u.avatarColor || demo?.avatarColor || 'bg-slate-700',
  };
}

interface AuthState {
  isLoggedIn: boolean;
  /** 会话恢复中（应用启动时校验 ticket） */
  restoring: boolean;
  currentUser: UserAccount | null;
  /** 登录用户姓名（向后兼容字段，水印等旧代码使用） */
  loggedUser: string;
  /** 真实登录（账密 → ams-server → Alfresco ticket） */
  login: (account: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 启动恢复会话（校验 ticket，无效则登出） */
  restore: () => Promise<void>;
  /** 演示身份切换（用演示密码重新登录；失败则退回登录页） */
  switchUser: (account: string) => Promise<void>;
  hasRole: (...roles: RoleKey[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isLoggedIn: false,
      restoring: true,
      currentUser: null,
      loggedUser: '',

      login: async (account, password) => {
        const res = await authService.login(account, password);
        const user = toUserAccount(res.user);
        set({ isLoggedIn: true, currentUser: user, loggedUser: user.name, restoring: false });
      },

      logout: async () => {
        await authService.logout();
        set({ isLoggedIn: false, currentUser: null, loggedUser: '', restoring: false });
      },

      restore: async () => {
        if (!get().isLoggedIn || !session.ticket()) {
          set({ restoring: false });
          if (!session.ticket()) {
            set({ isLoggedIn: false, currentUser: null, loggedUser: '' });
          }
          return;
        }
        try {
          const payload = await authService.me();
          const user = toUserAccount(payload);
          set({ currentUser: user, loggedUser: user.name, restoring: false });
        } catch {
          session.clear();
          set({ isLoggedIn: false, currentUser: null, loggedUser: '', restoring: false });
        }
      },

      switchUser: async (account) => {
        try {
          await authService.logout();
        } catch {
          // 忽略登出失败（会话可能已失效）
        }
        try {
          await get().login(account, DEMO_PASSWORD);
        } catch {
          // 非演示账号（如 admin）需手工登录：回登录页
          set({ isLoggedIn: false, currentUser: null, loggedUser: '' });
        }
      },

      hasRole: (...roles) => {
        const user = get().currentUser;
        if (!user) return false;
        if (user.roles.includes('admin')) return true;
        return roles.some((r) => user.roles.includes(r));
      },
    }),
    {
      name: 'auth-session-v2',
      partialize: (s) => ({ isLoggedIn: s.isLoggedIn, currentUser: s.currentUser, loggedUser: s.loggedUser }),
    },
  ),
);
