/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ArchivePackagePage — 档案打包
 *
 * 依据 DA/T 48-2009、DA/T 93-2022、DA/T 94-2022：
 *   1. 从保管库（status='已组卷'）加载待打包档案
 *   2. 按 4 类封装规则自动分组为封装单元
 *   3. 封装前合规校验（跨年度/跨期限/跨类别混装、四性检测等）
 *   4. 生成封装包（ZIP + XML 封装说明 + 数字摘要）
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Layers, Search, CheckCircle2, AlertCircle, AlertTriangle,
  FileSpreadsheet, ChevronDown, ChevronRight, Package,
  Download, Send, Shield, Clock, RefreshCw, FileText,
  Trash2, Eye,
} from 'lucide-react';
import { useArchiveStore } from '../../stores/archiveStore';
import { useVolumeStore } from '../../stores/volumeStore';
import { usePackageStore } from '../../stores/packageStore';
import type { PackageUnit, PackageRecord } from '../../types/package';

// ── 类型筛选 ──
const TYPE_FILTERS = [
  { value: '全部', label: '全部类型' },
  { value: '记账凭证', label: '凭证类' },
  { value: '会计账簿', label: '账簿类' },
  { value: '财务报告', label: '报告类' },
  { value: '其他会计资料', label: '其他类' },
];

// ── 工具 ──
const typeIcon = (t: string) => {
  if (t === 'voucher') return <FileText className="w-3.5 h-3.5 text-sky-500" />;
  if (t === 'ledger') return <FileSpreadsheet className="w-3.5 h-3.5 text-amber-500" />;
  if (t === 'report') return <FileSpreadsheet className="w-3.5 h-3.5 text-purple-500" />;
  return <Layers className="w-3.5 h-3.5 text-slate-500" />;
};

const typeLabel = (t: string) => {
  if (t === 'voucher') return '凭证类';
  if (t === 'ledger') return '账簿类';
  if (t === 'report') return '报告类';
  return '其他类';
};

