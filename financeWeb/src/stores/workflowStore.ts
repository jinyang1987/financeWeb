/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 工作流状态 — 接收台账 / 审批工单
 */
import { create } from 'zustand';
import type { RcvTableItem, WfTableItem } from '../types/tables';

interface WorkflowState {
  rcvTableData: RcvTableItem[];
  setRcvTableData: (d: RcvTableItem[]) => void;

  wfTableData: WfTableItem[];
  setWfTableData: (d: WfTableItem[]) => void;

  /** 借阅查询筛选：全部 / 未归还 */
  typeQueryFilter: 'all' | 'unreturned';
  setTypeQueryFilter: (f: 'all' | 'unreturned') => void;

  /** 介质端口 */
  mediaPort: 'elec' | 'phys';
  setMediaPort: (p: 'elec' | 'phys') => void;

  dbNameInput: string;
  setDbNameInput: (s: string) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  rcvTableData: [
    { id: 'rcv-1', voucherNo: '记-001', matchStatus: '完美匹配', volume: '卷A-202605-01' },
    { id: 'rcv-2', voucherNo: '记-002', matchStatus: '上下游关联缺失', volume: '待定案卷定位' },
  ],
  setRcvTableData: (rcvTableData) => set({ rcvTableData }),

  wfTableData: [
    { id: 'wf-1', orderId: 'WF-BORROW-202605-092', borrower: '王丽(核算员', reason: '配合2026年半年度集团内部财务审计', status: '审批中' },
    { id: 'wf-2', orderId: 'WF-BORROW-202605-081', borrower: '刘明(资金员', reason: '项目合同历史发票复核', status: '审批通过' },
  ],
  setWfTableData: (wfTableData) => set({ wfTableData }),

  typeQueryFilter: 'all',
  setTypeQueryFilter: (typeQueryFilter) => set({ typeQueryFilter }),

  mediaPort: 'elec',
  setMediaPort: (mediaPort) => set({ mediaPort }),

  dbNameInput: '集团总部2026账套档案库',
  setDbNameInput: (dbNameInput) => set({ dbNameInput }),
}));
