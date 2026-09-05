/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Typography — 全站字号/排版统一组件族（2026-09-05《全局字体排版一致性设计方案》P1）
 *
 * 字阶闭集（index.css @theme）：display 20 / title 16 / tab 15 / body 14 / aux 12。
 * 层级表达三件套 = 字重 × 灰度 × 底色，禁止用缩字号表达层级；
 * 页面不得手写标题/徽章/分页/空态/辅助文字的字号类，一律经本组件族渲染（组件即规范）。
 */

import React from 'react';

// ── PageHeader：页面标题（title 16/600 + 可选副标题 aux + 右侧操作区插槽） ──

export interface PageHeaderProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  /** 副标题/说明（12px aux slate-400） */
  subtitle?: React.ReactNode;
  /** 右侧操作区 */
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, icon, subtitle, actions, className }) => (
  <div className={`flex items-center gap-3 shrink-0 ${className || ''}`}>
    {icon}
    <div className="min-w-0">
      <h1 className="text-base font-semibold text-slate-800 leading-6 truncate">{title}</h1>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5 leading-4 truncate">{subtitle}</p>}
    </div>
    <div className="flex-1" />
    {actions}
  </div>
);

// ── SectionTitle：卡片/区块标题（title 16/600；可选徽标与副标题） ──

export interface SectionTitleProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  /** 标题右侧徽标/计数（12px aux） */
  badge?: React.ReactNode;
  /** 标题下副说明（12px aux） */
  subtitle?: React.ReactNode;
  className?: string;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({ title, icon, badge, subtitle, className }) => (
  <div className={className}>
    <div className="flex items-center gap-2">
      {icon}
      <h3 className="text-base font-semibold text-slate-800 leading-6">{title}</h3>
      {badge}
    </div>
    {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
  </div>
);

// ── PageTabs：页签（tab 15px，激活 600+底色，不靠变大） ──

export interface PageTabItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  /** 激活态附加样式（默认 sky 底色） */
  accentClass?: string;
}

export interface PageTabsProps<T extends string = string> {
  tabs: PageTabItem<T>[];
  active: T;
  onChange: (v: T) => void;
  className?: string;
}

export function PageTabs<T extends string = string>({ tabs, active, onChange, className }: PageTabsProps<T>) {
  return (
    <div className={`flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 ${className || ''}`} role="tablist">
      {tabs.map((t) => {
        const isActive = t.value === active;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.value)}
            className={`px-3 py-1.5 text-tab leading-5 rounded-md transition-colors ${
              isActive
                ? `bg-white font-semibold shadow-sm text-sky-700 ${t.accentClass || ''}`
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── StatusBadge：状态徽章（12px aux 语义色；px-2 py-0.5，体积靠 padding 不靠字号） ──

export interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: 'sky' | 'emerald' | 'amber' | 'red' | 'violet' | 'slate';
  className?: string;
  title?: string;
}

const BADGE_TONES: Record<string, string> = {
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-600 border-red-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  slate: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ children, tone = 'slate', className, title }) => (
  <span
    title={title}
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium leading-4 whitespace-nowrap ${BADGE_TONES[tone] || BADGE_TONES.slate} ${className || ''}`}
  >
    {children}
  </span>
);

// ── FormRow：表单行（label 14/500 slate-600 + 控件插槽 + 错误/提示行 aux） ──

export interface FormRowProps {
  label: React.ReactNode;
  /** 必填红星 */
  required?: boolean;
  children: React.ReactNode;
  /** 底部提示/错误（12px aux） */
  hint?: React.ReactNode;
  /** 提示为错误时红色 */
  error?: boolean;
  className?: string;
  /** label 宽度（默认自动顶置） */
  labelWidth?: number;
}

export const FormRow: React.FC<FormRowProps> = ({ label, required, children, hint, error, className, labelWidth }) => (
  <label className={`block ${className || ''}`}>
    <span className="block text-sm font-medium text-slate-600 leading-5 mb-1" style={labelWidth ? { width: labelWidth } : undefined}>
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </span>
    {children}
    {hint && (
      <span className={`block mt-1 text-xs leading-4 ${error ? 'text-red-500' : 'text-slate-400'}`}>{hint}</span>
    )}
  </label>
);

// ── EmptyState：空态（14px slate-400 居中 + 可选操作） ──

export interface EmptyStateProps {
  message: React.ReactNode;
  icon?: React.ReactNode;
  /** 可选操作区（如"新建"按钮） */
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message, icon, action, className }) => (
  <div className={`flex flex-col items-center justify-center py-10 px-4 text-center ${className || ''}`}>
    {icon && <div className="mb-2 text-slate-300">{icon}</div>}
    <p className="text-sm text-slate-400 leading-5">{message}</p>
    {action && <div className="mt-3">{action}</div>}
  </div>
);

// ── AuxText：辅助文字（12px aux slate-400，语义化） ──

export interface AuxTextProps {
  children: React.ReactNode;
  /** 弱化程度：normal=slate-400，strong=slate-500 */
  tone?: 'normal' | 'strong';
  className?: string;
  title?: string;
}

export const AuxText: React.FC<AuxTextProps> = ({ children, tone = 'normal', className, title }) => (
  <span title={title} className={`text-xs leading-4 ${tone === 'strong' ? 'text-slate-500' : 'text-slate-400'} ${className || ''}`}>
    {children}
  </span>
);
