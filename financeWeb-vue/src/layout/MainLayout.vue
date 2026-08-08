<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent } from 'vue';
import { useRouter } from 'vue-router';
import {
  LayoutDashboard, Archive, FolderTree, ShieldCheck, ClipboardCheck,
  Trash2, BarChart3, Settings, Users, Receipt, FileText, Clock,
  Filter, Database, Upload, ArrowRightLeft, BookOpen, Search,
  Workflow, BookMarked, RotateCcw, ListOrdered, Brain,
  History, PackageSearch, HardDrive, ChevronDown, LogOut, User,
  ChevronRight, FolderOpen, Folder, ChevronLeft,
} from 'lucide-vue-next';
import { useAppStore, type MenuId, type SidebarGroupKey } from '@/store/app';
import { useAuthStore } from '@/store/auth';
import { useArchiveStore } from '@/store/archive';
import { fetchFondsList, type FondsNode } from '@/api/fonds';
import type { CategoryNode } from '@/types';
import CategoryTree from '@/components/CategoryTree.vue';

import DashboardPage from '@/views/dashboard/DashboardPage.vue';
import UnitManage from '@/views/system/UnitManage.vue';
import OrgManage from '@/views/system/OrgManage.vue';
import PersonnelManage from '@/views/system/PersonnelManage.vue';
import RoleManage from '@/views/system/RoleManage.vue';
import AuditLogs from '@/views/system/AuditLogs.vue';
import AccountingMetadata from '@/views/archive-config/AccountingMetadata.vue';
import ReportConfig from '@/views/archive-config/ReportConfig.vue';
import InspectionConfig from '@/views/archive-config/InspectionConfig.vue';
import ArchiveScope from '@/views/archive-config/ArchiveScope.vue';
import ArchiveLib from '@/views/archive-config/ArchiveLib.vue';
import FinanceView from '@/views/archive-arrange/FinanceView.vue';
import ProjectView from '@/views/archive-arrange/ProjectView.vue';
import TimeView from '@/views/archive-arrange/TimeView.vue';
import SmartData from '@/views/archive-arrange/SmartData.vue';
import WorkflowControl from '@/views/archive-utilization/WorkflowControl.vue';
import BorrowManage from '@/views/archive-utilization/BorrowManage.vue';
import ReturnManage from '@/views/archive-utilization/ReturnManage.vue';
import OrderSpecial from '@/views/archive-utilization/OrderSpecial.vue';
import SearchStats from '@/views/archive-stats/SearchStats.vue';

const FanzongManager = defineAsyncComponent(() => import('@/views/archive-config/FanzongManager.vue'));
const DirectoryConfigPanel = defineAsyncComponent(() => import('@/views/archive-config/DirectoryConfigPanel.vue'));

defineOptions({ name: 'MainLayout' });

const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();
const archiveStore = useArchiveStore();

// ─── Sidebar collapse ──────────────────────
const sidebarCollapsed = ref(false);
function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

// ─── Fonds selector ────────────────────────
const fondsNodes = ref<FondsNode[]>([]);
const fondsOpen = ref(false);
const fondsSelectorRef = ref<HTMLElement | null>(null);
const loadingFonds = ref(false);

const currentFondsLabel = computed(() => {
  const found = fondsNodes.value.find((f) => f.code === archiveStore.currentFanzongCode);
  return found ? `${found.name}` : '选择全宗';
});
const currentFondsCode = computed(() => archiveStore.currentFanzongCode);

// ─── Sidebar sub-panel state (档案整理) ────
const expandedSubPanel = ref<'finance' | 'project' | 'time' | null>('finance');

function toggleSubPanel(panel: 'finance' | 'project' | 'time'): void {
  expandedSubPanel.value = expandedSubPanel.value === panel ? null : panel;
}

function getFondsChildren(): CategoryNode[] {
  const fonds = archiveStore.treeData.find((f) => f.code === archiveStore.currentFanzongCode);
  return fonds?.children || [];
}

