/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * usePagination — 客户端分页状态 hook
 */

import { useState, useMemo, useCallback } from 'react';

export interface UsePaginationOptions {
  /** 默认每页条数 */
  defaultPageSize?: number;
}

export interface UsePaginationReturn<T> {
  /** 当前页数据 */
  pageData: T[];
  /** 当前页码（1-indexed） */
  currentPage: number;
  /** 总页数 */
  totalPages: number;
  /** 总条数 */
  totalItems: number;
  /** 每页条数 */
  pageSize: number;
  /** 跳转到指定页 */
  setPage: (page: number) => void;
  /** 修改页大小（自动重置到第1页） */
  setPageSize: (size: number) => void;
}

export function usePagination<T>(
  data: T[],
  options: UsePaginationOptions = {},
): UsePaginationReturn<T> {
  const { defaultPageSize = 20 } = options;
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [currentPage, setCurrentPage] = useState(1);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // 当数据或 pageSize 变化时，确保页码不越界
  const safePage = Math.min(currentPage, totalPages);

  const pageData = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, safePage, pageSize]);

  const setPage = useCallback((page: number) => {
    if (page >= 1) setCurrentPage(page);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setCurrentPage(1);
  }, []);

  return {
    pageData,
    currentPage: safePage,
    totalPages,
    totalItems,
    pageSize,
    setPage,
    setPageSize,
  };
}
