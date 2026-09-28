// 네이버 **지도(Maps) API** 의 접속 규격 한 자리. 지금은 Geocoding(주소 → 좌표) 하나만 쓴다(`analyze/naverGeocode.mjs`).
//
// ⚠️ **이 레포는 이제 네이버 API 를 두 계통 쓴다. 자격증명이 서로 다르고, 이름은 똑같다.**
//
//   | | **검색**(수집 · 지역검색) | **지도**(이 파일 — Geocoding) |
//   |---|---|---|
//   | 규격 정본 | `lib/naverSearchApi.mjs` | 여기 |
//   | 호스트 | `naverapihub.apigw.ntruss.com` | `maps.apigw.ntruss.com` |
//   | NCP 콘솔의 무엇 | **API HUB** Application | **Maps** Application(지도가 쓰는 그것) |
//   | env | `NAVER_CLIENT_ID` · `NAVER_CLIENT_SECRET` | `NAVER_MAP_CLIENT_ID` · `NAVER_MAP_CLIENT_SECRET` |
//   | 헤더 | `X-NCP-APIGW-API-KEY-ID` · `X-NCP-APIGW-API-KEY` | 같은 이름이다(아래 주석) |
//
// **두 계통 모두 자격증명을 "Client ID / Client Secret" 이라고 부른다.** BUG-006 이 정확히 이 혼동으로 났고(검색 API 두 개),
// 이제 계통이 셋이라 같은 함정이 하나 더 늘었다. **env 이름을 갈라 둔 것이 그 방어**다 — 검색 키를 지도에 보내면 그냥 401 이고,
// 값만 보고는 어느 쪽인지 알 수 없다. 섞였는지 의심되면 `naverApiError.mjs` 의 `describeKeyShape`(길이·글자종류)로 대조한다.
//
// **브라우저 지도 키와도 다르다.** `src/lib/naverMap.ts` 의 `NEXT_PUBLIC_NAVER_MAP_KEY_ID` 는 같은 Maps Application 의
// **Client ID 만**(공개 값 · JS SDK 의 `ncpKeyId`)이고 Secret 이 없다. REST 로 부르는 Geocoding 은 Secret 이 필요해서
// 그 env 를 재사용할 수 없다 — 이름이 비슷해 재사용하고 싶어지는 자리라 적어 둔다.
//
// 🚩 **콘솔에서 Geocoding 을 켜 두지 않으면 키가 맞아도 실패한다.** ADR-008 의 그 자리다 — Dynamic Map 미체크 때 429(Quota Exceed)가
// 났다. Maps Application 의 사용 API 목록에 **Geocoding** 이 체크돼 있어야 한다. 401/403/429 가 계속 나면 값보다 이것을 먼저 본다.
// 게이트웨이 번호로도 읽힌다(`naverApiError.mjs` 의 표): **210=권한 없음 · 400=한도/미체크**.
//
// **호스트가 둘 살아 있다**(2026-09-28 조사). 옛 제품 "AI NAVER API ▶ Maps" 의 `naveropenapi.apigw.ntruss.com` 도 **지금 라우팅된다** —
// 자격증명 없이 찔러 보면 두 호스트가 **바이트까지 같은 401** 을 준다. 그래서 "옛 호스트는 죽었다" 는 말은 확인할 수 없고,
// 온라인 예제 대부분이 옛 호스트를 쓴다. 우리는 현행 제품 쪽(`maps.apigw.ntruss.com`)을 쓴다 — 전환 날짜는 공지가 없어 모른다.

const BASE = 'https://maps.apigw.ntruss.com';

/** 주소 → 좌표. query 는 필수, `coordinate`(중심)·`filter`·`page`·`count` 는 선택이라 쓰지 않는다. */
export const NAVER_GEOCODE_URL = `${BASE}/map-geocode/v2/geocode`;

/**
 * Maps API 인증 헤더.
 *
 * 이름이 검색(API HUB)과 **글자까지 같다** — 값만 다르다. 문서는 소문자(`x-ncp-apigw-api-key-id`)로 적지만
 * **대소문자는 상관없다**(2026-09-28 실측: HTTP/1.1 로 소문자·대문자·혼합을 각각 보내 셋 다 게이트웨이가 자격증명으로 파싱했다 —
 * HTTP/2 는 헤더를 강제로 소문자로 내리므로 HTTP/2 로 한 실험은 아무것도 증명하지 못한다). 검색 쪽과 한 글자도 다르지 않게 둬서
 * "헤더가 틀렸나" 를 의심할 일을 없앤다 — 401 이면 원인은 **값(어느 계통의 키인가)이나 콘솔 설정**이다.
 *
 * ⚠️ **`ncpKeyId` 는 헤더가 아니다.** JS SDK 의 **URL 쿼리 파라미터** 전용이고, REST 에 헤더로 보내면 게이트웨이가
 * 자격증명으로 알아보지도 못한다("인증 정보가 아예 안 갔다" — 실측). 이름이 비슷해 헷갈리는 자리라 적어 둔다.
 */
export function naverMapsAuthHeaders(clientId, clientSecret) {
  return { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret };
}
