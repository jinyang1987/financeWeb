/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * PaginationBar — 基于 shadcn/ui Pagination 的分页栏
 *
 * 特性：
 *   - 页大小选择器（10/20/50/100）
 *   - 总条数显示
 *   - 智能页码（省略号折叠）
 *   - 上/下页按钮
 */

import React, { useMemo } from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './ui/pagination';

export interface PaginationBarProps {
  /** 当前页码（1-indexed） */
  currentPage: number;
  /** 总页数 */
  totalPages: number;
  /** 总条数 */
  totalItems: number;
  /** 每页条数 */
  pageSize: number;
  /** 页码变化回调 */
  onPageChange: (page: number) => void;
  /** 页大小变化回调 */
  onPageSizeChange?: (size: number) => void;
  /** 页码居中模式（左侧信息仍保留，页码导航居中） */
  centered?: boolean;
}

const PAGE_SIZES = [10, 20, 50, 100];

/** 生成页码列表（含省略号） */
function generatePages(current: number, total: number): ('ellipsis-start' | 'ellipsis-end' | number)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: ('ellipsis-start' | 'ellipsis-end' | number)[] = [];

  // 始终显示第 1 页
  pages.push(1);

  if (current <= 4) {
    // 靠近开头：1 2 3 4 5 ... N
    for (let i = 2; i <= 5; i++) pages.push(i);
    pages.push('ellipsis-end');
  } else if (current >= total - 3) {
    // 靠近结尾：1 ... N-4 N-3 N-2 N-1 N
    pages.push('ellipsis-start');
    for (let i = total - 4; i <= total - 1; i++) pages.push(i);
  } else {
    // 中间：1 ... cur-1 cur cur+1 ... N
    pages.push('ellipsis-start');
    pages.push(current - 1, current, current + 1);
    pages.push('ellipsis-end');
  }

  pages.push(total);
  return pages;
}

const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  centered = false,
}) => {
  const pages = useMemo(() => generatePages(currentPage, totalPages), [currentPage, totalPages]);

  if (totalItems === 0) return null;

  return (
    <div className={`flex items-center px-4 py-2.5 bg-white border-t border-slate-200 shrink-0 select-none ${
      centered ? 'justify-center relative' : 'justify-between gap-2'
    }`}>
      {/* 左侧：总条数 + 页大小（居中模式下绝对定位到左侧） */}
      <div className={`flex items-center gap-3 text-xs text-slate-500 shrink-0 ${
        centered ? 'absolute left-4' : ''
      }`}>
        <span className="whitespace-nowrap">
          共 <strong className="text-slate-700">{totalItems}</strong> 条
        </span>
        {onPageSizeChange && (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            每页
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-1.5 py-0.5 text-xs border border-slate-300 rounded bg-white cursor-pointer hover:border-slate-400"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            条
          </span>
        )}
      </div>

      {/* 页码导航（居中模式下由父容器 justify-center 居中） */}
      <Pagination className="shrink-0 w-auto mx-0">
        <PaginationContent>
          {/* 上一页 */}
          <PaginationItem>
            <PaginationPrevious
              onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
              className={`text-xs h-8 ${currentPage <= 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer hover:bg-slate-100'}`}
              text="上一页"
            />
          </PaginationItem>

          {/* 页码 */}
          {pages.map((p, i) => {
            if (p === 'ellipsis-start' || p === 'ellipsis-end') {
              return (
                <PaginationItem key={p}>
                  <PaginationEllipsis />
                </PaginationItem>
              );
            }
            return (
              <PaginationItem key={p}>
                <PaginationLink
                  isActive={p === currentPage}
                  onClick={() => onPageChange(p)}
                  className={`text-xs min-w-8 h-8 cursor-pointer ${
                    p === currentPage
                      ? 'bg-sky-50 border-sky-200 text-sky-700 font-semibold'
                      : 'hover:bg-slate-100'
                  }`}
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            );
          })}

          {/* 下一页 */}
          <PaginationItem>
            <PaginationNext
              onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
              className={`text-xs h-8 ${currentPage >= totalPages ? 'pointer-events-none opacity-40' : 'cursor-pointer hover:bg-slate-100'}`}
              text="下一页"
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};

export default PaginationBar;

