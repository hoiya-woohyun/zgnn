// 블로그에서 뽑은 후보가 기존 장소(src/data/places.json)와 같은 곳인가.
//
// 틀리면 조용히 데이터가 썩는다 — 잘못 병합하면 사람이 쓴 설명이 AI 값으로 덮이고, 잘못 신규면 같은 가게가
// 두 번 뜬다. 그래서 신호 계산(아래 헬퍼)과 판정(matchPlace)을 나눠 두고, 판정의 임계값·가중치는 상수로 뺐다.
// 실제 86곳에서 나온 함정은 matchPlace.test.mjs 에 케이스로 있다: 평대반점(바당반점)↔평대코지카페 는 18m 거리라
// 좌표만 보면 합쳐지고, "카페살레" 는 블로그에서 "살레" 로도 온다.
//
// 신호를 섞는 원칙(WEIGHT 참고):
//  - naverPlaceId 가 같으면 그걸로 끝(1.0). 블로그 후보엔 거의 없다.
//  - 이름이 축이다. 이름 신호가 0 이면 다른 신호가 아무리 강해도 후보가 되지 않는다 — 좌표만으로는 18m 이웃을
//    못 가르고, 지역·종류는 같은 동네 가게 전부에 해당한다.
//  - 좌표·종류·지역은 이름 위에 얹는 보정이다. 같은 이름의 다른 가게(우도 vs 본섬)를 걸러 내는 게 목적이라,
//    가점보다 감점 폭이 크다. 어느 한쪽에 값이 없으면 그 신호는 그냥 건너뛴다(감점하지 않는다 — 좌표 없는 5곳).
//  - 오탐(잘못 병합)보다 미탐(신규로 빠짐)을 택한다. 신규 후보는 사람이 Studio 에서 보지만 병합은 조용히 지나간다.

/** 이름 앞뒤에 붙는 군더더기. 앞·뒤에서만 떼고 가운데는 건드리지 않는다("오늘도제주 애월오제" 의 제주는 이름의 일부). 긴 것부터. */
const NAME_AFFIXES = ['제주점', '본점', '카페', 'cafe', '제주'];

