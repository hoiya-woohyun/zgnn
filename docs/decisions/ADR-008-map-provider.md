# ADR-008 — 지도 제공자: 네이버(NCP Maps v3), 마커는 표준 핀으로

> 최종 수정: 2026-09-23 (v6: **로고·저작권 표시를 `TOP_RIGHT` 로 옮겼다** — 끄지 않는 것만으로는 부족했다.
> 기본 앵커가 `BOTTOM_RIGHT` 인데 바텀시트가 정상 경로에서 그 자리를 덮는다. 「로고·저작권 표시」 절 신설)
> 이전 (v5: self-cr 반영 — **폴백으로 넘어가는 경로 자체가 무방비였다.** 마커를 올릴 때만 감쌌고
> 정리(`clearMarkers`)와 250ms 재측정 타이머가 열려 있었다. 「인증 실패」 절에 두 구멍과 재진입 문제를 적었다)
> 이전 (v4: **Kakao → 네이버(NCP Maps JavaScript API v3) 로 교체.** v1~v3 의 Kakao 결정을 번복한다 —
> 파일명도 `ADR-008-kakao-map.md` → `ADR-008-map-provider.md`. 확대 방향이 다시 뒤집혔고(`JEJU_LEVEL` → `JEJU_ZOOM`),
> 인증 실패를 감지할 수 있게 됐고, 런타임 인증 호출 때문에 **오프라인 서술이 미검증으로 내려갔다.**
> 좌표 보강도 같은 작업에서 네이버 지역 검색으로 옮겼다(`naverLocal.mjs`) — 약관 문제는 아래 「좌표 데이터」 절)
>
> 이전 (v3: 개발·preview 포트를 7727 로 고정 — 등록 출처를 `http://localhost:3000` 에서 `http://localhost:7727` 로 옮김)
>
> 이전 (v2: 지도 화면의 조건을 종류 3개만 남기고 정리 — 읍면 피커·어려운 곳 숨기기 제거, 그에 딸린 시야 맞춤과 `kakaoMapLevel.ts` 도 함께 삭제)
>
> 이전 (v1: leaflet + OSM/CARTO 타일에서 Kakao 지도 SDK 로 교체)

## 맥락

v1 에서 leaflet + OSM/CARTO 를 Kakao 지도로 바꿨고, 그 이유(한국 지명이 촘촘한 타일 · 마커를 직접 그리지 않기)는
**지금도 유효하다.** 2026-09-22 사용자 결정으로 제공자만 **네이버**로 옮긴다. Kakao 에 기능적 불만이 있어서가 아니라
서비스 선택의 문제다 — 그래서 아래 결정 대부분은 v1~v3 을 그대로 물려받고, **벤더 때문에 달라지는 자리만** 다시 적는다.

## 결정

**네이버 지도 JavaScript API v3(NCP Maps)** 로 바꾸고, 마커는 SDK 의 표준 `Marker` 에 **종류 색만 입힌 핀**을 쓴다.

- SDK 는 npm 패키지가 아니라 `oapi.map.naver.com` 이 내려주는 스크립트다. 정적 내보내기라 서버에서 심을 자리가 없어
  지도 화면이 뜰 때 `src/lib/naverMap.ts` 가 직접 붙인다.
- 마커 모양은 `icon`(ImageIcon)에 인라인 SVG data URI 하나. 외부 이미지를 받지 않는다.
- 종류 색(`TYPE_COLOR`)과 `hard` 판정의 투명도는 **그대로 남는다** — 네이버 `Marker` 에도 `opacity` 가 있어 덧칠이 아니다.
- **지도의 조건은 종류 3개뿐**이라는 v2 의 결정은 유지한다(아래 표 그대로).

### 지도의 조건은 종류 3개뿐이다 (v2 에서 유지)

| 뺀 것 | 이유 |
|---|---|
| 방향(동/서/남/북) | 지도 위에서 "동쪽만 보기" 는 지도를 동쪽으로 끄는 것과 같은 일이다. 무엇을 뜻하는지도 읽는 사람마다 달랐다 |
| 읍면 피커 | 고르면 그 읍면으로 시야를 날려 주는 컨트롤이었다. 확대·이동은 지도가 이미 가진 기능이라 버튼으로 옮겨 놓을 이유가 없다 |
| 어려운 곳 숨기기 | 판정을 좁혀 보는 일은 조건과 정렬이 다 있는 둘러보기 목록이 더 잘한다. 지도에는 `hard` 를 흐리게 그리는 신호만 남겼다 |
| 지도에 없는 N곳 링크(모바일) | 5곳 남짓을 가리키려고 지도 위에 줄을 하나 더 쓰는 값이 안 나왔다. 자리가 넉넉한 데스크톱 좌측 패널에는 남겼다 |

