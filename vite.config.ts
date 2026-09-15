import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const DAY = 60 * 60 * 24;

export default defineConfig({
  // Untitled UI 컴포넌트는 '@/utils/cx' 처럼 절대 경로로 서로를 참조한다.
  // tsconfig.json 의 paths 와 반드시 같은 값을 유지한다.
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // manifest 와 거기 적힌 아이콘은 플러그인이 알아서 precache 에 넣는다.
      // 여기 남길 것은 그 목록에 없는 apple-touch-icon 하나뿐이다.
      includeAssets: ['icons/icon-180.png'],
      manifest: {
        name: '강아지랑 제주',
        short_name: '강아지랑제주',
        description: '짱구누나가 직접 다녀온 반려견 동반 가능한 제주 숙소·식당·카페 안내',
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#2a2724',
        background_color: '#f6f1e7',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 장소 사진 328장(20MB)은 precache 에 넣지 않는다. 런타임 캐시로만 다룬다.
        // png·webmanifest 는 위 includeAssets 와 플러그인이 이미 넣는다 — 여기서 또 훑으면 중복된다.
        globPatterns: ['**/*.{js,css,html,svg}'],
        globIgnores: ['**/images/places/**'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /\/images\/places\/[^/]+\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'place-images',
              expiration: { maxEntries: 400, maxAgeSeconds: 30 * DAY },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/([a-z]\.)?basemaps\.cartocdn\.com\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'carto-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * DAY },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // CARTO API 키가 없을 때 쓰는 대체 타일. src/lib/mapTiles.ts 참고.
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * DAY },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
