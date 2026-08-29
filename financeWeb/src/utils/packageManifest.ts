/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * packageManifest — 封装说明 XML 生成器
 *
 * 依据：
 *   DA/T 48-2009《基于 XML 的电子文件封装规范》
 *   DA/T 94-2022《电子会计档案管理规范》
 */

import type { PackageUnit } from '../types/package';
import { computeChecksum } from './packageEngine';

interface ManifestInput {
  packageName: string;
  unit: PackageUnit;
  createdBy: string;
  createdAt: string;
  seq: number;
}

/** 生成 DA/T 48 兼容的封装包说明 XML（2026-08-29 T3：文件清单摘要为真实 SHA-256，异步） */
export async function generateManifestXML(input: ManifestInput): Promise<string> {
  const { packageName, unit, createdBy, createdAt, seq } = input;

  const escapeXml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const files = unit.records.map((r, i) => {
    const comps = (r.components || []).map(c =>
      `      <component name="${escapeXml(c.name)}" type="${escapeXml(c.type)}" size="${escapeXml(c.size)}" contentType="${escapeXml(c.contentType || 'unknown')}" hash="${escapeXml(c.hash || '')}" />`
    ).join('\n');
    return `    <file index="${i + 1}">
      <archiveCode>${escapeXml(r.archiveCode)}</archiveCode>
      <voucherNo>${escapeXml(r.voucherNo)}</voucherNo>
      <archiveType>${escapeXml(r.archiveType)}</archiveType>
      <year>${escapeXml(r.year)}</year>
      <month>${escapeXml(r.month || '')}</month>
      <retention>${escapeXml(r.retention || '')}</retention>
      <department>${escapeXml(r.department)}</department>
      <amount>${r.amount}</amount>
      <checks real="${r.checks.real}" complete="${r.checks.complete}" usable="${r.checks.usable}" safe="${r.checks.safe}" />
      <sourceDocumentCount>${r.sourceDocumentIds?.length || 0}</sourceDocumentCount>
${comps}
    </file>`;
  }).join('\n');

  // 文件清单本体摘要（真实 SHA-256；文件级哈希以后端固化登记 ams_record_fixity 为准）
  const fileListDigest = await computeChecksum(files);

  // 统计四性检测状态
  const allChecksPassed = unit.records.every(r =>
    r.checks.real && r.checks.complete && r.checks.usable && r.checks.safe
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="urn:chinagov:ns:archives:eep/1.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         packageId="${escapeXml(packageName)}"
         packageSeq="${seq}"
         createdDate="${escapeXml(createdAt.slice(0, 10))}">
  <!-- ═══ 封装包基本信息（DA/T 48-2009 第5章） ═══ -->
  <packageInfo>
    <packageId>${escapeXml(packageName)}</packageId>
    <packageType>会计档案归档信息包</packageType>
    <containerFormat>ZIP</containerFormat>
    <encoding>UTF-8</encoding>
    <createdBy>${escapeXml(createdBy)}</createdBy>
    <createdAt>${escapeXml(createdAt)}</createdAt>
    <toolName>会计电子档案系统</toolName>
    <toolVersion>1.0</toolVersion>
    <standard>DA/T 48-2009; DA/T 94-2022</standard>
  </packageInfo>

  <!-- ═══ 归档档案范围（DA/T 94-2022 附录A） ═══ -->
  <archiveScope>
    <fondsCode>${escapeXml(unit.fondsCode)}</fondsCode>
    <archiveTypeCode>${escapeXml(unit.archiveTypeCode)}</archiveTypeCode>
    <archiveType>${escapeXml(unit.archiveType)}</archiveType>
    <year>${escapeXml(unit.year)}</year>
    <retention>${escapeXml(unit.retention)}</retention>
    <retentionCode>${escapeXml(unit.retentionCode)}</retentionCode>
    <fileCount>${unit.recordCount}</fileCount>
    <estimatedSize>${escapeXml(unit.totalSize)}</estimatedSize>
    <startArchiveCode>${escapeXml(unit.startArchiveCode)}</startArchiveCode>
    <endArchiveCode>${escapeXml(unit.endArchiveCode)}</endArchiveCode>
    ${unit.volumeCode ? `<volumeCode>${escapeXml(unit.volumeCode)}</volumeCode>` : ''}
    ${unit.volumeId ? `<volumeId>${escapeXml(unit.volumeId)}</volumeId>` : ''}
  </archiveScope>

  <!-- ═══ 四性检测结果（DA/T 70） ═══ -->
  <qualityCheck>
    <allPassed>${allChecksPassed}</allPassed>
    <fourProperties>
      <property name="真实性" passed="${unit.records.every(r => r.checks.real)}" />
      <property name="完整性" passed="${unit.records.every(r => r.checks.complete)}" />
      <property name="可用性" passed="${unit.records.every(r => r.checks.usable)}" />
      <property name="安全性" passed="${unit.records.every(r => r.checks.safe)}" />
    </fourProperties>
    <preCheckPassed>${unit.preCheck.passed}</preCheckPassed>
    ${unit.preCheck.errors.length > 0 ? `<preCheckErrors>${unit.preCheck.errors.map(e => `\n      <error>${escapeXml(e)}</error>`).join('')}
    </preCheckErrors>` : ''}
  </qualityCheck>

  <!-- ═══ 文件清单 ═══ -->
  <fileList total="${unit.recordCount}">
${files}
  </fileList>

  <!-- ═══ 文件清单摘要（SHA-256，文件清单本体的真实摘要；文件级哈希以后端固化登记为准） ═══ -->
  <packageChecksum algorithm="SHA-256" scope="fileList">
    <digest>${escapeXml(fileListDigest)}</digest>
    <generatedAt>${escapeXml(createdAt)}</generatedAt>
  </packageChecksum>
</package>`;
}
