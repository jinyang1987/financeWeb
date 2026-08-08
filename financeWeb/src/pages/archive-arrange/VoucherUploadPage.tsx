/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * VoucherUploadPage — 凭证归档上传
 *
 * 档案管理员手工上传记账凭证和原始凭证的入口。
 * 核心流程：选择文件 → AI识别与OCR → 校验确认 → 入待组卷池
 *
 * 功能：
 *   1. 批量文件上传（PDF/TIFF/JPG/PNG/OFD/XML）
 *   2. 自动分类（记账凭证/原始凭证）与配对关联
 *   3. OCR 元数据提取（凭证号、金额、日期）
 *   4. 人工校验与修正
 *   5. 入待组卷池（生成 ArchiveRecord）
 */

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Upload, CheckCircle2, AlertCircle, XCircle, FileText, FileImage,
  FileSpreadsheet, ChevronDown, ChevronRight, Search, Eye, RefreshCw,
  Link2, Check, X, Printer, Layers, Cpu, Save, Clock,
} from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import type { ArchiveRecord } from '../../types';

// ── 上传文件条目 ──
interface UploadFileItem {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'tiff' | 'jpg' | 'png' | 'ofd' | 'xml' | 'unknown';
  category: '记账凭证' | '原始凭证' | '未识别';
  status: 'pending' | 'processing' | 'ocr-done' | 'verified' | 'error';
  /** OCR 提取的元数据 */
  ocrResult: {
    voucherNo: string;
    amount: string;
    date: string;
    archiveType: string;
  };
  /** 人工修正后的元数据 */
  correctedResult: {
    voucherNo: string;
    amount: string;
    date: string;
    archiveType: string;
  };
  /** 配对ID（关联的记账凭证或原始凭证） */
  pairId: string | null;
  /** 错误信息 */
  errorMsg: string;
  /** 积分值 */
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

// ── Mock OCR 处理 ──
const MOCK_VOUCHERS = [
  { name: '2026年05月记账凭证.pdf', voucherNo: '记-004', amount: '23,500.00', date: '2026-05-10', type: '记账凭证' as const },
  { name: '2026年05月记账凭证.pdf', voucherNo: '记-005', amount: '67,800.00', date: '2026-05-12', type: '记账凭证' as const },
  { name: '采购发票-增值税专用.pdf', voucherNo: 'INV-2026-00512', amount: '12,500.00', date: '2026-05-08', type: '原始凭证' as const },
  { name: '差旅费报销单.pdf', voucherNo: 'EXP-2026-00321', amount: '3,280.00', date: '2026-05-09', type: '原始凭证' as const },
];

function simulateOcr(fileName: string): UploadFileItem['ocrResult'] {
  // 根据文件名匹配mock
  const matched = MOCK_VOUCHERS.find((v) => fileName.includes(v.name.slice(0, 6)));
  if (matched) {
    return {
      voucherNo: matched.voucherNo,
      amount: matched.amount,
      date: matched.date,
      archiveType: matched.type,
    };
  }
  // 随机生成
  const types: UploadFileItem['category'][] = ['记账凭证', '原始凭证'];
  return {
    voucherNo: `自动-${String(Math.floor(Math.random() * 900) + 100)}`,
    amount: `${(Math.random() * 100000).toFixed(2)}`,
    date: `2026-${String(Math.floor(Math.random() * 6) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
    archiveType: types[Math.floor(Math.random() * 2)],
  };
}

// ── 子组件：步骤指示器 ──
const StepIndicator: React.FC<{ current: number }> = ({ current }) => {
  const steps = [
    { num: 1, label: '选择文件' },
    { num: 2, label: 'AI 识别与归类' },
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
  onEdit: (id: string, field: string, value: string) => void;
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

      {/* 可信度 */}
      {item.status === 'ocr-done' && (
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
          item.confidence >= 80 ? 'bg-green-100 text-green-700' :
          item.confidence >= 50 ? 'bg-amber-100 text-amber-700' :
          'bg-red-100 text-red-700'
        }`}>
          {item.confidence}%
        </span>
      )}

      {/* 状态 */}
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${sc.color}`}>
        {sc.icon}{sc.label}
      </span>

      {/* 配对指示 */}
      {item.pairId && (
        <Link2 className="w-3.5 h-3.5 text-sky-400" />
      )}

      {/* 操作 */}
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

  // 找到已配对的
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

      {/* 已配对 */}
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

      {/* 未配对 - 手动配对 */}
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
  const display = item.correctedResult.voucherNo ? item.correctedResult : item.ocrResult;

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
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

          {/* 原件预览 */}
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

// ── 主组件 ──
const VoucherUploadPage: React.FC = () => {
  const records = useArchiveStore((s) => s.records);
  const setRecords = useArchiveStore((s) => s.setRecords);

  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 添加文件
  const handleFilesAdded = useCallback((newFiles: File[]) => {
    const items: UploadFileItem[] = newFiles.map((f) => ({
      id: `uf-${++fileIdCounter}`,
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
    // 自动开始处理
    setTimeout(() => processFiles([...files, ...items]), 500);
  }, [step, files]);

  // 模拟 OCR 处理
  const processFiles = (currentFiles: UploadFileItem[]) => {
    const updated = currentFiles.map((f) => {
      if (f.status !== 'pending') return f;
      return { ...f, status: 'processing' as const };
    });
    setFiles(updated);

    // 模拟异步 OCR
    setTimeout(() => {
      setFiles((prev) => prev.map((f) => {
        if (f.status !== 'processing') return f;
        const ocrResult = simulateOcr(f.name);
        const confidence = Math.floor(Math.random() * 40) + 55; // 55-94
        return {
          ...f,
          status: 'ocr-done' as const,
          category: ocrResult.archiveType as UploadFileItem['category'],
          ocrResult,
          confidence,
        };
      }));
    }, 1500);
  };

  // 自动配对（按金额）
  const handleAutoPair = useCallback(() => {
    setFiles((prev) => {
      const vouchers = prev.filter((f) => f.category === '记账凭证' && f.status !== 'pending' && !f.pairId);
      const invoices = prev.filter((f) => f.category === '原始凭证' && f.status !== 'pending' && !f.pairId);
      const pairMap = new Map<string, string>(); // voucherId → invoiceId

      // 按金额匹配
      for (const v of vouchers) {
        const match = invoices.find((inv) =>
          !pairMap.has(inv.id) &&
          inv.ocrResult.amount === v.ocrResult.amount
        );
        if (match) {
          pairMap.set(v.id, match.id);
        }
      }

      if (pairMap.size === 0) {
        showToast('未找到可自动配对的凭证', 'info');
        return prev;
      }

      showToast(`已自动配对 ${pairMap.size} 对`);
      return prev.map((f) => {
        if (pairMap.has(f.id)) return { ...f, pairId: pairMap.get(f.id)! };
        // 检查是否是配对的invoice
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

  // 入待组卷池
  const handleConfirm = useCallback(() => {
    const verified = files.filter((f) => f.status === 'verified' || (f.status === 'ocr-done' && f.confidence >= 80));
    if (verified.length === 0) {
      showToast('请先校验确认后再入池', 'info');
      return;
    }

    // 生成 ArchiveRecord 条目
    const newRecords: ArchiveRecord[] = verified.map((f, i) => {
      const display = f.correctedResult.voucherNo ? f.correctedResult : f.ocrResult;
      return {
        id: `manual-${Date.now()}-${i}`,
        archiveCode: `Z001-KU·${display.archiveType === '记账凭证' ? '01' : '01'}·2026-D30-0000-${String(i + 1).padStart(4, '0')}`,
        voucherNo: display.voucherNo,
        archiveType: display.archiveType,
        department: '—',
        amount: parseFloat(display.amount.replace(/,/g, '')) || 0,
        year: '2026',
        month: display.date.split('-')[1] || '01',
        retention: '30年',
        status: '仅件数据',
        numbered: false,
        source: 'digitized',
        carrierType: 'paper',
        managementMode: 'volume-mode',
        checks: { real: true, complete: true, usable: true, safe: true },
        checkDetails: [],
        components: [{
          name: f.name,
          type: f.category === '记账凭证' ? '记账凭证主件' : '原始电子附件',
          size: f.size,
          contentType: f.type === 'pdf' ? 'pdf' : f.type === 'ofd' ? 'ofd' : f.type === 'xml' ? 'xml' : 'unknown',
          hash: `mock-hash-${f.id}`,
          signatureVerified: false,
        }],
        auditLogs: [{
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
          action: '手工归档上传',
          operator: '档案管理员',
          details: `通过凭证归档上传功能导入: ${f.name}`,
          ipAddress: '127.0.0.1',
        }],
        childRecordIds: f.pairId ? [f.pairId] : undefined,
      };
    });

    // 合并到 archiveStore
    setRecords([...records, ...newRecords]);

    // 重置
    setFiles([]);
    setStep(4);
    showToast(`成功将 ${newRecords.length} 件凭证入待组卷池`);

    // 3秒后回到步骤1
    setTimeout(() => setStep(1), 3000);
  }, [files, records, setRecords]);

  // 统计
  const stats = useMemo(() => ({
    total: files.length,
    pending: files.filter((f) => f.status === 'pending').length,
    processing: files.filter((f) => f.status === 'processing').length,
    done: files.filter((f) => f.status === 'ocr-done' || f.status === 'verified').length,
    verified: files.filter((f) => f.status === 'verified').length,
    errors: files.filter((f) => f.status === 'error').length,
  }), [files]);

  const editingItem = editingId ? files.find((f) => f.id === editingId) : null;

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-slate-700 text-white'}`}>
          {toast.message}
        </div>
      )}

      {/* 顶栏 */}
      <div className="px-6 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3 mb-3">
          <Upload className="w-5 h-5 text-slate-600" />
          <h1 className="text-base font-bold text-slate-800">凭证归档上传</h1>
          <span className="text-xs text-slate-400">档案管理员手工导入记账凭证与原始凭证</span>
        </div>
        <StepIndicator current={step} />
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* 步骤 1+2：上传区 */}
        {step <= 2 && (
          <FileDropzone onFilesAdded={handleFilesAdded} disabled={stats.processing > 0} />
        )}

        {/* 文件处理统计（步骤 2+3 时显示） */}
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
                <FileRow key={f.id} item={f} onEdit={() => {}} onRemove={handleRemove} />
              ))}
            </div>
          </div>
        )}

        {/* 步骤 3：配对面板 + 校验 */}
        {step >= 3 && stats.done > 0 && (
          <div className="space-y-4">
            {/* 配对 */}
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

            {/* 校验确认按钮组 */}
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
                  setFiles((prev) => prev.map((f) =>
                    f.status === 'ocr-done' ? { ...f, status: 'verified' as const, correctedResult: f.ocrResult } : f
                  ));
                  showToast('已批量确认所有识别结果');
                }}
                  className="px-3 py-1.5 text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100">
                  批量确认所有
                </button>
              </div>
            </div>
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
                disabled={stats.verified === 0 && stats.done === 0}
                className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-slate-300 transition-colors">
                <CheckCircle2 className="w-4 h-4" />
                确认入待组卷池 ({stats.verified || stats.done} 件)
              </button>
            )}
          </div>
        )}

        {/* 步骤 4：成功提示 */}
        {step === 4 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
            <h3 className="text-lg font-bold text-green-800">已入待组卷池</h3>
            <p className="text-sm text-green-600 mt-1">凭证已进入待组卷池，可前往"组卷工作台"进行组卷操作</p>
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

      {/* 校验弹窗 */}
      {editingItem && (
        <VerifyEditor
          item={editingItem}
          onSave={handleSaveCorrection}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
};

export default VoucherUploadPage;


