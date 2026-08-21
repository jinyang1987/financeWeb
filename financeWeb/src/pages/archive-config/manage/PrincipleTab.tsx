/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PrincipleTab — 档案管理配置 · 原理说明（2026-08-21 说教内容统一收口）
 *
 * 全系统只读型说明内容的唯一出口（原分散在档号规则/组卷盒号/元数据配置
 * 三个页面的说明分区，统一迁入，各功能页只留可操作项）：
 *
 *   ① 整理流程      —— 收集→组卷→检测→赋号→移交装盒全流程与统一入池口径
 *   ② 凭证组卷规则  —— 不跨月/不混号/一件构成/制单日期+凭证号排序/子类型分段
 *   ③ 账簿组卷规则  —— 按年、子类型独立、订本/活页、固定资产卡片
 *   ④ 报告组卷规则  —— 年度(永久)单独、中期(10年)合并、卷内顺序
 *   ⑤ 其他资料规则  —— 按类型+期限、管理衔接资料单独组卷
 *   ⑥ 档号体系      —— 结构逐段解析、四大刚性原则、固定格式、流水号、红线、规范溯源
 *   ⑦ 元数据体系    —— 盒→卷→件→凭证四级穿透、M/V/VA/B 系列方案依据
 *   ⑧ 盒号与装盒    —— 盒号定位、合规基础层、三重校验、管理规则
 *
 * 规则内容依据：《会计档案管理办法》(79号令) · DA/T 13-2022 · DA/T 39-2008 ·
 * DA/T 42-2022 · DA/T 94-2022 · GB/T 44555-2024，以及《中国大陆会计档案
 * 组卷规则真实业务详报》（机关/事业/企业三类主体实操差异）。
 */

import React, { useState } from 'react';
import {
  ArrowRight, BookOpen, Lock, Shield, Ban, AlertTriangle, CheckCircle2,
  FileInput, Briefcase, FileSpreadsheet, FolderArchive, Package, Box,
  Layers, Hash, Link2, Archive, GitBranch,
  Scissors, Clock, LayoutGrid, type LucideIcon,
} from 'lucide-react';

// ============================================================
// 通用小件
// ============================================================

/** 规则条目卡（icon + 标题 + 说明） */
const RuleItem: React.FC<{ icon: React.ReactNode; title: string; desc: string; tone?: 'plain' | 'red' | 'amber' | 'sky' | 'emerald' }> = ({
  icon, title, desc, tone = 'plain',
}) => {
  const cls = {
    plain: 'bg-slate-50 border-slate-200',
    red: 'bg-red-50/60 border-red-100',
    amber: 'bg-amber-50 border-amber-200',
    sky: 'bg-sky-50 border-sky-200',
    emerald: 'bg-emerald-50 border-emerald-200',
  }[tone];
  const titleCls = { plain: 'text-slate-800', red: 'text-red-800', amber: 'text-amber-800', sky: 'text-sky-800', emerald: 'text-emerald-800' }[tone];
  const descCls = { plain: 'text-slate-600', red: 'text-red-700', amber: 'text-amber-700', sky: 'text-sky-700', emerald: 'text-emerald-700' }[tone];
  return (
    <div className={`flex items-start gap-3 p-3 border rounded-lg ${cls}`}>
      <span className="shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className={`text-sm font-bold ${titleCls}`}>{title}</p>
        <p className={`text-xs mt-0.5 leading-relaxed ${descCls}`}>{desc}</p>
      </div>
    </div>
  );
};

/** 分区卡片外壳（与功能 Tab 同款） */
const SectionCard: React.FC<{ title: string; icon: React.ReactNode; badge?: string; children: React.ReactNode }> = ({
  title, icon, badge, children,
}) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
      {icon}
      <span className="text-sm font-bold text-slate-800">{title}</span>
      {badge && <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{badge}</span>}
    </div>
    <div className="px-5 py-4">{children}</div>
  </div>
);

/** 流程步骤条 */
const FlowSteps: React.FC<{ steps: string[] }> = ({ steps }) => (
  <div className="flex items-center gap-2 text-xs flex-wrap">
    {steps.map((s, i) => (
      <React.Fragment key={s}>
        {i > 0 && <ArrowRight className="w-4 h-4 text-slate-300" />}
        <span className={`px-3 py-1.5 rounded-lg font-bold ${
          i === steps.length - 1 ? 'bg-amber-100 text-amber-700' : i >= steps.length - 2 ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
        }`}>{s}</span>
      </React.Fragment>
    ))}
  </div>
);

// ============================================================
// ① 整理流程
// ============================================================

