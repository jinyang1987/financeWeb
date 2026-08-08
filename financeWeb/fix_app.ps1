param()
$ErrorActionPreference = "Stop"
$filePath = "d:\workspace\financeWeb\financeWeb\src\App.tsx"
$utf8 = [System.Text.Encoding]::UTF8
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$content = $utf8.GetString($bytes)

# Count U+FFFD
$count = 0
for ($i = 0; $i -lt $content.Length; $i++) { if ($content[$i] -eq [char]0xFFFD) { $count++ } }
Write-Host "Found $count U+FFFD characters"

$fffd = [char]0xFFFD

# Fix specific known patterns one at a time
$replacements = @(
    "记-001$fffd",  '记-001"'
    "总金$fffd", '总金额'
    "记账$fffd", "记账人"
    "核销状$fffd", "核销状态"
    "会计师组$fffd", "会计师组织"
    "配置>", "配置>"  # no-op test
)

Write-Host "Using simple string replacement approach..."

# Simple approach: replace all occurrences of U+FFFD in specific string contexts
# We know what strings come before and after each U+FFFD

# Line 90: '财务凭证的核心识别号码，如记-001[U+FFFD]
$content = $content.Replace("记-001$fffd", '记-001"')

# Line 91: '报销凭证的借贷轧平人民币总金[U+FFFD]
$content = $content.Replace("总金$fffd", '总金额')

# Line 92: '对应的记账财务年度，如[U+FFFD]026[U+FFFD]
$content = $content.Replace("如$fffd"+"026$fffd", '如"2026"')

# Line 93: '记账[U+FFFD]
$content = $content.Replace("记账$fffd", "记账人")

# Line 94: '勾稽核销状[U+FFFD]
$content = $content.Replace("核销状$fffd", "核销状态")

# Line 104: '例如[U+FFFD]025年度董事会审计财务报告[U+FFFD]
$content = $content.Replace("如$fffd"+"025$fffd", '如"2025"')
$content = $content.Replace("报告$fffd", '报告"')

# Line 105: '出具外部审计核验结论的第三方会计师组[U+FFFD]
$content = $content.Replace("会计师组$fffd", "会计师组织") 

# Line 112: '南方分公司出纳凭[U+FFFD]
$content = $content.Replace("出纳凭$fffd", "出纳凭证")

# Line 117: '南方智造分公司付款台账索引[U+FFFD]
$content = $content.Replace("索引$fffd", "索引")

# Line 152: '集团总部2026账套档案[U+FFFD]
$content = $content.Replace("档案$fffd", "档案")

# Line 155: '[U+FFFD]001'
$content = $content.Replace("$fffd"+"001'", "记-001'")

# Line 156: '[U+FFFD]002'
$content = $content.Replace("$fffd"+"002'", "记-002'")

# Line 160: '王丽(核算[U+FFFD]'
$content = $content.Replace("核算$fffd", "核算员")
$content = $content.Replace("审批$fffd", "审批中")

# Line 161: '刘明(资金[U+FFFD]'
$content = $content.Replace("资金$fffd", "资金员")

# Line 165: '上海财务[U+FFFD]'
$content = $content.Replace("财务$fffd", "财务部")
$content = $content.Replace("核算$fffd", "核算部")
$content = $content.Replace("$fffd"+"001", "记-001")
$content = $content.Replace("$fffd"+"002", "记-002")
$content = $content.Replace("$fffd"+"005", "记-005")
$content = $content.Replace("$fffd"+"011", "记-011")
$content = $content.Replace("$fffd"+"015", "记-015")
$content = $content.Replace("$fffd"+"050", "记-050")

# Line 171-173: return table status
$content = $content.Replace("超期未归$fffd", "超期未归还")
$content = $content.Replace("正常状$fffd", "正常状态")
$content = $content.Replace("借阅$fffd", "借阅中")
$content = $content.Replace("催还$fffd", "催还单")

# Line 179-180: special orders
$content = $content.Replace("自动归纳$fffd", "自动归纳）")

# Line 184-187: clean table data
$content = $content.Replace("$fffd"+"[2026]", "记[2026]")
$content = $content.Replace("空格标$fffd", "空格标记")
$content = $content.Replace("质检$fffd", "质检中")
$content = $content.Replace("已上$fffd", "已上架")
$content = $content.Replace("跨卷盒分$fffd", "跨卷盒分割")
$content = $content.Replace("已借出", "已借出")  # already ok

# Line 196-197: borrow order data
$content = $content.Replace("档案$fffd", "档案员")
$content = $content.Replace("核算$fffd", "核算员")
$content = $content.Replace("凭$fffd", "凭证")

# Line 200: customVoucher staff
$content = $content.Replace("$fffd"+"--", "记--")

# Line 205: stats mode
$content = $content.Replace("上海财务$fffd", "上海财务部")

# Comments
$content = $content.Replace("全宗下拉框状$fffd", "全宗下拉框状态")
$content = $content.Replace("视图展开状$fffd", "视图展开状态")

