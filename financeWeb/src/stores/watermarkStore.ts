/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * watermarkStore — 水印策略配置（全局统一管理）
 *
 * 依据《水印需求.md》实现：
 *   第2节  三大触发场景：在线预览 / 下载导出 / 打印
 *   第3节  动态水印内容：姓名+工号 / 时间戳 / IP / 警示文案 / 文档状态
 *   第4节  样式与全局配置：倾斜平铺 / 颜色 / 透明度 / 字号 / 角色豁免
 *   第5节  高阶安全：防篡改（MutationObserver）/ 盲水印 / 防截屏
 *   第6节  技术边界：格式兼容 / 失败降级（安全失败）
 *
 * 配置项全为前端 mock，持久化到 localStorage（key: watermark-config-v1），
 * 对接后端后从 API 加载/保存。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createApiPersistStorage } from '../services/configStorage';

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

/** 水印布局模式 */
export type WatermarkLayout = 'tile' | 'center';
/** 时间戳格式 */
export type TimestampFormat = 'datetime' | 'date';
/** 防篡改触发后的动作 */
export type TamperAction = 'close' | 'restore';

/** 三大触发场景开关（需求第2节） */
export interface WatermarkScenes {
  /** 在线预览：前端 Canvas 渲染水印覆盖文档图层 */
  preview: boolean;
  /** 下载/导出：后端将水印烧录进文件本体 */
  download: boolean;
  /** 打印：调用带水印的预览流打印 */
  print: boolean;
}

/** 水印动态内容（需求第3节） */
export interface WatermarkContent {
  /** 身份信息 - 姓名 */
  showUserName: boolean;
  /** 身份信息 - 工号/账号 */
  showUserId: boolean;
  /** 时间戳 */
  showTimestamp: boolean;
  /** 时间戳格式：精确到秒 / 精确到天 */
  timestampFormat: TimestampFormat;
  /** 终端 IP 地址 */
  showIp: boolean;
  /** 警示文案（空串 = 不显示） */
  warningText: string;
  /** 文档状态标注（如【已作废】【归档中】） */
  showDocStatus: boolean;
  /** 自定义附加文字（空串 = 不显示） */
  customText: string;
}

/** 水印样式与布局（需求第4节） */
export interface WatermarkStyle {
  /** 布局：全屏倾斜平铺 / 居中单个 */
  layout: WatermarkLayout;
  /** 倾斜角度（-45° ~ 45°，建议 30°~45°） */
  rotation: number;
  /** 颜色（hex） */
  color: string;
  /** 透明度 0.05 ~ 0.60（建议 0.15 ~ 0.30） */
  opacity: number;
  /** 字号 px（建议 14 ~ 18） */
  fontSize: number;
  /** 平铺密度 1(稀疏) ~ 5(紧密)，仅 tile 模式 */
  density: number;
}

/** 策略豁免（需求第4节） */
export interface WatermarkExemptions {
  /** 是否启用角色豁免 */
  enabled: boolean;
  /** 豁免角色名列表（命中任一角色即免除水印） */
  roles: string[];
}

/** 高阶安全（需求第5节 + 第2.1节防篡改） */
export interface WatermarkSecurity {
  /** 防前端篡改：MutationObserver 监听水印节点 */
  antiTamper: boolean;
  /** 被篡改时动作：强制关闭预览 / 自动恢复水印 */
  tamperAction: TamperAction;
  /** 盲水印（暗水印）：频域数字水印，拍照/裁剪仍可溯源 */
  blindWatermark: boolean;
  /** 防截屏控制（移动端/桌面客户端） */
  preventScreenshot: boolean;
}

/** 下载烧录策略（需求第2.2节 + 第6节） */
export interface WatermarkDownload {
  /** 支持烧录的文件格式 */
  supportedFormats: string[];
  /** Office 文档导出时统一转换为 PDF 再烧录 */
  officeToPdf: boolean;
  /** 大文件/批量下载异步排队（防 OOM） */
  asyncQueue: boolean;
  /** 失败降级：加水印服务故障时阻断下载（安全失败原则） */
  failSecure: boolean;
}

/** 完整水印策略配置 */
export interface WatermarkConfig {
  /** 全局启用开关 */
  enabled: boolean;
  scenes: WatermarkScenes;
  content: WatermarkContent;
  style: WatermarkStyle;
  exemptions: WatermarkExemptions;
  security: WatermarkSecurity;
  download: WatermarkDownload;
}

/** 生成水印文本所需的运行时上下文 */
export interface WatermarkContext {
  /** 当前操作人姓名 */
  userName: string;
  /** 当前操作人工号/账号 */
  userId: string;
  /** 终端 IP */
  ip: string;
  /** 文档状态（如 '已作废' / '归档中'，空 = 无） */
  docStatus?: string;
  /** 当前时间（测试可注入；默认取系统时间） */
  now?: Date;
}

