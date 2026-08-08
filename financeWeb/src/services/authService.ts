/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * authService — 认证服务（ams-server /auth/**）
 */

import { http } from './http';
import { session } from './session';
import type { RoleKey } from '../types/user';

export interface AuthUserPayload {
  id: string;
  account: string;
  name: string;
  empNo: string;
  dept: string;
  position: string;
  roles: RoleKey[];
  supervisorId: string | null;
  avatarColor: string | null;
}

interface LoginResponse {
  ticket: string;
  user: AuthUserPayload;
}

export const authService = {
  /** 登录：账密 → ticket + 用户视图；同时写入 session 供 services 层使用 */
  async login(account: string, password: string): Promise<LoginResponse> {
    const res = await http.post<LoginResponse>('/auth/login', { account, password });
    session.set({ userId: res.user.account, ticket: res.ticket, displayName: res.user.name });
    return res;
  },

  /** 会话校验（页面刷新恢复） */
  async me(): Promise<AuthUserPayload> {
    return http.get<AuthUserPayload>('/auth/me');
  },

  /** 登出：销毁服务端会话与 ticket，并清空本地会话 */
  async logout(): Promise<void> {
    try {
      await http.post('/auth/logout');
    } finally {
      session.clear();
    }
  },
};
