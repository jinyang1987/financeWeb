/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * StatsCockpitPage — 会计档案统计驾驶舱（数据大屏）
 *
 * 双主题（2026-07-21 与用户对齐）：
 *   - 网页内嵌：浅色主题，与全站风格一致；
 *   - 全屏展示：自动切换深色大屏主题（仅对驾驶舱容器 requestFullscreen，
 *     不带侧边栏/Header，真正充满屏幕）。
 * 模块可在「系统管理 → 驾驶舱配置」中开关 / 排序 / 调整宽度（cockpitStore persist）。
 * 全部数据由 statsEngine 从真实业务数据实时计算。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Maximize2, Minimize2, Settings2, Database, FolderOpen, Box, FileStack,
  HardDrive, ScrollText, Activity, ShieldCheck, Flame, AlertOctagon,
  Users, Building2, PackageCheck, Hourglass, Radio,
} from 'lucide-react';
import { useCockpitStore, type CockpitModuleId } from '../../stores/cockpitStore';
import { useAuthStore } from '../../stores/authStore';
import { useArchiveStats } from '../../hooks/useArchiveStats';
import { formatCapacity } from '../../utils/statsEngine';
import { useAppStore } from '../../stores/appStore';
import { useBorrowStore } from '../../stores/borrowStore';

// ──────────────────────────────────────────────
// 双主题变量（ck = cockpit）
// ──────────────────────────────────────────────

type CkVars = Record<string, string>;

/** 网页内嵌：浅色主题（与全站一致） */
const LIGHT_THEME: CkVars = {
  '--ck-bg': '#f1f5f9',
  '--ck-grid': 'rgba(8,145,178,0.4)',
  '--ck-grid-op': '0.06',
  '--ck-card': '#ffffff',
  '--ck-card-solid': '#ffffff',
  '--ck-card-border': '#e2e8f0',
  '--ck-card-shadow': '0 1px 3px rgba(15,23,42,0.07)',
  '--ck-rule': 'linear-gradient(to right, rgba(8,145,178,0.3), transparent)',
  '--ck-inner': '#f8fafc',
  '--ck-inner-border': '#e2e8f0',
  '--ck-track': '#e2e8f0',
  '--ck-text': '#0f172a',
  '--ck-body': '#334155',
  '--ck-dim': '#64748b',
  '--ck-faint': '#94a3b8',
  '--ck-accent': '#0891b2',
  '--ck-accent-text': '#0e7490',
  '--ck-sub': 'rgba(8,145,178,0.85)',
  '--ck-btn-bg': '#ffffff',
  '--ck-btn-border': '#e2e8f0',
  '--ck-btn-text': '#475569',
  '--ck-accent-btn-bg': '#ecfeff',
  '--ck-accent-btn-border': '#a5f3fc',
  '--ck-divider': 'rgba(226,232,240,0.9)',
  '--ck-danger-bg': '#fef2f2',
  '--ck-danger-border': '#fecaca',
  '--ck-danger-text': '#b91c1c',
  '--ck-danger-strong': '#dc2626',
  '--ck-warn-bg': '#fffbeb',
  '--ck-warn-border': '#fde68a',
  '--ck-warn-text': '#b45309',
  '--ck-warn-strong': '#d97706',
  '--ck-ok-bg': '#ecfdf5',
  '--ck-ok-border': '#a7f3d0',
  '--ck-ok-text': '#047857',
};

