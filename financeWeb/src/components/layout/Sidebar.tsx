﻿﻿﻿﻿﻿﻿﻿import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Settings, ChevronDown, ChevronRight } from 'lucide-react';
import { useAppStore, type MenuId } from '../../stores/appStore';
import { menuGroups, type MenuGroupDef, type MenuItemDef } from '../../config/menuConfig';
import { useDirectoryConfig, hasSelectedArchiveType } from '../../DirectoryConfigContext';
import { useAuthStore } from '../../stores/authStore';
import { useRoleStore, canSeeMenuConfigured } from '../../stores/roleStore';

export interface SidebarProps {
  onNavigate?: (menu: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activeMainMenu,
    setActiveMainMenu,
    sidebarGroups,
    closeOtherGroups,
    toggleSidebarGroup,
    visibleMenus,
    setMenuSettingsOpen,
  } = useAppStore();
  const currentUser = useAuthStore((s) => s.currentUser);
  const roleMenus = useRoleStore((s) => s.roleMenus);

  // 按当前用户角色过滤菜单（角色管理页可配置，组内无可见项则整组隐藏）
  const roleFilteredGroups = useMemo(() => {
    const roles = currentUser?.roles ?? [];
    return menuGroups
      .map((g) => ({ ...g, items: g.items.filter((item) => canSeeMenuConfigured(roles, item.key, roleMenus)) }))
      .filter((g) => g.items.length > 0);
  }, [currentUser, roleMenus]);

  // 目录配置（用于动态子菜单）
  const { config: dirConfig } = useDirectoryConfig();

  // 子菜单展开状态
  const [subMenuExpanded, setSubMenuExpanded] = useState<Set<string>>(new Set());

