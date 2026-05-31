import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 5000,
      host: '0.0.0.0',
      // HMR configuration for Coze environment
      hmr: {
        port: 6000,
        path: '/hot/vite-hmr',
      },
    },
  };
});