const financeTree = computed(() => getFondsChildren());
const timeTree = computed(() => {
  const yearMap = new Map<string, CategoryNode>();
  const classes = getFondsChildren();
  for (const cls of classes) {
    for (const period of (cls.children || [])) {
      if (period.type !== 'period') continue;
      let yearNode = yearMap.get(period.code || period.label);
      if (!yearNode) {
        yearNode = { id: `time-year-${period.code || period.id}`, label: period.label, type: 'period', code: period.code, children: [] };
        yearMap.set(period.code || period.label, yearNode);
      }
      yearNode.children!.push({ id: `time-${cls.id}-${period.id}`, label: cls.label, type: 'class', code: cls.code });
    }
  }
  return Array.from(yearMap.values());
});
const projectTree = computed(() => getFondsChildren());

function handleTreeNodeClick(node: CategoryNode, targetView: string): void {
  archiveStore.setSelectedNode(node);
  appStore.setActiveMainMenu(targetView as MenuId);
  closeOtherGroupsExcept(targetView as MenuId);
}

// ─── Menu groups ───────────────────────────
interface MenuItem { id: MenuId; label: string; icon: unknown; }
interface MenuGroup { key: SidebarGroupKey; label: string; icon: unknown; items: MenuItem[]; }

const menuGroups: MenuGroup[] = [
  { key: 'rcv', label: '档案接收', icon: Upload, items: [
    { id: 'archive-offline', label: '离线接收', icon: HardDrive },
    { id: 'archive-rcv', label: '接收台账', icon: BookMarked },
  ]},
  { key: 'arrange', label: '档案整理', icon: FolderTree, items: [
    { id: 'smart-data', label: '智能数据预处理', icon: Brain },
  ]},
  { key: 'preserve', label: '档案保管', icon: Archive, items: [
    { id: 'preserve-view-finance', label: '财务分类视图', icon: Receipt },
    { id: 'preserve-view-project', label: '项目全宗视图', icon: Database },
    { id: 'preserve-view-time', label: '时间脉络视图', icon: Clock },
    { id: 'digital-warehouse', label: '实体档案库房', icon: PackageSearch },
  ]},
  { key: 'util', label: '档案利用', icon: BookOpen, items: [
    { id: 'wf-control', label: '工作流控制', icon: Workflow },
    { id: 'borrow-manage', label: '借阅管理', icon: ArrowRightLeft },
    { id: 'return-manage', label: '归还催还', icon: RotateCcw },
    { id: 'order-special', label: '借单跟踪', icon: ListOrdered },
  ]},
  { key: 'disposal', label: '档案销毁', icon: Trash2, items: [
    { id: 'disposal-batch', label: '销毁批次', icon: ClipboardCheck },
    { id: 'disposal-workflow', label: '时效鉴定', icon: Clock },
  ]},
  { key: 'stats', label: '档案统计', icon: BarChart3, items: [
    { id: 'dashboard', label: '统计仪表盘', icon: BarChart3 },
    { id: 'search-stats', label: '查询统计分析', icon: Search },
  ]},
  { key: 'config', label: '档案配置', icon: Settings, items: [
    { id: 'config-fanzong', label: '全宗管理', icon: Database },
    { id: 'directory-config', label: '目录配置', icon: FolderTree },
    { id: 'accounting-metadata', label: '会计元数据', icon: FileText },
    { id: 'report-config', label: '报告配置', icon: FileText },
    { id: 'inspection-config', label: '检查配置', icon: ShieldCheck },
    { id: 'archive-scope', label: '归档范围', icon: Filter },
  ]},
  { key: 'system', label: '系统管理', icon: Users, items: [
    { id: 'sys-unit', label: '单位管理', icon: Database },
    { id: 'sys-org', label: '组织管理', icon: FolderTree },
    { id: 'sys-personnel', label: '人员管理', icon: Users },
    { id: 'sys-role', label: '角色管理', icon: ShieldCheck },
    { id: 'sys-log', label: '审计日志', icon: History },
  ]},
];

