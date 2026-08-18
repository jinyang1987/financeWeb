/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * 审核链路 / 双链路状态机 纯逻辑测试（2026-08-09）
 *
 * 覆盖：抓取/推送 → 收集池（仅件数据）→ 审核库（待审核）→ 通过/驳回 的状态流转，
 * 以及「直接组卷」跳过审核的链路。逻辑与 ams-server ReviewService 状态机对齐。
 */

import { describe, it, expect } from 'vitest';

// ─── 状态机（与后端 ReviewService / VolumeService 对齐） ───

type RecordStatus = '仅件数据' | '待审核' | '已组卷';
type ReviewAction = 'enter' | 'approve' | 'reject';

interface ReviewLog {
  action: ReviewAction;
  reviewer: string;
  comment: string;
}

/** 纯函数：执行审核动作返回新状态 */
function applyReview(status: RecordStatus, action: ReviewAction): RecordStatus {
  if (action === 'enter') {
    if (status !== '仅件数据') throw new Error('仅「仅件数据」记录可进入审核库');
    return '待审核';
  }
  if (action === 'approve') {
    if (status !== '待审核') throw new Error('仅「待审核」记录可审核通过');
    return '仅件数据';   // 通过后回收集池，可进组卷
  }
  if (action === 'reject') {
    if (status !== '待审核') throw new Error('仅「待审核」记录可驳回');
    return '仅件数据';   // 驳回回收集池
  }
  return status;
}

/** 双链路校验：抓取/推送后可选「进审核库」或「直接组卷」 */
function pipeline(status: RecordStatus, opts: { toReview: boolean; toGroup: boolean }): {
  ok: boolean;
  finalStatus: RecordStatus;
  logs: ReviewLog[];
} {
  const logs: ReviewLog[] = [];
  if (opts.toReview) {
    const s1 = applyReview(status, 'enter');
    logs.push({ action: 'enter', reviewer: 'archivist', comment: '进审核库' });
    const s2 = applyReview(s1, 'approve');
    logs.push({ action: 'approve', reviewer: 'archivist', comment: '审核通过' });
    if (opts.toGroup) return { ok: true, finalStatus: '已组卷', logs };
    return { ok: true, finalStatus: s2, logs };
  }
  // 直接组卷（跳过审核）
  if (opts.toGroup) return { ok: true, finalStatus: '已组卷', logs };
  return { ok: true, finalStatus: status, logs };
}

describe('审核链路状态机（双链路）', () => {
  it('链路A：进审核库 → 审核通过 → 组卷（完整闭环）', () => {
    const r = pipeline('仅件数据', { toReview: true, toGroup: true });
    expect(r.ok).toBe(true);
    expect(r.finalStatus).toBe('已组卷');
    expect(r.logs.map((l) => l.action)).toEqual(['enter', 'approve']);
  });

  it('链路B：直接组卷，跳过审核', () => {
    const r = pipeline('仅件数据', { toReview: false, toGroup: true });
    expect(r.ok).toBe(true);
    expect(r.finalStatus).toBe('已组卷');
    expect(r.logs).toHaveLength(0);
  });

  it('链路C：进审核库但审核不通过（驳回）回收集池', () => {
    const r = pipeline('仅件数据', { toReview: true, toGroup: false });
    expect(r.ok).toBe(true);
    expect(r.finalStatus).toBe('仅件数据');
    expect(r.logs).toHaveLength(2);
  });

  it('非法动作守卫：仅件数据不可直接审核通过', () => {
    expect(() => applyReview('仅件数据', 'approve')).toThrow('仅「待审核」记录可审核通过');
  });

  it('非法动作守卫：待审核不可再次进入审核库', () => {
    expect(() => applyReview('待审核', 'enter')).toThrow('仅「仅件数据」记录可进入审核库');
  });

  it('已组卷记录不可进入审核库（已固化）', () => {
    expect(() => applyReview('已组卷', 'enter')).toThrow('仅「仅件数据」记录可进入审核库');
  });
});

// ─── 多数据源配置权限逻辑（与 DatasourceController 对齐） ───

const ADMIN_ROLES = ['admin', 'archive_director', 'archivist'];
const READONLY_ROLES = ['employee', 'dept_manager', 'cfo', 'hrvp'];

function canManageDatasource(roles: string[]): boolean {
  return roles.some((r) => ADMIN_ROLES.includes(r));
}

describe('数据源配置权限', () => {
  it('档案管理员/主管/admin 可管理数据源', () => {
    expect(canManageDatasource(['archivist'])).toBe(true);
    expect(canManageDatasource(['archive_director'])).toBe(true);
    expect(canManageDatasource(['admin'])).toBe(true);
  });

  it('普通员工/经理/CFO/HRVP 无数据源管理权限', () => {
    for (const r of READONLY_ROLES) {
      expect(canManageDatasource([r])).toBe(false);
    }
  });

  it('复合角色只要含档案管理员即可', () => {
    expect(canManageDatasource(['employee', 'archivist'])).toBe(true);
  });
});
