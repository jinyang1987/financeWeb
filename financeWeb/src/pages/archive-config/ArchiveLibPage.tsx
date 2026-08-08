import React, { useState } from 'react';
import { Search, Plus, Edit, Trash2, Database, ChevronDown, FolderOpen, RefreshCw, Info } from 'lucide-react';

// ========== 模拟数据 ==========
interface ArchiveRoom {
  id: string;
  code: string;
  name: string;
  area: string;
  capacity: number;
  used: number;
  usageRate: string;
  manager: string;
  status: '正常' | '警戒';
}

const mockData: ArchiveRoom[] = [
  { id: '1', code: 'A-001', name: '主档案库(东区)', area: 'A区', capacity: 500, used: 385, usageRate: '77%', manager: '张管理', status: '正常' },
  { id: '2', code: 'A-002', name: '主档案库(西区)', area: 'A区', capacity: 500, used: 267, usageRate: '53.4%', manager: '张管理', status: '正常' },
  { id: '3', code: 'B-001', name: '备份档案库', area: 'B区', capacity: 1000, used: 412, usageRate: '41.2%', manager: '李备份', status: '正常' },
  { id: '4', code: 'C-001', name: '历史档案库(温)', area: 'C区', capacity: 200, used: 198, usageRate: '99%', manager: '王历史', status: '警戒' },
  { id: '5', code: 'C-002', name: '历史档案库(冷)', area: 'C区', capacity: 300, used: 89, usageRate: '29.7%', manager: '赵冷存', status: '正常' },
];

const statusStyles: Record<string, string> = {
  '正常': 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  '警戒': 'bg-red-50 text-red-600 border border-red-200',
};

// ========== 主页面 ==========
const ArchiveLibPage: React.FC = () => {
  const [searchText, setSearchText] = useState('');

  const filteredData = mockData.filter(item =>
    item.code.toLowerCase().includes(searchText.toLowerCase()) ||
    item.name.includes(searchText) ||
    item.area.includes(searchText) ||
    item.manager.includes(searchText)
  );

  return (
    <div className="flex-1 overflow-auto animate-in fade-in duration-200 p-6">
      <div className="max-w-full">
        {/* 页面标题 */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-5 h-5 text-sky-600" />
            <h2 className="text-lg font-bold text-slate-800">档案配置管理</h2>
          </div>
          <p className="text-sm text-slate-500 ml-7">档案配置管理 档案库房配置与存储区域规划管理</p>
        </div>

        {/* 操作栏 */}
        <div className="flex items-center justify-between mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索库房编号、名称、区域、管理人员..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 bg-white placeholder-slate-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              新增库房
            </button>
          </div>
        </div>

        {/* 数据表格 */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-bold text-slate-600">库房编号</th>
                <th className="text-left px-4 py-3 font-bold text-slate-600">库房名称</th>
                <th className="text-left px-4 py-3 font-bold text-slate-600">存储区域</th>
                <th className="text-right px-4 py-3 font-bold text-slate-600">容量(TB)</th>
                <th className="text-right px-4 py-3 font-bold text-slate-600">已用(TB)</th>
                <th className="text-center px-4 py-3 font-bold text-slate-600">使用率</th>
                <th className="text-left px-4 py-3 font-bold text-slate-600">管理人员</th>
                <th className="text-center px-4 py-3 font-bold text-slate-600">状态</th>
                <th className="text-center px-4 py-3 font-bold text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`border-b border-slate-100 hover:bg-sky-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                >
                  <td className="px-4 py-3 font-mono font-bold text-sky-600">{item.code}</td>
                  <td className="px-4 py-3 font-bold text-slate-700">{item.name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.area}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.capacity}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{item.used}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${item.status === '警戒' ? 'bg-red-500' : 'bg-emerald-500'}`}
                          style={{ width: item.usageRate }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${item.status === '警戒' ? 'text-red-600' : 'text-emerald-600'}`}>
                        {item.usageRate}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.manager}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${statusStyles[item.status]}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        className="p-1.5 rounded-md text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors cursor-pointer"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                        title="详情"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    未找到匹配的库房记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 底部统计 */}
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span>共 <strong className="text-slate-700">{mockData.length}</strong> 个库房</span>
            <span>总容量：<strong className="text-slate-700">{mockData.reduce((s, r) => s + r.capacity, 0)} TB</strong></span>
            <span>总已用：<strong className="text-slate-700">{mockData.reduce((s, r) => s + r.used, 0)} TB</strong></span>
            <span>总使用率：<strong className="text-slate-700">
              {((mockData.reduce((s, r) => s + r.used, 0) / mockData.reduce((s, r) => s + r.capacity, 0)) * 100).toFixed(1)}%
            </strong></span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> 正常：{mockData.filter(r => r.status === '正常').length}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" /> 警戒：{mockData.filter(r => r.status === '警戒').length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArchiveLibPage;
