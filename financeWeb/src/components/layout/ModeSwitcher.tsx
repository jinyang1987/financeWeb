/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ModeSwitcher — 全局管理模式切换器
 *
 * 在页面顶部提供按卷管理 / 按件管理一键切换。
 */

import React from 'react';
import { Box, FileText } from 'lucide-react';
import { useManagementModeStore } from '../../stores/managementModeStore';
import { MODE_LABELS } from '../../types/managementMode';
import type { ManagementMode } from '../../types/managementMode';

export const ModeSwitcher: React.FC = () => {
  const mode = useManagementModeStore((s) => s.mode);
  const setMode = useManagementModeStore((s) => s.setMode);

  const modes: { key: ManagementMode; icon: React.ReactNode; shortLabel: string }[] = [
    { key: 'volume-mode', icon: <Box className="w-3.5 h-3.5" />, shortLabel: '按卷管理' },
    { key: 'item-mode', icon: <FileText className="w-3.5 h-3.5" />, shortLabel: '按件管理' },
  ];

  return (
    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5" title={MODE_LABELS[mode]}>
      {modes.map((m) => {
        const active = mode === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              active
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {m.icon}
            <span className="hidden sm:inline">{m.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
};
