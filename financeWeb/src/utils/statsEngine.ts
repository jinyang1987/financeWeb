/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * statsEngine — 会计档案统计引擎（纯函数，可单测）
 *
 * 依据《会计档案统计维度与统计内容汇总.md》（79号令 + DA/T 94-2022 + 厂商实践）：
 *   1. 库藏总量统计（家底盘点）：类型/年度/保管期限/全宗/部门/载体
 *   2. 生命周期业务统计（流程管控）：归档/组卷/四性检测/移交/鉴定处置
 *   3. 利用与价值统计：检索/调阅/下载/打印行为、热点档案、部门利用
 *   4. 合规与风险统计：期限合规/数据质量/审计支撑/逾期风险
 *
 * 全部从真实 store 数据计算，禁止任何硬编码统计值。
 */

import type { ArchiveRecord } from '../types';
import type { Volume } from '../types/volume';
import type { ArchiveBox } from '../types/archiveBox';
import type { BorrowLog, BorrowOrder } from '../types/borrow';
import type { SourceDocument } from '../types/sourceDocument';
import type { TransferLogEntry } from '../stores/volumeStore';
import { isOverdue, isBorrowerBlacklisted } from './borrowEngine';

// ──────────────────────────────────────────────
// 共用工具
// ──────────────────────────────────────────────

export const STATS_TYPE_LABELS: Record<string, string> = {
  KP: '会计凭证', KB: '会计账簿', FB: '财务报表', QT: '其他会计资料',
};

const TYPE_OF_RECORD: Record<string, string> = {
  记账凭证: 'KP', 原始凭证: 'KP',
  会计账簿: 'KB',
  财务报表: 'FB', 财务报告: 'FB',
  其他会计资料: 'QT', 其他: 'QT',
};

export function typeCodeOf(r: ArchiveRecord): string {
  return TYPE_OF_RECORD[r.archiveType] || 'QT';
}

