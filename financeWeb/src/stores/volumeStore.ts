/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * volumeStore — 案卷状态管理（P1-② 已切 ams-server 真后端）
 *
 * 职责：
 *   1. 案卷/卷内件的服务端数据镜像（loadVolumes 拉取，动作后刷新）
 *   2. 组卷写路径动作（建卷/加件/拆件/排序/确认/撤销/拆卷/移交/退回）→ volumeService
 *   3. 智能组卷推荐（纯前端计算，配置驱动）
 *
 * 赋号引擎已后端化：确认组卷由 ams-server 经 ams_code_serial 真取号（DA/T 13），
 * 前端不再本地生成档号（原 generateVolumeCode/getNextSerial 等已移除）。
 * 空案卷销毁由服务端保证（最后一件移除时自动删除案卷节点）。
 */

import { create } from 'zustand';
import {
  type Volume,
  type VolumeItem,
  type VolumeStatus,
  type VolumeRecommendation,
} from '../types/volume';
import type { ArchiveRecord } from '../types';
import { useVolumeGroupingStore, DEFAULT_PER_TYPE_RULES } from './volumeGroupingStore';
import type { GroupPeriod } from './volumeGroupingStore';
import {
  fetchVolumes, fetchVolumeItems,
  createVolumeApi, updateVolumeApi, deleteVolumeApi,
  addItemsApi, removeItemApi, reorderItemsApi,
  confirmVolumeApi, unconfirmVolumeApi, decomposeVolumeApi,
  splitVolumeApi, mergeVolumesApi, moveItemsApi,
  transferVolumeApi, returnVolumeApi,
} from '../services/volumeService';
import { fetchVolumeRecords } from '../services/recordService';
import { useSourceDocumentStore } from './sourceDocumentStore';
import type { SourceDocument } from '../types/sourceDocument';

// ── 档案类别代码 → 中文名称 ──
const ARCHIVE_TYPE_LABELS: Record<string, string> = {
  KP: '会计凭证',
  KB: '会计账簿',
  FB: '财务报表',
  QT: '其他会计资料',
};

// ── 移交日志类型（会话内活动记录；服务端移交台账属 P3 transfer_batch） ──
export interface TransferLogEntry {
  id: string;
  transferNo: string;
  fromDept: string;
  toDept: string;
  fromPerson: string;
  toPerson: string;
  volumeIds: string[];
  totalVolumes: number;
  totalItems: number;
  transferDate: string;
  status: 'transferred';
}

// ── 账簿子类型推断（用于 separateByBookType 分离） ──
// DA/T 42-2022: 总账、明细账、日记账、辅助账簿需独立组卷
const BOOK_TYPE_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /总[分类账]|总账/, label: '总账' },
  { regex: /明[细分]账|明细/, label: '明细账' },
  { regex: /现金日记|现金/, label: '现金日记账' },
  { regex: /银行(?:存款)?日记|银行/, label: '银行存款日记账' },
  { regex: /辅助|备查/, label: '辅助账簿' },
  { regex: /固定资[产]/i, label: '固定资产卡片' },
];

function inferBookSubType(r: ArchiveRecord): string {
  const text = `${r.voucherNo || ''} ${r.archiveType || ''} ${r.remarks || ''} ${(r as any).title || ''}`;
  for (const p of BOOK_TYPE_PATTERNS) {
    if (p.regex.test(text)) return p.label;
  }
  // 无法推断 → 使用档案类别兜底
  return r.archiveType || '会计账簿';
}

// ── 获取档案类别代码（国标数字编码 DA/T 13-2022） ──
const ARCHIVE_TYPE_CODE_MAP: Record<string, string> = {
  '记账凭证': '01',
  '会计凭证': '01',
  '原始凭证': '01',
  '会计账簿': '02',
  '财务报告': '03',
  '财务报表': '03',
  '其他会计资料': '04',
};

export function inferTypeCode(archiveType: string): string {
  return ARCHIVE_TYPE_CODE_MAP[archiveType] || '04';
}

// ── 档号类别代码(DA/T数字) ↔ 视图大类代码(字母) 双向映射 ──
// 档号段用数字代码（01-04），档案盒/分类视图/财务视图用字母代码（KP/KB/FB/QT），
// 两套体系必须在归档归类时统一，否则移交的案卷无法落入对应类型目录（2026-07-18 Bug修复）。
const TYPE_CODE_TO_CATEGORY: Record<string, string> = {
  '01': 'KP',
  '02': 'KB',
  '03': 'FB',
  '04': 'QT',
};

/**
 * 将案卷的类别标识统一归一为视图大类代码（KP/KB/FB/QT）。
 * 兼容三种输入：字母代码（KP）、数字代码（01）、空值（按 archiveType 中文名推断）。
 */
