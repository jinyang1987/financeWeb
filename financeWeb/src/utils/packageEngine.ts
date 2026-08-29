/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * packageEngine — 封装规则引擎
 *
 * 依据：DA/T 94-2022《电子会计档案管理规范》封装单元规则
 *
 * 封装粒度：
 *   凭证类 → 每案卷 = 一个封装包
 *   账簿类 → 每种独立账簿 = 一个封装包
 *   报告类 → 年度报告单独封装；中期报告按年度合并
 *   其他类 → 同年度+同类别+同保管期限 = 一个封装包
 */

import type { ArchiveRecord } from '../types';
import type { Volume } from '../types/volume';
import type { PackageUnit, PackageUnitType, PreCheckResult } from '../types/package';

// ── 类别代码映射 ──
const ARCHIVE_TYPE_CODE_MAP: Record<string, { code: string; type: PackageUnitType }> = {
  '记账凭证':   { code: '01', type: 'voucher' },
  '会计账簿':   { code: '02', type: 'ledger' },
  '财务报告':   { code: '03', type: 'report' },
  '财务报表':   { code: '03', type: 'report' },
  '其他会计资料': { code: '04', type: 'other' },
};

// ── 保管期限代码映射 ──
function getRetentionCode(retention: string): string {
  if (retention === '永久') return 'Y';
  if (retention === '30年') return 'D30';
  if (retention === '10年') return 'D10';
  return retention;
}

// ── 工具 ──

/** 从 ArchiveRecord 估算字节大小（mock：每条记录模拟） */
function estimateRecordSize(r: ArchiveRecord): number {
  let bytes = 2048; // 元数据 XML 约 2KB
  bytes += (r.components || []).reduce((sum, c) => sum + parseSizeToBytes(c.size || '0 KB'), 0);
  // 原始凭证附件
  bytes += (r.sourceDocumentIds?.length || 0) * 1024 * 500; // 每附件约 500KB
  return bytes;
}

function parseSizeToBytes(s: string): number {
  const num = parseFloat(s);
  if (s.toUpperCase().includes('MB')) return num * 1024 * 1024;
  if (s.toUpperCase().includes('KB')) return num * 1024;
  return num || 0;
}

function formatBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

function makeUnitId(type: PackageUnitType, key: string): string {
  return `unit-${type}-${key.replace(/[^a-zA-Z0-9一-龥]/g, '-').replace(/-+/g, '-').slice(0, 60)}`;
}

// ── 档号排序 ──
function sortByArchiveCode(a: ArchiveRecord, b: ArchiveRecord): number {
  return a.archiveCode.localeCompare(b.archiveCode);
}

// ═══════════════════════════════════════════════════════════
// 核心：分组引擎
// ═══════════════════════════════════════════════════════════

