/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * http — ams-server 统一请求封装
 *
 * 前端只调 ams-server（/api/ams → :8081），认证头从 session 注入，
 * 错误按 ams-server 的 ApiError 结构规整抛出（带机器可读 code）。
 */

import { session } from './session';

const AMS_BASE = '/api/ams';

/** 业务错误（code 与 ams-server BizException 对齐） */
export class ApiRequestError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept-Charset': 'UTF-8',
    ...session.amsHeaders(),
    ...(extraHeaders || {}),
  };
  const res = await fetch(`${AMS_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return {} as T;

  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (!res.ok) {
    const err = data as { code?: string; message?: string } | undefined;
    throw new ApiRequestError(res.status, err?.code || `HTTP_${res.status}`, err?.message || `请求失败 (${res.status})`);
  }
  return data as T;
}

/** multipart 上传（文件+表单字段）：不设置 Content-Type，由浏览器生成 boundary */
async function upload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${AMS_BASE}${path}`, {
    method: 'POST',
    headers: { ...session.amsHeaders() },
    body: formData,
  });

  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (!res.ok) {
    const err = data as { code?: string; message?: string } | undefined;
    throw new ApiRequestError(res.status, err?.code || `HTTP_${res.status}`, err?.message || `上传失败 (${res.status})`);
  }
  return data as T;
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, formData: FormData) => upload<T>(path, formData),
};
