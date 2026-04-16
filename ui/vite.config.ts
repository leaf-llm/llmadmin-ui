import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/public/admin/',
  build: {
    outDir: '../build/public/admin',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // In local-dev mode, forward admin API calls to the gateway.
      '/admin': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
