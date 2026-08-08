<template>
  <div class="flex-1 flex flex-col min-h-0 bg-[#F3F4F6]">
    <div class="flex-1 flex min-h-0">
      <!-- ═══════════════════════ LEFT PANEL — Organization Tree ═══════════════════════ -->
      <div class="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col min-h-0">
        <!-- Header -->
        <div class="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 shrink-0">
          <span class="text-sm font-semibold text-slate-700">组织管理</span>
          <button
            class="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            title="刷新"
            :disabled="loading"
            @click="loadTree"
          >
            <RefreshCw :class="['w-4 h-4', loading && 'animate-spin']" />
          </button>
        </div>

        <!-- "新增单位" section -->
        <div class="p-3 border-b border-slate-100 shrink-0">
          <!-- Toggle button -->
          <button
            v-if="!showAddUnitForm"
            class="btn-primary w-full"
            @click="showAddUnitForm = true"
          >
            <Plus class="w-4 h-4" />
            新增单位
          </button>
          <!-- Inline form -->
          <div v-else class="flex flex-col gap-2">
            <input
              v-model="newUnitCode"
              type="text"
              placeholder="单位编码"
              class="input-base"
            />
            <input
              v-model="newUnitName"
              type="text"
              placeholder="单位名称"
              class="input-base"
              @keyup.enter="handleAddUnit"
            />
            <div class="flex items-center gap-1">
              <button
                class="btn-primary flex-1"
                :disabled="saving"
                @click="handleAddUnit"
              >
                <Loader2 v-if="saving" class="w-3 h-3 animate-spin" />
                <Check v-else class="w-3 h-3" />
                确认
              </button>
              <button
                class="btn-secondary flex-1"
                @click="cancelAddUnit"
              >
                <X class="w-3 h-3" />
                取消
              </button>
            </div>
          </div>
        </div>

        <!-- Tree content -->
        <div class="flex-1 overflow-y-auto p-2">
          <!-- Loading -->
          <div
            v-if="loading"
            class="flex items-center justify-center gap-2 py-8 text-slate-400 text-sm"
          >
            <Loader2 class="w-4 h-4 animate-spin" />
            加载中...
          </div>

          <!-- Empty -->
          <div
            v-else-if="tree.length === 0"
            class="flex flex-col items-center justify-center gap-2 py-8 text-slate-400 text-sm"
          >
            <Building2 class="w-8 h-8 text-slate-300" />
            <span>暂无组织数据</span>
          </div>

          <!-- Tree nodes — recursive rendering -->
          <template v-else>
            <template
              v-for="node in tree"
              :key="node.id"
            >
              <!-- ── Tree node row ── -->
              <div
                class="group flex items-center gap-1 py-1.5 px-2 rounded-lg cursor-pointer text-sm select-none"
                :class="selectedNode?.id === node.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'hover:bg-slate-100 text-slate-700'"
                @click="selectNode(node)"
              >
                <!-- Expand/collapse arrow -->
                <button
                  v-if="node.children?.length"
                  class="p-0.5 hover:bg-slate-200 rounded cursor-pointer shrink-0"
                  @click.stop="toggleExpand(node.id)"
                >
                  <ChevronDown v-if="expandedIds.has(node.id)" class="w-3.5 h-3.5" />
                  <ChevronRight v-else class="w-3.5 h-3.5" />
                </button>
                <span v-else class="w-4 shrink-0" />

                <!-- Icon -->
                <component :is="nodeIcon(node)" class="w-4 h-4 shrink-0" :class="selectedNode?.id === node.id ? 'text-blue-600' : 'text-slate-400'" />

                <!-- Name -->
                <span class="truncate flex-1 text-xs">{{ node.name }}</span>

                <!-- Hover actions -->
                <span class="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <!-- Add department (only for units) -->
                  <button
                    v-if="node.orgType === 'unit'"
                    class="p-1 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 cursor-pointer"
                    title="新增部门"
                    @click.stop="startAddDept(node.id)"
                  >
                    <FolderPlus class="w-3.5 h-3.5" />
                  </button>
                  <!-- Delete -->
                  <button
                    class="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 cursor-pointer"
                    title="删除"
                    @click.stop="handleDeleteNode(node.fullName)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>

              <!-- Inline "add department" form -->
              <div
                v-if="addingDeptFor === node.id"
                class="ml-6 flex items-center gap-1 px-2 py-1"
              >
                <input
                  v-model="newDeptName"
                  type="text"
                  placeholder="部门名称"
                  class="input-base flex-1"
                  @keyup.enter="confirmAddDept(node.id)"
                />
                <button
                  class="p-1 rounded text-blue-600 hover:bg-blue-50 cursor-pointer disabled:opacity-50"
                  :disabled="saving"
                  @click="confirmAddDept(node.id)"
                >
                  <Loader2 v-if="saving" class="w-3.5 h-3.5 animate-spin" />
                  <Check v-else class="w-3.5 h-3.5" />
                </button>
                <button
                  class="p-1 rounded text-slate-400 hover:bg-slate-100 cursor-pointer"
                  @click="cancelAddDept"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Children (departments, recursive) -->
              <template v-if="node.children?.length && expandedIds.has(node.id)">
                <template
                  v-for="child in node.children"
                  :key="child.id"
                >
                  <!-- ── Child node row ── -->
                  <div
                    class="group flex items-center gap-1 py-1.5 pl-8 pr-2 rounded-lg cursor-pointer text-sm select-none"
                    :class="selectedNode?.id === child.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'hover:bg-slate-100 text-slate-700'"
                    @click="selectNode(child)"
                  >
                    <!-- Expand/collapse arrow for nested children -->
                    <button
                      v-if="child.children?.length"
                      class="p-0.5 hover:bg-slate-200 rounded cursor-pointer shrink-0"
                      @click.stop="toggleExpand(child.id)"
                    >
                      <ChevronDown v-if="expandedIds.has(child.id)" class="w-3.5 h-3.5" />
                      <ChevronRight v-else class="w-3.5 h-3.5" />
                    </button>
                    <span v-else class="w-4 shrink-0" />

                    <!-- Icon -->
                    <component :is="nodeIcon(child)" class="w-4 h-4 shrink-0" :class="selectedNode?.id === child.id ? 'text-blue-600' : 'text-slate-400'" />

                    <!-- Name -->
                    <span class="truncate flex-1 text-xs">{{ child.name }}</span>

                    <!-- Hover actions -->
                    <span class="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button
                        class="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 cursor-pointer"
                        title="删除"
                        @click.stop="handleDeleteNode(child.fullName)"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </button>
                    </span>
                  </div>

                  <!-- Grand-children (further nesting) -->
                  <template v-if="child.children?.length && expandedIds.has(child.id)">
                    <div
                      v-for="grandchild in child.children"
                      :key="grandchild.id"
                      class="group flex items-center gap-1 py-1.5 pl-14 pr-2 rounded-lg cursor-pointer text-sm select-none"
                      :class="selectedNode?.id === grandchild.id
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'hover:bg-slate-100 text-slate-700'"
                      @click="selectNode(grandchild)"
                    >
                      <span class="w-4 shrink-0" />
                      <component :is="nodeIcon(grandchild)" class="w-4 h-4 shrink-0" :class="selectedNode?.id === grandchild.id ? 'text-blue-600' : 'text-slate-400'" />
                      <span class="truncate flex-1 text-xs">{{ grandchild.name }}</span>
                      <span class="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        <button
                          class="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 cursor-pointer"
                          title="删除"
                          @click.stop="handleDeleteNode(grandchild.fullName)"
                        >
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
                      </span>
                    </div>
                  </template>
                </template>
              </template>
            </template>
          </template>
        </div>
      </div>

      <!-- ═══════════════════════ RIGHT PANEL — Detail Form ═══════════════════════ -->
      <div class="flex-1 flex flex-col min-h-0 bg-[#F3F4F6]">
        <!-- Error banner at top of right panel -->
        <div
          v-if="error"
          class="flex items-start gap-2 px-4 py-3 mx-6 mt-6 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 shrink-0"
        >
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span class="flex-1">{{ error }}</span>
          <button
            class="p-0.5 hover:bg-red-100 rounded cursor-pointer shrink-0"
            @click="error = null"
          >
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- Empty state -->
        <div
          v-if="!selectedNode"
          class="flex-1 flex flex-col items-center justify-center gap-4 p-6"
        >
          <Building2 class="w-16 h-16 text-gray-300" />
          <span class="text-base text-gray-400">请从左侧选择一个组织节点</span>
        </div>

        <!-- Unit detail -->
        <template v-else-if="selectedNode.orgType === 'unit'">
          <div class="flex-1 overflow-y-auto p-6">
            <div class="max-w-xl bg-white border border-gray-200 shadow-sm rounded p-6 space-y-5">
              <h3 class="text-base font-semibold text-gray-800 flex items-center gap-2 pb-3 border-b border-gray-200">
                <Building2 class="w-5 h-5 text-blue-600" />
                单位详情
              </h3>
              <!-- Unit code (readonly) -->
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1.5">单位编码</label>
                <input
                  :value="selectedNode.id"
                  type="text"
                  readonly
                  class="bg-gray-50 border border-gray-300 rounded px-3 py-2 text-xs text-gray-500 w-full cursor-not-allowed"
                />
              </div>
              <!-- Unit name (editable) -->
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1.5">单位名称</label>
                <input
                  v-model="editingName"
                  type="text"
                  class="border border-gray-300 rounded px-3 py-2 text-xs text-gray-800 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                  @keyup.enter="handleSaveName"
                />
              </div>
              <!-- Actions -->
              <div class="flex items-center gap-2 pt-3 border-t border-gray-200">
                <button
                  class="bg-blue-600 text-white text-xs px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                  :disabled="saving"
                  @click="handleSaveName"
                >
                  <Save class="w-3.5 h-3.5" />
                  保存
                </button>
                <button
                  class="text-xs border border-red-300 text-red-600 px-4 py-2 rounded hover:bg-red-50 flex items-center gap-1.5"
                  :disabled="saving"
                  @click="handleDeleteNode(selectedNode.fullName)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                  删除
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Department detail -->
        <template v-else-if="selectedNode.orgType === 'dept'">
          <div class="flex-1 overflow-y-auto p-6">
            <div class="max-w-xl bg-white border border-gray-200 shadow-sm rounded p-6 space-y-5">
              <h3 class="text-base font-semibold text-gray-800 flex items-center gap-2 pb-3 border-b border-gray-200">
                <FolderTree class="w-5 h-5 text-blue-600" />
                部门详情
              </h3>
              <!-- Dept ID (readonly) -->
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1.5">部门 ID</label>
                <input
                  :value="selectedNode.id"
                  type="text"
                  readonly
                  class="bg-gray-50 border border-gray-300 rounded px-3 py-2 text-xs text-gray-500 w-full cursor-not-allowed font-mono"
                />
              </div>
              <!-- Dept name (editable) -->
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1.5">部门名称</label>
                <input
                  v-model="editingName"
                  type="text"
                  class="border border-gray-300 rounded px-3 py-2 text-xs text-gray-800 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                  @keyup.enter="handleSaveName"
                />
              </div>
              <!-- Actions -->
              <div class="flex items-center gap-2 pt-3 border-t border-gray-200">
                <button
                  class="bg-blue-600 text-white text-xs px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                  :disabled="saving"
                  @click="handleSaveName"
                >
                  <Save class="w-3.5 h-3.5" />
                  保存
                </button>
                <button
                  class="text-xs border border-red-300 text-red-600 px-4 py-2 rounded hover:bg-red-50 flex items-center gap-1.5"
                  :disabled="saving"
                  @click="handleDeleteNode(selectedNode.fullName)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                  删除
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- ═══════════════════════ TOAST NOTIFICATIONS ═══════════════════════ -->
    <Teleport to="body">
      <div class="fixed top-6 right-6 z-100 flex flex-col gap-2 pointer-events-none">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-toast-in"
          :class="toast.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'"
        >
          <Check v-if="toast.type === 'success'" class="w-4 h-4 shrink-0" />
          <AlertCircle v-else class="w-4 h-4 shrink-0" />
          <span>{{ toast.message }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  Building2, FolderTree, Plus, Save, Trash2, X, Check,
  Loader2, RefreshCw, FolderPlus, AlertCircle,
} from 'lucide-vue-next';
import {
  fetchOrgTree,
  createUnit,
  createDepartment,
  deleteUnit,
  deleteDepartment,
} from '@/api/index';
import type { OrgTreeNode } from '@/api/index';

