# 네이버 전환 — 조사 결과 (작업용 메모)

> 2026-09-23. `feature/naver-map` 작업 중 수집. 결정이 서면 ADR 로 옮기고 이 파일은 지운다.
> 출처 표기: **실측** = 실제 페이지 로드의 네트워크 캡처 · **공식문서** = navermaps.github.io / api.ncloud-docs.com · **2차** = 검색 결과 요약(원문 미확인)

## 1. NCP Maps JavaScript API v3 — 호출 면 (공식문서·실측)

| 자리 | Kakao (지금) | 네이버 | 근거 |
|---|---|---|---|
| 스크립트 | `dapi.kakao.com/v2/maps/sdk.js?appkey=…&autoload=false` | `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=…` | 실측 + 공식문서 |
| 키 파라미터 | `appkey` | **`ncpKeyId`** (옛 이름 `ncpClientId` 는 폐기 — 인증 실패의 흔한 원인) | 실측 + 공식문서 |
| 초기화 경합 | `autoload=false` + `kakao.maps.load(cb)` | `&callback=fnName` URL 파라미터 (또는 `naver.maps.onJSContentLoaded`). 둘 다 있으면 `callback` 만 불린다 | 공식문서 |
| 전역 | `window.kakao.maps` | `window.naver.maps` | 실측 |
| 지도 생성 | `new maps.Map(el, { center, level })` | `new naver.maps.Map(el \| 'id', { center, zoom })` | 공식문서 |
| **확대 방향** | `level` 1~14, **작을수록 확대**(기본 3) | `zoom` **클수록 확대**(기본 11) — leaflet 과 같은 방향 | 공식문서 |
| 컨테이너 리사이즈 | `map.relayout()` | **`map.refresh(noEffect)`** (`relayout` 은 없다). `autoResize()`·`setSize()`·`getSize()`·`destroy()` 도 있다 | 공식문서 |
| 인증 실패 감지 | 없음 (지도 자리가 조용히 빈다) | `window.navermap_authFailure = fn` 전역 콜백 — **다만 401 에서는 안 불린다(§3 실측).** SDK 가 대신 던지므로 try/catch 도 필요 | 공식문서 + 실측 |

### 마커 — 우려했던 것보다 대응이 깨끗하다

`naver.maps.Marker` 의 `MarkerOptions` 에 **`opacity` 가 있다**(`setOpacity()` 도). `hard` 판정을 0.45 로 흐리는 ADR-008 의 유일한 시각 인코딩을 SVG 에 굽지 않고 그대로 옮길 수 있다.

| Kakao | 네이버 |
|---|---|
| `MarkerImage(src, Size, { offset, alt })` | `icon: { url, size, scaledSize, origin, anchor }` (ImageIcon). **`anchor` = Kakao 의 `offset`** — 좌표에 맞출 이미지 안의 지점 |
| `marker.setImage(img)` | `marker.setIcon(icon)` |
| `setMap` · `setZIndex` | 같음 (+ `setOpacity` · `setVisible` · `setPosition` · `setTitle`) |
| `maps.event.addListener(t, type, fn)` — 반환값 없음 | **`naver.maps.Event.addListener(t, type, fn)` → `MapEventListener` 반환**. `Event.removeListener(listener \| listener[])` 로 해제. `clearInstanceListeners(target)` 도 있다 |

`icon` 은 문자열 URL · ImageIcon · **HtmlIcon(`content` 에 HTML/Element)** · SymbolIcon 을 받는다.
→ HtmlIcon 이면 ADR-008 이 Kakao 로 옮기며 잃었다고 기록한 **마커 키보드 접근(`role`·`tabindex`)을 되찾을 수 있다.** 이번 범위에 넣을지는 결정 사항.

## 2. 출처 등록 — **포트까지 본다** (2026-09-23 실측으로 종결)

2차 출처들은 "Web 서비스 URL 은 호스트 도메인만 적는다 — 포트·경로를 넣으면 실패한다" 고 일관되게 말했는데, **사실이 아니었다.**

