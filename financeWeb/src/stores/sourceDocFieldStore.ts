/**
 * 原始凭证字段显隐配置 Store
 *
 * 驱动"大而全让客户选"的配置模式：
 * - 每种原始凭证类型有独立的字段显隐配置
 * - 公共字段 + 类型特有扩展字段
 * - 持久化到 localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 9 个公共字段
export const SOURCE_DOC_COMMON_FIELDS = [
  { key: 'documentNo', label: '单据编号', group: 'basic', required: true },
  { key: 'docTypeName', label: '凭证类型', group: 'basic', required: true },
  { key: 'transactionDate', label: '业务日期', group: 'basic', required: true },
  { key: 'amountLower', label: '小写金额', group: 'amount', required: true },
  { key: 'amountUpper', label: '大写金额', group: 'amount', required: true },
  { key: 'counterpartyName', label: '对方单位', group: 'entity', required: true },
  { key: 'counterpartyTaxId', label: '对方税号', group: 'entity', required: false },
  { key: 'summary', label: '摘要/事由', group: 'business', required: true },
  { key: 'businessCategory', label: '业务分类', group: 'business', required: true },
  { key: 'preparer', label: '制单人', group: 'approval', required: false },
  { key: 'reviewer', label: '审核人', group: 'approval', required: false },
  { key: 'attachmentCount', label: '附件张数', group: 'attachment', required: false },
  { key: 'carrierType', label: '载体类型', group: 'basic', required: true },
  { key: 'counterpartyAddress', label: '对方地址电话', group: 'entity', required: false },
  { key: 'counterpartyBankAccount', label: '对方开户行账号', group: 'entity', required: false },
  { key: 'remarks', label: '备注', group: 'attachment', required: false },
];

// 分组排序
const GROUP_ORDER: Record<string, number> = {
  basic: 1,
  entity: 2,
  amount: 3,
  business: 4,
  approval: 5,
  attachment: 6,
};

/** 单个字段的显隐状态 */
interface FieldVisibility {
  key: string;
  label: string;
  visible: boolean;
  required: boolean;
  group: string;
}

interface SourceDocFieldState {
  /**
   * typeCode → 该类型下各字段的显隐配置
   * 公共字段始终存在，类型特有字段来自 SOURCE_DOC_TYPE_TREE 的 extFieldDefs
   */
  configs: Record<string, FieldVisibility[]>;

  /** 获取某类型的所有字段配置（含公共+扩展） */
  getConfig: (typeCode: string) => FieldVisibility[];

  /** 获取某类型的可见字段 key 列表 */
  getVisibleKeys: (typeCode: string) => string[];

  /** 切换某个字段的可见性 */
  toggleField: (typeCode: string, fieldKey: string) => void;

  /** 批量设置可见字段 */
  setVisibleKeys: (typeCode: string, keys: string[]) => void;

  /** 初始化某类型的字段配置（首次访问时自动调用） */
  initConfig: (typeCode: string, extFields?: { key: string; label: string; group: string; required: boolean }[]) => void;
}

export const useSourceDocFieldStore = create<SourceDocFieldState>()(
  persist(
    (set, get) => ({
      configs: {},

      getConfig: (typeCode) => {
        const stored = get().configs[typeCode];
        if (stored && stored.length > 0) return stored;
        // 未初始化时的默认：公共字段全部可见
        return SOURCE_DOC_COMMON_FIELDS.map(f => ({
          ...f,
          visible: true,
        })).sort((a, b) => (GROUP_ORDER[a.group] || 99) - (GROUP_ORDER[b.group] || 99));
      },

      getVisibleKeys: (typeCode) => {
        return get().getConfig(typeCode).filter(f => f.visible).map(f => f.key);
      },

      toggleField: (typeCode, fieldKey) => {
        const configs = get().configs;
        const fields = configs[typeCode];
        if (!fields) return;
        set({
          configs: {
            ...configs,
            [typeCode]: fields.map(f =>
              f.key === fieldKey ? { ...f, visible: !f.visible } : f
            ),
          },
        });
      },

      setVisibleKeys: (typeCode, keys) => {
        const configs = get().configs;
        const fields = configs[typeCode];
        if (!fields) return;
        const keySet = new Set(keys);
        set({
          configs: {
            ...configs,
            [typeCode]: fields.map(f => ({
              ...f,
              visible: keySet.has(f.key),
            })),
          },
        });
      },

      initConfig: (typeCode, extFields = []) => {
        const existing = get().configs[typeCode];
        if (existing && existing.length > 0) return; // 已初始化

        const allFields: FieldVisibility[] = [
          ...SOURCE_DOC_COMMON_FIELDS.map(f => ({
            ...f,
            visible: true,
          })),
          ...extFields.map(ef => ({
            key: ef.key,
            label: ef.label,
            visible: true,
            required: ef.required,
            group: ef.group,
          })),
        ].sort((a, b) => (GROUP_ORDER[a.group] || 99) - (GROUP_ORDER[b.group] || 99));

        set({
          configs: {
            ...get().configs,
            [typeCode]: allFields,
          },
        });
      },
    }),
    {
      name: 'source-doc-field-config',
    }
  )
);
