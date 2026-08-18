/**
 * 生成《会计档案管理系统操作手册》docx 包文件（无依赖，纯 Node）
 */

const fs = require('fs');
const path = require('path');

const OUT = 'D:/workspace/alfresco/.manual/pkg';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const p = (text, style) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

const bullet = (text) =>
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:ind w:left="420" w:hanging="210"/></w:pPr><w:r><w:t xml:space="preserve">• ${esc(text)}</w:t></w:r></w:p>`;

const step = (n, text) =>
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:ind w:left="420" w:hanging="210"/></w:pPr><w:r><w:t xml:space="preserve">${n}. ${esc(text)}</w:t></w:r></w:p>`;

const table = (rows) => {
  const cols = rows[0].length;
  const gridCols = Array(cols).fill('<w:gridCol w:w="2400"/>').join('');
  const tr = (cells, header) =>
    `<w:tr>${cells.map((c) =>
      `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/>${header ? '<w:shd w:fill="E8F0FE"/>' : ''}</w:tcPr>` +
      `<w:p><w:r>${header ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(c)}</w:t></w:r></w:p></w:tc>`
    ).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>` +
    `<w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>` +
    `<w:tblGrid>${gridCols}</w:tblGrid>` +
    rows.map((r, i) => tr(r, i === 0)).join('') +
    `</w:tbl>`;
};

const B = [];

B.push(p('会计档案管理系统', 'Title'));
B.push(p('操作手册', 'Title'));
B.push(p('（电子会计档案全生命周期管理平台 · 基于 DA/T 13/42/94 与 79 号令设计）', 'Subtitle'));
B.push(p('版本 V1.0 · 2026-08-18', 'Subtitle'));
B.push(p(''));

B.push(p('阅读指南', 'Heading1'));
B.push(p('本手册按「系统概述 → 角色与登录 → 各业务域操作 → 配置与系统管理 → 附录」组织。每个功能按【用途 / 入口 / 操作步骤 / 规则与注意事项】四段式说明，先看章节标题即可定位。'));
B.push(p('系统主线：档案收集（抓取/推送/上传）→ 核对审核 → 组卷 → 四性检测 → 确认赋号 → 移交归盒 → 上架保管 → 检索利用（借阅审批）→ 到期鉴定销毁，全流程状态机驱动、操作留痕。'));

B.push(p('第 1 章 系统概述', 'Heading1'));
B.push(p('1.1 系统定位', 'Heading2'));
B.push(p('会计档案管理系统是面向财务与档案部门的电子会计档案全生命周期管理平台，覆盖会计凭证、会计账簿、财务会计报告、其他会计资料四大门类，同时支持纯电子档案与纸质档案数字化双模式。系统以「混合架构」运行：Alfresco 内容库负责文件与元数据存储，ams-server 业务服务负责流程、规则与审计。'));
B.push(p('1.2 业务主线与数据流', 'Heading2'));
B.push(table([
  ['环节', '入口菜单', '产出'],
  ['收集', '档案收集：抓取收集中台 / 集成接口采集；档案整理：核对工作台', '收集池待办件（仅件数据）'],
  ['整理', '档案整理：组卷工作台', '案卷（草稿→已确认，赋档号）'],
  ['保管', '档案保管：财务分类视图 / 实体档案库房', '盒（装盒→封盒→在架）'],
  ['利用', '检索门户 / 档案利用：审批中心、借阅管理、借阅台账', '借阅单与履约记录'],
  ['处置', '档案处置：档案打包 / 档案移交 / 鉴定销毁', '移交批次、销毁留痕'],
]));
B.push(p('1.3 角色体系', 'Heading2'));
B.push(table([
  ['角色', '职责', '典型菜单'],
  ['普通员工', '检索与发起借阅', '检索门户'],
  ['部门经理', '借阅一级审批', '检索门户、审批中心'],
  ['档案管理员', '收集/整理/保管/利用/配置全流程', '全部业务菜单'],
  ['档案主管', '库房与鉴定销毁管理', '业务菜单（无配置组）'],
  ['财务总监', '大额/高危权限审批', '查询、审批中心、台账'],
  ['HR副总裁', '涉密档案审批', '查询、审批中心'],
  ['系统管理员', '全部功能与系统管理', '全部菜单'],
]));

