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
  precacheOptions: {
    /*
     * 프리캐시를 뒤질 때 무시할 검색 파라미터.
     *
     * 기본값은 `utm_` 과 `fbclid` 뿐이라, 저장 화면의 "지도에서 보기"(`/map/?saved=1`)로
     * 오프라인에서 하드 내비게이션이 일어나면 `/map/` 항목을 못 찾고 404 로 떨어진다.
     * 기본값을 덮어쓰는 옵션이라 `saved` 만 적으면 안 되고 셋을 함께 적는다.
     *
     * RSC 페이로드가 붙이는 `_rsc` 는 일부러 넣지 않는다. 넣으면 페이로드를 받으러 간
     * fetch 가 HTML 을 돌려받는다.
     */
    ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^saved$/],
  },
  skipWaiting: true,
  clientsClaim: true,
  /*
   * 내비게이션 프리로드는 끈다. 화면 주소가 모두 프리캐시에 있어 캐시가 먼저 응답하므로,
   * 프리로드로 미리 보낸 요청은 그대로 버려진다 — 네트워크만 쓰고 쓰이지 않는다.
   */
  navigationPreload: false,
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