const visibleGroups = computed(() => menuGroups.filter((g) => appStore.visibleMenus[g.key]));

// MenuId → SidebarGroupKey mapping for auto-collapse
const menuGroupMap: Record<string, SidebarGroupKey> = {
  'archive-offline': 'rcv', 'archive-rcv': 'rcv',
  'smart-data': 'arrange', 'view-finance': 'arrange', 'view-project': 'arrange', 'view-time': 'arrange',
  'preserve-view-finance': 'preserve', 'preserve-view-project': 'preserve', 'preserve-view-time': 'preserve',
  'digital-warehouse': 'preserve',
  'wf-control': 'util', 'borrow-manage': 'util', 'return-manage': 'util', 'order-special': 'util',
  'disposal-batch': 'disposal', 'disposal-workflow': 'disposal',
  'dashboard': 'stats', 'search-stats': 'stats',
  'config-fanzong': 'config', 'directory-config': 'config', 'accounting-metadata': 'config',
  'report-config': 'config', 'inspection-config': 'config', 'archive-scope': 'config',
  'sys-unit': 'system', 'sys-org': 'system', 'sys-personnel': 'system', 'sys-role': 'system', 'sys-log': 'system',
};

function closeOtherGroupsExcept(menuId: MenuId): void {
  const groupKey = menuGroupMap[menuId];
  if (groupKey) {
    appStore.closeOtherGroups(groupKey);
  }
}

function handleMenuClick(menuId: MenuId): void {
  appStore.setActiveMainMenu(menuId);
  closeOtherGroupsExcept(menuId);
}

function handleGroupClick(groupKey: SidebarGroupKey): void {
  const willExpand = !appStore.sidebarGroups[groupKey];
  if (willExpand) {
    appStore.closeOtherGroups(groupKey);
  } else {
    appStore.sidebarGroups[groupKey] = false;
  }
}

const currentViewComponent = computed(() => {
  const menu = appStore.activeMainMenu;
  const viewMap: Record<string, string> = {
    'dashboard': 'DashboardPage', 'config-fanzong': 'FanzongManager',
    'directory-config': 'DirectoryConfigPanel', 'accounting-metadata': 'AccountingMetadata',
    'report-config': 'ReportConfig', 'inspection-config': 'InspectionConfig',
    'archive-scope': 'ArchiveScope', 'archive-lib': 'ArchiveLib',
    'sys-unit': 'UnitManage', 'sys-org': 'OrgManage', 'sys-personnel': 'PersonnelManage',
    'sys-role': 'RoleManage', 'sys-log': 'AuditLogs',
    'view-finance': 'FinanceView', 'view-project': 'ProjectView', 'view-time': 'TimeView',
    'smart-data': 'SmartData', 'wf-control': 'WorkflowControl',
    'borrow-manage': 'BorrowManage', 'return-manage': 'ReturnManage',
    'search-stats': 'SearchStats', 'order-special': 'OrderSpecial',
  };
  return viewMap[menu] || 'DashboardPage';
});

async function loadFonds(): Promise<void> {
  loadingFonds.value = true;
  try {
    fondsNodes.value = await fetchFondsList();
    if (fondsNodes.value.length > 0 && !fondsNodes.value.find((f) => f.code === archiveStore.currentFanzongCode)) {
      archiveStore.setCurrentFanzongCode(fondsNodes.value[0].code);
    }
  } catch { /* fallback */ }
  finally { loadingFonds.value = false; }
}

function handleFondsSelect(fonds: FondsNode): void {
  archiveStore.setCurrentFanzongCode(fonds.code);
  fondsOpen.value = false;
}

function handleLogout(): void {
  authStore.logout();
  router.replace('/login');
}

function handleClickOutside(e: MouseEvent): void {
  if (fondsSelectorRef.value && !fondsSelectorRef.value.contains(e.target as Node)) {
    fondsOpen.value = false;
  }
}