// ═══════════════════════════════════════════════════════════
// 常量：可选值
// ═══════════════════════════════════════════════════════════

/** 可供豁免选择的系统角色（与角色管理保持一致） */
export const EXEMPTABLE_ROLES = [
  '系统超级管理员',
  '安全管理员',
  '公司领导',
  '财务总监',
  '档案管理员',
  '外部高级审计员',
] as const;

/** 支持烧录的文件格式（需求第6节） */
export const BURN_FORMAT_OPTIONS = ['PDF', 'OFD', 'JPG', 'PNG'] as const;

/** 警示文案候选 */
export const WARNING_TEXT_PRESETS = [
  '机密档案 严禁外传',
  '仅供内部审计使用',
  '会计档案 受控查阅',
  '内部资料 注意保密',
] as const;

/** 预设主题色板 */
export const WATERMARK_COLOR_PRESETS = [
  { label: '浅灰', value: '#94A3B8' },
  { label: '中灰', value: '#64748B' },
  { label: '浅红', value: '#DC2626' },
  { label: '藏蓝', value: '#2563EB' },
  { label: '墨绿', value: '#059669' },
] as const;

// ═══════════════════════════════════════════════════════════
// 默认配置（标准会计档案策略）
// ═══════════════════════════════════════════════════════════

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  enabled: true,
  scenes: {
    preview: true,
    download: true,
    print: true,
  },
  content: {
    showUserName: true,
    showUserId: true,
    showTimestamp: true,
    timestampFormat: 'datetime',
    showIp: true,
    warningText: '机密档案 严禁外传',
    showDocStatus: false,
    customText: '',
  },
  style: {
    layout: 'tile',
    rotation: -30,
    color: '#94A3B8',
    opacity: 0.2,
    fontSize: 16,
    density: 3,
  },
  exemptions: {
    enabled: false,
    roles: [],
  },
  security: {
    antiTamper: true,
    tamperAction: 'restore',
    blindWatermark: false,
    preventScreenshot: false,
  },
  download: {
    supportedFormats: ['PDF', 'OFD', 'JPG', 'PNG'],
    officeToPdf: true,
    asyncQueue: true,
    failSecure: true,
  },
};

// ═══════════════════════════════════════════════════════════
// 预设模板
// ═══════════════════════════════════════════════════════════

export interface WatermarkPreset {
  id: string;
  name: string;
  desc: string;
  config: WatermarkConfig;
}

const deepCopy = (c: WatermarkConfig): WatermarkConfig => JSON.parse(JSON.stringify(c)) as WatermarkConfig;

