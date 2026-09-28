// 장소·준비물 레코드의 구조적 파생 — Notion export(normalize.mjs)와 Supabase(pull-db.mjs) 두 입구가 같은 함수를 쓴다.
// 여기서 하는 건 지역 분리·요금 파싱·문자열 정리뿐이다. 반려동물 이용 조건의 해석은 앱 런타임(src/lib/petPolicy.ts).
//
// JSON 을 쓰는 규칙도 여기 있다: 두 입구가 같은 바이트를 내야 `data:pull` 뒤 `git diff src/data` 가 비는 것이
// "DB 와 스냅샷이 같다" 의 증명이 된다(docs/todo/01). 그래서 키 순서·들여쓰기·줄 끝(개행 없음)을 한 곳에서 정한다.
import { writeFile } from 'node:fs/promises';

export const DIRECTION = { 동: 'east', 서: 'west', 남: 'south', 북: 'north' };

export const clean = (s) => (s ?? '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

/** "동쪽 (구좌읍 세화)" → { direction:'east', town:'구좌읍', detail:'세화', raw } · "우도" → udo · 그 외 unknown */
export function parseRegion(raw) {
  const s = (raw ?? '').trim();
  const m = s.match(/^(동|서|남|북)쪽\s*\((.+)\)$/);
  if (m) {
    const parts = m[2].trim().split(/\s+/);
    return { direction: DIRECTION[m[1]], town: parts[0], detail: parts.slice(1).join(' ') || undefined, raw: s };
  }
  if (s.startsWith('우도')) return { direction: 'udo', town: '우도면', raw: s };
  return { direction: 'unknown', town: s, raw: s };
}

// "59,000원 ~ 79,000원", "230,000원 (3인)", "150,000원 ~ 200,000원\n(인스타 DM이 빨라요)"
export function parsePrice(text) {
  const t = clean(text);
  // 시드는 "59,000원" 꼴이지만 블로그 본문은 "59000원"·"5.9만원"·"6만원" 도 흔하다(2026-09-28 첫 분석 실측). 셋 다 원 단위 정수로.
  // 콤마 없는 숫자는 4자리 이상만 — "2인 기준" 같은 개수·"1원" 이 요금으로 읽히지 않게.
  const nums = [...t.matchAll(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*원|(\d+(?:\.\d+)?)\s*만\s*원/g)].map((m) =>
    m[1] !== undefined ? Number(m[1].replace(/,/g, '')) : Math.round(Number(m[2]) * 10000),
  );
  const note = [...t.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]).join(', ') || undefined;
  return { text: t, min: nums.length ? Math.min(...nums) : undefined, max: nums.length ? Math.max(...nums) : undefined, note };
}

/**
 * 평평한 필드 묶음 → TPlace. 키 순서가 곧 JSON 의 키 순서다(src/types.ts 의 TPlace 순서).
 * `undefined` 는 JSON.stringify 가 떨어뜨리므로 "없는 값은 undefined" 로 통일한다 — null 을 쓰면 키가 남는다.
 * `images` 는 항상 빈 배열이다(사진은 전량 제거, ADR-002). 필드는 TPlace 계약이라 남긴다.
 */
export function toPlace(f) {
  const place = {
    id: f.id,
    type: f.type,
    name: f.name,
    region: parseRegion(f.regionRaw),
    features: clean(f.features),
    petPolicyText: clean(f.petPolicyText),
    // AI 구조화 판단(places.pet_policy jsonb). 시드는 null → undefined → 키가 빠져 JSON 바이트가 그대로다.
    petPolicy: f.petPolicy ?? undefined,
    reviewUrl: f.reviewUrl || undefined,
    naverUrl: f.naverUrl || undefined,
    naverPlaceId: f.naverPlaceId || undefined,
    geo: f.lat != null && f.lng != null ? { lat: f.lat, lng: f.lng } : undefined,
    address: f.address || undefined,
    category: f.category || undefined,
    cover: f.cover || undefined,
    images: f.images ?? [],
  };
  if (f.type === 'stay') {
    place.stay = { price: parsePrice(f.stayPriceText), amenitiesText: clean(f.stayAmenitiesText) };
  }
  return place;
}

/**
 * places 테이블 행(snake_case) → TPlace. pull-db.mjs(published 만)와 analyze-candidates.mjs(archived 빼고 전부)가 같이 쓴다.
 * 컬럼 ↔ 필드 짝을 한 곳에 두는 이유: 한쪽만 고치면 matchPlace 가 보는 `geo`·`region.town` 이 조용히 빠져 대조가 이름만으로 돌아간다.
 * 빌드·테스트는 그대로 통과한다.
 */
export function fromPlaceRow(row) {
  return toPlace({
    id: row.id,
    type: row.type,
    name: row.name,
    regionRaw: row.region_raw,
    features: row.features,
    petPolicyText: row.pet_policy_text,
    petPolicy: row.pet_policy,
    reviewUrl: row.review_url,
    naverUrl: row.naver_url,
    naverPlaceId: row.naver_place_id,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    category: row.category,
    stayPriceText: row.stay_price_text,
    stayAmenitiesText: row.stay_amenities_text,
  });
}

/** TItem. seasons 는 원본 태그 그대로(공백만 정리). */
export function toItem(f) {
  return {
    id: f.id,
    name: f.name.trim(),
    emoji: f.emoji,
    seasons: (f.seasons ?? []).map((s) => s.trim()),
    reason: clean(f.reason),
    linkUrl: f.linkUrl || undefined,
  };
}

/** src/data/*.json 의 유일한 쓰기 경로. 들여쓰기 1, 끝 개행 없음 — 기존 파일과 바이트가 같아야 한다. */
export async function writeDataJson(url, value) {
  await writeFile(url, JSON.stringify(value, null, 1));
}