const FlowPanel: React.FC = () => (
  <div className="space-y-4">
    <SectionCard title="会计档案整理全流程" icon={<GitBranch className="w-4 h-4 text-sky-500" />} badge="系统流程强管控 · 不可逆">
      <div className="space-y-4">
        <FlowSteps steps={['① 收集入池', '② 组件成件', '③ 组卷', '④ 四性检测', '⑤ 确认赋号', '⑥ 移交装盒', '⑦ 上架']} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="font-bold text-slate-700 mb-1">①② 收集与组件</p>
            <p className="text-slate-500 leading-relaxed">
              抓取（用友BIP拉取）/ 推送（开放接口）/ 手动上传，三路来源的件<span className="text-sky-700 font-medium">统一进入组卷工作台待组卷池</span>。
              一个单位通常只采用「抓取+手动」或「推送+手动」一种组合。
              散着的原始凭证先在待组卷池【组件】挂接到所属记账凭证，形成「一件」。
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="font-bold text-slate-700 mb-1">③④⑤ 组卷与确认</p>
            <p className="text-slate-500 leading-relaxed">
              在组卷工作台按类别规则组卷（手工勾选 / 智能组卷推荐），
              卷级四性检测通过后「确认组卷」，服务端按档号规则赋正式档号（赋号时机可配）。
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="font-bold text-slate-700 mb-1">⑥⑦ 移交与上架</p>
            <p className="text-slate-500 leading-relaxed">
              已确认案卷「移交至档案保管」，服务端自动找/建同类别+年度+期限的档案盒归盒；
              可随移交一并上架（自动/指定架位），或在实体档案库房补上架。
            </p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p><strong>流程权限强管控：</strong>先组卷 → 后装盒 → 再编号，逻辑不可逆；仅完成组卷、已生成正式档号的案卷才可进入装盒与移交。盒上架后不再接收新卷，后续同类别案卷移交将自动开新盒。</p>
        </div>
      </div>
    </SectionCard>

    <SectionCard title="「一件」的构成（组件规则）" icon={<Layers className="w-4 h-4 text-sky-500" />} badge="组卷最小单元">
      <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
        <p>
          <strong className="text-slate-800">1 张记账凭证 + 其全部原始凭证附件 = 一件</strong>。
          一件是组卷的最小单元：诸多「件」按 制单日期+凭证号 顺序排列成一卷。
          原始凭证不能脱离所属记账凭证单独成卷（附件过多确需单独装订的「附件另订」场景除外，系统会二次确认放行）。
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-[11px] text-slate-500">
          电子凭证组件顺序（DA/T 94-2022）：记账凭证 → 内部原始凭证 → 外来原始凭证；同一件内所有电子文件设置唯一且关联的归档编号。
        </div>
        <p>
          推送过来的数据可能已关联好原始凭证（即成「件」），也可能是散件；
          散件在待组卷池勾选 1 张记账凭证 + N 张原始凭证后点【组件】即可成件，成件后随凭证整体组卷、整体移动。
        </p>
      </div>
    </SectionCard>

    <SectionCard title="装盒三重自动合规校验" icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} badge="DA/T 42-2022">
      <div className="space-y-2.5">
        <RuleItem icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} title="一、分类边界校验"
          desc="自动过滤非同一年度、同一二级类别、同一保管期限的档案，禁止跨类混装。" />
        <RuleItem icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} title="二、排列顺序校验"
          desc="仅支持按档号连续排列的档案装入同一档案盒，打乱顺序将被自动拦截。" />
        <RuleItem icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} title="三、容量适配校验"
          desc="根据选定档案盒厚度规格自动测算装盒容量，避免超量装订导致档案破损。" />
      </div>
    </SectionCard>
  </div>
);

// ============================================================
// ②③④⑤ 四类组卷规则（依据业务详报浓缩）
// ============================================================

