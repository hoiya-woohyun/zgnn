// 블로그에서 뽑은 후보가 기존 장소(src/data/places.json)와 같은 곳인가.
//
// 틀리면 조용히 데이터가 썩는다 — 잘못 병합하면 사람이 쓴 설명이 AI 값으로 덮이고, 잘못 신규면 같은 가게가
// 두 번 뜬다. 그래서 신호 계산(아래 헬퍼)과 판정(matchPlace)을 나눠 두고, 판정의 임계값은 상수로 뺐다.
// 실제 86곳에서 나온 함정은 matchPlace.test.mjs 에 케이스로 있다: 평대반점(바당반점)↔평대코지카페 는 18m 거리라
// 좌표만 보면 합쳐지고, "카페살레" 는 블로그에서 "살레" 로도 온다.

/** 이름 비교용 정규화 — 공백·기호 제거, 접두/접미 "카페"·"제주점"·"본점" 제거, 소문자. 괄호 안 별칭은 별도로 뽑는다(splitAliases). */
export function normalizeName(name) {
  return (name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/(카페|cafe|제주점|본점|제주)/g, '')
    .replace(/[\s\-_.·&'"]/g, '');
}

/** "평대반점(바당반점)" → ["평대반점", "바당반점"]. 괄호 별칭까지 각각 정규화해 돌려준다. */
export function splitAliases(name) {
  const base = (name ?? '').replace(/\([^)]*\)/g, '').trim();
  const inParens = [...(name ?? '').matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  return [base, ...inParens].filter(Boolean).map(normalizeName).filter(Boolean);
}

/** 0..1. 정규화 이름 중 하나가 완전 일치면 1, 한쪽이 다른 쪽을 포함(≥2자)하면 0.7, 아니면 0. */
export function nameSimilarity(a, b) {
  const as = splitAliases(a), bs = splitAliases(b);
  for (const x of as) for (const y of bs) {
    if (x === y) return 1;
    if (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x))) return 0.7;
  }
  return 0;
}

/** 두 좌표 사이 거리(m). haversine. */
export function distanceMeters(a, b) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 🙋 판정 임계값 — 사용자가 정한다(docs/todo/03). 86곳이라 사람 확인 비용이 싸다는 점을 고려.
 *  AUTO_MERGE 이상: 기존 장소로 자동 병합(빈 칸만 채움)
 *  ASK 이상 ~ AUTO_MERGE 미만: 후보에 match_place_id 를 붙이되 사람이 Studio 에서 확정
 *  ASK 미만: 신규 장소 후보
 */
export const THRESHOLD = { AUTO_MERGE: 0.85, ASK: 0.4 };

/**
 * @param {{ name: string, naverPlaceId?: string, geo?: { lat: number, lng: number }, address?: string, type?: string }} candidate
 * @param {Array<import('../../src/types').TPlace>} existing  src/data/places.json
 * @returns {{ match: object | null, confidence: number, reason: string }}
 *   confidence 는 0..1. match 는 confidence ≥ THRESHOLD.ASK 인 최고 후보, 아니면 null.
 */
export function matchPlace(candidate, existing) {
  // TODO(사용자): 신호를 어떻게 조합할지 정한다.
  //  - naverPlaceId 완전 일치 → 확실(1.0). 블로그 후보엔 거의 없다.
  //  - nameSimilarity 1.0 이면 강한 신호지만, 같은 이름의 다른 가게(우도 vs 본섬)를 걸러야 한다 → 좌표/지역으로 확인.
  //  - 좌표 100m 이내는 보조 신호일 뿐이다 — 평대반점↔평대코지카페 18m.
  //  - type 이 다르면(식당 vs 카페) 감점? 블로그의 type 추정은 틀릴 수 있다.
  //  - 좌표 없는 후보·장소(5곳)는 이름만으로 판단해야 한다.
  // 반환: { match, confidence, reason } — reason 은 사람이 Studio 에서 읽을 한 줄("이름 일치 + 40m").
  throw new Error('matchPlace 미구현 — scripts/analyze/matchPlace.mjs 의 TODO 를 채운다');
}