방향·읍면은 **목록 화면(`placesPage`)에는 그대로 있다.**

## 결과

### 옮겨 적은 대응표 (실측 + 공식 레퍼런스)

| 자리 | Kakao (v1~v3) | 네이버 (v4) |
|---|---|---|
| 스크립트 | `dapi.kakao.com/v2/maps/sdk.js?appkey=…&autoload=false` | `oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=…` |
| 초기화 경합 | `autoload=false` + `kakao.maps.load(cb)` | **없다**(서브모듈을 안 쓰면 load 시점에 `naver.maps` 가 서 있다) |
| 확대 수준 | `level` 1~14, 작을수록 확대 | `zoom`, **클수록 확대**(기본 11) |
| 컨테이너 재측정 | `map.relayout()` | `map.refresh(noEffect)` — `relayout` 은 없다 |
| 마커 이미지 | `MarkerImage(src, Size, { offset, alt })` | `icon: { url, size, anchor }` — **`anchor` 가 `offset` 자리** |
| 이미지 교체 | `marker.setImage()` | `marker.setIcon()` |
| 이벤트 | `maps.event.addListener()` (반환 없음) | `maps.Event.addListener()` → **핸들 반환**, `Event.removeListener()` 로 풀어야 한다 |
| 언마운트 | — | `map.destroy()` 가 이벤트·DOM 을 함께 걷어낸다 |

### 조용히 깨지는 자리 — 확대 수준의 방향이 **두 번째로** 뒤집혔다

leaflet `zoom`(클수록 확대) → Kakao `level`(작을수록) → 네이버 `zoom`(**다시 클수록**).
v1 은 "`JEJU_LEVEL = 10` 이 옛 `JEJU_ZOOM = 10` 과 숫자가 같은 것은 **우연**" 이라고 적어 뒀는데, 이번에도 같은 함정이다 —
`JEJU_LEVEL = 10` 을 `zoom: 10` 으로 옮겨 쓰면 제주도의 절반만 보인다. 부호를 뒤집어도 빌드와 테스트는 통과한다.

상수 하나로 박지 않고 지도 폭에서 계산한다(`jejuZoomFor`, 단위 테스트 6개). 모바일 390px → **9**, 데스크톱 830px → **10**.
2026-09-23 화면으로 확인했다 — 9 를 데스크톱에 그대로 쓰면 섬이 화면 3분의 1만 차지해 바다만 넓고,
10 을 모바일에 쓰면 섬이 잘린다. 폭에서 계산하면 양쪽 다 여백 30% 안팎으로 들어온다.

### 인증 실패 — `navermap_authFailure` 만 믿으면 안 된다 (실측)

v1~v3 의 가장 나쁜 자리는 "출처를 등록 안 하면 코드가 맞아도 지도 자리가 **조용히** 빈다" 였다.
네이버에는 `window.navermap_authFailure` 전역 콜백이 있어 이걸 고칠 줄 알았는데, **실측은 반쪽이었다.**

2026-09-23, 등록 안 된 출처(`localhost:55961`)에서 `/v3/auth` 가 **401** 을 냈을 때:

- `navermap_authFailure` 는 **불리지 않았다.**
- 대신 SDK 안쪽이 `Cannot read properties of null (reading 'capitalize')` 을 던졌고,
  그것이 우리 `Marker.setMap` 호출을 타고 **React 커밋까지 올라가 화면 전체를 깼다.**

그래서 방어는 **두 겹**이다. 콜백 구독(`onNaverMapsAuthFailure`)은 그대로 두되,
`mapPageCanvas` 의 마커 effect 를 `try/catch` 로 감싸 **SDK 가 던지는 경우에도** 폴백으로 넘긴다.
지도 생성은 promise 의 `catch` 가 이미 덮는다. 콜백만 믿는 구현은 이 경우 깨진 화면을 그대로 남긴다.

또 하나: 인증 실패는 스크립트 load 보다 **늦게** 온다(지도를 만들 때 `/v3/auth` 를 부르고 그 응답으로 판정한다).
로더의 promise 가 이미 resolve 된 뒤에 올 수 있어 구독이 따로 있고, `authFailed` 는 sticky 다 —
안 그러면 재마운트 때 "스크립트는 이미 있다" 분기가 resolve 해서 폴백을 덮어쓴다.

