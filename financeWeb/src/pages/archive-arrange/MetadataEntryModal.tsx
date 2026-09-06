/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * MetadataEntryModal — 组卷工作台 · 元数据录入（2026-08-25；2026-08-29 T8/T9 重构扩展）
 *
 * 两种模式：
 *   卷模式：左卷内件列表，右表单；顶部案卷级元数据（含 T9 卷级缺项 V11/V12/V15/V16/V18/V20）。
 *   池模式（T8 收集池散件编辑入口）：volume=null + poolRecords，左侧为收集池选中件。
 *
 * 件级表单按凭证类别分流（T8 原始凭证录入界面）：
 *   - 原始凭证件：公共票面字段 + 按 docTypeCode 从 SOURCE_DOC_TYPE_TREE/FIELD_SETS
 *     解析「113 类型字段集」动态渲染扩展字段（值存 finance:srcDocExtFields JSON）；
 *   - 记账凭证/其他件：既有 17 字段白名单表单。
 * 保存走 PUT /records/{id}/metadata（后端白名单同构；旧值/新值由服务端落审计日志）。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, Loader2, FileText, ChevronLeft } from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import { useVolumeStore } from '../../stores/volumeStore';
import { updateRecordMetadata, type RecordMetadataPatch } from '../../services/recordService';
import { useAppStore } from '../../stores/appStore';
import type { Volume, VolumeItem } from '../../types/volume';
import type { ArchiveRecord } from '../../types';
import {
  SOURCE_DOC_TYPE_TREE, FIELD_SETS,
  type SourceDocTypeNode, type SourceDocExtFieldDef,
} from '../../types/sourceDocument';

interface MetadataEntryModalProps {
  open: boolean;
  /** 卷模式必传；池模式传 null */
  volume: Volume | null;
  /** 卷模式：卷内件列表 */
  items: VolumeItem[];
  /** 池模式（T8）：收集池可编辑件列表（优先显示勾选件） */
  poolRecords?: ArchiveRecord[];
  /** 弹窗标题（池模式展示用） */
  title?: string;
  onClose: () => void;
  /** 保存成功后的回调（父组件刷新卷内件/件域镜像） */
  onSaved: () => void;
}

const RETENTION_OPTIONS = ['30年', '10年', '永久'];
const SECURITY_OPTIONS = ['普通', '内部', '秘密', '机密'];
const CARRIER_OPTIONS: { value: string; label: string }[] = [
  { value: 'electronic', label: '电子' },
  { value: 'paper', label: '纸质' },
  { value: 'mixed', label: '混合' },
];
const VOUCHER_WORD_OPTIONS = ['记', '收', '付', '转'];
const VOUCHER_CATEGORY_OPTIONS = ['收款凭证', '付款凭证', '转账凭证', '通用记账凭证', '原始凭证'];
const BUSINESS_CATEGORY_OPTIONS = ['采购', '销售', '费用', '资产', '薪酬', '存货', '资金', '结算', '特殊'];

/** 件级表单草稿（白名单字段 + srcDoc 扩展） */
interface ItemDraft extends RecordMetadataPatch {}

/** 原始凭证判定（与后端 isSourceDocEntry 同口径） */
function isSourceDocRecord(r: ArchiveRecord): boolean {
  return r.voucherCategory === '原始凭证' || !!r.docTypeCode;
}

/** 展平原始凭证类型树（类型下拉用） */
function flattenTypeTree(): { code: string; label: string; name: string }[] {
  const out: { code: string; label: string; name: string }[] = [];
  const walk = (nodes: SourceDocTypeNode[], path: string) => {
    for (const n of nodes) {
      const label = path ? `${path} / ${n.label}` : n.label;
      if (!n.children || n.children.length === 0) out.push({ code: n.code, label, name: n.label });
      if (n.children) walk(n.children, label);
    }
  };
  walk(SOURCE_DOC_TYPE_TREE, '');
  return out;
}
const DOC_TYPE_OPTIONS = flattenTypeTree();

