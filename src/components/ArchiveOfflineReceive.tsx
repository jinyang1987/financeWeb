import React, { useState } from 'react';
import { Upload, Box, CheckCircle2, AlertCircle, RefreshCw, FileText, Activity, ShieldCheck, CheckSquare, Layers } from 'lucide-react';

export const ArchiveOfflineReceive: React.FC = () => {
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'verifying' | 'success'>('idle');
  const [progress, setProgress] = useState(0);

  const handleUpload = () => {
    if (uploadStatus !== 'idle') return;
    setUploadStatus('uploading');
    setProgress(0);
    
    // Simulate upload progress
    const initInterval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(initInterval);
          setUploadStatus('verifying');
          
          // Simulate verification delay
          setTimeout(() => {
            setUploadStatus('success');
          }, 4000);
          return 100;
        }
        return p + 5;
      });
    }, 100);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-2 font-sans">
          <Box className="w-5 h-5 text-indigo-600" />
          <span>档案离线数据包接收 (EEP)</span>
        </h2>
        <p className="text-xs text-slate-500 mb-6">
          接收国家标准的离线财务包，涵盖数据电文、元数据XML及附件。系统将在解包后即时开展国标“四性”严密核查与验流锁定。
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left panel: Upload Area */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div 
              onClick={handleUpload}
              className={`border-2 border-dashed ${uploadStatus === 'idle' ? 'border-slate-300 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50' : 'border-indigo-300 bg-indigo-50'} rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all h-64 relative overflow-hidden`}
            >
              {uploadStatus === 'idle' ? (
                <>
                  <Upload className="w-10 h-10 text-indigo-300 mb-3" />
                  <span className="text-sm font-bold text-slate-700">点击或拖拽 EEP 离线包至此处</span>
                  <span className="text-xs text-slate-400 mt-2 max-w-[200px] leading-relaxed">支持财政部财会[2021]9号要求的 .zip 标准离线移交封包</span>
                </>
              ) : uploadStatus === 'uploading' ? (
                <div className="flex flex-col items-center w-full z-10 px-8">
                  <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                  <span className="text-sm font-bold text-indigo-900 mb-2">正在接收与初态切片...</span>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div className="bg-indigo-500 h-2 rounded-full transition-all duration-75" style={{ width: `${progress}%` }}></div>
                  </div>
                  <span className="text-xs text-indigo-600 font-mono mt-2">{progress}%</span>
                </div>
              ) : uploadStatus === 'verifying' ? (
                <div className="flex flex-col items-center z-10">
                  <Activity className="w-10 h-10 text-emerald-500 animate-pulse mb-3" />
                  <span className="text-sm font-bold text-emerald-800">沙箱封存与四性检测中...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center z-10">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
                  <span className="text-sm font-bold text-emerald-800">接收检测完成，已入库</span>
                </div>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
              <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-1.5"><AlertCircle className="w-4 h-4 text-amber-500" /> 解析要求</h4>
              <ul className="space-y-1.5 text-slate-600">
                <li className="flex items-start gap-1"><span className="text-indigo-400 mt-0.5">•</span> 根目录必须包含标准 metadata.xml</li>
                <li className="flex items-start gap-1"><span className="text-indigo-400 mt-0.5">•</span> 电子签名链需含签署人有效证书公钥</li>
                <li className="flex items-start gap-1"><span className="text-indigo-400 mt-0.5">•</span> 确保所传批次不与已上架档案重叠</li>
              </ul>
            </div>
          </div>

          {/* Right panel: Inspection & Logs */}
          <div className="lg:col-span-8 bg-slate-900 text-slate-300 rounded-2xl flex flex-col overflow-hidden shadow-inner font-mono text-sm">
            <div className="bg-slate-950 p-3 border-b border-slate-800 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-2">
                 <ShieldCheck className="w-4 h-4 text-emerald-400" />
                 <span className="font-bold text-slate-200 text-xs tracking-wider">四性核查探针与引擎解析日志</span>
               </div>
               {uploadStatus === 'verifying' && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>}
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
               {uploadStatus === 'idle' ? (
                 <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                   等待数据包传入...
                 </div>
               ) : (
                 <>
                   <LogLine time="13:00:01" type="INFO" msg="Initiated temporary STAGE reception sandbox..." />
                   {progress >= 20 && <LogLine time="13:00:02" type="INFO" msg={`Receiving binary streams... Chunk 1/5 received.`} />}
                   {progress >= 60 && <LogLine time="13:00:03" type="INFO" msg={`Receiving binary streams... Chunk 3/5 received.`} />}
                   {progress >= 100 && <LogLine time="13:00:04" type="SUCCESS" msg="Package transferred completely. Inflating EEP container..." />}
                   
                   {uploadStatus === 'verifying' && (
                     <>
                        <LogLine time="13:00:05" type="SYSTEM" msg="================ 四性检测链启动 ================" />
                        <div className="pl-4 py-2 border-l border-slate-700 ml-2 space-y-3">
                          <CheckItem label="真实性 (Authenticity)" status="passing" desc="解析签名报文与电子印章链" />
                          <CheckItem label="完整性 (Integrity)" status="pending" desc="包裹哈希散列同源测算及目录元数据对照" />
                          <CheckItem label="可用性 (Usability)" status="pending" desc="OFD/PDF/XML 格式兼容性嗅探" />
                          <CheckItem label="安全性 (Security)" status="pending" desc="恶意脚本注入与权限越界扫描" />
                        </div>
                     </>
                   )}

                   {uploadStatus === 'success' && (
                     <>
                        <LogLine time="13:00:05" type="SYSTEM" msg="================ 四性检测链启动 ================" />
                        <div className="pl-4 py-2 border-l-2 border-emerald-700 ml-2 space-y-3 animate-in slide-in-from-left-4">
                          <CheckItem label="真实性 (Authenticity)" status="success" desc="CA节点验证通过，时间戳合法" />
                          <CheckItem label="完整性 (Integrity)" status="success" desc="SHA-256匹配，1,421个附件索引完整" />
                          <CheckItem label="可用性 (Usability)" status="success" desc="CEB/OFD格式头文件魔数正常" />
                          <CheckItem label="安全性 (Security)" status="success" desc="未见二进制异常嵌入，沙箱通过" />
                        </div>
                        <LogLine time="13:00:09" type="SUCCESS" msg="四性检测报告生成：总计通过项(4/4)。" />
                        <LogLine time="13:00:10" type="INFO" msg="Injecting records into core repository... Generating standard Archive IDs..." />
                        <LogLine time="13:00:11" type="SUCCESS" msg="✅ 离线档案接收入库彻底完成，已进入利用与保存生命周期！" />
                     </>
                   )}
                 </>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LogLine = ({ time, type, msg }: { time: string, type: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'SYSTEM', msg: string }) => {
  const colorMap = {
    INFO: 'text-blue-400',
    SUCCESS: 'text-emerald-400',
    WARN: 'text-amber-400',
    ERROR: 'text-rose-400',
    SYSTEM: 'text-indigo-400 font-bold'
  };

  return (
    <div className="flex items-start gap-3 text-xs leading-relaxed animate-in fade-in slide-in-from-bottom-1">
      <span className="text-slate-500 shrink-0">[{time}]</span>
      <span className={`shrink-0 w-16 ${colorMap[type]}`}>[{type}]</span>
      <span className="text-slate-300 break-all">{msg}</span>
    </div>
  );
};

const CheckItem = ({ label, status, desc }: { label: string, status: 'pending' | 'passing' | 'success', desc: string }) => {
  return (
    <div className="flex items-center gap-3 animate-in fade-in">
      <div className="shrink-0 w-5 flex justify-center">
        {status === 'success' ? <CheckSquare className="w-4 h-4 text-emerald-500" /> : 
         status === 'passing' ? <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin" /> : 
         <div className="w-2 h-2 rounded-full bg-slate-600"></div>}
      </div>
      <div>
        <div className={`text-xs font-bold ${status === 'success' ? 'text-emerald-400' : status === 'passing' ? 'text-blue-300' : 'text-slate-500'}`}>{label}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">{desc}</div>
      </div>
    </div>
  );
};
