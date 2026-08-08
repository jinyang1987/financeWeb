/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * metadataDisplayStore — 元数据显示配置（v2：per-context 三层模型）
 *
 * 按实体上下文（voucher / archive-item / volume / box）独立管理
 * 每个字段的采用/展示/推荐常用状态。
 *
 * 三层模型：
 *   Level 1: adopted   — 是否采用该字段
 *   Level 2: visible   — 是否在列表中展示（仅在 adopted=true 时有意义）
 *   Level 3: recommended — 是否为推荐常用字段（仅在 visible=true 时有意义）
 *
 * 持久化到 localStorage key: metadata-display-config-v2
 * 首次加载时自动从旧 key (metadata-display-config) 迁移数据。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createApiPersistStorage } from '../services/configStorage';
import type { EntityContextId } from '../config/metadataContexts';
import { ARCHIVE_ITEM_FIELD_DEFS } from '../config/metadataContexts';

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

export interface ContextFieldConfig {
  /** 字段标识 */
  id: string;
  /** 是否采用该字段（Level 1） */
  adopted: boolean;
  /** 是否在列表中展示（Level 2，仅在 adopted=true 时有意义） */
  visible: boolean;
  /** 是否为推荐常用字段（Level 3，仅在 visible=true 时有意义） */
  recommended: boolean;
  /** 排序序号 */
  sortOrder: number;
}

interface PerContextConfig {
  fields: ContextFieldConfig[];
}

interface MetadataDisplayState {
  /** 按上下文分组的配置，key 为 EntityContextId */
  contexts: Record<string, PerContextConfig>;

  /** 初始化某上下文（幂等：已初始化则跳过） */
  initContext: (contextId: EntityContextId, allIds: string[], defaultVisibleIds?: string[]) => void;

  /** 获取某上下文所有字段配置（按 sortOrder 排序） */
  getFields: (contextId: EntityContextId) => ContextFieldConfig[];

  /** 获取某上下文可见字段 ID 列表（按 sortOrder 排序） */
  getVisibleIds: (contextId: EntityContextId) => string[];

  /** 切换字段可见性 */
  toggleVisibility: (contextId: EntityContextId, id: string) => void;

  /** 切换字段采用状态（取消采用时自动隐藏） */
  toggleAdopted: (contextId: EntityContextId, id: string) => void;

  /** 切换字段推荐常用状态 */
  toggleRecommended: (contextId: EntityContextId, id: string) => void;

  /** 批量设置可见性 */
  setVisibility: (contextId: EntityContextId, ids: string[], visible: boolean) => void;

  /** 全部显示/隐藏 */
  setAllVisible: (contextId: EntityContextId, visible: boolean) => void;

  /** 拖拽排序 */
  moveField: (contextId: EntityContextId, id: string, targetId: string) => void;

  /** 应用预设（按 presetIds 设置 visible） */
  applyPreset: (contextId: EntityContextId, presetIds: string[]) => void;

  /** 重置某上下文（删除配置，下次 initContext 重新生成） */
  resetContext: (contextId: EntityContextId) => void;
}

// ═══════════════════════════════════════════════════════════
// 旧格式 → 新格式迁移
// ═══════════════════════════════════════════════════════════

interface OldDisplayField {
  id: string;
  visible: boolean;
  sortOrder: number;
}

interface OldState {
  state?: { fields: OldDisplayField[] };
}

function migrateFromOldFormat(oldData: OldState): PerContextConfig | null {
  const oldFields = oldData?.state?.fields;
  if (!oldFields || oldFields.length === 0) return null;

  const archiveItemIds = new Set(ARCHIVE_ITEM_FIELD_DEFS.map(f => f.id));
  const migrated = oldFields
    .filter(f => archiveItemIds.has(f.id))
    .map(f => ({
      id: f.id,
      adopted: true,
      visible: f.visible,
      recommended: true, // 旧配置中的字段都视为推荐常用
      sortOrder: f.sortOrder,
    }));

  if (migrated.length === 0) return null;
  return { fields: migrated };
}

// ═══════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY = 'metadata-display-config-v2';

