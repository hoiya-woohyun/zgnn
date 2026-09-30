# PWA · 서비스워커 · 오프라인

> 최종 수정: 2026-09-29 (v7: **Supabase 호스트에 `NetworkOnly` 를 `defaultCache` 앞에 둔다** — `defaultCache` 끝의 cross-origin catch-all 이 REST **GET** 을 1시간 캐시해
> 운영자 검수 화면의 후보 목록이 묵고 로그아웃 뒤에도 사본이 남는다. 그리고 **`/admin` 은 프리캐시에 넣지 않았다**(의도 — 오프라인에서는 `/404.html`) → [ADR-018](../decisions/ADR-018-in-app-admin-review.md))
> 이전 (v6: 로고·자원 호스트 줄의 `1x`/`2x` 서술을 고친다 — 프로토콜이 아니라 **기기 픽셀 비율**이 정하는 값이다(프로덕션 HTTPS 에서 `1x` 실측). 호스트가 프로토콜을 따른다는 쪽은 그대로 맞다)
> 이전 (v5: SDK 캐시 규칙을 `oapi.map.naver.com` **호스트 전체 → `/openapi/` 경로만** 으로 좁혔다. 호스트 전체면 매번 URL 이 다른 `/v3/auth` 가 상한을 채워 LRU 가 `maps.js` 를 축출한다 — self-cr 지적)
> 이전 (v4: 지도 제공자를 네이버로 바꾸며 런타임 캐시 규칙을 호스트 3개로. **"한 번 본 지역은 오프라인에서도 보인다" 는 서술을 미검증으로 내렸다** — 네이버 SDK 의 런타임 인증 호출 때문. ADR-008 v4)
> 최종 수정: 2026-09-16 (v3: 설정 탭 `/settings/` 와 그 안의 `/dog/` 를 프리캐시 라우트에 추가 — 95개)
> 최종 수정: 2026-09-16 (v2: public/images/ 도 프리캐시 대상에 추가 — 작성자 초상)
> 최종 수정: 2026-09-15 (v1: 신설)

## 개요

스토어 배포 없이 "홈 화면에 추가" 로 앱처럼 쓰는 것이 목표다(→ [ADR-001](../decisions/ADR-001-pwa-static-export.md)).
서비스워커는 `@serwist/next` 가 만들고, 손으로 쓰는 것은 `src/app/sw.ts` 하나다.

```
src/app/sw.ts ──(next build --webpack)──▶ public/sw.js ──▶ out/sw.js
next.config.mjs: additionalPrecacheEntries (라우트 HTML 93개 + 매니페스트 + 아이콘 4 + 404)
```

## 빌드는 webpack, dev 는 Turbopack

- `@serwist/next` 는 webpack 플러그인이라 `build` 에 `--webpack` 이 **필수**다. 빼면 빌드는 통과하지만 `sw.js` 가 안 생겨 PWA 가 조용히 사라진다.
- `dev` 는 `--turbopack`. 개발 모드에서는 플러그인이 `disable: true` 라 서비스워커를 만들지 않으므로 webpack 을 쓸 이유가 없다.
  플래그를 명시하는 이유는 Next 16 이 "webpack 설정은 있는데 turbopack 설정이 없다" 며 멈추기 때문이다.

## 프리캐시 목록을 직접 만드는 이유

정적 내보내기의 HTML 은 webpack 자산이 아니라 컴파일 뒤 따로 쓰인다. 그냥 두면 매니페스트에 JS·CSS 만 들어오고 화면 주소가 하나도 안 들어온다.
그래서 `next.config.mjs` 가 `places.json` 에서 라우트 95개(홈·지도·준비물·설정·저장·강아지 등록·종류 3·장소 86)를 만들어 `additionalPrecacheEntries` 로 넣는다.

- **주의**: `additionalPrecacheEntries` 를 주면 플러그인은 `public/` 을 훑는 자기 동작을 **건너뛴다**. 둘은 더해지지 않는다. 그래서 `public/icons/`·`public/images/`(작성자 초상)·404·매니페스트도 직접 넣는다. `public/` 에 디렉터리를 새로 만들면 `next.config.mjs` 의 `publicEntries` 목록에도 더해야 한다 — 빼먹으면 온라인에선 보이고 오프라인에서만 조용히 빠진다.
- **`/admin/` 은 이 목록에 일부러 없다.** 운영자 검수 화면은 DB 를 읽어야 성립하므로 오프라인에 의미가 없고, 넣으면 비행기에서 빈 화면이 뜬다.
  프리캐시에 없는 주소라 오프라인에서 열면 아래 「문서 요청 실패」 규칙이 `/404.html` 을 준다 — **그게 의도한 결과다**(→ [ADR-018](../decisions/ADR-018-in-app-admin-review.md)).
