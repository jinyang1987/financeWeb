/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PortalMyBorrow — 检索门户「我的借阅」
 *
 * 复用后台「我的借阅」三 Tab（借阅车/我的申请/在线调阅）。
 * 数据/逻辑与后台完全一致（同一 borrowStore + ams-server 后端），
 * 只是以门户容器展示，并保留「进入后台管理」的切换入口。
 */

import React from 'react';
import { BookOpen } from 'lucide-react';
import MyBorrowPage from '../../pages/archive-utilization/my-borrow/MyBorrowPage';

const PortalMyBorrow: React.FC = () => {
  return (
    <div className="h-full overflow-hidden">
      {/* 页头提示（保持与门户风格一致） */}
      <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2 shrink-0">
        <BookOpen className="w-4 h-4 text-sky-600" />
        <span className="text-xs font-semibold text-slate-700">我的借阅（检索门户）</span>
        <span className="text-[10px] text-slate-400">借阅车统一结算 · 审批进度 · 限时在线调阅</span>
      </div>
      <div className="h-[calc(100%-37px)]">
        <MyBorrowPage />
      </div>
    </div>
  );
};

export default PortalMyBorrow;
