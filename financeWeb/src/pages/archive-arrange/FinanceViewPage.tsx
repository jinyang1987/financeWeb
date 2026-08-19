/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * FinanceViewPage — 财务分类视图（2026-07-18 重构）
 *
 * 统一「案卷盒层级浏览」：
 *   L1 案卷盒列表 → L2 盒内卷件列表 → L3 档案详情（分栏）
 *   详情返回 → 回到当前盒内卷件列表（L2），不跳回盒总列表（L1）
 *
 * 筛选联动（字段级，非关键词匹配）：
 *   KP 凭证：季度/月份（含全部）+ 凭证类型 + 关联原始凭证类型
 *   KB 账簿：账簿类型 Tab（总账/明细账/日记账/辅助账簿）
 *   FB 报表：报表分类 + 报表期间（合并同一筛选区域）+ 统计卡片联动
 *   QT 其他：子类型 Tab
 *   筛选实时作用于盒内件、盒列表件数统计与页头统计条数。
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Filter, X, ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle,
  CalendarRange, Layers, BookOpen, FileSpreadsheet, Package, Paperclip,
} from 'lucide-react';
import { useArchiveStore, ARCHIVE_TYPE_NAME_MAP } from '../../stores/archiveStore';
import { useSourceDocumentStore } from '../../stores/sourceDocumentStore';
import { SOURCE_DOC_TYPE_TREE } from '../../types/sourceDocument';
import { ArchiveBoxTreeView } from '../../components/ArchiveBoxTreeView';
import RecordDetailPanel from '../../components/RecordDetailPanel';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { ARCHIVE_SUB_CATEGORY_MAP } from '../../DirectoryConfigContext';
import { useBoxViewData } from '../../hooks/useBoxViewData';
import type { ArchiveRecord } from '../../types';

interface FinanceViewPageProps {
  archiveTypeCode: string;
  archiveTypeName: string;
  archiveYear: string;
  setActiveFileIndex: (idx: number) => void;
}

const QUARTERS = [
  { id: 'Q1', name: '一季度', months: [1, 2, 3] },
  { id: 'Q2', name: '二季度', months: [4, 5, 6] },
  { id: 'Q3', name: '三季度', months: [7, 8, 9] },
  { id: 'Q4', name: '四季度', months: [10, 11, 12] },
];

const VOUCHER_CATEGORY_OPTIONS = ['收款凭证', '付款凭证', '转账凭证', '通用记账凭证'];
const ORIGINAL_CATEGORY_OPTIONS = [
  { key: 'external', label: '外来原始凭证' },
  { key: 'internal', label: '自制原始凭证' },
  { key: 'special', label: '原始凭证附件' },
];

const REPORT_CATEGORY_OPTIONS = ['法定对外', '内部管理', '专项报告'];
const REPORT_PERIOD_OPTIONS = ['月度', '季度', '年度'];

