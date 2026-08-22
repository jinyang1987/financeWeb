/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ConfirmModal — 站内统一确认弹窗（2026-08-22）
 *
 * 替代 window.confirm：原生弹窗风格与站点不符、且不支持富文本说明。
 * 视觉与工作台 OpModal 同族（backdrop-blur + rounded-2xl + 图标圆底）。
 *
 * 用法：
 *   const [ask, setAsk] = useState<null | { message: React.ReactNode; action: () => void }>(null);
 *   <ConfirmModal open={!!ask} danger title="移入回收站" message={ask?.message}
 *     onCancel={() => setAsk(null)} onConfirm={() => { const a = ask?.action; setAsk(null); a?.(); }} />
 */

import React from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  /** 支持 JSX：多段说明/强调行 */
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 危险操作（红色图标 + 红色确认钮），默认 false（sky 蓝） */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open, title, message, confirmLabel = '确认', cancelLabel = '取消', danger = false,
  onConfirm, onCancel,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${danger ? 'bg-red-100' : 'bg-sky-100'}`}>
            {danger
              ? <AlertTriangle className="w-5 h-5 text-red-600" />
              : <HelpCircle className="w-5 h-5 text-sky-600" />}
          </div>
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
        </div>
        {message && <div className="text-sm text-slate-600 leading-relaxed pl-[52px]">{message}</div>}
        <div className="flex items-center gap-3 justify-end mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-sky-600 hover:bg-sky-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