**그런데 마커를 *올릴* 때만 감싸는 것으로는 부족했다**(self-cr 지적, v5 에서 닫음). 정리하는 쪽 —
`clearMarkers` 의 `Marker.setMap(null)`·`Event.removeListener` — 도 같은 깨진 지도를 건드리므로 던질 수 있는데,
그 자리가 세 군데(마커 effect 의 catch 안 · 그 effect 의 cleanup · 지도 effect 의 cleanup)라 **폴백으로 넘어가는 경로 자체가
무방비**였다. 심각한 이유는 재진입이다: 루프가 중간에 끊기면 `markers.clear()` 에 닿지 못해 죽은 엔트리가 남고 다음 호출이
같은 자리에서 또 던진다 — **한 번의 실패가 영구 고장이 된다.** 그래서 정리는 엔트리 단위로 감싸고, 실패해도 나머지를 계속 돈다.

`map.destroy()` 도 같다(검증 패스에서 하나 더 나왔다). `setMap(null)` 이 던질 수 있다고 봤다면 `destroy()` 는 더 그렇다 —
같은 인스턴스를 더 크게 해체한다. 언마운트 cleanup 이라 던지면 React 19 가 에러 경계까지 올려 **폴백은 떴는데 지도 화면을
떠나는 순간 앱이 깨진다.** `finally` 로 `mapRef` 도 반드시 끊는다(안 그러면 파괴된 map 참조가 남는다).

같은 결의 구멍이 하나 더 있었다. 크기 재측정 타이머(`setTimeout(refresh, 250)`)가 지도 effect 의 지역 변수였는데
그 effect 의 deps 가 `[]` 이라 **cleanup 이 언마운트에서만** 돈다. `status` 가 'error' 가 되면 폴백이 지도 컨테이너를
DOM 에서 빼는데 타이머는 살아 있어, 떼어낸 컨테이너에 `refresh()` 를 때린다 — **타이머 콜백이라 어떤 try/catch 도 덮지 못한다.**
타이머 id 를 ref 로 올리고 `status` 를 보는 effect 에서 끈다.

### 오프라인 — **v1~v3 의 서술을 철회한다 (미검증)**

v1 은 "한 번 지도를 연 기기는 비행기 모드에서도 SDK 사본으로 지도를 띄우고 받아 둔 타일로 본 지역을 그린다
(2026-09-17 실측: 타일 21장·마커·지명)" 고 적었다. **네이버에서는 아직 그렇게 말할 수 없다.**

지도를 만들 때 SDK 가 이걸 런타임에 부르기 때문이다(실측):

```
https://oapi.map.naver.com/v3/auth?ncpKeyId=…&url=<페이지 URL>&time=<매번 다름>&callback=__naver_maps_callback__0
```

`time` 이 매번 달라 **URL 을 키로 쓰는 서비스워커 캐시가 이 요청을 절대 맞출 수 없다.** 오프라인에서 이 호출이 실패할 때
SDK 가 타일을 그리는지 아닌지에 따라 오프라인 지도의 생사가 갈리고, **비행기 모드 실측은 아직 안 했다.**
캐시 규칙은 호스트를 실측해 걸어 뒀지만(아래), "오프라인에서 지도가 뜬다" 는 **검증 전까지 문서에 쓰지 않는다.**

#### 캐시할 호스트가 둘에서 셋으로 늘었다 (실측)

| 호스트 | 무엇 | 핸들러 |
|---|---|---|
| 타일·스타일 | `nrbe.pstatic.net`(HTTPS) · `nrbe.map.naver.net`(HTTP) | CacheFirst |
| 로고·스케일바·커서 | `ssl.pstatic.net/…/maps/…`(HTTPS) · `static.naver.net/maps/…`(HTTP) | CacheFirst |
| SDK 스크립트 | `oapi.map.naver.com` (`/v3/auth` 는 캐시에 안 맞는다) | StaleWhileRevalidate |

**⚠️ 호스트가 페이지 프로토콜에 따라 갈린다** — 이번 작업에서 가장 조용한 함정이었다. 공식 문서 사이트(HTTPS)를
캡처해 `pstatic.net` 만 적었는데, 우리 `localhost`(HTTP)에서는 `naver.net` 으로 왔다. 한쪽만 적으면
**그쪽에서만 캐시가 차고 다른 쪽은 빈다.** 배포(HTTPS)와 개발(HTTP)이 서로 다른 호스트를 쓰므로 둘 다 적는다.

