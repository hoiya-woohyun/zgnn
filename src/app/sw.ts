import { defaultCache } from '@serwist/next/worker';
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, Serwist, StaleWhileRevalidate } from 'serwist';
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const DAY = 60 * 60 * 24;

/**
 * 장소 사진과 지도 타일·SDK.
 *
 * 사진과 타일은 한 번 받으면 내용이 바뀌지 않는 정적 자원이라 CacheFirst 로 두고,
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
    /*
     * Kakao 지도 타일(mts)과 SDK 가 쓰는 스프라이트·아이콘(t1).
     *
     * `statuses: [0, 200]` 이 **필수**다. 타일은 SDK 가 만든 `<img>` 가 `crossorigin` 없이
     * 받아 오므로 응답이 opaque(status 0)로 온다. CacheFirst 는 기본으로 200 만 저장해서,
     * 이 줄이 없으면 규칙이 붙어 있어도 캐시가 아예 만들어지지 않는다 —
     * 옛 OSM/CARTO 규칙이 그 상태였다(2026-09-17 에 확인).
     *
     * maxEntries 가 500 이 아니라 200 인 이유: opaque 응답은 브라우저가 용량을 실제보다
     * 크게 잡아(패딩) 할당량을 먹는다. 너무 많이 쌓으면 프리캐시까지 통째로 밀려날 수 있다.
     * 200 이면 읍면 한두 곳을 몇 단계 확대로 본 만큼은 남는다.
     */
    matcher: ({ url }) => url.hostname.endsWith('.daumcdn.net'),
    handler: new CacheFirst({
      cacheName: 'kakao-map-tiles',
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * DAY }),
      ],
    }),
  },
  {
    /*
     * Kakao 지도 SDK 스크립트.
     *
     * 이 앱에서 유일하게 **런타임에 받아야 하는 외부 코드**다(글꼴·아이콘은 전부 self-host).
     * 캐시가 없으면 비행기 모드에서 지도 화면이 통째로 빈다 — 타일을 받아 뒀어도 그리는
     * 코드가 없기 때문이다. 그래서 여기만은 반드시 캐시에 남긴다.
     *
     * CacheFirst 가 아니라 StaleWhileRevalidate 인 이유: 이건 우리가 버전을 못 정하는
     * 남의 코드라, 오래된 사본에 못 박히면 SDK 가 바뀔 때 조용히 깨진다.
     * 온라인이면 뒤에서 새로 받아 두고, 오프라인이면 마지막 사본으로 지도를 띄운다.
     */
    matcher: ({ url }) => url.hostname === 'dapi.kakao.com',
    handler: new StaleWhileRevalidate({
      cacheName: 'kakao-map-sdk',
      plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 30 * DAY })],
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
