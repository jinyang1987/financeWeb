/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * storageService — 实体库房密集架 API（V6 架位模型 + V7 库房实体，2026-08-18）
 *
 * 对应 ams-server /storage：
 *   GET    /storage/racks          密集架布局（库房→架→列×层×位）
 *   POST   /storage/racks          新增密集架
 *   PUT    /storage/racks/{id}     编辑架（架名/维度；缩容须无占用）
 *   DELETE /storage/racks/{id}     删除空架（有在架盒拒绝）
 *   GET    /storage/positions      盒架位占用事实（盒节点 ↔ 格位）
 *   GET    /storage/rooms          库房列表（含架数/在架盒数）
 *   POST   /storage/rooms          新建库房（库房号创建后不可改）
 *   PUT    /storage/rooms/{room}   重命名库房
 *   DELETE /storage/rooms/{room}   删除空库房
 */

import { http } from './http';

export interface StorageRack {
  id: string;
  room: string;
  room_name: string;
  rack: string;
  rack_name: string;
  column_count: number;
  layer_count: number;
  cell_count: number;
  sort: number;
}

export interface StorageRoom {
  room: string;
  room_name: string;
  sort: number;
  rack_count: number;
  box_count: number;
}

export interface BoxPosition {
  box_node_id: string;
  room: string;
  rack: string;
  column_no: number;
  layer_no: number;
  cell_no: number;
  shelved_at: string;
  shelved_by: string;
}

export async function fetchRacks(): Promise<StorageRack[]> {
  return http.get<StorageRack[]>('/storage/racks');
}

export async function createRack(cmd: {
  room: string;
  roomName?: string;
  rack: string;
  rackName?: string;
  columnCount: number;
  layerCount: number;
  cellCount: number;
}): Promise<StorageRack> {
  return http.post<StorageRack>('/storage/racks', cmd);
}

/** 编辑密集架（架名/维度；架号不可改，缩容时新边界外不得有在架盒） */
export async function updateRack(id: string, patch: {
  rackName?: string;
  columnCount: number;
  layerCount: number;
  cellCount: number;
}): Promise<StorageRack> {
  return http.put<StorageRack>(`/storage/racks/${id}`, patch);
}

export async function deleteRack(id: string): Promise<void> {
  await http.delete(`/storage/racks/${id}`);
}

export async function fetchPositions(): Promise<BoxPosition[]> {
  return http.get<BoxPosition[]>('/storage/positions');
}

// ─── 库房实体（V7） ───

export async function fetchRooms(): Promise<StorageRoom[]> {
  return http.get<StorageRoom[]>('/storage/rooms');
}

export async function createRoom(room: string, roomName?: string): Promise<StorageRoom> {
  return http.post<StorageRoom>('/storage/rooms', { room, roomName });
}

export async function renameRoom(room: string, roomName: string): Promise<void> {
  await http.put(`/storage/rooms/${encodeURIComponent(room)}`, { roomName });
}

export async function deleteRoom(room: string): Promise<void> {
  await http.delete(`/storage/rooms/${encodeURIComponent(room)}`);
}

/** 格位 key（占用映射用） */
export function cellKey(room: string, rack: string, column: number, layer: number, cell: number): string {
  return `${room}|${rack}|${column}|${layer}|${cell}`;
}

/** 架位人类可读文本（与服务端 locationText 一致） */
export function locationText(room: string, rack: string, column: number, layer: number, cell: number): string {
  return `${room}库·${rack}架·${column}列·${layer}层·${cell}位`;
}
