﻿﻿﻿﻿﻿﻿﻿import {
  Upload, Layers, Database, Notebook, Trash2, Activity, Settings, Shield,
  FolderTree, Briefcase, Clock, Cpu, FileInput, FileSpreadsheet, FileText,
  Calendar, Building2, Building, Users, UserCheck, Shield as ShieldIcon,
  Fingerprint, FolderCog, Eye, ListTodo, Search, Grid, CheckCircle2,
  CheckCircle, Check, Ticket, Menu, X, ChevronDown, ChevronRight, GitBranch,
  Send, ZoomIn, ShieldCheck, Droplets, ScanBarcode,
  Gauge, Boxes, SlidersHorizontal, KeyRound, PlugZap, Warehouse,
  type LucideIcon,
} from 'lucide-react';
import type { MenuId } from '../stores/appStore';

/** 单个菜单项定义 */
export interface MenuItemDef {
  /** 菜单标识，对应 activeMainMenu / MenuId */
  key: MenuId;
  /** 显示标签 */
  label: string;
  /** 图标组件 */
  Icon: LucideIcon;
  /** 缩进层级 (0=一级, 1=二级, 2=三级, 3=四级) */
  depth: number;
  /** 子菜单（树状视图用） */
  children?: MenuItemDef[];
}

/** 菜单组定义 */
export interface MenuGroupDef {
  /** 组标识 */
  key: string;
  /** 组显示名称 */
  label: string;
  /** 组图标 */
  Icon: LucideIcon;
  /** 能否通过菜单设置切换可见性 */
  toggleable?: boolean;
  /** 组内菜单项 */
  items: MenuItemDef[];
}

/** 全量菜单配置 */
export const menuGroups: MenuGroupDef[] = [
  {
    key: 'query',
    label: '档案查询',
    Icon: Search,
    toggleable: true,
    items: [
      { key: 'voucher-search', label: '凭证检索', Icon: FileText, depth: 1 },
      { key: 'matter-search', label: '事项检索', Icon: ZoomIn, depth: 1 },
      { key: 'source-doc-search', label: '附件检索', Icon: FileSpreadsheet, depth: 1 },
      { key: 'volume-item-search', label: '关联查询', Icon: Search, depth: 1 },
      { key: 'audit-trail', label: '审计追踪', Icon: ShieldCheck, depth: 1 },
    ],
  },
  {
    key: 'rcv',
    label: '档案收集',
    Icon: Upload,
    toggleable: true,
    items: [
      { key: 'archive-rcv', label: '抓取收集中台', Icon: Cpu, depth: 1 },
      { key: 'archive-api-receive', label: '集成接口采集', Icon: Activity, depth: 1 },
    ],
  },
  {
    key: 'arrange',
    label: '档案整理',
    Icon: Layers,
    toggleable: true,
    items: [
      { key: 'volume-workspace', label: '组卷工作台', Icon: Layers, depth: 1 },
      { key: 'recycle-bin', label: '回收站', Icon: Trash2, depth: 1 },
    ],
  },
  {
    key: 'preserve',
    label: '档案保管',
    Icon: Database,
    toggleable: true,
    items: [
      { key: 'view-finance', label: '财务分类视图', Icon: FolderTree, depth: 1 },
      { key: 'digital-warehouse', label: '实体档案库房', Icon: Building2, depth: 1 },
    ],
  },
  {
    key: 'util',
    label: '档案利用',
    Icon: Notebook,
    toggleable: true,
    items: [
      { key: 'approval-center', label: '审批中心', Icon: CheckCircle2, depth: 1 },
      { key: 'borrow-manage', label: '借阅管理', Icon: ScanBarcode, depth: 1 },
      { key: 'borrow-ledger', label: '借阅台账', Icon: Notebook, depth: 1 },
      { key: 'transfer-manage', label: '案卷移交管理', Icon: FileText, depth: 1 },
    ],
  },
  {
    key: 'stats',
    label: '档案统计',
    Icon: Activity,
    toggleable: true,
    items: [
      { key: 'stats-cockpit', label: '统计驾驶舱', Icon: Gauge, depth: 1 },
      { key: 'stats-inventory', label: '库藏统计', Icon: Boxes, depth: 1 },
      { key: 'stats-lifecycle', label: '流程统计', Icon: GitBranch, depth: 1 },
      { key: 'borrow-stats', label: '借阅统计', Icon: Notebook, depth: 1 },
      { key: 'stats-compliance', label: '合规统计', Icon: ShieldCheck, depth: 1 },
    ],
  },
  {
    key: 'disposal',
    label: '档案处置',
    Icon: Send,
    toggleable: true,
    items: [
      { key: 'archive-package', label: '档案打包', Icon: Layers, depth: 1 },
      { key: 'archive-transfer', label: '档案移交', Icon: Send, depth: 1 },
      { key: 'appraisal-manage', label: '鉴定销毁', Icon: Trash2, depth: 1 },
    ],
  },
  {
    key: 'config',
    label: '档案配置',
    Icon: Settings,
    toggleable: false,
    items: [
      { key: 'config-fanzong', label: '全宗管理', Icon: Building2, depth: 1 },
      { key: 'directory-config', label: '目录配置', Icon: FolderCog, depth: 1 },
      { key: 'archive-manage-config', label: '档案管理配置', Icon: Settings, depth: 1 },
      { key: 'retention-config', label: '档案三合一表配置', Icon: Clock, depth: 1 },
      { key: 'inspection-config', label: '四性检测配置', Icon: Eye, depth: 1 },
      { key: 'report-config', label: '报告配置', Icon: FileText, depth: 1 },
      { key: 'watermark-config', label: '水印配置', Icon: Droplets, depth: 1 },
        { key: 'config-workflow', label: '流程配置', Icon: GitBranch, depth: 1 },
      { key: 'sys-storage', label: '库房配置', Icon: Warehouse, depth: 1 },
      { key: 'sys-cockpit-config', label: '驾驶舱配置', Icon: SlidersHorizontal, depth: 1 },
    ],
  },
  {
    key: 'system',
    label: '系统管理',
    Icon: Shield,
    toggleable: true,
    items: [
      { key: 'sys-unit', label: '单位管理', Icon: Building2, depth: 1 },
      { key: 'sys-org', label: '组织管理', Icon: Building, depth: 1 },
      { key: 'sys-personnel', label: '人员管理', Icon: Users, depth: 1 },
      { key: 'sys-role', label: '角色管理', Icon: ShieldIcon, depth: 1 },
      { key: 'sys-connection', label: '连接配置', Icon: PlugZap, depth: 1 },
      { key: 'sys-log', label: '安全审计日志', Icon: Fingerprint, depth: 1 },
    ],
  },
];

