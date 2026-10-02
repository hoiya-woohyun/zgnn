// 승인된 후보(candidates.status='approved')를 places 행으로 바꾸는 순수 함수들. I/O 없음 — 쓰는 쪽은 apply-approved.mjs,
// 테스트는 applyApproved.test.mjs. 무엇을 왜 채우고 안 채우는지는 docs/todo/03-analyze-and-review.md 가 정본.
//
// 원칙 하나 — **사람이 쓴 칸은 AI 가 덮지 않는다.** 기존 장소에 병합할 때는 비어 있는 칸(null · '')만 채운다.
// features·pet_policy_text 는 와이프가 손으로 쓴 문장이고, 그걸 블로그에서 뽑은 문장으로 덮으면 조용히 데이터가 썩는다.
// 다른 값이 필요하면 사람이 reviewer_note 에 적고 Studio 에서 고친다 — 코드가 판단하지 않는다.
//
// 컬럼명은 places 테이블 그대로 snake_case 다(supabase/migrations/20260920124849_zgnn_schema.sql). camelCase 로
// 바꾸는 건 pull-db.mjs 의 일이고, 여기서는 DB 에 쓸 모양을 만든다.

import { parseRegion } from '../lib/placeFields.mjs';

/** null · undefined · 공백뿐인 문자열을 "비어 있음" 으로 본다. 숫자(lat/lng)는 이 함수로 보지 않는다 — 0 은 값이다. */
const isBlank = (v) => v == null || String(v).trim() === '';

/** extracted 의 문자열 값을 patch 에 넣을 모양으로 — 양끝 공백 제거. 비어 있으면 null(= 채울 게 없다). */
const text = (v) => (isBlank(v) ? null : String(v).trim());

/**
 * 사람이 검수 화면에서 넣은 플레이스 id(`src/lib/adminEdit.ts`). 숫자 마디만 받는다 — 폼이 이미 거르지만 Studio 로 고친 값도 여기를 지난다.
 * 검색이 준 `naverLink` 는 여기 오지 않는다(아래 "건드리지 않는 칸" 주석) — 그쪽은 사람이 확인한 값이 아니다.
 */
const placeIdOf = (extracted) => {
  const id = text(extracted?.naverPlaceId);
  return id && /^\d+$/.test(id) ? id : null;
};

/** 플레이스 id → `naver_url`. 시드의 `naver.me` 단축 링크와 모양은 달라도 같은 곳(플레이스 홈)으로 간다. */
export const naverPlaceHomeUrl = (id) => `https://m.place.naver.com/place/${id}/home`;

/**
 * 후보의 홈페이지 카드(`extracted.homepage`, homepageCard.mjs) → places 세 칸. 주소가 http(s) 가 아니면 카드 전체를 버리고,
 * 사진은 https 일 때만 남긴다 — Studio 로 고친 값도 여기를 지난다. 카드가 없으면 null.
 */
export function homepageColumns(extracted) {
  const card = extracted?.homepage;
  const url = text(card?.url);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const image = text(card?.image);
  return {
    homepage_url: url,
    homepage_name: text(card?.siteName),
    homepage_image: image && /^https:\/\//i.test(image) ? image : null,
  };
}

/** { lat, lng } 둘 다 숫자일 때만 좌표로 인정한다. 한쪽만 있으면 toPlace 가 geo 를 통째로 버리므로 반쪽 채움은 의미가 없다. */
const validGeo = (geo) =>
  geo != null && typeof geo.lat === 'number' && typeof geo.lng === 'number' && Number.isFinite(geo.lat) && Number.isFinite(geo.lng);

