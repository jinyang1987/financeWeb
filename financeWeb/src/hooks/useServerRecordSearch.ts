/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * useServerRecordSearch — V10 读模型服务端分页检索 hook（2026-08-18）
 *
 * 取代门户旧链路「全量拉取 + JS 内存过滤」：筛选参数 → GET /records/search，
 * 前端只持有当前页（页态化）。q/筛选 250ms 防抖；参数变化重置第 1 页；
 * 行级权限由服务端 SQL 下推，前端无需再过滤。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { searchRecords, dtoToRecord, type SearchParams } from '../services/recordService';
import { useArchiveStore } from '../stores/archiveStore';
import type { ArchiveRecord } from '../types';

export type ServerSearchFilters = Omit<SearchParams, 'fondsCode' | 'skipCount' | 'maxItems'> & {
  /** 覆盖当前全宗（凭证检索的「公司主体」下拉）；缺省用 store 当前全宗 */
  fondsCode?: string;
  /** false 时不发起请求（如关联查询「未点搜索不查」语义） */
  enabled?: boolean;
};

export interface ServerSearchState {
  items: ArchiveRecord[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  loading: boolean;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
}

export function useServerRecordSearch(filters: ServerSearchFilters): ServerSearchState {
  const currentFanzongCode = useArchiveStore((s) => s.currentFanzongCode);
  const fondsCode = filters.fondsCode || currentFanzongCode;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(20);
  const [items, setItems] = useState<ArchiveRecord[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);

  // 参数签名：内容相同则串相同（父组件重渲染不触发重查）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtersKey = useMemo(() => JSON.stringify(filters), [JSON.stringify(filters)]);

  // 250ms 防抖（键入关键词不刷屏请求）
  const [debouncedKey, setDebouncedKey] = useState(filtersKey);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKey(filtersKey), 250);
    return () => clearTimeout(t);
  }, [filtersKey]);

  // 参数变化 → 回第 1 页
  useEffect(() => { setPage(1); }, [debouncedKey, fondsCode]);

  // 请求体取最新筛选（debouncedKey 更新时闭包可能滞后，用 ref 保证一致）
  const latestFilters = useRef(filters);
  latestFilters.current = filters;

  const enabled = filters.enabled !== false;

  useEffect(() => {
    if (!fondsCode || !enabled) return;
    let cancel = false;
    setLoading(true);
    const f = latestFilters.current;
    searchRecords({ ...f, fondsCode, skipCount: (page - 1) * pageSize, maxItems: pageSize })
      .then((r) => {
        if (cancel) return;
        setItems(r.items.map(dtoToRecord));
        setTotalItems(r.totalItems);
      })
      .catch((e) => {
        console.warn('服务端检索失败（离线/未登录时保持空表）:', e);
        if (!cancel) { setItems([]); setTotalItems(0); }
      })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey, fondsCode, page, pageSize, enabled]);

  const setPageSize = (s: number) => { setPageSizeRaw(s); setPage(1); };

  return {
    items,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    currentPage: page,
    pageSize,
    loading,
    setPage,
    setPageSize,
  };
}
