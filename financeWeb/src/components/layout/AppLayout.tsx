﻿﻿﻿﻿﻿﻿﻿/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 会计档案管理系统 - AppLayout
 * 仅负责布局框架，内容区域的数据由 ContentArea 直接从 stores 读取，
 * 消除 props drilling（约束第五章第 3 条、第十三章第 4 条）。
 */

import React, { useState, useEffect } from 'react';
import { fetchFondsList } from '../../services/fondsService';
import { useAppStore } from '../../stores/appStore';
import { useArchiveStore } from '../../stores/archiveStore';
import { useVolumeStore } from '../../stores/volumeStore';
import { useArchiveBoxStore } from '../../stores/archiveBoxStore';
import { useSourceDocumentStore } from '../../stores/sourceDocumentStore';
import { useBorrowStore } from '../../stores/borrowStore';
import { useAppHandlers } from './useAppHandlers';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastNotification } from './ToastNotification';
import { MenuSettingsModal } from './MenuSettingsModal';
import DrawerPanel from './DrawerPanel';
import ContentArea from './ContentArea';
import { UploadModal } from '../UploadModal';

interface AppLayoutProps {
  loggedUser: string;
  onLogout: () => void;
}

const AppLayout: React.FC<AppLayoutProps> = ({ loggedUser, onLogout }) => {
  // ─── Store hooks ─────────────────────────────────────
  const triggerToast = useAppStore((s) => s.triggerToast);
  const isMenuSettingsOpen = useAppStore((s) => s.isMenuSettingsOpen);
  const setMenuSettingsOpen = useAppStore((s) => s.setMenuSettingsOpen);

  const isUploadOpen = useArchiveStore((s) => s.isUploadOpen);
  const setIsUploadOpen = useArchiveStore((s) => s.setIsUploadOpen);
  const activeRecord = useArchiveStore((s) => s.activeRecord);

  // ─── Handlers for DrawerPanel & UploadModal ──────────
  const {
    handleUploadSuccess,
  } = useAppHandlers(activeRecord, triggerToast);

  // ─── Local state (only fonds loading) ────────────────
  const [fondsLoading, setFondsLoading] = useState(true);

  // ─── Load fanzongs on mount ──────────────────────────
  useEffect(() => {
    const loadFonds = async () => {
      try {
        setFondsLoading(true);
        const setFanzongs = useArchiveStore.getState().setFanzongs;
        const setCurrentFanzongCode = useArchiveStore.getState().setCurrentFanzongCode;
        const list = await fetchFondsList();
        setFanzongs(
          list.map(f => ({
            id: f.id,
            name: f.name,
            code: f.code,
            status: f.status,
            recordCount: 0,
            address: f.address || '',
            syncSource: f.syncSource || '',
            companyId: f.companyId || '',
            custodianCode: f.custodianCode || '',
          }))
        );
        if (list.length > 0) {
          const currentCode = useArchiveStore.getState().currentFanzongCode;
          if (!list.find(f => f.code === currentCode)) {
            setCurrentFanzongCode(list[0].code);
          }
        }
        // 全宗就绪后拉取当前全宗收集池件（P1-① 真数据源）与全量件视图（读侧）
        void useArchiveStore.getState().loadRecords();
        void useArchiveStore.getState().loadAllRecords();
      } catch (e) {
        console.warn('全宗加载失败（首次可能无数据）:', e);
      } finally {
        setFondsLoading(false);
      }
    };
    loadFonds();
  }, []);

  // ─── 案卷镜像随全宗联动（P1-②③）：财务视图/盒树/统计等只读页面共用 ───
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);
  useEffect(() => {
    if (!currentFanzongCode) return;
    const load = async () => {
      await Promise.all([
        useVolumeStore.getState().loadVolumes(currentFanzongCode),
        useArchiveBoxStore.getState().loadBoxes(currentFanzongCode),
        useSourceDocumentStore.getState().loadSourceDocs(currentFanzongCode),
        useArchiveStore.getState().loadAllRecords(),
      ]);
      // recordCount 聚合回填全宗（P1-③）：收集池件数 + 卷内件数
      const poolCount = useArchiveStore.getState().records.length;
      const volumeCount = Object.values(useVolumeStore.getState().volumeRecords)
        .reduce((sum, recs) => sum + recs.length, 0);
      const total = poolCount + volumeCount;
      const fanzongs = useArchiveStore.getState().fanzongs;
      const updated = fanzongs.map((f) =>
        f.code === currentFanzongCode ? { ...f, recordCount: total } : f,
      );
      useArchiveStore.getState().setFanzongs(updated);
    };
    void load();
  }, [currentFanzongCode]);

  // ─── 借阅数据挂载加载（全局，非全宗维度；动作后 store 内部自行刷新） ───
  useEffect(() => {
    void useBorrowStore.getState().loadOrders();
    void useBorrowStore.getState().loadLogs();
  }, []);

  // ─── Render ──────────────────────────────────────────
  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex text-slate-800 font-sans antialiased selection:bg-sky-500 selection:text-white">
      <ToastNotification />
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-white">
        <Header onLogout={onLogout} fondsLoading={fondsLoading} />
        <div className="flex-1 p-5 overflow-hidden flex flex-col">
          <ContentArea />
        </div>
      </div>

      <DrawerPanel triggerToast={triggerToast} />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />

      <MenuSettingsModal />
    </div>
  );
};

export default AppLayout;