B.push(p('第 2 章 登录与界面导航', 'Heading1'));
B.push(p('2.1 登录与身份切换', 'Heading2'));
B.push(p('用途：进入系统并确定当前工作身份。操作：'));
B.push(step(1, '打开系统首页，在登录页点选演示账号（各账号预置不同角色）。'));
B.push(step(2, '登录后默认进入「统计驾驶舱」（有后台权限的角色）或检索门户（普通员工）。'));
B.push(step(3, '如需切换身份，点击页头右上角头像，在「切换身份（演示）」下拉中选择其他账号，无需重新登录。'));
B.push(p('2.2 前台与后台', 'Heading2'));
B.push(p('系统分「检索门户」（前台）与「后台管理」两个工作区：'));
B.push(bullet('页头右上角「检索门户」按钮：后台 → 前台。'));
B.push(bullet('门户顶栏「进入后台管理」按钮：前台 → 后台（仅拥有后台菜单权限的角色显示）。'));
B.push(p('2.3 页头与菜单', 'Heading2'));
B.push(bullet('页头左侧：当前位置（菜单组 / 页面名）；右侧：检索门户入口、当前全宗选择器、身份切换、退出。'));
B.push(bullet('左侧菜单按业务域分组：档案查询 / 档案收集 / 档案整理 / 档案保管 / 档案利用 / 档案统计 / 档案处置 / 档案配置 / 系统管理；菜单可见性由角色决定（角色管理可配）。'));
B.push(bullet('切换全宗后，各列表与统计自动按全宗过滤；多全宗单位注意先选对全宗再操作。'));

B.push(p('第 3 章 检索门户（前台）', 'Heading1'));
B.push(p('3.1 门户首页', 'Heading2'));
B.push(p('用途：面向全体员工的百度式检索入口。'));
B.push(step(1, '在中央搜索框输入凭证号 / 摘要 / 往来单位 / 单据号 / 档号，点击「检索」。'));
B.push(step(2, '也可用「快捷」分类（会计凭证/会计账簿/财务报表/其他资料）一键限定类别。'));
B.push(step(3, '下方六张「检索能力」卡片可直达对应检索模式。'));
B.push(p('3.2 六种检索模式', 'Heading2'));
B.push(table([
  ['模式', '适用场景', '结果展示'],
  ['综合检索', '全库关键词 + 类别/年度/科目/部门/金额高级筛选', '表格：档号/凭证号/摘要/类别/期间/科目/部门/金额/状态'],
  ['凭证检索', '凭证号/科目/年度/主体/制单人/金额组合查询', '表格：凭证号/摘要/科目/期间/制单人/金额/状态'],
  ['事项检索', '按经济业务定位：往来单位/发票号/业务类型', '表格：单据编号/类型/业务/日期/单位/金额/所属凭证'],
  ['附件检索', '原始凭证附件：类型树 + 载体/四性/日期/金额', '左类型树 + 右表格'],
  ['关联查询', '纸质副本与原生电子同屏比对', '元数据对比表'],
  ['审计追踪', '操作日志哈希链穿透', '时间链（可导出取证包）'],
]));
B.push(p('3.3 结果与详情', 'Heading2'));
B.push(step(1, '结果表格支持分页（默认 20 条/页，可改 10/50/100）。'));
B.push(step(2, '点击行进入档案详情：元数据、卷级信息、附件（按借阅权限门控显示）。'));
B.push(step(3, '「电子版可用 / 实体在库 / 实体借出」状态标签直接决定能否在线调阅或需申请借阅。'));
B.push(p('3.4 我的借阅（门户）', 'Heading2'));
B.push(p('门户顶栏「我的借阅」与后台借阅数据一致：借阅车、我的申请（审批进度）、在线调阅（限时授权）。详见第 7 章。'));