실측: 등록된 `http://localhost:7727` → 인증 통과, 지도 정상. 등록 안 된 `http://localhost:55961`(같은 호스트, 다른 포트)
→ `/v3/auth` 가 **401**, 지도 안 뜸. **포트는 출처의 일부다.**

→ ADR-008 v3 의 **7727 고정은 네이버에서도 그대로 필요하다.** (Dynamic Map 체크 필요는 공식문서대로 유지.)

## 3. 런타임 인증 호출 — Kakao 에 없던 것 (실측)

실제 로드에서 SDK 가 이걸 부른다:

```
https://oapi.map.naver.com/v3/auth?ncpKeyId=***&url=<페이지 URL>&time=1790086370509&callback=__naver_maps_callback__0
```

`time` 이 매번 바뀌고 `callback` 도 카운터다 — **URL 이 두 번 같지 않아, URL 을 키로 쓰는 서비스워커 캐시가 절대 맞출 수 없다.**
오프라인에서 이 호출이 실패할 때 지도가 그려지는지가 **오프라인 지원의 생사**를 가른다. Kakao 는 이런 호출이 없어서 SDK 사본 + 타일 사본만으로 떴다.

→ **여전히 열려 있다.** 2026-09-23 에 Playwright 로 시도했으나 그 오프라인 에뮬레이션이 서비스워커보다 앞단을 막아
내비게이션 자체가 실패해 **앱의 실제 오프라인 동작 검증으로는 무효**였다. 실기기 비행기 모드나 Chrome DevTools 의
Network → Offline 로 확인해야 한다.

다만 **강한 정황이 하나 생겼다**: `/v3/auth` 가 401 로 실패했을 때 SDK 는 타일을 그리지 않고 예외를 던졌다(§아래).
인증 실패 = 지도 없음이라면, 타일을 캐시해 둬도 오프라인에서 그릴 코드가 그리기를 거부한다는 뜻이다.

### 실측으로 확정된 것 (2026-09-23, `localhost:7727` 정적 빌드)

- 지도·마커·종류 색·네이버 로고·저작권 표시 전부 정상. `JEJU_ZOOM` 은 폭에서 계산(모바일 9 · 데스크톱 10).
- 서비스워커 캐시 **항목 수**: `naver-map-tiles` 23 · `naver-map-assets` 6 · `naver-map-sdk` 2 · 프리캐시 150.
- **`navermap_authFailure` 는 401 에서 불리지 않는다.** 대신 SDK 가 `Cannot read properties of null (reading 'capitalize')`
  를 `Marker.setMap` 에서 던져 React 커밋까지 올라간다 → 마커 effect 를 `try/catch` 로 감싸야 폴백이 뜬다.
- **타일·자원 호스트가 페이지 프로토콜에 따라 갈린다**: HTTPS → `nrbe.pstatic.net`·`ssl.pstatic.net`,
  HTTP → `nrbe.map.naver.net`·`static.naver.net`. 한쪽만 적으면 다른 쪽에서 캐시가 조용히 빈다.

### SDK 가 실제로 받는 것 전부 (실측, 지도 1개 띄울 때)

| 호스트 | 무엇 | 요청 수 |
|---|---|---|
| `nrbe.pstatic.net` | **타일**(`/styles/basic/<버전>/<z>/<x>/<y>@2x.png?mt=…`) + 스타일 매니페스트(`/styles/basic@2x.json?…&callback=…` — JSONP) | 128 |
| `oapi.map.naver.com` | `maps.js` · 서브모듈 `maps-{geocoder,panorama,drawing,visualization}.js` · **`/v3/auth`** | 18 |
| `ssl.pstatic.net` | 로고(`new-naver-logo-normal.png`) · 스케일바 · 커서(`openhand.cur`) · `gfp-nac-module/synchronizer.js` | 18 |
| `kr-col-ext.nelo.navercorp.com` | 네이버 로그 수집(NELO) | 8 |
| `wcs.naver.net` · `wcs.naver.com` | 네이버 애널리틱스 | 6 |

