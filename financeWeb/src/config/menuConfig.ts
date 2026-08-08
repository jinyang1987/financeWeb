﻿﻿﻿﻿﻿﻿﻿import {
  Upload, Layers, Database, Notebook, Trash2, Activity, Settings, Shield,
  FolderTree, Briefcase, Clock, Cpu, FileInput, FileSpreadsheet, FileText,
  Calendar, Building2, Building, Users, UserCheck, Shield as ShieldIcon,
  Fingerprint, FolderCog, Tag, Eye, ListTodo, Search, Grid, CheckCircle2,
  CheckCircle, Check, Ticket, Menu, X, ChevronDown, ChevronRight, GitBranch,
  FolderOpen,
  Send, BookOpen, ZoomIn, ShieldCheck, Droplets, ScanBarcode,
  Gauge, Boxes, SlidersHorizontal,
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
      { key: 'voucher-manager', label: '核对工作台', Icon: FolderOpen, depth: 1 },
      { key: 'volume-workspace', label: '组卷工作台', Icon: Layers, depth: 1 },
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
      { key: 'my-borrow', label: '我的借阅', Icon: BookOpen, depth: 1 },
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
    label: '档案移交',
    Icon: Send,
    toggleable: true,
    items: [
      { key: 'archive-package', label: '档案打包', Icon: Layers, depth: 1 },
      { key: 'archive-transfer', label: '档案移交', Icon: Send, depth: 1 },
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
      { key: 'accounting-metadata', label: '元数据配置', Icon: Tag, depth: 1 },
      { key: 'archive-code-config', label: '档号规则配置', Icon: FileSpreadsheet, depth: 1 },
      { key: 'retention-config', label: '档案三合一表配置', Icon: Clock, depth: 1 },
      { key: 'volume-grouping-config', label: '组卷盒号配置', Icon: Layers, depth: 1 },
      { key: 'inspection-config', label: '四性检测配置', Icon: Eye, depth: 1 },
      { key: 'report-config', label: '报告配置', Icon: FileText, depth: 1 },
      { key: 'watermark-config', label: '水印配置', Icon: Droplets, depth: 1 },
        { key: 'config-workflow', label: '流程配置', Icon: GitBranch, depth: 1 },
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
      { key: 'sys-cockpit-config', label: '驾驶舱配置', Icon: SlidersHorizontal, depth: 1 },
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
  { key: 'disposal', label: '档案移交' },
  { key: 'config', label: '档案配置' },
  { key: 'system', label: '系统管理' },
];

/** 根据菜单 key 获取显示标题 */
export function getPageTitle(menu: MenuId): { subtitle: string; title: string } {
  const titles: Partial<Record<MenuId, { subtitle: string; title: string }>> = {
    'stats-cockpit': { subtitle: '统计驾驶舱', title: '会计档案统计驾驶舱·库藏/流程/利用/合规一屏总览' },
    'stats-inventory': { subtitle: '库藏统计', title: '库藏统计·按类型/年度/期限/全宗/部门/载体家底盘点' },
    'stats-lifecycle': { subtitle: '流程统计', title: '流程统计·归档/组卷/四性检测/移交/鉴定处置全生命周期监控' },
    'stats-compliance': { subtitle: '合规统计', title: '合规统计·期限/数据质量/安全/审计支撑（79号令+DA/T 94）' },
    'sys-cockpit-config': { subtitle: '驾驶舱配置', title: '驾驶舱配置·大屏模块开关/排序/布局管理' },
    dashboard: { subtitle: '档案统计分析', title: '全量数字化资产台账总览' },
    'view-finance': { subtitle: '财务分类视图', title: '电子会计档案总览·全量明细资产台账 (财务' },
    'view-project': { subtitle: '项目分类视图', title: '项目分类视图·按项目维度聚合档案' },
    'project-query': { subtitle: '项目查询', title: '项目查询·按项目维度聚合档案' },
    'voucher-query': { subtitle: '凭证查询', title: '凭证查询·按凭证号/日期/金额精确检索' },
    'fuzzy-query': { subtitle: '模糊查询', title: '模糊查询·全文检索与跨字段模糊匹配' },
    'voucher-search': { subtitle: '凭证检索', title: '凭证检索·按会计科目/凭证号/金额/摘要多条件检索' },
    'matter-search': { subtitle: '事项检索', title: '事项检索·按经济业务/往来单位/发票号全文检索' },
    'my-borrow': { subtitle: '我的借阅', title: '我的借阅·借阅车结算/审批进度/限时在线调阅' },
    'approval-center': { subtitle: '审批中心', title: '审批中心·按权限与密级动态路由的分级审批' },
    'borrow-manage': { subtitle: '借阅管理', title: '借阅管理·出库核销/归还核销/预约队列/中止与黑名单' },
    'audit-trail': { subtitle: '审计追踪', title: '审计追踪·凭证穿透原始影像·合规取证包导出' },
    'archive-rcv': { subtitle: '抓取收集中台 主动拉取业务系统数据', title: '抓取收集中台·用友BIP凭证/报表同步与月度自动归档' },
    'archive-api-receive': { subtitle: '集成接口采集 业务系统推送接入', title: '集成接口采集·开放接口供业务系统推送入档（建设中）' },
    'borrow-ledger': { subtitle: '借阅台账全记录', title: '借阅台账·全生命周期借阅记录追溯' },
    'borrow-stats': { subtitle: '借阅统计分析', title: '借阅统计·借阅热力/逾期红黑榜/全链路操作日志' },
    'archive-code-config': { subtitle: '档号规则配置', title: '档号规则配置·DA/T 13-2022' },
    'volume-item-search': { subtitle: '关联查询', title: '关联查询·纸质副本与原生电子同屏对比' },
    'voucher-manager': { subtitle: '核对工作台', title: '核对工作台 · 凭证连续性 · 补传附件 · 推送组卷' },
    'transfer-manage': { subtitle: '案卷移交管理', title: '案卷移交·会计部→档案部临时保管期满移交' },
    'archive-package': { subtitle: '档案打包', title: '档案打包·案卷封装与移交前整理' },
    'archive-transfer': { subtitle: '档案移交', title: '档案移交·会计部→档案部正式移交' },
    'retention-config': { subtitle: '档案三合一表', title: '分类体系·归档范围·保管期限 三合一配置·79号令' },
    'digital-warehouse': { subtitle: '数字库房 密集实体存储HSM', title: '实体库房与电子档案双套归档闭环 智能微服务(密集型)HSM+加密盒存储' },
    'sys-unit': { subtitle: '单位管理', title: '单位管理 统一组织层级管理体系' },
    'sys-org': { subtitle: '组织管理', title: '组织管理 企业组织架构与部门管理' },
    'sys-personnel': { subtitle: '人员管理', title: '人员管理 全系统用户角色备案' },
    'sys-role': { subtitle: '角色管理', title: '角色管理 业务角色划分与权限分配' },
    'sys-log': { subtitle: '安全审计 日志追溯', title: '安全审计日志 安全通道全链路行为追溯记录' },
    'directory-config': { subtitle: '目录配置', title: '目录配置 多维业务科目档案目录分类体系' },
    'config-fanzong': { subtitle: '全宗管理', title: '全宗管理 覆盖全宗一元化档案存储仪表盘' },
    'config-workflow': { subtitle: '流程配置', title: '流程配置·归档质检/大额核查/鉴定销毁/借阅利用全生命周期业务规则' },
    'accounting-metadata': { subtitle: '元数据配置', title: '元数据配置' },
    'report-config': { subtitle: '报告配置', title: '报告配置' },
    'watermark-config': { subtitle: '水印配置', title: '水印配置·安全溯源·预览/下载/打印全链路动态水印' },
    'inspection-config': { subtitle: '四性检测配置', title: '四性检测配置' },
    'volume-grouping-config': { subtitle: '组卷盒号配置', title: '组卷规则·盒号定义·组卷→装盒→编号' },
    'source-doc-search': { subtitle: '附件检索', title: '原始凭证附件检索·按所属记账凭证号查找' },
  };
  return titles[menu] ?? { subtitle: '', title: '' };
}