export function groupIntoPackageUnits(
  records: ArchiveRecord[],
  volumes: Volume[],
): PackageUnit[] {
  const grouped = records.filter(r => r.status === '已组卷');
  if (grouped.length === 0) return [];

  const units: PackageUnit[] = [];
  const volumeMap = new Map(volumes.map(v => [v.id, v]));

  // ── 1. 凭证类：按案卷分组 ──
  const vouchers = grouped.filter(r => r.archiveType === '记账凭证');
  const voucherByVolume = new Map<string, ArchiveRecord[]>();
  for (const r of vouchers) {
    const key = r.volumeId || r.volumeCode || `unassigned-${r.id}`;
    if (!voucherByVolume.has(key)) voucherByVolume.set(key, []);
    voucherByVolume.get(key)!.push(r);
  }
  for (const [key, recs] of voucherByVolume) {
    const vol = volumeMap.get(key);
    const volCode = vol?.volumeCode || recs[0].volumeCode || key;
    const sorted = recs.sort(sortByArchiveCode);
    const totalBytes = sorted.reduce((s, r) => s + estimateRecordSize(r), 0);
    const typeInfo = ARCHIVE_TYPE_CODE_MAP['记账凭证']!;
    units.push({
      id: makeUnitId('voucher', key),
      type: 'voucher',
      label: `记账凭证 · ${volCode}`,
      archiveType: '记账凭证',
      year: sorted[0].year,
      retention: sorted[0].retention || '30年',
      volumeId: key,
      volumeCode: volCode,
      fondsCode: 'Z001',
      archiveTypeCode: typeInfo.code,
      retentionCode: getRetentionCode(sorted[0].retention || '30年'),
      records: sorted,
      recordCount: sorted.length,
      totalSize: formatBytes(totalBytes),
      startArchiveCode: sorted[0].archiveCode,
      endArchiveCode: sorted[sorted.length - 1].archiveCode,
      preCheck: { passed: true, errors: [], warnings: [] },
    });
  }

  // ── 2. 账簿类：每种独立账簿一个包 ──
  const ledgers = grouped.filter(r => r.archiveType === '会计账簿');
  const ledgerByType = new Map<string, ArchiveRecord[]>();
  for (const r of ledgers) {
    // 按凭证号前缀推断账簿类型（如 账-007 → 按序号段归类）
    const prefix = r.voucherNo.replace(/[-\d]+$/, '') || r.voucherNo;
    const key = `${prefix}-${r.year}`;
    if (!ledgerByType.has(key)) ledgerByType.set(key, []);
    ledgerByType.get(key)!.push(r);
  }
  for (const [key, recs] of ledgerByType) {
    const sorted = recs.sort(sortByArchiveCode);
    const totalBytes = sorted.reduce((s, r) => s + estimateRecordSize(r), 0);
    const typeInfo = ARCHIVE_TYPE_CODE_MAP['会计账簿']!;
    units.push({
      id: makeUnitId('ledger', key),
      type: 'ledger',
      label: `会计账簿 · ${sorted[0].voucherNo} 等`,
      archiveType: '会计账簿',
      year: sorted[0].year,
      retention: sorted[0].retention || '30年',
      volumeId: sorted[0].volumeId,
      volumeCode: sorted[0].volumeCode,
      fondsCode: 'Z001',
      archiveTypeCode: typeInfo.code,
      retentionCode: getRetentionCode(sorted[0].retention || '30年'),
      records: sorted,
      recordCount: sorted.length,
      totalSize: formatBytes(totalBytes),
      startArchiveCode: sorted[0].archiveCode,
      endArchiveCode: sorted[sorted.length - 1].archiveCode,
      preCheck: { passed: true, errors: [], warnings: [] },
    });
  }

  // ── 3. 报告类：按年度 + 类型分组（年报单独，中期可合并） ──
  const reports = grouped.filter(r => r.archiveType === '财务报告' || r.archiveType === '财务报表');
  const reportByKey = new Map<string, ArchiveRecord[]>();
  for (const r of reports) {
    const key = `${r.archiveType}-${r.year}`;
    if (!reportByKey.has(key)) reportByKey.set(key, []);
    reportByKey.get(key)!.push(r);
  }
  for (const [key, recs] of reportByKey) {
    const sorted = recs.sort(sortByArchiveCode);
    const totalBytes = sorted.reduce((s, r) => s + estimateRecordSize(r), 0);
    const typeInfo = ARCHIVE_TYPE_CODE_MAP[sorted[0].archiveType] || { code: '03', type: 'report' as const };
    units.push({
      id: makeUnitId('report', key),
      type: 'report',
      label: `${sorted[0].archiveType} · ${sorted[0].year}年`,
      archiveType: sorted[0].archiveType,
      year: sorted[0].year,
      retention: sorted[0].retention || '永久',
      fondsCode: 'Z001',
      archiveTypeCode: typeInfo.code,
      retentionCode: getRetentionCode(sorted[0].retention || '永久'),
      records: sorted,
      recordCount: sorted.length,
      totalSize: formatBytes(totalBytes),
      startArchiveCode: sorted[0].archiveCode,
      endArchiveCode: sorted[sorted.length - 1].archiveCode,
      preCheck: { passed: true, errors: [], warnings: [] },
    });
  }

  // ── 4. 其他类：同年度+同类别+同保管期限 = 一个包 ──
  const others = grouped.filter(r => {
    const t = r.archiveType;
    return t !== '记账凭证' && t !== '会计账簿' && t !== '财务报告' && t !== '财务报表';
  });
  const otherByKey = new Map<string, ArchiveRecord[]>();
  for (const r of others) {
    const key = `${r.archiveType}-${r.year}-${r.retention}`;
    if (!otherByKey.has(key)) otherByKey.set(key, []);
    otherByKey.get(key)!.push(r);
  }
  for (const [key, recs] of otherByKey) {
    const sorted = recs.sort(sortByArchiveCode);
    const totalBytes = sorted.reduce((s, r) => s + estimateRecordSize(r), 0);
    const typeInfo = ARCHIVE_TYPE_CODE_MAP[sorted[0].archiveType] || { code: '04', type: 'other' as const };
    units.push({
      id: makeUnitId('other', key),
      type: 'other',
      label: `${sorted[0].archiveType} · ${sorted[0].year}年 · ${sorted[0].retention}`,
      archiveType: sorted[0].archiveType,
      year: sorted[0].year,
      retention: sorted[0].retention || '30年',
      fondsCode: 'Z001',
      archiveTypeCode: typeInfo.code,
      retentionCode: getRetentionCode(sorted[0].retention || '30年'),
      records: sorted,
      recordCount: sorted.length,
      totalSize: formatBytes(totalBytes),
      startArchiveCode: sorted[0].archiveCode,
      endArchiveCode: sorted[sorted.length - 1].archiveCode,
      preCheck: { passed: true, errors: [], warnings: [] },
    });
  }

  return units;
}