B.push(p('第 4 章 档案收集', 'Heading1'));
B.push(p('4.1 抓取收集中台（菜单：档案收集 → 抓取收集中台）', 'Heading2'));
B.push(p('用途：从已配置的会计核算系统（如用友 BIP）按会计期间主动抓取凭证并归档转换。'));
B.push(step(1, '① 选择数据源：只读展示连接状态；未配置时先到「系统管理 → 连接配置」维护。'));
B.push(step(2, '② 选择会计期间：下拉为真实期间，旁边实时显示该期间用友侧凭证数。'));
B.push(step(3, '③ 选择抓取去向（本次抓取的数据流向，默认值在连接配置中维护）：'));
B.push(bullet('直接入库 · 自动组卷：四性检测后按期间自动建卷、赋号、归档（可信源适用）。'));
B.push(bullet('送组卷工作台：进入待组卷池，人工组卷。'));
B.push(bullet('送核对工作台 · 待核对：先核对凭证连续性/附件，通过后可送组卷或转审核。'));
B.push(bullet('送核对工作台 · 待审核：跳过核对直接人工审核，通过后送组卷。'));
B.push(step(4, '点击「立即抓取」；下方批次历史表可展开每批明细（类型/凭证字号/金额/状态/档号）。'));
B.push(p('规则与注意：以用友凭证 ID 幂等去重，重复抓取同一期间自动跳过；无电子附件的凭证按版式自动生成 PDF 作为电子文件（79 号令）。'));
B.push(p('4.2 集成接口采集（菜单：档案收集 → 集成接口采集）', 'Heading2'));
B.push(p('用途：业务系统按统一四类契约（凭证/账簿/报告/其他）向档案系统推送数据。'));
B.push(bullet('推送监控：批次总览、四性检测、去向操作（送审核/自动组卷）、批次明细。'));
B.push(bullet('接口标准：契约字段、样例报文、保管期限对照表，供推送方开发参考。'));
B.push(bullet('模拟推送：按真实管道生成仿真样例演示全链路（批次/四性/日志/去向）。'));
B.push(p('4.3 核对工作台（菜单：档案整理 → 核对工作台）', 'Heading2'));
B.push(p('用途：组卷前唯一关口，三个 Tab：'));
B.push(bullet('待核对：凭证号连续性核对 + 补传附件（扫描件）+ 收集池待核对（to-check 去向）。核对通过可「送组卷」或「转审核」。'));
B.push(bullet('待审核：抓取/推送 to-review 去向的数据，人工审核通过/驳回。'));
B.push(bullet('已处理：审核通过/驳回的历史留痕。'));

