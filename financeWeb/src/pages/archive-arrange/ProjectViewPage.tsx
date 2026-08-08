import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useArchiveStore, ARCHIVE_TYPE_NAME_MAP } from '../../stores/archiveStore';
import { useDirectoryConfig } from '../../DirectoryConfigContext';
import { useMetadataDisplayStore } from '../../stores/metadataDisplayStore';
import { getArchiveItemColumns, getArchiveItemDefaultColumns } from '../../config/metadataColumnMaps/archiveItemColumns';
import {
  getAllFieldIds,
  getDefaultVisibleIds,
} from '../../config/metadataContexts';
import { ArchiveTable } from '../../components/ArchiveTable';
import RecordDetailPanel from '../../components/RecordDetailPanel';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import type { ArchiveRecord } from '../../types';

interface ProjectViewPageProps {
  projectCode: string;
  projectName: string;
  archiveYear: string;
  toggleRowSelect: (id: string) => void;
  toggleSelectAll: () => void;
  handleOpenDrawer: (row: ArchiveRecord) => void;
  setActiveFileIndex: (idx: number) => void;
  handleDeleteRecord: (id: string, e: React.MouseEvent) => void;
}

const ARCHIVE_TYPE_OPTIONS = [
  { key: 'KP', label: '会计凭证' }, { key: 'KB', label: '会计账簿' },
  { key: 'FB', label: '财务报表' }, { key: 'QT', label: '其他会计资料' },
];

