import { defaultCache } from '@serwist/next/worker';
import { CacheFirst, ExpirationPlugin, Serwist } from 'serwist';
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const DAY = 60 * 60 * 24;

/**
 * 장소 사진과 지도 타일.
 *
 * 둘 다 한 번 받으면 내용이 바뀌지 않는 정적 자원이라 CacheFirst 로 두고,
 * 개수와 기간으로만 정리한다. 사진 328장(20MB)을 프리캐시에 넣지 않는 이유도 같다 —
 * 첫 방문에 전부 받게 하는 대신 본 것만 남긴다.
 */
const mediaCache: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/images/places/'),
    handler: new CacheFirst({
      cacheName: 'place-images',
      plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 30 * DAY })],
    }),
  },
  {
    matcher: ({ url }) => url.hostname === 'tile.openstreetmap.org',
    handler: new CacheFirst({
      cacheName: 'osm-tiles',
      plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 7 * DAY })],
    }),
  },
  {
    // CARTO API 키가 있을 때 쓰는 타일. src/lib/mapTiles.ts 참고.
    matcher: ({ url }) => url.hostname.endsWith('basemaps.cartocdn.com'),
    handler: new CacheFirst({
      cacheName: 'carto-tiles',
      plugins: [new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 7 * DAY })],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // 우리 규칙을 먼저 본다. 뒤의 defaultCache 에 이미지 전체를 받는 규칙이 있어서,
  // 순서가 바뀌면 장소 사진이 place-images 캐시로 가지 않는다.
  runtimeCaching: [...mediaCache, ...defaultCache],
  fallbacks: {
    entries: [
      {
        // 프리캐시에 없는 주소로 오프라인 진입했을 때. 라우트는 전부 프리캐시돼 있으므로
        // 실제로는 없는 주소를 입력한 경우에만 걸린다.
        url: '/404.html',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
