/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * packageStore — 封装包状态管理
 */

import { create } from 'zustand';
import type { PackageUnit, PackageRecord, PackageStatus } from '../types/package';
import { groupIntoPackageUnits, runPreCheck, generatePackageName, computeChecksum } from '../utils/packageEngine';
import { generateManifestXML } from '../utils/packageManifest';
import type { ArchiveRecord } from '../types';
import type { Volume } from '../types/volume';

interface PackageStore {
  // ── 状态 ──
  packageUnits: PackageUnit[];
  generatedPackages: PackageRecord[];
  selectedUnitIds: Set<string>;
  selectedPackageIds: Set<string>;
  isChecking: boolean;
  isGenerating: boolean;

  // ── 操作 ──

  /** 从保管库加载记录并自动分组为封装单元 */
  loadFromArchive: (records: ArchiveRecord[], volumes: Volume[]) => void;

  /** 切换封装单元勾选 */
  toggleUnit: (id: string) => void;
  /** 全选/取消全选 */
  toggleAllUnits: (checked: boolean) => void;

  /** 切换封装包勾选 */
  togglePackage: (id: string) => void;

  /** 对勾选的封装单元运行封装前校验 */
  runPreChecks: () => void;

  /** 对勾选的封装单元运行封装前校验（单个） */
  runPreCheckForUnit: (unitId: string) => void;

  /** 生成封装包 */
  generatePackages: () => void;

  /** 移除已生成的封装包 */
  removePackage: (id: string) => void;

  /** 清空 */
  reset: () => void;
}

export const usePackageStore = create<PackageStore>((set, get) => ({
  packageUnits: [],
  generatedPackages: [],
  selectedUnitIds: new Set(),
  selectedPackageIds: new Set(),
  isChecking: false,
  isGenerating: false,

  loadFromArchive: (records, volumes) => {
    const units = groupIntoPackageUnits(records, volumes);
    set({
      packageUnits: units,
      generatedPackages: [],
      selectedUnitIds: new Set(),
      selectedPackageIds: new Set(),
    });
  },

  toggleUnit: (id) => {
    set(s => {
      const next = new Set(s.selectedUnitIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { selectedUnitIds: next };
    });
  },

  toggleAllUnits: (checked) => {
    set(s => {
      if (checked) return { selectedUnitIds: new Set(s.packageUnits.map(u => u.id)) };
      return { selectedUnitIds: new Set() };
    });
  },

  togglePackage: (id) => {
    set(s => {
      const next = new Set(s.selectedPackageIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { selectedPackageIds: next };
    });
  },

  runPreChecks: () => {
    set({ isChecking: true });
    // 模拟异步校验
    setTimeout(() => {
      const state = get();
      const updated = state.packageUnits.map(u => {
        if (state.selectedUnitIds.has(u.id) || state.selectedUnitIds.size === 0) {
          return { ...u, preCheck: runPreCheck(u) };
        }
        return u;
      });
      // 若全未勾选则校验全部
      const final = state.selectedUnitIds.size === 0
        ? state.packageUnits.map(u => ({ ...u, preCheck: runPreCheck(u) }))
        : updated;
      set({ packageUnits: final, isChecking: false });
    }, 800);
  },

  runPreCheckForUnit: (unitId) => {
    set(s => ({
      packageUnits: s.packageUnits.map(u =>
        u.id === unitId ? { ...u, preCheck: runPreCheck(u) } : u
      ),
    }));
  },

  generatePackages: () => {
    set({ isGenerating: true });
    setTimeout(() => {
      const state = get();
      // 自动对未校验的单元执行校验
      let units = state.packageUnits.map(u =>
        u.preCheck.errors.length === 0 && u.preCheck.warnings.length === 0 && u.preCheck.passed
          ? u
          : { ...u, preCheck: runPreCheck(u) }
      );

      const targetIds = state.selectedUnitIds.size > 0
        ? Array.from(state.selectedUnitIds)
        : units.filter(u => u.preCheck.passed).map(u => u.id);

      const targetUnits = units.filter(u => targetIds.includes(u.id) && u.preCheck.passed);
      if (targetUnits.length === 0) {
        set({ isGenerating: false });
        return;
      }

      const now = new Date().toISOString();
      const newPkgs: PackageRecord[] = [];
      let seq = state.generatedPackages.length;

      // 按类型分组生成封装包（保持规范的一一对应关系）
      for (const unit of targetUnits) {
        seq++;
        const pkgName = generatePackageName(unit);
        const pkgId = `pkg-${now.slice(0, 10)}-${String(seq).padStart(3, '0')}`;
        const manifestXML = generateManifestXML({
          packageName: pkgName,
          unit,
          createdBy: '档案管理员',
          createdAt: now,
          seq,
        });

        // 将校验结果写入 unit
        unit.preCheck = runPreCheck(unit);

        newPkgs.push({
          id: pkgId,
          packageName: pkgName,
          containerFormat: 'zip',
          unitIds: [unit.id],
          totalRecords: unit.recordCount,
          totalSize: unit.totalSize,
          createdAt: now,
          createdBy: '档案管理员',
          checksum: computeChecksum(manifestXML),
          status: 'generated' as PackageStatus,
          manifestXML,
        });
      }

      set(s => ({
        packageUnits: units,
        generatedPackages: [...s.generatedPackages, ...newPkgs],
        selectedUnitIds: new Set(),
        isGenerating: false,
      }));
    }, 600);
  },

  removePackage: (id) => {
    set(s => ({
      generatedPackages: s.generatedPackages.filter(p => p.id !== id),
      selectedPackageIds: new Set([...s.selectedPackageIds].filter(pid => pid !== id)),
    }));
  },

  reset: () => {
    set({
      packageUnits: [],
      generatedPackages: [],
      selectedUnitIds: new Set(),
      selectedPackageIds: new Set(),
      isChecking: false,
      isGenerating: false,
    });
  },
}));
