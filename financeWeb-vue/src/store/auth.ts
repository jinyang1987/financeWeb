import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const isLoggedIn = ref(localStorage.getItem('auth_loggedIn') === 'true');
  const loggedUser = ref(localStorage.getItem('auth_user') || '');

  function login(username: string): void {
    isLoggedIn.value = true;
    loggedUser.value = username;
    localStorage.setItem('auth_loggedIn', 'true');
    localStorage.setItem('auth_user', username);
  }

  function logout(): void {
    isLoggedIn.value = false;
    loggedUser.value = '';
    localStorage.removeItem('auth_loggedIn');
    localStorage.removeItem('auth_user');
  }

  return { isLoggedIn, loggedUser, login, logout };
});
