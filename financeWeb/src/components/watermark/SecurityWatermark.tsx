/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * SecurityWatermark — 业务级安全水印（配置驱动）
 *
 * 从 watermarkStore 读取全局策略，自动完成：
 *   1. 场景判断（preview/download/print）+ 全局开关 + 角色豁免
 *   2. 动态内容组装（姓名+工号 / 时间戳 / IP / 警示文案 / 文档状态）
 *   3. 防篡改策略落地（MutationObserver + 强制关闭预览回调）
 *
 * 用法：在文档预览容器（relative 定位）内放置 <SecurityWatermark scene="preview" />。
 */

import React, { useMemo } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { ROLE_LABELS } from '../../types/user';
import {
  useWatermarkStore,
  buildWatermarkLines,
  shouldApplyWatermark,
  type WatermarkScenes,
} from '../../stores/watermarkStore';
import { WatermarkLayer } from './WatermarkLayer';

// ─── Mock 运行时环境（对接后端后由 API 提供） ──────────────

/** 当前终端 IP（mock，浏览器侧无法直接获取，由后端下发） */
const MOCK_IP = '192.168.1.100';

// ─── 类型 ────────────────────────────────────────────────

export interface SecurityWatermarkProps {
  /** 触发场景（需求第2节） */
  scene: keyof WatermarkScenes;
  /** 文档状态标注（如 '已作废' / '归档中'） */
  docStatus?: string;
  /** 当前用户角色列表（覆盖 mock，用于豁免判定） */
  userRoles?: string[];
  /** 强制关闭预览回调（tamperAction='close' 时触发） */
  onForceClose?: () => void;
  /** 时间戳刷新间隔（秒）。0 = 仅在挂载时取一次（默认） */
  refreshIntervalSec?: number;
  /** 覆盖层 z-index */
  zIndex?: number;
}

// ─── 组件 ────────────────────────────────────────────────

export const SecurityWatermark: React.FC<SecurityWatermarkProps> = ({
  scene,
  docStatus,
  userRoles,
  onForceClose,
  refreshIntervalSec = 0,
  zIndex = 50,
}) => {
  const config = useWatermarkStore((s) => s.config);
  const currentUser = useAuthStore((s) => s.currentUser);
  const loggedUser = useAuthStore((s) => s.loggedUser);

  // 时间戳：默认挂载时刻取一次；配置刷新间隔则周期性更新
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    if (!refreshIntervalSec) return;
    const timer = window.setInterval(() => setNow(new Date()), refreshIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [refreshIntervalSec]);

  // 角色：优先 prop 覆盖，否则取当前登录用户的角色中文名（豁免判定用）
  const roles = userRoles ?? (currentUser?.roles.map((r) => ROLE_LABELS[r]) ?? []);

  // 场景 + 全局开关 + 豁免判定
  const visible = shouldApplyWatermark(config, scene, roles);

  // 组装水印文本行（需求第3节动态变量）
  const lines = useMemo(() => {
    if (!visible) return [];
    return buildWatermarkLines(config, {
      userName: loggedUser || currentUser?.name || 'admin',
      userId: currentUser?.empNo || '000000',
      ip: MOCK_IP,
      docStatus,
      now,
    });
  }, [config, visible, loggedUser, currentUser, docStatus, now]);

  if (!visible) return null;

  // tamperAction='close' 时强制关闭预览（需求第2.1节）；'restore' 由 WatermarkLayer 内部处理
  const handleTamper = () => {
    if (config.security.tamperAction === 'close') {
      onForceClose?.();
    }
  };

  return (
    <WatermarkLayer
      lines={lines}
      style={config.style}
      antiTamper={config.security.antiTamper}
      tamperAction={config.security.tamperAction}
      onTamper={handleTamper}
      zIndex={zIndex}
    />
  );
};

export default SecurityWatermark;
