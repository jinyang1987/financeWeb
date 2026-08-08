/**
 * 目录配置 REST API
 * GET  /api/directory-config        - 获取完整配置
 * PUT  /api/directory-config        - 保存完整配置
 * GET  /api/directory-config/tree/:viewType - 获取指定视图的目录树
 */
import { Router, Request, Response } from 'express';
import { readJson, writeJson } from '../storage/jsonStorage';

export const dirConfigRouter = Router();

// ─── 类型定义 ────────────────────────────────────────────

interface ViewDimension {
  id: string;
  name: string;
  logic: string;
  enabled: boolean;
  order: number;
}

interface ArchiveType {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
  order: number;
}

interface YearConfig {
  id: string;
  year: number;
  enabled: boolean;
  order: number;
}

interface ProjectConfig {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
  order: number;
}

type LevelType = 'archiveType' | 'year' | 'month' | 'quarter' | 'project' | 'projectArchiveType';

interface LevelTemplates {
  'finance-category': LevelType[];
  'project-panorama': LevelType[];
  'time-timeline': LevelType[];
}

interface DirectoryConfig {
  viewDimensions: ViewDimension[];
  archiveTypes: ArchiveType[];
  years: YearConfig[];
  projects: ProjectConfig[];
  levelTemplates: LevelTemplates;
  autoAssociation: boolean;
  manualAssociation: boolean;
  lazyLoad: boolean;
  highlightCurrent: boolean;
  showViewSwitch: boolean;
  selectedArchiveItems: string[];
}

// ─── 默认配置 ────────────────────────────────────────────

const DEFAULT_CONFIG: DirectoryConfig = {
  viewDimensions: [
    { id: 'finance-category', name: '财务大类视图', logic: '按会计档案分类，再按时间维度细化', enabled: true, order: 1 },
    { id: 'project-panorama', name: '项目全景视图', logic: '以业务项目为核心，聚合该项目所有相关档案', enabled: true, order: 2 },
    { id: 'time-timeline', name: '时间主线视图', logic: '按时间年份为一级目录，再按档案类型分类', enabled: true, order: 3 },
  ],
  archiveTypes: [
    { id: 'type-1', name: '会计凭证', code: 'KP', enabled: true, order: 1 },
    { id: 'type-2', name: '会计账簿', code: 'KB', enabled: true, order: 2 },
    { id: 'type-3', name: '财务报表', code: 'FB', enabled: true, order: 3 },
    { id: 'type-4', name: '其他会计资料', code: 'QT', enabled: true, order: 4 },
  ],
  years: [
    { id: 'year-2026', year: 2026, enabled: true, order: 1 },
    { id: 'year-2025', year: 2025, enabled: true, order: 2 },
  ],
  projects: [
    { id: 'project-1', name: '华北数据中心建设项目', code: 'P1', enabled: true, order: 1 },
    { id: 'project-2', name: 'AI平台研发三期', code: 'P2', enabled: true, order: 2 },
  ],
  levelTemplates: {
    'finance-category': ['archiveType', 'year', 'month'],
    'project-panorama': ['project', 'projectArchiveType'],
    'time-timeline': ['year', 'archiveType'],
  },
  autoAssociation: true,
  manualAssociation: true,
  lazyLoad: true,
  highlightCurrent: true,
  showViewSwitch: true,
  selectedArchiveItems: [],
};

const DATA_FILE = 'directory-config.json';

// ─── 目录树节点类型 ──────────────────────────────────────

interface TreeNode {
  id: string;
  label: string;
  type: string;
  code?: string;
  children?: TreeNode[];
}

// ─── 档案类型与子项映射 ──────────────────────────────
const ARCHIVE_ITEM_MAP: Record<string, string[]> = {
  '会计凭证': [],
  '会计账簿': ['总账', '明细账', '日记账', '辅助账簿/备查账', '账簿相关资料'],
  '财务报表': ['定期财务报告', '专项财务报告', '报告附属材料'],
  '财务会计报告': ['定期财务报告', '专项财务报告', '报告附属材料'],
  '其他会计资料': ['会计核算配套资料', '会计制度与文书档案', '合同协议及结算资料', '电子会计档案专属资料'],
};

