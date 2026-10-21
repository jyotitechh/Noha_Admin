import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    /* `--mode offline` points the console at the in-memory API from
       `npm run dev:offline` (port 4300) instead of the real one, so the screens
       can be looked at without touching a developer's running server. */
    proxy: { '/api': { target: mode === 'offline' ? 'http://localhost:4300' : 'http://localhost:4000', changeOrigin: true } },
  },
}));
