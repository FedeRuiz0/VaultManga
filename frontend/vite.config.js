import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://mangavault_api:3001', // localDocker: http://mangavault_api:3001
        changeOrigin: true,
      }
    }
  }
});