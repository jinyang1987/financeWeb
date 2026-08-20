/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * session — 当前登录会话（ticket/userId）
 *
 * 由 authService 在登录/登出时写入；services 层读取注入请求头。
 * ticket 持久化到 localStorage（页面刷新后自动恢复，再由 /auth/me 校验有效性）。
 * 独立成模块以避免 services ↔ stores 循环依赖。
 *
 * 认证模式（P0-5 起）：
 *   ams-server 调用 → 携带 X-User-Id + X-Alfresco-Ticket
 *   Alfresco 直连调用（过渡期存量代码）→ alf_ticket 查询参数
 */

export interface AmsSession {
  userId: string;
  ticket: string;
  displayName: string;
  /** Alfresco 直连专用 ticket（服务端换发的 admin ticket）——与 ams 会话 ticket 分离存放，
   *  避免换发覆盖会话后 userId/ticket 错配、401 死循环（2026-08-19 修复） */
  alfTicket?: string;
}

const TICKET_KEY = 'ams-ticket-v1';

/**
 * 开发期回退凭据（P0-6 用户 seed 完成前，Alfresco 直连存量代码使用）。
 * ★ 收敛为唯一回退点（原 alfresco.ts:14 / fondsService.ts:17 两处硬编码），
 *   P0-6 后无会话时一律 401，不再回退。
 */
const DEV_FALLBACK_BASIC = 'Basic ' + btoa('admin:admin');

function loadPersisted(): AmsSession | null {
  try {
    const raw = localStorage.getItem(TICKET_KEY);
    return raw ? (JSON.parse(raw) as AmsSession) : null;
  } catch {
    return null;
  }
}

let current: AmsSession | null = loadPersisted();

function persist() {
  try {
    if (current) localStorage.setItem(TICKET_KEY, JSON.stringify(current));
    else localStorage.removeItem(TICKET_KEY);
  } catch {
    /* 忽略存储异常 */
  }
}

export const session = {
  set(s: AmsSession | null) {
    current = s;
    persist();
  },
  clear() {
    current = null;
    persist();
  },
  get(): AmsSession | null {
    return current;
  },
  userId(): string | null {
    return current?.userId ?? null;
  },
  ticket(): string | null {
    return current?.ticket ?? null;
  },
  /**
   * Alfresco 直连 URL 注入 alf_ticket（ACS 26 实测不接受 Basic userId:ticket）。
   * 优先用换发的 alfTicket，其次用户自己的 ticket；无任何凭据时返回 null（调用方触发换发）。
   */
  withTicket(url: string): string | null {
    const t = current?.alfTicket || current?.ticket;
    if (!t) return null;
    return url + (url.includes('?') ? '&' : '?') + 'alf_ticket=' + encodeURIComponent(t);
  },
  /** 仅更新 Alfresco 直连 ticket（不动 ams 会话 ticket——换发的 admin ticket 不再污染会话） */
  setAlfTicket(t: string) {
    if (!current) return;
    current = { ...current, alfTicket: t };
    persist();
  },
  /** Alfresco REST 认证头（仅开发回退场景使用） */
  alfrescoAuthHeader(): string {
    return DEV_FALLBACK_BASIC;
  },
  /** ams-server 请求头 */
  amsHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (current) {
      h['X-User-Id'] = current.userId;
      h['X-Alfresco-Ticket'] = current.ticket;
    }
    return h;
  },
};
