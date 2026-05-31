/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CategoryNode, ArchiveRecord } from './types';

export const initialCategoryTree: CategoryNode[] = [
  {
    id: 'fonds-1',
    label: '第一全宗（华北集团总部）',
    type: 'fonds',
    code: 'Z001',
    children: [
      {
        id: 'sub-111',
        label: '会计凭证',
        type: 'class',
        code: '01',
        children: [
          {
            id: 'period-2026',
            label: '2026年',
            type: 'period',
            code: '2026',
            children: [
              { id: 'period-202605', label: '05月', type: 'period', code: '202605' },
              { id: 'period-202604', label: '04月', type: 'period', code: '202604' }
            ]
          },
          {
            id: 'period-2025',
            label: '2025年',
            type: 'period',
            code: '2025',
            children: [
              { id: 'period-202512', label: '12月', type: 'period', code: '202512' }
            ]
          }
        ]
      },
      {
        id: 'sub-112',
        label: '会计账簿',
        type: 'class',
        code: '02',
        children: [
          { id: 'period-book-2026', label: '2026年度总账', type: 'period', code: '2026' },
          { id: 'period-book-2025', label: '2025年度总账', type: 'period', code: '2025' }
        ]
      },
      {
        id: 'sub-113',
        label: '财务报表',
        type: 'class',
        code: '03',
        children: [
          { id: 'period-rep-2026Q1', label: '2026年Q1财务季报', type: 'period', code: '2026Q1' },
          { id: 'period-rep-2025', label: '2025年度审计报告', type: 'period', code: '2025' }
        ]
      },
      {
        id: 'sub-114',
        label: '其他会计资料',
        type: 'class',
        code: '04',
        children: []
      }
    ]
  },
  {
    id: 'fonds-2',
    label: '第二全宗（南方智造分公司）',
    type: 'fonds',
    code: 'Z002',
    children: [
      { id: 'sub-211', label: '会计凭证', type: 'class', code: '01' }
    ]
  }
];

