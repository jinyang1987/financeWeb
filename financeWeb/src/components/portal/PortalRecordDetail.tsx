/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PortalRecordDetail — 检索门户档案详情页
 *
 * 展示档案元数据 + 原始凭证附件列表 + 借阅状态。
 * 附件权限门控：
 *   - 已授权（当前用户对档案件有生效中的电子借阅授权）→ 可预览/下载附件
 *   - 未授权 → 仅展示附件清单（题名/类型/金额），不可预览/下载，引导发起借阅
 */

import React, { useMemo } from 'react';
import {
  ChevronRight, FileText, Download, Eye, Lock, ShieldAlert,
  BookOpen, Calendar, Hash, Tag, DollarSign, User, Building2, StickyNote,
} from 'lucide-react';
import { usePortalData } from '../../hooks/usePortalData';
import { usePortalStore } from '../../stores/portalStore';
import { useAuthStore } from '../../stores/authStore';
import { useBorrowStore, activeElectronicGrants } from '../../stores/borrowStore';
import { useVolumeStore } from '../../stores/volumeStore';
import { useAppStore } from '../../stores/appStore';
import { useRoleStore, hasOperation } from '../../stores/roleStore';
import { fetchSourceDocContent } from '../../services/sourceDocumentService';
import { fetchRecordContent } from '../../services/recordService';
import { PERM_LABELS, type ElectronicPerm } from '../../types/borrow';
import ArchiveStatusTags from '../borrow/ArchiveStatusTags';
import { isSourceDocument } from '../../utils/recordType';
import type { ArchiveRecord } from '../../types';
import type { SourceDocument } from '../../types/sourceDocument';

interface PortalRecordDetailProps {
  record: ArchiveRecord;
  onBack: () => void;
  onGoHome: () => void;
}

/** 附件权限：当前用户对这份档案拥有的电子授权权限 */
function grantedPermsOf(
  orders: ReturnType<typeof useBorrowStore.getState>['orders'],
  userId: string | undefined,
  record: ArchiveRecord,
): ElectronicPerm[] {
  if (!userId) return [];
  const grants = activeElectronicGrants(orders, userId);
  for (const { order, fulfillment } of grants) {
    if (fulfillment.recordIds.includes(record.id)) {
      const item = order.items.find((i) => i.recordId === record.id);
      return item?.electronicPerms || ['view'];
    }
  }
  return [];
}

