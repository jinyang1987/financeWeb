/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * volumeService — 卷域 API（P1-② 组卷写路径）
 *
 * 对应 ams-server /volumes：
 *   POST   /volumes                        建卷（草稿）
 *   GET    /volumes                        卷列表（fondsCode 必传）
 *   PUT    /volumes/{id}                   更新案卷元数据
 *   DELETE /volumes/{id}                   删除空草稿案卷
 *   GET    /volumes/{id}/items             卷内件列表
 *   POST   /volumes/{id}/items             加件入卷（可选 position 插入位）
 *   DELETE /volumes/{id}/items/{recordId}  拆件回收集池（空卷自动销毁）
 *   PUT    /volumes/{id}/items/order       卷内重排
 *   POST   /volumes/{id}/confirm           确认组卷（赋号时机消费 ams_config）
 *   POST   /volumes/{id}/unconfirm         撤销确认
 *   POST   /volumes/{id}/decompose         拆卷
 *   POST   /volumes/{id}/transfer          移交归盒（自动找/建盒）
 *   POST   /volumes/{id}/return            退回组卷工作台
 *
 * 数据形状：dtoToVolume / dtoToVolumeItem 把后端视图映射为前端 Volume / VolumeItem，
 * 页面/store 无感知（形状不变，内部换调用）。
 */

import { http } from './http';
import type { Volume, VolumeItem, VolumeStatus } from '../types/volume';

// ─── DTO（与 ams-server VolumeService.toView 对齐） ───
export interface VolumeDto {
  nodeId: string;
  name: string;
  volumeCode: string;          // 未赋号（草稿）为空串
  title: string;
  fondsCode: string;
  typeCode: string;            // KP/KB/FB/QT（视图大类代码）
  archiveTypeCode: string;     // DA/T 数字代码 01-04（档号段用）
  archiveType: string;
  year: number | null;
  retention: string;
  retentionCode: string;
  status: string;
  totalItems: number | null;
  totalPages: number | null;
  pageStart: number | null;
  pageEnd: number | null;
  carrierType: string;
  securityLevel: string;
  cabinetNo: string;
  shelfNo: string;
  dateFrom: string;
  dateTo: string;
  createdDate: string;
  createdBy: string;
  scanned: boolean;
  digitalHash: string;
  boxId: string;
  boxNo: string;
  createdAt: string;
  modifiedAt: string;
}

export interface VolumeItemDto {
  nodeId: string;
  volumeId: string;
  name: string;
  archiveCode: string;         // 未赋号为空串
  pendingArchiveCode: string;  // 占位档号（始终有值，调试用）
  voucherNo: string;
  archiveType: string;
  year: number | null;
  month: number | null;
  amount: number | null;
  retention: string;
  recordStatus: string;
  itemNo: number | null;
  numbered: boolean;
  mimeType?: string;
  sizeInBytes?: number;
}

// ─── API ───

export interface CreateVolumeCmd {
  fondsCode: string;
  title: string;
  archiveType?: string;
  archiveTypeCode?: string;
  year: number;
  retention?: string;
  retentionCode?: string;
  dateFrom?: string;
  dateTo?: string;
  carrierType?: string;
  securityLevel?: string;
}

export async function createVolumeApi(cmd: CreateVolumeCmd): Promise<Volume> {
  const dto = await http.post<VolumeDto>('/volumes', cmd);
  return dtoToVolume(dto);
}

export async function fetchVolumes(params: {
  fondsCode: string;
  year?: number;
  typeCode?: string;
  status?: string;
}): Promise<Volume[]> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const list = await http.get<VolumeDto[]>(`/volumes?${qs.toString()}`);
  return list.map(dtoToVolume);
}

export async function updateVolumeApi(volumeId: string, patch: Partial<{
  title: string; retention: string; dateFrom: string; dateTo: string;
  cabinetNo: string; shelfNo: string; securityLevel: string; carrierType: string;
}>): Promise<Volume> {
  const dto = await http.put<VolumeDto>(`/volumes/${volumeId}`, patch);
  return dtoToVolume(dto);
}

export async function deleteVolumeApi(volumeId: string): Promise<void> {
  await http.delete(`/volumes/${volumeId}`);
}