function getArchiveItems(typeName: string, selectedItems: string[]): TreeNode[] {
  const subItems = ARCHIVE_ITEM_MAP[typeName] || [];
  return subItems
    .filter(item => selectedItems.length === 0 || selectedItems.includes(item))
    .map(item => ({
      id: `${typeName}-${item}`,
      label: item,
      type: 'archiveItem',
    }));
}

// ─── 树生成函数 ──────────────────────────────────────────

function generateFinanceCategoryTree(config: DirectoryConfig): TreeNode[] {
  const enabledTypes = config.archiveTypes.filter(t => t.enabled).sort((a, b) => a.order - b.order);
  const enabledYears = config.years.filter(y => y.enabled).sort((a, b) => b.year - a.year);

  return enabledTypes.map(type => ({
    id: type.id,
    label: type.name,
    type: 'class',
    code: type.code,
    children: enabledYears.map(year => ({
      id: `${type.id}-${year.id}`,
      label: `${year.year}年`,
      type: 'period',
      code: String(year.year),
      children: (() => {
        const archiveItems = getArchiveItems(type.name, config.selectedArchiveItems);
        return archiveItems.length > 0 ? archiveItems : undefined;
      })(),
    })),
  }));
}

function generateProjectTree(config: DirectoryConfig): TreeNode[] {
  const enabledProjects = config.projects.filter(p => p.enabled).sort((a, b) => a.order - b.order);
  const enabledTypes = config.archiveTypes.filter(t => t.enabled).sort((a, b) => a.order - b.order);

  return enabledProjects.map(project => ({
    id: project.id,
    label: project.name,
    type: 'project',
    code: project.code,
    children: enabledTypes.map(type => {
      const archiveItems = getArchiveItems(type.name, config.selectedArchiveItems);
      return {
        id: `${project.id}-${type.id}`,
        label: type.name,
        type: 'class',
        code: type.code,
        children: archiveItems.length > 0 ? archiveItems : undefined,
      };
    }),
  }));
}

function generateTimelineTree(config: DirectoryConfig): TreeNode[] {
  const enabledYears = config.years.filter(y => y.enabled).sort((a, b) => b.year - a.year);
  const enabledTypes = config.archiveTypes.filter(t => t.enabled).sort((a, b) => a.order - b.order);

  return enabledYears.map(year => ({
    id: year.id,
    label: `${year.year}年`,
    type: 'period',
    code: String(year.year),
    children: enabledTypes.map(type => {
      const archiveItems = getArchiveItems(type.name, config.selectedArchiveItems);
      return {
        id: `${year.id}-${type.id}`,
        label: type.name,
        type: 'class',
        code: type.code,
        children: archiveItems.length > 0 ? archiveItems : undefined,
      };
    }),
  }));
}

// ─── API 路由 ────────────────────────────────────────────

/** GET /api/directory-config - 获取完整配置 */
dirConfigRouter.get('/', (_req: Request, res: Response) => {
  const config = readJson<DirectoryConfig>(DATA_FILE, DEFAULT_CONFIG);
  res.json(config);
});

/** PUT /api/directory-config - 保存完整配置 */
dirConfigRouter.put('/', (req: Request, res: Response) => {
  const updates = req.body as Partial<DirectoryConfig>;
  const current = readJson<DirectoryConfig>(DATA_FILE, DEFAULT_CONFIG);
  const merged: DirectoryConfig = { ...current, ...updates };
  writeJson(DATA_FILE, merged);
  res.json({ success: true, config: merged });
});

/** GET /api/directory-config/tree/:viewType - 获取指定视图的目录树 */
dirConfigRouter.get('/tree/:viewType', (req: Request, res: Response) => {
  const { viewType } = req.params;
  const config = readJson<DirectoryConfig>(DATA_FILE, DEFAULT_CONFIG);

  let tree: TreeNode[];
  switch (viewType) {
    case 'finance-category':
      tree = generateFinanceCategoryTree(config);
      break;
    case 'project-panorama':
      tree = generateProjectTree(config);
      break;
    case 'time-timeline':
      tree = generateTimelineTree(config);
      break;
    default:
      res.status(400).json({ error: '无效的视图类型，支持: finance-category | project-panorama | time-timeline' });
      return;
  }
  res.json(tree);
});
