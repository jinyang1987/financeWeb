/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * DatasourceConfigPage — 系统管理 → 连接配置 → 数据源连接（2026-08-09 建，2026-08-16 并入连接配置页）
 *
 * 统一管理「抓取/推送」接入的业务系统连接配置：
 *   用友BIP、金蝶云·星空、电子发票平台、银行流水、报销审批系统等。
 *
 * 设计要点：
 *   - 仅 档案管理员/档案主管/admin 可编辑（服务端 403 兜底，前端隐藏编辑按钮）
 *   - secret 回显恒为 ********，留空保存 = 保持原值
 *   - 每个源支持 direction（抓取/推送/双向）与 enabled 开关
 *   - ★ 每个抓取源支持「抓取计划」（启用/cron）与「默认去向」
 *     （直接入库·自动组卷 / 送组卷工作台 / 送核对工作台 / 送审核），
 *     抓取收集中台只做纯执行，所有配置收敛在这里
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Database, Plus, Pencil, Trash2, Wifi, WifiOff, Loader2,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, ShieldCheck,
} from 'lucide-react';
import {
  datasourceService, DATASOURCE_TYPE_LABELS, DIRECTION_LABELS,
  type DatasourceView,
} from '../../services/datasourceService';
import { useAppStore } from '../../stores/appStore';
import { useAuthStore } from '../../stores/authStore';

// ─── 去向标签 ───

const DEST_LABELS: Record<string, string> = {
  'auto-archive': '直接入库·自动组卷',
  'to-volume': '送组卷工作台',
  'to-check': '送核对工作台·待核对',
  'to-review': '送核对工作台·待审核',
};

// ─── 数据源模板 ───

const SOURCE_TEMPLATES: { type: string; label: string; fields: { key: string; label: string; secret?: boolean }[] }[] = [
  {
    type: 'yonyou',
    label: '用友 BIP',
    fields: [
      { key: 'gateway', label: '网关 Base URL' },
      { key: 'appKey', label: '应用 appKey' },
      { key: 'appSecret', label: '应用 appSecret', secret: true },
      { key: 'tenantId', label: '租户 tenantId' },
      { key: 'accbookCode', label: '账簿编码 accbookCode' },
      { key: 'fondsCode', label: '归档目标全宗' },
    ],
  },
  {
    type: 'kingdee',
    label: '金蝶云·星空',
    fields: [
      { key: 'gateway', label: '网关地址' },
      { key: 'appId', label: '应用 appId' },
      { key: 'appSecret', label: '应用 appSecret', secret: true },
      { key: 'tenantId', label: '租户/数据中心' },
      { key: 'acctId', label: '账簿编码 acctId' },
      { key: 'fondsCode', label: '归档目标全宗' },
    ],
  },
  {
    type: 'invoice',
    label: '电子发票平台',
    fields: [
      { key: 'gateway', label: '平台地址' },
      { key: 'appKey', label: '接入 appKey' },
      { key: 'appSecret', label: '接入 appSecret', secret: true },
      { key: 'fondsCode', label: '归档目标全宗' },
    ],
  },
  {
    type: 'bank',
    label: '银行流水接口',
    fields: [
      { key: 'gateway', label: '接口地址' },
      { key: 'appKey', label: '商户号 appKey' },
      { key: 'appSecret', label: '接口 appSecret', secret: true },
      { key: 'fondsCode', label: '归档目标全宗' },
    ],
  },
  {
    type: 'reimburse',
    label: '报销审批系统',
    fields: [
      { key: 'gateway', label: '系统地址' },
      { key: 'appKey', label: '接入 appKey' },
      { key: 'appSecret', label: '接入 appSecret', secret: true },
      { key: 'fondsCode', label: '归档目标全宗' },
    ],
  },
  {
    type: 'other',
    label: '其他业务系统',
    fields: [
      { key: 'gateway', label: '系统地址' },
      { key: 'appKey', label: '接入 appKey' },
      { key: 'appSecret', label: '接入 appSecret', secret: true },
      { key: 'fondsCode', label: '归档目标全宗' },
    ],
  },
];

// ─── 编辑抽屉 ───

