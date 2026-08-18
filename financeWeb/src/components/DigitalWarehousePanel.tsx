/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * DigitalWarehousePanel — 实体档案库房（2026-08-17 密集架动画重构）
 *
 * 业务链路：组卷 → 确认 → 移交归盒（自动建盒）→ 封盒 → 上架（格位定位）→ 在架保管。
 *
 * 本页职责：
 *   1. 密集架阵列可视化（库房→架→列→层→位，V6 架位模型），模拟真实密集架
 *     「闭合 → 按列打开通道」的交互（每架同时只开一列通道，动画展开）。
 *   2. 上架：待上架盒支持「自动上架」（第一个空格位）与「点选架位」（点空格定位），
 *      占用互斥由服务端 uq_box_cell 唯一约束保证。
 *   3. 盒详情与状态操作：下架/封盒/开封/删除空盒（状态机由服务端强制）。
 *   4. 库房布局管理：新增/删除密集架（有在架盒的架禁止删除）。
 *
 * 数据：盒列表（archiveBoxStore）+ 密集架布局（/storage/racks）+ 架位占用（/storage/positions）。
 * 鉴定销毁入口保留在页面底部（真实现已独立成页）。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Warehouse, RefreshCw, Plus, Shield, ArrowRight, Boxes, Package,
  Zap, MousePointerClick, Undo2, Lock, LockOpen, Trash2, X, Loader2,
  MapPin, Layers, SquareX, AlertTriangle,
} from 'lucide-react';
import { useArchiveStore } from '../stores/archiveStore';
import { useArchiveBoxStore } from '../stores/archiveBoxStore';
import { useAppStore } from '../stores/appStore';
import { fetchBoxVolumes, type BoxVolumeDto } from '../services/boxService';
import {
  fetchRacks, fetchPositions, fetchRooms, createRack, deleteRack,
  cellKey, locationText,
  type StorageRack, type StorageRoom, type BoxPosition,
} from '../services/storageService';
import type { ArchiveBox } from '../types/archiveBox';