# Handler functions
$content = $content.Replace("编码$fffd", "编码）")
$content = $content.Replace("父类$fffd", "父类目")
$content = $content.Replace("一键四性检$fffd", "一键四性检查")
$content = $content.Replace("要素$fffd", "要素")
$content = $content.Replace("核$fffd"+"$fffd", "核验")
$content = $content.Replace("存证凭$fffd", "存证凭证")
$content = $content.Replace("签章缺陷$fffd", "签章缺陷）")
$content = $content.Replace("通过$fffd", "通过）")
$content = $content.Replace("一键自动组$fffd", "一键自动组卷")
$content = $content.Replace("组$fffd", "组卷")
$content = $content.Replace("全数组卷$fffd", "全数组卷）")
$content = $content.Replace("装订组$fffd", "装订组卷")
$content = $content.Replace("首席财务审核$fffd", "首席财务审核员")
$content = $content.Replace("案$fffd", "案卷")
$content = $content.Replace("已$fffd", "已组卷")
$content = $content.Replace("已$fffd"+" as const", "已组卷 as const")
$content = $content.Replace("标准$fffd", "标准）")
$content = $content.Replace("一键修护可用$fffd", "一键修护可用性")
$content = $content.Replace("检测$fffd", "检测）")
$content = $content.Replace("修复$fffd", "修复）")
$content = $content.Replace("故障修$fffd", "故障修复")
$content = $content.Replace("系统管理$fffd", "系统管理员")
$content = $content.Replace("合格$fffd", "合格）")
$content = $content.Replace("包体$fffd", "包体）")
$content = $content.Replace("签名链$fffd", "签名链）")
$content = $content.Replace("注销$fffd", "注销）")

# JSX sidebar
$content = $content.Replace("会计凭证$fffd", "会计凭证）")
$content = $content.Replace("合同及协$fffd", "合同及协议")
$content = $content.Replace("进入数电清洗与分册插卷计算模$fffd", "进入数电清洗与分册插卷计算模块")
$content = $content.Replace("数字化虚拟库$fffd", "数字化虚拟库房")
$content = $content.Replace("进入审批流协同网络中$fffd", "进入审批流协同网络中台")
$content = $content.Replace("使用审批管控 (线上$fffd", "使用审批管控 (线上)")
$content = $content.Replace("进入归还与催还闭环专$fffd", "进入归还与催还闭环专区")
$content = $content.Replace("归还与催还闭$fffd", "归还与催还闭环")
$content = $content.Replace("进入借单专项全周期精细监$fffd", "进入借单专项全周期精细监控")
$content = $content.Replace("进入虚拟库房：请下拉至页面底部【会计防销毁与会签鉴定】模块$fffd", "进入虚拟库房：请下拉至页面底部【会计防销毁与会签鉴定】模块）")
$content = $content.Replace("进入保障时效监督工作流配$fffd", "进入保障时效监督工作流配置")
$content = $content.Replace("工作流配$fffd", "工作流配置")
$content = $content.Replace("进入档案统计仪表$fffd", "进入档案统计仪表盘")
$content = $content.Replace("档案统计仪表$fffd", "档案统计仪表盘")
$content = $content.Replace("查询统计分析 (三模$fffd", "查询统计分析 (三模式)")
$content = $content.Replace("进入档案库配置页$fffd", "进入档案库配置页面")
$content = $content.Replace("档案库配$fffd", "档案库配置")
$content = $content.Replace("进入检测配置页$fffd", "进入检测配置页面")
$content = $content.Replace("检测配$fffd", "检测配置")

