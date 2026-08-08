<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from 'vue';
import {
  Building2, ChevronRight, ChevronDown, Plus, Upload, Download,
  SortAsc, Search, Edit3, ExternalLink, Save, Trash2, X, FileText,
  FolderTree, RefreshCw, Database, FileSpreadsheet, File, Loader2, AlertCircle,
} from 'lucide-vue-next';
import { fetchFondsList, createFonds, updateFonds, deleteFonds, type FondsNode } from '@/api/fonds';

defineOptions({ name: 'FanzongManager' });

// ─── Types ──────────────────────────────────
interface OrgNode { id: string; name: string; children?: OrgNode[]; }
interface FondsItem {
  id: string; code: string; name: string; archiveDept: string;
  isCurrent: boolean; status: 'active' | 'inactive'; enableYear: string; remark: string;
}
interface DeptNode { id: string; name: string; children?: DeptNode[]; }
interface ArchiveDept { id: string; name: string; code: string; type: string; status: 'active' | 'history'; company: string; }

// ─── Static Data ────────────────────────────
const orgTree: OrgNode[] = [
  { id: 'org-1', name: '集团总部', children: [
    { id: 'org-1-1', name: '财务部' }, { id: 'org-1-2', name: '行政部' }, { id: 'org-1-3', name: '审计部' },
  ]},
  { id: 'org-2', name: '南方分公司', children: [
    { id: 'org-2-1', name: '综合办公室' }, { id: 'org-2-2', name: '财务科' },
  ]},
  { id: 'org-3', name: '北方子公司' },
];

const initialDeptTree: DeptNode[] = [
  { id: 'dept-1', name: '档案管理中心', children: [
    { id: 'dept-1-1', name: '档案采集科' }, { id: 'dept-1-2', name: '档案保管科' }, { id: 'dept-1-3', name: '档案利用科' },
  ]},
  { id: 'dept-2', name: '综合办公室' }, { id: 'dept-3', name: '财务部档案室' },
];

// ─── State ──────────────────────────────────
const selectedOrg = ref<string | null>('org-1');
const orgExpanded = ref<Set<string>>(new Set(['org-1', 'org-2']));
const fondsList = ref<FondsItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const searchQuery = ref('');
const editingFonds = ref<FondsItem | null>(null);
const showEditModal = ref(false);
const showDeptModal = ref(false);
const showNewModal = ref(false);
const deptExpanded = ref<Set<string>>(new Set(['dept-1']));
const selectedDept = ref<string | null>('dept-1');
const saved = ref(false);

const editForm = reactive({ code: '', name: '', enableYear: '', isCurrent: true, remark: '' });
const newForm = reactive({ name: '', code: '' });
const deptForm = reactive({ name: '档案管理中心', code: 'DAGL', type: '综合', status: 'active' as 'active' | 'history', company: '集团总部' });

// ─── Computed ───────────────────────────────
const filteredFonds = computed(() =>
  fondsList.value.filter((f) =>
    f.name.includes(searchQuery.value) ||
    f.code.includes(searchQuery.value) ||
    f.archiveDept.includes(searchQuery.value),
  ),
);

// ─── Pagination ───────────────────────────
const currentPage = ref(1);
const pageSize = 10;

const totalPages = computed(() => Math.max(1, Math.ceil(filteredFonds.value.length / pageSize)));

const pagedFonds = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return filteredFonds.value.slice(start, start + pageSize);
});

function goToPage(p: number): void {
  currentPage.value = Math.max(1, Math.min(p, totalPages.value));
}

watch(filteredFonds, () => { currentPage.value = 1; });

// ─── API ────────────────────────────────────
async function loadFonds(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const data = await fetchFondsList();
    fondsList.value = data.map((f: FondsNode) => ({
      id: f.id, code: f.code, name: f.name, archiveDept: '',
      isCurrent: f.status === 'active', status: f.status, enableYear: '', remark: '',
    }));
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载全宗列表失败';
  } finally { loading.value = false; }
}

onMounted(() => loadFonds());

// ─── Handlers ───────────────────────────────
function toggleOrgExpand(id: string): void {
  const next = new Set(orgExpanded.value);
  next.has(id) ? next.delete(id) : next.add(id);
  orgExpanded.value = next;
}
function toggleDeptExpand(id: string): void {
  const next = new Set(deptExpanded.value);
  next.has(id) ? next.delete(id) : next.add(id);
  deptExpanded.value = next;
}