B.push(p('第 5 章 档案整理（组卷工作台）', 'Heading1'));
B.push(p('用途：把收集池中的件组成案卷，完成排序、检测、赋号、移交。菜单：档案整理 → 组卷工作台。页面左为待组卷池，右为案卷列表。'));
B.push(p('5.1 组卷（建卷与加件）', 'Heading2'));
B.push(step(1, '在左侧勾选凭证（可按年/月/类别/期限筛选，顶部有凭证号连续性提示条）。'));
B.push(step(2, '点「组卷（N 件）」一键建卷并加入；也可「加入已有」到既有草稿卷，或点案卷卡片上「加入当前案卷」。'));
B.push(step(3, '「智能组卷」按组卷盒号配置自动推荐分组（按类别/期间/连续号段），可整组接受或取消。'));
B.push(step(4, '案卷列表右上角「新建案卷」可建空卷（沿用当前筛选的类别/期限），改名后从左侧加件。'));
B.push(p('5.2 卷内件操作（勾选后使用底部悬浮工具栏）', 'Heading2'));
B.push(p('在案卷卡片中勾选卷内件前的复选框，页面底部会弹出深色悬浮工具栏：'));
B.push(bullet('全选：选中本卷全部件；上移/下移：调整选中件的卷内顺序（可连击逐位移动）。'));
B.push(bullet('转卷：选中件移入其他草稿卷（类别/年度/期限须一致）。'));
B.push(bullet('拆分：选中件拆出为新案卷（继承本卷属性；全部拆出时本卷自动销毁）。'));
B.push(bullet('移出回池：选中件回到左侧待组卷池。'));
B.push(p('5.3 卷级操作', 'Heading2'));
B.push(bullet('合并：将其他同类别/年度/期限的草稿卷并入本卷（来源卷删除）。'));
B.push(bullet('拆卷：整卷打散，全部件回待组卷池，案卷删除（有确认弹窗）。'));
B.push(bullet('目录预览/打印：卷内目录打印。'));
B.push(bullet('删除空卷：空草稿卷可直接删除。'));
B.push(p('5.4 四性检测与确认组卷', 'Heading2'));
B.push(step(1, '点「运行四性检测」：服务端对卷内每件执行检测项库中已启用的归档环节检测项（详见第 10.5 节），并做卷级检测：凭证号断号、卷内查重、件数一致。'));
B.push(step(2, '四个维度（真实性/完整性/可用性/安全性）全部通过，「确认组卷」才可点；未通过时卡片内列出问题明细，处理后重新检测。'));
B.push(step(3, '「确认组卷」：按档号规则配置赋号（组卷时赋号）或仅确认不赋号（会计档案自有凭证号体系），案卷状态 → 已确认。'));
B.push(p('5.5 移交与退回', 'Heading2'));
B.push(bullet('「移交至档案保管」：已确认案卷自动归入对应类别/年度的档案盒（无活动盒自动建盒），状态 → 已移交。'));
B.push(bullet('「撤销确认」：已确认案卷回草稿（档号回收为占位，重新确认时再取号）；已移交案卷可在盒管理中「退回组卷工作台」。'));
B.push(p('规则与注意：拆分/合并/转卷仅限草稿卷且要求同类别/年度/保管期限；已确认卷须先撤销确认；空卷自动销毁。'));

B.push(p('第 6 章 档案保管', 'Heading1'));
B.push(p('6.1 财务分类视图（菜单：档案保管 → 财务分类视图）', 'Heading2'));
B.push(p('用途：按 年度 → 类别 层级浏览已归档电子会计档案（全量明细台账），支持筛选、详情、导出。'));
B.push(p('6.2 实体档案库房（菜单：档案保管 → 实体档案库房）', 'Heading2'));
B.push(p('用途：实体档案的密集架可视化保管。移交归盒后的盒在「待上架区」排队，上架后进入密集架在架管理。'));
B.push(p('密集架阵列操作：'));
B.push(step(1, '每架默认闭合（薄板，占用量自下而上染色）；点击某列「打开通道」查看该列各层盒位（每架同时只开一列，还原真实密集架）。'));
B.push(step(2, '彩色盒脊按类别区分（凭证蓝/账簿紫/报表绿/其他琥珀；灰色为他全宗盒）；点击盒脊查看盒详情。'));
B.push(p('上架操作：'));
B.push(bullet('自动上架：服务端按 架→列→层→位 顺序分配第一个空格位，落点列自动打开并高亮。'));
B.push(bullet('点选架位：进入放置模式后点击任意空格位上架；ESC 退出。'));
B.push(bullet('换架位：在架盒详情中点「换架位」，点选新格位后原格位自动释放。'));
B.push(bullet('下架：在架盒下架回到「已封盒」待处理，格位释放。'));
B.push(p('盒状态机：装盒中(active) → 已封盒(sealed) → 在架(stored) → 下架回已封盒；在架盒不可开封/删除；库房布局在「档案配置 → 库房配置」维护（第 10.8 节）。'));
B.push(p('6.3 盒与卷的关系', 'Heading2'));
B.push(p('盒是卷的物理容器（盒→卷→件三级）。移交归盒自动进行；盒满后「封盒」不再接收新卷；在库统计与盒详情在库房页与财务分类视图中均可查。'));

