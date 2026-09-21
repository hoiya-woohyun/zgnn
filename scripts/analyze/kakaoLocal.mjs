// AI 가 뽑은 장소 이름으로 Kakao 로컬 키워드 검색을 돌려 좌표·주소를 보강하고, 주소에서 지역(regionRaw)을 추론한다.
// Kakao 를 쓰는 이유 — 지도가 이미 Kakao 라 좌표계가 같고, m.place.naver.com HTML 파싱은 약관·차단 위험이 있다(docs/todo/03).
//
// 원칙은 "지어내지 않는다" 다. 검색 결과 중 이름이 닮은 것이 없으면 좌표를 비워 두고(null), 주소의 읍·면이 기존 86곳에
// 없거나 기존 데이터 안에서 방향이 갈리면(안덕면: 남쪽 1 · 서쪽 1) regionRaw 를 '' 로 둔다 — 사람이 Studio 에서 정한다.
//
// 함정 두 가지를 테스트로 못 박아 뒀다(kakaoLocal.test.mjs):
//  - Kakao 의 x 가 경도(lng), y 가 위도(lat) 이고 둘 다 **문자열**로 온다. 뒤집거나 문자열 그대로 두면 지도에서 조용히 사라진다.
//  - 한글에는 \b 가 안 먹는다. "중산간동로"·"탑동로11길" 에서 '간동'·'탑동' 을 읍·면·동으로 잘못 뽑지 않게 토큰 단위로 본다.
//
// I/O 는 searchKakaoPlace 하나뿐이고 fetchImpl 을 주입받아 테스트한다. 키·응답 본문·헤더는 로그에 남기지 않는다(docs/todo/05).
import { nameSimilarity, townOf } from './matchPlace.mjs';

const KAKAO_KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

/** 검색어에 '제주 ' 접두를 붙인다 — 이미 '제주' 로 시작하면("제주애견펜션 쉼멍스테이") 겹쳐 붙이지 않는다. */
export function toKakaoQuery(query) {
  const q = (query ?? '').trim();
  return q.startsWith('제주') ? q : `제주 ${q}`;
}

/**
 * Kakao 로컬 키워드 검색. 결과가 없으면 []. 비 2xx 면 status 와 query 만 담아 throw 한다 — 키는 헤더에만 있고 URL 에 없다.
 * @param {string} query   장소 이름(접두 '제주 ' 는 여기서 붙인다)
 * @param {string} restKey KAKAO_REST_API_KEY (지도 JS 키와 다른 키)
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<object[]>} documents[] — place_name · address_name · road_address_name · x(lng) · y(lat) · category_name · place_url · id
 */
export async function searchKakaoPlace(query, restKey, fetchImpl = fetch) {
  const q = toKakaoQuery(query);
  const url = new URL(KAKAO_KEYWORD_URL);
  url.searchParams.set('query', q);

  const res = await fetchImpl(url, { headers: { Authorization: `KakaoAK ${restKey}` }, signal: AbortSignal.timeout(15_000) });
  // status 를 에러에 실어 두는 이유 — 401/403(키 문제)은 잠깐의 장애가 아니라 실행 전체를 세워야 하는 설정 오류다(analyze-candidates.mjs).
  if (!res.ok) throw Object.assign(new Error(`Kakao 로컬 검색 실패: status=${res.status} query=${q}`), { status: res.status });
  const body = await res.json();
  return Array.isArray(body?.documents) ? body.documents : [];
}

/** Kakao 는 "제주특별자치도 제주시 …" 로 주고, 기존 86곳은 네이버식 "제주 제주시 …" 다. 새 행이 기존 행과 같은 꼴이 되게 앞머리만 맞춘다. */
function shortenJejuPrefix(address) {
  return (address ?? '').replace(/^제주특별자치도(?=\s)/, '제주');
}

/** Kakao 좌표 문자열 → 숫자. Number('') 은 0 이라 빈 값이 (0, 0) 좌표로 둔갑한다 — 빈 문자열은 NaN 으로 떨어뜨린다. */
function parseCoord(value) {
  const s = String(value ?? '').trim();
  return s === '' ? NaN : Number(s);
}

/**
 * 검색 결과 중 제주 주소이면서 place_name 이 후보 이름과 **정규화 후 완전 일치**(nameSimilarity 1)하는 첫 것. 없으면 null — 좌표를 지어내지 않는다.
 * 부분 일치(0.7)는 받지 않는다: "고기부엌" 검색에 "협재고기부엌"·"성산고기부엌" 이 같이 오면 엉뚱한 가게의 좌표·주소·category 가
 * 후보에 실리고, 그대로 places 에 쓰인다(리뷰에서 재현). 이름 비교는 matchPlace.mjs 의 nameSimilarity 를 그대로 쓴다(별칭·"카페" 접미 처리 공유).
 * 같은 이름이 여럿이면(우도 카페살레 vs 본섬 동명) AI 가 본문에서 읽은 읍·면(town)이 주소에 있는 것을 우선하고, 없으면 Kakao 정확도순 첫 것.
 * town 이 있는데 그 읍·면의 결과가 하나도 없어도 첫 것을 쓴다 — Kakao 주소 표기가 AI 표기와 어긋날 수 있어, 대조 단계(matchPlace)의 지역 신호가 다시 거른다.
 * @param {object[]} documents  searchKakaoPlace 의 반환값
 * @param {{ name: string, town?: string | null }} candidate
 * @returns {{ lat: number, lng: number, address: string, kakaoPlaceUrl: string | null, category: string | null } | null}
 */
export function pickKakaoPlace(documents, { name, town = null }) {
  let best = null;
  for (const doc of documents ?? []) {
    if (!(doc?.address_name ?? '').startsWith('제주')) continue;
    const lat = parseCoord(doc.y);
    const lng = parseCoord(doc.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (nameSimilarity(doc.place_name ?? '', name) !== 1) continue;
    const inTown = town != null && townOf(doc.address_name) === town;
    if (inTown) {
      best = { doc, lat, lng };
      break;
    }
    if (!best) best = { doc, lat, lng };
  }
  if (!best) return null;

  const { doc, lat, lng } = best;
  // category_name 은 "음식점 > 카페 > 커피전문점" 꼴. 화면(placeCard)의 categoryLabel 은 한 단어를 기대하므로 마지막 마디만 둔다.
  const category = (doc.category_name ?? '').split('>').map((s) => s.trim()).filter(Boolean).at(-1) ?? null;
  return {
    lat,
    lng,
    address: shortenJejuPrefix(doc.road_address_name || doc.address_name),
    kakaoPlaceUrl: doc.place_url || null,
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