export const initialRecords: ArchiveRecord[] = [
  {
    id: 'node-01',
    archiveCode: 'Z001-01-01-202605-0001',
    voucherNo: '记-001',
    archiveType: '记账凭证',
    department: '财务部',
    amount: 12500.00,
    year: '2026',
    month: '05',
    retention: '30年',
    status: '已组卷',
    volumeCode: 'AJ-202605-01',
    remarks: '华北总部5月份差旅差饷汇总及凭证',
    checks: { real: true, complete: true, usable: true, safe: true },
    checkDetails: [
      {
        property: 'real',
        name: '真实性校验',
        status: 'passed',
        method: '国家税务总局电子发票服务平台数字证书链验签',
        timestamp: '2026-05-30 02:00:00',
        message: '企业及国税双重CA签名真实有效，背书关系验证通过',
        operator: '系统自动'
      },
      {
        property: 'complete',
        name: '完整性校验',
        status: 'passed',
        method: 'Alfresco 引擎计算 SHA-256 复合值比对',
        timestamp: '2026-05-30 02:00:01',
        message: '哈希值与原始采集库记录一致：e3b0c44298fc1c149afbf4c8... 未被修改',
        operator: '系统自动'
      },
      {
        property: 'usable',
        name: '可用性校验',
        status: 'passed',
        method: 'OFD / PDF/A-3 标准规范符合度校验',
        timestamp: '2026-05-30 02:00:02',
        message: '文档结构严谨，已嵌入基础汉字轮廓字库，多终端脱机预览正常',
        operator: '基础架构'
      },
      {
        property: 'safe',
        name: '安全性校验',
        status: 'passed',
        method: '细粒度行为审计及私密过滤规则',
        timestamp: '2026-05-30 02:00:03',
        message: '安全等级 L2 级。已加入动态荧光防伪水印 [jinlinrun198x]',
        operator: '信息安全部'
      }
    ],
    components: [
      {
        name: '2026年05月第0001号记账凭证.pdf',
        type: '记账凭证主件',
        size: '142.5 KB',
        contentType: 'pdf',
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        signatureVerified: true,
        signer: '华北集团CFO'
      },
      {
        name: '北京某科技数电发票_92427ae.xml',
        type: '原始电子附件（数电XML）',
        size: '28.1 KB',
        contentType: 'xml',
        hash: 'a1b2c3d4e5f6...7a8b9c0d1e2f3',
        signatureVerified: true,
        signer: '国家税务总局数字印章'
      },
      {
        name: '差旅报销审批流及收据凭证.png',
        type: '业务审批附件',
        size: '1.2 MB',
        contentType: 'png',
        hash: '8fbcb45b123dabc342371bfe...',
        signatureVerified: false
      }
    ],
    auditLogs: [
      {
        id: 'log-101',
        timestamp: '2026-05-30 10:00:00',
        action: '自动赋予标准档号',
        operator: '系统核心',
        details: '系统检测到记账凭证已完成勾稽，根据 GB/T 18894 标准自动编码: Z001-01-01-202605-0001',
        ipAddress: '127.0.0.1'
      },
      {
        id: 'log-102',
        timestamp: '2026-05-28 14:32:11',
        action: '数电Xml采集与校验',
        operator: '张三 (财务出纳)',
        details: '上传北京某科技原始发票组件，哈希值自动固化，触发区块链防伪链条登记',
        ipAddress: '192.168.1.104'
      },
      {
        id: 'log-103',
        timestamp: '2026-05-20 09:15:04',
        action: '业务端初始化草稿',
        operator: '报销API代理',
        details: '从前置报销系统拉取凭证元数据，写入草稿状态',
        ipAddress: '10.0.8.21'
      }
    ]
  },
  {
    id: 'node-02',
    archiveCode: 'Z001-01-01-202605-0002',
    voucherNo: '记-002',
    archiveType: '记账凭证',
    department: '采购部',
    amount: 540030.50,
    year: '2026',
    month: '05',
    retention: '30年',
    status: '仅件数据',
    remarks: '采购部大宗设备增值税发票验证件',
    checks: { real: true, complete: true, usable: false, safe: true }, // 可用性检测未通过
    checkDetails: [
      {
        property: 'real',
        name: '真实性校验',
        status: 'passed',
        method: 'CA签名和合规加密机验证',
        timestamp: '2026-05-29 11:20:10',
        message: '签名符合国税通用格式标准，未见解签名破损。',
        operator: '系统自动'
      },
      {
        property: 'complete',
        name: '完整性校验',
        status: 'passed',
        method: '目录与节点散列指纹链比对',
        timestamp: '2026-05-29 11:20:11',
        message: '数据主体哈希未发现倾斜或变更痕迹。',
        operator: '系统自动'
      },
      {
        property: 'usable',
        name: '可用性校验',
        status: 'failed',
        message: '【警告】OFD文档缺少非系统标准字体(GB2312/标宋)嵌入轮廓，跨操作系统打开可能导致格式错乱或黑屏；且该原始发票的XML节点命名不满足国家 2026 新版数电规范标准。',
        method: '电子原文标准规范质检',
        timestamp: '2026-05-29 11:20:12',
        operator: '智能合规检测端'
      },
      {
        property: 'safe',
        name: '安全性校验',
        status: 'passed',
        method: '控制层读取日志安全策略',
        timestamp: '2026-05-29 11:20:13',
        message: '白名单限制与管理组只读授权设定已生效。',
        operator: '安全中心'
      }
    ],
    components: [
      {
        name: '2026年05月第0002号记账凭证.pdf',
        type: '记账凭证主件',
        size: '210.0 KB',
        contentType: 'pdf',
        hash: 'b1a2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
        signatureVerified: true,
        signer: '采购部主管'
      },
      {
        name: '采购设备增值税电子发票.xml',
        type: '原始电子附件',
        size: '12.4 KB',
        contentType: 'xml',
        hash: 'ca495991b7852b855e3b0c44298fc1c14...8996ab',
        signatureVerified: false
      },
      {
        name: '采购合同标准文本_签名盖章.ofd',
        type: '附带电子公合同',
        size: '850.5 KB',
        contentType: 'ofd',
        hash: 'cf7a8b9c0d1e2f3a4b5c6d7e8f90011bb22cc33',
        signatureVerified: true,
        signer: '南方智造成套设备供应合伙人'
      }
    ],
    auditLogs: [
      {
        id: 'log-201',
        timestamp: '2026-05-29 11:20:00',
        action: '档号校验未予完成',
        operator: '系统自动',
        details: '检测发现该档案可用性未达国家标准，暂置于 [仅件数据] 并发出修复告警',
        ipAddress: '127.0.0.1'
      },
      {
        id: 'log-202',
        timestamp: '2026-05-25 16:40:55',
        action: '大额票据原始采集',
        operator: '李四 (会计师)',
        details: '由采购合同库同步导入 OFD 组件和 XML 联单。',
        ipAddress: '192.168.1.112'
      }
    ]
  },
  {
    id: 'node-03',
    archiveCode: 'Z001-01-01-202604-0003',
    voucherNo: '记-003',
    archiveType: '记账凭证',
    department: '销售部',
    amount: 1250000.00,
    year: '2026',
    month: '04',
    retention: '30年',
    status: '仅件数据',
    remarks: '华北总部4月份销售大单销项税返款及收据凭据',
    checks: { real: true, complete: true, usable: true, safe: true },
    checkDetails: [
      { property: 'real', name: '真实性校验', status: 'passed', method: '国税局签章比对', timestamp: '2026-04-30 17:00:00', message: 'CA签名有效', operator: '系统自动' },
      { property: 'complete', name: '完整性校验', status: 'passed', method: '散列哈希锁固', timestamp: '2026-04-30 17:00:00', message: '无篡改记录', operator: '系统自动' },
      { property: 'usable', name: '可用性校验', status: 'passed', method: '格式规范化检查', timestamp: '2026-04-30 17:00:00', message: 'PDF格式完美兼容', operator: '系统自动' },
      { property: 'safe', name: '安全性校验', status: 'passed', method: '访问防火墙', timestamp: '2026-04-30 17:00:00', message: '内网隔离受访', operator: '安全服务器' }
    ],
    components: [
      {
        name: '2026年04月第0003号记账凭证.pdf',
        type: '记账凭证主件',
        size: '185.2 KB',
        contentType: 'pdf',
        hash: 'b2855e3b0c44298fc1c149afbf4c8996fb92427ae4',
        signatureVerified: true,
        signer: '财务主管'
      },
      {
        name: '华北电网销售返点结算单.xml',
        type: '结算数电XML',
        size: '42.9 KB',
        contentType: 'xml',
        hash: '3bc0c1122aef91219b10cfaee1920acbb924...',
        signatureVerified: true,
        signer: '国家电网结算CA'
      }
    ],
    auditLogs: [
      {
        id: 'log-301',
        timestamp: '2026-04-30 17:05:00',
        action: '完成国税发票联校验',
        operator: '系统自动',
        details: '销项专用增值税电子发票成功获取，已触发四性验证合格。数据入档备组卷。',
        ipAddress: '127.0.0.1'
      }
    ]
  },
  {
    id: 'node-04',
    archiveCode: 'Z001-01-02-2026-0001',
    voucherNo: '账-001',
    archiveType: '会计账簿',
    department: '财务部',
    amount: 0.00,
    year: '2026',
    month: '12',
    retention: '永久',
    status: '已组卷',
    volumeCode: 'AJ-2026-ZB-01',
    remarks: '2026年度固定资产分类折旧明细账簿（归档版）',
    checks: { real: true, complete: true, usable: true, safe: true },
    checkDetails: [
      { property: 'real', name: '真实性校验', status: 'passed', method: '数字签名审核', timestamp: '2026-05-30 01:00:00', message: '企业CA有效签名', operator: '系统自动' },
      { property: 'complete', name: '完整性校验', status: 'passed', method: '国标哈希固化', timestamp: '2026-05-30 01:00:00', message: '哈希指纹完全闭环一致', operator: '系统自动' },
      { property: 'usable', name: '可用性校验', status: 'passed', method: 'OFD-A 国标检测', timestamp: '2026-05-30 01:00:00', message: '多端自适应渲染通过', operator: '系统自动' },
      { property: 'safe', name: '安全性校验', status: 'passed', method: '角色最小颗粒控制', timestamp: '2026-05-30 01:00:00', message: '限审计级与财务负责人访问', operator: '系统核心' }
    ],
    components: [
      {
        name: '2026年度固定资产明细账簿全集.ofd',
        type: '会计账簿主件',
        size: '15.4 MB',
        contentType: 'ofd',
        hash: '8f7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d',
        signatureVerified: true,
        signer: '总账会计及首席财务官'
      }
    ],
    auditLogs: [
      {
        id: 'log-401',
        timestamp: '2026-05-30 01:10:00',
        action: '总账扎帐与固化归档',
        operator: '系统核心',
        details: '年度明细折旧账目生成，全生命周期数字审计锁开启，保管期限设为: 永久。',
        ipAddress: '127.0.0.1'
      }
    ]
  },
  {
    id: 'node-05',
    archiveCode: 'Z001-01-03-2025-0001',
    voucherNo: '报-001',
    archiveType: '财务报告',
    department: '董事会',
    amount: 9820400.00,
    year: '2025',
    month: '12',
    retention: '永久',
    status: '已组卷',
    volumeCode: 'AJ-2025-BG-01',
    remarks: '2025年度华北集团经审计合并及母公司财务报表',
    checks: { real: true, complete: true, usable: true, safe: true },
    checkDetails: [
      { property: 'real', name: '真实性校验', status: 'passed', method: '两方CA双签验证', timestamp: '2026-02-15 09:30:00', message: '集团公章 + 外部合伙人事务所数字证书通过', operator: '第三方独立验证' },
      { property: 'complete', name: '完整性校验', status: 'passed', method: '区块连防篡改校验', timestamp: '2026-02-15 09:30:00', message: '哈希散列已入公链登记', operator: '系统自动' },
      { property: 'usable', name: '可用性校验', status: 'passed', method: 'PDF/A 长久电子留存质检', timestamp: '2026-02-15 09:30:00', message: '完全兼容ISO 19005国际电子档案留存标准', operator: '系统自动' },
      { property: 'safe', name: '安全性校验', status: 'passed', method: '涉密层级控制', timestamp: '2026-02-15 09:30:00', message: '商业机密级。已增加防篡改及防盗版微观物理水印', operator: '安全架构' }
    ],
    components: [
      {
        name: '2025年度华北集团财务合并审计报告正文.pdf',
        type: '财务审计主件(PDF)',
        size: '4.8 MB',
        contentType: 'pdf',
        hash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
        signatureVerified: true,
        signer: '中企华华北分所会计师事务所签字'
      },
      {
        name: '审计调整及主要披露附注.xlsx',
        type: '支持性电子表格',
        size: '1.4 MB',
        contentType: 'unknown',
        hash: 'ab0987654321cba9f8eeddccbba998877665544',
        signatureVerified: false
      }
    ],
    auditLogs: [
      {
        id: 'log-501',
        timestamp: '2026-02-15 10:00:00',
        action: '完成年度决算审计入库',
        operator: '李四 (会计主管)',
        details: '上传最终审计报告 PDF 签名版与附表，并通过国家标准可用性检测。',
        ipAddress: '192.168.1.112'
      }
    ]
  },
  {
    id: 'node-06',
    archiveCode: 'Z002-01-01-202605-0001',
    voucherNo: '记-001',
    archiveType: '记账凭证',
    department: '销售部',
    amount: 88200.00,
    year: '2026',
    month: '05',
    retention: '30年',
    status: '仅件数据',
    remarks: '南方智造分公司 5月份出纳付款账目',
    checks: { real: true, complete: true, usable: true, safe: true },
    checkDetails: [
      { property: 'real', name: '真实性校验', status: 'passed', method: 'CA证书比对验签', timestamp: '2026-05-20 14:00:00', message: '南方智造分公司出纳数字签章有效', operator: '系统自动' },
      { property: 'complete', name: '完整性校验', status: 'passed', method: '国标哈希散列计算', timestamp: '2026-05-20 14:00:01', message: '指纹与原始上传散列完美匹配', operator: '系统自动' },
      { property: 'usable', name: '可用性校验', status: 'passed', method: 'OFD-A 国标检测', timestamp: '2026-05-20 14:00:02', message: '版面嵌入中文字体正常，多端阅读OK', operator: '系统自动' },
      { property: 'safe', name: '安全性校验', status: 'passed', method: '脱敏检测机制', timestamp: '2026-05-20 14:00:03', message: '已安全嵌入防伪和数字防伪防泄密水印', operator: '分公司信息工程部' }
    ],
    components: [
      {
        name: '2026年05月第二全宗出纳付款凭单.pdf',
        type: '记账凭证主件',
        size: '124.5 KB',
        contentType: 'pdf',
        hash: 'cf7a8b9c0d1e2f3a4b5c6d7e8f90011bb22cc33da7b',
        signatureVerified: true,
        signer: '南方公司出纳负责人'
      }
    ],
    auditLogs: [
      {
        id: 'log-601',
        timestamp: '2026-05-20 14:05:00',
        action: '分公司付款同步',
        operator: 'sz_manager (分公司审计员)',
        details: '从南方智造金蝶云同步链路采集记账凭证原始归档件，四性初筛检测完成。',
        ipAddress: '192.168.22.41'
      }
    ]
  }
];
