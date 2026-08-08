/**
 * Fonds Service - 全宗管理
 *
 * 通过 Alfresco Node API 管理自定义 finance:fonds 类型节点，
 * 数据存储在 Alfresco 仓库中（PostgreSQL 持久化）。
 *
 * 节点结构:
 * /Company Home/会计档案管理/
 *   ├─ Z001 (finance:fonds)  ← 一个全宗就是一个节点
 *   ├─ Z002 (finance:fonds)
 *   └─ ...
 */

// ─── 基础配置 ──────────────────────────────────────────
import { session } from './session';

const BASE_URL = '/api/proxy/alfresco';
const API_V1 = `${BASE_URL}/api/-default-/public/alfresco/versions/1`;

// ─── Types ─────────────────────────────────────────────
export interface FondsNode {
  id: string;          // Alfresco 节点 ID
  code: string;        // 全宗号
  name: string;        // 全宗名称
  status: 'active' | 'custodial';
  address?: string;
  syncSource?: string;
  custodianCode?: string;  // 代管方全宗号（代管全宗指向现行全宗）
  companyId?: string;      // 所属公司组织 ID
  enableYear?: number;     // 启用年度
  remark?: string;         // 备注（历史沿革）
  createdAt?: string;
  modifiedAt?: string;
}

// ─── 内部工具函数 ──────────────────────────────────────

/** 组装请求（有会话走 alf_ticket 参数，无会话走开发回退 Basic） */
function reqInit(init?: RequestInit): { url: (u: string) => string; init: RequestInit } {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept-Charset': 'UTF-8',
  };
  const ticketed = (u: string) => session.withTicket(u);
  return {
    url: (u: string) => ticketed(u) ?? u,
    init: {
      ...init,
      headers: {
        ...headers,
        ...(session.ticket() ? {} : { 'Authorization': session.alfrescoAuthHeader() }),
        ...((init?.headers as Record<string, string>) || {}),
      },
    },
  };
}

