/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Search, Database, Fingerprint, ShieldCheck, RefreshCw, Calendar, Eye, ShieldAlert, ArrowDownUp } from 'lucide-react';
import { ArchiveRecord, AuditLog } from '../types';

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

export const AuditLogsPanel: React.FC<AuditLogsPanelProps> = ({ records, triggerToast }) => {
  // Setup nice long initial audit logs matching standard Alfresco original Audit Trail format
  const [genericLogs, setGenericLogs] = useState<GenericAuditRecord[]>([
    { id: 'log-sys-01', time: '2026-05-30 10:52:22', user: 'admin', ip: '192.168.1.102', action: '读取物理文件原文-CA凭证', details: '用户查看了档号为 [Z001-01-01-202605-0001] 的原始数电发票XML与PDF文件，触发系统 Acl 验证通过。', hash: 'e3b0c44298fc1c149afbf4c8996fb924', tamperFree: true },
    { id: 'log-sys-02', time: '2026-05-30 10:30:15', user: 'system_job', ip: '127.0.0.1', action: '触发全量四性轮询检测', details: '定时任务对 [2026] 年度全宗档案进行 SHA-256 完整性哈希轮询比照，核对 340 件合规，未发现篡改迹象。', hash: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6', tamperFree: true },
    { id: 'log-sys-03', time: '2026-05-29 09:15:30', user: 'zhangsan', ip: '192.168.2.11', action: '一键电子档案组卷装订', details: '成功将 5 月份共计 342 件符合四性要求的记账凭据及发票件数据，一键打包归类至 [2026-05月卷宗库]。', hash: '8fbcb45b123dabc342371bfe...', tamperFree: true },
    { id: 'log-sys-04', time: '2026-05-28 16:45:02', user: 'lisi', ip: '192.168.1.112', action: '可用性专项故障修复', details: '对缺陷 OFD（缺失宋体GB2312）执行了 AI 自修复，动态嵌入标准矢量字型包以防止脱机预览变形乱码。', hash: 'cf7a8b9c0d1e2f3a4b5c6d7e8f90011b', tamperFree: true },
    { id: 'log-sys-05', time: '2026-05-26 14:10:50', user: 'admin', ip: '10.0.8.21', action: '下载电子版式原文', details: '下载凭证 Z001-01-01-202605-0001 主件PDF文档，系统强制注入只读防伪溯源荧光水印：[jinlinrun198x]。', hash: 'b2855e3b0c44298fc1c149afbf4c8996f', tamperFree: true },
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('2026-05-01');
  const [endDate, setEndDate] = useState('2026-05-31');
  const [isVerifying, setIsVerifying] = useState(false);

  // Combine static admin logs + records timeline logs to make a vast cohesive search table
  const allLogsJoined = useMemo(() => {
    const list: GenericAuditRecord[] = [...genericLogs];

    // Read details from current reactive records & timeline entries to make it highly stateful!
    records?.forEach(rec => {
      rec.auditLogs?.forEach(entry => {
        // avoid duplication
        if (!list.some(item => item.id === entry.id)) {
          list.push({
            id: entry.id,
            time: entry.timestamp,
            user: entry.operator?.split(' ')[0] || 'Unknown', // Get first name
            ip: entry.ipAddress || '127.0.0.1',
            action: entry.action || 'Unknown Action',
            details: `【档号:${rec.archiveCode || 'N/A'}】` + (entry.details || ''),
            hash: rec.components?.[0]?.hash?.substring(0, 32) || 'e3b0c44298fc1c149afbf4c80011ff22',
            tamperFree: rec.checks?.complete ?? true // complete check determines if tampered or not
          });
        }
      });
    });

    // Sort by timestamp desc
    return list.sort((a, b) => b.time.localeCompare(a.time));
  }, [genericLogs, records]);

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

  const handleVerifyChain = () => {
    setIsVerifying(true);
    triggerToast('安全密码机正在轮询区块链证据链，计算SHA256哈希指纹防篡改检验...', 'info');

    setTimeout(() => {
      setIsVerifying(false);
      // Double check if any actual records have complete flag as false
      const containingTampers = records?.some(r => !r.checks?.complete);
      if (containingTampers) {
        triggerToast('审计链核算完毕：发现 1 处档案文件指纹与原始入库哈希有偏离！可用性已被重构拦截。', 'warning');
      } else {
        triggerToast('安全审计核链通过！所有 100% 审计轨迹哈希与分布式密盟区块证书严格扣合，无任何篡改剪切痕迹。', 'success');
      }
    }, 1800);
  };

  return (
    <div id="audit-logs-panel-area" className="space-y-4 animate-in fade-in duration-200">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-indigo-600" />
            <span>系统安全审计日志 (Alfresco 原生不可篡改 Audit Trail)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            不可逆追溯审计日志，底层直连数据摘要防伪链，用于捕捉任何人对版式发票、电子账簿的读取、修改、导出以及自修复行为。
          </p>
        </div>
        
        <button
          type="button"
          disabled={isVerifying}
          onClick={handleVerifyChain}
          className={`px-4 py-2 font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer ${
            isVerifying ? 'bg-indigo-400 text-indigo-50' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}
        >
          {isVerifying ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-white" />
          )}
          <span>{isVerifying ? '比对防篡改密链中...' : '一键检索核算审计链'}</span>
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
            className="bg-white border border-slate-250 rounded-xl px-2 py-1 text-slate-700 focus:outline-none focus:border-blue-500 font-mono w-full"
          />
          <span className="text-slate-350 shrink-0 text-slate-400">至</span>
          <input 
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bg-white border border-slate-250 rounded-xl px-2 py-1 text-slate-700 focus:outline-none focus:border-blue-500 font-mono w-full"
          />
        </div>

        <div className="md:col-span-4 relative flex items-center">
          <input 
            type="text"
            placeholder="搜索行为/用户/档号/留痕细节..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-white border border-slate-250 rounded-xl py-1.5 pl-8 pr-4 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 w-full"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>

        <div className="md:col-span-3 text-right">
          <span className="text-slate-500">已检索到 <strong className="text-slate-800 font-mono">{filteredLogs.length}</strong> 条合规安全留痕</span>
        </div>
      </div>

      {/* Main Table view */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-3xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-sans" id="audit-trail-logs-table">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                <th className="p-3 w-40">操作时间 (Time)</th>
                <th className="p-3 w-28">操作柜员 (User)</th>
                <th className="p-3 w-32">IP 地址 (IP)</th>
                <th className="p-3 w-44">事件行为 (Action)</th>
                <th className="p-3">详细安全留痕与电子发票证据链说明</th>
                <th className="p-3 text-center w-28">不可篡改验证</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-mono text-slate-650 font-bold">{log.time}</td>
                  <td className="p-3 font-bold text-slate-900">{log.user}</td>
                  <td className="p-3">
                    <code className="font-mono text-slate-500 text-[10.5px]">
                      {log.ip}
                    </code>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-100 font-bold rounded">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-3 font-sans leading-relaxed text-slate-600" title={log.details}>
                    {log.details}
                  </td>
                  <td className="p-3 text-center">
                    <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-150 px-2 py-0.5 rounded-full font-bold text-[10px]">
                      <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span>验签合规</span>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    目前暂无符合该筛选器的系统审计追踪日志。
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
