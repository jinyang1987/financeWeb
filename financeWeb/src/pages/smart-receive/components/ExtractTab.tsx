﻿﻿﻿﻿﻿﻿﻿/**
 * @license
 * Copyright (c) 2024. All rights reserved.
 * Smart Receive - Extract tab (structured field display)
 */

import React from 'react';
import { FileSearch, Database } from 'lucide-react';
import type { OcrJob } from '../types';

interface ExtractTabProps {
  ocrJobs: OcrJob[];
  selectedJobId: string | null;
}

const ExtractTab: React.FC<ExtractTabProps> = ({ ocrJobs, selectedJobId }) => {
  const doneJobs = ocrJobs.filter(j => j.status === 'done' && j.extracted.length > 0);
  const activeJob = ocrJobs.find(j => j.id === selectedJobId);

  const allFields = activeJob?.extracted || [];

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4">
      {/* Info */}
      <div className="flex items-center gap-3 mb-4 bg-sky-50/50 border border-sky-100 rounded-xl p-3 text-xs text-slate-600">
        <FileSearch className="w-5 h-5 text-sky-500 shrink-0" />
        <span>基于 OCR 识别结果，自动提取发票/合同/凭证中的结构化字段信息。</span>
      </div>

      {doneJobs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-300 text-xs">
          <div className="text-center">
            <Database className="w-8 h-8 mx-auto opacity-30 mb-2" />
            暂无提取数据，请先在 OCR 识别页面处理文件
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {/* Field Summary Card */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {allFields.slice(0, 12).map((field, i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-xl p-3">
                <div className="text-[10px] text-slate-400 mb-1">{field.label}</div>
                <div className="text-xs font-bold text-slate-800 font-mono truncate">{field.value}</div>
                <div className={`text-[9px] mt-1 ${
                  field.confidence === 'high' ? 'text-emerald-500' :
                  field.confidence === 'medium' ? 'text-amber-500' : 'text-slate-400'
                }`}>
                  {field.confidence === 'high' ? '高置信度' : field.confidence === 'medium' ? '中置信度' : '低置信度'}
                </div>
              </div>
            ))}
          </div>

          {/* Full Table */}
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">完整提取结果</div>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase">
                <th className="p-2 px-3 rounded-l-lg">字段名称</th>
                <th className="p-2 px-3">提取值</th>
                <th className="p-2 px-3 rounded-r-lg">置信度</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {allFields.map((field, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="p-2 px-3 text-slate-500">{field.label}</td>
                  <td className="p-2 px-3 font-mono font-medium text-slate-800">{field.value}</td>
                  <td className="p-2 px-3">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      field.confidence === 'high' ? 'bg-emerald-50 text-emerald-700' :
                      field.confidence === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {field.confidence === 'high' ? '高' : field.confidence === 'medium' ? '中' : '低'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExtractTab;