export function toCategoryCode(archiveTypeCode: string, archiveType?: string): string {
  if (TYPE_CODE_TO_CATEGORY[archiveTypeCode]) return TYPE_CODE_TO_CATEGORY[archiveTypeCode];
  if (['KP', 'KB', 'FB', 'QT'].includes(archiveTypeCode)) return archiveTypeCode;
  // 空值兜底：按中文类别名推断
  if (archiveType) return TYPE_CODE_TO_CATEGORY[inferTypeCode(archiveType)] || 'QT';
  return 'QT';
}

// ── 获取保管期限代码 ──
export function inferRetentionCode(retention: string): string {
  if (retention === '永久') return 'Y';
  const match = retention.match(/(\d+)/);
  return match ? `D${match[1]}` : 'D30';
}

// ── 当前日期字符串 ──
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── 凭证号连续性检测 ──
// 解析凭证号（如 "记-001" → { prefix: "记", number: 1 }）
function parseVoucherNo(voucherNo: string): { prefix: string; number: number } | null {
  const m = voucherNo.match(/^(.+?)-(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], number: parseInt(m[2], 10) };
}

/** 检测凭证号列表是否连续（同一前缀、号码连续无跳号） */
export function validateVoucherContinuity(voucherNos: string[]): {
  isContinuous: boolean;
  gaps: string[];
  prefix: string;
  range: string;
} {
  if (voucherNos.length === 0) return { isContinuous: false, gaps: [], prefix: '', range: '' };

  const parsed = voucherNos.map(v => parseVoucherNo(v)).filter(Boolean) as { prefix: string; number: number }[];
  if (parsed.length === 0) return { isContinuous: false, gaps: voucherNos, prefix: '', range: '' };

  // 取第一个作为统一前缀
  const prefix = parsed[0].prefix;
  parsed.sort((a, b) => a.number - b.number);

  const gaps: string[] = [];
  let isContinuous = true;
  for (let i = 1; i < parsed.length; i++) {
    const expected = parsed[i - 1].number + 1;
    if (parsed[i].number !== expected) {
      // 检查是否前缀不同
      if (parsed[i].prefix !== prefix) {
        isContinuous = false;
        gaps.push(`前缀不一致: ${parsed[i].prefix} ≠ ${prefix}`);
      } else {
        // 有跳号
        for (let j = expected; j < parsed[i].number; j++) {
          gaps.push(`${prefix}-${String(j).padStart(3, '0')}`);
        }
        isContinuous = false;
      }
    }
  }

  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  return {
    isContinuous,
    gaps,
    prefix,
    range: `${prefix}-${String(first.number).padStart(3, '0')}~${prefix}-${String(last.number).padStart(3, '0')}`,
  };
}

/** 在按凭证号排序的记录列表中检测连续号段，返回分段 */
export function detectContinuousSegments(
  records: Array<{ voucherNo: string }>,
): Array<{ records: Array<{ voucherNo: string }>; range: string; count: number }> {
  if (records.length === 0) return [];

  const sorted = [...records].sort((a, b) => {
    const pa = parseVoucherNo(a.voucherNo);
    const pb = parseVoucherNo(b.voucherNo);
    if (!pa || !pb) return a.voucherNo.localeCompare(b.voucherNo);
    if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
    return pa.number - pb.number;
  });

  const segments: Array<{ records: Array<{ voucherNo: string }>; range: string; count: number }> = [];
  let currentSegment: Array<{ voucherNo: string }> = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = parseVoucherNo(sorted[i - 1].voucherNo);
    const curr = parseVoucherNo(sorted[i].voucherNo);

    // 判断是否应该合并到当前段：同一前缀 且 号码连续
    if (prev && curr && prev.prefix === curr.prefix && curr.number === prev.number + 1) {
      currentSegment.push(sorted[i]);
    } else {
      // 新段开始
      const first = parseVoucherNo(currentSegment[0].voucherNo);
      const last = parseVoucherNo(currentSegment[currentSegment.length - 1].voucherNo);
      segments.push({
        records: currentSegment,
        count: currentSegment.length,
        range: first && last
          ? `${first.prefix}-${String(first.number).padStart(3, '0')}~${last.prefix}-${String(last.number).padStart(3, '0')}`
          : '—',
      });
      currentSegment = [sorted[i]];
    }
  }

  // 最后一个段
  const first = parseVoucherNo(currentSegment[0].voucherNo);
  const last = parseVoucherNo(currentSegment[currentSegment.length - 1].voucherNo);
  segments.push({
    records: currentSegment,
    count: currentSegment.length,
    range: first && last
      ? `${first.prefix}-${String(first.number).padStart(3, '0')}~${last.prefix}-${String(last.number).padStart(3, '0')}`
      : '—',
  });

  return segments;
}

// ── Store 类型 ──
interface VolumeState {
  // ── 数据（服务端镜像） ──
  volumes: Volume[];
  setVolumes: (volumes: Volume[]) => void;

  activeVolume: Volume | null;
  setActiveVolume: (volume: Volume | null) => void;

