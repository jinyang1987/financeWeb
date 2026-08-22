﻿﻿﻿﻿﻿﻿﻿/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ContentArea - 页面内容路由
 *
 * 根据 activeMainMenu 状态渲染对应页面，直接从 Zustand stores 和 hooks
 * 获取数据，消除 props drilling（约束第五章第 3 条）。
 */
import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MenuId, useAppStore } from '../../stores/appStore';
import { useArchiveStore } from '../../stores/archiveStore';
import { useAuthStore } from '../../stores/authStore';
import { useRoleStore, canSeeMenuConfigured } from '../../stores/roleStore';
import { menuGroups } from '../../config/menuConfig';
import { useAppHandlers } from './useAppHandlers';
import PageRouter from '../../components/PageRouter';
import FinanceViewPage from '../../pages/archive-arrange/FinanceViewPage';
import ProjectViewPage from '../../pages/archive-arrange/ProjectViewPage';
import { FanzongManager } from '../FanzongManager';
import ApprovalCenterPage from '../../pages/archive-utilization/ApprovalCenterPage';
import BorrowManagePage from '../../pages/archive-utilization/BorrowManagePage';
import BorrowLedgerPage from '../../pages/archive-utilization/BorrowLedgerPage';
import BorrowStatsPage from '../../pages/archive-utilization/BorrowStatsPage';
import StatsCockpitPage from '../../pages/archive-stats/StatsCockpitPage';
import InventoryStatsPage from '../../pages/archive-stats/InventoryStatsPage';
import LifecycleStatsPage from '../../pages/archive-stats/LifecycleStatsPage';
import ComplianceStatsPage from '../../pages/archive-stats/ComplianceStatsPage';
import CockpitConfigPage from '../../pages/system/CockpitConfigPage';
import VolumeWorkspacePage from '../../pages/archive-arrange/VolumeWorkspacePage';
import RecycleBinPage from '../../pages/archive-arrange/RecycleBinPage';
import VolumeItemSearchPage from '../../pages/archive-preserve/VolumeItemSearchPage';
import TransferManagePage from '../../pages/archive-utilization/TransferManagePage';
import ArchiveManageConfigPage from '../../pages/archive-config/manage/ArchiveManageConfigPage';
import RetentionConfigPage from '../../pages/archive-config/RetentionConfigPage';
import ApiReceivePage from '../../pages/archive-rcv/ApiReceivePage';
import OpenApiReceivePage from '../../pages/archive-rcv/OpenApiReceivePage';
import ConnectionConfigPage from '../../pages/system/ConnectionConfigPage';
import SourceDocumentSearchPage from '../../pages/archive-preserve/SourceDocumentSearchPage';
import VoucherSearchPage from '../../pages/archive-query/VoucherSearchPage';
import MatterSearchPage from '../../pages/archive-query/MatterSearchPage';
import AuditTrailPage from '../../pages/archive-query/AuditTrailPage';
import ArchivePackagePage from '../../pages/archive-disposal/ArchivePackagePage';
import ArchiveTransferPage from '../../pages/archive-disposal/ArchiveTransferPage';
import AppraisalManagePage from '../../pages/archive-utilization/AppraisalManagePage';
import WatermarkConfigPage from '../../pages/archive-config/WatermarkConfigPage';
import WorkflowConfigPage from '../../pages/archive-config/WorkflowConfigPage';

