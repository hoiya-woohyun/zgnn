// 승인된 후보(candidates.status='approved')를 places 행으로 바꾸는 순수 함수들. I/O 없음 — 쓰는 쪽은 apply-approved.mjs,
// 테스트는 applyApproved.test.mjs. 무엇을 왜 채우고 안 채우는지는 docs/todo/03-analyze-and-review.md 가 정본.
//
// 원칙 하나 — **사람이 쓴 칸은 AI 가 덮지 않는다.** 기존 장소에 병합할 때는 비어 있는 칸(null · '')만 채운다.
// features·pet_policy_text 는 와이프가 손으로 쓴 문장이고, 그걸 블로그에서 뽑은 문장으로 덮으면 조용히 데이터가 썩는다.
// 다른 값이 필요하면 사람이 reviewer_note 에 적고 Studio 에서 고친다 — 코드가 판단하지 않는다.
//
// 컬럼명은 places 테이블 그대로 snake_case 다(supabase/migrations/20260920124849_zgnn_schema.sql). camelCase 로
// 바꾸는 건 pull-db.mjs 의 일이고, 여기서는 DB 에 쓸 모양을 만든다.

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
 * 채우는 칸: address · lat+lng(둘 다 비어 있을 때만, 쌍으로) · region_raw · features · pet_policy_text · category.
 *   category 는 TExtractedPlace 에 없고 kakaoLocal(pickKakaoPlace)이 한 단어("커피전문점")로 주는 값이라, 분석 단계가
 *   extracted 에 실어 줬을 때만 채운다 — 없으면 아무 일도 없다.
 * 건드리지 않는 칸: naver_url · naver_place_id · review_url · stay_* · status · source · sort.
 *   naver_url 은 Kakao 링크(kakaoPlaceUrl)를 넣을 자리가 아니다 — "네이버" 칸에 카카오 주소가 들어가면 조용한 버그다.
 *
 * @param {object} existingRow  places 행(snake_case)
 * @param {object} extracted    candidates.extracted jsonb — { ...TExtractedPlace, geo, kakaoPlaceUrl, regionRaw, match }
 * @returns {object | null}
 */
export function mergeIntoExisting(existingRow, extracted) {
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
  if (isBlank(existingRow.pet_policy_text) && petPolicyText) patch.pet_policy_text = petPolicyText;

  const category = text(extracted?.category);
  if (isBlank(existingRow.category) && category) patch.category = category;

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
  if (type === 'other') throw new Error(`후보 ${candidate.id}: type 'other' 는 신규 장소가 될 수 없다`);
  if (!PLACE_TYPES.has(type)) throw new Error(`후보 ${candidate.id}: type '${type}' 은 places.type 에 없다`);

  const name = text(extracted.name);
  if (!name) throw new Error(`후보 ${candidate.id}: name 이 비어 있다`);

  const geo = validGeo(extracted.geo) ? extracted.geo : null;

  return {
    id,
    type,
    name,
    region_raw: text(extracted.regionRaw) ?? '',
    features: text(extracted.features) ?? '',
    pet_policy_text: text(extracted.petPolicyText) ?? '',
    review_url: candidate.post_url ?? null,
    naver_url: null,
    naver_place_id: null,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    address: text(extracted.address),
    category: text(extracted.category),
    stay_price_text: null,
    stay_amenities_text: null,
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