const VoucherRulePanel: React.FC = () => (
  <div className="space-y-4">
    <SectionCard title="凭证类 · 刚性规则（全国统一，无灵活空间）" icon={<Lock className="w-4 h-4 text-red-500" />} badge="79号令 · DA/T 42">
      <div className="space-y-2.5">
        <RuleItem tone="red" icon={<Scissors className="w-4 h-4 text-red-500" />} title="不跨月"
          desc="同一册凭证只能归集同一月份的同类凭证（组卷周期 = 月），不得跨月合并装订。" />
        <RuleItem tone="red" icon={<Hash className="w-4 h-4 text-red-500" />} title="不混号"
          desc="同册凭证的编号必须连续且唯一，不得断号、跳号、重号；存在断号时仍可组卷，缺口记录在备考表。系统提供凭证号连续性检测（绿/黄状态条）。" />
        <RuleItem tone="red" icon={<Layers className="w-4 h-4 text-red-500" />} title="附件关联匹配"
          desc="记账凭证后必须按业务归集顺序附对应原始凭证，保持业务关联；原始凭证随所属记账凭证整体组卷（一件）。" />
        <RuleItem tone="red" icon={<Clock className="w-4 h-4 text-red-500" />} title="卷内顺序 = 制单日期 + 凭证号"
          desc="卷内排列按会计分录形成先后：先按制单日期、同日内按凭证号升序。这也是待组卷池与智能组卷的统一排序口径。" />
      </div>
    </SectionCard>

    <SectionCard title="单位类型差异：分类精细度" icon={<Briefcase className="w-4 h-4 text-amber-500" />} badge="可选配置">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
          <p className="font-bold text-slate-700 mb-1">机关 / 行政事业单位（含社会团体）</p>
          <p className="text-slate-500 leading-relaxed">
            按「资金流向+业务性质」细分：收款、付款、转账、财政拨款凭证<span className="text-amber-700 font-medium">分段归集</span>（同册按类型分段、凭证盒脊标注起止号区间）；
            财政拨款凭证不与日常经费凭证混装。
            → 在「组卷盒号 → 按档案类别独立配置」开启<b>按凭证子类型分段</b>。
          </p>
        </div>
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
          <p className="font-bold text-slate-700 mb-1">企业（含金融机构、连锁经营）</p>
          <p className="text-slate-500 leading-relaxed">
            可直接按「月 → 凭证编号」顺序组卷，无需按业务类型细分（多数企业选择此方案，编号本身全月顺序编制，不影响查阅效率）。
            → 系统默认（子类型分段关闭）。
          </p>
        </div>
      </div>
    </SectionCard>

    <SectionCard title="装订与分册技术要点" icon={<Package className="w-4 h-4 text-sky-500" />} badge="实操参考">
      <div className="space-y-2.5">
        <RuleItem icon={<Package className="w-4 h-4 text-sky-500" />} title="每册厚度 ≤ 10cm（系统口径：每卷件数上限，默认 50 件）"
          desc="当月凭证过多时，同类凭证按凭证号段拆分为「主凭证册 + 附件补充册」，封面注明「共 X 册，第 Y 册」。" />
        <RuleItem icon={<FolderArchive className="w-4 h-4 text-sky-500" />} title="附件另订"
          desc="原始凭证数量过多（如 POS 小票、入库单）可单独装订成附件补充册，须在记账凭证上注明「附件另订」及编号、名称、数量；保管期限与对应记账凭证一致。重要原始凭证（合同、保证金收据等）单独编目保管，双向互注关联信息。" />
        <RuleItem icon={<FileInput className="w-4 h-4 text-sky-500" />} title="卷内装订范式"
          desc="凭证封面 → 科目汇总表/试算平衡表 → 记账凭证（按号升序）→ 每张记账凭证后附原始凭证 → 凭证封底。电子凭证逻辑封装须含同一件全部电子文件、元数据与审批日志，PDF/A 格式长期保存。" />
      </div>
    </SectionCard>
  </div>
);

const LedgerRulePanel: React.FC = () => (
  <div className="space-y-4">
    <SectionCard title="账簿类 · 组卷规则" icon={<Briefcase className="w-4 h-4 text-amber-500" />} badge="DA/T 42-2022">
      <div className="space-y-2.5">
        <RuleItem tone="red" icon={<Clock className="w-4 h-4 text-red-500" />} title="按会计年度组卷"
          desc="先按会计年度划分，再按账簿用途类型细分，最后按保管期限组卷。" />
        <RuleItem tone="red" icon={<Layers className="w-4 h-4 text-red-500" />} title="按子类型独立组卷"
          desc="总账、明细账、日记账、固定资产卡片、其他辅助性账簿各自独立成卷，不得混装；案卷排列顺序为 总账→明细账→日记账→固定资产卡片→辅助性账簿。系统智能组卷默认开启「按账簿子类型独立组卷」。" />
        <RuleItem icon={<BookOpen className="w-4 h-4 text-sky-500" />} title="订本式 vs 活页式"
          desc="订本式账簿（现金/银行存款日记账等）不得拆去空白账页，保持原装订，末行划红线封账，备考表记明使用/空白页数；活页式账簿（多数明细账）须抽出空白页，按账户顺序重排编页码，加装封面、启用表、账户目录后装订。" />
        <RuleItem icon={<Archive className="w-4 h-4 text-sky-500" />} title="固定资产卡片"
          desc="单独组卷，可按使用部门/资产类别分卷；保管期限为「固定资产报废清理后保管 5 年」；卷内顺序与固定资产台账编号一致，验收单、折旧计提表、报废审批单等可附于对应卡片后。" />
        <RuleItem icon={<Link2 className="w-4 h-4 text-sky-500" />} title="辅助性账簿"
          desc="与主体业务无直接关联的可单独组卷（页数少可同年度合并）；与主体业务直接关联的，随相关总账、明细账归集合并组卷。保管期限 30 年；合并组卷须在备考表注明所含账簿名称与页数。" />
      </div>
    </SectionCard>
  </div>
);

