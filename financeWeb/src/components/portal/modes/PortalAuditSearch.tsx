/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PortalAuditSearch — 门户「审计追踪」模式
 *
 * 对齐后台「档案查询 → 审计追踪」的能力：
 *   操作日志哈希链 · 全链路穿透 · 合规取证包导出（数据来自 ams-server /audit/logs）。
 */

import React, { useState } from 'react';
import {
  ShieldCheck, Search, FileText, Image, FileSpreadsheet, GitBranch,
  Download, Clock, User, CheckCircle2, AlertCircle, Package, Loader2, Link2, ChevronRight,
} from 'lucide-react';
import { fetchAuditLogs } from '../../../services/borrowService';

interface AuditNode {
  id: string;
  type: 'voucher' | 'source-doc' | 'business-doc' | 'approval';
  label: string;
  sublabel: string;
  timestamp: string;
  operator: string;
  status: 'done' | 'in-progress' | 'pending';
  detail?: string;
  hash?: string;
}

interface OpLog {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  target: string;
  order_id: string;
  detail: string;
  hash: string;
  prev_hash: string;
  created_at: string;
}

function deriveType(action: string): AuditNode['type'] {
  if (/审批|驳回|通过|会签/.test(action)) return 'approval';
  if (/上传|建件|归档|组卷|赋号/.test(action)) return 'voucher';
  if (/出库|归还|借阅|履约|中止/.test(action)) return 'business-doc';
  if (/原始凭证|影像|OCR/.test(action)) return 'source-doc';
  return 'voucher';
}

function mapLogToNode(log: OpLog): AuditNode {
  return {
    id: log.id,
    type: deriveType(log.action),
    label: log.action,
    sublabel: log.target || (log.order_id ? `单号 ${log.order_id}` : '—'),
    timestamp: (log.created_at || '').replace('T', ' ').slice(0, 19),
    operator: log.actor_name || log.actor_id || '系统',
    status: 'done',
    detail: log.detail || undefined,
    hash: log.hash,
  };
}

const NODE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  voucher: FileText,
  'source-doc': Image,
  'business-doc': FileSpreadsheet,
  approval: GitBranch,
};

const NODE_COLORS: Record<string, string> = {
  voucher: 'border-sky-300 bg-sky-50',
  'source-doc': 'border-amber-300 bg-amber-50',
  'business-doc': 'border-emerald-300 bg-emerald-50',
  approval: 'border-purple-300 bg-purple-50',
};

const PortalAuditSearch: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [queried, setQueried] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trail, setTrail] = useState<AuditNode[]>([]);
  const [total, setTotal] = useState(0);

  const handleSearch = async () => {
    setQueried(true);
    setExpandedNode(null);
    setLoading(true);
    try {
      const kw = keyword.trim();
      const res = await fetchAuditLogs({
        orderId: kw || undefined,
        action: undefined,
        skip: 0,
        limit: 100,
      }) as { items: OpLog[]; total: number };
      const items = res.items || [];
      const filtered = kw
        ? items.filter((l) =>
            (l.target || '').includes(kw) ||
            (l.detail || '').includes(kw) ||
            (l.order_id || '').includes(kw) ||
            (l.action || '').includes(kw))
        : items;
      setTrail(filtered.map(mapLogToNode));
      setTotal(res.total ?? filtered.length);
    } catch {
      setTrail([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    // 2026-08-29 T3：真实导出操作日志哈希链记录（去掉伪造的「数字签名验证报告」承诺）。
    // 导出内容即当前审计链查询结果；签名验真属 CA/时间戳接入（见修复总计划外围项），未接入前不伪造。
    const payload = {
      exportedAt: new Date().toISOString(),
      scope: '操作日志哈希链（ams_operation_log，仅追加+链式哈希）',
      keyword: keyword || undefined,
      total,
      items: trail.map((n) => ({
        timestamp: n.timestamp, action: n.label, detail: n.sublabel, operator: n.operator,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `审计链导出-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 查询栏 */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3 max-w-6xl mx-auto flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text" placeholder="凭证号 / 借阅单号 / 动作关键词"
              value={keyword} onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl w-full focus:outline-none focus:ring-1 focus:ring-sky-400"
            />
          </div>
          <button onClick={handleSearch} disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 disabled:opacity-50 transition-colors cursor-pointer">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            查询
          </button>
          {queried && trail.length > 0 && (
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors cursor-pointer">
              <Package className="w-3.5 h-3.5" />导出合规取证包
            </button>
          )}
        </div>
      </div>

      {/* 审计链路视图 */}
      <div className="flex-1 overflow-auto p-6">
        {!queried ? (
          <div className="max-w-3xl mx-auto text-center py-20 text-slate-400">
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">输入凭证号、借阅单号或动作关键词，查询真实操作审计链路</p>
            <p className="text-xs mt-2 text-slate-300">数据来自操作日志哈希链（ams_operation_log），留空查询则显示最近记录</p>
          </div>
        ) : loading ? (
          <div className="max-w-3xl mx-auto text-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-sky-500" />
            <p className="text-sm">查询中…</p>
          </div>
        ) : trail.length === 0 ? (
          <div className="max-w-3xl mx-auto text-center py-20 text-slate-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">未找到相关审计记录</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <ShieldCheck className="w-5 h-5 text-sky-600" />
              <h2 className="text-base font-bold text-slate-800">审计链路</h2>
              <span className="text-xs text-slate-400 ml-2">{trail.length} 条记录 · 库内共 {total} 条</span>
            </div>

            <div className="relative pl-8">
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-200" />
              <div className="space-y-3">
                {trail.map((node) => {
                  const NodeIcon = NODE_ICONS[node.type];
                  const isExpanded = expandedNode === node.id;
                  return (
                    <div key={node.id} className="relative">
                      <div className="absolute left-[-23px] top-2 w-4 h-4 rounded-full border-2 z-10 bg-white border-sky-400" />
                      <div className={`rounded-xl border p-4 transition-all cursor-pointer ${NODE_COLORS[node.type]} ${isExpanded ? 'ring-2 ring-sky-300' : ''}`}
                        onClick={() => setExpandedNode(isExpanded ? null : node.id)}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <NodeIcon className="w-5 h-5 text-slate-600" />
                            <div>
                              <h4 className="text-sm font-semibold text-slate-800">{node.label}</h4>
                              <p className="text-xs text-slate-500">{node.sublabel}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{node.timestamp}</span>
                            <span className="flex items-center gap-1"><User className="w-3 h-3" />{node.operator}</span>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-slate-200/50 space-y-2">
                            {node.detail && (
                              <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans">{node.detail}</pre>
                            )}
                            {node.hash && (
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono bg-white/60 rounded px-2 py-1">
                                <Link2 className="w-3 h-3 shrink-0" />
                                <span className="truncate">哈希链：{node.hash}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortalAuditSearch;
