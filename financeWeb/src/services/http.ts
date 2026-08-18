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

/** 普通请求超时（旧 jar 对未映射路径会挂起不响应，超时是前端唯一防线，2026-08-17 事故） */
const REQUEST_TIMEOUT_MS = 20_000;
/** 上传请求超时（大文件留足余量） */
const UPLOAD_TIMEOUT_MS = 120_000;

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

/** 带超时的 fetch：服务端挂起（连接接受但永不响应）时按 408/TIMEOUT 抛出 */
async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiRequestError(408, 'TIMEOUT', '请求超时：服务无响应（端点不存在或服务异常，请检查后端版本）');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept-Charset': 'UTF-8',
    ...session.amsHeaders(),
    ...(extraHeaders || {}),
  };
  const res = await fetchWithTimeout(`${AMS_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, REQUEST_TIMEOUT_MS);

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
  const res = await fetchWithTimeout(`${AMS_BASE}${path}`, {
    method: 'POST',
    headers: { ...session.amsHeaders() },
    body: formData,
  }, UPLOAD_TIMEOUT_MS);

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
