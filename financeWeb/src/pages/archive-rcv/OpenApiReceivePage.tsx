/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * OpenApiReceivePage — 集成接口采集（开放接口接入，占位）
 *
 * 语义：与「抓取收集中台」的主动拉取（Pull）互补——
 * 本页面向**推送（Push）模式**：前端业务系统（ERP/报销/发票平台）调用
 * 会计档案系统开放的标准接口，主动把电子会计资料推送入档。
 *
 * 状态：功能规划中（2026-08-08 占位版）。页面内容全部为规划示意，
 * 不展示任何伪造的运行数据；接入应用清单为空态。
 */

import React from 'react';
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, KeyRound, BookOpenText,
  ShieldCheck, Clock, PlugZap, FileJson, PackageCheck, BellRing,
} from 'lucide-react';

// ─── 规划中的开放端点（设计示意，未上线） ───
const PLANNED_ENDPOINTS = [
  { method: 'POST', path: '/api/open/v1/token', name: '接入认证', desc: 'AppKey/AppSecret 换取访问令牌（与用友BIP同构）' },
  { method: 'POST', path: '/api/open/v1/archives', name: '单件推送', desc: '单条电子会计资料（元数据 JSON + 版式文件 Base64）推送入收集池' },
  { method: 'POST', path: '/api/open/v1/archives/batch', name: '批量推送', desc: 'SIP 标准封装包批量推送（异步受理，批次回执）' },
  { method: 'GET', path: '/api/open/v1/batches/{batchNo}', name: '回执查询', desc: '推送批次受理结果与失败明细查询' },
  { method: 'POST', path: '/api/open/v1/archives/{id}/confirm', name: '归档确认回写', desc: '来源系统确认归档完成状态（可选握手）' },
];

const FLOW_STEPS = [
  { Icon: KeyRound, title: '① 申请接入', desc: '档案管理员签发 AppKey/AppSecret，绑定全宗与资料类型权限' },
  { Icon: FileJson, title: '② 封装推送', desc: '业务系统按 SIP 规范封装元数据+版式文件，调接口推送' },
  { Icon: ShieldCheck, title: '③ 入口校验', desc: '签名验证 → 格式合规 → 哈希完整性 → 元数据完整性' },
  { Icon: PackageCheck, title: '④ 入池归档', desc: '进收集池走核对→组卷→赋号标准流程，回执同步来源系统' },
];

const OpenApiReceivePage: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200">
        <Activity className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">集成接口采集</h1>
        <span className="text-xs text-slate-400">业务系统推送接入（Push 模式）</span>
        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">功能建设中</span>
        <div className="flex-1" />
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* 模式说明：Pull vs Push */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpFromLine className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold text-slate-700">主动抓取（Pull）· 已上线</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              档案系统主动调用业务系统接口拉取数据。当前已接入 <strong className="text-slate-700">用友 BIP</strong>（凭证/报表按会计期间归档），
              在「抓取收集中台」管理。
            </p>
          </div>
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownToLine className="w-4 h-4 text-sky-600" />
              <span className="text-sm font-semibold text-sky-800">推送接入（Push）· 本页 · 规划中</span>
            </div>
            <p className="text-xs text-sky-700 leading-relaxed">
              业务系统调用档案系统开放接口，把电子会计资料主动推送入档。适用于报销、发票、资金等
              事件驱动型来源——业务发生时即时归档，不等期间。
            </p>
          </div>
        </div>

        {/* 接入流程 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <PlugZap className="w-4 h-4 text-sky-600" />
            推送接入流程（规划）
          </h3>
          <div className="grid grid-cols-4 gap-4">
            {FLOW_STEPS.map((s) => (
              <div key={s.title} className="border border-slate-100 rounded-lg p-3 bg-slate-50/60">
                <s.Icon className="w-5 h-5 text-sky-600 mb-2" />
                <div className="text-xs font-semibold text-slate-700 mb-1">{s.title}</div>
                <div className="text-[11px] text-slate-500 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 规划端点表 */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BookOpenText className="w-4 h-4 text-sky-600" />
              开放接口清单
            </h3>
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">设计稿 · 未上线</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <th className="px-4 py-2.5 text-left font-semibold w-20">方法</th>
                <th className="px-4 py-2.5 text-left font-semibold w-64">路径</th>
                <th className="px-4 py-2.5 text-left font-semibold w-32">名称</th>
                <th className="px-4 py-2.5 text-left font-semibold">说明</th>
                <th className="px-4 py-2.5 text-center font-semibold w-20">状态</th>
              </tr>
            </thead>
            <tbody>
              {PLANNED_ENDPOINTS.map((e) => (
                <tr key={e.path} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 text-xs font-mono font-bold rounded ${
                      e.method === 'POST' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                    }`}>{e.method}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{e.path}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-slate-700">{e.name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{e.desc}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-500 rounded">规划中</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 接入应用管理（空态） */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-sky-600" />
              接入应用（API Key）
            </h3>
            <button
              type="button"
              disabled
              title="功能建设中"
              className="px-3 py-1.5 text-xs font-medium text-white bg-slate-300 rounded-lg cursor-not-allowed"
            >
              + 签发应用
            </button>
          </div>
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Clock className="w-8 h-8 mb-2 text-slate-300" />
            <p className="text-sm">暂无接入应用</p>
            <p className="text-xs mt-1">推送接入功能上线后，在此为业务系统签发 AppKey/AppSecret</p>
          </div>
        </div>

        {/* 备注 */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <BellRing className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500 leading-relaxed">
              建设优先级说明：当前「主动抓取」已覆盖用友 BIP 凭证/报表按期间归档的主需求；
              推送接入将在来源系统（报销/发票/资金）提出实时归档诉求时启动，接口规范复用 SIP 封装包标准与已落地的同步批次/明细审计模型。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpenApiReceivePage;
