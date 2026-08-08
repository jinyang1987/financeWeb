/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * voucherFilesStore — 凭证管理区文件存储 + 分类体系
 *
 * 临时存放未归档的电子凭证文件，支持自建分类目录。
 * 文件内容以 base64 存储在 localStorage（小文件场景），
 * 后续可对接 Alfresco 内容平台实现真正的 CMIS 存储。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 文件来源 */
export type FileSource = 'upload' | 'scanned' | 'imported';

/** 凭证管理区的分类（文件夹） */
export interface VoucherCategory {
  id: string;
  name: string;
  /** 父分类 ID，null 为根级 */
  parentId: string | null;
  /** 排序序号 */
  sortOrder: number;
  /** 创建时间 ISO */
  createdAt: string;
}

/** 凭证管理区的文件条目 */
export interface VoucherFile {
  id: string;
  name: string;
  ext: string;
  size: string;
  sizeBytes: number;
  mimeType: string;
  uploadDate: string;
  source: FileSource;
  note: string;
  dataUrl: string;
  /** 所属分类 ID，null 为未分类 */
  categoryId: string | null;
}

let catIdCounter = 0;
let fileIdCounter = 0;

interface VoucherFilesState {
  files: VoucherFile[];
  categories: VoucherCategory[];

  // ── 分类 CRUD ──
  addCategory: (name: string, parentId?: string | null) => VoucherCategory;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
  moveCategory: (id: string, newParentId: string | null) => void;

  // ── 文件操作 ──
  addFiles: (newFiles: VoucherFile[]) => void;
  removeFile: (id: string) => void;
  removeFiles: (ids: string[]) => void;
  clearAll: () => void;
  updateNote: (id: string, note: string) => void;
  moveFilesToCategory: (fileIds: string[], categoryId: string | null) => void;
}

export const useVoucherFilesStore = create<VoucherFilesState>()(
  persist(
    (set, get) => ({
      files: [],
      categories: [
        {
          id: 'cat-default',
          name: '默认分类',
          parentId: null,
          sortOrder: 0,
          createdAt: new Date().toISOString(),
        },
      ],

      // ── 分类 CRUD ──
      addCategory: (name, parentId = null) => {
        const cat: VoucherCategory = {
          id: `cat-${++catIdCounter}`,
          name,
          parentId,
          sortOrder: get().categories.length,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ categories: [...s.categories, cat] }));
        return cat;
      },

      renameCategory: (id, name) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, name } : c
          ),
        })),

      deleteCategory: (id) => {
        const state = get();
        // 找到所有子分类，递归删除
        const childIds = new Set<string>();
        const findChildren = (parentId: string) => {
          for (const c of state.categories) {
            if (c.parentId === parentId && !childIds.has(c.id)) {
              childIds.add(c.id);
              findChildren(c.id);
            }
          }
        };
        findChildren(id);
        const allIds = new Set([id, ...childIds]);

        set({
          categories: state.categories.filter((c) => !allIds.has(c.id)),
          // 被删分类下的文件移回未分类
          files: state.files.map((f) =>
            allIds.has(f.categoryId || '') ? { ...f, categoryId: null } : f
          ),
        });
      },

      moveCategory: (id, newParentId) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, parentId: newParentId } : c
          ),
        })),

      // ── 文件操作 ──
      addFiles: (newFiles) =>
        set((state) => ({ files: [...newFiles, ...state.files] })),

      removeFile: (id) =>
        set((state) => ({
          files: state.files.filter((f) => f.id !== id),
        })),

      removeFiles: (ids) =>
        set((state) => ({
          files: state.files.filter((f) => !ids.includes(f.id)),
        })),

      clearAll: () => set({ files: [] }),

      updateNote: (id, note) =>
        set((state) => ({
          files: state.files.map((f) => (f.id === id ? { ...f, note } : f)),
        })),

      moveFilesToCategory: (fileIds, categoryId) =>
        set((state) => ({
          files: state.files.map((f) =>
            fileIds.includes(f.id) ? { ...f, categoryId } : f
          ),
        })),
    }),
    { name: 'voucher-files-store' },
  ),
);
