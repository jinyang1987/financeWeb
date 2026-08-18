/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * VoucherManagerPage — 核对工作台（2026-08-16 合并审核职能）
 *
 * 组卷前唯一关口，三个状态 Tab：
 *   ① 待核对 —— 凭证号连续性核对 + 补传附件 + 收集池待核对（抓取/推送 to-check 去向）
 *   ② 待审核 —— 审核库（抓取/推送 to-review 去向），审核通过/驳回（原「审核工作台」职能）
 *   ③ 已处理 —— 审核通过/驳回的历史记录
 *
 * 会计实操流程：
 *   1. 会计核算系统生成记账凭证（自带凭证号：记-001、记-002 ...）
 *   2. 会计在归档系统核对凭证号连续性、金额、附件完整性
 *   3. 补传遗漏的原始凭证附件（发票/审批单/银行回单等）
 *   4. 核对无误后推送至组卷工作台 → 按凭证号连续组卷
 *
 * 关键原则：
 *   - 凭证号由会计系统生成，本系统不编造凭证号
 *   - 上传的文件作为 SourceDocument（原始凭证附件）绑定到具体凭证号
 *   - 不创建假的 ArchiveRecord
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Search, CheckCircle2, AlertCircle, FileSpreadsheet,
  Send, Filter, ChevronDown, ChevronRight,
  Paperclip, Upload, FileText, X, FolderOpen, Eye, Archive,
  Inbox, Loader2, ShieldCheck,
} from 'lucide-react';
import ReviewPanel from '../../components/archive-arrange/ReviewPanel';
import { openPushService, type CollectItem } from '../../services/openPushService';
import { uploadSourceDoc } from '../../services/sourceDocumentService';
import { useArchiveStore } from '../../stores/archiveStore';
import { useSourceDocumentStore } from '../../stores/sourceDocumentStore';
import { useVolumeStore } from '../../stores/volumeStore';
import { useAppStore } from '../../stores/appStore';
import { useMetadataDisplayStore } from '../../stores/metadataDisplayStore';
import { getVoucherManagerColumns, getVoucherManagerDefaultColumns } from '../../config/metadataColumnMaps/voucherManagerColumns';
import {
  getAllFieldIds,
  getDefaultVisibleIds,
} from '../../config/metadataContexts';
import { validateVoucherContinuity } from '../../stores/volumeStore';
import RecordDetailPanel from '../../components/RecordDetailPanel';
import { DataTable, type DataTableColumn } from '../../components/DataTable';
import PaginationBar from '../../components/PaginationBar';
import { usePagination } from '../../hooks/usePagination';
import type { ArchiveRecord } from '../../types';
import type { SourceDocument } from '../../types/sourceDocument';

// ── 工具 ──
const fmt = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2 });

interface VoucherSourceDoc extends SourceDocument {
  id: string;
  parentVoucherNo: string;
  attachmentSequence: number;
  docTypeName: string;
  amountLower: number;
}

const ACCEPT_TYPES = '.pdf,.tif,.tiff,.jpg,.jpeg,.png,.ofd,.xml';

