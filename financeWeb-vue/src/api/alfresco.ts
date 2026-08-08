/**
 * Alfresco REST API 服务层（Axios 版）
 */
import axios from 'axios';
import { API_V1, LEGACY_GROUPS, AUTH_HEADERS, BASE_URL } from '@/config/api';

const http = axios.create({ headers: AUTH_HEADERS });

// ─── 类型 ──────────────────────────────────────
export interface SiteEntry {
  id: string; title: string; description?: string; visibility: string; guid?: string; role?: string;
}
export interface PersonEntry {
  id: string; firstName: string; lastName: string; displayName?: string; email: string; enabled: boolean; memberOf?: string[];
}
export interface NodeEntry {
  id: string; name: string; nodeType: string; createdAt: string; modifiedAt: string;
  parentId?: string; isFolder: boolean; isFile: boolean; properties?: Record<string, unknown>; aspectNames?: string[];
}
export interface GroupEntry {
  id: string; displayName: string; isRoot: boolean; parentIds?: string[]; zone?: string;
}
export interface LegacyGroupChild {
  authorityType: 'USER' | 'GROUP'; shortName: string; fullName: string; displayName: string;
}
export interface OrgNodeInfo {
  shortName: string; fullName: string; displayName: string; orgType: 'unit' | 'dept' | 'root';
  children?: OrgNodeInfo[];
}

// ─── 工具 ──────────────────────────────────────
async function get<T>(url: string): Promise<T> {
  const res = await http.get<T>(url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.data as any;
}

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.post<T>(url, body);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.data as any;
}

async function put<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.put<T>(url, body);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.data as any;
}