B.push(p('第 7 章 档案利用（借阅与审批）', 'Heading1'));
B.push(p('7.1 发起借阅（检索门户）', 'Heading2'));
B.push(step(1, '在检索结果或档案详情中把档案加入「借阅车」（电子到件、实体到卷）。'));
B.push(step(2, '门户「我的借阅 → 借阅车」统一结算：逐件选择电子权限（在线浏览/下载/打印）或实体外借（原件/复印件），填写借阅事由与周期（最长 30 天）。'));
B.push(step(3, '「审批链预览」按流程配置实时计算：基础链 →（含下载/打印/实体）升级 →（涉密）升级 → 终审。提交后进入审批。'));
B.push(p('7.2 审批（菜单：档案利用 → 审批中心）', 'Heading2'));
B.push(bullet('待办按当前角色的审批节点过滤；通过/驳回须填意见；终审通过系统自动拆单履约。'));
B.push(bullet('审批链规则由「档案配置 → 流程配置 → 借阅利用」的组链规则驱动，管理员修改后对今后发起的申请生效（在途单按原链）。'));
B.push(p('7.3 履约与归还（菜单：档案利用 → 借阅管理 / 借阅台账）', 'Heading2'));
B.push(bullet('电子：授权单即时生效，门户「在线调阅」限时访问（到期自动收回）。'));
B.push(bullet('实体：出库核销 → 借出 → 归还核销；逾期进入红黑榜并触发黑名单（未还前禁新借）。'));
B.push(bullet('已借出的卷支持预约排队，归还后自动通知下一预约人。'));
B.push(bullet('借阅台账：全生命周期记录（谁/何时/借什么/审批链/应还实还/状态）。'));

B.push(p('第 8 章 档案处置', 'Heading1'));
B.push(p('8.1 档案打包（菜单：档案处置 → 档案打包）', 'Heading2'));
B.push(p('用途：案卷封装与移交前整理，生成标准封装包（含元数据与版式文件清单）。'));
B.push(p('8.2 档案移交 / 案卷移交管理（菜单：档案处置 → 档案移交；档案利用 → 案卷移交管理）', 'Heading2'));
B.push(p('用途：会计部 → 档案部移交（临时保管期满）与对外移交的批次管理、移交单打印、接收确认与日志留痕。'));
B.push(p('8.3 鉴定销毁（菜单：档案处置 → 鉴定销毁）', 'Heading2'));
B.push(step(1, '期满测算：按保管期限（10年/30年/永久）自动扫描到期档案。'));
B.push(step(2, '鉴定评审：生成鉴定清单，评审通过后进入销毁执行。'));
B.push(step(3, '销毁执行：真实状态机流转并写入不可篡改操作日志（全程留痕可审计）。'));

B.push(p('第 9 章 档案统计', 'Heading1'));
B.push(table([
  ['页面', '内容'],
  ['统计驾驶舱', '库藏/流程/利用/合规一屏总览（12 个可配置模块，默认首页）'],
  ['库藏统计', '按类型/年度/期限/全宗/部门/载体家底盘点'],
  ['流程统计', '归档/组卷/四性检测/移交/鉴定处置全生命周期监控'],
  ['借阅统计', '借阅热力/逾期红黑榜/全链路操作日志'],
  ['合规统计', '期限/数据质量/安全/审计支撑（79号令 + DA/T 94）'],
]));
B.push(p('驾驶舱模块的开关/排序/布局在「档案配置 → 驾驶舱配置」维护。'));

