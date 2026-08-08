/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UploadModal — 会计档案上传（P1-① 真上传）
 *
 * 流程：1) 选择真实文件 + 来源类型 → 2) 填写元数据 → 确认上传
 * 落点：ams-server POST /records → Alfresco 收集池（finance:record 节点）。
 * 不再伪造 AI 解析/哈希/验签/档号：档号为上全宗前缀的临时 PEND 值，
 * 四性检测待真实引擎（P3-1）接入前一律「未检测」。
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  X, UploadCloud, FileText, BookOpen, CheckCircle2, AlertCircle, Database, Loader2,
} from 'lucide-react';
import { ArchiveRecord } from '../types';
import { uploadRecord } from '../services/recordService';
import { useArchiveStore } from '../stores/archiveStore';
import { useAuthStore } from '../stores/authStore';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (record: ArchiveRecord) => void;
}

const ARCHIVE_TYPES = ['记账凭证', '会计账簿', '财务报告', '其他会计资料'] as const;
const VOUCHER_CATEGORIES = ['收款凭证', '付款凭证', '转账凭证', '通用记账凭证'] as const;
const RETENTIONS = ['永久', '30年', '10年'] as const;
const ACCEPT_EXT = ['pdf', 'ofd', 'xml', 'jpg', 'jpeg', 'png', 'tif', 'tiff'];

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onUploadSuccess }) => {
  const [activeStep, setActiveStep] = useState<0 | 1>(0);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [sourceType, setSourceType] = useState<'digital-native' | 'digitized'>('digital-native');

  // ── 元数据表单 ──
  const now = new Date();
  const [voucherNo, setVoucherNo] = useState('');
  const [archiveType, setArchiveType] = useState<string>('记账凭证');
  const [voucherCategory, setVoucherCategory] = useState('');
  const [department, setDepartment] = useState('财务部');
  const [amount, setAmount] = useState('');
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [retention, setRetention] = useState('30年');
  const [preparer, setPreparer] = useState('');
  const [remarks, setRemarks] = useState('');

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const currentUser = useAuthStore((s) => s.currentUser);
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);

  const effectivePreparer = useMemo(
    () => preparer.trim() || currentUser?.name || '',
    [preparer, currentUser],
  );

  if (!isOpen) return null;

  const reset = () => {
    setActiveStep(0);
    setFile(null);
    setFileError('');
    setVoucherNo('');
    setVoucherCategory('');
    setAmount('');
    setRemarks('');
    setError('');
    setUploading(false);
  };

  const pickFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (!ACCEPT_EXT.includes(ext)) {
      setFileError(`不支持的格式 .${ext}，请上传 ${ACCEPT_EXT.join('/')} 文件`);
      return;
    }
    setFileError('');
    setFile(f);
    if (!remarks) setRemarks(f.name.replace(/\.[^.]+$/, ''));
    setActiveStep(1);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  };

  const validate = (): string => {
    if (!file) return '请先选择文件';
    if (!voucherNo.trim()) return '请填写凭证字号';
    if (!/^\d{4}$/.test(year)) return '会计年度须为 4 位数字';
    const m = parseInt(month, 10);
    if (month && (isNaN(m) || m < 1 || m > 12)) return '会计月份须在 1-12 之间';
    if (amount && isNaN(Number(amount))) return '金额须为数字';
    return '';
  };

  const handleCommit = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    setUploading(true);
    try {
      const record = await uploadRecord(file!, {
        fondsCode: currentFanzongCode,
        voucherNo: voucherNo.trim(),
        archiveType,
        department: department.trim() || undefined,
        amount: amount ? Number(amount) : undefined,
        year: parseInt(year, 10),
        month: month ? parseInt(month, 10) : undefined,
        retention,
        source: sourceType,
        carrierType: sourceType === 'digitized' ? 'paper' : 'electronic',
        preparer: effectivePreparer || undefined,
        voucherCategory: archiveType === '记账凭证' && voucherCategory ? voucherCategory : undefined,
        remarks: remarks.trim() || undefined,
      });
      onUploadSuccess(record);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const inputCls = 'w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white';
  const labelCls = 'block text-xs font-medium text-slate-600 mb-1';

  return (
    <div id="upload-dialog-backer" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div
        id="upload-dialog-inner"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-slate-900 p-4 shrink-0 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-sky-400" />
            <span className="font-bold text-base">会计档案文件上传</span>
            <span className="text-[11px] text-slate-400">全宗 {currentFanzongCode} · 入收集池</span>
          </div>
          <button
            type="button"
            onClick={() => { reset(); onClose(); }}
            className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-2 bg-slate-50 border-b border-slate-100 p-3 shrink-0 text-xs">
          <div className={`flex items-center gap-2 justify-center py-1 border-r border-slate-200 ${activeStep === 0 ? 'text-sky-600 font-bold' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[10px] select-none">1</span>
            <span>选择文件与来源</span>
          </div>
          <div className={`flex items-center gap-2 justify-center py-1 ${activeStep === 1 ? 'text-sky-600 font-bold' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[10px] select-none">2</span>
            <span>填写元数据入库</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeStep === 0 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* 来源类型选择器 */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">上传类型</span>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSourceType('digital-native')}
                    className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      sourceType === 'digital-native'
                        ? 'border-sky-500 bg-white shadow-sm'
                        : 'border-slate-200 bg-white/50 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                      <FileText className={`w-4 h-4 ${sourceType === 'digital-native' ? 'text-sky-600' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">纯电子文件</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">原生电子会计档案（数电发票/电子凭证等）</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceType('digitized')}
                    className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                      sourceType === 'digitized'
                        ? 'border-amber-500 bg-white shadow-sm'
                        : 'border-slate-200 bg-white/50 hover:border-slate-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <BookOpen className={`w-4 h-4 ${sourceType === 'digitized' ? 'text-amber-600' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">纸质数字化副本</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">纸质原件扫描件，入库后统一走组卷流程</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* 拖拽/选择文件 */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  dragActive ? 'border-sky-500 bg-sky-50/50 scale-[0.99]' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                <div className="max-w-md mx-auto space-y-3">
                  <div className="inline-flex p-3 bg-sky-100 text-sky-600 rounded-2xl mb-1">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      拖拽凭证文件至此，或{' '}
                      <label className="text-sky-600 hover:text-sky-700 underline cursor-pointer">
                        浏览本地文件
                        <input
                          type="file"
                          ref={inputRef}
                          className="hidden"
                          accept={ACCEPT_EXT.map(e => `.${e}`).join(',')}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) pickFile(f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </p>
                    <p className="text-xs text-slate-400 mt-1">支持 PDF / OFD / XML / 图片（扫描件）格式，单文件 ≤ 50MB</p>
                  </div>
                  {fileError && (
                    <p className="text-xs text-rose-600 flex items-center justify-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {fileError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeStep === 1 && file && (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* 已选文件 */}
              <div className="bg-sky-50 border border-sky-100 p-3 rounded-xl flex items-center gap-3">
                <FileText className="w-5 h-5 text-sky-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">{file.name}</div>
                  <div className="text-[11px] text-slate-500">{formatSize(file.size)} · {sourceType === 'digitized' ? '纸质数字化副本' : '纯电子文件'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => { setFile(null); setActiveStep(0); }}
                  className="text-[11px] text-sky-600 hover:underline shrink-0 cursor-pointer"
                >
                  重新选择
                </button>
              </div>

              {/* 元数据表单 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>凭证字号 <span className="text-rose-500">*</span></label>
                  <input value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} placeholder="如 记-001" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>档案类型 <span className="text-rose-500">*</span></label>
                  <select value={archiveType} onChange={(e) => setArchiveType(e.target.value)} className={inputCls}>
                    {ARCHIVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {archiveType === '记账凭证' && (
                  <div>
                    <label className={labelCls}>凭证子类型</label>
                    <select value={voucherCategory} onChange={(e) => setVoucherCategory(e.target.value)} className={inputCls}>
                      <option value="">未指定</option>
                      {VOUCHER_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelCls}>责任部门</label>
                  <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="如 财务部" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>金额（元）</label>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="如 12345.67" className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>会计年度 <span className="text-rose-500">*</span></label>
                    <input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>月份</label>
                    <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m} 月</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>保管期限</label>
                  <select value={retention} onChange={(e) => setRetention(e.target.value)} className={inputCls}>
                    {RETENTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>制单人</label>
                  <input value={preparer} onChange={(e) => setPreparer(e.target.value)} placeholder={currentUser?.name || '制单人'} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>备注/摘要</label>
                  <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="业务摘要说明" className={inputCls} />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-500 leading-relaxed">
                入库后件级档号为临时值（{currentFanzongCode}-PEND-××××××××），确认组卷时按档号规则正式赋号；四性检测状态为「未检测」，待检测引擎接入后统一执行。
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-100 shrink-0 flex items-center justify-between">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            文件与元数据将真实写入档案库（Alfresco 收集池）
          </span>
          <div className="flex gap-2">
            {activeStep === 1 && (
              <button
                type="button"
                onClick={() => setActiveStep(0)}
                disabled={uploading}
                className="px-4 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg shrink-0 cursor-pointer disabled:opacity-50"
              >
                上一步
              </button>
            )}
            <button
              type="button"
              onClick={() => { reset(); onClose(); }}
              disabled={uploading}
              className="px-4 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg shrink-0 cursor-pointer disabled:opacity-50"
            >
              取消
            </button>
            {activeStep === 1 && (
              <button
                type="button"
                onClick={handleCommit}
                disabled={uploading}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                <span>{uploading ? '正在入库…' : '确认上传入库'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

