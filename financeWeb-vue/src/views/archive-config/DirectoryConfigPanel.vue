<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import {
  Archive, Calendar, FolderPlus, Save, ChevronDown, ChevronRight, FileText,
  BookOpen, BarChart3, Plus, CheckCircle, Clock, Building2, Edit2, Trash2,
  ChevronUp, Loader2,
} from 'lucide-vue-next';
import { getDirectoryConfig, saveDirectoryConfig, type DirectoryConfig } from '@/api/directoryConfig';
import type { LevelType } from '@/types/config';

defineOptions({ name: 'DirectoryConfigPanel' });

// ─── ARCHIVE_CONTENT_CONFIG (hardcoded reference data) ───
const ARCHIVE_CONTENT_CONFIG: Record<string, {
  icon: unknown; color: string; bgColor: string;
  children: Record<string, { children?: Record<string, { items: string[] }>; items?: string[] }>;
}> = {
  '会计凭证': { icon: FileText, color: 'text-blue-600', bgColor: 'bg-blue-50', children: {
    '原始凭证': { children: {
      '外来原始凭证': { items: ['增值税发票','普通发票','财政票据','银行回单','银行对账单回执','收据','差旅费报销单据','运输单据','报关单','完税凭证','社保缴费单据','公积金缴费单据','对外往来结算单据'] },
      '自制原始凭证': { items: ['入库单','出库单','领料单','销售单','工资表','考勤表','折旧计算表','摊销表','费用分摊单','借款单','报销单','盘点表','内部往来结算单','收款收据','付款申请单'] },
      '原始凭证附件': { items: ['合同复印件','协议','审批文件','证明材料','验收单','质检单','附件清单'] },
    }},
    '记账凭证': { children: {
      '专用记账凭证': { items: ['收款凭证','付款凭证','转账凭证'] },
      '通用记账凭证': { items: ['通用记账凭证'] },
      '凭证汇总表': { items: ['记账凭证附件汇总','凭证汇总表','科目汇总表'] },
      '调整凭证': { items: ['红字冲销凭证','更正凭证','调整凭证'] },
    }},
    '凭证附属装订资料': { items: ['凭证封面','凭证封底','凭证装订册','凭证交接清单','作废凭证','空白凭证存根'] },
  }},
  '会计账簿': { icon: BookOpen, color: 'text-emerald-600', bgColor: 'bg-emerald-50', children: {
    '总账': { items: ['总分类账','账簿启用表','经管人员一览表'] },
    '明细账': { items: ['资产明细账','负债明细账','权益明细账','收入明细账','成本明细账','费用明细账','分户账'] },
    '日记账': { items: ['现金日记账','银行存款日记账'] },
    '辅助账簿/备查账': { children: {
      '往来备查簿': { items: ['应收账款备查簿','应付账款备查簿'] },
      '票据备查簿': { items: ['支票备查簿','汇票备查簿','本票备查簿'] },
      '资产备查簿': { items: ['固定资产备查簿','低值易耗品备查簿','出租资产备查簿','出借资产备查簿'] },
      '担保备查簿': { items: ['对外担保备查簿','抵押备查簿','托管资产备查簿'] },
      '台账': { items: ['合同台账','往来单位台账','税务备查台账'] },
    }},
    '账簿相关资料': { items: ['账簿扉页','账册目录','结账记录','错账更正记录','账簿交接记录','作废账页'] },
  }},
  '财务会计报告': { icon: BarChart3, color: 'text-amber-600', bgColor: 'bg-amber-50', children: {
    '定期财务报告': { children: {
      '会计报表主表': { items: ['资产负债表','利润表','现金流量表','所有者权益变动表'] },
      '会计报表附表': { items: ['资产减值明细表','应交税费明细表','利润分配表','成本明细表','费用明细表'] },
      '财务报表附注': { items: ['报表注释','重大事项说明','会计政策变更说明','会计估计变更说明'] },
      '财务情况说明书': { items: ['企业经营情况','财务分析','重大投融资','盈亏分析','风险说明'] },
    }},
    '专项财务报告': { children: {
      '内部管理报表': { items: ['部门利润表','项目成本表','预算执行表','经营分析表','绩效考核报表'] },
      '对外专项报告': { items: ['清算报表','改制报表','合并财务报表','分部报表','关联方交易报表'] },
      '审计相关报告': { items: ['内部审计报告','外部审计报告','验资报告','评估报告','鉴证报告'] },
    }},
    '报告附属资料': { items: ['报表封面','报送回执','审批签字页','报告交接记录','报表底稿','试算平衡表'] },
  }},
  '其他会计资料': { icon: Archive, color: 'text-purple-600', bgColor: 'bg-purple-50', children: {
    '会计核算配套资料': { children: {
      '银行资料': { items: ['银行开户许可证','账户备案资料','银行印鉴卡','银行余额调节表','银行对账单','网银操作日志','账户变更资料','账户注销资料'] },
      '税务资料': { items: ['纳税申报表','税务备案表','税收优惠资料','税务稽查结论','涉税批复','发票领购台账','发票使用台账','发票核销台账','发票存根联','发票登记簿'] },
      '资产核算资料': { items: ['资产盘点报告','盘点差异处理文件','资产处置审批单','资产清查报告','资产评估资料'] },
      '预算决算资料': { items: ['单位全面预算','部门预算','预算批复','预算调整文件','年度决算报告','决算批复'] },
    }},
    '会计制度与文书档案': { children: {
      '管理制度': { items: ['财务管理制度','会计核算办法','内控财务制度','资金管理制度','费用报销制度'] },
      '交接档案': { items: ['会计人员交接清单','会计岗位变动资料','会计档案移交清册','保管清册','销毁清册'] },
      '档案管理': { items: ['会计档案鉴定意见书','档案查阅登记','档案借阅登记','档案复制件审批记录'] },
    }},
    '合同协议及结算资料': { children: {
      '经济合同': { items: ['采购合同','销售合同','服务合同','借款合同','租赁合同','投融资合同','担保合同','工程合同'] },
      '结算协议': { items: ['结算协议','往来对账函','询证函','债务重组协议','债权债务确认单'] },
    }},
    '电子会计档案专属资料': { children: {
      '电子凭证': { items: ['电子会计凭证','电子账簿','电子报表','电子票据','电子回单'] },
      '系统资料': { items: ['会计电算化系统日志','账套备份数据','备份台账','系统运维记录','电子档案元数据','电子签名','防篡改校验记录'] },
      '文档资料': { items: ['财务软件操作手册','账套初始化资料','科目体系设置文档'] },
    }},
    '其他辅助资料': { items: ['经济批复','请示文件','会议纪要','工会经费资料','党费资料','专项资金资料','财政拨款资料','清算注销资料','分立合并资料','改制资料','司法调取回执','纪检调取回执','监察调取回执'] },
  }},
};

