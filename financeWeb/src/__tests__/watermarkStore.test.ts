/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * watermarkStore 单元测试
 *
 * 覆盖：默认配置 / 局部更新 / 预设模板 / 角色豁免 / 场景判定 / 水印文本组装
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useWatermarkStore,
  buildWatermarkLines,
  isWatermarkExempt,
  shouldApplyWatermark,
  formatTimestamp,
  DEFAULT_WATERMARK_CONFIG,
  WATERMARK_PRESETS,
  type WatermarkConfig,
} from '../stores/watermarkStore';

const deepCopy = (c: WatermarkConfig): WatermarkConfig =>
  JSON.parse(JSON.stringify(c)) as WatermarkConfig;

beforeEach(() => {
  useWatermarkStore.getState().resetToDefault();
});

describe('watermarkStore — 默认配置', () => {
  it('默认全局启用，三大场景全开', () => {
    const { config } = useWatermarkStore.getState();
    expect(config.enabled).toBe(true);
    expect(config.scenes.preview).toBe(true);
    expect(config.scenes.download).toBe(true);
    expect(config.scenes.print).toBe(true);
  });

  it('默认样式符合需求建议区间（倾斜平铺 / 透明度15-30% / 字号14-18px）', () => {
    const { style } = useWatermarkStore.getState().config;
    expect(style.layout).toBe('tile');
    expect(Math.abs(style.rotation)).toBeGreaterThanOrEqual(30);
    expect(Math.abs(style.rotation)).toBeLessThanOrEqual(45);
    expect(style.opacity).toBeGreaterThanOrEqual(0.15);
    expect(style.opacity).toBeLessThanOrEqual(0.3);
    expect(style.fontSize).toBeGreaterThanOrEqual(14);
    expect(style.fontSize).toBeLessThanOrEqual(18);
  });

  it('默认开启防篡改、失败降级（安全失败）', () => {
    const { config } = useWatermarkStore.getState();
    expect(config.security.antiTamper).toBe(true);
    expect(config.download.failSecure).toBe(true);
    expect(config.download.supportedFormats).toEqual(['PDF', 'OFD', 'JPG', 'PNG']);
  });
});

describe('watermarkStore — 局部更新', () => {
  it('updateStyle 仅更新样式分组，其他分组不受影响', () => {
    const before = useWatermarkStore.getState().config;
    useWatermarkStore.getState().updateStyle({ rotation: -45, opacity: 0.3 });
    const after = useWatermarkStore.getState().config;
    expect(after.style.rotation).toBe(-45);
    expect(after.style.opacity).toBe(0.3);
    expect(after.content).toEqual(before.content);
    expect(after.security).toEqual(before.security);
  });

  it('updateScenes 可单独关闭某场景', () => {
    useWatermarkStore.getState().updateScenes({ download: false });
    const { scenes } = useWatermarkStore.getState().config;
    expect(scenes.download).toBe(false);
    expect(scenes.preview).toBe(true);
    expect(scenes.print).toBe(true);
  });

  it('updateExemptions 更新豁免角色列表', () => {
    useWatermarkStore.getState().updateExemptions({ enabled: true, roles: ['系统超级管理员'] });
    const { exemptions } = useWatermarkStore.getState().config;
    expect(exemptions.enabled).toBe(true);
    expect(exemptions.roles).toContain('系统超级管理员');
  });
});

describe('watermarkStore — 预设模板', () => {
  it('提供标准 / 高密级 / 简洁三套预设', () => {
    const ids = WATERMARK_PRESETS.map((p) => p.id);
    expect(ids).toEqual(['standard', 'high-security', 'minimal']);
  });

  it('应用高密级预设后启用盲水印与防截屏，篡改动作为强制关闭', () => {
    useWatermarkStore.getState().applyPreset('high-security');
    const { config } = useWatermarkStore.getState();
    expect(config.security.blindWatermark).toBe(true);
    expect(config.security.preventScreenshot).toBe(true);
    expect(config.security.tamperAction).toBe('close');
  });

  it('应用简洁预设后为居中布局', () => {
    useWatermarkStore.getState().applyPreset('minimal');
    expect(useWatermarkStore.getState().config.style.layout).toBe('center');
  });

  it('resetToDefault 恢复出厂配置', () => {
    useWatermarkStore.getState().applyPreset('high-security');
    useWatermarkStore.getState().resetToDefault();
    expect(useWatermarkStore.getState().config).toEqual(DEFAULT_WATERMARK_CONFIG);
  });
});

