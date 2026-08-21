/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 用户与角色模型 — 借阅全生命周期的角色基础
 *
 * 角色设计（2026-07-18 与用户对齐；2026-08-18 增补三员）：
 *   员工(employee)        → 检索档案、加入借阅车、发起借阅申请、在线调阅
 *   部门经理(dept_manager) → 审批本部门员工借阅单（第一级审批）
 *   档案管理员(archivist)  → 审批（末级）、实体出库/归还核销、预约队列管理、中止借阅
 *   档案主管(archive_director) → 借阅台账/统计分析驾驶舱、黑名单管理
 *   财务总监(cfo)          → 高危权限（下载/打印/原件外借）的升级审批
 *   HR副总裁(hrvp)         → 涉密档案（薪酬/高管报销）的升级审批
 *   安全保密员(security_officer) → 人员/档案密级管理（三员分立，2026-08-18）
 *   安全审计员(security_auditor) → 安全审计日志独占（硬分立：admin 不可见 sys-log）
 *   系统管理员(admin)      → 全部功能（审计日志除外，三员硬分立）
 */

/** 角色标识 */
export type RoleKey =
  | 'employee'
  | 'dept_manager'
  | 'archivist'
  | 'archive_director'
  | 'cfo'
  | 'hrvp'
  | 'security_officer'
  | 'security_auditor'
  | 'admin';