const ReportRulePanel: React.FC = () => (
  <div className="space-y-4">
    <SectionCard title="报告类 · 组卷规则" icon={<FileSpreadsheet className="w-4 h-4 text-emerald-500" />} badge="DA/T 42-2022">
      <div className="space-y-2.5">
        <RuleItem tone="red" icon={<Lock className="w-4 h-4 text-red-500" />} title="年度报告（永久）单独组卷"
          desc="年度财务会计报告单独组卷，不得与其他周期报告混装，保管期限永久；机关/事业单位的政府综合财务报告、部门财务报告、部门决算报告三类严格分开。" />
        <RuleItem tone="red" icon={<Layers className="w-4 h-4 text-red-500" />} title="中期报告（10年）可合并组卷"
          desc="月度、季度、半年度报告可合并组卷，按时间先后排列，保管期限 10 年；单份页数过多可单独装订、统一归在一个案卷编号下。系统默认开启「年度报告与中期报告分开组卷」。" />
        <RuleItem icon={<ArrowRight className="w-4 h-4 text-sky-500" />} title="卷内顺序"
          desc="报表封面 → 报表编制说明 → 主表（资产负债表/利润表/现金流量表/所有者权益变动表）→ 附表 → 附注 → 财务情况说明书 → 审计报告 → 批复文件；材料过多可分册，封面注明「共 X 册，第 Y 册」。" />
        <RuleItem icon={<Shield className="w-4 h-4 text-sky-500" />} title="审计报告随附 + 签章完备"
          desc="注册会计师出具的审计报告必须完整归集在对应年度报告之后（多个审计报告按审计对象顺序归集）。报告封面/扉页须具备完整签章审批手续（单位负责人、会计机构负责人、会计主管、编制/审核/审计人员 + 公章/财务专用章；电子报告须合规电子签名并与签名日志同步归档），手续不全不得归档。" />
      </div>
    </SectionCard>
  </div>
);

const OtherRulePanel: React.FC = () => (
  <div className="space-y-4">
    <SectionCard title="其他会计资料 · 组卷规则" icon={<FolderArchive className="w-4 h-4 text-slate-500" />} badge="DA/T 42-2022">
      <div className="space-y-2.5">
        <RuleItem tone="red" icon={<Layers className="w-4 h-4 text-red-500" />} title="按「年度 + 资料类型」组卷"
          desc="同一年度内形成的同类型资料按时间先后排列组卷；页数较少时，可将同一年度内不同类型的核算补充资料合并组卷（备考表注明所含资料名称与页数）。" />
        <RuleItem tone="red" icon={<Lock className="w-4 h-4 text-red-500" />} title="管理衔接资料单独组卷（刚性）"
          desc="会计档案移交清册、保管清册、销毁清册、鉴定意见书必须单独组卷，不得与其他资料混装；卷内顺序严格按 移交清册→保管清册→销毁清册→鉴定意见书；纸质签字审批件在对应环节完成后同步归集。保管期限 30 年/永久。" />
        <RuleItem icon={<FileSpreadsheet className="w-4 h-4 text-sky-500" />} title="核算补充资料（10年/30年）"
          desc="银行存款余额调节表、银行对账单、纳税申报表、社保申报表、电算化初始化数据与日志备份等单独组卷；行业惯例：行政事业单位多将银行对账单/调节表与决算报表关联组卷、纳税申报表单独组卷，企业可将纳税申报表与当月凭证合并组卷。" />
        <RuleItem icon={<ArrowRight className="w-4 h-4 text-sky-500" />} title="案卷排列位置"
          desc="其他类案卷按保管期限分别排列在对应期限档案案卷的最后面（永久其他类排在永久类最后，30 年/10 年同理）。" />
      </div>
    </SectionCard>
  </div>
);

// ============================================================
// ⑥ 档号体系（原「档号规则配置」说教分区迁入）
// ============================================================

const RIGID_RULES: { category: string; items: { rule: string; detail: string }[] }[] = [
  {
    category: '四大核心编制原则',
    items: [
      { rule: '唯一性原则', detail: '同一档案室范围内，一份档案只能对应一个档号，一个档号只能指代一份档案，严禁重号、一号多档、一档多号' },
      { rule: '一致性原则', detail: '档号的层级结构必须与本单位会计档案分类体系完全对应，分类有多少层级，档号就对应多少层级；流水顺序必须与物理排列顺序完全一致' },
      { rule: '稳定性原则', detail: '档号编制规则一经确定并正式启用，不得随意变更；单份档案的档号一经赋予，全生命周期内不得修改' },
      { rule: '合理性原则', detail: '档号结构必须层级清晰、简洁明了，不得设置无实际分类意义的冗余层级' },
    ],
  },
  {
    category: '固定标识与格式',
    items: [
      { rule: '门类代码统一为 KU', detail: '会计档案门类代码统一使用大写拼音字母 KU（DA/T 13-2022 附录示例明确），用于区分文书（WS）、科技（KJ）、人事（RS）等其他档案门类，不得自行编制其他字母替代' },
      { rule: '年度编码 4 位数字', detail: '年度必须采用 4 位阿拉伯数字标识公历自然年度（如 2025），严格对应会计年度，不得使用 2 位缩写、农历年度或自定义财年年度' },
      { rule: '分隔符固定', detail: '不同层级之间使用半角连字符 - 连接；同一层级多个分类维度之间使用半角间隔号 · 分隔。不得使用下划线、斜杠、中文标点等' },
      { rule: '字符集限制', detail: '仅可使用大写英文字母、阿拉伯数字、上述两种法定分隔符（- 和 ·），不得包含中文、特殊符号、空格等内容' },
    ],
  },
  {
    category: '分类维度底线',
    items: [
      { rule: '年度 + 二级类别不可省略', detail: '档号必须覆盖"年度"和"会计档案二级类别"两个核心分类维度；二级类别严格对应法定四大类（会计凭证类、会计账簿类、财务会计报告类、其他会计资料类），不得合并、删减或增设' },
    ],
  },
  {
    category: '流水号编制',
    items: [
      { rule: '连续流水，不得跳号断号', detail: '案卷号、件号均需按对应分类维度下的排列顺序连续流水编制；同一年度、同一类别下不得跳号、断号' },
      { rule: '位数统一', detail: '流水号位数在同一分类维度内必须统一，不足位数在前补零（如 0001）；不得在同一类别同一维度下混合使用不同位数' },
    ],
  },
];

