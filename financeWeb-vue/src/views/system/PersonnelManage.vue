<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from 'vue';
import {
  Building, Users, ChevronRight, ChevronDown, Search, Trash2,
  UserPlus, Loader2, AlertCircle,
  Pencil, X, Check, Mail, KeyRound, User,
} from 'lucide-vue-next';
import { PeopleService, GroupService, type PersonEntry } from '@/api/alfresco';

defineOptions({ name: 'PersonnelManagePage' });

// ─── Types ──────────────────────────────────
interface OrgTreeNode { id: string; name: string; orgType: 'unit' | 'dept'; fullName: string; children?: OrgTreeNode[] }
interface PersonnelItem { id: string; account: string; name: string; email: string; enabled: boolean; org?: string; position?: string }

// ─── API Wrappers ───────────────────────────
async function fetchOrgTree(): Promise<OrgTreeNode[]> {
  async function fetchChildren(parentShortName: string): Promise<OrgTreeNode[]> {
    try {
      const children = await GroupService.listChildGroups(parentShortName);
      const nodes: OrgTreeNode[] = [];
      for (const child of children) {
        const orgType = GroupService.getOrgType(child.shortName);
        const node: OrgTreeNode = {
          id: child.shortName,
          name: child.displayName,
          orgType: orgType === 'root' ? 'unit' : orgType,
          fullName: child.fullName,
        };
        if (orgType !== 'dept') {
          const subChildren = await fetchChildren(child.shortName);
          if (subChildren.length > 0) {
            node.children = subChildren;
          }
        }
        nodes.push(node);
      }
      return nodes;
    } catch {
      return [];
    }
  }
  return fetchChildren('org_root');
}

async function fetchPersonnel(): Promise<PersonnelItem[]> {
  const people = await PeopleService.list();
  return people.map((p: PersonEntry) => ({
    id: p.id,
    account: p.id,
    name: p.firstName || p.displayName || '',
    email: p.email || '',
    enabled: p.enabled !== false,
    org: p.memberOf && p.memberOf.length > 1 ? p.memberOf[p.memberOf.length - 1] : undefined,
    position: '',
  }));
}

async function createPersonnel(data: { id: string; firstName: string; email: string; password: string }): Promise<PersonnelItem> {
  const result = await PeopleService.create({ id: data.id, firstName: data.firstName, email: data.email, password: data.password });
  return { id: result.id, account: result.id, name: result.firstName, email: result.email, enabled: result.enabled, position: '' };
}

async function updatePersonnel(id: string, data: { firstName?: string; email?: string; enabled?: boolean }): Promise<PersonnelItem> {
  const result = await PeopleService.update(id, data);
  return { id: result.id, account: result.id, name: result.firstName, email: result.email, enabled: result.enabled, position: '' };
}

async function deletePersonnel(id: string): Promise<void> {
  await PeopleService.delete(id);
}

// ─── State ──────────────────────────────────
const orgTree = ref<OrgTreeNode[]>([]);
const personnelList = ref<PersonnelItem[]>([]);
const loadingTree = ref(true);
const loadingPeople = ref(true);
const error = ref<string | null>(null);
const selectedOrg = ref<string | null>(null);
const orgExpanded = ref<Set<string>>(new Set());
const searchQuery = ref('');
const statusFilter = ref<'all' | 'enabled' | 'disabled'>('all');

// Modals
const showEditModal = ref(false);
const showAddModal = ref(false);
const showDeleteModal = ref(false);
const editingPerson = ref<PersonnelItem | null>(null);
const deletingPerson = ref<PersonnelItem | null>(null);

// Forms
const editForm = reactive({ name: '', email: '' });
const addForm = reactive({ id: '', name: '', email: '', password: '' });
const addFormErrors = reactive<Record<string, string>>({});

// Pagination
const currentPage = ref(1);
const pageSize = 5;
const jumpPage = ref('');