function handleSave(): void { saved.value = true; setTimeout(() => { saved.value = false; }, 2000); }

async function handleEditSave(): Promise<void> {
  if (!editingFonds.value) return;
  try {
    await updateFonds(editingFonds.value.id, { code: editForm.code, name: editForm.name, status: editForm.isCurrent ? 'active' : 'inactive' });
    saved.value = true; showEditModal.value = false;
    setTimeout(() => { saved.value = false; }, 2000);
    await loadFonds();
  } catch (err) { error.value = err instanceof Error ? err.message : '保存全宗失败'; }
}

async function handleDelete(nodeId: string): Promise<void> {
  try { await deleteFonds(nodeId); showEditModal.value = false; await loadFonds(); }
  catch (err) { error.value = err instanceof Error ? err.message : '删除全宗失败'; }
}

async function handleCreate(): Promise<void> {
  if (!newForm.name || !newForm.code) return;
  try {
    await createFonds({ code: newForm.code, name: newForm.name });
    showNewModal.value = false;
    newForm.name = ''; newForm.code = '';
    await loadFonds();
  } catch (err) { error.value = err instanceof Error ? err.message : '创建全宗失败'; }
}

function openEdit(f: FondsItem): void {
  editingFonds.value = f;
  editForm.code = f.code; editForm.name = f.name; editForm.enableYear = f.enableYear;
  editForm.isCurrent = f.isCurrent; editForm.remark = f.remark;
  showEditModal.value = true;
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <div class="flex-1 flex min-h-0">
      <!-- LEFT: Company Org Tree -->
      <div class="w-60 shrink-0 border-r border-slate-200 bg-white overflow-y-auto p-3">
        <div class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">公司组织树</div>
        <div v-for="node in orgTree" :key="node.id">
          <div
            class="flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer text-sm"
            :class="selectedOrg === node.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-700'"
            @click="selectedOrg = node.id"
          >
            <button
              v-if="node.children?.length"
              class="p-0.5 hover:bg-slate-200 rounded cursor-pointer"
              @click.stop="toggleOrgExpand(node.id)"
            >
              <ChevronDown v-if="orgExpanded.has(node.id)" class="w-3.5 h-3.5" />
              <ChevronRight v-else class="w-3.5 h-3.5" />
            </button>
            <span v-else class="w-4" />
            <Building2 class="w-4 h-4 text-slate-400 shrink-0" />
            <span>{{ node.name }}</span>
          </div>
          <div v-if="node.children?.length && orgExpanded.has(node.id)" class="ml-4">
            <div v-for="child in node.children" :key="child.id"
              class="flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer text-sm"
              :class="selectedOrg === child.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-700'"
              @click="selectedOrg = child.id"
            >
              <span class="w-4" />
              <Building2 class="w-4 h-4 text-slate-400 shrink-0" />
              <span>{{ child.name }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT: Fonds Table -->
      <div class="flex-1 flex flex-col min-h-0">
        <!-- Toolbar -->
        <div class="p-3 border-b border-slate-100 flex items-center justify-between shrink-0 flex-wrap gap-2">
          <div class="flex items-center gap-1.5">
            <button class="btn-primary flex items-center gap-1" @click="showNewModal = true">
              <Plus class="w-3.5 h-3.5" /> 新建全宗
            </button>
            <button class="btn-secondary flex items-center gap-1">
              <FileSpreadsheet class="w-3.5 h-3.5" /> 导入Excel
            </button>
            <button class="btn-secondary flex items-center gap-1">
              <File class="w-3.5 h-3.5" /> 导入XML
            </button>
            <button class="btn-secondary flex items-center gap-1">
              <Download class="w-3.5 h-3.5" /> 导出
            </button>
            <button class="btn-secondary flex items-center gap-1">
              <SortAsc class="w-3.5 h-3.5" /> 排序
            </button>
          </div>
          <div class="relative">
            <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input v-model="searchQuery" type="text" placeholder="搜索全宗号/名称..."
              class="input-base w-56 pl-8 pr-3 py-1.5 text-xs" />
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
                  <th class="p-3 w-20 text-center">操作</th>
                  <th class="p-3">全宗号</th>
                  <th class="p-3">全宗名称</th>
                  <th class="p-3">归档部门</th>
                  <th class="p-3 text-center">是否现行全宗</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-if="loading">
                  <td colspan="5" class="p-8 text-center text-slate-400 text-xs">
                    <Loader2 class="w-5 h-5 animate-spin inline-block mr-2" />加载中...
                  </td>
                </tr>
                <tr v-else-if="filteredFonds.length === 0">
                  <td colspan="5" class="p-8 text-center text-slate-400 text-xs">暂无全宗数据</td>
                </tr>
                <tr v-else v-for="f in pagedFonds" :key="f.id" class="hover:bg-blue-50 transition-colors cursor-pointer">
                  <td class="p-3 text-center" @click.stop>
                    <div class="flex items-center justify-center gap-1">
                      <button class="p-1 hover:bg-slate-100 rounded cursor-pointer text-slate-400 hover:text-blue-600" title="编辑"
                        @click="openEdit(f)"><Edit3 class="w-3.5 h-3.5" /></button>
                      <button class="p-1 hover:bg-slate-100 rounded cursor-pointer text-slate-400 hover:text-blue-600" title="归档部门设置"
                        @click="editingFonds = f; showDeptModal = true"><ExternalLink class="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                  <td class="p-3 font-mono font-bold text-slate-700">{{ f.code }}</td>
                  <td class="p-3 font-medium text-slate-800">{{ f.name }}</td>
                  <td class="p-3">
                    <button class="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                      @click="editingFonds = f; showDeptModal = true">{{ f.archiveDept || '设置部门' }}</button>
                  </td>
                  <td class="p-3 text-center">
                    <span :class="['inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold',
                      f.isCurrent ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500']">
                      {{ f.isCurrent ? '现行' : '非现行' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- Pagination -->
          <div class="flex items-center justify-between px-3 py-2 border-t border-gray-200 shrink-0 bg-gray-50/50">
            <span class="text-xs text-gray-500">共 {{ filteredFonds.length }} 条</span>
            <div class="flex items-center gap-2">
              <button class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">上一页</button>
              <span class="text-xs text-gray-600">第 {{ currentPage }} / {{ totalPages }} 页</span>
              <button class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">下一页</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- EDIT FONDS MODAL -->
    <Teleport to="body">
      <div v-if="showEditModal && editingFonds" class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center" @click="showEditModal = false">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" @click.stop>
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
              <Edit3 class="w-4 h-4 text-blue-600" /> 编辑全宗 - {{ editingFonds.name }}
            </h3>
            <button class="p-1 hover:bg-slate-100 rounded cursor-pointer" @click="showEditModal = false"><X class="w-4 h-4" /></button>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">全宗号</label>
              <input v-model="editForm.code" type="text" class="input-base" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">全宗名称</label>
              <input v-model="editForm.name" type="text" class="input-base" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">启用年度</label>
              <input v-model="editForm.enableYear" type="text" class="input-base" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">是否现行全宗</label>
              <select v-model="editForm.isCurrent" class="input-base">
                <option :value="true">是</option>
                <option :value="false">否</option>
              </select>
            </div>
            <div class="col-span-2">
              <label class="block text-xs font-bold text-slate-500 mb-1">备注</label>
              <textarea v-model="editForm.remark" rows="2" class="input-base resize-none" />
            </div>
            <div class="col-span-2">
              <label class="block text-xs font-bold text-slate-500 mb-1">上传文件</label>
              <div class="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center text-slate-400 text-sm">
                <FileText class="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p>拖拽文件到此处，或点击浏览上传</p>
                <p class="text-xs text-slate-300 mt-1">支持 PDF、OFD、JPG 格式</p>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100">
            <button class="btn-primary flex items-center gap-1.5" @click="handleEditSave">
              <Save class="w-4 h-4" /> 保存
            </button>
            <button class="btn border border-red-300 text-red-600 hover:bg-red-50 flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold cursor-pointer" @click="handleDelete(editingFonds.id)">
              <Trash2 class="w-4 h-4" /> 删除
            </button>
            <button class="btn-secondary flex items-center gap-1.5">
              <RefreshCw class="w-3.5 h-3.5" /> 归档部门全量转换
            </button>
            <button class="btn-secondary flex items-center gap-1.5">
              <Database class="w-3.5 h-3.5" /> 全量识别
            </button>
            <button class="btn-secondary flex items-center gap-1.5">
              <RefreshCw class="w-3.5 h-3.5" /> 重建索引
            </button>
          </div>
        </div>
      </div>

      <!-- NEW FONDS MODAL -->
      <div v-if="showNewModal" class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center" @click="showNewModal = false">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" @click.stop>
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
              <Plus class="w-4 h-4 text-blue-600" /> 新建全宗
            </h3>
            <button class="p-1 hover:bg-slate-100 rounded cursor-pointer" @click="showNewModal = false"><X class="w-4 h-4" /></button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">全宗号</label>
              <input v-model="newForm.code" type="text" placeholder="如 Z004" class="input-base" />
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 mb-1">全宗名称</label>
              <input v-model="newForm.name" type="text" placeholder="如 第四全宗（华东分公司）" class="input-base" />
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
            <button class="btn-secondary" @click="showNewModal = false">取消</button>
            <button class="btn-primary" @click="handleCreate">创建</button>
          </div>
        </div>
      </div>

      <!-- DEPT MODAL -->
      <div v-if="showDeptModal && editingFonds" class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center" @click="showDeptModal = false">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" @click.stop>
          <div class="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
            <h3 class="text-base font-bold text-slate-800 flex items-center gap-2">
              <FolderTree class="w-4 h-4 text-blue-600" /> 归档部门管理 - {{ editingFonds.name }}
            </h3>
            <button class="p-1 hover:bg-slate-100 rounded cursor-pointer" @click="showDeptModal = false"><X class="w-4 h-4" /></button>
          </div>
          <div class="flex-1 flex min-h-0">
            <div class="w-56 shrink-0 border-r border-slate-200 p-3 overflow-y-auto">
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold text-slate-400 uppercase">部门列表</span>
                <div class="flex gap-1">
                  <button class="p-1 hover:bg-slate-100 rounded cursor-pointer text-slate-500 hover:text-blue-600"><Plus class="w-3.5 h-3.5" /></button>
                  <button class="p-1 hover:bg-slate-100 rounded cursor-pointer text-slate-500 hover:text-blue-600"><RefreshCw class="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div v-for="node in initialDeptTree" :key="node.id">
                <div
                  class="flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer text-sm"
                  :class="selectedDept === node.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-700'"
                  @click="selectedDept = node.id"
                >
                  <button v-if="node.children?.length" class="p-0.5 hover:bg-slate-200 rounded cursor-pointer" @click.stop="toggleDeptExpand(node.id)">
                    <ChevronDown v-if="deptExpanded.has(node.id)" class="w-3.5 h-3.5" />
                    <ChevronRight v-else class="w-3.5 h-3.5" />
                  </button>
                  <span v-else class="w-4" />
                  <FolderTree class="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{{ node.name }}</span>
                </div>
                <div v-if="node.children?.length && deptExpanded.has(node.id)" class="ml-4">
                  <div v-for="child in node.children" :key="child.id"
                    class="flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer text-sm"
                    :class="selectedDept === child.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-100 text-slate-700'"
                    @click="selectedDept = child.id"
                  >
                    <span class="w-4" />
                    <FolderTree class="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{{ child.name }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex-1 p-5 overflow-y-auto">
              <h4 class="text-sm font-bold text-slate-700 mb-4">归档部门配置</h4>
              <div class="space-y-4">
                <div>
                  <label class="block text-xs font-bold text-slate-500 mb-1">归档部门名称</label>
                  <input v-model="deptForm.name" type="text" class="input-base" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 mb-1">归档部门代字</label>
                  <input v-model="deptForm.code" type="text" class="input-base" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 mb-1">归档部门类型</label>
                  <select v-model="deptForm.type" class="input-base">
                    <option value="综合">综合</option><option value="财务">财务</option>
                    <option value="人事">人事</option><option value="技术">技术</option><option value="业务">业务</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 mb-1">状态</label>
                  <div class="flex items-center gap-3">
                    <button
                      class="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all"
                      :class="deptForm.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'"
                      @click="deptForm.status = 'active'">使用中</button>
                    <button
                      class="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all"
                      :class="deptForm.status === 'history' ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-500'"
                      @click="deptForm.status = 'history'">历史保留</button>
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 mb-1">对应公司组织</label>
                  <select v-model="deptForm.company" class="input-base">
                    <option value="集团总部">集团总部</option><option value="南方分公司">南方分公司</option><option value="北方子公司">北方子公司</option>
                  </select>
                </div>
                <div class="flex items-center gap-2 pt-2">
                  <button class="btn-primary flex items-center gap-1.5" @click="handleSave">
                    <Save class="w-4 h-4" /> 保存
                  </button>
                  <button class="btn border border-red-300 text-red-600 hover:bg-red-50 flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-bold cursor-pointer">
                    <Trash2 class="w-4 h-4" /> 删除
                  </button>
                </div>
              </div>
            </div>
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