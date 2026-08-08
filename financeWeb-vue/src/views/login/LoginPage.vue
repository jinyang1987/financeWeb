<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';

defineOptions({ name: 'LoginPage' });

const router = useRouter();
const authStore = useAuthStore();
const username = ref('');
const password = ref('');
const loginError = ref('');

function handleLogin(): void {
  if (!username.value.trim()) {
    loginError.value = '请输入用户名';
    return;
  }
  authStore.login(username.value.trim());
  router.replace('/');
}
</script>

<template>
  <div class="h-screen w-screen flex items-center justify-center bg-[#F3F4F6]">
    <!-- Login card -->
    <div class="w-96 bg-white border border-gray-200 shadow-sm rounded p-8">
      <!-- Header -->
      <div class="text-center mb-7">
        <div class="w-12 h-12 mx-auto mb-4 rounded bg-blue-600 flex items-center justify-center">
          <span class="text-white text-lg font-bold">A</span>
        </div>
        <h1 class="text-xl font-bold text-[#111827]">会计档案管理系统</h1>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-600 mb-1">用户名</label>
          <input v-model="username" type="text" placeholder="admin"
            class="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-600 mb-1">密码</label>
          <input v-model="password" type="password" placeholder="&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;"
            class="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400" />
        </div>

        <div v-if="loginError"
          class="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {{ loginError }}
        </div>

        <button type="submit"
          class="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 transition-colors">
          登录
        </button>
      </form>

      <p class="text-center text-xs text-gray-400 mt-8">&copy; 2026 会计档案管理系统</p>
    </div>
  </div>
</template>
