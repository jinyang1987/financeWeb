/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * OpenApiReceivePage — 集成接口采集（统一四类契约 v2，2026-08-16 重写）
 *
 * 语义：与「抓取收集中台」的主动拉取（Pull）互补——本页是推送（Push）模式的
 * 采集运营中心。任何财务系统（用友/金蝶/浪潮/自研ERP）都按同一契约推送
 * 四大类会计资料（79号令第六条）：凭证 / 账簿 / 报表 / 其他。
 *
 * 页面三 Tab：
 *   ① 推送监控 —— 批次总览、四性检测、去向操作（送组卷/自动组卷/送审核）、明细
 *   ② 接口标准 —— 统一契约文档：鉴权、端点、四类字段契约、示例、错误码、期限速查
 *   ③ 推送日志 —— 受理→校验→映射→建件→四性→去向 全链路日志
 *
 * 「模拟推送」：无真实外部系统时，一键生成四类样例数据走真实推送管道演示。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, RefreshCw, ChevronDown, ChevronRight, Loader2, KeyRound,
  ShieldCheck, PlugZap, FileJson, BookOpenText, ScrollText, FlaskConical,
  Eye, CheckCircle2, AlertTriangle, XCircle, Layers, Send, Inbox,
} from 'lucide-react';
import {
  openPushService, CATEGORY_LABELS, DESTINATION_LABELS,
  type OpenPushBatch, type OpenPushBatchDetail, type OpenPushItem,
  type PushLogEntry, type PushCategory, type PushDestination,
} from '../../services/openPushService';
import { useAppStore } from '../../stores/appStore';
import { useArchiveStore } from '../../stores/archiveStore';

// ─── 小工具 ───

const fmtTime = (s?: string | null) => (s ? s.replace('T', ' ').slice(0, 19) : '—');

const BATCH_STATUS: Record<string, { label: string; cls: string }> = {
  accepted: { label: '已受理', cls: 'bg-sky-100 text-sky-700' },
  processing: { label: '处理中', cls: 'bg-amber-100 text-amber-700' },
  success: { label: '成功', cls: 'bg-green-100 text-green-700' },
  partial: { label: '部分成功', cls: 'bg-amber-100 text-amber-700' },
  failed: { label: '失败', cls: 'bg-red-100 text-red-700' },
};

const CATEGORY_BADGE: Record<string, string> = {
  voucher: 'bg-sky-50 text-sky-700 border-sky-200',
  ledger: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  report: 'bg-violet-50 text-violet-700 border-violet-200',
  other: 'bg-amber-50 text-amber-700 border-amber-200',
};

const STEP_LABELS: Record<string, string> = {
  auth: '接入认证', accept: '批次受理', validate: '入口校验', map: '字段映射',
  create: '建件入池', fourchecks: '四性检测', route: '去向路由', group: '自动组卷',
  receipt: '批次回执', simulate: '模拟推送',
};

const catLabel = (c?: string) => (c && CATEGORY_LABELS[c as PushCategory]) || (c === '' ? '混合' : c || '—');

// ═══════════════════════════════════════════════════════════
// Tab1：推送监控
// ═══════════════════════════════════════════════════════════

