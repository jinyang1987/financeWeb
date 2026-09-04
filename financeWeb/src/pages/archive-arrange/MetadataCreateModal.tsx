/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * MetadataCreateModal — 纯元数据建档（2026-08-29 T10）
 *
 * 无文件直接建 finance:record 节点（元数据先行）：适用纸质件先登记台账、
 * 电子文件到档后再经「补充文件」补齐。落点收集池（recordStatus=仅件数据）。
 * 补齐文件前四性检测 file-present/hash-verify 如实判不通过（不可确认组卷）——
 * 这是预期合规约束：先补文件、后组卷。
 */

import React, { useEffect, useState } from 'react';
import { X, Loader2, FilePlus2 } from 'lucide-react';
import { createRecordMetadataOnly } from '../../services/recordService';
import { useAppStore } from '../../stores/appStore';

interface MetadataCreateModalProps {
  open: boolean;
  fondsCode: string;
  onClose: () => void;
  /** 建档成功回调（父组件刷新池镜像） */
  onCreated: () => void;
}

const RETENTION_OPTIONS = ['30年', '10年', '永久'];
const BUSINESS_CATEGORY_OPTIONS = ['采购', '销售', '费用', '资产', '薪酬', '存货', '资金', '结算', '特殊'];
const ARCHIVE_TYPE_OPTIONS = ['记账凭证', '原始凭证', '会计账簿', '财务报告', '其他会计资料'];

interface FormState {
  voucherNo: string;
  archiveType: string;
  year: string;
  month: string;
  retention: string;
  department: string;
  amount: string;
  preparer: string;
  remarks: string;
  // 原始凭证扩展
  docTypeCode: string;
  docTypeName: string;
  documentNo: string;
  counterpartyName: string;
  counterpartyTaxId: string;
  summary: string;
  amountUpper: string;
  businessCategory: string;
}

const EMPTY: FormState = {
  voucherNo: '', archiveType: '记账凭证', year: String(new Date().getFullYear()), month: '',
  retention: '30年', department: '', amount: '', preparer: '', remarks: '',
  docTypeCode: '', docTypeName: '', documentNo: '', counterpartyName: '',
  counterpartyTaxId: '', summary: '', amountUpper: '', businessCategory: '',
};

const inputCls = 'mt-0.5 w-full px-2 py-1.5 text-[13px] border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-200';
const labelCls = 'text-xs font-medium text-slate-600';

const MetadataCreateModal: React.FC<MetadataCreateModalProps> = ({ open, fondsCode, onClose, onCreated }) => {
  const triggerToast = useAppStore((s) => s.triggerToast);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  if (!open) return null;

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const isSrcDoc = form.archiveType === '原始凭证';

  const submit = async () => {
    if (!fondsCode) { triggerToast('请先选择全宗', 'warning'); return; }
    if (!form.voucherNo.trim()) { triggerToast('凭证字号/单据编号不能为空', 'warning'); return; }
    const year = parseInt(form.year, 10);
    if (!year || year < 1900 || year > 2100) { triggerToast('会计年度不合法', 'warning'); return; }
    setSaving(true);
    try {
      await createRecordMetadataOnly({
        fondsCode,
        voucherNo: form.voucherNo.trim(),
        archiveType: form.archiveType,
        year,
        month: form.month ? parseInt(form.month, 10) : undefined,
        retention: form.retention || undefined,
        department: form.department || undefined,
        amount: form.amount ? Number(form.amount) : undefined,
        preparer: form.preparer || undefined,
        remarks: form.remarks || undefined,
        voucherCategory: form.archiveType === '记账凭证' || form.archiveType === '原始凭证' ? form.archiveType : undefined,
        carrierType: isSrcDoc ? 'electronic' : 'paper',
        // 原始凭证富元数据
        docTypeCode: isSrcDoc ? form.docTypeCode : undefined,
        docTypeName: isSrcDoc ? form.docTypeName : undefined,
        documentNo: isSrcDoc ? form.documentNo : undefined,
        counterpartyName: isSrcDoc ? form.counterpartyName : undefined,
        counterpartyTaxId: isSrcDoc ? form.counterpartyTaxId : undefined,
        summary: isSrcDoc ? form.summary : undefined,
        amountUpper: isSrcDoc ? form.amountUpper : undefined,
        businessCategory: isSrcDoc ? form.businessCategory : undefined,
      });
      triggerToast('已建档（无文件，待补齐电子文件）', 'success');
      onCreated();
    } catch (e) {
      triggerToast('建档失败：' + (e instanceof Error ? e.message : ''), 'warning');
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
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <FilePlus2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-800">纯元数据建档</h3>
            <p className="text-xs text-slate-500 mt-0.5">无文件先登记台账 · 电子文件到档后在收集池「补充文件」</p>
          </div>
          <button type="button" onClick={onClose} title="关闭"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            <label className="block">
              <span className={labelCls}>凭证字号/单据编号 <span className="text-red-500">*</span></span>
              <input value={form.voucherNo} onChange={(e) => set('voucherNo', e.target.value)} className={inputCls} placeholder="如 记-001 / 报销单号" />
            </label>
            <label className="block">
              <span className={labelCls}>档案类型 <span className="text-red-500">*</span></span>
              <select value={form.archiveType} onChange={(e) => set('archiveType', e.target.value)} className={inputCls}>
                {ARCHIVE_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>保管期限</span>
              <select value={form.retention} onChange={(e) => set('retention', e.target.value)} className={inputCls}>
                {RETENTION_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>会计年度 <span className="text-red-500">*</span></span>
              <input type="number" value={form.year} onChange={(e) => set('year', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>会计月份</span>
              <input type="number" min={1} max={12} value={form.month} onChange={(e) => set('month', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>金额（元）</span>
              <input type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>经办部门</span>
              <input value={form.department} onChange={(e) => set('department', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>制单人</span>
              <input value={form.preparer} onChange={(e) => set('preparer', e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>备注</span>
              <input value={form.remarks} onChange={(e) => set('remarks', e.target.value)} className={inputCls} />
            </label>

            {isSrcDoc && (
              <>
                <div className="col-span-3 pt-1 text-xs font-semibold text-slate-600 border-t border-slate-100 mt-1">
                  原始凭证票面字段（DA/T 95-2022，类型字段集可在归档后经元数据编辑继续展开）
                </div>
                <label className="block">
                  <span className={labelCls}>单据编号</span>
                  <input value={form.documentNo} onChange={(e) => set('documentNo', e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>对方单位</span>
                  <input value={form.counterpartyName} onChange={(e) => set('counterpartyName', e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>对方税号</span>
                  <input value={form.counterpartyTaxId} onChange={(e) => set('counterpartyTaxId', e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>大写金额</span>
                  <input value={form.amountUpper} onChange={(e) => set('amountUpper', e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>业务分类</span>
                  <select value={form.businessCategory} onChange={(e) => set('businessCategory', e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {BUSINESS_CATEGORY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label className="block col-span-3">
                  <span className={labelCls}>摘要/事由</span>
                  <input value={form.summary} onChange={(e) => set('summary', e.target.value)} className={inputCls} />
                </label>
              </>
            )}
          </div>
          <p className="text-[11px] text-amber-600 mt-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            建档后暂无电子文件：四性检测的「文件存在性/摘要校验」将如实判不通过，补齐文件前不可确认组卷（合规约束，非缺陷）。
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
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5" />}
            建档
          </button>
        </div>
      </div>
    </div>
  );
};

export default MetadataCreateModal;
