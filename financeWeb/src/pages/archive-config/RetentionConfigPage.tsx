/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * RetentionConfigPage — 档案三合一表（分类体系 · 归档范围 · 保管期限）
 *
 * 左右主从布局：左侧导航（概览+四大类+排除范围+期限规则）+ 搜索，右侧单主题展示。
 * 法定依据：《会计档案管理办法》（财政部、国家档案局令第 79 号）、
 * 《会计档案整理规范》（DA/T 42-2022）。只读法定口径。
 *
 * embedded=true 时作为「档案管理配置」Tab 嵌入（隐藏自身顶栏）。
 */

import React, { useState, useMemo } from 'react';
import {
  Clock, Shield, BookOpen, FileText, FolderTree,
  Building2, ChevronDown, ChevronRight, AlertTriangle,
  Ban, Lock,
  Search, LayoutGrid,
} from 'lucide-react';
// ============================================================
// 分类架构定义
// ============================================================

interface CategoryDetail {
  code: string;
  name: string;
  retention: string;        // 保管期限
  retentionCode: string;     // 期限代码
  retentionBasis: string;    // 到期起算规则
  description: string;
  mandatory: boolean;        // 是否为法定必选项
  children?: CategoryDetail[];
}

interface ArchiveCategory {
  code: string;
  name: string;
  description: string;
  details: CategoryDetail[];
}

