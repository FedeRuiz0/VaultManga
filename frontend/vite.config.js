import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://mangavault_api:3001", // apuntando al contenedor backend
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/api/v1") // agrega /v1 solo una vez
      }
    }
  }
});