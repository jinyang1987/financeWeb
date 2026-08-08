/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * RoleManagePanel — 角色管理（2026-07-18 重写）
 *
 * 与借阅审批流共用同一套角色体系（types/user.ts）：
 *   左：角色列表（含各角色下的用户）
 *   右：菜单权限矩阵（按菜单组勾选，实时生效于侧边栏）
 * 配置 persist 到 localStorage（role-menus-v1），可一键恢复默认。
 */

import React, { useMemo, useState } from 'react';
import { Shield, RotateCcw, Users, CheckSquare, Square, Info } from 'lucide-react';
import { menuGroups } from '../config/menuConfig';
import { useRoleStore } from '../stores/roleStore';
import { useAppStore } from '../stores/appStore';
import { MOCK_USERS, ROLE_LABELS, type RoleKey } from '../types/user';

const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  employee: '检索档案、加入借阅车、发起借阅申请、在线调阅',
  dept_manager: '本部门员工借阅单的第一级审批',
  archivist: '借阅终审、实体出库/归还核销、预约队列、中止借阅，以及收集/整理/保管全业务',
  archive_director: '借阅台账、统计分析驾驶舱、黑名单管理',
  cfo: '高危权限（下载/打印/原件外借）借阅单的升级审批',
  hrvp: '涉密档案（薪酬/高管报销）借阅单的强制会签',
  admin: '全部功能（含系统管理），不受菜单矩阵限制',
};

const ROLE_BADGE_COLORS: Record<RoleKey, string> = {
  employee: 'bg-sky-100 text-sky-700',
  dept_manager: 'bg-sky-100 text-sky-700',
  archivist: 'bg-emerald-100 text-emerald-700',
  archive_director: 'bg-teal-100 text-teal-700',
  cfo: 'bg-violet-100 text-violet-700',
  hrvp: 'bg-rose-100 text-rose-700',
  admin: 'bg-slate-700 text-white',
};

const ROLE_ORDER: RoleKey[] = ['employee', 'dept_manager', 'cfo', 'hrvp', 'archivist', 'archive_director', 'admin'];

const RoleManagePanel: React.FC = () => {
  const roleMenus = useRoleStore((s) => s.roleMenus);
  const toggleMenu = useRoleStore((s) => s.toggleMenu);
  const setGroupMenus = useRoleStore((s) => s.setGroupMenus);
  const resetToDefault = useRoleStore((s) => s.resetToDefault);
  const triggerToast = useAppStore((s) => s.triggerToast);

  const [selectedRole, setSelectedRole] = useState<RoleKey>('employee');

  const usersOfRole = useMemo(
    () => (role: RoleKey) => MOCK_USERS.filter((u) => u.roles.includes(role)),
    [],
  );

  const grantedSet = useMemo(() => new Set(roleMenus[selectedRole] || []), [roleMenus, selectedRole]);
  const isAdmin = selectedRole === 'admin';

  const handleReset = () => {
    resetToDefault();
    triggerToast('已恢复默认角色权限矩阵', 'info');
  };

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

      {/* 右：菜单权限矩阵 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-5 py-3 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
          <span className={`text-[11px] px-2 py-1 rounded-full font-bold ${ROLE_BADGE_COLORS[selectedRole]}`}>
            {ROLE_LABELS[selectedRole]}
          </span>
          <span className="text-xs text-slate-400">菜单权限矩阵 · 保存即时生效于侧边栏</span>
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
              系统管理员拥有全部菜单权限，不受矩阵限制。请切换到其他角色进行权限配置。
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            toggleMenu(selectedRole, item.key);
                          }}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all cursor-pointer border ${
                            granted
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-white border-transparent text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <item.Icon className={`w-3.5 h-3.5 shrink-0 ${granted ? 'text-emerald-600' : 'text-slate-400'}`} />
                          <span className="flex-1 truncate">{item.label}</span>
                          {granted && <CheckSquare className="w-3 h-3 text-emerald-500 shrink-0" />}
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
              权限变更即时生效：对应角色的用户下次刷新或切换身份后，侧边栏只显示已授权菜单。
              审批流节点与角色绑定（部门经理/CFO/HRVP/档案管理员），不受菜单矩阵影响。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleManagePanel;