onMounted(() => {
  loadFonds();
  document.addEventListener('mouseup', handleClickOutside);
});
onUnmounted(() => document.removeEventListener('mouseup', handleClickOutside));
</script>

<template>
  <div class="flex h-screen w-full bg-[#F3F4F6] text-[#111827] font-sans overflow-hidden">
    <!-- Sidebar Navigation -->
    <aside class="bg-[#1F2937] text-gray-300 flex flex-col border-r border-gray-700 shrink-0 transition-all duration-300 overflow-hidden"
      :class="sidebarCollapsed ? 'w-16' : 'w-64'">
      <!-- Sidebar header -->
      <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-700 bg-[#111827] min-h-[57px] shrink-0">
        <div class="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shrink-0">
          <span class="text-white font-bold text-sm">A</span>
        </div>
        <span v-show="!sidebarCollapsed" class="text-white font-semibold text-base tracking-tight truncate">会计档案管理系统</span>
      </div>

      <!-- Nav -->
      <nav class="flex-1 py-1 overflow-y-auto text-sm scrollbar-thin">
        <!-- Dashboard -->
        <button
          class="w-full flex items-center gap-3 px-5 py-[9px] transition-colors text-sm"
          :class="appStore.activeMainMenu === 'dashboard'
            ? 'bg-white/5 text-gray-200'
            : 'text-gray-300 hover:bg-white/5'"
          @click="handleMenuClick('dashboard')">
          <LayoutDashboard class="w-4 h-4 shrink-0" />
          <span v-show="!sidebarCollapsed">仪表盘</span>
        </button>

        <div v-for="group in visibleGroups" :key="group.key">
          <!-- Group header (一级菜单) -->
          <div class="mt-4 mb-0.5 px-5 py-[9px] flex items-center gap-2.5 cursor-pointer select-none" @click="handleGroupClick(group.key)">
            <component :is="group.icon" class="w-[18px] h-[18px] text-gray-400 shrink-0" />
            <span v-show="!sidebarCollapsed"
              class="text-[15px] font-bold text-gray-300 flex-1">{{ group.label }}</span>
            <ChevronDown v-if="!sidebarCollapsed"
              :class="['w-4 h-4 text-gray-500 transition-transform', appStore.sidebarGroups[group.key] ? 'rotate-0' : '-rotate-90']" />
          </div>

          <!-- Arrange group: special sub-panels -->
          <template v-if="group.key === 'arrange'">
            <div v-show="appStore.sidebarGroups['arrange']" class="space-y-0.5">
              <div>
                <button
                  class="w-full flex items-center gap-3 pl-9 pr-5 py-[9px] transition-colors text-sm"
                  :class="appStore.activeMainMenu === 'view-finance'
                    ? 'bg-white/5 text-gray-200'
                    : 'text-gray-300 hover:bg-white/5'"
                  @click="toggleSubPanel('finance'); appStore.setActiveMainMenu('view-finance')">
                  <ChevronRight :class="['w-3.5 h-3.5 transition-transform shrink-0 text-gray-500', expandedSubPanel === 'finance' ? 'rotate-90' : '']" />
                  <Folder class="w-4 h-4 shrink-0" />
                  <span v-show="!sidebarCollapsed" class="truncate flex-1 text-left">财务分类视图</span>
                </button>
                <div v-show="expandedSubPanel === 'finance' && !sidebarCollapsed" class="ml-5 pl-2 border-l border-gray-700/60">
                  <CategoryTree :tree-data="financeTree" :selected-id="archiveStore.selectedNode?.id"
                    @select="(n: CategoryNode) => handleTreeNodeClick(n, 'view-finance')" />
                </div>
              </div>
              <div>
                <button
                  class="w-full flex items-center gap-3 pl-9 pr-5 py-[9px] transition-colors text-sm"
                  :class="appStore.activeMainMenu === 'view-project'
                    ? 'bg-white/5 text-gray-200'
                    : 'text-gray-300 hover:bg-white/5'"
                  @click="toggleSubPanel('project'); appStore.setActiveMainMenu('view-project')">
                  <ChevronRight :class="['w-3.5 h-3.5 transition-transform shrink-0 text-gray-500', expandedSubPanel === 'project' ? 'rotate-90' : '']" />
                  <Folder class="w-4 h-4 shrink-0" />
                  <span v-show="!sidebarCollapsed" class="truncate flex-1 text-left">项目全宗视图</span>
                </button>
                <div v-show="expandedSubPanel === 'project' && !sidebarCollapsed" class="ml-5 pl-2 border-l border-gray-700/60">
                  <CategoryTree :tree-data="projectTree" :selected-id="archiveStore.selectedNode?.id"
                    @select="(n: CategoryNode) => handleTreeNodeClick(n, 'view-project')" />
                </div>
              </div>
              <div>
                <button
                  class="w-full flex items-center gap-3 pl-9 pr-5 py-[9px] transition-colors text-sm"
                  :class="appStore.activeMainMenu === 'view-time'
                    ? 'bg-white/5 text-gray-200'
                    : 'text-gray-300 hover:bg-white/5'"
                  @click="toggleSubPanel('time'); appStore.setActiveMainMenu('view-time')">
                  <ChevronRight :class="['w-3.5 h-3.5 transition-transform shrink-0 text-gray-500', expandedSubPanel === 'time' ? 'rotate-90' : '']" />
                  <Folder class="w-4 h-4 shrink-0" />
                  <span v-show="!sidebarCollapsed" class="truncate flex-1 text-left">时间脉络视图</span>
                </button>
                <div v-show="expandedSubPanel === 'time' && !sidebarCollapsed" class="ml-5 pl-2 border-l border-gray-700/60">
                  <CategoryTree :tree-data="timeTree" :selected-id="archiveStore.selectedNode?.id"
                    @select="(n: CategoryNode) => handleTreeNodeClick(n, 'view-time')" />
                </div>
              </div>
              <!-- Smart Data (item inside group) -->
              <button
                class="w-full flex items-center gap-3 pl-9 pr-5 py-[9px] transition-colors text-sm"
                :class="appStore.activeMainMenu === 'smart-data'
                  ? 'bg-white/5 text-gray-200'
                  : 'text-gray-300 hover:bg-white/5'"
                @click="handleMenuClick('smart-data')">
                <Brain class="w-4 h-4 shrink-0" />
                <span v-show="!sidebarCollapsed" class="truncate">智能数据预处理</span>
              </button>
            </div>
          </template>

          <!-- Other groups: flat items (二级菜单) -->
          <template v-else>
            <div v-show="appStore.sidebarGroups[group.key]" class="space-y-0.5">
                    <button v-for="item in group.items" :key="item.id"
                class="w-full flex items-center gap-3 pl-9 pr-5 py-[9px] transition-colors text-sm"
                :class="appStore.activeMainMenu === item.id
                  ? 'bg-white/5 text-gray-200'
                  : 'text-gray-300 hover:bg-white/5'"
                @click="handleMenuClick(item.id)">
                <component :is="item.icon" class="w-4 h-4 shrink-0" />
                <span v-show="!sidebarCollapsed" class="truncate">{{ item.label }}</span>
              </button>
            </div>
          </template>
        </div>
      </nav>

      <!-- Sidebar footer -->
      <div class="p-4 border-t border-gray-700 text-xs flex items-center justify-between shrink-0">
        <span v-show="!sidebarCollapsed" class="text-gray-500">版本 v1.0.0</span>
        <span class="text-green-400 flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span v-show="!sidebarCollapsed">在线</span>
        </span>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 flex flex-col min-w-0">
      <!-- Header Bar -->
      <header class="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-5 shadow-sm shrink-0">
        <div class="flex items-center gap-4">
          <button class="text-gray-400 hover:text-gray-600 transition-colors" @click="toggleSidebar">
            <ChevronLeft :class="['w-4 h-4 transition-transform', sidebarCollapsed ? 'rotate-180' : '']" />
          </button>
          <span class="text-xs text-gray-400">首页 / <b class="text-gray-600">会计档案管理</b></span>
        </div>
        <div class="flex items-center gap-5">
          <!-- Fonds selector -->
          <div ref="fondsSelectorRef" class="relative">
            <button
              class="flex items-center gap-2 bg-gray-100 border border-gray-300 rounded px-3 py-1 text-xs hover:bg-gray-200 transition-colors"
              @click="fondsOpen = !fondsOpen">
              <Database class="w-3.5 h-3.5 text-gray-500" />
              <span class="max-w-32 truncate text-gray-700">{{ currentFondsLabel }}</span>
              <span class="text-[10px] font-mono text-gray-400">({{ currentFondsCode }})</span>
              <ChevronDown :class="['w-3 h-3 text-gray-400 transition-transform', fondsOpen ? 'rotate-180' : '']" />
            </button>
            <Transition name="dropdown">
              <div v-if="fondsOpen"
                class="absolute top-full right-0 mt-1.5 w-72 bg-white border border-gray-200 rounded shadow-lg z-50 py-1.5 max-h-72 overflow-y-auto text-xs">
                <div v-if="loadingFonds" class="px-4 py-2 text-gray-400">加载中...</div>
                <button v-for="fonds in fondsNodes" :key="fonds.id"
                  class="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-3"
                  :class="{ 'bg-blue-50': fonds.code === currentFondsCode }"
                  @click="handleFondsSelect(fonds)">
                  <div class="w-6 h-6 rounded flex items-center justify-center shrink-0"
                    :class="fonds.status === 'active' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'">
                    <Database class="w-3 h-3" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="font-medium text-gray-700 truncate">{{ fonds.name }}</div>
                    <div class="text-gray-400">{{ fonds.code }}</div>
                  </div>
                </button>
              </div>
            </Transition>
          </div>

          <!-- User -->
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-600">{{ authStore.loggedUser || 'admin' }}</span>
            <div class="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center">
              <User class="w-3.5 h-3.5 text-gray-500" />
            </div>
            <button class="text-gray-400 hover:text-red-500 transition-colors" title="退出登录" @click="handleLogout">
              <LogOut class="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <!-- Content Container -->
      <div class="p-6 flex-1 overflow-auto">
        <div class="h-full">
          <component :is="currentViewComponent === 'DashboardPage' ? DashboardPage :
            currentViewComponent === 'FanzongManager' ? FanzongManager :
            currentViewComponent === 'DirectoryConfigPanel' ? DirectoryConfigPanel :
            currentViewComponent === 'AccountingMetadata' ? AccountingMetadata :
            currentViewComponent === 'ReportConfig' ? ReportConfig :
            currentViewComponent === 'InspectionConfig' ? InspectionConfig :
            currentViewComponent === 'ArchiveScope' ? ArchiveScope :
            currentViewComponent === 'ArchiveLib' ? ArchiveLib :
            currentViewComponent === 'UnitManage' ? UnitManage :
            currentViewComponent === 'OrgManage' ? OrgManage :
            currentViewComponent === 'PersonnelManage' ? PersonnelManage :
            currentViewComponent === 'RoleManage' ? RoleManage :
            currentViewComponent === 'AuditLogs' ? AuditLogs :
            currentViewComponent === 'FinanceView' ? FinanceView :
            currentViewComponent === 'ProjectView' ? ProjectView :
            currentViewComponent === 'TimeView' ? TimeView :
            currentViewComponent === 'SmartData' ? SmartData :
            currentViewComponent === 'WorkflowControl' ? WorkflowControl :
            currentViewComponent === 'BorrowManage' ? BorrowManage :
            currentViewComponent === 'ReturnManage' ? ReturnManage :
            currentViewComponent === 'SearchStats' ? SearchStats :
            currentViewComponent === 'OrderSpecial' ? OrderSpecial :
            DashboardPage" />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.scrollbar-thin::-webkit-scrollbar { width: 3px; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
.scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
</style>