// ─── PROJECT_ACCOUNTING_CONFIG ───
const PROJECT_ACCOUNTING_CONFIG: Record<string, { phases?: Record<string, { desc?: string; items: string[] }> }> = {
  '一、项目立项阶段': { phases: { '前期费用': { desc: '调研、咨询、设计、招投标等', items: ['前期费用报销单','咨询服务合同','设计合同','招投标文件','项建议书','可行性研究报告','立项批复','董事会决议','预算表','编码审批单'] } } },
  '二、施工/执行阶段': { phases: {
    '（一）材料/物资采购与领用': { desc: '最常见', items: ['采购合同','增值税发票','入库单','验收单','物流单','比价单','出库单','领用单','材料分摊表','结算单','付款申请单','银行回单'] },
    '（二）人工费': { desc: '直接人工+项目管理人工', items: ['工资表','考勤表','工时记录','社保计提表','公积金计提表','个税申报表','工资发放回单','社保缴费单','公积金缴费单'] },
    '（三）分包/外包款': { desc: '工程/服务类项目核心', items: ['分包合同','分包结算单','工程量确认单','发票','验收单','付款申请单','分包资质证明','银行回单'] },
    '（四）机械使用费/设备租赁': { desc: '', items: ['租赁合同','机械台班记录','结算单','发票','付款回单'] },
    '（五）项目间接费用': { desc: '现场管理、办公、差旅等', items: ['费用报销单','合规发票','差旅审批单','行程单','酒店水单','办公明细','通讯费账单'] },
    '（六）固定资产/无形资产购置': { desc: '项目专用', items: ['采购合同','发票','验收单','资产卡片','银行回单','折旧计算表','摊销计算表'] },
    '（七）税务相关': { desc: '预缴、计提、缴纳', items: ['预缴税款表','完税凭证','项目收入明细','收入结算单','销项发票','计税依据表','增值税申报表','城建税申报表'] },
  }},
  '三、结算与收入确认阶段': { phases: {
    '项目进度结算': { desc: '履约进度确认', items: ['进度结算书','工程量确认单','甲方/监理签字确认单','发票','收款收据','银行回单','到账通知'] },
    '竣工/最终结算': { desc: '含变更、签证', items: ['竣工结算报告','最终确认单','变更签证单','尾款发票','质保金协议','质保金确认单'] },
  }},
  '四、成本结转与损益处理': { phases: {
    '项目成本结转': { desc: '完工/履约完成', items: ['成本结转计算表','项目成本台账','履约进度表'] },
    '项目毛利结转': { desc: '期末', items: ['毛利计算表','损益结转凭证'] },
  }},
  '五、项目关闭与收尾': { phases: {
    '质保金收回': { items: ['质保金到期确认单','银行回单','收据'] },
    '保证金退回': { items: ['退款协议','银行回单','收据'] },
    '项目档案归档': { desc: '备查', items: ['全套合同','结算单','凭证附件','验收报告','审计报告'] },
  }},
};

