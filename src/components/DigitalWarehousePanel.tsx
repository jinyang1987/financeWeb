/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Grid, Database, HardDrive, Trash2, ArrowRight, CheckCircle2, 
  Settings, Layers, RefreshCw, Send, ShieldAlert, FileSpreadsheet, Lock
} from 'lucide-react';

interface WarehouseSlot {
  id: string;
  row: number;
  col: number;
  status: 'occupied' | 'empty';
  year: string;
  category: string;
  startVolume: string;
  endVolume: string;
  attachmentCount: number;
  flowCount: number;
}

export const DigitalWarehousePanel: React.FC<{ triggerToast: (msg: string, type?: 'success' | 'info' | 'warning') => void }> = ({ triggerToast }) => {
  // Mock list of physical shelves rows and grid slots
  const [activeRow, setActiveRow] = useState<number>(1);
  const [selectedSlot, setSelectedSlot] = useState<WarehouseSlot | null>({
    id: 'slot-1-1',
    row: 1,
    col: 1,
    status: 'occupied',
    year: '2025年',
    category: '记账凭证',
    startVolume: 'VOL-202512-001',
    endVolume: 'VOL-202512-035',
    attachmentCount: 124,
    flowCount: 450
  });

  const [slots, setSlots] = useState<WarehouseSlot[]>([
    { id: 'slot-1-1', row: 1, col: 1, status: 'occupied', year: '2025年', category: '记账凭证', startVolume: 'VOL-202512-001', endVolume: 'VOL-202512-035', attachmentCount: 124, flowCount: 450 },
    { id: 'slot-1-2', row: 1, col: 2, status: 'occupied', year: '2026年', category: '原始凭证', startVolume: 'VOL-202601-001', endVolume: 'VOL-202601-018', attachmentCount: 89, flowCount: 310 },
    { id: 'slot-1-3', row: 1, col: 3, status: 'empty', year: '无', category: '空置仓', startVolume: '无', endVolume: '无', attachmentCount: 0, flowCount: 0 },
    { id: 'slot-1-4', row: 1, col: 4, status: 'occupied', year: '2024年', category: '会计账簿', startVolume: 'BK-202400-001', endVolume: 'BK-202400-010', attachmentCount: 45, flowCount: 120 },
    { id: 'slot-1-5', row: 1, col: 5, status: 'empty', year: '无', category: '空置仓', startVolume: '无', endVolume: '无', attachmentCount: 0, flowCount: 0 },
    { id: 'slot-1-6', row: 1, col: 6, status: 'occupied', year: '2026年', category: '记账凭证', startVolume: 'VOL-202603-001', endVolume: 'VOL-202603-040', attachmentCount: 200, flowCount: 580 },
    
    { id: 'slot-2-1', row: 2, col: 1, status: 'occupied', year: '2023年', category: '财务报告', startVolume: 'RP-202300-001', endVolume: 'RP-202300-005', attachmentCount: 12, flowCount: 30 },
    { id: 'slot-2-2', row: 2, col: 2, status: 'empty', year: '无', category: '空置仓', startVolume: '无', endVolume: '无', attachmentCount: 0, flowCount: 0 },
    { id: 'slot-2-3', row: 2, col: 3, status: 'occupied', year: '2025年', category: '银行对账单', startVolume: 'BK-202505-001', endVolume: 'BK-202505-012', attachmentCount: 78, flowCount: 220 },
    { id: 'slot-2-4', row: 2, col: 4, status: 'empty', year: '无', category: '空置仓', startVolume: '无', endVolume: '无', attachmentCount: 0, flowCount: 0 },
    { id: 'slot-2-5', row: 2, col: 5, status: 'occupied', year: '2026年', category: '会计账簿', startVolume: 'BK-202600-001', endVolume: 'BK-202600-008', attachmentCount: 34, flowCount: 95 },
    { id: 'slot-2-6', row: 2, col: 6, status: 'empty', year: '无', category: '空置仓', startVolume: '无', endVolume: '无', attachmentCount: 0, flowCount: 0 },

    { id: 'slot-3-1', row: 3, col: 1, status: 'empty', year: '无', category: '空置仓', startVolume: '无', endVolume: '无', attachmentCount: 0, flowCount: 0 },
    { id: 'slot-3-2', row: 3, col: 2, status: 'occupied', year: '2024年', category: '记账凭证', startVolume: 'VOL-202412-001', endVolume: 'VOL-202412-050', attachmentCount: 310, flowCount: 980 },
    { id: 'slot-3-3', row: 3, col: 3, status: 'occupied', year: '2025年', category: '原始凭证', startVolume: 'VOL-202508-001', endVolume: 'VOL-202508-024', attachmentCount: 110, flowCount: 400 },
    { id: 'slot-3-4', row: 3, col: 4, status: 'empty', year: '无', category: '空置仓', startVolume: '无', endVolume: '无', attachmentCount: 0, flowCount: 0 },
    { id: 'slot-3-5', row: 3, col: 5, status: 'empty', year: '无', category: '空置仓', startVolume: '无', endVolume: '无', attachmentCount: 0, flowCount: 0 },
    { id: 'slot-3-6', row: 3, col: 6, status: 'occupied', year: '2026年', category: '报销凭单', startVolume: 'VOL-202605-001', endVolume: 'VOL-202605-015', attachmentCount: 50, flowCount: 150 },
  ]);

  // Hierarchical Storage Management State
  const [hsmStep, setHsmStep] = useState<'idle' | 'running' | 'success'>('idle');
  const [hsmProgress, setHsmProgress] = useState(0);
  const [activeMigrationSource, setActiveMigrationSource] = useState('SSD在线主库');
  const [activeMigrationDest, setActiveMigrationDest] = useState('光盘离线刻录');

  // Destruction lists state
  const [destructionItems, setDestructionItems] = useState([
    { id: 'ds-1', year: '2015年', category: '常规报销凭证', code: 'Z001-2015-01', boxNum: 'V-2015-081', status: '已届满(10年)', action: '待生成清单' },
    { id: 'ds-2', year: '25年审计副本', category: '临时备查账簿', code: 'Z001-2025-TM', boxNum: 'V-2025-TM2', status: '超期待销毁', action: '待生成清单' },
  ]);
  const [destructionStep, setDestructionStep] = useState<number>(1); // 1: Select/Preview list, 2: Under multigate signatures, 3: Completed destruction
  const [signatures, setSignatures] = useState({
    admin: false,
    director: false,
    auditor: false,
  });

  // Edit slot modal/state
  const [editYear, setEditYear] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStartVol, setEditStartVol] = useState('');
  const [editEndVol, setEditEndVol] = useState('');

  const handleSelectSlot = (slot: WarehouseSlot) => {
    setSelectedSlot(slot);
    setEditYear(slot.year);
    setEditCategory(slot.category);
    setEditStartVol(slot.startVolume);
    setEditEndVol(slot.endVolume);
  };

  const handleUpdateSlotInfo = () => {
    if (!selectedSlot) return;
    const isOccupied = editCategory !== '空置仓';
    setSlots(prev => prev.map(s => {
      if (s.id === selectedSlot.id) {
        const updated = {
          ...s,
          year: isOccupied ? editYear : '无',
          category: editCategory,
          startVolume: isOccupied ? editStartVol : '无',
          endVolume: isOccupied ? editEndVol : '无',
          status: isOccupied ? 'occupied' as const : 'empty' as const
        };
        setSelectedSlot(updated);
        return updated;
      }
      return s;
    }));
    triggerToast(`密集架仓位 [排 ${selectedSlot.row} - 格 ${selectedSlot.col}] 物理存放属性更新成功！`, 'success');
  };

  // HSM migration simulation
  const handleStartHSM = () => {
    if (hsmStep === 'running') return;
    setHsmStep('running');
    setHsmProgress(0);
    triggerToast(`[HSM阶梯级生命迁移] 核心自适应任务启动：将 2023 年之前的归档报单平滑迁往【ND-近线归档群】。`, 'info');
    
    const interval = setInterval(() => {
      setHsmProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setHsmStep('success');
          triggerToast('存储自动阶梯级迁移（HSM）圆满截止！已成功对冷存储段刻录光盘并安全擦除 SSD 在线卷，Solr 检索索引完美刷新同步。', 'success');
          return 100;
        }
        return p + 10;
      });
    }, 450);
  };

  // Multi-gate destruction chain
  const handleSignature = (role: 'admin' | 'director' | 'auditor') => {
    setSignatures(prev => {
      const copy = { ...prev, [role]: !prev[role] };
      const roleChinese = role === 'admin' ? '系统档案主管' : role === 'director' ? '首席财务官' : '外部独立审计师';
      triggerToast(`[销毁签章核定] 责任人【${roleChinese}】已成功写入 CA 电子印鉴身份秘钥！`, 'success');
      return copy;
    });
  };

  const handleExecuteDestruction = () => {
    if (!signatures.admin || !signatures.director || !signatures.auditor) {
      triggerToast('销毁拦截：必须由档案主管、财务总监与外部审计专家联核通过，方可释放物理硬锁。', 'warning');
      return;
    }
    setDestructionStep(3);
    setDestructionItems([]);
    triggerToast('【不可逆操作圆满销毁】核销清单所列 2 项超期档案包件已于磁盘彻底破碎安全重写，相关物理凭单完成现场联合焚毁监督，系统已同步区块链去中心留痕。', 'success');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Block 6.1: Virtual Dense Rack Warehouse Representation */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 border-l-4 border-indigo-600 pl-3 mb-2 flex items-center gap-2">
          <Grid className="w-5 h-5 text-indigo-600" />
          <span>数字化虚拟库房与物理密集架映射工作台</span>
        </h2>
        <p className="text-xs text-slate-500 mb-6">与档案馆密集智能高压储电架物理结构实时对齐，结合红绿双色可视化视图提供直接穿透至案卷的精准物理定位和对架编辑能力。</p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Dense Rack Visualizer Grid */}
          <div className="lg:col-span-8 bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">库房物理排号：</span>
                  <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-white">
                    {[1, 2, 3].map(rowNo => (
                      <button
                        key={rowNo}
                        type="button"
                        onClick={() => setActiveRow(rowNo)}
                        className={`px-3 py-1 font-bold rounded-lg transition-all text-xs cursor-pointer ${activeRow === rowNo ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        第 {rowNo} 排密集架
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold select-none text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500 block border border-emerald-600" />已上架</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-400 block border border-rose-500" />空置架</span>
                </div>
              </div>

              {/* Grid map */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5">
                {slots.filter(s => s.row === activeRow).map(slot => {
                  const isSelected = selectedSlot?.id === slot.id;
                  return (
                    <div
                      key={slot.id}
                      onClick={() => handleSelectSlot(slot)}
                      className={`relative aspect-square border rounded-xl p-3 flex flex-col justify-between cursor-pointer transition-all ${
                        slot.status === 'occupied' 
                          ? isSelected ? 'bg-emerald-100/90 border-indigo-600 ring-2 ring-indigo-500/20 shadow-md' : 'bg-white border-emerald-300 hover:border-emerald-500 hover:shadow-xs'
                          : isSelected ? 'bg-rose-100/90 border-indigo-600 ring-2 ring-indigo-500/20 shadow-md' : 'bg-white border-dashed border-rose-250 hover:border-rose-400 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400">G-{slot.col}格子</span>
                        <span className={`w-2 h-2 rounded-full ${slot.status === 'occupied' ? 'bg-emerald-500' : 'bg-rose-400 animate-pulse'}`} />
                      </div>
                      
                      {slot.status === 'occupied' ? (
                        <div className="space-y-0.5 mt-2">
                          <span className="block font-bold text-[11px] text-slate-850 truncate">{slot.category}</span>
                          <span className="block text-[9px] text-slate-400 font-mono font-medium">{slot.year}</span>
                        </div>
                      ) : (
                        <span className="block text-[10px] text-rose-500 font-bold mt-2">FREE 空置槽</span>
                      )}

                      <span className="absolute bottom-1 right-2 text-[9px] font-mono text-slate-350 select-none">R{slot.row}-C{slot.col}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 p-3.5 bg-indigo-50 border border-indigo-150/80 rounded-xl text-[11.5px] text-indigo-950 flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-indigo-505 text-indigo-600 shrink-0" />
              <span>智能指示器：点击任意虚拟格子均可穿透查看该区间已上架案卷序列、合计附件和起止案卷编号。</span>
            </div>
          </div>

          {/* Grid slot detailed editor */}
          <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2.5 mb-4">
                <Database className="w-4 h-4 text-indigo-600" />
                <span>密集仓位内容穿透与对架修改</span>
              </h3>

              {selectedSlot ? (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-2 font-bold text-slate-500 text-[11px]">
                    <div>密集架排：<span className="text-slate-800 font-mono">第 {selectedSlot.row} 排</span></div>
                    <div>密集格子：<span className="text-slate-800 font-mono">第 {selectedSlot.col} 格</span></div>
                  </div>

                  <div className="divide-y divide-slate-150 border-y border-slate-150 py-1.5 space-y-1.5">
                    <div className="pt-1 flex justify-between">
                      <span className="text-slate-455 text-slate-400">目前状态:</span>
                      <span className={`font-bold ${selectedSlot.status === 'occupied' ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {selectedSlot.status === 'occupied' ? '已上架占位' : '闲置可用'}
                      </span>
                    </div>
                    {selectedSlot.status === 'occupied' && (
                      <>
                        <div className="pt-1.5 flex justify-between font-mono">
                          <span className="text-slate-400">起止案卷号:</span>
                          <span className="font-bold text-slate-700">{selectedSlot.startVolume} ~ {selectedSlot.endVolume}</span>
                        </div>
                        <div className="pt-1.5 flex justify-between font-serif">
                          <span className="text-slate-400">合计总附件:</span>
                          <span className="font-bold text-indigo-600">{selectedSlot.attachmentCount} 张电子凭片</span>
                        </div>
                        <div className="pt-1.5 flex justify-between">
                          <span className="text-slate-400">勾勾业务流水:</span>
                          <span className="font-bold text-slate-700">{selectedSlot.flowCount} 条ERP对账记录</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Form inputs */}
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block font-bold text-slate-600 mb-1">存放档案类别</label>
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="w-full border border-slate-200 bg-white p-2 text-xs rounded-lg focus:outline-none"
                      >
                        <option value="记账凭证">记账凭证</option>
                        <option value="原始凭证">原始凭证</option>
                        <option value="会计账簿">会计账簿</option>
                        <option value="财务报告">财务报告</option>
                        <option value="银行对账单">银行对账单</option>
                        <option value="空置仓">空置仓 / 释放物理货架</option>
                      </select>
                    </div>

                    {editCategory !== '空置仓' && (
                      <>
                        <div>
                          <label className="block font-bold text-slate-600 mb-1">所属核算年度</label>
                          <input
                            type="text"
                            value={editYear}
                            onChange={(e) => setEditYear(e.target.value)}
                            className="w-full border border-slate-200 bg-white p-2 text-xs rounded-lg focus:outline-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">起始案卷编号</label>
                            <input
                              type="text"
                              value={editStartVol}
                              onChange={(e) => setEditStartVol(e.target.value)}
                              className="w-full border border-slate-200 bg-white p-2 text-xs rounded-lg font-mono focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-600 mb-1">终止案卷编号</label>
                            <input
                              type="text"
                              value={editEndVol}
                              onChange={(e) => setEditEndVol(e.target.value)}
                              className="w-full border border-slate-200 bg-white p-2 text-xs rounded-lg font-mono focus:outline-none"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs">
                  请在左侧密集视图中鼠标点击任一网格格子激发详情配置。
                </div>
              )}
            </div>
            
            {selectedSlot && (
              <button
                type="button"
                onClick={handleUpdateSlotInfo}
                className="w-full mt-4 py-2 bg-indigo-605 hover:bg-indigo-700 bg-indigo-600 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer transition-colors"
              >
                保存本物理架仓位属性
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Block 6.2: Adaptive Tiered Life Management (HSM) & Joint Safe Destruction */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* HSM Tiered Storage Management block */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 border-l-4 border-emerald-500 pl-3 mb-2 flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-emerald-500" />
              <span>数据生命周期自适应阶梯存储管理 (HSM)</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              根据凭证安全规定与重要性，将三年前的历史单单自动向下层分级迁移。保障上层统一 Solr 全文索引不间断，支持静默迁移归藏。
            </p>

            <div className="bg-slate-55 bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-4 mb-5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 select-none">
                <span className="flex items-center gap-1">
                  <Database className="w-3.5 h-3.5 text-blue-500" />
                  <span>SSD在线高速层</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3.5 h-3.5 text-indigo-500" />
                  <span>云近线索引主层</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-teal-500" />
                  <span>离线光盘防篡刻</span>
                </span>
              </div>

              {/* Progress visual bar */}
              {hsmStep === 'running' && (
                <div className="space-y-1.5 animate-in fade-in">
                  <div className="flex justify-between text-[10px] font-mono font-bold text-indigo-600">
                    <span>迁移进度 ({hsmProgress}%) ...</span>
                    <span>{hsmProgress < 60 ? '正在加密封包...' : '正在同步写物理光盘...'}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300" style={{ width: `${hsmProgress}%` }} />
                  </div>
                </div>
              )}

              {hsmStep === 'success' && (
                <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-lg flex items-center gap-2 text-[11px] text-emerald-800 font-medium animate-in zoom-in-95 duration-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>分级静默迁移成功！已完成对 2023 财契历史附件之 HSM 物理下迁。</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                <div className="space-y-1">
                  <span className="block text-[10px] text-slate-450 text-slate-400">生命周期流速阀门</span>
                  <select
                    value={activeMigrationSource}
                    onChange={(e) => setActiveMigrationSource(e.target.value)}
                    className="w-full border border-slate-200 bg-white p-2.5 rounded-lg focus:outline-none"
                  >
                    <option value="SSD在线主库">SSD在线主库 (缓存极快级)</option>
                    <option value="近线数据缓存">近线数据缓存 (2025-2026件)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="block text-[10px] text-slate-450 text-slate-400">平移归藏物理网</span>
                  <select
                    value={activeMigrationDest}
                    onChange={(e) => setActiveMigrationDest(e.target.value)}
                    className="w-full border border-slate-200 bg-white p-2.5 rounded-lg focus:outline-none"
                  >
                    <option value="光盘离线刻录">光盘离线刻录 (GB/T标)</option>
                    <option value="防雷磁带存储">防雷防磁离线库物理段</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStartHSM}
            disabled={hsmStep === 'running'}
            className={`w-full py-2.5 flex items-center justify-center gap-1.5 font-bold text-xs rounded-xl shadow-xs transition-all border ${
              hsmStep === 'running' 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200' 
                : 'bg-slate-800 hover:bg-slate-900 text-white border-slate-700 cursor-pointer'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${hsmStep === 'running' ? 'animate-spin' : ''}`} />
            <span>执行自适应存储平滑HSM迁移</span>
          </button>
        </div>

        {/* National Audit-compliant safe destruction block */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 border-l-4 border-rose-500 pl-3 mb-2 flex items-center gap-1.5">
              <Trash2 className="w-4 h-4 text-rose-500" />
              <span>会计保障时效届满合规鉴定与三方销毁联合签字</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              严格贯彻国家档案局 79 号令：到期凭证必须经过合规鉴定与多方 CA 证书盖章始准销毁。系统自动检测拦截未核批准许。
            </p>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3.5 mb-4">
              {destructionStep === 1 && (
                <>
                  <div className="flex justify-between items-center text-[10.5px] border-b border-slate-200 pb-1.5">
                    <span className="font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-505 text-rose-500" />
                      国家合规到期审计检测
                    </span>
                    <span className="text-slate-400 font-mono">2 项到期案卷</span>
                  </div>

                  <div className="divide-y divide-slate-100 space-y-1.5">
                    {destructionItems.map(item => (
                      <div key={item.id} className="pt-1.5 flex justify-between text-xs font-medium">
                        <div className="space-y-0.5">
                          <code className="bg-slate-200 font-mono text-[10.5px] font-bold px-1 rounded text-slate-700">{item.code}</code>
                          <span className="block text-[10px] text-slate-400">{item.category} ({item.year})</span>
                        </div>
                        <span className="text-rose-600 font-bold">{item.status}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {destructionStep === 2 && (
                <div className="space-y-3">
                  <div className="text-center font-bold text-xs text-slate-800 border-b border-slate-150 pb-2 flex items-center justify-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-indigo-500" />
                    <span>到期销毁清单多级 CA 签字会签锁屏</span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2.5">
                    {/* Admin Sign */}
                    <button
                      type="button"
                      onClick={() => handleSignature('admin')}
                      className={`p-2.5 border rounded-xl flex flex-col items-center text-center gap-1 cursor-pointer transition-all ${
                        signatures.admin 
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold' 
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[10px] uppercase">一、主管签章</span>
                      <span className="text-[11px] font-serif leading-none mt-1">{signatures.admin ? '★王保管印' : '等待印鉴'}</span>
                    </button>

                    {/* CFO sign */}
                    <button
                      type="button"
                      onClick={() => handleSignature('director')}
                      className={`p-2.5 border rounded-xl flex flex-col items-center text-center gap-1 cursor-pointer transition-all ${
                        signatures.director 
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold' 
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[10px] uppercase">二、财务总监</span>
                      <span className="text-[11px] font-serif leading-none mt-1">{signatures.director ? '★周总监印' : '等待授权印'}</span>
                    </button>

                    {/* Ext Auditor sign */}
                    <button
                      type="button"
                      onClick={() => handleSignature('auditor')}
                      className={`p-2.5 border rounded-xl flex flex-col items-center text-center gap-1 cursor-pointer transition-all ${
                        signatures.auditor 
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold' 
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[10px] uppercase">三、独立审计</span>
                      <span className="text-[11px] font-serif leading-none mt-1">{signatures.auditor ? '★审计签字' : '等待核验盖印'}</span>
                    </button>
                  </div>
                </div>
              )}

              {destructionStep === 3 && (
                <div className="py-6 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2 animate-in zoom-in-95 duration-200">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 animate-bounce" />
                  <p className="font-bold text-slate-800 text-xs">联合合规实体破碎销毁已完成！</p>
                  <p className="text-[10.5px] text-slate-400">密锁与底层物理备份块全部擦除，已生成不可逆的安全销毁鉴定报告。</p>
                </div>
              )}
            </div>
          </div>

          <div>
            {destructionStep === 1 && (
              <button
                type="button"
                onClick={() => {
                  setDestructionStep(2);
                  triggerToast('【销毁清单已锁定】已一键拉取符合销毁判定件，进入会签防篡改签名认证台！', 'info');
                }}
                className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                自动生成到期合规销毁审查清单
              </button>
            )}

            {destructionStep === 2 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDestructionStep(1);
                    setSignatures({ admin: false, director: false, auditor: false });
                  }}
                  className="flex-1 py-2 border border-slate-250 text-slate-600 hover:bg-slate-50 rounded-xl font-bold cursor-pointer text-xs"
                >
                  回退清单
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDestruction}
                  className={`flex-1 py-2 font-bold text-xs rounded-xl cursor-pointer ${
                    signatures.admin && signatures.director && signatures.auditor
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  确认联合CA物理硬锁销毁
                </button>
              </div>
            )}

            {destructionStep === 3 && (
              <button
                type="button"
                onClick={() => {
                  setDestructionStep(1);
                  setSignatures({ admin: false, director: false, auditor: false });
                  setDestructionItems([
                    { id: 'ds-3', year: '2016年', category: '财务报告外调备份', code: 'Z001-2016-RP', boxNum: 'V-2016-121', status: '满10年保期', action: '待生成清单' }
                  ]);
                }}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-indigo-600 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                巡检下一批到期鉴定件
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
