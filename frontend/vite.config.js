import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
      '/processed': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
