/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * RoleManagePanel — 角色管理（2026-08-18 三维授权重构）
 *
 * 三维授权模型（对应参考模型 S_ROLERIGHT 功能×库×全宗 + 6 位 QX 操作码）：
 *   Tab1 功能权限：菜单功能码 + 门户功能码（sys-log 硬分立，仅安全审计员可授）
 *   Tab2 数据权限：全宗白名单 × 门类 × 部门范围 × 密级上限（行级过滤口径）
 *   Tab3 操作权限：查看目录/在线查看/下载/打印/借阅/复制
 *
 * 保存即写 ams_config['role-auth-v1']（zustand persist），服务端 30s 内生效；
 * 每次保存由 ConfigController 写哈希链审计日志（action=权限配置变更）。
 */

import React, { useMemo, useState } from 'react';
import {
  Shield, RotateCcw, Users, CheckSquare, Square, Info, Lock,
  Database, MousePointerClick, Menu as MenuIcon, Building2, Layers3,
} from 'lucide-react';
import { menuGroups } from '../config/menuConfig';
import { useRoleStore } from '../stores/roleStore';
import { useAppStore } from '../stores/appStore';
import { useArchiveStore } from '../stores/archiveStore';
import {
  MOCK_USERS, ROLE_LABELS, PORTAL_MENU_KEYS, SYS_LOG_KEY,
  OPERATION_KEYS, OPERATION_LABELS,
  type DeptMode, type RoleKey,
} from '../types/user';

const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  employee: '检索档案、加入借阅车、发起借阅申请、在线调阅',
  dept_manager: '本部门员工借阅单的第一级审批',
  archivist: '借阅终审、实体出库/归还核销、预约队列、中止借阅，以及收集/整理/保管全业务',
  archive_director: '借阅台账、统计分析驾驶舱、黑名单管理',
  cfo: '高危权限（下载/打印/原件外借）借阅单的升级审批',
  hrvp: '涉密档案（薪酬/高管报销）借阅单的强制会签',
  security_officer: '三员分立：人员/档案密级管理（人员管理页）',
  security_auditor: '三员分立：安全审计日志独占查阅（admin 亦不可见）',
  admin: '全部功能（安全审计日志除外，三员硬分立），不受矩阵限制',
};

const ROLE_BADGE_COLORS: Record<RoleKey, string> = {
  employee: 'bg-sky-100 text-sky-700',
  dept_manager: 'bg-sky-100 text-sky-700',
  archivist: 'bg-emerald-100 text-emerald-700',
  archive_director: 'bg-teal-100 text-teal-700',
  cfo: 'bg-violet-100 text-violet-700',
  hrvp: 'bg-rose-100 text-rose-700',
  security_officer: 'bg-amber-100 text-amber-700',
  security_auditor: 'bg-cyan-100 text-cyan-700',
  admin: 'bg-slate-700 text-white',
};

const ROLE_ORDER: RoleKey[] = [
  'employee', 'dept_manager', 'cfo', 'hrvp', 'archivist', 'archive_director',
  'security_officer', 'security_auditor', 'admin',
];

const PORTAL_LABELS: Record<string, string> = {
  'portal-search': '门户检索',
  'portal-view': '在线查看',
  'portal-borrow': '发起借阅',
  'portal-myborrow': '我的借阅',
};

const CLEARANCE_LABELS = ['普通', '内部', '秘密', '机密'];
const DEPT_MODE_LABELS: { value: DeptMode; label: string; hint: string }[] = [
  { value: 'all', label: '全部数据', hint: '不按部门过滤' },
  { value: 'own-dept', label: '本部门', hint: '本部门件 + 部门为空的公共件' },
  { value: 'self', label: '仅本人创建', hint: '归档前数据的创建人口径' },
];
const TYPE_OPTIONS = [
  { code: 'KP', label: '会计凭证' },
  { code: 'KB', 'label': '会计账簿' },
  { code: 'FB', label: '财务报告' },
  { code: 'QT', label: '其他' },
] as const;

type TabKey = 'function' | 'data' | 'operation';

