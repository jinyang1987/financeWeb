/**
 * 会计档案内容配置
 *
 * 定义档案类型的完整层级结构，以及提取工具函数。
 * 共享于 DirectoryConfigPanel（展示勾选）和 DirectoryConfigContext（判断子菜单可见性）。
 */
import { FileText, BookOpen, BarChart3, Archive } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── 类型定义 ──────────────────────────────────────────
export interface ArchiveContentNode {
  icon?: LucideIcon;
  color?: string;
  bgColor?: string;
  items?: string[];
  children?: Record<string, ArchiveContentNode>;
}

// ─── 完整层级配置 ─────────────────────────────────────
export const ARCHIVE_CONTENT_CONFIG: Record<string, ArchiveContentNode> = {
  '会计凭证': {
    icon: FileText,
    color: 'text-sky-600',
    bgColor: 'bg-sky-50',
    children: {
      '原始凭证': {
        children: {
          '外来原始凭证': { items: ['增值税发票', '普通发票', '财政票据', '银行回单', '银行对账单回执', '收据', '差旅费报销单据', '运输单据', '报关单', '完税凭证', '社保缴费单据', '公积金缴费单据', '对外往来结算单据'] },
          '自制原始凭证': { items: ['入库单', '出库单', '领料单', '销售单', '工资表', '考勤表', '折旧计算表', '摊销表', '费用分摊单', '借款单', '报销单', '盘点表', '内部往来结算单', '收款收据', '付款申请单'] },
          '原始凭证附件': { items: ['合同复印件', '协议', '审批文件', '证明材料', '验收单', '质检单', '附件清单'] },
        },
      },
      '记账凭证': {
        children: {
          '专用记账凭证': { items: ['收款凭证', '付款凭证', '转账凭证'] },
          '通用记账凭证': { items: ['通用记账凭证'] },
          '凭证汇总表': { items: ['记账凭证附件汇总', '凭证汇总表', '科目汇总表'] },
          '调整凭证': { items: ['红字冲销凭证', '更正凭证', '调整凭证'] },
        },
      },
      '凭证附属装订资料': { items: ['凭证封面', '凭证封底', '凭证装订册', '凭证交接清单', '作废凭证', '空白凭证存根'] },
    },
  },
  '会计账簿': {
    icon: BookOpen,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    children: {
      '总账': { items: ['总分类账', '账簿启用表', '经管人员一览表'] },
      '明细账': { items: ['资产明细账', '负债明细账', '权益明细账', '收入明细账', '成本明细账', '费用明细账', '分户账'] },
      '日记账': { items: ['现金日记账', '银行存款日记账'] },
      '辅助账簿/备查账': {
        children: {
          '往来备查簿': { items: ['应收账款备查簿', '应付账款备查簿'] },
          '票据备查簿': { items: ['支票备查簿', '汇票备查簿', '本票备查簿'] },
          '资产备查簿': { items: ['固定资产备查簿', '低值易耗品备查簿', '出租资产备查簿', '出借资产备查簿'] },
          '担保备查簿': { items: ['对外担保备查簿', '抵押备查簿', '托管资产备查簿'] },
          '台账': { items: ['合同台账', '往来单位台账', '税务备查台账'] },
        },
      },
      '账簿相关资料': { items: ['账簿扉页', '账册目录', '结账记录', '错账更正记录', '账簿交接记录', '作废账页'] },
    },
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
          '财务情况说明书': { items: ['企业经营情况', '财务分析', '重大投融资', '盈亏分析', '风险说明'] },
        },
      },
      '专项财务报告': {
        children: {
          '内部管理报表': { items: ['部门利润表', '项目成本表', '预算执行表', '经营分析表', '绩效考核报表'] },
          '对外专项报告': { items: ['清算报表', '改制报表', '合并财务报表', '分部报表', '关联方交易报表'] },
          '审计相关报告': { items: ['内部审计报告', '外部审计报告', '验资报告', '评估报告', '鉴证报告'] },
        },
      },
      '报告附属材料': { items: ['报告封面', '报告目录', '报送函', '归档审批表'] },
    },
  },
  '其他会计资料': {
    icon: Archive,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    children: {
      '会计核算配套资料': { items: ['银行存款余额调节表', '银行对账单', '会计档案移交清册', '会计档案保管清册', '会计档案销毁清册', '会计档案鉴定意见书', '会计档案案卷目录'] },
      '会计制度与文书档案': { items: ['会计制度', '会计准则', '会计科目表', '会计核算办法', '财务管理办法'] },
      '合同协议及结算资料': { items: ['采购合同', '销售合同', '租赁合同', '借款合同', '担保合同', '劳动合同', '保密协议', '结算单', '决算报告', '审计报告'] },
      '电子会计档案专属资料': { items: ['电子会计凭证', '电子发票', '电子签章文件', '数字化副本', '数据备份', '电子目录'] },
      '报告附属材料': { items: ['报告封面', '编制说明'] },
    },
  },
};

// ─── 工具函数 ──────────────────────────────────────────

/** 从配置节点中提取所有叶子项名称 */
function extractLeafItems(node: ArchiveContentNode): string[] {
  if (node.items) return node.items;
  if (node.children) {
    const items: string[] = [];
    for (const child of Object.values(node.children)) {
      items.push(...extractLeafItems(child));
    }
    return items;
  }
  return [];
}

/** 获取某档案类型下的所有叶子子项名称 */
export function getLeafItemsForType(typeName: string): string[] {
  const config = ARCHIVE_CONTENT_CONFIG[typeName];
  if (!config) return [];
  return extractLeafItems(config);
}

/** 获取某档案类型勾选的子项数量 */
export function getSelectedCountForType(typeName: string, selectedItems: string[]): number {
  const leafItems = getLeafItemsForType(typeName);
  return leafItems.filter(item => selectedItems.includes(item)).length;
}

/** 判断档案类型是否有勾选的子项（用于决定是否展示为子菜单） */
export function hasSelectedArchiveType(typeName: string, selectedItems: string[]): boolean {
  if (selectedItems.length === 0) return true; // 没勾选 = 全部展示
  return getSelectedCountForType(typeName, selectedItems) > 0;
}

/** 获取所有档案类型的名称列表（与 ARCHIVE_CONTENT_CONFIG 的 key 一致） */
export function getArchiveTypeNames(): string[] {
  return Object.keys(ARCHIVE_CONTENT_CONFIG);
}

