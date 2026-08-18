/**
 * API 对接: API_INTEGRATION_GUIDE.md → 2.1
 * 件域真数据源（P1-① 起）: ams-server /records（Alfresco 收集池），
 * 仿真生成器已退出件域种子（保留为测试 fixture），页面经 loadRecords() 拉取。
 */
import { create } from 'zustand';
import { ArchiveRecord, CategoryNode, Fonds, CategoryConfigItem } from '../types';
import { initialCategoryTree } from '../data';
import { fetchPoolRecords, fetchAllRecords, dtoToRecord } from '../services/recordService';
import type { CarrierType, ManagementMode } from '../types/managementMode';

// 大类编码 → 记录 archiveType 字段映射（全部类型，含子件）
const ARCHIVE_TYPE_FILTER_MAP: Record<string, string[]> = {
  'KP': ['记账凭证', '原始凭证'],
  'KB': ['会计账簿'],
  'FB': ['财务报告', '财务报表'],
  'QT': ['其他会计资料', '其他'],
};

// 大类编码 → 表格主行展示类型（不含附件子件）
const MAIN_DISPLAY_TYPE_MAP: Record<string, string[]> = {
  'KP': ['记账凭证'],
  'KB': ['会计账簿'],
  'FB': ['财务报表', '财务报告'],
  'QT': ['其他会计资料', '其他'],
};

// 大类编码 → 名称映射
export const ARCHIVE_TYPE_NAME_MAP: Record<string, string> = {
  'KP': '会计凭证',
  'KB': '会计账簿',
  'FB': '财务报表',
  'QT': '其他会计资料',
};

interface ArchiveState {
  // Records
  records: ArchiveRecord[];
  setRecords: (records: ArchiveRecord[]) => void;
  /** 件域加载中（P1-① 真数据源） */
  recordsLoading: boolean;
  /** 从 ams-server 收集池加载当前全宗的件（未组卷） */
  loadRecords: () => Promise<void>;

  /** 全量件（池 ∪ 案卷库卷内件 ∪ 盒库卷内件，带卷/盒归属）——读侧口径（2026-08-16 贯通修复） */
  allRecords: ArchiveRecord[];
  allRecordsLoading: boolean;
  /** 加载全量件：档案查询/档案打包/借阅车结算/统计/门户使用；工作台池口径请用 records */
  loadAllRecords: () => Promise<void>;

  // Category tree
  treeData: CategoryNode[];
  setTreeData: (tree: CategoryNode[]) => void;
  selectedNode: CategoryNode | null;
  setSelectedNode: (node: CategoryNode | null) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Fonds (全宗)
  fanzongs: Fonds[];
  setFanzongs: (f: Fonds[]) => void;
  currentFanzongCode: string;
  setCurrentFanzongCode: (code: string) => void;

  // Category configs
  fanzongCategories: Record<string, CategoryConfigItem[]>;
  setFanzongCategories: (c: Record<string, CategoryConfigItem[]>) => void;

  // Selection
  selectedRecordIds: Set<string>;
  setSelectedRecordIds: (ids: Set<string>) => void;
  toggleRowSelect: (id: string) => void;
  toggleSelectAll: (allIds: string[]) => void;

  // Drawer
  drawerVisible: boolean;
  activeRecord: ArchiveRecord | null;
  activeFileIndex: number;
  openDrawer: (record: ArchiveRecord) => void;
  closeDrawer: () => void;
  setActiveFileIndex: (index: number) => void;

  // Popups
  isUploadOpen: boolean;
  setIsUploadOpen: (open: boolean) => void;
  isCheckingBatch: boolean;
  setIsCheckingBatch: (checking: boolean) => void;

  // Archive type filter (大类编码: KP/KB/FB/QT)
  currentArchiveTypeCode: string | null;
  setCurrentArchiveTypeCode: (code: string | null) => void;

