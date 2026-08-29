/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 全链路仿真测试数据生成器（2026-07-18）
 *
 * 覆盖 整理→组卷→四性检测→归档→视图查询 全链路的四大类别仿真数据：
 *   KP 会计凭证：2025 全年（纸质实体）+ 2026 1-4月（原生电子）+ 薪酬敏感卷
 *   KB 会计账簿：2025/2026 总账/明细账/日记账/辅助账
 *   FB 财务报表：月度/季度/年度 × 法定对外/内部管理/专项报告
 *   QT 其他会计资料：银行对账单/余额调节表/纳税申报表/移交保管清册
 *
 * 数据一致性保证：records ↔ volumes ↔ volumeItems ↔ boxes 四层引用完整，
 * 由 __tests__/simulationData.test.ts 做引用完整性回归。
 *
 * 全部为确定性生成（无 Math.random），测试可重复。
 */

import type { ArchiveRecord } from '../types';
import type { Volume, VolumeItem } from '../types/volume';
import type { ArchiveBox } from '../types/archiveBox';

// ──────────────────────────────────────────────
// 确定性伪随机（种子哈希，保证测试可重复）
// ──────────────────────────────────────────────
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/** 取 [min, max] 区间整数 */
function pick(seed: string, min: number, max: number): number {
  return min + (hashSeed(seed) % (max - min + 1));
}
/** 从数组中确定性取一项 */
function pickOne<T>(seed: string, arr: T[]): T {
  return arr[hashSeed(seed) % arr.length];
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');
const pad4 = (n: number) => String(n).padStart(4, '0');

// ──────────────────────────────────────────────
// 业务词库
// ──────────────────────────────────────────────

const PREPARERS = ['张伟', '李娜', '周婷', '吴芳'];
const DEPARTMENTS = ['财务部', '采购部', '销售部', '行政部', '生产部'];

const VOUCHER_SUBJECTS: Record<string, { subjects: string[]; summaries: string[]; counterparties: string[] }> = {
  收款凭证: {
    subjects: ['银行存款', '应收账款', '主营业务收入', '其他应收款'],
    summaries: ['收到客户货款', '银行托收承兑汇票到期收款', '收回员工备用金借款', '收到产品销售收入款', '收到房租收入'],
    counterparties: ['华北科技有限公司', '天工智能制造集团', '蓝海贸易（深圳）有限公司', '中科建筑设计院'],
  },
  付款凭证: {
    subjects: ['管理费用', '采购成本', '应付账款', '销售费用', '银行存款'],
    summaries: ['支付办公设备采购款', '支付二季度房租物业费', '支付原材料采购款', '支付差旅费报销', '支付快递物流费用', '支付市场推广服务费'],
    counterparties: ['联创办公设备有限公司', '顺达物流集团', '恒信物业服务中心', '中瑞会计师事务所'],
  },
  转账凭证: {
    subjects: ['应交税费', '累计折旧', '原材料', '库存商品', '生产成本'],
    summaries: ['计提本月固定资产折旧', '结转本月销售成本', '计提企业所得税', '原材料领用转生产成本', '月末损益结转'],
    counterparties: ['—'],
  },
};

const SALARY_SUMMARIES = [
  '发放4月管理人员工资', '发放4月销售人员绩效工资', '高管差旅费报销（总经理）',
  '计提4月社会保险单位部分', '发放季度奖金', '高管公务接待费报销',
  '缴纳4月住房公积金', '发放4月生产人员计件工资',
];

const LEDGER_DEFS: { subType: string; names: string[] }[] = [
  { subType: '总账', names: ['总分类账'] },
  { subType: '明细账', names: ['资产类明细账', '负债及所有者权益明细账', '损益类明细账'] },
  { subType: '日记账', names: ['现金日记账', '银行存款日记账'] },
  { subType: '辅助账簿', names: ['固定资产登记簿'] },
];

const QT_DEFS_2025: { subType: string; names: string[] }[] = [
  { subType: '银行对账单', names: ['基本户银行对账单', '一般户银行对账单'] },
  { subType: '银行存款余额调节表', names: ['银行存款余额调节表'] },
  { subType: '纳税申报表', names: ['增值税纳税申报表及附列资料', '企业所得税季度预缴申报表'] },
  { subType: '会计档案移交清册', names: ['2025年度会计档案移交清册'] },
  { subType: '会计档案保管清册', names: ['2025年度会计档案保管清册'] },
];

// ──────────────────────────────────────────────
// 记录工厂
// ──────────────────────────────────────────────

interface RecordSpec {
  id: string;
  voucherNo: string;
  archiveType: string;
  year: number;
  month: number;
  amount: number;
  summary: string;
  department?: string;
  preparer?: string;
  carrierType: 'paper' | 'electronic';
  extra?: Partial<ArchiveRecord>;
}

function makeRecord(spec: RecordSpec, ctx: { volumeId: string; volumeCode: string; boxId: string; location: string; itemNo: number }): ArchiveRecord {
  const { id, voucherNo, archiveType, year, month, amount, summary } = spec;
  const source = spec.carrierType === 'paper' ? 'digitized' as const : 'digital-native' as const;
  return {
    id,
    archiveCode: `Z001-KU·01·${year}-D30-${ctx.volumeCode.split('-').pop()}-${pad4(ctx.itemNo)}`,
    voucherNo,
    archiveType,
    department: spec.department || '财务部',
    amount,
    year: String(year),
    month: pad2(month),
    retention: '30年',
    status: '已组卷',
    volumeCode: ctx.volumeCode,
    volumeId: ctx.volumeId,
    volumeItemNo: ctx.itemNo,
    boxId: ctx.boxId,
    storageLocation: ctx.location,
    numbered: true,
    numberedDate: `${year}-${pad2(month)}-28`,
    numberRuleId: 'rule-default-paper',
    source,
    carrierType: spec.carrierType,
    managementMode: 'volume-mode',
    checks: { real: true, complete: true, usable: true, safe: true },
    checkDetails: [],
    components: [{
      name: `${voucherNo}-${summary.slice(0, 8)}.${source === 'digitized' ? 'pdf' : 'ofd'}`,
      type: archiveType,
      size: `${pick(id, 120, 980)}KB`,
      contentType: source === 'digitized' ? 'pdf' : 'ofd',
      hash: '', // 2026-08-29 T3：仿真数据不伪造文件哈希（真实固化值由后端登记）
      signatureVerified: false, // 仿真数据不伪造验签结论（验签属 CA 接入，见修复总计划外围项）
      signer: spec.preparer || pickOne(id, PREPARERS),
    }],
    auditLogs: [{
      id: `log-${id}`,
      timestamp: `${year}-${pad2(month)}-28 10:00:00`,
      action: '确认组卷',
      operator: '陈静',
      details: `组卷完成，卷号 ${ctx.volumeCode}`,
      ipAddress: '192.168.1.101',
    }],
    remarks: summary,
    preparer: spec.preparer || pickOne(id, PREPARERS),
    securityLevel: '普通',
    ...spec.extra,
  };
}

// ──────────────────────────────────────────────
// 组装上下文（生成过程中累积）
// ──────────────────────────────────────────────

const records: ArchiveRecord[] = [];
const volumes: Volume[] = [];
const volumeItems: Record<string, VolumeItem[]> = {};
const boxes: ArchiveBox[] = [];

interface VolumeSpec {
  id: string;
  title: string;
  archiveType: string;
  archiveTypeCode: string;
  year: number;
  month?: number;
  carrierType: 'paper' | 'electronic' | 'mixed';
  securityLevel?: string;
  createdDate: string;
}

function addVolume(spec: VolumeSpec, boxId: string, recordSpecs: RecordSpec[]): void {
  const volSeq = volumes.length + 1;
  const volumeCode = `Z001-KU·01·${spec.year}-D30-${pad4(volSeq)}`;
  const box = boxes.find((b) => b.id === boxId);
  const location = box?.location || '柜A-架1-层1';

  const volRecords = recordSpecs.map((rs, i) =>
    makeRecord(rs, { volumeId: spec.id, volumeCode, boxId, location, itemNo: i + 1 }),
  );
  records.push(...volRecords);

  volumeItems[spec.id] = volRecords.map((r, i) => ({
    id: `vi-${spec.id}-${i + 1}`,
    volumeId: spec.id,
    recordId: r.id,
    recordArchiveCode: r.archiveCode,
    itemNo: i + 1,
    pageStart: i * 4 + 1,
    pageEnd: i * 4 + 4,
    title: r.remarks || r.voucherNo,
    date: `${r.year}-${r.month}-28`,
  }));

  volumes.push({
    id: spec.id,
    volumeCode,
    title: spec.title,
    fondsCode: 'Z001',
    archiveType: spec.archiveType,
    archiveTypeCode: spec.archiveTypeCode,
    year: spec.year,
    retention: spec.archiveTypeCode === 'FB' ? '永久' : '30年',
    retentionCode: spec.archiveTypeCode === 'FB' ? 'Y' : 'D30',
    totalItems: volRecords.length,
    totalPages: volRecords.length * 4,
    pageStart: 1,
    pageEnd: volRecords.length * 4,
    volumeCount: 1,
    boxId,
    boxNo: box?.boxNo,
    cabinetNo: location.split('-')[0] || '柜A',
    shelfNo: location.split('-')[1] || '架1',
    dateFrom: `${spec.year}-${pad2(spec.month || 1)}-01`,
    dateTo: `${spec.year}-${pad2(spec.month || 12)}-28`,
    createdDate: spec.createdDate,
    createdBy: '陈静',
    status: 'transferred',
    digitalHash: '', // 2026-08-29 T3：仿真数据不伪造哈希（真实固化值由后端 ams_record_fixity 登记）
    scanned: true,
    carrierType: spec.carrierType,
    securityLevel: spec.securityLevel || '普通',
    categoryConfigId: 'cat-vd-1',
  });
}

function addBox(spec: Omit<ArchiveBox, 'carrierType' | 'status' | 'createdBy'> & { status?: ArchiveBox['status'] }): void {
  boxes.push({
    carrierType: 'paper',
    status: spec.status || 'stored',
    createdBy: '陈静',
    ...spec,
  });
}

// ──────────────────────────────────────────────
// 一、KP 会计凭证：2025 全年（纸质实体，按季装盒）
// ──────────────────────────────────────────────

const KP_2025_BOXES: { id: string; boxNo: string; boxName: string; months: number[]; location: string }[] = [
  { id: 'box-kp-2025-q1', boxNo: 'BOX-2025-KP-001', boxName: '2025年会计凭证 第001盒（1-3月）', months: [1, 2, 3], location: '柜B-架2-层1' },
  { id: 'box-kp-2025-q2', boxNo: 'BOX-2025-KP-002', boxName: '2025年会计凭证 第002盒（4-6月）', months: [4, 5, 6], location: '柜B-架2-层2' },
  { id: 'box-kp-2025-q3', boxNo: 'BOX-2025-KP-003', boxName: '2025年会计凭证 第003盒（7-9月）', months: [7, 8, 9], location: '柜B-架2-层3' },
  { id: 'box-kp-2025-q4', boxNo: 'BOX-2025-KP-004', boxName: '2025年会计凭证 第004盒（10-12月）', months: [10, 11, 12], location: '柜B-架2-层4' },
];

KP_2025_BOXES.forEach((b, bi) => {
  addBox({
    id: b.id,
    boxId: `BX-KP25-${bi + 1}`,
    boxNo: b.boxNo,
    boxName: b.boxName,
    archiveTypeCode: 'KP',
    location: b.location,
    retention: '30年',
    year: 2025,
    volumeCount: b.months.length,
    createdDate: '2026-01-15',
    remarks: '2025年度纸质凭证，已数字化扫描',
  });

  b.months.forEach((m) => {
    const count = pick(`kp25-${m}`, 14, 20);
    const specs: RecordSpec[] = [];
    for (let i = 1; i <= count; i++) {
      const category = i % 3 === 1 ? '收款凭证' : i % 3 === 2 ? '付款凭证' : '转账凭证';
      const pool = VOUCHER_SUBJECTS[category];
      const summary = pickOne(`kp25-${m}-${i}-s`, pool.summaries);
      specs.push({
        id: `sim-kp-2025-${pad2(m)}-${pad3(i)}`,
        voucherNo: `记-${pad3(i)}`,
        archiveType: '记账凭证',
        year: 2025,
        month: m,
        amount: pick(`kp25-${m}-${i}-a`, 800, 186000),
        summary: `${m}月${summary}`,
        department: pickOne(`kp25-${m}-${i}-d`, DEPARTMENTS),
        carrierType: 'paper',
        extra: {
          voucherCategory: category,
          accountSubject: pickOne(`kp25-${m}-${i}-sub`, pool.subjects),
        },
      });
    }
    addVolume(
      {
        id: `vol-kp-2025-${pad2(m)}`,
        title: `2025年${pad2(m)}月记账凭证（记-001~记-${pad3(count)}）`,
        archiveType: '记账凭证',
        archiveTypeCode: 'KP',
        year: 2025,
        month: m,
        carrierType: 'mixed',
        createdDate: '2026-01-15',
      },
      b.id,
      specs,
    );
  });
});

// ──────────────────────────────────────────────
// 二、KP 会计凭证：2026 1-4月（原生电子）+ 薪酬敏感卷
// ──────────────────────────────────────────────

// 2026 1-3月 → box-001（已有：2026年会计凭证 第001盒，sealed）
[1, 2, 3].forEach((m) => {
  const count = pick(`kp26-${m}`, 16, 22);
  const specs: RecordSpec[] = [];
  for (let i = 1; i <= count; i++) {
    const category = i % 3 === 1 ? '收款凭证' : i % 3 === 2 ? '付款凭证' : '转账凭证';
    const pool = VOUCHER_SUBJECTS[category];
    const summary = pickOne(`kp26-${m}-${i}-s`, pool.summaries);
    specs.push({
      id: `sim-kp-2026-${pad2(m)}-${pad3(i)}`,
      voucherNo: `记-${pad3(i)}`,
      archiveType: '记账凭证',
      year: 2026,
      month: m,
      amount: pick(`kp26-${m}-${i}-a`, 1200, 226000),
      summary: `${m}月${summary}`,
      department: pickOne(`kp26-${m}-${i}-d`, DEPARTMENTS),
      carrierType: 'electronic',
      extra: {
        voucherCategory: category,
        accountSubject: pickOne(`kp26-${m}-${i}-sub`, pool.subjects),
      },
    });
  }
  addVolume(
    {
      id: `vol-kp-2026-${pad2(m)}`,
      title: `2026年${pad2(m)}月记账凭证（记-001~记-${pad3(count)}）`,
      archiveType: '记账凭证',
      archiveTypeCode: 'KP',
      year: 2026,
      month: m,
      carrierType: 'electronic',
      createdDate: `2026-${pad2(m)}-28`,
    },
    'box-001',
    specs,
  );
});

// 2026 4月 → box-002（已有：2026年会计凭证 第002盒，active）
{
  const count = 21;
  const specs: RecordSpec[] = [];
  for (let i = 1; i <= count; i++) {
    const category = i % 3 === 1 ? '收款凭证' : i % 3 === 2 ? '付款凭证' : '转账凭证';
    const pool = VOUCHER_SUBJECTS[category];
    const summary = pickOne(`kp26-04-${i}-s`, pool.summaries);
    specs.push({
      id: `sim-kp-2026-04-${pad3(i)}`,
      voucherNo: `记-${pad3(i)}`,
      archiveType: '记账凭证',
      year: 2026,
      month: 4,
      amount: pick(`kp26-04-${i}-a`, 1500, 198000),
      summary: `4月${summary}`,
      department: pickOne(`kp26-04-${i}-d`, DEPARTMENTS),
      carrierType: 'electronic',
      extra: {
        voucherCategory: category,
        accountSubject: pickOne(`kp26-04-${i}-sub`, pool.subjects),
      },
    });
  }
  addVolume(
    {
      id: 'vol-kp-2026-04',
      title: '2026年04月记账凭证（记-001~记-021）',
      archiveType: '记账凭证',
      archiveTypeCode: 'KP',
      year: 2026,
      month: 4,
      carrierType: 'electronic',
      createdDate: '2026-04-30',
    },
    'box-002',
    specs,
  );
}

// 薪酬与高管报销敏感卷（密级：秘密 → HRVP 审批路由演示）→ box-002
{
  const specs: RecordSpec[] = SALARY_SUMMARIES.map((summary, i) => ({
    id: `sim-kp-2026-salary-${pad3(i + 1)}`,
    voucherNo: `记-${pad3(30 + i)}`,
    archiveType: '记账凭证',
    year: 2026,
    month: 4,
    amount: pick(`salary-${i}`, 8600, 386000),
    summary,
    department: '人力资源部',
    preparer: '李娜',
    carrierType: 'electronic',
    extra: {
      voucherCategory: '付款凭证',
      accountSubject: '应付职工薪酬',
      securityLevel: '秘密',
    },
  }));
  addVolume(
    {
      id: 'vol-kp-2026-salary',
      title: '2026年04月薪酬与高管报销凭证 第1卷',
      archiveType: '记账凭证',
      archiveTypeCode: 'KP',
      year: 2026,
      month: 4,
      carrierType: 'electronic',
      securityLevel: '秘密',
      createdDate: '2026-04-30',
    },
    'box-002',
    specs,
  );
}

// vol-001（2026年5月，承接 data.ts 既有3条已组卷记录）→ box-002
addVolume(
  {
    id: 'vol-001',
    title: '2026年05月记账凭证 第1卷',
    archiveType: '记账凭证',
    archiveTypeCode: 'KP',
    year: 2026,
    month: 5,
    carrierType: 'electronic',
    createdDate: '2026-05-30',
  },
  'box-002',
  [
    { id: 'voucher-202605-001', voucherNo: '记-001', archiveType: '记账凭证', year: 2026, month: 5, amount: 12500, summary: '5月采购办公设备及差旅费', department: '财务部', carrierType: 'electronic', extra: { voucherCategory: '付款凭证', accountSubject: '管理费用', sourceDocumentIds: ['sd-001', 'sd-002'] } },
    { id: 'voucher-202605-002', voucherNo: '记-002', archiveType: '记账凭证', year: 2026, month: 5, amount: 23500, summary: '5月采购原材料一批', department: '采购部', carrierType: 'electronic', extra: { voucherCategory: '付款凭证', accountSubject: '采购成本', sourceDocumentIds: ['sd-003'] } },
    { id: 'voucher-202605-003', voucherNo: '记-003', archiveType: '记账凭证', year: 2026, month: 5, amount: 56800, summary: '5月员工差旅费报销汇总', department: '行政部', carrierType: 'electronic', extra: { voucherCategory: '付款凭证', accountSubject: '管理费用', sourceDocumentIds: ['sd-004', 'sd-005'] } },
  ],
);

// ──────────────────────────────────────────────
// 三、KB 会计账簿：2025（纸质）+ 2026（电子）
// ──────────────────────────────────────────────

addBox({
  id: 'box-kb-2025-01',
  boxId: 'BX-KB25-1',
  boxNo: 'BOX-2025-KB-001',
  boxName: '2025年会计账簿 第001盒',
  archiveTypeCode: 'KB',
  location: '柜B-架5-层1',
  retention: '30年',
  year: 2025,
  volumeCount: 2,
  createdDate: '2026-01-20',
  remarks: '2025年度账簿：总账/明细账/日记账/辅助账',
});

{
  // 2025 卷1：总账 + 日记账
  const specs: RecordSpec[] = [];
  LEDGER_DEFS.filter((d) => d.subType === '总账' || d.subType === '日记账').forEach((d) => {
    d.names.forEach((name, i) => {
      specs.push({
        id: `sim-kb-2025-${d.subType}-${i}`,
        voucherNo: `账-${d.subType === '总账' ? 'Z' : 'R'}${pad2(i + 1)}`,
        archiveType: '会计账簿',
        year: 2025,
        month: 12,
        amount: 0,
        summary: `2025年度${name}`,
        carrierType: 'paper',
        extra: { subType: d.subType },
      });
    });
  });
  addVolume(
    { id: 'vol-kb-2025-01', title: '2025年度总账及日记账 第1卷', archiveType: '会计账簿', archiveTypeCode: 'KB', year: 2025, month: 12, carrierType: 'mixed', createdDate: '2026-01-20' },
    'box-kb-2025-01',
    specs,
  );

  // 2025 卷2：明细账 + 辅助账
  const specs2: RecordSpec[] = [];
  LEDGER_DEFS.filter((d) => d.subType === '明细账' || d.subType === '辅助账簿').forEach((d) => {
    d.names.forEach((name, i) => {
      specs2.push({
        id: `sim-kb-2025-${d.subType}-${i}`,
        voucherNo: `账-${d.subType === '明细账' ? 'M' : 'F'}${pad2(i + 1)}`,
        archiveType: '会计账簿',
        year: 2025,
        month: 12,
        amount: 0,
        summary: `2025年度${name}`,
        carrierType: 'paper',
        extra: { subType: d.subType },
      });
    });
  });
  addVolume(
    { id: 'vol-kb-2025-02', title: '2025年度明细账及辅助账簿 第1卷', archiveType: '会计账簿', archiveTypeCode: 'KB', year: 2025, month: 12, carrierType: 'mixed', createdDate: '2026-01-20' },
    'box-kb-2025-01',
    specs2,
  );
}

// vol-004（2026 总账，承接 data.ts 既有 voucher-book-001）→ box-004
addVolume(
  { id: 'vol-004', title: '2026年度总分类账 第1卷', archiveType: '会计账簿', archiveTypeCode: 'KB', year: 2026, month: 12, carrierType: 'electronic', createdDate: '2026-06-15' },
  'box-004',
  [
    { id: 'voucher-book-001', voucherNo: '账-Z01', archiveType: '会计账簿', year: 2026, month: 12, amount: 0, summary: '2026年度总分类账', carrierType: 'electronic', extra: { subType: '总账' } },
  ],
);

// 2026 卷2：明细账 + 日记账 + 辅助账 → box-004
{
  const specs: RecordSpec[] = [];
  LEDGER_DEFS.filter((d) => d.subType !== '总账').forEach((d) => {
    d.names.forEach((name, i) => {
      specs.push({
        id: `sim-kb-2026-${d.subType}-${i}`,
        voucherNo: `账-${d.subType === '明细账' ? 'M' : d.subType === '日记账' ? 'R' : 'F'}${pad2(i + 1)}`,
        archiveType: '会计账簿',
        year: 2026,
        month: 12,
        amount: 0,
        summary: `2026年度${name}`,
        carrierType: 'electronic',
        extra: { subType: d.subType },
      });
    });
  });
  addVolume(
    { id: 'vol-kb-2026-02', title: '2026年度明细账·日记账·辅助账 第1卷', archiveType: '会计账簿', archiveTypeCode: 'KB', year: 2026, month: 12, carrierType: 'electronic', createdDate: '2026-06-15' },
    'box-004',
    specs,
  );
}

// ──────────────────────────────────────────────
// 四、FB 财务报表：2025（纸质）+ 2026（电子）
// ──────────────────────────────────────────────

function fbSpec(year: number, seq: number, period: string, category: string, name: string, carrier: 'paper' | 'electronic', month: number): RecordSpec {
  return {
    id: `sim-fb-${year}-${period}-${seq}`,
    voucherNo: `报-${pad3(seq)}`,
    archiveType: '财务报表',
    year,
    month,
    amount: 0,
    summary: `${year}年${period === '月度' ? `${month}月` : period === '季度' ? `第${Math.ceil(month / 3)}季度` : '度'}${name}`,
    carrierType: carrier,
    extra: {
      reportCategory: category,
      reportPeriod: period,
      retention: period === '年度' ? '永久' : '10年',
      remarks: `${period} | ${category} | ${year}年${name}`,
    },
  };
}

// vol-005（2025 年度报告卷，承接 data.ts 既有 报-011）→ box-003
addVolume(
  { id: 'vol-005', title: '2025年度财务报告 第1卷', archiveType: '财务报表', archiveTypeCode: 'FB', year: 2025, month: 12, carrierType: 'mixed', createdDate: '2026-02-15' },
  'box-003',
  [
    { id: 'voucher-rpt-001', voucherNo: '报-011', archiveType: '财务报表', year: 2025, month: 12, amount: 0, summary: '2025年度财务会计报告（审计后）', carrierType: 'paper', extra: { reportCategory: '法定对外', reportPeriod: '年度', retention: '永久', remarks: '年度 | 法定对外 | 2025年度财务会计报告（审计后）' } },
    fbSpec(2025, 12, '年度', '法定对外', '现金流量表', 'paper', 12),
    fbSpec(2025, 13, '年度', '法定对外', '所有者权益变动表', 'paper', 12),
    fbSpec(2025, 14, '年度', '专项报告', '企业所得税汇算清缴报告', 'paper', 12),
  ],
);

// 2025 月度报表卷 → box-003
{
  const specs: RecordSpec[] = [];
  for (let m = 1; m <= 6; m++) {
    specs.push(fbSpec(2025, m, '月度', '法定对外', `${pad2(m)}月资产负债表`, 'paper', m));
  }
  addVolume(
    { id: 'vol-fb-2025-02', title: '2025年1-6月月度财务报表 第1卷', archiveType: '财务报表', archiveTypeCode: 'FB', year: 2025, month: 6, carrierType: 'mixed', createdDate: '2026-02-15' },
    'box-003',
    specs,
  );
}

// 2025 季度+内部管理卷 → box-003
{
  const specs: RecordSpec[] = [
    fbSpec(2025, 21, '季度', '法定对外', '第一季度财务报表', 'paper', 3),
    fbSpec(2025, 22, '季度', '法定对外', '第二季度财务报表', 'paper', 6),
    fbSpec(2025, 23, '季度', '内部管理', '第三季度经营分析简报', 'paper', 9),
    fbSpec(2025, 24, '月度', '内部管理', '费用明细分析表', 'paper', 10),
  ];
  addVolume(
    { id: 'vol-fb-2025-03', title: '2025年季度及内部管理报表 第1卷', archiveType: '财务报表', archiveTypeCode: 'FB', year: 2025, month: 10, carrierType: 'mixed', createdDate: '2026-02-15' },
    'box-003',
    specs,
  );
}

// 2026 报表盒 + 卷（电子）
addBox({
  id: 'box-fb-2026-01',
  boxId: 'BX-FB26-1',
  boxNo: 'BOX-2026-FB-001',
  boxName: '2026年财务报表 第001盒',
  archiveTypeCode: 'FB',
  location: '柜B-架1-层2',
  retention: '永久',
  year: 2026,
  volumeCount: 1,
  createdDate: '2026-06-20',
  status: 'active',
  remarks: '2026年月度/季度报表（原生电子）',
});
{
  const specs: RecordSpec[] = [
    fbSpec(2026, 31, '月度', '法定对外', '1月资产负债表', 'electronic', 1),
    fbSpec(2026, 32, '月度', '法定对外', '2月资产负债表', 'electronic', 2),
    fbSpec(2026, 33, '月度', '内部管理', '3月费用明细表', 'electronic', 3),
    fbSpec(2026, 34, '季度', '法定对外', '第一季度财务报表', 'electronic', 3),
    fbSpec(2026, 35, '月度', '法定对外', '4月资产负债表', 'electronic', 4),
    fbSpec(2026, 36, '月度', '内部管理', '5月应收应付明细表', 'electronic', 5),
  ];
  addVolume(
    { id: 'vol-fb-2026-01', title: '2026年1-5月财务报表 第1卷', archiveType: '财务报表', archiveTypeCode: 'FB', year: 2026, month: 5, carrierType: 'electronic', createdDate: '2026-06-20' },
    'box-fb-2026-01',
    specs,
  );
}

// ──────────────────────────────────────────────
// 五、QT 其他会计资料：2025（纸质）+ 2026（电子）
// ──────────────────────────────────────────────

addBox({
  id: 'box-qt-2025-01',
  boxId: 'BX-QT25-1',
  boxNo: 'BOX-2025-QT-001',
  boxName: '2025年其他会计资料 第001盒',
  archiveTypeCode: 'QT',
  location: '柜C-架1-层1',
  retention: '10年',
  year: 2025,
  volumeCount: 2,
  createdDate: '2026-01-25',
  remarks: '银行对账单/调节表/纳税申报表/清册',
});

function qtSpec(year: number, seq: number, subType: string, name: string, carrier: 'paper' | 'electronic', month: number): RecordSpec {
  return {
    id: `sim-qt-${year}-${seq}`,
    voucherNo: `其-${pad3(seq)}`,
    archiveType: '其他会计资料',
    year,
    month,
    amount: 0,
    summary: `${year}年${pad2(month)}月${name}`,
    carrierType: carrier,
    extra: { subType, retention: '10年' },
  };
}

{
  // 2025 卷1：银行类
  const specs: RecordSpec[] = [];
  let seq = 1;
  [3, 6, 9, 12].forEach((m) => {
    specs.push(qtSpec(2025, seq++, '银行对账单', '基本户银行对账单', 'paper', m));
    specs.push(qtSpec(2025, seq++, '银行存款余额调节表', '银行存款余额调节表', 'paper', m));
  });
  addVolume(
    { id: 'vol-qt-2025-01', title: '2025年银行对账单及余额调节表 第1卷', archiveType: '其他会计资料', archiveTypeCode: 'QT', year: 2025, month: 12, carrierType: 'mixed', createdDate: '2026-01-25' },
    'box-qt-2025-01',
    specs,
  );

  // 2025 卷2：税务 + 清册
  const specs2: RecordSpec[] = [];
  [3, 6, 9, 12].forEach((m) => {
    specs2.push(qtSpec(2025, seq++, '纳税申报表', '增值税纳税申报表及附列资料', 'paper', m));
  });
  specs2.push(qtSpec(2025, seq++, '会计档案移交清册', '2025年度会计档案移交清册', 'paper', 12));
  specs2.push(qtSpec(2025, seq++, '会计档案保管清册', '2025年度会计档案保管清册', 'paper', 12));
  addVolume(
    { id: 'vol-qt-2025-02', title: '2025年纳税申报表及档案清册 第1卷', archiveType: '其他会计资料', archiveTypeCode: 'QT', year: 2025, month: 12, carrierType: 'mixed', createdDate: '2026-01-25' },
    'box-qt-2025-01',
    specs2,
  );
}

addBox({
  id: 'box-qt-2026-01',
  boxId: 'BX-QT26-1',
  boxNo: 'BOX-2026-QT-001',
  boxName: '2026年其他会计资料 第001盒',
  archiveTypeCode: 'QT',
  location: '柜C-架1-层2',
  retention: '10年',
  year: 2026,
  volumeCount: 1,
  createdDate: '2026-06-25',
  status: 'active',
  remarks: '2026年银行及税务资料（原生电子）',
});
{
  const specs: RecordSpec[] = [];
  let seq = 101;
  [3, 6].forEach((m) => {
    specs.push(qtSpec(2026, seq++, '银行对账单', '基本户银行对账单', 'electronic', m));
    specs.push(qtSpec(2026, seq++, '银行存款余额调节表', '银行存款余额调节表', 'electronic', m));
    specs.push(qtSpec(2026, seq++, '纳税申报表', '增值税纳税申报表及附列资料', 'electronic', m));
  });
  addVolume(
    { id: 'vol-qt-2026-01', title: '2026年上半年银行及税务资料 第1卷', archiveType: '其他会计资料', archiveTypeCode: 'QT', year: 2026, month: 6, carrierType: 'electronic', createdDate: '2026-06-25' },
    'box-qt-2026-01',
    specs,
  );
}

// ──────────────────────────────────────────────
// 导出
// ──────────────────────────────────────────────

/** 仿真生成的档案记录（全部已组卷+移交归档） */
export const simulatedRecords: ArchiveRecord[] = records;

/** 仿真案卷（全部 transferred 状态） */
export const simulatedVolumes: Volume[] = volumes;

/** 仿真卷内编目 */
export const simulatedVolumeItems: Record<string, VolumeItem[]> = volumeItems;

/** 仿真档案盒（不含 data.ts 中已有的 box-001~004） */
export const simulatedBoxes: ArchiveBox[] = boxes;

/** 既有盒（box-001~004）需要修正的计数字段（按生成结果动态计算，避免漂移） */
export const LEGACY_BOX_PATCHES: Record<string, { volumeCount: number; totalItems: number }> = Object.fromEntries(
  ['box-001', 'box-002', 'box-003', 'box-004'].map((boxId) => {
    const vols = volumes.filter((v) => v.boxId === boxId);
    return [boxId, { volumeCount: vols.length, totalItems: vols.reduce((s, v) => s + v.totalItems, 0) }];
  }),
);

/**
 * 规范化既有手写记录（data.ts initialRecords）：
 * 补齐新增分类字段，但**不覆盖**手写数据已有的引用关系。
 * 已被生成器重建的记录（vol-001/vol-004/vol-005 下 5 条）由生成器版本替代，
 * 此处仅保留 6 月待组卷凭证等未被覆盖的记录。
 */
export function normalizeLegacyRecords(legacy: ArchiveRecord[]): ArchiveRecord[] {
  const rebuiltIds = new Set(records.map((r) => r.id));
  return legacy
    .filter((r) => !rebuiltIds.has(r.id))
    .map((r, i) => {
      const next: ArchiveRecord = { ...r };
      if (next.archiveType === '记账凭证' && !next.voucherCategory) {
        next.voucherCategory = i % 3 === 0 ? '收款凭证' : i % 3 === 1 ? '付款凭证' : '转账凭证';
      }
      if (next.archiveType === '记账凭证' && !next.accountSubject) {
        next.accountSubject = pickOne(next.id, ['管理费用', '银行存款', '应收账款', '采购成本', '主营业务收入', '销售费用']);
      }
      if (!next.preparer) next.preparer = pickOne(next.id, PREPARERS);
      if (!next.securityLevel) next.securityLevel = '普通';
      return next;
    });
}