B.push(p('第 10 章 档案配置', 'Heading1'));
B.push(p('10.1 全宗管理 / 目录配置 / 元数据配置', 'Heading2'));
B.push(bullet('全宗管理：全宗（核算主体）档案存储总览与维护。'));
B.push(bullet('目录配置：多维业务科目档案目录分类体系。'));
B.push(bullet('元数据配置：各档案门类元数据方案（字段/显示/上下文），驱动全系统动态列与详情展示。'));
B.push(p('10.2 档号规则配置', 'Heading2'));
B.push(p('档号结构：全宗号 - KU·类别号·年度 - 保管期限 - 案卷号 - 件号（DA/T 13-2022）。页内分「档号规则定义（5 项可配置）/ 赋号时机 / 刚性规则 / 标准结构 / 规范溯源 / 电子专项 / 合规红线」七个分区。赋号时机决定确认组卷时是否自动赋号。'));
B.push(p('10.3 档案三合一表配置', 'Heading2'));
B.push(p('分类体系 · 归档范围 · 保管期限三合一维护（79 号令），是组卷期限推断与鉴定销毁测算的依据。'));
B.push(p('10.4 组卷盒号配置', 'Heading2'));
B.push(p('组卷规则（按类别独立规则：凭证/账簿/报告/其他）与盒号定义；直接驱动组卷工作台「智能组卷」推荐。'));
B.push(p('10.5 四性检测配置', 'Heading2'));
B.push(bullet('检测项库：环节（归档/移交/长期保存）× 四性 × 检测项的标准库，勾选集合即本单位检测方案；每项标注 DA/T·GB/T 依据（如凭证号连续性 DA/T 42-2022、格式合规 GB/T 33190-2016）。'));
B.push(bullet('方案模板与四维配置：必填元数据字段、格式白名单、敏感词表、维度开关；服务端检测引擎实时消费，立即执行检测可对收集池批量跑检。'));
B.push(bullet('检测报告逐条落库（四性状态 + 问题明细），支持人工复检留痕（复检人/原因/时间）。'));
B.push(p('10.6 报告配置 / 水印配置', 'Heading2'));
B.push(bullet('报告配置：报表类档案的报告模板与输出规则。'));
B.push(bullet('水印配置：安全溯源水印策略，预览/下载/打印三场景动态水印（含防篡改引擎）。'));
B.push(p('10.7 流程配置', 'Heading2'));
B.push(p('可视化流程设计器（画布编排）+ 业务元数据。「借阅利用」流程的「审批组链规则」为运行时真消费：基础链（可排序增删角色）→ 升级规则（含下载/打印/实体、涉密两条）→ 终审角色；修改即时生效于今后发起的借阅申请，停用回退系统默认链。归档质检/大额核查/鉴定销毁流程暂为登记册语义。'));
B.push(p('10.8 库房配置', 'Heading2'));
B.push(p('库房布局全配置化：库房（增/删/改名）→ 密集架（增/删/改名/改维度：列×层×每层盒位）。'));
B.push(bullet('库房号/架号创建后不可改（被架位引用），名称随时可改。'));
B.push(bullet('删库房须无架；删架须无在架盒；缩小架维度时新边界外不得有在架盒（服务端强校验）；扩容自由。'));
B.push(bullet('实体库房页按布局动态渲染，「自动上架」按配置顺序分配格位。'));
B.push(p('10.9 驾驶舱配置', 'Heading2'));
B.push(p('统计驾驶舱 12 个模块的开关、排序与布局管理。'));

B.push(p('第 11 章 系统管理', 'Heading1'));
B.push(bullet('单位管理 / 组织管理 / 人员管理：统一组织层级、部门与系统用户备案（人员与角色挂钩）。'));
B.push(bullet('角色管理：业务角色划分与菜单权限矩阵（决定各角色可见菜单与后台入口）。'));
B.push(bullet('连接配置：数据源连接（用友 BIP 等抓取源）、推送接入应用（AppKey/默认去向）、接口字段映射统一管理；抓取收集中台的数据源与此联动。'));
B.push(bullet('安全审计日志：安全通道全链路行为追溯（哈希链防篡改）。'));

