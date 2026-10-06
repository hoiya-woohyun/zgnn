// 네이버 검색 API 의 **접속 규격** 한 자리. 수집(블로그)과 좌표 보강(지역) 둘이 쓴다.
//
// ⚠️ **네이버 검색 API 는 두 개다.** 이 레포는 2026-09-28 까지 틀린 쪽에 대고 있었다(→ BUG-006).
//
//   | | 개발자센터 (옛) | **NAVER API HUB (지금 이것)** |
//   |---|---|---|
//   | 어디서 발급 | developers.naver.com | NCP 콘솔 — guide.ncloud-docs.com/docs/apihub-application |
//   | 호스트 | `openapi.naver.com` | `naverapihub.apigw.ntruss.com` |
//   | 경로 | `/v1/search/blog.json` | `/search/v1/blog` |
//   | 헤더 | `X-Naver-Client-Id` · `X-Naver-Client-Secret` | `X-NCP-APIGW-API-KEY-ID` · `X-NCP-APIGW-API-KEY` |
//   | 신규 발급 | **2026-07-31 종료** | 여기만 가능. 한시적 무료(유료 전환 시 별도 공지) |
//
// **두 시스템이 자격증명을 똑같이 "Client ID / Client Secret" 이라고 부른다** — API HUB 콘솔도 그 이름을 쓴다.
// 그래서 값을 손에 쥐고도 어느 쪽 것인지 알 수 없고, 틀린 쪽에 보내면 그냥 401 이다. 이 표가 그 혼동을 막는 유일한 방어다.
// env 이름을 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` 로 두는 이유도 같다 — 콘솔 화면의 이름과 맞춘다.
//
// ⚠️ **API HUB 는 검색 API 를 하나씩 추가한다 — 「검색」이라는 한 덩어리가 아니다**(2026-09-30 실측).
// 블로그만 추가된 Application 의 키로 부르면 `/search/v1/blog` 는 200, `/search/v1/local` 은 **401** 이다.
// 두 응답이 글자까지 같아서(`errorCode 200 · Authentication Failed`) 값이 틀린 것과 구별되지 않는다 —
// 가르는 방법은 **두 경로를 같은 키로 찔러 보는 것** 하나다(없는 경로는 404·`errorCode 300` 이라 이것과도 갈린다).
//
// 파라미터와 응답 필드는 **두 시스템이 같다**(query·display·start·sort / title·link·description·bloggername·postdate / mapx·mapy).
// 그래서 옮기면서 `collect/naverBlog.mjs` 의 파싱과 `naverLocal.mjs` 의 좌표·주소 해석은 한 줄도 건드리지 않았다.

const BASE = 'https://naverapihub.apigw.ntruss.com';

export const NAVER_BLOG_SEARCH_URL = `${BASE}/search/v1/blog`;
export const NAVER_LOCAL_SEARCH_URL = `${BASE}/search/v1/local`;

/*
 * 이 프로세스가 **검색 API**(블로그·지역)를 부른 횟수 — 실행 기록(`pipeline_runs.stats.naverCalls`, docs/todo/15 T2.7)과
 * 운영 현황의 30일 사용량이 읽는다. 일 25,000 쿼터는 수집과 분석이 나눠 쓰므로 둘 다 센다.
 * **응답을 기다리기 전에** 센다(`countNaverCall` 을 fetch 앞에서) — 쿼터는 요청 수로 깎이고, 4xx·타임아웃도 한 번이다.
 * 지도(Geocoding, `naverMapsApi.mjs`)는 다른 Application·다른 쿼터라 세지 않는다.
 */
let naverCalls = 0;
export function countNaverCall() {
  naverCalls += 1;
}
export function readNaverCalls() {
  return naverCalls;
}

/** API HUB 인증 헤더. 이름이 개발자센터와 다르다 — 값이 맞아도 헤더가 틀리면 401 이다. */
export function naverAuthHeaders(clientId, clientSecret) {
  return { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret };
}