// ═══════════════════════════════════════════════════════════
// 封装前校验
// ═══════════════════════════════════════════════════════════

export function runPreCheck(unit: PackageUnit): PreCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const recs = unit.records;

  if (recs.length === 0) {
    errors.push('封装单元内无有效记录');
    return { passed: false, errors, warnings };
  }

  // 1. 跨年度检测
  const years = new Set(recs.map(r => r.year));
  if (years.size > 1) {
    errors.push(`存在跨年度混装：${[...years].join('、')}`);
  }

  // 2. 跨类别检测（同一封装单元内不应混装不同 archiveType）
  const types = new Set(recs.map(r => r.archiveType));
  if (types.size > 1) {
    errors.push(`存在跨类别混装：${[...types].join('、')}`);
  }

  // 3. 跨保管期限检测（不同保管期限不得混入同一包）
  const retentions = new Set(recs.map(r => r.retention));
  if (retentions.size > 1) {
    errors.push(`存在跨保管期限混装：${[...retentions].join('、')}`);
  }

  // 4. 元数据必填项检测
  for (const r of recs) {
    if (!r.archiveCode || r.archiveCode.includes('0000')) {
      warnings.push(`${r.voucherNo}: 档号异常 (${r.archiveCode})`);
    }
    if (!r.department) warnings.push(`${r.voucherNo}: 缺少责任部门`);
  }

  // 5. 四性检测状态检测
  const uncheckedCount = recs.filter(r =>
    !r.checks.real || !r.checks.complete || !r.checks.usable || !r.checks.safe
  ).length;
  if (uncheckedCount > 0) {
    warnings.push(`${uncheckedCount} 条记录四性检测未完全通过`);
  }

  // 6. 文件格式检测（归档版式应为 OFD 或 PDF）
  for (const r of recs) {
    for (const c of (r.components || [])) {
      const fmt = c.contentType?.toLowerCase() || '';
      if (fmt === 'doc' || fmt === 'docx' || fmt === 'xls' || fmt === 'xlsx') {
        warnings.push(`${r.voucherNo}: 文件格式 ${c.contentType} 非归档版式，建议转为 OFD/PDF-A`);
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════
// 封装包命名
// ═══════════════════════════════════════════════════════════

/** 生成封装包文件名（命名规则：全宗号-门类代码·类别号·年度-案卷号） */
export function generatePackageName(unit: PackageUnit): string {
  const parts: string[] = [];
  parts.push(unit.fondsCode || 'Z001');
  parts.push(`KU·${unit.archiveTypeCode}·${unit.year}`);
  // 凭证类：包装案卷号；账簿/报告/其他：包装类型描述
  if (unit.volumeCode) {
    parts.push(unit.volumeCode.replace(/^Z001-/, '').replace(/^KU·\d+·\d+-/, ''));
  } else {
    parts.push(`${unit.retentionCode}-${unit.archiveType.slice(0, 2)}`);
  }
  return parts.join('-');
}

// ═══════════════════════════════════════════════════════════
// SHA-256 摘要（2026-08-29 T3：真实现——WebCrypto，替代原位移假哈希）
// ═══════════════════════════════════════════════════════════

/**
 * 计算文本的 SHA-256（64 位小写 hex，与后端 HashUtil.sha256Hex 同口径）。
 * 浏览器 WebCrypto 异步 API；调用方必须 await。
 * 注意：这是对「传入内容」的真实摘要——封装包内文件本体哈希以后端固化登记
 * （ams_record_fixity）为准，前端摘要不构成文件级防篡改证据。
 */
export async function computeChecksum(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
