/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * WatermarkLayer — 运行时水印渲染层（需求第2.1节）
 *
 * 实现逻辑：
 *   通过 Canvas 离屏生成带透明度的水印平铺单元（tile），
 *   转为 dataURL 后作为覆盖层的背景图平铺/居中覆盖在文档图层之上，
 *   保证预览性能（单次绘制，GPU 友好的背景平铺）。
 *
 * 防前端篡改（需求第2.1节安全防护）：
 *   MutationObserver 监听水印宿主容器，水印节点被删除或样式被篡改时：
 *     - tamperAction = 'restore' → 自动重建水印节点并记录安全日志
 *     - tamperAction = 'close'   → 触发 onTamper 回调（宿主强制关闭预览）并记录安全日志
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { WatermarkStyle } from '../../stores/watermarkStore';

// ─── 类型 ────────────────────────────────────────────────

export interface WatermarkLayerProps {
  /** 水印文本行（1~N 行） */
  lines: string[];
  /** 样式配置 */
  style: WatermarkStyle;
  /** 启用 MutationObserver 防篡改 */
  antiTamper?: boolean;
  /** 篡改动作：restore=自动重建 / close=回调宿主关闭预览 */
  tamperAction?: 'restore' | 'close';
  /** 篡改回调（安全日志 + close 动作） */
  onTamper?: (detail: TamperEventDetail) => void;
  /** 覆盖层 z-index */
  zIndex?: number;
}

export interface TamperEventDetail {
  /** 篡改类型：节点被移除 / 属性被修改 */
  kind: 'removed' | 'mutated';
  /** 发生时间（ISO） */
  time: string;
}

// ─── 安全日志（mock：将来对接安全审计 API / AuditLogsPanel） ──

export function logWatermarkSecurityEvent(action: string, details: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[水印安全日志] ${action} — ${details}`);
  // 广播给全局监听者（如审计面板），对接后端时替换为 API 上报
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('watermark-security', { detail: { action, details, time: new Date().toISOString() } }),
    );
  }
}

// ─── Canvas 平铺单元生成 ──────────────────────────────────

/** 密度 1(稀疏) ~ 5(紧密) → 间距系数 */
const DENSITY_GAP: Record<number, number> = { 1: 2.6, 2: 2.1, 3: 1.7, 4: 1.35, 5: 1.05 };

interface TileResult {
  dataUrl: string;
  /** CSS 背景尺寸（px） */
  width: number;
  height: number;
  /** 是否为平铺模式 */
  repeat: boolean;
}

function renderWatermarkTile(lines: string[], style: WatermarkStyle): TileResult | null {
  if (typeof document === 'undefined') return null;
  try {
    const fontFamily = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif';
    const font = `${style.fontSize}px ${fontFamily}`;
    const lineHeight = Math.round(style.fontSize * 1.7);

    // 测量最长行宽
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) return null;
    measureCtx.font = font;
    const maxTextWidth = Math.max(...lines.map((l) => measureCtx.measureText(l).width), 10);

    const isTile = style.layout === 'tile';
    const gap = DENSITY_GAP[Math.min(5, Math.max(1, style.density))] ?? 1.7;

    // 单元尺寸：平铺模式按密度留间距；居中模式紧贴文本
    const padX = isTile ? style.fontSize * 5 * gap : style.fontSize * 2.5;
    const padY = isTile ? style.fontSize * 3.2 * gap : style.fontSize * 2;
    const cssWidth = Math.ceil(maxTextWidth + padX);
    const cssHeight = Math.ceil(lines.length * lineHeight + padY);

    // 2x 高清渲染
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = cssWidth * scale;
    canvas.height = cssHeight * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(scale, scale);
    ctx.translate(cssWidth / 2, cssHeight / 2);
    ctx.rotate((style.rotation * Math.PI) / 180);
    ctx.globalAlpha = style.opacity;
    ctx.fillStyle = style.color;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const blockHeight = (lines.length - 1) * lineHeight;
    lines.forEach((line, i) => {
      ctx.fillText(line, 0, i * lineHeight - blockHeight / 2);
    });

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: cssWidth,
      height: cssHeight,
      repeat: isTile,
    };
  } catch {
    return null; // 测试环境等无 canvas 场景降级
  }
}

// ─── 组件 ────────────────────────────────────────────────

export const WatermarkLayer: React.FC<WatermarkLayerProps> = ({
  lines,
  style,
  antiTamper = false,
  tamperAction = 'restore',
  onTamper,
  zIndex = 50,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [renderKey, setRenderKey] = useState(0);

  const tile = useMemo(() => renderWatermarkTile(lines, style), [lines, style]);

  // 用 ref 持有最新回调与动作，避免每次渲染都重建 MutationObserver
  const onTamperRef = useRef(onTamper);
  onTamperRef.current = onTamper;
  const tamperActionRef = useRef(tamperAction);
  tamperActionRef.current = tamperAction;

  // ── 防篡改：MutationObserver 监听宿主容器的子树变化 ──
  useEffect(() => {
    if (!antiTamper) return;
    const host = hostRef.current;
    const parent = host?.parentElement;
    if (!host || !parent) return;

    const handleTamper = (kind: TamperEventDetail['kind']) => {
      const detail: TamperEventDetail = { kind, time: new Date().toISOString() };
      logWatermarkSecurityEvent(
        '检测到水印被篡改',
        kind === 'removed'
          ? '水印节点被从 DOM 中移除，已按策略处置'
          : '水印节点样式属性被非法修改，已按策略处置',
      );
      onTamperRef.current?.(detail);
      if (tamperActionRef.current === 'restore') {
        // 强制 React 重新创建水印节点
        setRenderKey((k) => k + 1);
      }
    };

    const observer = new MutationObserver((mutations) => {
      // 1) 水印节点被移除
      if (!parent.contains(host)) {
        handleTamper('removed');
        return;
      }
      // 2) 水印节点自身属性被修改（如 style/class 被改）
      for (const m of mutations) {
        if (m.type === 'attributes' && m.target === host) {
          handleTamper('mutated');
          return;
        }
      }
    });

    observer.observe(parent, { childList: true, subtree: false });
    observer.observe(host, { attributes: true, attributeFilter: ['style', 'class'] });

    return () => observer.disconnect();
    // renderKey 变化后重新挂载 observer（节点已重建）
  }, [antiTamper, renderKey]);

  const backgroundImage = tile ? `url(${tile.dataUrl})` : undefined;

  return (
    <div
      key={renderKey}
      ref={hostRef}
      aria-hidden="true"
      data-watermark-layer="true"
      className="absolute inset-0 pointer-events-none select-none overflow-hidden"
      style={{
        zIndex,
        backgroundImage,
        backgroundRepeat: tile?.repeat ? 'repeat' : 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: tile ? `${tile.width}px ${tile.height}px` : undefined,
      }}
    >
      {/* canvas 不可用时的降级：纯 CSS 文本水印（测试环境） */}
      {!tile && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: `rotate(${style.rotation}deg)` }}
        >
          <div
            className="text-center leading-relaxed font-medium whitespace-pre-line"
            style={{ color: style.color, opacity: style.opacity, fontSize: style.fontSize }}
          >
            {lines.join('\n')}
          </div>
        </div>
      )}
    </div>
  );
};

export default WatermarkLayer;
