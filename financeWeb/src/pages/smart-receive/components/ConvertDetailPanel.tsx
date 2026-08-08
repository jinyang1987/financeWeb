﻿﻿﻿﻿﻿﻿﻿/**
 * @license
 * Copyright (c) 2024. All rights reserved.
 * Smart Receive - Convert detail panel
 */

import React, { useState } from 'react';
import {
  FileType, Loader2, CheckCircle2, XCircle, Eye, EyeOff,
} from 'lucide-react';
import { FieldGrid, DetailPanelHeader } from '../../../components/common/DetailTable';
import type { ConvertJob } from '../types';

const ConvertDetailPanel: React.FC<{ job: ConvertJob | undefined }> = ({ job }) => {
  const [showRaw, setShowRaw] = useState(false);

  if (!job) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-300 text-xs">
        <div className="text-center">
          <FileType className="w-8 h-8 mx-auto opacity-30 mb-2" />
          选择左侧转换记录查看结果
        </div>
      </div>
    );
  }

  if (job.status === 'processing') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
      </div>
    );
  }

  if (job.status === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <XCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <div className="text-xs font-bold text-red-600">转换失败</div>
        <div className="text-[10px] text-slate-500 mt-1">{job.error}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DetailPanelHeader
        icon={<CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
        title={job.fileName}
        subtitle={`${job.sourceFormat} → ${job.targetFormat}`}
      />

      <div className="flex-1 overflow-auto p-3">
        <FieldGrid
          columns={3}
          fields={[
            { label: '源格式', value: job.sourceFormat, mono: true },
            { label: '目标格式', value: job.targetFormat, mono: true },
            { label: '大小变化', value: `${job.originalSize} → ${job.convertedSize}`, mono: true },
          ]}
        />
        <div className="flex items-center justify-between mt-4 mb-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">转换结果</span>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-[10px] text-slate-400 hover:text-sky-600 flex items-center gap-1 cursor-pointer"
          >
            {showRaw ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showRaw ? '预览' : '原始'}
          </button>
        </div>
        <div
          className={`bg-slate-50 rounded-lg p-3 text-[11px] font-mono whitespace-pre-wrap overflow-auto ${
            showRaw ? 'text-slate-600' : 'text-slate-700 leading-relaxed'
          }`}
          style={{ maxHeight: 'calc(100vh - 340px)' }}
        >
          {job.convertedText || '(无转换内容)'}
        </div>
      </div>
    </div>
  );
};

export default ConvertDetailPanel;

