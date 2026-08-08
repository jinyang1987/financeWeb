/**
 * JSON 文件存储层
 * 提供基于文件系统的持久化读写
 * 接口设计兼容远期 MySQL 替换（只需替换此文件的实现）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

/** 确保数据目录存在 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** 从 JSON 文件读取数据 */
export function readJson<T>(filename: string, fallback: T): T {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as T;
    }
  } catch (err) {
    console.warn(`[Storage] 读取 ${filename} 失败:`, (err as Error).message);
  }
  // 不存在则写入默认值
  writeJson(filename, fallback);
  return fallback;
}

/** 写入数据到 JSON 文件 */
export function writeJson<T>(filename: string, data: T): void {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
