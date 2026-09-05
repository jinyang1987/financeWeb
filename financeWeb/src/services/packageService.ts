/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * packageService — 归档信息包 API（2026-09-05 批次五 T15 真实现）
 *
 * 对应 ams-server /packages（启用 ams_package 表）：
 *   POST /packages                  生成信息包（真 ZIP：DA/T 48 封装说明 + 卷元数据 + 件内容；包级 SHA-256）
 *   GET  /packages                  信息包列表
 *   GET  /packages/{no}/download    下载 ZIP（服务端下载即验真：包级摘要一致性）
 *   POST /packages/{no}/transfer    发送（created → transferred）
 *   POST /packages/{no}/receive     接收回执（transferred → received）
 */

import { http } from './http';

export interface ArchivePackageDto {
  id: string;
  packageNo: string;
  name: string;
  unitKind: string;
  volumeNodes: string[];
  checksum: string;
  status: 'created' | 'transferred' | 'received' | string;
  createdAt: string;
  transferredAt: string;
  receivedAt: string;
}

export interface CreatePackageResult {
  packageNo: string;
  checksum: string;
  fileNodeId: string;
  totalVolumes: number;
  totalItems: number;
  zipSize: number;
}

/** 生成归档信息包（服务端真 ZIP；一卷一目录，封装说明 + 元数据 + 内容） */
export async function createArchivePackage(cmd: {
  fondsCode: string;
  name?: string;
  unitKind?: string;
  volumeNodes: string[];
}): Promise<CreatePackageResult> {
  return http.post<CreatePackageResult>('/packages', cmd);
}

/** 信息包列表 */
export async function fetchArchivePackages(): Promise<ArchivePackageDto[]> {
  return http.get<ArchivePackageDto[]>('/packages');
}

/** 下载信息包 ZIP（服务端校验包级摘要一致性，结果在 X-Package-Checksum-Match 头） */
export async function downloadArchivePackage(packageNo: string): Promise<void> {
  const res = await fetch(`/api/ams/packages/${encodeURIComponent(packageNo)}/download`, {
    headers: { ...(await import('./session')).session.amsHeaders() },
  });
  if (!res.ok) {
    let message = `下载失败 (${res.status})`;
    try {
      const err = await res.json();
      if (err?.message) message = err.message;
    } catch { /* 非 JSON 错误体 */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${packageNo}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 发送信息包（created → transferred） */
export async function transferArchivePackage(packageNo: string): Promise<ArchivePackageDto> {
  return http.post<ArchivePackageDto>(`/packages/${encodeURIComponent(packageNo)}/transfer`, {});
}

/** 接收回执（transferred → received） */
export async function receiveArchivePackage(packageNo: string): Promise<ArchivePackageDto> {
  return http.post<ArchivePackageDto>(`/packages/${encodeURIComponent(packageNo)}/receive`, {});
}
