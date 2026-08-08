<script setup lang="ts">
import { BarChart3, Database, Users, Archive } from 'lucide-vue-next';

defineOptions({ name: 'DashboardPage' });

const stats = [
  { label: '全宗总数', value: '3', icon: Database, from: 'from-blue-500', to: 'to-blue-600' },
  { label: '档案总数', value: '12', icon: Archive, from: 'from-indigo-500', to: 'to-indigo-600' },
  { label: '单位总数', value: '5', icon: Users, from: 'from-emerald-500', to: 'to-emerald-600' },
  { label: '归档批次', value: '28', icon: BarChart3, from: 'from-amber-500', to: 'to-amber-600' },
];
</script>

<template>
  <div class="h-full">
    <div class="mb-5">
      <h1 class="page-title">档案统计仪表盘</h1>
      <p class="text-xs text-gray-400 mt-1">系统整体运行数据概览</p>
    </div>

    <!-- Stat cards -->
    <div class="grid grid-cols-4 gap-4 mb-6">
      <div
        v-for="(stat, i) in stats"
        :key="stat.label"
        class="card p-4"
      >
        <div class="flex items-center gap-3 mb-3">
          <div
            :class="[`bg-gradient-to-br ${stat.from} ${stat.to}`, 'w-9 h-9 rounded-lg flex items-center justify-center']"
          >
            <component :is="stat.icon" class="w-5 h-5 text-white" />
          </div>
          <span class="text-xs text-gray-500 uppercase">{{ stat.label }}</span>
        </div>
        <div class="text-2xl font-mono font-bold text-gray-800 mb-1">{{ stat.value }}</div>
        <div class="text-xs text-gray-400">当前总计</div>
      </div>
    </div>

    <!-- Recent records -->
    <div class="card">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 class="text-xs font-semibold text-gray-700 flex items-center gap-2">
          <span class="w-1 h-3.5 rounded-full bg-gradient-to-b from-blue-500 to-indigo-500 inline-block"></span>
          最近归档记录
        </h3>
      </div>
      <div class="p-6 flex items-center justify-center min-h-[100px]">
        <p class="text-xs text-gray-400">档案记录将从 Alfresco 系统中加载...</p>
      </div>
    </div>
  </div>
</template>
