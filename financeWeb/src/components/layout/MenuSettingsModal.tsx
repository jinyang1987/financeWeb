﻿﻿﻿﻿﻿﻿﻿import React from 'react';
import { Settings } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { menuSettingGroups } from '../../config/menuConfig';

export const MenuSettingsModal: React.FC = () => {
  const {
    isMenuSettingsOpen,
    setMenuSettingsOpen,
    visibleMenus,
    toggleMenuVisibility,
  } = useAppStore();

  if (!isMenuSettingsOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[100] flex items-center justify-center animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-2xl w-full max-w-sm border border-slate-200 p-6 shadow-2xl relative space-y-5">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
            <Settings className="w-5 h-5 text-sky-600" />
            自定义菜单显示
          </h3>
          <button
            onClick={() => setMenuSettingsOpen(false)}
            className="text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer"
          >
            关闭
          </button>
        </div>

        <div className="space-y-2.5">
          {menuSettingGroups.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-sky-200 transition-colors select-none"
            >
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={visibleMenus[key] ?? true}
                  onChange={() => toggleMenuVisibility(key)}
                />
                <div
                  className={`w-10 h-6 rounded-full transition-colors ${
                    visibleMenus[key] ? 'bg-sky-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full transition-transform shadow-sm ${
                      visibleMenus[key] ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>
              <span className="text-sm font-bold text-slate-700">{label}</span>
            </label>
          ))}
        </div>

        <div className="pt-2">
          <button
            onClick={() => setMenuSettingsOpen(false)}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            确认应用
          </button>
        </div>
      </div>
    </div>
  );
};

