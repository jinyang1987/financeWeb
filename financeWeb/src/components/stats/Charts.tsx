/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 统计页共享图表组件（浅色主题）
 * Donut / BarRow / ProgressRing / StatCard / SectionCard
 */

import React from 'react';

export const CHART_COLORS = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];

export const SectionCard: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; extra?: React.ReactNode }> = ({ title, icon, children, className = '', extra }) => (
  <div className={`bg-white border border-slate-200 rounded-2xl shadow-sm p-5 ${className}`}>
    <div className="flex items-center gap-2 mb-4">
      {icon}
      <span className="text-sm font-bold text-slate-700">{title}</span>
      {extra && <span className="ml-auto">{extra}</span>}
    </div>
    {children}
  </div>
);

export const StatCard: React.FC<{ label: string; value: string | number; sub?: string; accent?: string }> = ({ label, value, sub, accent = 'text-slate-800' }) => (
  <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
    <div className={`text-2xl font-bold font-mono ${accent}`}>{value}</div>
    <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
  </div>
);

export const Donut: React.FC<{
  segments: { value: number; color: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}> = ({ segments, size = 150, centerLabel, centerValue }) => {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  let acc = 0;
  const gradient = segments.map((s) => {
    const from = (acc / total) * 360;
    acc += s.value;
    const to = (acc / total) * 360;
    return `${s.color} ${from}deg ${to}deg`;
  }).join(', ');
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
      <div className="absolute rounded-full bg-white flex flex-col items-center justify-center shadow-inner" style={{ inset: size * 0.24 }}>
        {centerValue && <span className="text-xl font-bold font-mono text-slate-800">{centerValue}</span>}
        {centerLabel && <span className="text-[10px] text-slate-400 mt-0.5">{centerLabel}</span>}
      </div>
    </div>
  );
};

export const BarRow: React.FC<{ label: string; value: number; max: number; color?: string; suffix?: string }> = ({ label, value, max, color = '#0ea5e9', suffix = '' }) => (
  <div>
    <div className="flex items-center justify-between text-xs mb-1">
      <span className="text-slate-600 truncate">{label}</span>
      <span className="font-mono text-slate-700 font-medium shrink-0 ml-2">{value.toLocaleString()}{suffix}</span>
    </div>
    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max((value / Math.max(1, max)) * 100, value > 0 ? 3 : 0)}%`, background: color }} />
    </div>
  </div>
);

export const ProgressRing: React.FC<{ pct: number; label: string; color?: string; size?: number }> = ({ pct, label, color = '#10b981', size = 120 }) => {
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = (pct / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${filled} ${c}`} className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold font-mono" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
};

/** 竖向柱条（年度趋势等） */
export const ColumnBars: React.FC<{ data: { label: string; value: number; sub?: string }[]; color?: string; height?: number }> = ({ data, color = '#0ea5e9', height = 140 }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-4 px-2" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          <span className="text-[11px] font-mono text-slate-600">{d.value}</span>
          <div className="w-full max-w-[72px] bg-slate-100 rounded-t-md relative" style={{ height: '72%' }}>
            <div className="absolute bottom-0 w-full rounded-t-md transition-all duration-700" style={{ height: `${(d.value / max) * 100}%`, background: color }} />
          </div>
          <span className="text-[11px] text-slate-500">{d.label}</span>
          {d.sub && <span className="text-[10px] text-slate-400 -mt-0.5">{d.sub}</span>}
        </div>
      ))}
    </div>
  );
};
