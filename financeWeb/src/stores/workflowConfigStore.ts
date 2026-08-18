/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * workflowConfigStore — 流程配置（可视化流程设计器，合并原工作流设计器能力）
 *
 * 统一数据模型：业务元数据（类别/触发条件/核查逻辑/责任人）+ 可视化流程图（节点/连线）。
 * 持久化到 ams-server /config/workflow.config（ams_config 表），刷新/换浏览器不丢失。
 *
 * 画布操作：节点增删改 / 连线增删 / 自动布局（BFS 分层）/ 选择态 / 连线模式。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createApiPersistStorage } from '../services/configStorage';
import type { WfNode, WfConnection, WfNodeType } from '../types/workflow-def';
import { createNode, createConnection } from '../types/workflow-def';

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

export type WorkflowCategory = 'ingestion' | 'audit' | 'disposal' | 'utilization';

export const WORKFLOW_CATEGORY_META: Record<WorkflowCategory, { label: string; dot: string; badge: string }> = {
  ingestion:   { label: '归档质检', dot: 'bg-sky-500',     badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  audit:       { label: '大额核查', dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  disposal:    { label: '鉴定销毁', dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  utilization: { label: '借阅利用', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

// ═══════════════════════════════════════════════════════════
// 审批组链规则（借阅利用流程运行时消费，2026-08-18）
// 与 Activiti OperateVariablesListener「审批人按约定动态计算」同思想：
// 规则显式配置、服务端组链、配置缺失/停用回退默认，不做隐式魔术。
// ═══════════════════════════════════════════════════════════

/** 升级条件：extended_perms=含下载/打印/实体调阅；sensitive=涉密（秘密/机密） */
export type EscalationWhen = 'extended_perms' | 'sensitive';

export interface EscalationRule {
  when: EscalationWhen;
  appendRole: string;
}

/** 审批组链规则：base（基础链，有序）→ escalation（条件追加）→ final（终审） */
export interface ApprovalChainRules {
  base: string[];
  escalation: EscalationRule[];
  final: string;
}

/** 内置默认链（与历史硬编码行为一致；配置缺失/停用时服务端同口径回退） */
export const DEFAULT_BORROW_CHAIN_RULES: ApprovalChainRules = {
  base: ['dept_manager'],
  escalation: [
    { when: 'extended_perms', appendRole: 'cfo' },
    { when: 'sensitive', appendRole: 'hrvp' },
  ],
  final: 'archivist',
};

/** 可担任审批节点的角色（与审批中心服务能力对齐） */
export const APPROVER_ROLE_OPTIONS: { key: string; label: string }[] = [
  { key: 'dept_manager', label: '部门经理' },
  { key: 'cfo', label: '财务总监' },
  { key: 'hrvp', label: 'HR副总裁' },
  { key: 'archivist', label: '档案管理员' },
  { key: 'archive_director', label: '档案主管' },
];

/** 取流程的组链规则（缺省回退默认；停用时调用方按默认语义提示） */
export function getChainRules(wf?: BusinessWorkflow): ApprovalChainRules {
  const r = wf?.chainRules;
  if (!r || !Array.isArray(r.base) || !Array.isArray(r.escalation) || !r.final) {
    return DEFAULT_BORROW_CHAIN_RULES;
  }
  return r;
}

/** 统一流程定义：业务元数据 + 可视化流程图 */
export interface BusinessWorkflow {
  id: string;
  name: string;
  category: WorkflowCategory;
  description: string;
  triggerCondition: string;
  checkRule: string;
  approver: string;
  active: boolean;
  builtIn: boolean;
  version: number;
  createdDate: string;
  updatedDate: string;
  nodes: WfNode[];
  connections: WfConnection[];
  /** 审批组链规则（借阅利用流程由服务端运行时消费；其他类别为登记册语义） */
  chainRules?: ApprovalChainRules;
}

// ═══════════════════════════════════════════════════════════
// 自动布局（BFS 分层，从 start 节点向下展开）
// ═══════════════════════════════════════════════════════════

const V_SPACING = 96;
const H_SPACING = 220;
const ORIGIN_X = 420;
const ORIGIN_Y = 60;

export function autoLayout(nodes: WfNode[], connections: WfConnection[]): WfNode[] {
  const start = nodes.find((n) => n.type === 'start');
  if (!start) return nodes;

  const children = new Map<string, string[]>();
  for (const c of connections) {
    if (!children.has(c.sourceId)) children.set(c.sourceId, []);
    children.get(c.sourceId)!.push(c.targetId);
  }

  const visited = new Set<string>();
  const levels: string[][] = [];
  let queue = [start.id];
  while (queue.length > 0) {
    const level: string[] = [];
    const next: string[] = [];
    for (const id of queue) {
      if (visited.has(id)) continue;
      visited.add(id);
      level.push(id);
      for (const cid of children.get(id) || []) {
        if (!visited.has(cid) && !next.includes(cid)) next.push(cid);
      }
    }
    if (level.length) levels.push(level);
    queue = next;
  }
  // 未连通的节点放到最后一层之下
  const orphans = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  if (orphans.length) levels.push(orphans);

  return nodes.map((n) => {
    const li = levels.findIndex((l) => l.includes(n.id));
    const idx = li < 0 ? 0 : li;
    const level = levels[idx] || [n.id];
    const pos = level.indexOf(n.id);
    return {
      ...n,
      x: ORIGIN_X + (pos - (level.length - 1) / 2) * H_SPACING,
      y: ORIGIN_Y + idx * V_SPACING,
    };
  });
}

// ═══════════════════════════════════════════════════════════
// 内置流程（带真实节点图）
// ═══════════════════════════════════════════════════════════

function n(id: string, type: WfNodeType, label: string, extra: Partial<WfNode> = {}): WfNode {
  return { id, type, label, x: 0, y: 0, ...extra };
}

const TODAY = '2026-07-28';

export const DEFAULT_WORKFLOWS: BusinessWorkflow[] = [
  {
    id: 'wf-ingestion-check',
    name: '凭证自动合规质检流',
    category: 'ingestion',
    description: '上传原件后自动执行四性检测，合格入池，不合格转人工复核',
    triggerCondition: '上传数电发票 XML/OFD 原件后自动触发',
    checkRule: '四性检测（真实·完整·可用·安全）全部通过方可入池；任一不通过转人工复核',
    approver: '系统自动验签 + 档案管理员复核',
    active: true, builtIn: true, version: 1, createdDate: TODAY, updatedDate: TODAY,
    nodes: [
      n('ig-1', 'start', '上传凭证原件'),
      n('ig-2', 'userTask', '四性检测', { assigneeType: 'single', assigneeLabel: '系统自动', dueDateDays: 1 }),
      n('ig-3', 'exclusiveGateway', '检测通过?', { conditions: ['通过', '不通过'] }),
      n('ig-4', 'end', '进入收集池'),
      n('ig-5', 'userTask', '人工复核', { assigneeType: 'single', assigneeLabel: '档案管理员', dueDateDays: 2 }),
      n('ig-6', 'end', '退回补正'),
    ],
    connections: [
      { id: 'igc-1', sourceId: 'ig-1', targetId: 'ig-2' },
      { id: 'igc-2', sourceId: 'ig-2', targetId: 'ig-3' },
      { id: 'igc-3', sourceId: 'ig-3', targetId: 'ig-4', label: '通过' },
      { id: 'igc-4', sourceId: 'ig-3', targetId: 'ig-5', label: '不通过' },
      { id: 'igc-5', sourceId: 'ig-5', targetId: 'ig-6' },
    ],
  },
  {
    id: 'wf-large-amount',
    name: '大额资金三单核查流',
    category: 'audit',
    description: '大额凭证三单勾稽，不一致转财务总监审批',
    triggerCondition: '凭证金额 ≥ ¥100,000 时自动触发',
    checkRule: '发票金额、银行回单、采购合同三者勾稽一致方可入账；不一致转 CFO 人工审批',
    approver: '财务总监（CFO）',
    active: true, builtIn: true, version: 1, createdDate: TODAY, updatedDate: TODAY,
    nodes: [
      n('la-1', 'start', '大额凭证预警'),
      n('la-2', 'userTask', '三单勾稽比对', { assigneeType: 'single', assigneeLabel: '系统自动', dueDateDays: 1 }),
      n('la-3', 'exclusiveGateway', '勾稽一致?', { conditions: ['一致', '不一致'] }),
      n('la-4', 'end', '入账存证'),
      n('la-5', 'userTask', '财务总监审批', { assigneeType: 'single', assigneeLabel: 'CFO', dueDateDays: 3 }),
      n('la-6', 'exclusiveGateway', '审批结果', { conditions: ['批准', '驳回'] }),
      n('la-7', 'end', '批准入账'),
      n('la-8', 'end', '驳回退单'),
    ],
    connections: [
      { id: 'lac-1', sourceId: 'la-1', targetId: 'la-2' },
      { id: 'lac-2', sourceId: 'la-2', targetId: 'la-3' },
      { id: 'lac-3', sourceId: 'la-3', targetId: 'la-4', label: '一致' },
      { id: 'lac-4', sourceId: 'la-3', targetId: 'la-5', label: '不一致' },
      { id: 'lac-5', sourceId: 'la-5', targetId: 'la-6' },
      { id: 'lac-6', sourceId: 'la-6', targetId: 'la-7', label: '批准' },
      { id: 'lac-7', sourceId: 'la-6', targetId: 'la-8', label: '驳回' },
    ],
  },
  {
    id: 'wf-disposal',
    name: '保管期满鉴定销毁流',
    category: 'disposal',
    description: '期满扫描 → 鉴定清单 → 多方联签 → 销毁备案',
    triggerCondition: '档案保管期限届满（10年/30年）由系统定期扫描触发',
    checkRule: '生成鉴定清单，档案主管与财务总监联签后方可销毁；销毁写入不可篡改日志',
    approver: '档案主管 + 财务总监 联签',
    active: false, builtIn: true, version: 1, createdDate: TODAY, updatedDate: TODAY,
    nodes: [
      n('ds-1', 'start', '期满扫描'),
      n('ds-2', 'userTask', '生成鉴定清单', { assigneeType: 'single', assigneeLabel: '系统自动', dueDateDays: 1 }),
      n('ds-3', 'userTask', '多方联签审批', { assigneeType: 'multi_instance', assigneeLabel: '档案主管+CFO', dueDateDays: 5 }),
      n('ds-4', 'exclusiveGateway', '联签结果', { conditions: ['批准销毁', '继续保管'] }),
      n('ds-5', 'userTask', '执行销毁', { assigneeType: 'single', assigneeLabel: '档案管理员', dueDateDays: 2 }),
      n('ds-6', 'end', '日志备案'),
      n('ds-7', 'end', '继续保管'),
    ],
    connections: [
      { id: 'dsc-1', sourceId: 'ds-1', targetId: 'ds-2' },
      { id: 'dsc-2', sourceId: 'ds-2', targetId: 'ds-3' },
      { id: 'dsc-3', sourceId: 'ds-3', targetId: 'ds-4' },
      { id: 'dsc-4', sourceId: 'ds-4', targetId: 'ds-5', label: '批准销毁' },
      { id: 'dsc-5', sourceId: 'ds-4', targetId: 'ds-7', label: '继续保管' },
      { id: 'dsc-6', sourceId: 'ds-5', targetId: 'ds-6' },
    ],
  },
  {
    id: 'wf-borrow-approval',
    name: '档案借阅动态审批流',
    category: 'utilization',
    description: '按权限与密级动态组链审批，终审后智能拆单履约',
    triggerCondition: '用户提交借阅申请时按权限与密级动态组链',
    checkRule: '仅浏览→经理+管理员；含下载/打印/实体→追加 CFO；涉密→追加 HRVP 会签',
    approver: '部门经理 → CFO → HRVP → 档案管理员（按条件裁剪）',
    active: true, builtIn: true, version: 1, createdDate: TODAY, updatedDate: TODAY,
    // ★ 组链规则：服务端运行时真消费（BorrowService.resolveChain），修改对今后发起的申请生效
    chainRules: DEFAULT_BORROW_CHAIN_RULES,
    nodes: [
      n('bw-1', 'start', '提交借阅申请'),
      n('bw-2', 'userTask', '部门经理审批', { assigneeType: 'single', assigneeLabel: '部门经理', dueDateDays: 2 }),
      n('bw-3', 'exclusiveGateway', '需要升级?', { conditions: ['是', '否'] }),
      n('bw-4', 'userTask', 'CFO/HRVP 审批', { assigneeType: 'candidate_group', assigneeLabel: 'CFO/HRVP', dueDateDays: 3 }),
      n('bw-5', 'userTask', '档案管理员终审', { assigneeType: 'single', assigneeLabel: '档案管理员', dueDateDays: 2 }),
      n('bw-6', 'exclusiveGateway', '终审结果', { conditions: ['通过', '驳回'] }),
      n('bw-7', 'end', '智能拆单履约'),
      n('bw-8', 'end', '申请驳回'),
    ],
    connections: [
      { id: 'bwc-1', sourceId: 'bw-1', targetId: 'bw-2' },
      { id: 'bwc-2', sourceId: 'bw-2', targetId: 'bw-3' },
      { id: 'bwc-3', sourceId: 'bw-3', targetId: 'bw-4', label: '是' },
      { id: 'bwc-4', sourceId: 'bw-3', targetId: 'bw-5', label: '否' },
      { id: 'bwc-5', sourceId: 'bw-4', targetId: 'bw-5' },
      { id: 'bwc-6', sourceId: 'bw-5', targetId: 'bw-6' },
      { id: 'bwc-7', sourceId: 'bw-6', targetId: 'bw-7', label: '通过' },
      { id: 'bwc-8', sourceId: 'bw-6', targetId: 'bw-8', label: '驳回' },
    ],
  },
];

// 初始布局
for (const wf of DEFAULT_WORKFLOWS) {
  wf.nodes = autoLayout(wf.nodes, wf.connections);
}

// ═══════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════

interface WorkflowConfigState {
  workflows: BusinessWorkflow[];
  activeId: string | null;
  selectedNodeId: string | null;
  selectedConnId: string | null;
  connectMode: boolean;
  linkingFrom: string | null;
  dirty: boolean;

  // 流程切换 / 选择
  setActive: (id: string) => void;
  selectNode: (id: string | null) => void;
  selectConn: (id: string | null) => void;
  setConnectMode: (on: boolean) => void;
  setLinkingFrom: (id: string | null) => void;

  // 流程 CRUD
  createWorkflow: (name: string, category: WorkflowCategory) => void;
  deleteWorkflow: (id: string) => void;
  updateWorkflow: (id: string, patch: Partial<BusinessWorkflow>) => void;
  toggleActive: (id: string) => void;
  resetToDefault: () => void;

  // 节点操作
  addNode: (type: WfNodeType, label: string) => void;
  updateNode: (nodeId: string, patch: Partial<WfNode>) => void;
  deleteNode: (nodeId: string) => void;

  // 连线操作
  addConnection: (sourceId: string, targetId: string, label?: string) => void;
  updateConnection: (connId: string, patch: Partial<WfConnection>) => void;
  deleteConnection: (connId: string) => void;

  // 布局
  relayout: () => void;
  markSaved: () => void;

  activeWorkflow: () => BusinessWorkflow | undefined;
}

function touch(wf: BusinessWorkflow): BusinessWorkflow {
  return { ...wf, updatedDate: new Date().toISOString().slice(0, 10), version: wf.version + 1 };
}

export const useWorkflowConfigStore = create<WorkflowConfigState>()(
  persist(
    (set, get) => ({
      workflows: DEFAULT_WORKFLOWS,
      activeId: 'wf-ingestion-check',
      selectedNodeId: null,
      selectedConnId: null,
      connectMode: false,
      linkingFrom: null,
      dirty: false,

      setActive: (id) =>
        set({ activeId: id, selectedNodeId: null, selectedConnId: null, linkingFrom: null }),
      selectNode: (id) => set({ selectedNodeId: id, selectedConnId: null }),
      selectConn: (id) => set({ selectedConnId: id, selectedNodeId: null }),
      setConnectMode: (on) => set({ connectMode: on, linkingFrom: null, selectedNodeId: null, selectedConnId: null }),
      setLinkingFrom: (id) => set({ linkingFrom: id }),

      createWorkflow: (name, category) => {
        const id = `wf-custom-${Date.now()}`;
        const startNode = createNode('start', '开始');
        const endNode = createNode('end', '结束');
        const wf: BusinessWorkflow = {
          id, name, category,
          description: '',
          triggerCondition: '',
          checkRule: '',
          approver: '',
          active: true, builtIn: false, version: 1,
          createdDate: new Date().toISOString().slice(0, 10),
          updatedDate: new Date().toISOString().slice(0, 10),
          nodes: autoLayout([startNode, endNode], []),
          connections: [],
        };
        set((s) => ({ workflows: [...s.workflows, wf], activeId: id, dirty: true }));
      },

      deleteWorkflow: (id) =>
        set((s) => {
          const target = s.workflows.find((w) => w.id === id);
          if (!target || target.builtIn) return s;
          const rest = s.workflows.filter((w) => w.id !== id);
          return {
            workflows: rest,
            activeId: s.activeId === id ? (rest[0]?.id ?? null) : s.activeId,
            dirty: true,
          };
        }),

      updateWorkflow: (id, patch) =>
        set((s) => ({
          workflows: s.workflows.map((w) => (w.id === id ? touch({ ...w, ...patch }) : w)),
          dirty: true,
        })),

      toggleActive: (id) =>
        set((s) => ({
          workflows: s.workflows.map((w) => (w.id === id ? touch({ ...w, active: !w.active }) : w)),
          dirty: true,
        })),

      resetToDefault: () =>
        set({
          workflows: DEFAULT_WORKFLOWS.map((w) => ({ ...w, nodes: autoLayout(w.nodes, w.connections) })),
          activeId: 'wf-ingestion-check',
          selectedNodeId: null, selectedConnId: null, dirty: true,
        }),

      addNode: (type, label) => {
        const id = get().activeId;
        if (!id) return;
        const node = createNode(type, label);
        set((s) => ({
          workflows: s.workflows.map((w) =>
            w.id !== id ? w : touch({ ...w, nodes: autoLayout([...w.nodes, node], w.connections) }),
          ),
          selectedNodeId: node.id,
          dirty: true,
        }));
      },

      updateNode: (nodeId, patch) => {
        const id = get().activeId;
        if (!id) return;
        set((s) => ({
          workflows: s.workflows.map((w) =>
            w.id !== id ? w : touch({
              ...w,
              nodes: w.nodes.map((nd) => (nd.id === nodeId ? { ...nd, ...patch } : nd)),
            }),
          ),
          dirty: true,
        }));
      },

      deleteNode: (nodeId) => {
        const id = get().activeId;
        if (!id) return;
        set((s) => ({
          workflows: s.workflows.map((w) => {
            if (w.id !== id) return w;
            const nodes = w.nodes.filter((nd) => nd.id !== nodeId);
            const connections = w.connections.filter((c) => c.sourceId !== nodeId && c.targetId !== nodeId);
            return touch({ ...w, nodes: autoLayout(nodes, connections), connections });
          }),
          selectedNodeId: null,
          dirty: true,
        }));
      },

      addConnection: (sourceId, targetId, label) => {
        const id = get().activeId;
        if (!id || sourceId === targetId) return;
        set((s) => ({
          workflows: s.workflows.map((w) =>
            w.id !== id ? w : touch({
              ...w,
              connections: [...w.connections, createConnection(sourceId, targetId, label)],
            }),
          ),
          dirty: true,
        }));
      },

      updateConnection: (connId, patch) => {
        const id = get().activeId;
        if (!id) return;
        set((s) => ({
          workflows: s.workflows.map((w) =>
            w.id !== id ? w : touch({
              ...w,
              connections: w.connections.map((c) => (c.id === connId ? { ...c, ...patch } : c)),
            }),
          ),
          dirty: true,
        }));
      },

      deleteConnection: (connId) => {
        const id = get().activeId;
        if (!id) return;
        set((s) => ({
          workflows: s.workflows.map((w) =>
            w.id !== id ? w : touch({ ...w, connections: w.connections.filter((c) => c.id !== connId) }),
          ),
          selectedConnId: null,
          dirty: true,
        }));
      },

      relayout: () => {
        const id = get().activeId;
        if (!id) return;
        set((s) => ({
          workflows: s.workflows.map((w) =>
            w.id !== id ? w : touch({ ...w, nodes: autoLayout(w.nodes, w.connections) }),
          ),
          dirty: true,
        }));
      },

      markSaved: () => set({ dirty: false }),

      activeWorkflow: () => {
        const s = get();
        return s.workflows.find((w) => w.id === s.activeId);
      },
    }),
    {
      name: 'workflow.config',
      storage: createApiPersistStorage(),
      partialize: (s) => ({ workflows: s.workflows, activeId: s.activeId }),
    },
  ),
);
