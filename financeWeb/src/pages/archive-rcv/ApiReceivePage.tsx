/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ApiReceivePage — 集成接口采集（用友BIP 真集成，2026-08-08 重写）
 *
 * 功能：
 *   1. 用友BIP 数据源实时状态（test-connection 实调网关）
 *   2. 手动同步：会计期间选择 → 凭证数预览 → 一键归档（可选自动组卷）
 *   3. 月度自动归档：cron 调度配置（默认每月1日 02:30 同步上月）
 *   4. 连接配置：网关/appKey/appSecret(脱敏)/tenantId/账簿/目标全宗
 *   5. 同步批次历史：批次表 + 行展开明细（凭证→档号映射、失败原因）
 *
 * 数据全部来自 ams-server /yonyou/**，无任何 mock。
 * 转换规则与幂等设计见《用友BIP集成设计-2026-08-08.md》。
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, RefreshCw,
  Database, FileText, ChevronDown, ChevronRight, Wifi, WifiOff,
  Settings, CalendarClock, Link2, Play, Loader2, Unplug,
} from 'lucide-react';
import {
  yonyouService,
  type YonyouStatus, type SyncBatch, type SyncBatchDetail, type ScheduleConfig,
} from '../../services/yonyouService';
import { useAppStore } from '../../stores/appStore';
import { useArchiveStore } from '../../stores/archiveStore';

// ─── 小工具 ───

const fmtTime = (s?: string | null) => (s ? s.replace('T', ' ').slice(0, 19) : '—');
const fmtAmount = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BATCH_STATUS: Record<string, { label: string; cls: string }> = {
  running: { label: '执行中', cls: 'bg-sky-100 text-sky-700' },
  success: { label: '成功', cls: 'bg-green-100 text-green-700' },
  partial: { label: '部分成功', cls: 'bg-amber-100 text-amber-700' },
  failed: { label: '失败', cls: 'bg-red-100 text-red-700' },
};
const ITEM_STATUS: Record<string, { label: string; cls: string }> = {
  success: { label: '已归档', cls: 'text-green-600' },
  skipped: { label: '已跳过', cls: 'text-slate-400' },
  failed: { label: '失败', cls: 'text-red-600' },
};

const CRON_PRESETS = [
  { label: '每月 1 日 02:30（同步上月）', cron: '0 30 2 1 * *' },
  { label: '每月 5 日 02:30（同步上月）', cron: '0 30 2 5 * *' },
  { label: '每日 02:30（同步上月，幂等去重）', cron: '0 30 2 * * *' },
  { label: '自定义 cron', cron: '' },
];

// ─── 子组件：连接配置抽屉 ───

const ConfigDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, onClose, onSaved }) => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [form, setForm] = useState({
    gateway: 'https://dbox.yonyoucloud.com/iuap-api-gateway',
    appKey: '', appSecret: '', tenantId: '', accbookCode: '0001', fondsCode: 'Z001',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTestResult(null);
    yonyouService.getConfig().then((cfg) => {
      setForm({
        gateway: cfg.gateway || 'https://dbox.yonyoucloud.com/iuap-api-gateway',
        appKey: cfg.appKey || '',
        appSecret: cfg.appSecret || '',   // 脱敏占位 ********
        tenantId: cfg.tenantId || '',
        accbookCode: cfg.accbookCode || '0001',
        fondsCode: cfg.fondsCode || 'Z001',
      });
    }).catch(() => {});
  }, [open]);

  if (!open) return null;

  const field = (label: string, key: keyof typeof form, opts?: { secret?: boolean; hint?: string }) => (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={opts?.secret ? 'password' : 'text'}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
      />
      {opts?.hint && <span className="text-xs text-slate-400">{opts.hint}</span>}
    </label>
  );

  const save = async () => {
    setSaving(true);
    try {
      await yonyouService.saveConfig(form);
      triggerToast('连接配置已保存', 'success');
      onSaved();
    } catch (e) {
      triggerToast('保存失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await save0();
      const r = await yonyouService.testConnection();
      setTestResult(r.ok
        ? `连接成功：账簿 ${r.accbook?.name}（${r.accbook?.code}），耗时 ${r.elapsedMs}ms`
        : `连接失败：${r.error}`);
    } catch (e) {
      setTestResult('连接失败：' + (e instanceof Error ? e.message : ''));
    } finally {
      setTesting(false);
    }
  };

  const save0 = async () => { await yonyouService.saveConfig(form); onSaved(); };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-[420px] h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-sky-600" />
            用友 BIP 连接配置
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {field('网关 Base URL', 'gateway')}
          {field('应用 appKey', 'appKey')}
          {field('应用 appSecret', 'appSecret', { secret: true, hint: '留空或保持 ******** 表示不修改原密钥' })}
          {field('租户 tenantId', 'tenantId')}
          {field('账簿编码 accbookCode', 'accbookCode')}
          {field('归档目标全宗', 'fondsCode', { hint: '同步的凭证/报表将入该全宗收集池' })}
          {testResult && (
            <div className={`text-xs px-3 py-2 rounded-lg ${testResult.startsWith('连接成功') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {testResult}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200">
          <button
            type="button" onClick={test} disabled={testing || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            测试连接
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">取消</button>
          <button
            type="button" onClick={save} disabled={saving || testing}
            className="px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── 子组件：批次明细表 ───

const BatchItemsTable: React.FC<{ batchId: number }> = ({ batchId }) => {
  const [detail, setDetail] = useState<SyncBatchDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    yonyouService.batchDetail(batchId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [batchId]);

  if (loading) return <div className="px-4 py-3 text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />加载明细…</div>;
  if (!detail || detail.items.length === 0) return <div className="px-4 py-3 text-xs text-slate-400">本批次无明细记录</div>;

  return (
    <div className="px-4 py-3 bg-slate-50">
      <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden bg-white">
        <thead>
          <tr className="bg-slate-100 border-b border-slate-200">
            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-20">类型</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-24">凭证字号</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600">摘要</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-600 w-28">金额</th>
            <th className="px-3 py-2 text-center font-semibold text-slate-600 w-20">状态</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-600 w-44">档号 / 说明</th>
          </tr>
        </thead>
        <tbody>
          {detail.items.map((it) => (
            <tr key={it.id} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-1.5 text-slate-500">{it.item_type === 'voucher' ? '记账凭证' : '财务报表'}</td>
              <td className="px-3 py-1.5 font-mono text-slate-700">{it.voucher_no || '—'}</td>
              <td className="px-3 py-1.5 text-slate-600 max-w-[220px] truncate" title={it.summary || ''}>{it.summary || '—'}</td>
              <td className="px-3 py-1.5 text-right font-mono text-slate-700">{fmtAmount(it.amount)}</td>
              <td className={`px-3 py-1.5 text-center font-medium ${ITEM_STATUS[it.status]?.cls || ''}`}>
                {ITEM_STATUS[it.status]?.label || it.status}
              </td>
              <td className="px-3 py-1.5 text-slate-500 max-w-[176px]">
                {it.archive_code && <div className="font-mono truncate" title={it.archive_code}>{it.archive_code}</div>}
                {it.error && <div className="text-red-500 truncate" title={it.error}>{it.error}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── 主组件 ───

const ApiReceivePage: React.FC = () => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const activeFonds = useArchiveStore((s) => s.currentFanzongCode);

  const [status, setStatus] = useState<YonyouStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState('');
  const [preview, setPreview] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [autoGroupOnce, setAutoGroupOnce] = useState(true);
  const [batches, setBatches] = useState<SyncBatch[]>([]);
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);
  const [cronChoice, setCronChoice] = useState('0 30 2 1 * *');
  const [customCron, setCustomCron] = useState('');
  const [savingSched, setSavingSched] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [st, bs, sc] = await Promise.all([
        yonyouService.status(), yonyouService.batches(30), yonyouService.getSchedule(),
      ]);
      setStatus(st);
      setBatches(bs);
      setSchedule(sc);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : '加载失败');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 调度配置加载后回显 cron 选择（预设命中选预设，否则选自定义并填值）
  useEffect(() => {
    if (!schedule) return;
    if (CRON_PRESETS.some((p) => p.cron === schedule.cron)) {
      setCronChoice(schedule.cron);
      setCustomCron('');
    } else if (schedule.cron) {
      setCronChoice('');
      setCustomCron(schedule.cron);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.cron]);

  // 期间列表（配置就绪后拉取）
  useEffect(() => {
    if (!status?.configured) return;
    yonyouService.periods()
      .then((r) => {
        setPeriods(r.periods);
        setPeriod((p) => p || r.suggested || r.periods[r.periods.length - 1] || '');
      })
      .catch(() => setPeriods([]));
  }, [status?.configured]);

  // 期间凭证数预览
  useEffect(() => {
    if (!period || !status?.configured) { setPreview(null); return; }
    setPreviewing(true);
    const t = setTimeout(() => {
      yonyouService.preview(period)
        .then((r) => setPreview(r.voucherCount))
        .catch(() => setPreview(null))
        .finally(() => setPreviewing(false));
    }, 300);
    return () => clearTimeout(t);
  }, [period, status?.configured]);

  const effectiveCron = cronChoice === '' ? customCron : cronChoice;

  const handleSync = async () => {
    if (!period) return;
    setSyncing(true);
    try {
      const batch = await yonyouService.sync(period, autoGroupOnce);
      triggerToast(
        `期间 ${period} 同步完成：成功 ${batch.success_count}、跳过 ${batch.skip_count}、失败 ${batch.fail_count}` +
        (batch.volume_node_id ? '，已自动组卷' : ''),
        batch.fail_count > 0 ? 'warning' : 'success');
      setExpandedBatch(batch.id);
      await refresh();
    } catch (e) {
      triggerToast('同步失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveSchedule = async (patch: Partial<{ enabled: boolean; cron: string; autoGroup: boolean }>) => {
    if (!schedule) return;
    setSavingSched(true);
    try {
      const next = await yonyouService.saveSchedule({
        enabled: patch.enabled ?? schedule.enabled,
        cron: patch.cron ?? effectiveCron ?? schedule.cron,
        autoGroup: patch.autoGroup ?? schedule.autoGroup,
      });
      setSchedule(next);
      triggerToast('自动归档设置已保存', 'success');
      await refresh();
    } catch (e) {
      triggerToast('保存失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setSavingSched(false);
    }
  };

  const connected = !!status?.configured;
  const lastBatch = status?.lastBatch;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200">
        <Activity className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">抓取收集中台</h1>
        <span className="text-xs text-slate-400">主动抓取（Pull）：用友 BIP → 会计档案（按会计期间归档）</span>
        <div className="flex-1" />
        <button
          type="button" onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {loadErr && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-xl">{loadErr}</div>
        )}

        {/* ═══ 数据源状态区 ═══ */}
        <div className="grid grid-cols-3 gap-4">
          {/* 用友BIP 真实卡 */}
          <div className={`col-span-2 border rounded-xl p-4 ${connected ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Database className={`w-5 h-5 ${connected ? 'text-green-600' : 'text-amber-500'}`} />
                <div>
                  <div className="text-sm font-semibold text-slate-800">用友 BIP（YonBIP 开放网关）</div>
                  <div className="text-xs text-slate-500 font-mono">{status?.gateway || '未配置'}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {connected ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-amber-500" />}
                <span className={`text-xs font-medium ${connected ? 'text-green-700' : 'text-amber-700'}`}>
                  {connected ? '已配置' : '待配置'}
                </span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-slate-400">租户 / 账簿</div>
                <div className="font-mono text-slate-700 mt-0.5">{status?.tenantId || '—'} / {status?.accbookCode || '—'}</div>
              </div>
              <div>
                <div className="text-slate-400">归档全宗</div>
                <div className="font-mono text-slate-700 mt-0.5">{status?.fondsCode || activeFonds || '—'}</div>
              </div>
              <div>
                <div className="text-slate-400">最近同步</div>
                <div className="text-slate-700 mt-0.5">{lastBatch ? fmtTime(lastBatch.started_at) : '从未同步'}</div>
              </div>
              <div>
                <div className="text-slate-400">最近结果</div>
                <div className="mt-0.5">
                  {lastBatch
                    ? <span className={`px-1.5 py-0.5 rounded font-medium ${BATCH_STATUS[lastBatch.status]?.cls}`}>{BATCH_STATUS[lastBatch.status]?.label}</span>
                    : '—'}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button" onClick={() => setConfigOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                <Settings className="w-3 h-3" />
                连接配置
              </button>
              {status?.syncRunning && (
                <span className="flex items-center gap-1 text-xs text-sky-600"><Loader2 className="w-3 h-3 animate-spin" />有同步任务执行中</span>
              )}
            </div>
          </div>

          {/* 其他数据源：未接入灰态（不伪造状态） */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
            <div className="flex items-center gap-2 text-slate-400">
              <Unplug className="w-4 h-4" />
              <span className="text-sm font-semibold">其他数据源</span>
            </div>
            <div className="mt-2 space-y-1.5 text-xs text-slate-400">
              {['金蝶云·星空', '电子发票平台', '银行流水接口', '报销审批系统'].map((n) => (
                <div key={n} className="flex items-center justify-between">
                  <span>{n}</span>
                  <span className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-500">未接入</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ 操作区：手动同步 + 自动归档 ═══ */}
        <div className="grid grid-cols-3 gap-5">
          {/* 手动同步 */}
          <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Play className="w-4 h-4 text-sky-600" />
              手动同步（按会计期间）
            </h3>
            <div className="mt-3 flex items-end gap-3">
              <label className="block">
                <span className="text-xs text-slate-500">会计期间</span>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  disabled={!connected || periods.length === 0}
                  className="mt-1 w-44 px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono bg-white disabled:opacity-50"
                >
                  {periods.length === 0 && <option value="">（未加载）</option>}
                  {periods.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <div className="text-xs text-slate-500 pb-2">
                {previewing
                  ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />查询中…</span>
                  : preview != null
                    ? <>该期间用友侧有 <strong className="text-sky-700 text-sm">{preview}</strong> 张记账凭证</>
                    : '—'}
              </div>
              <div className="flex-1" />
              <label className="flex items-center gap-1.5 text-xs text-slate-600 pb-2 cursor-pointer">
                <input type="checkbox" checked={autoGroupOnce} onChange={(e) => setAutoGroupOnce(e.target.checked)} className="rounded border-slate-300" />
                同步后自动组卷归档
              </label>
              <button
                type="button"
                onClick={handleSync}
                disabled={!connected || syncing || !period || preview === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {syncing ? '同步中…' : '立即同步'}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              同步动作：拉取该期间全部凭证 → 转换为档案元数据 + 生成版式 PDF → 入「{status?.fondsCode || activeFonds || '—'}」收集池（已归档的自动跳过）。
              {autoGroupOnce && ' 完成后自动建卷《{期间}记账凭证卷》并确认取号。'}
            </p>
          </div>

          {/* 自动归档调度 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-sky-600" />
              月度自动归档
            </h3>
            {schedule && (
              <div className="mt-3 space-y-2.5 text-xs">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-600">启用自动归档</span>
                  <input
                    type="checkbox" checked={schedule.enabled} disabled={savingSched}
                    onChange={(e) => handleSaveSchedule({ enabled: e.target.checked, cron: effectiveCron })}
                    className="rounded border-slate-300"
                  />
                </label>
                <label className="block">
                  <span className="text-slate-600">执行计划</span>
                  <select
                    value={cronChoice}
                    onChange={(e) => setCronChoice(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    {CRON_PRESETS.map((p) => <option key={p.label} value={p.cron}>{p.label}</option>)}
                  </select>
                </label>
                {cronChoice === '' && (
                  <input
                    value={customCron} onChange={(e) => setCustomCron(e.target.value)}
                    placeholder="cron 表达式，如 0 30 2 1 * *"
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg font-mono"
                  />
                )}
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-600">自动组卷归档</span>
                  <input
                    type="checkbox" checked={schedule.autoGroup} disabled={savingSched}
                    onChange={(e) => handleSaveSchedule({ autoGroup: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                </label>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-slate-400">
                    {schedule.enabled
                      ? `下次执行：${schedule.nextRun ? fmtTime(schedule.nextRun) : '待计算'}（同步 ${schedule.suggestedPeriod || '上月'}）`
                      : '未启用'}
                  </span>
                  {(cronChoice !== schedule.cron && (cronChoice || customCron)) && (
                    <button
                      type="button" onClick={() => handleSaveSchedule({ cron: effectiveCron })}
                      disabled={savingSched}
                      className="px-2.5 py-1 font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100"
                    >
                      保存计划
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ 批次历史 ═══ */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">同步批次历史</h3>
            <span className="text-xs text-slate-400">{batches.length} 个批次</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <th className="px-4 py-2.5 text-left font-semibold w-44">批次号</th>
                <th className="px-4 py-2.5 text-center font-semibold w-20">期间</th>
                <th className="px-4 py-2.5 text-center font-semibold w-16">触发</th>
                <th className="px-4 py-2.5 text-center font-semibold w-20">状态</th>
                <th className="px-4 py-2.5 text-right font-semibold w-16">凭证</th>
                <th className="px-4 py-2.5 text-right font-semibold w-16">成功</th>
                <th className="px-4 py-2.5 text-right font-semibold w-16">跳过</th>
                <th className="px-4 py-2.5 text-right font-semibold w-16">失败</th>
                <th className="px-4 py-2.5 text-right font-semibold w-16">报表</th>
                <th className="px-4 py-2.5 text-left font-semibold">说明</th>
                <th className="px-4 py-2.5 text-left font-semibold w-36">开始时间</th>
                <th className="px-4 py-2.5 text-center font-semibold w-10"></th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-slate-400">暂无同步批次</td></tr>
              )}
              {batches.map((b) => {
                const st = BATCH_STATUS[b.status] || { label: b.status, cls: 'bg-slate-100 text-slate-600' };
                const expanded = expandedBatch === b.id;
                return (
                  <React.Fragment key={b.id}>
                    <tr
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpandedBatch(expanded ? null : b.id)}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{b.batch_no}</td>
                      <td className="px-4 py-2.5 text-center font-mono text-xs">{b.period}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-slate-500">{b.trigger_type === 'auto' ? '自动' : '手动'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">{b.total_count}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-green-600">{b.success_count}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-400">{b.skip_count}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-red-600">{b.fail_count}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">{b.report_count}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[240px] truncate" title={b.message || ''}>{b.message || '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{fmtTime(b.started_at)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={12} className="p-0">
                          <BatchItemsTable batchId={b.id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 说明 */}
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
            <div className="text-xs text-sky-800 space-y-1">
              <p className="font-medium">归档转换规则（用友 → 会计档案）</p>
              <p>记账凭证：凭证字号/凭证字/会计期间/制单人/审核人/借贷合计/附单据数全字段映射，分录结构化存储；无电子附件时按凭证数据生成标准版式 PDF 作为电子文件（79号令）。</p>
              <p>幂等保障：以用友凭证 ID 为去重键，重复同步同一期间自动跳过已归档件；财务报表（科目余额表/利润发生表）仅在用友侧有数据时归档，空期间如实记录不归档。</p>
            </div>
          </div>
        </div>
      </div>

      <ConfigDrawer open={configOpen} onClose={() => setConfigOpen(false)} onSaved={refresh} />
    </div>
  );
};

export default ApiReceivePage;
