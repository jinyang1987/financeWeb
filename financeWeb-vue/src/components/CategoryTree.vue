<script setup lang="ts">
import { ref } from 'vue';
import { ChevronRight, FolderOpen, Folder, FileText } from 'lucide-vue-next';
import type { CategoryNode } from '@/types';

defineOptions({ name: 'CategoryTree' });

const props = defineProps<{
  treeData: CategoryNode[];
  selectedId?: string | number | null;
}>();

const emit = defineEmits<{
  (e: 'select', node: CategoryNode): void;
}>();

const expandedIds = ref<Set<string | number>>(new Set());

function toggleExpand(id: string | number): void {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

function handleSelect(node: CategoryNode): void {
  emit('select', node);
}
</script>

<template>
  <div class="text-[13px]">
    <template v-for="node in treeData" :key="node.id">
      <!-- Level 1 node (分类) -->
      <div class="flex items-center gap-1.5 min-h-[30px] px-2 cursor-pointer select-none transition-colors rounded-sm"
        :class="selectedId === node.id
          ? 'bg-white/5 text-gray-300'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-300'"
        @click="handleSelect(node)">
        <button v-if="node.children?.length"
          class="w-3 h-full flex items-center justify-center shrink-0 cursor-pointer"
          @click.stop="toggleExpand(node.id)">
          <ChevronRight class="w-[10px] h-[10px] text-gray-500 transition-transform duration-150" :class="expandedIds.has(node.id) ? 'rotate-90' : ''" />
        </button>
        <span v-else class="w-3 shrink-0" />
        <component :is="expandedIds.has(node.id) ? FolderOpen : Folder" class="w-3.5 h-3.5 shrink-0"
          :class="selectedId === node.id ? 'text-blue-300' : 'text-gray-500'"
        />
        <span class="truncate">{{ node.label }}</span>
      </div>

      <!-- Level 2 children (年份/项目) -->
      <template v-if="node.children?.length && expandedIds.has(node.id)">
        <div v-for="child in node.children" :key="child.id" class="ml-2 border-l border-gray-700/60 pl-1.5">
          <div class="flex items-center gap-1.5 min-h-[28px] px-2 cursor-pointer select-none transition-colors rounded-sm"
            :class="selectedId === child.id
              ? 'bg-white/5 text-gray-300'
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-300'"
            @click="handleSelect(child)">
            <button v-if="child.children?.length"
              class="w-3 h-full flex items-center justify-center shrink-0 cursor-pointer"
              @click.stop="toggleExpand(child.id)">
              <ChevronRight class="w-[10px] h-[10px] text-gray-500 transition-transform duration-150" :class="expandedIds.has(child.id) ? 'rotate-90' : ''" />
            </button>
            <span v-else class="w-3 shrink-0" />
            <Folder v-if="child.children?.length" class="w-3.5 h-3.5 shrink-0"
              :class="selectedId === child.id ? 'text-blue-300' : 'text-gray-500'" />
            <FileText v-else class="w-3.5 h-3.5 shrink-0 text-gray-500" />
            <span class="truncate">{{ child.label }}</span>
          </div>

          <!-- Level 3 grandchildren (月份) -->
          <template v-if="child.children?.length && expandedIds.has(child.id)">
            <div v-for="gc in child.children" :key="gc.id" class="ml-2 border-l border-gray-700/60 pl-1.5">
              <div class="flex items-center gap-1.5 min-h-[26px] px-2 cursor-pointer select-none transition-colors rounded-sm"
                :class="selectedId === gc.id
                  ? 'bg-white/5 text-gray-300'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-300'"
                @click="handleSelect(gc)">
                <span class="w-3 shrink-0" />
                <FileText class="w-3 h-3 shrink-0 text-gray-500" />
                <span class="truncate">{{ gc.label }}</span>
              </div>
            </div>
          </template>
        </div>
      </template>
    </template>

    <!-- Empty state -->
    <div v-if="treeData.length === 0" class="flex flex-col items-center justify-center py-5 text-gray-500">
      <FolderTree class="w-6 h-6 mb-1 opacity-40" />
      <span class="text-[11px]">暂无分类数据</span>
    </div>
  </div>
</template>
