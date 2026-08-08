import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
import path from 'path';

export default defineConfig({
  plugins: [vue(), UnoCSS()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5000,
    host: '0.0.0.0',
    proxy: {
      '/api/proxy/alfresco': {
        target: 'http://localhost:8080/alfresco',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/proxy\/alfresco/, ''),
      },
      '/api/directory-config': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