defineOptions({ name: 'OrgManagePage' });

// ─── Types ──────────────────────────────────
interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

// ─── State ──────────────────────────────────
const tree = ref<OrgTreeNode[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const expandedIds = ref<Set<string>>(new Set());
const selectedNode = ref<OrgTreeNode | null>(null);
const showAddUnitForm = ref(false);
const newUnitCode = ref('');
const newUnitName = ref('');
const addingDeptFor = ref<string | null>(null);
const newDeptName = ref('');
const editingName = ref('');
const saving = ref(false);
const toasts = ref<Toast[]>([]);
let toastId = 0;

// ─── Toast ──────────────────────────────────
function showToast(message: string, type: 'success' | 'error'): void {
  const id = ++toastId;
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 3000);
}

// ─── API ────────────────────────────────────
async function loadTree(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const data = await fetchOrgTree();
    tree.value = data;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载组织树失败';
    showToast('加载组织树失败', 'error');
  } finally {
    loading.value = false;
  }
}

onMounted(() => loadTree());

// ─── Expand / Collapse ──────────────────────
function toggleExpand(id: string): void {
  const next = new Set(expandedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expandedIds.value = next;
}

// ─── Select node ────────────────────────────
function selectNode(node: OrgTreeNode): void {
  selectedNode.value = node;
  editingName.value = node.name;
}

// ─── Add unit ───────────────────────────────
async function handleAddUnit(): Promise<void> {
  const code = newUnitCode.value.trim();
  const name = newUnitName.value.trim();
  if (!code || !name) {
    showToast('请填写单位编码和名称', 'error');
    return;
  }
  saving.value = true;
  try {
    await createUnit(code, name);
    showToast('单位创建成功', 'success');
    newUnitCode.value = '';
    newUnitName.value = '';
    showAddUnitForm.value = false;
    await loadTree();
  } catch (err) {
    showToast(err instanceof Error ? err.message : '创建单位失败', 'error');
  } finally {
    saving.value = false;
  }
}

function cancelAddUnit(): void {
  showAddUnitForm.value = false;
  newUnitCode.value = '';
  newUnitName.value = '';
}

// ─── Add department ─────────────────────────
function startAddDept(parentId: string): void {
  addingDeptFor.value = addingDeptFor.value === parentId ? null : parentId;
  newDeptName.value = '';
}

function cancelAddDept(): void {
  addingDeptFor.value = null;
  newDeptName.value = '';
}

async function confirmAddDept(parentId: string): Promise<void> {
  const name = newDeptName.value.trim();
  if (!name) {
    showToast('请填写部门名称', 'error');
    return;
  }
  saving.value = true;
  try {
    await createDepartment(parentId, { name });
    showToast('部门创建成功', 'success');
    addingDeptFor.value = null;
    newDeptName.value = '';
    await loadTree();
  } catch (err) {
    showToast(err instanceof Error ? err.message : '创建部门失败', 'error');
  } finally {
    saving.value = false;
  }
}

// ─── Delete node ────────────────────────────
async function handleDeleteNode(fullName: string): Promise<void> {
  const node = selectedNode.value;
  if (!node) return;
  const label = node.orgType === 'unit' ? '单位' : '部门';
  if (!window.confirm(`确定要删除${label}「${node.name}」吗？此操作不可撤销。`)) return;
  saving.value = true;
  try {
    if (node.orgType === 'unit') {
      await deleteUnit(fullName);
    } else {
      await deleteDepartment(fullName);
    }
    showToast('删除成功', 'success');
    if (selectedNode.value?.fullName === fullName) {
      selectedNode.value = null;
      editingName.value = '';
    }
    await loadTree();
  } catch (err) {
    showToast(err instanceof Error ? err.message : '删除失败', 'error');
  } finally {
    saving.value = false;
  }
}

// ─── Save name (optimistic local) ───────────
function handleSaveName(): void {
  if (!selectedNode.value) return;
  const newName = editingName.value.trim();
  if (!newName) {
    showToast('名称不能为空', 'error');
    return;
  }
  if (newName === selectedNode.value.name) {
    showToast('名称未变更', 'error');
    return;
  }
  // Optimistic local update — both in selectedNode and in tree
  selectedNode.value = { ...selectedNode.value, name: newName };
  const updateTree = (nodes: OrgTreeNode[]): boolean => {
    for (const n of nodes) {
      if (n.fullName === selectedNode.value!.fullName) {
        n.name = newName;
        return true;
      }
      if (n.children && updateTree(n.children)) return true;
    }
    return false;
  };
  updateTree(tree.value);
  showToast('名称已更新', 'success');
}

// ─── Determine node icon ────────────────────
function nodeIcon(node: OrgTreeNode) {
  return node.orgType === 'unit' ? Building2 : FolderTree;
}
</script>

<style scoped lang="scss">
.animate-spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-toast-in {
  animation: toast-in 0.25s ease-out;
}
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
