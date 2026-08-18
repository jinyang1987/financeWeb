/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PortalHomePage — 检索门户首页（百度式搜索框）
 *
 * 大搜索框 + 检索模式快捷入口（对齐后台「档案查询」二级菜单）+ 数据概览。
 * 点击搜索携带关键词进入检索结果页（综合检索），
 * 点击检索模式卡片直接进入对应检索模式。
 */

import React, { useEffect, useState } from 'react';
import {
  Search, FileText, BookOpen, TrendingUp, Building2,
  ZoomIn, FileSpreadsheet, FolderTree, ShieldCheck,
} from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import { usePortalStore, type PortalSearchMode } from '../../stores/portalStore';
import { fetchRecordStats } from '../../services/recordService';

interface PortalHomePageProps {
  onSearch: (keyword: string) => void;
  onOpenMode: (mode: PortalSearchMode) => void;
}

const TYPE_SHORTCUTS = [
  { code: '', label: '全部', desc: '全库检索' },
  { code: 'KP', label: '会计凭证', desc: '记账凭证/原始凭证' },
  { code: 'KB', label: '会计账簿', desc: '总账/明细账/日记账' },
  { code: 'FB', label: '财务报表', desc: '月度/季度/年度报表' },
  { code: 'QT', label: '其他资料', desc: '其他会计资料' },
];

/** 检索模式入口（对齐后台档案查询二级菜单） */
const SEARCH_MODE_CARDS: { mode: PortalSearchMode; label: string; desc: string; Icon: typeof Search; color: string }[] = [
  { mode: 'general', label: '综合检索', desc: '全库关键词 · 凭证/账簿/报表', Icon: Search, color: 'from-sky-500 to-sky-600' },
  { mode: 'voucher', label: '凭证检索', desc: '凭证号/科目/年度/制单人', Icon: FileText, color: 'from-blue-500 to-indigo-600' },
  { mode: 'matter', label: '事项检索', desc: '往来单位/发票号/业务类型', Icon: ZoomIn, color: 'from-amber-500 to-orange-600' },
  { mode: 'attachment', label: '附件检索', desc: '原始凭证附件 · 四性状态', Icon: FileSpreadsheet, color: 'from-emerald-500 to-teal-600' },
  { mode: 'volume', label: '关联查询', desc: '卷件同屏对比 · 元数据比对', Icon: FolderTree, color: 'from-violet-500 to-purple-600' },
  { mode: 'audit', label: '审计追踪', desc: '操作日志哈希链 · 取证包', Icon: ShieldCheck, color: 'from-rose-500 to-pink-600' },
];

const PortalHomePage: React.FC<PortalHomePageProps> = ({ onSearch, onOpenMode }) => {
  const [keyword, setKeyword] = useState('');
  const fanzongs = useArchiveStore((s) => s.fanzongs);
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);
  const setPortalType = usePortalStore((s) => s.setPortalType);
  const portalType = usePortalStore((s) => s.portalType);
  const [archivedVouchers, setArchivedVouchers] = useState(0);

  // V10 页态化：首页统计改服务端 SQL（不再全量拉件）
  useEffect(() => {
    if (!currentFanzongCode) return;
    let cancel = false;
    fetchRecordStats(currentFanzongCode)
      .then((s) => { if (!cancel) setArchivedVouchers(s.archivedVouchers); })
      .catch(() => { /* 离线保持 0 */ });
    return () => { cancel = true; };
  }, [currentFanzongCode]);

  // 快捷分类点击：设置分类 + 直接进入综合检索
  const quickSearch = (code: string) => {
    setPortalType(code);
    onSearch(keyword.trim());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(keyword.trim());
  };

  useEffect(() => {
    setKeyword('');
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      {/* 中央搜索区（百度式） */}
      <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-start pt-[10vh] px-6">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img src="/logo.png" alt="会计档案" className="h-10 w-auto object-contain rounded-lg" />
            <h1 className="text-3xl font-bold tracking-tight text-slate-800">会计档案检索门户</h1>
          </div>
          <p className="text-sm text-slate-400">
            融合后台「档案查询」全部检索能力 · 在线调阅 · 借阅申请一站式办理
          </p>
        </div>

        {/* 搜索框 */}
        <form onSubmit={handleSubmit} className="w-full max-w-2xl">
          <div className="flex items-center gap-0 bg-white border-2 border-slate-300 rounded-full shadow-sm hover:border-sky-400 focus-within:border-sky-500 transition-all overflow-hidden pl-5 pr-2 py-1.5">
            <Search className="w-5 h-5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="输入凭证号 / 摘要 / 往来单位 / 单据号 / 档号 检索档案…"
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent focus:outline-none"
              autoFocus
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-6 py-2 bg-sky-600 text-white text-sm font-bold rounded-full hover:bg-sky-700 transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />检索
            </button>
          </div>

          {/* 快捷分类 */}
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />快捷：
            </span>
            {TYPE_SHORTCUTS.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => quickSearch(t.code)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all cursor-pointer border ${
                  portalType === t.code
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700'
                }`}
                title={t.desc}
              >
                {t.code === 'KP' && <FileText className="w-3 h-3" />}
                {t.code === 'KB' && <BookOpen className="w-3 h-3" />}
                {t.label}
              </button>
            ))}
          </div>
        </form>

        {/* 检索模式入口（对齐后台档案查询二级菜单） */}
        <div className="w-full max-w-4xl mt-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-slate-500 tracking-wide">检索能力</span>
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[11px] text-slate-400">与后台「档案查询」菜单一致</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {SEARCH_MODE_CARDS.map((c) => (
              <button
                key={c.mode}
                type="button"
                onClick={() => onOpenMode(c.mode)}
                className="group bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-sky-300 hover:shadow-md transition-all cursor-pointer flex items-center gap-3"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>
                  <c.Icon className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800">{c.label}</div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">{c.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 数据概览 */}
        <div className="w-full max-w-4xl mt-10 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{archivedVouchers}</div>
              <div className="text-[11px] text-slate-400">已归档凭证</div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">{fanzongs.length}</div>
              <div className="text-[11px] text-slate-400">全宗单位</div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-slate-800">6 种</div>
              <div className="text-[11px] text-slate-400">检索模式</div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-[11px] text-slate-300">
          电子会计档案管理系统 · 检索门户（前台） — 进入后台管理请点右上角
        </div>
      </div>
    </div>
  );
};

export default PortalHomePage;
