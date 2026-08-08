/**
 * 目录配置 API（Axios 版）
 */
import axios from 'axios';
import type { DirectoryConfig } from '@/types/config';
export type { DirectoryConfig };

const http = axios.create({ baseURL: '' });

export async function getDirectoryConfig(): Promise<DirectoryConfig> {
  const res = await http.get<DirectoryConfig>('/api/directory-config');
  return res.data;
}

export async function saveDirectoryConfig(config: DirectoryConfig): Promise<DirectoryConfig> {
  const res = await http.put<DirectoryConfig>('/api/directory-config', config);
  return res.data;
}

export async function getDirectoryTree(viewType: string): Promise<unknown> {
  const res = await http.get(`/api/directory-config/tree/${viewType}`);
  return res.data;
}
