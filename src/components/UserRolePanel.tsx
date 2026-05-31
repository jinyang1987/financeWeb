/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Key, Eye, Edit3, Trash2, Check, Lock, Info, Server } from 'lucide-react';

interface RoleAuthority {
  id: string;
  name: string;
  groupName: string;
  canRead: boolean;
  canWrite: boolean;
  canAudit: boolean;
  canDestroy: boolean;
  dataBoundary: string;
}

export const UserRolePanel: React.FC<{ triggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void }> = ({ triggerToast }) => {
  const [roles, setRoles] = useState<RoleAuthority[]>([
    { id: 'role-1', name: '全宗档案管理员', groupName: 'GROUP_ARCHIVE_ADMIN', canRead: true, canWrite: true, canAudit: true, canDestroy: false, dataBoundary: '所属全宗内全部公文及财务门类' },
    { id: 'role-2', name: '凭证录入员', groupName: 'GROUP_FINANCE_ENTRY', canRead: true, canWrite: true, canAudit: false, canDestroy: false, dataBoundary: '限自身录入凭金、普通发票XML/PDF附件' },
    { id: 'role-3', name: '财务总监(只读审计)', groupName: 'GROUP_FINANCE_DIRECTOR', canRead: true, canWrite: false, canAudit: true, canDestroy: false, dataBoundary: '集团全量全宗，限只读查看大单、审计日志' },
    { id: 'role-4', name: '外部独立审计师', groupName: 'GROUP_AUDITOR', canRead: true, canWrite: false, canAudit: false, canDestroy: false, dataBoundary: '限指定年份及季度，时效验证期拦截通过件' },
  ]);

  const [activeEditingId, setActiveEditingId] = useState<string | null>(null);

  const handleTogglePermission = (id: string, attribute: 'canRead' | 'canWrite' | 'canAudit' | 'canDestroy') => {
    setRoles(prev => prev.map(r => {
      if (r.id === id) {
        if (attribute === 'canDestroy') {
          triggerToast('国家规定任何普通或主管柜员均严禁单向销毁合法会计档案！必须启动联合销毁多级工作流。', 'warning');
          return r;
        }
        const nextVal = !r[attribute];
        triggerToast(`已动态调整角色 [${r.name}] 的物理权限项：${attribute === 'canRead' ? '自检读取' : attribute === 'canWrite' ? '流转写入' : '安全审计'} → ${nextVal ? '允许' : '阻断'}`, 'info');
        return { ...r, [attribute]: nextVal };
      }
      return r;
    }));
  };

  const handleSaveMatrix = () => {
    triggerToast('【权限授权引擎配置成功】所有 Acl 策略已编译成物理授权域字节码，部署至 Alfresco Authority Service！', 'success');
  };

  return (
    <div id="user-role-panel" className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <span>系统安全权限管理与角色赋权矩阵</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">管理角色、专属授权组(Group Authority)的精细化 ACL 对照表。设置查看、上传、修改元数据、自动组卷的底层边界。</p>
        </div>
        <button
          type="button"
          onClick={handleSaveMatrix}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>保存物理赋权矩阵</span>
        </button>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-150 rounded-2xl flex items-start gap-3 text-xs text-blue-805">
        <Server className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="block font-bold">Alfresco ACE (Access Control Entry) 防护说明</strong>
          <span className="block text-slate-650 text-slate-600 font-sans leading-relaxed">
            所有角色权限基于底层密链 Acl 严格映射。勾选或变更配置将重新加载权限策略空间，杜绝对非授权发票明细的垂直越权与平行越权嗅探。
          </span>
        </div>
      </div>

      {/* Grid roles */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-sans" id="roles-matrix-table">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-400 font-bold text-[10px] tracking-wider uppercase">
                <th className="p-4 w-40">内置安全角色</th>
                <th className="p-4 w-56">绑定的 Alfresco LDAP Group ID</th>
                <th className="p-4 text-center w-24">阅读/自检 (Read)</th>
                <th className="p-4 text-center w-24">上传/写入 (Write)</th>
                <th className="p-4 text-center w-24">穿透审计 (Audit)</th>
                <th className="p-4 text-center w-24">一键销毁 (Destroy)</th>
                <th className="p-4">数据可见度隔离边界 (Data Boundary)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11.5px] text-slate-700">
              {roles.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-bold text-slate-900">{r.name}</td>
                  <td className="p-4">
                    <code className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded font-mono font-bold text-[10.5px]">
                      {r.groupName}
                    </code>
                  </td>
                  
                  {/* Read check */}
                  <td className="p-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleTogglePermission(r.id, 'canRead')}
                      className={`mx-auto w-5 h-5 rounded flex items-center justify-center border transition-all cursor-pointer ${
                        r.canRead ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-300'
                      }`}
                    >
                      {r.canRead && <Check className="w-3.5 h-3.5 font-bold" />}
                    </button>
                  </td>

                  {/* Write check */}
                  <td className="p-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleTogglePermission(r.id, 'canWrite')}
                      className={`mx-auto w-5 h-5 rounded flex items-center justify-center border transition-all cursor-pointer ${
                        r.canWrite ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-300'
                      }`}
                    >
                      {r.canWrite && <Check className="w-3.5 h-3.5 font-bold" />}
                    </button>
                  </td>

                  {/* Audit check */}
                  <td className="p-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleTogglePermission(r.id, 'canAudit')}
                      className={`mx-auto w-5 h-5 rounded flex items-center justify-center border transition-all cursor-pointer ${
                        r.canAudit ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-300'
                      }`}
                    >
                      {r.canAudit && <Check className="w-3.5 h-3.5 font-bold" />}
                    </button>
                  </td>

                  {/* Destroy block (Forbidden by default) */}
                  <td className="p-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleTogglePermission(r.id, 'canDestroy')}
                      className="mx-auto w-5 h-5 bg-red-50 border border-red-100 rounded flex items-center justify-center text-red-500 cursor-not-allowed"
                      title="受到国家法律及审计锁链阻断，严禁任何单边物理销毁。"
                    >
                      <Lock className="w-3 h-3" />
                    </button>
                  </td>

                  <td className="p-4 text-slate-500 font-sans">{r.dataBoundary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