const STANDARD_HIERARCHY = [
  { code: '79号令', name: '《会计档案管理办法》', publisher: '财政部、国家档案局', year: '2016', role: '上位规章 — 明确会计档案的法定分类与整理原则，是档号规则的合规底层基础' },
  { code: 'DA/T 13-2022', name: '《档号编制规则》', publisher: '国家档案局', year: '2022', role: '档号总规则 — 全国所有门类档案档号编制的统一通用规范，替代 1994 版', replaces: 'DA/T 13-1994' },
  { code: 'DA/T 42-2022', name: '《会计档案整理规范》', publisher: '国家档案局', year: '2022', role: '会计专项 — 针对会计档案的分类体系、整理流程、编号逻辑给出专项要求' },
  { code: 'DA/T 94-2022', name: '《电子会计档案管理规范》', publisher: '国家档案局', year: '2022', role: '电子专项 — 补充电子会计档案的档号绑定、元数据匹配、双套制对应规则' },
];

const CODE_BREAKDOWN = [
  { segment: 'J019', meaning: '全宗号（档案馆统一赋予或企业自定义）' },
  { segment: 'KU', meaning: '档案门类代码（会计档案，刚性固化）' },
  { segment: '01', meaning: '二级类别号（会计凭证类）' },
  { segment: '2025', meaning: '会计年度（公历自然年度，刚性固化）' },
  { segment: '003', meaning: '案卷号（该年度第 3 卷凭证，流水号位数可配）' },
  { segment: '012', meaning: '件号（卷内第 12 份文件，流水号位数可配）' },
];

