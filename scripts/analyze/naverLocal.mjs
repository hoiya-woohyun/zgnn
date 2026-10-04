// AI 가 뽑은 장소 이름으로 **네이버 지역 검색**을 돌려 좌표·주소를 보강하고, 주소에서 지역(regionRaw)을 추론한다.
// 네이버로 옮긴 이유 — 지도가 네이버이고(ADR-008 v4), 무엇보다 **02(수집)이 이미 쓰는 것과 같은 키**(NAVER_CLIENT_ID/SECRET)라
// 키를 하나 더 발급·관리하지 않아도 된다. m.place.naver.com HTML 파싱은 약관·차단 위험이 있어 쓰지 않는다(docs/todo/03).
//
// 원칙은 "지어내지 않는다" 다. 검색 결과 중 이름이 닮은 것이 없으면 좌표를 비워 두고(null), 주소의 읍·면이 기존 86곳에
// 없거나 기존 데이터 안에서 방향이 갈리면(안덕면: 남쪽 1 · 서쪽 1) regionRaw 를 '' 로 둔다 — 사람이 Studio 에서 정한다.
//
// 함정 네 가지를 테스트로 못 박아 뒀다(naverLocal.test.mjs):
//  - **mapx 가 경도(lng), mapy 가 위도(lat)** 이고 **WGS84 를 10^7 배한 정수**로 온다. 뒤집거나 나누기를 빼면 지도에서 조용히 사라진다.
//  - **공식 문서가 스스로 모순된다.** 본문은 "WGS84 좌표계 기준" 이라 적고, 응답 예제는 옛 KATECH 6자리(`<mapx>311277</mapx>`)를
//    그대로 두고 있다. 그래서 값을 믿지 않고 **나눈 결과가 제주 범위인지 검사**한다 — KATECH 이 오면 0.03 쯤이 되어 저절로 걸린다.
//    포맷이 또 바뀌어도 잘못된 좌표가 places 에 들어가는 대신 "좌표 없음" 으로 떨어진다.
//  - **title 에 <b> 태그가 섞여 온다**("제주 <b>솔숲펜션</b>"). 안 벗기면 이름 비교가 영원히 안 맞는다.
//  - 한글에는 \b 가 안 먹는다. "중산간동로"·"탑동로11길" 에서 '간동'·'탑동' 을 읍·면·동으로 잘못 뽑지 않게 토큰 단위로 본다.
//
// I/O 는 searchNaverPlace 하나뿐이고 fetchImpl 을 주입받아 테스트한다. 키·응답 본문·헤더는 로그에 남기지 않는다(docs/todo/05) —
// 실패 응답의 errorCode 와 우리가 쓴 라벨만 예외다(`lib/naverApiError.mjs`).
import { naverErrorTail } from '../lib/naverApiError.mjs';
import { NAVER_LOCAL_SEARCH_URL, naverAuthHeaders } from '../lib/naverSearchApi.mjs';
import { nameSimilarity, siOf, townOf } from './matchPlace.mjs';

const NAVER_LOCAL_URL = NAVER_LOCAL_SEARCH_URL; // 규격은 lib/naverSearchApi.mjs 가 정본(개발자센터 아님 — API HUB)

/** 지역 검색의 display 상한. 공식 문서값이고 늘릴 수 없다 — Kakao(15)보다 좁아 동명 구분이 약한 자리다. */
const DISPLAY_MAX = 5;

/** 검색어에 '제주 ' 접두를 붙인다 — 이미 '제주' 로 시작하면("제주애견펜션 쉼멍스테이") 겹쳐 붙이지 않는다. */
export function toNaverQuery(query) {
  const q = (query ?? '').trim();
  return q.startsWith('제주') ? q : `제주 ${q}`;
}

/**
 * 네이버가 title 에 실어 보내는 검색어 강조 태그와 HTML 엔티티를 벗긴다.
 * 태그를 안 벗기면 nameSimilarity 가 "제주 <b>솔숲펜션</b>" 과 "솔숲펜션" 을 영영 다른 이름으로 본다.
 */
