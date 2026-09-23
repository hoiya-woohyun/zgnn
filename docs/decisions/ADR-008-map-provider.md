# ADR-008 — 지도 제공자: 네이버(NCP Maps v3), 마커는 표준 핀으로

> 최종 수정: 2026-09-23 (v4: **Kakao → 네이버(NCP Maps JavaScript API v3) 로 교체.** v1~v3 의 Kakao 결정을 번복한다 —
> 파일명도 `ADR-008-kakao-map.md` → `ADR-008-map-provider.md`. 확대 방향이 다시 뒤집혔고(`JEJU_LEVEL` → `JEJU_ZOOM`),
> 인증 실패를 감지할 수 있게 됐고, 런타임 인증 호출 때문에 **오프라인 서술이 미검증으로 내려갔다.**
> 좌표 보강(`kakaoLocal.mjs`)은 이 ADR 범위 밖이고 아직 Kakao 다 — 약관 문제는 아래 「좌표 데이터」 절)
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

`JEJU_ZOOM` 은 타일 폭(`360/2^zoom × W/256`)으로 계산해 **9** 로 잡았다. ⚠️ **아직 화면으로 확인하지 않았다.**

### 얻은 것 — 인증 실패를 이제 알 수 있다

v1~v3 의 가장 나쁜 자리는 "출처를 등록 안 하면 코드가 맞아도 지도 자리가 **조용히** 빈다" 였다.
네이버는 `window.navermap_authFailure` 전역 콜백으로 실패를 알려 준다. `naverMap.ts` 가 이걸 잡아 화면의
"지도는 인터넷이 필요해요" 폴백으로 넘기므로, **빈 지도가 남지 않는다.**

한 가지 함정: 인증 실패는 스크립트 load 보다 **늦게** 온다(지도를 만들 때 `/v3/auth` 를 부르고 그 응답으로 판정한다).
그래서 로더의 promise 가 이미 resolve 된 뒤에 실패가 올 수 있어 구독(`onNaverMapsAuthFailure`)이 따로 있고,
`authFailed` 는 sticky 다 — 안 그러면 재마운트 때 "스크립트는 이미 있다" 분기가 resolve 해서 폴백을 덮어쓴다.

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
| `nrbe.pstatic.net` | 타일(`/styles/basic/<버전>/<z>/<x>/<y>@2x.png`) + 스타일 매니페스트(JSONP) | CacheFirst |
| `ssl.pstatic.net` | 로고·스케일바·커서 | CacheFirst |
| `oapi.map.naver.com` | SDK 스크립트 (`/v3/auth` 는 캐시에 안 맞는다) | StaleWhileRevalidate |

Kakao 때는 `*.daumcdn.net` 하나가 타일과 아이콘을 함께 덮었다. 네이버는 갈려서, `ssl.pstatic.net` 을 빠뜨리면
오프라인에서 **로고만 안 뜬다** — 약관이 요구하는 표시가 사라진 화면이 된다.

`statuses: [0, 200]` 은 여전히 **필수**다(타일이 `crossorigin` 없는 `<img>` 로 와 opaque). 이유와 함정은 v1 과 같다.

**일부러 캐시하지 않는 것**: `kr-col-ext.nelo.navercorp.com`(네이버 로그 수집) · `wcs.naver.net`·`wcs.naver.com`(애널리틱스).
SDK 가 띄울 때마다 부르는 추적 요청이라 사본을 남길 이유가 없다. 다만 이 앱이 글꼴까지 self-host 해 런타임 외부 요청을
0 으로 두려던 원칙(→ [ADR-001](ADR-001-pwa-static-export.md))에서 **네이버가 Kakao 보다 더 멀어지는** 자리다.

### 키와 출처 등록

클라이언트 아이디는 **출처(origin) 허용 목록**으로 보호되는 공개 값이다. 빌드 결과물의 JS 에 문자열로 남는다.

v1 은 키 기본값을 코드에 뒀다 — "`.env.local` 에만 두면 새로 clone 한 곳에서 지도가 **조용히** 죽는다" 가 이유였다.
네이버에서는 그 이유가 약해졌다: 키가 없으면 로더가 **문구 있는 거부**로 떨어지고 화면이 안내를 그린다.
그래서 `NEXT_PUBLIC_NAVER_MAP_KEY_ID` **env 만** 쓰고 코드에 기본값을 두지 않는다.

**NCP 콘솔 → Application → Maps → Web 서비스 URL 에 주소를 등록해야 한다.**
그리고 **Dynamic Map 이 체크돼 있어야 한다** — 아니면 429(Quota Exceed)가 난다.

- 개발: `http://localhost:7727`
- 배포: `https://zgnn.vercel.app`

> ⚠️ **포트를 보는지 아직 모른다.** Kakao 는 포트까지 봐서 막았고(그래서 `dev`·`preview` 를 7727 로 고정했다),
> 네이버는 "호스트 도메인만 적고 포트·경로를 넣으면 실패한다" 는 2차 출처가 여럿이다. **확인 전까지 7727 고정은 그대로 둔다** —
> 지금 풀면 두 벤더 모두에서 안 되는 상태가 된다.

### 좌표 데이터 — 이 ADR 밖이지만 여기 적어 둔다

「네이버 클라우드 플랫폼 Maps 서비스 이용약관」 **제7조 ⑪** 는 결과 데이터의 별도 저장·DB화를 금지하며,
그 예시로 **"지도 좌표 데이터를 모아서 재사용하는 것"** 을 콕 집는다. 같은 조 ⑩ 은 로고·지정 표시의 게재를 요구할 수 있다고 한다.

그래서 **NCP Geocoding 결과를 `places.lat/lng` 에 저장하는 설계는 이 조항에 정면으로 걸린다.**
지금 좌표 보강은 여전히 Kakao 로컬 검색(`scripts/analyze/kakaoLocal.mjs`)이고, Kakao 도 "결과를 별도 저장 불가, 실시간 호출만" 이라
**벤더를 옮긴다고 해결되지 않는다.** 네이버에는 Kakao 로컬 키워드 검색에 해당하는 상품 자체가 없다(Place/POI 검색 API 없음).
→ 결정 대기. 조사 원문은 `docs/todo/naver-migration-research.md`.

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
