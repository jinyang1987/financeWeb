/**
 *
 * AuditLogsPanel — 系统安全审计日志（2026-08-16 接真重构）
 *
 * 数据源（全真）：
 *   - 借阅全生命周期操作日志（/audit/logs，borrowStore.logs 镜像）
 *   - 件级时间线（records[].auditLogs，上传/组卷等真实事件）
 * 「一键核算审计链」调用 GET /audit/verify：服务端重算 ams_operation_log
 * 哈希链（SHA-256 单向链），如实返回 通过/不可验/断链 计数。
 *
 * 历史说明：原 5 条写死的管理员日志与 setTimeout 假验链已移除。
 */

import React, { useState, useMemo } from 'react';
import { Search, Fingerprint, ShieldCheck, RefreshCw, Calendar, ShieldAlert } from 'lucide-react';
import { ArchiveRecord } from '../types';
import { useBorrowStore } from '../stores/borrowStore';
import { http } from '../services/http';

interface AuditLogsPanelProps {
  records: ArchiveRecord[];
  triggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

interface GenericAuditRecord {
  id: string;
  time: string;
  user: string;
  ip: string;
  action: string;
  details: string;
  hash: string;
  tamperFree: boolean;
}

interface VerifyResult {
  total: number;
  verified: number;
  unverifiable: number;
  broken: number;
  chainIntact: boolean;
}

export const AuditLogsPanel: React.FC<AuditLogsPanelProps> = ({ records, triggerToast }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [endDate, setEndDate] = useState('2026-12-31');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  // 借阅全生命周期操作日志（检索/申请/审批/履约/查看/打印）
  const borrowLogs = useBorrowStore((s) => s.logs);

  // 件级时间线 + 借阅操作日志合并（全真数据源）
  const allLogsJoined = useMemo(() => {
    const list: GenericAuditRecord[] = [];

    records?.forEach(rec => {
      rec.auditLogs?.forEach(entry => {
        if (!list.some(item => item.id === entry.id)) {
          list.push({
            id: entry.id,
            time: entry.timestamp,
            user: entry.operator?.split(' ')[0] || 'Unknown',
            ip: entry.ipAddress || '—',
            action: entry.action || 'Unknown Action',
            details: `【档号:${rec.archiveCode || 'N/A'}】` + (entry.details || ''),
            hash: rec.components?.[0]?.hash?.substring(0, 32) || '',
            tamperFree: rec.checks?.complete ?? true,
          });
        }
      });
    });

    // 借阅操作日志并入（等保：搜索/借阅/查看/打印全量留痕）
    borrowLogs.forEach(entry => {
      if (!list.some(item => item.id === entry.id)) {
        list.push({
          id: entry.id,
          time: entry.timestamp,
          user: entry.actorName,
          ip: '—',
          action: `借阅·${entry.action}`,
          details: `【${entry.target}】${entry.detail || ''}（${entry.actorRoleLabel}）`,
          hash: '',
          tamperFree: true,
        });
      }
    });

    // Sort by timestamp desc
    return list.sort((a, b) => b.time.localeCompare(a.time));
  }, [records, borrowLogs]);

  // Filtered list
  const filteredLogs = useMemo(() => {
    return allLogsJoined.filter(log => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = q === '' ||
        log.user.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.ip.includes(q);

      const matchesDate = (log.time.split(' ')[0] >= startDate) && (log.time.split(' ')[0] <= endDate);

      return matchesSearch && matchesDate;
    });
  }, [allLogsJoined, searchQuery, startDate, endDate]);

  // 真实链式验真（服务端重算 SHA-256 哈希链）
  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const r = await http.get<VerifyResult>('/audit/verify');
      setVerifyResult(r);
      if (r.broken > 0) {
        triggerToast(`审计链验真：${r.total} 条中发现 ${r.broken} 条断链（疑似篡改/删除），请立即排查！`, 'warning');
      } else if (r.unverifiable > 0) {
        triggerToast(`审计链完整：${r.verified} 条验真通过，${r.unverifiable} 条为精度升级前历史记录（无法重算，如实标注）`, 'info');
      } else {
        triggerToast(`审计链验真通过：${r.verified}/${r.total} 条哈希逐环扣合，无篡改痕迹`, 'success');
      }
    } catch (e) {
      triggerToast('验真失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div id="audit-logs-panel-area" className="space-y-4 animate-in fade-in duration-200">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-sky-600" />
            <span>系统安全审计日志</span>
          </h2>
          {verifyResult && (
            <p className={`text-xs mt-1.5 font-medium ${verifyResult.broken > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              最近一次验链：共 {verifyResult.total} 条 · 验真通过 {verifyResult.verified} · 历史不可验 {verifyResult.unverifiable} · 断链 {verifyResult.broken}
            </p>
          )}
        </div>
        
        <button
          type="button"
          disabled={isVerifying}
          onClick={handleVerifyChain}
          className={`px-4 py-2 font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer ${
            isVerifying ? 'bg-sky-400 text-sky-50' : 'bg-sky-600 hover:bg-sky-700 text-white'
          }`}
        >
          {isVerifying ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-white" />
          )}
          <span>{isVerifying ? '验链中…' : '审计链验真'}</span>
        </button>
      </div>

      {/* Filter panel bar */}
      <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-2xl grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs font-sans">
        <div className="md:col-span-5 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-slate-500 whitespace-nowrap">审计时间阶段:</span>
          <input 
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-slate-700 focus:outline-none focus:border-sky-500 font-mono w-full"
          />
          <span className="text-slate-300 shrink-0 text-slate-400">至</span>
          <input 
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-slate-700 focus:outline-none focus:border-sky-500 font-mono w-full"
          />
        </div>

        <div className="md:col-span-4 relative flex items-center">
          <input 
            type="text"
            placeholder="搜索行为/用户/档号/留痕细节..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl py-1.5 pl-8 pr-4 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-500 w-full"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>

        <div className="md:col-span-3 text-right">
          <span className="text-slate-500">已检索到 <strong className="text-slate-800 font-mono">{filteredLogs.length}</strong> 条合规安全留痕</span>
        </div>
      </div>

      {/* Main Table view */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-sans" id="audit-trail-logs-table">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-40">操作时间 (Time)</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-28">操作柜员 (User)</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-32">IP 地址 (IP)</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold w-44">事件行为 (Action)</th>
                <th className="px-4 py-3 text-left text-[13px] font-semibold">详情</th>
                <th className="px-4 py-3 text-center text-[13px] font-semibold w-28">不可篡改验证</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => (
                <tr key={log.id} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{log.time}</td>
                  <td className="px-4 py-3 text-sm text-slate-800">{log.user}</td>
                  <td className="px-4 py-3">
                    <code className="font-mono text-[13px] text-slate-600">
                      {log.ip}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-sky-50 text-sky-800 border border-sky-100 font-bold rounded">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 leading-relaxed" title={log.details}>
                    {log.details}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-bold text-[10px]">
                      <ShieldCheck className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>链上存证</span>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    暂无符合条件的审计日志
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};