Kakao 때는 `*.daumcdn.net` 하나가 타일과 아이콘을 함께 덮었다. 네이버는 갈려서, 자원 규칙을 빠뜨리면
오프라인에서 **로고만 안 뜬다** — 약관이 요구하는 표시가 사라진 화면이 된다.

**캐시가 실제로 차는지는 항목 수로 확인했다**(grep 이 아니라 — v1 이 못 박은 검증 방식이다).
2026-09-23 `localhost:7727` 정적 빌드에서 `/map` 을 두 번 연 뒤: `naver-map-tiles` **23** · `naver-map-assets` **6** ·
`naver-map-sdk` **2** · 프리캐시 150.

`statuses: [0, 200]` 은 여전히 **필수**다(타일이 `crossorigin` 없는 `<img>` 로 와 opaque). 이유와 함정은 v1 과 같다.

**일부러 캐시하지 않는 것**: `kr-col-ext.nelo.navercorp.com`(네이버 로그 수집) · `wcs.naver.net`·`wcs.naver.com`(애널리틱스).
SDK 가 띄울 때마다 부르는 추적 요청이라 사본을 남길 이유가 없다. 다만 이 앱이 글꼴까지 self-host 해 런타임 외부 요청을
0 으로 두려던 원칙(→ [ADR-001](ADR-001-pwa-static-export.md))에서 **네이버가 Kakao 보다 더 멀어지는** 자리다.

### 키와 출처 등록

클라이언트 아이디는 **출처(origin) 허용 목록**으로 보호되는 공개 값이다. 빌드 결과물의 JS 에 문자열로 남는다.

v1 처럼 **기본값을 코드에 둔다**(`src/lib/naverMap.ts` 의 `KEY_ID`). `NEXT_PUBLIC_NAVER_MAP_KEY_ID` 로 덮어쓸 수 있다.

> 이 자리는 v4 작업 중에 한 번 뒤집혔다. "네이버는 키가 없으면 문구 있는 거부로 떨어지니 env 만 쓰자" 고 적었다가 되돌렸다 —
> 조용한 실패는 막아도 **배포가 깨지는 것은 그대로**이기 때문이다. `.env.local` 은 gitignore 대상이라 Vercel 빌드에 없고,
> 이 레포는 Vercel 환경변수를 **0개**로 두는 것이 보안 모델의 일부다(→ [ADR-016](ADR-016-secrets-by-login.md)).
> 공개값을 코드 상수로 두는 것은 이 레포의 기존 어법이기도 하다(`PROJECT_REF`·`PUBLISHABLE_KEY`).
> 로더의 "키가 비었으면 문구 있는 거부" 는 그대로 남겨 뒀다 — 상수를 지운 사람에게 원인을 알려 주는 안전망이다.

**NCP 콘솔 → Application → Maps → Web 서비스 URL 에 주소를 등록해야 한다.**
그리고 **Dynamic Map 이 체크돼 있어야 한다** — 아니면 429(Quota Exceed)가 난다.

- 개발: `http://localhost:7727`
- 배포: `https://zgnn.vercel.app`

**포트도 본다 — 2026-09-23 실측으로 확정.** 같은 `localhost` 라도 등록 안 된 포트(`55961`)에서는 `/v3/auth` 가 **401** 을 냈고,
등록된 `7727` 에서는 통과했다. "호스트 도메인만 적으면 된다" 는 2차 출처들이 여럿 있었지만 **사실이 아니다.**
따라서 v3 의 **7727 고정은 네이버에서도 그대로 필요하다** — 다른 포트로 띄우면 지도가 인증에서 막힌다.

### 로고·저작권 표시 — 끄지 않는 것만으로는 부족하다 (제7조 ⑩)

`logoControl: true`·`mapDataControl: true` 로 끄지 않는 것은 필요조건일 뿐이다. 네이버의 두 컨트롤은
기본 앵커가 **`BOTTOM_RIGHT`** 인데, 이 화면은 하단을 **전폭으로 덮는 것이 셋**이다:

