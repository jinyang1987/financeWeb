<template>
  <div class="flex h-screen w-full bg-[#F3F4F6] text-[#111827] font-sans overflow-hidden">
    <!-- Sidebar Navigation -->
    <aside class="w-64 bg-[#1F2937] text-gray-300 flex flex-col border-r border-gray-700">
      <div class="p-6 flex items-center space-x-3 border-b border-gray-700 bg-[#111827]">
        <div class="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
          <span class="text-white font-bold">AC</span>
        </div>
        <span class="text-white font-semibold text-lg tracking-tight">会计档案管理系统</span>
      </div>
      <nav class="flex-1 py-4 text-sm">
        <div class="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">基础管理</div>
        <a href="#" class="flex items-center px-6 py-2 bg-blue-700 text-white border-r-4 border-blue-400"><span class="mr-3">■</span> 档案查询</a>
        <a href="#" class="flex items-center px-6 py-2 hover:bg-gray-800 transition-colors"><span class="mr-3">□</span> 凭证移交</a>
        <a href="#" class="flex items-center px-6 py-2 hover:bg-gray-800 transition-colors"><span class="mr-3">□</span> 账簿登记</a>
        <div class="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">高级管理</div>
        <a href="#" class="flex items-center px-6 py-2 hover:bg-gray-800 transition-colors"><span class="mr-3">□</span> 审计监督</a>
        <a href="#" class="flex items-center px-6 py-2 hover:bg-gray-800 transition-colors"><span class="mr-3">□</span> 销毁管理</a>
        <a href="#" class="flex items-center px-6 py-2 hover:bg-gray-800 transition-colors"><span class="mr-3">□</span> 权限配置</a>
      </nav>
      <div class="p-4 border-t border-gray-700 text-xs flex justify-between items-center">
        <span>版本 v2.4.0</span>
        <span class="text-green-400">● 在线</span>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 flex flex-col h-full">
      <!-- Header Bar -->
      <header class="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
        <div class="flex items-center space-x-4">
          <span class="text-gray-400">首页 / 档案管理 / <b>会计凭证档案库</b></span>
        </div>
        <div class="flex items-center space-x-6">
          <div class="relative">
            <input type="text" placeholder="快速搜索档案编号..." class="bg-gray-100 border border-gray-300 rounded px-3 py-1 text-xs w-64 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div class="flex items-center space-x-2">
            <span class="text-sm text-gray-600">李明 (高级会计师)</span>
            <div class="w-8 h-8 rounded-full bg-gray-300"></div>
          </div>
        </div>
      </header>

      <!-- Content Container -->
      <div class="p-6 flex-1 flex flex-col space-y-4">
        <!-- Top Stats Grid -->
        <div class="grid grid-cols-4 gap-4">
          <div class="bg-white border border-gray-200 p-4 shadow-sm rounded">
            <div class="text-xs text-gray-500 uppercase">档案总数</div>
            <div class="text-2xl font-mono font-bold text-gray-800">142,850</div>
            <div class="text-xs text-green-600 mt-1">↑ 2.4% 较上月</div>
          </div>
          <div class="bg-white border border-gray-200 p-4 shadow-sm rounded">
            <div class="text-xs text-gray-500 uppercase">待审核</div>
            <div class="text-2xl font-mono font-bold text-orange-600">128</div>
            <div class="text-xs text-gray-400 mt-1">需在48小时内处理</div>
          </div>
          <div class="bg-white border border-gray-200 p-4 shadow-sm rounded">
            <div class="text-xs text-gray-500 uppercase">存储空间</div>
            <div class="text-2xl font-mono font-bold text-gray-800">64.2%</div>
            <div class="text-xs text-blue-600 mt-1">当前使用 1.2TB</div>
          </div>
          <div class="bg-white border border-gray-200 p-4 shadow-sm rounded">
            <div class="text-xs text-gray-500 uppercase">本月借阅次数</div>
            <div class="text-2xl font-mono font-bold text-gray-800">1,024</div>
            <div class="text-xs text-gray-400 mt-1">日均 34.1 次</div>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="bg-white border border-gray-200 p-3 flex items-center justify-between shadow-sm rounded">
          <div class="flex space-x-3 items-center">
            <select class="text-xs border-gray-300 border rounded p-1">
              <option>会计期间: 2023-Q4</option>
            </select>
            <select class="text-xs border-gray-300 border rounded p-1">
              <option>档案类别: 凭证</option>
            </select>
            <select class="text-xs border-gray-300 border rounded p-1">
              <option>保存期限: 永久</option>
            </select>
            <button class="bg-blue-600 text-white text-xs px-4 py-1.5 rounded font-medium hover:bg-blue-700">执行查询</button>
          </div>
          <div class="flex space-x-2">
            <button class="text-xs border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50">导出 Excel</button>
            <button class="text-xs border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50">打印表单</button>
          </div>
        </div>

        <!-- Data Grid Area -->
        <div class="bg-white border border-gray-200 flex-1 overflow-hidden shadow-sm flex flex-col rounded">
          <table class="w-full text-xs text-left">
            <thead class="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase">
              <tr>
                <th class="p-3">档案编号</th>
                <th class="p-3">日期</th>
                <th class="p-3">凭证字号</th>
                <th class="p-3">摘要</th>
                <th class="p-3 text-right">借方金额 (CNY)</th>
                <th class="p-3 text-right">贷方金额 (CNY)</th>
                <th class="p-3 text-center">状态</th>
                <th class="p-3">经办人</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 overflow-y-auto">
              <tr class="hover:bg-blue-50 transition-colors cursor-pointer">
                <td class="p-3 font-mono font-bold">AR-20231201-001</td>
                <td class="p-3">2023-12-01</td>
                <td class="p-3">记-00124</td>
                <td class="p-3 truncate max-w-[200px]">购进办公设备一批及相关配件支付费用</td>
                <td class="p-3 text-right font-mono">12,500.00</td>
                <td class="p-3 text-right font-mono">0.00</td>
                <td class="p-3 text-center"><span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">已归档</span></td>
                <td class="p-3">张三</td>
              </tr>
              <tr class="hover:bg-blue-50 transition-colors cursor-pointer">
                <td class="p-3 font-mono font-bold">AR-20231201-002</td>
                <td class="p-3">2023-12-01</td>
                <td class="p-3">转-00045</td>
                <td class="p-3 truncate max-w-[200px]">结转销售成本 (Q4周期首批次)</td>
                <td class="p-3 text-right font-mono">450,230.50</td>
                <td class="p-3 text-right font-mono">450,230.50</td>
                <td class="p-3 text-center"><span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">已归档</span></td>
                <td class="p-3">李红</td>
              </tr>
              <tr class="bg-orange-50 hover:bg-orange-100 transition-colors cursor-pointer">
                <td class="p-3 font-mono font-bold">AR-20231202-014</td>
                <td class="p-3">2023-12-02</td>
                <td class="p-3">现-00003</td>
                <td class="p-3 truncate max-w-[200px]">预付租金及押金支付</td>
                <td class="p-3 text-right font-mono">80,000.00</td>
                <td class="p-3 text-right font-mono">0.00</td>
                <td class="p-3 text-center"><span class="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[10px] font-bold">待复核</span></td>
                <td class="p-3">王五</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
// Logic here
</script>