# Header titles
$content = $content.Replace("Main Header - 与左侧logo区域高度一$fffd", "Main Header - 与左侧logo区域高度一致")
$content = $content.Replace("财务类视$fffd", "财务类视图")
$content = $content.Replace("全局引擎・多端业务聚$fffd", "全局引擎・多端业务聚合")
$content = $content.Replace("审批管理・移动办公同$fffd", "审批管理・移动办公同步")
$content = $content.Replace("借阅管控・精细查阅台$fffd", "借阅管控・精细查阅台账")
$content = $content.Replace("决策分析・综合经营大$fffd", "决策分析・综合经营大盘")
$content = $content.Replace("清洗引擎・插数计算工$fffd", "清洗引擎・插数计算工具")
$content = $content.Replace("安全审计・日志追$fffd", "安全审计・日志追踪")
$content = $content.Replace("全宗数字化资产运行大$fffd", "全宗数字化资产运行大盘")
$content = $content.Replace("电子会计档案"四性"全生命周期质检明细台账 (财务$fffd", "电子会计档案"四性"全生命周期质检明细台账 (财务)")
$content = $content.Replace("电子会计档案"四性"全生命周期质检明细台账 (项目$fffd", "电子会计档案"四性"全生命周期质检明细台账 (项目)")
$content = $content.Replace("电子会计档案"四性"全生命周期质检明细台账 (时间$fffd", "电子会计档案"四性"全生命周期质检明细台账 (时间)")
$content = $content.Replace("前端业务系统分离聚拢：解耦异构系$fffd", "前端业务系统分离聚拢：解耦异构系统")
$content = $content.Replace("主键匹配$fffd", "主键匹配）")
$content = $content.Replace("档案使用审批全流程管控（对接协同办公系统实时同步$fffd", "档案使用审批全流程管控（对接协同办公系统实时同步）")
$content = $content.Replace("标准化电子会计凭证借阅清单与多维条件定$fffd", "标准化电子会计凭证借阅清单与多维条件定义")
$content = $content.Replace("档案归还多维度核对与超期自动催缴督办$fffd", "档案归还多维度核对与超期自动催缴督办）")
$content = $content.Replace("多维档案查阅与经营周期全要素数据统计分析 (三模$fffd", "多维档案查阅与经营周期全要素数据统计分析 (三模式)")
$content = $content.Replace("电子会计凭证特殊字符清洗与分册插卷计算模$fffd", "电子会计凭证特殊字符清洗与分册插卷计算模块")
$content = $content.Replace("借调单专项生命周期精细化管理 (纸质实体与电子介$fffd", "借调单专项生命周期精细化管理 (纸质实体与电子介质)")
$content = $content.Replace("实体库房与电子多介质生命周期闭环自适应微控 (密集$fffd", "实体库房与电子多介质生命周期闭环自适应微控 (密集架)")
$content = $content.Replace("HSM+销毁审$fffd", "HSM+销毁审核)")
$content = $content.Replace("全宗管理：会计全宗一元化底座定义仪表$fffd", "全宗管理：会计全宗一元化底座定义仪表盘")
$content = $content.Replace("多维电子证据链防篡改审计工作流组$fffd", "多维电子证据链防篡改审计工作流组织")
$content = $content.Replace("单位管理：统一组织层级与编码体$fffd", "单位管理：统一组织层级与编码体系")
$content = $content.Replace("人员管理：全系统用户与岗位管$fffd", "人员管理：全系统用户与岗位管理")
$content = $content.Replace("全宗选择$fffd", "全宗选择器")
$content = $content.Replace("下拉$fffd", "下拉框")
$content = $content.Replace("分隔$fffd", "分隔线")
$content = $content.Replace("用户信息 - 简$fffd", "用户信息 - 简约")
$content = $content.Replace("退出登$fffd", "退出登录")
$content = $content.Replace("退$fffd", "退出")

# Dashboard area
$content = $content.Replace("部门与门类构$fffd", "部门与门类构成")
$content = $content.Replace("比重$fffd", "比重）")
$content = $content.Replace("凭$fffd", "凭证")
$content = $content.Replace("记账金额 ($fffd", "记账金额 (元)")
$content = $content.Replace("四性检测结$fffd", "四性检测结果")
$content = $content.Replace("状$fffd", "状态")
$content = $content.Replace("真实性检$fffd", "真实性检查")
$content = $content.Replace("完整性校$fffd", "完整性校验")
$content = $content.Replace("可用度检$fffd", "可用度检测")
$content = $content.Replace("安全性核$fffd", "安全性核查")
$content = $content.Replace("缺字$fffd", "缺字型")
$content = $content.Replace("敏感字过$fffd", "敏感字过滤")
$content = $content.Replace("销毁凭$fffd", "销毁凭证")
$content = $content.Replace("关键词$fffd", "关键词）")

# Header dashboard
$content = $content.Replace("当前全宗会计凭证部门与门类构$fffd", "当前全宗会计凭证部门与门类构成")
$content = $content.Replace("比重$fffd", "比重）")
$content = $content.Replace("物理底$fffd", "物理底座")
$content = $content.Replace("同步$fffd", "同步）")
$content = $content.Replace("主链同步$fffd", "主链同步源")
$content = $content.Replace("柜定$fffd", "柜定位")
$content = $content.Replace("明细工作$fffd", "明细工作台")
$content = $content.Replace("监管件$fffd", "监管件）")
$content = $content.Replace("记账凭证$fffd", "记账凭证号")
$content = $content.Replace("季度$fffd", "季度选择")

# Search results
$content = $content.Replace("代码 : " + $fffd + ")", "代码 : 无)")
$content = $content.Replace("档号$fffd", "档号）")
$content = $content.Replace("金$fffd", "金额")
$content = $content.Replace("组卷状$fffd", "组卷状态")
$content = $content.Replace("完成$fffd", "完成）")
$content = $content.Replace("上架进$fffd", "上架进度")
$content = $content.Replace("$fffd"+"月", "月")
$content = $content.Replace("$fffd"+"档案", "档案")

# Clear remaining U+FFFD at very end of strings (probably simple chars)
# These are likely individual chars that got corrupted
$content = $content.Replace("$fffd", "")

$remaining = 0
for ($i = 0; $i -lt $content.Length; $i++) { if ($content[$i] -eq [char]0xFFFD) { $remaining++ } }
Write-Host "Remaining U+FFFD: $remaining"

[System.IO.File]::WriteAllBytes($filePath, $utf8.GetBytes($content))
Write-Host "File saved successfully"
