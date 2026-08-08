import React, { useState } from 'react';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  FileText,
  ChevronDown,
  Download,
  RefreshCw,
  Eye,
} from 'lucide-react';

const mockData = [
  { id: 'RPT-001', name: '年度财务总账报告', type: '财务报表', scope: '集团公司', format: 'PDF/OFD', createTime: '2024-12-31', status: '启用' },
  { id: 'RPT-002', name: '季度利润分析报告', type: '财务报表', scope: '子公司', format: 'XLSX', createTime: '2024-09-30', status: '启用' },
  { id: 'RPT-003', name: '月度凭证汇总表', type: '凭证汇总', scope: '所有单位', format: 'PDF', createTime: '2024-12-01', status: '启用' },
  { id: 'RPT-004', name: '档案利用统计报告', type: '档案统计', scope: '集团档案室', format: 'HTML', createTime: '2025-01-01', status: '试用' },
  { id: 'RPT-005', name: '年度审计报告模板', type: '审计报表', scope: '集团总部', format: 'PDF/OFD', createTime: '2023-12-31', status: '停用' },
];

const statusStyles: Record<string, string> = {
  '启用': 'bg-green-100 text-green-700',
  '试用': 'bg-sky-100 text-sky-700',
  '停用': 'bg-gray-100 text-gray-500',
};

const ReportConfigPage: React.FC = () => {
  const [searchText, setSearchText] = useState('');

  return (
    <div className="flex-1 overflow-auto animate-in fade-in duration-200 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">报告配置</h1>
        <p className="mt-1 text-sm text-gray-500">
          报告配置 财务报表与档案统计报告配置管理
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索报告编号、名称…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 w-64"
            />
          </div>
          <button className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            <FileText className="h-4 w-4" />
            模板类型
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>
        <button className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-sky-600 rounded-lg hover:bg-sky-700">
          <Plus className="h-4 w-4" />
          新增报告
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">报告编号</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">报告名称</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">模板类型</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">适用范围</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">格式</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">创建时间</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">状态</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {mockData.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-800">{row.id}</td>
                <td className="px-4 py-3 text-gray-800">{row.name}</td>
                <td className="px-4 py-3 text-gray-600">{row.type}</td>
                <td className="px-4 py-3 text-gray-600">{row.scope}</td>
                <td className="px-4 py-3 text-gray-600">{row.format}</td>
                <td className="px-4 py-3 text-gray-600">{row.createTime}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button className="p-1 text-gray-400 hover:text-sky-600 transition-colors" title="查看">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button className="p-1 text-gray-400 hover:text-sky-600 transition-colors" title="编辑">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button className="p-1 text-gray-400 hover:text-green-600 transition-colors" title="下载">
                      <Download className="h-4 w-4" />
                    </button>
                    <button className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="删除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportConfigPage;

