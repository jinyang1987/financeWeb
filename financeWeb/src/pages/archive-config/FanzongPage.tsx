import React, { useState } from 'react';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Building2,
  ChevronDown,
  FileText,
  RefreshCw,
  Info,
} from 'lucide-react';

interface FanzongRecord {
  id: string;
  code: string;
  name: string;
  unit: string;
  volumeCount: number;
  yearRange: string;
  status: '正常' | '封存';
}

const mockData: FanzongRecord[] = [
  { id: '1', code: 'FZ-2024-001', name: 'XX集团有限公司档案全宗', unit: 'XX集团有限公司', volumeCount: 1286, yearRange: '1990-2024', status: '正常' },
  { id: '2', code: 'FZ-2024-002', name: 'XX子公司档案全宗', unit: 'XX子公司', volumeCount: 856, yearRange: '2010-2024', status: '正常' },
  { id: '3', code: 'FZ-2023-001', name: '历史档案全宗', unit: '集团档案馆', volumeCount: 2341, yearRange: '1978-2023', status: '封存' },
  { id: '4', code: 'FZ-2024-003', name: 'XX合资公司全宗', unit: 'XX合资公司', volumeCount: 432, yearRange: '2015-2024', status: '正常' },
  { id: '5', code: 'FZ-2022-001', name: '合并档案全宗', unit: '集团档案馆', volumeCount: 1578, yearRange: '2000-2024', status: '正常' },
];

const statusStyles: Record<string, string> = {
  '正常': 'bg-green-50 text-green-700 border-green-200',
  '封存': 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function FanzongPage() {
  const [searchText, setSearchText] = useState('');

  const filtered = mockData.filter(
    (item) =>
      item.code.includes(searchText) ||
      item.name.includes(searchText) ||
      item.unit.includes(searchText),
  );

  return (
    <div className="flex-1 overflow-auto animate-in fade-in duration-200 p-6">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-6 h-6 text-sky-600" />
            <h1 className="text-2xl font-bold text-gray-900">全宗管理</h1>
          </div>
          <p className="text-sm text-gray-500 ml-8">
            全宗覆盖全宗一元化档案存储仪表盘 管理全宗分类与全宗档案存储
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新增全宗
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索全宗号、全宗名称或立档单位..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 placeholder-gray-400"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Info className="w-4 h-4" />
          <span>共 {filtered.length} 条记录</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    全宗号
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    全宗名称
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                  </div>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">立档单位</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">档案数量(卷)</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">起止年度</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">状态</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((record) => (
                <tr
                  key={record.id}
                  className="hover:bg-sky-50/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-sky-700 font-medium whitespace-nowrap">
                    {record.code}
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium whitespace-nowrap">
                    {record.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {record.unit}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 tabular-nums whitespace-nowrap">
                    {record.volumeCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">
                    {record.yearRange}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <span
                      className={`inline-block px-2.5 py-0.5 text-xs font-medium rounded-full border ${
                        statusStyles[record.status]
                      }`}
                    >
                      {record.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-50 rounded-md transition-colors"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        编辑
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    未找到匹配的全宗记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

