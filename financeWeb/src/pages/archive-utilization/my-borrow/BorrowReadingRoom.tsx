/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * BorrowReadingRoom — 在线调阅（PRD 2.4 借阅中控制）
 *
 * 已授权电子档案列表：倒计时标签 + 权限颗粒（浏览/下载/打印）
 * 调阅弹窗：红色倒计时横幅 + 配置驱动水印预览 + 权限门控按钮
 * 全部查看/下载/打印行为沉淀为操作日志（等保留痕）
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  MonitorPlay, Clock, Cloud, Download, Printer, X, ShieldAlert, FileText, Timer,
} from 'lucide-react';
import { useBorrowStore, activeElectronicGrants } from '../../../stores/borrowStore';
import { useArchiveStore } from '../../../stores/archiveStore';
import { useAuthStore } from '../../../stores/authStore';
import { useAppStore } from '../../../stores/appStore';
import SecurityWatermark from '../../../components/watermark/SecurityWatermark';
import { PERM_LABELS, type BorrowOrder, type ElectronicPerm, type Fulfillment } from '../../../types/borrow';
import type { ArchiveRecord } from '../../../types';

// ── 倒计时 ──
function useCountdown(endDate: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const end = new Date(`${endDate}T23:59:59`).getTime();
  const ms = Math.max(0, end - now);
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const urgent = ms < 86400000;
  return { days, hours, urgent, expired: ms <= 0 };
}

// ── 调阅弹窗 ──
interface ReadingModalProps {
  order: BorrowOrder;
  fulfillment: Fulfillment;
  record: ArchiveRecord;
  perms: ElectronicPerm[];
  onClose: () => void;
}

