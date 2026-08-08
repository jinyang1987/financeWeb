import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { DirectoryConfig, defaultDirectoryConfig } from './configTypes';
import { fetchDirectoryConfig, saveDirectoryConfig as saveConfig } from './services/directoryConfigService';

interface DirectoryConfigContextType {
  config: DirectoryConfig;
  loading: boolean;
  updateConfig: (updates: Partial<DirectoryConfig>) => Promise<void>;
  resetConfig: () => Promise<void>;
}

const DirectoryConfigContext = createContext<DirectoryConfigContextType | undefined>(undefined);

export function DirectoryConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<DirectoryConfig>(defaultDirectoryConfig);
  const [loading, setLoading] = useState(true);

  // 启动时从 API 加载配置
  useEffect(() => {
    let cancelled = false;
    fetchDirectoryConfig()
      .then(cfg => {
        if (!cancelled) setConfig(cfg);
      })
      .catch(err => {
        console.warn('加载目录配置失败，使用默认配置:', err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const updateConfig = useCallback(async (updates: Partial<DirectoryConfig>) => {
    // 乐观更新前端状态
    setConfig(prev => ({ ...prev, ...updates }));
    // 持久化到后端
    try {
      const saved = await saveConfig(updates);
      setConfig(saved);
    } catch (err) {
      console.error('保存目录配置失败:', err);
    }
  }, []);

  const resetConfig = useCallback(async () => {
    try {
      const saved = await saveConfig(defaultDirectoryConfig);
      setConfig(saved);
    } catch (err) {
      console.error('重置目录配置失败:', err);
      setConfig(defaultDirectoryConfig);
    }
  }, []);

  return (
    <DirectoryConfigContext.Provider value={{ config, loading, updateConfig, resetConfig }}>
      {children}
    </DirectoryConfigContext.Provider>
  );
}

export function useDirectoryConfig() {
  const context = useContext(DirectoryConfigContext);
  if (!context) {
    throw new Error('useDirectoryConfig must be used within a DirectoryConfigProvider');
  }
  return context;
}

// ─── 档案类型 → 所有叶子子项（用于判断侧边栏子菜单可见性） ───
// 与 DirectoryConfigPanel 的 ARCHIVE_CONTENT_CONFIG 保持同步
const ARCHIVE_TYPE_LEAF_ITEMS: Record<string, string[]> = {
  '会计凭证': [
    '增值税发票', '普通发票', '财政票据', '银行回单', '银行对账单回执', '收据', '差旅费报销单据', '运输单据', '报关单', '完税凭证', '社保缴费单据', '公积金缴费单据', '对外往来结算单据',
    '入库单', '出库单', '领料单', '销售单', '工资表', '考勤表', '折旧计算表', '摊销表', '费用分摊单', '借款单', '报销单', '盘点表', '内部往来结算单', '收款收据', '付款申请单',
    '合同复印件', '协议', '审批文件', '证明材料', '验收单', '质检单', '附件清单',
    '收款凭证', '付款凭证', '转账凭证', '通用记账凭证', '记账凭证附件汇总', '凭证汇总表', '科目汇总表',
    '红字冲销凭证', '更正凭证', '调整凭证',
    '凭证封面', '凭证封底', '凭证装订册', '凭证交接清单', '作废凭证', '空白凭证存根',
  ],
  '会计账簿': [
    '总分类账', '账簿启用表', '经管人员一览表',
    '资产明细账', '负债明细账', '权益明细账', '收入明细账', '成本明细账', '费用明细账', '分户账',
    '现金日记账', '银行存款日记账',
    '应收账款备查簿', '应付账款备查簿', '支票备查簿', '汇票备查簿', '本票备查簿',
    '固定资产备查簿', '低值易耗品备查簿', '出租资产备查簿', '出借资产备查簿',
    '对外担保备查簿', '抵押备查簿', '托管资产备查簿',
    '合同台账', '往来单位台账', '税务备查台账',
    '账簿扉页', '账册目录', '结账记录', '错账更正记录', '账簿交接记录', '作废账页',
  ],
  '财务报表': [
    '资产负债表', '利润表', '现金流量表', '所有者权益变动表',
    '资产减值明细表', '应交税费明细表', '利润分配表', '成本明细表', '费用明细表',
    '报表注释', '重大事项说明', '会计政策变更说明', '会计估计变更说明',
    '企业经营情况', '财务分析', '重大投融资', '盈亏分析', '风险说明',
    '部门利润表', '项目成本表', '预算执行表', '经营分析表', '绩效考核报表',
    '清算报表', '改制报表', '合并财务报表', '分部报表', '关联方交易报表',
    '内部审计报告', '外部审计报告', '验资报告', '评估报告', '鉴证报告',
    '报告封面', '报告目录', '报送函', '归档审批表',
  ],
  '财务会计报告': [
    '资产负债表', '利润表', '现金流量表', '所有者权益变动表',
    '资产减值明细表', '应交税费明细表', '利润分配表', '成本明细表', '费用明细表',
    '报表注释', '重大事项说明', '会计政策变更说明', '会计估计变更说明',
    '企业经营情况', '财务分析', '重大投融资', '盈亏分析', '风险说明',
    '部门利润表', '项目成本表', '预算执行表', '经营分析表', '绩效考核报表',
    '清算报表', '改制报表', '合并财务报表', '分部报表', '关联方交易报表',
    '内部审计报告', '外部审计报告', '验资报告', '评估报告', '鉴证报告',
    '报告封面', '报告目录', '报送函', '归档审批表',
    '报表封面', '报送回执', '审批签字页', '报告交接记录', '报表底稿', '试算平衡表',
  ],
  '其他会计资料': [
    '银行开户许可证', '账户备案资料', '银行印鉴卡', '银行余额调节表', '银行对账单', '网银操作日志', '账户变更资料', '账户注销资料',
    '纳税申报表', '税务备案表', '税收优惠资料', '税务稽查结论', '涉税批复', '发票领购台账', '发票使用台账', '发票核销台账', '发票存根联', '发票登记簿',
    '资产盘点报告', '盘点差异处理文件', '资产处置审批单', '资产清查报告', '资产评估资料',
    '单位全面预算', '部门预算', '预算批复', '预算调整文件', '年度决算报告', '决算批复',
    '会计档案移交清册', '会计档案保管清册', '会计档案销毁清册', '会计档案鉴定意见书',
    '会计制度', '会计准则', '会计科目表', '会计核算办法', '财务管理办法',
    '采购合同', '销售合同', '租赁合同', '借款合同', '担保合同', '劳动合同', '保密协议', '结算单', '决算报告', '审计报告',
    '电子会计凭证', '电子发票', '电子签章文件', '数字化副本', '数据备份', '电子目录',
    '报表封面', '编制说明',
  ],
};

// 缓存 Set 加速查询
const ARCHIVE_TYPE_LEAF_SETS: Record<string, Set<string>> = {};
Object.entries(ARCHIVE_TYPE_LEAF_ITEMS).forEach(([key, items]) => {
  ARCHIVE_TYPE_LEAF_SETS[key] = new Set(items);
});

/**
 * 判断某档案类型是否有勾选的子项
 * selectedItems 为空（未配置）时返回 true（全部展示）
 */
export function hasSelectedArchiveType(typeName: string, selectedItems: string[]): boolean {
  if (selectedItems.length === 0) return true;
  const leafSet = ARCHIVE_TYPE_LEAF_SETS[typeName];
  if (!leafSet) return true;
  return selectedItems.some(item => leafSet.has(item));
}

// ─── 档案类型中间层子项（与 DirectoryConfigPanel 的层级一致） ───
export const ARCHIVE_ITEM_MAP: Record<string, string[]> = {
  '会计凭证': ['原始凭证', '记账凭证', '凭证附属装订资料'],
  '会计账簿': ['总账', '明细账', '日记账', '辅助账簿/备查账', '账簿相关资料'],
  '财务报表': ['定期财务报告', '专项财务报告', '报告附属材料'],
  '财务会计报告': ['定期财务报告', '专项财务报告', '报告附属材料'],
  '其他会计资料': ['会计核算配套资料', '会计制度与文书档案', '合同协议及结算资料', '电子会计档案专属资料'],
};

// ─── 子分类映射（用于右侧面板筛选） ───
export const ARCHIVE_SUB_CATEGORY_MAP: Record<string, Record<string, string[]>> = {
  '会计凭证': {
    '原始凭证': ['外来原始凭证', '自制原始凭证', '原始凭证附件'],
    '记账凭证': ['专用记账凭证', '通用记账凭证', '凭证汇总表', '调整凭证'],
    '凭证附属装订资料': ['凭证封面', '凭证封底', '凭证装订册', '凭证交接清单', '作废凭证', '空白凭证存根'],
  },
  '会计账簿': {
    '总账': ['总分类账', '账簿启用表', '经管人员一览表'],
    '明细账': ['资产明细账', '负债明细账', '权益明细账', '收入明细账', '成本明细账', '费用明细账', '分户账'],
    '日记账': ['现金日记账', '银行存款日记账'],
    '辅助账簿/备查账': ['往来备查簿', '票据备查簿', '资产备查簿', '担保备查簿', '台账'],
    '账簿相关资料': ['账簿扉页', '账册目录', '结账记录', '错账更正记录', '账簿交接记录', '作废账页'],
  },
  '财务报表': {
    '定期财务报告': ['月度财务报表', '季度财务报表', '半年度财务报表', '年度财务报告(决算)'],
    '专项财务报告': ['年度审计报告', '税务鉴证报告', '资产评估报告', '财务分析报告'],
    '报告附属材料': ['报表附注', '审计调整分录', '报表封面', '报送回执', '审批签字页'],
  },
  '其他会计资料': {
    '银行对账资料': ['银行余额调节表', '银行对账单'],
    '税务申报资料': ['纳税申报表', '完税证明', '税务事项通知书'],
    '移交保管资料': ['移交清册', '保管清册', '销毁清册', '鉴定意见书'],
    '会计核算配套': ['会计科目表', '核算办法说明', '科目余额表', '试算平衡表'],
    '制度文书': ['财务管理制度', '会计政策文件', '审批权限表'],
    '合同协议': ['重大合同', '投资协议', '融资协议'],
    '电子专属': ['系统导出数据包', '电子签章文件', '审计追踪日志'],
  },
};

/** 获取勾选的档案子项列表 */
export function getSelectedArchiveItems(typeName: string, selectedItems: string[]): { id: string; label: string; type: string }[] {
  const subItems = ARCHIVE_ITEM_MAP[typeName] || [];
  return subItems
    .filter(item => selectedItems.length === 0 || selectedItems.includes(item))
    .map(item => ({
      id: `${typeName}-${item}`,
      label: item,
      type: 'archiveItem' as const,
    }));
}

// 辅助函数：根据配置生成财务大类视图的目录树（2层：分类 → 年份）
export function generateFinanceCategoryTree(config: DirectoryConfig) {
  const enabledTypes = config.archiveTypes.filter(t => t.enabled);
  const enabledYears = config.years.filter(y => y.enabled).sort((a, b) => b.year - a.year);

  return enabledTypes.map(type => ({
    id: type.id,
    label: type.name,
    type: 'class' as const,
    code: type.code,
    children: enabledYears.length > 0
      ? enabledYears.map(year => ({
          id: `${type.id}-${year.id}`,
          label: `${year.year}年`,
          type: 'period' as const,
          code: String(year.year),
        }))
      : undefined,
  }));
}

// 辅助函数：根据配置生成项目全景视图的目录树
export function generateProjectTree(config: DirectoryConfig) {
  const enabledProjects = config.projects.filter(p => p.enabled);
  const enabledTypes = config.archiveTypes.filter(t => t.enabled);
  
  return enabledProjects.map(project => ({
    id: project.id,
    label: project.name,
    type: 'project' as const,
    code: project.code,
    children: enabledTypes.map(type => {
      const archiveItems = getSelectedArchiveItems(type.name, config.selectedArchiveItems);
      return {
        id: `${project.id}-${type.id}`,
        label: type.name,
        type: 'class' as const,
        code: type.code,
        children: archiveItems.length > 0 ? archiveItems.map(item => ({
          ...item,
          children: undefined,
        })) : undefined,
      };
    })
  }));
}

// 辅助函数：根据配置生成时间主线视图的目录树
export function generateTimelineTree(config: DirectoryConfig) {
  const enabledYears = config.years.filter(y => y.enabled).sort((a, b) => b.year - a.year);
  const enabledTypes = config.archiveTypes.filter(t => t.enabled);
  
  return enabledYears.map(year => ({
    id: year.id,
    label: `${year.year}年`,
    type: 'period' as const,
    code: String(year.year),
    children: enabledTypes.map(type => {
      const archiveItems = getSelectedArchiveItems(type.name, config.selectedArchiveItems);
      return {
        id: `${year.id}-${type.id}`,
        label: type.name,
        type: 'class' as const,
        code: type.code,
        children: archiveItems.length > 0 ? archiveItems.map(item => ({
          ...item,
          children: undefined,
        })) : undefined,
      };
    })
  }));
}
