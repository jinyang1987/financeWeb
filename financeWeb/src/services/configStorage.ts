/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * configStorage — zustand persist 的 API 存储适配器（P0-9）
 *
 * 各配置 store 由 localStorage persist 迁移到 ams-server /config/{key}（ams_config 表）。
 *
 * 一次性迁移：首次读取时若 API 无此配置而旧 localStorage 有，自动上传并清除旧值。
 * 失败降级：API 不可达时静默降级到 localStorage（离线容忍，恢复后下次写入即同步）。
 */

import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { http } from './http';

interface ConfigView {
  key: string;
  value: unknown;
}

/** 判断 legacy localStorage 是否有值 */
function readLegacy(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function removeLegacy(name: string) {
  try {
    localStorage.removeItem(name);
  } catch { /* 忽略 */ }
}

async function pushToApi(name: string, value: string): Promise<boolean> {
  try {
    await http.put(`/config/${encodeURIComponent(name)}`, { value: JSON.parse(value) });
    return true;
  } catch {
    return false;
  }
}

const apiStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    // 1. 优先从 API 读取
    try {
      const view = await http.get<ConfigView>(`/config/${encodeURIComponent(name)}`);
      if (view && view.value !== null && view.value !== undefined) {
        return JSON.stringify(view.value);
      }
    } catch {
      // 404（无此配置）或网络错误 → 进入迁移/降级逻辑
    }

    // 2. API 无值：尝试一次性迁移旧 localStorage
    const legacy = readLegacy(name);
    if (legacy) {
      const ok = await pushToApi(name, legacy);
      if (ok) {
        removeLegacy(name);
        return legacy;
      }
      // API 不可达：暂用旧值（下次成功写入即同步）
      return legacy;
    }
    return null;
  },

  setItem: async (name: string, value: string): Promise<void> => {
    const ok = await pushToApi(name, value);
    if (!ok) {
      // API 不可达：降级写 localStorage（恢复后下次写入即同步）
      try {
        localStorage.setItem(name, value);
      } catch { /* 忽略 */ }
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await http.put(`/config/${encodeURIComponent(name)}`, { value: null });
    } catch { /* 忽略 */ }
    removeLegacy(name);
  },
};

/** 创建 API 持久化存储（zustand persist 的 storage 参数） */
export function createApiPersistStorage() {
  return createJSONStorage(() => apiStorage);
}
