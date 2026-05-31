/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, Settings, RefreshCw, FileText, ToggleLeft, ToggleRight, CheckSquare, Layers, Code, UserCheck } from 'lucide-react';

interface WorkflowItem {
  id: string;
  name: string;
  type: string;
  triggerCondition: string;
  autoCheckRule: string;
  active: boolean;
  approver: string;
  stages: string[];
}

export const WorkflowConfigPanel: React.FC<{ triggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void }> = ({ triggerToast }) => {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([
    {
      id: 'wf-vd',
      name: '凭证自动合规质检审批工作流',
      type: 'Ingestion Check & Match',
      triggerCondition: '所有上传数电XML/OFD原件的会计件数据自动调度',
      autoCheckRule: '进行四性（真实性、完整性、可用、安全）交叉勾稽，满足后触发状态变更为合格件',
      active: true,
      approver: '系统合规密码机自动验签审结',
      stages: ['智能采集', '四性质检验签', '档号分配', '已组卷归档']
    },
    {
      id: 'wf-large',
      name: '大额资金关联发票（≥ ¥100,000）联机三单核查流',
      type: 'Three-way Matching Audits',
      triggerCondition: '凭证发生金额大于等于10万人民币',
      autoCheckRule: 'OCR发票总面额、银行进出账电子回单流水、业务采购合同PDF指纹摘要必须完全勾地关联一致',
      active: true,
      approver: '集团首席财务审核官 (jinlinrun198x)',
      stages: ['限额预警拦截', '国税总局专真勾稽', '多级财务领导联同审批', '密账存证']
    },
    {
      id: 'wf-destruction',
      name: '满保管期限电子档案（≥ 30年）物理注销与数据清洗流',
      type: 'Safe Disposal & Purge',
      triggerCondition: '档案保管年限满30年或永久归档手动申请注销',
      autoCheckRule: '触发脱敏脱排，多级权限授权后，在长效哈希库上标注销毁状态，并生成包含物理时间戳的销毁核证单',
      active: false,
      approver: '董事会财务安全管理决策委员会',
      stages: ['到期轮询扫描', '物理资产物理销毁申报', '安全部门防渗透脱敏', '哈希链吊销备案']
    }
  ]);

  const [activeWorkflowItem, setActiveWorkflowItem] = useState<WorkflowItem | null>(null);

  const handleToggleActive = (id: string, name: string, nowActive: boolean) => {
    setWorkflows(prev => prev.map(w => {
      if (w.id === id) {
        const nextActive = !nowActive;
        triggerToast(`工作流【${name}】状态已更改为：${nextActive ? '正常拦截运行中' : '静态旁路关闭'}`, 'info');
        return { ...w, active: nextActive };
      }
      return w;
    }));
  };

  const handleOpenEdit = (item: WorkflowItem) => {
    setActiveWorkflowItem(JSON.parse(JSON.stringify(item)));
  };

  const handleSaveWorkflow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkflowItem) return;
    setWorkflows(prev => prev.map(w => {
      if (w.id === activeWorkflowItem.id) {
        return activeWorkflowItem;
      }
      return w;
    }));
    triggerToast(`工作流配置「${activeWorkflowItem.name}」模型规则修改完毕并成功热部署至审批引擎！`, 'success');
    setActiveWorkflowItem(null);
  };

  return (
    <div id="workflow-config" className="space-y-5 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600" />
            <span>智能会计档案审批与防篡改生命周期流规则配置</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">控制归档触发规则、大额核销、区块链不可变存证流程，并配置审批决策链。</p>
        </div>
      </div>

      <div className="space-y-4">
        {workflows.map(w => (
          <div key={w.id} className={`bg-white border rounded-2xl p-5 shadow-xs transition-all hover:shadow-md ${w.active ? 'border-slate-205' : 'border-slate-100 opacity-75'}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 font-bold uppercase text-[9.5px] rounded-md ${
                    w.active ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {w.type}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">流编码: {w.id.toUpperCase()}</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">{w.name}</h3>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleActive(w.id, w.name, w.active)}
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  {w.active ? (
                    <ToggleRight className="w-8 h-8 text-blue-600" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-slate-300" />
                  )}
                  <span>{w.active ? '引擎激活' : '旁路挂起'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenEdit(w)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-150 rounded-xl text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  配置规则条件
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 text-xs">
              <div className="space-y-1">
                <span className="text-slate-400 block font-medium">触发节点条件 (Trigger)</span>
                <p className="text-slate-700 font-sans font-medium">{w.triggerCondition}</p>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 block font-medium">智能多维核查逻辑</span>
                <p className="text-slate-700 font-sans font-medium leading-relaxed">{w.autoCheckRule}</p>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 block font-medium">第一负责人 / 仲裁密码印章</span>
                <p className="text-slate-800 font-bold">{w.approver}</p>
              </div>
            </div>

            {/* Stages sequence display */}
            <div className="mt-5 bg-slate-50/50 p-4 border border-dashed border-slate-200 rounded-xl">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-2">流向节点串接追踪器</span>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {w.stages.map((stage, sIdx) => (
                  <React.Fragment key={stage}>
                    <div className="bg-white border border-slate-200 px-3 py-1 rounded-xl text-slate-700 font-medium font-sans flex items-center gap-1.5 shadow-3xs">
                      <span className="w-4 h-4 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-mono text-[10px] font-bold">{sIdx + 1}</span>
                      <span>{stage}</span>
                    </div>
                    {sIdx < w.stages.length - 1 && (
                      <span className="text-slate-300 font-bold font-mono">→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Editor Modal for Rules change */}
      {activeWorkflowItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-250 p-6 shadow-2xl relative space-y-4">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm">配置工作流审批条件 & Rule Engine</h3>
              <p className="text-[11px] text-slate-400">调整底层核销判定逻辑，避免发生不应组卷或四性不合规件直接入账的情况发生。</p>
            </div>

            <form onSubmit={handleSaveWorkflow} className="space-y-4 text-xs font-sans">
              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">工作流系统别名</label>
                <input
                  type="text"
                  required
                  value={activeWorkflowItem.name}
                  onChange={e => setActiveWorkflowItem({ ...activeWorkflowItem, name: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">触发自动判定节点</label>
                <input
                  type="text"
                  required
                  value={activeWorkflowItem.triggerCondition}
                  onChange={e => setActiveWorkflowItem({ ...activeWorkflowItem, triggerCondition: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs text-slate-700"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">自动审核检验逻辑</label>
                <textarea
                  rows={3}
                  required
                  value={activeWorkflowItem.autoCheckRule}
                  onChange={e => setActiveWorkflowItem({ ...activeWorkflowItem, autoCheckRule: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs text-slate-700 leading-normal"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">第一责任核决人 / 系统角色代号</label>
                <input
                  type="text"
                  required
                  value={activeWorkflowItem.approver}
                  onChange={e => setActiveWorkflowItem({ ...activeWorkflowItem, approver: e.target.value })}
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs text-slate-700"
                />
              </div>

              <div className="pt-3 border-t border-slate-150 flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveWorkflowItem(null)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 font-semibold rounded-lg cursor-pointer hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4.5 py-1.5 bg-blue-605 text-white bg-blue-600 font-semibold rounded-lg cursor-pointer hover:bg-blue-700 shadow-sm"
                >
                  热更新至审批中枢
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