/**
 * 기존 places 행의 빈 칸만 extracted 값으로 채우는 patch. 채울 게 없으면 null — 호출자는 update 자체를 건너뛴다
 * (빈 update 도 places_set_updated_at 트리거가 updated_at 을 건드린다).
 *
 * 채우는 칸: address · lat+lng(둘 다 비어 있을 때만, 쌍으로) · region_raw · features · pet_policy_text(+pet_policy 를 같은 후보 것으로) · category ·
 *   review_url · stay_price_text · stay_amenities_text(숙소만).
 *   category 는 TExtractedPlace 에 없고 naverLocal(pickNaverPlace)이 한 단어("커피전문점")로 주는 값이라, 분석 단계가
 *   extracted 에 실어 줬을 때만 채운다 — 없으면 아무 일도 없다.
 *   pet_policy(AI 구조화 판단)는 **pet_policy_text 를 채울 때만 함께** 채운다 — 사람이 쓴 원문이 있는 곳에 다른 글의 판단을 얹지 않는다(ADR-017).
 *   review_url·stay_* 는 시드 86곳이 전부 차 있어 영향이 없고, 블로그 draft 끼리 보강될 때만 채워진다(2026-09-28 설계 검토 FF-2·FF-8).
 *   naver_place_id(+ 비어 있으면 naver_url) — **사람이 검수 화면에서 넣은 `naverPlaceId` 가 있을 때만**(2026-09-30, ADR-002 v2).
 *   이 id 가 있어야 상세에 '사진 보기' 가 생긴다.
 *   homepage_url·homepage_name·homepage_image — 분석이 공식 홈페이지에서 읽은 카드. 세 칸을 한 벌로, homepage_url 이 빈 곳에만.
 * 건드리지 않는 칸: status · source · sort.
 *   naver_url 에는 naverLink 를 넣지 않는다. 벤더가 네이버로 바뀌어 이름은 맞아 보이지만, 지역 검색의 link 는 공식 문서상
 *   "업체, 기관의 상세 정보 URL" 이라 **네이버 플레이스가 아니라 업체 홈페이지일 수 있고 비어 있는 경우도 많다**(문서 예제부터 비었다).
 *   naver_url 은 사람이 확인한 플레이스 주소를 담는 칸이라, 검색이 준 링크를 자동으로 채우면 조용한 오염이 된다. Studio 에서 사람이 넣는다.
 *
 * @param {object} existingRow  places 행(snake_case)
 * @param {object} extracted    candidates.extracted jsonb — { ...TExtractedPlace, geo, naverLink, regionRaw, match }
 * @param {{ postUrl?: string | null }} [opts]  review_url 이 빌 때 채울 글 링크
 * @returns {object | null}
 */
