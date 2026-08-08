﻿﻿﻿﻿﻿﻿﻿/**
 * @license
 * Copyright (c) 2024. All rights reserved.
 * Smart Receive - OCR tab (upload area + job list)
 */

import React from 'react';
import {
  ScanText, Scan, Image, FileText,
  Loader2, CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import type { OcrJob } from '../types';

export interface OcrTabProps {
  ocrJobs: OcrJob[];
  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;
  handleOcrUpload: (files: FileList | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showPreview: string | null;
  setShowPreview: (id: string | null) => void;
}

const OcrTab: React.FC<OcrTabProps> = ({
  ocrJobs, selectedJobId, setSelectedJobId,
  handleOcrUpload, fileInputRef,
}) => (
  <div className="flex-1 flex flex-col min-h-0">
    {/* Upload Area */}
    <div className="shrink-0 p-4">
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center
          hover:border-sky-300 hover:bg-sky-50/20 cursor-pointer transition-all group"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={e => handleOcrUpload(e.target.files)}
        />
        <ScanText className="w-8 h-8 mx-auto text-slate-300 group-hover:text-sky-400 transition-colors" />
        <div className="mt-2 text-xs font-bold text-slate-500 group-hover:text-sky-600">
          点击上传图片或 PDF 进行 OCR 识别
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">支持 JPG / PNG / TIFF / PDF · 中英双语识别</div>
      </div>
    </div>

    {/* Job List */}
    <div className="flex-1 overflow-auto px-4 pb-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
        识别记录 ({ocrJobs.length})
      </div>
      {ocrJobs.length === 0 ? (
        <div className="text-center text-slate-300 text-xs py-12">
          <Scan className="w-8 h-8 mx-auto opacity-30 mb-2" />
          暂无识别记录，请上传文件
        </div>
      ) : (
        <div className="space-y-1.5">
          {ocrJobs.map(job => (
            <button
              key={job.id}
              type="button"
              onClick={() => setSelectedJobId(job.id)}
              className={`w-full text-left p-2.5 rounded-lg text-xs border transition-all cursor-pointer ${
                selectedJobId === job.id
                  ? 'border-sky-200 bg-sky-50/50'
                  : 'border-transparent hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                {job.fileType === 'image' ? (
                  <Image className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="font-medium text-slate-700 truncate flex-1">{job.fileName}</span>
                {job.status === 'processing' && <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin" />}
                {job.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                {job.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                <Clock className="w-3 h-3" />
                <span>{job.timestamp}</span>
                {job.status === 'done' && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="text-emerald-600">{job.extracted.length} 个字段</span>
                  </>
                )}
                {job.status === 'processing' && (
                  <span className="text-sky-500">{job.progress}%</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  </div>
);

export default OcrTab;

