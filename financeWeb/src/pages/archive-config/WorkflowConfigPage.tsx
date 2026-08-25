/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * WorkflowConfigPage — 流程配置（可视化流程设计器）
 *
 * 合并原「工作流设计器」的画布能力与「流程配置」的业务元数据：
 *   左：流程清单（按业务类别分组）
 *   中：SVG 画布（节点 + 贝塞尔连线 + 点阵网格 + 自动布局）
 *   右：上下文属性面板（流程设置 / 节点属性 / 连线属性）
 * 配置持久化到 ams_config（workflow.config）。
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  GitBranch, Plus, Trash2, Link2, LayoutGrid, Save, RotateCcw,
  Play, Square, Users, GitFork, ChevronRight, X, Check, Power,
  MousePointer2, CircleDot, ArrowUp, ArrowDown, Zap, Info,
} from 'lucide-react';
import {
  useWorkflowConfigStore,
  WORKFLOW_CATEGORY_META,
  APPROVER_ROLE_OPTIONS,
  getChainRules,
  type ApprovalChainRules,
  type BusinessWorkflow,
  type EscalationWhen,
  type WorkflowCategory,
} from '../../stores/workflowConfigStore';
import { WF_NODE_TYPE_LABELS, type WfNode, type WfNodeType } from '../../types/workflow-def';
import { useAppStore } from '../../stores/appStore';

// ═══════════════════════════════════════════════════════════
// 节点几何
// ═══════════════════════════════════════════════════════════

const NODE_DIMS: Record<WfNodeType, { w: number; h: number }> = {
  start: { w: 170, h: 46 },
  end: { w: 170, h: 46 },
  userTask: { w: 184, h: 58 },
  exclusiveGateway: { w: 54, h: 54 },
  parallelGateway: { w: 54, h: 54 },
};

const NODE_THEME: Record<WfNodeType, { accent: string; fill: string; stroke: string; text: string }> = {
  start:            { accent: '#10b981', fill: '#ecfdf5', stroke: '#6ee7b7', text: '#047857' },
  end:              { accent: '#f43f5e', fill: '#fff1f2', stroke: '#fda4af', text: '#be123c' },
  userTask:         { accent: '#0284c7', fill: '#f0f9ff', stroke: '#7dd3fc', text: '#0369a1' },
  exclusiveGateway: { accent: '#d97706', fill: '#fffbeb', stroke: '#fcd34d', text: '#b45309' },
  parallelGateway:  { accent: '#7c3aed', fill: '#f5f3ff', stroke: '#c4b5fd', text: '#6d28d9' },
};

const isGateway = (t: WfNodeType) => t === 'exclusiveGateway' || t === 'parallelGateway';

