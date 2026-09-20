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
  const nums = [...t.matchAll(/(\d{1,3}(?:,\d{3})+)\s*원/g)].map((m) => Number(m[1].replace(/,/g, '')));
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