| 덮는 것 | 위치 | 빈도 |
|---|---|---|
| 저장한 곳 없음 `EmptyState` | `inset-x-0 bottom-0 z-[1001]` | 드묾(빈 상태) |
| 조건에 맞는 곳 없음 `EmptyState` | 같음 (`lg:hidden`) | 드묾(빈 상태) |
| **바텀시트**(`BottomSheet`) | react-aria 가 `document.body` 로 포털 | **마커를 누르면 늘** |

셋째가 문제다. **예외 상황이 아니라 이 화면의 기본 상호작용**이고, 포털이라 지도 컨테이너 바깥에 그려져
`z-index`·`overflow` 어느 것으로도 피할 수 없다. 즉 코드 주석이 준수를 주장하는데 정상 경로에서 표시가 사라지는,
가장 나쁜 조합이었다(self-cr 지적. `naver-migration-research.md` §4(d) 가 스스로 "확인해야 한다" 고 남긴 숙제이기도 했다).

**그래서 컨트롤을 `TOP_RIGHT` 로 옮긴다**(`logoControlOptions`·`mapDataControlOptions`). 우상단은 종류 칩(`top-0`)이
있는 띠지만 칩이 셋뿐이라 가로로 비어 있다. **다만 이건 시각적 사실이지 구조적 보장이 아니다** — 칩 컨테이너가
`inset-x-0`(전폭)이라 **종류가 늘면 다시 겹칠 수 있다.** 종류를 추가할 때 이 자리를 같이 본다.

대안으로 "시트가 열릴 때 지도에 하단 패딩" 도 있었지만, 시트 높이를 추적해야 해서 더 비싸다.
"가려짐을 수용하고 문서화" 는 택하지 않았다 — 2026-09-23 사용자 결정.

### 좌표 데이터 — 이 ADR 밖이지만 여기 적어 둔다

「네이버 클라우드 플랫폼 Maps 서비스 이용약관」 **제7조 ⑪** 는 결과 데이터의 별도 저장·DB화를 금지하며,
그 예시로 **"지도 좌표 데이터를 모아서 재사용하는 것"** 을 콕 집는다. 같은 조 ⑩ 은 로고·지정 표시의 게재를 요구할 수 있다고 한다.

그래서 **NCP Geocoding 결과를 `places.lat/lng` 에 저장하는 설계는 이 조항에 정면으로 걸린다.** NCP Maps 에는 애초에
장소명(POI) 검색 상품이 없기도 하다(Dynamic/Static Map · Geocoding · Reverse Geocoding · Directions 뿐).

**그래서 좌표 보강은 NCP Maps 가 아니라 「네이버 검색 API 의 지역 검색」으로 옮겼다**(`scripts/analyze/naverLocal.mjs`).
02(수집)이 이미 쓰는 것과 **같은 키**(`NAVER_CLIENT_ID`/`SECRET`)라 키를 하나 더 관리하지 않아도 된다.
다만 **저장 제약은 여기서도 풀리지 않는다** — 네이버 검색 API 약관도, Kakao 로컬 API FAQ 도 결과의 별도 저장을 금지한다.
즉 이건 벤더 선택의 문제가 아니라 "검색 결과 좌표를 DB 에 굽는다" 는 설계 자체의 문제이고, 지금은 **사용자 판단으로 네이버 기준으로 진행한다**.
조사 원문은 `docs/todo/naver-migration-research.md`.

### 잃은 것

v1 이 적은 "마커의 키보드 접근이 없어졌다" 는 **그대로**다. 다만 네이버의 `icon` 은 `HtmlIcon`(`content` 에 HTML/Element)을
받으므로, 되찾을 길이 Kakao 때보다 가깝다 — 이번 범위에는 넣지 않았다.
작게 잃은 것 하나: 네이버 `ImageIcon` 에는 Kakao `MarkerImage` 의 `alt` 가 없다. 마커의 대체 텍스트는 이제 `title` 만 나른다.

## 관련

- 코드: `src/lib/naverMap.ts`(로더) · `src/screens/mapPageCanvas.tsx`(지도·마커) ·
  `src/screens/mapPage.tsx`(화면·종류 칩) · `src/naverMaps.d.ts`(SDK 타입) · `src/app/sw.ts`
- [ADR-001 정적 내보내기 PWA](ADR-001-pwa-static-export.md) · [ADR-002 장소 사진 없음](ADR-002-no-place-photos.md)
- [pwa-offline.md](../architecture/pwa-offline.md) · [app-shell-and-state.md](../architecture/app-shell-and-state.md)
- 조사 원문: [docs/todo/naver-migration-research.md](../todo/naver-migration-research.md)
