import { useState, useEffect } from 'react';
import { useDirectoryConfig } from '../DirectoryConfigContext';
import { ChevronDown, ChevronRight, FileText, BookOpen, BarChart3, Archive, Save, Calendar, Plus, Trash2, CheckCircle, Clock, FolderPlus, Edit2, Building2, X, ChevronUp } from 'lucide-react';

// 简单的 Checkbox 组件
const Checkbox = ({ checked, onCheckedChange, className = '' }: { 
  checked: boolean; 
  onCheckedChange: (checked: boolean) => void; 
  className?: string;
}) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={(e) => onCheckedChange(e.target.checked)}
    className={`w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer ${className}`}
  />
);

// 项目会计凭证合规配置（依据PDF内容）
const PROJECT_ACCOUNTING_CONFIG = {
  '一、项目立项阶段': {
    phases: {
      '前期费用': {
        desc: '调研、咨询、设计、招投标等',
        items: ['前期费用报销单', '咨询服务合同', '设计合同', '招投标文件', '项建议书', '可行性研究报告', '立项批复', '董事会决议', '预算表', '编码审批单']
      }
    }
  },
  '二、施工/执行阶段': {
    phases: {
      '（一）材料/物资采购与领用': {
        desc: '最常见',
        items: ['采购合同', '增值税发票', '入库单', '验收单', '物流单', '比价单', '出库单', '领用单', '材料分摊表', '结算单', '付款申请单', '银行回单']
      },
      '（二）人工费': {
        desc: '直接人工 + 项目管理人工',
        items: ['工资表', '考勤表', '工时记录', '社保计提表', '公积金计提表', '个税申报表', '工资发放回单', '社保缴费单', '公积金缴费单']
      },
      '（三）分包/外包款': {
        desc: '工程/服务类项目核心',
        items: ['分包合同', '分包结算单', '工程量确认单', '发票', '验收单', '付款申请单', '分包资质证明', '银行回单']
      },
      '（四）机械使用费/设备租赁': {
        desc: '',
        items: ['租赁合同', '机械台班记录', '结算单', '发票', '付款回单']
      },
      '（五）项目间接费用': {
        desc: '现场管理、办公、差旅等',
        items: ['费用报销单', '合规发票', '差旅审批单', '行程单', '酒店水单', '办公明细', '通讯费账单']
      },
      '（六）固定资产/无形资产购置': {
        desc: '项目专用',
        items: ['采购合同', '发票', '验收单', '资产卡片', '银行回单', '折旧计算表', '摊销计算表']
      },
      '（七）税务相关': {
        desc: '预缴、计提、缴纳',
        items: ['预缴税款表', '完税凭证', '项目收入明细', '收入结算单', '销项发票', '计税依据表', '增值税申报表', '城建税申报表']
      }
    }
  },
  '三、结算与收入确认阶段': {
    phases: {
      '项目进度结算': {
        desc: '履约进度确认',
        items: ['进度结算书', '工程量确认单', '甲方/监理签字确认单', '发票', '收款收据', '银行回单', '到账通知']
      },
      '竣工/最终结算': {
        desc: '含变更、签证',
        items: ['竣工结算报告', '最终确认单', '变更签证单', '尾款发票', '质保金协议', '质保金确认单']
      }
    }
  },
  '四、成本结转与损益处理': {
    phases: {
      '项目成本结转': {
        desc: '完工/履约完成',
        items: ['成本结转计算表', '项目成本台账', '履约进度表']
      },
      '项目毛利结转': {
        desc: '期末',
        items: ['毛利计算表', '损益结转凭证']
      }
    }
  },
  '五、项目关闭与收尾': {
    phases: {
      '质保金收回': {
        items: ['质保金到期确认单', '银行回单', '收据']
      },
      '保证金退回': {
        items: ['退款协议', '银行回单', '收据']
      },
      '项目档案归档': {
        desc: '备查',
        items: ['全套合同', '结算单', '凭证附件', '验收报告', '审计报告']
      }
    }
  }
};

// 扁平化所有项目会计项
const getAllProjectItems = (): string[] => {
  const items: string[] = [];
  Object.entries(PROJECT_ACCOUNTING_CONFIG).forEach(([stage, config]) => {
    if (config.phases) {
      Object.entries(config.phases).forEach(([phase, phaseConfig]) => {
        if (phaseConfig.items) items.push(...phaseConfig.items);
      });
    }
  });
  return items;
};

