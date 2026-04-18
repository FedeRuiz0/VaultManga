import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devApiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: 'all',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: devApiProxyTarget,
        changeOrigin: true,
      }
    }
  }
});