/** 角色中文名 */
export const ROLE_LABELS: Record<RoleKey, string> = {
  employee: '普通员工',
  dept_manager: '部门经理',
  archivist: '档案管理员',
  archive_director: '档案主管',
  cfo: '财务总监',
  hrvp: 'HR副总裁',
  security_officer: '安全保密员',
  security_auditor: '安全审计员',
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
  { id: 'u-qianfang', account: 'qianfang', name: '钱芳', empNo: '000612', dept: '信息安全部', position: '安全保密员', roles: ['security_officer'], avatarColor: 'bg-amber-600' },
  { id: 'u-shenji', account: 'shenji', name: '沈骥', empNo: '000530', dept: '审计部', position: '安全审计员', roles: ['security_auditor'], avatarColor: 'bg-cyan-700' },
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

// ═══════════════════ 功能码体系（对应参考模型 S_XTGN 功能字典） ═══════════════════

/** 门户功能码（非后台菜单；参与功能授权但不参与"是否有后台菜单"判定） */
export const PORTAL_MENU_KEYS = ['portal-search', 'portal-view', 'portal-borrow', 'portal-myborrow'] as const;

/** 硬分立功能码：安全审计日志仅安全审计员可见（admin 不豁免，矩阵显式授予其他角色也不生效） */
export const SYS_LOG_KEY = 'sys-log';

/** 判断 key 是否门户功能码 */
export function isPortalKey(key: string): boolean {
  return key.startsWith('portal-');
}

/**
 * 角色 → 菜单项可见性矩阵（功能权限维度，对应参考模型 S_ROLERIGHT 功能树）。
 * 值 = 该角色可见的菜单项 key 数组；门户功能码单列；admin='*'（sys-log 硬分立除外）。
 */
export const ROLE_MENU_MATRIX: Record<RoleKey, string[]> = {
  // 普通员工仅使用检索门户（检索 + 我的借阅），无后台菜单
  employee: [...PORTAL_MENU_KEYS],
  dept_manager: [
    ...PORTAL_MENU_KEYS,
    'voucher-search', 'matter-search', 'source-doc-search', 'volume-item-search', 'audit-trail',
    'approval-center', 'borrow-ledger',
  ],
  cfo: [
    ...PORTAL_MENU_KEYS,
    'voucher-search', 'matter-search', 'source-doc-search', 'volume-item-search', 'audit-trail',
    'approval-center', 'borrow-ledger', 'borrow-stats',
  ],
  hrvp: [
    ...PORTAL_MENU_KEYS,
    'voucher-search', 'matter-search', 'volume-item-search',
    'approval-center',
  ],
  archivist: [
    ...PORTAL_MENU_KEYS,
    // 查询
    'voucher-search', 'matter-search', 'source-doc-search', 'volume-item-search', 'audit-trail',
    // 收集
    'archive-rcv', 'archive-api-receive',
    // 整理
    'volume-workspace',
    // 保管
    'view-finance', 'digital-warehouse',
    // 利用（管理侧：审批 + 借阅管理；「我的借阅」归检索门户，后台不保留）
    'approval-center', 'borrow-manage', 'borrow-ledger', 'borrow-stats', 'transfer-manage',
    // 统计
    'stats-cockpit', 'stats-inventory', 'stats-lifecycle', 'stats-compliance',
    // 移交
    'archive-package', 'archive-transfer', 'appraisal-manage',
    // 配置
    'config-fanzong', 'directory-config', 'archive-manage-config',
    'retention-config', 'inspection-config', 'report-config', 'watermark-config',
    'config-workflow', 'sys-cockpit-config',
    // 系统
    'sys-connection', 'sys-storage',
  ],
  archive_director: [
    ...PORTAL_MENU_KEYS,
    'voucher-search', 'matter-search', 'source-doc-search', 'volume-item-search', 'audit-trail',
    'volume-workspace',
    'view-finance', 'digital-warehouse',
    'approval-center', 'borrow-manage', 'borrow-ledger', 'borrow-stats', 'transfer-manage',
    'stats-cockpit', 'stats-inventory', 'stats-lifecycle', 'stats-compliance',
    'archive-package', 'archive-transfer', 'appraisal-manage',
    'sys-connection', 'sys-storage',
  ],
  // 安全保密员：人员管理（密级）+ 检索核查密级标定（三员分立）
  security_officer: ['voucher-search', 'volume-item-search', 'sys-personnel'],
  // 安全审计员：仅安全审计日志（硬分立）
  security_auditor: [SYS_LOG_KEY],
  admin: ['*'],
};

// ═══════════════════ 数据权限维度（对应参考模型 S_MROPER/GZOPER 行级授权） ═══════════════════

/** 部门范围口径：all 全部 / own-dept 本部门（部门为空的公共件可见）/ self 仅本人创建 */
export type DeptMode = 'all' | 'own-dept' | 'self';

/** 单角色数据范围声明（多角色取并集 = 各维最宽松） */
export interface RoleDataScope {
  /** 全宗白名单：'*' 或全宗代码数组 */
  fonds: '*' | string[];
  /** 档案门类：'*' 或 KP/KB/FB/QT 子集 */
  types: '*' | string[];
  deptMode: DeptMode;
  /** 角色密级上限 0普通/1内部/2秘密/3机密；有效密级=min(人员密级, 角色上限) */
  maxClearance: number;
}

/** 默认数据权限矩阵（收紧口径；与后端 PermissionService.DataScopeDefaults 严格同构） */
export const ROLE_DATA_SCOPE_DEFAULT: Record<RoleKey, RoleDataScope> = {
  employee: { fonds: '*', types: '*', deptMode: 'own-dept', maxClearance: 1 },
  dept_manager: { fonds: '*', types: '*', deptMode: 'own-dept', maxClearance: 2 },
  cfo: { fonds: '*', types: '*', deptMode: 'all', maxClearance: 3 },
  hrvp: { fonds: '*', types: '*', deptMode: 'all', maxClearance: 3 },
  archivist: { fonds: '*', types: '*', deptMode: 'all', maxClearance: 3 },
  archive_director: { fonds: '*', types: '*', deptMode: 'all', maxClearance: 3 },
  security_officer: { fonds: '*', types: '*', deptMode: 'all', maxClearance: 3 },
  security_auditor: { fonds: '*', types: '*', deptMode: 'all', maxClearance: 3 }, // 操作权全关，数据范围不生效
  admin: { fonds: '*', types: '*', deptMode: 'all', maxClearance: 3 },
};

// ═══════════════════ 操作权限维度（对应参考模型 6 位 QX 权限码） ═══════════════════

/** 操作码：查看目录/在线查看/下载/打印/借阅/复制 */
export type OperationKey = 'catalog' | 'view' | 'download' | 'print' | 'borrow' | 'copy';

export const OPERATION_LABELS: Record<OperationKey, string> = {
  catalog: '查看目录',
  view: '在线查看',
  download: '下载文件',
  print: '打印文件',
  borrow: '发起借阅',
  copy: '复制（防复制）',
};

export const OPERATION_KEYS = Object.keys(OPERATION_LABELS) as OperationKey[];

/** 默认操作权限矩阵（与后端 PermissionService.DataScopeDefaults 严格同构） */
export const ROLE_OPERATIONS_DEFAULT: Record<RoleKey, Record<OperationKey, boolean>> = {
  employee: { catalog: true, view: true, download: false, print: false, borrow: true, copy: false },
  dept_manager: { catalog: true, view: true, download: false, print: false, borrow: true, copy: false },
  cfo: { catalog: true, view: true, download: true, print: true, borrow: true, copy: true },
  hrvp: { catalog: true, view: true, download: true, print: false, borrow: true, copy: false },
  archivist: { catalog: true, view: true, download: true, print: true, borrow: true, copy: true },
  archive_director: { catalog: true, view: true, download: true, print: true, borrow: true, copy: true },
  security_officer: { catalog: true, view: true, download: false, print: false, borrow: false, copy: false },
  security_auditor: { catalog: false, view: false, download: false, print: false, borrow: false, copy: false },
  admin: { catalog: true, view: true, download: true, print: true, borrow: true, copy: true },
};

/** 判断角色集合是否可见某菜单项 */
export function canSeeMenu(roles: RoleKey[], menuKey: string): boolean {
  if (menuKey === SYS_LOG_KEY) return roles.includes('security_auditor');
  if (roles.includes('admin')) return true;
  return roles.some((r) => (ROLE_MENU_MATRIX[r] || []).includes(menuKey));
}

/** 判断角色集合是否可见某菜单组（组内任一可见即可） */
export function canSeeGroup(roles: RoleKey[], itemKeys: string[]): boolean {
  if (roles.includes('admin')) return true;
  return itemKeys.some((k) => canSeeMenu(roles, k));
}
