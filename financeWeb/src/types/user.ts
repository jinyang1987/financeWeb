/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 用户与角色模型 — 借阅全生命周期的角色基础
 *
 * 角色设计（2026-07-18 与用户对齐）：
 *   员工(employee)        → 检索档案、加入借阅车、发起借阅申请、在线调阅
 *   部门经理(dept_manager) → 审批本部门员工借阅单（第一级审批）
 *   档案管理员(archivist)  → 审批（末级）、实体出库/归还核销、预约队列管理、中止借阅
 *   档案主管(archive_director) → 借阅台账/统计分析驾驶舱、黑名单管理
 *   财务总监(cfo)          → 高危权限（下载/打印/原件外借）的升级审批
 *   HR副总裁(hrvp)         → 涉密档案（薪酬/高管报销）的升级审批
 *   系统管理员(admin)      → 全部功能
 */

/** 角色标识 */
export type RoleKey =
  | 'employee'
  | 'dept_manager'
  | 'archivist'
  | 'archive_director'
  | 'cfo'
  | 'hrvp'
  | 'admin';

/** 角色中文名 */
export const ROLE_LABELS: Record<RoleKey, string> = {
  employee: '普通员工',
  dept_manager: '部门经理',
  archivist: '档案管理员',
  archive_director: '档案主管',
  cfo: '财务总监',
  hrvp: 'HR副总裁',
  admin: '系统管理员',
};

/** 用户账号（内置仿真账号，登录页点选登录） */
export interface UserAccount {
  id: string;
  /** 登录账号 */
  account: string;
  /** 姓名 */
  name: string;
  /** 工号 */
  empNo: string;
  /** 所属部门 */
  dept: string;
  /** 岗位 */
  position: string;
  /** 角色（可多重） */
  roles: RoleKey[];
  /** 直属主管用户ID（逾期催还抄送） */
  supervisorId?: string;
  /** 头像底色 */
  avatarColor: string;
}

/** 内置仿真账号 */
export const MOCK_USERS: UserAccount[] = [
  { id: 'u-zhangwei', account: 'zhangwei', name: '张伟', empNo: '004521', dept: '财务部', position: '会计', roles: ['employee'], supervisorId: 'u-wangqiang', avatarColor: 'bg-sky-600' },
  { id: 'u-lina', account: 'lina', name: '李娜', empNo: '004522', dept: '财务部', position: '出纳', roles: ['employee'], supervisorId: 'u-wangqiang', avatarColor: 'bg-sky-600' },
  { id: 'u-wangqiang', account: 'wangqiang', name: '王强', empNo: '003108', dept: '财务部', position: '财务部经理', roles: ['dept_manager'], supervisorId: 'u-zhaogang', avatarColor: 'bg-sky-600' },
  { id: 'u-chenjing', account: 'chenjing', name: '陈静', empNo: '002017', dept: '档案部', position: '档案管理员', roles: ['archivist'], supervisorId: 'u-liumin', avatarColor: 'bg-emerald-600' },
  { id: 'u-liumin', account: 'liumin', name: '刘敏', empNo: '001566', dept: '档案部', position: '档案主管', roles: ['archive_director', 'archivist'], avatarColor: 'bg-teal-600' },
  { id: 'u-zhaogang', account: 'zhaogang', name: '赵刚', empNo: '000902', dept: '财务部', position: '财务总监', roles: ['cfo'], avatarColor: 'bg-violet-600' },
  { id: 'u-sunli', account: 'sunli', name: '孙丽', empNo: '000715', dept: '人力资源部', position: 'HR副总裁', roles: ['hrvp'], avatarColor: 'bg-rose-600' },
  { id: 'u-admin', account: 'admin', name: '系统管理员', empNo: '000001', dept: '信息中心', position: '系统管理员', roles: ['admin'], avatarColor: 'bg-slate-700' },
];

/** 按账号查找用户 */
export function findUserByAccount(account: string): UserAccount | undefined {
  return MOCK_USERS.find((u) => u.account === account);
}

/** 按ID查找用户 */
export function findUserById(id: string): UserAccount | undefined {
  return MOCK_USERS.find((u) => u.id === id);
}

/** 取某角色的第一个用户（审批人展示用） */
export function firstUserWithRole(role: RoleKey): UserAccount | undefined {
  return MOCK_USERS.find((u) => u.roles.includes(role));
}

/**
 * 角色 → 菜单项可见性矩阵。
 * 值 = 该角色可见的菜单项 key 数组；不在矩阵中的组默认仅 admin/archivist 可见。
 */
export const ROLE_MENU_MATRIX: Record<RoleKey, string[]> = {
  employee: [
    'voucher-search', 'matter-search', 'source-doc-search', 'volume-item-search', 'audit-trail',
    'my-borrow',
  ],
  dept_manager: [
    'voucher-search', 'matter-search', 'source-doc-search', 'volume-item-search', 'audit-trail',
    'my-borrow', 'approval-center', 'borrow-ledger',
  ],
  cfo: [
    'voucher-search', 'matter-search', 'source-doc-search', 'volume-item-search', 'audit-trail',
    'my-borrow', 'approval-center', 'borrow-ledger', 'borrow-stats',
  ],
  hrvp: [
    'voucher-search', 'matter-search', 'volume-item-search',
    'my-borrow', 'approval-center',
  ],
  archivist: [
    // 查询
    'voucher-search', 'matter-search', 'source-doc-search', 'volume-item-search', 'audit-trail',
    // 收集
    'archive-rcv', 'archive-api-receive',
    // 整理
    'voucher-manager', 'volume-workspace',
    // 保管
    'view-finance', 'digital-warehouse',
    // 利用
    'my-borrow', 'approval-center', 'borrow-manage', 'borrow-ledger', 'borrow-stats', 'transfer-manage',
    // 统计
    'stats-cockpit', 'stats-inventory', 'stats-lifecycle', 'stats-compliance',
    // 移交
    'archive-package', 'archive-transfer',
    // 配置
    'config-fanzong', 'directory-config', 'accounting-metadata', 'archive-code-config',
    'retention-config', 'volume-grouping-config', 'inspection-config', 'report-config', 'watermark-config',
  ],
  archive_director: [
    'voucher-search', 'matter-search', 'source-doc-search', 'volume-item-search', 'audit-trail',
    'view-finance', 'digital-warehouse',
    'my-borrow', 'approval-center', 'borrow-manage', 'borrow-ledger', 'borrow-stats', 'transfer-manage',
    'stats-cockpit', 'stats-inventory', 'stats-lifecycle', 'stats-compliance',
    'archive-package', 'archive-transfer',
  ],
  admin: ['*'],
};

/** 判断角色集合是否可见某菜单项 */
export function canSeeMenu(roles: RoleKey[], menuKey: string): boolean {
  if (roles.includes('admin')) return true;
  return roles.some((r) => (ROLE_MENU_MATRIX[r] || []).includes(menuKey));
}

/** 判断角色集合是否可见某菜单组（组内任一可见即可） */
export function canSeeGroup(roles: RoleKey[], itemKeys: string[]): boolean {
  if (roles.includes('admin')) return true;
  return itemKeys.some((k) => canSeeMenu(roles, k));
}


