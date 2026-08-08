// 目录配置类型
export interface ViewDimension {
  id: string; name: string; logic: string; enabled: boolean; order: number;
}

export interface ArchiveType {
  id: string; name: string; code: string; enabled: boolean; order: number;
}

export interface YearConfig {
  id: string; year: number; enabled: boolean; order: number;
}

export interface ProjectConfig {
  id: string; name: string; code: string; enabled: boolean; order: number;
}

export type LevelType = 'archiveType' | 'year' | 'month' | 'quarter' | 'project' | 'projectArchiveType';

export interface LevelTemplates {
  'finance-category': LevelType[];
  'project-panorama': LevelType[];
  'time-timeline': LevelType[];
}

export interface DirectoryConfig {
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

export const defaultDirectoryConfig: DirectoryConfig = {
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
