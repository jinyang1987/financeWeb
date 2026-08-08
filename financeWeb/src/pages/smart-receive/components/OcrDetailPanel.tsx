﻿﻿﻿﻿﻿﻿﻿/**
 * @license
 * Copyright (c) 2024. All rights reserved.
 * Smart Receive - OCR detail panel (with loading / error / result states)
 */

import React, { useState } from 'react';
import {
  ScanText, Loader2, CheckCircle2, XCircle, Copy, Check,
} from 'lucide-react';
import { DetailRows, DetailPanelHeader } from '../../../components/common/DetailTable';
import type { OcrJob } from '../types';

const OcrDetailPanel: React.FC<{ job: OcrJob | undefined }> = ({ job }) => {
  const [copied, setCopied] = useState(false);

  if (!job) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-300 text-xs">
        <div className="text-center">
          <ScanText className="w-8 h-8 mx-auto opacity-30 mb-2" />
          选择左侧识别记录查看详情
        </div>
      </div>
    );
  }

  if (job.status === 'processing') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500 mx-auto mb-2" />
          <div className="text-xs text-slate-500">OCR 识别中...</div>
          <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-2 mx-auto overflow-hidden">
            <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${job.progress}%` }} />
          </div>
          <div className="text-[10px] text-slate-400 mt-1">{job.progress}%</div>
        </div>
      </div>
    );
  }

  if (job.status === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-6 max-w-[300px]">
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
          <div className="text-xs font-bold text-red-600 mb-1">识别失败</div>
          <div className="text-[10px] text-slate-500 bg-red-50 rounded-lg p-2 text-left whitespace-pre-wrap leading-relaxed">
            {job.error}
          </div>
          <button
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>('input[type="file"]');
              if (input) input.click();
            }}
            className="mt-3 text-[10px] text-sky-600 hover:text-sky-800 font-bold cursor-pointer"
          >
            重新上传文件
          </button>
        </div>
      </div>
    );
  }

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DetailPanelHeader
        icon={<CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
        title={job.fileName}
        subtitle={job.timestamp}
      />

      {/* OCR Text */}
      <div className="flex-1 overflow-auto p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">OCR 识别文本</span>
          <button
            onClick={() => handleCopy(job.ocrText)}
            className="text-[10px] text-slate-400 hover:text-sky-600 flex items-center gap-1 cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-[11px] text-slate-700 leading-relaxed font-mono whitespace-pre-wrap max-h-60 overflow-auto">
          {job.ocrText || '(无识别内容)'}
        </div>

        {/* Extracted fields summary */}
        {job.extracted.length > 0 && (
          <>
            <div className="flex items-center justify-between mt-4 mb-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                提取字段 ({job.extracted.length})
              </span>
            </div>
            <DetailRows
              heads={['字段', '值', '置信度']}
              rows={job.extracted.map((field) => {
                const cls = field.confidence === 'high' ? 'bg-emerald-50 text-emerald-700'
                  : field.confidence === 'medium' ? 'bg-amber-50 text-amber-700'
                  : 'bg-slate-100 text-slate-500';
                const label = field.confidence === 'high' ? '高' : field.confidence === 'medium' ? '中' : '低';
                return [
                  field.label,
                  <span className="font-mono font-medium text-slate-800">{field.value}</span>,
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cls}`}>{label}</span>,
                ];
              })}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default OcrDetailPanel;

