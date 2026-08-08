<script setup lang="ts">
import { ref } from 'vue';
import { Upload, Search, CheckCircle2, Compass, Info } from 'lucide-vue-next';

defineOptions({ name: 'SmartData' });

interface CleanTableItem {
  id: string; rawVoucher: string; cleanVoucher: string; archiveCode: string;
  isSegment: boolean; status: string;
}

const cleanTableData = ref<CleanTableItem[]>([
  { id: '1', rawVoucher: '银 [2026] -- 05_004号', cleanVoucher: '银-202605-004', archiveCode: '1728-1-001', isSegment: false, status: '已上架' },
  { id: '2', rawVoucher: '记 - 2026 - 05#001', cleanVoucher: '记-202605-001', archiveCode: '1728-1-002', isSegment: false, status: '质检中' },
  { id: '3', rawVoucher: '付(商) __05_009', cleanVoucher: '付-202605-009', archiveCode: '1728-1-003', isSegment: true, status: '已上架' },
  { id: '4', rawVoucher: '[2026]052_拆_01', cleanVoucher: '拆-202605-001', archiveCode: '1728-1-004', isSegment: false, status: 'New' },
]);
const cleanSearchQuery = ref('');
const isInsertSegmentModalOpen = ref(false);
const insertSegmentBaseVoucher = ref('1728-1-00X');
const insertSegmentVal = ref('');
const insertSegmentRule = ref('1');
const customVoucherToClean = ref('');
const cleanedVoucherOutput = ref('');

function triggerToast(msg: string, type: string = 'success'): void {
  alert(`${type}: ${msg}`);
}

