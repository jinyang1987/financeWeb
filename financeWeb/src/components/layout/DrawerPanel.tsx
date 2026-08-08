﻿﻿﻿﻿﻿﻿﻿import React, { useMemo } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, FolderTree, ChevronRight, BookOpen, FileText, FileSpreadsheet, Monitor, Pin } from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import { useSourceDocumentStore } from '../../stores/sourceDocumentStore';
import { useMetadataDisplayStore } from '../../stores/metadataDisplayStore';
import { ARCHIVE_ITEM_COLUMN_MAP } from '../../config/metadataColumnMaps/archiveItemColumns';
import { FieldGrid, DetailRows, type FieldItem } from '../common/DetailTable';
import { InteractivePreview } from '../InteractivePreview';
import { AuditTimeline } from '../AuditTimeline';
import type { ArchiveRecord } from '../../types';

// ── 凭证分录（finance-model v2.2，用友BIP同步件） ──
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
const fmtMoney = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── 父子件关联子组件（增强版：同时展示旧的 ArchiveRecord 子件 + 新的 SourceDocument 原始凭证） ──
const RelatedRecordsSection: React.FC<{ record: ArchiveRecord }> = ({ record }) => {
  const records = useArchiveStore((s) => s.records);
  const getByIds = useSourceDocumentStore((s) => s.getByIds);
  const getByParentId = useSourceDocumentStore((s) => s.getByParentId);

  const parentRecord = useMemo(() => {
    if (!record.parentRecordId) return null;
    return records.find((r) => r.id === record.parentRecordId) || null;
  }, [record.parentRecordId, records]);

  // 旧版子件（ArchiveRecord-based，向后兼容）
  const childRecords = useMemo(() => {
    if (!record.childRecordIds || record.childRecordIds.length === 0) return [];
    return records.filter((r) => record.childRecordIds!.includes(r.id));
  }, [record.childRecordIds, records]);

  // 新版富元数据原始凭证 — 优先 sourceDocumentIds，降级到 parentRecordId 反查
  const richSourceDocs = useMemo(() => {
    if (record.sourceDocumentIds && record.sourceDocumentIds.length > 0) {
      return getByIds(record.sourceDocumentIds);
    }
    // 降级：通过 parentRecordId 反查（兼容未显式声明 sourceDocumentIds 的旧数据）
    return getByParentId(record.id);
  }, [record.id, record.sourceDocumentIds, getByIds, getByParentId]);

  const totalChildren = childRecords.length + richSourceDocs.length;

  if (!parentRecord && totalChildren === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <FolderTree className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-semibold text-slate-700">卷件关联</span>
        {totalChildren > 0 && (
          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
            {totalChildren} 件附件
          </span>
        )}
      </div>

      <div className="space-y-2">
        {/* 父件 */}
        {parentRecord && (
          <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 border border-sky-200 rounded-lg">
            <span className="text-xs text-sky-500 font-medium shrink-0">父件</span>
            <ChevronRight className="w-3 h-3 text-sky-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-sky-700 truncate">{parentRecord.voucherNo}</div>
              <div className="text-xs text-sky-500">{parentRecord.archiveType} | {parentRecord.archiveCode}</div>
            </div>
          </div>
        )}

        {/* 旧版子件（ArchiveRecord 类型的原始凭证） */}
        {childRecords.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs text-slate-500 font-medium">
              关联档案 ({childRecords.length})
            </div>
            {childRecords.map((child) => (
              <div
                key={child.id}
                className="flex items-center gap-2 px-3 py-2 bg-sky-50 border border-sky-200 rounded-lg"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-sky-700 truncate">{child.voucherNo}</div>
                  <div className="text-xs text-sky-500">
                    {child.archiveType} | ¥{child.amount.toLocaleString()} | {child.archiveCode}
                  </div>
                  {child.remarks && (
                    <div className="text-[10px] text-sky-400 mt-0.5 truncate">{child.remarks}</div>
                  )}
                </div>
                <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${
                  child.components.every(c => c.signatureVerified)
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {child.components.every(c => c.signatureVerified) ? '签名有效' : '待验签'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 新版富元数据原始凭证（SourceDocument 类型） */}
        {richSourceDocs.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <FileSpreadsheet className="w-3 h-3 text-emerald-500" />
              <span className="text-xs text-slate-500 font-medium">
                原始凭证 ({richSourceDocs.length})
              </span>
            </div>
            {richSourceDocs.map((sd) => (
              <div
                key={sd.id}
                className="flex items-start gap-2 px-3 py-2 bg-emerald-50/60 border border-emerald-200 rounded-lg"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-emerald-800">{sd.docTypeName}</span>
                    <span className="text-[10px] text-emerald-500 font-mono">{sd.documentNo}</span>
                  </div>
                  <div className="text-[11px] text-emerald-600 mt-0.5">
                    {sd.counterpartyName} · ¥{Math.abs(sd.amountLower).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-0.5 line-clamp-1">{sd.summary}</div>
                </div>
                {sd.checks.real && sd.checks.complete && sd.checks.usable && sd.checks.safe ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface DrawerPanelProps {
  onRepairUsability: (recordId: string) => void;
  triggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

const DrawerPanel: React.FC<DrawerPanelProps> = ({ onRepairUsability, triggerToast }) => {
  const drawerVisible = useArchiveStore((s) => s.drawerVisible);
  const activeRecord = useArchiveStore((s) => s.activeRecord);
  const activeFileIndex = useArchiveStore((s) => s.activeFileIndex);
  const closeDrawer = useArchiveStore((s) => s.closeDrawer);
  const setActiveFileIndex = useArchiveStore((s) => s.setActiveFileIndex);

  // ── 元数据显示配置（archive-item 上下文） ──
  const metaStore = useMetadataDisplayStore();
  const visibleMetaFields = useMemo(() => {
    const visibleIds = metaStore.getVisibleIds('archive-item');
    return visibleIds
      .filter(id => ARCHIVE_ITEM_COLUMN_MAP[id])
      .map(id => ARCHIVE_ITEM_COLUMN_MAP[id]);
  }, [metaStore.contexts['archive-item']?.fields]);

  if (!drawerVisible || !activeRecord) return null;

  const allChecksPass =
    activeRecord.checks.real &&
    activeRecord.checks.complete &&
    activeRecord.checks.usable &&
    activeRecord.checks.safe;

  const handleRepairClick = () => {
    if (!activeRecord.checks.usable) {
      onRepairUsability(activeRecord.id);
    } else {
      triggerToast('该凭证四项检测已全部通过，无需修复', 'info');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40 flex justify-end font-sans"
      onClick={closeDrawer}
    >
      <div
        className="w-[960px] max-w-[92vw] bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs text-slate-400 font-medium block">凭证详情信息</span>
                {/* 来源标识徽章 */}
                {activeRecord.carrierType === 'electronic' || activeRecord.source === 'digital-native' ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                    <Monitor className="w-3 h-3" /> 纯电子文件
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <FileText className="w-3 h-3" /> 纸质数字化副本
                  </span>
                )}
              </div>
              <span className="font-bold text-slate-800 text-sm">{activeRecord.voucherNo}</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-mono font-bold text-slate-500">
            ID: {activeRecord.id}
          </span>
          <button
            type="button"
            onClick={closeDrawer}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrolling drawer content */}
        <div className="flex-1 overflow-y-auto space-y-6 p-6">
          {/* ★ 件级元数据 — 从元数据显示配置动态渲染（FieldGrid 表格化 2026-08-08） */}
          {(() => {
            const fields: FieldItem[] = visibleMetaFields.map(col => ({
              label: col.label, value: col.accessor(activeRecord), mono: true,
            }));
            // v2.2 凭证扩展字段（用友BIP同步件具备）
            if (activeRecord.voucherWord) fields.push({ label: '凭证字', value: activeRecord.voucherWord });
            if (activeRecord.period) fields.push({ label: '会计期间', value: activeRecord.period, mono: true });
            if (activeRecord.voucherDate) fields.push({ label: '凭证日期', value: activeRecord.voucherDate, mono: true });
            if (activeRecord.preparer) fields.push({ label: '制单人', value: activeRecord.preparer });
            if (activeRecord.auditor) fields.push({ label: '审核人', value: activeRecord.auditor });
            if (activeRecord.tallyMan) fields.push({ label: '记账人', value: activeRecord.tallyMan });
            if (activeRecord.attachedBillCount != null) fields.push({ label: '附单据数', value: `${activeRecord.attachedBillCount} 张` });
            if (activeRecord.sourceSystem) fields.push({ label: '来源系统', value: activeRecord.sourceSystem });
            if (activeRecord.summary) fields.push({ label: '摘要', value: activeRecord.summary, span: 2 });
            return <FieldGrid fields={fields} columns={2} />;
          })()}

          {/* 凭证分录（v2.2 用友BIP同步件） */}
          {(() => {
            const entries = parseEntries(activeRecord.entries);
            if (entries.length === 0) return null;
            const dt = entries.reduce((s, e) => s + (e.debit || 0), 0);
            const ct = entries.reduce((s, e) => s + (e.credit || 0), 0);
            return (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-semibold text-slate-700">凭证分录</span>
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{entries.length} 条</span>
                </div>
                <DetailRows
                  heads={['行号', '摘要', '会计科目', '借方金额', '贷方金额']}
                  rows={[
                    ...entries.map(e => [
                      String(e.line), e.summary, `${e.subjectCode} ${e.subjectName}`,
                      e.debit ? fmtMoney(e.debit) : '', e.credit ? fmtMoney(e.credit) : '',
                    ]),
                    ['', '合计', '', fmtMoney(dt), fmtMoney(ct)],
                  ]}
                  monoCols={[3, 4]}
                />
              </div>
            );
          })()}

          {/* 盒/卷级元数据（仅纸质数字化档案显示） */}
          {(activeRecord.carrierType === 'paper' || activeRecord.source === 'digitized') && (
            <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-semibold text-amber-800">盒·卷级元数据（关联实体档案盒/案卷）</span>
                <span className="text-[10px] text-amber-500 bg-amber-100 px-1.5 py-0.5 rounded-full">按卷管理</span>
              </div>
              <FieldGrid
                columns={2}
                fields={[
                  { label: '所属档案盒', value: activeRecord.boxId, mono: true },
                  { label: '案卷档号', value: activeRecord.volumeCode, mono: true },
                  { label: '卷内件号', value: activeRecord.volumeItemNo ? `第 ${activeRecord.volumeItemNo} 件` : null },
                  { label: '纸质页号', value: activeRecord.pageNo ? `第 ${activeRecord.pageNo} 页` : null },
                ]}
              />
              <div className="mt-2 px-3 py-1.5 bg-amber-100/50 border border-amber-100 rounded-lg">
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  <Pin className="w-3 h-3 inline mr-0.5 shrink-0" />此电子件来源于纸质原件扫描数字化，纸质原件已组卷装盒保存于实体库房。
                  电子件通过盒→卷→件三级层级与实体档案建立双向关联。
                </p>
              </div>
            </div>
          )}

          {/* 父子件关联 */}
          <RelatedRecordsSection record={activeRecord} />

          {/* Live Preview interactive widget */}
          <InteractivePreview
            record={activeRecord}
            activeFileIndex={activeFileIndex}
            onActiveFileChange={setActiveFileIndex}
            onRepairUsability={onRepairUsability}
            onForceClose={closeDrawer}
          />

          {/* Life-cycle Timeline Logs */}
          <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-200">
            <AuditTimeline logs={activeRecord.auditLogs} />
          </div>
        </div>

        {/* Bottom actions inside drawer */}
        <div className="border-t border-slate-100 shrink-0 flex justify-end gap-2 text-xs px-6 py-4 bg-white">
          <button
            type="button"
            onClick={closeDrawer}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl font-bold cursor-pointer text-slate-700"
          >
            关闭查看
          </button>
          <button
            type="button"
            disabled={allChecksPass}
            onClick={handleRepairClick}
            className={`px-4 py-2 text-white font-bold rounded-xl shadow-xs cursor-pointer ${
              allChecksPass
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-sky-600 hover:bg-sky-700'
            }`}
          >
            一键自动修复凭证
          </button>
        </div>
      </div>
    </div>
  );
};

export default DrawerPanel;



