/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PortalSearchPage — 检索门户结果页（多模式容器）
 *
 * 将后台「档案查询」二级菜单的检索能力全部融合到前台门户：
 *   综合检索 / 凭证检索 / 事项检索 / 附件检索 / 关联查询 / 审计追踪
 * 通过 Tab 切换不同检索模式，数据源与后台完全一致（ams-server 真后端）。
 * 点击档案结果 → 门户档案详情（附件权限门控）。
 */

import React from 'react';
import { Search, FileText, ZoomIn, FileSpreadsheet, FolderTree, ShieldCheck } from 'lucide-react';
import { usePortalStore, type PortalSearchMode } from '../../stores/portalStore';
import PortalGeneralSearch from './modes/PortalGeneralSearch';
import PortalVoucherSearch from './modes/PortalVoucherSearch';
import PortalMatterSearch from './modes/PortalMatterSearch';
import PortalAttachmentSearch from './modes/PortalAttachmentSearch';
import PortalVolumeSearch from './modes/PortalVolumeSearch';
import PortalAuditSearch from './modes/PortalAuditSearch';
import type { ArchiveRecord } from '../../types';

interface PortalSearchPageProps {
  onOpenDetail: (record: ArchiveRecord) => void;
  onGoHome: () => void;
}

/** 检索模式定义（与后台「档案查询」二级菜单一一对应） */
const SEARCH_MODES: { key: PortalSearchMode; label: string; desc: string; Icon: typeof Search }[] = [
  { key: 'general', label: '综合检索', desc: '全库关键词', Icon: Search },
  { key: 'voucher', label: '凭证检索', desc: '凭证多维查询', Icon: FileText },
  { key: 'matter', label: '事项检索', desc: '经济业务定位', Icon: ZoomIn },
  { key: 'attachment', label: '附件检索', desc: '原始凭证附件', Icon: FileSpreadsheet },
  { key: 'volume', label: '关联查询', desc: '卷件同屏对比', Icon: FolderTree },
  { key: 'audit', label: '审计追踪', desc: '操作哈希链', Icon: ShieldCheck },
];

const PortalSearchPage: React.FC<PortalSearchPageProps> = ({ onOpenDetail, onGoHome }) => {
  const searchMode = usePortalStore((s) => s.searchMode);
  const setSearchMode = usePortalStore((s) => s.setSearchMode);
  const portalKeyword = usePortalStore((s) => s.portalKeyword);

  return (
    <div className="h-full flex flex-col">
      {/* 检索模式 Tab（融合后台档案查询二级菜单） */}
      <div className="bg-white border-b border-slate-200 px-6 pt-2.5 pb-0 shrink-0">
        <div className="flex items-center gap-1 max-w-6xl mx-auto flex-wrap">
          <button
            type="button"
            onClick={onGoHome}
            className="flex items-center gap-1 px-2 py-2 text-xs text-slate-400 hover:text-sky-600 transition-colors cursor-pointer mr-1"
            title="返回首页"
          >
            <Search className="w-3 h-3 rotate-180" />返回
          </button>
          <div className="h-5 w-px bg-slate-200 mr-1" />
          {SEARCH_MODES.map((m) => {
            const active = searchMode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setSearchMode(m.key)}
                title={m.desc}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-t-xl border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-sky-600 text-sky-700 bg-sky-50/60'
                    : 'border-transparent text-slate-500 hover:text-sky-600 hover:bg-slate-50'
                }`}
              >
                <m.Icon className="w-3.5 h-3.5" />
                {m.label}
              </button>
            );
          })}
          <div className="ml-auto text-[11px] text-slate-400 hidden md:block">
            检索能力与后台「档案查询」一致 · 关键词：{portalKeyword || '—'}
          </div>
        </div>
      </div>

      {/* 模式内容 */}
      <div className="flex-1 min-h-0 overflow-hidden bg-slate-50">
        {searchMode === 'general' && <PortalGeneralSearch onOpenDetail={onOpenDetail} />}
        {searchMode === 'voucher' && <PortalVoucherSearch onOpenDetail={onOpenDetail} />}
        {searchMode === 'matter' && <PortalMatterSearch onOpenDetail={onOpenDetail} />}
        {searchMode === 'attachment' && <PortalAttachmentSearch onOpenDetail={onOpenDetail} />}
        {searchMode === 'volume' && <PortalVolumeSearch onOpenDetail={onOpenDetail} />}
        {searchMode === 'audit' && <PortalAuditSearch />}
      </div>
    </div>
  );
};

export default PortalSearchPage;