/** 解析组件大小字符串（"123KB"/"2.4MB"）为 KB 数 */
export function parseSizeKB(size: string): number {
  const m = size.match(/^([\d.]+)\s*(KB|MB|GB|B)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  if (unit === 'MB') return n * 1024;
  if (unit === 'GB') return n * 1024 * 1024;
  if (unit === 'B') return n / 1024;
  return n;
}

export function formatCapacity(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(2)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

// ──────────────────────────────────────────────
// 1. 库藏总量统计
// ──────────────────────────────────────────────

export interface InventoryStats {
  totals: {
    records: number; volumes: number; boxes: number;
    pages: number; capacityKB: number; sourceDocs: number;
  };
  byType: { code: string; label: string; records: number; volumes: number; pages: number; capacityKB: number }[];
  byYear: { year: string; records: number; volumes: number }[];
  byRetention: { label: string; records: number; pct: number }[];
  byFonds: { code: string; records: number }[];
  byDepartment: { dept: string; records: number }[];
  byCarrier: { key: string; label: string; records: number; pct: number }[];
  /** 电子化率：原生电子（digital-native）记录占比 */
  electronicRatio: number;
}

export function computeInventory(
  records: ArchiveRecord[],
  volumes: Volume[],
  boxes: ArchiveBox[],
  sourceDocuments: SourceDocument[],
): InventoryStats {
  const capacityOf = (list: ArchiveRecord[]) =>
    list.reduce((s, r) => s + r.components.reduce((x, c) => x + parseSizeKB(c.size), 0), 0);

  const byType = ['KP', 'KB', 'FB', 'QT'].map((code) => {
    const recs = records.filter((r) => typeCodeOf(r) === code);
    const vols = volumes.filter((v) => v.archiveTypeCode === code);
    return {
      code,
      label: STATS_TYPE_LABELS[code],
      records: recs.length,
      volumes: vols.length,
      pages: vols.reduce((s, v) => s + (v.totalPages || 0), 0),
      capacityKB: capacityOf(recs),
    };
  });

  const years = [...new Set(records.map((r) => r.year))].sort();
  const byYear = years.map((year) => ({
    year,
    records: records.filter((r) => r.year === year).length,
    volumes: volumes.filter((v) => String(v.year) === year).length,
  }));

  const retentionOrder = ['永久', '30年', '10年'];
  const byRetention = retentionOrder.map((label) => {
    const n = records.filter((r) => r.retention === label).length;
    return { label, records: n, pct: pct(n, records.length) };
  });

  const fondsCodes = [...new Set(records.map((r) => r.archiveCode.split('-')[0]).filter(Boolean))].sort();
  const byFonds = fondsCodes.map((code) => ({
    code,
    records: records.filter((r) => r.archiveCode.startsWith(code + '-')).length,
  }));

  const deptMap = new Map<string, number>();
  records.forEach((r) => deptMap.set(r.department, (deptMap.get(r.department) || 0) + 1));
  const byDepartment = [...deptMap.entries()]
    .map(([dept, n]) => ({ dept, records: n }))
    .sort((a, b) => b.records - a.records);

  const electronic = records.filter((r) => r.carrierType === 'electronic').length;
  const paper = records.filter((r) => r.carrierType === 'paper').length;
  const other = records.length - electronic - paper;
  const byCarrier = [
    { key: 'electronic', label: '电子档案', records: electronic, pct: pct(electronic, records.length) },
    { key: 'paper', label: '纸质档案（含数字化副本）', records: paper, pct: pct(paper, records.length) },
    ...(other > 0 ? [{ key: 'unknown', label: '未标注', records: other, pct: pct(other, records.length) }] : []),
  ];

  const digitalNative = records.filter((r) => r.source === 'digital-native').length;

  return {
    totals: {
      records: records.length,
      volumes: volumes.length,
      boxes: boxes.length,
      pages: volumes.reduce((s, v) => s + (v.totalPages || 0), 0),
      capacityKB: capacityOf(records),
      sourceDocs: sourceDocuments.length,
    },
    byType, byYear, byRetention, byFonds, byDepartment, byCarrier,
    electronicRatio: pct(digitalNative, records.length),
  };
}

// ──────────────────────────────────────────────
// 2. 生命周期业务统计
// ──────────────────────────────────────────────

export interface LifecycleStats {
  /** 待归档（仅件数据，未组卷） */
  pendingArchive: number;
  /** 已归档（已组卷且在已移交卷中） */
  archived: number;
  /** 整理完成率：已组卷记录 / 总记录 */
  organizeCompletionRate: number;
  /** 本月新增归档（numberedDate 属于当月） */
  monthlyNewArchived: number;
  groupedVolumes: number;
  draftVolumes: number;
  confirmedVolumes: number;
  transferredVolumes: number;
  transferBatches: number;
  transferredItems: number;
  /** 四性检测：全过记录占比 + 分性通过率 */
  checksPassRate: number;
  checksByProperty: { key: 'real' | 'complete' | 'usable' | 'safe'; label: string; passRate: number; failCount: number }[];
  /** 异常档案（任一性未过） */
  abnormalRecords: number;
  /** 近 6 个月归档趋势（按 numberedDate） */
  monthlyArchived: { month: string; count: number }[];
  /** 鉴定处置 */
  expiredNotDestroyed: number;
  destroyedVolumes: number;
}

export function computeLifecycle(
  records: ArchiveRecord[],
  volumes: Volume[],
  transferLog: TransferLogEntry[],
  today: string,
): LifecycleStats {
  const transferredVolIds = new Set(volumes.filter((v) => v.status === 'transferred').map((v) => v.id));
  const pendingArchive = records.filter((r) => r.status === '仅件数据').length;
  const archived = records.filter((r) => r.volumeId && transferredVolIds.has(r.volumeId)).length;

  const thisMonth = today.slice(0, 7);
  const monthlyNewArchived = records.filter((r) => r.numbered && (r.numberedDate || '').startsWith(thisMonth)).length;

  const CHECK_PROPS: { key: 'real' | 'complete' | 'usable' | 'safe'; label: string }[] = [
    { key: 'real', label: '真实性' },
    { key: 'complete', label: '完整性' },
    { key: 'usable', label: '可用性' },
    { key: 'safe', label: '安全性' },
  ];
  const checksByProperty = CHECK_PROPS.map(({ key, label }) => {
    const pass = records.filter((r) => r.checks[key]).length;
    return { key, label, passRate: pct(pass, records.length), failCount: records.length - pass };
  });
  const allPass = records.filter((r) => r.checks.real && r.checks.complete && r.checks.usable && r.checks.safe).length;

  // 近 6 个月归档趋势
  const months: string[] = [];
  {
    const [y, m] = today.split('-').map(Number);
    for (let i = 5; i >= 0; i--) {
      const t = new Date(y, m - 1 - i, 1);
      months.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`);
    }
  }
  const monthlyArchived = months.map((month) => ({
    month,
    count: records.filter((r) => (r.numberedDate || '').startsWith(month)).length,
  }));

  // 到期档案（保管期满且未销毁）
  const curYear = Number(today.slice(0, 4));
  const retentionYears = (ret: string) => (ret === '永久' ? Infinity : ret === '30年' ? 30 : ret === '10年' ? 10 : 30);
  const destroyedVolIds = new Set(volumes.filter((v) => v.status === 'destroyed').map((v) => v.id));
  const expiredNotDestroyed = records.filter((r) => {
    if (r.volumeId && destroyedVolIds.has(r.volumeId)) return false;
    return Number(r.year) + retentionYears(r.retention) <= curYear;
  }).length;

  return {
    pendingArchive,
    archived,
    organizeCompletionRate: pct(records.length - pendingArchive, records.length),
    monthlyNewArchived,
    groupedVolumes: volumes.length,
    draftVolumes: volumes.filter((v) => v.status === 'draft').length,
    confirmedVolumes: volumes.filter((v) => v.status === 'confirmed').length,
    transferredVolumes: volumes.filter((v) => v.status === 'transferred').length,
    transferBatches: transferLog.length,
    transferredItems: transferLog.reduce((s, t) => s + t.totalItems, 0),
    checksPassRate: pct(allPass, records.length),
    checksByProperty,
    abnormalRecords: records.length - allPass,
    monthlyArchived,
    expiredNotDestroyed,
    destroyedVolumes: destroyedVolIds.size,
  };
}

// ──────────────────────────────────────────────
// 3. 利用与价值统计
// ──────────────────────────────────────────────

export interface UtilizationStats {
  totals: {
    searches: number; views: number; downloads: number; prints: number;
    cartAdds: number; orders: number;
  };
  /** 热点档案 TOP（按借阅明细件次） */
  topArchives: { title: string; typeCode: string; count: number }[];
  /** 借阅类型热力 */
  byTypeHeat: { code: string; label: string; count: number }[];
  /** 部门利用（申请单数 + 件数） */
  byDeptUsage: { dept: string; orders: number; items: number }[];
  /** 人员利用 TOP */
  topUsers: { name: string; dept: string; orders: number }[];
}

export function computeUtilization(logs: BorrowLog[], orders: BorrowOrder[]): UtilizationStats {
  const countAction = (a: string) => logs.filter((l) => l.action === a).length;

  const itemCount = new Map<string, { title: string; typeCode: string; count: number }>();
  orders.forEach((o) => o.items.forEach((i) => {
    const cur = itemCount.get(i.title) || { title: i.title, typeCode: i.archiveTypeCode, count: 0 };
    cur.count++;
    itemCount.set(i.title, cur);
  }));
  const topArchives = [...itemCount.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  const heatMap = new Map<string, number>();
  orders.forEach((o) => o.items.forEach((i) => heatMap.set(i.archiveTypeCode, (heatMap.get(i.archiveTypeCode) || 0) + 1)));
  const byTypeHeat = ['KP', 'KB', 'FB', 'QT']
    .map((code) => ({ code, label: STATS_TYPE_LABELS[code], count: heatMap.get(code) || 0 }));

  const deptMap = new Map<string, { orders: number; items: number }>();
  orders.forEach((o) => {
    const cur = deptMap.get(o.applicantDept) || { orders: 0, items: 0 };
    cur.orders++;
    cur.items += o.items.length;
    deptMap.set(o.applicantDept, cur);
  });
  const byDeptUsage = [...deptMap.entries()]
    .map(([dept, v]) => ({ dept, ...v }))
    .sort((a, b) => b.orders - a.orders);

  const userMap = new Map<string, { name: string; dept: string; orders: number }>();
  orders.forEach((o) => {
    const cur = userMap.get(o.applicantId) || { name: o.applicantName, dept: o.applicantDept, orders: 0 };
    cur.orders++;
    userMap.set(o.applicantId, cur);
  });
  const topUsers = [...userMap.values()].sort((a, b) => b.orders - a.orders).slice(0, 5);

  return {
    totals: {
      searches: countAction('档案检索'),
      views: countAction('在线查看'),
      downloads: countAction('下载'),
      prints: countAction('打印'),
      cartAdds: countAction('加入借阅车'),
      orders: orders.length,
    },
    topArchives,
    byTypeHeat,
    byDeptUsage,
    topUsers,
  };
}

// ──────────────────────────────────────────────
// 4. 合规与风险统计
// ──────────────────────────────────────────────

export interface ComplianceStats {
  /** 元数据必填项完整率（DA/T 94 核心字段） */
  metadataCompleteRate: number;
  missingByField: { field: string; label: string; missing: number }[];
  /** 电子文件格式合规率（OFD/PDF/XML 白名单） */
  formatComplianceRate: number;
  formatDistribution: { format: string; count: number }[];
  /** 保管期限标注率 */
  retentionLabelRate: number;
  /** 超期未销毁档案（保管期满且卷未销毁） */
  expiredNotDestroyed: number;
  /** 未来 5 年到期预告 */
  upcomingExpiry: { year: number; count: number }[];
  /** 四性检测合格率 */
  checksPassRate: number;
  /** 审计支撑：外部审计/税务稽查类借阅 */
  auditSupport: { orders: number; items: number; downloads: number; prints: number };
  /** 风险：逾期未还卷数 / 黑名单人数 */
  overdueVolumes: number;
  blacklistedUsers: number;
}

const REQUIRED_META: { field: keyof ArchiveRecord; label: string }[] = [
  { field: 'archiveCode', label: '档号' },
  { field: 'voucherNo', label: '凭证号/编号' },
  { field: 'archiveType', label: '档案类型' },
  { field: 'department', label: '责任部门' },
  { field: 'year', label: '会计年度' },
  { field: 'month', label: '会计月份' },
  { field: 'retention', label: '保管期限' },
  { field: 'preparer', label: '制单人' },
];

const COMPLIANT_FORMATS = new Set(['ofd', 'pdf', 'xml']);

export function computeCompliance(
  records: ArchiveRecord[],
  volumes: Volume[],
  orders: BorrowOrder[],
  logs: BorrowLog[],
  today: string,
): ComplianceStats {
  // 元数据缺失
  const missingByField = REQUIRED_META.map(({ field, label }) => ({
    field,
    label,
    missing: records.filter((r) => {
      const v = r[field];
      return v === undefined || v === null || v === '';
    }).length,
  }));
  const completeRecords = records.filter((r) =>
    REQUIRED_META.every(({ field }) => {
      const v = r[field];
      return v !== undefined && v !== null && v !== '';
    }),
  );

  // 格式合规
  const allComponents = records.flatMap((r) => r.components);
  const compliant = allComponents.filter((c) => COMPLIANT_FORMATS.has(c.contentType)).length;
  const fmtMap = new Map<string, number>();
  allComponents.forEach((c) => fmtMap.set(c.contentType, (fmtMap.get(c.contentType) || 0) + 1));
  const formatDistribution = [...fmtMap.entries()]
    .map(([format, count]) => ({ format: format.toUpperCase(), count }))
    .sort((a, b) => b.count - a.count);

  // 保管期限
  const withRetention = records.filter((r) => !!r.retention).length;

  // 到期
  const curYear = Number(today.slice(0, 4));
  const retentionYears = (ret: string) => (ret === '永久' ? Infinity : ret === '30年' ? 30 : ret === '10年' ? 10 : 30);
  const destroyedVolIds = new Set(volumes.filter((v) => v.status === 'destroyed').map((v) => v.id));
  const expiredNotDestroyed = records.filter((r) => {
    if (r.volumeId && destroyedVolIds.has(r.volumeId)) return false;
    return Number(r.year) + retentionYears(r.retention) <= curYear;
  }).length;
  const upcomingExpiry = [0, 1, 2, 3, 4].map((offset) => {
    const year = curYear + offset;
    return {
      year,
      count: records.filter((r) => Number(r.year) + retentionYears(r.retention) === year).length,
    };
  });

  // 四性
  const allPass = records.filter((r) => r.checks.real && r.checks.complete && r.checks.usable && r.checks.safe).length;

  // 审计支撑
  const auditOrders = orders.filter((o) => o.reasonType === '外部审计' || o.reasonType === '税务稽查');
  const auditSupport = {
    orders: auditOrders.length,
    items: auditOrders.reduce((s, o) => s + o.items.length, 0),
    downloads: logs.filter((l) => l.action === '下载').length,
    prints: logs.filter((l) => l.action === '打印').length,
  };

  // 风险
  const overdueVolumes = orders.reduce(
    (n, o) => n + o.fulfillments.filter((f) => isOverdue(f, today)).length, 0,
  );
  const blacklist = new Set<string>();
  orders.forEach((o) => {
    if (isBorrowerBlacklisted(o.applicantId, orders, today)) blacklist.add(o.applicantId);
  });

  return {
    metadataCompleteRate: pct(completeRecords.length, records.length),
    missingByField,
    formatComplianceRate: pct(compliant, allComponents.length),
    formatDistribution,
    retentionLabelRate: pct(withRetention, records.length),
    expiredNotDestroyed,
    upcomingExpiry,
    checksPassRate: pct(allPass, records.length),
    auditSupport,
    overdueVolumes,
    blacklistedUsers: blacklist.size,
  };
}
