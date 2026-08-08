/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * CockpitConfigPage — 驾驶舱模块配置（系统管理）
 *
 * 配置统计驾驶舱大屏的模块：开关 / 排序（上移下移）/ 宽度（半栏/全栏）。
 * 配置 persist（cockpit-config-v1），大屏页实时按配置渲染。
 */

import React from 'react';
import {
  Settings2, ChevronUp, ChevronDown, RotateCcw, Eye, EyeOff,
  MonitorPlay, LayoutGrid, Info,
} from 'lucide-react';
import { useCockpitStore } from '../../stores/cockpitStore';
import { useAppStore } from '../../stores/appStore';
import { useNavigate } from 'react-router-dom';

const DOMAIN_COLORS: Record<string, string> = {
  库藏: 'bg-cyan-100 text-cyan-700',
  流程: 'bg-sky-100 text-sky-700',
  利用: 'bg-amber-100 text-amber-700',
  合规: 'bg-emerald-100 text-emerald-700',
};

const CockpitConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const modules = useCockpitStore((s) => s.modules);
  const toggleModule = useCockpitStore((s) => s.toggleModule);
  const setSize = useCockpitStore((s) => s.setSize);
  const moveModule = useCockpitStore((s) => s.moveModule);
  const resetToDefault = useCockpitStore((s) => s.resetToDefault);
  const setActiveMainMenu = useAppStore((s) => s.setActiveMainMenu);
  const triggerToast = useAppStore((s) => s.triggerToast);

  const enabledCount = modules.filter((m) => m.enabled).length;

  const goPreview = () => {
    setActiveMainMenu('stats-cockpit');
    navigate('/stats-cockpit');
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* 页头 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings2 className="w-5 h-5 text-slate-600" />
            <div>
              <h1 className="text-base font-bold text-slate-800">驾驶舱模块配置</h1>
              <p className="text-xs text-slate-400 mt-0.5">配置统计驾驶舱大屏的模块组成与布局，保存即生效</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { resetToDefault(); triggerToast('已恢复默认布局', 'info'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />恢复默认
            </button>
            <button
              type="button"
              onClick={goPreview}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors shadow-sm cursor-pointer"
            >
              <MonitorPlay className="w-3.5 h-3.5" />预览大屏
            </button>
          </div>
        </div>

        {/* 摘要 */}
        <div className="flex items-center gap-2 px-4 py-3 bg-sky-50 border border-sky-200 rounded-xl">
          <Info className="w-4 h-4 text-sky-500 shrink-0" />
          <p className="text-xs text-sky-700">
            当前启用 <strong>{enabledCount}</strong> / {modules.length} 个模块 · 「全栏」模块独占一行，「半栏」模块两列排布 · 排序即大屏从上到下的渲染顺序
          </p>
        </div>

        {/* 模块列表 */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-bold text-slate-700">大屏模块（{modules.length}）</span>
          </div>
          <div className="divide-y divide-slate-50">
            {modules.map((m, idx) => (
              <div key={m.id} className={`px-5 py-3.5 flex items-center gap-4 transition-colors ${m.enabled ? '' : 'bg-slate-50/60'}`}>
                {/* 排序 */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveModule(m.id, 'up')}
                    className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    title="上移"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === modules.length - 1}
                    onClick={() => moveModule(m.id, 'down')}
                    className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    title="下移"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                {/* 序号 */}
                <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 ${m.enabled ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-400'}`}>
                  {idx + 1}
                </span>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${m.enabled ? 'text-slate-800' : 'text-slate-400'}`}>{m.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${DOMAIN_COLORS[m.domain]}`}>{m.domain}统计</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{m.description}</p>
                </div>

                {/* 宽度切换 */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 shrink-0">
                  {(['half', 'full'] as const).map((size) => (
                    <button
                      key={size}
                      type="button"
                      disabled={!m.enabled}
                      onClick={() => setSize(m.id, size)}
                      className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-all cursor-pointer disabled:opacity-40 ${
                        m.size === size ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {size === 'half' ? '半栏' : '全栏'}
                    </button>
                  ))}
                </div>

                {/* 开关 */}
                <button
                  type="button"
                  onClick={() => toggleModule(m.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 cursor-pointer ${
                    m.enabled
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
                  title={m.enabled ? '点击隐藏该模块' : '点击启用该模块'}
                >
                  {m.enabled ? <><Eye className="w-3.5 h-3.5" />显示中</> : <><EyeOff className="w-3.5 h-3.5" />已隐藏</>}
                </button>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-slate-400 text-center">
          配置自动保存（localStorage）· 大屏页按此处顺序与宽度实时渲染 · 默认布局涵盖 库藏/流程/利用/合规 四大统计域
        </p>
      </div>
    </div>
  );
};

export default CockpitConfigPage;

