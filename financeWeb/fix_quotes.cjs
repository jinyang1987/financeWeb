const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

let changes = 0;

// === Fix quoted string endings where single quotes (') got corrupted to ? ===
// Pattern: '...correct text?' where ? should be '

const FIXES = [
  // Line 90-94: fanzongCategories data
  ['记账-001"? }',   "记账-001' }"],
  ['记账-001? }',    "记账-001' }"],
  ['?001\'',         "记-001'"],
  ['?002\'',         "记-002'"],
  ['总金额? }',      "总金额' }"],
  ['如?"2026"? }',   '如"2026"\' }'],
  ['记账人?,',        "记账人',"],
  ['记账人? },',      "记账人' },"],
  ['核销状态?,',      "核销状态',"],
  ['核销状态? },',    "核销状态' },"],
  ['如"?025',        '如"2025'],
  ['报告"? },',       "报告\"' },"],
  ['报告" },\n',      "报告\"' },\n"],
  ['会计师组织? }',   "会计师组织' }"],
  ['会计师组织?\n',   "会计师组织'\n"],
  ['出纳凭证?,',      "出纳凭证',"],
  ['索引号? },',      "索引号' },"],
  ['凭证? },',        "凭证' },"],
  
  // Line 152
  ['账套档案?',       "账套档案'"],
  
  // Line 155-156
  ['?001\'',          "记-001'"],
  ['?002\'',          "记-002'"],
  ['?005\'',          "记-005'"],
  ['?011\'',          "记-011'"],
  ['?015\'',          "记-015'"],
  ['?050\'',          "记-050'"],
  
  // Line 156
  ['关联缺?,',        "关联缺',"],
  
  // Line 160-161
  ['核算员?\'',        "核算员'"],
  ['资金员?\'',        "资金员'"],
  ['审批中? },',       "审批中' },"],
  ['审批通过\'',       "审批通过'"],
  
  // Line 165-167
  ['财务部?,',         "财务部',"],
  ['核算部?,',         "核算部',"],
  
  // Line 171-173
  ['超期未归?已下发催还单)', '超期未归还，已下发催还单)'],
  ['归?已下发催还单)', '归还，已下发催还单)'],
  ['借阅中?正常状态?', "借阅中'正常状态'"],
  ['正常状态?\'',      "正常状态'"],
  ['催还单?\'',        "催还单'"],
  
  // Line 179-180
  ['自动归纳)?',       '自动归纳）'],
  ['自动归纳)? }',     '自动归纳\' }'],
  
  // Line 184-187
  ['标记?\'',          "标记'"],
  ['质检中? },',       "质检中' },"],
  ['已上架? },',       "已上架' },"],
  ['分割?\'',          "分割'"],
  ['004?  (含空格',    "004'  (含空格"],
  ['标?\'',            "标'"],
  
  // Line 196-197
  ['档案员?\'',         "档案员'"],
  ['核算员?\'',         "核算员'"],
  ['?12 张凭证?\'',     "'12 张凭证'"],
  
  // handler functions
  ['档案要素?,',        "档案要素',"],
  ['发现 [可用性] ?[签章缺陷]', '发现 [可用性]  [签章缺陷]'],
  ['通过)?,',           "通过)',"],
  ['全数组卷)?,',       "全数组卷)',"],
  ['国家标准)?,',       "国家标准)',"],
  ['包体)?,',           "包体)',"],
  ['注销)?,',           "注销)'"],
  
  // sidebar titles
  ['合同及协议? },',     "合同及协议' },"],
  ['合同及协议?,\n',     "合同及协议',\n"],
  ['计算模块?,',         "计算模块',"],
  ['库房?\'',            "库房'"],
  ['中台?,',             "中台',"],
  ['闭环专区?,',         "闭环专区',"],
  ['精细监控?,',         "精细监控',"],
  ['模块)?,',            "模块)',"],
  ['工作流配置?,',       "工作流配置',"],
  ['统计仪表盘?,',       "统计仪表盘',"],
  ['配置页面?,',         "配置页面',"],
  ['检测配置?,',         "检测配置',"],
  
  // Header titles (JSX text)
  ['视图?}',             "视图'}"],
  ['聚合?}',             "聚合'}"],
  ['同步?}',             "同步'}"],
  ['台账?}',             "台账'}"],
  ['大盘?}',             "大盘'}"],
  ['工具?}',             "工具'}"],
  ['追踪?}',             "追踪'}"],
  ['仪表盘?}',           "仪表盘'}"],
  ['系统)?}',            "系统)'}"],
  ['同步)?}',            "同步)'}"],
  ['定义?}',             "定义'}"],
  ['督办)?}',            "督办)'}"],
  ['模块?}',             "模块'}"],
  ['介质)?}',            "介质)'}"],
  ['密集架)?HSM',        "密集架)HSM"],
  ['审核)?\'}',          "审核)'"],
  ['体系?}',             "体系'}"],
  ['管理?}',             "管理'}"],
  
  // Comments
  ['全宗下拉框状态?  ',   '全宗下拉框状态 '],
  ['视图展开状态?  ',    '视图展开状态 '],
  
  // dashboard Four Properties
  ['真实?(数字',         '真实 (数字'],
  ['可用?(OFD',          '可用 (OFD'],
  ['安全?(权限',         '安全 (权限'],
  
  // Line 2448
  ['已会计师组织? ',     '已组卷 '],
  ['已组织? ',           '已组卷 '],
  
  // Line 2733
  ['缺字型?)',           "缺字型')"],
  
  // Line 2082
  ['主键匹配)?SIP',      "主键匹配)SIP"],
];

for (const [from, to] of FIXES) {
  if (content.includes(from)) {
    content = content.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
    changes++;
  }
}

// Fix remaining orphaned ? in critical data lines
// Replace ?' sequences (question mark followed by single quote) - the ? is extraneous
let prevCount = 0;
do {
  prevCount = (content.match(/\?'/g) || []).length;
  content = content.replace(/\?'/g, "'");
  if ((content.match(/\?'/g) || []).length < prevCount) changes++;
} while ((content.match(/\?'/g) || []).length > 0);

// Fix remaining 记字? to 记字- 
content = content.replace(/记字\?/g, '记字-');
content = content.replace(/\?\[2026\]/g, '记[2026]');
content = content.replace(/\?2026/g, '记-2026');
content = content.replace(/\?2026/g, '记-2026');
content = content.replace(/\?202604/g, '记-202604');
content = content.replace(/\?202605/g, '记-202605');

// Fix any remaining ? at end of string in JSX
content = content.replace(/([^\x00-\x7F])\?(\s*'\s*[,\)}])/g, "$1'$2");
content = content.replace(/([^\x00-\x7F])\?(\s*[}\)],?\s*$)/gm, "$1'$2");

fs.writeFileSync(filePath, content, 'utf8');
console.log(`Applied ${changes} fix patterns`);
console.log('File saved');

// Verify
const final = fs.readFileSync(filePath, 'utf8');
const lines = final.split('\n');
// Check for unterminated strings in the first 200 lines
for (let i = 89; i < 95; i++) {
  if (lines[i] && lines[i].includes('?')) {
    console.log(`WARNING Line ${i+1} still has ?: ${lines[i].trim().substring(0, 80)}`);
  }
}
