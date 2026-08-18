import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5000,
      host: '0.0.0.0',
      // HMR configuration
      hmr: {
        path: '/hot/vite-hmr',
      },
      // Alfresco API 代理（解决 CORS 跨域问题）
      proxy: {
        '/api/proxy/alfresco': {
          target: 'http://localhost:8080/alfresco',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/proxy\/alfresco/, ''),
        },
        // ams-server 业务服务代理（会计档案业务 API，P0 起替代 mock/persist）
        '/api/ams': {
          target: 'http://localhost:8081',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/ams/, '/api'),
        },
      },
    },
  };
});
