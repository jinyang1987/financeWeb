/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FileText, ShieldCheck, CheckCircle2, RotateCw, PenTool, Hash, 
  Wrench, Check, ShieldAlert, Cpu, Award, Download, Printer
} from 'lucide-react';
import { ArchiveRecord, ComponentFile } from '../types';

interface InteractivePreviewProps {
  record: ArchiveRecord;
  activeFileIndex: number;
  onActiveFileChange: (idx: number) => void;
  onRepairUsability: (recordId: string) => void;
}

export const InteractivePreview: React.FC<InteractivePreviewProps> = ({
  record,
  activeFileIndex,
  onActiveFileChange,
  onRepairUsability
}) => {
  const [isRepairing, setIsRepairing] = useState(false);
  const activeFile: ComponentFile | undefined = record.components[activeFileIndex] || record.components[0];

  const handleRepairTrigger = () => {
    setIsRepairing(true);
    setTimeout(() => {
      onRepairUsability(record.id);
      setIsRepairing(false);
    }, 1500); // 1.5s simulated repairing latency
  };

  return (
    <div id="interactive-preview-container" className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
      {/* Left panel: components list */}
      <div className="lg:col-span-4 flex flex-col gap-3">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
          <FileText className="w-3.5 h-3.5 text-blue-600" />
          <span>附聚电子凭属组件 ({record.components.length}个)</span>
        </h4>
        
        <div className="space-y-2 flex-1 overflow-y-auto">
          {record.components.map((file, idx) => {
            const isActive = activeFileIndex === idx;
            return (
              <div
                key={idx}
                id={`preview-file-item-${idx}`}
                onClick={() => onActiveFileChange(idx)}
                className={`border text-left p-3 rounded-xl cursor-pointer transition-all ${
                  isActive 
                    ? 'border-blue-500 bg-blue-50/50 shadow-sm' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <span className={`p-1.5 rounded text-[10px] font-bold font-mono ${
                    file.contentType === 'xml' 
                      ? 'bg-amber-50 text-amber-600' 
                      : (file.contentType === 'ofd' ? 'bg-indigo-50 text-indigo-100' : 'bg-rose-50 text-rose-600')
                  }`}>
                    {file.contentType.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{file.size}</span>
                </div>
                <div className="mt-2 text-xs">
                  <h4 className={`font-semibold line-clamp-2 ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>
                    {file.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1">{file.type}</p>
                </div>
                
                {/* Micro cryptographic badges inside file item */}
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                  <div className="flex items-center gap-1">
                    <Hash className="w-2.5 h-2.5 text-slate-400" />
                    <span className="font-mono truncate max-w-[80px]">{file.hash.slice(0, 10)}</span>
                  </div>
                  {file.signatureVerified ? (
                    <span className="text-[9px] bg-teal-50 text-teal-700 px-1 rounded flex items-center gap-0.5 font-bold">
                      <Check className="w-2 h-2" />
                      已验签
                    </span>
                  ) : (
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded">
                      无数字签名
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel: original electronic document visualization */}
      <div className="lg:col-span-8 flex flex-col gap-3 min-h-[350px]">
        <div className="flex items-center justify-between shrink-0">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-teal-600" />
            <span>智能原文实时预览 (数字背书一致性中)</span>
          </h4>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => alert('已调用本地打印模组发出脱机排版PDF')}
              className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
              title="排版套打"
            >
              <Printer className="w-3 h-3" />
              <span>套打</span>
            </button>
            <button 
              onClick={() => alert(`组件: ${activeFile?.name} 的原始哈希验签文件已载入下载队列`)}
              className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
              title="校验下载"
            >
              <Download className="w-3 h-3" />
              <span>下载</span>
            </button>
          </div>
        </div>

        {/* Preview Frame */}
        <div id="document-preview-frame" className="border border-slate-200 bg-slate-50/50 rounded-2xl flex-1 flex flex-col overflow-hidden relative min-h-[300px]">
          {activeFile ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Dynamic stamp bar */}
              <div className="bg-white px-4 py-2 border-b border-slate-100 text-xs text-slate-600 flex items-center justify-between shrink-0">
                <span className="font-mono text-[10px] text-slate-400 select-all">SHA-256 Checksum: {activeFile.hash}</span>
                {activeFile.signatureVerified && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    已通过国家电子发票真实性签名查验
                  </span>
                )}
              </div>

              {/* Document Simulator Inner */}
              <div className="flex-1 p-5 overflow-y-auto bg-white flex flex-col justify-start">
                
                {activeFile.contentType === 'pdf' && (
                  <div className="border-2 border-slate-100 rounded-xl p-5 max-w-2xl mx-auto w-full space-y-4 shadow-sm relative overflow-hidden" id="pdf-invoice-mock">
                    
                    {/* Security Stamp Overlay */}
                    <div className="absolute top-12 right-12 border-3 border-emerald-500/80 text-emerald-600/90 font-bold px-4 py-1.5 rounded-lg text-xs leading-tight tracking-wide text-center uppercase pointer-events-none select-none rotate-[-8deg] flex flex-col items-center">
                      <Award className="w-4 h-4 mb-0.5" />
                      <span>国标四性自验证</span>
                      <span className="text-[8px] font-mono mt-0.5">SHA-256 OK</span>
                    </div>

                    {/* Logo/Header */}
                    <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">电子会计档案记账主件 (PDF/A COMPLIANT)</h3>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">Voucher Reference Code: Z1-2026-FOND</p>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-800">记账凭证号：{record.voucherNo}</span>
                    </div>

                    {/* Core Table Form Mock */}
                    <table className="w-full text-left text-xs text-slate-600 table-fixed border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="border border-slate-200 p-2 font-bold text-slate-700 w-1/3">会计摘要概要</th>
                          <th className="border border-slate-200 p-2 font-bold text-slate-700">总分类科目/明细科目</th>
                          <th className="border border-slate-200 p-2 font-bold text-slate-700 text-right w-1/4">记账金额 (RMB)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-slate-200 p-2 font-sans">{record.remarks || '日常合规凭件录单'}</td>
                          <td className="border border-slate-200 p-2 font-mono">管理费用 - 差旅及业务相关经费</td>
                          <td className="border border-slate-200 p-2 text-right font-bold text-slate-900 font-sans">
                            ¥{record.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr className="bg-slate-50/50">
                          <td className="border border-slate-200 p-2 text-slate-400 font-mono">SYSTEM_INDEX_MAPPED</td>
                          <td className="border border-slate-200 p-2 font-mono">借：银行存款 | 贷：应付账款</td>
                          <td className="border border-slate-200 p-2 text-right font-mono text-slate-400">--- BALANCE ---</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Bottom Signers Details */}
                    <div className="grid grid-cols-2 gap-4 pt-3 text-[11px] text-slate-400">
                      <div>
                        <span className="block font-bold">上传及校验经办:</span>
                        <span className="text-slate-600 font-mono">jinlinrun198x (首席财务审核官)</span>
                      </div>
                      <div className="text-right">
                        <span className="block font-bold">审计哈希锁(Blockchain Hashing Block):</span>
                        <span className="text-slate-600 font-mono text-[9px] break-all">{record.auditLogs[0]?.id || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeFile.contentType === 'xml' && (
                  <div className="border-2 border-slate-100 rounded-xl p-4 max-w-2xl mx-auto w-full font-mono text-[11px] space-y-1 bg-slate-50 leading-relaxed shadow-sm">
                    {/* Styling xml preview with clean syntax coloration */}
                    <p className="text-slate-400">&lt;?xml version="1.0" encoding="UTF-8"?&gt;</p>
                    <p className="text-blue-600">&lt;InvoiceRoot xmlns="http://chinaxml.chinatax.gov.cn/v4"&gt;</p>
                    <div className="pl-4">
                      <p className="text-blue-600">&lt;InvoiceHeader&gt;</p>
                      <div className="pl-4">
                        <p className="text-teal-600">&lt;InvoiceNo&gt;<span className="text-slate-800 font-bold">2605300219</span>&lt;/InvoiceNo&gt;</p>
                        <p className="text-teal-600">&lt;BuyerName&gt;<span className="text-slate-800">华北集团总部有限公司</span>&lt;/BuyerName&gt;</p>
                        <p className="text-teal-600">&lt;SettleAmount&gt;<span className="text-blue-700 font-bold">{record.amount}</span>&lt;/SettleAmount&gt;</p>
                        <p className="text-teal-600">&lt;TaxAmount&gt;<span className="text-slate-800">{(record.amount * 0.06).toFixed(2)}</span>&lt;/TaxAmount&gt;</p>
                        <p className="text-teal-600">&lt;InvoiceDate&gt;<span className="text-slate-850">2026-05-30</span>&lt;/InvoiceDate&gt;</p>
                      </div>
                      <p className="text-blue-600">&lt;/InvoiceHeader&gt;</p>
                      <p className="text-blue-600">&lt;DigitalSignatureVerified&gt;</p>
                      <div className="pl-4">
                        <p className="text-purple-600">&lt;CertSigner&gt;<span className="text-slate-700">{activeFile.signer || '国家税务总局统一安全证书'}</span>&lt;/CertSigner&gt;</p>
                        <p className="text-purple-600">&lt;SignedHash&gt;<span className="text-amber-600 break-all">{activeFile.hash}</span>&lt;/SignedHash&gt;</p>
                      </div>
                      <p className="text-blue-600">&lt;/DigitalSignatureVerified&gt;</p>
                    </div>
                    <p className="text-blue-600">&lt;/InvoiceRoot&gt;</p>
                  </div>
                )}

                {activeFile.contentType === 'ofd' && (
                  <div className="flex-1 flex flex-col justify-center items-center py-6">
                    {/* Interactive OFD checker. If usable is false, we explain the missing font error and allow repairing it */}
                    {!record.checks.usable ? (
                      <div className="max-w-md text-center p-6 border border-rose-200 bg-rose-50/40 rounded-2xl space-y-4 shadow-sm" id="ofd-error-inspector">
                        <div className="inline-flex p-3 bg-rose-100 text-rose-600 rounded-full">
                          <ShieldAlert className="w-8 h-8" />
                        </div>
                        <div className="space-y-1.5">
                          <h4 className="text-sm font-bold text-slate-800">可用性校验(Usability)致命破损警告</h4>
                          <p className="text-xs text-slate-500 leading-relaxed text-left">
                            本OFD格式发票文档由于生成时未嵌入国家要求的特定国标非预置字库（比如 <strong>国家标准标宋</strong>/<strong>仿宋</strong>），跨平台在Linux，macOS或移动终端预览时，会导致底板错位、文字倾斜或无法正常读取。不符合《电子会计档案管理规范》之可用性(Usability)和长期保存(Long-term preservation)标准。
                          </p>
                        </div>

                        {/* Interactive repairing CTA */}
                        <div className="pt-3 border-t border-rose-100">
                          <button 
                            type="button" 
                            disabled={isRepairing}
                            onClick={handleRepairTrigger}
                            className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                              isRepairing 
                                ? 'bg-indigo-100 text-indigo-400' 
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            }`}
                          >
                            {isRepairing ? (
                              <>
                                <RotateCw className="w-4 h-4 animate-spin" />
                                <span>AI 自动重签名并嵌入汉字轮廓轮模组...</span>
                              </>
                            ) : (
                              <>
                                <Wrench className="w-4 h-4" />
                                <span>一键“智能字体补充与结构重组” (AI自修复)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Usable standard OFD View
                      <div className="border border-indigo-200 bg-white rounded-xl p-5 max-w-lg w-full shadow-sm relative overflow-hidden" id="ofd-success-mock">
                        
                        {/* Legal watermark stamp */}
                        <div className="absolute top-10 right-10 border-2 border-indigo-500 font-bold px-3 py-1 text-xs text-indigo-500 rounded uppercase transform rotate-[-12deg] tracking-wide pointer-events-none select-none select-none">
                          长期凭证 OFD/A
                        </div>

                        <div className="border-b border-indigo-100 pb-3 mb-4 flex items-center gap-2">
                          <Award className="w-5 h-5 text-indigo-600" />
                          <div>
                            <span className="text-xs font-bold text-slate-800">国标专用会计要素版式文件 (OFD/A-1)</span>
                            <span className="block text-[10px] text-teal-600 font-bold mt-1">√ 标宋/防伪数字公章已完成静态嵌入</span>
                          </div>
                        </div>

                        {/* Content text */}
                        <div className="space-y-2.5 text-xs text-slate-600">
                          <div className="flex justify-between py-1 border-b border-slate-50">
                            <span>原始主体编码:</span>
                            <span className="font-mono text-slate-850">CN-XFZ-92427ae</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-50">
                            <span>业务代表签署人:</span>
                            <span className="font-sans text-slate-850">{activeFile.signer || '系统核心授权印签'}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-50">
                            <span>所属财务公宗 (Fonds Code):</span>
                            <span className="font-mono text-slate-850">Z001 (华北集团总部)</span>
                          </div>
                        </div>

                        <div className="bg-slate-50 border border-slate-100 rounded p-3 text-[11px] text-slate-500 mt-4 leading-relaxed">
                          提示：由于已一键“嵌入仿宋/黑体/标宋汉字字形网格”，该OFD已通过全生命周期长效可用度检测，可安全地迁移、合并或刻盘永久归档。
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeFile.contentType === 'png' && (
                  <div className="flex-1 flex flex-col justify-center items-center py-10" id="png-preview-stub">
                    <div className="border border-dashed border-slate-300 rounded-xl p-6 bg-slate-50 flex flex-col items-center gap-3">
                      <div className="p-3 bg-blue-50 text-blue-500 rounded-full">
                        <FileText className="w-8 h-8" />
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-bold text-slate-800 block">业务审批流程单明细截图</span>
                        <span className="text-[10px] text-slate-400 block mt-1">{activeFile.name} | 大小：{activeFile.size}</span>
                      </div>
                      <span className="text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded-full mt-2 select-none">
                        非电子发票、属于凭据型图片附件
                      </span>
                    </div>
                  </div>
                )}

                {activeFile.contentType === 'unknown' && (
                  <div className="flex-1 flex flex-col justify-center items-center py-10" id="unknown-preview-stub">
                    <div className="border border-dashed border-slate-300 rounded-xl p-6 bg-slate-50 flex flex-col items-center gap-3">
                      <div className="p-3 bg-slate-100 text-slate-500 rounded-full">
                        <FileText className="w-8 h-8" />
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-bold text-slate-800 block">支持性非通用电子格式</span>
                        <span className="text-[10px] text-slate-400 block mt-1">{activeFile.name} | 大小：{activeFile.size}</span>
                        <p className="text-[10px] text-slate-400 max-w-xs mt-2 mx-auto">
                          本系统推荐采用国家标准版式(OFD或PDF)保存归档主体。为兼容业务，此二进制辅助底稿已在Alfresco中计算SHA进行版本固化。
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-12 text-slate-400 text-xs">
              选定附件以开启原文预览
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
