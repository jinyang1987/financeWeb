/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * MetadataEntryModal — 组卷工作台 · 元数据录入（2026-08-25）
 *
 * 组卷前/组卷中对案卷与卷内件的元数据进行录入与修正：
 *   左：卷内件列表（点击选择）；右：该件的可编辑元数据表单（后端白名单字段）。
 *   顶部：案卷级元数据（题名/保管期限/起止日期/密级/载体）。
 * 仅草稿案卷可用（已确认卷请先撤销确认）。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, Loader2, FileText, ChevronLeft } from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import { useVolumeStore } from '../../stores/volumeStore';
import { updateRecordMetadata, type RecordMetadataPatch } from '../../services/recordService';
import { useAppStore } from '../../stores/appStore';
import type { Volume, VolumeItem } from '../../types/volume';
import type { ArchiveRecord } from '../../types';

interface MetadataEntryModalProps {
  open: boolean;
  volume: Volume | null;
  items: VolumeItem[];
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

/** 件级表单草稿（白名单字段） */
interface ItemDraft extends RecordMetadataPatch {}

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

/** 表单字段定义（顺序即展示顺序） */
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

const MetadataEntryModal: React.FC<MetadataEntryModalProps> = ({ open, volume, items, onClose, onSaved }) => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const records = useArchiveStore((s) => s.records);
  const allRecords = useArchiveStore((s) => s.allRecords);
  const updateVolume = useVolumeStore((s) => s.updateVolume);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // 案卷级草稿
  const [volTitle, setVolTitle] = useState('');
  const [volRetention, setVolRetention] = useState('');
  const [volDateFrom, setVolDateFrom] = useState('');
  const [volDateTo, setVolDateTo] = useState('');
  const [volSecurity, setVolSecurity] = useState('');
  const [volCarrier, setVolCarrier] = useState('');

  /** 记录解析：优先池内镜像，回退全量件镜像 */
  const recordById = useMemo(() => {
    const m = new Map<string, ArchiveRecord>();
    for (const r of allRecords) m.set(r.id, r);
    for (const r of records) m.set(r.id, r);
    return m;
  }, [records, allRecords]);