// ─── Helpers ─────────────────────────────────
function getAllArchiveItems(): string[] {
  const items: string[] = [];
  Object.values(ARCHIVE_CONTENT_CONFIG).forEach((cat) => {
    Object.values(cat.children).forEach((sub) => {
      if ('items' in sub && sub.items) items.push(...sub.items);
      else if ('children' in sub && sub.children) {
        Object.values(sub.children).forEach((third) => { if (third.items) items.push(...third.items); });
      }
    });
  });
  return items;
}
function getAllProjectItems(): string[] {
  const items: string[] = [];
  Object.values(PROJECT_ACCOUNTING_CONFIG).forEach((s) => {
    if (s.phases) Object.values(s.phases).forEach((p) => { if (p.items) items.push(...p.items); });
  });
  return items;
}
function getSubArchiveItems(subConfig: { children?: Record<string, { items: string[] }>; items?: string[] }): string[] {
  if ('items' in subConfig && subConfig.items) return subConfig.items;
  if ('children' in subConfig && subConfig.children) {
    const res: string[] = [];
    Object.values(subConfig.children).forEach((c) => { if (c.items) res.push(...c.items); });
    return res;
  }
  return [];
}

const TOTAL_ARCHIVE_ITEMS = getAllArchiveItems().length;
const TOTAL_PROJECT_ITEMS = getAllProjectItems().length;

// ─── Types ──────────────────────────────────
type TabType = 'archive-category' | 'year-settings' | 'project-settings';
interface ProjectItem {
  id: string; name: string; code: string; description: string;
  selectedAccountingItems: Set<string>;
}

// ─── State ──────────────────────────────────
const activeTab = ref<TabType>('archive-category');
const loading = ref(true);
const config = ref<DirectoryConfig | null>(null);

// Archive tab
const expandedCategories = ref<Set<string>>(new Set(['会计凭证','会计账簿','财务会计报告','其他会计资料']));
const selectedArchiveItems = ref<Set<string>>(new Set());

// Year tab
const availableYears = reactive(Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - i));
const selectedYears = ref<Set<number>>(new Set());
const newYearInput = ref('');