  // 当前 URL 参数
  const { currentUrlType, currentUrlYear, currentUrlProject } = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return {
      currentUrlType: sp.get('type'),
      currentUrlYear: sp.get('year'),
      currentUrlProject: sp.get('project'),
    };
  }, [location.search]);

  // 启用的年份列表（排序，最新的在前）
  const enabledYears = useMemo(() => {
    return dirConfig.years.filter(y => y.enabled).sort((a, b) => b.year - a.year);
  }, [dirConfig]);

  // 计算"财务分类视图"的动态子菜单
  const financeSubMenus = useMemo(() => {
    const { archiveTypes, selectedArchiveItems } = dirConfig;
    return archiveTypes
      .filter(t => t.enabled && hasSelectedArchiveType(t.name, selectedArchiveItems))
      .map(t => ({
        key: `view-finance-${t.code}` as MenuId,
        label: t.name,
        code: t.code,
      }));
  }, [dirConfig]);

  // 计算"项目分类视图"的动态子菜单（项目设置中的项目）
  const projectSubMenus = useMemo(() => {
    return dirConfig.projects
      .filter(p => p.enabled)
      .map(p => ({
        key: `view-project-${p.code}` as MenuId,
        label: p.name,
        code: p.code,
      }));
  }, [dirConfig]);

  // 判断"财务分类视图"是否有展开的子菜单
  const isFinanceExpanded = subMenuExpanded.has('view-finance');

  // 判断"项目查询"是否有展开的子菜单
  const isProjectExpanded = subMenuExpanded.has('project-query');

  // 判断某个年份是否展开（年份下面是四大类）
  const isYearExpanded = (year: number) => subMenuExpanded.has(`year-${year}`);

  const handleMenuClick = (groupKey: string, menuKey: MenuId) => {
    closeOtherGroups(groupKey as keyof typeof sidebarGroups);
    setActiveMainMenu(menuKey);
    navigate(`/${menuKey}`);
    onNavigate?.(menuKey);
  };

  // 点击年份 → 展开/收起四大类，导航到该年份全部档案
  const handleYearNodeClick = (e: React.MouseEvent, year: number) => {
    e.stopPropagation();
    const expandKey = `year-${year}`;
    const isExpanded = subMenuExpanded.has(expandKey);

    closeOtherGroups('preserve' as keyof typeof sidebarGroups);

    setSubMenuExpanded(prev => {
      const next = new Set(prev);
      if (isExpanded) {
        // 收起当前年份
        next.delete(expandKey);
      } else {
        // 展开当前年份，同时收起其他所有年份（互斥展开）
        const toDelete: string[] = [];
        for (const key of next) {
          if (key.startsWith('year-')) toDelete.push(key);
        }
        toDelete.forEach(k => next.delete(k));
        next.add(expandKey);
      }
      return next;
    });

    // 如果当前不是该年份，导航到该年份（全部类型）
    if (currentUrlYear !== String(year)) {
      setActiveMainMenu('view-finance' as MenuId);
      navigate(`/view-finance?year=${year}`);
    }
    onNavigate?.('view-finance');
  };

  // 点击年份下的具体档案类型
  const handleTypeUnderYearClick = (e: React.MouseEvent, year: number, code: string, label: string) => {
    e.stopPropagation();
    closeOtherGroups('preserve' as keyof typeof sidebarGroups);
    setActiveMainMenu('view-finance' as MenuId);
    navigate(`/view-finance?year=${year}&type=${code}&name=${encodeURIComponent(label)}`);
    onNavigate?.('view-finance');
  };

  const toggleFinanceExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSubMenuExpanded(prev => {
      const next = new Set(prev);
      if (next.has('view-finance')) {
        next.delete('view-finance');
      } else {
        next.add('view-finance');
        closeOtherGroups('preserve' as keyof typeof sidebarGroups);
      }
      return next;
    });
  };

  const toggleProjectExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSubMenuExpanded(prev => {
      const next = new Set(prev);
      if (next.has('project-query')) {
        next.delete('project-query');
      } else {
        next.add('project-query');
        closeOtherGroups('query' as keyof typeof sidebarGroups);
      }
      return next;
    });
  };

  const renderMenuItem = (item: MenuItemDef, groupKey: string) => {
    const Icon = item.Icon;
    const isActive = activeMainMenu === item.key;
    const isFinanceMenu = item.key === 'view-finance' && financeSubMenus.length > 0;
    const isProjectMenu = item.key === 'project-query' && projectSubMenus.length > 0;

    return (
      <div key={item.key}>
        <button
          type="button"
          onClick={(e) => {
            if (isFinanceMenu) {
              toggleFinanceExpanded(e);
            } else if (isProjectMenu) {
              toggleProjectExpanded(e);
            } else {
              handleMenuClick(groupKey, item.key);
            }
          }}
          className={`w-[calc(100%-32px)] flex items-center gap-3 mx-5 py-2 px-3.5 font-medium rounded-xl transition-all border-l-4 border-r-4 cursor-pointer text-left text-sm ${
            (isActive || (isFinanceMenu && isFinanceExpanded) || (isProjectMenu && isProjectExpanded))
              ? 'bg-sky-50 text-slate-800 border-sky-500'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800 border-transparent'
          }`}
        >
          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-700' : 'text-slate-500'}`} />
          <span className="flex-1 min-w-0 truncate whitespace-nowrap">{item.label}</span>
          {isFinanceMenu && (
            isFinanceExpanded
              ? <ChevronDown className="w-3 h-3 text-slate-400" />
              : <ChevronRight className="w-3 h-3 text-slate-400" />
          )}
          {isProjectMenu && (
            isProjectExpanded
              ? <ChevronDown className="w-3 h-3 text-slate-400" />
              : <ChevronRight className="w-3 h-3 text-slate-400" />
          )}
        </button>

        {/* 财务分类视图 → 年份 → 档案大类子菜单 */}
        {isFinanceMenu && isFinanceExpanded && (
          <div className="space-y-0.5 mt-1">
            {enabledYears.map(y => {
              const isYearActive = activeMainMenu === 'view-finance' && currentUrlYear === String(y.year);
              const isYrExpanded = isYearExpanded(y.year);

              return (
                <div key={y.id}>
                  {/* 年份行（可展开显示四大类） */}
                  <button
                    type="button"
                    onClick={(e) => handleYearNodeClick(e, y.year)}
                    className={`w-[calc(100%-36px)] flex items-center gap-2.5 mx-6 py-2 px-3 rounded-lg transition-all cursor-pointer text-left text-sm ${
                      isYearActive
                        ? 'bg-sky-100 text-sky-800'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    {financeSubMenus.length > 0 && (
                      isYrExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isYearActive ? 'bg-sky-500' : 'bg-slate-300'}`} />
                    <span className="flex-1 min-w-0">{y.year}年</span>
                  </button>

                  {/* 四大类子菜单 */}
                  {isYrExpanded && financeSubMenus.length > 0 && (
                    <div className="ml-5 space-y-0.5 mt-0.5 pb-1 border-l border-slate-200">
                      {financeSubMenus.map(sub => {
                        const isTypeActive = isYearActive && currentUrlType === sub.code;
                        return (
                          <button
                            key={sub.key}
                            type="button"
                            onClick={(e) => handleTypeUnderYearClick(e, y.year, sub.code, sub.label)}
                            className={`w-[calc(100%-36px)] flex items-center gap-2 mx-7 py-1.5 px-3 rounded-lg transition-all cursor-pointer text-left text-sm ${
                              isTypeActive
                                ? 'bg-sky-100 text-sky-700 shadow-sm'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                          >
                            <span className={`w-1 h-1 rounded-full shrink-0 ${isTypeActive ? 'bg-sky-500' : 'bg-slate-300'}`} />
                            <span className="truncate whitespace-nowrap">{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 项目分类视图 → 项目子菜单 */}
        {isProjectMenu && isProjectExpanded && (
          <div className="ml-5 space-y-0.5 mt-1 pb-1 border-l border-slate-200">
            {projectSubMenus.map(sub => {
              const isSubActive = activeMainMenu === 'project-query' && currentUrlProject === sub.code;
              return (
                <div key={sub.key}>
                  <button
                    type="button"
                    onClick={() => {
                      closeOtherGroups('query' as keyof typeof sidebarGroups);
                      setActiveMainMenu('project-query' as MenuId);
                      navigate(`/project-query?project=${sub.code}&name=${encodeURIComponent(sub.label)}`);
                    }}
                    className={`w-[calc(100%-36px)] flex items-center gap-2.5 mx-6 py-2 px-3 rounded-lg transition-all cursor-pointer text-left text-sm ${
                      isSubActive
                        ? 'bg-sky-100 text-sky-800'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSubActive ? 'bg-sky-500' : 'bg-slate-300'}`} />
                    <span className="flex-1 min-w-0 truncate whitespace-nowrap">{sub.label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderGroup = (group: MenuGroupDef) => {
    const isOpen = sidebarGroups[group.key as keyof typeof sidebarGroups];
    const isVisible = visibleMenus[group.key];
    if (!isVisible) return null;

    const GroupIcon = group.Icon;

    return (
      <div key={group.key} className="space-y-1">
        <button
          type="button"
          onClick={() => toggleSidebarGroup(group.key as keyof typeof sidebarGroups)}
          className="w-[calc(100%-24px)] flex items-center justify-between mx-3 py-2.5 px-4 text-base font-bold text-slate-700 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer text-left"
        >
          <span className="flex items-center gap-2">
            <GroupIcon className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span>{group.label}</span>
          </span>
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {isOpen && (
          <div className="space-y-1 mt-1 pl-1">
            {group.items.map((item) => renderMenuItem(item, group.key))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="hidden md:flex flex-col w-[240px] max-w-[240px] bg-[#F8FAFC] shrink-0 h-screen sticky top-0 text-slate-600 transition-all duration-300 border-r border-slate-200 overflow-hidden">
      {/* LOGO AREA */}
      <div className="h-[64px] bg-[#F8FAFC] flex items-center justify-between px-5 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="会计档案" className="h-8 w-auto object-contain shrink-0 rounded-lg" />
          <span className="font-bold text-slate-800 text-[15px] tracking-wide">会计电子档案系统</span>
        </div>
        <button
          type="button"
          onClick={() => setMenuSettingsOpen(true)}
          className="p-1 text-slate-400 hover:text-sky-600 hover:bg-slate-100/80 rounded transition-colors"
          title="自定义菜单"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 分割线 */}
      <div className="h-px bg-slate-200" />

      {/* SCROLLABLE SIDEBAR MENU */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-1 font-sans text-sm select-none">
        {roleFilteredGroups.map(renderGroup)}
      </nav>
    </aside>
  );
};

