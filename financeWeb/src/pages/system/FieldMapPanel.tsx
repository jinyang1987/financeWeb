/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * FieldMapPanel — 连接配置 → 接口字段映射（低代码集成，2026-08-16）
 *
 * 不同财务系统（用友/金蝶/浪潮/自研ERP）推送的原始字段名各不相同。
 * 这里以低代码方式维护「来源系统字段 → 档案标准字段」映射 + 转换规则，
 * 推送数据入档前自动转换，接新财务系统不改代码。
 *
 * 标准字段依据统一推送契约 v2（四类：凭证/账簿/报表/其他）。
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  GitBranch, Plus, Trash2, Save, Loader2, FlaskConical, ShieldCheck, FileJson,
} from 'lucide-react';
import {
  openPushService, type FieldMapConfig, type FieldMappingRule,
} from '../../services/openPushService';
import { useAppStore } from '../../stores/appStore';
import { useAuthStore } from '../../stores/authStore';

// ─── 标准字段注册表（统一推送契约 v2） ───

const STD_FIELDS: { group: string; fields: { id: string; label: string }[] }[] = [
  {
    group: '公共字段',
    fields: [
      { id: 'externalId', label: '来源唯一键 externalId' },
      { id: 'year', label: '会计年度 year' },
      { id: 'month', label: '月份 month' },
      { id: 'retention', label: '保管期限 retention' },
      { id: 'department', label: '部门 department' },
      { id: 'preparer', label: '制单人 preparer' },
      { id: 'summary', label: '摘要 summary' },
      { id: 'amount', label: '金额 amount' },
      { id: 'fondsCode', label: '归档全宗 fondsCode' },
    ],
  },
  {
    group: '凭证特有',
    fields: [
      { id: 'voucherNo', label: '凭证号 voucherNo' },
      { id: 'voucher.voucherWord', label: '凭证字 voucherWord' },
      { id: 'voucher.voucherCategory', label: '凭证类别' },
      { id: 'voucher.entries', label: '分录 entries(JSON)' },
      { id: 'voucher.attachedBillCount', label: '附单据数' },
    ],
  },
  {
    group: '账簿特有',
    fields: [
      { id: 'ledger.ledgerType', label: '账簿类型' },
      { id: 'ledger.subjectCode', label: '科目编码' },
      { id: 'ledger.subjectName', label: '科目名称' },
    ],
  },
  {
    group: '报表特有',
    fields: [
      { id: 'report.reportName', label: '报表名称' },
      { id: 'report.reportPeriod', label: '报告期间（年度/半年度/季度/月度）' },
    ],
  },
  {
    group: '其他资料特有',
    fields: [
      { id: 'other.materialType', label: '资料类别' },
      { id: 'other.materialNo', label: '资料编号' },
    ],
  },
];

const TRANSFORMS: { id: FieldMappingRule['transform']; label: string; desc: string }[] = [
  { id: 'direct', label: '直接取值', desc: '原样映射' },
  { id: 'constant', label: '固定常量', desc: '使用默认值作为固定值' },
  { id: 'divide100', label: '除以100', desc: '金额分→元' },
  { id: 'yearOf', label: '取年份', desc: '从 2026-07 取 2026' },
  { id: 'monthOf', label: '取月份', desc: '从 2026-07 取 07' },
  { id: 'prefix', label: '加前缀', desc: '默认值作为前缀' },
  { id: 'upper', label: '转大写', desc: '字母转大写' },
];

const CATEGORIES = [
  { id: '*', label: '全部类别' },
  { id: 'voucher', label: '凭证' },
  { id: 'ledger', label: '账簿' },
  { id: 'report', label: '报表' },
  { id: 'other', label: '其他' },
];

const SAMPLE_PLACEHOLDER = `{
  "external_id": "KD-2026-0001",
  "fiscal_year": "2026-07",
  "dept": "财务部",
  "desc": "采购办公用品",
  "amt_fen": 137500
}`;

// ─── 主组件 ───

