// 네이버 업종(category)이 장소 종류(type)와 맞는가 — 정본. `src/lib/category.ts` 가 화면에서 같은 규칙을 부른다.
//
// 왜 있나(12 U3.6, 2026-10-06) — 업종은 네이버 이름 검색(`naverLocal.mjs`)이 주는 한 단어이고, 종류는 사람(시드)이나
// AI(`extractPlaces.mjs`)가 정한다. 둘은 출처가 달라 어긋난다: 시드에서 식당인 '정체불명' 의 업종이 `카페,디저트` 다.
// 그대로 두면 식당 목록의 카드가 "카페·디저트" 라고 말한다. 이때 **종류가 이긴다** — 종류는 목록·필터·판정이 다 쓰는 축이고,
// 업종은 메타 줄의 한 단어뿐이다. 맞지 않는 업종은 다른 말로 바꾸지 않고 **버린다**(화면은 종류 이름으로 대신한다) —
// 지어낸 업종은 없는 업종보다 나쁘다.
//
// 어긋남은 **확실한 것만** 본다. 카페의 `브런치`·식당의 `브런치` 처럼 양쪽에 걸치는 말은 건드리지 않는다.

const CAFE_WORDS = /카페|디저트|커피|베이커리|제과|도넛|빙수/;
const STAY_WORDS = /펜션|민박|숙박|호텔|게스트하우스|리조트|캠핑|글램핑|모텔|독채|콘도|스테이/;

/**
 * 업종이 종류와 맞는가. 업종이 비었거나 종류가 `other`(애견 운동장 등)면 늘 맞다.
 *
 * - 숙소: 숙박을 뜻하는 말이 있어야 맞다(펜션 안의 카페가 `카페,디저트` 로 잡히는 일이 있다).
 * - 식당: 카페·숙박을 뜻하는 말이 있으면 안 맞다.
 * - 카페: 숙박을 뜻하는 말이 있으면 안 맞다(음식점 업종의 카페는 흔해서 건드리지 않는다).
 *
 * @param {string | null | undefined} category
 * @param {string | null | undefined} type  'stay' | 'restaurant' | 'cafe' | 'other'
 * @returns {boolean}
 */
export function categoryFitsType(category, type) {
  const c = typeof category === 'string' ? category.trim() : '';
  if (!c) return true;
  if (type === 'stay') return STAY_WORDS.test(c);
  if (type === 'restaurant') return !CAFE_WORDS.test(c) && !STAY_WORDS.test(c);
  if (type === 'cafe') return !STAY_WORDS.test(c);
  return true;
}

/**
 * 종류와 맞는 업종만 남긴다 — 안 맞으면 `null`.
 *
 * @param {string | null | undefined} category
 * @param {string | null | undefined} type
 * @returns {string | null}
 */
export function categoryForType(category, type) {
  const c = typeof category === 'string' ? category.trim() : '';
  return c && categoryFitsType(c, type) ? c : null;
}