- 라우트 HTML 은 파일명에 해시가 없어 `revision` 이 필요하다. `src/` 전체와 `package.json`, `pnpm-lock.yaml` 을 해싱한 값을 쓴다. 코드가 바뀌면 전부 갱신되는 보수적 전략이다.

## 런타임 캐시 (`src/app/sw.ts`)

| 대상 | 전략 | 이유 |
|---|---|---|
| `/images/places/*` | CacheFirst + 만료 | 있어도 용량이 커서 프리캐시에 넣지 않는다. 지금은 이미지가 없어 사실상 비활성 |
| `nrbe.pstatic.net` | CacheFirst + `statuses: [0, 200]` + 만료 | 네이버 지도 타일과 스타일 매니페스트(호스트는 2026-09-23 실측). **`statuses: [0,200]` 이 빠지면 조용히 아무것도 캐시되지 않는다** — 타일은 `crossorigin` 없는 `<img>` 라 응답이 opaque(status 0)이고 CacheFirst 는 기본으로 200 만 저장한다. 옛 OSM/CARTO 규칙이 그 상태였다. opaque 응답은 할당량을 패딩해 먹으므로 `maxEntries` 는 200 으로 묶어 둔다 |
| `ssl.pstatic.net` | CacheFirst + `statuses: [0, 200]` + 만료 | 네이버 로고·스케일바·커서. Kakao 때는 타일과 같은 호스트라 규칙 하나로 덮였는데 네이버는 갈린다 — 빠뜨리면 오프라인에서 **로고만 안 뜬다**(약관 제7조 ⑩ 이 요구하는 표시다).<br>호스트는 프로토콜을 따르지만(HTTPS → `ssl.pstatic.net` · HTTP → `static.naver.net`), 경로의 `1x`/`2x` 는 **기기 픽셀 비율**이 정한다 — 2026-09-28 HTTPS 프로덕션에서 `1x` 로 왔다. 매처가 `/maps/` 로만 좁혀 어느 쪽이든 걸린다 |
| `oapi.map.naver.com` **의 `/openapi/` 만** | StaleWhileRevalidate + 만료 | 네이버 지도 SDK(`/openapi/v3/maps.js` + 서브모듈). **이 앱에서 유일하게 런타임에 받는 외부 코드**라 캐시가 없으면 지도 화면이 통째로 빈다(타일이 있어도 그릴 코드가 없다). 우리가 버전을 못 정하는 남의 코드여서 CacheFirst 로 못 박지 않는다.<br>⚠️ **경로를 `/openapi/` 로 좁히는 것이 핵심이다.** 호스트 전체를 걸면 `/v3/auth` 가 같이 걸리는데, `time` 이 매번 달라 **호출마다 새 엔트리**가 되어 `maxEntries` 를 채우고 LRU 가 가장 오래된 것 — 즉 제일 먼저 받은 `maps.js` — 를 축출한다. 그러면 다음 오프라인 진입에서 타일이 있어도 지도가 빈다. 경로가 정확히 갈리므로(`/openapi/v3/maps.js` vs `/v3/auth`) 좁히는 것으로 닫힌다.<br>⚠️ **오프라인에서 지도가 뜨는지는 여전히 미검증이다.** SDK 가 지도를 만들 때 `/v3/auth?…&time=<매번 다름>` 을 런타임에 부르는데(실측) `time` 때문에 URL 캐시가 그 요청을 맞출 수 없다. 비행기 모드 실측 전까지 "오프라인에서 지도가 보인다" 고 쓰지 않는다 (→ [ADR-008](../decisions/ADR-008-map-provider.md)).<br>덧: 규칙에서 뺐다고 `/v3/auth` 가 캐시에서 사라지는 건 아니다 — `defaultCache` 의 cross-origin catch-all(`NetworkFirst`·32칸·1시간)이 받는다. 적중이 사실상 없어 무해하고, 좁혀서 얻는 것은 `maps.js` 가 상한을 안 나눠 쓰는 것 하나다 |
| `*.nelo.navercorp.com` · `wcs.naver.*` | **캐시 안 함** | 네이버 로그 수집·애널리틱스. SDK 가 띄울 때마다 부르는 추적 요청이라 사본을 남기지 않는다 |
| `<PROJECT_REF>.supabase.co` (**우리 호스트 하나만**) | **NetworkOnly** | 운영자 검수 화면(`/admin`)이 부르는 PostgREST·Auth. 와일드카드(`endsWith('.supabase.co')`)로 쓰지 않는다 — 그 조각이 번들에 남으면 좁힌 유출 검사(`scripts/check-bundle.mjs`)가 "우리 호스트가 아닌 supabase.co" 로 잡아 빌드를 멈춘다(실제로 멈췄다). 우리가 부르는 호스트는 하나뿐이라 `PROJECT_URL` 리터럴에서 뽑아 정확히 그것만 본다. **이 규칙은 `...defaultCache` 보다 앞에 있어야 한다** — `@serwist/next` 의 `defaultCache` 끝에 cross-origin catch-all(`NetworkFirst`·32칸·1시간)이 있어서, 없으면 REST **GET** 이 URL 로 1시간 캐시된다. `Authorization` 헤더는 캐시 키에 들어가지 않으므로 ① 승인한 뒤에도 후보 목록이 옛것으로 보이고 ② **로그아웃한 뒤에도 후보 사본이 브라우저에 남는다**. 둘 다 조용한 고장이다 — 화면은 정상으로 보인다(→ [ADR-018](../decisions/ADR-018-in-app-admin-review.md)) |
| 그 외 | serwist `defaultCache` | |
| 문서 요청 실패 | `/404.html` 폴백 | 오프라인에서 프리캐시에 없는 주소를 열었을 때 빈 화면 대신 404 |