export function stripTags(text) {
  return (text ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * 네이버 지역 검색. 결과가 없으면 []. 비 2xx 면 status 와 query 만 담아 throw 한다 — 키는 헤더에만 있고 URL 에 없다.
 * @param {string} query         장소 이름(접두 '제주 ' 는 여기서 붙인다)
 * @param {{ clientId: string, clientSecret: string }} keys  NAVER_CLIENT_ID · NAVER_CLIENT_SECRET(02 수집과 같은 키)
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<object[]>} items[] — title(<b> 섞임) · link · category · address · roadAddress · mapx(lng) · mapy(lat)
 */
export async function searchNaverPlace(query, { clientId, clientSecret }, fetchImpl = fetch) {
  const q = toNaverQuery(query);
  const url = new URL(NAVER_LOCAL_URL);
  url.searchParams.set('query', q);
  url.searchParams.set('display', String(DISPLAY_MAX));

  const res = await fetchImpl(url, {
    headers: naverAuthHeaders(clientId, clientSecret),
    signal: AbortSignal.timeout(15_000),
  });
  // status 를 에러에 실어 두는 이유 — 401/403(키 문제)은 잠깐의 장애가 아니라 실행 전체를 세워야 하는 설정 오류다(analyze-candidates.mjs).
  // 꼬리표(errorCode·라벨)를 함께 싣는 이유는 수집과 같다: 401 의 원인이 값인지 애플리케이션 설정인지 status 로는 안 갈린다.
  if (!res.ok) {
    throw Object.assign(new Error(`네이버 지역 검색 실패: status=${res.status}${await naverErrorTail(res)} query=${q}`), { status: res.status });
  }
  const body = await res.json();
  return Array.isArray(body?.items) ? body.items : [];
}

/**
 * 네이버는 "제주특별자치도 …" 로 주고, 기존 86곳은 "제주 제주시 …" 다. 새 행이 기존 행과 같은 꼴이 되게 앞머리만 맞춘다.
 * Geocoding(naverGeocode.mjs)도 같은 앞머리로 주므로 여기 것을 그대로 쓴다 — 두 축이 만든 주소가 같은 꼴이어야 한다.
 */
export function shortenJejuPrefix(address) {
  return (address ?? '').replace(/^제주특별자치도(?=\s)/, '제주').trim();
}

/** 제주가 들어오는 범위. 바깥이면 좌표 형식이 우리가 아는 것과 다르다는 뜻이라 **버린다**(아래 parseNaverCoord 주석). */
const JEJU_BOUNDS = { latMin: 32.9, latMax: 33.7, lngMin: 125.9, lngMax: 127.1 };

/**
 * mapx/mapy(정수) → WGS84 도(度).
 *
 * 네이버는 좌표를 **10^7 배한 정수**로 준다(1269488419 → 126.9488419). 공식 문서 본문은 "WGS84 좌표계 기준" 이라고
 * 적었지만 **응답 예제는 옛 KATECH 6자리를 그대로 두고 있어** 문서만 보고는 확정할 수 없다. 그래서 나눈 뒤
 * 제주 범위인지 확인하고, 아니면 NaN 으로 떨어뜨린다 — KATECH(311277)이 오면 0.031 이 되어 저절로 걸린다.
 * 잘못된 좌표가 places 에 들어가는 것보다 "좌표 없음" 이 낫다(이 파일의 "지어내지 않는다" 원칙).
 */
export function parseNaverCoord(value) {
  const s = String(value ?? '').trim();
  if (s === '') return NaN;
  // 정수면 10^7 배한 값. **소수점이 있으면 이미 도(degree) 단위**라 그대로 쓴다 —
  // 예전엔 정수만 받아 소수 문자열("126.8488419")을 통째로 NaN 으로 떨어뜨렸는데,
  // 그러면 포맷이 정수가 아닐 경우 좌표 보강이 조용히 100% no-op 이 된다.
  // 어느 쪽이든 최종 판별은 아래 inJeju 가 한다(KATECH·10^6·10^8·lat/lng 스왑 전부 범위 밖).
  if (/^-?\d+$/.test(s)) return Number(s) / 1e7;
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  return NaN;
}

/**
 * pickNaverPlace 의 탈락 사유 계수기. **`data:analyze` 의 첫 실행이 좌표 포맷의 실측**이라
 * "왜 좌표가 안 붙었는가" 를 구별할 신호가 필요하다 — 이게 없으면 "포맷이 틀렸다" 와
 * "이름이 안 맞았다" 가 똑같이 `null` 로만 보이고, 운영자가 볼 단서는 "후보 N건" 뿐이다.
 * `sample` 은 처음 걸린 응답의 원시 `mapx`/`mapy` — 자릿수를 눈으로 보려고 남긴다(값은 좌표라 비밀이 아니다).
 */
export function newPickReasons() {
  return {
    notJejuAddress: 0,
    coordUnparsable: 0,
    coordOutOfJeju: 0,
    nameMismatch: 0,
    regionMismatch: 0,
    itemsButNoPick: 0,
    sample: null,
  };
}

/**
 * 좌표 쌍이 제주 안인가. 범위 밖이면 포맷이 우리가 아는 것과 다르다는 신호다.
 * 두 번째 축(naverGeocode.mjs)도 이 검사를 쓴다 — 범위를 두 곳에 적으면 한쪽만 고쳐져 축마다 다른 좌표를 받는다.
 */
export function inJeju(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= JEJU_BOUNDS.latMin && lat <= JEJU_BOUNDS.latMax &&
    lng >= JEJU_BOUNDS.lngMin && lng <= JEJU_BOUNDS.lngMax
  );
}