/** 四大法定类别（固化，不可增删改） */
const ARCHIVE_CATEGORIES: ArchiveCategory[] = [
  {
    code: 'KP',
    name: '会计凭证类',
    description: '所有经济业务发生时的原始凭据及据此编制的记账凭证，按月度归集著录',
    details: [
      {
        code: 'KP-01', name: '原始凭证', retention: '30年', retentionCode: 'D30',
        retentionBasis: '会计年度终了后第一天起算',
        description: '经济业务发生时取得或填制的原始凭据，含各类发票、财政票据、收据、报销审批单、出入库单据、银行收付款回单、工资发放明细表、税费缴纳凭据、往来结算单据等',
        mandatory: true,
        children: [
          { code: 'KP-01-01', name: '各类发票', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '增值税专用发票、增值税普通发票、电子发票等', mandatory: true },
          { code: 'KP-01-02', name: '财政票据', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '非税收入一般缴款书、公益事业捐赠统一票据等', mandatory: true },
          { code: 'KP-01-03', name: '收据', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '各类收款收据', mandatory: true },
          { code: 'KP-01-04', name: '报销审批单', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '差旅费、招待费、办公费等各类费用报销审批单据', mandatory: true },
          { code: 'KP-01-05', name: '出入库单据', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '材料入库单、产品出库单、库存调拨单等', mandatory: true },
          { code: 'KP-01-06', name: '银行收付款回单', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '银行收款回单、付款回单、电子回单', mandatory: true },
          { code: 'KP-01-07', name: '工资发放明细表', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '职工工资发放明细、考勤及薪酬核算表', mandatory: true },
          { code: 'KP-01-08', name: '税费缴纳凭据', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '各税种完税凭证、缴款书、电子缴款凭证', mandatory: true },
          { code: 'KP-01-09', name: '往来结算单据', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '应收应付结算单、对账确认单等', mandatory: true },
        ],
      },
      {
        code: 'KP-02', name: '记账凭证', retention: '30年', retentionCode: 'D30',
        retentionBasis: '会计年度终了后第一天起算',
        description: '根据原始凭证编制的会计记账凭证，著录时强制关联对应月份',
        mandatory: true,
        children: [
          { code: 'KP-02-01', name: '通用记账凭证', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '标准格式的记账凭证，记录所有类型的经济业务', mandatory: true },
          { code: 'KP-02-02', name: '收款凭证', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '专门记录现金及银行存款收款业务的凭证', mandatory: true },
          { code: 'KP-02-03', name: '付款凭证', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '专门记录现金及银行存款付款业务的凭证', mandatory: true },
          { code: 'KP-02-04', name: '转账凭证', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '记录不涉及现金及银行存款收付的转账业务', mandatory: true },
          { code: 'KP-02-05', name: '汇总凭证', retention: '30年', retentionCode: 'D30', retentionBasis: '会计年度终了后第一天起算', description: '按科目或期间汇总编制的记账凭证汇总表', mandatory: true },
        ],
      },
    ],
  },
  {
    code: 'KB',
    name: '会计账簿类',
    description: '全面、连续、系统地记录和反映单位经济业务活动的簿籍',
    details: [
      {
        code: 'KB-01', name: '总账', retention: '30年', retentionCode: 'D30',
        retentionBasis: '会计年度终了后第一天起算',
        description: '总分类核算账簿及配套科目汇总表，记录各总分类科目的期初余额、本期发生额和期末余额',
        mandatory: true,
      },
      {
        code: 'KB-02', name: '明细账', retention: '30年', retentionCode: 'D30',
        retentionBasis: '会计年度终了后第一天起算',
        description: '按会计科目分户设置的明细分类核算账簿，提供各科目的详细增减变动记录',
        mandatory: true,
      },
      {
        code: 'KB-03', name: '日记账', retention: '30年', retentionCode: 'D30',
        retentionBasis: '会计年度终了后第一天起算',
        description: '按经济业务发生时间先后顺序逐日逐笔登记的序时账簿，特指现金日记账与银行存款日记账',
        mandatory: true,
      },
      {
        code: 'KB-04', name: '固定资产卡片', retention: '5年', retentionCode: 'D5',
        retentionBasis: '固定资产报废清理后起算',
        description: '固定资产明细登记卡片，逐一登记各项固定资产的编号、名称、规格、原值、折旧等信息；系统需关联资产报废清理时间节点自动计算保管到期日',
        mandatory: true,
      },
      {
        code: 'KB-05', name: '其他辅助性账簿', retention: '30年', retentionCode: 'D30',
        retentionBasis: '会计年度终了后第一天起算',
        description: '各类备查簿、往来款项台账、项目核算台账、银行账户管理台账等辅助核算资料',
        mandatory: true,
      },
    ],
  },
  {
    code: 'FB',
    name: '财务会计报告类',
    description: '反映单位财务状况、经营成果和现金流量的书面文件',
    details: [
      {
        code: 'FB-01', name: '月度财务会计报告', retention: '10年', retentionCode: 'D10',
        retentionBasis: '会计年度终了后第一天起算',
        description: '月度资产负债表、利润表、现金流量表及简要附注',
        mandatory: true,
      },
      {
        code: 'FB-02', name: '季度财务会计报告', retention: '10年', retentionCode: 'D10',
        retentionBasis: '会计年度终了后第一天起算',
        description: '季度资产负债表、利润表、现金流量表及报表附注',
        mandatory: true,
      },
      {
        code: 'FB-03', name: '半年度财务会计报告', retention: '10年', retentionCode: 'D10',
        retentionBasis: '会计年度终了后第一天起算',
        description: '半年度资产负债表、利润表、现金流量表、报表附注及配套财务分析文字材料',
        mandatory: true,
      },
      {
        code: 'FB-04', name: '年度财务会计报告', retention: '永久', retentionCode: 'Y',
        retentionBasis: '—',
        description: '年度全套决算报表、完整报表附注、财务情况说明书；外部第三方机构出具的年度审计报告可随年度财务报告一并归入此类',
        mandatory: true,
      },
    ],
  },
  {
    code: 'QT',
    name: '其他会计资料类',
    description: '会计档案管理流程中形成的银行存款调节、对账、税务申报、档案管理类文件',
    details: [
      {
        code: 'QT-01', name: '银行存款余额调节表', retention: '10年', retentionCode: 'D10',
        retentionBasis: '会计年度终了后第一天起算',
        description: '定期编制的银行存款账面余额与银行对账单余额的差异调节表',
        mandatory: true,
      },
      {
        code: 'QT-02', name: '银行对账单', retention: '10年', retentionCode: 'D10',
        retentionBasis: '会计年度终了后第一天起算',
        description: '覆盖所有银行账户的月度、年度银行对账单',
        mandatory: true,
      },
      {
        code: 'QT-03', name: '纳税申报表', retention: '10年', retentionCode: 'D10',
        retentionBasis: '会计年度终了后第一天起算',
        description: '覆盖各税种全周期申报表单，含增值税、企业所得税、个人所得税、印花税等',
        mandatory: true,
      },
      {
        code: 'QT-04', name: '会计档案移交清册', retention: '30年', retentionCode: 'D30',
        retentionBasis: '会计年度终了后第一天起算',
        description: '会计部临时保管期满后向档案部移交档案的清册，双方签字确认',
        mandatory: true,
      },
      {
        code: 'QT-05', name: '会计档案保管清册', retention: '永久', retentionCode: 'Y',
        retentionBasis: '—',
        description: '登记库存全部会计档案案卷的清册，标注永久标识，不纳入到期销毁筛查范围',
        mandatory: true,
      },
      {
        code: 'QT-06', name: '会计档案销毁清册', retention: '永久', retentionCode: 'Y',
        retentionBasis: '—',
        description: '期满鉴定后待销毁档案的正式清册，需逐级审批确认、双人监销签字',
        mandatory: true,
      },
      {
        code: 'QT-07', name: '会计档案鉴定意见书', retention: '永久', retentionCode: 'Y',
        retentionBasis: '—',
        description: '档案保管期满后由鉴定小组出具的是否可销毁的鉴定意见书',
        mandatory: true,
      },
    ],
  },
];