const FieldMapPanel: React.FC = () => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const currentUser = useAuthStore((s) => s.currentUser);
  const [configs, setConfigs] = useState<FieldMapConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<FieldMapConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [newSystem, setNewSystem] = useState('');

  // 试映射
  const [testSample, setTestSample] = useState(SAMPLE_PLACEHOLDER);
  const [testCategory, setTestCategory] = useState('voucher');
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const canManage = currentUser?.roles?.some((r) =>
    ['admin', 'archive_director', 'archivist'].includes(r)) ?? false;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await openPushService.fieldMaps();
      setConfigs(list);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const selectSystem = async (sourceSystem: string) => {
    setSelected(sourceSystem);
    setTestResult(null);
    setTestErr(null);
    try {
      const cfg = await openPushService.fieldMap(sourceSystem);
      setDraft({ ...cfg, mappings: (cfg.mappings || []).map((m) => ({ ...m })) });
    } catch (e) {
      setDraft({ sourceSystem, enabled: true, mappings: [] });
    }
  };

  const addSystem = () => {
    const sys = newSystem.trim();
    if (!sys) { triggerToast('请输入来源系统标识', 'warning'); return; }
    setNewSystem('');
    setSelected(sys);
    setDraft({ sourceSystem: sys, enabled: true, mappings: [] });
  };

  const updateRule = (idx: number, patch: Partial<FieldMappingRule>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      mappings: draft.mappings.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await openPushService.saveFieldMap(draft.sourceSystem, {
        enabled: draft.enabled,
        mappings: draft.mappings,
      });
      triggerToast(`「${draft.sourceSystem}」字段映射已保存`, 'success');
      await refresh();
    } catch (e) {
      triggerToast('保存失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!draft) return;
    setTesting(true);
    setTestErr(null);
    setTestResult(null);
    try {
      const sample = JSON.parse(testSample) as Record<string, unknown>;
      const r = await openPushService.testFieldMap({
        mappings: draft.mappings, category: testCategory, sample,
      });
      setTestResult(r);
    } catch (e) {
      setTestErr(e instanceof Error ? e.message : 'JSON 解析或调用失败');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* 左侧：来源系统列表 */}
      <div className="w-64 shrink-0 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-700">来源系统</div>
          <div className="text-[11px] text-slate-400 mt-0.5">每个业务系统一份映射配置</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {configs.length === 0 && !loading && (
            <div className="text-xs text-slate-400 text-center py-8">暂无映射配置<br />下方输入系统标识新建</div>
          )}
          {configs.map((c) => (
            <button
              key={c.sourceSystem}
              type="button"
              onClick={() => selectSystem(c.sourceSystem)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                selected === c.sourceSystem
                  ? 'bg-sky-50 border border-sky-200 text-sky-700'
                  : 'hover:bg-slate-50 border border-transparent text-slate-600'
              }`}
            >
              <div className="font-mono font-medium">{c.sourceSystem}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {c.mappingCount ?? c.mappings?.length ?? 0} 条规则 · {c.enabled ? '已启用' : '未启用'}
              </div>
            </button>
          ))}
        </div>
        {canManage && (
          <div className="p-2 border-t border-slate-100 flex gap-1.5">
            <input
              type="text" value={newSystem}
              onChange={(e) => setNewSystem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSystem()}
              placeholder="如 kingdee / inspur"
              className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <button
              type="button" onClick={addSystem}
              className="px-2 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 右侧：映射编辑 */}
      <div className="flex-1 min-w-0 overflow-y-auto space-y-4">
        {loadErr && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-xl">{loadErr}</div>
        )}
        {!canManage && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2.5 rounded-xl">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            当前账号无字段映射配置权限（仅档案管理员/档案主管/系统管理员）。
          </div>
        )}

        {!draft ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white border border-dashed border-slate-300 rounded-xl">
            <GitBranch className="w-8 h-8 mb-2 text-slate-300" />
            <p className="text-sm">选择左侧来源系统，或新建一个系统标识</p>
            <p className="text-xs mt-1">为来源字段 → 档案标准字段建立映射，推送入档时自动转换</p>
          </div>
        ) : (
          <>
            {/* 配置头 */}
            <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex items-center gap-3">
              <GitBranch className="w-4 h-4 text-sky-600" />
              <span className="text-sm font-bold text-slate-800 font-mono">{draft.sourceSystem}</span>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer ml-2">
                <input
                  type="checkbox" checked={draft.enabled} disabled={!canManage}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                  className="rounded border-slate-300"
                />
                启用映射（未启用则按标准格式直收）
              </label>
              <div className="flex-1" />
              {canManage && (
                <button
                  type="button" onClick={save} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  保存配置
                </button>
              )}
            </div>

            {/* 映射规则表 */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-slate-700">映射规则</span>
                  <span className="text-xs text-slate-400 ml-2">{draft.mappings.length} 条</span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setDraft({
                      ...draft,
                      mappings: [...draft.mappings,
                        { category: '*', stdField: '', sourcePath: '', transform: 'direct', defaultValue: '' }],
                    })}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100"
                  >
                    <Plus className="w-3 h-3" />
                    添加规则
                  </button>
                )}
              </div>
              <div className="px-3 py-2">
                <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold text-slate-500">
                  <span className="w-20 shrink-0">适用类别</span>
                  <span className="w-48 shrink-0">档案标准字段</span>
                  <span className="flex-1">来源字段路径（支持 a.b 嵌套）</span>
                  <span className="w-28 shrink-0">转换规则</span>
                  <span className="w-28 shrink-0">默认值/常量</span>
                  <span className="w-7 shrink-0"></span>
                </div>
                {draft.mappings.length === 0 && (
                  <div className="text-xs text-slate-400 text-center py-6">
                    暂无规则 — 点「添加规则」建立第一条映射
                  </div>
                )}
                {draft.mappings.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-2 py-1.5 border-t border-slate-50">
                    <select
                      value={m.category} disabled={!canManage}
                      onChange={(e) => updateRule(idx, { category: e.target.value })}
                      className="w-20 shrink-0 px-1.5 py-1 text-xs border border-slate-300 rounded-md bg-white"
                    >
                      {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <select
                      value={m.stdField} disabled={!canManage}
                      onChange={(e) => updateRule(idx, { stdField: e.target.value })}
                      className="w-48 shrink-0 px-1.5 py-1 text-xs border border-slate-300 rounded-md bg-white"
                    >
                      <option value="">（选择标准字段）</option>
                      {STD_FIELDS.map((g) => (
                        <optgroup key={g.group} label={g.group}>
                          {g.fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <input
                      type="text" value={m.sourcePath} disabled={!canManage}
                      onChange={(e) => updateRule(idx, { sourcePath: e.target.value })}
                      placeholder="如 header.voucherNo"
                      className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
                    />
                    <select
                      value={m.transform} disabled={!canManage}
                      onChange={(e) => updateRule(idx, { transform: e.target.value as FieldMappingRule['transform'] })}
                      className="w-28 shrink-0 px-1.5 py-1 text-xs border border-slate-300 rounded-md bg-white"
                      title={TRANSFORMS.find((t) => t.id === m.transform)?.desc}
                    >
                      {TRANSFORMS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <input
                      type="text" value={m.defaultValue} disabled={!canManage}
                      onChange={(e) => updateRule(idx, { defaultValue: e.target.value })}
                      placeholder="—"
                      className="w-28 shrink-0 px-2 py-1 text-xs border border-slate-300 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
                    />
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, mappings: draft.mappings.filter((_, i) => i !== idx) })}
                        className="w-7 shrink-0 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 映射测试 */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-slate-700">映射测试</span>
                <span className="text-xs text-slate-400">粘贴来源系统的样例 JSON，实时查看转换后的标准条目</span>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-slate-500">样例条目（来源格式）</span>
                    <select
                      value={testCategory}
                      onChange={(e) => setTestCategory(e.target.value)}
                      className="px-2 py-0.5 text-xs border border-slate-300 rounded-md bg-white"
                    >
                      {CATEGORIES.filter((c) => c.id !== '*').map((c) => (
                        <option key={c.id} value={c.id}>{c.label}类</option>
                      ))}
                    </select>
                    <button
                      type="button" onClick={runTest} disabled={testing || !canManage}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
                      试映射
                    </button>
                  </div>
                  <textarea
                    value={testSample}
                    onChange={(e) => setTestSample(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300"
                    placeholder={SAMPLE_PLACEHOLDER}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-2">转换结果（标准契约格式）</div>
                  {testErr && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg">{testErr}</div>
                  )}
                  {testResult && (
                    <pre className="w-full h-44 overflow-auto px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                      <FileJson className="w-3.5 h-3.5 inline mr-1 text-sky-500" />
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  )}
                  {!testResult && !testErr && (
                    <div className="h-44 flex items-center justify-center text-xs text-slate-300 border border-dashed border-slate-200 rounded-lg">
                      点击「试映射」查看转换结果
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FieldMapPanel;
