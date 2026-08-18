/**
 * RecordDetailPanel — 分栏式三级详情面板
 *
 * 替代抽屉式 DrawerPanel（在财务/项目分类视图场景下），
 * 将页面裂为左右两栏：左列表 + 右详情。
 *
 * 三级信息垂直排列：
 *   L1: 记账凭证概要
 *   L2: 关联原始凭证列表（优先 SourceDocument，降级 ArchiveRecord）
 *   L3: 选中原始凭证完整元数据
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  ChevronRight, ChevronDown, CheckCircle2, AlertTriangle,
  FileText, DollarSign, Building2, Hash, Tag, Calendar,
  User, Package, ExternalLink, FileSpreadsheet, Edit3, Trash2,
  FolderTree, Search, Monitor, StickyNote, Paperclip, Eye, Download,
} from 'lucide-react';
import { fetchRecordContent, downloadRecord } from '../services/recordService';
import { useArchiveStore } from '../stores/archiveStore';
import { useSourceDocumentStore } from '../stores/sourceDocumentStore';
import { useMetadataDisplayStore } from '../stores/metadataDisplayStore';
import { ARCHIVE_ITEM_COLUMN_MAP } from '../config/metadataColumnMaps/archiveItemColumns';
import { VOUCHER_MANAGER_COLUMN_MAP } from '../config/metadataColumnMaps/voucherManagerColumns';
import { getExtFieldDefs } from '../types/sourceDocument';
import { FieldGrid, DetailRows, type FieldItem } from './common/DetailTable';
import type { ArchiveRecord } from '../types';
import type { SourceDocument } from '../types/sourceDocument';

// ── 金额格式化 ──
function fmt(n: number): string {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── 凭证分录（finance-model v2.2 entries JSON，用友BIP同步件） ──
interface VoucherEntry {
  line: number; summary: string; subjectCode: string; subjectName: string;
  debit: number; credit: number;
}
function parseEntries(raw?: string): VoucherEntry[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// ── 四性状态 ──
const ChecksBadge: React.FC<{ checks: { real: boolean; complete: boolean; usable: boolean; safe: boolean } }> = ({ checks }) => {
  const all = checks.real && checks.complete && checks.usable && checks.safe;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
      all ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
    }`}>
      {all ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {all ? '全部通过' : '存在异常'}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════
// L2: 单个原始凭证行（可展开查看完整元数据）
// ═══════════════════════════════════════════════════════════
const SourceDocRow: React.FC<{
  sd: SourceDocument;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ sd, isExpanded, onToggle }) => {
  const extDefs = useMemo(() => getExtFieldDefs(sd.docTypeCode), [sd.docTypeCode]);

  // 展开区字段（FieldGrid 表格化）
  const baseFields: FieldItem[] = [
    { label: '单据编号', value: sd.documentNo, mono: true },
    { label: '凭证类型', value: sd.docTypeName },
    { label: '业务日期', value: sd.transactionDate, mono: true },
    { label: '业务分类', value: sd.businessCategory },
    {
      label: '小写金额',
      value: `¥${fmt(Math.abs(sd.amountLower))}`,
      mono: true,
      valueClassName: sd.amountLower < 0 ? 'text-red-600 font-medium' : 'text-emerald-700 font-medium',
    },
    { label: '大写金额', value: sd.amountUpper },
  ];
  const partyFields: FieldItem[] = [
    { label: '对方单位', value: sd.counterpartyName },
    ...(sd.counterpartyTaxId ? [{ label: '对方税号', value: sd.counterpartyTaxId, mono: true } as FieldItem] : []),
    ...(sd.counterpartyAddress ? [{ label: '地址电话', value: sd.counterpartyAddress } as FieldItem] : []),
    ...(sd.counterpartyBankAccount ? [{ label: '开户行账号', value: sd.counterpartyBankAccount, mono: true } as FieldItem] : []),
  ];
  const extFields: FieldItem[] = extDefs
    .filter(def => {
      const val = sd.extFields?.[def.key];
      return val !== undefined && val !== null && val !== '';
    })
    .map(def => ({
      label: def.label,
      value: String(sd.extFields![def.key]),
      mono: def.dataType === 'number',
    }));

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* 摘要行 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
      >
        {isExpanded
          ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        }
        {/* 附件序号 */}
        <span className="text-[10px] font-mono text-amber-500 bg-amber-50 px-1 rounded shrink-0">
          附{sd.attachmentSequence || '-'}
        </span>
        <span className="text-xs font-semibold text-slate-700 shrink-0">{sd.docTypeName}</span>
        <span className="text-xs text-slate-500 font-mono">{sd.documentNo}</span>
        <span className="flex-1" />
        <span className="text-xs font-mono font-medium text-slate-700">
          ¥{fmt(Math.abs(sd.amountLower))}
        </span>
        <span className="text-[11px] text-slate-400 truncate max-w-[120px]">{sd.counterpartyName}</span>
        {sd.checks.real && sd.checks.complete && sd.checks.usable && sd.checks.safe ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}
      </button>

      {/* 展开详情 */}
      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 space-y-3">
          {/* 所属记账凭证 + 附件序号 */}
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-slate-400">所属凭证：</span>
            <span className="text-slate-700 font-mono font-semibold">{sd.parentVoucherNo}</span>
            <span className="text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded text-[10px]">
              第 {sd.attachmentSequence || 1} 份附件
            </span>
          </div>
          {/* 基础标识 + 金额 */}
          <FieldGrid fields={baseFields} columns={2} />

          {/* 对方主体 */}
          {partyFields.length > 0 && <FieldGrid fields={partyFields} columns={2} />}

          {/* 类型特有扩展字段 */}
          {extFields.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 font-semibold">
                {sd.docTypeName} · 专有字段
              </div>
              <FieldGrid fields={extFields} columns={2} />
            </div>
          )}

          {/* 审批 + 文件 */}
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            {sd.preparer && <span>制单人：{sd.preparer}</span>}
            {sd.reviewer && <span>审核人：{sd.reviewer}</span>}
            <span>附件：{sd.attachmentCount} 张</span>
            {sd.files.length > 0 && <span>电子文件：{sd.files.length} 个</span>}
          </div>

          {/* 文件列表 */}
          {sd.files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sd.files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-600">
                  <FileText className="w-3 h-3 text-slate-400" />
                  {f.name}
                  {f.signatureVerified && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                </span>
              ))}
            </div>
          )}

          {sd.remarks && (
            <div className="text-[10px] text-slate-500 bg-white rounded px-2 py-1.5 border border-slate-100">
              <StickyNote className="w-3 h-3 inline mr-0.5" />{sd.remarks}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// 子组件：旧版 ArchiveRecord 子件行
// ═══════════════════════════════════════════════════════════
const LegacyChildRow: React.FC<{ child: ArchiveRecord }> = ({ child }) => (
  <div className="flex items-center gap-2 px-3 py-2 bg-sky-50/60 border border-sky-200 rounded-lg">
    <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
    <div className="flex-1 min-w-0">
      <div className="text-xs font-medium text-sky-700">{child.voucherNo}</div>
      <div className="text-[10px] text-sky-500">
        {child.archiveType} · ¥{child.amount.toLocaleString()} · {child.archiveCode}
      </div>
      {child.remarks && <div className="text-[10px] text-sky-400 truncate mt-0.5">{child.remarks}</div>}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════
interface RecordDetailPanelProps {
  record: ArchiveRecord;
  onClose: () => void;
  onDelete?: (id: string) => void;
  /** 上下文模式：voucher=记账凭证（核对/组卷），archive=档案条目（财务/项目视图） */
  context?: 'voucher' | 'archive';
}

const RecordDetailPanel: React.FC<RecordDetailPanelProps> = ({ record, onClose, onDelete, context = 'archive' }) => {
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const isVoucher = context === 'voucher';
  // ★ 原始凭证判别（2026-08-18 详情重设计）：上传向导以 archiveType=记账凭证 +
  //   voucherCategory=原始凭证 入池；部分路径 archiveType 直接为原始凭证——两种都认。
  const isSourceDoc = record.voucherCategory === '原始凭证' || (record.archiveType || '').includes('原始凭证');

  // 原始凭证自身附件（上传原件）预览/下载
  const handlePreview = useCallback(async () => {
    try {
      const blob = await fetchRecordContent(record.id);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      alert('预览失败：无法读取附件内容');
    }
  }, [record.id]);
  const handleDownload = useCallback((name: string) => {
    downloadRecord(record.id, name).catch(() => alert('下载失败'));
  }, [record.id]);

  // ── 元数据显示配置 ──
  const metaStore = useMetadataDisplayStore();

  // archive 模式：从 archive-item 上下文读取可见字段
  const visibleArchiveFields = useMemo(() => {
    if (isVoucher) return [];
    const visibleIds = metaStore.getVisibleIds('archive-item');
    return visibleIds
      .filter(id => ARCHIVE_ITEM_COLUMN_MAP[id])
      .map(id => ARCHIVE_ITEM_COLUMN_MAP[id]);
  }, [metaStore.contexts['archive-item']?.fields, isVoucher]);

  // voucher 模式：固定 6 个凭证字段
  const voucherFields = useMemo(() => {
    if (!isVoucher) return [];
    // 按核对工作台默认列顺序
    const ids = ['VOUCHER_NO', 'DATE', 'SUMMARY', 'DEPARTMENT', 'AMOUNT', 'ATTACHMENTS'];
    return ids.filter(id => VOUCHER_MANAGER_COLUMN_MAP[id]).map(id => VOUCHER_MANAGER_COLUMN_MAP[id]);
  }, [isVoucher]);

  // 直接从 store 选数据，避免选函数引用导致的稳定性问题
  const allSourceDocs = useSourceDocumentStore((s) => s.documents);
  const allArchiveRecords = useArchiveStore((s) => s.records);

  // 旧版子件（ArchiveRecord-based，向后兼容）
  const childRecords = useMemo(() => {
    if (!record.childRecordIds || record.childRecordIds.length === 0) return [];
    const idSet = new Set(record.childRecordIds);
    return allArchiveRecords.filter(r => idSet.has(r.id));
  }, [record.childRecordIds, allArchiveRecords]);

  // 富元数据原始凭证列表
  const richSourceDocs = useMemo(() => {
    if (!allSourceDocs || allSourceDocs.length === 0) return [];

    // 优先：通过 sourceDocumentIds 显式查找
    if (record.sourceDocumentIds && record.sourceDocumentIds.length > 0) {
      const idSet = new Set(record.sourceDocumentIds);
      return allSourceDocs.filter(d => idSet.has(d.id));
    }
    // 降级：通过 parentRecordId 反查
    return allSourceDocs.filter(d => d.parentRecordId === record.id);
  }, [record.id, record.sourceDocumentIds, allSourceDocs]);

  const toggleSourceDoc = useCallback((id: string) => {
    setExpandedDocId(prev => prev === id ? null : id);
  }, []);

  const allChecksPass = record.checks.real && record.checks.complete && record.checks.usable && record.checks.safe;

  // ── 凭证分录（v2.2，用友BIP同步件） ──
  const entries = useMemo(() => parseEntries(record.entries), [record.entries]);
  const entryDebitTotal = entries.reduce((s, e) => s + (e.debit || 0), 0);
  const entryCreditTotal = entries.reduce((s, e) => s + (e.credit || 0), 0);

  // ── L1 概要字段（FieldGrid 表格化） ──
  const summaryFields: FieldItem[] = useMemo(() => {
    const out: FieldItem[] = [];
    // ★ 原始凭证版式：展示自身票据信息（不套记账凭证模板，不附加 v2.2 凭证扩展）
    if (isSourceDoc) {
      out.push({ label: '票据号码', value: record.voucherNo, mono: true });
      out.push({ label: '票据类型', value: record.voucherCategory === '原始凭证' ? '原始凭证' : record.voucherCategory || record.archiveType });
      if (record.documentNo) out.push({ label: '单据编号', value: record.documentNo, mono: true });
      if (record.counterpartyName) out.push({ label: '往来单位', value: record.counterpartyName });
      out.push({
        label: '业务日期',
        value: record.voucherDate || (record.year ? `${record.year}-${record.month ? record.month.padStart(2, '0') : '01'}` : ''),
        mono: true,
      });
      out.push({ label: '小写金额', value: `¥${fmt(record.amount)}`, mono: true, valueClassName: 'text-emerald-700 font-medium' });
      if (record.accountSubject) out.push({ label: '会计科目', value: record.accountSubject });
      if (record.preparer) out.push({ label: '制单人', value: record.preparer });
      if (record.department) out.push({ label: '部门', value: record.department });
      out.push({ label: '载体', value: record.carrierType === 'electronic' ? '纯电子' : '纸质数字化' });
      out.push({ label: '组卷状态', value: record.status });
      if (record.volumeCode) out.push({ label: '所属案卷', value: record.volumeCode, mono: true });
      if (record.archiveCode) out.push({ label: '档号', value: record.archiveCode, mono: true });
      if (record.summary) out.push({ label: '摘要', value: record.summary, span: 2 });
      return out;
    }
    if (isVoucher) {
      voucherFields.forEach(col => out.push({ label: col.label, value: col.accessor(record) }));
    } else {
      visibleArchiveFields.forEach(col => out.push({ label: col.label, value: col.accessor(record) }));
      out.push({ label: '组卷状态', value: record.status });
      if (record.volumeCode) out.push({ label: '所属案卷', value: record.volumeCode, mono: true });
      if (record.boxId) out.push({ label: '所属档案盒', value: record.boxId, mono: true });
    }
    // v2.2 凭证扩展字段（有值才显示；用友BIP同步件全量具备）
    if (record.voucherWord) out.push({ label: '凭证字', value: record.voucherWord });
    if (record.period) out.push({ label: '会计期间', value: record.period, mono: true });
    if (record.voucherDate) out.push({ label: '凭证日期', value: record.voucherDate, mono: true });
    if (record.preparer) out.push({ label: '制单人', value: record.preparer });
    if (record.auditor) out.push({ label: '审核人', value: record.auditor });
    if (record.tallyMan) out.push({ label: '记账人', value: record.tallyMan });
    if (record.attachedBillCount != null) out.push({ label: '附单据数', value: `${record.attachedBillCount} 张` });
    if (record.sourceSystem) out.push({ label: '来源系统', value: record.sourceSystem });
    if (record.summary) out.push({ label: '摘要', value: record.summary, span: 2 });
    return out;
  }, [isVoucher, isSourceDoc, voucherFields, visibleArchiveFields, record]);

  return (
    <div className="flex-1 h-full bg-white border-l border-slate-200 overflow-y-auto">
      {/* 顶栏 */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold text-slate-800">{record.voucherNo}</div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              isSourceDoc ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-600'
            }`}>
              {isSourceDoc ? '原始凭证' : '记账凭证'}
            </span>
          </div>
          {isVoucher ? (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              record.status === '已组卷' ? 'bg-emerald-50 text-emerald-600' :
              record.status === '待审核' ? 'bg-sky-50 text-sky-600' :
              'bg-amber-50 text-amber-600'
            }`}>
              {record.status || '未组卷'}
            </span>
          ) : (
            <div className="text-[10px] text-slate-500 font-mono">{record.archiveCode || '—'}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ChecksBadge checks={record.checks} />
          {onDelete && (
            <button
              onClick={() => onDelete(record.id)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* ═══ L1: 凭证/档案条目概要 ═══ */}
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-semibold text-slate-700">
              {isSourceDoc ? '原始凭证信息' : isVoucher ? '记账凭证信息' : '档案条目信息'}
            </span>
            {!isVoucher && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                record.carrierType === 'electronic'
                  ? 'bg-sky-50 text-sky-600'
                  : 'bg-amber-50 text-amber-700'
              }`}>
                {record.carrierType === 'electronic' ? (<span className="inline-flex items-center gap-0.5"><Monitor className="w-3 h-3" /> 纯电子</span>) : (<span className="inline-flex items-center gap-0.5"><FileText className="w-3 h-3" /> 纸质数字化</span>)}
              </span>
            )}
          </div>

          {isVoucher ? (
            /* ★ voucher 模式：凭证字段（凭证号/日期/摘要/部门/金额/附件） */
            <FieldGrid fields={summaryFields} columns={2} />
          ) : (
            /* ★ archive 模式：DA/T 94 元数据字段 + 状态 + v2.2 凭证扩展 */
            <FieldGrid fields={summaryFields} columns={2} />
          )}
          {record.remarks && (
            <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <StickyNote className="w-3 h-3 inline mr-0.5" />{record.remarks}
            </div>
          )}
        </section>

        {/* ═══ L1.5: 凭证分录（v2.2 用友BIP同步件） ═══ */}
        {entries.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileSpreadsheet className="w-4 h-4 text-sky-600" />
              <span className="text-xs font-semibold text-slate-700">凭证分录</span>
              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                {entries.length} 条
              </span>
            </div>
            <DetailRows
              heads={['行号', '摘要', '会计科目', '借方金额', '贷方金额']}
              rows={[
                ...entries.map(e => [
                  String(e.line),
                  e.summary,
                  `${e.subjectCode} ${e.subjectName}`,
                  e.debit ? fmt(e.debit) : '',
                  e.credit ? fmt(e.credit) : '',
                ]),
                ['', '合计', '', fmt(entryDebitTotal), fmt(entryCreditTotal)],
              ]}
              monoCols={[3, 4]}
            />
          </section>
        )}

        {/* ═══ L2: 原始凭证 → 自身电子附件（上传原件）+ OCR 正文 ═══ */}
        {isSourceDoc ? (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Paperclip className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-slate-700">电子附件（上传原件）</span>
              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                {record.components?.length || 0} 份
              </span>
            </div>
            {record.components && record.components.length > 0 ? (
              <div className="space-y-2">
                {record.components.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2.5 bg-white hover:border-sky-200 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-700 truncate" title={c.name}>{c.name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {c.type} · {c.size}{c.contentType ? ` · ${c.contentType.toUpperCase()}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handlePreview}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />预览
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(c.name)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />下载
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-20 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-xs text-slate-400">暂无电子附件</p>
              </div>
            )}

            {/* OCR 双通道识别正文（PDF 文本层 / tesseract） */}
            {record.ocrText && (
              <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOcrOpen(!ocrOpen)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {ocrOpen
                    ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                  OCR 识别正文
                  <span className="text-[10px] text-slate-400 font-normal">{record.ocrText.length} 字</span>
                </button>
                {ocrOpen && (
                  <pre className="px-3 py-2 bg-slate-50/60 border-t border-slate-100 text-[11px] leading-relaxed text-slate-600 whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {record.ocrText}
                  </pre>
                )}
              </div>
            )}
          </section>
        ) : (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-slate-700">
              所附原始凭证
            </span>
            <span className="text-[10px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full">
              附件
            </span>
            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
              {richSourceDocs.length + childRecords.length} 份
            </span>
          </div>

          {richSourceDocs.length === 0 && childRecords.length === 0 ? (
            <div className="flex items-center justify-center h-20 border-2 border-dashed border-slate-200 rounded-xl">
              <div className="text-center">
                <Search className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                <p className="text-xs text-slate-400">暂无原始凭证附件</p>
                <p className="text-[10px] text-slate-300 mt-0.5">原始凭证依附记账凭证存在，不独立归档</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {/* 富元数据原始凭证（主） */}
              {richSourceDocs.map(sd => (
                <SourceDocRow
                  key={sd.id}
                  sd={sd}
                  isExpanded={expandedDocId === sd.id}
                  onToggle={() => toggleSourceDoc(sd.id)}
                />
              ))}

              {/* 旧版子件（兼容） */}
              {childRecords.map(child => (
                <LegacyChildRow key={child.id} child={child} />
              ))}
            </div>
          )}
        </section>
        )}

        {/* ═══ 四性检测详情 ═══ */}
        {record.checkDetails && record.checkDetails.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">四性检测详情</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {record.checkDetails.map((d, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  d.status === 'passed' ? 'bg-emerald-50 text-emerald-700' :
                  d.status === 'warning' ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-600'
                }`}>
                  {d.status === 'passed' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> :
                   <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                  <div className="text-xs">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-[10px] opacity-70">{d.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ 审计日志 ═══ */}
        {record.auditLogs && record.auditLogs.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FolderTree className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">操作日志</span>
            </div>
            <div className="space-y-1.5">
              {record.auditLogs.slice(0, 5).map((log, i) => (
                <div key={log.id || i} className="flex items-center gap-2 text-[11px] text-slate-600">
                  <span className="text-slate-400 font-mono shrink-0 w-16">{log.timestamp?.slice(0, 16)}</span>
                  <span className="font-medium">{log.action}</span>
                  <span className="text-slate-400">— {log.operator}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default RecordDetailPanel;



