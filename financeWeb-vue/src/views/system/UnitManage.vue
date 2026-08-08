<template>
  <div class="flex-1 flex flex-col min-h-0">
    <!-- 主内容区 -->
    <div class="flex-1 flex min-h-0">
      <!-- 左侧面板：单位树 -->
      <div class="w-60 border-r border-slate-200 bg-white flex flex-col min-h-0">
        <div class="flex items-center justify-between px-3 py-2.5 border-b border-gray-200">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-slate-700">单位管理</h3>
            <span class="text-xs text-slate-400 flex items-center gap-1">
              <Building2 class="w-3 h-3" />
              {{ unitCount }}
            </span>
          </div>
          <button
            class="btn-primary text-xs px-2 py-1"
            @click="showAddRoot = true"
          >
            <Plus class="w-3 h-3" />
            新增单位
          </button>
        </div>

        <!-- 根级新增表单 -->
        <div v-if="showAddRoot" class="px-3 py-2 border-b border-slate-100 bg-slate-50 space-y-1.5">
          <input
            ref="rootCodeInput"
            v-model="addRootCode"
            placeholder="单位编码"
            class="input-base"
            @keydown.enter="handleAddRootConfirm"
            @keydown.escape="handleAddRootCancel"
          />
          <input
            v-model="addRootName"
            placeholder="单位名称"
            class="input-base"
            @keydown.enter="handleAddRootConfirm"
            @keydown.escape="handleAddRootCancel"
          />
          <div class="flex gap-1.5">
            <button
              class="btn-primary text-xs px-2 py-1"
              @click="handleAddRootConfirm"
            >
              <Check class="w-3 h-3" />
              确认
            </button>
            <button
              class="btn-secondary text-xs px-2 py-1"
              @click="handleAddRootCancel"
            >
              <X class="w-3 h-3" />
              取消
            </button>
          </div>
        </div>

        <!-- 加载中 -->
        <div v-if="loading" class="flex-1 flex items-center justify-center">
          <Loader2 class="w-5 h-5 animate-spin text-slate-400" />
        </div>

        <!-- 空状态 -->
        <div v-else-if="visibleNodes.length === 0 && !showAddRoot" class="flex-1 flex items-center justify-center p-4">
          <p class="text-sm text-slate-400">暂无单位，请点击"新增单位"创建</p>
        </div>

        <!-- 树节点列表 -->
        <div v-else class="flex-1 overflow-y-auto py-1">
          <div
            v-for="item in visibleNodes"
            :key="item.node.data.id"
          >
            <div
              class="flex items-center gap-1 px-2 py-1.5 cursor-pointer transition-colors group"
              :class="{
                'bg-blue-50 text-blue-700 font-medium': selectedId === item.node.data.id,
                'text-slate-700 hover:bg-slate-100': selectedId !== item.node.data.id,
              }"
              :style="{ paddingLeft: `${12 + item.depth * 16}px` }"
              @click="handleSelect(item.node)"
            >
              <!-- 展开/折叠 -->
              <button
                v-if="hasLoadedChildren(item.node.data.id)"
                class="flex-shrink-0 p-0.5 rounded hover:bg-slate-200 transition-colors"
                @click.stop="toggleExpand(item.node)"
              >
                <ChevronDown v-if="expandedIds.has(item.node.data.id)" class="w-3.5 h-3.5" />
                <ChevronRight v-else class="w-3.5 h-3.5" />
              </button>
              <span v-else class="w-3.5 flex-shrink-0" />

              <!-- 节点名称 -->
              <span class="text-xs flex-1 truncate">{{ item.node.data.name }}</span>

              <!-- 操作按钮 -->
              <div class="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                <button
                  class="p-0.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors"
                  title="添加子节点"
                  @click.stop="startAddChild(item.node.data.id)"
                >
                  <Plus class="w-3 h-3" />
                </button>
                <button
                  class="p-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
                  title="删除"
                  @click.stop="handleDeleteNode(item.node)"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>

            <!-- 内联新增子节点表单 -->
            <div
              v-if="addingParentId === item.node.data.id"
              class="pl-2 pr-3 py-1.5 bg-slate-50 border-t border-b border-slate-100 space-y-1"
              :style="{ paddingLeft: `${28 + item.depth * 16}px` }"
            >
              <input
                :ref="(el) => { if (el) childCodeInputs[item.node.data.id] = el as HTMLInputElement }"
                v-model="addChildCode"
                placeholder="子节点编码"
                class="input-base"
                @keydown.enter="handleAddChildConfirm(item.node.data.id)"
                @keydown.escape="cancelAddChild"
              />
              <input
                v-model="addChildName"
                placeholder="子节点名称"
                class="input-base"
                @keydown.enter="handleAddChildConfirm(item.node.data.id)"
                @keydown.escape="cancelAddChild"
              />
              <div class="flex gap-1.5">
                <button
                  class="btn-primary text-xs px-2 py-1"
                  @click="handleAddChildConfirm(item.node.data.id)"
                >
                  <Check class="w-3 h-3" />
                  确认
                </button>
                <button
                  class="btn-secondary text-xs px-2 py-1"
                  @click="cancelAddChild"
                >
                  <X class="w-3 h-3" />
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧面板：单位详情 -->
      <div class="flex-1 flex flex-col min-h-0 bg-[#F3F4F6]">
        <!-- 错误横幅 - 右侧顶部 -->
        <div
          v-if="errorMsg"
          class="flex items-center gap-2 mx-6 mt-6 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded"
        >
          <AlertCircle class="w-4 h-4 flex-shrink-0" />
          <span class="flex-1">{{ errorMsg }}</span>
          <button
            class="p-0.5 rounded hover:bg-red-100 transition-colors"
            @click="errorMsg = ''"
            aria-label="关闭错误提示"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- 未选择状态 -->
        <div
          v-if="!selectedNode"
          class="flex-1 flex items-center justify-center p-6"
        >
          <div class="text-center">
            <Building2 class="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p class="text-base text-gray-400">请选择一个单位查看详情</p>
          </div>
        </div>

        <!-- 详情表单 -->
        <template v-else>
          <div class="flex-1 overflow-y-auto p-6">
            <div class="max-w-xl bg-white border border-gray-200 shadow-sm rounded p-6 space-y-5">
              <h3 class="text-base font-semibold text-gray-800 pb-3 border-b border-gray-200">单位详情</h3>

              <!-- 单位编码（只读） -->
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1.5">单位编码</label>
                <input
                  :value="selectedNode.data.code"
                  disabled
                  readonly
                  class="bg-gray-50 border border-gray-300 rounded px-3 py-2 text-xs text-gray-500 w-full cursor-not-allowed"
                />
              </div>

              <!-- 单位名称 -->
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1.5">单位名称</label>
                <input
                  v-model="editName"
                  class="border border-gray-300 rounded px-3 py-2 text-xs text-gray-800 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                  @keydown.enter="handleSave"
                />
              </div>

              <!-- 完整名称（只读） -->
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1.5">完整名称</label>
                <input
                  :value="selectedNode.data.fullName"
                  disabled
                  readonly
                  class="bg-gray-50 border border-gray-300 rounded px-3 py-2 text-xs text-gray-500 w-full cursor-not-allowed"
                />
              </div>

              <!-- 组织类型 -->
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1.5">组织类型</label>
                <input
                  :value="selectedNode.data.orgType || '-'"
                  disabled
                  readonly
                  class="bg-gray-50 border border-gray-300 rounded px-3 py-2 text-xs text-gray-500 w-full cursor-not-allowed"
                />
              </div>

              <!-- 操作栏 -->
              <div class="flex items-center gap-3 pt-3 border-t border-gray-200">
                <button
                  class="bg-blue-600 text-white text-xs px-4 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                  :disabled="saving"
                  @click="handleSave"
                >
                  <Loader2 v-if="saving" class="w-3.5 h-3.5 animate-spin" />
                  <Save v-else class="w-3.5 h-3.5" />
                  {{ saving ? '保存中...' : '保存' }}
                </button>
                <button
                  class="text-xs border border-red-300 text-red-600 px-4 py-2 rounded hover:bg-red-50 flex items-center gap-1.5"
                  @click="handleDeleteSelected"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                  删除
                </button>
              </div>

              <!-- 保存成功提示 -->
              <div
                v-if="showSaved"
                class="pt-2"
              >
                <p class="text-xs text-blue-600 flex items-center gap-1">
                  <Check class="w-3.5 h-3.5" />
                  已保存
                </p>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import {
  Building2,
  ChevronRight,
  ChevronDown,
  Save,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Check,
  X,
} from 'lucide-vue-next'
import {
  fetchUnitTree,
  fetchSubUnits,
  createUnit,
  createSubUnit,
  deleteUnit,
  updateUnitName,
  type UnitItem,
} from '@/api/index'