// ─── 节点渲染 ───
const NodeView: React.FC<{
  node: WfNode;
  selected: boolean;
  linking: boolean;
  dimmed: boolean;
  onClick: (e: React.MouseEvent) => void;
}> = ({ node, selected, linking, dimmed, onClick }) => {
  const d = NODE_DIMS[node.type];
  const th = NODE_THEME[node.type];
  const gw = isGateway(node.type);

  return (
    <g
      onClick={onClick}
      style={{ cursor: 'pointer', opacity: dimmed ? 0.35 : 1, transition: 'opacity 150ms' }}
      className="wf-node"
    >
      {gw ? (
        <>
          <polygon
            points={`${node.x},${node.y - d.h / 2} ${node.x + d.w / 2},${node.y} ${node.x},${node.y + d.h / 2} ${node.x - d.w / 2},${node.y}`}
            fill={selected ? '#fef3c7' : th.fill}
            stroke={selected ? th.accent : th.stroke}
            strokeWidth={selected ? 2.5 : 1.5}
            style={{ filter: selected ? `drop-shadow(0 0 6px ${th.accent}66)` : 'drop-shadow(0 1px 2px rgba(15,23,42,0.08))' }}
          />
          <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="middle"
            fontSize={18} fontWeight={700} fill={th.text}>
            {node.type === 'exclusiveGateway' ? '◇' : '≡'}
          </text>
          <text x={node.x} y={node.y + d.h / 2 + 14} textAnchor="middle" fontSize={10} fill="#64748b" fontWeight={500}>
            {node.label}
          </text>
        </>
      ) : (
        <>
          <rect
            x={node.x - d.w / 2} y={node.y - d.h / 2} width={d.w} height={d.h} rx={d.h / 2}
            fill={selected ? '#e0f2fe' : th.fill}
            stroke={selected ? th.accent : th.stroke}
            strokeWidth={selected ? 2.5 : 1.5}
            style={{ filter: selected ? `drop-shadow(0 0 7px ${th.accent}59)` : 'drop-shadow(0 1px 3px rgba(15,23,42,0.10))' }}
          />
          {/* 左侧类型色条 */}
          <rect x={node.x - d.w / 2 + 5} y={node.y - d.h / 2 + 9} width={4} height={d.h - 18} rx={2} fill={th.accent} />
          {/* 图标 */}
          <text x={node.x - d.w / 2 + 22} y={node.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill={th.text}>
            {node.type === 'start' ? '▶' : node.type === 'end' ? '■' : '👤'}
          </text>
          {/* 标签 */}
          <text x={node.x + 8} y={node.type === 'userTask' && node.assigneeLabel ? node.y - 5 : node.y + 1}
            textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight={600} fill="#1e293b">
            {node.label.length > 11 ? node.label.slice(0, 11) + '…' : node.label}
          </text>
          {node.type === 'userTask' && node.assigneeLabel && (
            <text x={node.x + 8} y={node.y + 12} textAnchor="middle" dominantBaseline="middle" fontSize={9.5} fill="#94a3b8">
              {node.assigneeLabel}
            </text>
          )}
        </>
      )}
      {/* 连线模式高亮环 */}
      {linking && (
        <circle cx={node.x} cy={node.y} r={(gw ? d.w : Math.max(d.w, d.h)) / 2 + 8}
          fill="none" stroke="#0284c7" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
      )}
    </g>
  );
};

// ─── 连线渲染 ───
const ConnectionView: React.FC<{
  source: WfNode; target: WfNode; label?: string; selected: boolean;
  onClick: (e: React.MouseEvent) => void;
}> = ({ source, target, label, selected, onClick }) => {
  const s = NODE_DIMS[source.type];
  const t = NODE_DIMS[target.type];
  const x1 = source.x, y1 = source.y + s.h / 2;
  const x2 = target.x, y2 = target.y - t.h / 2 - 4;
  const midY = (y1 + y2) / 2;
  const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  const color = selected ? '#0284c7' : '#94a3b8';

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* 加宽的透明命中区域 */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={14} />
      <path d={path} fill="none" stroke={color} strokeWidth={selected ? 2.5 : 1.6}
        markerEnd={selected ? 'url(#arrow-sel)' : 'url(#arrow)'}
        style={{ transition: 'stroke 150ms' }} />
      {label && (
        <g>
          <rect x={(x1 + x2) / 2 - label.length * 6 - 6} y={midY - 9} width={label.length * 12 + 12} height={18}
            rx={9} fill="#ffffff" stroke={selected ? '#7dd3fc' : '#e2e8f0'} strokeWidth={1} />
          <text x={(x1 + x2) / 2} y={midY + 1} textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fontWeight={600} fill={selected ? '#0369a1' : '#64748b'}>
            {label}
          </text>
        </g>
      )}
    </g>
  );
};

// ═══════════════════════════════════════════════════════════
// 右侧属性面板
// ═══════════════════════════════════════════════════════════

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">{label}</label>
    {children}
  </div>
);

const inputCls =
  'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 ' +
  'focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors';

// ═══════════════════════════════════════════════════════════
// 借阅审批组链规则编辑（仅 wf-borrow-approval，服务端运行时消费）
// ═══════════════════════════════════════════════════════════