/**
 * 解析某类型的全部扩展字段定义（T8「按 113 类型字段集动态渲染」）：
 * fieldSetRefs 展开字段集 → 应用 excludeFields 剔除与 fieldOverrides 覆写 → 追加类型特有 extFieldDefs。
 */
function resolveExtFieldDefs(docTypeCode: string): SourceDocExtFieldDef[] {
  let node: SourceDocTypeNode | null = null;
  const walk = (nodes: SourceDocTypeNode[]) => {
    for (const n of nodes) {
      if (n.code === docTypeCode) { node = n; return; }
      if (n.children) walk(n.children);
      if (node) return;
    }
  };
  walk(SOURCE_DOC_TYPE_TREE);
  if (!node) return [];
  const n = node as SourceDocTypeNode;
  const defs: SourceDocExtFieldDef[] = [];
  const seen = new Set<string>();
  for (const ref of n.fieldSetRefs || []) {
    for (const f of FIELD_SETS[ref]?.fields || []) {
      if (n.excludeFields?.includes(f.key)) continue;
      const ov = n.fieldOverrides?.[f.key];
      defs.push(ov ? { ...f, ...ov } : f);
      seen.add(f.key);
    }
  }
  for (const f of n.extFieldDefs || []) {
    if (!seen.has(f.key)) defs.push(f);
  }
  return defs;
}

/** 记账凭证/其他件的通用字段定义（顺序即展示顺序） */
const FIELD_DEFS: Array<{
  key: keyof ItemDraft;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  options?: string[];
  placeholder?: string;
}> = [
  { key: 'voucherNo', label: '凭证号', type: 'text', placeholder: '如 记-001' },
  { key: 'voucherCategory', label: '凭证类别', type: 'select', options: VOUCHER_CATEGORY_OPTIONS },
  { key: 'voucherWord', label: '凭证字', type: 'select', options: VOUCHER_WORD_OPTIONS },
  { key: 'voucherDate', label: '制单日期', type: 'text', placeholder: 'yyyy-MM-dd' },
  { key: 'year', label: '会计年度', type: 'number' },
  { key: 'month', label: '月份', type: 'number' },
  { key: 'amount', label: '金额（元）', type: 'number' },
  { key: 'archiveType', label: '档案类型', type: 'text' },
  { key: 'department', label: '经办部门', type: 'text' },
  { key: 'preparer', label: '制单人', type: 'text' },
  { key: 'auditor', label: '审核人', type: 'text' },
  { key: 'tallyMan', label: '出纳人', type: 'text' },
  { key: 'retention', label: '保管期限', type: 'select', options: RETENTION_OPTIONS },
  { key: 'securityLevel', label: '密级', type: 'select', options: SECURITY_OPTIONS },
  { key: 'carrierType', label: '载体形式', type: 'select', options: CARRIER_OPTIONS.map((c) => c.value) },
  { key: 'summary', label: '摘要', type: 'textarea', placeholder: '内容摘要（落库到文件描述）' },
  { key: 'remarks', label: '题名/备注', type: 'textarea' },
];

const inputCls = 'mt-0.5 w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-200';
const labelCls = 'text-xs font-medium text-slate-600';

