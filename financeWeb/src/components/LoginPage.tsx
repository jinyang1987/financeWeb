﻿﻿﻿﻿﻿﻿﻿﻿import React, { useState } from 'react';
import { ShieldCheck, Users, Lock } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { ApiRequestError } from '../services/http';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!account.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    try {
      await login(account.trim(), password);
    } catch (err: any) {
      setError(err instanceof ApiRequestError ? err.message : '登录失败，请检查网络与后端服务');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-50">
      {/* Left: Branding & Illustration Area */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-sky-900 items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />

        <div className="absolute top-20 left-20 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-white/[0.02] rounded-full" />

        <div className="relative z-10 max-w-lg text-center px-12">
          <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/10 shadow-xl">
            <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              <path d="M12 2v4a2 2 0 002 2h4" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">
            会计档案管理系统
          </h1>
          <p className="text-sky-200/70 text-sm leading-relaxed">
            符合GB/T 39719-2020标准的电子会计档案全生命周期管理平台。
          </p>

          <div className="mt-10 grid grid-cols-3 gap-4 text-left">
            <div className="bg-white/5 rounded-xl p-4 backdrop-blur-sm border border-white/5">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center mb-2">
                <ShieldCheck className="w-4 h-4 text-sky-300" />
              </div>
              <p className="text-white text-xs font-semibold">四性检测</p>
              <p className="text-sky-300/60 text-[10px] mt-0.5">真实完整可用安全</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 backdrop-blur-sm border border-white/5">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center mb-2">
                <svg className="w-4 h-4 text-sky-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                </svg>
              </div>
              <p className="text-white text-xs font-semibold">档案管理</p>
              <p className="text-sky-300/60 text-[10px] mt-0.5">全生命周期管控</p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 backdrop-blur-sm border border-white/5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-2">
                <Users className="w-4 h-4 text-emerald-300" />
              </div>
              <p className="text-white text-xs font-semibold">借阅闭环</p>
              <p className="text-sky-300/60 text-[10px] mt-0.5">检索·审批·履约·归还</p>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-0 right-0 text-center">
          <p className="text-sky-300/30 text-[11px] tracking-widest uppercase">Electronic Accounting Archive Management System v2.0</p>
        </div>
      </div>

      {/* Right: Login Form + Quick Pick */}
      <div className="w-full lg:w-[520px] flex items-center justify-center p-8 bg-white overflow-y-auto">
        <div className="w-full max-w-md py-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900">欢迎登录</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">用户名</label>
              <div className="relative">
                <Users className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="请输入用户名"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 bg-slate-50/50 transition-all"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">密码</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 bg-slate-50/50 transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2.5">
                <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4m0 4h.01" />
                </svg>
                <span className="text-sm text-red-700 font-medium">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>验证中...</span>
                </>
              ) : (
                <span>登 录</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400">会计档案管理系统 v2.0 · 符合GB/T 39719-2020标准</p>
          </div>
        </div>
      </div>
    </div>
  );
}

