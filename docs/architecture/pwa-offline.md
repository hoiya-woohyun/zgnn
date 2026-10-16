# PWA · 서비스워커 · 오프라인

> 최종 수정: 2026-10-16 (v15: 글꼴 Core/Ext 경계를 한 파서가 읽는다 — 로컬 테스트(`appSansExt.test.ts`)가 check-bundle 의 `extRangeBlocks`·`inRanges` 를 가져다 쓴다(14 W261010.33t))
> 이전 2026-10-16 (v14: **그 한 줄을 빌드가 지킨다** — `check-bundle.mjs` 가 `out/sw.js` 의 `/_next/static/` 프리캐시 revision 이 전부 null 인지 대 보고 아니면 실패. 데이터 글자가 Core 밖으로 나가면 경고만(14 W261010.33o))
> 이전 2026-10-16 (v13: **본문 글꼴을 두 조각으로, `_next/static/` 엔 revision 없이** — 첫 방문이 글꼴을 두 번(프리로드 + 서비스워커 `cache: 'reload'`) 받아 2.46MB 였다. Core 만 프리로드하고 Ext 는 unicode-range, 둘 다 프리캐시(ADR-006 v7 · 14 W261010.33m))
> 이전 2026-10-07 (v12: **관례 경로 아이콘** — `public/favicon.ico`·`apple-touch-icon.png` 를 `pnpm icons` 가 함께 만든다. 링크를 안 읽는 클라이언트의 404 잡음만 없앤다, 프리캐시엔 안 넣는다([todo/08](../todo/08-usability-and-process-plan.md) T5.9))
> 이전 2026-10-07 (v11: **인앱 브라우저에선 침묵 대신 바깥 브라우저로 여는 길** — 카카오톡은 `kakaotalk://web/openExternal` 한 줄, 다른 앱은 ··· 메뉴 두 단계(`installGuideKind` 의 `inApp`, 07 U9 후속))
> 이전 2026-10-07 (v10: **설치 안내** — 두 번째 방문부터 홈 하단 한 줄. 설치 신호가 있으면 설치 창, iOS 는 공유 → 홈 화면에 추가 두 단계, 인앱 브라우저·신호 없는 Android 는 아무 말도 안 한다([todo/07](../todo/07-product-and-ux.md) U9))
> 이전 2026-10-02 (v9: **새 버전 알림과 청크 복구** — `controllerchange` 에 "새 정보가 있어요 · 새로고침"(첫 설치 제외), 동적 청크를 못 받으면 배포당 한 번만 새로고침([todo/12](../todo/12-ux-audit-2026-10-02.md) U2.4))
> 이전 2026-10-01 (v8: 라우트 `revision` 에 **배포 식별자**(`NEXT_PUBLIC_APP_BUILD`, 커밋 앞 7자)도 넣는다 — 제보가 싣는 그 값이 번들에 박혀 문서만 바뀐 커밋에서도 청크 이름이 바뀌기 때문. 사용자 제보의 insert 는 Supabase 호스트라 `NetworkOnly` 그대로 — 오프라인이면 실패를 말한다)
> 이전 2026-09-29 (v7: **Supabase 호스트에 `NetworkOnly` 를 `defaultCache` 앞에 둔다** — `defaultCache` 끝의 cross-origin catch-all 이 REST **GET** 을 1시간 캐시해
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
- 라우트 HTML 은 파일명에 해시가 없어 `revision` 이 필요하다. `src/` 전체와 `package.json`, `pnpm-lock.yaml`, `next.config.mjs`, 배포 식별자(`NEXT_PUBLIC_APP_BUILD`)를 해싱한 값을 쓴다. 배포 식별자는 번들에 박히는 값이라 빼면 문서만 바뀐 커밋에서 청크 이름만 바뀌고 revision 은 그대로 남는다. 코드가 바뀌면 전부 갱신되는 보수적 전략이다.

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

## 새 버전이 깔릴 때 — 알림과 청크 복구

서비스워커는 `skipWaiting` · `clientsClaim` 이라 새 배포를 받는 즉시 열린 화면을 맡는다. 그런데 **이미 그려진 화면은 옛 번들·옛 데이터 그대로**다 —
iOS 홈 화면 앱은 며칠씩 열려 있다. 그리고 그 세션에서 처음 여는 동적 청크(`/map`·`/admin`)는 옛 이름으로 요청되는데, 새 서비스워커의 프리캐시엔 그 이름이 없다.

- **알림** — 셸의 `AppShellUpdateNotice` 가 `controllerchange` 를 받아 "새 정보가 있어요 · 새로고침"(셸 토스트, 10초). 새로고침을 강요하지 않는다(폼을 쓰던 사람이 있다).
  **첫 설치는 알리지 않는다** — `clientsClaim` 때문에 첫 방문에도 `controllerchange` 가 오지만 바뀐 것이 없다. 마운트 때 이미 맡은 서비스워커가 있었을 때만 알린다.
- **청크 복구** — 동적 import 에 `recoverFromChunkError`(`src/lib/appUpdate.ts`)를 건다. 청크 오류면 **한 번만** 새로고침하고, 두 번째는 그대로 던져 에러 경계가 받는다.
  진짜 오프라인이거나 파일이 정말 없으면 새로고침해도 같은 실패라, 세지 않으면 무한히 다시 읽는다. 표시는 `sessionStorage` 에 **배포 식별자**(`NEXT_PUBLIC_APP_BUILD`)로 남겨
  다음 배포에서 다시 한 번 허용한다. 저장소를 못 쓰면 새로고침하지 않는다(셀 수 없다).
- dev 에서는 서비스워커가 꺼져 있어 둘 다 볼 수 없다 — `pnpm build` 산출물로 확인한다.

## 설치 안내 — 홈 하단 한 줄 (07 U9)

오프라인이 이 앱의 약속인데 그 약속은 홈 화면에 추가해야 쓸 만해진다. 그런데 설치를 권하는 곳이 없었다. 홈 맨 아래, 인사말 줄 밑에
"홈 화면에 추가하기" 한 줄(`HomePageInstall`)을 둔다. 띄울지와 어떤 길인지는 순수 함수 `installGuideKind`(`src/lib/installGuide.ts`)가 정한다.

| 상황 | 결과 | 왜 |
|---|---|---|
| 첫 방문(`visitCount` ≤ 1) · 이미 홈 화면 앱(standalone) | 없음 | 첫 화면은 인사·등록이 먼저다. 신호는 홈 인사말 접기와 같은 `visitCount` |
| 카톡·네이버·인스타·페북·라인 인앱 브라우저 | **바깥 브라우저로 열기**(`inApp`) — 카카오톡은 누르면 바로(`openExternalUrl`), 나머지는 펼치면 ··· 메뉴 → 다른 브라우저(iOS 는 Safari)로 열기 두 단계 | 그 웹뷰에는 "홈 화면에 추가" 메뉴가 없고 저장소도 따로다 — 카톡 공유로 들어오는 길이 가장 흔하다. 예전엔 침묵했는데, 설치를 못 권해도 **갈 곳**은 말할 수 있다(07 U9 후속). 넘기는 주소는 지금 주소 그대로라 공유받은 목록(`?ids=`)도 따라간다 |
| 브라우저가 설치 신호(`beforeinstallprompt`)를 줬다 | 누르면 설치 창 | Android Chrome·데스크톱 Chrome/Edge |
| iPhone · iPadOS(UA 가 `Macintosh` + 터치) | 펼치면 공유 → 홈 화면에 추가 두 단계 | iOS 는 설치 창 API 가 없어 사용자가 방법을 알아야 한다 |
| 그 밖(신호 없는 Android, 데스크톱 Safari·Firefox) | 없음 | 무엇을 누르라고 구체적으로 말할 수 없다. 신호 없는 Android 는 **이미 설치한** 사람일 가능성이 크다(Chrome 은 설치된 앱에 신호를 주지 않는다) |

- **설치 신호는 셸이 듣는다.** 신호는 로드당 한 번, 어느 화면에서든 온다 — `/places` 로 들어와 나중에 홈으로 오면 홈의 effect 는 이미 늦다.
  `src/lib/installPromptEvent.ts` 가 모듈이 읽히는 순간 듣고 `appShell` 이 그 모듈을 import 한다. `prompt()` 는 신호당 한 번이라 쓰고 나면 비운다(줄도 사라진다).
- **iOS 그림은 이미지 파일이 아니라 아이콘이다.** 프리캐시 목록을 손으로 적는 구조라(위 「프리캐시 목록을 직접 만드는 이유」) `public/` 에 그림을 두고 빠뜨리면 오프라인에서 그림만 빈다.
- **띠 배너(`fixed`)·닫기 버튼은 두지 않았다.** 셸 스와이프가 `<main>` 에 transform 을 걸어 `fixed` 가 어긋나고(ADR-014), 맨 아래 한 줄이라 닫을 만큼 거슬리지 않는다 — 설치하면 저절로 사라진다.
- 설치 창 분기는 dev 에서 볼 수 없다(서비스워커가 없어 Chrome 이 신호를 주지 않는다) — 빌드본 + Android Chrome 으로 확인한다.

## 매니페스트와 아이콘

- `src/app/manifest.ts`: `theme_color` 는 잉크 `#2e2327`, `background_color` 는 크림 `#faf8f4`. `layout.tsx` 의 `themeColor` 와 같은 값이어야 한다.
- 아이콘은 `scripts/make-icons.mjs` 가 SVG(잉크 둥근 사각 + brand-300 발자국)를 sharp 로 PNG 4장으로 만든다. 팔레트가 바뀔 때만 `pnpm icons`.
  maskable 은 기기가 바깥을 잘라내므로 발자국을 안쪽으로 모은다.
- 같은 스크립트가 `public/` 루트에 **관례 경로** 둘(`favicon.ico` 16·32px, `apple-touch-icon.png` 180px)도 쓴다. 페이지는 `layout.tsx` 의
  `icons` 선언을 따라 `/icons/` 를 쓰므로 이 둘은 `<link>` 를 안 읽는 클라이언트(크롤러·북마크·링크 없는 문서를 연 탭)의 404 를 없애는 용도뿐이다.
  `publicEntries` 가 `icons/`·`images/` 만 훑어 프리캐시에는 안 들어간다 — 오프라인에서 없어도 보이는 것이 달라지지 않는다.

## 글꼴 self-host

본문 글꼴(Pretendard 서브셋 `Zgnn Sans`)은 CDN 이 아니라 번들에 넣는다 — 오프라인에서도 같은 글꼴로 떠야 하기
때문이다(근거: [ADR-006](../decisions/ADR-006-responsive-scale-and-font.md)). `next/font/local` 이
`src/app/layout.tsx` 에서 읽어 `_next/static/media/*.woff2` 로 굽고, serwist 가 그 파일을 빌드 산출물로
인식해 **프리캐시 목록에 자동으로 넣는다**(`additionalPrecacheEntries` 에 손으로 적을 필요 없다.
아이콘·이미지와 다른 점 — 그쪽은 `public/` 이라 직접 넣어야 한다).

**받는 것은 두 조각이다**(ADR-006 v7). 정본 `ZgnnSans-{Regular,SemiBold}.woff2`(완성형 전부)를 `scripts/split-fonts.py` 가
**Core**(상용 2,350자 + 데이터에 나오는 글자 + 라틴, 굵기당 약 180KB — `next/font` 가 프리로드)와 **Ext**(나머지 8,821자, 약 460KB —
`src/styles/appSansExt.css` 의 `unicode-range`)로 쪼갠다. 브라우저는 Ext 범위의 글자가 화면에 나올 때만 Ext 를 받고, 서비스워커는
둘 다 프리캐시하므로 오프라인에서 처음 친 "똠" 도 같은 글꼴로 뜬다(2026-10-16 headless 실측: 설치 뒤 오프라인 `/settings/` 에서
Ext 로 그림). 정본은 배포되지 않는다 — 링크 미리보기 이미지(아래)와 쪼개기의 입력으로만 쓴다.

**`_next/static/` 항목엔 revision 을 붙이지 않는다**(`next.config.mjs` 의 `dontCacheBustURLsMatching`). 붙어 있으면 serwist 가 그 항목을
`cache: 'reload'` 로 받아 HTTP 캐시를 건너뛴다. next/font 가 내보내는 woff2 가 그랬다(JS 청크는 webpack 이 immutable 로 표시해 이미
null) — 페이지가 프리로드로 받은 글꼴을 서비스워커가 설치하며 한 번 더 받아, 첫 방문 글꼴 전송이 1.2MB × 2 였다. 파일명이 내용
해시(또는 빌드 id 경로)라 revision 없이도 같은 주소면 같은 내용이다.

이 한 줄이 지워져도 빌드·테스트는 초록이라 `scripts/check-bundle.mjs`(`pnpm build` 의 뒤 절반)가 `out/sw.js` 를 대 본다: `/_next/static/` 프리캐시 항목의 revision 이 **전부 null** 이어야 하고, 항목이 1건 이상이며 그중 `.woff2` 가 1건 이상이어야 한다 — sw.js 는 minify 돼 있어 serwist 출력 모양이 바뀌어 정규식이 0건을 집으면 "전부 null" 이 그냥 참이 되기 때문이다(그땐 "못 읽었다" 로 실패). 판정은 `scripts/lib/bundleSwPrecache.mjs`.

**글꼴 Core 밖 데이터 글자는 로컬과 배포가 다르게 반응한다.** Vercel 빌드는 `pnpm data pull && pnpm build` 로 데이터를 새로 받으므로, 커밋된 글꼴 분할(`appSansExt.css`)이 낡아도 배포는 막히지 않는다 — `check-bundle.mjs` 가 `src/data/*.json` 의 한글이 Ext 범위에 드는지 세어 **경고 한 줄만** 낸다(그 글자가 나오는 화면이 Ext 를 받아 무거워질 뿐 깨지지 않는다). 로컬은 반대로 `src/styles/appSansExt.test.ts` 가 커밋된 데이터를 읽어 빨개진다 — 의도다(`pnpm data pull` 로 상용 밖 글자가 들어오면 `python3 scripts/split-fonts.py` 로 다시 쪼개 woff2·CSS 를 같은 커밋에 싣는다고 실패 문구가 말한다). 경계는 한 곳이 읽는다 — `scripts/lib/bundleSwPrecache.mjs` 의 `extRangeBlocks`(굵기마다)·`inRanges` 를 테스트와 check-bundle 이 함께 쓴다(v15). 각자 파싱하던 동안 둘이 다른 글자를 말할 수 있었다.

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

# 4) 두 조각으로 — Core/Ext woff2 와 Ext 의 unicode-range(src/styles/appSansExt.css).
#    데이터에 KS X 1001 밖 글자가 새로 생겨 src/styles/appSansExt.test.ts 가 실패할 때도 이것만 다시 돌린다.
python3 scripts/split-fonts.py
```

링크 미리보기 이미지(`app/og/[file]/route.ts`)는 정본 woff2 두 개를 빌드 때 풀어서(`wawoff2` — satori 가 woff2 를 못 읽는다) 쓰므로, 서브셋을 다시 만들면 미리보기 글자도 따라온다.

정본은 굵기당 약 620KB 다(힌팅을 빼도 거의 안 준다 — 용량은 윤곽 자체다). 쪼개면 Core 약 180KB + Ext 약 460KB. 한글 완성형(U+AC00-D7A3) 11,172자를
통째로 넣는 이유와 굵기를 400·600 둘로 제한한 이유는 ADR-006 에 있다.

## 확인 방법

`pnpm build && pnpm preview` 로 `out/` 을 띄우고, DevTools → Application 에서 `sw.js` 등록과 프리캐시 개수(2026-10-16 빌드 207개)를 본다.
`pnpm dev` 에서는 서비스워커가 없으므로 오프라인 동작은 반드시 빌드본으로 본다.

## 관련 파일

`src/app/sw.ts`, `next.config.mjs`, `src/app/manifest.ts`, `src/app/layout.tsx`, `src/app/fonts/`, `scripts/make-icons.mjs`, `public/icons/`, `public/images/`,
`src/lib/installGuide.ts`, `src/lib/installPromptEvent.ts`, `src/screens/homePageInstall.tsx`