const MetadataEntryModal: React.FC<MetadataEntryModalProps> = ({ open, volume, items, poolRecords, title, onClose, onSaved }) => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const records = useArchiveStore((s) => s.records);
  const allRecords = useArchiveStore((s) => s.allRecords);
  const updateVolume = useVolumeStore((s) => s.updateVolume);

  const poolMode = !volume && !!poolRecords;
  /** 池模式的可编辑件（保持传入顺序：勾选件在前） */
  const poolItems = useMemo(() => poolRecords || [], [poolRecords]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  /** srcDoc 扩展字段值（key → 字符串值；保存时 JSON 序列化） */
  const [extDraft, setExtDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // 案卷级草稿
  const [volTitle, setVolTitle] = useState('');
  const [volRetention, setVolRetention] = useState('');
  const [volDateFrom, setVolDateFrom] = useState('');
  const [volDateTo, setVolDateTo] = useState('');
  const [volSecurity, setVolSecurity] = useState('');
  const [volCarrier, setVolCarrier] = useState('');
  // T9 卷级缺项
  const [volTotalPages, setVolTotalPages] = useState('');
  const [volPageStart, setVolPageStart] = useState('');
  const [volPageEnd, setVolPageEnd] = useState('');
  const [volEstablishingUnit, setVolEstablishingUnit] = useState('');
  const [volChecker, setVolChecker] = useState('');
  const [volCheckDate, setVolCheckDate] = useState('');
  const [volScanned, setVolScanned] = useState(false);
  const [volRemarks, setVolRemarks] = useState('');

  /** 记录解析：优先池内镜像，回退全量件镜像 */
  const recordById = useMemo(() => {
    const m = new Map<string, ArchiveRecord>();
    for (const r of allRecords) m.set(r.id, r);
    for (const r of records) m.set(r.id, r);
    for (const r of poolItems) m.set(r.id, r);
    return m;
  }, [records, allRecords, poolItems]);

  const recOf = (id: string | null) => (id ? recordById.get(id) : undefined);
  const selectedRec = recOf(selectedId);
  const selectedIsSrcDoc = !!selectedRec && isSourceDocRecord(selectedRec);
  /** 当前选中件的类型扩展字段定义（原始凭证件） */
  const extDefs = useMemo(
    () => (selectedRec?.docTypeCode ? resolveExtFieldDefs(selectedRec.docTypeCode) : []),
    [selectedRec?.docTypeCode],
  );

  /** 原始凭证件草稿：公共票面字段 + extFields JSON 解析 */
  function srcDocDraftOf(r: ArchiveRecord): { draft: ItemDraft; ext: Record<string, string> } {
    let ext: Record<string, string> = {};
    try {
      const parsed = r.srcDocExtFields ? JSON.parse(r.srcDocExtFields) : {};
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (k.startsWith('_')) continue; // _xmlParsed/_signaturePresent 等系统标记不进表单
          ext[k] = v == null ? '' : String(v);
        }
      }
    } catch { /* 旧值非 JSON 时按空处理 */ }
    return {
      draft: {
        voucherNo: r.voucherNo || '',
        voucherCategory: r.voucherCategory || '原始凭证',
        voucherDate: r.voucherDate || '',
        year: parseInt(r.year, 10) || undefined,
        month: parseInt(r.month, 10) || undefined,
        amount: r.amount || undefined,
        department: r.department || '',
        preparer: r.preparer || '',
        auditor: r.auditor || '',
        retention: r.retention || '',
        securityLevel: r.securityLevel || '',
        carrierType: r.carrierType || '',
        archiveType: r.archiveType || '',
        remarks: r.remarks || '',
        docTypeCode: r.docTypeCode || '',
        docTypeName: r.docTypeName || '',
        documentNo: r.documentNo || '',
        counterpartyName: r.counterpartyName || '',
        counterpartyTaxId: r.srcDocCounterpartyTaxId || '',
        srcDocSummary: r.srcDocSummary || r.summary || '',
        amountUpper: r.srcDocAmountUpper || '',
        businessCategory: r.srcDocBusinessCategory || '',
      },
      ext,
    };
  }

  // 打开时初始化：选中第一件 + 案卷级字段
  useEffect(() => {
    if (!open) return;
    const first = poolMode ? poolItems[0]?.id : items[0]?.recordId || null;
    setSelectedId(first);
    initDraft(first);
    setDirty(false);
    if (volume) {
      setVolTitle(volume.title || '');
      setVolRetention(volume.retention || '');
      setVolDateFrom(volume.dateFrom || '');
      setVolDateTo(volume.dateTo || '');
      setVolSecurity(volume.securityLevel || '');
      setVolCarrier(volume.carrierType || '');
      setVolTotalPages(volume.totalPages ? String(volume.totalPages) : '');
      setVolPageStart(volume.pageStart ? String(volume.pageStart) : '');
      setVolPageEnd(volume.pageEnd ? String(volume.pageEnd) : '');
      setVolEstablishingUnit(volume.establishingUnit || '');
      setVolChecker(volume.checker || '');
      setVolCheckDate(volume.checkDate || '');
      setVolScanned(!!volume.scanned);
      setVolRemarks(volume.remarks || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, volume?.id]);

  const initDraft = (recordId: string | null) => {
    const rec = recOf(recordId);
    if (!rec) { setDraft(null); setExtDraft({}); return; }
    if (isSourceDocRecord(rec)) {
      const { draft: d, ext } = srcDocDraftOf(rec);
      setDraft(d);
      setExtDraft(ext);
    } else {
      setDraft(draftOf(rec));
      setExtDraft({});
    }
  };

  const selectItem = (recordId: string) => {
    setSelectedId(recordId);
    initDraft(recordId);
    setDirty(false);
  };

  const setField = (key: keyof ItemDraft, value: string) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d };
      if (key === 'year' || key === 'month' || key === 'amount' || key === 'attachedBillCount') {
        (next as Record<string, unknown>)[key] = value === '' ? undefined : Number(value);
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
      return next;
    });
    setDirty(true);
  };

  const setExtField = (key: string, value: string) => {
    setExtDraft((e) => ({ ...e, [key]: value }));
    setDirty(true);
  };

  const saveItem = async () => {
    if (!selectedId || !draft || !dirty) return;
    setSaving(true);
    try {
      const patch: RecordMetadataPatch = { ...draft };
      if (selectedIsSrcDoc) {
        // 扩展字段序列化（保留 _xmlParsed 等系统标记）
        let sysMarks: Record<string, unknown> = {};
        try {
          const parsed = selectedRec?.srcDocExtFields ? JSON.parse(selectedRec.srcDocExtFields) : {};
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) if (k.startsWith('_')) sysMarks[k] = v;
          }
        } catch { /* 忽略 */ }
        patch.extFields = JSON.stringify({ ...extDraft, ...sysMarks });
        delete (patch as Record<string, unknown>).summary; // srcDoc 件摘要走 srcDocSummary，避免误覆写 cm:description
      }
      await updateRecordMetadata(selectedId, patch);
      triggerToast('元数据已保存', 'success');
      setDirty(false);
      onSaved();
    } catch (e) {
      triggerToast('保存失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setSaving(false);
    }
  };

  const saveVolume = async () => {
    if (!volume) return;
    setSaving(true);
    try {
      await updateVolume(volume.id, {
        title: volTitle.trim() || volume.title,
        retention: volRetention,
        dateFrom: volDateFrom || undefined,
        dateTo: volDateTo || undefined,
        securityLevel: volSecurity || undefined,
        carrierType: (volCarrier || undefined) as Volume['carrierType'],
        // T9 卷级缺项（服务端仅草稿卷放行；已确认卷保存会 409 提示）
        totalPages: volTotalPages === '' ? undefined : Number(volTotalPages),
        pageStart: volPageStart === '' ? undefined : Number(volPageStart),
        pageEnd: volPageEnd === '' ? undefined : Number(volPageEnd),
        establishingUnit: volEstablishingUnit,
        checker: volChecker,
        checkDate: volCheckDate || undefined,
        scanned: volScanned,
        remarks: volRemarks,
      });
      triggerToast('案卷元数据已保存', 'success');
      onSaved();
    } catch (e) {
      triggerToast('保存失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  /** 左侧列表条目（卷模式=卷内件；池模式=收集池件） */
  const listEntries = poolMode
    ? poolItems.map((r) => ({ id: r.id, itemNo: 0, rec: r }))
    : items.map((it) => ({ id: it.recordId, itemNo: it.itemNo, rec: recOf(it.recordId) }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-[960px] max-w-[94vw] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="w-10 h-10 rounded-full whitespace-nowrap bg-sky-100 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-800">{title || '元数据录入'}</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {poolMode
                ? `收集池散件编辑 · ${poolItems.length} 件`
                : `${volume?.volumeCode || volume?.title || '未命名案卷'} · ${items.length} 件`}
            </p>
          </div>
          <button type="button" onClick={onClose} title="关闭"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 案卷级元数据（仅卷模式） */}
        {!poolMode && volume && (
          <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60 shrink-0 overflow-y-auto" style={{ maxHeight: '40%' }}>
            <div className="text-xs font-semibold text-slate-600 mb-2">案卷级元数据（卷封面）</div>
            <div className="grid grid-cols-6 gap-2">
              <label className="block col-span-2">
                <span className={labelCls}>案卷题名</span>
                <input value={volTitle} onChange={(e) => setVolTitle(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>保管期限</span>
                <select value={volRetention} onChange={(e) => setVolRetention(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {RETENTION_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>起始日期</span>
                <input type="date" value={volDateFrom} onChange={(e) => setVolDateFrom(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>结束日期</span>
                <input type="date" value={volDateTo} onChange={(e) => setVolDateTo(e.target.value)} className={inputCls} />
              </label>
              <div className="flex items-end gap-2">
                <label className="block flex-1">
                  <span className={labelCls}>密级</span>
                  <select value={volSecurity} onChange={(e) => setVolSecurity(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {SECURITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => void saveVolume()} disabled={saving}
                  className="px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 shrink-0">
                  保存卷
                </button>
              </div>
              {/* T9 卷级缺项：V11 页数 / V12 立档单位 / V15 检查人 / V16 检查日期 / V18 数字化 / V20 备注 */}
              <label className="block">
                <span className={labelCls}>卷内页数(V11)</span>
                <input type="number" min={0} value={volTotalPages} onChange={(e) => setVolTotalPages(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>起-止页号</span>
                <div className="flex gap-1">
                  <input type="number" min={0} placeholder="起" value={volPageStart} onChange={(e) => setVolPageStart(e.target.value)} className={inputCls} />
                  <input type="number" min={0} placeholder="止" value={volPageEnd} onChange={(e) => setVolPageEnd(e.target.value)} className={inputCls} />
                </div>
              </label>
              <label className="block">
                <span className={labelCls}>立档单位(V12)</span>
                <input value={volEstablishingUnit} onChange={(e) => setVolEstablishingUnit(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>检查人(V15)</span>
                <input value={volChecker} onChange={(e) => setVolChecker(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>检查日期(V16)</span>
                <input type="date" value={volCheckDate} onChange={(e) => setVolCheckDate(e.target.value)} className={inputCls} />
              </label>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-1.5 pb-2 cursor-pointer">
                  <input type="checkbox" checked={volScanned} onChange={(e) => { setVolScanned(e.target.checked); }} className="rounded accent-sky-600" />
                  <span className={labelCls}>数字化完成(V18)</span>
                </label>
              </div>
              <label className="block col-span-6">
                <span className={labelCls}>案卷备注(V20)</span>
                <input value={volRemarks} onChange={(e) => setVolRemarks(e.target.value)} className={inputCls} placeholder="备考说明（断裂凭证号、特殊情况等）" />
              </label>
            </div>
          </div>
        )}

        {/* 主体：左件列表 / 右字段表单 */}
        <div className="flex-1 min-h-0 flex">
          {/* 左：件列表 */}
          <div className="w-60 shrink-0 border-r border-slate-100 flex flex-col">
            <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-100 shrink-0">
              {poolMode ? `收集池件（${listEntries.length}）· 点击选择录入` : `卷内件（${listEntries.length}）· 点击选择录入`}
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
              {listEntries.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-8">{poolMode ? '无可编辑件' : '卷内无件'}</div>
              )}
              {listEntries.map(({ id, itemNo, rec }) => {
                const active = selectedId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectItem(id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                      active ? 'border-sky-300 bg-sky-50' : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {!poolMode && <span className="text-xs text-slate-400 font-mono shrink-0">#{itemNo}</span>}
                      <span className={`text-xs truncate ${active ? 'text-sky-700 font-medium' : 'text-slate-700'}`}>
                        {rec?.voucherNo || id.slice(0, 10)}
                      </span>
                      {rec && isSourceDocRecord(rec) && (
                        <span className="ml-auto shrink-0 px-1 py-px text-xs rounded whitespace-nowrap bg-amber-100 text-amber-700">原始凭证</span>
                      )}
                    </div>
                    {rec && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate">
                        {[rec.docTypeName || rec.archiveType, rec.year && `${rec.year}年`, rec.retention].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右：字段表单 */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!draft ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                {listEntries.length === 0
                  ? (poolMode ? '无可编辑件' : '卷内无件，请先从左侧待组卷池加件')
                  : '点击左侧件开始录入元数据'}
              </div>
            ) : selectedIsSrcDoc ? (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* 公共票面字段 */}
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-2">票面公共字段（DA/T 95-2022）</div>
                    <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                      <label className="block">
                        <span className={labelCls}>凭证类型</span>
                        <select value={draft.docTypeCode || ''} onChange={(e) => {
                          const opt = DOC_TYPE_OPTIONS.find((o) => o.code === e.target.value);
                          setField('docTypeCode', e.target.value);
                          setField('docTypeName', opt?.name || '');
                        }} className={inputCls}>
                          <option value="">—</option>
                          {DOC_TYPE_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className={labelCls}>单据编号</span>
                        <input value={draft.documentNo || ''} onChange={(e) => setField('documentNo', e.target.value)} className={inputCls} placeholder="发票号/报销单号等" />
                      </label>
                      <label className="block">
                        <span className={labelCls}>业务日期</span>
                        <input value={draft.voucherDate || ''} onChange={(e) => setField('voucherDate', e.target.value)} className={inputCls} placeholder="yyyy-MM-dd" />
                      </label>
                      <label className="block">
                        <span className={labelCls}>对方单位</span>
                        <input value={draft.counterpartyName || ''} onChange={(e) => setField('counterpartyName', e.target.value)} className={inputCls} />
                      </label>
                      <label className="block">
                        <span className={labelCls}>对方税号</span>
                        <input value={draft.counterpartyTaxId || ''} onChange={(e) => setField('counterpartyTaxId', e.target.value)} className={inputCls} />
                      </label>
                      <label className="block">
                        <span className={labelCls}>大写金额</span>
                        <input value={draft.amountUpper || ''} onChange={(e) => setField('amountUpper', e.target.value)} className={inputCls} placeholder="人民币壹仟元整" />
                      </label>
                      <label className="block">
                        <span className={labelCls}>小写金额（元）</span>
                        <input type="number" value={draft.amount ?? ''} onChange={(e) => setField('amount', e.target.value)} className={inputCls} />
                      </label>
                      <label className="block">
                        <span className={labelCls}>业务分类</span>
                        <select value={draft.businessCategory || ''} onChange={(e) => setField('businessCategory', e.target.value)} className={inputCls}>
                          <option value="">—</option>
                          {BUSINESS_CATEGORY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className={labelCls}>会计年度</span>
                        <input type="number" value={draft.year ?? ''} onChange={(e) => setField('year', e.target.value)} className={inputCls} />
                      </label>
                      <label className="block">
                        <span className={labelCls}>会计月份</span>
                        <input type="number" min={1} max={12} value={draft.month ?? ''} onChange={(e) => setField('month', e.target.value)} className={inputCls} />
                      </label>
                      <label className="block">
                        <span className={labelCls}>制单人</span>
                        <input value={draft.preparer || ''} onChange={(e) => setField('preparer', e.target.value)} className={inputCls} />
                      </label>
                      <label className="block">
                        <span className={labelCls}>审核人</span>
                        <input value={draft.auditor || ''} onChange={(e) => setField('auditor', e.target.value)} className={inputCls} />
                      </label>
                      <label className="block col-span-3">
                        <span className={labelCls}>摘要/事由</span>
                        <textarea value={draft.srcDocSummary || ''} onChange={(e) => setField('srcDocSummary', e.target.value)} rows={2} className={`${inputCls} resize-none`} />
                      </label>
                    </div>
                  </div>
                  {/* 类型扩展字段（按类型字段集动态渲染） */}
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-2">
                      类型扩展字段
                      <span className="ml-2 font-normal text-slate-400">
                        {draft.docTypeCode
                          ? extDefs.length > 0
                            ? `「${draft.docTypeName || draft.docTypeCode}」共 ${extDefs.length} 项`
                            : '该类型无扩展字段定义'
                          : '选择凭证类型后按类型字段集展开'}
                      </span>
                    </div>
                    {extDefs.length > 0 && (
                      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                        {extDefs.map((f) => (
                          <label key={f.key} className="block">
                            <span className={labelCls}>
                              {f.label}
                              {f.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                            </span>
                            <input
                              value={extDraft[f.key] ?? ''}
                              onChange={(e) => setExtField(f.key, e.target.value)}
                              className={inputCls}
                              placeholder={f.dataType === 'number' || f.dataType === 'decimal' ? '数值' : f.dataType === 'date' ? 'yyyy-MM-dd' : ''}
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <SaveBar dirty={dirty} saving={saving} onReset={() => selectedId && selectItem(selectedId)} onSave={() => void saveItem()} />
              </>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5">
                  <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                    {FIELD_DEFS.map((f) => (
                      <label key={f.key} className={`block ${f.type === 'textarea' ? 'col-span-3' : ''}`}>
                        <span className={labelCls}>{f.label}</span>
                        {f.type === 'select' ? (
                          <select
                            value={String(draft[f.key] ?? '')}
                            onChange={(e) => setField(f.key, e.target.value)}
                            className={inputCls}
                          >
                            <option value="">—</option>
                            {(f.options || []).map((o) => (
                              <option key={o} value={o}>
                                {f.key === 'carrierType'
                                  ? (CARRIER_OPTIONS.find((c) => c.value === o)?.label || o)
                                  : o}
                              </option>
                            ))}
                          </select>
                        ) : f.type === 'textarea' ? (
                          <textarea
                            value={String(draft[f.key] ?? '')}
                            onChange={(e) => setField(f.key, e.target.value)}
                            rows={2}
                            placeholder={f.placeholder}
                            className={`${inputCls} resize-none`}
                          />
                        ) : (
                          <input
                            type={f.type === 'number' ? 'number' : 'text'}
                            value={String(draft[f.key] ?? '')}
                            onChange={(e) => setField(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            className={inputCls}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-3">
                    仅草稿卷内件与收集池件可录入；确认组卷后元数据即固化，如需修改请先撤销确认。
                  </p>
                </div>
                <SaveBar dirty={dirty} saving={saving} onReset={() => selectedId && selectItem(selectedId)} onSave={() => void saveItem()} />
              </>
            )}
          </div>
        </div>

        {/* 底部关闭（移动端友好） */}
        <div className="shrink-0 border-t border-slate-100 px-6 py-2.5 flex justify-between items-center">
          <button type="button" onClick={onClose}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <ChevronLeft className="w-3.5 h-3.5" />
            {poolMode ? '返回组卷工作台' : '返回组卷工作台'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** 保存条（通用） */
const SaveBar: React.FC<{ dirty: boolean; saving: boolean; onReset: () => void; onSave: () => void }> = ({ dirty, saving, onReset, onSave }) => (
  <div className="shrink-0 border-t border-slate-100 px-5 py-3 flex items-center justify-end gap-2">
    {dirty && <span className="text-xs text-amber-600 mr-auto">有未保存修改</span>}
    <button
      type="button"
      onClick={onReset}
      disabled={!dirty || saving}
      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40"
    >
      还原
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={!dirty || saving}
      className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50"
    >
      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
      保存本件
    </button>
  </div>
);

function draftOf(r: ArchiveRecord): ItemDraft {
  return {
    voucherNo: r.voucherNo || '',
    voucherCategory: r.voucherCategory || '',
    voucherWord: r.voucherWord || '',
    voucherDate: r.voucherDate || '',
    department: r.department || '',
    preparer: r.preparer || '',
    auditor: r.auditor || '',
    tallyMan: r.tallyMan || '',
    retention: r.retention || '',
    securityLevel: r.securityLevel || '',
    carrierType: r.carrierType || '',
    archiveType: r.archiveType || '',
    remarks: r.remarks || '',
    summary: r.summary || '',
    year: parseInt(r.year, 10) || undefined,
    month: parseInt(r.month, 10) || undefined,
    amount: r.amount || undefined,
  };
}

export default MetadataEntryModal;
