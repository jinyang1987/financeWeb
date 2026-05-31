/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Clock, ShieldCheck, UserCheck, Settings, AlertCircle, RefreshCw } from 'lucide-react';
import { AuditLog } from '../types';

interface AuditTimelineProps {
  logs: AuditLog[];
}

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ logs }) => {
  const getLogIcon = (action: string) => {
    if (action.includes('完成') || action.includes('合格') || action.includes('通过') || action.includes('修复')) {
      return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
    }
    if (action.includes('自动') || action.includes('规则') || action.includes('系统')) {
      return <Settings className="w-4 h-4 text-blue-600" />;
    }
    if (action.includes('异常') || action.includes('未') || action.includes('失效') || action.includes('告警')) {
      return <AlertCircle className="w-4 h-4 text-amber-600 animate-pulse" />;
    }
    return <UserCheck className="w-4 h-4 text-indigo-600" />;
  };

  const getLogColorClass = (action: string) => {
    if (action.includes('完成') || action.includes('合格') || action.includes('通过') || action.includes('修复')) {
      return 'border-emerald-200 bg-emerald-50';
    }
    if (action.includes('异常') || action.includes('未') || action.includes('失效') || action.includes('告警')) {
      return 'border-amber-200 bg-amber-50/70';
    }
    return 'border-slate-200 bg-slate-50';
  };

  return (
    <div id="audit-trail-timeline-box" className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-indigo-600" />
          <span>Alfresco 原生全生命周期固化审计日志 (Audit Trail)</span>
        </h4>
        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold select-none">
          国标/区块链双链防篡改防泄漏存证
        </span>
      </div>

      <div className="relative border-l border-slate-200 pl-4 ml-2.5 space-y-4 py-1">
        {logs.map((log) => (
          <div key={log.id} className="relative group text-left" id={`timeline-item-${log.id}`}>
            {/* Circle dot absolute overlay */}
            <span className="absolute -left-[25px] top-1 bg-white border border-slate-200 rounded-full p-0.5 shadow-sm group-hover:scale-110 transition-transform">
              {getLogIcon(log.action)}
            </span>

            <div className="space-y-1">
              {/* Top metadata row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono text-slate-400 font-bold">{log.timestamp}</span>
                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded border ${getLogColorClass(log.action)}`}>
                  {log.action}
                </span>
                <span className="text-[10px] text-slate-500">
                  操作人：<strong className="text-slate-700">{log.operator}</strong>
                </span>
                <span className="text-[9px] font-mono text-slate-400 select-all" title="操作客户端源IP">
                  (IP: {log.ipAddress})
                </span>
              </div>

              {/* Action content details */}
              <p className="text-xs text-slate-600 font-sans leading-relaxed">
                {log.details}
              </p>
            </div>
          </div>
        ))}

        {logs.length === 0 && (
          <div className="text-center text-slate-400 py-6 text-xs">
            该凭证暂未产生生命周期审计流水。
          </div>
        )}
      </div>
    </div>
  );
};
