import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4747,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3850',
        changeOrigin: true,
      },
    },
  },
});
