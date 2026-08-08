/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 视图状态 — 展开/折叠 / 季度/月份 / 统计模式
 */
import { create } from 'zustand';

interface QuarterItem {
  id: string;
  name: string;
  months: number[];
}

interface ViewState {
  // Finance view
  isFinanceViewExpanded: boolean;
  setIsFinanceViewExpanded: (v: boolean) => void;
  isProjectViewExpanded: boolean;
  setIsProjectViewExpanded: (v: boolean) => void;
  isTimeViewExpanded: boolean;
  setIsTimeViewExpanded: (v: boolean) => void;

  // Expanded nodes
  expandedFinanceNodes: Record<string, boolean>;
  setExpandedFinanceNodes: (v: Record<string, boolean>) => void;
  expandedProjectNodes: Record<string, boolean>;
  setExpandedProjectNodes: (v: Record<string, boolean>) => void;
  expandedProjectChildren: Record<string, boolean>;
  setExpandedProjectChildren: (v: Record<string, boolean>) => void;
  expandedTimeNodes: Record<string, boolean>;
  setExpandedTimeNodes: (v: Record<string, boolean>) => void;
  expandedFinanceClasses: Record<string, boolean>;
  setExpandedFinanceClasses: (v: Record<string, boolean>) => void;
  expandedFinanceYears: Record<string, boolean>;
  setExpandedFinanceYears: (v: Record<string, boolean>) => void;

  // Quarter / Month
  selectedQuarter: string;
  setSelectedQuarter: (q: string) => void;
  selectedMonth: number;
  setSelectedMonth: (m: number) => void;
  quarters: QuarterItem[];

  // Stats mode
  statsModePerson: string;
  setStatsModePerson: (s: string) => void;
  statsModeDept: string;
  setStatsModeDept: (s: string) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  // Finance view
  isFinanceViewExpanded: true,
  setIsFinanceViewExpanded: (isFinanceViewExpanded) => set({ isFinanceViewExpanded }),
  isProjectViewExpanded: false,
  setIsProjectViewExpanded: (isProjectViewExpanded) => set({ isProjectViewExpanded }),
  isTimeViewExpanded: false,
  setIsTimeViewExpanded: (isTimeViewExpanded) => set({ isTimeViewExpanded }),

  // Expanded nodes
  expandedFinanceNodes: { 'fonds-1': true, 'fonds-2': false },
  setExpandedFinanceNodes: (expandedFinanceNodes) => set({ expandedFinanceNodes }),
  expandedProjectNodes: { 'proj-1': true },
  setExpandedProjectNodes: (expandedProjectNodes) => set({ expandedProjectNodes }),
  expandedProjectChildren: {},
  setExpandedProjectChildren: (expandedProjectChildren) => set({ expandedProjectChildren }),
  expandedTimeNodes: { 'time-2026': true, 'time-2025': false },
  setExpandedTimeNodes: (expandedTimeNodes) => set({ expandedTimeNodes }),
  expandedFinanceClasses: {},
  setExpandedFinanceClasses: (expandedFinanceClasses) => set({ expandedFinanceClasses }),
  expandedFinanceYears: { 'period-2026': true, 'period-2025': false },
  setExpandedFinanceYears: (expandedFinanceYears) => set({ expandedFinanceYears }),

  // Quarter / Month
  selectedQuarter: 'Q1',
  setSelectedQuarter: (selectedQuarter) => set({ selectedQuarter }),
  selectedMonth: 1,
  setSelectedMonth: (selectedMonth) => set({ selectedMonth }),
  quarters: [
    { id: 'Q1', name: '第一季度', months: [1, 2, 3] },
    { id: 'Q2', name: '第二季度', months: [4, 5, 6] },
    { id: 'Q3', name: '第三季度', months: [7, 8, 9] },
    { id: 'Q4', name: '第四季度', months: [10, 11, 12] },
  ],

  // Stats mode
  statsModePerson: '全宗',
  setStatsModePerson: (statsModePerson) => set({ statsModePerson }),
  statsModeDept: '上海财务部',
  setStatsModeDept: (statsModeDept) => set({ statsModeDept }),
}));
