/**
 * 네이버 플레이스의 **홈 탭** 주소. 사진은 가져오지 않고 그곳으로 보낸다(ADR-002 v2) — 사진은 홈 맨 위와 사진 탭에 있다.
 *
 * 사진 탭(`/photo`)이 아니라 홈인 이유(ADR-002 v7): 전화·영업시간·메뉴가 홈에 있다. 앱엔 전화번호가 아직 없어
 * 사용자가 번호를 찾으려고 '네이버 사진' 을 눌러야 했다(2026-10-13 평가 영자 — "사진 단추에 전화가 숨어 있는 줄 누가 아나").
 * `/place/{id}` 는 네이버가 업종 경로(`/accommodation/`·`/restaurant/`)로 돌려준다 — 우리가 업종을 고를 필요가 없다.
 *
 * 왜 가져오지 않나 — 플레이스 사진은 업주·방문자가 올린 것이고 네이버가 받은 이용 허락은 네이버 서비스 안에서만이다.
 * 공식 API 로도 받을 수 없어 긁어야 하는데, 그건 약관(자동 수집 금지)에 걸린다. 링크는 둘 다 피한다.
 *
 * `naverUrl` 로 만들지 않는 이유 — 시드 84곳의 `naverUrl` 은 전부 `naver.me` 단축 링크라 어느 탭으로 풀리는지 정할 수 없다.
 * 숫자가 아닌 id 는 버린다: 잘못된 id 로 만든 주소는 네이버의 빈 화면으로 가고, 버튼이 없는 편이 낫다.
 */
export function naverPlaceHomeUrl(naverPlaceId?: string): string | undefined {
  const id = naverPlaceId?.trim();
  if (!id || !/^\d+$/.test(id)) return undefined;
  return `https://m.place.naver.com/place/${id}/home`;
}

/**
 * 상세 액션 줄 '네이버 플레이스' 칸의 주소 — id 로 만든 홈이 먼저, 없으면 `naverUrl`(단축 링크라 탭은 못 고른다).
 * 칸과 머리 주소 줄의 "네이버 플레이스로 이어 드려요"(`placeDetailAddressNote`)가 이 하나를 읽어야 칸이 없는데 말만 서지 않는다.
 */
export function naverPlaceUrlOf(place: { naverPlaceId?: string; naverUrl?: string }): string | undefined {
  return naverPlaceHomeUrl(place.naverPlaceId) ?? place.naverUrl;
}

/**
 * 플레이스 id·URL 이 없는 곳(블로그 출처 38곳)의 '네이버에서 찾기' 주소 — 네이버 **지도 검색**이라 가게 페이지가 아니라 검색 결과로 열린다.
 * 그래서 칸 이름이 '네이버 플레이스'(정확한 가게 페이지 · `naverPlaceUrlOf`)와 다르다. 전화·영업시간이 네이버 너머에만 있어 칸째 비우지 않는다(14 W261019.2).
 *
 * 검색어는 `{읍·면 또는 시} {이름}` — 38곳 중 '바람'·'포크'·'구둠'·'솔옆수' 처럼 짧거나 흔한 이름은 이름만으론 동명 가게가 섞인다.
 * 주소에서 읍·면(없으면 제주시·서귀포시) 하나만 붙인다: 도로명·번지까지 넣으면 표기가 달라 검색이 비는 일이 잦다(`naverMapSearchUrl` 와 같은 이유).
 * 이름에 이미 그 지역어가 들어 있으면 다시 붙이지 않는다. 운영 화면의 `naverMapSearchUrl` 은 그대로 둔다.
 */
