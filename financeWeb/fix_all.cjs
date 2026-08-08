const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const ORIG = content;
let changes = 0;

// Fix pattern: '...text?' at end of triggerToast/confirm/useState strings
// where ? should be ' (closing the string literal)
// Look for: 'some text?,'  →  'some text',
// Look for: 'some text?)'  →  'some text)'
// Look for: 'some text?)'  →  'some text)'

// 1. Fix triggerToast calls: '...?' → '...'
// Pattern: 'some Chinese chars?' where ? closes the string
content = content.replace(
  /(triggerToast\('[^']*?[^\x00-\x7F'?,])'\)/g,
  (match, p1) => {
    // If the string already has a proper closing quote followed by ', skip
    if (p1.endsWith("'")) return match;
    return `${p1}');`;
  }
);

// 2. More targeted: replace ?' sequences (question mark before single quote)
content = content.replace(/\?'/g, "'");

// 3. Fix specific patterns in handler functions
const specificFixes = [
  // Line 478
  ['全数组卷）?,', "全数组卷）,", false],
  // Line 489
  ["status: '已组卷 as const,", "status: '已组卷' as const,", false],
  // Line 495
  ['一键自动装订会计师组织?,', "一键自动装订组卷',", false],
  // Line 496
  ['(首席财务审核员', "(首席财务审核员)", true],
  // Line 497
  ['压入所属案? [', '压入所属案卷 [', false],
  // Line 508
  ['已组卷?${', '已组卷 ${', false],
  // Line 513
  ['国家标准）?,', "国家标准）',", false],
  // Line 516 comment
  ['一键修护可用性?', '一键修护可用性', true],
  // Line 525
  ['长效可用度检测）?,', "长效可用度检测）',", false],
  // Line 536
  ['可用性专项故障修复?,', "可用性专项故障修复',", false],
  // Line 537
  ['(系统管理员', "(系统管理员)", true],
  // Line 538
  ['合格）?,', "合格）',", false],
  // Line 563
  ['包体）?,', "包体）',", false],
  // Line 569
  ['签名链）?))', "签名链）'))", false],
  // Line 571
  ['注销）?,', "注销）',", false],
  
  // Line 863: contract & protocol sidebar
  ['合同及协议?', "合同及协议", true],
  
  // Line 2055+
  // Header title JSX
  ['视图?}', "视图'}", false],
  ['聚合?}', "聚合'}", false],
  ['同步?}', "同步'}", false],
  ['台账?}', "台账'}", false], 
  ['大盘?}', "大盘'}", false],
  ['工具?}', "工具'}", false],
  ['追踪?}', "追踪'}", false],
  
  // toast/comment patterns
  ['档案要素?,', "档案要素',", false],
  ['通过）?,', "通过）',", false],
  
  // Line 1441
  ['线上)?', "线上)", true],
  
  // Line 1475 
  ['归还与催还闭环?', '归还与催还闭环', true],
  
  // Line 1719
  ['模块）?,', "模块）',", false],
  
  // Line 1745
  ['工作流配置?', '工作流配置', true],
  
  // Line 1773-1783
  ['统计仪表盘?,', "统计仪表盘',", false],
  ['统计仪表盘?/span>', "统计仪表盘</span>", false],
  
  // Line 1800
  ['三模式)?', '三模式)', true],
  
  // Line 1874
  ['档案库配置?/span>', '档案库配置</span>', false],
  
  // Line 1910
  ['检测配置?/span>', '检测配置</span>', false],
  
  // Line 2082
  ['异构系统?(OA', '异构系统 (OA', false],
  ['主键匹配）?SIP', '主键匹配） SIP', false],
  
  // Line 2102
  ['右侧工具?*/', '右侧工具 */', false],
  
  // Line 2104
  ['全宗选择器?-', '全宗选择器 -', false],
  ['自定义下拉框?*/', '自定义下拉框 */', false],
  // These are too complex, handle separately
  // ['name.split(\'?\', "name.split(\'（\', false],
  
  // Line 2155
  ['分隔线?*/', '分隔线 */', false],
  
  // Line 2158
  ['简约?*/', '简约 */', false],
  
  // Line 2175
  ['退出登录?', '退出登录', true],
  
  // Line 2180
  ['退出?/span>', '退出</span>', false],
  
  // Line 2204
  ['构成?/span>', "构成'</span>", false],
  
  // Line 2207, 2347
  ['比重）?', '比重）', true],
  
  // Line 2220
  ['归入凭?', '归入凭证', false],
  
  // Line 2302, 2319
  ['安全性?', '安全性', true],
  ['完整?(哈希', '完整 (哈希', false],
  
  // Line 2344
  ['底座?/span>', "底座'</span>", false],
  
  // Line 2369-2373
  ['同步源?/span>', "同步源'</span>", false],
  ['定位?/span>', "定位'</span>", false],
  
  // Line 2401
  ['工作台?/span>', "工作台'</span>", false],
  
  // Line 2408
  ['第一全宗?<b>', '第一全宗</b><b>', false],
  ['监管件）?', '监管件）', true],
  
  // Line 2415-2420 (table headers)
  ['凭证号?/th>', "凭证号'</th>", false],
  ['金额 (元)?', '金额 (元)', true],
  ['检测结果?/th>', "检测结果'</th>", false],
  ['状?/th>', "状'</th>", false],
  
  // Line 2441-2444 check marks
  ['>?/span>', '></span>', false],
  
  // Line 2448
  ['已组卷 ?', "已组卷' ?", false],
  
  // Line 2473
  ['季度选择?/span>', "季度选择'</span>", false],
  
  // Line 2507
  ['m}?', "m}'", false],
  
  // Line 2546
  ["代码 : {selectedNode.code || '?`})", "代码 : {selectedNode.code || '无'})", false],
  // Also fix the simpler pattern
  ["code || '?)", "code || '无')", false],
  
  // Line 2552
  ['过滤?', '过滤', true],
  
  // Line 2563
  ['进度?', '进度', true],
  
  // Line 2582
  ['已上?{item.done}', '已上架 {item.done}', false],
  
  // Line 2604-2610
  ['凭证?/th>', "凭证'</th>", false],
  ['金额?(RMB)', '金额 (RMB)', false],
  ['状态?/th>', "状态'</th>", false],
  
  // Line 2689-2747 Four properties
  ['真实性检查?(签章验证)', '真实性检查 (签章验证)', false],
  ['完整性校验?(数字摘要SHA256核算)', '完整性校验 (数字摘要SHA256核算)', false],
  ['可用度检测?(格式规范/矢量中嵌入等)', '可用度检测 (格式规范/矢量中嵌入等)', false],
  ['缺字型?)', "缺字型')", false],
  ['安全性核查?(白名单，敏感字过滤?', '安全性核查 (白名单，敏感字过滤)', false],
  ['敏感字过滤?', '敏感字过滤', true],
  ['>(?</span>', '></span>', false],
  
  // Line 2782
  ['凭证?', '凭证', true],
  
  // Line 2796
  ['关键词）?', '关键词）', true],
  
  // Line 2854
  ['处理?/span>', '处理</span>', false],
  
  // Line 2867
  ['核对?/span>', '核对</span>', false],
  
  // Line 2893
  ['金额?/span>', '金额</span>', false],
  
  // Line 2897
  ['密?/span>', '密</span>', false],
  
  // Line 2934
  ['自检修复）?', '自检修复）', true],
  
  // Line 2964
  ['菜单?', '菜单', true],
  
  // Line 2040 comment
  ['一致?*/', "一致 */", false],
  
  // Line 457 template literal
  // Line 457 template literal - use regex approach
  // ['正在核\\?${', '正在核验 ${', false],
  // handled by regex below
  
  // === List of all remaining triggerToast/confirm with ? at end ===
  ['要素?,', "要素',", false],
];

// Manual regex fixes for template literals that can't be in the array
content = content.replace(/正在核\?\$\{/g, '正在核验 ${');
content = content.replace(/存证凭证\?\.\./g, '存证凭证...');

for (const [from, to, isPrefix] of specificFixes) {
  if (isPrefix) {
    // Replace all occurrences of this string prefix anywhere in the content
    let idx = 0;
    let found = false;
    while ((idx = content.indexOf(from, idx)) !== -1) {
      content = content.substring(0, idx) + to + content.substring(idx + from.length);
      idx += to.length;
      found = true;
    }
    if (found) changes++;
  } else {
    if (content.includes(from)) {
      content = content.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
      changes++;
    }
  }
}

fs.writeFileSync(filePath, content, 'utf8');

// Count remaining ?
const remaining = (content.match(/\?/g) || []).length;
console.log(`Applied ${changes} fix patterns`);
console.log(`Remaining ? characters: ${remaining}`);
console.log('File saved');