export async function fetchVolumeItems(volumeId: string): Promise<VolumeItem[]> {
  const list = await http.get<VolumeItemDto[]>(`/volumes/${volumeId}/items`);
  return list.map(dtoToVolumeItem);
}

export async function addItemsApi(volumeId: string, recordIds: string[], position?: number): Promise<VolumeItem[]> {
  const list = await http.post<VolumeItemDto[]>(`/volumes/${volumeId}/items`, { recordIds, position });
  return list.map(dtoToVolumeItem);
}

/** 拆件回池；destroyed=true 表示案卷已随最后一件移除而自动销毁 */
export async function removeItemApi(volumeId: string, recordId: string): Promise<{ destroyed: boolean; remaining: number }> {
  return http.delete(`/volumes/${volumeId}/items/${recordId}`);
}

export async function reorderItemsApi(volumeId: string, orderedRecordIds: string[]): Promise<VolumeItem[]> {
  const list = await http.put<VolumeItemDto[]>(`/volumes/${volumeId}/items/order`, { orderedRecordIds });
  return list.map(dtoToVolumeItem);
}

export async function confirmVolumeApi(volumeId: string): Promise<Volume> {
  const dto = await http.post<VolumeDto>(`/volumes/${volumeId}/confirm`);
  return dtoToVolume(dto);
}

export async function unconfirmVolumeApi(volumeId: string): Promise<Volume> {
  const dto = await http.post<VolumeDto>(`/volumes/${volumeId}/unconfirm`);
  return dtoToVolume(dto);
}

export async function decomposeVolumeApi(volumeId: string): Promise<number> {
  const res = await http.post<{ decomposed: boolean; itemCount: number }>(`/volumes/${volumeId}/decompose`);
  return res.itemCount;
}

export async function transferVolumeApi(volumeId: string): Promise<Volume> {
  const dto = await http.post<VolumeDto>(`/volumes/${volumeId}/transfer`);
  return dtoToVolume(dto);
}

export async function returnVolumeApi(volumeId: string): Promise<Volume> {
  const dto = await http.post<VolumeDto>(`/volumes/${volumeId}/return`);
  return dtoToVolume(dto);
}

// ─── DTO → 前端模型映射 ───

export function dtoToVolume(dto: VolumeDto): Volume {
  return {
    id: dto.nodeId,
    volumeCode: dto.volumeCode || '',
    title: dto.title || dto.name || '',
    fondsCode: dto.fondsCode,
    archiveType: dto.archiveType || '',
    archiveTypeCode: dto.archiveTypeCode || '',
    year: dto.year ?? new Date().getFullYear(),
    retention: dto.retention || '',
    retentionCode: dto.retentionCode || '',
    totalItems: dto.totalItems ?? 0,
    totalPages: dto.totalPages ?? 0,
    pageStart: dto.pageStart ?? 0,
    pageEnd: dto.pageEnd ?? 0,
    volumeCount: 1,
    boxId: dto.boxId || '',
    boxNo: dto.boxNo || '',
    cabinetNo: dto.cabinetNo || '',
    shelfNo: dto.shelfNo || '',
    dateFrom: dto.dateFrom || '',
    dateTo: dto.dateTo || '',
    createdDate: dto.createdDate || '',
    createdBy: dto.createdBy || '',
    status: (dto.status || 'draft') as VolumeStatus,
    digitalHash: dto.digitalHash || '',
    scanned: !!dto.scanned,
    carrierType: (dto.carrierType || undefined) as Volume['carrierType'],
    securityLevel: dto.securityLevel || undefined,
    categoryConfigId: '',
  };
}

export function dtoToVolumeItem(dto: VolumeItemDto): VolumeItem {
  return {
    id: `vi-${dto.volumeId}-${dto.nodeId}`,
    volumeId: dto.volumeId,
    recordId: dto.nodeId,
    recordArchiveCode: dto.archiveCode || '',
    itemNo: dto.itemNo ?? 0,
    pageStart: 0,
    pageEnd: 0,
    title: dto.name || dto.voucherNo || '',
    date: dto.year ? `${dto.year}${dto.month ? '-' + String(dto.month).padStart(2, '0') : ''}` : '',
  };
}