/** 全屏展示：深色大屏主题 */
const DARK_THEME: CkVars = {
  '--ck-bg': '#020617',
  '--ck-grid': 'rgba(34,211,238,0.5)',
  '--ck-grid-op': '0.04',
  '--ck-card': 'rgba(15,23,42,0.7)',
  '--ck-card-solid': '#0f172a',
  '--ck-card-border': 'rgba(22,78,99,0.4)',
  '--ck-card-shadow': '0 0 24px rgba(8,145,178,0.08)',
  '--ck-rule': 'linear-gradient(to right, rgba(22,78,99,0.6), transparent)',
  '--ck-inner': 'rgba(30,41,59,0.6)',
  '--ck-inner-border': 'rgba(51,65,85,0.6)',
  '--ck-track': '#1e293b',
  '--ck-text': '#f1f5f9',
  '--ck-body': '#cbd5e1',
  '--ck-dim': '#94a3b8',
  '--ck-faint': '#64748b',
  '--ck-accent': '#22d3ee',
  '--ck-accent-text': '#67e8f9',
  '--ck-sub': 'rgba(6,182,212,0.8)',
  '--ck-btn-bg': 'rgba(30,41,59,0.8)',
  '--ck-btn-border': '#334155',
  '--ck-btn-text': '#cbd5e1',
  '--ck-accent-btn-bg': 'rgba(8,51,68,0.6)',
  '--ck-accent-btn-border': 'rgba(21,94,117,0.6)',
  '--ck-divider': 'rgba(30,41,59,0.6)',
  '--ck-danger-bg': 'rgba(69,10,10,0.4)',
  '--ck-danger-border': 'rgba(127,29,29,0.5)',
  '--ck-danger-text': 'rgba(252,165,165,0.9)',
  '--ck-danger-strong': '#f87171',
  '--ck-warn-bg': 'rgba(69,26,3,0.4)',
  '--ck-warn-border': 'rgba(120,53,15,0.5)',
  '--ck-warn-text': 'rgba(252,211,77,0.75)',
  '--ck-warn-strong': '#fbbf24',
  '--ck-ok-bg': 'rgba(2,44,34,0.3)',
  '--ck-ok-border': 'rgba(6,78,59,0.4)',
  '--ck-ok-text': 'rgba(110,231,183,0.8)',
};

// ──────────────────────────────────────────────
// 大屏基础样式件
// ──────────────────────────────────────────────

const ACCENTS = ['#22d3ee', '#818cf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa'];

const ModuleCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, icon, children, className = '' }) => (
  <div
    className={`rounded-xl p-4 flex flex-col min-h-0 ${className}`}
    style={{ background: 'var(--ck-card)', border: '1px solid var(--ck-card-border)', boxShadow: 'var(--ck-card-shadow)' }}
  >
    <div className="flex items-center gap-2 mb-3 shrink-0">
      <span style={{ color: 'var(--ck-accent)' }}>{icon}</span>
      <span className="text-sm font-bold tracking-wide" style={{ color: 'var(--ck-text)' }}>{title}</span>
      <span className="flex-1 h-px ml-2" style={{ background: 'var(--ck-rule)' }} />
    </div>
    <div className="flex-1 min-h-0">{children}</div>
  </div>
);

/** CSS 环形图 */
const Donut: React.FC<{ segments: { value: number; color: string }[]; size?: number; centerLabel?: string; centerValue?: string }> = ({ segments, size = 150, centerLabel, centerValue }) => {
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
      <div className="absolute rounded-full flex flex-col items-center justify-center" style={{ inset: size * 0.22, background: 'var(--ck-card-solid)' }}>
        {centerValue && <span className="text-xl font-bold font-mono" style={{ color: 'var(--ck-accent-text)' }}>{centerValue}</span>}
        {centerLabel && <span className="text-[10px] mt-0.5" style={{ color: 'var(--ck-dim)' }}>{centerLabel}</span>}
      </div>
    </div>
  );
};

/** 条形行 */
const BarRow: React.FC<{ label: string; value: number; max: number; color?: string; suffix?: string }> = ({ label, value, max, color = '#22d3ee', suffix = '' }) => (
  <div>
    <div className="flex items-center justify-between text-xs mb-1">
      <span className="truncate" style={{ color: 'var(--ck-body)' }}>{label}</span>
      <span className="font-mono shrink-0 ml-2" style={{ color: 'var(--ck-accent-text)' }}>{value.toLocaleString()}{suffix}</span>
    </div>
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--ck-track)' }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max((value / Math.max(1, max)) * 100, value > 0 ? 3 : 0)}%`, background: color }} />
    </div>
  </div>
);