B.push(p('第 12 章 附录', 'Heading1'));
B.push(p('12.1 档号结构速查', 'Heading2'));
B.push(p('Z001-KU·01·2026-D30-B001-0003-0012 = 全宗 Z001 · 会计门类 KU · 凭证类 01 · 2026 年 · 30 年期限 · 盒流水 B001 · 卷流水 0003 · 件号 0012。'));
B.push(p('12.2 核心状态机速查', 'Heading2'));
B.push(table([
  ['域', '状态流'],
  ['件', '仅件数据 → 待审核（入草稿卷）→ 已组卷（确认）'],
  ['案卷', '草稿 → 已确认（赋号）→ 已移交（归盒）→（退回/撤销回草稿）'],
  ['盒', '装盒中 active → 已封盒 sealed → 在架 stored →（下架回 sealed）'],
  ['借阅单', '审批中 →（终审通过）履约中 → 已归还/已收回；驳回/撤销终止'],
]));
B.push(p('12.3 归档环节检测项速查（节选）', 'Heading2'));
B.push(table([
  ['编码', '检测项', '四性', '依据'],
  ['GD-1-01', '电子文件存在性', '真实性', 'DA/T 94-2022'],
  ['GD-1-03', '档号规范性', '真实性', 'DA/T 13-2022'],
  ['GD-2-01', '必填元数据齐全', '完整性', 'DA/T 94-2022 / 79号令'],
  ['GD-2-02', '凭证号连续性（断号）', '完整性', 'DA/T 42-2022'],
  ['GD-2-03', '凭证号重复性', '完整性', '79号令'],
  ['GD-3-01', '格式合规（白名单）', '可用性', 'GB/T 33190-2016'],
  ['GD-4-01', '敏感信息模式扫描', '安全性', '—'],
]));
B.push(p('完整清单见系统内「档案配置 → 四性检测配置 → 检测项库」（含移交/长期保存环节）。'));
B.push(p('12.4 常见问题', 'Heading2'));
B.push(bullet('页面提示「服务无响应/请求超时」：后端 ams-server 未启动或版本过旧，请按 12.5 重启。'));
B.push(bullet('看不到某菜单：角色无权限，联系系统管理员在「角色管理」调整菜单矩阵。'));
B.push(bullet('确认组卷不可点：四性检测未通过或未运行，按案卷卡片问题明细处理后重新检测。'));
B.push(bullet('架位选不中：该格已被占用或该架维度已在库房配置中调整，刷新后重试。'));
B.push(p('12.5 服务运维速查', 'Heading2'));
B.push(p('后端（ams-server）启动：'));
B.push(p('cd ams-server && AMS_DB_URL="jdbc:postgresql://localhost:5432/alfresco?currentSchema=ams" java -jar target/ams-server-0.0.1-SNAPSHOT.jar'));
B.push(p('前端：financeWeb 目录 npm run dev（:5000）；数据库：docker postgres:16.5（:5432，schema=ams）；内容库：Alfresco Community（:8080）。'));

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${B.join('\n')}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/></w:rPr><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="56"/><w:color w:val="0F3B63"/></w:rPr><w:pPr><w:spacing w:before="120" w:after="60"/><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="20"/><w:color w:val="64748B"/></w:rPr><w:pPr><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="0F3B63"/></w:rPr><w:pPr><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="155E9C"/></w:rPr><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

fs.mkdirSync(path.join(OUT, 'word', '_rels'), { recursive: true });
fs.mkdirSync(path.join(OUT, '_rels'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'word', 'document.xml'), documentXml);
fs.writeFileSync(path.join(OUT, 'word', 'styles.xml'), stylesXml);
fs.writeFileSync(path.join(OUT, 'word', '_rels', 'document.xml.rels'), docRels);
fs.writeFileSync(path.join(OUT, '[Content_Types].xml'), contentTypes);
fs.writeFileSync(path.join(OUT, '_rels', '.rels'), rels);
console.log('pkg written');
