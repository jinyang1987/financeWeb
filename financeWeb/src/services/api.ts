/**
 * API Service Layer
 *
 * 数据路由层：根据配置决定使用 Mock 数据还是真实 Alfresco API。
 * 所有组织实体（单位/部门）使用 Alfresco Groups 表示。
 */

import type { ArchiveRecord, CategoryNode, Fonds, CategoryConfigItem, MetadataProperty } from '../types';
import { initialCategoryTree, initialRecords } from '../data';

// 导入 Alfresco 服务
import {
  PeopleService, GroupService,
  personToPersonnel,
} from './alfresco';

// ─── 运行模式配置 ──────────────────────────────────────
const USE_REAL_API = true;

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
  if (!USE_REAL_API) return mockPersonnel;
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

// ─── 以下为 Mock 数据和现有业务接口 ─────────────────────

// Simulate network delay
const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

// ─── Records ──────────────────────────────────────────
export async function fetchRecords(): Promise<ArchiveRecord[]> {
  await delay();
  return initialRecords;
}

// ─── Category Tree ────────────────────────────────────
export async function fetchCategoryTree(): Promise<CategoryNode[]> {
  await delay();
  return initialCategoryTree;
}

// ─── Fonds (全宗) ──────────────────────────────────────
const defaultFanzongs: Fonds[] = [
  { id: 'fz-1', name: '第一全宗（华北集团总部）', code: 'Z001', status: 'active', recordCount: 4, address: '北京市朝阳区国贸大厦A座5层', syncSource: '内置主数据库', companyId: 'org-1' },
  { id: 'fz-2', name: '第二全宗（南方智造分公司）', code: 'Z002', status: 'active', recordCount: 1, address: '深圳市南山区创智航天大厦12层', syncSource: '金蝶云同步链路', companyId: 'org-2' },
  { id: 'fz-3', name: '第三全宗（海外业务事业群）', code: 'Z003', status: 'custodial', recordCount: 0, address: '新加坡滨海路Marina Centre', syncSource: 'SAP Integration Broker', companyId: 'org-1', custodianCode: 'Z001' },
];

export async function fetchFanzongs(): Promise<Fonds[]> {
  await delay();
  return defaultFanzongs;
}

// ─── Category Config (分类配置) ────────────────────────
const defaultFanzongCategories: Record<string, CategoryConfigItem[]> = {
  Z001: [
    {
      id: 'cat-vd-1',
      name: '记账凭证门类',
      alfrescoType: 'archive:voucher',
      creator: 'admin (系统宿主)',
      createTime: '2026-05-12',
      properties: [
        { id: 'p1', key: 'voucherNo', label: '凭证字号', dataType: 'string', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-A.1.1', description: '财务凭证的核心识别号码' },
        { id: 'p2', key: 'amount', label: '合计金额', dataType: 'decimal', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-A.1.3', description: '报销凭证的借贷轧平人民币总金额' },
      ],
    },
    {
      id: 'cat-re-1',
      name: '财务报告门类',
      alfrescoType: 'archive:report',
      creator: 'admin (系统宿主)',
      createTime: '2026-05-15',
      properties: [
        { id: 'p11', key: 'reportName', label: '报告名称', dataType: 'string', isRequired: true, ocrEnabled: false, gbStandardCode: 'GB/T 18894-B.1.1', description: '例如"2025年度董事会审计财务报告"' },
      ],
    },
  ],
  Z002: [
    {
      id: 'cat-vd-2',
      name: '南方分公司出纳凭单',
      alfrescoType: 'archive:sz_payment',
      creator: 'sz_manager (分公司审计员)',
      createTime: '2026-05-20',
      properties: [
        { id: 'p21', key: 'paymentNo', label: '出纳付款编号', dataType: 'string', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-SZ.1', description: '南方智造分公司付款台账索引号' },
      ],
    },
  ],
  Z003: [],
};

export async function fetchFanzongCategories(): Promise<Record<string, CategoryConfigItem[]>> {
  await delay();
  return defaultFanzongCategories;
}

// ─── Mock 数据（回退方案）───────────────────────────────

const mockUnits: UnitItem[] = [
  { id: 'comp_hq', fullName: 'GROUP_comp_hq', name: '总部集团', code: 'HQ' },
  { id: 'comp_south', fullName: 'GROUP_comp_south', name: '南方分公司', code: 'SOUTH' },
];

const mockPersonnel: PersonnelItem[] = [
  { id: 'zhangs', account: 'zhangs', name: '张三', email: 'zhangs@company.com', enabled: true, org: '行政办公室', position: '主任', userType: '管理员' },
  { id: 'lisi', account: 'lisi', name: '李四', email: 'lisi@company.com', enabled: true, org: '会计核算科', position: '会计主管', userType: '财务人员' },
  { id: 'wangw', account: 'wangw', name: '王五', email: 'wangw@company.com', enabled: true, org: '人力资源科', position: 'HR专员', userType: '普通用户' },
  { id: 'zhaoli', account: 'zhaoli', name: '赵六', email: 'zhaoli@company.com', enabled: true, org: '信息技术部', position: '系统管理员', userType: '系统管理员' },
  { id: 'sunq', account: 'sunq', name: '孙七', email: 'sunq@company.com', enabled: false, org: '档案管理中心', position: '档案管理员', userType: '档案管理员' },
  { id: 'zhoub', account: 'zhoub', name: '周八', email: 'zhoub@company.com', enabled: true, org: '预算管理科', position: '预算专员', userType: '财务人员' },
];
