/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ApiReceivePage — 抓取收集中台（纯抓取执行页，2026-08-16 重构）
 *
 * 职责收敛：本页只做「抓取执行」——
 *   1. 选数据源（只读状态，来自 系统管理→连接配置）
 *   2. 选会计期间（真实期间 + 凭证数预览）
 *   3. 选去向：直接入库·自动组卷 / 送组卷工作台 / 送核对工作台 / 送审核
 *   4. 立即同步 + 批次历史日志
 *
 * 所有"配置"（连接参数、抓取计划、默认去向、AppKey、字段映射）
 * 一律在「系统管理 → 连接配置」维护，本页不再含任何配置项。
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, RefreshCw, Database, ChevronDown, ChevronRight, Wifi, WifiOff,
  Settings, Play, Loader2, Unplug, FileText, Send, ArrowRight,
} from 'lucide-react';
import {
  yonyouService,
  type YonyouStatus, type SyncBatch, type SyncBatchDetail,
} from '../../services/yonyouService';
import { datasourceService, DATASOURCE_TYPE_LABELS, type DatasourceView } from '../../services/datasourceService';
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

/** 抓取去向（与推送统一；核对/审核是「核对工作台」内的两个环节，见工作台 Tab） */
const DEST_OPTIONS: { value: 'auto-archive' | 'to-volume' | 'to-check' | 'to-review'; label: string; desc: string }[] = [
  { value: 'auto-archive', label: '直接入库 · 自动组卷', desc: '四性检测后按期间自动建卷、赋号、归档（可信源）' },
  { value: 'to-volume', label: '送组卷工作台', desc: '进入待组卷池，由整理人员人工组卷' },
  { value: 'to-check', label: '送核对工作台 · 待核对', desc: '先核对凭证连续性/附件，通过后可送组卷或转审核' },
  { value: 'to-review', label: '送核对工作台 · 待审核', desc: '跳过核对直接人工审核，通过后送组卷' },
];

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
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-20">类型</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-24">凭证字号</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">摘要</th>
              <th className="px-4 py-3 text-right text-[13px] font-semibold w-28">金额</th>
              <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">状态</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-44">档号 / 说明</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((it) => (
              <tr key={it.id} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                <td className="px-4 py-3 text-[13px] text-slate-600">{it.item_type === 'voucher' ? '记账凭证' : '财务报表'}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-slate-800">{it.voucher_no || '—'}</td>
                <td className="px-4 py-3 text-[13px] text-slate-600 max-w-[220px] truncate" title={it.summary || ''}>{it.summary || '—'}</td>
                <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-800">{fmtAmount(it.amount)}</td>
                <td className={`px-4 py-3 text-center text-[13px] font-medium ${ITEM_STATUS[it.status]?.cls || ''}`}>
                  {ITEM_STATUS[it.status]?.label || it.status}
                </td>
                <td className="px-4 py-3 text-[13px] text-slate-600 max-w-[176px]">
                  {it.archive_code && <div className="font-mono truncate" title={it.archive_code}>{it.archive_code}</div>}
                  {it.error && <div className="text-red-500 truncate" title={it.error}>{it.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── 主组件 ───

const ApiReceivePage: React.FC = () => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const activeFonds = useArchiveStore((s) => s.currentFanzongCode);

  const [status, setStatus] = useState<YonyouStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [sources, setSources] = useState<DatasourceView[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState('');
  const [preview, setPreview] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [destination, setDestination] = useState<'auto-archive' | 'to-volume' | 'to-check' | 'to-review'>('to-check');
  const [batches, setBatches] = useState<SyncBatch[]>([]);
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [st, bs] = await Promise.all([yonyouService.status(), yonyouService.batches(30)]);
      setStatus(st);
      setBatches(bs);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : '加载失败');
    }
  }, []);

  useEffect(() => {
    refresh();
    // 数据源列表（只读展示，配置在系统管理）
    datasourceService.list().then(setSources).catch(() => setSources([]));
  }, [refresh]);

  // 默认去向：取 yonyou 数据源配置的 defaultDestination
  useEffect(() => {
    const yy = sources.find((s) => s.type === 'yonyou');
    const d = yy?.config?.defaultDestination;
    if (d === 'auto-archive' || d === 'to-volume' || d === 'to-check' || d === 'to-review') {
      setDestination(d);
    }
  }, [sources]);

  const connected = !!status?.configured;

  // 期间列表（配置就绪后拉取）
  useEffect(() => {
    if (!connected) return;
    yonyouService.periods()
      .then((r) => {
        setPeriods(r.periods);
        setPeriod((p) => p || r.suggested || r.periods[r.periods.length - 1] || '');
      })
      .catch(() => setPeriods([]));
  }, [connected]);

  // 期间凭证数预览
  useEffect(() => {
    if (!period || !connected) { setPreview(null); return; }
    setPreviewing(true);
    const t = setTimeout(() => {
      yonyouService.preview(period)
        .then((r) => setPreview(r.voucherCount))
        .catch(() => setPreview(null))
        .finally(() => setPreviewing(false));
    }, 300);
    return () => clearTimeout(t);
  }, [period, connected]);

  const handleSync = async () => {
    if (!period) return;
    setSyncing(true);
    try {
      const batch = await yonyouService.sync(period, undefined, undefined, destination);
      const destLabel = DEST_OPTIONS.find((d) => d.value === destination)?.label || '';
      triggerToast(
        `期间 ${period} 抓取完成：成功 ${batch.success_count}、跳过 ${batch.skip_count}、失败 ${batch.fail_count}（去向：${destLabel}）`,
        batch.fail_count > 0 ? 'warning' : 'success');
      setExpandedBatch(batch.id);
      await refresh();
      // 抓取入池后刷新件域镜像：核对工作台/组卷工作台无需手动刷页面即可见（2026-08-16 贯通修复）
      void useArchiveStore.getState().loadRecords();
      void useArchiveStore.getState().loadAllRecords();
    } catch (e) {
      triggerToast('抓取失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setSyncing(false);
    }
  };

  const goConnectionConfig = () => useAppStore.getState().setActiveMainMenu('sys-connection');
  const yonyouSource = sources.find((s) => s.type === 'yonyou');
  const lastBatch = status?.lastBatch;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200">
        <Activity className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">抓取收集中台</h1>
        <div className="flex-1" />
        <button
          type="button" onClick={goConnectionConfig}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
          title="连接参数、抓取计划、默认去向、字段映射均在此配置"
        >
          <Settings className="w-3.5 h-3.5" />
          连接配置（系统管理）
        </button>
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

        <div className="grid grid-cols-3 gap-5">
          {/* ═══ 左：数据源 + 期间 ═══ */}
          <div className="col-span-2 space-y-4">
            {/* 数据源（只读选择） */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-sky-600" />
                ① 选择数据源
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {/* 用友 BIP：真实可用 */}
                <div className={`border rounded-lg p-3 ${connected ? 'border-green-300 bg-green-50/60' : 'border-amber-300 bg-amber-50/60'}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-800">
                      {yonyouSource?.name || '用友 BIP（YonBIP 开放网关）'}
                    </div>
                    {connected
                      ? <Wifi className="w-4 h-4 text-green-600" />
                      : <WifiOff className="w-4 h-4 text-amber-500" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">抓取 Pull</span>
                    <span>{connected ? '已配置就绪' : '未配置（请到连接配置）'}</span>
                    {lastBatch && <span>最近：{fmtTime(lastBatch.started_at)}</span>}
                  </div>
                </div>
                {/* 其他数据源：未接入灰态 */}
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Unplug className="w-4 h-4" />
                    <span className="text-sm font-semibold">其他数据源</span>
                  </div>
                  <div className="mt-1.5 space-y-1 text-[11px] text-slate-400">
                    {(sources.length > 0 ? sources.filter((s) => s.type !== 'yonyou') : [])
                      .slice(0, 3)
                      .map((s) => (
                        <div key={s.id} className="flex items-center justify-between">
                          <span className="truncate">{s.name}（{DATASOURCE_TYPE_LABELS[s.type] || s.type}）</span>
                          <span className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-500 shrink-0">采集接口未接入</span>
                        </div>
                      ))}
                    {sources.filter((s) => s.type !== 'yonyou').length === 0 && (
                      ['金蝶云·星空', '电子发票平台', '银行流水接口'].map((n) => (
                        <div key={n} className="flex items-center justify-between">
                          <span>{n}</span>
                          <span className="px-1.5 py-0.5 bg-slate-200 rounded text-slate-500">未接入</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 期间 + 执行 */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
                <Play className="w-4 h-4 text-sky-600" />
                ② 选择会计期间，执行抓取
              </h3>
              <div className="flex items-end gap-3">
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
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={!connected || syncing || !period || preview === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {syncing ? '抓取中…' : '立即抓取'}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                抓取动作：拉取该期间全部凭证 → 转换为档案元数据 + 生成版式 PDF → 入「{status?.fondsCode || activeFonds || '—'}」收集池（已归档的自动跳过）。
              </p>
            </div>
          </div>

          {/* ═══ 右：去向选择 ═══ */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 h-fit">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-1">
              <Send className="w-4 h-4 text-sky-600" />
              ③ 抓取去向
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">本次抓取的数据流向（默认值在连接配置中设置）</p>
            <div className="space-y-2">
              {DEST_OPTIONS.map((d) => (
                <label
                  key={d.value}
                  className={`flex items-start gap-2.5 p-2.5 border rounded-lg cursor-pointer transition-colors ${
                    destination === d.value
                      ? 'border-sky-300 bg-sky-50/70'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio" name="destination" value={d.value}
                    checked={destination === d.value}
                    onChange={() => setDestination(d.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className={`text-xs font-semibold ${destination === d.value ? 'text-sky-700' : 'text-slate-700'}`}>
                      {d.label}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{d.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-start gap-1.5">
              <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
              <span>定时自动抓取计划在「系统管理 → 连接配置 → 数据源连接」中维护。</span>
            </div>
          </div>
        </div>

        {/* ═══ 批次历史 ═══ */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">抓取批次历史（日志）</h3>
            <span className="text-xs text-slate-400">{batches.length} 个批次</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-44">批次号</th>
                <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">期间</th>
                <th className="px-4 py-3 text-center text-[13px] font-semibold w-16">触发</th>
                <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">状态</th>
                <th className="px-4 py-3 text-right text-[13px] font-semibold w-16">凭证</th>
                <th className="px-4 py-3 text-right text-[13px] font-semibold w-16">成功</th>
                <th className="px-4 py-3 text-right text-[13px] font-semibold w-16">跳过</th>
                <th className="px-4 py-3 text-right text-[13px] font-semibold w-16">失败</th>
                <th className="px-4 py-3 text-right text-[13px] font-semibold w-16">报表</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold">说明</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">开始时间</th>
                <th className="px-4 py-3 text-center text-[13px] font-semibold w-10"></th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-slate-400">暂无抓取批次</td></tr>
              )}
              {batches.map((b) => {
                const st = BATCH_STATUS[b.status] || { label: b.status, cls: 'bg-slate-100 text-slate-600' };
                const expanded = expandedBatch === b.id;
                return (
                  <React.Fragment key={b.id}>
                    <tr
                      className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors cursor-pointer"
                      onClick={() => setExpandedBatch(expanded ? null : b.id)}
                    >
                      <td className="px-4 py-3 font-mono text-[13px] text-slate-800">{b.batch_no}</td>
                      <td className="px-4 py-3 text-center font-mono text-[13px] text-slate-600">{b.period}</td>
                      <td className="px-4 py-3 text-center text-[13px] text-slate-600">{b.trigger_type === 'auto' ? '自动' : '手动'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-600">{b.total_count}</td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-green-600">{b.success_count}</td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-400">{b.skip_count}</td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-red-600">{b.fail_count}</td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-600">{b.report_count}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600 max-w-[240px] truncate" title={b.message || ''}>{b.message || '—'}</td>
                      <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{fmtTime(b.started_at)}</td>
                      <td className="px-4 py-3 text-center">
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
    </div>
  );
};

export default ApiReceivePage;
