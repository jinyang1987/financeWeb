/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * userService — 人员管理（ams-server /users，2026-08-18）
 *
 * 数据视图：Alfresco people × ams_user_ext（工号/部门/岗位/人员密级）× 角色组。
 * 人员密级编辑权限：sys-personnel 功能码（admin + security_officer，三员分立）。
 */

import { http } from './http';

/** 服务端用户视图 */
export interface AmsUserView {
  account: string;
  name: string;
  enabled: boolean;
  empNo: string;
  dept: string;
  position: string;
  supervisorId: string;
  avatarColor: string;
  /** 人员密级 0普通/1内部/2秘密/3机密 */
  clearance: number;
  roles: string[];
}

export const CLEARANCE_LABELS = ['普通', '内部', '秘密', '机密'] as const;

/** 人员视图列表（sys-personnel 功能码校验在服务端） */
export async function fetchUsers(): Promise<AmsUserView[]> {
  return http.get<AmsUserView[]>('/users');
}

/** 调整人员密级（写 ams_user_ext + 哈希链审计） */
export async function updateUserClearance(account: string, clearance: number): Promise<void> {
  await http.put(`/users/${encodeURIComponent(account)}/clearance`, { clearance });
}
