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
 * 건드리지 않는 칸: naver_url · naver_place_id · status · source · sort.
 *   naver_url 에는 naverLink 도 넣지 않는다. 벤더가 네이버로 바뀌어 이름은 맞아 보이지만, 지역 검색의 link 는 공식 문서상
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

  if (existingRow.type === 'stay') {
    const stayPriceText = text(extracted?.stayPriceText);
    if (isBlank(existingRow.stay_price_text) && stayPriceText) patch.stay_price_text = stayPriceText;
    const stayAmenitiesText = text(extracted?.stayAmenitiesText);
    if (isBlank(existingRow.stay_amenities_text) && stayAmenitiesText) patch.stay_amenities_text = stayAmenitiesText;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

const PLACE_TYPES = new Set(['stay', 'restaurant', 'cafe']);

/**
 * 신규 장소 후보 → places 행. status 는 'draft' — published 로 올리는 건 사람이 Studio 에서 한다(03 의 🙋).
 * data:pull 은 published 만 가져오므로, 이 행은 사람이 올리기 전까지 화면에 뜨지 않는다.
 *
 * type 'other' 는 신규 장소가 될 수 없다(숙소·식당·카페 아님). 분석 단계가 후보를 안 만드는 게 원칙이지만,
 * 사람이 Studio 에서 extracted 를 고치다 생길 수 있어 여기서 한 번 더 막는다 — DB 의 check 제약보다 먼저,
 * 읽을 수 있는 메시지로.
 *
 * @param {object} candidate  candidates 행 — { id, post_url, extracted, match_place_id, ... }
 * @param {{ id: string }} opts  새 행의 id. 호출자가 crypto.randomUUID() 로 만든다(dry-run 에서도 같은 코드가 돌게).
 */
export function toNewPlaceRow(candidate, { id }) {
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
    naver_url: null,
    naver_place_id: null,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    address: text(extracted.address),
    category: text(extracted.category),
    stay_price_text: type === 'stay' ? text(extracted.stayPriceText) : null,
    stay_amenities_text: type === 'stay' ? text(extracted.stayAmenitiesText) : null,
    sort: null,
    status: 'draft',
    source: 'blog',
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
    geo: validGeo(extracted.geo) ? extracted.geo : undefined,
    address: text(extracted.address) ?? undefined,
    // 분석 때 matchPlace 가 본 값(AI 원본)을 우선 — regionRaw 는 정리된 값이라 분석·반영의 지역 신호가 어긋날 수 있다(리뷰 지적).
    regionRaw: text(extracted.regionRawAi) ?? text(extracted.regionRaw) ?? undefined,
  };
}
