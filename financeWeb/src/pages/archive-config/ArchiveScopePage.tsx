import React, { useState } from 'react';
import { Search, Plus, Edit, Trash2, ListTodo, ChevronDown, RefreshCw, FolderTree, CheckSquare } from 'lucide-react';

// ============================================================
// 归档范围数据模型
// ============================================================

interface ArchiveItem {
  id: string;
  name: string;
  retentionPeriod: string;
  children?: ArchiveItem[];
}

const archiveScopeData: ArchiveItem[] = [
  {
    id: '1',
    name: '会计凭证类',
    retentionPeriod: '30年',
    children: [
      { id: '1-1', name: '记账凭证', retentionPeriod: '30年' },
      { id: '1-2', name: '付款凭证', retentionPeriod: '30年' },
      { id: '1-3', name: '收款凭证', retentionPeriod: '30年' },
      { id: '1-4', name: '转账凭证', retentionPeriod: '30年' },
    ],
  },
  {
    id: '2',
    name: '会计账簿类',
    retentionPeriod: '30年',
    children: [
      { id: '2-1', name: '总账', retentionPeriod: '30年' },
      { id: '2-2', name: '明细账', retentionPeriod: '30年' },
      { id: '2-3', name: '日记账', retentionPeriod: '30年' },
    ],
  },
  {
    id: '3',
    name: '财务报告类',
    retentionPeriod: '永久',
    children: [
      { id: '3-1', name: '年度财务报告', retentionPeriod: '永久' },
      { id: '3-2', name: '半年度财务报告', retentionPeriod: '10年' },
      { id: '3-3', name: '季度财务报告', retentionPeriod: '10年' },
    ],
  },
  {
    id: '4',
    name: '其他会计资料',
    retentionPeriod: '10年',
    children: [
      { id: '4-1', name: '银行余额调节表', retentionPeriod: '10年' },
      { id: '4-2', name: '银行对账单', retentionPeriod: '10年' },
    ],
  },
];

// ============================================================
// 保管期限徽标颜色
// ============================================================

const retentionBadgeClass = (period: string): string => {
  if (period === '永久') return 'bg-red-50 text-red-600 border border-red-200';
  if (period === '30年') return 'bg-sky-50 text-sky-600 border border-sky-200';
  return 'bg-slate-100 text-slate-600 border border-slate-200';
};

// ============================================================
// 子项行组件
// ============================================================

interface ChildRowProps {
  item: ArchiveItem;
  checked: boolean;
  onToggle: (id: string) => void;
}

const ChildRow: React.FC<ChildRowProps> = ({ item, checked, onToggle }) => (
  <div className="flex items-center px-4 py-2.5 hover:bg-sky-50/30 transition-colors group">
    <div className="w-8 flex-shrink-0" />
    <button
      type="button"
      onClick={() => onToggle(item.id)}
      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
        checked
          ? 'bg-sky-600 border-sky-600 text-white'
          : 'border-slate-300 hover:border-slate-400'
      }`}
    >
      {checked && <CheckSquare className="w-3.5 h-3.5" />}
    </button>
    <span className="ml-3 text-sm text-slate-700 flex-1">{item.name}</span>
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${retentionBadgeClass(item.retentionPeriod)}`}
    >
      {item.retentionPeriod}
    </span>
    <div className="ml-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button type="button" className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center cursor-pointer" title="编辑">
        <Edit className="w-3.5 h-3.5 text-slate-400" />
      </button>
      <button type="button" className="w-7 h-7 rounded hover:bg-red-50 flex items-center justify-center cursor-pointer" title="删除">
        <Trash2 className="w-3.5 h-3.5 text-red-400" />
      </button>
    </div>
  </div>
);

// ============================================================
// 分类行组件
// ============================================================

interface CategoryRowProps {
  category: ArchiveItem;
  checked: boolean;
  childChecked: Record<string, boolean>;
  onToggle: (id: string) => void;
}