Kakao 는 `dapi.kakao.com` + `*.daumcdn.net` 둘이었다. 네이버는 **호스트 3개를 캐시해야** 하고,
뒤의 둘(NELO·wcs)은 **캐시하면 안 되는 추적 요청**이다 — 이 앱이 글꼴까지 self-host 해 런타임 외부 요청을 0 으로 두려던 원칙(ADR-001)에서 더 멀어진다.

## 4. 🚨 약관 — 이번 전환의 진짜 쟁점 (2차, 원문 확인 필요)

### (a) NCP Maps: 결과 데이터 저장 금지 — **1차 출처 확인** (좌표는 금지, 타일은 언급 없음)

「네이버 클라우드 플랫폼 Maps 서비스 이용약관」(v0.4, 적용 2025-03-20) **제7조 (권리 및 의무) ⑪** 원문:

> ⑪ '고객'은 '본 서비스'의 결과 데이터를 (해당 결과 데이터를 받은 즉시 자신의 서비스에서 사용하는 것이 아니라) 별도로 저장해서는 안되며,
> 따라서 그와 같은 결과 데이터를 별도로 저장하는 방식으로 데이터베이스화하여 이용해서도 안됩니다. 예를 들면, '본 서비스'의 결과 데이터로
> 전송 받는 **지도 좌표 데이터**를 모아서 (그 이후에는 API를 호출하지 않고) 재사용하는 것은 엄격히 금지됩니다. 즉, 모든 Maps API의 결과
> 데이터는 값을 리턴 받는 즉시 **1회** 자신의 서비스에서 사용하는 것만 허용되며, 그렇지 않고 그 결과 값들을 별도로 저장, DB화, 재사용하는 것은 금지됩니다.

함께 걸리는 조항: **⑨** 사전 동의 없이 결과 데이터를 허용 범위 넘어 복제·저장·가공·배포·제3자 제공 금지 ·
**⑩** 회사가 결과 또는 애플리케이션에 **로고·지정 표시의 게재를 요청할 수 있고 고객은 준수해야 한다** ·
**⑦** 홈페이지의 별도 **「Maps 사용 가이드」·「API 가이드」를 준수**해야 한다 · **⑫** API·SDK 자체의 재판매·리패키징 금지.

**⚠️ 2차 출처 정정.** 검색 결과 요약들은 이 조항을 "**지도 타일(Tile) 데이터**를 모아서 재사용하는 것은 엄격히 금지" 로 인용했지만,
약관 원문은 **"지도 좌표 데이터"** 다. 타일은 이 약관 어디에도 나오지 않는다. 따라서:

1. **Geocoding·좌표 결과 → Supabase `places.lat/lng` 저장 = 조항이 예시로 콕 집어 금지한 바로 그것.** 회색이 아니라 명시적이다.
2. **서비스워커 타일 캐시 = 약관 원문에 금지 문구가 없다.** ADR-008 의 오프라인 지도(CacheFirst·7일·200장)를 이 조항만으로 되돌릴 근거는 없다.
   다만 ⑦ 이 가리키는 별도 「Maps 사용 가이드」는 아직 안 읽었다 — 거기 타일 조항이 있을 수 있다. **남은 확인 1건.**

### (b) 네이버 검색 API: 신규 발급 종료 + **AI 입력 금지**

- **2026-07-31**: 개발자센터에서 검색 API(지역·블로그) **신규 발급 종료**. 이후 신규는 NAVER API HUB(NCP)뿐이고 호스트·경로·인증 헤더가 다르며 **유료 종량제**다.
  7월 25일 이전 발급자는 발급일로부터 1년 유예, **2027-06-30** 개발자센터 전면 종료.
- **2026-09-07 시행**: 개정 약관이 검색 결과를 **"입력하거나 학습·개선·평가·노출에 활용하는 행위"** 를 금지. 학습뿐 아니라 **외부 AI 에 입력하는 것 자체**가 금지라 RAG 식 우회도 막는다. 복제·저장·캐싱, 제3자 제공, 광고 수익화도 함께 금지.