/**
 * 검색 결과 중 제주 주소이면서 title(태그 벗긴 것)이 후보 이름과 **정규화 후 완전 일치**(nameSimilarity 1)하는 첫 것. 없으면 null — 좌표를 지어내지 않는다.
 * 부분 일치(0.7)는 받지 않는다: "고기부엌" 검색에 "협재고기부엌"·"성산고기부엌" 이 같이 오면 엉뚱한 가게의 좌표·주소·category 가
 * 후보에 실리고, 그대로 places 에 쓰인다. 이름 비교는 matchPlace.mjs 의 nameSimilarity 를 그대로 쓴다(별칭·"카페" 접미 처리 공유).
 * AI 가 본문에서 읽은 지역과 **다른 지역의 동명 가게는 받지 않는다**: 읍·면(town)이 있으면 주소에 그 읍·면이 있는 것만, 시(si)가 있으면 시가 같은 것만.
 * 예전에는 맞는 것이 없으면 정확도순 첫 것으로 물러섰고, 그 길로 애월읍 글에 서귀포 동명 가게의 좌표가 붙었다(2026-10-04 실측, 114건 중 2건 —
 * 엔젤하우스 · 본카페). 못 고르면 null 이고 부르는 쪽이 원글 주소 → 좌표 축으로 물러선다. 지역을 모르면(둘 다 null) 정확도순 첫 것이다.
 * @param {object[]} items  searchNaverPlace 의 반환값
 * @param {{ name: string, town?: string | null, si?: string | null }} candidate
 * @returns {{ lat: number, lng: number, address: string, naverLink: string | null, category: string | null } | null}
 */