const CategoryRow: React.FC<CategoryRowProps> = ({ category, checked, childChecked, onToggle }) => {
  const [expanded, setExpanded] = useState(true);

  const allChildrenChecked = category.children?.every((c) => childChecked[c.id]) ?? false;
  const someChildrenChecked = category.children?.some((c) => childChecked[c.id]) ?? false;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* 分类头部 */}
      <div className="flex items-center px-4 py-3 bg-slate-50/80 border-b border-slate-100 group">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-6 h-6 rounded hover:bg-slate-200 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer"
        >
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`}
          />
        </button>
        <button
          type="button"
          onClick={() => onToggle(category.id)}
          className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ml-1 transition-colors cursor-pointer ${
            checked || allChildrenChecked
              ? 'bg-sky-600 border-sky-600 text-white'
              : someChildrenChecked
              ? 'bg-sky-100 border-sky-300'
              : 'border-slate-300 hover:border-slate-400'
          }`}
        >
          {(checked || allChildrenChecked) && <CheckSquare className="w-3.5 h-3.5" />}
        </button>
        <FolderTree className="w-4 h-4 text-amber-500 ml-2 flex-shrink-0" />
        <span className="ml-2 text-sm font-bold text-slate-800 flex-1">{category.name}</span>
        <span className="text-xs text-slate-400 mr-3">保管期限: </span>
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${retentionBadgeClass(category.retentionPeriod)}`}
        >
          {category.retentionPeriod}
        </span>
        <div className="ml-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center cursor-pointer" title="编辑">
            <Edit className="w-3.5 h-3.5 text-slate-400" />
          </button>
          <button type="button" className="w-7 h-7 rounded hover:bg-red-50 flex items-center justify-center cursor-pointer" title="删除">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      </div>

      {/* 子项列表 */}
      {expanded && category.children && (
        <div className="divide-y divide-slate-50">
          {category.children.map((child) => (
            <ChildRow
              key={child.id}
              item={child}
              checked={childChecked[child.id] ?? false}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// 主页面
// ============================================================

const ArchiveScopePage: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const handleToggle = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allCategoryIds = archiveScopeData.map((c) => c.id);
  const allChildIds = archiveScopeData.flatMap((c) => c.children?.map((ch) => ch.id) ?? []);
  const allIds = [...allCategoryIds, ...allChildIds];
  const selectedCount = allIds.filter((id) => checkedItems[id]).length;

  const handleSelectAll = () => {
    if (selectedCount === allIds.length) {
      setCheckedItems({});
    } else {
      const allChecked: Record<string, boolean> = {};
      allIds.forEach((id) => { allChecked[id] = true; });
      setCheckedItems(allChecked);
    }
  };

  return (
    <div className="flex-1 overflow-auto animate-in fade-in duration-200 p-6">
      <div className="max-w-4xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <ListTodo className="w-5 h-5 text-sky-600" />
            <h2 className="text-lg font-bold text-slate-800">归档范围</h2>
          </div>
          <p className="text-sm text-slate-500 ml-7">归档范围 档案归档范围与保管期限配置管理</p>
        </div>

        {/* 操作栏 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 flex-1">
            {/* 搜索框 */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索归档分类..."
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-colors placeholder:text-slate-400"
              />
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              新增分类
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              批量删除
            </button>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-colors cursor-pointer ml-3"
            title="刷新"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* 全选与统计 */}
        <div className="flex items-center justify-between mb-3 px-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button
              type="button"
              onClick={handleSelectAll}
              className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                selectedCount === allIds.length
                  ? 'bg-sky-600 border-sky-600 text-white'
                  : selectedCount > 0
                  ? 'bg-sky-100 border-sky-300'
                  : 'border-slate-300 hover:border-slate-400'
              }`}
            >
              {selectedCount === allIds.length && <CheckSquare className="w-3.5 h-3.5" />}
            </button>
            <span className="text-xs text-slate-500">
              已选择 <span className="font-bold text-slate-700">{selectedCount}</span> 项 / 共{' '}
              <span className="font-bold text-slate-700">{allIds.length}</span> 项
            </span>
          </label>
        </div>

        {/* 归档范围树形列表 */}
        <div className="space-y-3">
          {archiveScopeData.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              checked={checkedItems[category.id] ?? false}
              childChecked={checkedItems}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default ArchiveScopePage;