// ============================================================
// 排除范围（非会计档案，不纳入本模块）
// ============================================================

interface ExclusionItem {
  name: string;
  attribution: string;
  remark: string;
}

const EXCLUSION_ITEMS: ExclusionItem[] = [
  { name: '预算文件、计划方案、规章制度', attribution: '文书档案', remark: '内部审批文件归入文书档案管理' },
  { name: '业务合同原件', attribution: '文书档案或业务档案', remark: '仅作为凭证附件的合同复印件随会计凭证归档，不单独著录' },
  { name: '人事任免文件、劳动合同原件', attribution: '人事档案', remark: '不纳入会计档案归档范围' },
  { name: '内部审批文件', attribution: '文书档案', remark: '各类不涉及会计业务的内部审批文件' },
];

// ============================================================
// 统一颜色映射
// ============================================================

const RETENTION_COLOR: Record<string, string> = {
  '永久': 'text-red-600 bg-red-50 border-red-200',
  '30年': 'text-amber-600 bg-amber-50 border-amber-200',
  '10年': 'text-sky-600 bg-sky-50 border-sky-200',
  '5年': 'text-emerald-600 bg-emerald-50 border-emerald-200',
};

const RETENTION_DOT: Record<string, string> = {
  '永久': 'bg-red-500',
  '30年': 'bg-amber-500',
  '10年': 'bg-sky-500',
  '5年': 'bg-emerald-500',
};
// ============================================================
// 子组件：明细行（支持递归子项）
// ============================================================