const MonitorTab: React.FC<{ batches: OpenPushBatch[]; loading: boolean; refresh: () => void }> = ({
  batches, loading, refresh,
}) => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<OpenPushBatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) { setDetail(null); return; }
    setDetailLoading(true);
    openPushService.batchDetail(expanded)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [expanded]);

  // ── 统计 ──
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let todayBatches = 0, totalIn = 0, totalSuccess = 0, totalFail = 0;
    const byCat: Record<string, number> = { voucher: 0, ledger: 0, report: 0, other: 0, mixed: 0 };
    for (const b of batches) {
      if (b.created_at?.startsWith(today) || b.batch_no?.includes(today)) todayBatches++;
      totalIn += b.total_count;
      totalSuccess += b.success_count;
      totalFail += b.fail_count;
      const key = b.category && byCat[b.category] !== undefined ? b.category : (b.category ? 'mixed' : 'mixed');
      byCat[key] = (byCat[key] || 0) + 1;
    }
    return { todayBatches, totalIn, totalSuccess, totalFail, byCat };
  }, [batches]);

  const runAction = async (batchNo: string, action: 'fourchecks' | 'toreview' | 'autogroup') => {
    setActioning(batchNo + action);
    try {
      if (action === 'fourchecks') {
        const r = await openPushService.batchFourChecks(batchNo);
        triggerToast(`四性检测完成：检测 ${r.checked} 件，通过 ${r.passed} 件，不通过 ${r.failed} 件`, 'success');
      } else if (action === 'toreview') {
        const r = await openPushService.batchToReview(batchNo);
        triggerToast(`${r.routed} 条已转审核库（档案整理→核对工作台·待审核）`, 'success');
      } else {
        const r = await openPushService.batchAutoGroup(batchNo);
        triggerToast(`已自动组卷 ${r.volumes} 卷（${r.items} 件），完成入库`, 'success');
      }
      refresh();
    } catch (e) {
      triggerToast('操作失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 统计卡 */}
      <div className="grid grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-2xl font-bold text-slate-800">{stats.todayBatches}</div>
          <div className="text-xs text-slate-400 mt-0.5">今日推送批次</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-2xl font-bold text-slate-800">{stats.totalIn}</div>
          <div className="text-xs text-slate-400 mt-0.5">累计接收条目</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-2xl font-bold text-green-600">{stats.totalSuccess}</div>
          <div className="text-xs text-slate-400 mt-0.5">成功入池</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-2xl font-bold text-red-500">{stats.totalFail}</div>
          <div className="text-xs text-slate-400 mt-0.5">失败条目</div>
        </div>
        <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-3.5">
          <div className="text-xs text-slate-400 mb-1.5">四类批次分布（79号令第六条）</div>
          <div className="flex items-center gap-2 flex-wrap">
            {(['voucher', 'ledger', 'report', 'other'] as const).map((c) => (
              <span key={c} className={`px-2 py-0.5 text-[11px] font-medium rounded-full border ${CATEGORY_BADGE[c]}`}>
                {CATEGORY_LABELS[c]} {stats.byCat[c] || 0}
              </span>
            ))}
            {(stats.byCat.mixed || 0) > 0 && (
              <span className="px-2 py-0.5 text-[11px] rounded-full border bg-slate-50 text-slate-500 border-slate-200">
                混合 {stats.byCat.mixed}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 批次表 */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-sky-600" />
            推送批次
          </h3>
          <span className="text-xs text-slate-400">{batches.length} 个批次 · 点行展开明细，右侧按钮执行四性/去向操作</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-40">批次号</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">来源应用</th>
              <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">期间</th>
              <th className="px-4 py-3 text-center text-[13px] font-semibold w-28">类别</th>
              <th className="px-4 py-3 text-center text-[13px] font-semibold w-32">去向</th>
              <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">状态</th>
              <th className="px-4 py-3 text-right text-[13px] font-semibold w-24">收/成/败</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">推送时间</th>
              <th className="px-4 py-3 text-right text-[13px] font-semibold w-64">操作</th>
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">
                <Loader2 className="w-4 h-4 inline animate-spin mr-1.5" />加载中…
              </td></tr>
            )}
            {!loading && batches.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-400">
                暂无推送批次 — 业务系统持 AppKey 调用 <span className="font-mono">POST /api/ams/open/v1/archives/batch</span> 推送，或点右上角「模拟推送」演示
              </td></tr>
            )}
            {batches.map((b) => {
              const st = BATCH_STATUS[b.status] || { label: b.status, cls: 'bg-slate-100 text-slate-600' };
              const isOpen = expanded === b.batch_no;
              const hasSuccess = b.success_count > 0;
              return (
                <React.Fragment key={b.batch_no}>
                  <tr className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors cursor-pointer"
                    onClick={() => setExpanded(isOpen ? null : b.batch_no)}>
                    <td className="px-4 py-3 font-mono text-[13px] text-slate-800">{b.batch_no}</td>
                    <td className="px-4 py-3 text-sm text-slate-800">
                      {b.app_name || '—'}
                      {b.source_system && <div className="text-[10px] text-slate-400 font-mono">{b.source_system}</div>}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-[13px] text-slate-600">{b.period || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full border ${CATEGORY_BADGE[b.category || ''] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        {catLabel(b.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-[13px] text-slate-600">
                      {b.destination ? (DESTINATION_LABELS[b.destination as PushDestination] || b.destination) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[13px]">
                      <span className="text-slate-600">{b.total_count}</span>
                      <span className="text-slate-300">/</span>
                      <span className="text-green-600">{b.success_count}</span>
                      <span className="text-slate-300">/</span>
                      <span className="text-red-500">{b.fail_count}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{fmtTime(b.created_at)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button" disabled={!hasSuccess || actioning !== null}
                          onClick={() => runAction(b.batch_no, 'fourchecks')}
                          title="对本批次成功入池的记录运行四性检测"
                          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 disabled:opacity-40"
                        >
                          {actioning === b.batch_no + 'fourchecks' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                          四性检测
                        </button>
                        <button
                          type="button" disabled={!hasSuccess || actioning !== null}
                          onClick={() => runAction(b.batch_no, 'toreview')}
                          title="转入核对工作台·待审核"
                          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-40"
                        >
                          {actioning === b.batch_no + 'toreview' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          送审核
                        </button>
                        <button
                          type="button" disabled={!hasSuccess || actioning !== null}
                          onClick={() => runAction(b.batch_no, 'autogroup')}
                          title="按类别自动组卷并确认，直接入库"
                          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 disabled:opacity-40"
                        >
                          {actioning === b.batch_no + 'autogroup' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
                          自动组卷
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={10} className="p-0 bg-slate-50">
                        {b.message && (
                          <div className="px-5 pt-3 text-xs text-slate-500">批次说明：{b.message}</div>
                        )}
                        {detailLoading ? (
                          <div className="px-5 py-4 text-xs text-slate-400 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />加载明细…
                          </div>
                        ) : !detail || detail.items.length === 0 ? (
                          <div className="px-5 py-4 text-xs text-slate-400">本批次无明细记录</div>
                        ) : (
                          <div className="px-5 py-3">
                            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                              <table className="w-full">
                                <thead>
                                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-24">类别</th>
                                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-32">凭证/资料号</th>
                                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">来源单号</th>
                                    <th className="px-4 py-3 text-left text-[13px] font-semibold">摘要</th>
                                    <th className="px-4 py-3 text-right text-[13px] font-semibold w-28">金额</th>
                                    <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">状态</th>
                                    <th className="px-4 py-3 text-left text-[13px] font-semibold w-44">档号 / 错误</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.items.map((it: OpenPushItem) => (
                                    <tr key={it.id} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                                      <td className="px-4 py-3">
                                        <span className={`px-1.5 py-0.5 text-[10px] rounded-full border ${CATEGORY_BADGE[it.category || ''] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                          {catLabel(it.category) || it.archive_type}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 font-mono text-[13px] text-slate-800">{it.voucher_no || '—'}</td>
                                      <td className="px-4 py-3 font-mono text-[13px] text-slate-600 truncate max-w-[140px]" title={it.external_id}>{it.external_id || '—'}</td>
                                      <td className="px-4 py-3 text-[13px] text-slate-600 max-w-[220px] truncate" title={it.summary}>{it.summary || '—'}</td>
                                      <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-800">
                                        {it.amount != null ? it.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '—'}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        {it.status === 'success'
                                          ? <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">已入池</span>
                                          : it.status === 'skipped'
                                            ? <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">已跳过</span>
                                            : <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">失败</span>}
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
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// Tab2：接口标准（统一契约文档）
// ═══════════════════════════════════════════════════════════

const FLOW_STEPS = [
  { Icon: KeyRound, title: '① 申请接入', desc: '档案管理员在 系统管理→连接配置→推送接入应用 签发 AppKey/AppSecret，绑定全宗与默认去向' },
  { Icon: ShieldCheck, title: '② 换取令牌', desc: 'POST /open/v1/token 用 AppKey/AppSecret 换 Bearer 令牌（2小时有效）' },
  { Icon: FileJson, title: '③ 按契约推送', desc: '按统一四类契约封装批次（≤500条/批），调 /open/v1/archives/batch 推送' },
  { Icon: CheckCircle2, title: '④ 回执与流转', desc: '入口校验→建件入池→四性检测(可选)→按去向流转；GET 回执接口查询批次结果' },
];

const CONTRACT_COMMON = [
  { field: 'externalId', type: 'string', required: '必选', desc: '来源系统唯一键（幂等去重）' },
  { field: 'year', type: 'number', required: '必选', desc: '会计年度，如 2026' },
  { field: 'month', type: 'number', required: '可选', desc: '月份 1-12' },
  { field: 'retention', type: 'string', required: '可选', desc: '保管期限；缺省按三合一表自动带出' },
  { field: 'department', type: 'string', required: '可选', desc: '经办部门' },
  { field: 'preparer', type: 'string', required: '可选', desc: '制单人/经办人' },
  { field: 'summary', type: 'string', required: '可选', desc: '摘要' },
  { field: 'amount', type: 'number', required: '可选', desc: '金额（元）' },
  { field: 'files[]', type: 'array', required: '必选', desc: '版式文件：fileName / mimeType / fileBase64（OFD 优先，PDF/A 次之）' },
];

const CONTRACT_TYPES = [
  {
    category: 'voucher · 会计凭证', cls: CATEGORY_BADGE.voucher,
    fields: [
      { field: 'voucher.voucherNo', type: 'string', required: '必选', desc: '凭证号（会计系统生成，如 记-001）' },
      { field: 'voucher.voucherWord', type: 'string', required: '可选', desc: '凭证字（记/收/付/转）' },
      { field: 'voucher.voucherCategory', type: 'string', required: '可选', desc: '凭证类别（收款/付款/转账/通用）' },
      { field: 'voucher.entries[]', type: 'array', required: '可选', desc: '分录：subjectCode/subjectName/debit/credit/summary' },
      { field: 'voucher.attachedBillCount', type: 'number', required: '可选', desc: '附单据数' },
    ],
  },
  {
    category: 'ledger · 会计账簿', cls: CATEGORY_BADGE.ledger,
    fields: [
      { field: 'ledger.ledgerType', type: 'string', required: '必选', desc: '账簿类型：总账 / 明细账 / 日记账 / 辅助账簿' },
      { field: 'ledger.subjectCode', type: 'string', required: '可选', desc: '科目编码（明细账适用）' },
      { field: 'ledger.subjectName', type: 'string', required: '可选', desc: '科目名称' },
    ],
  },
  {
    category: 'report · 财务会计报告', cls: CATEGORY_BADGE.report,
    fields: [
      { field: 'report.reportName', type: 'string', required: '必选', desc: '报表名称（资产负债表/利润表/现金流量表…）' },
      { field: 'report.reportPeriod', type: 'string', required: '必选', desc: '报告期间：年度 / 半年度 / 季度 / 月度（决定保管期限：年度永久，其余10年）' },
    ],
  },
  {
    category: 'other · 其他会计资料', cls: CATEGORY_BADGE.other,
    fields: [
      { field: 'other.materialType', type: 'string', required: '必选', desc: '资料类别：银行余额调节表 / 银行对账单 / 纳税申报表 / 移交清册…' },
      { field: 'other.materialNo', type: 'string', required: '可选', desc: '资料编号' },
    ],
  },
];

const ENDPOINTS = [
  { method: 'POST', path: '/api/ams/open/v1/token', name: '接入认证', desc: 'AppKey/AppSecret 换取 Bearer 令牌' },
  { method: 'POST', path: '/api/ams/open/v1/archives', name: '单件推送', desc: '单条资料推送入收集池（支持去向参数）' },
  { method: 'POST', path: '/api/ams/open/v1/archives/batch', name: '批量推送', desc: '统一四类契约批量推送（≤500条/批）' },
  { method: 'GET', path: '/api/ams/open/v1/batches/{batchNo}', name: '回执查询', desc: '批次受理结果与逐条明细查询' },
  { method: 'POST', path: '/api/ams/open/v1/archives/{id}/confirm', name: '归档确认', desc: '来源系统确认归档完成（可选握手）' },
];

const ERROR_CODES = [
  { code: 'AUTH_FAILED', desc: 'AppKey 或 AppSecret 错误' },
  { code: 'TOKEN_EXPIRED / TOKEN_INVALID', desc: '令牌过期/无效，重新调 /token 获取' },
  { code: 'APP_DISABLED', desc: '接入应用已停用' },
  { code: 'VALIDATION_FAILED', desc: '字段校验失败（externalId/year 缺失、文件为空等）' },
  { code: 'PUSH_FAILED', desc: '入池失败（Alfresco 写入异常），条目计入失败明细' },
];

const RETENTION_TABLE = [
  { type: '会计凭证（原始凭证/记账凭证）', period: '30年', basis: '79号令附表' },
  { type: '会计账簿（总账/明细账/日记账/辅助账簿）', period: '30年', basis: '79号令附表' },
  { type: '财务会计报告 · 年度', period: '永久', basis: '79号令附表' },
  { type: '财务会计报告 · 月度/季度/半年度', period: '10年', basis: '79号令附表' },
  { type: '银行余额调节表 / 银行对账单', period: '10年', basis: '79号令附表' },
  { type: '纳税申报表', period: '10年', basis: '79号令附表' },
];

const SAMPLE_PAYLOAD = `{
  "period": "2026-07",
  "category": "voucher",            // voucher|ledger|report|other（混推时省略，按条目类型块识别）
  "destination": "to-check",        // auto-archive|to-volume|to-check|to-review
  "runFourChecks": true,
  "items": [
    {
      "externalId": "ERP-V-20260716-0001",
      "year": 2026, "month": 7,
      "department": "财务部", "preparer": "张三",
      "summary": "采购办公用品", "amount": 1375.00,
      "voucherNo": "记-101",
      "voucher": {
        "voucherWord": "记", "voucherCategory": "转账凭证",
        "attachedBillCount": 2,
        "entries": [
          { "subjectCode": "6602", "subjectName": "管理费用", "debit": 1375.00, "credit": 0 },
          { "subjectCode": "1002", "subjectName": "银行存款", "debit": 0, "credit": 1375.00 }
        ]
      },
      "files": [{ "fileName": "记-101.pdf", "mimeType": "application/pdf",
                  "fileBase64": "JVBERi0xLjQK..." }]
    },
    {
      "externalId": "ERP-L-2026-0001",
      "year": 2026, "summary": "2026年度总账电子账簿",
      "ledger": { "ledgerType": "总账", "subjectCode": "", "subjectName": "" },
      "files": [{ "fileName": "总账-2026.ofd", "mimeType": "application/ofd",
                  "fileBase64": "..." }]
    }
  ]
}`;

const StandardTab: React.FC = () => (
  <div className="space-y-4">
    {/* 接入流程 */}
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <PlugZap className="w-4 h-4 text-sky-600" />
        统一推送接入流程（任何财务系统同一套契约）
      </h3>
      <div className="grid grid-cols-4 gap-4">
        {FLOW_STEPS.map((s) => (
          <div key={s.title} className="border border-slate-100 rounded-lg p-3 bg-slate-50/60">
            <s.Icon className="w-5 h-5 text-sky-600 mb-2" />
            <div className="text-xs font-semibold text-slate-700 mb-1">{s.title}</div>
            <div className="text-[11px] text-slate-500 leading-relaxed">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>

    {/* 端点清单 */}
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <BookOpenText className="w-4 h-4 text-sky-600" />
          开放接口清单（推送方调用）
        </h3>
        <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">已上线</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
            <th className="px-4 py-3 text-left text-[13px] font-semibold w-20">方法</th>
            <th className="px-4 py-3 text-left text-[13px] font-semibold w-80">路径</th>
            <th className="px-4 py-3 text-left text-[13px] font-semibold w-28">名称</th>
            <th className="px-4 py-3 text-left text-[13px] font-semibold">说明</th>
          </tr>
        </thead>
        <tbody>
          {ENDPOINTS.map((e) => (
            <tr key={e.path} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
              <td className="px-4 py-3">
                <span className={`px-1.5 py-0.5 text-xs font-mono font-bold rounded ${
                  e.method === 'POST' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                }`}>{e.method}</span>
              </td>
              <td className="px-4 py-3 font-mono text-[13px] text-slate-800">{e.path}</td>
              <td className="px-4 py-3 text-sm font-medium text-slate-800">{e.name}</td>
              <td className="px-4 py-3 text-[13px] text-slate-600">{e.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* 数据契约 */}
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">契约字段 · 批次级</h3>
        </div>
        <div className="p-4 text-xs space-y-1.5">
          {[
            ['batchNo', '来源侧批次号（可选，缺省由档案系统生成）'],
            ['period', '会计期间 yyyy-MM'],
            ['category', 'voucher | ledger | report | other；混推时省略，按条目类型块识别'],
            ['destination', '去向：auto-archive 直接入库 | to-volume 送组卷 | to-check 送核对工作台·待核对 | to-review 送核对工作台·待审核；缺省用应用默认去向'],
            ['runFourChecks', 'true 时入池后自动运行四性检测'],
            ['items[]', '条目数组（≤500 条/批）'],
          ].map(([f, d]) => (
            <div key={f} className="flex gap-2">
              <span className="font-mono text-sky-700 bg-sky-50 px-1.5 rounded shrink-0">{f}</span>
              <span className="text-slate-500">{d}</span>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">契约字段 · 条目公共</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
              <th className="px-4 py-3 text-left text-[13px] font-semibold">字段</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-16">类型</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-14">必选</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">说明</th>
            </tr>
          </thead>
          <tbody>
            {CONTRACT_COMMON.map((f) => (
              <tr key={f.field} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                <td className="px-4 py-3 font-mono text-[13px] text-slate-800">{f.field}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{f.type}</td>
                <td className="px-4 py-3">
                  <span className={f.required === '必选' ? 'text-red-500 font-medium' : 'text-slate-400'}>{f.required}</span>
                </td>
                <td className="px-4 py-3 text-[13px] text-slate-600">{f.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">契约字段 · 四类特有</h3>
        </div>
        <div className="p-4 space-y-3">
          {CONTRACT_TYPES.map((t) => (
            <div key={t.category}>
              <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-full border mb-1.5 ${t.cls}`}>
                {t.category}
              </span>
              <table className="w-full text-xs">
                <tbody>
                  {t.fields.map((f) => (
                    <tr key={f.field} className="border-b border-slate-50 last:border-0">
                      <td className="py-1 pr-2 font-mono text-slate-700 w-44 align-top">{f.field}</td>
                      <td className="py-1 text-slate-500">
                        <span className={f.required === '必选' ? 'text-red-500' : 'text-slate-400'}>[{f.required}]</span> {f.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* 示例报文 */}
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">批量推送示例报文（含凭证+账簿两类）</h3>
      </div>
      <pre className="p-4 text-xs font-mono bg-slate-900 text-slate-100 overflow-x-auto leading-relaxed">{SAMPLE_PAYLOAD}</pre>
    </div>

    {/* 幂等/错误码 + 保管期限速查 */}
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">幂等与错误码</h3>
        </div>
        <div className="p-4 text-xs text-slate-500 space-y-2">
          <p>以 <span className="font-mono bg-slate-100 px-1 rounded">sourceSystem + externalId</span> 为幂等键，重复推送自动跳过（状态 skipped），业务系统可安全重发整个批次。</p>
          <table className="w-full">
            <tbody>
              {ERROR_CODES.map((e) => (
                <tr key={e.code} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5 pr-3 font-mono text-red-600 w-56 align-top">{e.code}</td>
                  <td className="py-1.5">{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">保管期限速查（三合一表自动带出）</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
              <th className="px-4 py-3 text-left text-[13px] font-semibold">资料类型</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-16">期限</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-24">依据</th>
            </tr>
          </thead>
          <tbody>
            {RETENTION_TABLE.map((r) => (
              <tr key={r.type} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                <td className="px-4 py-3 text-[13px] text-slate-600">{r.type}</td>
                <td className="px-4 py-3">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    r.period === '永久' ? 'bg-red-50 text-red-600' : r.period === '30年' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'
                  }`}>{r.period}</span>
                </td>
                <td className="px-4 py-3 text-[13px] text-slate-600">{r.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════
// Tab3：推送日志
// ═══════════════════════════════════════════════════════════

const LogsTab: React.FC = () => {
  const [logs, setLogs] = useState<PushLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchFilter, setBatchFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    openPushService.logs({ batchNo: batchFilter.trim() || undefined, level: levelFilter || undefined, limit: 300 })
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [batchFilter, levelFilter]);

  useEffect(() => { load(); }, [load]);

  const levelBadge = (lv: string) => {
    if (lv === 'error') return <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">错误</span>;
    if (lv === 'warn') return <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">警告</span>;
    return <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 font-medium">信息</span>;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-sky-600" />
          推送全链路日志
        </h3>
        <span className="text-xs text-slate-400">受理 → 校验 → 映射 → 建件 → 四性 → 去向路由 → 组卷</span>
        <div className="flex-1" />
        <input
          type="text" placeholder="按批次号筛选…" value={batchFilter}
          onChange={(e) => setBatchFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          className="w-48 px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
        />
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}
          className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white">
          <option value="">全部级别</option>
          <option value="info">信息</option>
          <option value="warn">警告</option>
          <option value="error">错误</option>
        </select>
        <button type="button" onClick={load}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
          <RefreshCw className="w-3.5 h-3.5" />刷新
        </button>
      </div>
      {loading ? (
        <div className="px-5 py-12 text-center text-sm text-slate-400">
          <Loader2 className="w-4 h-4 inline animate-spin mr-1.5" />加载日志…
        </div>
      ) : logs.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-slate-400">暂无日志</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-40">时间</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-16">级别</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-40">批次</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-24">环节</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">内容</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{fmtTime(l.createdAt)}</td>
                <td className="px-4 py-3">{levelBadge(l.level)}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{l.batchNo || '—'}</td>
                <td className="px-4 py-3 text-[13px] text-slate-600">{STEP_LABELS[l.step] || l.step}</td>
                <td className="px-4 py-3 text-[13px] text-slate-600">
                  {l.message}
                  {l.detail && <span className="text-slate-400 ml-2" title={l.detail}>{l.detail}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// 模拟推送弹窗
// ═══════════════════════════════════════════════════════════

const SimulateModal: React.FC<{ open: boolean; onClose: () => void; onDone: () => void }> = ({
  open, onClose, onDone,
}) => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [category, setCategory] = useState<PushCategory | 'all'>('all');
  const [count, setCount] = useState(3);
  const [destination, setDestination] = useState<PushDestination>('to-check');
  const [fourChecks, setFourChecks] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) { setRunning(false); setCategory('all'); setCount(3); setDestination('to-check'); setFourChecks(true); }
  }, [open]);

  if (!open) return null;

  const run = async () => {
    setRunning(true);
    try {
      const r = await openPushService.simulate({ category, count, destination, runFourChecks: fourChecks });
      triggerToast(
        `模拟推送完成：成功 ${r.success} 条、跳过 ${r.skipped ?? 0} 条、失败 ${r.failed} 条${r.route ? '；' + r.route : ''}`,
        r.failed > 0 ? 'warning' : 'success');
      onDone();
      onClose();
    } catch (e) {
      triggerToast('模拟推送失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[520px] bg-white rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-emerald-600" />
            模拟推送（演示）
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed bg-emerald-50 border border-emerald-100 rounded-lg p-3">
            按会计档案规则生成四类仿真样例（记账凭证含分录、账簿四种、报表带期间、其他资料），
            走<span className="font-semibold text-emerald-700">真实的 /open/v1 推送管道</span>入档——
            批次、四性检测、日志、去向流转全部真实可演示。
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">推送类别</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as PushCategory | 'all')}
                className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white">
                <option value="all">四类混合</option>
                <option value="voucher">会计凭证</option>
                <option value="ledger">会计账簿</option>
                <option value="report">财务会计报告</option>
                <option value="other">其他会计资料</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">每类条数（1-10）</span>
              <input type="number" min={1} max={10} value={count}
                onChange={(e) => setCount(Math.min(Math.max(Number(e.target.value) || 1, 1), 10))}
                className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg" />
            </label>
          </div>
          <div>
            <span className="text-xs font-medium text-slate-600">推送去向</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {(Object.entries(DESTINATION_LABELS) as [PushDestination, string][]).map(([v, label]) => (
                <label key={v} className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer text-xs ${
                  destination === v ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'
                }`}>
                  <input type="radio" checked={destination === v} onChange={() => setDestination(v)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={fourChecks} onChange={(e) => setFourChecks(e.target.checked)}
              className="rounded border-slate-300" />
            入池后自动运行四性检测
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">取消</button>
          <button type="button" onClick={run} disabled={running}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
            {running ? '推送中…' : '开始模拟推送'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// 主页面
// ═══════════════════════════════════════════════════════════

const OpenApiReceivePage: React.FC = () => {
  const [tab, setTab] = useState<'monitor' | 'standard' | 'logs'>('monitor');
  const [batches, setBatches] = useState<OpenPushBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [simOpen, setSimOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBatches(await openPushService.batches(50));
      setLoadErr(null);
      // 推送/批次操作会改动收集池与案卷（入池/自动组卷/送审核），同步刷新件域镜像
      // （核对工作台/组卷工作台/档案查询无需手动刷页面，2026-08-16 贯通修复）
      void useArchiveStore.getState().loadRecords();
      void useArchiveStore.getState().loadAllRecords();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const TABS = [
    { key: 'monitor' as const, label: '推送监控', Icon: Activity },
    { key: 'standard' as const, label: '接口标准', Icon: BookOpenText },
    { key: 'logs' as const, label: '推送日志', Icon: ScrollText },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <Activity className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">集成接口采集</h1>
        <span className="text-xs text-slate-400">业务系统推送接入（Push）· 统一四类契约：凭证/账簿/报表/其他</span>
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">已上线</span>
        <div className="flex-1" />
        <button
          type="button" onClick={() => setSimOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
          title="生成四类样例数据，走真实推送管道演示"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          模拟推送
        </button>
        <button
          type="button" onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* Tab */}
      <div className="px-6 pt-3 shrink-0">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                tab === t.key ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'text-slate-500 hover:text-slate-700 border border-transparent'
              }`}
            >
              <t.Icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loadErr && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-xl mb-4">{loadErr}</div>
        )}
        {tab === 'monitor' && <MonitorTab batches={batches} loading={loading} refresh={refresh} />}
        {tab === 'standard' && <StandardTab />}
        {tab === 'logs' && <LogsTab />}
      </div>

      <SimulateModal open={simOpen} onClose={() => setSimOpen(false)} onDone={refresh} />
    </div>
  );
};

export default OpenApiReceivePage;