export function naverPlaceFindUrl(place: { name: string; address?: string }): string {
  const name = place.name.trim();
  const region = place.address?.match(/\S+[읍면](?=\s|$)/)?.[0] ?? place.address?.match(/(제주시|서귀포시)(?=\s|$)/)?.[0] ?? '제주';
  const query = name.includes(region) ? name : `${region} ${name}`;
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

export type TNaverPlaceIdParse = { id: string | null } | { error: string };

/**
 * 운영자가 붙여 넣은 값 → 플레이스 id. 숫자 id 그대로이거나 네이버 플레이스·지도 주소다.
 *
 * 주소 꼴이 여럿이라(`m.place.naver.com/restaurant/{id}/home` · `pcmap.place.naver.com/…` · `map.naver.com/p/entry/place/{id}`)
 * 경로에서 **다섯 자리 이상 숫자 마디**를 찾는다. 호스트는 `naver.com` 으로 끝나야 한다 — 다른 사이트 주소의 숫자를 id 로 읽으면
 * 엉뚱한 가게의 플레이스로 보내고, `matchPlace` 는 그 id 로 **1.0 짝**을 낸다(`naverPlaceId 일치`).
 *
 * `naver.me` 단축 링크는 받지 않는다. 풀려면 리다이렉트를 따라가야 하는데 브라우저에서는 CORS 로 막힌다 —
 * 링크를 열어 주소창의 주소를 붙여 넣게 한다. 빈 값은 `{ id: null }`(지우기)이다.
 */
export function parseNaverPlaceId(input: string): TNaverPlaceIdParse {
  const text = input.trim();
  if (!text) return { id: null };
  if (/^\d+$/.test(text)) return { id: text };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { error: '플레이스 주소나 숫자 id 를 붙여 넣어 주세요.' };
  }
  const host = url.hostname.toLowerCase();
  if (host === 'naver.me') return { error: 'naver.me 단축 링크는 풀 수 없어요 — 링크를 연 뒤 주소창의 주소를 붙여 넣어 주세요.' };
  if (host !== 'naver.com' && !host.endsWith('.naver.com')) return { error: '네이버 플레이스·지도 주소가 아니에요.' };
  const found = url.pathname.match(/\/(\d{5,})(?=\/|$)/);
  return found ? { id: found[1] } : { error: '주소에서 플레이스 id 를 찾지 못했어요 — 가게 화면을 연 주소인지 봐 주세요.' };
}

/** 운영자가 id 를 찾으러 갈 네이버 지도 검색 주소. 이름만 넣는다 — 주소까지 넣으면 표기가 달라 검색이 비는 일이 잦다. */
export function naverMapSearchUrl(name: string): string {
  return `https://map.naver.com/p/search/${encodeURIComponent(`제주 ${name.trim()}`)}`;
}

/**
 * 네이버 지도 **길찾기** 주소 — 출발지는 비우고(현재 위치) 목적지 하나를 좌표로 넣는다(16 P4 의 한 곳짜리).
 *
 * 앱 스킴(`nmap://navigation`)이 아니라 **웹 주소**인 이유: 스킴은 앱이 없는 기기에서 아무 반응이 없고, iOS 는 열렸는지도
 * 알 수 없어 타임아웃 폴백이 필요하다. 웹 길찾기는 어디서나 열리고 폰에서는 네이버가 "앱으로 열기" 를 띄운다 — 우리가
 * 앱 유무를 판별하지 않는다. 좌표가 없는 곳(122곳 중 3곳)은 `undefined` 라 버튼이 서지 않는다.
 *
 * 주소 꼴은 `/p/directions/{출발}/{도착}/{경유}/{이동수단}` — **경유가 도착 뒤에** 온다. 비우는 칸은 `-`, 지점은 `naverDirectionsPoint`.
 * **이동수단 칸은 적지 않는다** — `/car` 로 못 박으면 "대중교통은 네이버로 나가서 본다"(10 §6) 는 약속인데 나간 화면이 차로 열린다
 * (14 W261010.21). 칸을 빼면 네이버가 고르는 기본 수단으로 열리고 거기서 탭으로 바꾼다. ⚠️ 네이버 웹이 수단 없는 주소를 받는지는
 * **실기기 확인 전**이다(16 H.1) — 안 받으면 이 한 줄에 `/transit` 이나 `/walk` 를 붙인다. 여러 곳은 `naverRouteLink.ts`(경유는 차만 된다).
 */
export function naverDirectionsUrl(place: { name: string; geo?: { lat: number; lng: number } }): string | undefined {
  if (!place.geo) return undefined;
  return `https://map.naver.com/p/directions/-/${naverDirectionsPoint(place.name, place.geo)}/-`;
}

/**
 * 길찾기 주소의 지점 한 칸 — `{lng},{lat},{이름}`(**경도가 먼저다**). 한 곳짜리와 경유지 주소가 이 하나를 나눠 써야
 * 순서가 두 군데서 따로 적혀 갈라지지 않는다. 이름의 `/`·`,` 는 칸 구분자라 인코딩이 꼭 필요하다.
 */
export function naverDirectionsPoint(name: string, geo: { lat: number; lng: number }): string {
  return `${geo.lng},${geo.lat},${encodeURIComponent(name.trim())}`;
}