// ─── 类型 ────────────────────────────────────────

interface UnitTreeNode {
  data: UnitItem
  children: UnitTreeNode[]
}

// ─── 状态 ────────────────────────────────────────

const loading = ref(true)
const errorMsg = ref('')
const saving = ref(false)
const showSaved = ref(false)

const treeData = ref<UnitTreeNode[]>([])
const selectedNode = ref<UnitTreeNode | null>(null)
const selectedId = ref<string | null>(null)

const expandedIds = ref<Set<string>>(new Set())
const childMap = ref<Map<string, UnitTreeNode[]>>(new Map())

// 根级新增
const showAddRoot = ref(false)
const addRootCode = ref('')
const addRootName = ref('')
const rootCodeInput = ref<HTMLInputElement | null>(null)

// 子节点新增
const addingParentId = ref<string | null>(null)
const addChildCode = ref('')
const addChildName = ref('')
const childCodeInputs = ref<Record<string, HTMLInputElement>>({})

// 编辑
const editName = ref('')

// ─── 计算属性 ────────────────────────────────────

/** 展平可见树节点 */
const visibleNodes = computed(() => {
  const result: { node: UnitTreeNode; depth: number }[] = []

  function walk(nodes: UnitTreeNode[], depth: number) {
    for (const node of nodes) {
      result.push({ node, depth })
      if (
        expandedIds.value.has(node.data.id) &&
        childMap.value.has(node.data.id)
      ) {
        walk(childMap.value.get(node.data.id)!, depth + 1)
      }
    }
  }

  walk(treeData.value, 0)
  return result
})