const ReadingModal: React.FC<ReadingModalProps> = ({ order, fulfillment, record, perms, onClose }) => {
  const currentUser = useAuthStore((s) => s.currentUser);
  const logAction = useBorrowStore((s) => s.logAction);
  const triggerToast = useAppStore((s) => s.triggerToast);
  const { days, hours, urgent } = useCountdown(fulfillment.endDate);

  // 留痕：打开预览
  useEffect(() => {
    if (currentUser) {
      logAction('在线查看', record.remarks || record.voucherNo, currentUser, order.id, record.archiveCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canDownload = perms.includes('download');
  const canPrint = perms.includes('print');

  const handleDownload = () => {
    if (!currentUser) return;
    logAction('下载', record.remarks || record.voucherNo, currentUser, order.id, '带水印烧录下载（模拟）');
    triggerToast('已提交带水印下载任务，文件烧录动态水印后下发（模拟）', 'success');
  };
  const handlePrint = () => {
    if (!currentUser) return;
    logAction('打印', record.remarks || record.voucherNo, currentUser, order.id, '带水印打印（模拟）');
    triggerToast('已发送带水印打印任务（模拟）', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[min(880px,94vw)] h-[min(640px,88vh)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* 头部：标题 + 倒计时 */}
        <div className={`px-5 py-3 flex items-center gap-3 shrink-0 ${urgent ? 'bg-red-600' : 'bg-slate-800'}`}>
          <FileText className="w-4 h-4 text-white/80 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate">{record.remarks || record.voucherNo}</div>
            <div className="text-[10px] text-white/60 font-mono">{record.archiveCode} · 借阅单 {order.orderNo}</div>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs shrink-0 ${urgent ? 'bg-white text-red-600' : 'bg-red-500/90 text-white'}`}>
            <Timer className="w-3.5 h-3.5" />
            距借阅到期还有 {days} 天 {hours} 小时
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 预览体（水印容器） */}
        <div className="flex-1 relative overflow-auto bg-slate-100 p-8 min-h-0">
          <div className="relative mx-auto w-[620px] min-h-[480px] bg-white shadow-lg rounded-sm p-10 select-none">
            {/* 模拟凭证文档 */}
            <div className="text-center border-b-2 border-slate-800 pb-4 mb-6">
              <h2 className="text-xl font-bold tracking-[0.3em] text-slate-800">记 账 凭 证</h2>
              <div className="text-xs text-slate-500 mt-1">{record.year}年{record.month}月 · {record.voucherNo}</div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-xs text-slate-500">
                <span>全宗号：Z001</span>
                <span>档号：{record.archiveCode}</span>
              </div>
              <table className="w-full border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-300 px-2 py-1.5 text-left">摘要</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left">会计科目</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right">金额（元）</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-300 px-2 py-1.5">{record.remarks || '—'}</td>
                    <td className="border border-slate-300 px-2 py-1.5">{record.accountSubject || '—'}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-mono">
                      {record.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2 py-1.5 text-slate-400" colSpan={2}>合计</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-mono font-bold">
                      ¥{record.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="flex justify-between text-xs text-slate-500 pt-2">
                <span>制单人：{record.preparer || '—'}</span>
                <span>审核人：{record.department}负责人</span>
                <span>附件 {(record.sourceDocumentIds?.length || 0)} 张</span>
              </div>
            </div>
            <div className="mt-8 w-24 h-24 border-2 border-red-300 rounded-full flex items-center justify-center text-red-400 text-xs font-bold rotate-[-15deg] opacity-60">
              已归档
            </div>

            {/* 动态安全水印（配置驱动 + 防篡改） */}
            <SecurityWatermark scene="preview" refreshIntervalSec={5} onForceClose={onClose} />
          </div>
        </div>

        {/* 底部：权限门控操作 */}
        <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldAlert className="w-3.5 h-3.5" />
            已授权权限：{perms.map((p) => PERM_LABELS[p]).join(' / ') || '无'} · 到期自动收回
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!canDownload}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-colors ${
                canDownload
                  ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm cursor-pointer'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
              title={canDownload ? '下载（强制烧录动态水印）' : '未授权下载权限'}
            >
              <Download className="w-3.5 h-3.5" />下载
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!canPrint}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-colors ${
                canPrint
                  ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-sm cursor-pointer'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
              title={canPrint ? '打印（强制水印）' : '未授权打印权限'}
            >
              <Printer className="w-3.5 h-3.5" />打印
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── 调阅列表 ──
const BorrowReadingRoom: React.FC = () => {
  const orders = useBorrowStore((s) => s.orders);
  const records = useArchiveStore((s) => s.records);
  const currentUser = useAuthStore((s) => s.currentUser);
  const [reading, setReading] = useState<{ order: BorrowOrder; fulfillment: Fulfillment; record: ArchiveRecord } | null>(null);

  const grants = useMemo(
    () => (currentUser ? activeElectronicGrants(orders, currentUser.id) : []),
    [orders, currentUser],
  );
  const recordById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);

  if (grants.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <MonitorPlay className="w-12 h-12 text-slate-200 mb-3" />
        <p className="text-sm font-medium">暂无生效中的电子授权</p>
        <p className="text-xs mt-1">借阅申请审批通过后，电子档案将自动授权并在此展示</p>
      </div>
    );
  }

  const permsOf = (order: BorrowOrder, fulfillment: Fulfillment): ElectronicPerm[] => {
    const item = order.items.find((i) => fulfillment.recordIds.includes(i.recordId));
    return item?.electronicPerms || ['view'];
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
          <Cloud className="w-3.5 h-3.5" />
          共 {grants.length} 份电子档案已授权 · 到期 23:59:59 系统自动收回（无感归还）
        </div>
        {grants.map(({ order, fulfillment }) => {
          const record = recordById.get(fulfillment.recordIds[0]);
          if (!record) return null;
          const perms = permsOf(order, fulfillment);
          return (
            <GrantCard
              key={fulfillment.id}
              order={order}
              fulfillment={fulfillment}
              record={record}
              perms={perms}
              onOpen={() => setReading({ order, fulfillment, record })}
            />
          );
        })}
      </div>

      {reading && (
        <ReadingModal
          order={reading.order}
          fulfillment={reading.fulfillment}
          record={reading.record}
          perms={permsOf(reading.order, reading.fulfillment)}
          onClose={() => setReading(null)}
        />
      )}
    </div>
  );
};

// ── 授权卡片 ──
interface GrantCardProps {
  order: BorrowOrder;
  fulfillment: Fulfillment;
  record: ArchiveRecord;
  perms: ElectronicPerm[];
  onOpen: () => void;
}

const GrantCard: React.FC<GrantCardProps> = ({ order, fulfillment, record, perms, onOpen }) => {
  const { days, hours, urgent } = useCountdown(fulfillment.endDate);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
        <Cloud className="w-5 h-5 text-sky-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800 truncate">{record.remarks || record.voucherNo}</div>
        <div className="text-[11px] text-slate-400 mt-0.5 font-mono truncate">{record.archiveCode}</div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-[10px] text-slate-400">借阅单 {order.orderNo}</span>
          {perms.map((p) => (
            <span key={p} className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-100">
              {PERM_LABELS[p]}
            </span>
          ))}
        </div>
      </div>
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
        urgent ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-600'
      }`}>
        <Clock className="w-3.5 h-3.5" />
        剩余 {days} 天 {hours} 小时
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="px-4 py-2 bg-sky-600 text-white text-xs font-bold rounded-xl hover:bg-sky-700 transition-colors shadow-sm cursor-pointer shrink-0"
      >
        进入调阅
      </button>
    </div>
  );
};

export default BorrowReadingRoom;