// ─── Computed ───────────────────────────────
const filteredPersonnel = computed(() => {
  let list = personnelList.value;
  if (statusFilter.value === 'enabled') {
    list = list.filter((p) => p.enabled);
  } else if (statusFilter.value === 'disabled') {
    list = list.filter((p) => !p.enabled);
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(
      (p) => p.account.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    );
  }
  return list;
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredPersonnel.value.length / pageSize)));

const pagedPersonnel = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredPersonnel.value.slice(start, start + pageSize);
});

// Reset page when filters change
watch([statusFilter, searchQuery], () => {
  currentPage.value = 1;
});

// ─── Load Data ──────────────────────────────
async function loadOrgTree(): Promise<void> {
  loadingTree.value = true;
  try {
    const tree = await fetchOrgTree();
    orgTree.value = tree;
    // Auto-expand root
    const expanded = new Set<string>();
    tree.forEach((n) => expanded.add(n.id));
    orgExpanded.value = expanded;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载组织树失败';
  } finally {
    loadingTree.value = false;
  }
}

async function loadPersonnel(): Promise<void> {
  loadingPeople.value = true;
  try {
    const people = await fetchPersonnel();
    personnelList.value = people;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载人员列表失败';
  } finally {
    loadingPeople.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadOrgTree(), loadPersonnel()]);
});