/** 总单位数（含展开子节点） */
const unitCount = computed(() => {
  let count = 0
  function countNodes(nodes: UnitTreeNode[]) {
    for (const n of nodes) {
      count++
      const children = childMap.value.get(n.data.id)
      if (children) countNodes(children)
    }
  }
  countNodes(treeData.value)
  return count
})

/** 判断节点是否已加载子节点 */
function hasLoadedChildren(id: string): boolean {
  return childMap.value.has(id) && (childMap.value.get(id)?.length ?? 0) > 0
}

// ─── 数据加载 ────────────────────────────────────

async function loadTree() {
  loading.value = true
  errorMsg.value = ''
  try {
    const units = await fetchUnitTree()
    treeData.value = units.map((u) => ({ data: u, children: [] }))
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : '加载单位树失败'
    treeData.value = []
  } finally {
    loading.value = false
  }
}

async function loadChildren(parentId: string) {
  try {
    const items = await fetchSubUnits(parentId)
    childMap.value.set(
      parentId,
      items.map((i) => ({ data: i, children: [] })),
    )
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : '加载子节点失败'
  }
}

onMounted(() => {
  loadTree()
})

// ─── 树交互 ──────────────────────────────────────

function toggleExpand(node: UnitTreeNode) {
  const id = node.data.id
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
    if (!childMap.value.has(id)) {
      loadChildren(id)
    }
  }
  // 触发响应式更新
  expandedIds.value = new Set(expandedIds.value)
}

function handleSelect(node: UnitTreeNode) {
  selectedNode.value = node
  selectedId.value = node.data.id
  editName.value = node.data.name
  showSaved.value = false
}

// ─── 根级新增 ────────────────────────────────────

async function handleAddRootConfirm() {
  const code = addRootCode.value.trim()
  const name = addRootName.value.trim()
  if (!code || !name) {
    errorMsg.value = '请输入单位编码和名称'
    return
  }
  try {
    const created = await createUnit(code, name)
    const newNode: UnitTreeNode = { data: created, children: [] }
    treeData.value = [...treeData.value, newNode]
    resetAddRoot()
    handleSelect(newNode)
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : '创建单位失败'
  }
}

