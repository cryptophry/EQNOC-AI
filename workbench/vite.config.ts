import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Inline config stops Vite walking up to the parent app's Tailwind PostCSS config.
  css: { postcss: { plugins: [] } },
  server: { port: 5180, proxy: { '/api': { target: process.env.API_TARGET || 'http://localhost:3001', changeOrigin: true } } },
  build: { target: 'es2020', sourcemap: false },
});