/** SVG 环形仪表 */
const GaugeRing: React.FC<{ pct: number; label: string; color?: string; size?: number }> = ({ pct, label, color = '#34d399', size = 130 }) => {
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = (pct / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--ck-track)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`} className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold font-mono" style={{ color }}>{pct}%</span>
        <span className="text-[10px] mt-0.5" style={{ color: 'var(--ck-dim)' }}>{label}</span>
      </div>
    </div>
  );
};

const StatTile: React.FC<{ label: string; value: string | number; Icon: typeof Database; accent?: string }> = ({ label, value, Icon, accent = '#22d3ee' }) => (
  <div
    className="rounded-lg px-4 py-3 flex items-center gap-3"
    style={{ background: 'var(--ck-inner)', border: '1px solid var(--ck-inner-border)' }}
  >
    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${accent}1a` }}>
      <Icon className="w-4.5 h-4.5" style={{ color: accent, width: 18, height: 18 }} />
    </div>
    <div className="min-w-0">
      <div className="text-xl font-bold font-mono leading-tight truncate" style={{ color: 'var(--ck-text)' }}>{value}</div>
      <div className="text-[10px]" style={{ color: 'var(--ck-dim)' }}>{label}</div>
    </div>
  </div>
);

// ──────────────────────────────────────────────
// 主页面
// ──────────────────────────────────────────────