async function getJson<T>(url: string): Promise<T> {
  const r = reqInit();
  const res = await fetch(r.url(url), { headers: r.init.headers });
  if (!res.ok) throw new Error(`Alfresco API 错误 (${res.status}): ${await res.text()}`);
  if (res.status === 204) return {} as T;
  return res.json();
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const r = reqInit();
  const res = await fetch(r.url(url), {
    method: 'POST',
    headers: r.init.headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Alfresco API 错误 (${res.status}): ${await res.text()}`);
  return res.json();
}

async function putJson<T>(url: string, body: any): Promise<T> {
  const r = reqInit();
  const res = await fetch(r.url(url), {
    method: 'PUT',
    headers: r.init.headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Alfresco API 错误 (${res.status}): ${await res.text()}`);
  return res.json();
}

async function del(url: string): Promise<void> {
  const r = reqInit();
  const res = await fetch(r.url(url), { method: 'DELETE', headers: r.init.headers });
  if (!res.ok) throw new Error(`Alfresco API 错误 (${res.status}): ${await res.text()}`);
}

// ─── Constants ─────────────────────────────────────────
const ROOT_NAME = '会计档案管理';
const FONDS_TYPE = 'finance:fonds';

// ─── Helpers ───────────────────────────────────────────

/** 获取 Company Home 的节点 ID（-root-；注意 -my- 对普通用户是个人主目录，不可用） */
async function getCompanyHomeId(): Promise<string> {
  const res = await getJson<any>(`${API_V1}/nodes/-root-`);
  return res.entry.id;
}

/**
 * 确保根目录 "会计档案管理" 存在，并返回其 ID
 */
async function ensureRootFolder(): Promise<string> {
  const companyHomeId = await getCompanyHomeId();
  const children = await getJson<any>(`${API_V1}/nodes/${companyHomeId}/children?skipCount=0&maxItems=200`);

  const existing = children.list?.entries?.find(
    (e: any) => e.entry.name === ROOT_NAME && e.entry.nodeType === 'cm:folder'
  );
  if (existing) return existing.entry.id;

  // 创建根文件夹
  const created = await postJson<any>(`${API_V1}/nodes/${companyHomeId}/children`, {
    name: ROOT_NAME,
    nodeType: 'cm:folder',
  });
  return created.entry.id;
}

/**
 * 把 Alfresco 节点数据转为 FondsNode
 */
function toFondsNode(entry: any): FondsNode {
  const props = entry.properties || {};
  return {
    id: entry.id,
    // 代号只认 finance:code；名称兜底须兼容「全宗 Z001」(DataSeeder/createFonds) 与
    // 「Fonds Z001」(早期英文命名) 两种命名，缺 properties 时剥前缀而不是直接用全名
    code: props['finance:code'] || entry.name?.replace(/^(全宗|Fonds)\s+/i, '') || '',
    name: props['finance:fondsName'] || entry.name || '',
    status: (props['finance:status'] || 'active') as 'active' | 'custodial',
    address: props['finance:address'] || '',
    syncSource: props['finance:syncSource'] || '',
    custodianCode: props['finance:custodianCode'] || '',
    companyId: props['finance:companyId'] || '',
    enableYear: props['finance:enableYear'] ?? undefined,
    remark: props['finance:remark'] || '',
    createdAt: entry.createdAt,
    modifiedAt: entry.modifiedAt,
  };
}

// ─── CRUD API ──────────────────────────────────────────

/**
 * 获取所有全宗
 */
export async function fetchFondsList(): Promise<FondsNode[]> {
  const rootId = await ensureRootFolder();
  // 必须 include=properties：否则 finance:code 缺失，toFondsNode 会退化成用节点名当代号
  // （历史教训：英文命名节点 "Fonds Z001" 被当成全宗号发出 → 服务端报全宗不存在）
  const children = await getJson<any>(
    `${API_V1}/nodes/${rootId}/children?skipCount=0&maxItems=200&include=properties`
  );

  const entries = children.list?.entries || [];
  // 过滤出 finance:fonds 类型的节点
  return entries
    .filter((e: any) => e.entry.nodeType === FONDS_TYPE)
    .map((e: any) => toFondsNode(e.entry));
}

/**
 * 创建全宗
 */
export async function createFonds(data: {
  code: string;
  name: string;
  status?: 'active' | 'custodial';
  address?: string;
  syncSource?: string;
  custodianCode?: string;
  companyId?: string;
  enableYear?: number;
  remark?: string;
}): Promise<FondsNode> {
  const rootId = await ensureRootFolder();
  const props: Record<string, string | number> = {
    'finance:code': data.code,
    'finance:fondsName': data.name,
    'finance:status': data.status || 'active',
  };
  if (data.address) props['finance:address'] = data.address;
  if (data.syncSource) props['finance:syncSource'] = data.syncSource;
  if (data.custodianCode) props['finance:custodianCode'] = data.custodianCode;
  if (data.companyId) props['finance:companyId'] = data.companyId;
  if (data.enableYear) props['finance:enableYear'] = data.enableYear;
  if (data.remark) props['finance:remark'] = data.remark;

  const created = await postJson<any>(`${API_V1}/nodes/${rootId}/children`, {
    name: `全宗 ${data.code}`,
    nodeType: FONDS_TYPE,
    properties: props,
  });
  return toFondsNode(created.entry);
}

/**
 * 更新全宗
 */
export async function updateFonds(nodeId: string, data: Partial<FondsNode>): Promise<FondsNode> {
  const properties: Record<string, string | number> = {};
  if (data.code !== undefined) properties['finance:code'] = data.code;
  if (data.name !== undefined) properties['finance:fondsName'] = data.name;
  if (data.status !== undefined) properties['finance:status'] = data.status;
  if (data.address !== undefined) properties['finance:address'] = data.address;
  if (data.syncSource !== undefined) properties['finance:syncSource'] = data.syncSource;
  if (data.custodianCode !== undefined) properties['finance:custodianCode'] = data.custodianCode;
  if (data.companyId !== undefined) properties['finance:companyId'] = data.companyId;
  if (data.enableYear !== undefined) properties['finance:enableYear'] = data.enableYear;
  if (data.remark !== undefined) properties['finance:remark'] = data.remark;

  const updated = await putJson<any>(`${API_V1}/nodes/${nodeId}`, {
    properties,
  });
  return toFondsNode(updated.entry);
}

/**
 * 删除全宗
 */
export async function deleteFonds(nodeId: string): Promise<void> {
  await del(`${API_V1}/nodes/${nodeId}`);
}