## 매니페스트와 아이콘

- `src/app/manifest.ts`: `theme_color` 는 잉크 `#2e2327`, `background_color` 는 크림 `#faf8f4`. `layout.tsx` 의 `themeColor` 와 같은 값이어야 한다.
- 아이콘은 `scripts/make-icons.mjs` 가 SVG(잉크 둥근 사각 + brand-300 발자국)를 sharp 로 PNG 4장으로 만든다. 팔레트가 바뀔 때만 `pnpm icons`.
  maskable 은 기기가 바깥을 잘라내므로 발자국을 안쪽으로 모은다.

## 글꼴 self-host

본문 글꼴(Pretendard 서브셋 `Zgnn Sans`)은 CDN 이 아니라 번들에 넣는다 — 오프라인에서도 같은 글꼴로 떠야 하기
때문이다(근거: [ADR-006](../decisions/ADR-006-responsive-scale-and-font.md)). `next/font/local` 이
`src/app/layout.tsx` 에서 읽어 `_next/static/media/*.woff2` 로 굽고, serwist 가 그 파일을 빌드 산출물로
인식해 **프리캐시 목록에 자동으로 넣는다**(`additionalPrecacheEntries` 에 손으로 적을 필요 없다.
아이콘·이미지와 다른 점 — 그쪽은 `public/` 이라 직접 넣어야 한다).

원본은 굵기당 766KB 라 서브셋해서 쓴다. 다시 만들 일이 생기면:

```bash
# 1) 원본 (npm 배포본 — jsdelivr 가 막힌 환경에서도 npm 레지스트리는 된다)
npm pack pretendard@1.3.9 && tar xzf pretendard-1.3.9.tgz   # → package/dist/web/static/woff2/

# 2) 서브셋 + woff2 (fonttools 필요: pip install fonttools brotli). SemiBold 도 같은 식으로.
pyftsubset package/dist/web/static/woff2/Pretendard-Regular.woff2 --output-file=ZgnnSans-Regular.woff2 --flavor=woff2 --layout-features='*' \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2010-2027,U+2030-205E,U+20A9,U+2192,U+AC00-D7A3,U+1100-11FF,U+3130-318F,U+3000-303F,U+FF00-FFEF"

# 3) 이름 바꾸기 — Pretendard 는 OFL 예약 글꼴 이름이라 파생본이 그 이름을 쓰면 안 된다
python3 -c "
from fontTools.ttLib import TTFont; import sys
w=sys.argv[1]; f=TTFont(f'ZgnnSans-{w}.woff2')
for r in f['name'].names:
    if r.nameID in (1,16): r.string='Zgnn Sans'
    elif r.nameID==4: r.string=f'Zgnn Sans {w}'
    elif r.nameID in (3,6): r.string=f'ZgnnSans-{w}'
f['name'].setName('Subset of Pretendard 1.3.9 (Hangul syllables + Latin), renamed per the SIL OFL Reserved Font Name clause.',10,3,1,0x409)
f.flavor='woff2'; f.save(f'src/app/fonts/ZgnnSans-{w}.woff2')" Regular
```

굵기당 약 620KB 가 나온다(힌팅을 빼도 거의 안 준다 — 용량은 윤곽 자체다). 한글 완성형(U+AC00-D7A3) 11,172자를
통째로 넣는 이유와 굵기를 400·600 둘로 제한한 이유는 ADR-006 에 있다.

## 확인 방법

`pnpm build && pnpm preview` 로 `out/` 을 띄우고, DevTools → Application 에서 `sw.js` 등록과 프리캐시 개수(최근 150개)를 본다.
`pnpm dev` 에서는 서비스워커가 없으므로 오프라인 동작은 반드시 빌드본으로 본다.

## 관련 파일

`src/app/sw.ts`, `next.config.mjs`, `src/app/manifest.ts`, `src/app/layout.tsx`, `src/app/fonts/`, `scripts/make-icons.mjs`, `public/icons/`, `public/images/`