describe('watermarkStore — 角色豁免（需求第4节）', () => {
  it('豁免开关关闭时一律不豁免', () => {
    const config = deepCopy(DEFAULT_WATERMARK_CONFIG);
    config.exemptions.enabled = false;
    config.exemptions.roles = ['系统超级管理员'];
    expect(isWatermarkExempt(config, ['系统超级管理员'])).toBe(false);
  });

  it('命中豁免角色列表时豁免', () => {
    const config = deepCopy(DEFAULT_WATERMARK_CONFIG);
    config.exemptions.enabled = true;
    config.exemptions.roles = ['系统超级管理员', '外部高级审计员'];
    expect(isWatermarkExempt(config, ['外部高级审计员'])).toBe(true);
    expect(isWatermarkExempt(config, ['档案管理员'])).toBe(false);
  });

  it('用户多角色命中其一即豁免', () => {
    const config = deepCopy(DEFAULT_WATERMARK_CONFIG);
    config.exemptions.enabled = true;
    config.exemptions.roles = ['公司领导'];
    expect(isWatermarkExempt(config, ['查阅人员', '公司领导'])).toBe(true);
  });
});

describe('watermarkStore — 场景判定 shouldApplyWatermark', () => {
  it('全局停用则所有场景均不加水印', () => {
    const config = deepCopy(DEFAULT_WATERMARK_CONFIG);
    config.enabled = false;
    expect(shouldApplyWatermark(config, 'preview')).toBe(false);
    expect(shouldApplyWatermark(config, 'download')).toBe(false);
    expect(shouldApplyWatermark(config, 'print')).toBe(false);
  });

  it('单场景关闭时仅该场景不加', () => {
    const config = deepCopy(DEFAULT_WATERMARK_CONFIG);
    config.scenes.print = false;
    expect(shouldApplyWatermark(config, 'preview')).toBe(true);
    expect(shouldApplyWatermark(config, 'print')).toBe(false);
  });

  it('豁免用户在启用场景下也不加水印', () => {
    const config = deepCopy(DEFAULT_WATERMARK_CONFIG);
    config.exemptions.enabled = true;
    config.exemptions.roles = ['系统超级管理员'];
    expect(shouldApplyWatermark(config, 'preview', ['系统超级管理员'])).toBe(false);
    expect(shouldApplyWatermark(config, 'preview', ['档案管理员'])).toBe(true);
  });
});

describe('水印文本组装 buildWatermarkLines（需求第3节）', () => {
  const ctx = {
    userName: '张三',
    userId: '004521',
    ip: '192.168.1.100',
    now: new Date(2026, 6, 18, 10, 30, 15),
  };

  it('默认配置生成警示文案 + 身份 + 时间/IP 三行', () => {
    const lines = buildWatermarkLines(DEFAULT_WATERMARK_CONFIG, ctx);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('机密档案 严禁外传');
    expect(lines[1]).toBe('张三(004521)');
    expect(lines[2]).toContain('2026-07-18 10:30:15');
    expect(lines[2]).toContain('IP: 192.168.1.100');
  });

  it('时间戳精确到秒 / 到天格式正确', () => {
    expect(formatTimestamp(ctx.now, 'datetime')).toBe('2026-07-18 10:30:15');
    expect(formatTimestamp(ctx.now, 'date')).toBe('2026-07-18');
  });

  it('工号与姓名拼接为 张三(004521) 形式', () => {
    const lines = buildWatermarkLines(DEFAULT_WATERMARK_CONFIG, ctx);
    expect(lines[1]).toMatch(/^张三\(004521\)$/);
  });

  it('文档状态开启时追加【已作废】行', () => {
    const config = deepCopy(DEFAULT_WATERMARK_CONFIG);
    config.content.showDocStatus = true;
    const lines = buildWatermarkLines(config, { ...ctx, docStatus: '已作废' });
    expect(lines).toContain('【已作废】');
  });

  it('自定义文字追加到末尾', () => {
    const config = deepCopy(DEFAULT_WATERMARK_CONFIG);
    config.content.customText = '华北集团总部有限公司';
    const lines = buildWatermarkLines(config, ctx);
    expect(lines[lines.length - 1]).toBe('华北集团总部有限公司');
  });

  it('关闭所有变量时兜底显示通用文案（不为空）', () => {
    const config = deepCopy(DEFAULT_WATERMARK_CONFIG);
    config.content.showUserName = false;
    config.content.showUserId = false;
    config.content.showTimestamp = false;
    config.content.showIp = false;
    config.content.warningText = '';
    config.content.customText = '';
    const lines = buildWatermarkLines(config, ctx);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('警示文案留空时不产生空行', () => {
    const config = deepCopy(DEFAULT_WATERMARK_CONFIG);
    config.content.warningText = '   ';
    const lines = buildWatermarkLines(config, ctx);
    expect(lines[0]).toBe('张三(004521)');
  });
});
