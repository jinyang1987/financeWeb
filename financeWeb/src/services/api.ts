/**
 * API Service Layer
 *
 * 组织/人员域：全部走真实 Alfresco API（Groups 表示单位/部门，People 表示人员）。
 * 2026-08-16 贯通审计清理：删除演示期 mock 分支（fetchRecords/fetchFanzongs/
 * fetchCategoryTree/fetchFanzongCategories/mockPersonnel/mockUnits 等死代码）——
 * 件域真数据源为 recordService（/records），全宗为 fondsService（Alfresco 节点），
 * 分类/门类配置经配置中心 /config。
 */

// 导入 Alfresco 服务
import {
  PeopleService, GroupService,
  personToPersonnel,
} from './alfresco';

// ─── 组织根节点 shortName ─────────────────────────────
const ORG_ROOT = 'org_root';

// ─── 类型定义 ──────────────────────────────────────────

/** 前端业务模型：单位 */
export interface UnitItem {
  id: string;            // e.g. "comp_hq"
  fullName: string;      // e.g. "GROUP_comp_hq"
  name: string;
  code: string;
}

/** 前端业务模型：部门 */
export interface DeptItem {
  id: string;
  fullName: string;
  name: string;
  parentShortName: string;
}

/** 前端业务模型：组织树节点 */
export interface OrgTreeNode {
  id: string;
  fullName: string;
  name: string;
  orgType: 'unit' | 'dept';
  children?: OrgTreeNode[];
}

/** 前端业务模型：人员 */
export interface PersonnelItem {
  id: string;
  account: string;
  name: string;
  email: string;
  enabled: boolean;
  org?: string;
  position?: string;
  userType?: string;
}

// ─── 初始化数据 ────────────────────────────────────────

/** 组织架构为空时自动创建初始示例数据 */
export async function ensureInitialData(): Promise<void> {
  await GroupService.ensureOrgRoot();
  // 检查组织根下是否有单位
  const children = await GroupService.listChildGroups(ORG_ROOT);
  const hasUnits = children.some(c => GroupService.getOrgType(c.shortName) === 'unit');
  if (hasUnits) return; // 已有数据，跳过

  // 创建默认单位
  const unit = await GroupService.createOrgNode(ORG_ROOT, 'unit', 'HQ', '总部集团');
  // 创建默认部门
  const dept = await GroupService.createOrgNode(unit.shortName, 'dept', Date.now().toString(36), '财务部');
  // 创建默认人员并加入部门
  try {
    await PeopleService.create({ id: 'zhangsan', firstName: '张三', lastName: '会计', email: 'zhangsan@company.com', password: '123456' });
    await GroupService.addMember(dept.fullName, 'zhangsan');
  } catch {
    // 人员已存在则忽略
  }
}

// ─── 组织树 ────────────────────────────────────────────

/** 递归构建组织树 */
async function buildOrgTree(parentShortName: string): Promise<OrgTreeNode[]> {
  const children = await GroupService.listChildGroups(parentShortName);
  const nodes: OrgTreeNode[] = [];
  for (const c of children) {
    const type = GroupService.getOrgType(c.shortName);
    if (type === 'root') continue;
    const node: OrgTreeNode = {
      id: c.shortName,
      fullName: c.fullName,
      name: c.displayName,
      orgType: type,
      children: await buildOrgTree(c.shortName),
    };
    nodes.push(node);
  }
  return nodes;
}

/** 获取完整组织树 */
export async function fetchOrgTree(): Promise<OrgTreeNode[]> {
  await ensureInitialData();
  return buildOrgTree(ORG_ROOT);
}

// ─── 单位管理 (Groups: comp_*) ─────────────────────────

/** 获取所有单位列表 */
export async function fetchUnitTree(): Promise<UnitItem[]> {
  await ensureInitialData();
  const children = await GroupService.listChildGroups(ORG_ROOT);
  return children
    .filter(c => GroupService.getOrgType(c.shortName) === 'unit')
    .map(c => ({
      id: c.shortName,
      fullName: c.fullName,
      name: c.displayName,
      code: c.shortName.replace('comp_', ''),
    }));
}

/** 创建单位（在组织根节点下） */
export async function createUnit(data: { id: string; title: string }): Promise<UnitItem> {
  await GroupService.ensureOrgRoot();
  const group = await GroupService.createOrgNode(ORG_ROOT, 'unit', data.id, data.title);
  return {
    id: group.shortName,
    fullName: group.fullName,
    name: group.displayName,
    code: data.id,
  };
}

/** 创建子单位（在指定父单位下） */
export async function createSubUnit(parentShortName: string, data: { id: string; title: string }): Promise<UnitItem> {
  const group = await GroupService.createOrgNode(parentShortName, 'unit', data.id, data.title);
  return {
    id: group.shortName,
    fullName: group.fullName,
    name: group.displayName,
    code: data.id,
  };
}

/** 删除单位 */
export async function deleteUnit(fullName: string): Promise<void> {
  await GroupService.delete(fullName);
}

// ─── 部门管理 (Groups: dept_*) ─────────────────────────

/** 获取指定节点下的部门列表 */
export async function fetchDepartments(parentShortName: string): Promise<DeptItem[]> {
  try {
    const children = await GroupService.listChildGroups(parentShortName);
    return children
      .filter(c => GroupService.getOrgType(c.shortName) === 'dept')
      .map(c => ({
        id: c.shortName,
        fullName: c.fullName,
        name: c.displayName,
        parentShortName,
      }));
  } catch {
    return [];
  }
}

/** 创建部门（在指定父节点下） */
export async function createDepartment(parentShortName: string, data: { name: string }): Promise<DeptItem> {
  const id = Date.now().toString(36);
  const group = await GroupService.createOrgNode(parentShortName, 'dept', id, data.name);
  return {
    id: group.shortName,
    fullName: group.fullName,
    name: group.displayName,
    parentShortName,
  };
}

/** 删除部门 */
export async function deleteDepartment(fullName: string): Promise<void> {
  await GroupService.delete(fullName);
}

// ─── 人员管理 (People) ──────────────────────────────────

/** 获取人员列表 */
export async function fetchPersonnel(): Promise<PersonnelItem[]> {
  const people = await PeopleService.list();
  return people.map(personToPersonnel);
}

/** 创建人员 */
export async function createPersonnel(data: {
  id: string;
  firstName: string;
  lastName?: string;
  email: string;
  password: string;
}): Promise<PersonnelItem> {
  const person = await PeopleService.create(data);
  return personToPersonnel(person);
}

/** 更新人员 */
export async function updatePersonnel(id: string, data: {
  firstName?: string;
  lastName?: string;
  email?: string;
  enabled?: boolean;
}): Promise<PersonnelItem> {
  const person = await PeopleService.update(id, data);
  return personToPersonnel(person);
}

/** 删除人员 */
export async function deletePersonnel(id: string): Promise<void> {
  await PeopleService.delete(id);
}