// ── 类别配色（盒脊/徽章） ──
const CATEGORY_STYLE: Record<string, { spine: string; chip: string; label: string }> = {
  KP: { spine: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 border-sky-200', label: '会计凭证' },
  KB: { spine: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700 border-violet-200', label: '会计账簿' },
  FB: { spine: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: '财务报表' },
  QT: { spine: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-200', label: '其他资料' },
};
const catStyle = (code: string) => CATEGORY_STYLE[code] || CATEGORY_STYLE.QT;

const BOX_STATUS_LABEL: Record<string, string> = {
  active: '装盒中', sealed: '已封盒', stored: '在架', destroyed: '已销毁',
};

// ── 组件 ──
export const DigitalWarehousePanel: React.FC<{ triggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void }> = ({ triggerToast }) => {
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);
  const { boxes, loadBoxes, shelveBox, unshelveBox, sealBox, unsealBox, deleteBox } = useArchiveBoxStore();
  const setActiveMainMenu = useAppStore((s) => s.setActiveMainMenu);

  const [racks, setRacks] = useState<StorageRack[]>([]);
  const [roomList, setRoomList] = useState<StorageRoom[]>([]);
  const [positions, setPositions] = useState<BoxPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState('');
  const [openCol, setOpenCol] = useState<Record<string, number | null>>({});
  const [placing, setPlacing] = useState<string | null>(null);
  const [highlightCell, setHighlightCell] = useState<string | null>(null);
  const [busyBox, setBusyBox] = useState<string | null>(null);
  const [showRackModal, setShowRackModal] = useState(false);
  const [confirmDelRack, setConfirmDelRack] = useState<string | null>(null);

  // 盒详情抽屉
  const [detailBoxId, setDetailBoxId] = useState<string | null>(null);
  const [detailVolumes, setDetailVolumes] = useState<BoxVolumeDto[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const reloadStorage = useCallback(async () => {
    const [rm, r, p] = await Promise.all([fetchRooms(), fetchRacks(), fetchPositions()]);
    setRoomList(rm);
    setRacks(r);
    setPositions(p);
  }, []);

  // 全量加载（含错误态：端点挂起/404 时给重试入口，不再无限转圈，2026-08-17 修复）
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await reloadStorage();
      setLoadError(null);
      if (currentFanzongCode) await loadBoxes(currentFanzongCode);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '库房数据加载失败');
      triggerToast('库房数据加载失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setLoading(false);
    }
  }, [reloadStorage, currentFanzongCode, loadBoxes, triggerToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ── 派生数据 ──
  const rooms = useMemo(() => roomList.map((r) => ({ code: r.room, name: r.room_name })), [roomList]);

  useEffect(() => {
    if (!activeRoom && rooms.length > 0) setActiveRoom(rooms[0].code);
  }, [rooms, activeRoom]);

  const roomRacks = useMemo(() => racks.filter((r) => r.room === activeRoom), [racks, activeRoom]);

  const positionByCell = useMemo(() => {
    const m = new Map<string, BoxPosition>();
    positions.forEach((p) => m.set(cellKey(p.room, p.rack, p.column_no, p.layer_no, p.cell_no), p));
    return m;
  }, [positions]);

  const positionByBox = useMemo(() => {
    const m = new Map<string, BoxPosition>();
    positions.forEach((p) => m.set(p.box_node_id, p));
    return m;
  }, [positions]);

  const boxById = useMemo(() => new Map(boxes.map((b) => [b.id, b])), [boxes]);

  const pendingBoxes = useMemo(() => boxes.filter((b) => b.status !== 'stored' && b.status !== 'destroyed'), [boxes]);

  const stats = useMemo(() => {
    const totalCells = roomRacks.reduce((s, r) => s + r.column_count * r.layer_count * r.cell_count, 0);
    const occupied = positions.filter((p) => p.room === activeRoom).length;
    return {
      rackCount: roomRacks.length,
      totalCells,
      occupied,
      pending: pendingBoxes.length,
      rate: totalCells > 0 ? Math.round((occupied / totalCells) * 100) : 0,
    };
  }, [roomRacks, positions, activeRoom, pendingBoxes]);

  // ── 上架后定位反馈：打开对应列通道 + 高亮格位 ──
  const focusCell = useCallback((pos: BoxPosition) => {
    const rack = racks.find((r) => r.room === pos.room && r.rack === pos.rack);
    if (rack) {
      setActiveRoom(pos.room);
      setOpenCol((prev) => ({ ...prev, [rack.id]: pos.column_no }));
    }
    const key = cellKey(pos.room, pos.rack, pos.column_no, pos.layer_no, pos.cell_no);
    setHighlightCell(key);
    setTimeout(() => setHighlightCell((cur) => (cur === key ? null : key)), 3200);
  }, [racks]);

  // ── 自动上架 ──
  const handleAutoShelve = useCallback(async (box: ArchiveBox) => {
    if (!currentFanzongCode) return;
    setBusyBox(box.id);
    try {
      await shelveBox(box.id, 'auto', currentFanzongCode);
      await reloadStorage();
      const pos = (await fetchPositions()).find((p) => p.box_node_id === box.id);
      if (pos) focusCell(pos);
      triggerToast(`已上架：${box.boxNo} → ${pos ? locationText(pos.room, pos.rack, pos.column_no, pos.layer_no, pos.cell_no) : '新架位'}`, 'success');
    } catch (e) {
      triggerToast('上架失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setBusyBox(null);
    }
  }, [currentFanzongCode, shelveBox, reloadStorage, focusCell, triggerToast]);

  // ── 点选架位（放置模式） ──
  const handleCellClick = useCallback(async (room: string, rack: string, column: number, layer: number, cell: number) => {
    const key = cellKey(room, rack, column, layer, cell);
    const pos = positionByCell.get(key);
    if (placing) {
      if (pos) return; // 占用格不可点
      if (!currentFanzongCode) return;
      setBusyBox(placing);
      try {
        await shelveBox(placing, { room, rack, column, layer, cell }, currentFanzongCode);
        await reloadStorage();
        const placedBox = boxById.get(placing);
        focusCell({ box_node_id: placing, room, rack, column_no: column, layer_no: layer, cell_no: cell, shelved_at: '', shelved_by: '' });
        triggerToast(`已上架：${placedBox?.boxNo || ''} → ${locationText(room, rack, column, layer, cell)}`, 'success');
        setPlacing(null);
      } catch (e) {
        triggerToast('上架失败：' + (e instanceof Error ? e.message : ''), 'warning');
      } finally {
        setBusyBox(null);
      }
      return;
    }
    // 非放置模式：点占用格开详情
    if (pos) setDetailBoxId(pos.box_node_id);
  }, [placing, positionByCell, currentFanzongCode, shelveBox, reloadStorage, boxById, focusCell, triggerToast]);

  // ESC 退出放置模式
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlacing(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  // ── 盒详情 ──
  useEffect(() => {
    if (!detailBoxId) { setDetailVolumes([]); return; }
    setDetailLoading(true);
    fetchBoxVolumes(detailBoxId)
      .then(setDetailVolumes)
      .catch(() => setDetailVolumes([]))
      .finally(() => setDetailLoading(false));
  }, [detailBoxId]);

  const detailBox = detailBoxId ? boxById.get(detailBoxId) : null;
  const detailPos = detailBoxId ? positionByBox.get(detailBoxId) : undefined;

  const handleBoxAction = useCallback(async (action: 'unshelve' | 'seal' | 'unseal' | 'delete', boxId: string) => {
    if (!currentFanzongCode) return;
    setBusyBox(boxId);
    try {
      if (action === 'unshelve') {
        await unshelveBox(boxId, currentFanzongCode);
        await reloadStorage();
        triggerToast('已下架，盒回到「已封盒」状态', 'success');
      } else if (action === 'seal') {
        await sealBox(boxId, currentFanzongCode);
        triggerToast('已封盒，不再接收新卷', 'success');
      } else if (action === 'unseal') {
        await unsealBox(boxId, currentFanzongCode);
        triggerToast('已开封，可继续装盒', 'success');
      } else {
        await deleteBox(boxId, currentFanzongCode);
        triggerToast('已删除空盒', 'success');
        setDetailBoxId(null);
      }
    } catch (e) {
      triggerToast('操作失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setBusyBox(null);
    }
  }, [currentFanzongCode, unshelveBox, sealBox, unsealBox, deleteBox, reloadStorage, triggerToast]);

  // ── 删除空架（两段确认） ──
  const handleDeleteRack = useCallback(async (rack: StorageRack) => {
    if (confirmDelRack !== rack.id) {
      setConfirmDelRack(rack.id);
      setTimeout(() => setConfirmDelRack((cur) => (cur === rack.id ? null : cur)), 3000);
      return;
    }
    setConfirmDelRack(null);
    try {
      await deleteRack(rack.id);
      await reloadStorage();
      triggerToast(`已删除 ${rack.room_name} ${rack.rack_name}`, 'success');
    } catch (e) {
      triggerToast('删除失败：' + (e instanceof Error ? e.message : ''), 'warning');
    }
  }, [confirmDelRack, reloadStorage, triggerToast]);

  // ═══════════════ 渲染 ═══════════════
  const placingBox = placing ? boxById.get(placing) : null;

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ═══ 统计条 ═══ */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-xs flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center">
            <Warehouse className="w-4.5 h-4.5 text-sky-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">密集架库房</div>
            <div className="text-[11px] text-slate-400">组卷 → 归盒 → 封盒 → 上架 → 在架保管</div>
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <Stat label="密集架" value={stats.rackCount} unit="架" />
        <Stat label="总格位" value={stats.totalCells} unit="格" />
        <Stat label="在架盒" value={stats.occupied} unit="盒" accent="text-emerald-600" />
        <Stat label="待上架" value={stats.pending} unit="盒" accent={stats.pending > 0 ? 'text-amber-600' : undefined} />
        <div className="min-w-[140px]">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span>在架率</span><span className="font-bold text-sky-700">{stats.rate}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-full transition-all duration-700" style={{ width: `${stats.rate}%` }} />
          </div>
        </div>
        <div className="flex-1" />
        <button type="button" onClick={() => setShowRackModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:border-sky-300 hover:text-sky-700 transition-colors">
          <Plus className="w-3.5 h-3.5" />新增密集架
        </button>
        <button type="button" onClick={() => void reloadStorage()} title="刷新"
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ═══ 待上架区 ═══ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-800">待上架区</h3>
          <span className="text-[11px] text-slate-400">移交归盒后在此排队，上架后进入密集架在架保管</span>
          <span className="ml-auto text-xs text-slate-500">{pendingBoxes.length} 盒</span>
        </div>
        {pendingBoxes.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            暂无待上架档案盒 —— 组卷工作台「移交归盒」后盒会出现在这里
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {pendingBoxes.map((b) => {
              const cs = catStyle(b.archiveTypeCode);
              return (
                <div key={b.id}
                  className={`shrink-0 w-60 border rounded-xl p-3 transition-all ${
                    placing === b.id ? 'border-emerald-400 ring-2 ring-emerald-100 bg-emerald-50/40' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-sm ${cs.spine}`} />
                    <span className="font-mono text-xs font-bold text-slate-800 truncate">{b.boxNo}</span>
                    <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border ${
                      b.status === 'sealed' ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>{BOX_STATUS_LABEL[b.status] || b.status}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 truncate" title={b.boxName}>{b.boxName || '—'}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {cs.label} · {b.year} 年 · {b.volumeCount} 卷 / {b.totalItems ?? 0} 件
                    {b.location ? ` · 旧位 ${b.location}` : ''}
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <button type="button" onClick={() => void handleAutoShelve(b)} disabled={busyBox === b.id}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition-colors">
                      {busyBox === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      自动上架
                    </button>
                    {placing === b.id ? (
                      <button type="button" onClick={() => setPlacing(null)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-300 rounded-lg hover:bg-emerald-200 transition-colors">
                        <SquareX className="w-3 h-3" />退出选位
                      </button>
                    ) : (
                      <button type="button" onClick={() => setPlacing(b.id)} disabled={busyBox === b.id}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                        <MousePointerClick className="w-3 h-3" />点选架位
                      </button>
                    )}
                    <button type="button" onClick={() => setDetailBoxId(b.id)} title="盒详情"
                      className="px-2 py-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors">
                      <Boxes className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ 放置模式提示条 ═══ */}
      {placingBox && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs shadow-lg animate-in slide-in-from-top-2">
          <MousePointerClick className="w-4 h-4 animate-pulse" />
          {placingBox.status === 'stored' ? (
            <span>正在为 <strong className="font-mono">{placingBox.boxNo}</strong> 换架位：点击新空格位，原格位自动释放</span>
          ) : (
            <span>正在为 <strong className="font-mono">{placingBox.boxNo}</strong> 选择架位：点击密集架上的<span className="inline-block w-3 h-3 mx-1 align-middle border border-dashed border-white bg-emerald-500 rounded-sm" />空格位完成上架</span>
          )}
          <span className="text-emerald-200">ESC 或点击「退出选位」取消</span>
          <button type="button" onClick={() => setPlacing(null)} className="ml-auto p-1 hover:bg-emerald-500 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══ 密集架阵列 ═══ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Layers className="w-4 h-4 text-sky-600" />
          <h3 className="text-sm font-bold text-slate-800">密集架阵列</h3>
          <span className="text-[11px] text-slate-400">点击列打开通道查看盒位 · 密集架常态闭合（每架同时只开一列）</span>
          <div className="ml-auto flex items-center gap-1">
            {rooms.map((r) => (
              <button key={r.code} type="button" onClick={() => setActiveRoom(r.code)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  activeRoom === r.code ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
                }`}>
                {r.name}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />库房加载中…
          </div>
        ) : loadError ? (
          <div className="py-12 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
            <p className="text-sm font-medium text-slate-600">库房数据加载失败</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">{loadError}</p>
            <p className="text-[11px] text-slate-400 mt-1">若刚升级过后端，请确认 ams-server 已重启并加载最新端点</p>
            <button type="button" onClick={() => void loadAll()}
              className="mt-3 px-4 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors">
              重试
            </button>
          </div>
        ) : roomRacks.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
            本库房还没有密集架，点右上角「新增密集架」开始布局
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 items-start">
            {roomRacks.map((rack) => (
              <RackCard
                key={rack.id}
                rack={rack}
                positionByCell={positionByCell}
                boxById={boxById}
                openColumn={openCol[rack.id] ?? null}
                onToggleColumn={(col) => setOpenCol((prev) => ({ ...prev, [rack.id]: prev[rack.id] === col ? null : col }))}
                placing={!!placing}
                busy={busyBox !== null}
                onCellClick={(col, layer, cell) => void handleCellClick(rack.room, rack.rack, col, layer, cell)}
                highlightCell={highlightCell}
                onDeleteRack={() => void handleDeleteRack(rack)}
                confirmDelete={confirmDelRack === rack.id}
              />
            ))}
          </div>
        )}

        {/* 图例 */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 flex-wrap">
          {Object.entries(CATEGORY_STYLE).map(([code, cs]) => (
            <span key={code} className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-sm ${cs.spine}`} />{cs.label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" />他全宗盒
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-emerald-400 bg-emerald-50" />空格位（选位模式可点）
          </span>
        </div>
      </div>

      {/* ═══ 鉴定销毁入口（真实现已独立成页） ═══ */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 border-l-4 border-rose-500 pl-3 mb-2 flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-rose-500" />
          <span>保管期满鉴定与销毁</span>
        </h3>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          到期测算、鉴定评审、销毁执行已迁移至独立功能页（真实状态机 + 不可篡改操作日志）。
        </p>
        <button type="button" onClick={() => setActiveMainMenu('appraisal-manage')}
          className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors">
          前往「档案处置 → 鉴定销毁」
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ═══ 新增密集架弹窗 ═══ */}
      {showRackModal && (
        <RackModal
          rooms={rooms}
          racks={racks}
          onClose={() => setShowRackModal(false)}
          onCreated={async (roomCode) => {
            setShowRackModal(false);
            await reloadStorage();
            setActiveRoom(roomCode);
            triggerToast('密集架已加入库房布局', 'success');
          }}
        />
      )}

      {/* ═══ 盒详情抽屉 ═══ */}
      {detailBox && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20" onClick={() => setDetailBoxId(null)} />
          <div className="relative w-[440px] max-w-[94vw] h-full bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2.5 shrink-0">
              <div className={`w-9 h-9 rounded-xl ${catStyle(detailBox.archiveTypeCode).spine} flex items-center justify-center`}>
                <Boxes className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-sm font-bold text-slate-800 truncate">{detailBox.boxNo}</div>
                <div className="text-[11px] text-slate-400 truncate">{detailBox.boxName}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                detailBox.status === 'stored' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : detailBox.status === 'sealed' ? 'bg-slate-100 text-slate-600 border-slate-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>{BOX_STATUS_LABEL[detailBox.status] || detailBox.status}</span>
              <button type="button" onClick={() => setDetailBoxId(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* 元信息 */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <InfoItem label="档案类别" value={`${catStyle(detailBox.archiveTypeCode).label}（${detailBox.archiveTypeCode}）`} />
                <InfoItem label="年度 / 期限" value={`${detailBox.year} 年 · ${detailBox.retention || '—'}`} />
                <InfoItem label="卷数 / 件数" value={`${detailBox.volumeCount} 卷 / ${detailBox.totalItems ?? 0} 件`} />
                <InfoItem label="建档日期" value={detailBox.createdDate || '—'} />
              </div>

              {/* 架位 */}
              <div className={`rounded-xl border p-3.5 ${detailPos ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1.5">
                  <MapPin className={`w-3.5 h-3.5 ${detailPos ? 'text-emerald-600' : 'text-slate-400'}`} />
                  存放架位
                </div>
                {detailPos ? (
                  <div className="text-xs text-slate-600 space-y-0.5">
                    <div className="font-semibold text-emerald-700">
                      {locationText(detailPos.room, detailPos.rack, detailPos.column_no, detailPos.layer_no, detailPos.cell_no)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      上架时间 {detailPos.shelved_at ? detailPos.shelved_at.replace('T', ' ').slice(0, 19) : '—'}
                      {detailPos.shelved_by ? ` · 操作人 ${detailPos.shelved_by}` : ''}
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">尚未上架（在「待上架区」排队）</div>
                )}
              </div>

              {/* 盒内案卷 */}
              <div>
                <div className="text-xs font-bold text-slate-700 mb-2">盒内案卷（{detailVolumes.length}）</div>
                {detailLoading ? (
                  <div className="py-6 text-center text-slate-400 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-1.5" />加载中…</div>
                ) : detailVolumes.length === 0 ? (
                  <div className="py-4 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">空盒</div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 divide-x divide-slate-200/80">
                          <th className="px-4 py-3 text-left text-[13px] font-semibold">档号</th>
                          <th className="px-4 py-3 text-left text-[13px] font-semibold">题名</th>
                          <th className="px-4 py-3 text-right text-[13px] font-semibold w-14">件数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailVolumes.map((v) => (
                          <tr key={v.nodeId} className="border-b border-slate-200/60 last:border-0 divide-x divide-slate-100 hover:bg-sky-50/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-[13px] text-slate-600">{v.volumeCode || '（未赋号）'}</td>
                            <td className="px-4 py-3 text-sm text-slate-800 max-w-[140px] truncate" title={v.title}>{v.title || '—'}</td>
                            <td className="px-4 py-3 text-right font-mono text-[13px] text-slate-600">{v.totalItems ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* 状态操作（状态机由服务端强制：在架须先下架，空盒才可删） */}
            <div className="px-5 py-4 border-t border-slate-200 flex items-center gap-2 shrink-0">
              {detailBox.status === 'stored' && (
                <>
                  <ActionButton icon={<MapPin className="w-3.5 h-3.5" />} label="换架位" busy={busyBox === detailBox.id}
                    onClick={() => { setPlacing(detailBox.id); setDetailBoxId(null); }}
                    cls="text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" />
                  <ActionButton icon={<Undo2 className="w-3.5 h-3.5" />} label="下架" busy={busyBox === detailBox.id}
                    onClick={() => void handleBoxAction('unshelve', detailBox.id)}
                    cls="text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100" />
                </>
              )}
              {detailBox.status === 'active' && (
                <ActionButton icon={<Lock className="w-3.5 h-3.5" />} label="封盒" busy={busyBox === detailBox.id}
                  onClick={() => void handleBoxAction('seal', detailBox.id)}
                  cls="text-slate-700 bg-slate-100 border-slate-200 hover:bg-slate-200" />
              )}
              {detailBox.status === 'sealed' && (
                <ActionButton icon={<LockOpen className="w-3.5 h-3.5" />} label="开封" busy={busyBox === detailBox.id}
                  onClick={() => void handleBoxAction('unseal', detailBox.id)}
                  cls="text-sky-700 bg-sky-50 border-sky-200 hover:bg-sky-100" />
              )}
              <div className="flex-1" />
              {detailBox.volumeCount === 0 && detailBox.status !== 'stored' && (
                <ActionButton icon={<Trash2 className="w-3.5 h-3.5" />} label="删除空盒" busy={busyBox === detailBox.id}
                  onClick={() => void handleBoxAction('delete', detailBox.id)}
                  cls="text-red-600 bg-red-50 border-red-200 hover:bg-red-100" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── 统计小卡 ──
const Stat: React.FC<{ label: string; value: number; unit: string; accent?: string }> = ({ label, value, unit, accent }) => (
  <div>
    <div className="text-[11px] text-slate-400">{label}</div>
    <div className={`text-lg font-bold leading-tight ${accent || 'text-slate-800'}`}>
      {value}<span className="text-[11px] font-normal text-slate-400 ml-0.5">{unit}</span>
    </div>
  </div>
);

const InfoItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-50 rounded-lg px-3 py-2">
    <div className="text-[10px] text-slate-400">{label}</div>
    <div className="font-medium text-slate-700 mt-0.5">{value}</div>
  </div>
);

const ActionButton: React.FC<{ icon: React.ReactNode; label: string; busy?: boolean; onClick: () => void; cls: string }> = ({
  icon, label, busy, onClick, cls,
}) => (
  <button type="button" onClick={onClick} disabled={busy}
    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg disabled:opacity-50 transition-colors ${cls}`}>
    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
    {label}
  </button>
);

// ═══════════════════════════════════════════════════════════
// 密集架卡片（一列通道可开合）
// ═══════════════════════════════════════════════════════════
const RackCard: React.FC<{
  rack: StorageRack;
  positionByCell: Map<string, BoxPosition>;
  boxById: Map<string, ArchiveBox>;
  openColumn: number | null;
  onToggleColumn: (col: number) => void;
  placing: boolean;
  busy: boolean;
  onCellClick: (column: number, layer: number, cell: number) => void;
  highlightCell: string | null;
  onDeleteRack: () => void;
  confirmDelete: boolean;
}> = ({
  rack, positionByCell, boxById, openColumn, onToggleColumn, placing, busy,
  onCellClick, highlightCell, onDeleteRack, confirmDelete,
}) => {
  const cols = Array.from({ length: rack.column_count }, (_, i) => i + 1);
  const layers = Array.from({ length: rack.layer_count }, (_, i) => rack.layer_count - i); // 顶层在上，层1在底
  const capacity = rack.column_count * rack.layer_count * rack.cell_count;

  // 本架占用
  const rackPositions = useMemo(() => {
    const list: BoxPosition[] = [];
    positionByCell.forEach((p) => {
      if (p.room === rack.room && p.rack === rack.rack) list.push(p);
    });
    return list;
  }, [positionByCell, rack]);
  const occupied = rackPositions.length;
  const rate = capacity > 0 ? occupied / capacity : 0;

  const colOccupancy = (col: number) => rackPositions.filter((p) => p.column_no === col).length;

  return (
    <div className="shrink-0 border border-slate-300 rounded-xl overflow-hidden bg-gradient-to-b from-slate-100 to-slate-50 shadow-sm">
      {/* 架头（金属牌） */}
      <div className="px-3 py-2.5 bg-gradient-to-r from-slate-700 to-slate-600 text-white flex items-center gap-2">
        <span className="text-sm font-black tracking-wider">{rack.rack}</span>
        <div className="text-[10px] text-slate-300 leading-tight">
          <div>{rack.rack_name} · {rack.column_count}列×{rack.layer_count}层×{rack.cell_count}位</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={occupied > 0 ? 'text-emerald-300 font-semibold' : ''}>{occupied}/{capacity}</span>
            <span className="w-14 h-1 bg-slate-500 rounded-full overflow-hidden inline-block align-middle">
              <span className="block h-full bg-emerald-400 rounded-full transition-all duration-500" style={{ width: `${Math.round(rate * 100)}%` }} />
            </span>
          </div>
        </div>
        {occupied === 0 && (
          <button
            type="button"
            onClick={onDeleteRack}
            title={confirmDelete ? '再次点击确认删除' : '删除空架'}
            className={`ml-auto p-1 rounded transition-colors ${
              confirmDelete ? 'text-red-300 bg-red-500/30 animate-pulse' : 'text-slate-400 hover:text-red-300 hover:bg-slate-500/50'
            }`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* 架体：列通道 */}
      <div className="flex items-stretch gap-[3px] p-2">
        {cols.map((col) => {
          const isOpen = openColumn === col;
          const colOcc = colOccupancy(col);
          const colCap = rack.layer_count * rack.cell_count;
          if (!isOpen) {
            // 闭合列（密集架常态：薄板，占空染色）
            return (
              <button
                key={col}
                type="button"
                onClick={() => onToggleColumn(col)}
                title={`${col} 列 · 已放 ${colOcc}/${colCap}，点击打开通道`}
                className="relative w-[18px] rounded-sm border border-slate-300 bg-gradient-to-b from-slate-200 to-slate-300 hover:from-sky-100 hover:to-sky-200 hover:border-sky-400 transition-all duration-300 cursor-pointer shrink-0 group"
                style={{ height: `${rack.layer_count * 34 + 18}px` }}
              >
                {/* 占用染色（自下而上） */}
                <span
                  className="absolute bottom-0 left-0 right-0 bg-emerald-400/50 rounded-b-sm transition-all duration-500"
                  style={{ height: `${Math.round((colOcc / colCap) * 100)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-slate-500 group-hover:text-sky-700 [writing-mode:vertical-lr]">{col}列</span>
                </span>
              </button>
            );
          }
          // 打开列（通道展开动画：宽度从薄板到面板）
          return (
            <div
              key={col}
              className="rounded-md border border-sky-300 bg-white shadow-md transition-all duration-500 overflow-hidden shrink-0"
              style={{ width: `${rack.cell_count * 24 + 34}px` }}
            >
              <button
                type="button"
                onClick={() => onToggleColumn(col)}
                className="w-full flex items-center justify-between px-2 py-1 bg-sky-50 border-b border-sky-100 text-[10px] font-bold text-sky-700 hover:bg-sky-100 transition-colors"
                title="点击闭合通道"
              >
                <span>{col} 列 · 通道已打开</span>
                <X className="w-3 h-3" />
              </button>
              <div className="p-1.5 space-y-[3px] animate-in fade-in duration-300">
                {layers.map((layer) => (
                  <div key={layer} className="flex items-center gap-1">
                    <span className="w-5 text-[9px] text-slate-400 text-right shrink-0">{layer}层</span>
                    <div className="flex gap-[3px] border-b border-slate-200 pb-[3px]">
                      {Array.from({ length: rack.cell_count }, (_, i) => i + 1).map((cell) => {
                        const key = cellKey(rack.room, rack.rack, col, layer, cell);
                        const pos = positionByCell.get(key);
                        const box = pos ? boxById.get(pos.box_node_id) : undefined;
                        const highlighted = highlightCell === key;
                        if (pos) {
                          return (
                            <button
                              key={cell}
                              type="button"
                              onClick={() => onCellClick(col, layer, cell)}
                              title={box
                                ? `${box.boxNo}\n${box.boxName}\n${catStyle(box.archiveTypeCode).label} · ${box.volumeCount}卷/${box.totalItems ?? 0}件`
                                : '他全宗盒（不在当前全宗视图）'}
                              className={`w-[21px] h-[30px] rounded-[3px] shadow-sm transition-all duration-300 hover:scale-110 hover:shadow-md cursor-pointer ${
                                box ? catStyle(box.archiveTypeCode).spine : 'bg-slate-400'
                              } ${highlighted ? 'ring-2 ring-emerald-400 ring-offset-1 animate-pulse' : ''} ${placing ? 'opacity-40' : ''}`}
                            />
                          );
                        }
                        return (
                          <button
                            key={cell}
                            type="button"
                            disabled={!placing || busy}
                            onClick={() => onCellClick(col, layer, cell)}
                            title={`${locationText(rack.room, rack.rack, col, layer, cell)}（空）`}
                            className={`w-[21px] h-[30px] rounded-[3px] border transition-all duration-200 ${
                              placing
                                ? 'border-dashed border-emerald-400 bg-emerald-50 animate-pulse cursor-pointer hover:bg-emerald-200 hover:scale-110'
                                : 'border-slate-200 bg-slate-50 cursor-default'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// 新增密集架弹窗
// ═══════════════════════════════════════════════════════════
const RackModal: React.FC<{
  rooms: { code: string; name: string }[];
  racks: StorageRack[];
  onClose: () => void;
  onCreated: (roomCode: string) => Promise<void>;
}> = ({ rooms, racks, onClose, onCreated }) => {
  const [room, setRoom] = useState(rooms[0]?.code || '');
  // 推荐架号：该库房内下一个字母
  const nextRackCode = (rm: string) => {
    const used = new Set(racks.filter((r) => r.room === rm).map((r) => r.rack));
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(65 + i);
      if (!used.has(c)) return c;
    }
    return '';
  };
  const [rack, setRack] = useState(() => nextRackCode(rooms[0]?.code || ''));
  const [columns, setColumns] = useState(6);
  const [layers, setLayers] = useState(6);
  const [cells, setCells] = useState(8);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!room) { setErr('请先选择库房（库房间在 系统管理→库房配置 维护）'); return; }
    if (!rack.trim()) { setErr('架号不能为空'); return; }
    setBusy(true);
    setErr('');
    try {
      const roomName = rooms.find((r) => r.code === room)?.name || '';
      await createRack({ room, roomName, rack: rack.trim().toUpperCase(), columnCount: columns, layerCount: layers, cellCount: cells });
      await onCreated(room);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
            <Warehouse className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">新增密集架</h3>
            <p className="text-xs text-slate-500 mt-0.5">容量 = 列 × 层 × 位，上架即按格位定位</p>
          </div>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">所属库房（在 系统管理→库房配置 维护）</span>
            <select value={room} onChange={(e) => { setRoom(e.target.value); setRack(nextRackCode(e.target.value)); }}
              className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white">
              {rooms.map((r) => (
                <option key={r.code} value={r.code}>{r.name}（{r.code}）</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">架号（同库房内唯一，创建后不可改）</span>
            <input value={rack} onChange={(e) => setRack(e.target.value)} maxLength={4}
              className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg font-mono uppercase" />
          </label>
          <div className="grid grid-cols-3 gap-3">
            {([
              ['列数', columns, setColumns, 26],
              ['层数', layers, setLayers, 12],
              ['每层盒位', cells, setCells, 40],
            ] as const).map(([label, val, setter, max]) => (
              <label key={label} className="block">
                <span className="text-xs font-medium text-slate-600">{label}</span>
                <input type="number" min={1} max={max} value={val}
                  onChange={(e) => setter(Math.min(Math.max(Number(e.target.value) || 1, 1), max))}
                  className="mt-1 w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg" />
              </label>
            ))}
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            本架容量：<strong className="text-sky-700">{columns * layers * cells}</strong> 盒
          </div>
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        </div>
        <div className="flex items-center gap-3 justify-end mt-6">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
            取消
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 disabled:opacity-50 transition-colors shadow-sm">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            创建密集架
          </button>
        </div>
      </div>
    </div>
  );
};