const ContentArea: React.FC = () => {
  // ─── 从 stores 直接读取数据，避免 props drilling ──────
  const activeMainMenu = useAppStore((s) => s.activeMainMenu);
  const setActiveMainMenu = useAppStore((s) => s.setActiveMainMenu);
  const triggerToast = useAppStore((s) => s.triggerToast);
  const location = useLocation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const roleMenus = useRoleStore((s) => s.roleMenus);

  // ─── 角色路由守卫：当前菜单对角色不可见时，回退到其第一个可见菜单 ───
  useEffect(() => {
    if (!currentUser) return;
    if (!canSeeMenuConfigured(currentUser.roles, activeMainMenu, roleMenus)) {
      const firstVisible = menuGroups
        .flatMap((g) => g.items)
        .find((i) => canSeeMenuConfigured(currentUser.roles, i.key, roleMenus));
      if (firstVisible && firstVisible.key !== activeMainMenu) {
        setActiveMainMenu(firstVisible.key);
      }
    }
  }, [currentUser, activeMainMenu, roleMenus, setActiveMainMenu]);

  const archiveStore = useArchiveStore();

  const {
    records,
    filteredRecords,
    selectedRecordIds,
    isUploadOpen,
    setIsUploadOpen,
    selectedNode,
    setSelectedNode,
    searchQuery,
    setSearchQuery,
    toggleRowSelect,
    drawerVisible,
    activeRecord,
    activeFileIndex,
    setActiveFileIndex,
    currentFanzongCode,
    setCurrentFanzongCode,
  } = archiveStore;

  // ─── 从 useAppHandlers 获取事件处理函数 ────────────────
  const {
    handleOpenDrawer,
    handleDeleteRecord,
    toggleSelectAllFn,
  } = useAppHandlers(activeRecord, triggerToast);

  // ─── 同步 archiveType 和 year 过滤到 archiveStore ────
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const typeCode = sp.get('type');
    const yearStr = sp.get('year');
    if (activeMainMenu === 'view-finance') {
      // typeCode 可以为空（仅按年份浏览时）
      archiveStore.setCurrentArchiveTypeCode(typeCode || null);
      if (yearStr) {
        archiveStore.setSelectedNode({
          id: `year-${yearStr}`,
          label: `${yearStr}年`,
          type: 'period',
          code: yearStr,
        });
      } else {
        archiveStore.setSelectedNode(null);
      }
    } else {
      archiveStore.setCurrentArchiveTypeCode(null);
      archiveStore.setSelectedNode(null);
    }
  }, [activeMainMenu, location.search, archiveStore.setCurrentArchiveTypeCode, archiveStore.setSelectedNode]);

  // ─── 页面路由（原 PageRouterProps 所用） ────────────────
  const pageRouterMenus: MenuId[] = [
    'directory-config',
    'archive-rcv',
    'report-config',
    'inspection-config',
    'sys-unit',
    'sys-org',
    'sys-personnel',
    'sys-role',
    'sys-log',
    'sys-storage',
    'digital-warehouse',
  ];

  if (activeMainMenu === 'stats-cockpit') {
    return <StatsCockpitPage />;
  }

  if (activeMainMenu === 'stats-inventory') {
    return <InventoryStatsPage />;
  }

  if (activeMainMenu === 'stats-lifecycle') {
    return <LifecycleStatsPage />;
  }

  if (activeMainMenu === 'stats-compliance') {
    return <ComplianceStatsPage />;
  }

  if (activeMainMenu === 'sys-cockpit-config') {
    return <CockpitConfigPage />;
  }

  if (activeMainMenu === 'view-finance') {
    const sp = new URLSearchParams(location.search);
    const archiveTypeCode = sp.get('type') || '';
    const archiveTypeName = sp.get('name') || '';
    const archiveYear = sp.get('year') || '';
    return (
      <FinanceViewPage
        archiveTypeCode={archiveTypeCode}
        archiveTypeName={decodeURIComponent(archiveTypeName)}
        archiveYear={archiveYear}
        setActiveFileIndex={setActiveFileIndex}
      />
    );
  }

  if (activeMainMenu === 'view-project' || activeMainMenu === 'project-query') {
    const sp = new URLSearchParams(location.search);
    const projectCode = sp.get('project') || '';
    const projectName = sp.get('name') || '';
    const archiveYear = sp.get('year') || '';
    return (
      <ProjectViewPage
        projectCode={projectCode}
        projectName={decodeURIComponent(projectName)}
        archiveYear={archiveYear}
        toggleRowSelect={toggleRowSelect}
        toggleSelectAll={toggleSelectAllFn}
        handleOpenDrawer={handleOpenDrawer}
        setActiveFileIndex={setActiveFileIndex}
        handleDeleteRecord={handleDeleteRecord}
      />
    );
  }

  if (activeMainMenu === 'voucher-search') {
    return <VoucherSearchPage />;
  }

  if (activeMainMenu === 'matter-search') {
    return <MatterSearchPage />;
  }

  if (activeMainMenu === 'approval-center') {
    return <ApprovalCenterPage />;
  }

  if (activeMainMenu === 'borrow-manage') {
    return <BorrowManagePage />;
  }

  if (activeMainMenu === 'borrow-stats') {
    return <BorrowStatsPage />;
  }

  if (activeMainMenu === 'audit-trail') {
    return <AuditTrailPage />;
  }

  if (pageRouterMenus.includes(activeMainMenu)) {
    return <PageRouter activeMainMenu={activeMainMenu} records={records} triggerToast={triggerToast} />;
  }

  if (activeMainMenu === 'config-fanzong') {
    return <FanzongManager />;
  }

  if (activeMainMenu === 'archive-api-receive') {
    return <OpenApiReceivePage />;
  }

  if (activeMainMenu === 'borrow-ledger') {
    return <BorrowLedgerPage />;
  }

  if (activeMainMenu === 'volume-workspace') {
    return <VolumeWorkspacePage />;
  }

  if (activeMainMenu === 'recycle-bin') {
    return <RecycleBinPage />;
  }

  if (activeMainMenu === 'sys-connection') {
    return <ConnectionConfigPage />;
  }

  if (activeMainMenu === 'volume-item-search') {
    return <VolumeItemSearchPage />;
  }

  if (activeMainMenu === 'source-doc-search') {
    return <SourceDocumentSearchPage />;
  }

  if (activeMainMenu === 'transfer-manage') {
    return <TransferManagePage />;
  }

  if (activeMainMenu === 'archive-package') {
    return <ArchivePackagePage />;
  }

  if (activeMainMenu === 'archive-transfer') {
    return <ArchiveTransferPage />;
  }

  if (activeMainMenu === 'appraisal-manage') {
    return <AppraisalManagePage />;
  }

  if (activeMainMenu === 'archive-manage-config') {
    return <ArchiveManageConfigPage />;
  }

  if (activeMainMenu === 'retention-config') {
    return <RetentionConfigPage />;
  }

  if (activeMainMenu === 'watermark-config') {
    return <WatermarkConfigPage />;
  }

  if (activeMainMenu === 'config-workflow') {
    return <WorkflowConfigPage />;
  }

  return null;
};

export default ContentArea;