/** 菜单设置中展示的组（含中文标签） */
export const menuSettingGroups: { key: string; label: string }[] = [
  { key: 'query', label: '档案查询' },
  { key: 'rcv', label: '档案收集' },
  { key: 'arrange', label: '档案整理' },
  { key: 'preserve', label: '档案保管' },
  { key: 'util', label: '档案利用' },
  { key: 'stats', label: '档案统计' },
  { key: 'disposal', label: '档案处置' },
  { key: 'config', label: '档案配置' },
  { key: 'system', label: '系统管理' },
];

/** 不在侧边菜单中的遗留页面标题 */
const PAGE_TITLE_FALLBACK: Partial<Record<MenuId, { subtitle: string; title: string }>> = {
  dashboard: { subtitle: '档案统计', title: '档案统计分析' },
  'view-project': { subtitle: '档案保管', title: '项目分类视图' },
  'project-query': { subtitle: '档案查询', title: '项目查询' },
  'voucher-query': { subtitle: '档案查询', title: '凭证查询' },
  'fuzzy-query': { subtitle: '档案查询', title: '模糊查询' },
};

/**
 * 根据菜单 key 获取页头标题。
 * subtitle = 所属菜单组名，title = 页面名 —— 直接派生自 menuGroups 单一数据源，
 * 页头不再承载步骤说明/配置指引等长文案（2026-08-17 精简：长文案会把右侧按钮挤成竖排）。
 */
export function getPageTitle(menu: MenuId): { subtitle: string; title: string } {
  for (const g of menuGroups) {
    const item = g.items.find((i) => i.key === menu);
    if (item) return { subtitle: g.label, title: item.label };
  }
  return PAGE_TITLE_FALLBACK[menu] ?? { subtitle: '', title: '' };
}




