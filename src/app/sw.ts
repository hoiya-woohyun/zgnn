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
     * 네이버 지도 타일과 스타일 매니페스트.
     *
     * ⚠️ **호스트가 페이지 프로토콜에 따라 갈린다** — 2026-09-23 실측으로 알아낸 함정이다.
     *   HTTPS 페이지 → `https://nrbe.pstatic.net/styles/basic/<버전>/<z>/<x>/<y>@2x.png?mt=…`
     *   HTTP  페이지 → `http://nrbe.map.naver.net/styles/basic/<버전>/<z>/<x>/<y>.png?mt=…`
     * 즉 `localhost:7727`(HTTP)에서 보이는 호스트와 `zgnn.vercel.app`(HTTPS)에서 보이는 호스트가 **다르다.**
     * 한쪽만 적으면 그쪽에서만 캐시가 차고 다른 쪽은 조용히 비어 있다 — 규칙이 있다는 것과
     * 동작한다는 것이 다른, 이 파일에서 두 번째로 겪는 자리다(옛 OSM/CARTO 의 statuses 와 같은 꼴).
     * 스타일 매니페스트(`/styles/basic.json?…&callback=…`, JSONP)도 같은 호스트로 온다.
     * Kakao 의 `*.daumcdn.net` 자리다.
     *
     * `statuses: [0, 200]` 이 **필수**다. 타일은 SDK 가 만든 `<img>` 가 `crossorigin` 없이
     * 받아 오므로 응답이 opaque(status 0)로 온다. CacheFirst 는 기본으로 200 만 저장해서,
     * 이 줄이 없으면 규칙이 붙어 있어도 캐시가 아예 만들어지지 않는다 —
     * 옛 OSM/CARTO 규칙이 그 상태였다(2026-09-17 에 확인).
     *
     * maxEntries 가 500 이 아니라 200 인 이유: opaque 응답은 브라우저가 용량을 실제보다
     * 크게 잡아(패딩) 할당량을 먹는다. 너무 많이 쌓으면 프리캐시까지 통째로 밀려날 수 있다.
     */
    matcher: ({ url }) => url.hostname === 'nrbe.pstatic.net' || url.hostname === 'nrbe.map.naver.net',
    handler: new CacheFirst({
      cacheName: 'naver-map-tiles',
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * DAY }),
      ],
    }),
  },
  {
    /*
     * SDK 가 쓰는 정적 자원 — 로고·스케일바 이미지와 커서(`openhand.cur`).
     *
     * Kakao 때는 타일과 같은 호스트(`*.daumcdn.net`)라 규칙 하나로 덮였는데, 네이버는 갈린다.
     * 빠뜨리면 오프라인에서 **로고만 안 뜨고**, 약관 제7조 ⑩ 이 요구하는 표시가 사라진 화면이 된다.
     *
     * 타일과 마찬가지로 **프로토콜에 따라 호스트가 갈린다**(실측):
     *   HTTPS → `ssl.pstatic.net/static/maps/mantle/2x/…` · HTTP → `static.naver.net/maps/mantle/1x/…`
     * `/maps/` 로 좁히는 이유: `ssl.pstatic.net` 은 지도와 무관한 것(광고 모듈 등)도 나르는 공용 호스트다.
     */
    matcher: ({ url }) =>
      (url.hostname === 'ssl.pstatic.net' || url.hostname === 'static.naver.net') &&
      url.pathname.includes('/maps/'),
    handler: new CacheFirst({
      cacheName: 'naver-map-assets',
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 30 * DAY }),
      ],
    }),
  },
  {
    /*
     * 네이버 지도 SDK 스크립트.
     *
     * 이 앱에서 유일하게 **런타임에 받아야 하는 외부 코드**다(글꼴·아이콘은 전부 self-host).
     *
     * ⚠️ **오프라인 동작은 아직 검증되지 않았다.** Kakao 와 달리 네이버 SDK 는 지도를 만들 때
     * `https://oapi.map.naver.com/v3/auth?ncpKeyId=…&url=…&time=<매번 다름>&callback=…` 을
     * 런타임에 부른다(실측). `time` 이 매번 달라 **URL 을 키로 쓰는 이 캐시가 그 요청은 절대
     * 맞출 수 없다.** 오프라인에서 그 호출이 실패할 때 SDK 가 지도를 그리는지 아닌지에 따라
     * 이 규칙 전체의 값어치가 갈린다 — 비행기 모드 실측 전까지 "오프라인에서 지도가 뜬다" 고
     * 문서에 쓰지 말 것(docs/todo/naver-migration-research.md §3).
     *
     * CacheFirst 가 아니라 StaleWhileRevalidate 인 이유: 이건 우리가 버전을 못 정하는
     * 남의 코드라, 오래된 사본에 못 박히면 SDK 가 바뀔 때 조용히 깨진다.
     *
     * ⚠️ **`/openapi/` 로 좁히는 것이 핵심이다.** 예전엔 이 호스트 전체를 걸고 "`/v3/auth` 는
     * 여기 걸려도 무해하다 — maxEntries 가 넘치면 오래된 것부터 밀려난다" 고 적어 뒀는데,
     * 그 문장이 스스로를 반박한다: LRU 에서 **가장 오래된 것이 바로 `maps.js`** 다(제일 먼저
     * 받으니까). `time` 이 매번 달라 auth 요청은 호출마다 새 엔트리이고, 같은 호스트의
     * `maps.js`·서브모듈과 상한을 나눠 쓴다(조사 문서 실측: 이 호스트에 지도 1개당 18 요청).
     * 그래서 `/map` 을 반복해 열면 auth 가 쌓여 **이 앱의 유일한 외부 코드 사본을 축출**하고,
     * 다음 오프라인 진입에서 타일이 있어도 지도가 통째로 빈다.
     * 경로가 정확히 갈린다 — SDK 는 `/openapi/v3/maps.js`(+ 서브모듈), auth 는 `/v3/auth`.
     */
    matcher: ({ url }) =>
      url.hostname === 'oapi.map.naver.com' && url.pathname.startsWith('/openapi/'),
    handler: new StaleWhileRevalidate({
      cacheName: 'naver-map-sdk',
      plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 30 * DAY })],
    }),
  },
  /*
   * 일부러 캐시하지 않는 것 — `kr-col-ext.nelo.navercorp.com`(네이버 로그 수집)과
   * `wcs.naver.net`·`wcs.naver.com`(애널리틱스). SDK 가 띄울 때마다 부르는 추적 요청이라
   * 우리가 사본을 남길 이유가 없다. 이 앱이 글꼴까지 self-host 해 런타임 외부 요청을 0 으로
   * 두려던 원칙(ADR-001)에서 네이버가 Kakao 보다 더 멀어지는 자리이기도 하다.
   */
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
