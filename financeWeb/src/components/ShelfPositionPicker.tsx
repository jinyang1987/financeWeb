/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ShelfPositionPicker — 密集架格位选择器（2026-08-20）
 *
 * 弹窗场景使用的紧凑版密集架点选器（移交对话框「指定架位」等）：
 *   库房 → 架 → 列 → 层×位 格阵；占用格禁用、空格可点、选中格高亮。
 * 数据与「实体档案库房」页同源（/storage/racks + /storage/positions），
 * 视觉语言与 RackCard 保持一致（闭合列薄板 + 占空染色 + 格位小块）。
 *
 * 纯受控组件：选中值由父组件持有（ShelfPosition | null），
 * 点空格选中、再点已选格取消选择；占用互斥最终由服务端 uq_box_cell 强校验。
 */

import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { cellKey, locationText, type BoxPosition, type StorageRack } from '../services/storageService';
import type { ShelfPosition } from '../services/boxService';

interface ShelfPositionPickerProps {
  racks: StorageRack[];
  positions: BoxPosition[];
  value: ShelfPosition | null;
  onChange: (pos: ShelfPosition | null) => void;
}

const ShelfPositionPicker: React.FC<ShelfPositionPickerProps> = ({ racks, positions, value, onChange }) => {
  // ── 浏览态（不即写回 value：库/架/列切换只是浏览，点空格才算选中） ──
  const [browseRoom, setBrowseRoom] = useState('');
  const [browseRack, setBrowseRack] = useState('');
  const [browseColumn, setBrowseColumn] = useState<number | null>(null);

  // ── 库房列表（按 racks 派生，保持 sort 序） ──
  const rooms = useMemo(() => {
    const m = new Map<string, string>();
    racks.forEach((r) => { if (!m.has(r.room)) m.set(r.room, r.room_name); });
    return Array.from(m, ([code, name]) => ({ code, name }));
  }, [racks]);

  // 有效浏览值：手动选择 > 已选格位所在位置 > 首项
  const room = browseRoom || (value && rooms.some((r) => r.code === value.room) ? value.room : '') || rooms[0]?.code || '';
  const roomRacks = useMemo(() => racks.filter((r) => r.room === room), [racks, room]);
  const rack = browseRack || (value && roomRacks.some((r) => r.rack === value.rack) ? value.rack : '') || roomRacks[0]?.rack || '';
  const rackRow = roomRacks.find((r) => r.rack === rack) || null;

  // ── 占用映射 ──
  const occupied = useMemo(() => {
    const s = new Set<string>();
    positions.forEach((p) => s.add(cellKey(p.room, p.rack, p.column_no, p.layer_no, p.cell_no)));
    return s;
  }, [positions]);

  const rackStats = useMemo(() => {
    const m = new Map<string, { occupied: number; capacity: number }>();
    racks.forEach((r) => {
      const key = `${r.room}|${r.rack}`;
      m.set(key, { occupied: 0, capacity: r.column_count * r.layer_count * r.cell_count });
    });
    positions.forEach((p) => {
      const stat = m.get(`${p.room}|${p.rack}`);
      if (stat) stat.occupied++;
    });
    return m;
  }, [racks, positions]);

  if (racks.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
        库房尚未配置密集架
      </div>
    );
  }

  const curStat = rackRow ? rackStats.get(`${rackRow.room}|${rackRow.rack}`) : null;
  const column = browseColumn
    ?? (value && value.room === room && value.rack === rack ? value.column : null)
    ?? 1;

  const selectRoom = (code: string) => {
    setBrowseRoom(code);
    setBrowseRack('');
    setBrowseColumn(null);
  };
  const selectRack = (code: string) => {
    setBrowseRack(code);
    setBrowseColumn(null);
  };

  return (
    <div className="space-y-2.5">
      {/* 库房切换 */}
      {rooms.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap">
          {rooms.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => selectRoom(r.code)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
                room === r.code ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {/* 架选择（含空位数） */}
      <div className="flex items-center gap-1 flex-wrap">
        {roomRacks.map((r) => {
          const stat = rackStats.get(`${r.room}|${r.rack}`);
          const free = stat ? stat.capacity - stat.occupied : 0;
          const active = rack === r.rack;
          return (
            <button
              key={r.rack}
              type="button"
              onClick={() => selectRack(r.rack)}
              title={`${r.rack_name} · ${r.column_count}列×${r.layer_count}层×${r.cell_count}位 · 空 ${free} 格`}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                active
                  ? 'border-sky-400 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
            >
              {r.rack} 架
              <span className={`ml-1 font-mono ${free === 0 ? 'text-red-400' : 'text-slate-400'}`}>
                空{free}
              </span>
            </button>
          );
        })}
      </div>

      {rackRow && (
        <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/60 space-y-2">
          {/* 列薄板（点列展开格阵；占空染色与库房页一致） */}
          <div className="flex items-stretch gap-1 overflow-x-auto pb-0.5">
            {Array.from({ length: rackRow.column_count }, (_, i) => i + 1).map((col) => {
              const colCap = rackRow.layer_count * rackRow.cell_count;
              let colOcc = 0;
              for (let l = 1; l <= rackRow.layer_count; l++) {
                for (let c = 1; c <= rackRow.cell_count; c++) {
                  if (occupied.has(cellKey(rackRow.room, rackRow.rack, col, l, c))) colOcc++;
                }
              }
              const active = column === col;
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => setBrowseColumn(col)}
                  title={`${col} 列 · 已放 ${colOcc}/${colCap}`}
                  className={`relative shrink-0 w-7 h-10 rounded-md border transition-all ${
                    active
                      ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-200'
                      : 'border-slate-300 bg-gradient-to-b from-slate-100 to-slate-200 hover:border-sky-300'
                  }`}
                >
                  <span
                    className="absolute bottom-0 left-0 right-0 bg-emerald-400/40 rounded-b-md"
                    style={{ height: `${colCap > 0 ? Math.round((colOcc / colCap) * 100) : 0}%` }}
                  />
                  <span className={`relative text-[10px] font-bold ${active ? 'text-sky-700' : 'text-slate-500'}`}>
                    {col}
                  </span>
                </button>
              );
            })}
            <div className="ml-auto self-center text-[10px] text-slate-400 whitespace-nowrap pl-2">
              {rackRow.rack_name} · 空 {curStat ? curStat.capacity - curStat.occupied : 0}/{curStat?.capacity ?? 0}
            </div>
          </div>

          {/* 层×位 格阵（当前列） */}
          <div className="space-y-[3px] max-h-44 overflow-y-auto pr-1">
            {Array.from({ length: rackRow.layer_count }, (_, i) => rackRow.layer_count - i).map((layer) => (
              <div key={layer} className="flex items-center gap-1">
                <span className="w-6 text-[10px] text-slate-400 text-right shrink-0">{layer}层</span>
                <div className="flex gap-[3px] flex-wrap">
                  {Array.from({ length: rackRow.cell_count }, (_, i) => i + 1).map((cell) => {
                    const key = cellKey(rackRow.room, rackRow.rack, column, layer, cell);
                    const isOccupied = occupied.has(key);
                    const isSelected = !!value
                      && value.room === rackRow.room && value.rack === rackRow.rack
                      && value.column === column && value.layer === layer && value.cell === cell;
                    if (isOccupied) {
                      return (
                        <span
                          key={cell}
                          title={`${locationText(rackRow.room, rackRow.rack, column, layer, cell)}（已占用）`}
                          className="w-[20px] h-[26px] rounded-[3px] bg-slate-300 cursor-not-allowed"
                        />
                      );
                    }
                    return (
                      <button
                        key={cell}
                        type="button"
                        onClick={() => onChange(
                          isSelected ? null : { room: rackRow.room, rack: rackRow.rack, column, layer, cell },
                        )}
                        title={locationText(rackRow.room, rackRow.rack, column, layer, cell)}
                        className={`w-[20px] h-[26px] rounded-[3px] border transition-all flex items-center justify-center ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                            : 'border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-100 hover:scale-110'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShelfPositionPicker;
