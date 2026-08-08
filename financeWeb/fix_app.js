const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const FFFD = '\uFFFD';

// Count FFFD
const initialCount = (content.match(new RegExp(FFFD, 'g')) || []).length;
console.log(`Found ${initialCount} U+FFFD characters`);

// === Fix known broken patterns ===

// Line 90: description ending with broken quote
// before: 如"记-001"？ } → after: 如"记-001" },
content = content.replace(
  `记-001"${FFFD}`,
  `记-001"`,
);
content = content.replace(
  `记-001${FFFD}`,
  `记-001`,
);

// Line 91: 总金额
content = content.replace(`总金${FFFD}`, '总金额');
content = content.replace(`总金额${FFFD}`, '总金额');

// Line 92: 如"2026" 
content = content.replace(`如${FFFD}026${FFFD}`, '如"2026"');
content = content.replace(`026${FFFD}`, '"2026"');

// Line 93: 记账人
content = content.replace(`记账${FFFD}`, '记账人');

// Line 94: 核销状态
content = content.replace(`核销状${FFFD}`, '核销状态');
content = content.replace(`状态${FFFD}`, '状态');

// Line 104: 如"2025
content = content.replace(`如${FFFD}025${FFFD}`, '如"2025');
content = content.replace(`如${FFFD}025`, '如"2025');
content = content.replace(`报告"${FFFD}`, '报告"');

// Line 105: 会计师组织
content = content.replace(`会计师组${FFFD}`, '会计师组织');
content = content.replace(`组织${FFFD}`, '组织');

// Line 112: 出纳凭证
content = content.replace(`出纳凭${FFFD}`, '出纳凭证');

// Line 117: 索引号
content = content.replace(`索引${FFFD}`, '索引号');

// Line 152: 账套档案
content = content.replace(`档案${FFFD}`, '档案');

// Line 155: 记-001
content = content.replace(`${FFFD}001'`, "记-001'");

// Line 156: 记-002  
content = content.replace(`${FFFD}002'`, "记-002'");

// Line 160: 核算员
content = content.replace(`核算${FFFD}`, '核算员');
content = content.replace(`资金${FFFD}`, '资金员');

// Line 161: 审批中
content = content.replace(`审批${FFFD}`, '审批中');

// Line 165: 财务部, 核算部
content = content.replace(`财务${FFFD}`, '财务部');
content = content.replace(`核算${FFFD}`, '核算部');

// Line 165-167 voucher numbers
content = content.replace(`${FFFD}001`, '记-001');
content = content.replace(`${FFFD}002`, '记-002');
content = content.replace(`${FFFD}005`, '记-005');
content = content.replace(`${FFFD}011`, '记-011');
content = content.replace(`${FFFD}015`, '记-015');
content = content.replace(`${FFFD}050`, '记-050');

// Line 171: 超期未归还
content = content.replace(`超期未归${FFFD}已下发催还单)`, '超期未归还，已下发催还单)');
content = content.replace(`归${FFFD}已下发催还单)`, '归还，已下发催还单)');

// Line 172: 正常状态, 借阅中
content = content.replace(`正常状${FFFD}`, '正常状态');
content = content.replace(`借阅${FFFD}`, '借阅中');

// Line 173: 催还单
content = content.replace(`催还${FFFD}`, '催还单');

// Line 179-180: 自动归纳
content = content.replace(`自动归纳${FFFD}`, '自动归纳）');

// Line 184: 含空格标记
content = content.replace(`空格标${FFFD}`, '空格标记');

// Line 185: 质检中
content = content.replace(`质检${FFFD}`, '质检中');

// Line 186: 已上架
content = content.replace(`已上${FFFD}`, '已上架');

// Line 187: 跨卷盒分割
content = content.replace(`跨卷盒分${FFFD}`, '跨卷盒分割');

// Line 196: 档案员
content = content.replace(`档案${FFFD}`, '档案员');
content = content.replace(`核算${FFFD}`, '核算员');
content = content.replace(`凭${FFFD}`, '凭证');

// Line 200: 记--
content = content.replace(`${FFFD}--`, '记--');

// Line 205: 上海财务部
content = content.replace(`上海财务${FFFD}`, '上海财务部');

// ============ Comments section ============
content = content.replace(`全宗下拉框状${FFFD}`, '全宗下拉框状态');
content = content.replace(`视图展开状${FFFD}`, '视图展开状态');