→ **이건 지도와 무관하게 todo 2·3(수집 → Claude 분석)의 전제를 건드린다.** 오늘 기준 사용자가 "개발자센터에서 키 발급" 을 하러 가면 **발급 자체가 안 될 수 있다.**

### (c) Kakao 도 같은 제약이었다 — 새로 생긴 문제가 아니다

카카오 로컬 API FAQ 도 "응답받은 결과 데이터를 별도로 저장하여 사용하는 것은 허용하지 않으며 실시간 호출만 가능" 이라고 못 박는다.
지금의 `kakaoLocal.mjs` → `places.lat/lng` 저장 설계가 **이미** 같은 자리에 있었다. 네이버로 옮겨서 생긴 문제가 아니라, 옮기며 드러난 문제다.

### (d) 로고

`LogoControl` 기본 위치는 **BOTTOM_RIGHT**(Kakao 와 다르다). API 레퍼런스에는 숨김 금지 문구가 없지만, 2차 출처는
"기본적으로 끌 수 없고, 위치 조정은 되며, **다른 UI 로 가리면 안 된다**" 고 말한다.
→ `mapPage.tsx` 의 하단 `EmptyState`(z-1001)가 우하단 로고를 가리는지 확인해야 한다.

## 5. 좌표 보강 — 네이버에 Kakao 키워드 검색의 대응물이 없다

| 후보 | 되는가 | 걸림돌 |
|---|---|---|
| 네이버 **검색 API 지역**(`openapi.naver.com/v1/search/local.json`) | 장소명 검색 O. `mapx`/`mapy` 는 **WGS84 × 10⁷ 정수**(옛 KATECH 에서 바뀜 — 공지로만 알려짐, 문서는 여전히 KATECH 이라 적혀 있어 실측 필수) | 신규 발급 종료 · AI 입력 금지 · 저장 금지 · `display` 상한이 5 라 동명 구분이 약함 |
| **NCP Geocoding**(`…/map-geocode/v2/geocode`) | **주소 → 좌표만.** `query` 가 "검색할 주소" 이고 상호명 검색은 문서에 없다 | 우리 시나리오는 "장소 **이름**으로 검색" 이라 입력이 없다. **결과 저장은 제7조 ⑪ 이 예시로 금지한 바로 그것** |
| NCP Maps 전체 | Place/POI 검색 API 자체가 **없다**(Dynamic/Static Map · Geocoding · Reverse Geocoding · Directions 뿐) | — |
| **Kakao 유지**(지금) | 지금 코드 그대로 돈다 | Kakao 로컬 API FAQ 도 "결과를 별도 저장 불가, 실시간 호출만" — **약관상 더 깨끗하지 않다.** 운영상 편할 뿐 |

→ **네이버로 1:1 대체가 안 된다.** Kakao 로컬 키워드 검색에 해당하는 상품이 네이버 클라우드에 없다.
→ 그리고 **어느 벤더를 쓰든 "검색 결과 좌표를 DB 에 저장" 자체가 약관에 걸린다.** 이건 네이버 전환이 만든 문제가 아니라
지금의 `kakaoLocal.mjs` → `places.lat/lng` 설계에 **이미** 있던 문제이고, 옮기려다 드러났다.
약관을 지키는 선택지는 실질적으로 **사람이 Studio 에서 좌표를 넣는 것**(지도에서 찍어 옮기기)뿐이다.

## 6. 정리 — 지도 전환과 무관하게 결정이 필요한 것

1. 오프라인 지도(타일 캐시)를 약관상 유지할 수 있는가? 못 하면 ADR-008 의 오프라인 서술을 되돌려야 한다.
2. 좌표 보강을 무엇으로 할 것인가 (네이버에 대응물 없음 · Kakao 는 저장 금지 · 손으로 Studio 입력?).
3. 블로그 수집(todo 2)과 Claude 분석(todo 3)을 네이버 검색 API 로 계속할 수 있는가 — 발급·AI 입력 두 자리 모두.
