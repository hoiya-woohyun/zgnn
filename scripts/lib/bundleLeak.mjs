// 비공개 원문(블로그 출처 행의 조건 원문)이 번들에 남았는지 재는 순수 함수 — check-bundle.mjs(S8.1)와 측정 스크립트(S8.2)가 같이 쓴다.
// "이음" = 공백을 뺀 글에서 NEEDLE_MIN 글자 이상 같은 구간. 짧은 구간은 일반 문구("반려견 동반 가능")가 우연히 겹쳐 오탐이 난다.
export const NEEDLE_MIN = 15;

export const squash = (text) => String(text).replace(/\s+/g, '');

// 값 안의 모든 문자열 잎. 줄·문장 단위로 쪼개 공백을 뺀다 — 번들에서 줄바꿈이 `\n` 이스케이프로 바뀌어도 줄 단위 바늘은 그대로 맞는다.
function* stringLeaves(value) {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const v of value) yield* stringLeaves(v);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) yield* stringLeaves(v);
}

export function segmentsOf(value, min = NEEDLE_MIN) {
  const out = [];
  for (const leaf of stringLeaves(value)) {
    for (const part of leaf.split(/[\n\r]+|(?<=[.!?。])\s+/)) {
      const s = squash(part);
      if (s.length >= min) out.push(s);
    }
  }
  return out;
}

// 비공개(원문 비공개) 행의 원문 조각들: { name, segments }[]. 공개 행의 원문은 사이트에 그대로 나가도 되는 것이라 뺀다.
export function privateNeedles(rows, min = NEEDLE_MIN) {
  return rows
    .filter((row) => !row.petPolicyTextPublic)
    .map((row) => ({ name: row.name, segments: segmentsOf([row.petPolicyText, row.petPolicy], min) }))
    .filter((r) => r.segments.length > 0);
}

// 조각 하나의 `min` 글자 창 가운데 haystack(공백 뺀 글)에 있는 것이 하나라도 있으면 그 창을 돌려준다. 없으면 null.
export function firstOverlap(segment, haystack, min = NEEDLE_MIN) {
  for (let i = 0; i + min <= segment.length; i += 1) {
    const w = segment.slice(i, i + min);
    if (haystack.includes(w)) return w;
  }
  return null;
}

// 창 단위로 센 베낌 비율: 조각의 글자 가운데 haystack 과 min 글자 이상 이어 겹치는 글자의 비율(0~1).
export function overlapRatio(text, haystack, min = NEEDLE_MIN) {
  const s = squash(text);
  if (s.length < min) return 0;
  const covered = new Uint8Array(s.length);
  for (let i = 0; i + min <= s.length; i += 1) {
    if (haystack.includes(s.slice(i, i + min))) covered.fill(1, i, i + min);
  }
  return covered.reduce((a, b) => a + b, 0) / s.length;
}