// ═══════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════
const ArchivePackagePage: React.FC = () => {
  const records = useArchiveStore(s => s.records);
  const volumes = useVolumeStore(s => s.volumes);

  const {
    packageUnits,
    generatedPackages,
    selectedUnitIds,
    selectedPackageIds,
    isChecking,
    isGenerating,
    loadFromArchive,
    toggleUnit,
    toggleAllUnits,
    togglePackage,
    runPreChecks,
    generatePackages,
    removePackage,
  } = usePackageStore();

  // ── 筛选 ──
  const [yearFilter, setYearFilter] = useState<string>('全部');
  const [typeFilter, setTypeFilter] = useState<string>('全部');
  const [showManifestId, setShowManifestId] = useState<string | null>(null);

  // ── 页面加载时拉取保管库数据 ──
  useEffect(() => {
    loadFromArchive(records, volumes);
  }, []); // 仅首次加载

  // ── 筛选后的封装单元 ──
  const filteredUnits = useMemo(() => {
    let result = packageUnits;
    if (yearFilter !== '全部') {
      result = result.filter(u => u.year === yearFilter);
    }
    if (typeFilter !== '全部') {
      result = result.filter(u => u.archiveType === typeFilter);
    }
    return result;
  }, [packageUnits, yearFilter, typeFilter]);

  // ── 按类型分组 ──
  const groupedUnits = useMemo(() => {
    const map = new Map<string, PackageUnit[]>();
    for (const u of filteredUnits) {
      if (!map.has(u.type)) map.set(u.type, []);
      map.get(u.type)!.push(u);
    }
    return map;
  }, [filteredUnits]);

  // ── 可用年份列表 ──
  const availableYears = useMemo(() => {
    const years = new Set(packageUnits.map(u => u.year));
    return ['全部', ...[...years].sort()];
  }, [packageUnits]);

  // ── 统计 ──
  const totalUnits = filteredUnits.length;
  const totalRecords = filteredUnits.reduce((s, u) => s + u.recordCount, 0);
  const allSelected = filteredUnits.length > 0 && selectedUnitIds.size === filteredUnits.length;
  const checkedPassed = filteredUnits.filter(u => u.preCheck.passed).length;

  // ── 操作 ──
  const handleToggleAll = () => toggleAllUnits(!allSelected);

  const handleRefresh = () => loadFromArchive(records, volumes);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* ═══ 顶部工具栏 ═══ */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0 flex-wrap">
        <Package className="w-5 h-5 text-sky-600" />
        <h1 className="text-base font-bold text-slate-800">档案打包</h1>

        {/* 年度筛选 */}
        <select
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white ml-2"
        >
          {availableYears.map(y => (
            <option key={y} value={y}>{y === '全部' ? '全部年度' : `${y}年`}</option>
          ))}
        </select>

        {/* 类型筛选 */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
        >
          {TYPE_FILTERS.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <span className="text-sm text-slate-400">|</span>
        <span className="text-sm text-slate-500">
          <strong className="text-sky-600">{totalUnits}</strong> 个封装单元 ·
          <strong className="text-slate-700"> {totalRecords}</strong> 条记录
        </span>

        <div className="flex-1" />

        {/* 刷新 */}
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </button>

        {/* 封装前校验 */}
        <button
          onClick={runPreChecks}
          disabled={isChecking || filteredUnits.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-40 transition-colors"
        >
          {isChecking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
          封装前校验
        </button>

        {/* 生成封装包 */}
        <button
          onClick={generatePackages}
          disabled={isGenerating || filteredUnits.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:bg-slate-300 transition-colors"
        >
          {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
          生成封装包
        </button>
      </div>

      {/* ═══ 主体：左右分栏 ═══ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ═══ 左侧：封装单元选择区（60%） ═══ */}
        <div className="flex flex-col border-r border-slate-200 bg-white" style={{ width: '60%', minWidth: 400 }}>
          {/* 全选栏 */}
          <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-100">
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleToggleAll}
                className="rounded border-slate-300 accent-sky-600"
              />
              全选 ({filteredUnits.length} 个单元)
            </label>
            {selectedUnitIds.size > 0 && (
              <span className="text-xs text-sky-600 font-medium">已选 {selectedUnitIds.size} 个</span>
            )}
            <div className="flex-1" />
            <span className="text-[11px] text-slate-400">
              校验通过 {checkedPassed}/{totalUnits}
            </span>
          </div>

          {/* 封装单元列表 */}
          <div className="flex-1 overflow-y-auto">
            {filteredUnits.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                <Package className="w-10 h-10 text-slate-300" />
                <p className="text-sm">暂无待打包档案</p>
                <p className="text-xs">请先在组卷工作台确认组卷，再回到此页面生成封装包</p>
              </div>
            ) : (
              <div className="py-2">
                {[...groupedUnits.entries()].map(([type, units]) => (
                  <div key={type} className="mb-1">
                    {/* 分组标题 */}
                    <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-semibold text-slate-500 bg-slate-50 sticky top-0">
                      {typeIcon(type)}
                      <span>{typeLabel(type)}</span>
                      <span className="text-slate-400 font-normal">· {units.length} 个单元</span>
                    </div>

                    {/* 单元列表 */}
                    {units.map(unit => {
                      const isSelected = selectedUnitIds.has(unit.id);
                      const checkOk = unit.preCheck.passed;
                      const hasWarnings = unit.preCheck.warnings.length > 0;
                      const hasErrors = unit.preCheck.errors.length > 0;

                      return (
                        <label
                          key={unit.id}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-50 ${
                            isSelected ? 'bg-sky-50/70' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleUnit(unit.id)}
                            className="rounded border-slate-300 accent-sky-600 shrink-0"
                          />

                          {/* 类型图标 */}
                          {typeIcon(unit.type)}

                          {/* 信息 */}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-slate-700 truncate">{unit.label}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {unit.year}年 · {unit.retention} · {unit.recordCount} 条 · {unit.totalSize}
                            </div>
                          </div>

                          {/* 档号范围 */}
                          <span className="text-[10px] text-slate-400 font-mono hidden xl:block truncate max-w-[180px]">
                            {unit.startArchiveCode} ~ {unit.endArchiveCode}
                          </span>

                          {/* 校验状态 */}
                          {hasErrors ? (
                            <span className="flex items-center gap-1 text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full shrink-0">
                              <AlertCircle className="w-3 h-3" />
                              {unit.preCheck.errors.length} 项不合规
                            </span>
                          ) : hasWarnings ? (
                            <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">
                              <AlertTriangle className="w-3 h-3" />
                              {unit.preCheck.warnings.length} 项提醒
                            </span>
                          ) : checkOk ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">
                              <CheckCircle2 className="w-3 h-3" />
                              合规
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0">
                              待校验
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ 右侧：封装包预览区（40%） ═══ */}
        <div className="flex flex-col flex-1 bg-slate-50">
          <div className="shrink-0 px-5 py-3 bg-white border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">
              封装包清单
              {generatedPackages.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  共 {generatedPackages.length} 个
                </span>
              )}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {generatedPackages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                <Package className="w-10 h-10 text-slate-300" />
                <p className="text-sm">暂无封装包</p>
                <p className="text-xs text-center px-6">
                  勾选左侧封装单元，点击"封装前校验"后<br />再点击"生成封装包"
                </p>
              </div>
            ) : (
              generatedPackages.map(pkg => {
                const isSelected = selectedPackageIds.has(pkg.id);
                // 找到对应的 unit 信息
                const unit = packageUnits.find(u => pkg.unitIds.includes(u.id));
                return (
                  <div
                    key={pkg.id}
                    className={`bg-white border rounded-xl overflow-hidden transition-all ${
                      isSelected ? 'border-sky-300 ring-2 ring-sky-50' : 'border-slate-200'
                    }`}
                  >
                    {/* 封装包头部 */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePackage(pkg.id)}
                        className="rounded border-slate-300 accent-sky-600 shrink-0"
                      />
                      <Package className="w-4 h-4 text-sky-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-800 font-mono truncate">
                          {pkg.packageName}.zip
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {unit ? `${unit.archiveType} · ${unit.year}年` : ''} · {pkg.totalRecords} 条 · {pkg.totalSize}
                        </div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium shrink-0">
                        <CheckCircle2 className="w-3 h-3 inline mr-0.5" />
                        已生成
                      </span>
                    </div>

                    {/* 操作栏 */}
                    <div className="flex items-center gap-2 px-4 py-2">
                      <button
                        onClick={() => setShowManifestId(showManifestId === pkg.id ? null : pkg.id)}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        封装说明
                      </button>
                      <button
                        className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                        title="下载 ZIP 封装包"
                      >
                        <Download className="w-3 h-3" />
                        下载
                      </button>
                      <button
                        className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                        title="推送至移交"
                      >
                        <Send className="w-3 h-3" />
                        移交
                      </button>
                      <div className="flex-1" />
                      <button
                        onClick={() => removePackage(pkg.id)}
                        className="flex items-center gap-1 px-1.5 py-1 text-[11px] text-slate-400 hover:text-red-500 rounded transition-colors"
                        title="移除此封装包"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* 封装说明 XML 预览 */}
                    {showManifestId === pkg.id && (
                      <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/80">
                        <div className="text-[10px] text-slate-400 uppercase mb-1 font-semibold">封装说明 XML</div>
                        <pre className="text-[10px] text-slate-600 bg-white border border-slate-200 rounded-lg p-3 max-h-[240px] overflow-auto font-mono whitespace-pre-wrap">
                          {pkg.manifestXML.slice(0, 2000)}
                          {pkg.manifestXML.length > 2000 && '\n\n... (截断，完整内容请下载封装包查看)'}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* 底部操作栏 */}
          {generatedPackages.length > 0 && (
            <div className="shrink-0 px-5 py-3 bg-white border-t border-slate-200 flex items-center gap-3">
              <button
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                下载选中
              </button>
              <button
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                移交至档案部
              </button>
              <div className="flex-1" />
              <span className="text-[11px] text-slate-400">
                {selectedPackageIds.size > 0 ? `已选 ${selectedPackageIds.size} 个` : `共 ${generatedPackages.length} 个封装包`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 信息提示（首次加载时显示） ═══ */}
      {packageUnits.length === 0 && generatedPackages.length === 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-2 px-4 py-2 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-700 shadow-lg">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>数据来源：保管库中已确认组卷的档案记录</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArchivePackagePage;

