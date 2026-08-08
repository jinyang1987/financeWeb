/**
 * Organization/Unit/Personnel API（Axios 版）
 *
 * 所有组织实体（单位 / 部门）以 Alfresco Group 表示，形成统一组织树：
 *   GROUP_org_root               ← 组织根节点
 *   └── GROUP_comp_xxx           ← 单位
 *       └── GROUP_dept_xxx       ← 部门
 *
 * API：
 *   根组:     POST   /api/.../alfresco/versions/1/groups
 *   子组:     POST   /alfresco/service/api/groups/{parent}/children/GROUP_{child}
 *   查询子组:  GET    /alfresco/service/api/groups/{parent}/children
 *   删除组:   DELETE /api/.../alfresco/versions/1/groups/{id}
 */
import axios from 'axios';
import { API_V1, LEGACY_GROUPS, AUTH_HEADERS } from '@/config/api';

const http = axios.create({ headers: AUTH_HEADERS });

// ─── 类型定义 ────────────────────────────────────

export interface UnitItem {
  id: string;       // shortName, e.g. "comp_hq"
  code: string;     // 业务编码, e.g. "hq"
  name: string;     // displayName
  title?: string;
  fullName: string; // GROUP_comp_hq
  orgType?: string; // 'unit' | 'dept'
}

export interface PersonnelItem {
  id: string;
  account: string;
  name: string;
  email: string;
  enabled: boolean;
  org?: string;
  position?: string;
}

/** Alfresco Legacy API 返回的子组条目 */
interface LegacyGroupChild {
  authorityType: 'USER' | 'GROUP';
  shortName: string;
  fullName: string;
  displayName: string;
}

// ─── 工具函数 ────────────────────────────────────

const ORG_ROOT = 'org_root';

function shortNameToType(shortName: string): 'unit' | 'dept' | 'root' {
  if (shortName === ORG_ROOT) return 'root';
  if (shortName.startsWith('comp_')) return 'unit';
  if (shortName.startsWith('dept_')) return 'dept';
  return 'dept';
}

function shortNameToCode(shortName: string): string {
  if (shortName.startsWith('comp_')) return shortName.slice(5);
  if (shortName.startsWith('dept_')) return shortName.slice(5);
  return shortName;
}

function childToUnitItem(child: LegacyGroupChild): UnitItem {
  return {
    id: child.shortName,
    code: shortNameToCode(child.shortName),
    name: child.displayName,
    fullName: child.fullName,
    orgType: shortNameToType(child.shortName),
  };
}

async function get<T>(url: string): Promise<T> {
  const res = await http.get<T>(url);
  return res.data as T;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.post<T>(url, body);
  return res.data as T;
}

async function put<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.put<T>(url, body);
  return res.data as T;
}

async function del(url: string): Promise<void> {
  await http.delete(url);
}

// ─── 组织根节点 ──────────────────────────────────

/** 确保组织根节点存在 */
async function ensureOrgRoot(): Promise<void> {
  try {
    await get(`${API_V1}/groups/GROUP_${ORG_ROOT}`);
  } catch {
    await post(`${API_V1}/groups`, {
      id: `GROUP_${ORG_ROOT}`,
      displayName: '组织架构根节点',
    });
  }
}

// ─── 子组查询 ────────────────────────────────────

/** 列出指定父组下的子组（仅 GROUP 类型） */
async function listChildGroups(parentShortName: string): Promise<LegacyGroupChild[]> {
  const data = await get<{ data: LegacyGroupChild[]; paging: unknown }>(
    `${LEGACY_GROUPS}/${parentShortName}/children`,
  );
  return (data.data || []).filter((c) => c.authorityType === 'GROUP');
}

// ─── 对外 API ────────────────────────────────────

/**
 * 获取单位树（org_root 下的所有单位）
 * 返回顶层 unit 节点列表；每个 unit 如有子部门/子单位，需再通过 fetchSubUnits 获取
 */
export async function fetchUnitTree(): Promise<UnitItem[]> {
  await ensureOrgRoot();
  const children = await listChildGroups(ORG_ROOT);
  return children
    .filter((c) => shortNameToType(c.shortName) === 'unit')
    .map(childToUnitItem);
}

/** 获取指定节点下的子节点列表 */
export async function fetchSubUnits(parentShortName: string): Promise<UnitItem[]> {
  const children = await listChildGroups(parentShortName);
  return children.map(childToUnitItem);
}