const RoleManagePanel: React.FC = () => {
  const roleMenus = useRoleStore((s) => s.roleMenus);
  const roleDataScope = useRoleStore((s) => s.roleDataScope);
  const roleOperations = useRoleStore((s) => s.roleOperations);
  const toggleMenu = useRoleStore((s) => s.toggleMenu);
  const setGroupMenus = useRoleStore((s) => s.setGroupMenus);
  const patchDataScope = useRoleStore((s) => s.patchDataScope);
  const toggleOperation = useRoleStore((s) => s.toggleOperation);
  const resetToDefault = useRoleStore((s) => s.resetToDefault);
  const triggerToast = useAppStore((s) => s.triggerToast);
  const fanzongs = useArchiveStore((s) => s.fanzongs);

  const [selectedRole, setSelectedRole] = useState<RoleKey>('employee');
  const [tab, setTab] = useState<TabKey>('function');

  const usersOfRole = useMemo(
    () => (role: RoleKey) => MOCK_USERS.filter((u) => u.roles.includes(role)),
    [],
  );

  const grantedSet = useMemo(() => new Set(roleMenus[selectedRole] || []), [roleMenus, selectedRole]);
  const scope = roleDataScope[selectedRole];
  const ops = roleOperations[selectedRole];
  const isAdmin = selectedRole === 'admin';

  const handleReset = () => {
    resetToDefault();
    triggerToast('已恢复默认三维授权矩阵', 'info');
  };

  const TABS: { key: TabKey; label: string; Icon: typeof MenuIcon }[] = [
    { key: 'function', label: '功能权限', Icon: MenuIcon },
    { key: 'data', label: '数据权限', Icon: Database },
    { key: 'operation', label: '操作权限', Icon: MousePointerClick },
  ];

  return (
    <div className="flex h-full bg-slate-50">
      {/* 左：角色列表 */}
      <div className="w-[300px] shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-600" />
          <span className="text-sm font-bold text-slate-800">业务角色</span>
          <span className="text-[10px] text-slate-400 ml-auto">{ROLE_ORDER.length} 个</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {ROLE_ORDER.map((role) => {
            const users = usersOfRole(role);
            const active = selectedRole === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => setSelectedRole(role)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                  active ? 'bg-sky-50 border-sky-300 shadow-sm' : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${ROLE_BADGE_COLORS[role]}`}>
                    {ROLE_LABELS[role]}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-auto">{users.length} 人</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">{ROLE_DESCRIPTIONS[role]}</div>
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {users.map((u) => (
                    <span key={u.id} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                      {u.name}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 右：三维授权 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
          <span className={`text-[11px] px-2 py-1 rounded-full font-bold ${ROLE_BADGE_COLORS[selectedRole]}`}>
            {ROLE_LABELS[selectedRole]}
          </span>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1 px-3 py-1 text-xs rounded-md transition-colors ${
                  tab === t.key ? 'bg-white text-sky-700 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <t.Icon className="w-3 h-3" />{t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />恢复默认矩阵
          </button>
        </div>

        {isAdmin && (
          <div className="mx-5 mt-4 flex items-start gap-2 px-4 py-3 bg-sky-50 border border-sky-200 rounded-xl shrink-0">
            <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <p className="text-xs text-sky-700 leading-relaxed">
              系统管理员三维全部放行（安全审计日志除外——三员硬分立，仅安全审计员可见）。请切换到其他角色进行权限配置。
            </p>
          </div>
        )}

        {/* ═══ Tab 1 功能权限 ═══ */}
        {tab === 'function' && (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* 门户功能组 */}
              <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden ${isAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">检索门户</span>
                  <span className="text-[10px] text-slate-400">
                    {PORTAL_MENU_KEYS.filter((k) => grantedSet.has(k)).length}/{PORTAL_MENU_KEYS.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setGroupMenus(selectedRole, [...PORTAL_MENU_KEYS], !PORTAL_MENU_KEYS.every((k) => grantedSet.has(k)))}
                    className="ml-auto flex items-center gap-1 text-[10px] text-sky-600 hover:text-sky-800 transition-colors"
                  >
                    {PORTAL_MENU_KEYS.every((k) => grantedSet.has(k))
                      ? <><CheckSquare className="w-3 h-3" />取消全组</>
                      : <><Square className="w-3 h-3" />全选本组</>}
                  </button>
                </div>
                <div className="p-2 grid grid-cols-2 gap-1">
                  {PORTAL_MENU_KEYS.map((key) => {
                    const granted = grantedSet.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleMenu(selectedRole, key)}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all cursor-pointer border ${
                          granted
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-white border-transparent text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex-1 truncate">{PORTAL_LABELS[key]}</span>
                        {granted && <CheckSquare className="w-3 h-3 text-emerald-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 后台菜单组 */}
              {menuGroups.map((group) => {
                const itemKeys = group.items.map((i) => i.key);
                const grantedCount = itemKeys.filter((k) => grantedSet.has(k)).length;
                const allGranted = grantedCount === itemKeys.length;
                return (
                  <div key={group.key} className={`bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden ${isAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <group.Icon className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-xs font-bold text-slate-700">{group.label}</span>
                      <span className="text-[10px] text-slate-400">{grantedCount}/{itemKeys.length}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setGroupMenus(selectedRole, itemKeys, !allGranted);
                          triggerToast(`${group.label}：${allGranted ? '已整组取消' : '已整组授权'}`, 'success');
                        }}
                        className="ml-auto flex items-center gap-1 text-[10px] text-sky-600 hover:text-sky-800 transition-colors"
                      >
                        {allGranted ? <><CheckSquare className="w-3 h-3" />取消全组</> : <><Square className="w-3 h-3" />全选本组</>}
                      </button>
                    </div>
                    <div className="p-2 grid grid-cols-2 gap-1">
                      {group.items.map((item) => {
                        const granted = grantedSet.has(item.key);
                        // 硬分立：安全审计日志仅安全审计员可授（其他角色含 admin 一律锁定）
                        const locked = item.key === SYS_LOG_KEY && selectedRole !== 'security_auditor';
                        return (
                          <button
                            key={item.key}
                            type="button"
                            disabled={locked}
                            title={locked ? '三员硬分立：安全审计日志仅安全审计员可见，不可授予其他角色' : undefined}
                            onClick={() => !locked && toggleMenu(selectedRole, item.key)}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all border ${
                              locked
                                ? 'bg-slate-50 border-transparent text-slate-300 cursor-not-allowed'
                                : granted
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 cursor-pointer'
                                  : 'bg-white border-transparent text-slate-500 hover:bg-slate-50 cursor-pointer'
                            }`}
                          >
                            <item.Icon className={`w-3.5 h-3.5 shrink-0 ${locked ? 'text-slate-300' : granted ? 'text-emerald-600' : 'text-slate-400'}`} />
                            <span className="flex-1 truncate">{item.label}</span>
                            {locked
                              ? <Lock className="w-3 h-3 text-slate-300 shrink-0" />
                              : granted && <CheckSquare className="w-3 h-3 text-emerald-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
              <Users className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                功能权限保存后服务端 30 秒内同步生效（接口级校验，非仅菜单显隐）。
                审批流节点与角色绑定（部门经理/CFO/HRVP/档案管理员），不受菜单矩阵影响。
              </p>
            </div>
          </div>
        )}

        {/* ═══ Tab 2 数据权限 ═══ */}
        {tab === 'data' && scope && (
          <div className={`flex-1 overflow-y-auto p-5 ${isAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="max-w-3xl space-y-4">
              {/* 全宗白名单 */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">全宗范围</span>
                  <span className="text-[10px] text-slate-400">对应参考模型 S_ROLERIGHT 全宗树授权</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => patchDataScope(selectedRole, { fonds: '*' })}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      scope.fonds === '*'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    全部全宗
                  </button>
                  {fanzongs.map((fz) => {
                    const custom = scope.fonds !== '*';
                    const granted = custom && scope.fonds.includes(fz.code);
                    return (
                      <button
                        key={fz.code}
                        type="button"
                        onClick={() => {
                          const cur = scope.fonds === '*' ? [] : [...scope.fonds];
                          const next = granted ? cur.filter((c) => c !== fz.code) : [...cur, fz.code];
                          patchDataScope(selectedRole, { fonds: next.length === 0 ? [] : next });
                        }}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                          granted
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {fz.code} {fz.name.replace(/（.*）/, '')}
                      </button>
                    );
                  })}
                </div>
                {scope.fonds !== '*' && scope.fonds.length === 0 && (
                  <p className="mt-2 text-[10px] text-rose-500">未选择任何全宗：该角色将查不到任何档案数据</p>
                )}
              </div>

              {/* 门类范围 */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers3 className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">档案门类</span>
                  <span className="text-[10px] text-slate-400">对应参考模型「档案库」维度（LIBCODE）</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => patchDataScope(selectedRole, { types: '*' })}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      scope.types === '*'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    全部门类
                  </button>
                  {TYPE_OPTIONS.map((t) => {
                    const custom = scope.types !== '*';
                    const granted = custom && scope.types.includes(t.code);
                    return (
                      <button
                        key={t.code}
                        type="button"
                        onClick={() => {
                          const cur = scope.types === '*' ? [] : [...scope.types];
                          const next = granted ? cur.filter((c) => c !== t.code) : [...cur, t.code];
                          patchDataScope(selectedRole, { types: next });
                        }}
                        className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                          granted
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {t.code} {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 部门范围 */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">部门范围</span>
                  <span className="text-[10px] text-slate-400">行级过滤：部门为空的公共件对本部门可见</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {DEPT_MODE_LABELS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => patchDataScope(selectedRole, { deptMode: d.value })}
                      className={`px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        scope.deptMode === d.value
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`text-xs font-bold ${scope.deptMode === d.value ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {d.label}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{d.hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 密级上限 */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">密级上限</span>
                  <span className="text-[10px] text-slate-400">有效密级 = min(人员密级, 角色上限)；人员密级在人员管理页维护</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {CLEARANCE_LABELS.map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => patchDataScope(selectedRole, { maxClearance: idx })}
                      className={`px-3 py-2 rounded-xl border text-center transition-colors ${
                        scope.maxClearance === idx
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold'
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-xs">{label}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-slate-400">
                  高于上限的档案：检索/目录不可见，内容读取 403，需通过借阅审批调阅（自动触发升级审批链）。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Tab 3 操作权限 ═══ */}
        {tab === 'operation' && ops && (
          <div className={`flex-1 overflow-y-auto p-5 ${isAdmin ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-700">操作权限矩阵</span>
                <span className="text-[10px] text-slate-400 ml-2">对应参考模型 6 位 QX 权限码</span>
              </div>
              <div className="divide-y divide-slate-100">
                {OPERATION_KEYS.map((op) => {
                  const granted = Boolean(ops[op]);
                  const hints: Record<string, string> = {
                    catalog: '检索列表/目录树的可见性（服务端 /records、/volumes 等查询闸口）',
                    view: '在线预览文件内容（带水印）',
                    download: '下载文件到本地（烧录下载水印）；无此权须走借阅审批',
                    print: '打印文件（烧录打印水印）；无此权须走借阅审批',
                    borrow: '加入借阅车并发起借阅申请',
                    copy: '预览防复制（水印层联动）；关闭后预览页禁用复制/右键另存',
                  };
                  return (
                    <button
                      key={op}
                      type="button"
                      onClick={() => toggleOperation(selectedRole, op)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${granted ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${granted ? 'left-4.5' : 'left-0.5'}`}
                          style={{ left: granted ? '1.125rem' : '0.125rem' }} />
                      </span>
                      <span className="text-xs font-bold text-slate-700 w-28 shrink-0">{OPERATION_LABELS[op]}</span>
                      <span className="text-[10px] text-slate-400 flex-1">{hints[op]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 max-w-2xl flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                下载/打印默认对普通员工与审批角色关闭——这正是借阅升级审批链的触发条件：
                无操作权的场景发起借阅后，按流程配置自动路由 CFO/HRVP 升级审批。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoleManagePanel;
