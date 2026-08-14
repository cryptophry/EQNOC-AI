import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        // In dev, /api is served by dev-api.mjs (npm run dev:api).
        // In production, Vercel serves api/*.js at the same path.
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null, // registered from index.tsx so CSP can stay script-src 'self'
        includeAssets: ['apple-touch-icon.png'],
        manifest: {
          name: 'Tech Assistant',
          short_name: 'Tech',
          description: 'AI assistant for EQNOC network operations and field telecom crews.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#080e16',
          theme_color: '#080e16',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // Never let the service worker cache the API — auth and AI calls must
          // always hit the network. The app shell is precached for offline load.
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            { urlPattern: /^\/api\//, handler: 'NetworkOnly' },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
