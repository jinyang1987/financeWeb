/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * boxService — 盒域 API（P1-② 组卷写路径）
 *
 * 对应 ams-server /boxes：
 *   GET /boxes                盒列表（fondsCode 必传；year/typeCode/status 过滤）
 *   GET /boxes/{id}/volumes   盒内案卷列表
 *
 * 建盒由卷域移交归盒时自动完成（VolumeService.transfer），本域暂不提供写端点。
 * 数据形状：dtoToBox 把后端视图映射为前端 ArchiveBox，页面/store 无感知。
 */

import { http } from './http';
import type { ArchiveBox, BoxStatus } from '../types/archiveBox';

// ─── DTO（与 ams-server BoxService.toView 对齐） ───
export interface BoxDto {
  nodeId: string;
  name: string;
  boxNo: string;
  boxName: string;
  typeCode: string;            // KP/KB/FB/QT
  archiveTypeCode: string;     // DA/T 数字代码 01-04
  fondsCode: string;
  year: number | null;
  retention: string;
  status: string;
  securityLevel: string;
  location: string;
  volumeCount: number | null;
  volumeCountActual?: number;  // 实际卷数（子节点统计）
  totalItems: number | null;
  volumeCodeRange: string;
  remarks: string;
  // ── v2.9 盒级人工字段（2026-08-29 T9，B20-B23/B26-B29） ──
  packer?: string;             // 装盒人
  packDate?: string;           // 装盒日期
  arranger?: string;           // 整理人
  auditor?: string;            // 审核人
  auditDate?: string;          // 审核日期
  dualSetRef?: string;         // 双套制关联（另一载体套号）
  createdAt: string;
  modifiedAt: string;
}

export interface BoxVolumeDto {
  nodeId: string;
  name: string;
  volumeCode: string;
  title: string;
  status: string;
  totalItems: number | null;
}

// ─── API ───

export async function fetchBoxes(params: {
  fondsCode: string;
  year?: number;
  typeCode?: string;
  status?: string;
}): Promise<ArchiveBox[]> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const list = await http.get<BoxDto[]>(`/boxes?${qs.toString()}`);
  return list.map(dtoToBox);
}

export async function fetchBoxVolumes(boxId: string): Promise<BoxVolumeDto[]> {
  return http.get<BoxVolumeDto[]>(`/boxes/${boxId}/volumes`);
}

// ─── 盒写操作（2026-08-16 贯通修复，真服务端持久化） ───

/** 盒元数据可编辑字段（T9 人工字段白名单；盒号/类别/年度/期限由移交流程维护，不在编辑范围） */
export interface BoxMetadataPatch {
  boxName?: string;
  securityLevel?: string;
  remarks?: string;
  packer?: string;
  packDate?: string;
  arranger?: string;
  auditor?: string;
  auditDate?: string;
  dualSetRef?: string;
}

/** 盒级元数据录入/修改（2026-08-29 T9 补写端点；服务端落审计留痕） */
export async function updateBoxMetadata(boxId: string, patch: BoxMetadataPatch): Promise<ArchiveBox> {
  return dtoToBox(await http.put<BoxDto>(`/boxes/${boxId}`, patch));
}

/** 封盒（active → sealed） */
export async function sealBoxApi(boxId: string): Promise<ArchiveBox> {
  return dtoToBox(await http.post<BoxDto>(`/boxes/${boxId}/seal`));
}

/** 开封（sealed → active） */
export async function unsealBoxApi(boxId: string): Promise<ArchiveBox> {
  return dtoToBox(await http.post<BoxDto>(`/boxes/${boxId}/unseal`));
}

/** 架位坐标（库房-架-列-层-位，2026-08-17 密集架模型） */
export interface ShelfPosition {
  room: string;
  rack: string;
  column: number;
  layer: number;
  cell: number;
}

/** 上架（指定架位；active/sealed → stored，占用互斥由服务端校验） */
export async function shelveBoxApi(boxId: string, pos: ShelfPosition): Promise<ArchiveBox> {
  return dtoToBox(await http.post<BoxDto>(`/boxes/${boxId}/shelve`, pos));
}

/** 上架（自动分配第一个空格位） */
export async function shelveBoxAutoApi(boxId: string): Promise<ArchiveBox> {
  return dtoToBox(await http.post<BoxDto>(`/boxes/${boxId}/shelve`, { auto: true }));
}

/** 下架（stored → sealed，架位清除） */
export async function unshelveBoxApi(boxId: string): Promise<ArchiveBox> {
  return dtoToBox(await http.post<BoxDto>(`/boxes/${boxId}/unshelve`));
}

/** 删除空盒（盒内有卷或在架时服务端拒绝） */
export async function deleteBoxApi(boxId: string): Promise<void> {
  await http.delete(`/boxes/${boxId}`);
}

// ─── DTO → 前端模型映射 ───

export function dtoToBox(dto: BoxDto): ArchiveBox {
  return {
    id: dto.nodeId,
    boxId: dto.boxNo || dto.nodeId,
    boxNo: dto.boxNo || '',
    boxName: dto.boxName || dto.name || '',
    archiveTypeCode: dto.typeCode || 'QT',
    location: dto.location || '',
    retention: dto.retention || '',
    year: dto.year ?? new Date().getFullYear(),
    carrierType: 'paper',
    status: (dto.status || 'active') as BoxStatus,
    volumeCount: dto.volumeCountActual ?? dto.volumeCount ?? 0,
    volumeCodeRange: dto.volumeCodeRange || undefined,
    totalItems: dto.totalItems ?? 0,
    securityLevel: dto.securityLevel || undefined,
    createdDate: dto.createdAt ? dto.createdAt.slice(0, 10) : '',
    createdBy: '',
    remarks: dto.remarks || undefined,
    // v2.9 盒级人工字段（T9）
    packer: dto.packer || undefined,
    packDate: dto.packDate || undefined,
    arranger: dto.arranger || undefined,
    auditor: dto.auditor || undefined,
    auditDate: dto.auditDate || undefined,
    dualSetRef: dto.dualSetRef || undefined,
  };
}
