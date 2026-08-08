/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 工作流定义类型 — 可视化流程设计器数据模型
 */

// ── 节点类型 ──
export type WfNodeType = 'start' | 'end' | 'userTask' | 'exclusiveGateway' | 'parallelGateway';

export interface WfFormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'date' | 'boolean';
  required: boolean;
  options?: string[];
}

// ── 工作流节点 ──
export interface WfNode {
  id: string;
  type: WfNodeType;
  label: string;
  /** 节点在画布上的位置（自动布局用） */
  x: number;
  y: number;
  /** 审批节点专用 */
  assigneeType?: 'single' | 'candidate_group' | 'multi_instance';
  assigneeLabel?: string;       // 如 "部门主管"
  assigneeValue?: string;       // 如 "GROUP_dept_head"
  formFields?: WfFormField[];
  dueDateDays?: number;         // 办理时限(天)
  /** 网关专用：分支标签 */
  conditions?: string[];
}

// ── 节点连接 ──
export interface WfConnection {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;               // 条件标签（网关流出线用）
}

// ── 完整工作流定义 ──
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  /** 是否内置（不可删除） */
  builtIn: boolean;
  nodes: WfNode[];
  connections: WfConnection[];
  createdDate: string;
  updatedDate: string;
  version: number;
}

// ── 节点类型中文映射 ──
export const WF_NODE_TYPE_LABELS: Record<WfNodeType, string> = {
  start: '开始',
  end: '结束',
  userTask: '审批节点',
  exclusiveGateway: '条件分支',
  parallelGateway: '并行分支',
};

// ── 节点类型图标颜色 ──
export const WF_NODE_TYPE_COLORS: Record<WfNodeType, string> = {
  start: 'bg-green-500',
  end: 'bg-red-500',
  userTask: 'bg-sky-500',
  exclusiveGateway: 'bg-amber-500',
  parallelGateway: 'bg-purple-500',
};

// ── 默认颜色样式 ──
export const WF_NODE_STYLES: Record<WfNodeType, { border: string; bg: string; text: string; icon: string }> = {
  start: { border: 'border-green-400', bg: 'bg-green-50', text: 'text-green-700', icon: '▶' },
  end: { border: 'border-red-400', bg: 'bg-red-50', text: 'text-red-700', icon: '■' },
  userTask: { border: 'border-sky-400', bg: 'bg-sky-50', text: 'text-sky-700', icon: '👤' },
  exclusiveGateway: { border: 'border-amber-400', bg: 'bg-amber-50', text: 'text-amber-700', icon: '◇' },
  parallelGateway: { border: 'border-purple-400', bg: 'bg-purple-50', text: 'text-purple-700', icon: '≡' },
};

// ── 工具函数 ──
let nodeIdCounter = 0;
let connIdCounter = 0;

export function createNode(type: WfNodeType, label: string): WfNode {
  return {
    id: `node-${++nodeIdCounter}`,
    type,
    label,
    x: 0,
    y: 0,
    assigneeType: type === 'userTask' ? 'single' : undefined,
    assigneeLabel: type === 'userTask' ? '审批人' : undefined,
    formFields: type === 'userTask' ? [] : undefined,
    conditions: type === 'exclusiveGateway' ? [] : undefined,
    dueDateDays: type === 'userTask' ? 3 : undefined,
  };
}

export function createConnection(sourceId: string, targetId: string, label?: string): WfConnection {
  return {
    id: `conn-${++connIdCounter}`,
    sourceId,
    targetId,
    label,
  };
}