const CodePrinciplePanel: React.FC = () => (
  <div className="space-y-4">
    <SectionCard title="标准档号结构（统一按卷管理）" icon={<Package className="w-4 h-4 text-sky-600" />} badge="DA/T 13-2022">
      <div className="border border-sky-200 bg-gradient-to-b from-sky-50/30 to-white rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs text-slate-500">件组成卷，档号含案卷号 + 卷内件号，适用于全部纸质与电子会计档案</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1">结构公式</p>
          <p className="font-mono text-xs text-slate-700 bg-slate-100 rounded-lg p-2.5 leading-relaxed break-all">
            全宗号 - 档案门类代码·二级类别号·年度 - 案卷号 - 件号
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1">档号示例</p>
          <span className="inline-block font-mono text-base font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2">
            J019-KU·01·2025-003-012
          </span>
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-2">逐段解析</p>
          <div className="space-y-1.5">
            {CODE_BREAKDOWN.map((seg) => (
              <div key={seg.segment} className="flex items-center gap-2 text-xs">
                <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded min-w-[50px] text-center">
                  {seg.segment}
                </span>
                <ArrowRight className="w-3 h-3 text-slate-300" />
                <span className="text-slate-500">{seg.meaning}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>

    <SectionCard title="全国统一刚性规则" icon={<Lock className="w-4 h-4 text-red-500" />} badge="不可自定义 · 系统强制校验">
      <div className="space-y-5">
        {RIGID_RULES.map((group) => (
          <div key={group.category}>
            <h3 className="text-sm font-bold text-slate-700 mb-2.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              {group.category}
            </h3>
            <div className="space-y-2">
              {group.items.map((item) => (
                <div key={item.rule} className="flex items-start gap-3 p-3 bg-red-50/50 border border-red-100 rounded-lg">
                  <Shield className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-800">{item.rule}</p>
                    <p className="text-xs text-red-700 mt-0.5 leading-relaxed">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>

    <SectionCard title="赋号时机说明" icon={<Clock className="w-4 h-4 text-emerald-500" />} badge="两种模式如何选">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
        <div className="border border-sky-200 bg-sky-50/50 rounded-lg p-3">
          <p className="font-bold text-sky-800 mb-1">组卷时赋号（默认推荐）</p>
          <p className="text-sky-700 leading-relaxed">确认组卷时自动按档号规则生成案卷号，适用于需要标准化档号管理、计划移交综合档案系统长期保存的档案。</p>
        </div>
        <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3">
          <p className="font-bold text-amber-800 mb-1">不赋号（会计档案自有用号体系）</p>
          <p className="text-amber-700 leading-relaxed">会计档案通常使用自身凭证号体系（如「记-001」），无需额外编写系统档号；确认后案卷标记为「已确认」，可直接移交。</p>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-3">在「档号规则 → 赋号时机」中切换，服务端赋号引擎即配即生效；历史档号保持原样，不批量回溯修改。</p>
    </SectionCard>

    <SectionCard title="电子会计档案专项要求" icon={<Shield className="w-4 h-4 text-sky-500" />} badge="DA/T 94-2022">
      <div className="space-y-2.5">
        <RuleItem tone="sky" icon={<CheckCircle2 className="w-4 h-4 text-sky-600" />} title="双套制一致性"
          desc="实行纸质+电子双套归档的单位，电子档案与对应纸质档案的档号必须完全一致、一一对应，不得采用两套编号规则。" />
        <RuleItem tone="sky" icon={<CheckCircle2 className="w-4 h-4 text-sky-600" />} title="元数据绑定"
          desc="档号必须作为电子档案的核心元数据字段嵌入档案管理系统，与电子文件永久绑定，不得分离。" />
        <RuleItem tone="sky" icon={<CheckCircle2 className="w-4 h-4 text-sky-600" />} title="页号扩展"
          desc="如需对单份电子文件内的页码进行标识，可在件号后追加页号层级，格式为「档号-页号」，页号按文件内顺序连续流水编制。" />
        <RuleItem tone="sky" icon={<CheckCircle2 className="w-4 h-4 text-sky-600" />} title="组件规则"
          desc="多份电子文件组成一件档案的，需编制统一的件号，组件内的单份文件编制组件内顺序号，不得单独编件号。" />
      </div>
    </SectionCard>

    <SectionCard title="合规红线与变更约束" icon={<Ban className="w-4 h-4 text-red-500" />} badge="不可突破的底线">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            '不得修改会计档案门类代码 KU',
            '不得删减二级类别与年度核心维度',
            '不得违反唯一性原则（一档一号）',
            '不得更换法定分隔符（- 和 ·）',
            '不得使用中文、特殊符号、空格',
            '不得在同年同类下跳号、断号',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
              <Ban className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="text-xs text-red-800 font-medium">{item}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />突破以上规则的档号<strong>不符合档案合规要求</strong>，无法通过档案行政管理部门的检查与进馆验收。
        </p>
        <div className="border-t border-slate-200 pt-3 space-y-2">
          <RuleItem icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} title="配置锁定与审批"
            desc="系统默认内置符合行业标准的档号规则：刚性规则设为强制校验项（不可修改），可自定义项设为管理员初始化配置项，设置后默认锁定；如需修改需走审批流程并留存操作日志。" />
          <RuleItem tone="amber" icon={<AlertTriangle className="w-4 h-4 text-amber-600" />} title="变更留痕要求"
            desc="所有规则调整必须记录调整时间、调整人、调整内容；历史档案档号保持原样，不得批量回溯修改，确保档案历史的真实性与可追溯性。" />
        </div>
      </div>
    </SectionCard>

    <SectionCard title="规范溯源与效力层级" icon={<BookOpen className="w-4 h-4 text-sky-600" />} badge="4 层规范体系">
      <div className="space-y-3">
        {STANDARD_HIERARCHY.map((ref, idx) => (
          <div key={ref.code} className="flex items-start gap-4 p-3 bg-slate-50 rounded-lg">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-sky-700">{idx + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-slate-700">{ref.name}</span>
                <span className="text-[11px] text-sky-500 bg-sky-50 px-1.5 py-0.5 rounded font-mono">{ref.code}</span>
                {ref.replaces && (
                  <span className="text-[10px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">替代 {ref.replaces}</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{ref.publisher} · {ref.year}</p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{ref.role}</p>
            </div>
          </div>
        ))}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          <strong>补充说明：</strong>DA/T 系列为档案行业推荐性标准，但在全国各级档案行政管理部门的合规检查、国家档案馆进馆验收中均作为事实强制执行标准。涉及档案移交进馆的单位，还需同时符合属地档案馆的进馆细则（细则不得突破上述行业标准的核心框架）。
        </div>
      </div>
    </SectionCard>
  </div>
);

// ============================================================
// ⑦ 元数据体系（原「元数据配置」方案说明迁入）
// ============================================================

const MetadataPrinciplePanel: React.FC = () => (
  <div className="space-y-4">
    <SectionCard title="盒 → 卷 → 件 → 原始凭证 四级穿透" icon={<LayoutGrid className="w-4 h-4 text-sky-500" />} badge="统一按卷管理">
      <div className="flex items-center gap-2 text-xs flex-wrap mb-3">
        <span className="px-3 py-1.5 bg-teal-100 text-teal-700 rounded-lg font-bold">盒（B 系列）</span>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-bold">卷（V 系列）</span>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <span className="px-3 py-1.5 bg-sky-100 text-sky-700 rounded-lg font-bold">件（M 系列）</span>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <span className="px-3 py-1.5 bg-violet-100 text-violet-700 rounded-lg font-bold">原始凭证</span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">
        会计档案统一按卷管理，件级元数据（M1-M49）与卷级元数据（V1-V20）及卷件关联（VA1-VA6）合并展示，
        不再区分纯电子/纸质数字化模式；盒→卷→件→原始凭证四级数据自上而下穿透与自下而上溯源。
      </p>
    </SectionCard>

    <SectionCard title="方案构成与依据" icon={<BookOpen className="w-4 h-4 text-sky-600" />} badge="DA/T 94 · DA/T 39 · DA/T 42">
      <div className="space-y-2.5">
        <RuleItem icon={<FileSpreadsheet className="w-4 h-4 text-sky-500" />} title="件级元数据 M1-M49（DA/T 94-2022 附录A，规范性）"
          desc="电子会计档案元数据方案：文件实体（表A.1）、机构人员实体（表A.2）、业务实体（表A.3）、实体关系（表A.4），描述电子文件内容、结构、形式特征与管理业务。" />
        <RuleItem icon={<BookOpen className="w-4 h-4 text-amber-500" />} title="卷级元数据 V1-V20（DA/T 39-2008 案卷格式）"
          desc="依据《会计档案案卷格式》卷皮/卷内目录/备考表格式要求，描述案卷整卷实体（档号、题名、类别号、年度、期限、卷内件数、起止日期等）。" />
        <RuleItem icon={<GitBranch className="w-4 h-4 text-orange-500" />} title="卷件关联 VA1-VA6（纸质数字化实务）"
          desc="件级电子文件与卷级实体案卷的双向关联（纸质数字化副本 ↔ 原纸质案卷）：关联类型、卷档号、件档号、件号、起止页号。" />
        <RuleItem icon={<Archive className="w-4 h-4 text-teal-500" />} title="盒级元数据 B1-B29（DA/T 39 + DA/T 42 + DA/T 94）"
          desc="卷盒封面脊背法定必填项 + DA/T 42-2022 装盒分类边界（同年同类同期限方可装盒）+ DA/T 94-2022 双套制关联扩展（批次号、介质标识、校验状态），覆盖标识/分类/内容范围/物理位置/流程管理/双套制六大类。" />
      </div>
      <div className="mt-3 text-xs text-slate-400 bg-slate-50 rounded-lg p-3 leading-relaxed space-y-0.5">
        <p>件级数据来源：《DA/T 94—2022 电子会计档案管理规范》附录A（规范性）电子会计档案元数据方案 · 国家档案局 2022-07-01 实施</p>
        <p>卷级数据来源：《DA/T 39—2008 会计档案案卷格式》卷皮/卷盒格式 · 卷件关联依据"纸质数字化副本与原件关联"实务规范</p>
        <p>盒级数据来源：《DA/T 39—2008》卷盒封面脊背必填项 +《DA/T 42—2022》装盒分类边界规则 +《DA/T 94—2022》双套制电子关联扩展</p>
      </div>
    </SectionCard>
  </div>
);

// ============================================================
// ⑧ 盒号与装盒（原「组卷盒号配置」说教分区迁入）
// ============================================================

const BoxPrinciplePanel: React.FC = () => (
  <div className="space-y-4">
    <SectionCard title="盒号的定位" icon={<Box className="w-4 h-4 text-sky-500" />} badge="排架管理编码">
      <p className="text-xs text-slate-600 leading-relaxed">
        盒号为<span className="font-bold text-slate-800">实体档案容器排架管理编码</span>，用于库房密集架定位与盘点，
        <span className="text-sky-700 font-medium">不属于法定档号核心构成元素</span>，不替代案卷号/件号。
        盒号在装盒完成时按编码规则生成并锁定；档案盒信息展示盒内起止档号与完整明细，与档号双向关联。
      </p>
    </SectionCard>

    <SectionCard title="合规基础层（自动同步档号模块）" icon={<Shield className="w-4 h-4 text-red-500" />} badge="系统强制固化">
      <p className="text-xs text-slate-500 mb-3">
        以下维度自动同步档号编制规则，确保盒号分类口径与档案分类体系、档号编制规则完全一致。
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: '全宗号', value: 'Z001' },
          { label: '门类代码', value: 'KU' },
          { label: '二级类别', value: '01=凭证 / 02=账簿 / 03=报告 / 04=其他' },
          { label: '保管期限', value: 'D30 / D10 / Y / D5' },
          { label: '年度', value: '2026' },
        ].map((item) => (
          <div key={item.label} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
            <div className="text-[10px] text-slate-400 mb-0.5">{item.label}</div>
            <div className="text-xs font-bold text-slate-700 font-mono">{item.value}</div>
          </div>
        ))}
      </div>
    </SectionCard>

    <SectionCard title="盒号管理规则" icon={<Shield className="w-4 h-4 text-amber-500" />} badge="锁定 · 关联 · 追溯">
      <div className="space-y-2.5">
        <RuleItem tone="red" icon={<Lock className="w-4 h-4 text-red-500" />} title="盒号锁定与变更审批"
          desc="盒号一经正式生成即默认锁定，变更需提交专属审批流程，全程留痕。" />
        <RuleItem tone="sky" icon={<Hash className="w-4 h-4 text-sky-500" />} title="盒号与档号双向关联"
          desc="单份档案元数据同步存储盒号；档案盒信息展示盒内起止档号与完整明细。" />
        <RuleItem tone="sky" icon={<CheckCircle2 className="w-4 h-4 text-sky-500" />} title="纸质+电子双套制一致"
          desc="纸质盒号自动同步至电子档案，双套档案的盒号、档号双重匹配。" />
        <RuleItem tone="emerald" icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} title="集团多主体分级隔离"
          desc="盒号规则支持按组织机构维度分级隔离，各独立核算单元独立流水。" />
        <RuleItem icon={<BookOpen className="w-4 h-4 text-violet-500" />} title="标准化卷盒封面自动生成"
          desc="根据盒号与盒内档案信息自动填充法定必填项，支持直接打印输出。" tone="plain" />
        <RuleItem tone="red" icon={<Ban className="w-4 h-4 text-red-500" />} title="合规红线"
          desc="尝试突破法定底线（跨类混装、流水号不隔离、跳号断号）将被自动拦截。" />
      </div>
    </SectionCard>
  </div>
);

// ============================================================
// 导航与主页面
// ============================================================

type SectionKey = 'flow' | 'voucher' | 'ledger' | 'report' | 'other' | 'code' | 'metadata' | 'box';

const NAV: { key: SectionKey; label: string; Icon: LucideIcon; badge?: string; badgeCls?: string; group?: string }[] = [
  { key: 'flow', label: '整理流程', Icon: GitBranch, badge: '全流程', badgeCls: 'bg-sky-50 text-sky-600', group: '业务流程' },
  { key: 'voucher', label: '凭证组卷规则', Icon: FileInput, badge: '刚性最强', badgeCls: 'bg-red-50 text-red-600', group: '四类组卷规则' },
  { key: 'ledger', label: '账簿组卷规则', Icon: Briefcase, badgeCls: 'bg-amber-50 text-amber-600', badge: 'DA/T 42' },
  { key: 'report', label: '报告组卷规则', Icon: FileSpreadsheet, badgeCls: 'bg-emerald-50 text-emerald-600', badge: 'DA/T 42' },
  { key: 'other', label: '其他资料规则', Icon: FolderArchive, badgeCls: 'bg-slate-100 text-slate-500', badge: 'DA/T 42' },
  { key: 'code', label: '档号体系', Icon: Hash, badge: '刚性规则', badgeCls: 'bg-red-50 text-red-600', group: '编码与元数据' },
  { key: 'metadata', label: '元数据体系', Icon: LayoutGrid, badge: 'M/V/VA/B', badgeCls: 'bg-sky-50 text-sky-600' },
  { key: 'box', label: '盒号与装盒', Icon: Box, badge: '三重校验', badgeCls: 'bg-emerald-50 text-emerald-600' },
];

const PrincipleTab: React.FC = () => {
  const [activeKey, setActiveKey] = useState<SectionKey>('flow');

  return (
    <div className="flex-1 overflow-y-auto p-6 w-full">
      <div className="max-w-6xl mx-auto flex gap-4 items-start">
        {/* ══ 左侧导航 ══ */}
        <aside className="w-64 shrink-0 bg-white border border-slate-200 rounded-xl overflow-hidden sticky top-0">
          <nav className="max-h-[78vh] overflow-y-auto p-2 space-y-0.5">
            {NAV.map((sec) => (
              <React.Fragment key={sec.key}>
                {sec.group && (
                  <div className="px-2 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{sec.group}</div>
                )}
                <button
                  type="button"
                  onClick={() => setActiveKey(sec.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                    activeKey === sec.key ? 'bg-sky-50 border border-sky-200' : 'border border-transparent hover:bg-slate-50'
                  }`}
                >
                  <sec.Icon className={`w-3.5 h-3.5 shrink-0 ${activeKey === sec.key ? 'text-sky-600' : 'text-slate-400'}`} />
                  <span className={`flex-1 text-xs font-medium truncate ${activeKey === sec.key ? 'text-sky-700' : 'text-slate-600'}`}>
                    {sec.label}
                  </span>
                  {sec.badge && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${sec.badgeCls || 'bg-slate-100 text-slate-500'}`}>
                      {sec.badge}
                    </span>
                  )}
                </button>
              </React.Fragment>
            ))}
          </nav>
          <div className="p-3 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed">
            <p>本页为全系统只读规则的唯一出口：79号令 · DA/T 13 · DA/T 39 · DA/T 42 · DA/T 94 · GB/T 44555。</p>
          </div>
        </aside>

        {/* ══ 右侧内容 ══ */}
        <div className="flex-1 min-w-0">
          {activeKey === 'flow' && <FlowPanel />}
          {activeKey === 'voucher' && <VoucherRulePanel />}
          {activeKey === 'ledger' && <LedgerRulePanel />}
          {activeKey === 'report' && <ReportRulePanel />}
          {activeKey === 'other' && <OtherRulePanel />}
          {activeKey === 'code' && <CodePrinciplePanel />}
          {activeKey === 'metadata' && <MetadataPrinciplePanel />}
          {activeKey === 'box' && <BoxPrinciplePanel />}
        </div>
      </div>
    </div>
  );
};

export default PrincipleTab;