/** 이름 비교용 정규화 — 소문자, 괄호 제거, 글자·숫자 외 전부 제거, 접두/접미의 NAME_AFFIXES 제거. 괄호 안 별칭은 splitAliases 가 따로 뽑는다. */
export function normalizeName(name) {
  let s = (name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
  // "카페 살레 제주점" → 제주점 → 카페 순으로 두 번 벗겨야 하므로 더 벗겨질 게 없을 때까지 돈다.
  // 이름 전체가 접사면("카페") 그대로 둔다 — 빈 문자열은 무엇과도 비교할 수 없다.
  for (let stripped = true; stripped; ) {
    stripped = false;
    for (const affix of NAME_AFFIXES) {
      if (s.length > affix.length && s.startsWith(affix)) { s = s.slice(affix.length); stripped = true; }
      if (s.length > affix.length && s.endsWith(affix)) { s = s.slice(0, -affix.length); stripped = true; }
    }
  }
  return s;
}

/** "평대반점(바당반점)" → ["평대반점", "바당반점"]. 괄호 별칭까지 각각 정규화해 돌려준다. */
export function splitAliases(name) {
  const base = (name ?? '').replace(/\([^)]*\)/g, '').trim();
  const inParens = [...(name ?? '').matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  return [base, ...inParens].filter(Boolean).map(normalizeName).filter(Boolean);
}

/** 부분 일치로 인정하려면 짧은 쪽이 이 글자 수 이상이어야 한다. 86곳 자기충돌 검사(테스트)가 깨지면 임계값 대신 이걸 올린다. */
export const NAME_PARTIAL_MIN_CHARS = 2;

/** 0..1. 정규화 이름 중 하나가 완전 일치면 1, 한쪽이 다른 쪽을 포함(짧은 쪽 ≥ NAME_PARTIAL_MIN_CHARS)하면 0.7, 아니면 0. */
export function nameSimilarity(a, b) {
  const as = splitAliases(a), bs = splitAliases(b);
  for (const x of as) for (const y of bs) if (x === y) return 1;
  for (const x of as) for (const y of bs) {
    if (Math.min(x.length, y.length) >= NAME_PARTIAL_MIN_CHARS && (x.includes(y) || y.includes(x))) return 0.7;
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
 * 🙋 신호 가중치 — 기본안. 이름 점수(1 / 0.7 / 0) 위에 더하고 뺀다. 조정은 여기서만.
 * 지금 값이 만드는 구간(THRESHOLD 기준): 이름 일치+100m 안 → 1.0 병합 · 이름 일치+2km 밖 → 0.7 물어봄(우도 vs 본섬) ·
 * 부분 일치+100m 안 → 0.85 병합 · 부분 일치+종류 다름 → 0.6 물어봄 · 이름 불일치 → 0 신규(좌표가 18m 여도).
 */
export const WEIGHT = {
  /** 두 좌표가 이 거리(m) 안이면 같은 건물로 본다. Kakao 검색 좌표는 가게 자체를 가리키므로 맞는 짝은 보통 수십 m. */
  GEO_NEAR_M: 100,
  GEO_NEAR_BONUS: 0.15,
  /** 이 거리(m)를 넘으면 같은 이름이라도 다른 가게일 가능성이 크다 — 우도↔성산 16km. 사이 구간(100m~2km)은 판단 보류(0). */
  GEO_FAR_M: 2000,
  GEO_FAR_PENALTY: -0.3,
  /** 블로그의 종류 추정은 틀릴 수 있어 소폭만. 'other' 나 빈 값은 비교하지 않는다. */
  TYPE_MISMATCH_PENALTY: -0.1,
  /** 후보 주소에 기존 장소의 읍·면(또는 region.town)이 들어 있으면 소폭 가점. */
  TOWN_MATCH_BONUS: 0.05,
  /** 양쪽 다 읍·면이 있는데 다르면 감점 — 좌표 없는 후보에서 우도 vs 본섬을 가르는 유일한 신호. */
  TOWN_MISMATCH_PENALTY: -0.2,
};

/**
 * 제주의 읍·면 전부(12개). 패턴(`[가-힣]+[읍면]`)이 아니라 목록인 이유 — "함덕해물라면" 의 '면', "○○읍내" 같은 가게 이름이
 * 읍·면으로 잡혀 맞는 짝에 '지역 다름' 감점을 줬다(리뷰에서 재현). 목록은 닫혀 있고 바뀔 일이 없다. 시 단위(제주시·서귀포시)는
 * 신호로 쓰지 않는다 — 시내 동 이름까지 다루면 오탐이 늘고, 기존 데이터의 town 도 시내는 '제주시'·'서귀포시' 로 뭉쳐 있다.
 */
export const JEJU_TOWNS = ['구좌읍', '성산읍', '조천읍', '애월읍', '한림읍', '한경면', '대정읍', '남원읍', '표선면', '안덕면', '우도면', '추자면'];

/** 주소·지역 문자열("동쪽 (구좌읍)" 도 됨)에서 제주 읍·면 하나. 없으면 null. 경계를 안 보는 이유: 한글엔 \b 가 없고 목록이라 오탐이 없다. */
export function townOf(text) {
  const s = text ?? '';
  return JEJU_TOWNS.find((town) => s.includes(town)) ?? null;
}

const formatDistance = (m) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);

/** 후보 하나 ↔ 기존 장소 하나. { score: 0..1, distance: number|null, reason } — 이름 신호가 0 이면 score 0. */
function scorePair(candidate, place) {
  if (candidate.naverPlaceId && place.naverPlaceId && String(candidate.naverPlaceId) === String(place.naverPlaceId)) {
    return { score: 1, distance: null, reason: 'naverPlaceId 일치' };
  }

  const name = nameSimilarity(candidate.name, place.name);
  const distance = candidate.geo && place.geo ? distanceMeters(candidate.geo, place.geo) : null;
  if (name === 0) return { score: 0, distance, reason: '이름 불일치' };

  const parts = [];
  let score = name;
  if (name === 1) parts.push('이름 일치');
  else parts.push(`이름 부분 일치(${splitAliases(candidate.name).join('/')} ~ ${splitAliases(place.name).join('/')})`);

  if (distance == null) parts.push('좌표 없음');
  else if (distance <= WEIGHT.GEO_NEAR_M) { score += WEIGHT.GEO_NEAR_BONUS; parts.push(`거리 ${formatDistance(distance)}`); }
  else if (distance > WEIGHT.GEO_FAR_M) { score += WEIGHT.GEO_FAR_PENALTY; parts.push(`거리 ${formatDistance(distance)} (멀다)`); }
  else parts.push(`거리 ${formatDistance(distance)}`);

  const comparableType = (t) => t === 'stay' || t === 'restaurant' || t === 'cafe';
  if (comparableType(candidate.type) && comparableType(place.type) && candidate.type !== place.type) {
    score += WEIGHT.TYPE_MISMATCH_PENALTY;
    parts.push(`종류 다름(${candidate.type}≠${place.type})`);
  }

  // 후보의 읍·면은 주소가 우선, 없으면 AI 가 준 regionRaw("동쪽 (성산읍)") — 좌표·주소가 없는 후보에서 우도 vs 본섬을 가르는 유일한 신호다.
  const candTown = townOf(candidate.address) ?? townOf(candidate.regionRaw);
  const placeTown = townOf(place.address) ?? townOf(place.region?.town);
  if (candTown && placeTown && candTown !== placeTown) {
    score += WEIGHT.TOWN_MISMATCH_PENALTY;
    parts.push(`지역 다름(${candTown}≠${placeTown})`);
  } else if (candTown && candTown === placeTown) {
    score += WEIGHT.TOWN_MATCH_BONUS;
    parts.push(`지역 일치(${candTown})`);
  }

  return { score: Math.min(1, Math.max(0, score)), distance, reason: parts.join(' · ') };
}

/**
 * @param {{ name: string, naverPlaceId?: string, geo?: { lat: number, lng: number }, address?: string, regionRaw?: string, type?: string }} candidate
 * @param {Array<import('../../src/types').TPlace>} existing  src/data/places.json
 * @returns {{ match: object | null, confidence: number, reason: string }}
 *   confidence 는 0..1. match 는 confidence ≥ THRESHOLD.ASK 인 최고 후보, 아니면 null.
 *   reason 은 사람이 Studio 에서 읽을 한 줄("이름 일치 · 거리 40m"). 못 잡았을 때도 100m 안 이웃이 있으면 적어 준다 —
 *   다른 이름으로 등록된 같은 가게일 수 있어서.
 */
export function matchPlace(candidate, existing) {
  let best = null;
  let nearest = null;
  for (const place of existing) {
    const scored = scorePair(candidate, place);
    if (scored.score > 0 && (!best || scored.score > best.score || (scored.score === best.score && (scored.distance ?? Infinity) < (best.distance ?? Infinity)))) {
      best = { ...scored, place };
    }
    if (scored.distance != null && scored.distance <= WEIGHT.GEO_NEAR_M && (!nearest || scored.distance < nearest.distance)) {
      nearest = { distance: scored.distance, place };
    }
  }

  if (best && best.score >= THRESHOLD.ASK) return { match: best.place, confidence: best.score, reason: best.reason };

  const reason = best
    ? `${best.reason} → 임계값 미만(${best.place.name})`
    : `이름이 맞는 기존 장소 없음${nearest ? ` · ${formatDistance(nearest.distance)} 옆에 ${nearest.place.name} — 다른 이름의 같은 가게인지 확인` : ''}`;
  return { match: null, confidence: best?.score ?? 0, reason };
}