// Project tab
const projects = ref<ProjectItem[]>([]);
const newProjectName = ref('');
const newProjectCode = ref('');
const editingProject = ref<string | null>(null);
const expandedProjectForAccounting = ref<string | null>(null);
const expandedAccountingStages = ref<Set<string>>(new Set());

// ─── Computed ───────────────────────────────
const sortedSelectedYears = computed(() => [...selectedYears.value].sort((a, b) => b - a));
const minYear = computed(() => sortedSelectedYears.value.length > 0 ? Math.min(...sortedSelectedYears.value) : null);
const maxYear = computed(() => sortedSelectedYears.value.length > 0 ? Math.max(...sortedSelectedYears.value) : null);

// ─── Init ───────────────────────────────────
onMounted(async () => {
  try {
    const cfg = await getDirectoryConfig();
    config.value = cfg;
    const years = cfg.years?.filter((y: { enabled: boolean }) => y.enabled).map((y: { year: number }) => y.year) || [];
    selectedYears.value = new Set(years);
    selectedArchiveItems.value = new Set(getAllArchiveItems());
    projects.value = (cfg.projects || []).map((p: { id: string; name: string; code: string }) => ({
      id: p.id, name: p.name, code: p.code, description: '',
      selectedAccountingItems: new Set(getAllProjectItems()),
    }));
  } catch {
    selectedArchiveItems.value = new Set(getAllArchiveItems());
    selectedYears.value = new Set([2026, 2025]);
  } finally { loading.value = false; }
});

// ─── Archive handlers ─────────────────────────
function toggleArchiveCategory(category: string): void {
  const s = new Set(expandedCategories.value);
  s.has(category) ? s.delete(category) : s.add(category);
  expandedCategories.value = s;
}
function toggleArchiveItem(item: string): void {
  const s = new Set(selectedArchiveItems.value);
  s.has(item) ? s.delete(item) : s.add(item);
  selectedArchiveItems.value = s;
}
function toggleSubArchiveItems(items: string[]): void {
  const allSelected = items.every((i) => selectedArchiveItems.value.has(i));
  const s = new Set(selectedArchiveItems.value);
  allSelected ? items.forEach((i) => s.delete(i)) : items.forEach((i) => s.add(i));
  selectedArchiveItems.value = s;
}

// ─── Year handlers ────────────────────────────
function toggleYear(year: number): void {
  const s = new Set(selectedYears.value);
  s.has(year) ? s.delete(year) : s.add(year);
  selectedYears.value = s;
}
function addCustomYear(): void {
  const y = parseInt(newYearInput.value);
  if (y && y > 1900 && y <= new Date().getFullYear() + 5) {
    if (!availableYears.includes(y)) { availableYears.push(y); availableYears.sort((a, b) => b - a); }
    selectedYears.value = new Set([...selectedYears.value, y]);
    newYearInput.value = '';
  }
}

// ─── Project handlers ─────────────────────────
function addProject(): void {
  if (newProjectName.value && newProjectCode.value) {
    projects.value.push({
      id: `project-${Date.now()}`, name: newProjectName.value, code: newProjectCode.value,
      description: '', selectedAccountingItems: new Set(getAllProjectItems()),
    });
    newProjectName.value = ''; newProjectCode.value = '';
  }
}
function deleteProject(id: string): void {
  projects.value = projects.value.filter((p) => p.id !== id);
  if (expandedProjectForAccounting.value === id) expandedProjectForAccounting.value = null;
}
function updateProject(id: string, field: 'name' | 'code' | 'description', value: string): void {
  const p = projects.value.find((x) => x.id === id);
  if (p) (p as Record<string, unknown>)[field] = value;
}
function toggleAccountingStage(stage: string): void {
  const s = new Set(expandedAccountingStages.value);
  s.has(stage) ? s.delete(stage) : s.add(stage);
  expandedAccountingStages.value = s;
}
function toggleProjectAccountingItem(projectId: string, item: string): void {
  const p = projects.value.find((x) => x.id === projectId);
  if (p) { const s = new Set(p.selectedAccountingItems); s.has(item) ? s.delete(item) : s.add(item); p.selectedAccountingItems = s; }
}
function toggleProjectPhaseItems(projectId: string, items: string[]): void {
  const p = projects.value.find((x) => x.id === projectId);
  if (p) {
    const allSelected = items.every((i) => p.selectedAccountingItems.has(i));
    const s = new Set(p.selectedAccountingItems);
    allSelected ? items.forEach((i) => s.delete(i)) : items.forEach((i) => s.add(i));
    p.selectedAccountingItems = s;
  }
}

