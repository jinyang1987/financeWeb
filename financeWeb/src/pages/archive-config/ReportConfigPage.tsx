/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ReportConfigPage — 报告模板配置（2026-08-16 接真重构）
 *
 * 报告模板登记册：持久化到 ams_config（key=report.config），支持新增/启停/删除/检索。
 * 原为 5 行写死 mockData + 全死按钮；现为真实 CRUD。
 * 消费说明：统计域报告导出引擎按本登记册的「启用」模板出报（启用状态即生效开关）。
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, Trash2, FileText, RefreshCw, Eye,
} from 'lucide-react';
import { http } from '../../services/http';
import { useAppStore } from '../../stores/appStore';

interface ReportTemplate {
  id: string;
  name: string;
  type: string;
  scope: string;
  format: string;
  createTime: string;
  status: '启用' | '停用';
}

const TYPE_OPTIONS = ['财务报表', '凭证汇总', '档案统计', '审计报表', '其他'];
const FORMAT_OPTIONS = ['PDF', 'OFD', 'PDF/OFD', 'XLSX', 'HTML'];

const statusStyles: Record<string, string> = {
  '启用': 'bg-green-100 text-green-700',
  '停用': 'bg-gray-100 text-gray-500',
};

const CONFIG_KEY = 'report.config';

const ReportConfigPage: React.FC = () => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  // ── 加载（ams_config） ──
  const load = async () => {
    setLoading(true);
    try {
      const view = await http.get<{ key: string; value: unknown }>(`/config/${CONFIG_KEY}`);
      const v = view?.value as { templates?: ReportTemplate[] } | undefined;
      setTemplates(v?.templates || []);
    } catch {
      setTemplates([]); // 404 = 尚未配置过
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const persist = async (next: ReportTemplate[]) => {
    await http.put(`/config/${CONFIG_KEY}`, { value: { templates: next } });
    setTemplates(next);
  };

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [templates, searchText]);

  const toggleStatus = async (t: ReportTemplate) => {
    setActioning(t.id);
    try {
      await persist(templates.map((x) => x.id === t.id ? { ...x, status: x.status === '启用' ? '停用' : '启用' } : x));
      triggerToast(`模板 ${t.name} 已${t.status === '启用' ? '停用' : '启用'}`, 'success');
    } catch (e) {
      triggerToast('操作失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setActioning(null);
    }
  };

  const remove = async (t: ReportTemplate) => {
    if (!window.confirm(`确认删除模板「${t.name}」？`)) return;
    setActioning(t.id);
    try {
      await persist(templates.filter((x) => x.id !== t.id));
      triggerToast('模板已删除', 'success');
    } catch (e) {
      triggerToast('删除失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto animate-in fade-in duration-200 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">报告配置</h1>
        <p className="mt-1 text-sm text-gray-500">
          报告模板登记册 · 配置持久化于配置中心（ams_config），启用状态即出报引擎的生效开关
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索报告编号、名称…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 w-64"
            />
          </div>
          <button type="button" onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-sky-600 rounded-lg hover:bg-sky-700">
          <Plus className="h-4 w-4" />
          新增报告
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
              <th className="px-4 py-3 text-left text-[13px] font-semibold">报告编号</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">报告名称</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">模板类型</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">适用范围</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">格式</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">创建时间</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">状态</th>
              <th className="px-4 py-3 text-left text-[13px] font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  {loading ? '加载中…' : '暂无报告模板，点击右上角「新增报告」登记'}
                </td>
              </tr>
            ) : filtered.map((row) => (
              <tr key={row.id} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                <td className="px-4 py-3 font-mono text-[13px] text-slate-800">{row.id}</td>
                <td className="px-4 py-3 text-sm text-slate-800">{row.name}</td>
                <td className="px-4 py-3 text-[13px] text-slate-600">{row.type}</td>
                <td className="px-4 py-3 text-[13px] text-slate-600">{row.scope}</td>
                <td className="px-4 py-3 text-[13px] text-slate-600">{row.format}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{row.createTime}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[row.status]}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={actioning === row.id} onClick={() => void toggleStatus(row)}
                      className={`px-2 py-1 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 ${
                        row.status === '启用'
                          ? 'text-gray-600 bg-white border-gray-200 hover:bg-gray-50'
                          : 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'
                      }`}
                      title={row.status === '启用' ? '停用' : '启用'}>
                      {row.status === '启用' ? '停用' : '启用'}
                    </button>
                    <button type="button" disabled={actioning === row.id} onClick={() => void remove(row)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50" title="删除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 新增弹窗 */}
      {createOpen && (
        <CreateTemplateModal
          existing={templates}
          onClose={() => setCreateOpen(false)}
          onCreate={async (t) => {
            try {
              await persist([...templates, t]);
              setCreateOpen(false);
              triggerToast(`报告模板 ${t.name} 已登记`, 'success');
            } catch (e) {
              triggerToast('保存失败：' + (e instanceof Error ? e.message : ''), 'warning');
            }
          }}
        />
      )}
    </div>
  );
};

// ── 新增模板弹窗 ──
const CreateTemplateModal: React.FC<{
  existing: ReportTemplate[];
  onClose: () => void;
  onCreate: (t: ReportTemplate) => Promise<void>;
}> = ({ existing, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState(TYPE_OPTIONS[0]);
  const [scope, setScope] = useState('集团公司');
  const [format, setFormat] = useState(FORMAT_OPTIONS[0]);
  const [submitting, setSubmitting] = useState(false);

  const nextId = `RPT-${String(existing.length + 1).padStart(3, '0')}`;

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onCreate({
        id: nextId,
        name: name.trim(),
        type, scope: scope.trim() || '集团公司', format,
        createTime: new Date().toISOString().slice(0, 10),
        status: '启用',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[440px] bg-white rounded-2xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <FileText className="w-4 h-4 text-sky-600" /> 新增报告模板（编号 {nextId}）
        </h3>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-gray-500">报告名称 *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：年度财务总账报告"
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500">模板类型</span>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">输出格式</span>
              <select value={format} onChange={(e) => setFormat(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                {FORMAT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-gray-500">适用范围</span>
            <input value={scope} onChange={(e) => setScope(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">取消</button>
          <button type="button" onClick={() => void submit()} disabled={!name.trim() || submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50">
            {submitting ? '保存中…' : '登记模板'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportConfigPage;