  /** 卷内条目，keyed by volumeId */
  volumeItems: Record<string, VolumeItem[]>;
  setVolumeItems: (volumeId: string, items: VolumeItem[]) => void;

  /** 卷内完整记录（P1-③ 读视图），keyed by volumeId */
  volumeRecords: Record<string, ArchiveRecord[]>;
  setVolumeRecords: (volumeId: string, records: ArchiveRecord[]) => void;

  /** 组卷推荐（纯前端计算） */
  recommendations: VolumeRecommendation[];
  setRecommendations: (recs: VolumeRecommendation[]) => void;

  /** 筛选条件 */
  filters: {
    year: number | null;
    month: string | null;
    archiveType: string | null;
    retention: string | null;
    fondsCode: string;
  };
  setFilters: (filters: Partial<VolumeState['filters']>) => void;

  /** 加载状态 */
  loading: boolean;

  // ── 数据加载 ──
  /** 拉取指定全宗的全部案卷 + 各卷卷内件（服务端镜像重建） */
  loadVolumes: (fondsCode: string) => Promise<void>;
  /** 单卷卷内件刷新 */
  loadVolumeItems: (volumeId: string) => Promise<void>;

  // ── 操作：案卷管理（全部 async，落服务端后刷新镜像） ──
  createVolume: (partial: Partial<Volume>) => Promise<Volume>;
  updateVolume: (id: string, partial: Partial<Volume>) => Promise<void>;
  deleteVolume: (id: string) => Promise<void>;

  // ── 操作：卷内条目管理 ──
  addItemsToVolume: (volumeId: string, recordIds: string[]) => Promise<void>;
  removeItemFromVolume: (volumeId: string, recordId: string) => Promise<void>;
  reorderItems: (volumeId: string, orderedItemIds: string[]) => Promise<void>;
  /** 在案卷中指定位置插入一条记录 */
  insertItemIntoVolume: (volumeId: string, recordId: string, position: number) => Promise<void>;

  // ── 操作：组卷确认 ──
  confirmVolume: (volumeId: string) => Promise<{ volume: Volume; updatedRecords: string[] }>;
  /** 将已确认案卷恢复为草稿状态 */
  unconfirmVolume: (volumeId: string) => Promise<void>;

  // ── 操作：拆卷 ──
  /** 拆除草稿案卷，所有条目回到待组卷池；返回拆出件数 */
  decomposeVolume: (volumeId: string) => Promise<number>;

  // ── 操作：拆分 / 合并 / 转卷（2026-08-17 组卷操作补全，全部草稿卷限定 + 同类同年同期校验） ──
  /** 拆分：卷内选定件拆出为新案卷（继承源卷属性）；返回新案卷 */
  splitVolume: (volumeId: string, recordIds: string[], title?: string) => Promise<Volume>;
  /** 合并：来源草稿卷并入目标卷（来源卷删除）；返回目标卷与合并统计 */
  mergeVolumes: (sourceVolumeIds: string[], targetVolumeId: string) => Promise<{ volume: Volume; mergedCount: number; mergedVolumes: number }>;
  /** 转卷：卷内选定件移入目标草稿卷（全部移出时源卷自动销毁） */
  moveItemsToVolume: (volumeId: string, recordIds: string[], targetVolumeId: string) => Promise<{ moved: number; sourceDestroyed: boolean }>;

  // ── 操作：移交至档案保管 ──
  transferVolume: (volumeId: string) => Promise<void>;

  // ── 操作：退回至组卷工作台 ──
  returnVolumes: (volumeIds: string[]) => Promise<void>;

  // ── 操作：智能推荐（纯前端，配置驱动） ──
  generateRecommendations: (unassignedRecords: ArchiveRecord[]) => void;
  acceptRecommendation: (recIndex: number) => Promise<string | null>; // returns new volumeId
  acceptAllRecommendations: () => Promise<string[]>;

  // ── 移交日志（会话内活动记录） ──
  transferLog: TransferLogEntry[];
}

