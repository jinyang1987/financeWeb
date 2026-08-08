/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * VoucherUploadModal — 资料归档上传弹窗（凭证/账簿/报告/其他）
 *
 * 从原 VoucherUploadPage 提取，以弹窗形式嵌入组卷工作台。
 * 核心流程：选择文件 → OCR识别与规则归类 → 校验确认 → 入待组卷池
 * 识别链：文件 → POST /records/ocr-scan（后端 Tesseract）→ docClassifier
 *        规则分类（记账凭证/原始凭证）+ 字段抽取 → 人工校验兜底（2026-07-29 接真）
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Upload, CheckCircle2, AlertCircle, XCircle, FileText, FileImage,
  FileSpreadsheet, ChevronDown, ChevronRight, Search, Eye, RefreshCw,
  Link2, Check, X, Printer, Layers, Cpu, Save, Clock, X as XIcon,
} from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import { useVolumeStore } from '../../stores/volumeStore';
import { uploadRecord, scanRecordOcr } from '../../services/recordService';
import { classifyDocument } from '../../services/docClassifier';
import { partitionForPool } from '../../services/uploadEligibility';

// ── 上传文件条目 ──
interface UploadFileItem {
  id: string;
  /** 原始文件对象（真上传用，P1-② 接入） */
  file: File;
  name: string;
  size: string;
  type: 'pdf' | 'tiff' | 'jpg' | 'png' | 'ofd' | 'xml' | 'unknown';
  category: '记账凭证' | '原始凭证' | '未识别';
  status: 'pending' | 'processing' | 'ocr-done' | 'verified' | 'error';
  ocrResult: { voucherNo: string; amount: string; date: string; archiveType: string };
  correctedResult: { voucherNo: string; amount: string; date: string; archiveType: string };
  pairId: string | null;
  errorMsg: string;
  confidence: number;
}

// ── 工具 ──
const FILE_ICONS: Record<string, React.ReactNode> = {
  pdf: <FileText className="w-5 h-5 text-red-500" />,
  tiff: <FileImage className="w-5 h-5 text-sky-500" />,
  jpg: <FileImage className="w-5 h-5 text-green-500" />,
  png: <FileImage className="w-5 h-5 text-green-500" />,
  ofd: <FileSpreadsheet className="w-5 h-5 text-purple-500" />,
  xml: <FileSpreadsheet className="w-5 h-5 text-amber-500" />,
  unknown: <FileText className="w-5 h-5 text-slate-400" />,
};

const EXT_MAP: Record<string, UploadFileItem['type']> = {
  pdf: 'pdf', tif: 'tiff', tiff: 'tiff',
  jpg: 'jpg', jpeg: 'jpg', png: 'png',
  ofd: 'ofd', xml: 'xml',
};

