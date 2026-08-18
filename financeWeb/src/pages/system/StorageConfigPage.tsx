/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * StorageConfigPage — 档案库房配置（系统管理，2026-08-18）
 *
 * 库房布局全配置化（不写死）：
 *   库房（增/删/改名） → 密集架（增/删/改名/改维度：列×层×每层盒位）。
 *
 * 联动规则（服务端强制，本页只做显隐与提示）：
 *   - 库房号/架号创建后不可改（被架位引用），名称随时可改；
 *   - 删除库房：库房内不得有架（有架须先删架空架）；
 *   - 删除密集架：架上不得有在架盒；
 *   - 缩小架维度：新边界外格位上不得有在架盒（须先换架位/下架）；
 *   - 扩容自由，随时生效（实体库房页按布局动态渲染）。
 *
 * 布局：左库房导航 + 右单库房面板（主从，非长龙），与档号/组卷盒号配置同版式。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Warehouse, Plus, Trash2, Loader2, Check, X, AlertTriangle,
  Boxes, ArrowRight, Lock, Info,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import {
  fetchRooms, fetchRacks, fetchPositions,
  createRoom, renameRoom, deleteRoom,
  createRack, updateRack, deleteRack,
  type StorageRoom, type StorageRack, type BoxPosition,
} from '../../services/storageService';

interface StorageConfigPageProps {
  triggerToast?: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

/** 架编辑草稿（与 rack 原值比对判 dirty） */
interface RackDraft {
  rackName: string;
  columnCount: number;
  layerCount: number;
  cellCount: number;
}

const toDraft = (r: StorageRack): RackDraft => ({
  rackName: r.rack_name,
  columnCount: r.column_count,
  layerCount: r.layer_count,
  cellCount: r.cell_count,
});

const DIM_LIMITS = { columnCount: 26, layerCount: 12, cellCount: 40 } as const;

const StorageConfigPage: React.FC<StorageConfigPageProps> = ({ triggerToast }) => {
  const setActiveMainMenu = useAppStore((s) => s.setActiveMainMenu);
  const toast = useCallback(
    (msg: string, type: 'success' | 'info' | 'warning' = 'success') => triggerToast?.(msg, type),
    [triggerToast],
  );

  const [rooms, setRooms] = useState<StorageRoom[]>([]);
  const [racks, setRacks] = useState<StorageRack[]>([]);
  const [positions, setPositions] = useState<BoxPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRoom, setActiveRoom] = useState('');

  // 编辑态
  const [roomNameDraft, setRoomNameDraft] = useState('');
  const [drafts, setDrafts] = useState<Record<string, RackDraft>>({});
  const [rackErr, setRackErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null); // 'room:xx' | rackId