// ============ Handler functions ============
content = content.replace(`编码${FFFD}`, '编码）');
content = content.replace(`父类${FFFD}`, '父类目');
content = content.replace(`一键四性检${FFFD}`, '一键四性检查');
content = content.replace(`要素${FFFD}`, '要素');
content = content.replace(`核${FFFD}${FFFD}`, '核验');
content = content.replace(`存证凭${FFFD}`, '存证凭证');
content = content.replace(`签章缺陷${FFFD}`, '签章缺陷）');
content = content.replace(`通过${FFFD}`, '通过）');
content = content.replace(`一键自动组${FFFD}`, '一键自动组卷');
content = content.replace(`组${FFFD}`, '组卷');
content = content.replace(`全数组卷${FFFD}`, '全数组卷）');
content = content.replace(`装订组${FFFD}`, '装订组卷');
content = content.replace(`首席财务审核${FFFD}`, '首席财务审核员');
content = content.replace(`已${FFFD} as const`, '已组卷 as const');
content = content.replace(`已${FFFD}`, '已组卷');
content = content.replace(`标准${FFFD}`, '标准）');
content = content.replace(`一键修护可用${FFFD}`, '一键修护可用性');
content = content.replace(`检测${FFFD}`, '检测）');
content = content.replace(`修复${FFFD}`, '修复）');
content = content.replace(`故障修${FFFD}`, '故障修复');
content = content.replace(`系统管理${FFFD}`, '系统管理员');
content = content.replace(`合格${FFFD}`, '合格）');
content = content.replace(`包体${FFFD}`, '包体）');
content = content.replace(`签名链${FFFD}`, '签名链）');
content = content.replace(`注销${FFFD}`, '注销）');

// ============ JSX sidebar ============
content = content.replace(`会计凭证${FFFD}`, '会计凭证）');
content = content.replace(`合同及协${FFFD}`, '合同及协议');
content = content.replace(`进入数电清洗与分册插卷计算模${FFFD}`, '进入数电清洗与分册插卷计算模块');
content = content.replace(`数字化虚拟库${FFFD}`, '数字化虚拟库房');
content = content.replace(`进入审批流协同网络中${FFFD}`, '进入审批流协同网络中台');
content = content.replace(`使用审批管控 (线上${FFFD}`, '使用审批管控 (线上)');
content = content.replace(`进入归还与催还闭环专${FFFD}`, '进入归还与催还闭环专区');
content = content.replace(`归还与催还闭${FFFD}`, '归还与催还闭环');
content = content.replace(`进入借单专项全周期精细监${FFFD}`, '进入借单专项全周期精细监控');
content = content.replace(`进入虚拟库房：请下拉至页面底部【会计防销毁与会签鉴定】模块${FFFD}`, '进入虚拟库房：请下拉至页面底部【会计防销毁与会签鉴定】模块）');
content = content.replace(`进入保障时效监督工作流配${FFFD}`, '进入保障时效监督工作流配置');
content = content.replace(`工作流配${FFFD}`, '工作流配置');
content = content.replace(`进入档案统计仪表${FFFD}`, '进入档案统计仪表盘');
content = content.replace(`档案统计仪表${FFFD}`, '档案统计仪表盘');
content = content.replace(`查询统计分析 (三模${FFFD}`, '查询统计分析 (三模式)');
content = content.replace(`进入档案库配置页${FFFD}`, '进入档案库配置页面');
content = content.replace(`档案库配${FFFD}`, '档案库配置');
content = content.replace(`进入检测配置页${FFFD}`, '进入检测配置页面');
content = content.replace(`检测配${FFFD}`, '检测配置');

