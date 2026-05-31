/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Building2, Plus, CheckCircle, HelpCircle, Archive, Edit, Sliders, MapPin, Star } from 'lucide-react';
import { Fonds } from '../types';

interface FanzongManagerProps {
  fondsList: Fonds[];
  setFondsList: React.Dispatch<React.SetStateAction<Fonds[]>>;
  currentFanzongCode: string;
  setCurrentFanzongCode: (code: string) => void;
  triggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

export const FanzongManager: React.FC<FanzongManagerProps> = ({
  fondsList,
  setFondsList,
  currentFanzongCode,
  setCurrentFanzongCode,
  triggerToast,
}) => {
  const [isOpenForm, setIsOpenForm] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [syncSource, setSyncSource] = useState('本地库录入');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) {
      triggerToast('请补充完整的全宗名称与全宗号。', 'warning');
      return;
    }
    const exists = fondsList.some(f => f.code.toUpperCase() === code.toUpperCase());
    if (exists) {
      triggerToast('全宗编号已存在，请换用其他归档代码。', 'warning');
      return;
    }

    const newFonds: Fonds = {
      id: `fz-${Date.now()}`,
      name,
      code: code.toUpperCase(),
      status: 'active',
      recordCount: 0,
      address: address || '未指定物理地址',
      syncSource
    };

    setFondsList([...fondsList, newFonds]);
    setIsOpenForm(false);
    setName('');
    setCode('');
    setAddress('');
    triggerToast(`成功登记新企业全宗：${name} [全宗号: ${code.toUpperCase()}]`, 'success');
  };

  const handleToggleStatus = (id: string) => {
    setFondsList(prev => prev.map(f => {
      if (f.id === id) {
        const nextStatus = f.status === 'active' ? 'inactive' : 'active';
        triggerToast(`全宗 ${f.name} 的状态已更改为：${nextStatus === 'active' ? '启用' : '禁用'}`, 'info');
        return { ...f, status: nextStatus };
      }
      return f;
    }));
  };


  return (
    <div id="fanzong-manager" className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <span>集团层级“全宗大类”物理与逻辑配置区</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">设置国家GB/T标准档案全宗（Fonds）边界，维护多实体、跨地域跨账套的独立会计核销权限隔离带。</p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpenForm(true)}
          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>登记新全宗</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {fondsList.map(f => {
          const isActive = f.code === currentFanzongCode;
          return (
            <div 
              key={f.id} 
              className={`bg-white border rounded-2xl p-5 shadow-xs space-y-4 relative overflow-hidden group hover:shadow-md transition-all ${
                isActive ? 'border-blue-500 shadow-inner ring-1 ring-blue-500/35 bg-blue-50/10' : 'border-slate-200/80 hover:border-slate-350'
              }`}
            >
              {/* Status absolute tag */}
              <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded-full border border-slate-100 shadow-3xs">
                <span className={`w-1.5 h-1.5 rounded-full ${f.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                <span className="text-[9px] font-bold text-slate-500 uppercase">{f.status === 'active' ? '正常启用' : '挂起阻断'}</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] tracking-wider uppercase font-mono font-bold rounded">
                    全宗号: {f.code}
                  </div>
                  {isActive && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500 text-white text-[9px] font-bold rounded shadow-3xs animate-bounce">
                      <Star className="w-2.5 h-2.5 fill-white text-white" />
                      <span>正在开展业务</span>
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-800 line-clamp-1">{f.name}</h3>
              </div>

              <div className="divide-y divide-slate-100 text-[11px] space-y-2 pt-1 text-slate-500">
                <div className="flex items-center justify-between py-1 pt-2">
                  <span className="flex items-center gap-1">
                    <Archive className="w-3.5 h-3.5 text-slate-400" />
                    <span>已挂接档案实物件</span>
                  </span>
                  <strong className="text-slate-800 font-mono text-xs">{f.recordCount} / 12,000 件</strong>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>物理档案库地址</span>
                  </span>
                  <span className="text-slate-700 truncate max-w-[150px]" title={f.address}>{f.address}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-slate-400" />
                    <span>元数据拉取源</span>
                  </span>
                  <span className="text-slate-600">{f.syncSource}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(f.id)}
                    className={`flex-1 py-1 text-center font-semibold text-[10.5px] rounded-lg border cursor-pointer transition-colors ${
                      f.status === 'active' 
                        ? 'border-amber-200 hover:bg-amber-50 text-amber-700' 
                        : 'border-emerald-200 hover:bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {f.status === 'active' ? '关停阻断' : '唤醒启用'}
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerToast(`全宗 [${f.code}] 目前已在 Alfresco 底层 Acl 鉴权体系绑定。可进行审计穿透。`, 'info')}
                    className="px-2.5 py-1 text-slate-600 bg-slate-50 hover:bg-slate-100 font-semibold text-[10.5px] rounded-lg cursor-pointer"
                  >
                    安全审计
                  </button>
                </div>
                
                {!isActive ? (
                  <button
                    type="button"
                    disabled={f.status !== 'active'}
                    onClick={() => {
                      setCurrentFanzongCode(f.code);
                      triggerToast(`成功切换当前活动全宗为：${f.name}`, 'success');
                    }}
                    className={`w-full py-1 text-center font-bold text-[10.5px] rounded-lg cursor-pointer transition-all ${
                      f.status === 'active'
                        ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-3xs'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200 border'
                    }`}
                  >
                    切换为当前核算全宗
                  </button>
                ) : (
                  <div className="w-full py-1 text-center font-bold text-[10.5px] text-blue-600 bg-blue-50 border border-blue-200 rounded-lg select-none">
                    ★ 当前正在操作
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dynamic fonds create modal */}
      {isOpenForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md border border-slate-200 p-6 shadow-2xl relative space-y-4">
            <div className="border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm">登记全新归档全宗</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">创建具有完整主物理索引的大宗管理对象</p>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">全宗名称 (Fonds Legal Title) <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="如：华东物流综合服务事业部"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block">全宗号 (Fonds Code Prefix) <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="例如: Z003"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs text-slate-700 font-mono uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block">数据流通道</label>
                  <select
                    value={syncSource}
                    onChange={e => setSyncSource(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                  >
                    <option value="本地库录入">本地文件智能采集</option>
                    <option value="金蝶接口服务">金蝶K3账套直连</option>
                    <option value="SAP数据中台">SAP RFC 交互服务</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">物理保管基地地址</label>
                <input
                  type="text"
                  placeholder="如：上海市浦东新区张江库房2号库"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsOpenForm(false)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 font-semibold rounded-lg cursor-pointer hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg cursor-pointer hover:bg-blue-700 shadow-sm"
                >
                  创建全宗
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