function handleAddRootCancel() {
  resetAddRoot()
}

function resetAddRoot() {
  showAddRoot.value = false
  addRootCode.value = ''
  addRootName.value = ''
}

// ─── 子节点新增 ──────────────────────────────────

function startAddChild(parentId: string) {
  addingParentId.value = parentId
  addChildCode.value = ''
  addChildName.value = ''
  nextTick(() => {
    const el = childCodeInputs.value[parentId]
    el?.focus()
  })
}

function cancelAddChild() {
  addingParentId.value = null
  addChildCode.value = ''
  addChildName.value = ''
}

async function handleAddChildConfirm(parentId: string) {
  const code = addChildCode.value.trim()
  const name = addChildName.value.trim()
  if (!code || !name) {
    errorMsg.value = '请输入子节点编码和名称'
    return
  }
  try {
    const created = await createSubUnit(parentId, code, name)
    const newNode: UnitTreeNode = { data: created, children: [] }
    const siblings = childMap.value.get(parentId) || []
    childMap.value.set(parentId, [...siblings, newNode])
    if (!expandedIds.value.has(parentId)) {
      expandedIds.value.add(parentId)
      expandedIds.value = new Set(expandedIds.value)
    }
    cancelAddChild()
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : '创建子节点失败'
  }
}

// ─── 保存 ────────────────────────────────────────

async function handleSave() {
  if (!selectedNode.value) return
  const newName = editName.value.trim()
  if (!newName) {
    errorMsg.value = '单位名称不能为空'
    return
  }
  if (newName === selectedNode.value.data.name) return

  saving.value = true
  errorMsg.value = ''
  try {
    const updated = await updateUnitName(selectedNode.value.data.id, newName)
    // 更新本地树
    selectedNode.value.data.name = updated.name
    selectedNode.value.data.fullName = updated.fullName
    // 同步到 treeData / childMap 中的对应节点
    syncNameInTree(treeData.value, updated.id, updated.name, updated.fullName)
    showSaved.value = true
    setTimeout(() => {
      showSaved.value = false
    }, 2000)
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

function syncNameInTree(
  nodes: UnitTreeNode[],
  targetId: string,
  name: string,
  fullName: string,
) {
  for (const n of nodes) {
    if (n.data.id === targetId) {
      n.data.name = name
      n.data.fullName = fullName
      return true
    }
    const children = childMap.value.get(n.data.id)
    if (children && syncNameInTree(children, targetId, name, fullName)) {
      return true
    }
  }
  return false
}

// ─── 删除 ────────────────────────────────────────

async function handleDeleteNode(node: UnitTreeNode) {
  const displayName = node.data.name || node.data.id
  if (!window.confirm(`确定要删除"${displayName}"吗？该操作不可撤销。`)) return

  try {
    await deleteUnit(node.data.id)
    // 从父节点移除
    removeFromParent(node.data.id)
    if (selectedId.value === node.data.id) {
      selectedNode.value = null
      selectedId.value = null
    }
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : '删除失败'
  }
}

async function handleDeleteSelected() {
  if (!selectedNode.value) return
  await handleDeleteNode(selectedNode.value)
}

function removeFromParent(targetId: string) {
  // 检查根级
  const idx = treeData.value.findIndex((n) => n.data.id === targetId)
  if (idx !== -1) {
    treeData.value = treeData.value.filter((_, i) => i !== idx)
    childMap.value.delete(targetId)
    expandedIds.value.delete(targetId)
    return
  }
  // 检查子节点
  for (const [parentId, children] of childMap.value.entries()) {
    const cIdx = children.findIndex((n) => n.data.id === targetId)
    if (cIdx !== -1) {
      childMap.value.set(
        parentId,
        children.filter((_, i) => i !== cIdx),
      )
      childMap.value.delete(targetId)
      expandedIds.value.delete(targetId)
      return
    }
  }
}
</script>

<style scoped lang="scss">
/* 自定义滚动条 */
div.overflow-y-auto {
  &::-webkit-scrollbar {
    width: 5px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;

    &:hover {
      background: #94a3b8;
    }
  }
}

/* 动画 */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>