export function pickNaverPlace(items, { name, town = null, si = null }, reasons = null) {
  let best = null;
  let sawItem = false;
  for (const item of items ?? []) {
    sawItem = true;
    const address = item?.roadAddress || item?.address || '';
    if (!address.startsWith('제주')) {
      if (reasons) reasons.notJejuAddress++;
      continue;
    }
    const lat = parseNaverCoord(item.mapy);
    const lng = parseNaverCoord(item.mapx);
    if (!inJeju(lat, lng)) {
      // 좌표 포맷이 우리가 아는 것과 다르거나 제주 밖이다. 이 둘을 갈라 세는 이유는
      // **첫 실행이 곧 포맷의 실측**이기 때문이다 — 전 건이 여기서 떨어지면 포맷이 틀린 것이다.
      if (reasons) {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) reasons.coordUnparsable++;
        else reasons.coordOutOfJeju++;
        if (reasons.sample === null) reasons.sample = { mapx: item.mapx, mapy: item.mapy };
      }
      continue;
    }
    if (nameSimilarity(stripTags(item.title), name) !== 1) {
      if (reasons) reasons.nameMismatch++;
      continue;
    }
    const where = `${item.address ?? ''} ${item.roadAddress ?? ''}`;
    const itemSi = siOf(where);
    if ((town != null && townOf(where) !== town) || (si != null && itemSi != null && itemSi !== si)) {
      if (reasons) reasons.regionMismatch++;
      continue;
    }
    best = { item, lat, lng };
    break;
  }
  if (!best) {
    if (reasons && sawItem) reasons.itemsButNoPick++;
    return null;
  }

  const { item, lat, lng } = best;
  // category 는 "한식>육류,고기요리" 꼴. 화면(placeCard)의 categoryLabel 은 한 단어를 기대하므로 마지막 마디만 둔다.
  const category = (item.category ?? '').split('>').map((s) => s.trim()).filter(Boolean).at(-1) ?? null;
  return {
    lat,
    lng,
    address: shortenJejuPrefix(item.roadAddress || item.address),
    // 공식 문서가 "업체, 기관의 상세 정보 URL" 이라 하지만 예제에서도 비어 있고, 채워져도 네이버 플레이스가 아니라
    // 업체 홈페이지일 수 있다. 그래서 places.naver_url 에는 넣지 않고(applyApproved) Studio 에서 사람이 볼 단서로만 남긴다.
    naverLink: item.link || null,
    category,
  };
}

const DIRECTION_KR = { east: '동쪽', west: '서쪽', south: '남쪽', north: '북쪽' };

/**
 * 주소에서 지역 단위를 뽑는다. 토큰(공백 구분) 단위로 보는 이유 — 한글엔 \b 가 없어 "중산간동로" 의 '간동' 이 걸린다.
 * @returns {{ eupMyeon?: string, dong?: string, si?: string }}  각각 첫 번째로 나온 토큰
 */
export function extractAddressUnits(address) {
  const units = {};
  for (const token of (address ?? '').split(/\s+/)) {
    if (!units.eupMyeon && /^[가-힣]{1,4}[읍면]$/.test(token)) units.eupMyeon = token;
    else if (!units.dong && /^[가-힣]{1,4}동$/.test(token)) units.dong = token;
    else if (!units.si && /^[가-힣]{1,4}시$/.test(token)) units.si = token;
  }
  return units;
}

/** town → direction. 같은 town 이 기존 데이터에서 두 방향으로 갈리면(안덕면) 다수결, 동수면 null — 배열 순서가 몰래 정하게 두지 않는다. */
function directionOfTown(town, existingPlaces) {
  const counts = new Map();
  for (const place of existingPlaces ?? []) {
    const region = place?.region;
    if (!region || region.town !== town || !region.direction || region.direction === 'unknown') continue;
    counts.set(region.direction, (counts.get(region.direction) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return null;
  return sorted[0][0];
}

/**
 * 주소 → "동쪽 (구좌읍)" 꼴의 regionRaw. parseRegion(placeFields.mjs) 과 왕복이 맞는다 — 우도는 기존 행과 같은 '우도면' 그대로.
 * 읍·면이 있으면 그것만 본다(안덕면처럼 방향이 갈리면 '' — 시 로 뭉개지 않는다). 읍·면이 없는 시내 주소("제주시 노형동"·"서귀포시 소보리당로")는
 * 동 → 시 순으로 기존 town 을 찾는다 — 기존 데이터가 시내를 '북쪽 (제주시)'·'남쪽 (서귀포시)' 로 두기 때문이다.
 * @param {string} address
 * @param {Array<{ region: { direction: string, town: string } }>} existingPlaces  src/data/places.json
 * @returns {string} 못 정하면 ''
 */
export function inferRegionRaw(address, existingPlaces) {
  const units = extractAddressUnits(address);
  const towns = units.eupMyeon ? [units.eupMyeon] : [units.dong, units.si].filter(Boolean);
  for (const town of towns) {
    const direction = directionOfTown(town, existingPlaces);
    if (!direction) continue;
    if (direction === 'udo') return '우도면';
    const kr = DIRECTION_KR[direction];
    if (kr) return `${kr} (${town})`;
  }
  return '';
}