async function del<T>(url: string): Promise<T> {
  const res = await http.delete<T>(url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.data as any;
}

// ─── Sites ─────────────────────────────────────
export const SiteService = {
  async list(): Promise<SiteEntry[]> {
    const data = await get<{ list: { entries: { entry: SiteEntry }[] } }>(`${API_V1}/sites?skipCount=0&maxItems=100`);
    return (data.list?.entries || []).map((e) => e.entry);
  },
  async create(site: { id: string; title: string; description?: string }): Promise<SiteEntry> {
    const data = await post<{ entry: SiteEntry }>(`${API_V1}/sites`, { id: site.id, title: site.title, description: site.description || '', visibility: 'PRIVATE' });
    return data.entry;
  },
  async update(id: string, site: { title?: string; description?: string }): Promise<SiteEntry> {
    const data = await put<{ entry: SiteEntry }>(`${API_V1}/sites/${id}`, site);
    return data.entry;
  },
  async delete(id: string): Promise<void> {
    await del(`${API_V1}/sites/${id}`);
  },
  async getDocLibId(siteId: string): Promise<string> {
    const data = await get<{ entry: { id: string; folderId: string } }>(`${API_V1}/sites/${siteId}/containers/documentLibrary`);
    return data.entry.id;
  },
};

// ─── Folders ───────────────────────────────────
export const FolderService = {
  async listChildren(parentId: string): Promise<NodeEntry[]> {
    const data = await get<{ list: { entries: { entry: NodeEntry }[] } }>(`${API_V1}/nodes/${parentId}/children?skipCount=0&maxItems=100&include=properties,aspectNames`);
    return (data.list?.entries || []).map((e) => e.entry);
  },
  async create(parentId: string, name: string, props?: Record<string, unknown>): Promise<NodeEntry> {
    const data = await post<{ entry: NodeEntry }>(`${API_V1}/nodes/${parentId}/children`, { name, nodeType: 'cm:folder', properties: props || {} });
    return data.entry;
  },
  async update(nodeId: string, body: { name?: string; properties?: Record<string, unknown> }): Promise<NodeEntry> {
    const data = await put<{ entry: NodeEntry }>(`${API_V1}/nodes/${nodeId}`, body);
    return data.entry;
  },
  async delete(nodeId: string): Promise<void> {
    await del(`${API_V1}/nodes/${nodeId}`);
  },
};

// ─── People ────────────────────────────────────
export const PeopleService = {
  async list(): Promise<PersonEntry[]> {
    const data = await get<{ list: { entries: { entry: PersonEntry }[] } }>(`${API_V1}/people?skipCount=0&maxItems=100`);
    return (data.list?.entries || []).map((e) => e.entry);
  },
  async create(person: { id: string; firstName: string; lastName?: string; email: string; password: string }): Promise<PersonEntry> {
    const data = await post<{ entry: PersonEntry }>(`${API_V1}/people`, { ...person });
    return data.entry;
  },
  async update(id: string, person: { firstName?: string; lastName?: string; email?: string; enabled?: boolean }): Promise<PersonEntry> {
    const data = await put<{ entry: PersonEntry }>(`${API_V1}/people/${id}`, person);
    return data.entry;
  },
  async delete(id: string): Promise<void> {
    await del(`${API_V1}/people/${id}`);
  },
};

// ─── Groups ────────────────────────────────────
const ORG_ROOT = 'org_root';

function shortNameToType(shortName: string): 'unit' | 'dept' | 'root' {
  if (shortName === ORG_ROOT) return 'root';
  if (shortName.startsWith('comp_')) return 'unit';
  if (shortName.startsWith('dept_')) return 'dept';
  return 'dept';
}

export const GroupService = {
  async list(): Promise<GroupEntry[]> {
    const data = await get<{ list: { entries: { entry: GroupEntry }[] } }>(`${API_V1}/groups?skipCount=0&maxItems=100`);
    return (data.list?.entries || []).map((e) => e.entry);
  },
  async create(id: string, displayName: string): Promise<GroupEntry> {
    const data = await post<{ entry: GroupEntry }>(`${API_V1}/groups`, { id, displayName });
    return data.entry;
  },
  async delete(id: string): Promise<void> {
    await del(`${API_V1}/groups/${id}`);
  },
  async ensureOrgRoot(): Promise<void> {
    try {
      await get(`${API_V1}/groups/GROUP_${ORG_ROOT}`);
    } catch {
      await this.create(`GROUP_${ORG_ROOT}`, '组织架构根节点');
    }
  },
  async createOrgNode(parentShortName: string, orgType: 'unit' | 'dept', id: string, displayName: string): Promise<LegacyGroupChild> {
    const prefix = orgType === 'unit' ? 'comp' : 'dept';
    const shortName = `${prefix}_${id}`;
    return this.createChild(parentShortName, shortName, displayName);
  },
  async createChild(parentShortName: string, shortName: string, displayName: string): Promise<LegacyGroupChild> {
    const data = await post<{ data: LegacyGroupChild }>(`${LEGACY_GROUPS}/${parentShortName}/children/GROUP_${shortName}`, { shortName, displayName });
    return data.data;
  },
  async listChildGroups(parentShortName: string): Promise<LegacyGroupChild[]> {
    const data = await get<{ data: LegacyGroupChild[]; paging: unknown }>(`${LEGACY_GROUPS}/${parentShortName}/children`);
    return (data.data || []).filter((c) => c.authorityType === 'GROUP');
  },
  getOrgType(shortName: string): 'unit' | 'dept' | 'root' {
    return shortNameToType(shortName);
  },
  async addMember(groupId: string, personId: string): Promise<void> {
    await post(`${API_V1}/groups/${groupId}/members`, { id: personId, memberType: 'PERSON' });
  },
  async removeMember(groupId: string, personId: string): Promise<void> {
    await del(`${API_V1}/groups/${groupId}/members/${personId}`);
  },
  async getMembers(groupId: string): Promise<PersonEntry[]> {
    const data = await get<{ list: { entries: { entry: PersonEntry }[] } }>(`${API_V1}/groups/${groupId}/members?skipCount=0&maxItems=100`);
    return (data.list?.entries || []).map((e) => e.entry);
  },
};

// ─── Search ────────────────────────────────────
export const SearchService = {
  async search(query: string, options?: { language?: string; maxItems?: number; filters?: string[] }): Promise<NodeEntry[]> {
    const data = await post<{ list: { entries: { entry: NodeEntry }[] } }>(`${BASE_URL}/api/-default-/public/search/versions/1/search`, {
      query: { query: query || '*', language: options?.language || 'afts' },
      filterQueries: (options?.filters || []).map((fq) => ({ query: fq })),
      maxItems: options?.maxItems || 50,
    });
    return (data.list?.entries || []).map((e) => e.entry);
  },
};
