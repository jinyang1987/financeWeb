/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ArchiveTransferPage — 档案移交
 *
 * 会计部保管期满后正式向档案部移交档案，生成移交清册并双方确认。
 */

import React from 'react';
import { Send } from 'lucide-react';

const ArchiveTransferPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200">
        <Send className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">档案移交</h1>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Send className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-slate-500 text-sm">档案移交功能开发中</p>
          <p className="text-slate-400 text-xs">移交清册生成 · 双方确认签收 · 移交记录留存</p>
        </div>
      </div>
    </div>
  );
};

export default ArchiveTransferPage;
