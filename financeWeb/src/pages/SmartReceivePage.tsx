﻿﻿﻿﻿﻿﻿﻿/**
 * @license
 * Copyright (c) 2024. All rights reserved.
 * Smart Receive - Entry point
 */

import React, { useState, useRef } from 'react';
import {
  ScanText, FileSearch, FileType,
} from 'lucide-react';
import { useOcr } from './smart-receive/hooks/useOcr';
import { useConvert } from './smart-receive/hooks/useConvert';
import OcrTab from './smart-receive/components/OcrTab';
import OcrDetailPanel from './smart-receive/components/OcrDetailPanel';
import ExtractTab from './smart-receive/components/ExtractTab';
import ExtractDetailPanel from './smart-receive/components/ExtractDetailPanel';
import ConvertTab from './smart-receive/components/ConvertTab';
import ConvertDetailPanel from './smart-receive/components/ConvertDetailPanel';

const TAB_CONFIGS = [
  { key: 'ocr' as const, label: 'OCR 文字识别', Icon: ScanText, desc: '图片/扫描件文字提取' },
  { key: 'extract' as const, label: '智能信息提取', Icon: FileSearch, desc: '结构化字段自动解析' },
  { key: 'convert' as const, label: 'PDF 格式转版', Icon: FileType, desc: 'PDF→TXT/HTML/XML' },
];

const SmartReceivePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ocr' | 'extract' | 'convert'>('ocr');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const { ocrJobs, handleOcrUpload } = useOcr(setSelectedJobId);
  const { convertJobs, handleConvert } = useConvert();

  const selectedJob = ocrJobs.find(j => j.id === selectedJobId);
  const selectedConvert = convertJobs.find(j => j.id === selectedJobId);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 animate-in fade-in duration-200">
      {/* ===== Header ===== */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-slate-800">智能接收</h1>
          <p className="text-[11px] text-slate-400 mt-0.5">OCR智能识别 · PDF格式转换 · 元数据自动提取</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded font-mono">
            Tesseract.js 7.0
          </span>
          <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded font-mono">
            中英双语
          </span>
        </div>
      </div>

      {/* ===== Tabs ===== */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-5 flex">
        {TAB_CONFIGS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === tab.key
                ? 'border-sky-600 text-sky-700 bg-sky-50/30'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <tab.Icon className="w-4 h-4" />
            <span>{tab.label}</span>
            <span className="text-[10px] text-slate-400 font-normal">{tab.desc}</span>
          </button>
        ))}
      </div>

      {/* ===== Content ===== */}
      <div className="flex-1 flex min-h-0">
        {/* == Left / Main Area == */}
        <div className="flex-1 flex flex-col min-h-0 overflow-auto">
          {activeTab === 'ocr' && (
            <OcrTab
              ocrJobs={ocrJobs}
              selectedJobId={selectedJobId}
              setSelectedJobId={setSelectedJobId}
              handleOcrUpload={handleOcrUpload}
              fileInputRef={fileInputRef}
              showPreview={showPreview}
              setShowPreview={setShowPreview}
            />
          )}
          {activeTab === 'extract' && (
            <ExtractTab
              ocrJobs={ocrJobs}
              selectedJobId={selectedJobId}
            />
          )}
          {activeTab === 'convert' && (
            <ConvertTab
              convertJobs={convertJobs}
              selectedJobId={selectedJobId}
              setSelectedJobId={setSelectedJobId}
              handleConvert={handleConvert}
              pdfInputRef={pdfInputRef}
            />
          )}
        </div>

        {/* == Right Panel: Detail View == */}
        <div className="w-[380px] shrink-0 border-l border-slate-200 bg-white flex flex-col min-h-0">
          {activeTab === 'ocr' && <OcrDetailPanel job={selectedJob} />}
          {activeTab === 'extract' && <ExtractDetailPanel job={selectedJob} />}
          {activeTab === 'convert' && <ConvertDetailPanel job={selectedConvert} />}
        </div>
      </div>
    </div>
  );
};

export default SmartReceivePage;