// ─── Save ────────────────────────────────────
const saving = ref(false);
const saved = ref(false);
async function saveAllConfig(): Promise<void> {
  saving.value = true;
  try {
    const newYears = availableYears.filter((y: number) => selectedYears.value.has(y)).map((y, i) => ({ id: `year-${y}`, year: y, enabled: true, order: i }));
    const newProjects = projects.value.map((p, i) => ({ id: p.id, name: p.name, code: p.code, enabled: true, order: i }));
    await saveDirectoryConfig({
      ...(config.value || { viewDimensions: [], archiveTypes: [], years: [], projects: [], levelTemplates: { 'finance-category': [] as LevelType[], 'project-panorama': [] as LevelType[], 'time-timeline': [] as LevelType[] }, autoAssociation: false, manualAssociation: false, lazyLoad: false, highlightCurrent: false, showViewSwitch: false, selectedArchiveItems: [] }),
      years: newYears,
      projects: newProjects as unknown as DirectoryConfig['projects'],
      selectedArchiveItems: [...selectedArchiveItems.value],
    });
    saved.value = true; setTimeout(() => { saved.value = false; }, 2000);
  } finally { saving.value = false; }
}

const tabs = [
  { id: 'archive-category' as const, label: '选择类型', icon: Archive },
  { id: 'year-settings' as const, label: '年份设置', icon: Calendar },
  { id: 'project-settings' as const, label: '项目设置', icon: FolderPlus },
];
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center h-full text-slate-400 text-sm gap-2"><Loader2 class="w-4 h-4 animate-spin" />加载中...</div>
  <div v-else class="w-full h-full flex flex-col bg-white">
    <!-- Header -->
    <div class="border-b border-slate-200 shrink-0">
      <div class="px-6 pt-5 pb-2 flex items-center justify-between">
        <h2 class="text-lg font-bold text-slate-800">目录配置</h2>
        <button @click="saveAllConfig" :disabled="saving" class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
          <Save class="w-4 h-4" /> <span class="text-sm font-medium">{{ saving ? '保存中...' : saved ? '已保存' : '保存全部' }}</span>
        </button>
      </div>
      <div class="px-6 flex gap-1">
        <button v-for="tab in tabs" :key="tab.id" @click="activeTab = tab.id"
          class="flex items-center gap-2 px-4 py-2.5 rounded-t-lg transition-all text-sm font-medium"
          :class="activeTab === tab.id ? 'bg-slate-100 text-slate-800 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'">
          <component :is="tab.icon" :class="['w-4 h-4', activeTab === tab.id ? 'text-blue-600' : 'text-slate-400']" />
          <span>{{ tab.label }}</span>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <!-- Tab 1: Archive Categories -->
      <div v-if="activeTab === 'archive-category'">
        <div class="mb-4 text-sm text-slate-500">已选 <span class="font-bold text-blue-600">{{ selectedArchiveItems.size }}</span> / {{ TOTAL_ARCHIVE_ITEMS }} 项档案类型</div>
        <div class="space-y-4">
          <div v-for="(catConfig, category) in ARCHIVE_CONTENT_CONFIG" :key="category"
            :class="['rounded-xl border', catConfig.bgColor, 'border-slate-200']">
            <div class="flex items-center gap-3 p-3 cursor-pointer" @click="toggleArchiveCategory(category)">
              <ChevronDown v-if="expandedCategories.has(category)" class="w-4 h-4 text-slate-400" />
              <ChevronRight v-else class="w-4 h-4 text-slate-400" />
              <component :is="catConfig.icon" :class="['w-4 h-4', catConfig.color]" />
              <span class="text-sm font-bold text-slate-700">{{ category }}</span>
              <span class="text-xs text-slate-500">({{ getSubArchiveItems(catConfig.children as Record<string, {children?: Record<string, {items: string[]}>; items?: string[]}>).filter((i: string) => selectedArchiveItems.has(i)).length }}/{{ getSubArchiveItems(catConfig.children as Record<string, {children?: Record<string, {items: string[]}>; items?: string[]}>).length }})</span>
            </div>
            <div v-if="expandedCategories.has(category)" class="px-3 pb-3 space-y-3">
              <template v-for="(subConfig, subCategory) in (catConfig.children as Record<string, {children?: Record<string, {items: string[]}>; items?: string[]}>)" :key="subCategory">
                <div class="ml-3">
                  <div class="flex items-center gap-2 mb-1.5">
                    <input type="checkbox" :checked="getSubArchiveItems(subConfig).length > 0 && getSubArchiveItems(subConfig).every((i: string) => selectedArchiveItems.has(i))"
                      @change="toggleSubArchiveItems(getSubArchiveItems(subConfig))" class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer" />
                    <span class="text-xs font-semibold text-slate-600">{{ subCategory }}</span>
                    <span class="text-xs text-slate-400">({{ getSubArchiveItems(subConfig).filter((i: string) => selectedArchiveItems.has(i)).length }}/{{ getSubArchiveItems(subConfig).length }})</span>
                  </div>
                  <!-- Has items directly -->
                  <div v-if="'items' in subConfig && subConfig.items" class="ml-5 grid grid-cols-3 gap-1">
                    <div v-for="item in subConfig.items" :key="item" class="flex items-center gap-1.5 py-0.5">
                      <input type="checkbox" :checked="selectedArchiveItems.has(item)" @change="toggleArchiveItem(item)" class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer" />
                      <span class="text-xs text-slate-600">{{ item }}</span>
                    </div>
                  </div>
                  <!-- Has children (third level) -->
                  <div v-else-if="'children' in subConfig && subConfig.children" class="ml-5 space-y-1.5">
                    <div v-for="(thirdConfig, thirdCategory) in subConfig.children" :key="String(thirdCategory)">
                      <div class="flex items-center gap-2 mb-1">
                        <input type="checkbox" :checked="thirdConfig.items.length > 0 && thirdConfig.items.every((i: string) => selectedArchiveItems.has(i))"
                          @change="toggleSubArchiveItems(thirdConfig.items)" class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer" />
                        <span class="text-xs font-medium text-slate-500">{{ thirdCategory }}</span>
                        <span class="text-xs text-slate-400">({{ thirdConfig.items.filter((i: string) => selectedArchiveItems.has(i)).length }}/{{ thirdConfig.items.length }})</span>
                      </div>
                      <div class="ml-5 grid grid-cols-3 gap-1">
                        <div v-for="item in thirdConfig.items" :key="item" class="flex items-center gap-1.5 py-0.5">
                          <input type="checkbox" :checked="selectedArchiveItems.has(item)" @change="toggleArchiveItem(item)" class="h-3 w-3 rounded border-slate-300 text-blue-600 cursor-pointer" />
                          <span class="text-xs text-slate-600">{{ item }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: Year Settings -->
      <div v-if="activeTab === 'year-settings'">
        <div v-if="selectedYears.size > 0" class="grid grid-cols-3 gap-4 mb-6">
          <div class="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div class="flex items-center gap-2 mb-2"><Calendar class="w-4 h-4 text-blue-600" /><span class="text-xs font-medium text-blue-600">年份范围</span></div>
            <div class="text-lg font-bold text-slate-800">{{ minYear }} ~ {{ maxYear }}</div>
            <div class="text-xs text-slate-500 mt-1">共 {{ maxYear && minYear ? maxYear - minYear + 1 : 0 }} 年跨度</div>
          </div>
          <div class="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <div class="flex items-center gap-2 mb-2"><CheckCircle class="w-4 h-4 text-emerald-600" /><span class="text-xs font-medium text-emerald-600">已启用</span></div>
            <div class="text-lg font-bold text-slate-800">{{ selectedYears.size }} 年</div>
            <div class="text-xs text-slate-500 mt-1">已配置年份数量</div>
          </div>
          <div class="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <div class="flex items-center gap-2 mb-2"><Clock class="w-4 h-4 text-amber-600" /><span class="text-xs font-medium text-amber-600">最近年份</span></div>
            <div class="text-lg font-bold text-slate-800">{{ maxYear || '-' }}</div>
            <div class="text-xs text-slate-500 mt-1">当前最新档案年份</div>
          </div>
        </div>
        <div class="mb-6 bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div class="flex items-center gap-4">
            <div class="flex-1 flex items-center gap-2">
              <Plus class="w-4 h-4 text-slate-400" />
              <input v-model="newYearInput" type="number" placeholder="输入自定义年份" min="1900" :max="new Date().getFullYear() + 5"
                class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button @click="addCustomYear" :disabled="!newYearInput" class="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 text-sm font-medium">添加年份</button>
          </div>
        </div>
        <div class="text-sm font-medium text-slate-600 mb-3">点击年份卡片进行选择/取消</div>
        <div class="grid grid-cols-5 gap-3">
          <button v-for="year in availableYears" :key="year" @click="toggleYear(year)"
            class="relative p-3 rounded-xl border-2 transition-all cursor-pointer"
            :class="selectedYears.has(year) ? 'bg-blue-50 border-blue-400 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'">
            <Calendar :class="['w-4 h-4 mb-1.5', selectedYears.has(year) ? 'text-blue-600' : 'text-slate-400']" />
            <span :class="['text-sm font-bold', selectedYears.has(year) ? 'text-blue-700' : 'text-slate-600']">{{ year }}</span>
            <span v-if="year === new Date().getFullYear()" class="absolute top-1 right-1 text-xs px-1 py-0.5 bg-emerald-100 text-emerald-600 rounded font-medium">当前</span>
            <CheckCircle v-if="selectedYears.has(year)" class="absolute top-1 left-1 w-3.5 h-3.5 text-blue-600" />
          </button>
        </div>
      </div>

      <!-- Tab 3: Project Settings -->
      <div v-if="activeTab === 'project-settings'">
        <div class="mb-6 bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div class="flex items-center gap-4">
            <FolderPlus class="w-5 h-5 text-slate-400" />
            <input v-model="newProjectName" type="text" placeholder="项目名称" class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input v-model="newProjectCode" type="text" placeholder="项目编码" class="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button @click="addProject" :disabled="!newProjectName || !newProjectCode" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">新增项目</button>
          </div>
        </div>
        <div class="text-sm font-medium text-slate-600 mb-3">已配置项目列表（{{ projects.length }} 个）</div>
        <div class="space-y-3">
          <div v-for="project in projects" :key="project.id" class="bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all overflow-hidden">
            <div class="p-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <Building2 class="w-5 h-5 text-blue-600" />
                <template v-if="editingProject === project.id">
                  <div class="flex items-center gap-2">
                    <input :value="project.name" @input="updateProject(project.id, 'name', ($event.target as HTMLInputElement).value)" class="px-2 py-1 border border-slate-300 rounded text-sm" />
                    <input :value="project.code" @input="updateProject(project.id, 'code', ($event.target as HTMLInputElement).value)" class="w-20 px-2 py-1 border border-slate-300 rounded text-sm" />
                    <button @click="editingProject = null" class="px-2 py-1 bg-emerald-600 text-white rounded text-sm">完成</button>
                  </div>
                </template>
                <template v-else>
                  <div><div class="text-sm font-bold text-slate-800">{{ project.name }}</div><div class="text-xs text-slate-500">编码: {{ project.code }} | 已选 {{ project.selectedAccountingItems.size }}/{{ TOTAL_PROJECT_ITEMS }} 项</div></div>
                </template>
              </div>
              <div class="flex items-center gap-2">
                <button @click="expandedProjectForAccounting = expandedProjectForAccounting === project.id ? null : project.id"
                  :class="['px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', expandedProjectForAccounting === project.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600']">
                  {{ expandedProjectForAccounting === project.id ? '收起会计内容' : '配置会计内容' }}
                </button>
                <button @click="editingProject = project.id" class="p-2 hover:bg-slate-100 rounded-lg text-slate-500"><Edit2 class="w-4 h-4" /></button>
                <button @click="deleteProject(project.id)" class="p-2 hover:bg-red-50 rounded-lg text-slate-500 hover:text-red-600"><Trash2 class="w-4 h-4" /></button>
              </div>
            </div>
            <!-- Accounting content selection -->
            <div v-if="expandedProjectForAccounting === project.id" class="border-t border-slate-200 bg-slate-50 p-4">
              <div class="text-sm font-medium text-slate-700 mb-3">选择该项目可能产生的会计凭证内容</div>
              <div class="space-y-3">
                <div v-for="(stageConfig, stage) in PROJECT_ACCOUNTING_CONFIG" :key="stage" class="bg-white rounded-lg border border-slate-200">
                  <div class="flex items-center gap-3 p-3 cursor-pointer" @click="toggleAccountingStage(stage)">
                    <ChevronDown v-if="expandedAccountingStages.has(stage)" class="w-4 h-4 text-slate-400" />
                    <ChevronRight v-else class="w-4 h-4 text-slate-400" />
                    <span class="text-sm font-semibold text-slate-700">{{ stage }}</span>
                    <span class="text-xs text-slate-500">({{
                      (() => { const si: string[] = []; if (stageConfig.phases) Object.values(stageConfig.phases).forEach((p2: any) => { if (p2.items) si.push(...p2.items); }); return si.filter((i: string) => project.selectedAccountingItems.has(i)).length; })()
                    }}/{{ 
                      (() => { const si: string[] = []; if (stageConfig.phases) Object.values(stageConfig.phases).forEach((p2: any) => { if (p2.items) si.push(...p2.items); }); return si.length; })()
                    }})</span>
                  </div>
                  <div v-if="expandedAccountingStages.has(stage) && stageConfig.phases" class="px-3 pb-3 space-y-3">
                    <div v-for="(phaseConfig, phaseName) in stageConfig.phases" :key="phaseName" class="ml-3">
                      <div class="flex items-center gap-2 mb-1.5">
                        <input type="checkbox"
                          :checked="phaseConfig.items.length > 0 && phaseConfig.items.every((i: string) => project.selectedAccountingItems.has(i))"
                          @change="toggleProjectPhaseItems(project.id, phaseConfig.items)" class="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer" />
                        <span class="text-xs font-medium text-slate-600">{{ phaseName }}</span>
                        <span v-if="phaseConfig.desc" class="text-xs text-slate-400">（{{ phaseConfig.desc }}）</span>
                        <span class="text-xs text-slate-400">[{{ phaseConfig.items.filter((i: string) => project.selectedAccountingItems.has(i)).length }}/{{ phaseConfig.items.length }}]</span>
                      </div>
                      <div class="ml-5 grid grid-cols-3 gap-1">
                        <div v-for="item in phaseConfig.items" :key="item" class="flex items-center gap-1.5 py-0.5">
                          <input type="checkbox" :checked="project.selectedAccountingItems.has(item)"
                            @change="toggleProjectAccountingItem(project.id, item)" class="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer" />
                          <span class="text-xs text-slate-600">{{ item }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="projects.length === 0" class="text-center py-8 text-slate-500">
          <FolderPlus class="w-8 h-8 mx-auto mb-2 text-slate-300" /><div class="text-sm">暂无项目配置</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="p-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 shrink-0">配置保存后将在左侧目录树中生效</div>
  </div>
</template>

<style scoped lang="scss">
.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