// ============ Header titles ============
content = content.replace(`Main Header - 与左侧logo区域高度一${FFFD}`, 'Main Header - 与左侧logo区域高度一致');
content = content.replace(`财务类视${FFFD}`, '财务类视图');
content = content.replace(`全局引擎・多端业务聚${FFFD}`, '全局引擎・多端业务聚合');
content = content.replace(`审批管理・移动办公同${FFFD}`, '审批管理・移动办公同步');
content = content.replace(`借阅管控・精细查阅台${FFFD}`, '借阅管控・精细查阅台账');
content = content.replace(`决策分析・综合经营大${FFFD}`, '决策分析・综合经营大盘');
content = content.replace(`清洗引擎・插数计算工${FFFD}`, '清洗引擎・插数计算工具');
content = content.replace(`安全审计・日志追${FFFD}`, '安全审计・日志追踪');
content = content.replace(`全宗数字化资产运行大${FFFD}`, '全宗数字化资产运行大盘');
content = content.replace(`电子会计档案"四性"全生命周期质检明细台账 (财务${FFFD}`, '电子会计档案"四性"全生命周期质检明细台账 (财务)');
content = content.replace(`电子会计档案"四性"全生命周期质检明细台账 (项目${FFFD}`, '电子会计档案"四性"全生命周期质检明细台账 (项目)');
content = content.replace(`电子会计档案"四性"全生命周期质检明细台账 (时间${FFFD}`, '电子会计档案"四性"全生命周期质检明细台账 (时间)');
content = content.replace(`前端业务系统分离聚拢：解耦异构系${FFFD}`, '前端业务系统分离聚拢：解耦异构系统');
content = content.replace(`主键匹配${FFFD}`, '主键匹配）');
content = content.replace(`档案使用审批全流程管控（对接协同办公系统实时同步${FFFD}`, '档案使用审批全流程管控（对接协同办公系统实时同步）');
content = content.replace(`标准化电子会计凭证借阅清单与多维条件定${FFFD}`, '标准化电子会计凭证借阅清单与多维条件定义');
content = content.replace(`档案归还多维度核对与超期自动催缴督办${FFFD}`, '档案归还多维度核对与超期自动催缴督办）');
content = content.replace(`多维档案查阅与经营周期全要素数据统计分析 (三模${FFFD}`, '多维档案查阅与经营周期全要素数据统计分析 (三模式)');
content = content.replace(`电子会计凭证特殊字符清洗与分册插卷计算模${FFFD}`, '电子会计凭证特殊字符清洗与分册插卷计算模块');
content = content.replace(`借调单专项生命周期精细化管理 (纸质实体与电子介${FFFD}`, '借调单专项生命周期精细化管理 (纸质实体与电子介质)');
content = content.replace(`实体库房与电子多介质生命周期闭环自适应微控 (密集${FFFD}`, '实体库房与电子多介质生命周期闭环自适应微控 (密集架)');
content = content.replace(`HSM+销毁审${FFFD}`, 'HSM+销毁审核)');
content = content.replace(`全宗管理：会计全宗一元化底座定义仪表${FFFD}`, '全宗管理：会计全宗一元化底座定义仪表盘');
content = content.replace(`多维电子证据链防篡改审计工作流组${FFFD}`, '多维电子证据链防篡改审计工作流组织');
content = content.replace(`单位管理：统一组织层级与编码体${FFFD}`, '单位管理：统一组织层级与编码体系');
content = content.replace(`人员管理：全系统用户与岗位管${FFFD}`, '人员管理：全系统用户与岗位管理');
content = content.replace(`全宗选择${FFFD}`, '全宗选择器');
content = content.replace(`下拉${FFFD}`, '下拉框');
content = content.replace(`分隔${FFFD}`, '分隔线');
content = content.replace(`用户信息 - 简${FFFD}`, '用户信息 - 简约');
content = content.replace(`退出登${FFFD}`, '退出登录');
content = content.replace(`退${FFFD}`, '退出');

// ============ Dashboard area ============
content = content.replace(`部门与门类构${FFFD}`, '部门与门类构成');
content = content.replace(`比重${FFFD}`, '比重）');
content = content.replace(`记账金额 (${FFFD}`, '记账金额 (元)');
content = content.replace(`四性检测结${FFFD}`, '四性检测结果');
content = content.replace(`状${FFFD}`, '状态');
content = content.replace(`真实性检${FFFD}`, '真实性检查');
content = content.replace(`完整性校${FFFD}`, '完整性校验');
content = content.replace(`可用度检${FFFD}`, '可用度检测');
content = content.replace(`安全性核${FFFD}`, '安全性核查');
content = content.replace(`缺字${FFFD}`, '缺字型');
content = content.replace(`敏感字过${FFFD}`, '敏感字过滤');
content = content.replace(`销毁凭${FFFD}`, '销毁凭证');
content = content.replace(`关键词${FFFD}`, '关键词）');

// ============ Header dashboard ============
content = content.replace(`当前全宗会计凭证部门与门类构${FFFD}`, '当前全宗会计凭证部门与门类构成');
content = content.replace(`物理底${FFFD}`, '物理底座');
content = content.replace(`同步${FFFD}`, '同步）');
content = content.replace(`主链同步${FFFD}`, '主链同步源');
content = content.replace(`柜定${FFFD}`, '柜定位');
content = content.replace(`明细工作${FFFD}`, '明细工作台');
content = content.replace(`监管件${FFFD}`, '监管件）');
content = content.replace(`记账凭证${FFFD}`, '记账凭证号');
content = content.replace(`季度${FFFD}`, '季度选择');

// ============ Search results ============
content = content.replace(`代码 : ${FFFD})`, '代码 : 无)');
content = content.replace(`档号${FFFD}`, '档号）');
content = content.replace(`金${FFFD}`, '金额');
content = content.replace(`组卷状${FFFD}`, '组卷状态');
content = content.replace(`完成${FFFD}`, '完成）');
content = content.replace(`上架进${FFFD}`, '上架进度');
content = content.replace(`${FFFD}月`, '月');
content = content.replace(`${FFFD}档案`, '档案');

// Remove any remaining U+FFFD characters
const remainingFFFD = (content.match(new RegExp(FFFD, 'g')) || []).length;
content = content.replace(new RegExp(FFFD, 'g'), '');

console.log(`Fixed patterns. Remaining U+FFFD: ${remainingFFFD}`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('File saved successfully');

// Verify no more FFFD
const finalContent = fs.readFileSync(filePath, 'utf8');
const finalCount = (finalContent.match(new RegExp(FFFD, 'g')) || []).length;
console.log(`Final U+FFFD count: ${finalCount}`);
