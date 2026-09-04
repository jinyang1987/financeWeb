/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * BoxInfoEditModal — 盒级元数据编辑（2026-08-29 T9）
 *
 * 盒域此前「无任何写端点」（审计 Q1 矩阵），人工字段（装盒人/整理人/审核人/
 * 备考/双套制关联等）零落点。本弹窗走 PUT /boxes/{id}（服务端白名单 +
 * 旧值/新值审计留痕）；盒号/类别/年度/期限为结构性字段，由移交流程维护，不在编辑范围。
 */

import React, { useEffect, useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { updateBoxMetadata } from '../services/boxService';
import { useAppStore } from '../stores/appStore';
import type { ArchiveBox } from '../types/archiveBox';

interface BoxInfoEditModalProps {
  open: boolean;
  box: ArchiveBox | null;
  onClose: () => void;
  /** 保存成功回调（父组件刷新盒列表/详情） */
  onSaved: () => void;
}

const SECURITY_OPTIONS = ['普通', '内部', '秘密', '机密'];

interface Draft {
  boxName: string;
  securityLevel: string;
  remarks: string;
  packer: string;
  packDate: string;
  arranger: string;
  auditor: string;
  auditDate: string;
  dualSetRef: string;
}

const EMPTY: Draft = {
  boxName: '', securityLevel: '', remarks: '', packer: '', packDate: '',
  arranger: '', auditor: '', auditDate: '', dualSetRef: '',
};

const inputCls = 'mt-0.5 w-full px-2 py-1.5 text-[13px] border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-200';
const labelCls = 'text-xs font-medium text-slate-600';

const BoxInfoEditModal: React.FC<BoxInfoEditModalProps> = ({ open, box, onClose, onSaved }) => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && box) {
      setDraft({
        boxName: box.boxName || '',
        securityLevel: box.securityLevel || '',
        remarks: box.remarks || '',
        packer: box.packer || '',
        packDate: box.packDate || '',
        arranger: box.arranger || '',
        auditor: box.auditor || '',
        auditDate: box.auditDate || '',
        dualSetRef: box.dualSetRef || '',
      });
    }
  }, [open, box]);

  if (!open || !box) return null;

  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await updateBoxMetadata(box.id, draft);
      triggerToast('盒信息已保存', 'success');
      onSaved();
    } catch (e) {
      triggerToast('保存失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-[640px] max-w-[94vw] max-h-[86vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
            <Save className="w-5 h-5 text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-800">盒信息编辑</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{box.boxNo} · 人工字段（盒号/类别/期限由移交流程维护）</p>
          </div>
          <button type="button" onClick={onClose} title="关闭"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            <label className="block col-span-2">
              <span className={labelCls}>盒名称</span>
              <input value={draft.boxName} onChange={(e) => set('boxName', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>密级</span>
              <select value={draft.securityLevel} onChange={(e) => set('securityLevel', e.target.value)} className={inputCls}>
                <option value="">—</option>
                {SECURITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>装盒人</span>
              <input value={draft.packer} onChange={(e) => set('packer', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>装盒日期</span>
              <input type="date" value={draft.packDate} onChange={(e) => set('packDate', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>整理人</span>
              <input value={draft.arranger} onChange={(e) => set('arranger', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>审核人</span>
              <input value={draft.auditor} onChange={(e) => set('auditor', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>审核日期</span>
              <input type="date" value={draft.auditDate} onChange={(e) => set('auditDate', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>双套制关联</span>
              <input value={draft.dualSetRef} onChange={(e) => set('dualSetRef', e.target.value)} className={inputCls} placeholder="另一载体套号" />
            </label>
            <label className="block col-span-3">
              <span className={labelCls}>备考</span>
              <textarea value={draft.remarks} onChange={(e) => set('remarks', e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="断号/特殊情况的备考说明" />
            </label>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            装盒/审核信息建议在封盒或上架前录入完整；所有修改将记入操作日志（旧值/新值留痕，DA/T 94-2022 附录 E.7）。
          </p>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-5 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default BoxInfoEditModal;