// ─── Tree Handlers ──────────────────────────
function toggleOrgExpand(id: string): void {
  const next = new Set(orgExpanded.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  orgExpanded.value = next;
}

function selectOrg(id: string): void {
  selectedOrg.value = id;
}

// ─── Table Handlers ─────────────────────────
function openEdit(person: PersonnelItem): void {
  editingPerson.value = person;
  editForm.name = person.name;
  editForm.email = person.email;
  showEditModal.value = true;
}

async function handleEditSave(): Promise<void> {
  if (!editingPerson.value) return;
  try {
    await updatePersonnel(editingPerson.value.id, {
      firstName: editForm.name,
      email: editForm.email,
    });
    showEditModal.value = false;
    await loadPersonnel();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '更新人员失败';
  }
}

async function handleToggleEnabled(person: PersonnelItem): Promise<void> {
  try {
    await updatePersonnel(person.id, { enabled: !person.enabled });
    await loadPersonnel();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '切换状态失败';
  }
}

function openDelete(person: PersonnelItem): void {
  deletingPerson.value = person;
  showDeleteModal.value = true;
}

async function handleDeleteConfirm(): Promise<void> {
  if (!deletingPerson.value) return;
  try {
    await deletePersonnel(deletingPerson.value.id);
    showDeleteModal.value = false;
    deletingPerson.value = null;
    await loadPersonnel();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除人员失败';
  }
}

// ─── Add Modal Handlers ─────────────────────
function openAdd(): void {
  addForm.id = '';
  addForm.name = '';
  addForm.email = '';
  addForm.password = '';
  Object.keys(addFormErrors).forEach((k) => delete addFormErrors[k]);
  showAddModal.value = true;
}

function validateAddForm(): boolean {
  const errors: Record<string, string> = {};
  if (!addForm.id.trim()) errors.id = '请输入账号';
  if (!addForm.name.trim()) errors.name = '请输入姓名';
  if (!addForm.email.trim()) errors.email = '请输入邮箱';
  if (!addForm.password.trim()) errors.password = '请输入密码';
  Object.keys(addFormErrors).forEach((k) => delete addFormErrors[k]);
  Object.assign(addFormErrors, errors);
  return Object.keys(errors).length === 0;
}

async function handleAddSave(): Promise<void> {
  if (!validateAddForm()) return;
  try {
    await createPersonnel({
      id: addForm.id.trim(),
      firstName: addForm.name.trim(),
      email: addForm.email.trim(),
      password: addForm.password,
    });
    showAddModal.value = false;
    await loadPersonnel();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '创建人员失败';
  }
}

// ─── Pagination Handlers ────────────────────
function goToPrevPage(): void {
  if (currentPage.value > 1) currentPage.value--;
}

function goToNextPage(): void {
  if (currentPage.value < totalPages.value) currentPage.value++;
}

function handleJumpPage(): void {
  const page = parseInt(jumpPage.value, 10);
  if (isNaN(page) || page < 1 || page > totalPages.value) return;
  currentPage.value = page;
  jumpPage.value = '';
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <div class="flex-1 flex min-h-0">
      <!-- LEFT: Organization Tree -->
      <div class="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col min-h-0">
        <div class="px-3 py-2.5 border-b border-slate-100 shrink-0">
          <h3 class="text-sm font-semibold text-slate-700">组织架构</h3>
        </div>
        <div class="flex-1 overflow-y-auto p-2">
          <div v-if="loadingTree" class="flex items-center justify-center py-8 text-slate-400">
            <Loader2 class="w-4 h-4 animate-spin" />
          </div>
          <template v-else>
            <template v-for="node in orgTree" :key="node.id">
              <!-- Root node -->
              <div
                class="flex items-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer text-sm select-none"
                :class="selectedOrg === node.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-700'"
                @click="selectOrg(node.id)"
              >
                <button
                  v-if="node.children?.length"
                  class="p-0.5 hover:bg-slate-200 rounded cursor-pointer shrink-0"
                  @click.stop="toggleOrgExpand(node.id)"
                >
                  <ChevronDown v-if="orgExpanded.has(node.id)" class="w-3.5 h-3.5" />
                  <ChevronRight v-else class="w-3.5 h-3.5" />
                </button>
                <span v-else class="w-4 shrink-0" />
                <Building v-if="node.orgType === 'unit'" class="w-4 h-4 text-slate-400 shrink-0" />
                <Users v-else class="w-4 h-4 text-slate-400 shrink-0" />
                <span class="truncate flex-1 text-xs">{{ node.name }}</span>
              </div>
              <!-- Children -->
              <div v-if="node.children?.length && orgExpanded.has(node.id)" class="ml-4">
                <div
                  v-for="child in node.children"
                  :key="child.id"
                  class="flex items-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer text-sm select-none"
                  :class="selectedOrg === child.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-700'"
                  @click="selectOrg(child.id)"
                >
                  <span class="w-4 shrink-0" />
                  <Building v-if="child.orgType === 'unit'" class="w-4 h-4 text-slate-400 shrink-0" />
                  <Users v-else class="w-4 h-4 text-slate-400 shrink-0" />
                  <span class="truncate flex-1 text-xs">{{ child.name }}</span>
                </div>
              </div>
            </template>
            <div v-if="orgTree.length === 0" class="text-center text-slate-400 text-xs py-4">暂无组织数据</div>
          </template>
        </div>
      </div>

      <!-- RIGHT: Personnel Table -->
      <div class="flex-1 flex flex-col min-h-0">
        <!-- Toolbar -->
        <div class="p-3 border-b border-slate-100 flex items-center justify-between shrink-0 flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <button class="btn-primary" @click="openAdd">
              <UserPlus class="w-3.5 h-3.5" /> 添加人员
            </button>
            <!-- Status filter button group -->
            <div class="flex items-center rounded-lg border border-slate-200 overflow-hidden">
              <button
                class="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-r border-slate-200"
                :class="statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'"
                @click="statusFilter = 'all'"
              >全部</button>
              <button
                class="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-r border-slate-200"
                :class="statusFilter === 'enabled' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'"
                @click="statusFilter = 'enabled'"
              >有效</button>
              <button
                class="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                :class="statusFilter === 'disabled' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'"
                @click="statusFilter = 'disabled'"
              >无效</button>
            </div>
          </div>
          <div class="relative">
            <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input v-model="searchQuery" type="text" placeholder="搜索姓名/账号..."
              class="input-base w-48 pl-8" />
          </div>
        </div>

        <!-- Error banner -->
        <div v-if="error" class="mx-3 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-xs">
          <AlertCircle class="w-4 h-4 shrink-0" />
          <span class="flex-1">{{ error }}</span>
          <button class="p-0.5 hover:bg-red-100 rounded cursor-pointer" @click="error = null"><X class="w-3.5 h-3.5" /></button>
        </div>

        <!-- Table (账簿登记风格) -->
        <div class="flex-1 mx-3 mb-3 bg-white border border-gray-200 shadow-sm rounded flex flex-col min-h-0">
          <div class="flex-1 overflow-auto">
            <table class="w-full text-xs text-left border-collapse">
              <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase">
                <tr>
                  <th class="p-3">账号</th>
                  <th class="p-3">姓名</th>
                  <th class="p-3">邮箱</th>
                  <th class="p-3">部门</th>
                  <th class="p-3">岗位</th>
                  <th class="p-3 text-center">有效人员</th>
                  <th class="p-3 w-24 text-center">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-if="loadingPeople">
                  <td colspan="7" class="p-8 text-center text-slate-400 text-xs">
                    <Loader2 class="w-5 h-5 animate-spin inline-block mr-2" />加载中...
                  </td>
                </tr>
                <tr v-else-if="pagedPersonnel.length === 0">
                  <td colspan="7" class="p-8 text-center text-slate-400 text-xs">暂无人员数据</td>
                </tr>
                <tr v-else v-for="person in pagedPersonnel" :key="person.id" class="hover:bg-blue-50 transition-colors cursor-pointer">
                  <td class="p-3 font-mono font-bold text-slate-700">{{ person.account }}</td>
                  <td class="p-3 font-medium text-slate-800">{{ person.name }}</td>
                  <td class="p-3 text-slate-600">{{ person.email }}</td>
                  <td class="p-3 text-slate-600">{{ person.org || '-' }}</td>
                  <td class="p-3 text-slate-600">{{ person.position || '-' }}</td>
                  <td class="p-3 text-center" @click.stop>
                    <button
                      class="inline-flex items-center gap-1 cursor-pointer transition-colors"
                      :class="person.enabled ? 'text-green-600 hover:text-green-800' : 'text-slate-400 hover:text-slate-600'"
                      @click="handleToggleEnabled(person)"
                      :title="person.enabled ? '点击禁用' : '点击启用'"
                    >
                      <Check v-if="person.enabled" class="w-4 h-4" />
                      <X v-else class="w-4 h-4" />
                      <span class="text-xs">{{ person.enabled ? '有效' : '无效' }}</span>
                    </button>
                  </td>
                  <td class="p-3 text-center" @click.stop>
                    <div class="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button class="p-1 hover:bg-slate-100 rounded cursor-pointer text-slate-400 hover:text-blue-600" title="编辑"
                        @click="openEdit(person)"><Pencil class="w-3.5 h-3.5" /></button>
                      <button class="p-1 hover:bg-slate-100 rounded cursor-pointer text-slate-400 hover:text-red-600" title="删除"
                        @click="openDelete(person)"><Trash2 class="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- Pagination -->
          <div class="flex items-center justify-between px-3 py-2 border-t border-gray-200 shrink-0 bg-gray-50/50">
            <span class="text-xs text-gray-500">共 {{ filteredPersonnel.length }} 条</span>
            <div class="flex items-center gap-2">
              <button class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="currentPage <= 1" @click="goToPrevPage">上一页</button>
              <span class="text-xs text-gray-600">第 {{ currentPage }} / {{ totalPages }} 页</span>
              <button class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="currentPage >= totalPages" @click="goToNextPage">下一页</button>
              <div class="flex items-center gap-1 ml-2">
                <span class="text-xs text-gray-500">跳至</span>
                <input v-model="jumpPage" type="text"
                  class="w-10 border border-gray-300 rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  @keyup.enter="handleJumpPage" />
                <span class="text-xs text-gray-500">页</span>
                <button class="px-1.5 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                  @click="handleJumpPage">GO</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- EDIT MODAL -->
    <Teleport to="body">
      <div v-if="showEditModal && editingPerson" class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center" @click="showEditModal = false">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" @click.stop>
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Pencil class="w-4 h-4 text-blue-600" /> 编辑人员 - {{ editingPerson.name }}
            </h3>
            <button class="p-1 hover:bg-slate-100 rounded cursor-pointer" @click="showEditModal = false"><X class="w-4 h-4" /></button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-600 mb-1">账号</label>
              <input :value="editingPerson.account" type="text" class="input-base cursor-not-allowed bg-slate-50 text-slate-500" disabled />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-600 mb-1">姓名</label>
              <input v-model="editForm.name" type="text" placeholder="请输入姓名" class="input-base" />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-600 mb-1">邮箱</label>
              <input v-model="editForm.email" type="email" placeholder="请输入邮箱" class="input-base" />
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
            <button class="btn-secondary" @click="showEditModal = false">取消</button>
            <button class="btn-primary" @click="handleEditSave">保存</button>
          </div>
        </div>
      </div>

      <!-- ADD MODAL -->
      <div v-if="showAddModal" class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center" @click="showAddModal = false">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" @click.stop>
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-semibold text-slate-800 flex items-center gap-2">
              <UserPlus class="w-4 h-4 text-blue-600" /> 添加人员
            </h3>
            <button class="p-1 hover:bg-slate-100 rounded cursor-pointer" @click="showAddModal = false"><X class="w-4 h-4" /></button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-600 mb-1">账号</label>
              <div class="relative">
                <User class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input v-model="addForm.id" type="text" placeholder="请输入账号" class="input-base pl-8" />
              </div>
              <p v-if="addFormErrors.id" class="text-red-500 text-xs mt-1">{{ addFormErrors.id }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-600 mb-1">姓名</label>
              <input v-model="addForm.name" type="text" placeholder="请输入姓名" class="input-base" />
              <p v-if="addFormErrors.name" class="text-red-500 text-xs mt-1">{{ addFormErrors.name }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-600 mb-1">邮箱</label>
              <div class="relative">
                <Mail class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input v-model="addForm.email" type="email" placeholder="请输入邮箱" class="input-base pl-8" />
              </div>
              <p v-if="addFormErrors.email" class="text-red-500 text-xs mt-1">{{ addFormErrors.email }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-600 mb-1">密码</label>
              <div class="relative">
                <KeyRound class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input v-model="addForm.password" type="password" placeholder="请输入密码" class="input-base pl-8" />
              </div>
              <p v-if="addFormErrors.password" class="text-red-500 text-xs mt-1">{{ addFormErrors.password }}</p>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
            <button class="btn-secondary" @click="showAddModal = false">取消</button>
            <button class="btn-primary" @click="handleAddSave">保存</button>
          </div>
        </div>
      </div>

      <!-- DELETE MODAL -->
      <div v-if="showDeleteModal && deletingPerson" class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center" @click="showDeleteModal = false">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" @click.stop>
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Trash2 class="w-4 h-4 text-red-500" /> 确认删除
            </h3>
            <button class="p-1 hover:bg-slate-100 rounded cursor-pointer" @click="showDeleteModal = false"><X class="w-4 h-4" /></button>
          </div>
          <div class="py-4">
            <div class="flex items-center gap-2 mb-2">
              <AlertCircle class="w-5 h-5 text-red-500 shrink-0" />
              <p class="text-sm text-slate-700">确定要删除以下人员吗？此操作不可撤销。</p>
            </div>
            <div class="bg-slate-50 rounded-lg p-3 mt-3 space-y-1.5 text-sm">
              <div class="flex items-center gap-2">
                <span class="text-slate-400 text-xs w-10">账号：</span>
                <span class="text-slate-700 font-mono font-semibold">{{ deletingPerson.account }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-slate-400 text-xs w-10">姓名：</span>
                <span class="text-slate-700 font-medium">{{ deletingPerson.name }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-slate-400 text-xs w-10">邮箱：</span>
                <span class="text-slate-600">{{ deletingPerson.email }}</span>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
            <button class="btn-secondary" @click="showDeleteModal = false">取消</button>
            <button class="btn bg-red-600 text-white hover:bg-red-700" @click="handleDeleteConfirm">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.animate-spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