const ProjectViewPage: React.FC<ProjectViewPageProps> = ({
  projectCode, projectName, archiveYear,
  toggleRowSelect, toggleSelectAll, handleOpenDrawer, setActiveFileIndex, handleDeleteRecord,
}) => {
  const navigate = useNavigate();
  const store = useArchiveStore();
  const metaStore = useMetadataDisplayStore();
  const { config: dirConfig } = useDirectoryConfig();

  // ── 表格列（从 archive-item 上下文配置读取） ──
  const archiveItemFieldIds = useMemo(() => getAllFieldIds('archive-item'), []);
  const archiveItemDefaultIds = useMemo(() => getDefaultVisibleIds('archive-item'), []);

  useEffect(() => {
    metaStore.initContext('archive-item', archiveItemFieldIds, archiveItemDefaultIds);
  }, [metaStore.initContext, archiveItemFieldIds, archiveItemDefaultIds]);

  const tableColumns = useMemo(() => {
    const visibleIds = metaStore.getVisibleIds('archive-item');
    if (visibleIds.length === 0) return getArchiveItemDefaultColumns();
    return getArchiveItemColumns(visibleIds);
  }, [metaStore.contexts['archive-item']?.fields]);

  const [selectedArchiveType, setSelectedArchiveType] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<ArchiveRecord | null>(null);

  const enabledYears = useMemo(() =>
    dirConfig.years.filter(y => y.enabled).sort((a, b) => b.year - a.year),
  [dirConfig]);

  const displayTitle = projectName || '项目分类视图';

  const displayRecords = useMemo(() => {
    let records = store.voucherRecords || [];
    if (archiveYear) records = records.filter(r => r.year === archiveYear);
    if (selectedArchiveType) {
      const typeName = ARCHIVE_TYPE_NAME_MAP[selectedArchiveType] || '';
      if (typeName) records = records.filter(r => r.archiveType === typeName);
    }
    return records;
  }, [store.voucherRecords, archiveYear, selectedArchiveType]);

  const handleYearClick = (year?: number) => {
    const params = new URLSearchParams();
    params.set('project', projectCode);
    params.set('name', projectName);
    if (year) params.set('year', String(year));
    navigate(`/project-query?${params.toString()}`, { replace: true });
  };

  const handleOpenDetail = useCallback((row: ArchiveRecord) => {
    setSelectedRecord(row);
    setActiveFileIndex(0);
  }, [setActiveFileIndex]);

  const handleCloseDetail = useCallback(() => setSelectedRecord(null), []);
  const handleDeleteWrapped = useCallback((id: string, e: React.MouseEvent) => {
    handleDeleteRecord(id, e);
    if (selectedRecord?.id === id) setSelectedRecord(null);
  }, [handleDeleteRecord, selectedRecord]);

  // ═══════════════════════════════════════
  // 筛选栏（复用）
  // ═══════════════════════════════════════
  const filterBar = (
    <>
      {enabledYears.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4">
          <div className="text-xs font-medium text-slate-500 mb-2">年份筛选</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span onClick={() => handleYearClick()}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${!archiveYear ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>全部年份</span>
            {enabledYears.map(y => (
              <span key={y.id} onClick={() => handleYearClick(y.year)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${String(y.year) === archiveYear ? 'bg-sky-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
              >{y.year}年</span>
            ))}
          </div>
        </div>
      )}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4">
        <div className="text-xs font-medium text-slate-500 mb-2">档案分类</div>
        <div className="flex items-center gap-2 flex-wrap">
          <span onClick={() => setSelectedArchiveType(null)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${!selectedArchiveType ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>全部分类</span>
          {ARCHIVE_TYPE_OPTIONS.map(type => (
            <span key={type.key} onClick={() => setSelectedArchiveType(type.key === selectedArchiveType ? null : type.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${selectedArchiveType === type.key ? 'bg-sky-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
            >{type.label}</span>
          ))}
        </div>
        <div className="text-xs text-slate-400 mt-2">共 {displayRecords.length} 条记录</div>
      </div>
    </>
  );

  const mainTable = (
    <ArchiveTable
      filteredRecords={displayRecords}
      selectedRecordIds={store.selectedRecordIds}
      selectedNode={store.selectedNode}
      toggleRowSelect={toggleRowSelect}
      toggleSelectAll={() => store.toggleSelectAll(displayRecords.map(r => r.id))}
      handleOpenDrawer={handleOpenDetail}
      setActiveFileIndex={setActiveFileIndex}
      handleDeleteRecord={handleDeleteWrapped}
      columns={tableColumns}
    />
  );

  // ═══════════════════════════════════════
  // 全表视图
  // ═══════════════════════════════════════
  if (!selectedRecord) {
    return (
      <div className="flex-1 overflow-auto animate-in fade-in duration-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800">{displayTitle}</h2>
            {projectCode && <span className="text-sm text-slate-400">({projectCode})</span>}
            {archiveYear && <><span className="text-slate-300 mx-1">/</span><span className="text-sm font-medium text-slate-500">{archiveYear}年</span></>}
          </div>
        </div>
        {filterBar}
        {mainTable}
      </div>
    );
  }

  // ═══════════════════════════════════════
  // 分栏视图：纯净记录列表 + 详情
  // ═══════════════════════════════════════
  return (
    <div className="flex-1 flex overflow-hidden animate-in fade-in duration-200">
      {/* 左侧：纯净记账凭证列表 */}
      <div className="w-[280px] min-w-[240px] flex flex-col border-r border-slate-200 bg-white">
        <div className="shrink-0 px-4 py-3 border-b border-slate-100">
          <button
            onClick={handleCloseDetail}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-sky-50 hover:text-sky-700 hover:border-sky-300 transition-all shadow-sm mb-2.5"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            返回列表
          </button>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-bold text-slate-800 truncate">{displayTitle}</h3>
            {archiveYear && <span className="text-xs text-slate-400">{archiveYear}年</span>}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">{displayRecords.length} 条记录</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {displayRecords.map((rec) => {
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
                  <span className="font-mono text-slate-600">¥{rec.amount.toLocaleString()}</span>
                  <span className="text-slate-300">·</span>
                  <span>{rec.department}</span>
                </div>
              </button>
            );
          })}
        </div>

      </div>

      <ErrorBoundary>
        <RecordDetailPanel context="archive" record={selectedRecord} onClose={handleCloseDetail} />
      </ErrorBoundary>
    </div>
  );
};

export default ProjectViewPage;

