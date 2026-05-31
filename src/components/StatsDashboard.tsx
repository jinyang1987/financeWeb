/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FileText, Layers, ShieldCheck, AlertTriangle } from 'lucide-react';
import { ArchiveRecord } from '../types';

interface StatsDashboardProps {
  records: ArchiveRecord[];
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ records }) => {
  const totalCount = records.length;
  
  // Volume stats
  const groupedCount = records.filter(r => r.status === '已组卷').length;
  const groupingRate = totalCount > 0 ? Math.round((groupedCount / totalCount) * 100) : 0;
  
  // Four-properties compliance (checks.real && checks.complete && checks.usable && checks.safe all must be true)
  const compliantCount = records.filter(r => r.checks.real && r.checks.complete && r.checks.usable && r.checks.safe).length;
  const complianceRate = totalCount > 0 ? Math.round((compliantCount / totalCount) * 100) : 0;
  
  // Anomalies count (records containing at least one false property check)
  const anomaliesCount = records.filter(r => !r.checks.real || !r.checks.complete || !r.checks.usable || !r.checks.safe).length;

  return (
    <div id="stats-dashboard" className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
      {/* Total Archives */}
      <div 
        id="stat-card-total"
        className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-between"
      >
        <div>
          <span className="text-xs font-semibold text-slate-400 block mb-1">会计档案总件数</span>
          <span className="text-3xl font-bold text-slate-800 font-sans tracking-tight">{totalCount} <span className="text-sm font-normal text-slate-500">件</span></span>
        </div>
        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
          <FileText className="w-6 h-6" />
        </div>
      </div>

      {/* Grouped rate */}
      <div 
        id="stat-card-grouping"
        className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-between"
      >
        <div>
          <span className="text-xs font-semibold text-slate-400 block mb-1">自动组卷率</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800 font-sans tracking-tight">{groupingRate}%</span>
            <span className="text-xs text-slate-500 font-sans">({groupedCount}已组/{totalCount}总)</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
            <div 
              className="bg-teal-500 h-1.5 rounded-full transition-all duration-500" 
              style={{ width: `${groupingRate}%` }}
            />
          </div>
        </div>
        <div className="p-3 bg-teal-50 text-teal-600 rounded-lg">
          <Layers className="w-6 h-6" />
        </div>
      </div>

      {/* Compliance Rate */}
      <div 
        id="stat-card-compliance"
        className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-between"
      >
        <div>
          <span className="text-xs font-semibold text-slate-400 block mb-1">四性检测合格率</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800 font-sans tracking-tight">{complianceRate}%</span>
            <span className="text-xs text-slate-500 font-sans">({compliantCount}凭件完全合格)</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
            <div 
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" 
              style={{ width: `${complianceRate}%` }}
            />
          </div>
        </div>
        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
          <ShieldCheck className="w-6 h-6" />
        </div>
      </div>

      {/* Failed / Alerts */}
      <div 
        id="stat-card-anomalies"
        className={`rounded-xl border p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-between ${
          anomaliesCount > 0 
            ? 'bg-amber-50/50 border-amber-200 text-amber-900' 
            : 'bg-white border-slate-100'
        }`}
      >
        <div>
          <span className="text-xs font-semibold text-slate-400 block mb-1">待修复四性异常</span>
          <span className="text-3xl font-bold text-slate-800 font-sans tracking-tight">
            {anomaliesCount} <span className="text-sm font-normal text-slate-500">项</span>
          </span>
          <span className="text-xs text-slate-500 block mt-1.5">
            {anomaliesCount > 0 ? '可用性或哈希校验发出警报' : '目前全部归档符合国标规范'}
          </span>
        </div>
        <div className={`p-3 rounded-lg ${anomaliesCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
          <AlertTriangle className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};
