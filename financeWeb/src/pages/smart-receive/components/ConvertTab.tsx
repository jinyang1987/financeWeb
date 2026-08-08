﻿﻿﻿﻿﻿﻿﻿/**
 * @license
 * Copyright (c) 2024. All rights reserved.
 * Smart Receive - Convert tab (PDF upload + format selection + job list)
 */

import React, { useState } from 'react';
import {
  FileText, FileType, Code, Table,
  Loader2, CheckCircle2, XCircle, ArrowRight,
} from 'lucide-react';
import type { ConvertJob } from '../types';

interface ConvertTabProps {
  convertJobs: ConvertJob[];
  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;
  handleConvert: (file: File, targetFormat: string) => void;
  pdfInputRef: React.RefObject<HTMLInputElement | null>;
}

const ConvertTab: React.FC<ConvertTabProps> = ({
  convertJobs, selectedJobId, setSelectedJobId, handleConvert, pdfInputRef,
}) => {
  const [targetFormat, setTargetFormat] = useState<string>('text/plain');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    handleConvert(files[0], targetFormat);
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const formats = [
    { value: 'text/plain', label: '纯文本 (.txt)', Icon: FileText, color: 'blue' },
    { value: 'text/html', label: 'HTML 网页 (.html)', Icon: Code, color: 'amber' },
    { value: 'text/xml', label: 'XML 文档 (.xml)', Icon: Table, color: 'emerald' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Upload + Format select */}
      <div className="shrink-0 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">目标格式</label>
            <div className="flex gap-2">
              {formats.map(f => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setTargetFormat(f.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                    targetFormat === f.value
                      ? `border-${f.color}-300 bg-${f.color}-50 text-${f.color}-700`
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <f.Icon className="w-3.5 h-3.5" />
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          onClick={() => pdfInputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center
            hover:border-emerald-300 hover:bg-emerald-50/20 cursor-pointer transition-all"
        >
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <FileType className="w-6 h-6 mx-auto text-slate-300" />
          <div className="mt-1 text-xs font-bold text-slate-500">点击上传 PDF 文件进行格式转换</div>
          <div className="text-[10px] text-slate-400 mt-0.5">将 PDF 转换为可编辑的文本格式</div>
        </div>
      </div>

      {/* Job List */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
          转换记录 ({convertJobs.length})
        </div>
        {convertJobs.length === 0 ? (
          <div className="text-center text-slate-300 text-xs py-12">
            <FileType className="w-8 h-8 mx-auto opacity-30 mb-2" />
            暂无转换记录
          </div>
        ) : (
          <div className="space-y-1.5">
            {convertJobs.map(job => (
              <button
                key={job.id}
                type="button"
                onClick={() => setSelectedJobId(job.id)}
                className={`w-full text-left p-2.5 rounded-lg text-xs border transition-all cursor-pointer ${
                  selectedJobId === job.id
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-medium text-slate-700 truncate flex-1">{job.fileName}</span>
                  {job.status === 'processing' && <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin" />}
                  {job.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                  {job.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                  <ArrowRight className="w-3 h-3" />
                  <span>{job.originalSize}</span>
                  {job.status === 'done' && job.convertedSize && (
                    <><span className="text-slate-300">→</span><span className="text-emerald-600">{job.convertedSize}</span></>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConvertTab;