const ESCALATION_META: Record<EscalationWhen, { label: string; hint: string }> = {
  extended_perms: { label: '含下载 / 打印 / 实体调阅', hint: '任一明细申请下载、打印权限或实体外借时触发' },
  sensitive: { label: '涉密（秘密 / 机密）', hint: '任一明细密级为秘密或机密时触发' },
};

const roleLabel = (key: string) => APPROVER_ROLE_OPTIONS.find((r) => r.key === key)?.label || key;

const BorrowChainRulesPanel: React.FC<{ wf: BusinessWorkflow }> = ({ wf }) => {
  const updateWorkflow = useWorkflowConfigStore((s) => s.updateWorkflow);
  const rules = getChainRules(wf);

  const save = (patch: Partial<ApprovalChainRules>) => {
    updateWorkflow(wf.id, { chainRules: { ...rules, ...patch } });
  };

  const moveBase = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rules.base.length) return;
    const next = [...rules.base];
    [next[i], next[j]] = [next[j], next[i]];
    save({ base: next });
  };

  const addableRoles = APPROVER_ROLE_OPTIONS.filter((r) => !rules.base.includes(r.key));

  return (
    <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-3.5 space-y-3.5">
      <div className="flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-emerald-600" />
        <span className="text-xs font-bold text-emerald-800">审批组链规则（运行中）</span>
        <span className="ml-auto text-[10px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">
          服务端实时消费 · v{wf.version}
        </span>
      </div>

      {/* 基础链 */}
      <div>
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5">基础审批链（必经，按顺序）</div>
        <div className="space-y-1">
          {rules.base.length === 0 && (
            <div className="text-[11px] text-slate-400 px-1">（空 — 审批链仅由升级规则与终审组成）</div>
          )}
          {rules.base.map((role, i) => (
            <div key={role} className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <span className="w-4 text-[10px] font-mono text-slate-400">{i + 1}</span>
              <span className="flex-1 text-xs font-medium text-slate-700">{roleLabel(role)}</span>
              <button type="button" disabled={i === 0} onClick={() => moveBase(i, -1)}
                className="p-0.5 text-slate-300 hover:text-sky-600 disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
              <button type="button" disabled={i === rules.base.length - 1} onClick={() => moveBase(i, 1)}
                className="p-0.5 text-slate-300 hover:text-sky-600 disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
              <button type="button" onClick={() => save({ base: rules.base.filter((_, j) => j !== i) })}
                className="p-0.5 text-slate-300 hover:text-rose-500"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
        {addableRoles.length > 0 && (
          <select
            value=""
            onChange={(e) => { if (e.target.value) save({ base: [...rules.base, e.target.value] }); }}
            className="mt-1.5 w-full px-2 py-1.5 text-xs border border-dashed border-slate-300 rounded-lg bg-white text-slate-500"
          >
            <option value="">+ 添加基础链角色…</option>
            {addableRoles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        )}
      </div>

      {/* 升级规则 */}
      <div>
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5">升级规则（满足条件时在终审前追加）</div>
        <div className="space-y-1.5">
          {rules.escalation.map((esc, i) => (
            <div key={esc.when} className="bg-white border border-slate-200 rounded-lg px-2.5 py-2">
              <div className="text-xs font-medium text-slate-700">{ESCALATION_META[esc.when]?.label}</div>
              <div className="text-[10px] text-slate-400 mb-1.5">{ESCALATION_META[esc.when]?.hint}</div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                追加
                <select
                  value={esc.appendRole}
                  onChange={(e) => {
                    const next = [...rules.escalation];
                    next[i] = { ...esc, appendRole: e.target.value };
                    save({ escalation: next });
                  }}
                  className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {APPROVER_ROLE_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 终审 */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-500">终审角色（必经）</span>
        <select
          value={rules.final}
          onChange={(e) => save({ final: e.target.value })}
          className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white"
        >
          {APPROVER_ROLE_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>

      {/* 动态审批人变量约定（对照 Activiti OperateVariablesListener 思想） */}
      <div className="border-t border-emerald-100 pt-2.5 space-y-1">
        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <Info className="w-3 h-3" />动态审批人约定
        </div>
      </div>

      {/* 生效语义 */}
      <div className="text-[10px] text-emerald-700 bg-emerald-100/70 border border-emerald-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
        修改即时生效于<strong>今后发起</strong>的借阅申请（在途单据按原链执行，对应「部署」语义）；
        停用本流程后，借阅审批回退系统默认链。
      </div>
    </div>
  );
};

const WorkflowSettingsPanel: React.FC<{ wf: BusinessWorkflow }> = ({ wf }) => {
  const updateWorkflow = useWorkflowConfigStore((s) => s.updateWorkflow);
  const toggleActive = useWorkflowConfigStore((s) => s.toggleActive);
  const meta = WORKFLOW_CATEGORY_META[wf.category];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">流程设置</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${meta.badge}`}>
          {meta.label}
        </span>
      </div>

      <Field label="流程名称">
        <input className={inputCls} value={wf.name}
          onChange={(e) => updateWorkflow(wf.id, { name: e.target.value })} />
      </Field>

      <Field label="流程类别">
        <select className={inputCls} value={wf.category} disabled={wf.builtIn}
          onChange={(e) => updateWorkflow(wf.id, { category: e.target.value as WorkflowCategory })}>
          {(Object.keys(WORKFLOW_CATEGORY_META) as WorkflowCategory[]).map((c) => (
            <option key={c} value={c}>{WORKFLOW_CATEGORY_META[c].label}</option>
          ))}
        </select>
      </Field>

      <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
        <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
          <Power className="w-3.5 h-3.5" /> 启用流程
        </span>
        <button type="button" onClick={() => toggleActive(wf.id)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${wf.active ? 'bg-sky-600' : 'bg-slate-300'}`}>
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${wf.active ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
        </button>
      </div>

      <Field label="触发条件">
        <textarea rows={2} className={inputCls + ' resize-none leading-relaxed'} value={wf.triggerCondition}
          onChange={(e) => updateWorkflow(wf.id, { triggerCondition: e.target.value })} />
      </Field>

      <Field label="自动核查逻辑">
        <textarea rows={3} className={inputCls + ' resize-none leading-relaxed'} value={wf.checkRule}
          onChange={(e) => updateWorkflow(wf.id, { checkRule: e.target.value })} />
      </Field>

      <Field label="责任人 / 决策角色">
        <input className={inputCls} value={wf.approver}
          onChange={(e) => updateWorkflow(wf.id, { approver: e.target.value })} />
      </Field>

      {/* 借阅利用流程：审批组链规则（服务端运行时消费） */}
      {wf.id === 'wf-borrow-approval' && <BorrowChainRulesPanel wf={wf} />}

      <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-2 text-center">
        <div className="bg-slate-50 rounded-lg py-2">
          <div className="text-lg font-bold text-slate-800 font-mono">{wf.nodes.length}</div>
          <div className="text-[10px] text-slate-400">节点</div>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <div className="text-lg font-bold text-slate-800 font-mono">{wf.connections.length}</div>
          <div className="text-[10px] text-slate-400">连线</div>
        </div>
      </div>
      <p className="text-[10px] text-slate-400">
        版本 v{wf.version} · 更新于 {wf.updatedDate}
      </p>
    </div>
  );
};

const NodeSettingsPanel: React.FC<{ wf: BusinessWorkflow; node: WfNode }> = ({ wf, node }) => {
  const updateNode = useWorkflowConfigStore((s) => s.updateNode);
  const deleteNode = useWorkflowConfigStore((s) => s.deleteNode);
  const th = NODE_THEME[node.type];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">节点属性</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
          style={{ backgroundColor: th.fill, color: th.text }}>
          {WF_NODE_TYPE_LABELS[node.type]}
        </span>
      </div>

      <Field label="节点名称">
        <input className={inputCls} value={node.label}
          onChange={(e) => updateNode(node.id, { label: e.target.value })} />
      </Field>

      {node.type === 'userTask' && (
        <>
          <Field label="审批人指定方式">
            <select className={inputCls} value={node.assigneeType || 'single'}
              onChange={(e) => updateNode(node.id, { assigneeType: e.target.value as WfNode['assigneeType'] })}>
              <option value="single">单人审批</option>
              <option value="candidate_group">候选组（任一审批）</option>
              <option value="multi_instance">多人会签</option>
            </select>
          </Field>
          <Field label="审批人角色">
            <input className={inputCls} value={node.assigneeLabel || ''} placeholder="如：部门经理"
              onChange={(e) => updateNode(node.id, { assigneeLabel: e.target.value })} />
          </Field>
          <Field label="办理时限（天）">
            <input type="number" min={1} className={inputCls} value={node.dueDateDays || 3}
              onChange={(e) => updateNode(node.id, { dueDateDays: parseInt(e.target.value) || 3 })} />
          </Field>
        </>
      )}

      {node.type === 'exclusiveGateway' && (
        <Field label="分支条件">
          <div className="space-y-1.5">
            {(node.conditions || []).map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input className={inputCls} value={c}
                  onChange={(e) => {
                    const conds = [...(node.conditions || [])];
                    conds[i] = e.target.value;
                    updateNode(node.id, { conditions: conds });
                  }} />
                <button type="button"
                  onClick={() => updateNode(node.id, { conditions: (node.conditions || []).filter((_, j) => j !== i) })}
                  className="p-1.5 text-rose-400 hover:text-rose-600 cursor-pointer shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button type="button"
              onClick={() => updateNode(node.id, { conditions: [...(node.conditions || []), '新分支'] })}
              className="w-full px-2 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer">
              + 添加分支
            </button>
          </div>
        </Field>
      )}

      <button type="button" onClick={() => deleteNode(node.id)}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 border border-rose-200 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer">
        <Trash2 className="w-3.5 h-3.5" /> 删除节点
      </button>
    </div>
  );
};

const ConnectionSettingsPanel: React.FC<{ wf: BusinessWorkflow; connId: string }> = ({ wf, connId }) => {
  const updateConnection = useWorkflowConfigStore((s) => s.updateConnection);
  const deleteConnection = useWorkflowConfigStore((s) => s.deleteConnection);
  const conn = wf.connections.find((c) => c.id === connId);
  if (!conn) return null;
  const src = wf.nodes.find((n) => n.id === conn.sourceId);
  const tgt = wf.nodes.find((n) => n.id === conn.targetId);

  return (
    <div className="p-4 space-y-4">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">连线属性</span>
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-600 flex items-center gap-1.5">
        <span className="font-semibold">{src?.label}</span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-semibold">{tgt?.label}</span>
      </div>
      <Field label="条件标签（可选）">
        <input className={inputCls} value={conn.label || ''} placeholder="如：同意 / 驳回"
          onChange={(e) => updateConnection(conn.id, { label: e.target.value })} />
      </Field>
      <button type="button" onClick={() => deleteConnection(conn.id)}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 border border-rose-200 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer">
        <Trash2 className="w-3.5 h-3.5" /> 删除连线
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// 主页面
// ═══════════════════════════════════════════════════════════

const NODE_PALETTE: { type: WfNodeType; label: string; icon: React.ReactNode; cls: string }[] = [
  { type: 'start', label: '开始', icon: <Play className="w-3 h-3" />, cls: 'text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300' },
  { type: 'userTask', label: '审批', icon: <Users className="w-3 h-3" />, cls: 'text-sky-700 hover:bg-sky-50 hover:border-sky-300' },
  { type: 'exclusiveGateway', label: '条件', icon: <GitFork className="w-3 h-3" />, cls: 'text-amber-700 hover:bg-amber-50 hover:border-amber-300' },
  { type: 'parallelGateway', label: '并行', icon: <GitFork className="w-3 h-3" />, cls: 'text-violet-700 hover:bg-violet-50 hover:border-violet-300' },
  { type: 'end', label: '结束', icon: <Square className="w-3 h-3" />, cls: 'text-rose-700 hover:bg-rose-50 hover:border-rose-300' },
];

const WorkflowConfigPage: React.FC = () => {
  const workflows = useWorkflowConfigStore((s) => s.workflows);
  const activeId = useWorkflowConfigStore((s) => s.activeId);
  const setActive = useWorkflowConfigStore((s) => s.setActive);
  const createWorkflow = useWorkflowConfigStore((s) => s.createWorkflow);
  const deleteWorkflow = useWorkflowConfigStore((s) => s.deleteWorkflow);
  const resetToDefault = useWorkflowConfigStore((s) => s.resetToDefault);
  const selectedNodeId = useWorkflowConfigStore((s) => s.selectedNodeId);
  const selectedConnId = useWorkflowConfigStore((s) => s.selectedConnId);
  const selectNode = useWorkflowConfigStore((s) => s.selectNode);
  const selectConn = useWorkflowConfigStore((s) => s.selectConn);
  const connectMode = useWorkflowConfigStore((s) => s.connectMode);
  const setConnectMode = useWorkflowConfigStore((s) => s.setConnectMode);
  const linkingFrom = useWorkflowConfigStore((s) => s.linkingFrom);
  const setLinkingFrom = useWorkflowConfigStore((s) => s.setLinkingFrom);
  const addNode = useWorkflowConfigStore((s) => s.addNode);
  const addConnection = useWorkflowConfigStore((s) => s.addConnection);
  const relayout = useWorkflowConfigStore((s) => s.relayout);
  const dirty = useWorkflowConfigStore((s) => s.dirty);
  const markSaved = useWorkflowConfigStore((s) => s.markSaved);
  const triggerToast = useAppStore((s) => s.triggerToast);

  const wf = workflows.find((w) => w.id === activeId);
  const selectedNode = wf?.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<WorkflowCategory>('ingestion');
  const [confirmReset, setConfirmReset] = useState(false);

  // 画布尺寸（按节点范围自适应）
  const canvas = useMemo(() => {
    if (!wf || wf.nodes.length === 0) return { w: 900, h: 560 };
    const xs = wf.nodes.map((n) => n.x);
    const ys = wf.nodes.map((n) => n.y);
    return {
      w: Math.max(900, Math.max(...xs) + 260),
      h: Math.max(560, Math.max(...ys) + 140),
    };
  }, [wf]);

  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (connectMode) {
      if (!linkingFrom) {
        setLinkingFrom(nodeId);
      } else if (linkingFrom !== nodeId) {
        addConnection(linkingFrom, nodeId);
        setLinkingFrom(null);
        setConnectMode(false);
        triggerToast('连线已建立', 'success');
      }
    } else {
      selectNode(nodeId);
    }
  };

  const handleCanvasClick = () => {
    if (connectMode && linkingFrom) {
      setLinkingFrom(null);
    } else if (connectMode) {
      setConnectMode(false);
    } else {
      selectNode(null);
      selectConn(null);
    }
  };

  const handleAddNode = (type: WfNodeType, label: string) => {
    addNode(type, label);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createWorkflow(newName.trim(), newCat);
    setNewName('');
    setShowNew(false);
    triggerToast('流程已创建', 'success');
  };

  const handleSave = () => {
    markSaved();
    triggerToast('流程配置已保存至配置中心', 'success');
  };

  const handleReset = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    resetToDefault();
    setConfirmReset(false);
    triggerToast('已恢复默认流程', 'info');
  };

  // 按类别分组
  const grouped = useMemo(() => {
    const map = new Map<WorkflowCategory, BusinessWorkflow[]>();
    for (const w of workflows) {
      if (!map.has(w.category)) map.set(w.category, []);
      map.get(w.category)!.push(w);
    }
    return map;
  }, [workflows]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 执行口径明示（2026-08-18：借阅审批链已接线消费本页配置） */}
      <div className="px-4 py-2 bg-emerald-50/70 border-b border-emerald-100 text-[11px] text-emerald-800 leading-relaxed shrink-0">
        <strong>配置即运行</strong>：借阅审批链由服务端按本页「借阅利用」流程的组链规则实时组链
        （基础链 → 含下载/打印/实体升级 → 涉密升级 → 终审），修改对今后发起的申请生效，在途单据按原链执行；
        借阅车「审批链预览」与服务端组链同源一致。
        归档质检 / 大额核查 / 鉴定销毁流程暂为登记册语义（鉴定销毁由「档案处置 → 鉴定销毁」页按真实状态机执行）。
      </div>
      {/* ── 工具栏 ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2 mr-1">
          <GitBranch className="w-4 h-4 text-sky-600" />
          <span className="text-sm font-bold text-slate-800">{wf?.name || '流程配置'}</span>
          {wf?.builtIn && (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-500 rounded">内置</span>
          )}
          {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="有未保存修改" />}
        </div>

        <div className="w-px h-5 bg-slate-200" />

        {/* 节点面板 */}
        {NODE_PALETTE.map((p) => (
          <button key={p.type} type="button"
            onClick={() => handleAddNode(p.type, p.label === '条件' ? '条件判断' : p.label === '并行' ? '并行分支' : p.label)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-slate-300 bg-white rounded-lg transition-colors cursor-pointer ${p.cls}`}>
            {p.icon} {p.label}
          </button>
        ))}

        <div className="w-px h-5 bg-slate-200" />

        <button type="button"
          onClick={() => setConnectMode(!connectMode)}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
            connectMode ? 'bg-sky-100 text-sky-700 border-sky-300' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
          }`}>
          <Link2 className="w-3 h-3" /> {connectMode ? '连线中…' : '连线'}
        </button>
        <button type="button" onClick={relayout}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
          <LayoutGrid className="w-3 h-3" /> 自动布局
        </button>

        <div className="flex-1" />

        <span className="text-[11px] text-slate-400 font-mono">
          {wf?.nodes.length ?? 0} 节点 · {wf?.connections.length ?? 0} 连线
        </span>

        <button type="button" onClick={handleReset} onBlur={() => setConfirmReset(false)}
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
            confirmReset ? 'text-rose-600 border-rose-300 bg-rose-50' : 'text-slate-600 border-slate-300 bg-white hover:bg-slate-50'
          }`}>
          <RotateCcw className="w-3 h-3" /> {confirmReset ? '确认恢复' : '恢复默认'}
        </button>
        <button type="button" onClick={handleSave}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors cursor-pointer shadow-sm">
          <Save className="w-3 h-3" /> 保存
        </button>
      </div>

      {/* ── 三栏主体 ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左：流程清单 */}
        <div className="w-60 bg-white border-r border-slate-200 flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">流程清单</span>
            <button type="button" onClick={() => setShowNew(!showNew)}
              className="p-1 rounded text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors cursor-pointer">
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {showNew && (
            <div className="p-3 border-b border-slate-200 bg-slate-50 space-y-2">
              <input type="text" placeholder="流程名称" value={newName} autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500" />
              <select value={newCat} onChange={(e) => setNewCat(e.target.value as WorkflowCategory)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-sky-500">
                {(Object.keys(WORKFLOW_CATEGORY_META) as WorkflowCategory[]).map((c) => (
                  <option key={c} value={c}>{WORKFLOW_CATEGORY_META[c].label}</option>
                ))}
              </select>
              <div className="flex gap-1.5">
                <button type="button" onClick={handleCreate}
                  className="flex-1 px-2 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 cursor-pointer">创建</button>
                <button type="button" onClick={() => { setShowNew(false); setNewName(''); }}
                  className="px-2 py-1.5 text-xs font-semibold text-slate-500 border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer">取消</button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {(Object.keys(WORKFLOW_CATEGORY_META) as WorkflowCategory[]).map((cat) => {
              const list = grouped.get(cat) || [];
              if (list.length === 0) return null;
              const meta = WORKFLOW_CATEGORY_META[cat];
              return (
                <div key={cat}>
                  <div className="flex items-center gap-1.5 px-2 pt-1 pb-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{meta.label}</span>
                  </div>
                  <div className="space-y-1">
                    {list.map((w) => (
                      <div key={w.id} className="group relative">
                        <button type="button" onClick={() => setActive(w.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                            activeId === w.id ? 'bg-sky-50 border border-sky-200' : 'border border-transparent hover:bg-slate-50'
                          }`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[13px] font-semibold ${activeId === w.id ? 'text-sky-700' : 'text-slate-700'}`}>{w.name}</span>
                            {!w.active && <Power className="w-3 h-3 text-slate-300" />}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{w.nodes.length} 节点 · v{w.version}</div>
                        </button>
                        {!w.builtIn && (
                          <button type="button" onClick={() => deleteWorkflow(w.id)}
                            className="absolute top-1.5 right-1.5 p-1 rounded text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 中：画布 */}
        <div className="flex-1 overflow-auto bg-slate-100 relative" onClick={handleCanvasClick}>
          {connectMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 bg-sky-100 border border-sky-300 rounded-full text-xs font-semibold text-sky-700 shadow-sm">
              {linkingFrom ? '点击目标节点完成连线' : '点击起始节点开始连线'}
            </div>
          )}

          {wf ? (
            <svg width={canvas.w} height={canvas.h} className="min-w-full min-h-full block">
              <defs>
                <marker id="arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                  <polygon points="0 0, 10 4, 0 8" fill="#94a3b8" />
                </marker>
                <marker id="arrow-sel" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                  <polygon points="0 0, 10 4, 0 8" fill="#0284c7" />
                </marker>
                <pattern id="dotgrid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1.5" cy="1.5" r="1.2" fill="#cbd5e1" opacity="0.5" />
                </pattern>
              </defs>

              {/* 点阵网格背景 */}
              <rect width="100%" height="100%" fill="url(#dotgrid)" />

              {/* 连线 */}
              {wf.connections.map((c) => {
                const src = wf.nodes.find((n) => n.id === c.sourceId);
                const tgt = wf.nodes.find((n) => n.id === c.targetId);
                if (!src || !tgt) return null;
                return (
                  <ConnectionView key={c.id} source={src} target={tgt} label={c.label}
                    selected={selectedConnId === c.id}
                    onClick={(e) => { e.stopPropagation(); selectConn(c.id); }} />
                );
              })}

              {/* 节点 */}
              {wf.nodes.map((node) => (
                <NodeView key={node.id} node={node}
                  selected={selectedNodeId === node.id}
                  linking={connectMode && linkingFrom === node.id}
                  dimmed={connectMode && linkingFrom !== null && linkingFrom !== node.id}
                  onClick={(e) => handleNodeClick(e, node.id)} />
              ))}
            </svg>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <GitBranch className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-400">选择或新建一个流程</p>
              </div>
            </div>
          )}
        </div>

        {/* 右：属性面板 */}
        <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto shrink-0">
          {wf && selectedNode ? (
            <NodeSettingsPanel wf={wf} node={selectedNode} />
          ) : wf && selectedConnId ? (
            <ConnectionSettingsPanel wf={wf} connId={selectedConnId} />
          ) : wf ? (
            <WorkflowSettingsPanel wf={wf} />
          ) : (
            <div className="p-4 text-xs text-slate-400 text-center pt-16">暂无流程</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkflowConfigPage;