export function mergeIntoExisting(existingRow, extracted, { postUrl = null } = {}) {
  const patch = {};

  const address = text(extracted?.address);
  if (isBlank(existingRow.address) && address) patch.address = address;

  if (existingRow.lat == null && existingRow.lng == null && validGeo(extracted?.geo)) {
    patch.lat = extracted.geo.lat;
    patch.lng = extracted.geo.lng;
  }

  const regionRaw = text(extracted?.regionRaw);
  if (isBlank(existingRow.region_raw) && regionRaw) patch.region_raw = regionRaw;

  const features = text(extracted?.features);
  if (isBlank(existingRow.features) && features) patch.features = features;

  const petPolicyText = text(extracted?.petPolicyText);
  if (isBlank(existingRow.pet_policy_text) && petPolicyText) {
    patch.pet_policy_text = petPolicyText;
    if (extracted?.petPolicy && typeof extracted.petPolicy === 'object') patch.pet_policy = extracted.petPolicy;
  }

  const category = text(extracted?.category);
  if (isBlank(existingRow.category) && category) patch.category = category;

  const reviewUrl = text(postUrl);
  if (isBlank(existingRow.review_url) && reviewUrl) patch.review_url = reviewUrl;

  // id 와 주소는 **짝으로** 채운다 — id 만 있고 주소가 다른 가게를 가리키면 '지도에서 열기' 와 '사진 보기' 가 다른 가게로 간다.
  // 그래서 주소는 id 를 채울 때만, 비어 있을 때만 만든다(사람이 넣은 단축 링크를 덮지 않는다).
  const placeId = placeIdOf(extracted);
  if (isBlank(existingRow.naver_place_id) && placeId) {
    patch.naver_place_id = placeId;
    if (isBlank(existingRow.naver_url)) patch.naver_url = naverPlaceHomeUrl(placeId);
  }

  // 홈페이지 카드는 **세 칸을 한 벌로** — 주소가 빈 곳에만 채운다. 사진만 따로 채우면 사람이 비운 사진(업체 요청)이 되살아난다.
  // 행에 칸 자체가 없으면(마이그레이션 20260930120000 전) 건드리지 않는다 — 없는 칸에 쓰면 PostgREST 가 update 를 통째로 거절한다.
  const homepage = homepageColumns(extracted);
  if (homepage && 'homepage_url' in existingRow && isBlank(existingRow.homepage_url)) Object.assign(patch, homepage);

  if (existingRow.type === 'stay') {
    const stayPriceText = text(extracted?.stayPriceText);
    if (isBlank(existingRow.stay_price_text) && stayPriceText) patch.stay_price_text = stayPriceText;
    const stayAmenitiesText = text(extracted?.stayAmenitiesText);
    if (isBlank(existingRow.stay_amenities_text) && stayAmenitiesText) patch.stay_amenities_text = stayAmenitiesText;
    // 환경은 칸이 있는 행에만, 비어 있을 때만(사람이 Studio 에서 넣은 값을 덮지 않는다).
    const environment = stayEnvironmentOf(extracted);
    if (environment && 'stay_environment' in existingRow && existingRow.stay_environment == null) patch.stay_environment = environment;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

const PLACE_TYPES = new Set(['stay', 'restaurant', 'cafe']);

/** 후보의 숙소 환경 — 칸 넷이 다 null 이면 없는 것으로(빈 판단을 칸에 쓰지 않는다). */
function stayEnvironmentOf(extracted) {
  const env = extracted?.stayEnvironment;
  if (!env || typeof env !== 'object') return null;
  const picked = { standalone: env.standalone ?? null, yard: env.yard ?? null, fencedYard: env.fencedYard ?? null, stairs: env.stairs ?? null };
  return Object.values(picked).some((value) => value !== null) ? picked : null;
}

/**
 * **최신본으로 저장하기**(검수 화면, 2026-09-30) — 기존 행을 후보의 값으로 **덮어쓰는** patch 와, 덮이기 전 값.
 *
 * 위 `mergeIntoExisting` 의 원칙("사람이 쓴 칸은 AI 가 덮지 않는다")의 예외가 아니라 그 원칙의 다른 절반이다 —
 * 덮는 것을 **코드가 정하지 않고 사람이 정한다.** 재분석(프롬프트를 고쳐 같은 글을 다시 읽힘) 뒤에 나온 후보는 기존 장소에
 * 짝이 붙는데, 빈 칸만 채우는 합치기로는 새 판단이 한 칸도 들어가지 않는다(기존 칸이 다 차 있어서). 그래서 운영자가
 * 칸별 전·후를 본 뒤(`src/lib/adminLatest.ts`) 이 버튼을 눌렀을 때만 이 함수가 돈다. CLI 에는 이 길이 없다.
 *
 * 규칙: **후보에 값이 있고 기존과 다른 칸만** 덮는다 — 후보가 비어 있는 칸은 지우지 않는다(비어 있음은 "새 판단" 이 아니라 "못 읽음" 이다).
 * 짝으로 움직이는 칸은 짝으로 덮는다: lat+lng · pet_policy_text+pet_policy(원문이 바뀌면 옛 판단은 옛 원문의 것이라 함께 바꾼다,
 * 후보에 판단이 없으면 null) · naver_place_id+naver_url · 홈페이지 세 칸. review_url·status·source·sort 는 건드리지 않는다.
 *
 * `previous` 는 덮기 전 값이다 — 빈 칸만 채운 합치기는 "그 칸을 비우면" 되돌려지지만 덮어쓴 칸은 그렇게 안 된다.
 * 호출자가 `extracted.applied.overwritten` 에 남긴다.
 *
 * **칸 고르기**(docs/todo/11 U7) — `only` 를 주면 그 칸만 덮는다. 짝 칸은 하나만 골라도 **함께** 들어간다(`OVERWRITE_PAIRS` —
 * 원문만 바꾸고 옛 판단을 두면 판단이 다른 원문의 것이 된다). `only` 의 이름은 patch 칸 이름이고 좌표는 `geo`(또는 lat·lng)로 부른다.
 * `only: []` 는 "아무 칸도 안 골랐다" 라 null 이다. 규칙(무엇이 다른 칸인가)은 그대로이고 거르기만 더한다.
 *
 * @param {{ only?: string[] }} [opts]
 * @returns {{ patch: object, previous: object } | null}  바꿀 칸이 없으면 null
 */
export function overwriteWithLatest(existingRow, extracted, { only } = {}) {
  const patch = {};
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const put = (col, value) => {
    if (!same(existingRow[col], value)) patch[col] = value;
  };

  const name = text(extracted?.name);
  if (name) put('name', name);
  if (PLACE_TYPES.has(extracted?.type)) put('type', extracted.type);
  const regionRaw = text(extracted?.regionRaw);
  // 형식이 안 맞는 지역(`unknown`)으로 덮으면 읍·면 칩과 방향 필터에서 그 장소가 빠진다 — 그때는 기존 값을 둔다.
  if (regionRaw && parseRegion(regionRaw).direction !== 'unknown') put('region_raw', regionRaw);
  const address = text(extracted?.address);
  if (address) put('address', address);
  if (validGeo(extracted?.geo) && (existingRow.lat !== extracted.geo.lat || existingRow.lng !== extracted.geo.lng)) {
    patch.lat = extracted.geo.lat;
    patch.lng = extracted.geo.lng;
  }
  const features = text(extracted?.features);
  if (features) put('features', features);

  const petPolicyText = text(extracted?.petPolicyText);
  const petPolicy = extracted?.petPolicy && typeof extracted.petPolicy === 'object' ? extracted.petPolicy : null;
  if (petPolicyText && (!same(existingRow.pet_policy_text, petPolicyText) || !same(existingRow.pet_policy, petPolicy))) {
    patch.pet_policy_text = petPolicyText;
    patch.pet_policy = petPolicy;
  }

  const category = text(extracted?.category);
  if (category) put('category', category);

  const placeId = placeIdOf(extracted);
  if (placeId && existingRow.naver_place_id !== placeId) {
    patch.naver_place_id = placeId;
    patch.naver_url = naverPlaceHomeUrl(placeId);
  }

  const homepage = homepageColumns(extracted);
  if (homepage && 'homepage_url' in existingRow && Object.entries(homepage).some(([col, value]) => !same(existingRow[col], value))) {
    Object.assign(patch, homepage);
  }

  if ((patch.type ?? existingRow.type) === 'stay') {
    const stayPriceText = text(extracted?.stayPriceText);
    if (stayPriceText) put('stay_price_text', stayPriceText);
    const stayAmenitiesText = text(extracted?.stayAmenitiesText);
    if (stayAmenitiesText) put('stay_amenities_text', stayAmenitiesText);
    const environment = stayEnvironmentOf(extracted);
    if (environment && 'stay_environment' in existingRow && JSON.stringify(existingRow.stay_environment) !== JSON.stringify(environment)) {
      patch.stay_environment = environment;
    }
  }

  if (only) {
    const keep = expandOverwriteColumns(only);
    for (const col of Object.keys(patch)) if (!keep.has(col)) delete patch[col];
  }
  const cols = Object.keys(patch);
  if (!cols.length) return null;
  return { patch, previous: Object.fromEntries(cols.map((col) => [col, existingRow[col] ?? null])) };
}

/**
 * 함께 움직이는 칸들(`overwriteWithLatest` 가 짝으로 덮는 것과 같은 묶음). 하나를 고르면 묶음 전부가 들어간다.
 * `geo` 는 화면이 좌표 한 줄(lat·lng)을 부르는 이름이다(`src/lib/adminLatest.ts`).
 */
export const OVERWRITE_PAIRS = [
  ['pet_policy_text', 'pet_policy'],
  ['geo', 'lat', 'lng'],
  ['naver_place_id', 'naver_url'],
  ['homepage_url', 'homepage_name', 'homepage_image'],
];

/** 고른 칸 → 짝까지 펼친 칸 집합. */
export function expandOverwriteColumns(only) {
  const keep = new Set(only);
  for (const pair of OVERWRITE_PAIRS) if (pair.some((col) => keep.has(col))) for (const col of pair) keep.add(col);
  return keep;
}



/**
 * 신규 장소 후보 → places 행. status 는 'draft' — published 로 올리는 건 사람이 Studio 에서 한다(03 의 🙋).
 * data:pull 은 published 만 가져오므로, 이 행은 사람이 올리기 전까지 화면에 뜨지 않는다.
 *
 * type 'other' 는 신규 장소가 될 수 없다(숙소·식당·카페 아님). 분석 단계가 후보를 안 만드는 게 원칙이지만,
 * 사람이 Studio 에서 extracted 를 고치다 생길 수 있어 여기서 한 번 더 막는다 — DB 의 check 제약보다 먼저,
 * 읽을 수 있는 메시지로.
 *
 * @param {object} candidate  candidates 행 — { id, post_url, extracted, match_place_id, ... }
 * @param {{ id: string, environmentColumn?: boolean }} opts  새 행의 id. 호출자가 crypto.randomUUID() 로 만든다(dry-run 에서도 같은 코드가 돌게).
 *   `environmentColumn` — 원격 `places` 에 `stay_environment` 칸이 있나(마이그레이션 20261001160000). 없으면 그 칸을 싣지 않는다.
 */
export function toNewPlaceRow(candidate, { id, environmentColumn = false }) {
  const extracted = candidate.extracted ?? {};
  const type = extracted.type;
  // permanent: 다음 실행에도 같다 — apply-approved.mjs 가 후보를 pending 으로 되돌리고 reviewer_note 에 사유를 남긴다(매 실행 빨갛게 되지 않게).
  if (type === 'other') throw Object.assign(new Error(`후보 ${candidate.id}: type 'other' 는 신규 장소가 될 수 없다`), { permanent: true });
  if (!PLACE_TYPES.has(type)) throw Object.assign(new Error(`후보 ${candidate.id}: type '${type}' 은 places.type 에 없다`), { permanent: true });

  const name = text(extracted.name);
  if (!name) throw Object.assign(new Error(`후보 ${candidate.id}: name 이 비어 있다`), { permanent: true });

  // 지역이 없으면 카드의 읍·면 칩이 비고 헤더가 '기타' 가 된다(설계 검토 FF-4). 반영을 막고 사람이 Studio 에서 extracted.regionRaw 를 채우게 한다.
  const regionRaw = text(extracted.regionRaw);
  if (!regionRaw || parseRegion(regionRaw).direction === 'unknown') {
    throw Object.assign(
      new Error(`후보 ${candidate.id}: regionRaw 가 없거나 "동쪽 (구좌읍)" 형식이 아니다 — extracted.regionRaw 를 채운 뒤 다시 승인`),
      { permanent: true },
    );
  }

  const geo = validGeo(extracted.geo) ? extracted.geo : null;
  const petPolicyText = text(extracted.petPolicyText);
  const placeId = placeIdOf(extracted);

  return {
    id,
    type,
    name,
    region_raw: regionRaw,
    features: text(extracted.features) ?? '',
    pet_policy_text: petPolicyText ?? '',
    // AI 구조화 판단은 원문이 있을 때만 의미가 있다(ADR-017).
    pet_policy: petPolicyText && extracted.petPolicy && typeof extracted.petPolicy === 'object' ? extracted.petPolicy : null,
    review_url: candidate.post_url ?? null,
    naver_url: placeId ? naverPlaceHomeUrl(placeId) : null,
    naver_place_id: placeId,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    address: text(extracted.address),
    category: text(extracted.category),
    stay_price_text: type === 'stay' ? text(extracted.stayPriceText) : null,
    stay_amenities_text: type === 'stay' ? text(extracted.stayAmenitiesText) : null,
    sort: null,
    status: 'draft',
    source: 'blog',
    // 카드가 있을 때만 칸을 싣는다. 분석이 마이그레이션 20260930120000 을 확인한 뒤에만 카드를 만들므로(analyze-candidates.mjs)
    // 카드 없는 후보의 insert 는 그 마이그레이션 전후 어느 쪽에서도 같은 모양이다.
    ...homepageColumns(extracted),
    // 숙소 환경(10 F6) — 칸이 있는 원격에만, 숙소이고 값이 있을 때만.
    ...(environmentColumn && type === 'stay' && stayEnvironmentOf(extracted) ? { stay_environment: stayEnvironmentOf(extracted) } : {}),
  };
}

/**
 * 승인된 후보를 matchPlace 에 다시 넣을 때의 입력. 분석 때와 달리 좌표·주소는 extracted 에 이미 합쳐져 있다(toCandidateRow).
 * apply 가 다시 대조하는 이유 — 같은 새 가게를 말하는 글 둘이 같은 실행에 pending 이었다가 따로 승인되면, 분석 시점엔 서로를 모르므로
 * 둘 다 '신규' 다. 반영 시점에 현재 places(방금 만든 draft 포함)와 다시 대조해야 두 번째가 첫 번째로 합쳐진다(리뷰 지적).
 */
export function toRecheckCandidate(candidate) {
  const extracted = candidate.extracted ?? {};
  return {
    name: extracted.name,
    type: extracted.type,
    // 사람이 넣은 id 가 있으면 재대조도 그것으로 1.0 짝을 낸다 — 같은 가게가 두 후보로 따로 승인될 때 둘째가 첫째로 합쳐진다.
    naverPlaceId: placeIdOf(extracted) ?? undefined,
    geo: validGeo(extracted.geo) ? extracted.geo : undefined,
    address: text(extracted.address) ?? undefined,
    // 분석 때 matchPlace 가 본 값(AI 원본)을 우선 — regionRaw 는 정리된 값이라 분석·반영의 지역 신호가 어긋날 수 있다(리뷰 지적).
    regionRaw: text(extracted.regionRawAi) ?? text(extracted.regionRaw) ?? undefined,
  };
}