function detectFileType(name: string): UploadFileItem['type'] {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_MAP[ext] || 'unknown';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let fileIdCounter = 0;

// ── 子组件：步骤指示器 ──
const StepIndicator: React.FC<{ current: number }> = ({ current }) => {
  const steps = [
    { num: 1, label: '选择文件' },
    { num: 2, label: 'OCR 识别与归类' },
    { num: 3, label: '校验确认' },
    { num: 4, label: '入待组卷池' },
  ];
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => {
        const isActive = current >= s.num;
        const isDone = current > s.num;
        return (
          <React.Fragment key={s.num}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                isDone ? 'bg-green-500 text-white' :
                isActive ? 'bg-sky-600 text-white' :
                'bg-slate-200 text-slate-400'
              }`}>
                {isDone ? <Check className="w-4 h-4" /> : s.num}
              </div>
              <span className={`text-sm font-medium ${isActive ? 'text-slate-700' : 'text-slate-400'}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-12 h-0.5 mx-2 ${current > s.num ? 'bg-green-500' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ── 子组件：文件拖拽上传区 ──
interface FileDropzoneProps {
  onFilesAdded: (files: File[]) => void;
  disabled: boolean;
}

const FileDropzone: React.FC<FileDropzoneProps> = ({ onFilesAdded, disabled }) => {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => ['pdf', 'tiff', 'tif', 'jpg', 'jpeg', 'png', 'ofd', 'xml'].includes(f.name.split('.').pop()?.toLowerCase() || '')
    );
    if (files.length > 0) onFilesAdded(files);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFilesAdded(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
        dragging ? 'border-sky-400 bg-sky-50' : 'border-slate-300 hover:border-sky-300 bg-white'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleChange}
        accept=".pdf,.tif,.tiff,.jpg,.jpeg,.png,.ofd,.xml" />
      <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
      <p className="text-sm font-medium text-slate-600">拖拽文件到此处，或点击选择文件</p>
      <p className="text-xs text-slate-400 mt-1">支持 PDF / TIFF / JPG / PNG / OFD / XML 格式</p>
    </div>
  );
};

// ── 子组件：OCR 结果行 ──
interface FileRowProps {
  item: UploadFileItem;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

const FileRow: React.FC<FileRowProps> = ({ item, onEdit, onRemove }) => {
  const icon = FILE_ICONS[item.type] || FILE_ICONS.unknown;
  const display = item.status === 'verified' ? item.correctedResult : item.ocrResult;

  const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    pending: { icon: <Clock className="w-3.5 h-3.5" />, label: '待处理', color: 'text-slate-500 bg-slate-100' },
    processing: { icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />, label: '识别中...', color: 'text-sky-600 bg-sky-100' },
    'ocr-done': { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: '识别完成', color: 'text-green-600 bg-green-100' },
    verified: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: '已确认', color: 'text-sky-600 bg-sky-100' },
    error: { icon: <XCircle className="w-3.5 h-3.5" />, label: '识别失败', color: 'text-red-600 bg-red-100' },
  };
  const sc = statusConfig[item.status];

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 hover:bg-slate-50 text-sm">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-700 truncate">{item.name}</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${item.category === '记账凭证' ? 'bg-sky-100 text-sky-700' : item.category === '原始凭证' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
            {item.category}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
          <span>{item.size}</span>
          {display.voucherNo && <span className="font-mono">{display.voucherNo}</span>}
          {display.amount && <span>¥{display.amount}</span>}
          {display.date && <span>{display.date}</span>}
        </div>
      </div>

      {item.status === 'ocr-done' && (
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
          item.confidence >= 80 ? 'bg-green-100 text-green-700' :
          item.confidence >= 50 ? 'bg-amber-100 text-amber-700' :
          'bg-red-100 text-red-700'
        }`}>
          {item.confidence}%
        </span>
      )}

      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${sc.color}`}
        title={item.errorMsg || undefined}
      >
        {sc.icon}{sc.label}
      </span>

      {item.pairId && (
        <Link2 className="w-3.5 h-3.5 text-sky-400" />
      )}

      <button type="button" onClick={() => onRemove(item.id)} className="p-1 text-slate-300 hover:text-red-500">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

// ── 子组件：配对面板 ──
interface PairingPanelProps {
  items: UploadFileItem[];
  onPair: (voucherId: string, invoiceId: string) => void;
  onUnpair: (id: string) => void;
}

const PairingPanel: React.FC<PairingPanelProps> = ({ items, onPair, onUnpair }) => {
  const vouchers = items.filter((i) => i.category === '记账凭证' && i.status !== 'pending');
  const invoices = items.filter((i) => i.category === '原始凭证' && i.status !== 'pending');

  const paired = items.filter((i) => i.pairId);
  const unpairedVouchers = vouchers.filter((v) => !v.pairId);
  const unpairedInvoices = invoices.filter((i) => !i.pairId);

  if (vouchers.length === 0 && invoices.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <Link2 className="w-4 h-4 text-slate-500" />
        凭证 - 附件配对
        <span className="text-xs font-normal text-slate-400">
          （已配对 {paired.length} 对，未配对记账凭证 {unpairedVouchers.length}，未配对原始凭证 {unpairedInvoices.length}）
        </span>
      </h3>

      {paired.length > 0 && (
        <div className="space-y-1.5 mb-3">
          <span className="text-xs text-green-600 font-medium">已配对</span>
          {paired.map((p) => {
            const partner = items.find((i) => i.id === p.pairId);
            return (
              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs">
                <span className="font-mono text-green-700">{p.correctedResult?.voucherNo || p.ocrResult.voucherNo}</span>
                <ChevronRight className="w-3 h-3 text-green-400" />
                <span className="font-mono text-green-700">{partner?.correctedResult?.voucherNo || partner?.ocrResult.voucherNo || partner?.name}</span>
                <button type="button" onClick={() => onUnpair(p.id)} className="ml-auto p-0.5 text-green-400 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {unpairedVouchers.length > 0 && unpairedInvoices.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-amber-600 font-medium">手动配对（点击左侧凭证，再点击右侧附件）</span>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              {unpairedVouchers.map((v) => (
                <div key={v.id} className="px-2 py-1.5 bg-sky-50 border border-sky-200 rounded text-xs text-sky-700 font-mono cursor-pointer hover:bg-sky-100">
                  {v.correctedResult?.voucherNo || v.ocrResult.voucherNo || v.name}
                </div>
              ))}
            </div>
            <div className="space-y-1">
              {unpairedInvoices.map((i) => (
                <div key={i.id} className="px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-mono cursor-pointer hover:bg-amber-100">
                  {i.correctedResult?.voucherNo || i.ocrResult.voucherNo || i.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── 子组件：校验编辑器 ──
interface VerifyEditorProps {
  item: UploadFileItem;
  onSave: (id: string, corrected: UploadFileItem['correctedResult']) => void;
  onClose: () => void;
}

const VerifyEditor: React.FC<VerifyEditorProps> = ({ item, onSave, onClose }) => {
  const [form, setForm] = useState(item.correctedResult.voucherNo ? item.correctedResult : item.ocrResult);

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[90vw] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">校验：{item.name}</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span className={`px-1.5 py-0.5 rounded ${item.category === '记账凭证' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{item.category}</span>
            <span>OCR 可信度: {item.confidence}%</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-0.5">凭证号</label>
              <input type="text" className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                value={form.voucherNo} onChange={(e) => setForm((f) => ({ ...f, voucherNo: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-0.5">金额</label>
              <input type="text" className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-0.5">日期</label>
              <input type="text" className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-0.5">档案类型</label>
              <select className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                value={form.archiveType} onChange={(e) => setForm((f) => ({ ...f, archiveType: e.target.value }))}>
                <option>记账凭证</option>
                <option>原始凭证</option>
                <option>会计账簿</option>
                <option>财务报告</option>
                <option>其他会计资料</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-100 rounded-lg p-4 flex items-center justify-center aspect-[3/2] text-slate-400">
            <FileText className="w-8 h-8" />
            <span className="text-xs ml-2">原件预览区域（双层 PDF 效果示意）</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-200">
          <button type="button" onClick={onClose} className="px-4 py-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">取消</button>
          <button type="button" onClick={() => onSave(item.id, form)} className="px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700">
            <Save className="w-3.5 h-3.5 inline mr-1" />确认并保存
          </button>
        </div>
      </div>
    </div>
  );
};

// ── 主弹窗组件 ──
interface VoucherUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** 目标案卷ID，设置后上传完成自动将文件加入该案卷 */
  targetVolumeId?: string;
}

const VoucherUploadModal: React.FC<VoucherUploadModalProps> = ({ open, onClose, targetVolumeId }) => {
  const addItemsToVolume = useVolumeStore((s) => s.addItemsToVolume);

  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 重置状态
  const resetState = useCallback(() => {
    setStep(1);
    setFiles([]);
    setEditingId(null);
    setToast(null);
  }, []);

  // ── 文件守卫（与服务端 multipart 上限对齐） ──
  const MAX_FILE_MB = 50;
  const ACCEPT_EXTS = ['pdf', 'tif', 'tiff', 'jpg', 'jpeg', 'png', 'ofd', 'xml'];

  // 添加文件：格式/大小/重复预检 → 入列 → 立即触发识别（无任何状态快照拼接，杜绝竞态丢件）
  const handleFilesAdded = useCallback((newFiles: File[]) => {
    const accepted: File[] = [];
    const rejected: string[] = [];
    // 收集池已有件的文件名（dtoToRecord 把上传原件放在 components[0]）
    const poolNames = new Set(
      useArchiveStore.getState().records.flatMap((r) => (r.components || []).map((c) => c.name)),
    );
    const poolDupes: string[] = [];
    for (const f of newFiles) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (!ACCEPT_EXTS.includes(ext)) { rejected.push(`${f.name}(格式不支持)`); continue; }
      if (f.size === 0) { rejected.push(`${f.name}(空文件)`); continue; }
      if (f.size > MAX_FILE_MB * 1024 * 1024) { rejected.push(`${f.name}(超过${MAX_FILE_MB}MB)`); continue; }
      // 列表内重复（同名同大小）：防止同一文件重复入列重复入池
      if (files.some((x) => x.name === f.name && x.file.size === f.size)) {
        rejected.push(`${f.name}(列表中已存在)`); continue;
      }
      accepted.push(f);
      if (poolNames.has(f.name)) poolDupes.push(f.name);
    }
    const notices: string[] = [];
    if (rejected.length > 0) {
      notices.push(`已忽略 ${rejected.length} 个文件：${rejected.slice(0, 3).join('、')}${rejected.length > 3 ? ' 等' : ''}`);
    }
    if (poolDupes.length > 0) {
      notices.push(`同名提醒：${poolDupes.slice(0, 3).join('、')} 与收集池已有件重名，入池将生成副本`);
    }
    if (notices.length > 0) showToast(notices.join('；'), 'info');
    if (accepted.length === 0) return;

    const items: UploadFileItem[] = accepted.map((f) => ({
      id: `uf-${++fileIdCounter}`,
      file: f,
      name: f.name,
      size: formatFileSize(f.size),
      type: detectFileType(f.name),
      category: '未识别',
      status: 'pending',
      ocrResult: { voucherNo: '', amount: '', date: '', archiveType: '' },
      correctedResult: { voucherNo: '', amount: '', date: '', archiveType: '' },
      pairId: null,
      errorMsg: '',
      confidence: 0,
    }));
    setFiles((prev) => [...prev, ...items]);
    if (step === 1) setStep(2);
    void processItems(items);
  }, [step, files]);

  // 单文件识别：OCR → 规则归类 → 按 id 回写（带状态守卫，并发安全）
  const ocrOne = async (item: UploadFileItem) => {
    let scanText = '';
    let degraded = false;
    try {
      const scan = await scanRecordOcr(item.file);
      scanText = scan.ocrText || '';
    } catch {
      degraded = true; // OCR 服务不可用 → 仅文件名识别
    }
    const result = classifyDocument({ fileName: item.name, ocrText: scanText });
    setFiles((prev) => prev.map((f) => {
      if (f.id !== item.id || f.status !== 'processing') return f;
      return {
        ...f,
        status: 'ocr-done' as const,
        category: result.category,
        ocrResult: {
          voucherNo: result.voucherNo,
          amount: result.amount,
          date: result.date,
          archiveType: result.category === '未识别' ? '' : result.category,
        },
        // 仅文件名识别时置信度封顶 60，提示人工必须过目
        confidence: degraded || result.source === 'filename' ? Math.min(result.confidence, 60) : result.confidence,
        errorMsg: degraded ? 'OCR 服务不可用，仅按文件名识别' : '',
      };
    }));
  };

  // 真 OCR + 规则归类（P3-3 接真）：并发上限 3，避免 N 个 docker exec 同时压垮引擎；
  // 仅处理本次新增条目，不依赖 files 状态快照（快速连续添加也不会丢件/卡死）
  const OCR_CONCURRENCY = 3;
  const processItems = async (items: UploadFileItem[]) => {
    if (items.length === 0) return;
    const ids = new Set(items.map((i) => i.id));
    setFiles((prev) => prev.map((f) =>
      ids.has(f.id) && f.status === 'pending' ? { ...f, status: 'processing' as const } : f
    ));
    const queue = [...items];
    const worker = async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        await ocrOne(next);
      }
    };
    await Promise.all(Array.from({ length: Math.min(OCR_CONCURRENCY, items.length) }, () => worker()));
  };

  // 自动配对
  const handleAutoPair = useCallback(() => {
    setFiles((prev) => {
      const vouchers = prev.filter((f) => f.category === '记账凭证' && f.status !== 'pending' && !f.pairId);
      const invoices = prev.filter((f) => f.category === '原始凭证' && f.status !== 'pending' && !f.pairId);
      const pairMap = new Map<string, string>();

      for (const v of vouchers) {
        const match = invoices.find((inv) =>
          !pairMap.has(inv.id) && inv.ocrResult.amount === v.ocrResult.amount
        );
        if (match) pairMap.set(v.id, match.id);
      }

      if (pairMap.size === 0) {
        showToast('未找到可自动配对的凭证', 'info');
        return prev;
      }

      showToast(`已自动配对 ${pairMap.size} 对`);
      return prev.map((f) => {
        if (pairMap.has(f.id)) return { ...f, pairId: pairMap.get(f.id)! };
        for (const [, invId] of pairMap) {
          if (f.id === invId && !f.pairId) {
            const vId = [...pairMap.entries()].find(([, i]) => i === f.id)?.[0];
            if (vId) return { ...f, pairId: vId };
          }
        }
        return f;
      });
    });
  }, []);

  // 人工保存修正
  const handleSaveCorrection = useCallback((id: string, corrected: UploadFileItem['correctedResult']) => {
    setFiles((prev) => prev.map((f) =>
      f.id === id ? { ...f, correctedResult: corrected, status: 'verified' as const } : f
    ));
    setEditingId(null);
    showToast('已确认');
  }, []);

  // 移除文件
  const handleRemove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // ★ 入池门槛（唯一事实源 uploadEligibility）：
  // 低于门槛的文件不入池、不入按钮计数、上传后保留在列表——杜绝「静默丢件」（2026-07-29 用户报障）
  const { eligible, blocked } = useMemo(() => partitionForPool(files), [files]);

  // 入待组卷池（P1-② 真上传：文件落 Alfresco 收集池，目标案卷时再入卷）
  // 多文件扎实语义：逐件独立成败——成功即移出列表（防重试重复入池），
  // 失败标红保留可重试，不中断后续件；全部清空才进成功页自动关闭。
  const handleConfirm = useCallback(async () => {
    if (eligible.length === 0) {
      showToast('没有可入池的文件：低置信度文件请先校验确认', 'info');
      return;
    }

    setUploading(true);
    const fondsCode = useArchiveStore.getState().currentFanzongCode;
    const okRecordIds: string[] = [];
    const failList: { id: string; name: string; msg: string }[] = [];

    for (const f of eligible) {
      const display = f.correctedResult.voucherNo ? f.correctedResult : f.ocrResult;
      const [y, m] = (display.date || '').split('-');
      // 档案类型以（人工修正后的）识别结果为准；原始凭证同属会计凭证类（组卷同卷），
      // 以 voucherCategory 标记，作为子件（sourceDocument）挂接属 P1-②c /files 域
      const cat = display.archiveType || f.category;
      try {
        const rec = await uploadRecord(f.file, {
          fondsCode,
          voucherNo: display.voucherNo || f.name.replace(/\.[^.]+$/, ''),
          archiveType: cat === '会计账簿' || cat === '财务报告' || cat === '其他会计资料' ? cat : '记账凭证',
          year: parseInt(y) || new Date().getFullYear(),
          month: m ? parseInt(m) : undefined,
          amount: parseFloat((display.amount || '').replace(/,/g, '')) || undefined,
          retention: '30年',
          source: 'digitized',
          carrierType: 'paper',
          voucherCategory: cat === '记账凭证' || cat === '原始凭证' ? cat : undefined,
        });
        okRecordIds.push(rec.id);
        // 成功一件移出一件：后续件失败重试时不会重复入池
        setFiles((prev) => prev.filter((x) => x.id !== f.id));
      } catch (e: any) {
        failList.push({ id: f.id, name: f.name, msg: e?.message || '上传失败' });
        setFiles((prev) => prev.map((x) =>
          x.id === f.id ? { ...x, status: 'error' as const, errorMsg: e?.message || '上传失败' } : x
        ));
      }
    }

    // 如果指定了目标案卷，自动将新记录加入该案卷
    if (targetVolumeId && okRecordIds.length > 0) {
      try {
        await addItemsToVolume(targetVolumeId, okRecordIds);
      } catch (e: any) {
        showToast(`入池成功，但加入案卷失败：${e?.message || '未知错误'}`, 'info');
      }
    }
    if (okRecordIds.length > 0) useArchiveStore.getState().loadRecords();

    // files 是渲染时快照；本循环只做过移除（okRecordIds 对应件），剩余 = 快照 - 成功件
    const remainingCount = files.filter((f) => !okRecordIds.includes(f.id) && !eligible.includes(f)).length + failList.length;

    if (remainingCount === 0) {
      showToast(targetVolumeId
        ? `成功上传 ${okRecordIds.length} 件资料并已加入当前案卷`
        : `成功将 ${okRecordIds.length} 件资料入待组卷池`);
      setFiles([]);
      setStep(4);
      // 3秒后关闭弹窗
      setTimeout(() => {
        resetState();
        onClose();
      }, 3000);
    } else {
      const parts: string[] = [];
      if (okRecordIds.length > 0) parts.push(`已入池 ${okRecordIds.length} 件`);
      if (failList.length > 0) parts.push(`${failList.length} 件失败（列表标红，可重试）`);
      if (blocked.length > 0) parts.push(`${blocked.length} 件置信度不足待校验`);
      showToast(parts.join('；'), 'info');
    }
    setUploading(false);
  }, [files, eligible, blocked, targetVolumeId, addItemsToVolume, onClose, resetState]);

  // 统计
  const stats = useMemo(() => ({
    total: files.length,
    processing: files.filter((f) => f.status === 'processing').length,
    done: files.filter((f) => f.status === 'ocr-done' || f.status === 'verified').length,
    verified: files.filter((f) => f.status === 'verified').length,
    errors: files.filter((f) => f.status === 'error').length,
  }), [files]);

  const editingItem = editingId ? files.find((f) => f.id === editingId) : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-slate-100 rounded-2xl shadow-2xl w-[85vw] max-w-[1200px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-slate-700 text-white'}`}>
            {toast.message}
          </div>
        )}

        {/* 顶栏 */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-slate-600" />
            <h1 className="text-base font-bold text-slate-800">资料归档上传</h1>
            <span className="text-xs text-slate-400">档案管理员手工导入凭证、账簿、报告等档案资料</span>
          </div>
          <button
            type="button"
            onClick={() => { resetState(); onClose(); }}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* 步骤指示器 */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 shrink-0">
          <StepIndicator current={step} />
        </div>

        {/* 主体内容 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 步骤 1+2：上传区（识别进行中也可继续添加，processItems 按 id 并发安全） */}
          {step <= 2 && (
            <FileDropzone onFilesAdded={handleFilesAdded} disabled={false} />
          )}

          {/* 文件处理统计 */}
          {files.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>共 <strong className="text-slate-700">{stats.total}</strong> 个文件</span>
              {stats.processing > 0 && <span className="text-sky-600 animate-pulse"><Clock className="w-3 h-3 inline mr-0.5" /> 识别中 {stats.processing}...</span>}
              <span className="text-green-600"><CheckCircle2 className="w-3 h-3 inline mr-0.5" /> 识别完成 {stats.done}</span>
              {stats.verified > 0 && <span className="text-sky-600"><CheckCircle2 className="w-3 h-3 inline mr-0.5" /> 已确认 {stats.verified}</span>}
              {stats.errors > 0 && <span className="text-red-600"><XCircle className="w-3 h-3 inline mr-0.5" /> 失败 {stats.errors}</span>}
              <div className="flex-1" />
              {stats.done > 0 && stats.verified < stats.done && (
                <button type="button" onClick={() => setStep(3)} className="px-2.5 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-md hover:bg-sky-100">
                  去校验确认 →
                </button>
              )}
            </div>
          )}

          {/* 文件列表 */}
          {files.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">文件处理列表</span>
                <div className="flex items-center gap-2">
                  {stats.done > 0 && (
                    <button type="button" onClick={handleAutoPair}
                      className="px-2.5 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-md hover:bg-sky-100">
                      <Link2 className="w-3 h-3 inline mr-1" />自动配对
                    </button>
                  )}
                  <button type="button" onClick={() => setFiles([])}
                    className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-red-500">
                    清空列表
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-50">
                {files.map((f) => (
                  <FileRow key={f.id} item={f} onEdit={(id) => setEditingId(id)} onRemove={handleRemove} />
                ))}
              </div>
            </div>
          )}

          {/* 步骤 3：配对面板 + 校验 */}
          {step >= 3 && stats.done > 0 && (
            <div className="space-y-4">
              <PairingPanel
                items={files}
                onPair={(vid, iid) => {
                  setFiles((prev) => prev.map((f) =>
                    f.id === vid ? { ...f, pairId: iid } :
                    f.id === iid ? { ...f, pairId: vid } : f
                  ));
                }}
                onUnpair={(id) => {
                  setFiles((prev) => {
                    const item = prev.find((f) => f.id === id);
                    if (!item || !item.pairId) return prev;
                    return prev.map((f) =>
                      f.id === id || f.id === item.pairId ? { ...f, pairId: null } : f
                    );
                  });
                }}
              />

              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-3">
                <div className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{stats.done}</span> 个文件待确认，
                  <span className="font-medium text-green-600 ml-1">{stats.verified}</span> 个已确认
                </div>
                <div className="flex items-center gap-2">
                  {files.filter((f) => f.status === 'ocr-done').slice(0, 1).map((f) => (
                    <button key={f.id} type="button" onClick={() => setEditingId(f.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
                      逐项校验
                    </button>
                  ))}
                  <button type="button" onClick={() => {
                    // 只批量确认高置信度结果；低置信度仍须逐条人工校验（防盲信坏数据）
                    setFiles((prev) => prev.map((f) =>
                      f.status === 'ocr-done' && f.confidence >= 80 ? { ...f, status: 'verified' as const, correctedResult: f.ocrResult } : f
                    ));
                    showToast('已批量确认高置信度结果（低置信度请逐条校验）', 'info');
                  }}
                    className="px-3 py-1.5 text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100">
                    批量确认高置信
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ★ 低置信度拦截提示（杜绝静默丢件） */}
          {step >= 3 && blocked.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                有 <strong>{blocked.length}</strong> 件识别置信度不足 80%（列表中黄/红标记），本次<strong>不会入池</strong>；
                请逐条「校验」确认，识别无误后再入池。
              </span>
            </div>
          )}

          {/* 操作按钮 */}
          {files.length > 0 && stats.done > 0 && (
            <div className="flex justify-end gap-3 pt-2">
              {step < 3 && (
                <button type="button" onClick={() => setStep(3)}
                  className="px-4 py-2 text-sm font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100">
                  进入校验确认
                </button>
              )}
              {step >= 3 && (
                <button type="button" onClick={handleConfirm}
                  disabled={uploading || eligible.length === 0}
                  className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-slate-300 transition-colors">
                  <CheckCircle2 className="w-4 h-4" />
                  {uploading ? '正在上传…' : `确认入待组卷池 (${eligible.length} 件)`}
                </button>
              )}
            </div>
          )}

          {/* 步骤 4：成功提示 */}
          {step === 4 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <h3 className="text-lg font-bold text-green-800">已入待组卷池</h3>
              <p className="text-sm text-green-600 mt-1">凭证已进入待组卷池，可前往左侧"待分配条目池"进行组卷操作</p>
            </div>
          )}

          {/* 空状态 */}
          {files.length === 0 && step === 1 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-400">
              <Upload className="w-10 h-10 mx-auto mb-2" />
              <p className="text-sm">拖拽或点击上方上传区域选择文件</p>
              <p className="text-xs mt-1">支持的格式：PDF / TIFF / JPG / PNG / OFD / XML</p>
            </div>
          )}
        </div>

        {/* 校验弹窗（内嵌） */}
        {editingItem && (
          <VerifyEditor
            item={editingItem}
            onSave={handleSaveCorrection}
            onClose={() => setEditingId(null)}
          />
        )}
      </div>
    </div>
  );
};

export default VoucherUploadModal;