const TOTAL_PROJECT_ITEMS = getAllProjectItems().length;

// 会计档案完整组成内容（依据《会计档案管理办法》）
const ARCHIVE_CONTENT_CONFIG = {
  '会计凭证': {
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    children: {
      '原始凭证': {
        children: {
          '外来原始凭证': { items: ['增值税发票', '普通发票', '财政票据', '银行回单', '银行对账单回执', '收据', '差旅费报销单据', '运输单据', '报关单', '完税凭证', '社保缴费单据', '公积金缴费单据', '对外往来结算单据'] },
          '自制原始凭证': { items: ['入库单', '出库单', '领料单', '销售单', '工资表', '考勤表', '折旧计算表', '摊销表', '费用分摊单', '借款单', '报销单', '盘点表', '内部往来结算单', '收款收据', '付款申请单'] },
          '原始凭证附件': { items: ['合同复印件', '协议', '审批文件', '证明材料', '验收单', '质检单', '附件清单'] }
        }
      },
      '记账凭证': {
        children: {
          '专用记账凭证': { items: ['收款凭证', '付款凭证', '转账凭证'] },
          '通用记账凭证': { items: ['通用记账凭证'] },
          '凭证汇总表': { items: ['记账凭证附件汇总', '凭证汇总表', '科目汇总表'] },
          '调整凭证': { items: ['红字冲销凭证', '更正凭证', '调整凭证'] }
        }
      },
      '凭证附属装订资料': { items: ['凭证封面', '凭证封底', '凭证装订册', '凭证交接清单', '作废凭证', '空白凭证存根'] }
    }
  },
  '会计账簿': {
    icon: BookOpen,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    children: {
      '总账': { items: ['总分类账', '账簿启用表', '经管人员一览表'] },
      '明细账': {
        children: {
          '资产明细账': { items: ['资产明细账'] },
          '负债明细账': { items: ['负债明细账'] },
          '权益明细账': { items: ['权益明细账'] },
          '收入明细账': { items: ['收入明细账'] },
          '成本明细账': { items: ['成本明细账'] },
          '费用明细账': { items: ['费用明细账'] },
          '分户账': { items: ['分户账'] }
        }
      },
      '日记账': { items: ['现金日记账', '银行存款日记账'] },
      '辅助账簿/备查账': {
        children: {
          '往来备查簿': { items: ['应收账款备查簿', '应付账款备查簿'] },
          '票据备查簿': { items: ['支票备查簿', '汇票备查簿', '本票备查簿'] },
          '资产备查簿': { items: ['固定资产备查簿', '低值易耗品备查簿', '出租资产备查簿', '出借资产备查簿'] },
          '担保备查簿': { items: ['对外担保备查簿', '抵押备查簿', '托管资产备查簿'] },
          '台账': { items: ['合同台账', '往来单位台账', '税务备查台账'] }
        }
      },
      '账簿相关资料': { items: ['账簿扉页', '账册目录', '结账记录', '错账更正记录', '账簿交接记录', '作废账页'] }
    }
  },
  '财务会计报告': {
    icon: BarChart3,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    children: {
      '定期财务报告': {
        children: {
          '会计报表主表': { items: ['资产负债表', '利润表', '现金流量表', '所有者权益变动表'] },
          '会计报表附表': { items: ['资产减值明细表', '应交税费明细表', '利润分配表', '成本明细表', '费用明细表'] },
          '财务报表附注': { items: ['报表注释', '重大事项说明', '会计政策变更说明', '会计估计变更说明'] },
          '财务情况说明书': { items: ['企业经营情况', '财务分析', '重大投融资', '盈亏分析', '风险说明'] }
        }
      },
      '专项财务报告': {
        children: {
          '内部管理报表': { items: ['部门利润表', '项目成本表', '预算执行表', '经营分析表', '绩效考核报表'] },
          '对外专项报告': { items: ['清算报表', '改制报表', '合并财务报表', '分部报表', '关联方交易报表'] },
          '审计相关报告': { items: ['内部审计报告', '外部审计报告', '验资报告', '评估报告', '鉴证报告'] }
        }
      },
      '报告附属资料': { items: ['报表封面', '报送回执', '审批签字页', '报告交接记录', '报表底稿', '试算平衡表'] }
    }
  },
  '其他会计资料': {
    icon: Archive,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    children: {
      '会计核算配套资料': {
        children: {
          '银行资料': { items: ['银行开户许可证', '账户备案资料', '银行印鉴卡', '银行余额调节表', '银行对账单', '网银操作日志', '账户变更资料', '账户注销资料'] },
          '税务资料': { items: ['纳税申报表', '税务备案表', '税收优惠资料', '税务稽查结论', '涉税批复', '发票领购台账', '发票使用台账', '发票核销台账', '发票存根联', '发票登记簿'] },
          '资产核算资料': { items: ['资产盘点报告', '盘点差异处理文件', '资产处置审批单', '资产清查报告', '资产评估资料'] },
          '预算决算资料': { items: ['单位全面预算', '部门预算', '预算批复', '预算调整文件', '年度决算报告', '决算批复'] }
        }
      },
      '会计制度与文书档案': {
        children: {
          '管理制度': { items: ['财务管理制度', '会计核算办法', '内控财务制度', '资金管理制度', '费用报销制度'] },
          '交接档案': { items: ['会计人员交接清单', '会计岗位变动资料', '会计档案移交清册', '保管清册', '销毁清册'] },
          '档案管理': { items: ['会计档案鉴定意见书', '档案查阅登记', '档案借阅登记', '档案复制件审批记录'] }
        }
      },
      '合同协议及结算资料': {
        children: {
          '经济合同': { items: ['采购合同', '销售合同', '服务合同', '借款合同', '租赁合同', '投融资合同', '担保合同', '工程合同'] },
          '结算协议': { items: ['结算协议', '往来对账函', '询证函', '债务重组协议', '债权债务确认单'] }
        }
      },
      '电子会计档案专属资料': {
        children: {
          '电子凭证': { items: ['电子会计凭证', '电子账簿', '电子报表', '电子票据', '电子回单'] },
          '系统资料': { items: ['会计电算化系统日志', '账套备份数据', '备份台账', '系统运维记录', '电子档案元数据', '电子签名', '防篡改校验记录'] },
          '文档资料': { items: ['财务软件操作手册', '账套初始化资料', '科目体系设置文档'] }
        }
      },
      '其他辅助资料': { items: ['经济批复', '请示文件', '会议纪要', '工会经费资料', '党费资料', '专项资金资料', '财政拨款资料', '清算注销资料', '分立合并资料', '改制资料', '司法调取回执', '纪检调取回执', '监察调取回执'] }
    }
  }
};

