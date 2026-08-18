/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * OpenAppManagePage — 系统管理 → 推送接入应用（2026-08-09）
 *
 * 为业务系统（报销/发票/资金等事件驱动来源）签发 AppKey/AppSecret，
 * 业务系统持令牌调用 /open/v1/archives 把电子会计资料主动推送入档。
 *
 * 对应后端 OpenApiController（会话认证，仅档案管理员/主管/admin）。
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyRound, Plus, Copy, CheckCircle2, Loader2, ChevronDown, ChevronRight,
  ShieldCheck, Clock,
} from 'lucide-react';
import {
  openPushService, type OpenApp, type OpenAppIssued, type OpenPushBatch, type OpenPushBatchDetail,
} from '../../services/openPushService';
import { useAppStore } from '../../stores/appStore';
import { useAuthStore } from '../../stores/authStore';

// ─── 签发弹窗 ───

const CreateAppModal: React.FC<{ open: boolean; onClose: () => void; onCreated: () => void }> = ({
  open, onClose, onCreated,
}) => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [form, setForm] = useState({
    appName: '', sourceSystem: '', fondsCode: 'Z001', remark: '',
    defaultDestination: 'to-volume' as 'auto-archive' | 'to-volume' | 'to-check' | 'to-review',
  });
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<OpenAppIssued | null>(null);

  useEffect(() => {
    if (!open) {
      setIssued(null);
      setForm({ appName: '', sourceSystem: '', fondsCode: 'Z001', remark: '', defaultDestination: 'to-volume' });
    }
  }, [open]);

  if (!open) return null;

  const issue = async () => {
    if (!form.appName.trim() || !form.sourceSystem.trim()) {
      triggerToast('应用名称 / 来源系统 不能为空', 'warning');
      return;
    }
    setIssuing(true);
    try {
      const app = await openPushService.createApp({
        appName: form.appName.trim(),
        sourceSystem: form.sourceSystem.trim(),
        fondsCode: form.fondsCode,
        remark: form.remark,
        defaultDestination: form.defaultDestination,
      });
      setIssued(app);
      triggerToast('接入应用已签发', 'success');
      onCreated();
    } catch (e) {
      triggerToast('签发失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setIssuing(false);
    }
  };

  const copyAll = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(
        `appKey: ${issued.appKey}\nappSecret: ${issued.appSecret}\nPOST /open/v1/token\nPOST /open/v1/archives`
      );
      triggerToast('已复制到剪贴板', 'success');
    } catch { triggerToast('复制失败，请手动复制', 'warning'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[480px] max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-sky-600" />
            {issued ? '签发成功' : '签发推送接入应用'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
        </div>

        {issued ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" />
              应用「{issued.appName}」已创建
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 font-mono text-xs">
              <div>
                <div className="text-slate-400 text-[11px]">AppKey</div>
                <div className="text-slate-800 break-all">{issued.appKey}</div>
              </div>
              <div>
                <div className="text-slate-400 text-[11px]">AppSecret（仅此一次，请妥善保存）</div>
                <div className="text-amber-700 break-all">{issued.appSecret}</div>
              </div>
            </div>
            <div className="text-xs text-slate-500 leading-relaxed bg-sky-50 border border-sky-100 rounded-lg p-3">
              <p className="font-medium text-sky-700 mb-1">业务系统推送方式</p>
              <p className="font-mono">POST /api/ams/open/v1/token&nbsp;&nbsp;{'{ appKey, appSecret }'}</p>
              <p className="font-mono mt-1">POST /api/ams/open/v1/archives&nbsp;&nbsp;（Bearer 令牌）</p>
              <p className="mt-1">推送数据入「{issued.fondsCode}」全宗收集池，可走审核库→组卷或直接组卷。</p>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button type="button" onClick={copyAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100">
                <Copy className="w-3.5 h-3.5" /> 复制凭据
              </button>
              <button type="button" onClick={onClose}
                className="px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700">
                完成
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">应用名称</span>
              <input
                type="text" value={form.appName}
                onChange={(e) => setForm({ ...form, appName: e.target.value })}
                placeholder="如：财务共享报销系统、电子发票平台"
                className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">来源系统标识</span>
              <input
                type="text" value={form.sourceSystem}
                onChange={(e) => setForm({ ...form, sourceSystem: e.target.value })}
                placeholder="如：erp-reimburse / invoice / bank-flow"
                className="mt-1 w-full px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">默认归档全宗</span>
                <input
                  type="text" value={form.fondsCode}
                  onChange={(e) => setForm({ ...form, fondsCode: e.target.value })}
                  placeholder="Z001"
                  className="mt-1 w-full px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">默认去向</span>
                <select
                  value={form.defaultDestination}
                  onChange={(e) => setForm({ ...form, defaultDestination: e.target.value as typeof form.defaultDestination })}
                  className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="to-volume">送组卷工作台</option>
                  <option value="auto-archive">直接入库·自动组卷</option>
                  <option value="to-check">送核对工作台 · 待核对</option>
                  <option value="to-review">送核对工作台 · 待审核</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">备注</span>
              <textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
                className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </label>
            <div className="flex items-center gap-2 justify-end pt-2">
              <button type="button" onClick={onClose}
                className="px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">取消</button>
              <button type="button" onClick={issue} disabled={issuing}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50">
                {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                签发
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── 批次详情 ───

const BatchDetail: React.FC<{ batchNo: string }> = ({ batchNo }) => {
  const [detail, setDetail] = useState<OpenPushBatchDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    openPushService.batchDetail(batchNo)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [batchNo]);

  if (loading) return <div className="px-4 py-3 text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />加载明细…</div>;
  if (!detail || detail.items.length === 0) return <div className="px-4 py-3 text-xs text-slate-400">本批次无明细记录</div>;

  return (
    <div className="px-4 py-3 bg-slate-50">
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-36">来源单号</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-28">凭证号</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">摘要</th>
              <th className="px-4 py-3 text-right text-[13px] font-semibold w-28">金额</th>
              <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">状态</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold w-44">档号 / 说明</th>
            </tr>
          </thead>
          <tbody>
            {detail.items.map((it) => (
              <tr key={it.id} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{it.external_id || '—'}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-slate-800">{it.voucher_no || '—'}</td>
                <td className="px-4 py-3 text-[13px] text-slate-600 max-w-[200px] truncate" title={it.summary}>{it.summary || '—'}</td>
                <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-800">{it.amount != null ? it.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  {it.status === 'success'
                    ? <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">已入池</span>
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
  );
};

// ─── 主页面 ───

const OpenAppManagePage: React.FC = () => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const currentUser = useAuthStore((s) => s.currentUser);
  const [apps, setApps] = useState<OpenApp[]>([]);
  const [batches, setBatches] = useState<OpenPushBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  const canManage = currentUser?.roles?.some((r) =>
    ['admin', 'archive_director', 'archivist'].includes(r)) ?? false;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([openPushService.apps(), openPushService.batches(30)]);
      setApps(a);
      setBatches(b);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const batchStatus: Record<string, { label: string; cls: string }> = {
    accepted: { label: '已受理', cls: 'bg-sky-100 text-sky-700' },
    processing: { label: '处理中', cls: 'bg-amber-100 text-amber-700' },
    success: { label: '成功', cls: 'bg-green-100 text-green-700' },
    partial: { label: '部分成功', cls: 'bg-amber-100 text-amber-700' },
    failed: { label: '失败', cls: 'bg-red-100 text-red-700' },
  };

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200">
        <KeyRound className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">推送接入应用</h1>
        <span className="text-xs text-slate-400">业务系统 AppKey/AppSecret 签发 · 推送入档管理</span>
        <div className="flex-1" />
        {canManage && (
          <button
            type="button" onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700"
          >
            <Plus className="w-4 h-4" />
            签发应用
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {loadErr && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-xl">{loadErr}</div>
        )}
        {!canManage && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5 rounded-xl">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            当前账号无推送接入管理权限（仅档案管理员/档案主管/系统管理员）。
          </div>
        )}

        {/* 接入应用 */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">接入应用</h3>
            <span className="text-xs text-slate-400">{apps.length} 个</span>
          </div>
          {apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <KeyRound className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-sm">暂无接入应用</p>
              <p className="text-xs mt-1">为业务系统签发 AppKey/AppSecret，即可调用推送接口入档</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {apps.map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${a.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                      {a.appName}
                      <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${a.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {a.status === 'active' ? '启用' : '停用'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-mono">{a.appKey}</span>
                      <span>·</span>
                      <span>来源 {a.sourceSystem}</span>
                      <span>·</span>
                      <span>全宗 {a.fondsCode}</span>
                      {a.createdAt && <span>· 签发 {a.createdAt?.replace('T', ' ').slice(0, 19)}</span>}
                    </div>
                  </div>
                  {canManage && (
                    <label className="flex items-center gap-1.5 shrink-0" title="该应用推送的数据默认流向（推送方可在报文中覆盖）">
                      <span className="text-[11px] text-slate-400">默认去向</span>
                      <select
                        value={a.defaultDestination || 'to-volume'}
                        onChange={async (e) => {
                          try {
                            await openPushService.updateAppDestination(
                              a.id, e.target.value as NonNullable<OpenApp['defaultDestination']>);
                            triggerToast('默认去向已更新', 'success');
                            refresh();
                          } catch (err) {
                            triggerToast('更新失败：' + (err instanceof Error ? err.message : ''), 'warning');
                          }
                        }}
                        className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="to-volume">送组卷工作台</option>
                        <option value="auto-archive">直接入库·自动组卷</option>
                        <option value="to-check">送核对工作台</option>
                        <option value="to-review">送审核</option>
                      </select>
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 推送批次 */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">推送批次历史</h3>
            <span className="text-xs text-slate-400">{batches.length} 个批次</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-44">批次号</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold">应用</th>
                <th className="px-4 py-3 text-center text-[13px] font-semibold w-24">全宗</th>
                <th className="px-4 py-3 text-center text-[13px] font-semibold w-20">状态</th>
                <th className="px-4 py-3 text-right text-[13px] font-semibold w-16">总数</th>
                <th className="px-4 py-3 text-right text-[13px] font-semibold w-16">成功</th>
                <th className="px-4 py-3 text-right text-[13px] font-semibold w-16">失败</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold">说明</th>
                <th className="px-4 py-3 text-center text-[13px] font-semibold w-10"></th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">暂无推送批次</td></tr>
              )}
              {batches.map((b) => {
                const st = batchStatus[b.status] || { label: b.status, cls: 'bg-slate-100 text-slate-600' };
                const expanded = expandedBatch === b.batch_no;
                return (
                  <React.Fragment key={b.batch_no}>
                    <tr
                      className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors cursor-pointer"
                      onClick={() => setExpandedBatch(expanded ? null : b.batch_no)}
                    >
                      <td className="px-4 py-3 font-mono text-[13px] text-slate-800">{b.batch_no}</td>
                      <td className="px-4 py-3 text-sm text-slate-800">{b.app_name || '—'}<div className="text-[10px] text-slate-400">{b.source_system || ''}</div></td>
                      <td className="px-4 py-3 text-center font-mono text-[13px] text-slate-600">{b.fonds_code}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-600">{b.total_count}</td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-green-600">{b.success_count}</td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] text-red-600">{b.fail_count}</td>
                      <td className="px-4 py-3 text-[13px] text-slate-600 max-w-[240px] truncate" title={b.message || ''}>{b.message || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </td>
                    </tr>
                    {expanded && (
                      <tr><td colSpan={9} className="p-0"><BatchDetail batchNo={b.batch_no} /></td></tr>
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
            <Clock className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
            <div className="text-xs text-sky-800 space-y-1">
              <p className="font-medium">业务系统推送接入说明</p>
              <p>① 在此签发 AppKey/AppSecret → ② 业务系统用凭据调 <span className="font-mono">POST /api/ams/open/v1/token</span> 换令牌 → ③ 携带 Bearer 令牌调 <span className="font-mono">POST /api/ams/open/v1/archives</span>（单件）或 <span className="font-mono">/archives/batch</span>（批量）推送电子会计资料 → ④ 数据入目标全宗收集池，走「审核库→组卷」或「直接组卷」。</p>
              <p>幂等保障：以来源系统 externalId 去重，重复推送自动跳过。</p>
            </div>
          </div>
        </div>
      </div>

      <CreateAppModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refresh} />
    </div>
  );
};

export default OpenAppManagePage;
