/**
 * 原始凭证 Store（P1-④ 已切 ams-server 真后端）
 *
 * 数据源: ams-server /source-docs（全宗聚合查询）
 * 仿真种子已清除（2026-07-28，假数据分域随切随清）
 */

import { create } from 'zustand';
import type { SourceDocument, SourceDocTypeNode } from '../types/sourceDocument';
import { SOURCE_DOC_TYPE_TREE, flattenTypeTree } from '../types/sourceDocument';
import { fetchSourceDocsByFonds } from '../services/sourceDocumentService';

// 预计算类型 code → label 映射
const TYPE_LABEL_MAP = flattenTypeTree(SOURCE_DOC_TYPE_TREE);

interface SourceDocumentState {
  // ── 数据 ──
  documents: SourceDocument[];
  setDocuments: (docs: SourceDocument[]) => void;

  /** 加载中 */
  loading: boolean;
  /** 从 ams-server 加载当前全宗的全部原始凭证 */
  loadSourceDocs: (fondsCode: string) => Promise<void>;

  // ── 筛选 ──
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  /** 选中的原始凭证类型 code（null = 全部） */
  selectedTypeCode: string | null;
  setSelectedTypeCode: (code: string | null) => void;

  /** 选中的父级大类 code（external/internal/special） */
  selectedCategory: string | null;
  setSelectedCategory: (cat: string | null) => void;

  /** 业务类型筛选 */
  selectedBusinessCategory: string | null;
  setSelectedBusinessCategory: (cat: string | null) => void;

  /** 日期范围 */
  dateFrom: string;
  setDateFrom: (d: string) => void;
  dateTo: string;
  setDateTo: (d: string) => void;

  /** 金额范围 */
  amountMin: number | null;
  setAmountMin: (a: number | null) => void;
  amountMax: number | null;
  setAmountMax: (a: number | null) => void;

  /** 对方单位 */
  counterpartyQuery: string;
  setCounterpartyQuery: (q: string) => void;

  /** 载体类型 */
  carrierTypeFilter: 'paper' | 'electronic' | null;
  setCarrierTypeFilter: (ct: 'paper' | 'electronic' | null) => void;

  // ── 详情面板 ──
  drawerVisible: boolean;
  activeDocument: SourceDocument | null;
  openDrawer: (doc: SourceDocument) => void;
  closeDrawer: () => void;

  // ── 计算属性 ──
  /** 经过全部筛选后的原始凭证列表 */
  filteredDocuments: SourceDocument[];
  updateFilteredDocuments: () => void;

  // ── 工具方法 ──
  /** 根据 parentRecordId 获取某张记账凭证下的所有原始凭证 */
  getByParentId: (parentId: string) => SourceDocument[];
  /** ★ 根据记账凭证号获取其下所有原始凭证附件（核心检索路径） */
  getByVoucherNo: (voucherNo: string) => SourceDocument[];
  /** 批量按 ID 获取原始凭证（优先于 getByParentId，支持 sourceDocumentIds） */
  getByIds: (ids: string[]) => SourceDocument[];
  /** 根据类型 code 获取类型名称 */
  getTypeLabel: (code: string) => string;
}