const EditDrawer: React.FC<{
  open: boolean;
  source: DatasourceView | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, source, onClose, onSaved }) => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [form, setForm] = useState({
    name: '', type: 'other', direction: 'pull' as 'pull' | 'push' | 'both',
    enabled: true, config: {} as Record<string, string>,
    scheduleEnabled: false, scheduleCron: '0 30 2 1 * *',
    defaultDestination: 'to-volume',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (source) {
      setForm({
        name: source.name,
        type: source.type,
        direction: source.direction,
        enabled: source.enabled,
        config: { ...source.config },
        scheduleEnabled: source.config.scheduleEnabled === 'true',
        scheduleCron: source.config.scheduleCron || '0 30 2 1 * *',
        defaultDestination: source.config.defaultDestination || 'to-volume',
      });
    } else {
      setForm({
        name: '', type: 'other', direction: 'pull', enabled: true, config: {},
        scheduleEnabled: false, scheduleCron: '0 30 2 1 * *', defaultDestination: 'to-volume',
      });
    }
  }, [open, source]);

  if (!open) return null;

  const template = SOURCE_TEMPLATES.find((t) => t.type === form.type) || SOURCE_TEMPLATES[SOURCE_TEMPLATES.length - 1];

  const setField = (key: string, val: string) =>
    setForm((f) => ({ ...f, config: { ...f.config, [key]: val } }));

  const handleTypeChange = (type: string) => {
    // 切换类型时重置 config（保留公共字段 fondsCode）
    const fonds = form.config.fondsCode;
    setForm((f) => ({ ...f, type, config: fonds ? { fondsCode: fonds } : {} }));
  };

  const save = async () => {
    if (!form.name.trim()) { triggerToast('数据源名称不能为空', 'warning'); return; }
    setSaving(true);
    try {
      // 抓取计划与默认去向一并存入 config（后端按源持久化）
      const config = {
        ...form.config,
        scheduleEnabled: String(form.scheduleEnabled),
        scheduleCron: form.scheduleCron,
        defaultDestination: form.defaultDestination,
      };
      await datasourceService.save(source?.id || form.type, {
        name: form.name.trim(),
        type: form.type,
        direction: form.direction,
        enabled: form.enabled,
        config,
      });
      triggerToast(source ? '数据源已更新' : '数据源已创建', 'success');
      onSaved();
      onClose();
    } catch (e) {
      triggerToast('保存失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-[440px] h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Database className="w-4 h-4 text-sky-600" />
            {source ? `编辑数据源 · ${source.name}` : '新增数据源'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">数据源类型</span>
            <select
              value={form.type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {SOURCE_TEMPLATES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">数据源名称</span>
            <input
              type="text" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={`如 ${template.label}（生产）`}
              className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">接入方向</span>
              <select
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value as 'pull' | 'push' | 'both' })}
                className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="pull">抓取（Pull）</option>
                <option value="push">推送（Push）</option>
                <option value="both">双向</option>
              </select>
            </label>
            <label className="flex items-end pb-1.5 gap-2 cursor-pointer">
              <input
                type="checkbox" checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="rounded border-slate-300"
              />
              <span className="text-xs text-slate-600">启用</span>
            </label>
          </div>

          {/* 抓取计划 + 默认去向 */}
          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs font-semibold text-slate-500 mb-2">抓取计划与默认去向</div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" checked={form.scheduleEnabled}
                  onChange={(e) => setForm({ ...form, scheduleEnabled: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <span className="text-xs text-slate-600">启用定时自动抓取（按 cron 计划自动同步并归档）</span>
              </label>
              {form.scheduleEnabled && (
                <label className="block">
                  <span className="text-xs text-slate-500">执行计划（cron）</span>
                  <select
                    value={['0 30 2 1 * *', '0 30 2 5 * *', '0 30 2 * * *'].includes(form.scheduleCron) ? form.scheduleCron : 'custom'}
                    onChange={(e) => {
                      if (e.target.value === 'custom') return;
                      setForm({ ...form, scheduleCron: e.target.value });
                    }}
                    className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="0 30 2 1 * *">每月 1 日 02:30（同步上月）</option>
                    <option value="0 30 2 5 * *">每月 5 日 02:30（同步上月）</option>
                    <option value="0 30 2 * * *">每日 02:30（同步上月，幂等去重）</option>
                    <option value="custom">自定义…</option>
                  </select>
                  <input
                    type="text" value={form.scheduleCron}
                    onChange={(e) => setForm({ ...form, scheduleCron: e.target.value })}
                    placeholder="cron 表达式，如 0 30 2 1 * *"
                    className="mt-1.5 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
              )}
              <label className="block">
                <span className="text-xs text-slate-500">默认去向（抓取/推送的数据默认流向，执行时可覆盖）</span>
                <select
                  value={form.defaultDestination}
                  onChange={(e) => setForm({ ...form, defaultDestination: e.target.value })}
                  className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="auto-archive">直接入库 · 自动组卷归档</option>
                  <option value="to-volume">送组卷工作台（人工组卷）</option>
                  <option value="to-check">送核对工作台 · 待核对（先核对再组卷）</option>
                  <option value="to-review">送核对工作台 · 待审核（人工审核后组卷）</option>
                </select>
              </label>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs font-semibold text-slate-500 mb-2">{template.label} 连接参数</div>
            <div className="space-y-3">
              {template.fields.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-xs text-slate-500">{f.label}</span>
                  <input
                    type={f.secret ? 'password' : 'text'}
                    value={form.config[f.key] || ''}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={f.secret ? '留空或保持 ******** 表示不修改' : ''}
                    className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200">
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">取消</button>
          <button
            type="button" onClick={save} disabled={saving}
            className="px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 inline animate-spin" /> : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── 主页面 ───

const DatasourceConfigPage: React.FC = () => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const currentUser = useAuthStore((s) => s.currentUser);
  const [sources, setSources] = useState<DatasourceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [editSource, setEditSource] = useState<DatasourceView | null | undefined>(undefined); // undefined=closed
  const [creating, setCreating] = useState(false);

  const canManage = currentUser?.roles?.some((r) =>
    ['admin', 'archive_director', 'archivist'].includes(r)) ?? false;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await datasourceService.list();
      setSources(list);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : '加载失败');
      if ((e as { status?: number }).status === 403) setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定删除该数据源配置？')) return;
    try {
      await datasourceService.remove(id);
      triggerToast('数据源已删除', 'success');
      refresh();
    } catch (e) {
      triggerToast('删除失败：' + (e instanceof Error ? e.message : ''), 'warning');
    }
  };

  const directionIcon = (d: string) => {
    if (d === 'push') return <ArrowUpFromLine className="w-3.5 h-3.5 text-sky-500" />;
    if (d === 'both') return <ArrowLeftRight className="w-3.5 h-3.5 text-violet-500" />;
    return <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-500" />;
  };

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200">
        <Database className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">数据源配置</h1>
        <span className="text-xs text-slate-400">抓取/推送接入的业务系统连接统一管理（仅档案管理员/主管/系统管理员）</span>
        <div className="flex-1" />
        {canManage && (
          <button
            type="button" onClick={() => { setCreating(true); setEditSource(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700"
          >
            <Plus className="w-4 h-4" />
            新增数据源
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loadErr && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-xl">{loadErr}</div>
        )}

        {/* 权限提示 */}
        {!canManage && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5 rounded-xl">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            当前账号无数据源配置权限（仅档案管理员/档案主管/系统管理员可管理）。如需配置请联系管理员。
          </div>
        )}

        {/* 卡片列表 */}
        <div className="grid grid-cols-2 gap-4">
          {sources.length === 0 && !loading && (
            <div className="col-span-2 flex flex-col items-center justify-center py-16 text-slate-400 border border-dashed border-slate-300 rounded-xl bg-white">
              <Database className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-sm">暂无数据源配置</p>
              <p className="text-xs mt-1">点击右上角「新增数据源」创建，例如用友 BIP / 金蝶云·星空</p>
            </div>
          )}
          {sources.map((s) => (
            <div key={s.id} className={`bg-white border rounded-xl p-4 ${s.enabled ? 'border-slate-200' : 'border-slate-100 opacity-70'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.enabled ? 'bg-sky-50 text-sky-600' : 'bg-slate-50 text-slate-400'}`}>
                    <Database className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      {s.name}
                      {s.enabled
                        ? <Wifi className="w-3.5 h-3.5 text-green-500" />
                        : <WifiOff className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                      {directionIcon(s.direction)}
                      {DIRECTION_LABELS[s.direction] || s.direction}
                      <span className="text-slate-300">·</span>
                      {DATASOURCE_TYPE_LABELS[s.type] || s.type}
                      <span className="text-slate-300">·</span>
                      <span className="font-mono">{s.id}</span>
                    </div>
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button" onClick={() => { setCreating(false); setEditSource(s); }}
                      className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-md"
                      title="编辑"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button" onClick={() => handleDelete(s.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {/* 去向与抓取计划 */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                  默认去向：{DEST_LABELS[s.config.defaultDestination] || '送组卷工作台'}
                </span>
                {s.config.scheduleEnabled === 'true' ? (
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200" title={s.config.scheduleCron}>
                    定时抓取：{s.config.scheduleCron || 'cron 未设置'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[11px] rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                    定时抓取：未启用
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
                {Object.entries(s.config)
                  .filter(([k]) => !['appSecret', 'scheduleEnabled', 'scheduleCron', 'defaultDestination'].includes(k))
                  .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5 min-w-0">
                    <span className="text-slate-400 shrink-0">{k}:</span>
                    <span className="font-mono truncate" title={v}>{v || '—'}</span>
                  </div>
                ))}
                {s.config.appSecret && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 shrink-0">appSecret:</span>
                    <span className="font-mono">********</span>
                  </div>
                )}
              </div>
              {s.updatedAt && (
                <div className="mt-2 text-[11px] text-slate-400">
                  更新于 {s.updatedAt?.replace('T', ' ').slice(0, 19)} {s.updatedBy ? `· ${s.updatedBy}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <EditDrawer
        open={editSource !== undefined}
        source={editSource}
        onClose={() => setEditSource(undefined)}
        onSaved={refresh}
      />
    </div>
  );
};

export default DatasourceConfigPage;