const getAllArchiveItems = (): string[] => {
  const items: string[] = [];
  Object.entries(ARCHIVE_CONTENT_CONFIG).forEach(([category, config]) => {
    if (config.children) {
      Object.entries(config.children).forEach(([subCategory, subConfig]) => {
        if ('items' in subConfig && subConfig.items) items.push(...subConfig.items);
        else if ('children' in subConfig && subConfig.children) {
          Object.entries(subConfig.children).forEach(([thirdCategory, thirdConfig]) => {
            if (thirdConfig.items) items.push(...thirdConfig.items);
          });
        }
      });
    }
  });
  return items;
};

const TOTAL_ARCHIVE_ITEMS = getAllArchiveItems().length;

// 页签类型
type TabType = 'archive-category' | 'year-settings' | 'project-settings';

// 项目类型（包含会计内容勾选）
interface ProjectItem {
  id: string;
  name: string;
  code: string;
  description: string;
  selectedAccountingItems: Set<string>;
}

export default function DirectoryConfigPanel() {
  const { config, updateConfig } = useDirectoryConfig();
  const [activeTab, setActiveTab] = useState<TabType>('archive-category');
  
  // 档案分类勾选状态
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['会计凭证', '会计账簿', '财务会计报告', '其他会计资料']));
  const [selectedArchiveItems, setSelectedArchiveItems] = useState<Set<string>>(new Set());
  
  // 年份设置状态
  const [selectedYears, setSelectedYears] = useState<Set<number>>(
    new Set(config.years.filter(y => y.enabled).map(y => y.year))
  );
  const [newYearInput, setNewYearInput] = useState('');
  
  // 项目设置状态
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCode, setNewProjectCode] = useState('');
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [expandedProjectForAccounting, setExpandedProjectForAccounting] = useState<string | null>(null);
  const [expandedAccountingStages, setExpandedAccountingStages] = useState<Set<string>>(new Set());
  
  // 初始化
  useEffect(() => {
    const allArchiveItems = getAllArchiveItems();
    setSelectedArchiveItems(new Set(allArchiveItems));
    
    // 初始化项目列表
    const initialProjects = config.projects.map(p => ({
      id: p.id,
      name: p.name,
      code: p.code,
      description: '',
      selectedAccountingItems: new Set(getAllProjectItems())
    }));
    setProjects(initialProjects);
  }, []);
  
  // 档案分类勾选函数
  const toggleArchiveCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) newExpanded.delete(category);
    else newExpanded.add(category);
    setExpandedCategories(newExpanded);
  };
  
  const toggleArchiveItem = (item: string) => {
    const newSelected = new Set(selectedArchiveItems);
    if (newSelected.has(item)) newSelected.delete(item);
    else newSelected.add(item);
    setSelectedArchiveItems(newSelected);
  };
  
  const toggleSubArchiveItems = (items: string[]) => {
    const allSelected = items.every(item => selectedArchiveItems.has(item));
    const newSelected = new Set(selectedArchiveItems);
    if (allSelected) items.forEach(item => newSelected.delete(item));
    else items.forEach(item => newSelected.add(item));
    setSelectedArchiveItems(newSelected);
  };
  
  const getSubArchiveItems = (subConfig: any): string[] => {
    if ('items' in subConfig && subConfig.items) return subConfig.items;
    if ('children' in subConfig && subConfig.children) {
      const items: string[] = [];
      Object.values(subConfig.children).forEach((child: any) => {
        if (child.items) items.push(...child.items);
      });
      return items;
    }
    return [];
  };
  
  // 年份设置函数
  const availableYears = Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - i);
  
  const toggleYear = (year: number) => {
    const newSelected = new Set(selectedYears);
    if (newSelected.has(year)) newSelected.delete(year);
    else newSelected.add(year);
    setSelectedYears(newSelected);
  };
  
  const addCustomYear = () => {
    const year = parseInt(newYearInput);
    if (year && year > 1900 && year <= new Date().getFullYear() + 5) {
      if (!availableYears.includes(year)) availableYears.push(year);
      availableYears.sort((a, b) => b - a);
      setSelectedYears(new Set([...selectedYears, year]));
      setNewYearInput('');
    }
  };
  
  // 项目设置函数
  const addProject = () => {
    if (newProjectName && newProjectCode) {
      const newProject: ProjectItem = {
        id: `project-${Date.now()}`,
        name: newProjectName,
        code: newProjectCode,
        description: '',
        selectedAccountingItems: new Set(getAllProjectItems())
      };
      setProjects([...projects, newProject]);
      setNewProjectName('');
      setNewProjectCode('');
    }
  };
  
  const deleteProject = (id: string) => {
    setProjects(projects.filter(p => p.id !== id));
    if (expandedProjectForAccounting === id) setExpandedProjectForAccounting(null);
  };
  
  const updateProject = (id: string, field: 'name' | 'code' | 'description', value: string) => {
    setProjects(projects.map(p => p.id === id ? { ...p, [field]: value } : p));
  };
  
  // 项目会计内容选择函数
  const toggleAccountingStage = (stage: string) => {
    const newExpanded = new Set(expandedAccountingStages);
    if (newExpanded.has(stage)) newExpanded.delete(stage);
    else newExpanded.add(stage);
    setExpandedAccountingStages(newExpanded);
  };
  
  const toggleProjectAccountingItem = (projectId: string, item: string) => {
    setProjects(projects.map(p => {
      if (p.id === projectId) {
        const newSelected = new Set(p.selectedAccountingItems);
        if (newSelected.has(item)) newSelected.delete(item);
        else newSelected.add(item);
        return { ...p, selectedAccountingItems: newSelected };
      }
      return p;
    }));
  };
  
  const toggleProjectPhaseItems = (projectId: string, items: string[]) => {
    setProjects(projects.map(p => {
      if (p.id === projectId) {
        const currentItems = p.selectedAccountingItems;
        const allSelected = items.every(item => currentItems.has(item));
        const newSelected = new Set(currentItems);
        if (allSelected) items.forEach(item => newSelected.delete(item));
        else items.forEach(item => newSelected.add(item));
        return { ...p, selectedAccountingItems: newSelected };
      }
      return p;
    }));
  };
  
  // 保存所有配置
  const saveAllConfig = () => {
    const newYears = availableYears
      .filter(year => selectedYears.has(year))
      .map((year, index) => ({ id: `year-${year}`, year, enabled: true, order: index }));
    
    const newProjects = projects.map((p, index) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      enabled: true,
      order: index,
      selectedAccountingItems: Array.from(p.selectedAccountingItems)
    }));
    
    updateConfig({
      ...config,
      years: newYears,
      projects: newProjects,
      selectedArchiveItems: Array.from(selectedArchiveItems)
    });
  };
  
  // 页签配置
  const tabs = [
    { id: 'archive-category', label: '档案分类', icon: Archive },
    { id: 'year-settings', label: '年份设置', icon: Calendar },
    { id: 'project-settings', label: '项目设置', icon: FolderPlus },
  ];
  
  const sortedSelectedYears = Array.from(selectedYears).sort((a, b) => b - a);
  const minYear = sortedSelectedYears.length > 0 ? Math.min(...sortedSelectedYears) : null;
  const maxYear = sortedSelectedYears.length > 0 ? Math.max(...sortedSelectedYears) : null;
  
  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* Header with Tabs */}
      <div className="border-b border-slate-200">
        <div className="px-6 pt-5 pb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">目录配置</h2>
          <button
            onClick={saveAllConfig}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span className="text-sm font-medium">保存全部</span>
          </button>
        </div>
        
        {/* Tabs */}
        <div className="px-6 flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg transition-all text-sm font-medium ${
                  isActive
                    ? 'bg-slate-100 text-slate-800 border-b-2 border-blue-600'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Tab 1: 档案分类勾选 */}
        {activeTab === 'archive-category' && (
          <div className="p-6">
            <div className="mb-4 text-sm text-slate-500">
              已选 <span className="font-bold text-blue-600">{selectedArchiveItems.size}</span> / {TOTAL_ARCHIVE_ITEMS} 项档案类型
            </div>
            <div className="space-y-4">
              {Object.entries(ARCHIVE_CONTENT_CONFIG).map(([category, catConfig]) => {
                const Icon = catConfig.icon;
                const isExpanded = expandedCategories.has(category);
                const categoryItems = getSubArchiveItems(catConfig.children || {});
                const categorySelectedCount = categoryItems.filter(item => selectedArchiveItems.has(item)).length;
                
                return (
                  <div key={category} className={`rounded-xl border ${catConfig.bgColor} border-slate-200`}>
                    <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => toggleArchiveCategory(category)}>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      <Icon className={`w-4 h-4 ${catConfig.color}`} />
                      <span className="text-sm font-bold text-slate-700">{category}</span>
                      <span className="text-xs text-slate-500">({categorySelectedCount}/{categoryItems.length})</span>
                    </div>
                    
                    {isExpanded && catConfig.children && (
                      <div className="px-3 pb-3 space-y-3">
                        {Object.entries(catConfig.children).map(([subCategory, subConfig]) => {
                          const subItems = getSubArchiveItems(subConfig);
                          const subSelectedCount = subItems.filter(item => selectedArchiveItems.has(item)).length;
                          const allSubSelected = subItems.length > 0 && subItems.every(item => selectedArchiveItems.has(item));
                          
                          return (
                            <div key={subCategory} className="ml-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <Checkbox checked={allSubSelected} onCheckedChange={() => toggleSubArchiveItems(subItems)} />
                                <span className="text-xs font-semibold text-slate-600">{subCategory}</span>
                                <span className="text-xs text-slate-400">({subSelectedCount}/{subItems.length})</span>
                              </div>
                              
                              {'items' in subConfig && subConfig.items ? (
                                <div className="ml-5 grid grid-cols-3 gap-1">
                                  {subConfig.items.map((item) => (
                                    <div key={item} className="flex items-center gap-1.5 py-0.5">
                                      <Checkbox checked={selectedArchiveItems.has(item)} onCheckedChange={() => toggleArchiveItem(item)} className="h-3.5 w-3.5" />
                                      <span className="text-xs text-slate-600">{item}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : 'children' in subConfig && subConfig.children ? (
                                <div className="ml-5 space-y-1.5">
                                  {Object.entries(subConfig.children).map(([thirdCategory, thirdConfig]) => {
                                    const thirdItems = thirdConfig.items || [];
                                    const thirdSelectedCount = thirdItems.filter(item => selectedArchiveItems.has(item)).length;
                                    const allThirdSelected = thirdItems.length > 0 && thirdItems.every(item => selectedArchiveItems.has(item));
                                    
                                    return (
                                      <div key={thirdCategory}>
                                        <div className="flex items-center gap-2 mb-1">
                                          <Checkbox checked={allThirdSelected} onCheckedChange={() => toggleSubArchiveItems(thirdItems)} className="h-3.5 w-3.5" />
                                          <span className="text-xs font-medium text-slate-500">{thirdCategory}</span>
                                          <span className="text-xs text-slate-400">({thirdSelectedCount}/{thirdItems.length})</span>
                                        </div>
                                        <div className="ml-5 grid grid-cols-3 gap-1">
                                          {thirdItems.map((item) => (
                                            <div key={item} className="flex items-center gap-1.5 py-0.5">
                                              <Checkbox checked={selectedArchiveItems.has(item)} onCheckedChange={() => toggleArchiveItem(item)} className="h-3 w-3" />
                                              <span className="text-xs text-slate-600">{item}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Tab 2: 年份设置 */}
        {activeTab === 'year-settings' && (
          <div className="p-6">
            {selectedYears.size > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-medium text-blue-600">年份范围</span>
                  </div>
                  <div className="text-lg font-bold text-slate-800">{minYear} ~ {maxYear}</div>
                  <div className="text-xs text-slate-500 mt-1">共 {maxYear && minYear ? maxYear - minYear + 1 : 0} 年跨度</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-600">已启用</span>
                  </div>
                  <div className="text-lg font-bold text-slate-800">{selectedYears.size} 年</div>
                  <div className="text-xs text-slate-500 mt-1">已配置年份数量</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-medium text-amber-600">最近年份</span>
                  </div>
                  <div className="text-lg font-bold text-slate-800">{maxYear || '-'}</div>
                  <div className="text-xs text-slate-500 mt-1">当前最新档案年份</div>
                </div>
              </div>
            )}
            
            <div className="mb-6 bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-4">
                <div className="flex-1 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    placeholder="输入自定义年份"
                    value={newYearInput}
                    onChange={(e) => setNewYearInput(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1900"
                    max={new Date().getFullYear() + 5}
                  />
                </div>
                <button onClick={addCustomYear} disabled={!newYearInput} className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 text-sm font-medium">
                  添加年份
                </button>
              </div>
            </div>
            
            <div className="text-sm font-medium text-slate-600 mb-3">点击年份卡片进行选择/取消</div>
            <div className="grid grid-cols-5 gap-3">
              {availableYears.map((year) => {
                const isSelected = selectedYears.has(year);
                const isCurrentYear = year === new Date().getFullYear();
                return (
                  <button
                    key={year}
                    onClick={() => toggleYear(year)}
                    className={`relative p-3 rounded-xl border-2 transition-all cursor-pointer ${
                      isSelected ? 'bg-blue-50 border-blue-400 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Calendar className={`w-4 h-4 mb-1.5 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className={`text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-slate-600'}`}>{year}</span>
                    {isCurrentYear && <span className="absolute top-1 right-1 text-xs px-1 py-0.5 bg-emerald-100 text-emerald-600 rounded font-medium">当前</span>}
                    {isSelected && <CheckCircle className="absolute top-1 left-1 w-3.5 h-3.5 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Tab 3: 项目设置 */}
        {activeTab === 'project-settings' && (
          <div className="p-6">
            {/* Add New Project */}
            <div className="mb-6 bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center gap-4">
                <FolderPlus className="w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="项目名称"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="项目编码"
                  value={newProjectCode}
                  onChange={(e) => setNewProjectCode(e.target.value)}
                  className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={addProject}
                  disabled={!newProjectName || !newProjectCode}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  新增项目
                </button>
              </div>
            </div>
            
            {/* Project List */}
            <div className="text-sm font-medium text-slate-600 mb-3">已配置项目列表（{projects.length} 个）</div>
            <div className="space-y-3">
              {projects.map((project) => {
                const isExpanded = expandedProjectForAccounting === project.id;
                const selectedCount = project.selectedAccountingItems.size;
                
                return (
                  <div key={project.id} className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all overflow-hidden">
                    {/* Project Header */}
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-blue-600" />
                        {editingProject === project.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={project.name}
                              onChange={(e) => updateProject(project.id, 'name', e.target.value)}
                              className="px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <input
                              type="text"
                              value={project.code}
                              onChange={(e) => updateProject(project.id, 'code', e.target.value)}
                              className="w-20 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button onClick={() => setEditingProject(null)} className="px-2 py-1 bg-emerald-600 text-white rounded text-sm">完成</button>
                          </div>
                        ) : (
                          <div>
                            <div className="text-sm font-bold text-slate-800">{project.name}</div>
                            <div className="text-xs text-slate-500">编码: {project.code} | 已选 {selectedCount}/{TOTAL_PROJECT_ITEMS} 项会计内容</div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setExpandedProjectForAccounting(isExpanded ? null : project.id)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            isExpanded 
                              ? 'bg-blue-100 text-blue-600' 
                              : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600'
                          }`}
                        >
                          {isExpanded ? '收起会计内容' : '配置会计内容'}
                        </button>
                        <button onClick={() => setEditingProject(project.id)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteProject(project.id)} className="p-2 hover:bg-red-50 rounded-lg text-slate-500 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Project Accounting Content Selection */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50 p-4">
                        <div className="text-sm font-medium text-slate-700 mb-3">
                          选择该项目可能产生的会计凭证内容
                        </div>
                        <div className="space-y-3">
                          {Object.entries(PROJECT_ACCOUNTING_CONFIG).map(([stage, stageConfig]) => {
                            const isStageExpanded = expandedAccountingStages.has(stage);
                            const stageItems: string[] = [];
                            if (stageConfig.phases) {
                              Object.values(stageConfig.phases).forEach((phase) => {
                                if (phase.items) stageItems.push(...phase.items);
                              });
                            }
                            const stageSelectedCount = stageItems.filter(item => project.selectedAccountingItems.has(item)).length;
                            
                            return (
                              <div key={stage} className="bg-white rounded-lg border border-slate-200">
                                <div 
                                  className="flex items-center gap-3 p-3 cursor-pointer"
                                  onClick={() => toggleAccountingStage(stage)}
                                >
                                  {isStageExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                  <span className="text-sm font-semibold text-slate-700">{stage}</span>
                                  <span className="text-xs text-slate-500">({stageSelectedCount}/{stageItems.length})</span>
                                </div>
                                
                                {isStageExpanded && stageConfig.phases && (
                                  <div className="px-3 pb-3 space-y-3">
                                    {Object.entries(stageConfig.phases).map(([phaseName, phaseConfig]) => {
                                      const phaseItems = phaseConfig.items || [];
                                      const phaseSelectedCount = phaseItems.filter(item => project.selectedAccountingItems.has(item)).length;
                                      const allPhaseSelected = phaseItems.length > 0 && phaseItems.every(item => project.selectedAccountingItems.has(item));
                                      const phaseConfigItems = phaseConfig.items || [];
                                      
                                      return (
                                        <div key={phaseName} className="ml-3">
                                          <div className="flex items-center gap-2 mb-1.5">
                                            <Checkbox 
                                              checked={allPhaseSelected} 
                                              onCheckedChange={() => toggleProjectPhaseItems(project.id, phaseConfigItems)} 
                                            />
                                            <span className="text-xs font-medium text-slate-600">{phaseName}</span>
                                            {phaseConfig.desc && <span className="text-xs text-slate-400">（{phaseConfig.desc}）</span>}
                                            <span className="text-xs text-slate-400">[{phaseSelectedCount}/{phaseItems.length}]</span>
                                          </div>
                                          <div className="ml-5 grid grid-cols-3 gap-1">
                                            {phaseItems.map((item) => (
                                              <div key={item} className="flex items-center gap-1.5 py-0.5">
                                                <Checkbox 
                                                  checked={project.selectedAccountingItems.has(item)} 
                                                  onCheckedChange={() => toggleProjectAccountingItem(project.id, item)} 
                                                  className="h-3.5 w-3.5" 
                                                />
                                                <span className="text-xs text-slate-600">{item}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {projects.length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  <FolderPlus className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <div className="text-sm">暂无项目配置，请点击上方添加新项目</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
        配置保存后将在左侧目录树中生效
      </div>
    </div>
  );
}