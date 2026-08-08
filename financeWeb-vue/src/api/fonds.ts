/**
 * 全宗管理 API（Axios 版）
 */
import axios from 'axios';
import { API_V1, AUTH_HEADERS } from '@/config/api';

const http = axios.create({ headers: AUTH_HEADERS });

// ─── 类型 ──────────────────────────────────────
export interface FondsNode {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'inactive';
  address?: string;
  syncSource?: string;
  custodianCode?: string;
  createdAt?: string;
  modifiedAt?: string;
}

// ─── 辅助函数 ──────────────────────────────────
async function getJson<T>(url: string): Promise<T> {
  const res = await http.get<T>(url);
  return res.data as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await http.post<T>(url, body);
  return res.data as T;
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const res = await http.put<T>(url, body);
  return res.data as T;
}

const ROOT_NAME = '会计档案管理';
const FONDS_TYPE = 'finance:fonds';

let cachedRootId: string | null = null;

async function getRootFolderId(): Promise<string> {
  if (cachedRootId) return cachedRootId;
  const companyHome = await getJson<{ entry: { id: string } }>(`${API_V1}/nodes/-my-`);
  const children = await getJson<{ list: { entries: { entry: { id: string; name: string; nodeType: string } }[] } }>(`${API_V1}/nodes/${companyHome.entry.id}/children?skipCount=0&maxItems=200`);
  const existing = children.list?.entries?.find((e) => e.entry.name === ROOT_NAME);
  if (existing) {
    cachedRootId = existing.entry.id;
    return cachedRootId;
  }
  const created = await postJson<{ entry: { id: string } }>(`${API_V1}/nodes/${companyHome.entry.id}/children`, { name: ROOT_NAME, nodeType: 'cm:folder' });
  cachedRootId = created.entry.id;
  return cachedRootId;
}

function toFondsNode(entry: { id: string; name: string; createdAt?: string; modifiedAt?: string; properties?: Record<string, string> }): FondsNode {
  const props = entry.properties || {};
  return {
    id: entry.id,
    code: props['finance:code'] || entry.name?.replace('Fonds ', '') || '',
    name: props['finance:fondsName'] || entry.name || '',
    status: (props['finance:status'] as 'active' | 'inactive') || 'active',
    address: props['finance:address'] || '',
    syncSource: props['finance:syncSource'] || '',
    custodianCode: props['finance:custodianCode'] || '',
    createdAt: entry.createdAt,
    modifiedAt: entry.modifiedAt,
  };
}

// ─── CRUD ──────────────────────────────────────
export async function fetchFondsList(): Promise<FondsNode[]> {
  const rootId = await getRootFolderId();
  const children = await getJson<{ list: { entries: { entry: { id: string; name: string; nodeType: string; createdAt?: string; modifiedAt?: string; properties?: Record<string, string> } }[] } }>(`${API_V1}/nodes/${rootId}/children?skipCount=0&maxItems=200`);
  return (children.list?.entries || [])
    .filter((e) => e.entry.nodeType === FONDS_TYPE)
    .map((e) => toFondsNode(e.entry));
}

export async function createFonds(data: { code: string; name: string; status?: 'active' | 'inactive'; address?: string; syncSource?: string; custodianCode?: string }): Promise<FondsNode> {
  const rootId = await getRootFolderId();
  cachedRootId = null;
  const props: Record<string, string> = {
    'finance:code': data.code,
    'finance:fondsName': data.name,
    'finance:status': data.status || 'active',
  };
  if (data.address) props['finance:address'] = data.address;
  if (data.syncSource) props['finance:syncSource'] = data.syncSource;
  if (data.custodianCode) props['finance:custodianCode'] = data.custodianCode;
  const created = await postJson<{ entry: { id: string; name: string; createdAt?: string; modifiedAt?: string; properties?: Record<string, string> } }>(`${API_V1}/nodes/${rootId}/children`, { name: `Fonds ${data.code}`, nodeType: FONDS_TYPE, properties: props });
  return toFondsNode(created.entry);
}

export async function updateFonds(nodeId: string, data: Partial<FondsNode>): Promise<FondsNode> {
  const properties: Record<string, string> = {};
  if (data.code !== undefined) properties['finance:code'] = data.code;
  if (data.name !== undefined) properties['finance:fondsName'] = data.name;
  if (data.status !== undefined) properties['finance:status'] = data.status;
  if (data.address !== undefined) properties['finance:address'] = data.address;
  if (data.syncSource !== undefined) properties['finance:syncSource'] = data.syncSource;
  if (data.custodianCode !== undefined) properties['finance:custodianCode'] = data.custodianCode;
  const updated = await putJson<{ entry: { id: string; name: string; createdAt?: string; modifiedAt?: string; properties?: Record<string, string> } }>(`${API_V1}/nodes/${nodeId}`, { properties });
  return toFondsNode(updated.entry);
}

export async function deleteFonds(nodeId: string): Promise<void> {
  cachedRootId = null;
  await http.delete(`${API_V1}/nodes/${nodeId}`);
}