  // 新增表单
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoomCode, setNewRoomCode] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRackCode, setNewRackCode] = useState('');
  const [newRackDims, setNewRackDims] = useState({ columnCount: 6, layerCount: 6, cellCount: 8 });

  const reload = useCallback(async () => {
    const [rm, rk, ps] = await Promise.all([fetchRooms(), fetchRacks(), fetchPositions()]);
    setRooms(rm);
    setRacks(rk);
    setPositions(ps);
    setDrafts((prev) => {
      const next = { ...prev };
      rk.forEach((r) => { if (!next[r.id]) next[r.id] = toDraft(r); });
      return next;
    });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await reload();
      } catch (e) {
        toast('库房配置加载失败：' + (e instanceof Error ? e.message : ''), 'warning');
      } finally {
        setLoading(false);
      }
    })();
  }, [reload, toast]);

  // 默认选中第一个库房
  useEffect(() => {
    if (!activeRoom && rooms.length > 0) setActiveRoom(rooms[0].room);
  }, [rooms, activeRoom]);

  const room = useMemo(() => rooms.find((r) => r.room === activeRoom) || null, [rooms, activeRoom]);
  const roomRacks = useMemo(() => racks.filter((r) => r.room === activeRoom), [racks, activeRoom]);

  // 名称草稿随选中房间切换
  useEffect(() => {
    setRoomNameDraft(room?.room_name || '');
    setRackErr({});
    setConfirmDel(null);
  }, [room?.room, room?.room_name]);

  const occupiedOf = useCallback(
    (rackCode: string) => positions.filter((p) => p.room === activeRoom && p.rack === rackCode).length,
    [positions, activeRoom],
  );

  const roomCapacity = useMemo(
    () => roomRacks.reduce((s, r) => s + r.column_count * r.layer_count * r.cell_count, 0),
    [roomRacks],
  );

  /** 该库房下一个可用架号（字母序） */
  const nextRackLetter = useMemo(() => {
    const used = new Set(roomRacks.map((r) => r.rack));
    for (let i = 0; i < 26; i++) {
      const c = String.fromCharCode(65 + i);
      if (!used.has(c)) return c;
    }
    return '';
  }, [roomRacks]);

  useEffect(() => {
    setNewRackCode(nextRackLetter);
  }, [nextRackLetter]);

  /** 下一个库房号建议（数字递增） */
  const nextRoomCode = useMemo(() => {
    const nums = rooms.map((r) => parseInt(r.room)).filter((n) => !isNaN(n));
    return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0');
  }, [rooms]);

  // ── 库房操作 ──
  const handleCreateRoom = async () => {
    const code = newRoomCode.trim() || nextRoomCode;
    setBusy('add-room');
    try {
      await createRoom(code, newRoomName.trim() || undefined);
      await reload();
      setActiveRoom(code);
      setShowAddRoom(false);
      setNewRoomCode('');
      setNewRoomName('');
      toast(`库房 ${code} 已创建，可继续添加密集架`);
    } catch (e) {
      toast('创建库房失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setBusy(null);
    }
  };

  const handleRenameRoom = async () => {
    if (!room || !roomNameDraft.trim() || roomNameDraft.trim() === room.room_name) return;
    setBusy('rename-room');
    try {
      await renameRoom(room.room, roomNameDraft.trim());
      await reload();
      toast(`库房已更名为「${roomNameDraft.trim()}」`);
    } catch (e) {
      toast('更名失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteRoom = async () => {
    if (!room) return;
    const key = `room:${room.room}`;
    if (confirmDel !== key) {
      setConfirmDel(key);
      setTimeout(() => setConfirmDel((cur) => (cur === key ? null : cur)), 3000);
      return;
    }
    setConfirmDel(null);
    setBusy('del-room');
    try {
      await deleteRoom(room.room);
      await reload();
      setActiveRoom('');
      toast(`库房 ${room.room_name} 已删除`);
    } catch (e) {
      toast('删除库房失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setBusy(null);
    }
  };

  // ── 架操作 ──
  const setDraft = (id: string, patch: Partial<RackDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setRackErr((prev) => ({ ...prev, [id]: '' }));
  };

  const isDirty = (r: StorageRack) => {
    const d = drafts[r.id];
    return !!d && (d.rackName !== r.rack_name || d.columnCount !== r.column_count
      || d.layerCount !== r.layer_count || d.cellCount !== r.cell_count);
  };

  const handleSaveRack = async (r: StorageRack) => {
    const d = drafts[r.id];
    if (!d) return;
    setBusy(r.id);
    try {
      await updateRack(r.id, d);
      await reload();
      toast(`${r.rack_name} 已保存（容量 ${d.columnCount * d.layerCount * d.cellCount} 盒）`);
    } catch (e) {
      setRackErr((prev) => ({ ...prev, [r.id]: e instanceof Error ? e.message : '保存失败' }));
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteRack = async (r: StorageRack) => {
    if (confirmDel !== r.id) {
      setConfirmDel(r.id);
      setTimeout(() => setConfirmDel((cur) => (cur === r.id ? null : cur)), 3000);
      return;
    }
    setConfirmDel(null);
    setBusy(r.id);
    try {
      await deleteRack(r.id);
      await reload();
      toast(`${r.rack_name} 已删除`);
    } catch (e) {
      toast('删除架失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setBusy(null);
    }
  };

  const handleCreateRack = async () => {
    if (!room || !newRackCode.trim()) return;
    setBusy('add-rack');
    try {
      await createRack({
        room: room.room,
        roomName: room.room_name,
        rack: newRackCode.trim().toUpperCase(),
        ...newRackDims,
      });
      await reload();
      toast(`已在「${room.room_name}」新增 ${newRackCode.trim().toUpperCase()} 架`);
    } catch (e) {
      toast('新增架失败：' + (e instanceof Error ? e.message : ''), 'warning');
    } finally {
      setBusy(null);
    }
  };

  // ═══════════════ 渲染 ═══════════════
  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <Warehouse className="w-5 h-5 text-sky-600" />
        <h1 className="text-base font-bold text-slate-800">库房配置</h1>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
          库房号/架号创建后不可改（被架位引用）
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setActiveMainMenu('digital-warehouse')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
        >
          查看实体库房 <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 w-full">
        <div className="max-w-6xl mx-auto flex gap-4 items-start">
          {/* ══ 左：库房导航 ══ */}
          <aside className="w-64 shrink-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-100 text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <Warehouse className="w-3.5 h-3.5 text-slate-400" />库房（{rooms.length}）
            </div>
            <nav className="max-h-[60vh] overflow-y-auto p-2 space-y-0.5">
              {rooms.map((r) => (
                <button
                  key={r.room}
                  type="button"
                  onClick={() => setActiveRoom(r.room)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                    activeRoom === r.room ? 'bg-sky-50 border border-sky-200' : 'border border-transparent hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 ${
                    activeRoom === r.room ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>{r.room}</span>
                  <span className={`flex-1 text-xs font-medium truncate ${activeRoom === r.room ? 'text-sky-700' : 'text-slate-600'}`}>
                    {r.room_name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                    {r.rack_count} 架
                  </span>
                  {r.box_count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 shrink-0">
                      {r.box_count} 盒
                    </span>
                  )}
                </button>
              ))}
              {rooms.length === 0 && !loading && (
                <div className="px-3 py-6 text-center text-xs text-slate-400">暂无库房，请先新建</div>
              )}
            </nav>

            {/* 新增库房 */}
            <div className="p-2 border-t border-slate-100">
              {showAddRoom ? (
                <div className="p-2 space-y-2 bg-slate-50 rounded-lg">
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="text-[10px] text-slate-500">库房号</span>
                      <input value={newRoomCode} onChange={(e) => setNewRoomCode(e.target.value)} placeholder={nextRoomCode}
                        className="mt-0.5 w-full px-2 py-1 text-xs border border-slate-300 rounded font-mono" maxLength={8} />
                    </label>
                    <label className="block col-span-2">
                      <span className="text-[10px] text-slate-500">库房名称</span>
                      <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder={`第${newRoomCode || nextRoomCode}库房`}
                        className="mt-0.5 w-full px-2 py-1 text-xs border border-slate-300 rounded" />
                    </label>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => void handleCreateRoom()} disabled={busy === 'add-room'}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50">
                      {busy === 'add-room' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}创建
                    </button>
                    <button type="button" onClick={() => setShowAddRoom(false)}
                      className="px-2 py-1.5 text-[11px] text-slate-500 bg-white border border-slate-200 rounded-lg hover:bg-slate-100">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => { setShowAddRoom(true); setNewRoomCode(nextRoomCode); }}
                  className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors">
                  <Plus className="w-3.5 h-3.5" />新增库房
                </button>
              )}
            </div>
          </aside>

          {/* ══ 右：单库房面板 ══ */}
          <div className="flex-1 min-w-0 space-y-4">
            {loading ? (
              <div className="py-16 text-center text-slate-400 text-sm bg-white border border-slate-200 rounded-xl">
                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />加载中…
              </div>
            ) : !room ? (
              <div className="py-16 text-center text-slate-400 text-sm bg-white border border-slate-200 rounded-xl">
                请选择或新建一个库房
              </div>
            ) : (
              <>
                {/* 库房头 */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center text-sm font-black shadow-sm">
                      {room.room}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <input
                          value={roomNameDraft}
                          onChange={(e) => setRoomNameDraft(e.target.value)}
                          className="text-base font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-sky-400 focus:outline-none px-0.5 w-48"
                          title="库房名称（可编辑）"
                        />
                        {roomNameDraft.trim() !== room.room_name && roomNameDraft.trim() && (
                          <button type="button" onClick={() => void handleRenameRoom()} disabled={busy === 'rename-room'}
                            className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50">
                            {busy === 'rename-room' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}保存名称
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Lock className="w-3 h-3" />库房号创建后不可改（被密集架与架位引用）
                      </div>
                    </div>
                    <div className="flex-1" />
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>密集架 <strong className="text-slate-800">{room.rack_count}</strong> 架</span>
                      <span>总容量 <strong className="text-slate-800">{roomCapacity}</strong> 盒</span>
                      <span>在架 <strong className="text-emerald-600">{room.box_count}</strong> 盒</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteRoom()}
                      disabled={room.rack_count > 0 || busy === 'del-room'}
                      title={room.rack_count > 0 ? `库房内还有 ${room.rack_count} 架，须先删除全部架空架` : '删除空库房'}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors disabled:opacity-40 ${
                        confirmDel === `room:${room.room}`
                          ? 'text-white bg-red-500 border-red-500 animate-pulse'
                          : 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100'
                      }`}
                    >
                      {busy === 'del-room' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      {confirmDel === `room:${room.room}` ? '再点一次确认删除' : '删除库房'}
                    </button>
                  </div>
                </div>

                {/* 密集架列表 */}
                {roomRacks.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl">
                    本库房还没有密集架，在下方「新增密集架」创建
                  </div>
                )}
                {roomRacks.map((r) => {
                  const d = drafts[r.id] || toDraft(r);
                  const occupied = occupiedOf(r.rack);
                  const capacity = r.column_count * r.layer_count * r.cell_count;
                  const newCapacity = d.columnCount * d.layerCount * d.cellCount;
                  const dirty = isDirty(r);
                  const delBlocked = occupied > 0;
                  return (
                    <div key={r.id} className={`bg-white border rounded-xl p-4 transition-colors ${dirty ? 'border-sky-300' : 'border-slate-200'}`}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="w-9 h-9 rounded-lg bg-slate-700 text-white flex items-center justify-center text-sm font-black">
                          {r.rack}
                        </span>
                        <input
                          value={d.rackName}
                          onChange={(e) => setDraft(r.id, { rackName: e.target.value })}
                          className="text-sm font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-sky-400 focus:outline-none px-0.5 w-32"
                          title="架名称（可编辑）"
                        />
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          {([
                            ['列', 'columnCount', d.columnCount, DIM_LIMITS.columnCount],
                            ['层', 'layerCount', d.layerCount, DIM_LIMITS.layerCount],
                            ['位/层', 'cellCount', d.cellCount, DIM_LIMITS.cellCount],
                          ] as const).map(([label, field, val, max]) => (
                            <label key={field} className="flex items-center gap-1">
                              <span className="text-slate-400">{label}</span>
                              <input
                                type="number" min={1} max={max} value={val}
                                onChange={(e) => setDraft(r.id, { [field]: Math.min(Math.max(Number(e.target.value) || 1, 1), max) } as Partial<RackDraft>)}
                                className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded-lg text-center font-mono"
                              />
                            </label>
                          ))}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          容量 <strong className={dirty ? 'text-sky-700' : 'text-slate-700'}>{dirty ? newCapacity : capacity}</strong> 盒
                          {dirty && newCapacity !== capacity && <span className="text-slate-300">（原 {capacity}）</span>}
                        </span>
                        <div className="flex-1" />
                        {/* 占用条 */}
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <Boxes className="w-3.5 h-3.5 text-emerald-500" />
                          在架 {occupied} 盒
                          <span className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden inline-block align-middle">
                            <span className="block h-full bg-emerald-400 rounded-full transition-all duration-500"
                              style={{ width: `${capacity > 0 ? Math.round((occupied / capacity) * 100) : 0}%` }} />
                          </span>
                        </div>
                        {dirty && (
                          <button type="button" onClick={() => void handleSaveRack(r)} disabled={busy === r.id}
                            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50">
                            {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            保存修改
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDeleteRack(r)}
                          disabled={delBlocked || busy === r.id}
                          title={delBlocked ? `架上还有 ${occupied} 盒在架，须全部下架后才能删除` : '删除空架'}
                          className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors disabled:opacity-40 ${
                            confirmDel === r.id
                              ? 'text-white bg-red-500 border-red-500 animate-pulse'
                              : 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100'
                          }`}
                        >
                          {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          {confirmDel === r.id ? '再点一次确认' : '删除'}
                        </button>
                      </div>
                      {rackErr[r.id] && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                          <AlertTriangle className="w-3 h-3 shrink-0" />{rackErr[r.id]}
                        </div>
                      )}
                      {dirty && (
                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                          <Info className="w-3 h-3" />
                          扩容立即生效；缩容时新边界外格位上不得在架盒（服务端强校验）
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 新增密集架 */}
                <div className="bg-white border border-dashed border-slate-300 rounded-xl p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="w-9 h-9 rounded-lg border-2 border-dashed border-sky-300 text-sky-600 flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </span>
                    <span className="text-sm font-bold text-slate-700">新增密集架</span>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      架号
                      <input value={newRackCode} onChange={(e) => setNewRackCode(e.target.value)} maxLength={4}
                        className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded-lg text-center font-mono uppercase" />
                    </label>
                    {([
                      ['列', 'columnCount', newRackDims.columnCount, DIM_LIMITS.columnCount],
                      ['层', 'layerCount', newRackDims.layerCount, DIM_LIMITS.layerCount],
                      ['位/层', 'cellCount', newRackDims.cellCount, DIM_LIMITS.cellCount],
                    ] as const).map(([label, field, val, max]) => (
                      <label key={field} className="flex items-center gap-1 text-xs text-slate-500">
                        {label}
                        <input type="number" min={1} max={max} value={val}
                          onChange={(e) => setNewRackDims((prev) => ({ ...prev, [field]: Math.min(Math.max(Number(e.target.value) || 1, 1), max) }))}
                          className="w-14 px-1.5 py-1 text-xs border border-slate-300 rounded-lg text-center font-mono" />
                      </label>
                    ))}
                    <span className="text-[11px] text-slate-400">
                      容量 <strong className="text-sky-700">{newRackDims.columnCount * newRackDims.layerCount * newRackDims.cellCount}</strong> 盒
                    </span>
                    <div className="flex-1" />
                    <button type="button" onClick={() => void handleCreateRack()} disabled={busy === 'add-rack' || !newRackCode.trim()}
                      className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50">
                      {busy === 'add-rack' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      创建密集架
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StorageConfigPage;
