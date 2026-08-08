/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 数据清洗状态 — 凭证清洗 / 分段插入
 */
import { create } from 'zustand';
import type { CleanTableItem } from '../types/tables';

interface CleanState {
  cleanTableData: CleanTableItem[];
  setCleanTableData: (d: CleanTableItem[]) => void;

  cleanSearchQuery: string;
  setCleanSearchQuery: (s: string) => void;

  isInsertSegmentModalOpen: boolean;
  setIsInsertSegmentModalOpen: (o: boolean) => void;
  insertSegmentBaseVoucher: string;
  setInsertSegmentBaseVoucher: (s: string) => void;
  insertSegmentVal: string;
  setInsertSegmentVal: (s: string) => void;
  insertSegmentRule: string;
  setInsertSegmentRule: (s: string) => void;

  customVoucherToClean: string;
  setCustomVoucherToClean: (s: string) => void;
  cleanedVoucherOutput: string;
  setCleanedVoucherOutput: (s: string) => void;

  insertNumbers: string;
  setInsertNumbers: (s: string) => void;
  insertResults: string[];
  setInsertResults: (d: string[]) => void;
}

export const useCleanStore = create<CleanState>((set) => ({
  cleanTableData: [
    { id: '1', rawVoucher: '记[2026] -- 05_004 (含空格符)', cleanVoucher: '记-202605-004', archiveCode: '1728-2-004', isSegment: true, status: 'New' },
    { id: '2', rawVoucher: '银行-001-## 临时拼凑', cleanVoucher: '记-202605-001', archiveCode: 'TZ-1-003', isSegment: false, status: '质检中' },
    { id: '3', rawVoucher: '现金 // 2026 / 04-12', cleanVoucher: '记-202604-012', archiveCode: '1128-3-201', isSegment: false, status: '已归档' },
    { id: '4', rawVoucher: '银收-2026-05-002 (含分隔符)', cleanVoucher: '记-202605-002', archiveCode: '1728-5-002', isSegment: true, status: '已解析' },
  ],
  setCleanTableData: (cleanTableData) => set({ cleanTableData }),

  cleanSearchQuery: '',
  setCleanSearchQuery: (cleanSearchQuery) => set({ cleanSearchQuery }),

  isInsertSegmentModalOpen: false,
  setIsInsertSegmentModalOpen: (isInsertSegmentModalOpen) => set({ isInsertSegmentModalOpen }),
  insertSegmentBaseVoucher: 'VOL-1728-2-004',
  setInsertSegmentBaseVoucher: (insertSegmentBaseVoucher) => set({ insertSegmentBaseVoucher }),
  insertSegmentVal: '004-1, 004-2',
  setInsertSegmentVal: (insertSegmentVal) => set({ insertSegmentVal }),
  insertSegmentRule: '1',
  setInsertSegmentRule: (insertSegmentRule) => set({ insertSegmentRule }),

  customVoucherToClean: '记-- 003   (含连字符+空格)',
  setCustomVoucherToClean: (customVoucherToClean) => set({ customVoucherToClean }),
  cleanedVoucherOutput: '',
  setCleanedVoucherOutput: (cleanedVoucherOutput) => set({ cleanedVoucherOutput }),

  insertNumbers: '2-1, 2-2',
  setInsertNumbers: (insertNumbers) => set({ insertNumbers }),
  insertResults: [],
  setInsertResults: (insertResults) => set({ insertResults }),
}));