const PortalRecordDetail: React.FC<PortalRecordDetailProps> = ({ record, onBack, onGoHome }) => {
  const { sourceDocs } = usePortalData();
  const orders = useBorrowStore((s) => s.orders);
  const addToCart = useBorrowStore((s) => s.addToCart);
  const removeFromCart = useBorrowStore((s) => s.removeFromCart);
  const cart = useBorrowStore((s) => s.cart);
  const currentUser = useAuthStore((s) => s.currentUser);
  const triggerToast = useAppStore((s) => s.triggerToast);
  const volumes = useVolumeStore((s) => s.volumes);
  const setPortalTab = usePortalStore((s) => s.setPortalTab);
  const roleOperations = useRoleStore((s) => s.roleOperations);

  const attachments = useMemo(
    () => sourceDocs.filter((d) => d.parentRecordId === record.id || d.parentVoucherNo === record.voucherNo),
    [sourceDocs, record],
  );

  // ★ 原始凭证判别（2026-08-18 详情重设计；2026-08-19 抽为共享 helper isSourceDocument）：自身即附件主体，展示上传原件而非「所附原始凭证」
  const isSourceDoc = isSourceDocument(record);

  const handleViewOwn = async () => {
    try {
      const blob = await fetchRecordContent(record.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      triggerToast(e.message || '预览失败', 'warning');
    }
  };

  const handleDownloadOwn = async () => {
    try {
      const blob = await fetchRecordContent(record.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = record.components?.[0]?.name || record.voucherNo || record.id;
      a.click();
      URL.revokeObjectURL(url);
      triggerToast('已下载附件', 'success');
    } catch (e: any) {
      triggerToast(e.message || '下载失败', 'warning');
    }
  };

  const perms = grantedPermsOf(orders, currentUser?.id, record);
  // 操作权限（6 位 QX 码）：借阅授权 ∪ 角色操作权，二者任一即可（2026-08-18 三维授权）
  const roles = currentUser?.roles ?? [];
  const canViewOp = hasOperation(roles, 'view', roleOperations);
  const canDownloadOp = hasOperation(roles, 'download', roleOperations);
  const canBorrowOp = hasOperation(roles, 'borrow', roleOperations);
  const canViewAttachment = perms.length > 0 || canViewOp;
  const canDownloadAttachment = perms.includes('download') || canDownloadOp;
  const inCart = cart.some((c) => c.recordId === record.id);

  const volume = volumes.find((v) => v.id === record.volumeId);

  const handleToggleCart = () => {
    if (!currentUser) return;
    if (inCart) {
      removeFromCart(record.id);
      triggerToast('已移出借阅车', 'info');
    } else {
      addToCart(record.id);
      triggerToast('已加入借阅车，可去我的借阅统一结算', 'success');
    }
  };

  const handleViewAttachment = async (doc: SourceDocument) => {
    try {
      const blob = await fetchSourceDocContent(doc.id, false);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      triggerToast(e.message || '预览失败', 'warning');
    }
  };

  const handleDownloadAttachment = async (doc: SourceDocument) => {
    try {
      const blob = await fetchSourceDocContent(doc.id, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.documentNo || doc.id;
      a.click();
      URL.revokeObjectURL(url);
      triggerToast(`已下载附件 ${doc.documentNo}`, 'success');
    } catch (e: any) {
      triggerToast(e.message || '下载失败', 'warning');
    }
  };

  const goBorrow = () => {
    // 前往门户「我的借阅」发起借阅申请（借阅留在门户内，不回后台）
    setPortalTab('my-borrow');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-5 space-y-4">
        {/* 面包屑 */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <button type="button" onClick={onGoHome} className="hover:text-sky-600 cursor-pointer">检索门户</button>
          <ChevronRight className="w-3 h-3" />
          <button type="button" onClick={onBack} className="hover:text-sky-600 cursor-pointer">检索结果</button>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-600 font-medium">档案详情</span>
        </div>

        {/* 档案概要 */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 bg-gradient-to-r from-slate-800 to-slate-700">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-300" />
              <span className="text-[10px] text-sky-200/80 tracking-widest uppercase">档案条目</span>
            </div>
            <h1 className="text-lg font-bold text-white mt-1.5">{record.remarks || record.voucherNo}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[10px] font-mono text-white/70 bg-white/10 px-2 py-0.5 rounded">{record.archiveCode}</span>
              {isSourceDoc && <span className="text-[10px] text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded">原始凭证</span>}
              {record.voucherNo && <span className="text-[10px] font-mono text-white/70">{record.voucherNo}</span>}
              <ArchiveStatusTags record={record} />
            </div>
          </div>

          <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
            <Field icon={<Hash className="w-3.5 h-3.5" />} label="凭证号" value={record.voucherNo || '—'} mono />
            <Field icon={<Calendar className="w-3.5 h-3.5" />} label="会计期间" value={record.year ? `${record.year}年${record.month || ''}月` : '—'} />
            <Field icon={<Tag className="w-3.5 h-3.5" />} label="档案类型" value={isSourceDoc ? (record.voucherCategory || '原始凭证') : record.archiveType || '—'} />
            <Field icon={<Building2 className="w-3.5 h-3.5" />} label="部门" value={record.department || '—'} />
            <Field icon={<DollarSign className="w-3.5 h-3.5" />} label="金额" value={`¥${record.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`} mono />
            <Field icon={<User className="w-3.5 h-3.5" />} label="制单人" value={record.preparer || '—'} />
            <Field icon={<Tag className="w-3.5 h-3.5" />} label="会计科目" value={record.accountSubject || '—'} />
            {isSourceDoc && record.counterpartyName && (
              <Field icon={<Building2 className="w-3.5 h-3.5" />} label="往来单位" value={record.counterpartyName} />
            )}
            {isSourceDoc && record.documentNo && (
              <Field icon={<Hash className="w-3.5 h-3.5" />} label="单据编号" value={record.documentNo} mono />
            )}
            <Field icon={<FileText className="w-3.5 h-3.5" />} label="组卷状态" value={record.status || '—'} />
            <Field icon={<ShieldAlert className="w-3.5 h-3.5" />} label="密级" value={record.securityLevel || '普通'} />
          </div>

          {record.remarks && (
            <div className="px-6 pb-4 text-xs text-slate-500 bg-slate-50/60 border-t border-slate-100 py-3 flex items-start gap-1.5">
              <StickyNote className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <span>{record.remarks}</span>
            </div>
          )}
        </div>

        {/* 原始凭证附件 */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-bold text-slate-800">{isSourceDoc ? '电子附件（上传原件）' : '原始凭证附件'}</span>
              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                {isSourceDoc ? (record.components?.length || 0) : attachments.length} 份
              </span>
            </div>
            {canViewAttachment ? (
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Eye className="w-3 h-3 inline mr-0.5" />已授权 {perms.map((p) => PERM_LABELS[p]).join('/')}
              </span>
            ) : (
              <span className="text-[10px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <Lock className="w-3 h-3 inline mr-0.5" />需借阅授权后可预览
              </span>
            )}
          </div>

          {isSourceDoc ? (
            record.components && record.components.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {record.components.map((c, idx) => (
                  <div key={idx} className="px-6 py-3.5 flex items-center gap-3">
                    <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                      附{idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{c.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {c.type} · {c.size}{c.contentType ? ` · ${c.contentType.toUpperCase()}` : ''}
                      </div>
                    </div>
                    {canViewAttachment ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleViewOwn}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />预览
                        </button>
                        {canDownloadAttachment && (
                          <button
                            type="button"
                            onClick={handleDownloadOwn}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-700 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Download className="w-3 h-3" />下载
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 shrink-0">未授权</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-slate-400 text-xs">
                该档案暂无电子附件
              </div>
            )
          ) : attachments.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-400 text-xs">
              该档案暂无电子原始凭证附件
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {attachments.map((doc, idx) => (
                <div key={doc.id} className="px-6 py-3.5 flex items-center gap-3">
                  <span className="text-[10px] font-mono text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                    附{idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">
                      {doc.docTypeName || doc.documentNo}
                      <span className="ml-2 font-mono text-xs text-slate-400">{doc.documentNo}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400 flex-wrap">
                      <span>{doc.transactionDate}</span>
                      {doc.counterpartyName && (
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{doc.counterpartyName}</span>
                      )}
                      <span className="font-mono">¥{doc.amountLower.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
                      {doc.summary && <span className="truncate max-w-[200px]">{doc.summary}</span>}
                    </div>
                  </div>

                  {canViewAttachment ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleViewAttachment(doc)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />预览
                      </button>
                      {canDownloadAttachment && (
                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(doc)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-700 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3" />下载
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 shrink-0">未授权</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 借阅引导（预览权不足） */}
          {!canViewAttachment && canBorrowOp && (
            <div className="px-6 py-3.5 bg-amber-50/60 border-t border-amber-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                您尚未获得该档案的在线调阅授权，可加入借阅车发起申请，审批通过后即可预览附件。
              </div>
              <button
                type="button"
                onClick={() => (inCart ? goBorrow() : handleToggleCart())}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 ${
                  inCart
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                {inCart ? '已在借阅车，去结算' : '加入借阅车'}
              </button>
            </div>
          )}

          {/* 下载/打印权引导（可预览但无下载权：借阅审批是唯一升级路径） */}
          {canViewAttachment && !canDownloadAttachment && canBorrowOp && (
            <div className="px-6 py-3 bg-sky-50/60 border-t border-sky-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-sky-700">
                <Download className="w-3.5 h-3.5 shrink-0" />
                下载/打印属受限操作，可通过借阅审批申请授权（审批通过后按授予权限开放）。
              </div>
              <button
                type="button"
                onClick={() => (inCart ? goBorrow() : handleToggleCart())}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 ${
                  inCart
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                {inCart ? '已在借阅车，去结算' : '申请下载授权'}
              </button>
            </div>
          )}
        </div>

        {/* 借阅信息 */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-6 py-4">
          <div className="text-xs font-bold text-slate-600 mb-2">借阅信息</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-500">
            <div>
              <div className="text-slate-400 mb-0.5">所属案卷</div>
              <div className="font-mono text-slate-700 truncate">{volume?.volumeCode || record.volumeCode || '—'}</div>
            </div>
            <div>
              <div className="text-slate-400 mb-0.5">载体</div>
              <div>{record.carrierType === 'electronic' ? '纯电子' : record.carrierType === 'paper' ? '纸质数字化' : '—'}</div>
            </div>
            <div>
              <div className="text-slate-400 mb-0.5">保管期限</div>
              <div>{record.retention || '—'}</div>
            </div>
            <div>
              <div className="text-slate-400 mb-0.5">来源</div>
              <div>{record.source === 'digital-native' ? '原生电子' : record.source === 'digitized' ? '纸质数字化' : record.source}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ icon: React.ReactNode; label: string; value: string; mono?: boolean }> = ({ icon, label, value, mono }) => (
  <div className="flex items-start gap-2">
    <span className="text-slate-300 mt-0.5 shrink-0">{icon}</span>
    <div className="min-w-0">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className={`text-xs text-slate-700 truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  </div>
);

export default PortalRecordDetail;
