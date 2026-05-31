/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, UploadCloud, FileJson, FileSpreadsheet, Eye, Sparkles, CheckCircle2,
  Lock, KeyRound, AlertCircle, FileText, Check, Database, Terminal
} from 'lucide-react';
import { ArchiveRecord, ComponentFile, AuditLog } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (record: ArchiveRecord) => void;
}

// Subcomponent or predefined samples
const predefinedSamples = [
  {
    name: '国家电网物资增值税数电发票_V4.xml',
    size: '14.2 KB',
    contentType: 'xml' as const,
    voucherNo: '记-801',
    archiveType: '记账凭证',
    department: '采购部',
    amount: 138400.00,
    retention: '30年',
    remarks: '购入变电分线及零备件（国网数电开立XML）',
    signer: '国家税务总局电子印章 CA-10',
    hash: 'da50257cd443e20bfbd491219b489ac8824ae4feea32bb12ca92a8b9cd',
    properties: { real: true, complete: true, usable: true, safe: true },
    details: '智能AI检测器识别到该国家电网物资XML格式完美契合2026年数电最新印章规范标准。'
  },
  {
    name: '华为研发中心办公设备采购清单.ofd',
    size: '1.8 MB',
    contentType: 'ofd' as const,
    voucherNo: '记-802',
    archiveType: '财务报告',
    department: '行政部',
    amount: 45000.00,
    retention: '30年',
    remarks: '2026款政企MateBook开发终端报备原始合同(OFD)',
    signer: '华为技术有限公司数字公章',
    hash: 'ff8a7d23d8bc23e0cf9b87df7e8f5c4c3b2a8d7cb1bc6dfefaa2172f3',
    properties: { real: true, complete: true, usable: false, safe: true }, // Starts with Usability issue!
    details: '检测发现该华为OFD组件由于采用自制工具压制，缺失嵌入式标宋字体轮廓，这将在不可预知的终端上导致排版倾斜，需进行格式重构。'
  },
  {
    name: '携程商旅差旅合规费用总汇.pdf',
    size: '520.1 KB',
    contentType: 'pdf' as const,
    voucherNo: '记-803',
    archiveType: '记账凭证',
    department: '销售部',
    amount: 3450.00,
    retention: '10年',
    remarks: '销售总监赴西安航空航天局客户拓展差旅住宿汇总PDF',
    signer: '携程机票差旅服务电子盖签',
    hash: 'ab4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f',
    properties: { real: true, complete: true, usable: true, safe: true },
    details: '格式完全兼容PDF/A长效电子库标准，包含可读文本层及完整签署元数据。'
  }
];

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onUploadSuccess }) => {
  const [selectedSample, setSelectedSample] = useState<typeof predefinedSamples[0] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(0); // 0: select, 1: analyze, 2: review
  const [dragActive, setDragActive] = useState(false);
  const [customFile, setCustomFile] = useState<{name: string, size: string, isCustom: boolean} | null>(null);

  if (!isOpen) return null;

  // Drag handler
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const ext = file.name.split('.').pop()?.toLowerCase();
      // Map basic extensions
      let sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      
      setCustomFile({
        name: file.name,
        size: `${sizeMB} MB`,
        isCustom: true
      });

      // Generate a mock state matching the custom file
      const amount = Math.floor(Math.random() * 80000) + 1200;
      const fileType = ext === 'xml' ? 'xml' : (ext === 'ofd' ? 'ofd' : 'pdf');

      const customSample = {
        name: file.name,
        size: `${sizeMB} MB`,
        contentType: fileType as 'xml' | 'ofd' | 'pdf',
        voucherNo: `记-${Math.floor(Math.random() * 800) + 101}`,
        archiveType: '记账凭证' as const,
        department: '财务部' as const,
        amount: amount,
        retention: '30年' as const,
        remarks: `手动上传归档：${file.name}`,
        signer: '第三方公共数字印章',
        hash: 'ca495991b7852b855e3b0c44298fc1c14' + Math.floor(Math.random() * 10000).toString(16),
        properties: { real: true, complete: true, usable: true, safe: true },
        details: '智能识别引擎已开启安全过滤，经哈希和国家政务系统API审计比对，原始单件校验完全符合国标。'
      };

      setSelectedSample(customSample);
      startAnalysis(customSample);
    }
  };

  const startAnalysis = (sample: typeof predefinedSamples[0]) => {
    setIsAnalyzing(true);
    setActiveStep(1);
    
    // Simulate steps in sequence
    setTimeout(() => {
      // Step 1: parse OCR text
      setTimeout(() => {
        // Step 2: verify CA Signatures
        setTimeout(() => {
          // Finish
          setIsAnalyzing(false);
          setActiveStep(2);
        }, 1200);
      }, 1000);
    }, 800);
  };

  const handleCommitFile = () => {
    if (!selectedSample) return;

    // Create a robust target archive record
    const components: ComponentFile[] = [
      {
        name: `${selectedSample.voucherNo}号记账凭证主件.pdf`,
        type: '记账凭证主件',
        size: '120.4 KB',
        contentType: 'pdf',
        hash: 'b1a2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
        signatureVerified: true,
        signer: '财务核心审核章'
      },
      {
        name: selectedSample.name,
        type: selectedSample.contentType === 'xml' 
          ? '原始电子附件（数电XML）' 
          : (selectedSample.contentType === 'ofd' ? '附带电子版公章OFD' : '原始电子凭证'),
        size: selectedSample.size,
        contentType: selectedSample.contentType,
        hash: selectedSample.hash,
        signatureVerified: true,
        signer: selectedSample.signer
      }
    ];

    const auditLogs: AuditLog[] = [
      {
        id: `log-cli-${Date.now()}`,
        timestamp: '2026-05-30 10:15:00',
        action: 'AI智能数字采集归档',
        operator: 'jinlinrun198x (首席财务审核官)',
        details: `通过智能数字化模组对组件 [${selectedSample.name}] 展开哈希锁定，提取核心凭证金额: ¥${selectedSample.amount.toLocaleString()}`,
        ipAddress: '192.168.1.135'
      },
      {
        id: `log-crypto-${Date.now()}`,
        timestamp: '2026-05-30 10:15:02',
        action: '赋存电子签名与四性核准',
        operator: 'CA验证中继代理',
        details: `国家公共签章证书成功解析。主体：${selectedSample.signer}。完整散列一致。`,
        ipAddress: '10.0.12.50'
      }
    ];

    const year = '2026';
    const month = '05';
    const randomHex = Math.floor(Math.random() * 9000 + 1000);
    const archiveCode = `Z001-01-01-${year}${month}-${randomHex}`;

    const newRow: ArchiveRecord = {
      id: `record-${Date.now()}`,
      archiveCode: archiveCode,
      voucherNo: selectedSample.voucherNo,
      archiveType: selectedSample.archiveType,
      department: selectedSample.department,
      amount: selectedSample.amount,
      year: year,
      month: month,
      retention: selectedSample.retention,
      status: '仅件数据', // default of uploads is not grouped
      remarks: selectedSample.remarks,
      checks: selectedSample.properties,
      checkDetails: [
        {
          property: 'real',
          name: '真实性校验',
          status: 'passed',
          method: '国税局电子发票印章密码箱接口比对',
          timestamp: '2026-05-30 10:15:00',
          message: `商户电子CA背书 [${selectedSample.signer}] 签名完好核对无误。`,
          operator: 'AI自检中继'
        },
        {
          property: 'complete',
          name: '完整性校验',
          status: 'passed',
          method: 'SHA-256 原文哈希验证',
          timestamp: '2026-05-30 10:15:00',
          message: `散列校验通过: ${selectedSample.hash.substring(0, 32)}...`,
          operator: 'AI自检中继'
        },
        {
          property: 'usable',
          name: '可用性校验',
          status: selectedSample.properties.usable ? 'passed' : 'failed',
          method: 'OFD / PDF/A国标渲染标准合规检查',
          timestamp: '2026-05-30 10:15:00',
          message: selectedSample.properties.usable 
            ? '结构完备无缺。' 
            : '【格式异常】OFD文档缺失内嵌基础字库（标宋等），在非Windows宿主机上出现乱码或文字跑偏。级联失效。',
          operator: 'AI自检中继'
        },
        {
          property: 'safe',
          name: '安全性校验',
          status: 'passed',
          method: '机要白名单和敏感资产扫描',
          timestamp: '2026-05-30 10:15:00',
          message: '未见明文社保号、个人私人银行等脱敏缺陷文件。安全合规度过。',
          operator: 'AI自检中继'
        }
      ],
      components,
      auditLogs
    };

    onUploadSuccess(newRow);
    setSelectedSample(null);
    setCustomFile(null);
    setActiveStep(0);
    onClose();
  };

  return (
    <div id="upload-dialog-backer" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-opacity duration-300">
      <div 
        id="upload-dialog-inner"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-slate-900 p-4 shrink-0 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-base">智能会计档案录入与 AI 原文解析</span>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dynamic Workflow Progress */}
        <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-100 p-3 shrink-0 text-xs">
          <div className={`flex items-center gap-2 justify-center py-1 border-r border-slate-200 ${activeStep === 0 ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[10px] select-none">1</span>
            <span>选择源电凭证</span>
          </div>
          <div className={`flex items-center gap-2 justify-center py-1 border-r border-slate-200 ${activeStep === 1 ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[10px] select-none text-slate-500 animate-pulse">2</span>
            <span>AI 解析 & 验签</span>
          </div>
          <div className={`flex items-center gap-2 justify-center py-1 ${activeStep === 2 ? 'text-green-600 font-bold' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[10px] select-none">3</span>
            <span>合规元数据归账</span>
          </div>
        </div>

        {/* Scrolling content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeStep === 0 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Drag/Drop Section */}
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  dragActive ? 'border-blue-500 bg-blue-50/50 scale-[0.99]' : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                <div className="max-w-md mx-auto space-y-3">
                  <div className="inline-flex p-3 bg-blue-100 text-blue-600 rounded-2xl mb-1">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      拖拽数电发票/会计凭证至此，或{' '}
                      <label className="text-blue-600 hover:text-blue-700 underline cursor-pointer">
                        浏览本地文件
                        <input 
                          type="file" 
                          id="raw-upload-input" 
                          className="hidden" 
                          accept=".xml,.ofd,.pdf" 
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              const f = e.target.files[0];
                              setCustomFile({ name: f.name, size: `${(f.size/1024).toFixed(1)} KB`, isCustom: true });
                              // Use CTrip or predefined config mapped
                              const fileType = f.name.split('.').pop()?.toLowerCase() === 'xml' ? 'xml' : 'pdf';
                              const cSample = {
                                name: f.name,
                                size: `${(f.size/1024).toFixed(1)} KB`,
                                contentType: fileType === 'xml' ? 'xml' as const : 'pdf' as const,
                                voucherNo: `记-${Math.floor(Math.random() * 800) + 101}`,
                                archiveType: '记账凭证' as const,
                                department: '财务部' as const,
                                amount: 15400.00,
                                retention: '30年' as const,
                                remarks: `导入文件：${f.name}`,
                                signer: '本地安全签名代理',
                                hash: 'e3b0c44298fc1c149afbf4c8' + Math.floor(Math.random() * 9000).toString(16),
                                properties: { real: true, complete: true, usable: true, safe: true },
                                details: '格式规整，包含有效的哈希认证结构'
                              };
                              setSelectedSample(cSample);
                              startAnalysis(cSample);
                            }
                          }}
                        />
                      </label>
                    </p>
                    <p className="text-xs text-slate-400 mt-1">支持 XML (数电发票), OFD (版式公文), PDF (长久存档) 格式</p>
                  </div>
                </div>
              </div>

              {/* Sample Files Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">演示原始电子凭证样本 (中国数电及国标档案结构)</span>
                  <span className="text-slate-400">点击以下样本可无限制模拟 AI 解析器、真实性及哈希完整度</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {predefinedSamples.map((sample, i) => (
                    <div 
                      key={i}
                      id={`sample-card-${i}`}
                      onClick={() => {
                        setSelectedSample(sample);
                        startAnalysis(sample);
                      }}
                      className="border border-slate-200/80 bg-white hover:border-blue-500 hover:shadow-md rounded-xl p-4 cursor-pointer text-left transition-all space-y-3 relative group"
                    >
                      <div className="flex items-start justify-between">
                        <span className={`p-2 rounded-lg text-xs font-bold font-mono ${
                          sample.contentType === 'xml' 
                            ? 'bg-amber-50 text-amber-600' 
                            : (sample.contentType === 'ofd' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600')
                        }`}>
                          {sample.contentType.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{sample.size}</span>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{sample.name}</h4>
                        <p className="text-[11px] text-slate-500 mt-1">{sample.remarks}</p>
                      </div>
                      <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-[11px] text-slate-600">
                        <span>金额：<strong className="text-slate-800 font-sans">¥{sample.amount.toLocaleString()}</strong></span>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded truncate max-w-[80px]">{sample.department}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeStep === 1 && selectedSample && (
            <div className="space-y-5 py-6 animate-in fade-in duration-300">
              <div className="text-center space-y-3">
                <div className="relative inline-flex mb-1" id="loading-circles">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-20"></span>
                  <span className="relative inline-flex rounded-full h-12 w-12 bg-blue-100 text-blue-600 items-center justify-center">
                    <Sparkles className="w-6 h-6 animate-pulse" />
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-800">Alfresco & Gemini LLM 会计语义智能解析中...</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  校验模块正在对发票印章密码、国家税务总局底账、企业CA凭件及哈希完备性作全生命周期静态提取
                </p>
              </div>

              {/* Progress Console logs */}
              <div className="bg-slate-900 text-teal-400 rounded-xl p-4 font-mono text-[11px] space-y-1.5 shadow-inner">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5 mb-2 text-slate-400 text-[10px]">
                  <Terminal className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>PARSING ENGINE TERMINAL LOGS</span>
                </div>
                <p className="text-slate-500">[SYSTEM] Initializing Sandbox Security Enclave...</p>
                <p className="text-slate-300">[FILE] Target File: {selectedSample.name} ({selectedSample.size})</p>
                <p className="text-slate-300">[CRYPTO] Calculating SHA-256 Checksum: <span className="text-amber-300 select-all">{selectedSample.hash}</span></p>
                <p className="text-emerald-400">[PARSER] Step 1: Matching Chinese national bookkeeping standards...</p>
                <p className="text-emerald-400">[PARSER] Step 2: OCR/Xml structure node analysis successful...</p>
                <p className="text-blue-400">[SIGNATURE] Step 3: Verifying CA Certification via blockchain...</p>
                <p className="text-slate-500">[SYSTEM] All operations executed successfully.</p>
              </div>
            </div>
          )}

          {activeStep === 2 && selectedSample && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-800">电子原始凭证智能提取完毕！</h4>
                  <p className="text-[11px] text-emerald-600 mt-1">{selectedSample.details}</p>
                </div>
              </div>

              {/* Interactive form review */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-700">建议元数据 (已与原始密件绑定)</h4>
                  <div className="space-y-2 bg-slate-50 p-4 border border-slate-200/80 rounded-xl text-xs">
                    <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                      <span className="text-slate-400">记账凭证号</span>
                      <span className="col-span-2 text-slate-800 font-bold">{selectedSample.voucherNo}</span>
                    </div>
                    <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                      <span className="text-slate-400">业务金额</span>
                      <span className="col-span-2 text-blue-600 font-bold font-sans">¥ {selectedSample.amount.toLocaleString()} 元</span>
                    </div>
                    <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                      <span className="text-slate-400">承载部门</span>
                      <span className="col-span-2 text-slate-800">{selectedSample.department}</span>
                    </div>
                    <div className="grid grid-cols-3 py-1 border-b border-slate-100">
                      <span className="text-slate-400">保管期限</span>
                      <span className="col-span-2 text-slate-800">{selectedSample.retention}</span>
                    </div>
                    <div className="grid grid-cols-3 py-1">
                      <span className="text-slate-400">业务概述</span>
                      <span className="col-span-2 text-slate-600 truncate">{selectedSample.remarks}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-700">电子证据链质检报告</h4>
                  <div className="space-y-2.5 bg-slate-50 p-4 border border-slate-200/80 rounded-xl text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-blue-500" />
                        <span>真实性验签</span>
                      </div>
                      <span className="text-[10px] bg-teal-100 text-teal-800 font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        <span>数字签名符合</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
                        <span>完整度哈希</span>
                      </div>
                      <span className="text-[10px] bg-teal-100 text-teal-800 font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        <span>哈希闭环一致</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-teal-500" />
                        <span>可用度渲染</span>
                      </div>
                      {selectedSample.properties.usable ? (
                        <span className="text-[10px] bg-teal-100 text-teal-800 font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" />
                          <span>版式兼容</span>
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-medium px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                          <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                          <span>缺失字体(需修复)</span>
                        </span>
                      )}
                    </div>
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] text-slate-400 font-mono block">区块链安全认证码 (Hash)：</span>
                      <span className="text-[10px] text-slate-500 font-mono block break-all">{selectedSample.hash}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="bg-slate-50 p-4 border-t border-slate-100 shrink-0 flex items-center justify-between">
          <span className="text-xs text-slate-400">已自动勾合财务审计账册，满足《中华人民共和国档案法》规范。</span>
          <div className="flex gap-2">
            {activeStep === 2 && (
              <button 
                type="button" 
                onClick={() => setActiveStep(0)} 
                className="px-4 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
              >
                返回重新选
              </button>
            )}
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
            >
              关闭窗
            </button>
            {activeStep === 2 && (
              <button 
                type="button" 
                onClick={handleCommitFile} 
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
                <span>确认合规入档并归账</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  function handleSampleFlow(sample: typeof predefinedSamples[0]) {
    startAnalysis(sample);
  }
};
