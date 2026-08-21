/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ArchiveManageConfigPage — 档案管理配置（2026-08-21 三合一）
 *
 * 合并原「元数据配置 / 档号规则配置 / 组卷盒号配置」三个页面为一个配置中心，
 * 顶部 Tab 切换，不做长龙页：
 *   ① 元数据    —— 件级/卷级/盒级元数据方案查阅 + 详情页展示设置
 *   ② 档号规则  —— 档号结构总览 + 可自定义配置项 + 赋号时机
 *   ③ 组卷盒号  —— 载体模式 + 四类组卷规则（驱动智能组卷）+ 全局维度 + 盒号编码
 *   ④ 原理说明  —— 全部说教型内容统一收口：整理流程、四类组卷规则、
 *                   档号体系、元数据体系、盒号装盒、规范依据（只读）
 *
 * 设计原则：功能 Tab 只留可操作项；原理/依据/红线等只读内容全部进「原理说明」，
 * 各页面不再分散展示大段说明文字。
 */

import React, { useState } from 'react';
import { Tag, FileSpreadsheet, Layers, BookOpen, type LucideIcon } from 'lucide-react';
import MetadataConfigTab from './MetadataConfigTab';
import CodeConfigTab from './CodeConfigTab';
import GroupingConfigTab from './GroupingConfigTab';
import PrincipleTab from './PrincipleTab';

type TabKey = 'metadata' | 'code' | 'grouping' | 'principle';

const TABS: { key: TabKey; label: string; Icon: LucideIcon; desc: string }[] = [
  { key: 'metadata', label: '元数据', Icon: Tag, desc: '件级 M 系列 · 卷级 V 系列 · 盒级 B 系列方案与展示设置' },
  { key: 'code', label: '档号规则', Icon: FileSpreadsheet, desc: '档号结构 · 可配置段 · 赋号时机' },
  { key: 'grouping', label: '组卷盒号', Icon: Layers, desc: '载体模式 · 四类组卷规则 · 盒号编码' },
  { key: 'principle', label: '原理说明', Icon: BookOpen, desc: '整理流程 · 组卷规则 · 档号/元数据体系 · 规范依据（只读）' },
];

const ArchiveManageConfigPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('metadata');
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* ═══ 顶部 Tab 栏（一级导航；各 Tab 内部自带二级左导航） ═══ */}
      <div className="flex items-center gap-4 px-6 py-2.5 bg-white border-b border-slate-200 shrink-0 flex-wrap">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium rounded-md transition-colors cursor-pointer ${
                tab === t.key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              title={t.desc}
            >
              <t.Icon className={`w-3.5 h-3.5 ${tab === t.key ? 'text-sky-600' : 'text-slate-400'}`} />
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">{active.desc}</span>
      </div>

      {/* ═══ Tab 内容（各自承载内部滚动） ═══ */}
      {tab === 'metadata' && <MetadataConfigTab />}
      {tab === 'code' && <CodeConfigTab />}
      {tab === 'grouping' && <GroupingConfigTab />}
      {tab === 'principle' && <PrincipleTab />}
    </div>
  );
};

export default ArchiveManageConfigPage;