const DetailRow: React.FC<{ detail: CategoryDetail; isLast: boolean; depth: number; defaultExpanded?: boolean }> = ({
  detail,
  isLast,
  depth,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = detail.children && detail.children.length > 0;
  const isPermanent = detail.retention === '永久';

  return (
    <>
      <div className={`grid grid-cols-12 gap-3 px-5 py-3 items-center ${
        depth > 0 ? 'bg-slate-50/50' : ''
      } ${!isLast ? 'border-b border-slate-50' : ''} hover:bg-slate-50/80 transition-colors`}>
        {/* 编码 */}
        <div className="col-span-1 flex items-center gap-1">
          {hasChildren && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 text-slate-400 hover:text-slate-600"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          )}
          <span className={`font-mono text-[11px] font-bold ${
            depth > 0 ? 'text-slate-400' : 'text-slate-600'
          }`} style={{ marginLeft: `${depth * 16}px` }}>
            {detail.code}
          </span>
        </div>

        {/* 名称 */}
        <div className="col-span-3">
          <div className="flex items-center gap-2">
            <span className={`text-sm ${depth > 0 ? 'text-slate-600' : 'font-bold text-slate-700'}`}>
              {detail.name}
            </span>
            {isPermanent && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-600 border border-red-200">
                <Lock className="w-2.5 h-2.5" />永久
              </span>
            )}
            {detail.mandatory && (
              <span className="text-[9px] text-slate-300">[法定]</span>
            )}
          </div>
        </div>

        {/* 说明 */}
        <div className="col-span-4">
          <p className="text-xs text-slate-500 leading-relaxed">{detail.description}</p>
        </div>

        {/* 保管期限 */}
        <div className="col-span-2 flex justify-center">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${RETENTION_COLOR[detail.retention] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${RETENTION_DOT[detail.retention] || 'bg-slate-400'}`} />
            {detail.retention}
          </span>
        </div>

        {/* 起算规则 */}
        <div className="col-span-2">
          <span className="text-[11px] text-slate-400">{detail.retentionBasis}</span>
        </div>
      </div>

      {/* 子项 */}
      {hasChildren && expanded && detail.children!.map((child, idx) => (
        <DetailRow
          key={child.code}
          detail={child}
          isLast={idx === detail.children!.length - 1}
          depth={depth + 1}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </>
  );
};

// ============================================================
// 子组件：类别明细表（单类别视图，子项默认展开）
// ============================================================

const CategoryDetailTable: React.FC<{ category: ArchiveCategory }> = ({ category }) => {
  // 统计该类别下的保管期限分布
  const retentionCounts: Record<string, number> = {};
  const countRetentions = (items: CategoryDetail[]) => {
    items.forEach((d) => {
      retentionCounts[d.retention] = (retentionCounts[d.retention] || 0) + 1;
      if (d.children) countRetentions(d.children);
    });
  };
  countRetentions(category.details);

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      {/* 类别头 */}
      <div className="flex items-center justify-between px-5 py-4 bg-slate-50/60 border-b border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
            category.code === 'KP' ? 'bg-sky-100 text-sky-700' :
            category.code === 'KB' ? 'bg-emerald-100 text-emerald-700' :
            category.code === 'FB' ? 'bg-violet-100 text-violet-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {category.code}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">{category.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{category.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {Object.entries(retentionCounts).map(([ret, count]) => (
            <span
              key={ret}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${RETENTION_COLOR[ret] || 'bg-slate-50 text-slate-500 border-slate-200'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${RETENTION_DOT[ret] || 'bg-slate-400'}`} />
              {ret} ×{count}
            </span>
          ))}
        </div>
      </div>

      {/* 表头 */}
      <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-100">
        <div className="col-span-1">编码</div>
        <div className="col-span-3">档案明细</div>
        <div className="col-span-4">归档范围说明</div>
        <div className="col-span-2 text-center">保管期限</div>
        <div className="col-span-2">起算规则</div>
      </div>

      {category.details.map((detail, idx) => (
        <DetailRow key={detail.code} detail={detail} isLast={idx === category.details.length - 1} depth={0} />
      ))}
    </div>
  );
};

// ============================================================
// 主页面（左右主从布局，2026-08-16 重设计）
// ============================================================

const RetentionConfigPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [activeKey, setActiveKey] = useState<string>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const totalDetailCount = ARCHIVE_CATEGORIES.reduce(
    (sum, cat) => sum + cat.details.length,
    0,
  );

  // ── 全局搜索：跨类别递归匹配明细 ──
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const out: { category: ArchiveCategory; detail: CategoryDetail }[] = [];
    const walk = (cat: ArchiveCategory, items: CategoryDetail[]) => {
      items.forEach((d) => {
        if (
          d.code.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.retention.includes(searchQuery.trim())
        ) {
          out.push({ category: cat, detail: d });
        }
        if (d.children) walk(cat, d.children);
      });
    };
    ARCHIVE_CATEGORIES.forEach((cat) => walk(cat, cat.details));
    return out;
  }, [searchQuery]);

  const activeCategory = ARCHIVE_CATEGORIES.find((c) => c.code === activeKey);

  // ── 左侧导航项 ──
  const NavItem: React.FC<{
    active: boolean; onClick: () => void; icon?: React.ReactNode;
    label: string; badge?: React.ReactNode;
  }> = ({ active, onClick, icon, label, badge }) => (
    <button
      type="button" onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
        active ? 'bg-sky-50 border border-sky-200' : 'border border-transparent hover:bg-slate-50'
      }`}
    >
      {icon}
      <span className={`flex-1 text-xs font-medium truncate ${active ? 'text-sky-700' : 'text-slate-600'}`}>{label}</span>
      {badge}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* ═══ 顶栏（嵌入模式隐藏） ═══ */}
      {!embedded && (
        <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
          <Shield className="w-5 h-5 text-sky-600" />
          <h1 className="text-base font-bold text-slate-800">档案三合一表</h1>
        </div>
      )}

      {/* ═══ 主体：左右主从 ═══ */}
      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="max-w-7xl mx-auto flex gap-4 items-start">
          {/* ══ 左侧导航 ══ */}
          <aside className="w-64 shrink-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索编码/名称/说明/期限…"
                  className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </div>
            </div>
            <nav className="max-h-[74vh] overflow-y-auto p-2 space-y-0.5">
              <NavItem
                active={!searchQuery.trim() && activeKey === 'overview'}
                onClick={() => { setActiveKey('overview'); setSearchQuery(''); }}
                icon={<LayoutGrid className="w-3.5 h-3.5 text-slate-400" />}
                label="概览"
                badge={<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{totalDetailCount} 项</span>}
              />
              <div className="px-2 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">归档范围 · 保管期限</div>
              {ARCHIVE_CATEGORIES.map((cat) => {
                const codeCls = cat.code === 'KP' ? 'bg-sky-50 text-sky-600' :
                  cat.code === 'KB' ? 'bg-emerald-50 text-emerald-600' :
                  cat.code === 'FB' ? 'bg-violet-50 text-violet-600' : 'bg-amber-50 text-amber-600';
                return (
                  <NavItem
                    key={cat.code}
                    active={!searchQuery.trim() && activeKey === cat.code}
                    onClick={() => { setActiveKey(cat.code); setSearchQuery(''); }}
                    label={cat.name}
                    badge={<span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${codeCls}`}>{cat.code} · {cat.details.length} 项</span>}
                  />
                );
              })}
              <div className="px-2 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">规则</div>
              <NavItem
                active={!searchQuery.trim() && activeKey === 'exclusion'}
                onClick={() => { setActiveKey('exclusion'); setSearchQuery(''); }}
                icon={<Ban className="w-3.5 h-3.5 text-red-400" />}
                label="排除范围（非会计档案）"
                badge={<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">{EXCLUSION_ITEMS.length} 类</span>}
              />
              <NavItem
                active={!searchQuery.trim() && activeKey === 'calc'}
                onClick={() => { setActiveKey('calc'); setSearchQuery(''); }}
                icon={<Clock className="w-3.5 h-3.5 text-amber-400" />}
                label="保管期限计算规则"
                badge={<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">4 档</span>}
              />
            </nav>
          </aside>

          {/* ══ 右侧内容 ══ */}
          <div className="flex-1 min-w-0">
            {/* ── 搜索模式 ── */}
            {searchQuery.trim() ? (
              searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white border border-dashed border-slate-300 rounded-xl">
                  <Search className="w-8 h-8 mb-2 text-slate-300" />
                  <p className="text-sm">未找到匹配的档案明细</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-slate-500 px-1">
                    检索结果 <strong className="text-sky-600">{searchResults.length}</strong> 项（关键词 “{searchQuery.trim()}”）
                  </div>
                  <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                    <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-100">
                      <div className="col-span-1">编码</div>
                      <div className="col-span-3">档案明细</div>
                      <div className="col-span-4">归档范围说明</div>
                      <div className="col-span-2 text-center">保管期限</div>
                      <div className="col-span-2">起算规则</div>
                    </div>
                    {searchResults.map(({ category, detail }, idx) => (
                      <React.Fragment key={category.code + detail.code}>
                        <DetailRow detail={detail} isLast={idx === searchResults.length - 1} depth={0} />
                        {/* 所属类别标注 */}
                        <div className="px-5 pb-2 -mt-1">
                          <span className="text-[10px] text-slate-400">所属：{category.code} {category.name}</span>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )
            ) : activeCategory ? (
              /* ── 单个类别视图 ── */
              <CategoryDetailTable category={activeCategory} />
            ) : activeKey === 'exclusion' ? (
              /* ── 排除范围 ── */
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 text-red-500" />
                    <h2 className="text-sm font-bold text-slate-800">排除范围（非会计档案）</h2>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                        <th className="px-4 py-3 text-left text-[13px] font-semibold">材料类型</th>
                        <th className="px-4 py-3 text-center text-[13px] font-semibold w-32">归入档案类型</th>
                        <th className="px-4 py-3 text-left text-[13px] font-semibold">备注说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {EXCLUSION_ITEMS.map((item, idx) => (
                        <tr key={idx} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                          <td className="px-4 py-3 text-sm text-slate-800">{item.name}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">
                              {item.attribution}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[13px] text-slate-600">{item.remark}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : activeKey === 'calc' ? (
              /* ── 保管期限计算规则 ── */
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-3 text-sm text-amber-900 w-full">
                    <p className="font-bold">保管期限计算规则</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-white/60 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          <span className="text-xs font-bold text-red-700">永久保管</span>
                        </div>
                        <p className="text-xs text-amber-800">
                          年度财务报告、会计档案保管清册、销毁清册、鉴定意见书
                        </p>
                      </div>

                      <div className="bg-white/60 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span className="text-xs font-bold text-amber-700">定期 30 年</span>
                        </div>
                        <p className="text-xs text-amber-800">
                          会计凭证（全部明细）、总账、明细账、日记账、辅助账簿、移交清册
                        </p>
                      </div>

                      <div className="bg-white/60 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-2 h-2 rounded-full bg-sky-500" />
                          <span className="text-xs font-bold text-sky-700">定期 10 年</span>
                        </div>
                        <p className="text-xs text-amber-800">
                          月度/季度/半年度财务报告、银行存款余额调节表、银行对账单、纳税申报表
                        </p>
                      </div>

                      <div className="bg-white/60 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-bold text-emerald-700">定期 5 年</span>
                        </div>
                        <p className="text-xs text-amber-800">
                          固定资产卡片（仅此一项），自固定资产报废清理后起算
                        </p>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            ) : (
              /* ── 概览：法定依据 + 分类架构 ── */
              <div className="space-y-4">
                {/* 法规依据 */}
                <div className="bg-sky-50 border border-sky-200 rounded-xl px-5 py-3 flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-sky-600 shrink-0" />
                  <span className="text-[13px] font-medium text-sky-900">
                    法定依据：《会计档案管理办法》（财政部、国家档案局令第 79 号）·《会计档案整理规范》（DA/T 42-2022）
                  </span>
                </div>

                {/* 分类架构说明 */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <FolderTree className="w-4 h-4 text-slate-600" />
                      <h2 className="text-sm font-bold text-slate-800">分类架构</h2>
                    </div>
                  </div>
                  <div className="px-5 py-4 space-y-4">
                    {/* 默认架构 */}
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">默认架构（三级）</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-3 py-2 bg-slate-100 rounded-lg font-bold text-slate-700">会计年度</span>
                        <span className="text-slate-300">→</span>
                        <span className="px-3 py-2 bg-sky-50 rounded-lg font-bold text-sky-700 border border-sky-200">档案类别（4类固化）</span>
                        <span className="text-slate-300">→</span>
                        <span className="px-3 py-2 bg-amber-50 rounded-lg font-bold text-amber-700 border border-amber-200">档案明细（{totalDetailCount}项法定）</span>
                      </div>
                    </div>

                    {/* 集团扩展架构 */}
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-2">集团扩展架构（四级 · 可选）</p>
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="px-3 py-2 bg-slate-100 rounded-lg font-bold text-slate-700">会计年度</span>
                        <span className="text-slate-300">→</span>
                        <span className="px-3 py-2 bg-emerald-50 rounded-lg font-bold text-emerald-700 border border-emerald-200">
                          <Building2 className="w-3 h-3 inline mr-1" />组织机构
                        </span>
                        <span className="text-slate-300">→</span>
                        <span className="px-3 py-2 bg-sky-50 rounded-lg font-bold text-sky-700 border border-sky-200">档案类别</span>
                        <span className="text-slate-300">→</span>
                        <span className="px-3 py-2 bg-amber-50 rounded-lg font-bold text-amber-700 border border-amber-200">档案明细</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 四类别速览入口 */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-600" />
                    <h2 className="text-sm font-bold text-slate-800">法定归档范围 · 保管期限映射</h2>
                    <span className="text-[11px] text-slate-400">共 4 大类 {totalDetailCount} 项明细</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 p-4">
                    {ARCHIVE_CATEGORIES.map((cat) => (
                      <button
                        key={cat.code}
                        type="button"
                        onClick={() => setActiveKey(cat.code)}
                        className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 transition-colors text-left cursor-pointer"
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          cat.code === 'KP' ? 'bg-sky-100 text-sky-700' :
                          cat.code === 'KB' ? 'bg-emerald-100 text-emerald-700' :
                          cat.code === 'FB' ? 'bg-violet-100 text-violet-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {cat.code}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-700">{cat.name}</div>
                          <div className="text-[11px] text-slate-400 truncate">{cat.details.length} 项明细 · {cat.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RetentionConfigPage;