// ═══════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════
const VoucherManagerPage: React.FC = () => {
  const records = useArchiveStore((s) => s.records);
  const allRecords = useArchiveStore((s) => s.allRecords);
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);
  const sourceDocs = useSourceDocumentStore((s) => s.documents);
  const setActiveMainMenu = useAppStore((s) => s.setActiveMainMenu);
  const volumes = useVolumeStore((s) => s.volumes);

  // ── 筛选状态（默认当年 + 全部月份：真数据源下任意月份上传都可见） ──
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [month, setMonth] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedVoucherId, setExpandedVoucherId] = useState<string | null>(null);
  const [detailRecord, setDetailRecord] = useState<ArchiveRecord | null>(null);
  // ★ 状态 Tab：待组卷（默认，组卷前准备区）/ 已归档（已组卷推送的档案，可查可见）
  const [statusTab, setStatusTab] = useState<'pending' | 'archived'>('pending');

  // ── Toast ──
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── ★ 主 Tab：待核对 / 待审核 / 已处理（2026-08-16 合并原审核工作台） ──
  const [pageTab, setPageTab] = useState<'check' | 'review' | 'done'>('check');

  // ── ★ 收集池待核对（ams_collect_item destination=to-check & pending） ──
  const [collectPending, setCollectPending] = useState<CollectItem[]>([]);
  const [collectLoading, setCollectLoading] = useState(false);
  const [passActioning, setPassActioning] = useState<number | null>(null);

  const loadCollectPending = useCallback(() => {
    setCollectLoading(true);
    openPushService.collectPendingCheck()
      .then(setCollectPending)
      .catch(() => setCollectPending([]))
      .finally(() => setCollectLoading(false));
  }, []);

  useEffect(() => { loadCollectPending(); }, [loadCollectPending]);

  const handleCollectPass = async (c: CollectItem, to: 'volume' | 'review') => {
    setPassActioning(c.id);
    try {
      await openPushService.collectPass(c.id, to);
      showToast(to === 'volume'
        ? `${c.voucherNo || '该记录'} 核对通过，已送组卷工作台待组卷池`
        : `${c.voucherNo || '该记录'} 核对通过，已转待审核`);
      loadCollectPending();
      // 核对通过后件状态可能变化（送审核），刷新件域镜像（2026-08-16 贯通修复）
      void useArchiveStore.getState().loadRecords();
      void useArchiveStore.getState().loadAllRecords();
    } catch (e) {
      showToast('操作失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setPassActioning(null);
    }
  };

  // ── 案卷状态映射（已归档 Tab 展示所属案卷信息） ──
  const volumeInfoMap = useMemo(() => {
    const map = new Map<string, { title: string; status: string; volumeCode: string; boxId: string }>();
    volumes.forEach((v) => map.set(v.id, { title: v.title, status: v.status, volumeCode: v.volumeCode, boxId: v.boxId }));
    return map;
  }, [volumes]);

  // ── 筛选当前月份的记账凭证 ──
  // 待组卷 Tab：仅未组卷凭证（组卷前准备区，原有设计）
  // 已归档 Tab：已组卷并推送归档的凭证（需求：归档数据在核对工作台可查可见）
  const monthVouchers = useMemo(() => {
    let result = records.filter((r) => {
      if (r.archiveType !== '记账凭证') return false;
      if (statusTab === 'pending' && r.status === '已组卷') return false;
      if (statusTab === 'archived' && r.status !== '已组卷') return false;
      if (year && r.year !== year) return false;
      if (month && month !== '' && r.month !== month) return false;
      return true;
    });
    // 按凭证号排序
    result.sort((a, b) => {
      const pa = a.voucherNo.match(/^(.+?)-(\d+)$/);
      const pb = b.voucherNo.match(/^(.+?)-(\d+)$/);
      if (!pa || !pb) return a.voucherNo.localeCompare(b.voucherNo);
      if (pa[1] !== pb[1]) return pa[1].localeCompare(pb[1]);
      return parseInt(pa[2]) - parseInt(pb[2]);
    });
    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        r.voucherNo.toLowerCase().includes(q) ||
        (r.remarks || '').toLowerCase().includes(q) ||
        r.amount.toString().includes(q) ||
        r.department.toLowerCase().includes(q),
      );
    }
    return result;
  }, [records, year, month, searchQuery, statusTab]);

  // ── Tab 计数（按当前年份口径，与列表筛选一致） ──
  const pendingCount = useMemo(
    () => records.filter((r) => r.archiveType === '记账凭证' && r.status !== '已组卷' && (!year || r.year === year)).length,
    [records, year],
  );
  const archivedCount = useMemo(
    () => records.filter((r) => r.archiveType === '记账凭证' && r.status === '已组卷' && (!year || r.year === year)).length,
    [records, year],
  );

  // ── 分页 ──
  const {
    pageData: pagedVouchers,
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    setPage,
    setPageSize,
  } = usePagination(monthVouchers, { defaultPageSize: 20 });

  // 筛选条件变化时重置到第1页
  useEffect(() => { setPage(1); }, [year, month, searchQuery, statusTab, setPage]);

  // ── 连续性检测 ──
  const continuity = useMemo(() => {
    return validateVoucherContinuity(monthVouchers.map((r) => r.voucherNo));
  }, [monthVouchers]);

  // ── 附件映射：凭证ID → 附件列表 ──
  const attachmentsByRecordId = useMemo(() => {
    const map = new Map<string, SourceDocument[]>();
    sourceDocs.forEach((sd) => {
      const list = map.get(sd.parentRecordId) || [];
      list.push(sd);
      map.set(sd.parentRecordId, list);
    });
    return map;
  }, [sourceDocs]);

  // ── 统计 ──
  const voucherCount = monthVouchers.length;
  const totalAttachments = sourceDocs.filter((sd) =>
    monthVouchers.some((v) => v.id === sd.parentRecordId)
  ).length;

  // ── 上传附件（真持久化：POST /source-docs/by-record/{id}，2026-08-16 贯通修复） ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUploadClick = (recordId: string) => {
    setUploadTargetId(recordId);
    fileInputRef.current?.click();
  };

  const handleFilesSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) { setUploadTargetId(null); return; }
    const targetRecord = records.find((r) => r.id === uploadTargetId) || allRecords.find((r) => r.id === uploadTargetId);
    if (!targetRecord) { setUploadTargetId(null); return; }

    const existingAttachments = attachmentsByRecordId.get(targetRecord.id) || [];
    let nextSeq = existingAttachments.length + 1;
    setUploading(true);
    let okCount = 0;
    try {
      for (const f of Array.from(files)) {
        try {
          await uploadSourceDoc(targetRecord.id, f, {
            documentNo: `SCAN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(nextSeq).padStart(3, '0')}`,
            docTypeCode: 'generic-invoice',
            docTypeName: f.name.match(/\.pdf$/i) ? '扫描件(PDF)' : '扫描件(图片)',
            transactionDate: `${targetRecord.year}-${targetRecord.month || '01'}-15`,
            amountLower: targetRecord.amount,
            counterpartyName: targetRecord.department,
            summary: targetRecord.remarks || '扫描上传',
            businessCategory: '费用',
            parentVoucherNo: targetRecord.voucherNo,
            attachmentSequence: nextSeq,
          });
          okCount++;
          nextSeq++;
        } catch (err) {
          showToast(`附件 ${f.name} 上传失败：${err instanceof Error ? err.message : '未知错误'}`, 'warning');
        }
      }
      if (okCount > 0) {
        // 以服务端为准重拉附件列表（含 parentRecordId 关联），刷新即不丢
        if (currentFanzongCode) {
          await useSourceDocumentStore.getState().loadSourceDocs(currentFanzongCode);
        }
        showToast(`已为 ${targetRecord.voucherNo} 上传 ${okCount} 份附件`);
      }
    } finally {
      setUploading(false);
      setUploadTargetId(null);
      e.target.value = '';
    }
  }, [uploadTargetId, records, allRecords, attachmentsByRecordId, currentFanzongCode]);

  // ── 推送到组卷工作台 ──
  const handlePushToWorkspace = () => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : allIds;
    if (ids.length === 0) {
      showToast('没有可推送的凭证', 'warning');
      return;
    }
    const count = ids.length;
    showToast(`已标记 ${count} 张凭证，即将跳转至组卷工作台`);
    setTimeout(() => setActiveMainMenu('volume-workspace'), 1200);
  };

  // ── 全选（当前页） ──
  const allIds = pagedVouchers.map((r) => r.id);
  const allSelected = allIds.length > 0 && selectedIds.size === allIds.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allIds));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── 表格列（从凭证上下文配置读取） ──
  const metaStore = useMetadataDisplayStore();
  const voucherFieldIds = useMemo(() => getAllFieldIds('voucher'), []);
  const voucherDefaultIds = useMemo(() => getDefaultVisibleIds('voucher'), []);

  useEffect(() => {
    metaStore.initContext('voucher', voucherFieldIds, voucherDefaultIds);
  }, [metaStore.initContext, voucherFieldIds, voucherDefaultIds]);

  // ★ 将 columnDef 转为 DataTableColumn（接入排序 + 列缩放 + table-fixed 精确列宽）
  const tableColumns = useMemo((): DataTableColumn<ArchiveRecord>[] => {
    const visibleIds = metaStore.getVisibleIds('voucher');
    const rawCols = visibleIds.length === 0 ? getVoucherManagerDefaultColumns() : getVoucherManagerColumns(visibleIds);
    const SORTABLE_IDS = new Set(['DATE', 'AMOUNT', 'VOUCHER_NO']);
    const SORT_VALUES: Record<string, (r: ArchiveRecord) => string | number> = {
      DATE: (r) => `${r.year}-${r.month}`,
      AMOUNT: (r) => r.amount,
      VOUCHER_NO: (r) => r.voucherNo,
    };
    // 全宽页面 table-fixed：每列设明确 width（按原 fr 比例 1:0.8:2.5:0.8:1:0.6 换算）
    const COL_SIZES: Record<string, { size: number; minSize: number; maxSize: number }> = {
      VOUCHER_NO:  { size: 130, minSize: 80,  maxSize: 200 },
      DATE:        { size: 100, minSize: 70,  maxSize: 150 },
      SUMMARY:     { size: 190, minSize: 120, maxSize: 400 },
      DEPARTMENT:  { size: 130, minSize: 70,  maxSize: 180 },
      AMOUNT:      { size: 160, minSize: 90,  maxSize: 200 },
      ATTACHMENTS: { size: 100, minSize: 60,  maxSize: 150 },
    };
    return rawCols.map(col => ({
      id: col.metaId,
      header: col.label,
      cell: (r: ArchiveRecord) => col.accessor(r),
      sortValue: SORT_VALUES[col.metaId],
      sortable: SORTABLE_IDS.has(col.metaId),
      align: col.align || 'left',
      ...(COL_SIZES[col.metaId] || { size: 150, minSize: 40, maxSize: 400 }),
    }));
  }, [metaStore.contexts['voucher']?.fields]);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
          toast.type === 'warning' ? 'bg-amber-600 text-white' : toast.type === 'info' ? 'bg-slate-700 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* ★ 顶部：标题 + 三大状态 Tab（核对/审核/已处理） */}
      <div className="flex items-center gap-4 px-6 py-3 bg-white border-b border-slate-200 shrink-0 flex-wrap">
        <FolderOpen className="w-5 h-5 text-slate-500" />
        <h1 className="text-base font-bold text-slate-800">核对工作台</h1>

        {/* ★ 主 Tab：待核对 / 待审核 / 已处理（原「审核工作台」已并入） */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          {([
            { key: 'check' as const, label: '待核对', count: pendingCount + collectPending.length },
            { key: 'review' as const, label: '待审核', count: null },
            { key: 'done' as const, label: '已处理', count: null },
          ]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setPageTab(t.key)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                pageTab === t.key
                  ? t.key === 'check' ? 'bg-white text-slate-800 shadow-sm' : 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              title={t.key === 'check' ? '凭证核对 + 收集池待核对（抓取/推送 to-check 去向）'
                : t.key === 'review' ? '审核库：抓取/推送 to-review 去向的数据，通过后组卷'
                : '审核通过/驳回的历史记录'}
            >
              {t.label}{t.count != null ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {pageTab === 'check' && statusTab === 'pending' && (
          <button onClick={handlePushToWorkspace}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors">
            <Send className="w-4 h-4" />
            推送至组卷工作台
          </button>
        )}
      </div>

      {/* ★ 待核对 Tab：筛选行（年/月 + 待组卷/已归档 + 统计） */}
      {pageTab === 'check' && (
        <div className="flex items-center gap-4 px-6 py-2.5 bg-white border-b border-slate-200 shrink-0 flex-wrap">
          <select value={year} onChange={(e) => { setYear(e.target.value); setSelectedIds(new Set()); }}
            className="px-3 py-1.5 text-sm border border-slate-400 rounded-lg bg-white">
            <option value="2026">2026年</option>
            <option value="2025">2025年</option>
          </select>

          <select value={month} onChange={(e) => { setMonth(e.target.value); setSelectedIds(new Set()); }}
            className="px-3 py-1.5 text-sm border border-slate-400 rounded-lg bg-white">
            <option value="">全部月份</option>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
              <option key={m} value={m}>{parseInt(m)}月</option>
            ))}
          </select>

          {/* 子 Tab：待组卷 / 已归档（归档数据可查可见） */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => { setStatusTab('pending'); setSelectedIds(new Set()); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                statusTab === 'pending' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              待组卷 ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => { setStatusTab('archived'); setSelectedIds(new Set()); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                statusTab === 'archived' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              已归档 ({archivedCount})
            </button>
          </div>

          <span className="text-sm text-slate-400">|</span>
          <span className="text-sm text-slate-500">
            记账凭证 <strong className="text-sky-600">{voucherCount}</strong> 张 &nbsp;
            原始凭证附件 <strong className="text-purple-600">{totalAttachments}</strong> 份
            {collectPending.length > 0 && (
              <>&nbsp;· 收集池待核对 <strong className="text-amber-600">{collectPending.length}</strong> 条</>
            )}
          </span>
        </div>
      )}

      {/* ★ 待审核 / 已处理 Tab：审核面板（原审核工作台职能） */}
      {pageTab === 'review' && <ReviewPanel mode="pending" />}
      {pageTab === 'done' && <ReviewPanel mode="processed" />}

      {/* ★ 待核对 Tab 主体 */}
      {pageTab === 'check' && (<>
      {/* ★ 收集池待核对（抓取/推送「送核对工作台」去向的数据） */}
      {statusTab === 'pending' && collectPending.length > 0 && (
        <div className="mx-6 mt-3 bg-amber-50/70 border border-amber-200 rounded-xl overflow-hidden shrink-0">
          <div className="px-4 py-2 border-b border-amber-100 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-800">收集池待核对（来自抓取/推送）</span>
            <span className="text-[11px] text-amber-600">{collectPending.length} 条 · 核对通过后选择流转方向</span>
            {collectLoading && <Loader2 className="w-3 h-3 animate-spin text-amber-500" />}
          </div>
          <div className="divide-y divide-amber-100/70 max-h-52 overflow-y-auto">
            {collectPending.map((c) => (
              <div key={c.id} className="px-4 py-2 flex items-center gap-3 text-xs bg-white/60">
                <span className={`px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${
                  c.category === 'voucher' ? 'bg-sky-50 text-sky-700 border-sky-200'
                  : c.category === 'ledger' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : c.category === 'report' ? 'bg-violet-50 text-violet-700 border-violet-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {c.category === 'voucher' ? '凭证' : c.category === 'ledger' ? '账簿' : c.category === 'report' ? '报表' : '其他'}
                </span>
                <span className="font-mono font-semibold text-slate-700 shrink-0">{c.voucherNo || '—'}</span>
                <span className="text-slate-500 truncate">{c.archiveType || ''}</span>
                <span className="text-slate-400 font-mono truncate">批次 {c.batchNo || '—'}</span>
                <span className="text-slate-400 shrink-0">{c.sourceType === 'yonyou-pull' ? '用友抓取' : c.sourceType === 'simulate' ? '模拟推送' : '接口推送'}</span>
                <div className="flex-1" />
                <button
                  type="button" disabled={passActioning === c.id}
                  onClick={() => handleCollectPass(c, 'volume')}
                  className="flex items-center gap-1 px-2 py-1 font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 disabled:opacity-50"
                  title="核对通过，进入组卷工作台待组卷池"
                >
                  {passActioning === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  通过·送组卷
                </button>
                <button
                  type="button" disabled={passActioning === c.id}
                  onClick={() => handleCollectPass(c, 'review')}
                  className="flex items-center gap-1 px-2 py-1 font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-md hover:bg-sky-100 disabled:opacity-50"
                  title="核对通过，转待审核（审核通过后再组卷）"
                >
                  <ShieldCheck className="w-3 h-3" />
                  通过·送审核
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ★ 连续性状态条（仅待组卷 Tab + 选定具体月份时展示） */}
      {statusTab === 'pending' && monthVouchers.length > 0 && month && month !== '' && (
        <div className={`px-6 py-2 text-xs flex items-center gap-3 border-b shrink-0 ${
          continuity.isContinuous
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {continuity.isContinuous ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>凭证号连续 · {continuity.range} · 共 {monthVouchers.length} 张记账凭证</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5" />
              <span>凭证号存在断号</span>
              {continuity.gaps.length > 0 && (
                <span className="font-mono text-red-600">
                  缺号: {continuity.gaps.slice(0, 5).join(', ')}
                  {continuity.gaps.length > 5 && ` ...等${continuity.gaps.length}处`}
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* 搜索栏 */}
      <div className="px-6 py-2 bg-white border-b border-slate-100 shrink-0 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="搜索凭证号、摘要、金额..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-300" />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
            className="rounded border-slate-300" />
          全选 ({allIds.length}张)
        </label>
        {selectedIds.size > 0 && (
          <span className="text-xs text-sky-600 font-medium">已选 {selectedIds.size} 张</span>
        )}

        {/* 隐藏的文件上传 input */}
        <input ref={fileInputRef} type="file" multiple className="hidden"
          accept={ACCEPT_TYPES} onChange={handleFilesSelected} />
      </div>

      {/* ★ 凭证列表 — DataTable（TanStack 排序 + shadcn 样式 + 展开附件） */}
      <div className="flex-1 overflow-auto bg-white min-h-0">
        <DataTable
          data={pagedVouchers}
          columns={tableColumns}
          selectedIds={selectedIds}
          onSelectionChange={(ids) => {
            const added = [...ids].find(id => !selectedIds.has(id));
            if (added) { toggleSelect(added); return; }
            const removed = [...selectedIds].find(id => !ids.has(id));
            if (removed) toggleSelect(removed);
          }}
          onToggleAll={() => {
            if (allSelected) setSelectedIds(new Set());
            else setSelectedIds(new Set(allIds));
          }}
          renderExtraColumn={(r) => {
            const isExpanded = expandedVoucherId === r.id;
            return (
              <button onClick={(e) => { e.stopPropagation(); setExpandedVoucherId(isExpanded ? null : r.id); }}
                className="text-slate-400 hover:text-slate-600">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            );
          }}
          expandedRowId={expandedVoucherId}
          renderExpandedRow={(r) => {
            const rAttachments = attachmentsByRecordId.get(r.id) || [];
            // ★ 已归档 Tab：展开行顶部展示所属案卷信息（卷号/案卷状态/盒号）
            const volInfo = r.volumeId ? volumeInfoMap.get(r.volumeId) : undefined;
            const volumeStatusLabel = volInfo?.status === 'transferred'
              ? '已移交档案保管'
              : volInfo?.status === 'confirmed'
                ? '组卷已确认 · 待移交'
                : volInfo?.status === 'draft'
                  ? '组卷草稿'
                  : '已组卷';
            const volumeStatusColor = volInfo?.status === 'transferred'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-sky-100 text-sky-700';
            return (
              <div className="px-6 py-3">
                {statusTab === 'archived' && (
                  <div className="mb-3 flex items-center gap-3 px-3 py-2 bg-sky-50/70 border border-sky-100 rounded-lg text-xs">
                    <Archive className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <span className="font-semibold text-sky-700 shrink-0">所属案卷</span>
                    <span className="font-mono text-sky-600 truncate">{r.volumeCode || volInfo?.volumeCode || '—'}</span>
                    {volInfo?.title && <span className="text-sky-500 truncate">{volInfo.title}</span>}
                    <span className={`ml-auto px-2 py-0.5 rounded-full font-medium shrink-0 ${volumeStatusColor}`}>
                      {volumeStatusLabel}
                    </span>
                    {(r.boxId || volInfo?.boxId) && (
                      <span className="text-slate-500 shrink-0">盒: {r.boxId || volInfo?.boxId}</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold text-slate-600">
                    {r.voucherNo} 的原始凭证附件
                  </span>
                </div>
                {rAttachments.length === 0 ? (
                  <div className="text-xs text-slate-400 py-3 border border-dashed border-slate-200 rounded-lg text-center">
                    暂无附件 — 点击右侧"上传附件"按钮补传
                  </div>
                ) : (
                  (() => {
                    const sorted = rAttachments.sort((a, b) => a.attachmentSequence - b.attachmentSequence);
                    return (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        {/* 迷你表头 */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                          <span className="w-[46px] shrink-0">序号</span>
                          <span className="w-[130px] shrink-0">类型</span>
                          <span className="w-[155px] shrink-0">单据编号</span>
                          <span className="w-[90px] shrink-0">业务日期</span>
                          <span className="w-[100px] shrink-0">对方单位</span>
                          <span className="w-[95px] shrink-0">金额</span>
                          <span className="flex-1">摘要</span>
                          <span className="w-[50px] shrink-0 text-center">附件</span>
                        </div>
                        {/* 数据行 */}
                        {sorted.map((sd) => (
                          <div key={sd.id} className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 last:border-b-0 text-xs hover:bg-slate-50 transition-colors">
                            <span className="text-amber-500 font-mono w-[46px] shrink-0 text-[11px]">附{sd.attachmentSequence}</span>
                            <span className="font-medium text-slate-700 w-[130px] shrink-0 truncate" title={sd.docTypeName}>{sd.docTypeName}</span>
                            <span className="text-slate-500 font-mono w-[155px] shrink-0 truncate text-[11px]" title={sd.documentNo}>{sd.documentNo}</span>
                            <span className="text-slate-500 w-[90px] shrink-0 text-[11px]">{sd.transactionDate}</span>
                            <span className="text-slate-600 w-[100px] shrink-0 truncate" title={sd.counterpartyName}>{sd.counterpartyName || '—'}</span>
                            <span className="font-mono text-slate-700 w-[95px] shrink-0 text-[11px]">{sd.amountLower > 0 ? `¥${fmt(sd.amountLower)}` : '—'}</span>
                            <span className="flex-1 text-slate-400 truncate text-[11px]" title={sd.summary}>{sd.summary || '—'}</span>
                            <span className="text-slate-400 w-[50px] shrink-0 text-center text-[11px]">{sd.files.length > 0 ? `${sd.files.length} 份` : '—'}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>
            );
          }}
          renderActions={(r) => (
            <span className="flex items-center justify-end gap-1">
              <button onClick={(e) => { e.stopPropagation(); setDetailRecord(r); }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                title={`查看 ${r.voucherNo} 完整详情`}>
                <Eye className="w-3 h-3" />
                详情
              </button>
              {statusTab === 'pending' && (
                <button onClick={(e) => { e.stopPropagation(); handleUploadClick(r.id); }}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded transition-colors"
                  title={`为 ${r.voucherNo} 上传原始凭证附件`}>
                  <Upload className="w-3 h-3" />
                  上传
                </button>
              )}
            </span>
          )}
          actionsWidth={130}
          emptyLabel={statusTab === 'pending' ? '该月份待组卷记账凭证为空' : '该月份暂无已归档记账凭证'}
          selectedClassName="bg-sky-50"
        />

      </div>

      {/* ★ 分页栏 — 固定在底部，不随表格滚动 */}
      <PaginationBar
        centered
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
      </>)}

      {/* ★ 详情侧边面板（点击"详情"按钮弹出） */}
      {detailRecord && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20" onClick={() => setDetailRecord(null)} />
          <div className="relative w-[520px] max-w-[95vw] h-full shadow-2xl z-50">
            <RecordDetailPanel
              context="voucher"
              record={detailRecord}
              onClose={() => setDetailRecord(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default VoucherManagerPage;

