/**
 * 네이버 플레이스의 **사진 탭** 주소. 사진은 가져오지 않고 그곳으로 보낸다(ADR-002 v2).
 *
 * 왜 가져오지 않나 — 플레이스 사진은 업주·방문자가 올린 것이고 네이버가 받은 이용 허락은 네이버 서비스 안에서만이다.
 * 공식 API 로도 받을 수 없어 긁어야 하는데, 그건 약관(자동 수집 금지)에 걸린다. 링크는 둘 다 피한다.
 *
 * `naverUrl` 로 만들지 않는 이유 — 시드 86곳의 `naverUrl` 은 전부 `naver.me` 단축 링크라 경로를 붙일 수 없다.
 * 숫자가 아닌 id 는 버린다: 잘못된 id 로 만든 주소는 네이버의 빈 화면으로 가고, 버튼이 없는 편이 낫다.
 */
export function naverPlacePhotoUrl(naverPlaceId?: string): string | undefined {
  const id = naverPlaceId?.trim();
  if (!id || !/^\d+$/.test(id)) return undefined;
  return `https://m.place.naver.com/place/${id}/photo`;
}

export type TNaverPlaceIdParse = { id: string | null } | { error: string };

/**
 * 운영자가 붙여 넣은 값 → 플레이스 id. 숫자 id 그대로이거나 네이버 플레이스·지도 주소다.
 *
 * 주소 꼴이 여럿이라(`m.place.naver.com/restaurant/{id}/home` · `pcmap.place.naver.com/…` · `map.naver.com/p/entry/place/{id}`)
 * 경로에서 **다섯 자리 이상 숫자 마디**를 찾는다. 호스트는 `naver.com` 으로 끝나야 한다 — 다른 사이트 주소의 숫자를 id 로 읽으면
 * 엉뚱한 가게의 사진 탭으로 보내고, `matchPlace` 는 그 id 로 **1.0 짝**을 낸다(`naverPlaceId 일치`).
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
 * 앱 유무를 판별하지 않는다. 좌표가 없는 곳(86곳 중 5곳)은 `undefined` 라 버튼이 서지 않는다.
 *
 * 주소 꼴은 `/p/directions/{출발}/{경유…}/{도착}/-/car` — 비우는 칸은 `-`, 지점은 `{lng},{lat},{이름}` 순(경도가 먼저다).
 */
export function naverDirectionsUrl(place: { name: string; geo?: { lat: number; lng: number } }): string | undefined {
  if (!place.geo) return undefined;
  const { lat, lng } = place.geo;
  return `https://map.naver.com/p/directions/-/${lng},${lat},${encodeURIComponent(place.name.trim())}/-/car`;
}
