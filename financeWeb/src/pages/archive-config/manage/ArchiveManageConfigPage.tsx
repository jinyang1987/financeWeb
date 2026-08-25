/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ArchiveManageConfigPage — 档案管理配置（2026-08-25 整合目录配置与三合一表）
 *
 * 档案配置统一入口，顶部 Tab 切换：
 *   ① 元数据        —— 件级/卷级/盒级元数据方案 + 原始凭证字段显隐 + 详情页展示设置
 *   ② 档号规则      —— 档号结构 + 可自定义配置项 + 赋号时机
 *   ③ 组卷盒号      —— 载体模式 + 四类组卷规则 + 盒号编码
 *   ④ 目录配置      —— 档案类型勾选 + 年份设置 + 项目设置
 *   ⑤ 档案三合一表  —— 分类体系 · 归档范围 · 保管期限（法定口径）
 */

import React, { useState } from 'react';
import { Tag, FileSpreadsheet, Layers, FolderCog, Clock, type LucideIcon } from 'lucide-react';
import MetadataConfigTab from './MetadataConfigTab';
import CodeConfigTab from './CodeConfigTab';
import GroupingConfigTab from './GroupingConfigTab';
import DirectoryConfigPanel from '../../../components/DirectoryConfigPanel';
import RetentionConfigPage from '../RetentionConfigPage';

type TabKey = 'metadata' | 'code' | 'grouping' | 'directory' | 'retention';

const TABS: { key: TabKey; label: string; Icon: LucideIcon }[] = [
  { key: 'metadata', label: '元数据', Icon: Tag },
  { key: 'code', label: '档号规则', Icon: FileSpreadsheet },
  { key: 'grouping', label: '组卷盒号', Icon: Layers },
  { key: 'directory', label: '目录配置', Icon: FolderCog },
  { key: 'retention', label: '档案三合一表', Icon: Clock },
];

const ArchiveManageConfigPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('metadata');

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* ═══ 顶部 Tab 栏 ═══ */}
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
            >
              <t.Icon className={`w-3.5 h-3.5 ${tab === t.key ? 'text-sky-600' : 'text-slate-400'}`} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Tab 内容（各自承载内部滚动） ═══ */}
      {tab === 'metadata' && <MetadataConfigTab />}
      {tab === 'code' && <CodeConfigTab />}
      {tab === 'grouping' && <GroupingConfigTab />}
      {tab === 'directory' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <DirectoryConfigPanel embedded />
        </div>
      )}
      {tab === 'retention' && <RetentionConfigPage embedded />}
    </div>
  );
};

export default ArchiveManageConfigPage;
