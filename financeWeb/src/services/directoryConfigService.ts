/**
 * 目录配置 API 服务（P0-9 迁移版）
 *
 * 原 Express:3001 + JSON 文件后端 → 已迁入 ams-server /config/directory（ams_config 表）。
 * 函数签名保持不变，DirectoryConfigContext / 面板无需改动。
 */
import type { DirectoryConfig } from '../configTypes';
import { http } from './http';

interface ConfigView {
  key: string;
  value: DirectoryConfig;
}

/** 获取完整目录配置 */
export async function fetchDirectoryConfig(): Promise<DirectoryConfig> {
  const view = await http.get<ConfigView>('/config/directory');
  return view.value;
}

/** 保存完整目录配置（返回服务端落库后的配置） */
export async function saveDirectoryConfig(config: Partial<DirectoryConfig>): Promise<DirectoryConfig> {
  // 先读后写（ams_config 是整文档 KV，部分字段需合并）
  let merged: DirectoryConfig;
  try {
    const current = await fetchDirectoryConfig();
    merged = { ...current, ...config };
  } catch {
    merged = config as DirectoryConfig;
  }
  const view = await http.put<ConfigView>('/config/directory', { value: merged });
  return view.value;
}
