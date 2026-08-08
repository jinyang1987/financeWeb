/**
 * Alfresco REST API 服务层
 *
 * 封装 Alfresco Content Services REST API v1
 * 基础 URL: /api/proxy/alfresco/api/-default-/public/alfresco/versions/1
 * 文档: http://localhost:8080/alfresco/api-explorer
 */

// ─── 基础配置 ──────────────────────────────────────────
import { session } from './session';

const BASE_URL = '/api/proxy/alfresco';
const API_V1 = `${BASE_URL}/api/-default-/public/alfresco/versions/1`;

// ─── 工具函数 ──────────────────────────────────────────

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  // 有会话：alf_ticket 查询参数（ACS 26 不接受 Basic userId:ticket）；
  // 无会话：开发期回退 Basic（见 session.ts）
  const ticketed = session.withTicket(url);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept-Charset': 'UTF-8',
    ...((options?.headers as Record<string, string>) || {}),
  };
  if (!ticketed) {
    headers['Authorization'] = session.alfrescoAuthHeader();
  }
  const res = await fetch(ticketed ?? url, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alfresco API 错误 (${res.status}): ${text}`);
  }
  // 204 No Content
  if (res.status === 204) return {} as T;
  return res.json();
}

// ─── 类型定义（Alfresco API 响应结构）───────────────────

export interface SiteEntry {
  id: string;
  title: string;
  description?: string;
  visibility: string;
  guid?: string;
  role?: string;
}

export interface PersonEntry {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  email: string;
  enabled: boolean;
  memberOf?: string[];
}

export interface NodeEntry {
  id: string;
  name: string;
  nodeType: string;
  createdAt: string;
  modifiedAt: string;
  parentId?: string;
  isFolder: boolean;
  isFile: boolean;
  properties?: Record<string, any>;
  aspectNames?: string[];
}

export interface GroupEntry {
  id: string;
  displayName: string;
  isRoot: boolean;
  parentIds?: string[];
  zone?: string;
}

// ─── 数据转换（Alfresco ↔ 前端业务模型）─────────────────

export function siteToUnit(site: SiteEntry) {
  return {
    id: site.id,
    name: site.title,
    code: site.id.toUpperCase(),
    visibility: site.visibility,
  };
}

export function nodeToDept(node: NodeEntry) {
  return {
    id: node.id,
    name: node.name,
    shortName: node.name,
  };
}

export function personToPersonnel(person: PersonEntry) {
  return {
    id: person.id,
    account: person.id,
    name: `${person.firstName}${person.lastName}`,
    email: person.email,
    enabled: person.enabled,
  };
}

// ─── Sites（单位/站点管理）──────────────────────────────────
// 单位 → Alfresco Site
// 部门 → Site DocumentLibrary 下的 Folders

export const SiteService = {
  /** 获取所有站点（单位列表） */
  async list(): Promise<SiteEntry[]> {
    const data = await request<{ list: { entries: { entry: SiteEntry }[] } }>(
      `${API_V1}/sites?skipCount=0&maxItems=100`,
    );
    return (data.list?.entries || []).map(e => e.entry);
  },

  /** 创建站点（单位） */
  async create(site: { id: string; title: string; description?: string }): Promise<SiteEntry> {
    const data = await request<{ entry: SiteEntry }>(`${API_V1}/sites`, {
      method: 'POST',
      body: JSON.stringify({
        id: site.id,
        title: site.title,
        description: site.description || '',
        visibility: 'PRIVATE',
      }),
    });
    return data.entry;
  },

  /** 更新站点（单位） */
  async update(id: string, site: { title?: string; description?: string }): Promise<SiteEntry> {
    const data = await request<{ entry: SiteEntry }>(`${API_V1}/sites/${id}`, {
      method: 'PUT',
      body: JSON.stringify(site),
    });
    return data.entry;
  },

  /** 删除站点（单位） */
  async delete(id: string): Promise<void> {
    await request<void>(`${API_V1}/sites/${id}`, { method: 'DELETE' });
  },

  /** 获取站点的 DocumentLibrary 节点 ID */
  async getDocLibId(siteId: string): Promise<string> {
    // 站点容器信息
    const container = await request<{ entry: { id: string; folderId: string } }>(
      `${API_V1}/sites/${siteId}/containers/documentLibrary`,
    );
    return container.entry.id;
  },
};

// ─── Nodes（部门/文件夹管理）─────────────────────────────────
// 使用 DocumentLibrary 下的文件夹表示部门

export const FolderService = {
  /** 获取文件夹下的子节点列表 */
  async listChildren(parentId: string): Promise<NodeEntry[]> {
    const data = await request<{ list: { entries: { entry: NodeEntry }[] } }>(
      `${API_V1}/nodes/${parentId}/children?skipCount=0&maxItems=100&include=properties,aspectNames`,
    );
    return (data.list?.entries || []).map(e => e.entry);
  },

  /** 创建文件夹 */
  async create(parentId: string, name: string, props?: Record<string, any>): Promise<NodeEntry> {
    const data = await request<{ entry: NodeEntry }>(`${API_V1}/nodes/${parentId}/children`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        nodeType: 'cm:folder',
        properties: props || {},
      }),
    });
    return data.entry;
  },

  /** 更新节点 */
  async update(nodeId: string, body: { name?: string; properties?: Record<string, any> }): Promise<NodeEntry> {
    const data = await request<{ entry: NodeEntry }>(`${API_V1}/nodes/${nodeId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return data.entry;
  },

  /** 删除节点 */
  async delete(nodeId: string): Promise<void> {
    await request<void>(`${API_V1}/nodes/${nodeId}`, { method: 'DELETE' });
  },
};