export const useMetadataDisplayStore = create<MetadataDisplayState>()(
  persist(
    (set, get) => ({
      contexts: {},

      // ── 初始化上下文 ──
      initContext: (contextId, allIds, defaultVisibleIds) => {
        const existing = get().contexts[contextId];
        if (existing && existing.fields.length > 0) return; // 已初始化，跳过

        const defaultVisibleSet = new Set(defaultVisibleIds ?? allIds);
        const fields: ContextFieldConfig[] = allIds.map((id, idx) => ({
          id,
          adopted: true,
          visible: defaultVisibleSet.has(id),
          recommended: defaultVisibleSet.has(id),
          sortOrder: idx,
        }));

        set(state => ({
          contexts: { ...state.contexts, [contextId]: { fields } },
        }));
      },

      // ── 查询 ──
      getFields: (contextId) => {
        const fields = get().contexts[contextId]?.fields ?? [];
        return [...fields].sort((a, b) => a.sortOrder - b.sortOrder);
      },

      getVisibleIds: (contextId) => {
        const fields = get().contexts[contextId]?.fields ?? [];
        return fields
          .filter(f => f.adopted && f.visible)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(f => f.id);
      },

      // ── 单字段操作 ──
      toggleVisibility: (contextId, id) => {
        set(state => {
          const ctx = state.contexts[contextId];
          if (!ctx) return state;
          return {
            contexts: {
              ...state.contexts,
              [contextId]: {
                fields: ctx.fields.map(f =>
                  f.id === id ? { ...f, visible: !f.visible } : f
                ),
              },
            },
          };
        });
      },

      toggleAdopted: (contextId, id) => {
        set(state => {
          const ctx = state.contexts[contextId];
          if (!ctx) return state;
          return {
            contexts: {
              ...state.contexts,
              [contextId]: {
                fields: ctx.fields.map(f =>
                  f.id === id
                    ? { ...f, adopted: !f.adopted, visible: f.adopted ? false : f.visible }
                    : f
                ),
              },
            },
          };
        });
      },

      toggleRecommended: (contextId, id) => {
        set(state => {
          const ctx = state.contexts[contextId];
          if (!ctx) return state;
          return {
            contexts: {
              ...state.contexts,
              [contextId]: {
                fields: ctx.fields.map(f =>
                  f.id === id ? { ...f, recommended: !f.recommended } : f
                ),
              },
            },
          };
        });
      },

      // ── 批量操作 ──
      setVisibility: (contextId, ids, visible) => {
        const idSet = new Set(ids);
        set(state => {
          const ctx = state.contexts[contextId];
          if (!ctx) return state;
          return {
            contexts: {
              ...state.contexts,
              [contextId]: {
                fields: ctx.fields.map(f =>
                  idSet.has(f.id) ? { ...f, visible } : f
                ),
              },
            },
          };
        });
      },

      setAllVisible: (contextId, visible) => {
        set(state => {
          const ctx = state.contexts[contextId];
          if (!ctx) return state;
          return {
            contexts: {
              ...state.contexts,
              [contextId]: {
                fields: ctx.fields.map(f => ({ ...f, visible })),
              },
            },
          };
        });
      },

      // ── 排序 ──
      moveField: (contextId, id, targetId) => {
        set(state => {
          const ctx = state.contexts[contextId];
          if (!ctx) return state;
          const fields = [...ctx.fields];
          const dragIdx = fields.findIndex(f => f.id === id);
          const targetIdx = fields.findIndex(f => f.id === targetId);
          if (dragIdx === -1 || targetIdx === -1) return state;
          const [dragged] = fields.splice(dragIdx, 1);
          fields.splice(targetIdx, 0, dragged);
          return {
            contexts: {
              ...state.contexts,
              [contextId]: {
                fields: fields.map((f, i) => ({ ...f, sortOrder: i })),
              },
            },
          };
        });
      },

      // ── 预设 ──
      applyPreset: (contextId, presetIds) => {
        const presetSet = new Set(presetIds);
        set(state => {
          const ctx = state.contexts[contextId];
          if (!ctx) return state;
          return {
            contexts: {
              ...state.contexts,
              [contextId]: {
                fields: ctx.fields.map(f => ({
                  ...f,
                  visible: presetSet.has(f.id),
                })),
              },
            },
          };
        });
      },

      // ── 重置 ──
      resetContext: (contextId) => {
        set(state => {
          const { [contextId]: _, ...rest } = state.contexts;
          return { contexts: rest };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createApiPersistStorage(),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // 迁移旧数据：如果 archive-item 上下文为空，尝试从旧 key 读取
        const archiveCtx = state.contexts['archive-item'];
        if (!archiveCtx || archiveCtx.fields.length === 0) {
          try {
            const raw = localStorage.getItem('metadata-display-config');
            if (raw) {
              const oldData: OldState = JSON.parse(raw);
              const migrated = migrateFromOldFormat(oldData);
              if (migrated) {
                setTimeout(() => {
                  useMetadataDisplayStore.setState(s => ({
                    contexts: { ...s.contexts, 'archive-item': migrated },
                  }));
                }, 0);
              }
            }
          } catch {
            // 忽略迁移错误（旧数据格式不兼容等）
          }
        }
      },
    },
  ),
);
