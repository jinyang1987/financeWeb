/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PortalApp — 检索门户（前台）应用骨架
 *
 * 百度式检索首页 + 结果列表 + 详情（含附件权限门控）+ 我的借阅/在线调阅。
 * 门户头部提供「进入后台管理」切换入口，后台头部提供「进入检索门户」切换入口。
 */

import React, { useState } from 'react';
import { Search, Settings, BookOpen, ShieldCheck } from 'lucide-react';
import { usePortalStore, type PortalSearchMode } from '../../stores/portalStore';
import { useAuthStore } from '../../stores/authStore';
import { useRoleStore, hasAnyBackendMenu } from '../../stores/roleStore';
import { ROLE_LABELS } from '../../types/user';
import PortalHomePage from './PortalHomePage';
import PortalSearchPage from './PortalSearchPage';
import PortalRecordDetail from './PortalRecordDetail';
import PortalMyBorrow from './PortalMyBorrow';
import type { ArchiveRecord } from '../../types';

const PortalApp: React.FC<{ loggedUser: string; onLogout: () => void }> = ({ loggedUser, onLogout }) => {
  const switchMode = usePortalStore((s) => s.switchMode);
  const tab = usePortalStore((s) => s.portalTab);
  const setTab = usePortalStore((s) => s.setPortalTab);
  const currentUser = useAuthStore((s) => s.currentUser);
  const roleMenus = useRoleStore((s) => s.roleMenus);

  const [detailRecord, setDetailRecord] = useState<ArchiveRecord | null>(null);

  /** 是否可进入后台管理（普通员工等无任何后台菜单的角色不显示入口） */
  const canEnterAdmin = currentUser ? hasAnyBackendMenu(currentUser.roles, roleMenus) : false;

  const openSearch = (keyword: string) => {
    usePortalStore.getState().setPortalKeyword(keyword);
    usePortalStore.getState().setSearchMode('general');
    setDetailRecord(null);
    setTab('search');
  };

  /** 首页检索模式卡片 → 直接进入对应检索模式 */
  const openSearchMode = (mode: PortalSearchMode) => {
    usePortalStore.getState().setSearchMode(mode);
    setDetailRecord(null);
    setTab('search');
  };

  const openDetail = (record: ArchiveRecord) => {
    setDetailRecord(record);
  };

  const goHome = () => {
    setDetailRecord(null);
    setTab('home');
  };

  const goMyBorrow = () => {
    setDetailRecord(null);
    setTab('my-borrow');
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col text-slate-800 font-sans antialiased">
      {/* 门户顶栏 */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-5 shrink-0">
        <button
          type="button"
          onClick={goHome}
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <img src="/logo.png" alt="会计档案" className="h-7 w-auto object-contain rounded" />
          <span className="font-bold text-slate-800 text-[15px] tracking-wide">会计档案 · 检索门户</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-100">前台</span>
        </button>

        <div className="flex items-center gap-2">
          {/* 快捷导航 */}
          <button
            type="button"
            onClick={goHome}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              tab === 'home' && !detailRecord ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Search className="w-3.5 h-3.5" />检索
          </button>
          <button
            type="button"
            onClick={goMyBorrow}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              tab === 'my-borrow' && !detailRecord ? 'bg-sky-50 text-sky-700' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />我的借阅
          </button>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          {/* 进入后台管理（仅对有后台菜单权限的角色显示） */}
          {canEnterAdmin && (
            <button
              type="button"
              onClick={() => switchMode('admin')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-sky-300 hover:text-sky-700 transition-colors cursor-pointer"
              title="进入后台管理（档案整理/配置/审批/统计等）"
            >
              <Settings className="w-3.5 h-3.5" />进入后台管理
            </button>
          )}

          {/* 用户信息 */}
          <div className="flex items-center gap-2 pl-1">
            <div className={`w-7 h-7 rounded-full ${currentUser?.avatarColor || 'bg-slate-700'} flex items-center justify-center text-white font-semibold text-xs`}>
              {currentUser?.name?.slice(0, 1) || '？'}
            </div>
            <div className="hidden lg:block">
              <div className="text-xs font-semibold text-slate-700 leading-tight">{currentUser?.name || loggedUser}</div>
              <div className="text-[10px] text-slate-400 leading-tight">
                {currentUser?.roles.map((r) => ROLE_LABELS[r]).join(' / ') || ''}
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="ml-1 flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-3 h-3" />退出
            </button>
          </div>
        </div>
      </header>

      {/* 内容区（detailRecord 非空时优先渲染档案详情，返回后回到原 Tab） */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {detailRecord ? (
          <PortalRecordDetail record={detailRecord} onBack={() => setDetailRecord(null)} onGoHome={goHome} />
        ) : (
          <>
            {tab === 'home' && <PortalHomePage onSearch={openSearch} onOpenMode={openSearchMode} />}
            {tab === 'search' && <PortalSearchPage onOpenDetail={openDetail} onGoHome={goHome} />}
            {tab === 'my-borrow' && <PortalMyBorrow />}
          </>
        )}
      </main>
    </div>
  );
};

export default PortalApp;