const FinanceViewPage: React.FC<FinanceViewPageProps> = ({
  archiveTypeCode, archiveTypeName, archiveYear, setActiveFileIndex,
}) => {
  const records = useArchiveStore((s) => s.records);
  const sourceDocuments = useSourceDocumentStore((s) => s.documents);

  // ── 导航状态：L1 盒列表 → L2 盒内卷件 → L3 详情分栏 ──
  const [focusedBoxId, setFocusedBoxId] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<ArchiveRecord | null>(null);

  // ── 页内筛选状态（字段级） ──
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [activeVoucherCategories, setActiveVoucherCategories] = useState<Set<string>>(new Set());
  const [activeOriginalCategories, setActiveOriginalCategories] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSubType, setSelectedSubType] = useState<string | null>(null);
  const [selectedReportCategory, setSelectedReportCategory] = useState<string | null>(null);
  const [selectedReportPeriod, setSelectedReportPeriod] = useState<string | null>(null);

  const displayTitle = archiveTypeName || ARCHIVE_TYPE_NAME_MAP[archiveTypeCode] || '财务分类视图';
  const isVoucher = archiveTypeCode === 'KP';
  const isReport = archiveTypeCode === 'FB';

  const subTypeOptions = useMemo(() => {
    const typeName = ARCHIVE_TYPE_NAME_MAP[archiveTypeCode] || archiveTypeName;
    return Object.keys(ARCHIVE_SUB_CATEGORY_MAP[typeName] || {});
  }, [archiveTypeCode, archiveTypeName]);

  // ── 字段级筛选谓词（盒内件、统计、盒列表共用同一口径） ──
  const recordFilter = useMemo(() => {
    const predicates: ((r: ArchiveRecord) => boolean)[] = [];

    if (isVoucher) {
      if (selectedMonth !== null) {
        predicates.push((r) => parseInt(r.month, 10) === selectedMonth);
      } else if (selectedQuarter) {
        const q = QUARTERS.find((x) => x.id === selectedQuarter);
        if (q) predicates.push((r) => q.months.includes(parseInt(r.month, 10)));
      }
      if (activeVoucherCategories.size > 0) {
        predicates.push((r) => !!r.voucherCategory && activeVoucherCategories.has(r.voucherCategory));
      }
      if (activeOriginalCategories.size > 0) {
        const docById = new Map(sourceDocuments.map((d) => [d.id, d]));
        // docTypeCode → 大类（external/internal/special），沿类型树（含子节点）构建
        const typeCategoryMap = new Map<string, string>();
        SOURCE_DOC_TYPE_TREE.forEach((top) => {
          typeCategoryMap.set(top.code, top.category);
          (top.children || []).forEach((c) => typeCategoryMap.set(c.code, c.category));
        });
        predicates.push((r) =>
          (r.sourceDocumentIds || []).some((id) => {
            const doc = docById.get(id);
            const cat = doc ? typeCategoryMap.get(doc.docTypeCode) : undefined;
            return !!cat && activeOriginalCategories.has(cat);
          }),
        );
      }
    } else if (isReport) {
      if (selectedReportCategory) predicates.push((r) => r.reportCategory === selectedReportCategory);
      if (selectedReportPeriod) predicates.push((r) => r.reportPeriod === selectedReportPeriod);
    } else {
      if (selectedSubType) predicates.push((r) => r.subType === selectedSubType);
    }

    if (predicates.length === 0) return undefined;
    return (r: ArchiveRecord) => predicates.every((p) => p(r));
  }, [
    isVoucher, isReport, selectedQuarter, selectedMonth,
    activeVoucherCategories, activeOriginalCategories, sourceDocuments,
    selectedSubType, selectedReportCategory, selectedReportPeriod,
  ]);

  // ── 盒→件 数据装配（筛选已应用） ──
  const { entries, totalMatched } = useBoxViewData(
    archiveTypeCode,
    archiveYear || undefined,
    recordFilter,
  );

  // ── 报表统计卡片（联动筛选结果） ──
  const reportStats = useMemo(() => {
    if (!isReport) return null;
    const all = entries.flatMap((e) => e.matchedItems);
    return {
      monthly: all.filter((r) => r.reportPeriod === '月度').length,
      quarterly: all.filter((r) => r.reportPeriod === '季度').length,
      annual: all.filter((r) => r.reportPeriod === '年度').length,
      total: all.length,
    };
  }, [isReport, entries]);

  const currentQuarterMonths = useMemo(
    () => QUARTERS.find((q) => q.id === selectedQuarter)?.months || [],
    [selectedQuarter],
  );

  const hasActiveFilters =
    selectedQuarter !== null || selectedMonth !== null ||
    activeVoucherCategories.size > 0 || activeOriginalCategories.size > 0 ||
    selectedSubType !== null || selectedReportCategory !== null || selectedReportPeriod !== null;

  const clearAllFilters = useCallback(() => {
    setSelectedQuarter(null);
    setSelectedMonth(null);
    setActiveVoucherCategories(new Set());
    setActiveOriginalCategories(new Set());
    setSelectedSubType(null);
    setSelectedReportCategory(null);
    setSelectedReportPeriod(null);
  }, []);

  const toggleSetFilter = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── L3 详情：进入 / 返回（返回到当前盒内卷件列表 L2） ──
  const handleOpenDetail = useCallback((row: ArchiveRecord) => {
    setSelectedRecord(row);
    setActiveFileIndex(0);
  }, [setActiveFileIndex]);

  const handleCloseDetail = useCallback(() => setSelectedRecord(null), []);

  // 当前盒的筛选后件（L2/L3 共用）
  const focusedEntry = useMemo(
    () => entries.find((e) => e.box.id === focusedBoxId) || null,
    [entries, focusedBoxId],
  );

  // ══════════════════════════════════════════════════
  // 筛选 UI 块
  // ══════════════════════════════════════════════════
  const filterBar = (
    <>
      {/* 凭证：季度/月份选择器 */}
      {isVoucher && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4">
          <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center">
            <div className="flex gap-2">
              <button
                onClick={() => { setSelectedQuarter(null); setSelectedMonth(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${selectedQuarter === null ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
              >全部</button>
              {QUARTERS.map((q) => (
                <button
                  key={q.id}
                  onClick={() => { setSelectedQuarter(q.id); setSelectedMonth(null); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${selectedQuarter === q.id ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                >{q.name}</button>
              ))}
            </div>
            {selectedQuarter && (
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={() => setSelectedMonth(null)}
                  className={`h-10 px-3 rounded-lg text-sm font-medium transition-all cursor-pointer ${selectedMonth === null ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >全季</button>
                {currentQuarterMonths.map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedMonth(m)}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-all cursor-pointer ${selectedMonth === m ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >{m}月</button>
                ))}
              </div>
            )}
            <div className="text-sm text-slate-500 ml-auto">
              <span className="px-3 py-1 bg-slate-700 text-white rounded-lg font-medium text-xs">
                {entries.length} 盒 · {totalMatched} 件
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 报表：统计卡片（联动筛选） */}
      {isReport && reportStats && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: '月度报表', count: reportStats.monthly, Icon: CalendarRange, color: 'border-sky-200 bg-sky-50', textColor: 'text-sky-700', iconColor: 'text-sky-500' },
            { label: '季度报表', count: reportStats.quarterly, Icon: BookOpen, color: 'border-amber-200 bg-amber-50', textColor: 'text-amber-700', iconColor: 'text-amber-500' },
            { label: '年度报表', count: reportStats.annual, Icon: Layers, color: 'border-emerald-200 bg-emerald-50', textColor: 'text-emerald-700', iconColor: 'text-emerald-500' },
            { label: '合计', count: reportStats.total, Icon: Package, color: 'border-slate-300 bg-slate-100', textColor: 'text-slate-700', iconColor: 'text-slate-500' },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border ${card.color} p-4 flex items-center gap-3`}>
              <div className="w-10 h-10 rounded-lg bg-white/70 flex items-center justify-center shadow-sm">
                <card.Icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${card.textColor}`}>{card.count}</div>
                <div className="text-xs text-slate-500">{card.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 报表：分类 + 期间 合并筛选区域 */}
      {isReport && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-slate-500 mb-2">报表分类</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  onClick={() => setSelectedReportCategory(null)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${!selectedReportCategory ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                >全部</span>
                {REPORT_CATEGORY_OPTIONS.map((cat) => (
                  <span
                    key={cat}
                    onClick={() => setSelectedReportCategory(cat === selectedReportCategory ? null : cat)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${selectedReportCategory === cat ? 'bg-sky-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                  >{cat}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 mb-2">报表期间</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  onClick={() => setSelectedReportPeriod(null)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${!selectedReportPeriod ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                >全部</span>
                {REPORT_PERIOD_OPTIONS.map((p) => (
                  <span
                    key={p}
                    onClick={() => setSelectedReportPeriod(p === selectedReportPeriod ? null : p)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${selectedReportPeriod === p ? 'bg-sky-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                  >{p}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
            {entries.length} 盒 · 共 {totalMatched} 份报表{hasActiveFilters ? '（已筛选）' : ''} · 分类与期间可交叉筛选
          </div>
        </div>
      )}

      {/* 账簿/其他：子类型 Tab */}
      {!isVoucher && !isReport && subTypeOptions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              onClick={() => setSelectedSubType(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${!selectedSubType ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
            >全部</span>
            {subTypeOptions.map((st) => (
              <span
                key={st}
                onClick={() => setSelectedSubType(st === selectedSubType ? null : st)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${selectedSubType === st ? 'bg-sky-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
              >{st}</span>
            ))}
            <span className="ml-auto text-xs text-slate-400">
              {entries.length} 盒 · 共 {totalMatched} 条{hasActiveFilters ? '（已筛选）' : ''}
            </span>
          </div>
        </div>
      )}

      {/* 凭证：子类型筛选栏（凭证类型 + 关联原始凭证类型） */}
      {isVoucher && showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">凭证筛选条件</span>
            {(activeVoucherCategories.size > 0 || activeOriginalCategories.size > 0) && (
              <button
                type="button"
                onClick={() => { setActiveVoucherCategories(new Set()); setActiveOriginalCategories(new Set()); }}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 cursor-pointer"
              ><X className="w-3 h-3" /> 清除全部</button>
            )}
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-2">记账凭证类型</div>
            <div className="flex flex-wrap gap-1.5">
              {VOUCHER_CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleSetFilter(setActiveVoucherCategories, cat)}
                  className={`px-3 py-1 text-xs rounded-full transition-all cursor-pointer border ${activeVoucherCategories.has(cat) ? 'bg-sky-100 text-sky-700 border-sky-300 font-medium' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >{cat}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-2">关联原始凭证类型</div>
            <div className="flex flex-wrap gap-1.5">
              {ORIGINAL_CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleSetFilter(setActiveOriginalCategories, opt.key)}
                  className={`px-3 py-1 text-xs rounded-full transition-all cursor-pointer border ${activeOriginalCategories.has(opt.key) ? 'bg-emerald-100 text-emerald-700 border-emerald-300 font-medium' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                >{opt.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ══════════════════════════════════════════════════
  // L3：详情分栏视图（左：当前盒卷件列表 / 右：详情面板）
  // ══════════════════════════════════════════════════
  if (selectedRecord) {
    const listItems = focusedEntry?.matchedItems || [];
    return (
      <div className="flex-1 flex overflow-hidden animate-in fade-in duration-200">
        <div className="w-[280px] min-w-[240px] flex flex-col border-r border-slate-200 bg-white">
          <div className="shrink-0 px-4 py-3 border-b border-slate-100">
            <button
              onClick={handleCloseDetail}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-sky-50 hover:text-sky-700 hover:border-sky-300 transition-all shadow-sm mb-2.5"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              返回盒内列表
            </button>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-slate-800 truncate">{focusedEntry?.box.boxNo || displayTitle}</h3>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {focusedEntry ? `${focusedEntry.box.boxName} · ${listItems.length} 件` : `${listItems.length} 条${displayTitle}`}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {listItems.map((rec) => {
              const isActive = rec.id === selectedRecord.id;
              const allOk = rec.checks.real && rec.checks.complete && rec.checks.usable && rec.checks.safe;
              return (
                <button
                  key={rec.id}
                  onClick={() => handleOpenDetail(rec)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors ${
                    isActive
                      ? 'bg-sky-50 border-l-[3px] border-l-sky-500'
                      : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-semibold ${isActive ? 'text-sky-700' : 'text-slate-800'}`}>
                      {rec.voucherNo}
                    </span>
                    {allOk ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    {rec.amount > 0 && (
                      <><span className="font-mono text-slate-600">¥{rec.amount.toLocaleString()}</span><span className="text-slate-300">·</span></>
                    )}
                    <span>{rec.department}</span>
                    {isVoucher && <><span className="text-slate-300">·</span><span>{parseInt(rec.month, 10)}月</span></>}
                    {!isVoucher && <><span className="text-slate-300">·</span><span>{rec.year}年</span></>}
                  </div>
                  {isVoucher && ((rec.sourceDocumentIds?.length || 0) > 0 || (rec.childRecordIds?.length || 0) > 0) && (
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                      <Paperclip className="w-3 h-3" />
                      {(rec.sourceDocumentIds?.length || 0) + (rec.childRecordIds?.length || 0)} 件原始凭证
                    </div>
                  )}
                </button>
              );
            })}
            {listItems.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-slate-400">当前盒内暂无符合筛选条件的档案</div>
            )}
          </div>
        </div>

        <ErrorBoundary>
          <RecordDetailPanel
            context="archive"
            record={selectedRecord}
            onClose={handleCloseDetail}
          />
        </ErrorBoundary>
      </div>
    );
  }

  // ══════════════════════════════════════════════════
  // L1 / L2：盒列表 / 盒内卷件
  // ══════════════════════════════════════════════════
  return (
    <div className="flex-1 overflow-auto animate-in fade-in duration-200 p-6 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-800">{displayTitle}</h2>
          {archiveYear && <><ChevronRight className="w-4 h-4 text-slate-300" /><span className="text-sm font-medium text-slate-500">{archiveYear}</span></>}
          {!archiveYear && <span className="text-sm text-slate-400">（全部年份）</span>}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full hover:bg-amber-200 transition-colors cursor-pointer"
              title="点击清除全部筛选"
            >已筛选 <X className="w-3 h-3 inline ml-0.5" /></button>
          )}
        </div>
        {isVoucher && (
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${showFilters || activeVoucherCategories.size > 0 || activeOriginalCategories.size > 0 ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <Filter className="w-4 h-4" /><span>筛选</span>
          </button>
        )}
      </div>
      <div className="shrink-0">{filterBar}</div>
      <div className="flex-1 min-h-0 flex flex-col">
        <ArchiveBoxTreeView
          entries={entries}
          focusedBoxId={focusedBoxId}
          onFocusBox={setFocusedBoxId}
          onItemClick={handleOpenDetail}
          archiveTypeCode={archiveTypeCode}
        />
      </div>
    </div>
  );
};

export default FinanceViewPage;

