import React, { useState } from 'react';
import { 
  Building2, Database, GitMerge, FileText, CheckCircle2, AlertTriangle, 
  Settings, ArrowRightLeft, Cpu, Activity, RefreshCw, Archive, Zap, FileJson, Link2
} from 'lucide-react';

export const ArchiveReceiveCenter: React.FC = () => {
  const [activeStrategy, setActiveStrategy] = useState<'erp-router' | 'matching-engine' | 'ai-semantic'>('matching-engine');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success'>('idle');

  const handleSimulateSync = () => {
    setSyncStatus('syncing');
    setTimeout(() => {
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    }, 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden relative">
        <div className="bg-slate-900 px-6 py-8 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-400 via-slate-900 to-slate-900"></div>
          <div className="relative z-10">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <GitMerge className="w-8 h-8 text-indigo-400" />
              <span>档案接收业务中台</span>
            </h2>
            <p className="text-slate-400 mt-2 max-w-2xl text-sm leading-relaxed">
              解决前端业务系统（OA、费控、ERP、税务）割裂导致的“骨肉分离”问题。建立“两套机制+一个引擎”，核心逻辑：业务留痕、中间件抽取、档案组装。实现记账凭证、原始发票、审批流PDF的自动归集。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 border-b border-slate-200">
          <div className="p-6 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50 flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">落地解决方案模式</h3>
            
            <button
              onClick={() => setActiveStrategy('erp-router')}
              className={`text-left p-4 rounded-xl border transition-all ${
                activeStrategy === 'erp-router' 
                  ? 'bg-white border-indigo-200 shadow-sm ring-1 ring-indigo-500' 
                  : 'bg-transparent border-transparent hover:bg-slate-100 text-slate-600'
              }`}
            >
              <div className="font-bold flex items-center gap-2 mb-1">
                <ArrowRightLeft className={`w-4 h-4 ${activeStrategy === 'erp-router' ? 'text-indigo-600' : ''}`} />
                <span className={activeStrategy === 'erp-router' ? 'text-indigo-900' : ''}>方案一：ERP 强关联路由</span>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-2">以核算系统为中转站，强行携带前端系统的唯一业务主键传递。</p>
            </button>

            <button
              onClick={() => setActiveStrategy('matching-engine')}
              className={`text-left p-4 rounded-xl border transition-all ${
                activeStrategy === 'matching-engine' 
                  ? 'bg-white border-blue-200 shadow-sm ring-1 ring-blue-500' 
                  : 'bg-transparent border-transparent hover:bg-slate-100 text-slate-600'
              }`}
            >
              <div className="font-bold flex items-center gap-2 mb-1">
                <Cpu className={`w-4 h-4 ${activeStrategy === 'matching-engine' ? 'text-blue-600' : ''}`} />
                <span className={activeStrategy === 'matching-engine' ? 'text-blue-900' : ''}>方案二：主键匹配引擎 (推荐)</span>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-2">构建全局通用的关联规则链，ESB定时抽取数据到暂存区，像拼图一样自动聚拢封装。</p>
            </button>

            <button
              onClick={() => setActiveStrategy('ai-semantic')}
              className={`text-left p-4 rounded-xl border transition-all ${
                activeStrategy === 'ai-semantic' 
                  ? 'bg-white border-emerald-200 shadow-sm ring-1 ring-emerald-500' 
                  : 'bg-transparent border-transparent hover:bg-slate-100 text-slate-600'
              }`}
            >
              <div className="font-bold flex items-center gap-2 mb-1">
                <Zap className={`w-4 h-4 ${activeStrategy === 'ai-semantic' ? 'text-emerald-600' : ''}`} />
                <span className={activeStrategy === 'ai-semantic' ? 'text-emerald-900' : ''}>方案三：AI 语义关联</span>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-2">针对历史遗留和手工账，利用自然语言处理抓取摘要并智能匹配相关单据。</p>
            </button>
          </div>

          <div className="col-span-1 lg:col-span-3 p-6 bg-slate-50/50">
            {activeStrategy === 'matching-engine' && (
              <div className="animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">构建“主键（或关联号）”匹配引擎</h3>
                    <p className="text-xs text-slate-500">解耦最高：中间件 (ESB/ETL) 异步只读提取，减轻异构业务系统压力。</p>
                  </div>
                  <button 
                    onClick={handleSimulateSync}
                    disabled={syncStatus === 'syncing'}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                    {syncStatus === 'syncing' ? '引擎聚拢扫描中...' : syncStatus === 'success' ? '封装封装完成 (SIP)' : '执行全局数据对齐'}
                  </button>
                </div>

                {/* Visual Engine Diagram */}
                <div className="relative p-6 bg-slate-100 border border-slate-200 rounded-2xl">
                  {/* Sources */}
                  <div className="grid grid-cols-3 gap-4 mb-10">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center text-center">
                      <FileJson className="w-8 h-8 text-rose-500 mb-2" />
                      <span className="font-bold text-slate-700 text-sm">费控系统 (发票)</span>
                      <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide">链条 A 主键：发票号+报销单号</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center text-center relative">
                       <div className="absolute -bottom-10 left-1/2 w-0.5 h-10 bg-blue-300 transform -translate-x-1/2"></div>
                      <FileText className="w-8 h-8 text-sky-500 mb-2" />
                      <span className="font-bold text-slate-700 text-sm">OA 系统 (审批流)</span>
                      <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide">审批状态终态：自动转换为PDF</span>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center text-center relative">
                      <Database className="w-8 h-8 text-amber-500 mb-2" />
                      <span className="font-bold text-slate-700 text-sm">ERP (核算记账)</span>
                      <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide">摘要辅助核算：记账凭证号+人员</span>
                    </div>
                  </div>

                  {/* ESB Pipeline */}
                  <div className="relative border-2 border-dashed border-blue-300 rounded-xl bg-blue-50/50 p-6 flex flex-col items-center justify-center min-h-[160px]">
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-100 text-blue-700 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest border border-blue-200 flex items-center gap-1">
                      <Activity className="w-3 h-3" /> 数据总线暂存区 (ESB/ETL)
                    </div>
                    
                    <div className="flex items-center gap-8 z-10 w-full px-8">
                       <div className="flex-1 flex justify-end">
                         <div className={`p-3 rounded-xl bg-white shadow-sm border-2 ${syncStatus !== 'idle' ? 'border-blue-400' : 'border-slate-200'} transition-colors`}>
                           <span className="text-xs font-bold text-slate-600 block">原始发票明细</span>
                           <span className="text-[10px] text-slate-400">#BK-2405</span>
                         </div>
                       </div>
                       
                       <div className="flex-shrink-0 relative">
                         <div className={`w-16 h-16 rounded-full flex items-center justify-center ${syncStatus === 'syncing' ? 'bg-blue-600 animate-pulse text-white shadow-lg shadow-blue-500/30' : syncStatus === 'success' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white'} transition-all z-10 relative`}>
                            {syncStatus === 'success' ? <CheckCircle2 className="w-8 h-8" /> : <GitMerge className={`w-8 h-8 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />}
                         </div>
                       </div>

                       <div className="flex-1 flex flex-col gap-2">
                         <div className={`p-3 rounded-xl bg-white shadow-sm border-2 ${syncStatus !== 'idle' ? 'border-sky-400' : 'border-slate-200'} w-max transition-colors`}>
                           <span className="text-xs font-bold text-slate-600 block">审批流 OFD/PDF</span>
                         </div>
                         <div className={`p-3 rounded-xl bg-white shadow-sm border-2 ${syncStatus !== 'idle' ? 'border-amber-400' : 'border-slate-200'} w-max transition-colors`}>
                           <span className="text-xs font-bold text-slate-600 block">记账凭证</span>
                         </div>
                       </div>
                    </div>
                  </div>

                  {/* Arrow Down */}
                  <div className="w-full flex justify-center py-4">
                    <ArrowRightLeft className="w-6 h-6 text-slate-300 transform rotate-90" />
                  </div>

                  {/* Destination */}
                  <div className="bg-emerald-900 rounded-xl p-4 flex items-center justify-between shadow-inner">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-emerald-800 rounded-lg">
                        <Archive className="w-6 h-6 text-emerald-300" />
                      </div>
                      <div>
                        <h4 className="text-emerald-50 font-bold">标准档案元数据包 (SIP)</h4>
                        <p className="text-emerald-300/70 text-[11px]">骨肉重新组装完成，自动赋档号</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs px-3 py-1 rounded-full font-mono">
                         Z001-01-2026-0001
                       </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <div className="text-sm text-amber-900 leading-relaxed">
                    <span className="font-bold">避坑提示：审批流必须“文件化”。</span>
                    不能直接扫描OA数据库表当档案。必须在OA审批终态瞬间，将其渲染并固化为不可篡改的散列 PDF 或 OFD 传予档案系统展示。
                  </div>
                </div>
              </div>
            )}

            {activeStrategy === 'erp-router' && (
              <div className="animate-in slide-in-from-right-4 duration-300">
                 <h3 className="text-lg font-bold text-slate-800 mb-2">以 ERP 为路由器的“强关联”模式</h3>
                 <p className="text-sm text-slate-600 leading-relaxed mb-6">
                   档案系统只对接前端 ERP 节点，所有OA和费控系统的凭证原始数据及关键报销单主键皆由此通道穿透流传而下。适用于 ERP 极为成熟且改造空间大的企业架构。缺点是极易受到前端任意业务逻辑更新的耦合影响。
                 </p>
                 <div className="bg-slate-200 h-64 rounded-xl border border-slate-300 flex items-center justify-center border-dashed">
                   <p className="text-slate-400 font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                     <Building2 className="w-4 h-4" /> 官方自带集成网关
                   </p>
                 </div>
              </div>
            )}

            {activeStrategy === 'ai-semantic' && (
              <div className="animate-in slide-in-from-right-4 duration-300">
                 <h3 className="text-lg font-bold text-slate-800 mb-2">引入 AI 语义关联引擎 (盲区补齐)</h3>
                 <p className="text-sm text-slate-600 leading-relaxed mb-6">
                   专治手工录入无法硬编码关联的痛点业务。通过扫描分析摘要文本内的自然语言，通过 NLP 和向量检索，找出费控与 OA 相似主体、金额、审批流时间窗，计算相似概率并执行推送人工审核确认关联。
                 </p>
                 <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 h-64 shadow-inner relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                    <div className="relative z-10 flex flex-col gap-4">
                       <div className="font-mono text-emerald-400 text-xs">
                         {`[NLP Parser] Segmenting abstract: "张三报销5月差旅机票费用"`}
                       </div>
                       <div className="font-mono text-slate-400 text-xs">
                         {`[Context Search] Fetching OA and Fee Control logs where user=张三, period=05...`}
                       </div>
                       <div className="font-mono text-emerald-400 text-xs mt-4 pl-4 border-l-2 border-emerald-800">
                         {`Match found (Confidence 94.2%):`}
                         <br/>
                         {`-> OA Flow: #FL-88219 (张三-销售部-北京出差申请)`}
                         <br/>
                         {`-> Tkt Invoice: 011329482 (CA1503)`}
                       </div>
                       <div className="mt-4">
                         <button className="bg-emerald-600/20 text-emerald-400 border border-emerald-600/50 px-3 py-1 text-xs rounded hover:bg-emerald-600/40">
                           <Link2 className="w-3 h-3 inline mr-1" />
                           人工一键确认归集
                         </button>
                       </div>
                    </div>
                 </div>
              </div>
            )}
          </div>
        </div>

        {/* Global rules table */}
        <div className="p-6 bg-white border-t border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-slate-500" />
            <h3 className="font-bold text-slate-800">全域基础建设：《电子会计档案元数据规范》字段标准参考</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">不论集成架构使用 Push 还是 Pull，各子系统对接上传的数据集合强制约束必须对齐以下黄金主干字段，避免后期档案信息缺失。</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="p-3 font-semibold">标准化名称</th>
                  <th className="p-3 font-semibold">类型约束</th>
                  <th className="p-3 font-semibold">必填权重</th>
                  <th className="p-3 font-semibold">所属集成域</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs font-bold text-indigo-700">archive_code</td>
                  <td className="p-3">String (唯一全局档号)</td>
                  <td className="p-3"><span className="text-red-500 font-bold">* 主键</span></td>
                  <td className="p-3">档案管理系统自身生成 / ERP</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs font-bold text-indigo-700">business_date</td>
                  <td className="p-3">Date (报销/业务发生日期)</td>
                  <td className="p-3"><span className="text-red-500 font-bold">* 一级</span></td>
                  <td className="p-3">OA / 费控系统</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs font-bold text-indigo-700">voucher_ref</td>
                  <td className="p-3">String (记账凭证号)</td>
                  <td className="p-3"><span className="text-amber-500 font-bold">* 二级</span></td>
                  <td className="p-3">核算系统 (ERP)</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs font-bold text-indigo-700">component_count</td>
                  <td className="p-3">Integer (附件及发票总张数)</td>
                  <td className="p-3"><span className="text-slate-500 font-bold">关联</span></td>
                  <td className="p-3">影像引擎 / 税控发票池</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
