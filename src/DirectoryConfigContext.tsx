import React, { createContext, useContext, useState, useCallback } from 'react';
import { DirectoryConfig, defaultDirectoryConfig } from './configTypes';

interface DirectoryConfigContextType {
  config: DirectoryConfig;
  updateConfig: (updates: Partial<DirectoryConfig>) => void;
  resetConfig: () => void;
}

const DirectoryConfigContext = createContext<DirectoryConfigContextType | undefined>(undefined);

export function DirectoryConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<DirectoryConfig>(defaultDirectoryConfig);

  const updateConfig = useCallback((updates: Partial<DirectoryConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(defaultDirectoryConfig);
  }, []);

  return (
    <DirectoryConfigContext.Provider value={{ config, updateConfig, resetConfig }}>
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

// 辅助函数：根据配置生成财务大类视图的目录树
export function generateFinanceCategoryTree(config: DirectoryConfig) {
  const enabledTypes = config.archiveTypes.filter(t => t.enabled);
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
      children: [
        { id: `${type.id}-${year.id}-01`, label: '01月', type: 'month' },
        { id: `${type.id}-${year.id}-02`, label: '02月', type: 'month' },
        { id: `${type.id}-${year.id}-03`, label: '03月', type: 'month' },
        { id: `${type.id}-${year.id}-04`, label: '04月', type: 'month' },
        { id: `${type.id}-${year.id}-05`, label: '05月', type: 'month' },
        { id: `${type.id}-${year.id}-06`, label: '06月', type: 'month' },
        { id: `${type.id}-${year.id}-07`, label: '07月', type: 'month' },
        { id: `${type.id}-${year.id}-08`, label: '08月', type: 'month' },
        { id: `${type.id}-${year.id}-09`, label: '09月', type: 'month' },
        { id: `${type.id}-${year.id}-10`, label: '10月', type: 'month' },
        { id: `${type.id}-${year.id}-11`, label: '11月', type: 'month' },
        { id: `${type.id}-${year.id}-12`, label: '12月', type: 'month' }
      ]
    }))
  }));
}

// 辅助函数：根据配置生成项目全景视图的目录树
export function generateProjectTree(config: DirectoryConfig) {
  const enabledProjects = config.projects.filter(p => p.enabled);
  const enabledTypes = config.archiveTypes.filter(t => t.enabled);
  
  return enabledProjects.map(project => ({
    id: project.id,
    label: project.name,
    type: 'project',
    code: project.code,
    children: enabledTypes.map(type => ({
      id: `${project.id}-${type.id}`,
      label: type.name,
      type: 'class',
      code: type.code
    }))
  }));
}

// 辅助函数：根据配置生成时间主线视图的目录树
export function generateTimelineTree(config: DirectoryConfig) {
  const enabledYears = config.years.filter(y => y.enabled).sort((a, b) => b.year - a.year);
  const enabledTypes = config.archiveTypes.filter(t => t.enabled);
  
  return enabledYears.map(year => ({
    id: year.id,
    label: `${year.year}年`,
    type: 'period',
    children: enabledTypes.map(type => ({
      id: `${year.id}-${type.id}`,
      label: type.name,
      type: 'class',
      code: type.code
    }))
  }));
}