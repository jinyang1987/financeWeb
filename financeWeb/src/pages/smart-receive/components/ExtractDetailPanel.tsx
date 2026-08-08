/**
 * @license
 * Copyright (c) 2024. All rights reserved.
 * Smart Receive - Extract detail panel
 *
 * 2026-08-08 表格化改造：字段卡片 → DetailRows 明细表（字段/值/置信度/匹配规则），
 * 头部与 OcrDetailPanel/ConvertDetailPanel 统一为 DetailPanelHeader。
 */

import React from 'react';
import { Database } from 'lucide-react';
import { DetailRows, DetailPanelHeader } from '../../../components/common/DetailTable';
import type { OcrJob } from '../types';

const CONFIDENCE_BADGE: Record<string, { label: string; cls: string }> = {
  high: { label: '高置信', cls: 'bg-emerald-50 text-emerald-700' },
  medium: { label: '中置信', cls: 'bg-amber-50 text-amber-700' },
  low: { label: '低置信', cls: 'bg-slate-100 text-slate-500' },
};

const ExtractDetailPanel: React.FC<{ job: OcrJob | undefined }> = ({ job }) => {
  if (!job || job.status !== 'done') {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-300 text-xs">
        <div className="text-center">
          <Database className="w-8 h-8 mx-auto opacity-30 mb-2" />
          选择左侧已识别的文件
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <DetailPanelHeader title={job.fileName} subtitle={job.timestamp} />
      <div className="flex-1 overflow-auto p-3">
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
          提取字段明细（{job.extracted.length}）
        </div>
        <DetailRows
          heads={['字段', '值', '置信度', '匹配规则']}
          rows={job.extracted.map((field) => {
            const badge = CONFIDENCE_BADGE[field.confidence] || CONFIDENCE_BADGE.low;
            return [
              field.label,
              <span className="font-semibold text-slate-800">{field.value}</span>,
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.cls}`}>{badge.label}</span>,
              field.key,
            ];
          })}
          monoCols={[3]}
          emptyText="未提取到结构化字段"
        />

        {/* Source text context */}
        {job.ocrText && (
          <div className="mt-4">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">来源文本</div>
            <div className="bg-slate-50 rounded-lg p-3 text-[10px] text-slate-600 font-mono whitespace-pre-wrap max-h-40 overflow-auto">
              {job.ocrText.slice(0, 500)}{job.ocrText.length > 500 ? '...' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExtractDetailPanel;