function handleBatchClean(): void {
  cleanTableData.value = cleanTableData.value.map((item) => {
    let clean = item.rawVoucher;
    clean = clean.replace(/\s+/g, '').replace(/\[|\]/g, '-').replace(/_|-+/g, '-').replace(/号/g, '').replace(/#+/g, '').replace(/\/+/g, '-').replace(/\(.*\)/, '');
    return { ...item, cleanVoucher: clean, status: '已上架' };
  });
  triggerToast('批量智能清洗消噪重塑完毕！', 'success');
}

function handleCleanOne(): void {
  let clean = customVoucherToClean.value;
  clean = clean.replace(/\s+/g, '').replace(/\[|\]/g, '-').replace(/_|-+/g, '-').replace(/号/g, '').replace(/#+/g, '').replace(/\/+/g, '-');
  if (!clean.includes('-')) clean = `记-${clean}`;
  cleanedVoucherOutput.value = clean;
  triggerToast(`单件验证通过！已生成标准件: ${clean}`, 'success');
}

function handleSegmentInsert(): void {
  isInsertSegmentModalOpen.value = false;
  cleanTableData.value.push({
    id: String(cleanTableData.value.length + 1),
    rawVoucher: `分册插入 [${insertSegmentVal.value}]`,
    cleanVoucher: `银-202605-${insertSegmentVal.value.split(',')[0]}`,
    archiveCode: '1728-2-004-SEC',
    isSegment: true,
    status: 'New',
  });
  triggerToast('多段自然数段插卷规则计算完成！', 'success');
}

const filteredTableData = ref<CleanTableItem[]>([]);
// Inline filter computed in template
function getFilteredData(): CleanTableItem[] {
  if (!cleanSearchQuery.value) return cleanTableData.value;
  const q = cleanSearchQuery.value.toLowerCase();
  return cleanTableData.value.filter((item) =>
    item.cleanVoucher.toLowerCase().includes(q) || item.archiveCode.toLowerCase().includes(q),
  );
}
</script>

<template>
  <div class="flex-1 overflow-auto space-y-6 p-6">
    <div class="card">
      <div class="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 mb-5">
        <div>
          <h2 class="text-base font-bold text-slate-900 border-l-4 border-emerald-500 pl-3">多状态凭证数据清洗与智能插卷控制台</h2>
          <p class="text-xs text-slate-500 mt-1">针对由上游各型ERP不端格式汇入的繁复字符与乱码，提供工业级标准消噪解译、多段自然数插卷以及凭证册并案管理。</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
        <!-- Left: Cleaner Sandbox -->
        <div class="lg:col-span-4 card bg-slate-50 flex flex-col justify-between">
          <div>
            <h3 class="text-xs font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2 mb-3">
              <span class="w-2 h-2 rounded-full bg-emerald-500" /><span>不规范凭证消噪流沙箱</span>
            </h3>
            <p class="text-[11px] text-slate-500 leading-relaxed mb-4">测试会计不规则空白、特殊破折号及换行的自动消除规则。</p>
            <div class="space-y-3 bg-white p-3 rounded-xl border border-slate-100 text-[11px] mb-4">
              <div class="bg-slate-50 p-2 rounded-lg flex justify-between items-center">
                <div><span class="block text-[9px] text-slate-400">原始格式：</span><code class="text-slate-500 line-through">银 [2026] -- 05_004号</code></div>
                <div class="text-right"><span class="block text-[9px] text-emerald-600">标准件号:</span><strong class="text-emerald-700">银-202605-004</strong></div>
              </div>
              <div class="space-y-2 pt-2 border-t border-slate-100">
                <label class="block text-xs font-bold text-slate-600">输入需要转换的污染号</label>
                <input v-model="customVoucherToClean" type="text" class="input-base text-xs" />
                <button @click="handleCleanOne" class="btn-primary w-full text-xs">消噪重编</button>
                <div v-if="cleanedVoucherOutput" class="mt-2 text-center bg-emerald-50 text-emerald-800 p-2 rounded-lg text-xs font-bold animate-fade-in">
                  解析转换值: <span class="font-mono underline">{{ cleanedVoucherOutput }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Table + Controls -->
        <div class="lg:col-span-8 card flex flex-col justify-between">
          <div>
            <h3 class="text-xs font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2 mb-4">
              <span class="w-2 h-2 rounded-full bg-blue-500" /><span>批次清洗规整与插册规则管理面板</span>
            </h3>
            <!-- Toolbar -->
            <div class="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-50 border border-slate-200 p-4 rounded-xl mb-4 text-xs">
              <div class="flex flex-wrap gap-2">
                <button @click="handleBatchClean" class="btn-primary text-xs flex items-center gap-1.5"><Upload class="w-3.5 h-3.5" /><span>批量清洗格式</span></button>
                <button @click="isInsertSegmentModalOpen = true" class="btn-secondary text-xs flex items-center gap-1.5"><CheckCircle2 class="w-3.5 h-3.5" /><span>执行智能插卷设置</span></button>
                <button @click="triggerToast('快速自检通过！', 'success')" class="btn-ghost text-xs flex items-center gap-1.5"><Compass class="w-3.5 h-3.5" /><span>快速规则自检</span></button>
              </div>
              <div class="relative">
                <input v-model="cleanSearchQuery" type="text" placeholder="标准档号模糊查询..." class="input-base pl-8 pr-3 py-2 text-xs w-full sm:w-56" />
                <Search class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <!-- Table -->
            <div class="bg-white border border-gray-200 shadow-sm rounded overflow-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-xs">
                  <tr>
                    <th class="p-3 w-12 text-center">No.</th><th class="p-3">采集原始不规范内容</th><th class="p-3">智能清洗后标准凭证号</th><th class="p-3">系统级生成档号</th><th class="p-3">卷号模式</th><th class="p-3 text-center">状态</th><th class="p-3 text-center">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="(row, index) in getFilteredData()" :key="row.id" class="hover:bg-blue-50 transition-colors cursor-pointer">
                    <td class="p-3 text-center text-slate-400 font-mono">{{ index + 1 }}</td>
                    <td class="p-3 font-medium text-slate-500 max-w-[180px] truncate" :title="row.rawVoucher">{{ row.rawVoucher }}</td>
                    <td class="p-3 font-mono font-bold text-emerald-600">{{ row.cleanVoucher }}</td>
                    <td class="p-3 font-mono text-slate-800 font-medium">{{ row.archiveCode }}</td>
                    <td class="p-3"><span :class="['px-2 py-0.5 rounded-md text-[10px] font-bold', row.isSegment ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'badge-slate']">{{ row.isSegment ? '多段自然数插卷' : '标准连续自然数' }}</span></td>
                    <td class="p-3 text-center"><span :class="['px-2 py-0.5 rounded-full text-[10px] font-bold', row.status === 'New' ? 'badge-slate' : row.status === '质检中' ? 'badge-amber' : 'badge-green']">{{ row.status }}</span></td>
                    <td class="p-3 text-center">
                      <div class="flex gap-2 justify-center">
                        <button @click="triggerToast(`即时核验 ${row.cleanVoucher} 的影像链。`, 'success')" class="btn-ghost text-[11px]">查看影像</button>
                        <button @click="row.cleanVoucher = row.rawVoucher.split(' ').filter(Boolean)[0] || '记-待定'; row.status = '质检中'; triggerToast(`已重置流水件 [ID: ${row.id}]`, 'warning')" class="btn-ghost text-[11px] text-amber-600 hover:text-amber-800">重置流水</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="isInsertSegmentModalOpen" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" @click="isInsertSegmentModalOpen = false">
        <div class="bg-white rounded-2xl w-full max-w-lg border border-slate-200 p-6 shadow-2xl relative space-y-4 animate-scale-in" @click.stop>
          <div class="border-b border-slate-100 pb-2.5">
            <h3 class="font-bold text-slate-900 text-sm">设置特殊业务场景下的多段自然数段（插卷管理）</h3>
            <p class="text-xs text-slate-400 mt-0.5">主档缺件/单独装册时，定义自然数附件物理切分</p>
          </div>
          <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800"><Info class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" /><span>本规则专门适配附件过多单独装盒、凭证与附件分离、跨卷盒拼盒、缺号等非连续自然数场景。</span></div>
          <div class="space-y-4 text-xs">
            <div><label class="block font-bold text-slate-600 mb-1.5">基础目标案卷号</label><input v-model="insertSegmentBaseVoucher" disabled type="text" class="input-base font-mono font-bold bg-slate-50" /></div>
            <div><label class="block font-bold text-slate-600 mb-1.5">拟切分自然数段 <span class="text-rose-500">*</span></label><input v-model="insertSegmentVal" type="text" placeholder="例如：004-1, 004-2 (英文逗号)" class="input-base font-mono text-slate-800 font-bold" /></div>
            <div><label class="block font-bold text-slate-600 mb-1.5">数据映射规则</label><select v-model="insertSegmentRule" class="input-base"><option value="1">保持卷号整体连续性，不重写基准件号</option><option value="2">强制切分，与附件装盒深度绑定</option></select></div>
          </div>
          <div class="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5 text-xs">
            <button @click="isInsertSegmentModalOpen = false" class="btn-ghost">取消</button>
            <button @click="handleSegmentInsert" class="btn-primary">确认执行</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