const StatsCockpitPage: React.FC = () => {
  const navigate = useNavigate();
  const modules = useCockpitStore((s) => s.modules);
  const currentUser = useAuthStore((s) => s.currentUser);
  const setActiveMainMenu = useAppStore((s) => s.setActiveMainMenu);
  const stats = useArchiveStats();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  /** 仅对驾驶舱容器全屏 —— 不带侧边栏/Header，真正充满屏幕 */
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen?.();
  };

  const goConfig = () => {
    setActiveMainMenu('sys-cockpit-config');
    navigate('/sys-cockpit-config');
  };

  const enabledModules = useMemo(() => modules.filter((m) => m.enabled), [modules]);
  const themeVars = (isFullscreen ? DARK_THEME : LIGHT_THEME) as React.CSSProperties;

  // ── 模块渲染器 ──
  const renderModule = (id: CockpitModuleId): React.ReactNode => {
    const { inventory: inv, lifecycle: lc, utilization: util, compliance: cc } = stats;
    switch (id) {
      case 'kpi-overview':
        return (
          <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
            <StatTile label="档案盒（盒）" value={inv.totals.boxes} Icon={Box} accent="#fbbf24" />
            <StatTile label="案卷（卷/册）" value={inv.totals.volumes} Icon={FolderOpen} accent="#818cf8" />
            <StatTile label="档案（件）" value={inv.totals.records} Icon={FileStack} accent="#22d3ee" />
            <StatTile label="原始凭证（份）" value={inv.totals.sourceDocs} Icon={ScrollText} accent="#f472b6" />
            <StatTile label="总页数（页）" value={inv.totals.pages.toLocaleString()} Icon={Database} accent="#a78bfa" />
            <StatTile label="存储容量" value={formatCapacity(inv.totals.capacityKB)} Icon={HardDrive} accent="#34d399" />
          </div>
        );

      case 'type-distribution': {
        const total = Math.max(1, inv.byType.reduce((s, t) => s + t.records, 0));
        return (
          <div className="flex items-center gap-5 h-full">
            <Donut
              segments={inv.byType.map((t, i) => ({ value: t.records, color: ACCENTS[i] }))}
              centerValue={inv.totals.records.toLocaleString()}
              centerLabel="总件数"
            />
            <div className="flex-1 space-y-2.5">
              {inv.byType.map((t, i) => (
                <div key={t.code} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: ACCENTS[i] }} />
                  <span className="flex-1" style={{ color: 'var(--ck-body)' }}>{t.label}</span>
                  <span className="font-mono" style={{ color: 'var(--ck-dim)' }}>{t.records} 件</span>
                  <span className="font-mono w-12 text-right" style={{ color: 'var(--ck-accent-text)' }}>{Math.round((t.records / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'year-trend': {
        const max = Math.max(1, ...inv.byYear.map((y) => y.records));
        return (
          <div className="h-full flex items-end gap-6 px-2 pb-1">
            {inv.byYear.map((y) => (
              <div key={y.year} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <div className="text-xs font-mono" style={{ color: 'var(--ck-accent-text)' }}>{y.records}</div>
                <div className="w-full max-w-[90px] rounded-t-lg relative" style={{ height: '70%', background: 'var(--ck-track)' }}>
                  <div className="absolute bottom-0 w-full rounded-t-lg bg-gradient-to-t from-cyan-600 to-cyan-400 transition-all duration-700"
                    style={{ height: `${(y.records / max) * 100}%` }} />
                </div>
                <div className="text-xs" style={{ color: 'var(--ck-dim)' }}>{y.year}年</div>
                <div className="text-[10px]" style={{ color: 'var(--ck-faint)' }}>{y.volumes} 卷</div>
              </div>
            ))}
          </div>
        );
      }

      case 'retention-structure':
        return (
          <div className="flex items-center gap-5 h-full">
            <Donut
              segments={inv.byRetention.map((r, i) => ({ value: r.records, color: ['#fbbf24', '#22d3ee', '#818cf8'][i] }))}
              centerValue={`${inv.byRetention.length}`}
              centerLabel="期限类别"
            />
            <div className="flex-1 space-y-2.5">
              {inv.byRetention.map((r, i) => (
                <BarRow key={r.label} label={`${r.label}保管`} value={r.records} max={inv.totals.records} color={['#fbbf24', '#22d3ee', '#818cf8'][i]} suffix={` · ${r.pct}%`} />
              ))}
            </div>
          </div>
        );

      case 'carrier-progress':
        return (
          <div className="flex items-center gap-5 h-full">
            <GaugeRing pct={Math.round(inv.electronicRatio)} label="原生电子化率" color="#34d399" />
            <div className="flex-1 space-y-2.5">
              {inv.byCarrier.map((c, i) => (
                <BarRow key={c.key} label={c.label} value={c.records} max={inv.totals.records} color={['#34d399', '#fbbf24', '#64748b'][i]} suffix={` · ${c.pct}%`} />
              ))}
            </div>
          </div>
        );

      case 'process-monitor':
        return (
          <div className="grid grid-cols-2 gap-3 h-full content-center">
            <StatTile label="待归档（件）" value={lc.pendingArchive} Icon={Hourglass} accent={lc.pendingArchive > 0 ? '#fbbf24' : '#34d399'} />
            <StatTile label="已归档（件）" value={lc.archived} Icon={PackageCheck} accent="#22d3ee" />
            <StatTile label="已移交（卷）" value={lc.transferredVolumes} Icon={Activity} accent="#818cf8" />
            <StatTile label="四性通过率" value={`${lc.checksPassRate}%`} Icon={ShieldCheck} accent="#34d399" />
          </div>
        );

      case 'borrow-heat': {
        const max = Math.max(1, ...util.byTypeHeat.map((h) => h.count));
        return (
          <div className="space-y-3 pt-1">
            {util.byTypeHeat.map((h, i) => (
              <BarRow key={h.code} label={h.label} value={h.count} max={max} color={ACCENTS[i]} suffix=" 件次" />
            ))}
            <p className="text-[10px] pt-1" style={{ color: 'var(--ck-faint)' }}>高频借阅类型可能提示财务争议或审计重点</p>
          </div>
        );
      }

      case 'borrow-alerts':
        return (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--ck-danger-bg)', border: '1px solid var(--ck-danger-border)' }}>
                <div className="text-xl font-bold font-mono" style={{ color: 'var(--ck-danger-strong)' }}>{cc.overdueVolumes}</div>
                <div className="text-[10px]" style={{ color: 'var(--ck-danger-text)' }}>逾期未还（卷）</div>
              </div>
              <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--ck-warn-bg)', border: '1px solid var(--ck-warn-border)' }}>
                <div className="text-xl font-bold font-mono" style={{ color: 'var(--ck-warn-strong)' }}>{cc.blacklistedUsers}</div>
                <div className="text-[10px]" style={{ color: 'var(--ck-warn-text)' }}>黑名单熔断（人）</div>
              </div>
            </div>
            {cc.overdueVolumes > 0 || cc.blacklistedUsers > 0 ? (
              <div
                className="flex items-start gap-2 text-[11px] rounded-lg px-3 py-2 leading-relaxed"
                style={{ color: 'var(--ck-danger-text)', background: 'var(--ck-danger-bg)', border: '1px solid var(--ck-danger-border)' }}
              >
                <AlertOctagon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                存在逾期未还实体档案，已自动熔断相关用户借阅权限并每日抄送其直属主管，请档案管理员及时催还核销。
              </div>
            ) : (
              <div
                className="flex items-center gap-2 text-[11px] rounded-lg px-3 py-2"
                style={{ color: 'var(--ck-ok-text)', background: 'var(--ck-ok-bg)', border: '1px solid var(--ck-ok-border)' }}
              >
                <ShieldCheck className="w-3.5 h-3.5" />当前无逾期与熔断，借阅风险可控
              </div>
            )}
          </div>
        );

      case 'dept-usage': {
        const max = Math.max(1, ...util.byDeptUsage.map((d) => d.orders));
        return (
          <div className="space-y-3 pt-1">
            {util.byDeptUsage.slice(0, 5).map((d, i) => (
              <BarRow key={d.dept} label={`${d.dept}（${d.items} 件）`} value={d.orders} max={max} color={ACCENTS[i]} suffix=" 单" />
            ))}
            {util.byDeptUsage.length === 0 && <p className="text-xs" style={{ color: 'var(--ck-faint)' }}>暂无借阅数据</p>}
          </div>
        );
      }

      case 'fonds-distribution': {
        const max = Math.max(1, ...inv.byFonds.map((f) => f.records));
        return (
          <div className="space-y-3 pt-1">
            {inv.byFonds.map((f, i) => (
              <BarRow key={f.code} label={`全宗 ${f.code}`} value={f.records} max={max} color={ACCENTS[i]} suffix=" 件" />
            ))}
          </div>
        );
      }

      case 'data-quality':
        return (
          <div className="flex items-center justify-around h-full">
            <GaugeRing pct={Math.round(cc.metadataCompleteRate)} label="元数据完整率" color="#22d3ee" size={110} />
            <GaugeRing pct={Math.round(cc.formatComplianceRate)} label="格式合规率" color="#818cf8" size={110} />
            <GaugeRing pct={Math.round(cc.checksPassRate)} label="四性通过率" color="#34d399" size={110} />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      ref={rootRef}
      className="h-full overflow-y-auto relative"
      style={{ background: 'var(--ck-bg)', color: 'var(--ck-text)', ...themeVars }}
    >
      {/* 背景网格 */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(var(--ck-grid) 1px, transparent 1px), linear-gradient(90deg, var(--ck-grid) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        opacity: 'var(--ck-grid-op)',
      }} />

      <div className="relative p-5 space-y-4 min-h-full flex flex-col">
        {/* 大屏头部 */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-gradient-to-b from-cyan-400 to-sky-600 rounded-full" />
            <div>
              <h1 className="text-xl font-bold tracking-widest" style={{ color: 'var(--ck-text)' }}>会计档案统计驾驶舱</h1>
              <p className="text-[11px] tracking-wider mt-0.5" style={{ color: 'var(--ck-sub)' }}>ACCOUNTING ARCHIVES STATISTICS COCKPIT · 全宗 Z001</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--ck-accent-text)' }}>
              {now.getFullYear()}-{String(now.getMonth() + 1).padStart(2, '0')}-{String(now.getDate()).padStart(2, '0')}
              {' '}
              {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}:{String(now.getSeconds()).padStart(2, '0')}
            </span>
            {(currentUser?.roles.includes('admin') || currentUser?.roles.includes('archive_director')) && (
              <button
                type="button"
                onClick={goConfig}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition hover:opacity-85 cursor-pointer"
                style={{ color: 'var(--ck-accent-text)', background: 'var(--ck-accent-btn-bg)', border: '1px solid var(--ck-accent-btn-border)' }}
              >
                <Settings2 className="w-3.5 h-3.5" />模块配置
              </button>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition hover:opacity-85 cursor-pointer"
              style={{ color: 'var(--ck-btn-text)', background: 'var(--ck-btn-bg)', border: '1px solid var(--ck-btn-border)' }}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {isFullscreen ? '退出全屏' : '全屏'}
            </button>
          </div>
        </div>

        {/* 模块网格 */}
        <div className="grid grid-cols-2 gap-4 flex-1 content-start">
          {enabledModules.map((m) => (
            <div key={m.id} className={m.size === 'full' ? 'col-span-2' : 'col-span-1'}>
              {m.id === 'realtime-feed'
                ? <RealtimeFeedCard />
                : (
                  <ModuleCard
                    title={m.title}
                    icon={MODULE_ICONS[m.id]}
                    className="h-full min-h-[220px]"
                  >
                    {renderModule(m.id)}
                  </ModuleCard>
                )}
            </div>
          ))}
        </div>

        {enabledModules.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ color: 'var(--ck-dim)' }}>
            <Settings2 className="w-12 h-12 mb-3" style={{ color: 'var(--ck-faint)' }} />
            <p className="text-sm">大屏模块已全部关闭</p>
            <button onClick={goConfig} className="mt-2 text-xs hover:underline" style={{ color: 'var(--ck-accent)' }}>前往 系统管理 → 驾驶舱配置 开启模块</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── 模块图标 ──
const MODULE_ICONS: Record<CockpitModuleId, React.ReactNode> = {
  'kpi-overview': <Database className="w-4 h-4" />,
  'type-distribution': <FolderOpen className="w-4 h-4" />,
  'year-trend': <Activity className="w-4 h-4" />,
  'retention-structure': <Hourglass className="w-4 h-4" />,
  'carrier-progress': <HardDrive className="w-4 h-4" />,
  'process-monitor': <PackageCheck className="w-4 h-4" />,
  'borrow-heat': <Flame className="w-4 h-4" />,
  'borrow-alerts': <AlertOctagon className="w-4 h-4" />,
  'dept-usage': <Users className="w-4 h-4" />,
  'fonds-distribution': <Building2 className="w-4 h-4" />,
  'data-quality': <ShieldCheck className="w-4 h-4" />,
  'realtime-feed': <Radio className="w-4 h-4" />,
};

// ── 实时动态模块（独立组件，自带滚动数据） ──
const RealtimeFeedCard: React.FC = () => {
  const logs = useBorrowStore((s) => s.logs);
  const latest = logs.slice(0, 12);
  return (
    <ModuleCard title="实时动态" icon={<Radio className="w-4 h-4" />} className="min-h-[200px]">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {latest.map((log) => (
          <div key={log.id} className="flex items-center gap-2 text-[11px] py-1" style={{ borderBottom: '1px solid var(--ck-divider)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 animate-pulse" />
            <span className="font-mono shrink-0" style={{ color: 'var(--ck-faint)' }}>{log.timestamp.slice(5, 16)}</span>
            <span className="font-medium shrink-0" style={{ color: 'var(--ck-body)' }}>{log.actorName}</span>
            <span className="shrink-0" style={{ color: 'var(--ck-accent)' }}>{log.action}</span>
            <span className="truncate" style={{ color: 'var(--ck-dim)' }}>{log.target}</span>
          </div>
        ))}
      </div>
    </ModuleCard>
  );
};

export default StatsCockpitPage;