/** 创建根级单位（挂在 org_root 下） */
export async function createUnit(code: string, name: string): Promise<UnitItem> {
  await ensureOrgRoot();
  const shortName = `comp_${code}`;
  const data = await post<{ data: LegacyGroupChild }>(
    `${LEGACY_GROUPS}/${ORG_ROOT}/children/GROUP_${shortName}`,
    { shortName, displayName: name },
  );
  return childToUnitItem(data.data);
}

/** 在指定父节点下创建子单位/部门 */
export async function createSubUnit(
  parentShortName: string,
  code: string,
  name: string,
  orgType: 'unit' | 'dept' = 'unit',
): Promise<UnitItem> {
  const prefix = orgType === 'unit' ? 'comp' : 'dept';
  const shortName = `${prefix}_${code}`;
  const data = await post<{ data: LegacyGroupChild }>(
    `${LEGACY_GROUPS}/${parentShortName}/children/GROUP_${shortName}`,
    { shortName, displayName: name },
  );
  return childToUnitItem(data.data);
}

/** 删除单位 */
export async function deleteUnit(shortName: string): Promise<void> {
  // 兼容传入 fullName（GROUP_xxx）的调用方式
  const name = shortName.startsWith('GROUP_') ? shortName.slice(6) : shortName;
  await del(`${API_V1}/groups/GROUP_${name}`);
}

/** 更新单位名称 */
export async function updateUnitName(shortName: string, displayName: string): Promise<UnitItem> {
  // Alfresco Groups V1 支持 PUT 更新 displayName
  const data = await put<{ entry: { id: string; displayName: string } }>(
    `${API_V1}/groups/GROUP_${shortName}`,
    { displayName },
  );
  return {
    id: shortName,
    code: shortNameToCode(shortName),
    name: data.entry.displayName || displayName,
    fullName: data.entry.id || `GROUP_${shortName}`,
    orgType: shortNameToType(shortName),
  };
}

// ─── 人员管理 ────────────────────────────────────

// ─── 组织树类型 ────────────────────────────────────

export interface OrgTreeNode {
  id: string;
  name: string;
  orgType: 'unit' | 'dept';
  fullName: string;
  children?: OrgTreeNode[];
}

/** 获取完整组织树 */
export async function fetchOrgTree(): Promise<OrgTreeNode[]> {
  await ensureOrgRoot();
  const rootChildren = await listChildGroups(ORG_ROOT);
  const result: OrgTreeNode[] = [];
  for (const child of rootChildren) {
    if (shortNameToType(child.shortName) !== 'unit') continue;
    const node: OrgTreeNode = {
      id: child.shortName,
      name: child.displayName,
      orgType: 'unit',
      fullName: child.fullName,
    };
    // 递归获取子部门
    const subChildren = await listChildGroups(child.shortName);
    const depts: OrgTreeNode[] = [];
    for (const sub of subChildren) {
      if (shortNameToType(sub.shortName) === 'dept') {
        depts.push({
          id: sub.shortName,
          name: sub.displayName,
          orgType: 'dept',
          fullName: sub.fullName,
        });
      }
    }
    if (depts.length) node.children = depts;
    result.push(node);
  }
  return result;
}

/** 创建部门（挂在指定父节点下） */
export async function createDepartment(parentId: string, opt: { name: string }): Promise<UnitItem> {
  // parentId 格式如 comp_hq，生成 dept_xxx shortName
  const code = opt.name.slice(0, 10);
  return createSubUnit(parentId, code, opt.name, 'dept');
}

/** 删除部门 */
export async function deleteDepartment(fullName: string): Promise<void> {
  await del(`${API_V1}/groups/${fullName}`);
}

/** 获取人员列表 */
export async function fetchPersonnel(): Promise<PersonnelItem[]> {
  const data = await get<{ list: { entries: { entry: {
    id: string; firstName: string; lastName: string; displayName?: string;
    email: string; enabled: boolean; memberOf?: string[];
  } }[] } }>(
    `${API_V1}/people?skipCount=0&maxItems=200`,
  );
  return (data.list?.entries || []).map((e) => {
    const p = e.entry;
    return {
      id: p.id,
      account: p.id,
      name: p.displayName || `${p.firstName}${p.lastName}`,
      email: p.email,
      enabled: p.enabled,
      position: p.memberOf?.find((g) => g.includes('dept_') || g.includes('comp_')) || '',
    };
  });
}
