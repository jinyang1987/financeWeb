﻿﻿﻿﻿﻿﻿﻿import React, { useState, useRef, useEffect } from 'react';
import { Menu, Building, ChevronDown, Check, Repeat } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useArchiveStore } from '../../stores/archiveStore';
import { useAuthStore } from '../../stores/authStore';
import { getPageTitle } from '../../config/menuConfig';
import { MOCK_USERS, ROLE_LABELS } from '../../types/user';

export interface HeaderProps {
  onLogout: () => void;
  fondsLoading?: boolean;
  onFanzongChange?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLogout, fondsLoading, onFanzongChange }) => {
  const { activeMainMenu, setMobileSidebarOpen } = useAppStore();
  const { fanzongs, currentFanzongCode, setCurrentFanzongCode } = useArchiveStore();
  const { currentUser, switchUser } = useAuthStore();

  const [isFanzongDropdownOpen, setIsFanzongDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const fanzongDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (fanzongDropdownRef.current && !fanzongDropdownRef.current.contains(e.target as Node)) {
        setIsFanzongDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const pageTitle = getPageTitle(activeMainMenu);

  const handleFanzongSelect = (code: string) => {
    setCurrentFanzongCode(code);
    setIsFanzongDropdownOpen(false);
    onFanzongChange?.();
  };

  return (
    <header className="bg-[#F8FAFC] px-5 h-[64px] flex items-center justify-between text-slate-800 shrink-0 select-none">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="md:hidden p-2 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          id="mobile-sidebar-toggle"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* 页面标题 */}
        <div>
          <span className="text-[12px] font-bold text-slate-500 block tracking-wider uppercase select-none">
            {pageTitle.subtitle}
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight text-slate-800">
            {pageTitle.title}
          </h1>
        </div>
      </div>

      {/* 右侧工具栏 */}
      <div className="flex items-center gap-4 text-sm font-sans">
        {/* 全宗选择器 */}
        <div className="relative shrink-0" ref={fanzongDropdownRef}>
          <button
            onClick={() => setIsFanzongDropdownOpen(!isFanzongDropdownOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 transition-all shadow-sm min-w-[220px]"
          >
            <Building className="w-5 h-5 text-sky-600 shrink-0" />
            <div className="flex flex-col items-start flex-1 min-w-0">
              <span className="text-[11px] text-slate-400 font-medium leading-tight">当前全宗</span>
              <span className="text-[14px] font-semibold text-slate-700 truncate max-w-[160px]">
                {fondsLoading
                  ? '加载中...'
                  : fanzongs.find((f) => f.code === currentFanzongCode)?.name || currentFanzongCode}
              </span>
            </div>
            {!fondsLoading && (
              <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                {currentFanzongCode}
              </span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ${
                isFanzongDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* 下拉菜单 */}
          {isFanzongDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden py-1">
              {fanzongs.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-400 text-center">暂无全宗数据</div>
              ) : (
                fanzongs.map((f) => (
                  <button
                    key={f.code}
                    onClick={() => handleFanzongSelect(f.code)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-slate-50 last:border-b-0 ${
                      currentFanzongCode === f.code
                        ? 'bg-sky-50 text-sky-800'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div
                      className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        f.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Building className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold truncate">{f.name}</span>
                        {f.status === 'custodial' && (
                          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium shrink-0">
                            代管
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-mono text-slate-400">{f.code}</span>
                        {f.address && (
                          <>
                            <span className="text-[10px] text-slate-300">|</span>
                            <span className="text-[11px] text-slate-400 truncate">{f.address}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {currentFanzongCode === f.code && (
                      <Check className="w-4 h-4 text-sky-600 mt-1 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* 分隔符 */}
        <div className="h-8 w-px bg-slate-200" />

        {/* 用户信息（含身份切换） */}
        <div className="relative shrink-0" ref={userDropdownRef}>
          <button
            type="button"
            onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
            className="flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
            title="点击切换身份"
          >
            <div className="relative">
              <div className={`w-9 h-9 rounded-full ${currentUser?.avatarColor || 'bg-slate-700'} flex items-center justify-center text-white font-semibold text-sm shadow-sm`}>
                {currentUser?.name?.slice(0, 1) || '？'}
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#F8FAFC]" />
            </div>
            <div className="hidden lg:flex flex-col items-start">
              <span className="font-semibold text-slate-700 text-[15px] leading-tight">{currentUser?.name || '未登录'}</span>
              <span className="text-[12px] text-slate-400 leading-tight">
                {currentUser?.roles.map((r) => ROLE_LABELS[r]).join(' / ') || ''}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isUserDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* 身份切换下拉 */}
          {isUserDropdownOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <Repeat className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-bold text-slate-600">切换身份（演示）</span>
                {currentUser && (
                  <span className="ml-auto text-[10px] text-slate-400">{currentUser.dept} · {currentUser.position}</span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto py-1">
                {MOCK_USERS.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { switchUser(u.account); setIsUserDropdownOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-slate-50 last:border-b-0 ${
                        isCurrent ? 'bg-sky-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full ${u.avatarColor} flex items-center justify-center text-white font-semibold text-xs shrink-0`}>
                        {u.name.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-slate-800">{u.name}</span>
                          <span className="text-[10px] text-slate-400">{u.dept}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          {u.roles.map((r) => (
                            <span key={r} className="text-[10px] px-1.5 py-px rounded-full bg-slate-100 text-slate-500">{ROLE_LABELS[r]}</span>
                          ))}
                        </div>
                      </div>
                      {isCurrent && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
          title="退出登录"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9" />
          </svg>
          <span className="hidden lg:inline">退出</span>
        </button>
      </div>
    </header>
  );
};