// ─── People（人员管理）─────────────────────────────────────

export const PeopleService = {
  /** 获取人员列表 */
  async list(): Promise<PersonEntry[]> {
    const data = await request<{ list: { entries: { entry: PersonEntry }[] } }>(
      `${API_V1}/people?skipCount=0&maxItems=100`,
    );
    return (data.list?.entries || []).map(e => e.entry);
  },

  /** 创建人员 */
  async create(person: {
    id: string;
    firstName: string;
    lastName?: string;
    email: string;
    password: string;
  }): Promise<PersonEntry> {
    const data = await request<{ entry: PersonEntry }>(`${API_V1}/people`, {
      method: 'POST',
      body: JSON.stringify({
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName || '',
        email: person.email,
        password: person.password,
      }),
    });
    return data.entry;
  },

  /** 更新人员 */
  async update(id: string, person: { firstName?: string; lastName?: string; email?: string; enabled?: boolean }): Promise<PersonEntry> {
    const data = await request<{ entry: PersonEntry }>(`${API_V1}/people/${id}`, {
      method: 'PUT',
      body: JSON.stringify(person),
    });
    return data.entry;
  },

  /** 删除人员 */
  async delete(id: string): Promise<void> {
    await request<void>(`${API_V1}/people/${id}`, { method: 'DELETE' });
  },
};

// ─── Groups（组织架构 + 角色管理）─────────────────────────
//
// 所有组织实体（单位/部门）都用 Group 表示，形成统一的组织树：
//
//   GROUP_org_root  (shortName: org_root)          ← 组织根节点（系统创建）
//   ├── GROUP_comp_hq       (shortName: comp_hq)   ← 单位/公司
//   │   ├── GROUP_comp_south (shortName: comp_south) ← 子单位
//   │   │   └── GROUP_dept_finance (shortName: dept_finance) ← 子公司的部门
//   │   ├── GROUP_dept_finance (shortName: dept_finance)     ← 部门
//   │   │   └── GROUP_dept_acc (shortName: dept_acc)         ← 子部门
//   │   └── GROUP_dept_admin (shortName: dept_admin)         ← 部门
//   └── GROUP_comp_overseas (shortName: comp_overseas) ← 另一单位
//
// API 说明：
//   创建根组: POST /api/-default-/public/alfresco/versions/1/groups (REST v1)
//   创建子组: POST /alfresco/service/api/groups/{parentShortName}/children/{childId} (Legacy)
//   查询子组: GET  /alfresco/service/api/groups/{parentShortName}/children (Legacy)
//   删除组:   DELETE /api/-default-/public/alfresco/versions/1/groups/{id} (REST v1)

const LEGACY_GROUPS = `${BASE_URL}/service/api/groups`;

/** 组织根节点的 shortName（所有单位/部门挂在此节点下） */
const ORG_ROOT = 'org_root';

/** Legacy API 返回的子组条目 */
interface LegacyGroupChild {
  authorityType: 'USER' | 'GROUP';
  shortName: string;
  fullName: string;
  displayName: string;
}

/** 组名称前缀 -> 组织类型映射 */
function shortNameToType(shortName: string): 'unit' | 'dept' | 'root' {
  if (shortName === ORG_ROOT) return 'root';
  if (shortName.startsWith('comp_')) return 'unit';
  if (shortName.startsWith('dept_')) return 'dept';
  return 'dept'; // fallback
}