  // 打开时初始化：选中第一件 + 案卷级字段
  useEffect(() => {
    if (!open || !volume) return;
    const first = items[0]?.recordId || null;
    setSelectedId(first);
    const rec = first ? recordById.get(first) : undefined;
    setDraft(rec ? draftOf(rec) : null);
    setDirty(false);
    setVolTitle(volume.title || '');
    setVolRetention(volume.retention || '');
    setVolDateFrom(volume.dateFrom || '');
    setVolDateTo(volume.dateTo || '');
    setVolSecurity(volume.securityLevel || '');
    setVolCarrier(volume.carrierType || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, volume?.id]);

  const selectItem = (recordId: string) => {
    setSelectedId(recordId);
    const rec = recordById.get(recordId);
    setDraft(rec ? draftOf(rec) : null);
    setDirty(false);
  };

  const setField = (key: keyof ItemDraft, value: string) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d };
      if (key === 'year' || key === 'month' || key === 'amount') {
        (next as Record<string, unknown>)[key] = value === '' ? undefined : Number(value);
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
      return next;
    });
    setDirty(true);
  };

  const saveItem = async () => {
    if (!selectedId || !draft || !dirty) return;
    setSaving(true);
    try {
      await updateRecordMetadata(selectedId, draft);
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
      });
      triggerToast('案卷元数据已保存', 'success');
      onSaved();
    } catch (e) {
      triggerToast('保存失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setSaving(false);
    }
  };

  if (!open || !volume) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-[960px] max-w-[94vw] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-800">元数据录入</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {volume.volumeCode || volume.title || '未命名案卷'} · {items.length} 件
            </p>
          </div>
          <button type="button" onClick={onClose} title="关闭"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 案卷级元数据 */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/60 shrink-0">
          <div className="text-xs font-semibold text-slate-600 mb-2">案卷级元数据（卷封面）</div>
          <div className="grid grid-cols-6 gap-2">
            <label className="block col-span-2">
              <span className="text-[11px] text-slate-500">案卷题名</span>
              <input value={volTitle} onChange={(e) => setVolTitle(e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white" />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">保管期限</span>
              <select value={volRetention} onChange={(e) => setVolRetention(e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white">
                <option value="">—</option>
                {RETENTION_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">起始日期</span>
              <input type="date" value={volDateFrom} onChange={(e) => setVolDateFrom(e.target.value)}
                className="mt-0.5 w-full px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white" />
            </label>
            <label className="block">
              <span className="text-[11px] text-slate-500">结束日期</span>
              <input type="date" value={volDateTo} onChange={(e) => setVolDateTo(e.target.value)}
                className="mt-0.5 w-full px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white" />
            </label>
            <div className="flex items-end gap-2">
              <label className="block flex-1">
                <span className="text-[11px] text-slate-500">密级</span>
                <select value={volSecurity} onChange={(e) => setVolSecurity(e.target.value)}
                  className="mt-0.5 w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white">
                  <option value="">—</option>
                  {SECURITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => void saveVolume()} disabled={saving}
                className="px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 shrink-0">
                保存卷
              </button>
            </div>
          </div>
        </div>

        {/* 主体：左件列表 / 右字段表单 */}
        <div className="flex-1 min-h-0 flex">
          {/* 左：卷内件 */}
          <div className="w-60 shrink-0 border-r border-slate-100 flex flex-col">
            <div className="px-3 py-2 text-[11px] text-slate-400 border-b border-slate-100 shrink-0">
              卷内件（{items.length}）· 点击选择录入
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
              {items.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-8">卷内无件</div>
              )}
              {items.map((it) => {
                const rec = recordById.get(it.recordId);
                const active = selectedId === it.recordId;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => selectItem(it.recordId)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                      active ? 'border-sky-300 bg-sky-50' : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">#{it.itemNo}</span>
                      <span className={`text-xs truncate ${active ? 'text-sky-700 font-medium' : 'text-slate-700'}`}>
                        {rec?.voucherNo || it.recordId.slice(0, 10)}
                      </span>
                    </div>
                    {rec && (
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {[rec.archiveType, rec.year && `${rec.year}年`, rec.retention].filter(Boolean).join(' · ')}
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
                {items.length === 0 ? '卷内无件，请先从左侧待组卷池加件' : '点击左侧件开始录入元数据'}
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5">
                  <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                    {FIELD_DEFS.map((f) => (
                      <label key={f.key} className={`block ${f.type === 'textarea' ? 'col-span-3' : ''}`}>
                        <span className="text-[11px] text-slate-500">{f.label}</span>
                        {f.type === 'select' ? (
                          <select
                            value={String(draft[f.key] ?? '')}
                            onChange={(e) => setField(f.key, e.target.value)}
                            className="mt-0.5 w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
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
                            className="mt-0.5 w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white resize-none"
                          />
                        ) : (
                          <input
                            type={f.type === 'number' ? 'number' : 'text'}
                            value={String(draft[f.key] ?? '')}
                            onChange={(e) => setField(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            className="mt-0.5 w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3">
                    仅草稿卷内件与收集池件可录入；确认组卷后元数据即固化，如需修改请先撤销确认。
                  </p>
                </div>
                <div className="shrink-0 border-t border-slate-100 px-5 py-3 flex items-center justify-end gap-2">
                  {dirty && <span className="text-[11px] text-amber-600 mr-auto">有未保存修改</span>}
                  <button
                    type="button"
                    onClick={() => selectedId && selectItem(selectedId)}
                    disabled={!dirty || saving}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                  >
                    还原
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveItem()}
                    disabled={!dirty || saving}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    保存本件
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 底部关闭（移动端友好） */}
        <div className="shrink-0 border-t border-slate-100 px-6 py-2.5 flex justify-between items-center">
          <button type="button" onClick={onClose}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
            <ChevronLeft className="w-3.5 h-3.5" />返回组卷工作台
          </button>
          <span className="text-[10px] text-slate-300">元数据依据 DA/T 94-2022 件级必填项白名单</span>
        </div>
      </div>
    </div>
  );
};

export default MetadataEntryModal;