export const useVolumeStore = create<VolumeState>((set, get) => ({
  // ── 初始数据（切 API 后种子清空，见 2026-07-20 决策：假数据分域随切随清） ──
  volumes: [],
  setVolumes: (volumes) => set({ volumes }),

  activeVolume: null,
  setActiveVolume: (activeVolume) => set({ activeVolume }),

  volumeItems: {},
  setVolumeItems: (volumeId, items) =>
    set((s) => ({ volumeItems: { ...s.volumeItems, [volumeId]: items } })),

  volumeRecords: {},
  setVolumeRecords: (volumeId, records) =>
    set((s) => ({ volumeRecords: { ...s.volumeRecords, [volumeId]: records } })),

  recommendations: [],
  setRecommendations: (recommendations) => set({ recommendations }),

  filters: {
    year: null,
    month: null,
    archiveType: null,
    retention: null,
    fondsCode: 'Z001',
  },
  setFilters: (partial) =>
    set((s) => ({ filters: { ...s.filters, ...partial } })),

  loading: false,
  transferLog: [],

  // ── 数据加载 ──
  loadVolumes: async (fondsCode) => {
    set({ loading: true });
    try {
      const volumes = await fetchVolumes({ fondsCode });
      // 逐卷拉卷内件摘要 + 完整记录（P1-③ 读视图需要全属性）
      const [itemEntries, recordEntries] = await Promise.all([
        Promise.all(volumes.map(async (v) => [v.id, await fetchVolumeItems(v.id)] as const)),
        Promise.all(volumes.map(async (v) => [v.id, await fetchVolumeRecords(v.id)] as const)),
      ]);
      const volumeItems: Record<string, VolumeItem[]> = {};
      for (const [vid, items] of itemEntries) volumeItems[vid] = items;
      const volumeRecords: Record<string, ArchiveRecord[]> = {};
      for (const [vid, recs] of recordEntries) volumeRecords[vid] = recs;
      set((s) => ({
        volumes,
        volumeItems,
        volumeRecords,
        // 当前选中案卷已消失（如被他人拆卷）时同步清选
        activeVolume: s.activeVolume && !volumes.some((v) => v.id === s.activeVolume!.id)
          ? null : s.activeVolume,
      }));
    } finally {
      set({ loading: false });
    }
  },

  loadVolumeItems: async (volumeId) => {
    const items = await fetchVolumeItems(volumeId);
    set((s) => ({ volumeItems: { ...s.volumeItems, [volumeId]: items } }));
  },

  // ── 案卷管理 ──
  createVolume: async (partial) => {
    const volume = await createVolumeApi({
      fondsCode: partial.fondsCode || get().filters.fondsCode,
      title: partial.title || '新案卷',
      archiveType: partial.archiveType,
      archiveTypeCode: partial.archiveTypeCode,
      year: partial.year || new Date().getFullYear(),
      retention: partial.retention,
      retentionCode: partial.retentionCode,
      dateFrom: partial.dateFrom,
      dateTo: partial.dateTo,
      carrierType: partial.carrierType,
      securityLevel: partial.securityLevel,
    });
    set((s) => ({ volumes: [...s.volumes, volume] }));
    return volume;
  },

  updateVolume: async (id, partial) => {
    const updated = await updateVolumeApi(id, {
      title: partial.title,
      retention: partial.retention,
      dateFrom: partial.dateFrom,
      dateTo: partial.dateTo,
      cabinetNo: partial.cabinetNo,
      shelfNo: partial.shelfNo,
      securityLevel: partial.securityLevel,
      carrierType: partial.carrierType,
    });
    set((s) => ({
      volumes: s.volumes.map((v) => (v.id === id ? updated : v)),
      activeVolume: s.activeVolume?.id === id ? updated : s.activeVolume,
    }));
  },

  deleteVolume: async (id) => {
    await deleteVolumeApi(id);
    set((s) => {
      const { [id]: _omit, ...rest } = s.volumeItems;
      return {
        volumes: s.volumes.filter((v) => v.id !== id),
        volumeItems: rest,
        activeVolume: s.activeVolume?.id === id ? null : s.activeVolume,
      };
    });
  },

  // ── 卷内条目管理 ──
  addItemsToVolume: async (volumeId, recordIds) => {
    const items = await addItemsApi(volumeId, recordIds);
    set((s) => ({
      volumeItems: { ...s.volumeItems, [volumeId]: items },
      volumes: s.volumes.map((v) => (v.id === volumeId ? { ...v, totalItems: items.length } : v)),
    }));
  },

  removeItemFromVolume: async (volumeId, recordId) => {
    const { destroyed } = await removeItemApi(volumeId, recordId);
    if (destroyed) {
      // 服务端已自动销毁空案卷
      set((s) => {
        const { [volumeId]: _omit, ...rest } = s.volumeItems;
        return {
          volumes: s.volumes.filter((v) => v.id !== volumeId),
          volumeItems: rest,
          activeVolume: s.activeVolume?.id === volumeId ? null : s.activeVolume,
        };
      });
    } else {
      await get().loadVolumeItems(volumeId);
      const count = get().volumeItems[volumeId]?.length ?? 0;
      set((s) => ({
        volumes: s.volumes.map((v) => (v.id === volumeId ? { ...v, totalItems: count } : v)),
      }));
    }
  },

  reorderItems: async (volumeId, orderedItemIds) => {
    // 前端以 VolumeItem.id 排序，服务端按 recordId 顺排——先做 id 映射
    const existing = get().volumeItems[volumeId] || [];
    const recordOrder = orderedItemIds
      .map((itemId) => existing.find((it) => it.id === itemId)?.recordId)
      .filter(Boolean) as string[];
    // 未在参数中出现的件保持尾部原序（防御：服务端要求全量）
    for (const it of existing) {
      if (!recordOrder.includes(it.recordId)) recordOrder.push(it.recordId);
    }
    const items = await reorderItemsApi(volumeId, recordOrder);
    set((s) => ({ volumeItems: { ...s.volumeItems, [volumeId]: items } }));
  },

  insertItemIntoVolume: async (volumeId, recordId, position) => {
    const items = await addItemsApi(volumeId, [recordId], position);
    set((s) => ({
      volumeItems: { ...s.volumeItems, [volumeId]: items },
      volumes: s.volumes.map((v) => (v.id === volumeId ? { ...v, totalItems: items.length } : v)),
    }));
  },

  // ── 组卷确认（赋号由服务端按配置消费） ──
  confirmVolume: async (volumeId) => {
    const volume = await confirmVolumeApi(volumeId);
    const items = await fetchVolumeItems(volumeId);
    set((s) => ({
      volumes: s.volumes.map((v) => (v.id === volumeId ? volume : v)),
      volumeItems: { ...s.volumeItems, [volumeId]: items },
      activeVolume: s.activeVolume?.id === volumeId ? volume : s.activeVolume,
    }));
    return { volume, updatedRecords: items.map((it) => it.recordId) };
  },

  unconfirmVolume: async (volumeId) => {
    const volume = await unconfirmVolumeApi(volumeId);
    const items = await fetchVolumeItems(volumeId);
    set((s) => ({
      volumes: s.volumes.map((v) => (v.id === volumeId ? volume : v)),
      volumeItems: { ...s.volumeItems, [volumeId]: items },
      activeVolume: s.activeVolume?.id === volumeId ? volume : s.activeVolume,
    }));
  },

  // ── 拆卷 ──
  decomposeVolume: async (volumeId) => {
    const count = await decomposeVolumeApi(volumeId);
    set((s) => {
      const { [volumeId]: _omit, ...rest } = s.volumeItems;
      return {
        volumes: s.volumes.filter((v) => v.id !== volumeId),
        volumeItems: rest,
        activeVolume: s.activeVolume?.id === volumeId ? null : s.activeVolume,
      };
    });
    return count;
  },

  // ── 拆分 / 合并 / 转卷 ──
  splitVolume: async (volumeId, recordIds, title) => {
    const { volume, sourceDestroyed, sourceRemaining } = await splitVolumeApi(volumeId, recordIds, title);
    const newItems = await fetchVolumeItems(volume.id);
    set((s) => {
      const nextItems: Record<string, VolumeItem[]> = { ...s.volumeItems, [volume.id]: newItems };
      let volumes: Volume[];
      if (sourceDestroyed) {
        delete nextItems[volumeId];
        volumes = s.volumes.filter((v) => v.id !== volumeId);
      } else {
        volumes = s.volumes.map((v) => (v.id === volumeId ? { ...v, totalItems: sourceRemaining } : v));
      }
      return {
        volumes: [...volumes, volume],
        volumeItems: nextItems,
        activeVolume: s.activeVolume?.id === volumeId && sourceDestroyed ? null : s.activeVolume,
      };
    });
    if (!sourceDestroyed) await get().loadVolumeItems(volumeId);
    return volume;
  },

  mergeVolumes: async (sourceVolumeIds, targetVolumeId) => {
    const result = await mergeVolumesApi(sourceVolumeIds, targetVolumeId);
    const targetItems = await fetchVolumeItems(targetVolumeId);
    set((s) => {
      const srcSet = new Set(sourceVolumeIds);
      const nextItems: Record<string, VolumeItem[]> = { ...s.volumeItems, [targetVolumeId]: targetItems };
      for (const sid of sourceVolumeIds) delete nextItems[sid];
      return {
        volumes: s.volumes
          .filter((v) => !srcSet.has(v.id))
          .map((v) => (v.id === targetVolumeId ? result.volume : v)),
        volumeItems: nextItems,
        activeVolume: s.activeVolume && srcSet.has(s.activeVolume.id)
          ? null
          : s.activeVolume?.id === targetVolumeId ? result.volume : s.activeVolume,
      };
    });
    return result;
  },

  moveItemsToVolume: async (volumeId, recordIds, targetVolumeId) => {
    const { moved, sourceDestroyed, sourceRemaining } = await moveItemsApi(volumeId, recordIds, targetVolumeId);
    const targetItems = await fetchVolumeItems(targetVolumeId);
    set((s) => {
      const nextItems: Record<string, VolumeItem[]> = { ...s.volumeItems, [targetVolumeId]: targetItems };
      let volumes = s.volumes.map((v) => (v.id === targetVolumeId ? { ...v, totalItems: targetItems.length } : v));
      if (sourceDestroyed) {
        delete nextItems[volumeId];
        volumes = volumes.filter((v) => v.id !== volumeId);
      }
      return {
        volumes,
        volumeItems: nextItems,
        activeVolume: s.activeVolume?.id === volumeId && sourceDestroyed ? null : s.activeVolume,
      };
    });
    if (!sourceDestroyed) {
      await get().loadVolumeItems(volumeId);
      set((s) => ({
        volumes: s.volumes.map((v) => (v.id === volumeId ? { ...v, totalItems: sourceRemaining } : v)),
      }));
    }
    return { moved, sourceDestroyed };
  },

  // ── 移交至档案保管（服务端自动找/建盒归位） ──
  transferVolume: async (volumeId) => {
    const volume = await transferVolumeApi(volumeId);
    const itemCount = get().volumeItems[volumeId]?.length ?? volume.totalItems;
    set((s) => ({
      volumes: s.volumes.map((v) => (v.id === volumeId ? volume : v)),
      activeVolume: s.activeVolume?.id === volumeId ? volume : s.activeVolume,
      transferLog: [...s.transferLog, {
        id: `tl-${Date.now()}`,
        transferNo: `TJ-${new Date().getFullYear()}-${String(s.transferLog.length + 1).padStart(3, '0')}`,
        fromDept: '财务部',
        toDept: '档案部',
        fromPerson: '当前用户',
        toPerson: '',
        volumeIds: [volumeId],
        totalVolumes: 1,
        totalItems: itemCount,
        transferDate: todayISO(),
        status: 'transferred',
      }],
    }));
  },

  // ── 退回至组卷工作台 ──
  returnVolumes: async (volumeIds) => {
    const updated: Volume[] = [];
    for (const vid of volumeIds) {
      updated.push(await returnVolumeApi(vid));
    }
    set((s) => ({
      volumes: s.volumes.map((v) => updated.find((u) => u.id === v.id) || v),
      transferLog: [...s.transferLog, {
        id: `tl-return-${Date.now()}`,
        transferNo: `TH-${new Date().getFullYear()}-${String(s.transferLog.length + 1).padStart(3, '0')}`,
        fromDept: '档案部',
        toDept: '财务部',
        fromPerson: '当前用户',
        toPerson: '',
        volumeIds,
        totalVolumes: volumeIds.length,
        totalItems: 0,
        transferDate: todayISO(),
        status: 'transferred',
      }],
    }));
  },

  // ── 智能组卷（从 volumeGroupingStore 读取 perTypeRules 按类别执行；纯前端） ──
  generateRecommendations: (unassignedRecords) => {
    if (unassignedRecords.length === 0) {
      set({ recommendations: [] });
      return;
    }

    const cfg = useVolumeGroupingStore.getState().config;

    /**
     * 辅助：根据 period 生成分组 key
     *   month → "2026-06"
     *   quarter → "2026-Q2"
     *   halfYear → "2026-H1"
     *   year → "2026"
     */
    const periodKey = (r: ArchiveRecord, period: GroupPeriod): string => {
      const m = parseInt(r.month) || 1;
      switch (period) {
        case 'month': return `${r.year}-${String(r.month).padStart(2, '0')}`;
        case 'quarter': return `${r.year}-Q${Math.ceil(m / 3)}`;
        case 'halfYear': return `${r.year}-H${m <= 6 ? 1 : 2}`;
        case 'year': return r.year;
      }
    };

    const periodLabel = (key: string, period: GroupPeriod): string => {
      switch (period) {
        case 'month': {
          const [y, mo] = key.split('-');
          return `${y}年${parseInt(mo)}月`;
        }
        case 'quarter': return key.replace('-Q', '年第') + '季度';
        case 'halfYear': return key.replace('-H', '年') + (key.endsWith('1') ? '上半年' : '下半年');
        case 'year': return `${key}年`;
      }
    };

    const recs: VolumeRecommendation[] = [];
    let recId = 0;

    // ★★★ 凭证+原始凭证＝【一件】单元化（2026-08-19 智能组卷修正） ★★★
    // 会计归档规范（《会计基础工作规范》）：
    //   1 张记账凭证 + 其全部原始凭证（附件）＝ 1 个独立业务单元；
    //   诸多【件】按记账凭证编号顺序排列成【一卷】。
    // 因此组卷的最小核算单元由「单张记账凭证」提升为「记账凭证 + 其全部原始凭证」。

    // ① 富元数据原始凭证附件：sourceDocumentStore 中 parentRecordId 指向的源凭证
    const sourceDocsByParent = new Map<string, SourceDocument[]>();
    for (const sd of useSourceDocumentStore.getState().documents) {
      if (!sd.parentRecordId) continue;
      if (!sourceDocsByParent.has(sd.parentRecordId)) sourceDocsByParent.set(sd.parentRecordId, []);
      sourceDocsByParent.get(sd.parentRecordId)!.push(sd);
    }

    // ② 待组卷池内 id 集合（判断独立『原始凭证』记录的属主是否在本池内）
    const poolIds = new Set(unassignedRecords.map((r) => r.id));

    // ③ 独立『原始凭证』记录（archiveType=原始凭证 且属主父件在本池内）→ 随父件整体归卷
    const orphanSourceByParent = new Map<string, ArchiveRecord[]>();
    for (const r of unassignedRecords) {
      if (r.archiveType !== '原始凭证') continue;
      const pid = r.parentRecordId;
      if (pid && pid !== r.id && poolIds.has(pid)) {
        if (!orphanSourceByParent.has(pid)) orphanSourceByParent.set(pid, []);
        orphanSourceByParent.get(pid)!.push(r);
      }
    }

    // 单件页数估算（缺省：记账凭证 2 页，与历史口径一致；有 components 则按件计）
    const recordPages = (r: ArchiveRecord): number => {
      const c = r.components || [];
      if (c.length > 0) return c.length;
      return 2;
    };
    // 原始凭证附件页数估算（缺省 1 页，有附件张数则按附件张数计）
    const sourceDocPages = (sd: SourceDocument): number => Math.max(1, sd.attachmentCount || 1);

    /**
     * 按“凭证+其全部原始凭证”口径统计一组记录的完整单元：
     *   recordIds  → 需随卷移动的全部记录 id（凭证 + 池内独立原始凭证；
     *                富元数据附件是凭证节点的子节点，随父节点自动移动，无需列入）
     *   items      → 预估件数 = 凭证数 + 池内原始凭证数 + 富元数据附件数
     *   pages      → 预估页数 = 全部单件页数之和
     */
    const unitStats = (chunk: ArchiveRecord[]): { recordIds: string[]; items: number; pages: number } => {
      const recordIds: string[] = [];
      let items = 0;
      let pages = 0;
      for (const r of chunk) {
        recordIds.push(r.id);
        items += 1;
        pages += recordPages(r);
        // 池内独立原始凭证（随父件整体归卷）
        for (const od of orphanSourceByParent.get(r.id) || []) {
          recordIds.push(od.id);
          items += 1;
          pages += recordPages(od);
        }
        // 富元数据原始凭证附件（随父节点移动，不列入 recordIds）
        for (const sd of sourceDocsByParent.get(r.id) || []) {
          items += 1;
          pages += sourceDocPages(sd);
        }
      }
      return { recordIds, items, pages };
    };

    // ★ Step 1: 按档案类别分桶
    const typeBuckets = new Map<string, ArchiveRecord[]>();
    for (const r of unassignedRecords) {
      // ★ 原始凭证铁律：属主在池内的独立原始凭证随父件整体归卷，禁止单独分桶/单独成卷
      if (r.archiveType === '原始凭证' && r.parentRecordId && r.parentRecordId !== r.id && poolIds.has(r.parentRecordId)) {
        continue;
      }
      const type = r.archiveType || '其他会计资料';
      if (!typeBuckets.has(type)) typeBuckets.set(type, []);
      typeBuckets.get(type)!.push(r);
    }

    // ★ Step 2: 对每个类别，读取 perTypeRules 进行分组
    for (const [archiveType, typeRecords] of typeBuckets) {
      const rule = cfg.perTypeRules[archiveType] || DEFAULT_PER_TYPE_RULES['其他会计资料'];
      // P1-⑥ carrierMode 真生效：纯电子模式无盒厚度约束，上限放宽
      const baseMax = rule.maxItemsPerVolume || 50;
      const maxItems = cfg.carrierMode === 'electronic' ? Math.max(baseMax, 200) : baseMax;

      // 2a. 按 period 分组
      const periodGroups = new Map<string, ArchiveRecord[]>();
      for (const r of typeRecords) {
        const key = periodKey(r, rule.period);
        if (!periodGroups.has(key)) periodGroups.set(key, []);
        periodGroups.get(key)!.push(r);
      }

      // 2b. 在 period 组内，先按业务规则子类型分离，再按全局维度细分
      const sortedPeriodKeys = Array.from(periodGroups.keys()).sort();
      for (const pk of sortedPeriodKeys) {
        const periodRecords = periodGroups.get(pk)!;

        const subGroups = new Map<string, ArchiveRecord[]>();
        for (const r of periodRecords) {
          const parts: string[] = [];

          // ★ 账簿类：按子类型独立组卷（总账/明细账/日记账/辅助账簿各独立）
          if (rule.separateByBookType) {
            const bookType = inferBookSubType(r);
            if (bookType) parts.push(bookType);
          }
          // ★ 报告类：年度报告(永久)与中期报告(10年)分开组卷
          if (rule.separateAnnualFromInterim) {
            parts.push(r.retention === '永久' ? '年度报告' : '中期报告');
          }
          // ★ 其他类：按子类别分别组卷
          if (rule.separateBySubCategory) {
            parts.push(r.archiveType);
          }

          if (cfg.groupByYear) parts.push(r.year);
          if (cfg.groupByRetention && !rule.separateAnnualFromInterim) parts.push(r.retention);
          if (cfg.groupByDepartment) parts.push(r.department || '—');
          const gk = parts.join('|') || '默认';
          if (!subGroups.has(gk)) subGroups.set(gk, []);
          subGroups.get(gk)!.push(r);
        }

        for (const [, groupRecords] of subGroups) {
          // 按配置的 sortField 排序（P1-⑥ 配置真生效）
          const sorted = [...groupRecords].sort((a, b) => {
            switch (cfg.sortField) {
              case 'amount':
                return (b.amount || 0) - (a.amount || 0);
              case 'month': {
                const ma = parseInt(a.month) || 0;
                const mb = parseInt(b.month) || 0;
                if (ma !== mb) return ma - mb;
                return a.voucherNo.localeCompare(b.voucherNo, 'zh-CN');
              }
              case 'voucherNo':
              default: {
                const pa = parseVoucherNo(a.voucherNo);
                const pb = parseVoucherNo(b.voucherNo);
                if (!pa || !pb) return a.voucherNo.localeCompare(b.voucherNo);
                if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
                return pa.number - pb.number;
              }
            }
          });

          const periodLabelStr = periodLabel(pk, rule.period);

          // ★ 凭证类按连续号段检测，非凭证类直接按上限拆分
          const isVoucher = archiveType === '记账凭证' || archiveType === '会计凭证';
          if (isVoucher) {
            const segments = detectContinuousSegments(sorted);
            for (const segment of segments) {
              const segRecords = segment.records as ArchiveRecord[];
              for (let i = 0; i < segRecords.length; i += maxItems) {
                const chunk = segRecords.slice(i, i + maxItems);
                const first = chunk[0];
                const last = chunk[chunk.length - 1];
                const chunkVoucherNos = chunk.map(r => r.voucherNo);
                const continuity = validateVoucherContinuity(chunkVoucherNos);
                const voucherRange = continuity.range || `${first.voucherNo}~${last.voucherNo}`;
                const stats = unitStats(chunk);

                recs.push({
                  id: `rec-${++recId}`,
                  title: `${periodLabelStr}${archiveType}（${voucherRange}）`,
                  year: parseInt(first.year),
                  archiveTypeCode: inferTypeCode(first.archiveType),
                  archiveType: first.archiveType,
                  retentionCode: inferRetentionCode(first.retention),
                  retention: first.retention,
                  estimatedItems: stats.items,
                  estimatedPages: stats.pages,
                  dateFrom: `${first.year}-${String(first.month).padStart(2, '0')}`,
                  dateTo: `${last.year}-${String(last.month).padStart(2, '0')}`,
                  recordIds: stats.recordIds,
                });
              }
            }
          } else {
            // 非凭证类：直接按上限拆分
            for (let i = 0; i < sorted.length; i += maxItems) {
              const chunk = sorted.slice(i, i + maxItems);
              const first = chunk[0];
              const last = chunk[chunk.length - 1];
              const stats = unitStats(chunk);

              recs.push({
                id: `rec-${++recId}`,
                title: `${periodLabelStr}${archiveType}`,
                year: parseInt(first.year),
                archiveTypeCode: inferTypeCode(first.archiveType),
                archiveType: first.archiveType,
                retentionCode: inferRetentionCode(first.retention),
                retention: first.retention,
                estimatedItems: stats.items,
                estimatedPages: stats.pages,
                dateFrom: `${first.year}-${String(first.month).padStart(2, '0')}`,
                dateTo: `${last.year}-${String(last.month).padStart(2, '0')}`,
                recordIds: stats.recordIds,
              });
            }
          }
        }
      }
    }

    set({ recommendations: recs });
  },

  acceptRecommendation: async (recIndex) => {
    const recs = get().recommendations;
    if (recIndex < 0 || recIndex >= recs.length) return null;
    const rec = recs[recIndex];

    // 建卷（携带类别/期限属性，归档归类依赖）
    const volume = await get().createVolume({
      title: rec.title,
      year: rec.year,
      archiveType: rec.archiveType || '',
      archiveTypeCode: rec.archiveTypeCode,
      retention: rec.retention || '',
      retentionCode: rec.retentionCode,
      dateFrom: rec.dateFrom,
      dateTo: rec.dateTo,
    });

    // 加件入卷
    await get().addItemsToVolume(volume.id, rec.recordIds);

    // ★ 移除已接受的推荐
    set({ recommendations: get().recommendations.filter((_, i) => i !== recIndex) });

    return volume.id;
  },

  acceptAllRecommendations: async () => {
    const recs = get().recommendations;
    const ids: string[] = [];
    for (const rec of recs) {
      const volume = await get().createVolume({
        title: rec.title,
        year: rec.year,
        archiveType: rec.archiveType || '',
        archiveTypeCode: rec.archiveTypeCode,
        retention: rec.retention || '',
        retentionCode: rec.retentionCode,
        dateFrom: rec.dateFrom,
        dateTo: rec.dateTo,
      });
      await get().addItemsToVolume(volume.id, rec.recordIds);
      ids.push(volume.id);
    }
    // 全部接受后清空推荐
    set({ recommendations: [] });
    return ids;
  },
}));