// ─── 导出接口 ─────────────────────────────────────────────
export interface OrgNodeInfo {
  shortName: string;
  fullName: string;
  displayName: string;
  orgType: 'unit' | 'dept' | 'root';
  children?: OrgNodeInfo[];
}

export const GroupService = {
  /** 获取根组列表 */
  async list(): Promise<GroupEntry[]> {
    const data = await request<{ list: { entries: { entry: GroupEntry }[] } }>(
      `${API_V1}/groups?skipCount=0&maxItems=100`,
    );
    return (data.list?.entries || []).map(e => e.entry);
  },

  /** 创建根组 */
  async create(id: string, displayName: string): Promise<GroupEntry> {
    const data = await request<{ entry: GroupEntry }>(`${API_V1}/groups`, {
      method: 'POST',
      body: JSON.stringify({ id, displayName }),
    });
    return data.entry;
  },

  /** 删除组（会递归删除所有子组） */
  async delete(id: string): Promise<void> {
    await request<void>(`${API_V1}/groups/${id}`, { method: 'DELETE' });
  },

  /** ─── 组织树管理 ──────────────────────────────────── */

  /** 确保组织根节点 exist */
  async ensureOrgRoot(): Promise<void> {
    try {
      // 尝试获取根节点
      await request(`${API_V1}/groups/GROUP_${ORG_ROOT}`);
    } catch {
      // 不存在则创建
      await this.create(`GROUP_${ORG_ROOT}`, '组织架构根节点');
    }
  },

  /** 创建组织节点（单位或部门） */
  async createOrgNode(
    parentShortName: string,
    orgType: 'unit' | 'dept',
    id: string,
    displayName: string,
  ): Promise<LegacyGroupChild> {
    const prefix = orgType === 'unit' ? 'comp' : 'dept';
    const shortName = `${prefix}_${id}`;
    return this.createChild(parentShortName, shortName, displayName);
  },

  /** 创建子组 */
  async createChild(
    parentShortName: string,
    shortName: string,
    displayName: string,
  ): Promise<LegacyGroupChild> {
    const data = await request<{ data: LegacyGroupChild }>(
      `${LEGACY_GROUPS}/${parentShortName}/children/GROUP_${shortName}`,
      {
        method: 'POST',
        body: JSON.stringify({ shortName, displayName }),
      },
    );
    return data.data;
  },

  /** 列出子组（仅 GROUP 类型） */
  async listChildGroups(parentShortName: string): Promise<LegacyGroupChild[]> {
    const data = await request<{ data: LegacyGroupChild[]; paging: any }>(
      `${LEGACY_GROUPS}/${parentShortName}/children`,
    );
    return (data.data || []).filter(c => c.authorityType === 'GROUP');
  },

  /** 获取组织节点类型 */
  getOrgType(shortName: string): 'unit' | 'dept' | 'root' {
    return shortNameToType(shortName);
  },

  /** ─── 人员组成员管理 ──────────────────────────────── */

  /** 添加人员到组 */
  async addMember(groupId: string, personId: string): Promise<void> {
    await request<void>(`${API_V1}/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ id: personId, memberType: 'PERSON' }),
    });
  },

  /** 从组移除人员 */
  async removeMember(groupId: string, personId: string): Promise<void> {
    await request<void>(`${API_V1}/groups/${groupId}/members/${personId}`, {
      method: 'DELETE',
    });
  },

  /** 获取组成员 */
  async getMembers(groupId: string): Promise<PersonEntry[]> {
    const data = await request<{ list: { entries: { entry: PersonEntry }[] } }>(
      `${API_V1}/groups/${groupId}/members?skipCount=0&maxItems=100`,
    );
    return (data.list?.entries || []).map(e => e.entry);
  },
};

// ─── Search（搜索）─────────────────────────────────────────

export const SearchService = {
  /** 全文搜索 */
  async search(query: string, options?: {
    language?: string;
    maxItems?: number;
    filters?: string[];
  }): Promise<NodeEntry[]> {
    const data = await request<{ list: { entries: { entry: NodeEntry }[] } }>(`${BASE_URL}/api/-default-/public/search/versions/1/search`, {
      method: 'POST',
      body: JSON.stringify({
        query: {
          query: query || '*',
          language: options?.language || 'afts',
        },
        filterQueries: (options?.filters || []).map(fq => ({ query: fq })),
        maxItems: options?.maxItems || 50,
      }),
    });
    return (data.list?.entries || []).map(e => e.entry);
  },
};
