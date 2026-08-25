/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ConnectionConfigPage — 系统管理 → 连接配置（2026-08-16）
 *
 * 采集侧所有"配置"的统一入口（抓取收集中台/集成接口采集页不再含任何配置）：
 *   Tab1 数据源连接 —— 抓取/推送业务系统的连接参数 + 抓取计划 + 默认去向
 *   Tab2 推送接入应用 —— AppKey/AppSecret 签发 + 默认去向 + 推送批次历史
 *   Tab3 接口字段映射 —— 低代码配置：来源系统字段 → 档案标准字段 + 转换规则
 */

import React, { useState } from 'react';
import { PlugZap, Database, KeyRound, GitBranch } from 'lucide-react';
import DatasourceConfigPage from './DatasourceConfigPage';
import OpenAppManagePage from './OpenAppManagePage';
import FieldMapPanel from './FieldMapPanel';

type TabKey = 'datasource' | 'openapp' | 'fieldmap';

const TABS: { key: TabKey; label: string; Icon: React.ElementType; desc: string }[] = [
  { key: 'datasource', label: '数据源连接', Icon: Database, desc: '抓取/推送业务系统连接参数与抓取计划' },
  { key: 'openapp', label: '推送接入应用', Icon: KeyRound, desc: '业务系统 AppKey/AppSecret 签发与管理' },
  { key: 'fieldmap', label: '接口字段映射', Icon: GitBranch, desc: '低代码配置：来源字段 → 档案标准字段' },
];

const ConnectionConfigPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('datasource');

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <PlugZap className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">连接配置</h1>
        <div className="flex-1" />
      </div>

      {/* Tab 切换 */}
      <div className="px-6 pt-3 bg-slate-100 shrink-0">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                tab === t.key
                  ? 'bg-sky-50 text-sky-700 shadow-sm border border-sky-200'
                  : 'text-slate-500 hover:text-slate-700 border border-transparent'
              }`}
            >
              <t.Icon className="w-4 h-4" />
              {t.label}
              <span className="text-[10px] font-normal opacity-70 hidden xl:inline">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'datasource' && <DatasourceConfigPage />}
        {tab === 'openapp' && <OpenAppManagePage />}
        {tab === 'fieldmap' && <div className="h-full p-4"><FieldMapPanel /></div>}
      </div>
    </div>
  );
};

export default ConnectionConfigPage;