export const useSourceDocumentStore = create<SourceDocumentState>((set, get) => ({
  documents: [],
  setDocuments: (documents) => {
    set({ documents });
    get().updateFilteredDocuments();
  },

  loading: false,

  /** 从 ams-server 加载当前全宗的全部原始凭证（P1-④） */
  loadSourceDocs: async (fondsCode: string) => {
    set({ loading: true });
    try {
      const docs = await fetchSourceDocsByFonds(fondsCode);
      get().setDocuments(docs);
    } catch (e) {
      console.warn('原始凭证加载失败:', e);
    } finally {
      set({ loading: false });
    }
  },

  searchQuery: '',
  setSearchQuery: (searchQuery) => {
    set({ searchQuery });
    get().updateFilteredDocuments();
  },

  selectedTypeCode: null,
  setSelectedTypeCode: (selectedTypeCode) => {
    set({ selectedTypeCode });
    get().updateFilteredDocuments();
  },

  selectedCategory: null,
  setSelectedCategory: (selectedCategory) => {
    set({ selectedCategory });
    get().updateFilteredDocuments();
  },

  selectedBusinessCategory: null,
  setSelectedBusinessCategory: (selectedBusinessCategory) => {
    set({ selectedBusinessCategory });
    get().updateFilteredDocuments();
  },

  dateFrom: '',
  setDateFrom: (dateFrom) => {
    set({ dateFrom });
    get().updateFilteredDocuments();
  },

  dateTo: '',
  setDateTo: (dateTo) => {
    set({ dateTo });
    get().updateFilteredDocuments();
  },

  amountMin: null,
  setAmountMin: (amountMin) => {
    set({ amountMin });
    get().updateFilteredDocuments();
  },

  amountMax: null,
  setAmountMax: (amountMax) => {
    set({ amountMax });
    get().updateFilteredDocuments();
  },

  counterpartyQuery: '',
  setCounterpartyQuery: (counterpartyQuery) => {
    set({ counterpartyQuery });
    get().updateFilteredDocuments();
  },

  carrierTypeFilter: null,
  setCarrierTypeFilter: (carrierTypeFilter) => {
    set({ carrierTypeFilter });
    get().updateFilteredDocuments();
  },

  // ── 详情面板 ──
  drawerVisible: false,
  activeDocument: null,
  openDrawer: (activeDocument) => set({ drawerVisible: true, activeDocument }),
  closeDrawer: () => set({ drawerVisible: false, activeDocument: null }),

  // ── 过滤后的数据 ──
  filteredDocuments: [],

  updateFilteredDocuments: () => {
    const {
      documents, searchQuery, selectedTypeCode, selectedCategory,
      selectedBusinessCategory, dateFrom, dateTo,
      amountMin, amountMax, counterpartyQuery, carrierTypeFilter,
    } = get();

    let result = [...documents];

    // 类型树节点筛选
    if (selectedTypeCode) {
      result = result.filter(d => d.docTypeCode === selectedTypeCode);
    }

    // 大类筛选
    if (selectedCategory) {
      const typeCodesInCategory = new Set<string>();
      function collect(nodes: SourceDocTypeNode[]) {
        for (const n of nodes) {
          if (n.category === selectedCategory) {
            typeCodesInCategory.add(n.code);
          }
          if (n.children) collect(n.children);
        }
      }
      // 找到大类节点
      const catNode = SOURCE_DOC_TYPE_TREE.find(n => n.code === selectedCategory);
      if (catNode) {
        function collectAll(n: SourceDocTypeNode) {
          typeCodesInCategory.add(n.code);
          if (n.children) n.children.forEach(collectAll);
        }
        collectAll(catNode);
      }
      result = result.filter(d => typeCodesInCategory.has(d.docTypeCode));
    }

    // 业务类型
    if (selectedBusinessCategory) {
      result = result.filter(d => d.businessCategory === selectedBusinessCategory);
    }

    // 日期范围
    if (dateFrom) {
      result = result.filter(d => d.transactionDate >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(d => d.transactionDate <= dateTo);
    }

    // 金额范围
    if (amountMin !== null) {
      result = result.filter(d => Math.abs(d.amountLower) >= amountMin);
    }
    if (amountMax !== null) {
      result = result.filter(d => Math.abs(d.amountLower) <= amountMax);
    }

    // 对方单位
    if (counterpartyQuery.trim()) {
      const q = counterpartyQuery.toLowerCase().trim();
      result = result.filter(d =>
        d.counterpartyName.toLowerCase().includes(q) ||
        (d.counterpartyTaxId || '').toLowerCase().includes(q)
      );
    }

    // 载体类型
    if (carrierTypeFilter) {
      result = result.filter(d => d.carrierType === carrierTypeFilter);
    }

    // 全文搜索
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(d =>
        d.documentNo.toLowerCase().includes(q) ||
        d.docTypeName.toLowerCase().includes(q) ||
        d.counterpartyName.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.amountLower.toString().includes(q) ||
        d.amountUpper.includes(q) ||
        (d.counterpartyTaxId || '').toLowerCase().includes(q) ||
        (d.remarks || '').toLowerCase().includes(q) ||
        d.parentRecordId.toLowerCase().includes(q) ||
        // 也搜索扩展字段的值
        Object.values(d.extFields).some(v =>
          String(v).toLowerCase().includes(q)
        )
      );
    }

    set({ filteredDocuments: result });
  },

  // ── 工具方法 ──
  getByParentId: (parentId) => {
    return get().documents.filter(d => d.parentRecordId === parentId);
  },

  getByVoucherNo: (voucherNo) => {
    return get().documents
      .filter(d => d.parentVoucherNo === voucherNo)
      .sort((a, b) => a.attachmentSequence - b.attachmentSequence);
  },

  getByIds: (ids) => {
    if (!ids || ids.length === 0) return [];
    const docMap = new Map(get().documents.map(d => [d.id, d]));
    return ids.map(id => docMap.get(id)).filter(Boolean) as SourceDocument[];
  },

  getTypeLabel: (code) => {
    return TYPE_LABEL_MAP.get(code) || code;
  },
}));