  // ── 双模式筛选 ──
  /** 载体类型筛选 */
  carrierTypeFilter: CarrierType | null;
  setCarrierTypeFilter: (ct: CarrierType | null) => void;
  /** 盒号筛选（volume-mode） */
  boxFilter: string;
  setBoxFilter: (b: string) => void;
  /** 卷号筛选（volume-mode） */
  volumeFilter: string;
  setVolumeFilter: (v: string) => void;
  /** 文件格式筛选（item-mode） */
  formatFilter: Set<string>;
  setFormatFilter: (fmts: Set<string>) => void;
  /** 签章验证筛选（item-mode） */
  signatureFilter: boolean | null;
  setSignatureFilter: (v: boolean | null) => void;

  // Filtered records
  filteredRecords: ArchiveRecord[];
  /** 获取记账凭证列表（不含原始凭证——原始凭证作为子件展示） */
  voucherRecords: ArchiveRecord[];
  updateFilteredRecords: () => void;
}

export const useArchiveStore = create<ArchiveState>((set, get) => ({
  // Records（P1-① 起不再内置仿真种子，经 loadRecords 从 API 拉取）
  records: [],
  setRecords: (records) => {
    set({ records });
    // ★ records 变更后必须同步重算 filteredRecords / voucherRecords，
    // 否则组卷确认/移交归档后分类视图仍展示旧数据（2026-07-18 Bug修复）
    get().updateFilteredRecords();
  },
  recordsLoading: false,
  loadRecords: async () => {
    const { currentFanzongCode } = get();
    if (!currentFanzongCode) return;
    set({ recordsLoading: true });
    try {
      const result = await fetchPoolRecords({ fondsCode: currentFanzongCode, maxItems: 1000 });
      get().setRecords(result.items.map(dtoToRecord));
    } catch (e) {
      console.warn('件域记录加载失败（离线/未登录时保持空表）:', e);
    } finally {
      set({ recordsLoading: false });
    }
  },

  // ── 全量件视图（读侧：查询/打包/借阅车/统计/门户） ──
  allRecords: [],
  allRecordsLoading: false,
  loadAllRecords: async () => {
    const { currentFanzongCode } = get();
    if (!currentFanzongCode) return;
    set({ allRecordsLoading: true });
    try {
      const result = await fetchAllRecords({ fondsCode: currentFanzongCode });
      set({ allRecords: result.items.map(dtoToRecord) });
    } catch (e) {
      console.warn('全量件加载失败（离线/未登录时保持空表）:', e);
    } finally {
      set({ allRecordsLoading: false });
    }
  },

  // Category tree
  treeData: initialCategoryTree,
  setTreeData: (treeData) => set({ treeData }),
  selectedNode: null,
  setSelectedNode: (selectedNode) => {
    set({ selectedNode });
    get().updateFilteredRecords();
  },

  // Search
  searchQuery: '',
  setSearchQuery: (searchQuery) => {
    set({ searchQuery });
    get().updateFilteredRecords();
  },

  // Fonds
  fanzongs: [
    { id: 'fz-1', name: '第一全宗（华北集团总部）', code: 'Z001', status: 'active', recordCount: 4, address: '北京市朝阳区国贸大厦A座5层', syncSource: '内置主数据库', companyId: 'org-1' },
    { id: 'fz-2', name: '第二全宗（南方智造分公司）', code: 'Z002', status: 'active', recordCount: 1, address: '深圳市南山区创智航天大厦12层', syncSource: '金蝶云同步链路', companyId: 'org-2' },
    { id: 'fz-3', name: '第三全宗（海外业务事业群）', code: 'Z003', status: 'custodial', recordCount: 0, address: '新加坡滨海路Marina Centre', syncSource: 'SAP Integration Broker', companyId: 'org-1', custodianCode: 'Z001' },
  ],
  setFanzongs: (fanzongs) => set({ fanzongs }),
  currentFanzongCode: 'Z001',
  setCurrentFanzongCode: (currentFanzongCode) => {
    set({ currentFanzongCode });
    get().updateFilteredRecords();
    // 全宗切换 → 重拉该全宗收集池（P1-①）与全量件视图（读侧口径）
    void get().loadRecords();
    void get().loadAllRecords();
  },

  // Archive type filter
  currentArchiveTypeCode: null,
  setCurrentArchiveTypeCode: (code) => {
    set({ currentArchiveTypeCode: code });
    get().updateFilteredRecords();
  },

  // ── 双模式筛选 ──
  carrierTypeFilter: null,
  setCarrierTypeFilter: (ct) => {
    set({ carrierTypeFilter: ct });
    get().updateFilteredRecords();
  },
  boxFilter: '',
  setBoxFilter: (b) => {
    set({ boxFilter: b });
    get().updateFilteredRecords();
  },
  volumeFilter: '',
  setVolumeFilter: (v) => {
    set({ volumeFilter: v });
    get().updateFilteredRecords();
  },
  formatFilter: new Set(),
  setFormatFilter: (fmts) => {
    set({ formatFilter: fmts });
    get().updateFilteredRecords();
  },
  signatureFilter: null,
  setSignatureFilter: (v) => {
    set({ signatureFilter: v });
    get().updateFilteredRecords();
  },

  // Category configs
  fanzongCategories: {
    'Z001': [
      { id: 'cat-vd-1', name: '记账凭证门类', alfrescoType: 'archive:voucher', creator: 'admin (系统宿主)', createTime: '2026-05-12', properties: [
        { id: 'p1', key: 'voucherNo', label: '凭证字号', dataType: 'string', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-A.1.1', description: '财务凭证的核心识别号码' },
        { id: 'p2', key: 'amount', label: '合计金额', dataType: 'decimal', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-A.1.3', description: '报销凭证的借贷轧平人民币总金额' },
        { id: 'p3', key: 'year', label: '核算年度', dataType: 'string', isRequired: true, ocrEnabled: false, gbStandardCode: 'GB/T 18894-A.1.5', description: '对应的记账财务年度' },
        { id: 'p4', key: 'bookkeeper', label: '记账人', dataType: 'string', isRequired: false, ocrEnabled: true, gbStandardCode: 'GB/T 18894-A.2.1', description: '执行该笔账目背书录入的柜员名称' },
        { id: 'p5', key: 'settledStatus', label: '勾稽核销状态', dataType: 'boolean', isRequired: false, ocrEnabled: false, gbStandardCode: 'GB/T 18894-A.3.4', description: '出纳状态是否已与银企直联对账单勾稽匹配' },
      ]},
      { id: 'cat-re-1', name: '财务报告门类', alfrescoType: 'archive:report', creator: 'admin (系统宿主)', createTime: '2026-05-15', properties: [
        { id: 'p11', key: 'reportName', label: '报告名称', dataType: 'string', isRequired: true, ocrEnabled: false, gbStandardCode: 'GB/T 18894-B.1.1', description: '例如"2025年度董事会审计财务报告"' },
        { id: 'p12', key: 'auditFirm', label: '审计会计师事务所', dataType: 'string', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-B.1.4', description: '出具外部审计核验结论的第三方会计师组织' },
      ]},
    ],
    'Z002': [
      { id: 'cat-vd-2', name: '南方分公司出纳凭单', alfrescoType: 'archive:sz_payment', creator: 'sz_manager (分公司审计员)', createTime: '2026-05-20', properties: [
        { id: 'p21', key: 'paymentNo', label: '出纳付款编号', dataType: 'string', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-SZ.1', description: '南方智造分公司付款台账索引号' },
        { id: 'p22', key: 'auditor', label: '分公司稽核员', dataType: 'string', isRequired: false, ocrEnabled: false, gbStandardCode: 'GB/T 18894-SZ.2', description: '分公司内部勾稽责任人' },
      ]},
    ],
    'Z003': [],
  },
  setFanzongCategories: (fanzongCategories) => set({ fanzongCategories }),

  // Selection
  selectedRecordIds: new Set(),
  setSelectedRecordIds: (selectedRecordIds) => set({ selectedRecordIds }),
  toggleRowSelect: (id) => {
    const prev = get().selectedRecordIds;
    const copy = new Set(prev);
    if (copy.has(id)) copy.delete(id);
    else copy.add(id);
    set({ selectedRecordIds: copy });
  },
  toggleSelectAll: (allIds) => {
    const prev = get().selectedRecordIds;
    if (prev.size === allIds.length && allIds.every(id => prev.has(id))) {
      set({ selectedRecordIds: new Set() });
    } else {
      set({ selectedRecordIds: new Set(allIds) });
    }
  },

  // Drawer
  drawerVisible: false,
  activeRecord: null,
  activeFileIndex: 0,
  openDrawer: (record) => set({ drawerVisible: true, activeRecord: record, activeFileIndex: 0 }),
  closeDrawer: () => set({ drawerVisible: false, activeRecord: null }),
  setActiveFileIndex: (activeFileIndex) => set({ activeFileIndex }),

  // Popups
  isUploadOpen: false,
  setIsUploadOpen: (isUploadOpen) => set({ isUploadOpen }),
  isCheckingBatch: false,
  setIsCheckingBatch: (isCheckingBatch) => set({ isCheckingBatch }),

  // Filtered records（初始为空，loadRecords 后重算）
  filteredRecords: [],
  voucherRecords: [],

  updateFilteredRecords: () => {
    const { records, currentFanzongCode, selectedNode, searchQuery, currentArchiveTypeCode, carrierTypeFilter, boxFilter, volumeFilter, formatFilter, signatureFilter } = get();
    let result = records.filter(r => r.archiveCode.startsWith(currentFanzongCode));

    // ── 双模式筛选：载体类型 ──
    if (carrierTypeFilter) {
      result = result.filter(r => r.carrierType === carrierTypeFilter);
    }

    // 按档案大类过滤（来自 URL ?type=KP）
    if (currentArchiveTypeCode) {
      const allowedTypes = ARCHIVE_TYPE_FILTER_MAP[currentArchiveTypeCode];
      if (allowedTypes) {
        result = result.filter(r => allowedTypes.includes(r.archiveType));
      }
    }

    // 按树上选中的节点过滤
    if (selectedNode) {
      if (selectedNode.type === 'fonds') {
        result = result.filter(r => r.archiveCode.startsWith(selectedNode.code || ''));
      } else if (selectedNode.type === 'class') {
        const code = selectedNode.code || '';
        if (ARCHIVE_TYPE_FILTER_MAP[code]) {
          result = result.filter(r => ARCHIVE_TYPE_FILTER_MAP[code].includes(r.archiveType));
        }
      } else if (selectedNode.type === 'period') {
        const yearCode = selectedNode.code || '';
        result = result.filter(r => r.year === yearCode);
      }
    }

    // ── volume-mode 筛选：盒号/卷号 ──
    if (boxFilter.trim()) {
      const bf = boxFilter.toLowerCase().trim();
      result = result.filter(r =>
        r.boxId?.toLowerCase().includes(bf) ||
        r.volumeCode?.toLowerCase().includes(bf)
      );
    }
    if (volumeFilter.trim()) {
      const vf = volumeFilter.toLowerCase().trim();
      result = result.filter(r =>
        r.volumeCode?.toLowerCase().includes(vf) ||
        r.volumeId?.toLowerCase().includes(vf)
      );
    }

    // ── item-mode 筛选：文件格式/签章 ──
    if (formatFilter.size > 0) {
      result = result.filter(r =>
        r.components.some(c => formatFilter.has(c.contentType))
      );
    }
    if (signatureFilter !== null) {
      result = result.filter(r =>
        r.components.some(c => c.signatureVerified === signatureFilter)
      );
    }

    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item =>
        item.archiveCode.toLowerCase().includes(q) ||
        item.voucherNo.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q) ||
        item.amount.toString().includes(q) ||
        item.remarks?.toLowerCase().includes(q) ||
        item.components.some(c => c.name.toLowerCase().includes(q)) ||
        item.boxId?.toLowerCase().includes(q)
      );
    }

    // mainRecords: 仅展示主表行（不含附件子件如原始凭证）
    const mainDisplayTypes = currentArchiveTypeCode
      ? (MAIN_DISPLAY_TYPE_MAP[currentArchiveTypeCode] || [])
      : [];
    const mainRecords = mainDisplayTypes.length > 0
      ? result.filter(r => mainDisplayTypes.includes(r.archiveType))
      : result;

    set({ filteredRecords: result, voucherRecords: mainRecords });
  },
}));