export const WATERMARK_PRESETS: WatermarkPreset[] = [
  {
    id: 'standard',
    name: '标准会计档案',
    desc: '平铺溯源水印 + 防篡改，兼顾可读性与安全性（默认）',
    config: deepCopy(DEFAULT_WATERMARK_CONFIG),
  },
  {
    id: 'high-security',
    name: '高密级防护',
    desc: '高透明度密集平铺 + 盲水印 + 防截屏，适用高密级档案',
    config: {
      ...deepCopy(DEFAULT_WATERMARK_CONFIG),
      content: {
        ...deepCopy(DEFAULT_WATERMARK_CONFIG).content,
        warningText: '机密档案 严禁外传',
        showDocStatus: true,
      },
      style: {
        layout: 'tile',
        rotation: -45,
        color: '#64748B',
        opacity: 0.28,
        fontSize: 15,
        density: 4,
      },
      security: {
        antiTamper: true,
        tamperAction: 'close',
        blindWatermark: true,
        preventScreenshot: true,
      },
    },
  },
  {
    id: 'minimal',
    name: '简洁警示',
    desc: '居中单个低透明度水印，仅身份+警示，适用内部日常查阅',
    config: {
      ...deepCopy(DEFAULT_WATERMARK_CONFIG),
      content: {
        showUserName: true,
        showUserId: true,
        showTimestamp: false,
        timestampFormat: 'date',
        showIp: false,
        warningText: '仅供内部审计使用',
        showDocStatus: false,
        customText: '',
      },
      style: {
        layout: 'center',
        rotation: -30,
        color: '#94A3B8',
        opacity: 0.12,
        fontSize: 22,
        density: 3,
      },
      security: {
        antiTamper: true,
        tamperAction: 'restore',
        blindWatermark: false,
        preventScreenshot: false,
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 格式化时间戳 */
export function formatTimestamp(now: Date, format: TimestampFormat): string {
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  if (format === 'date') return date;
  return `${date} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}

/**
 * 组装水印文本行（需求第3节：动态变量绑定上下文）
 * 返回 1~3 行文本。
 */
export function buildWatermarkLines(config: WatermarkConfig, ctx: WatermarkContext): string[] {
  const { content } = config;
  const lines: string[] = [];

  // 第1行：警示文案
  if (content.warningText.trim()) {
    lines.push(content.warningText.trim());
  }

  // 第2行：身份信息（姓名+工号）
  const identity: string[] = [];
  if (content.showUserName && ctx.userName) identity.push(ctx.userName);
  if (content.showUserId && ctx.userId) identity.push(`(${ctx.userId})`);
  if (identity.length > 0) lines.push(identity.join(''));

  // 第3行：时间戳 + IP
  const trace: string[] = [];
  if (content.showTimestamp) trace.push(formatTimestamp(ctx.now ?? new Date(), content.timestampFormat));
  if (content.showIp && ctx.ip) trace.push(`IP: ${ctx.ip}`);
  if (trace.length > 0) lines.push(trace.join('  '));

  // 附加：文档状态 / 自定义文字
  if (content.showDocStatus && ctx.docStatus) lines.push(`【${ctx.docStatus}】`);
  if (content.customText.trim()) lines.push(content.customText.trim());

  // 兜底：全部关闭时至少显示一行通用警示
  if (lines.length === 0) lines.push('电子会计档案');

  return lines;
}

/**
 * 判断用户是否被豁免水印（需求第4节：策略豁免）
 * @param userRoleNames 当前用户拥有的角色名列表
 */
export function isWatermarkExempt(config: WatermarkConfig, userRoleNames: string[]): boolean {
  if (!config.exemptions.enabled) return false;
  return userRoleNames.some((r) => config.exemptions.roles.includes(r));
}

/**
 * 判断某场景下是否应渲染水印
 */
export function shouldApplyWatermark(
  config: WatermarkConfig,
  scene: keyof WatermarkScenes,
  userRoleNames: string[] = [],
): boolean {
  if (!config.enabled) return false;
  if (!config.scenes[scene]) return false;
  if (isWatermarkExempt(config, userRoleNames)) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════

interface WatermarkState {
  config: WatermarkConfig;

  /** 整体替换配置（应用预设） */
  setConfig: (config: WatermarkConfig) => void;
  /** 按分组局部更新 */
  updateScenes: (patch: Partial<WatermarkScenes>) => void;
  updateContent: (patch: Partial<WatermarkContent>) => void;
  updateStyle: (patch: Partial<WatermarkStyle>) => void;
  updateExemptions: (patch: Partial<WatermarkExemptions>) => void;
  updateSecurity: (patch: Partial<WatermarkSecurity>) => void;
  updateDownload: (patch: Partial<WatermarkDownload>) => void;
  /** 切换全局开关 */
  setEnabled: (enabled: boolean) => void;
  /** 应用预设模板 */
  applyPreset: (presetId: string) => void;
  /** 恢复默认配置 */
  resetToDefault: () => void;
}

const STORAGE_KEY = 'watermark-config-v1';

export const useWatermarkStore = create<WatermarkState>()(
  persist(
    (set) => ({
      config: deepCopy(DEFAULT_WATERMARK_CONFIG),

      setConfig: (config) => set({ config }),

      updateScenes: (patch) =>
        set((s) => ({ config: { ...s.config, scenes: { ...s.config.scenes, ...patch } } })),

      updateContent: (patch) =>
        set((s) => ({ config: { ...s.config, content: { ...s.config.content, ...patch } } })),

      updateStyle: (patch) =>
        set((s) => ({ config: { ...s.config, style: { ...s.config.style, ...patch } } })),

      updateExemptions: (patch) =>
        set((s) => ({ config: { ...s.config, exemptions: { ...s.config.exemptions, ...patch } } })),

      updateSecurity: (patch) =>
        set((s) => ({ config: { ...s.config, security: { ...s.config.security, ...patch } } })),

      updateDownload: (patch) =>
        set((s) => ({ config: { ...s.config, download: { ...s.config.download, ...patch } } })),

      setEnabled: (enabled) => set((s) => ({ config: { ...s.config, enabled } })),

      applyPreset: (presetId) => {
        const preset = WATERMARK_PRESETS.find((p) => p.id === presetId);
        if (preset) set({ config: deepCopy(preset.config) });
      },

      resetToDefault: () => set({ config: deepCopy(DEFAULT_WATERMARK_CONFIG) }),
    }),
    {
      name: STORAGE_KEY,
      storage: createApiPersistStorage(),
      version: 1,
    },
  ),
);
