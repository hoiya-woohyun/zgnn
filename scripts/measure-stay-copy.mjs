// 21 S8.2 — `stay.amenitiesText`·`stay.price.text` 가 블로그 원문을 얼마나 베꼈나 재는 읽기 전용 스크립트.
//   캐시(data/raw/places-source.json, 원문 포함)와 src/data/places.json 만 읽는다 — 원격 DB·네트워크 없음.
//   "베낌" = 공백을 뺀 글에서 15자 이상 같은 구간(S8 준비 커밋 a08bd79 · check-bundle 과 같은 기준).
//   원문 = 같은 행의 petPolicyText·petPolicy 문자열(+ `--with-features` 면 소개 글도). 블로그 본문은 DB 에 없다(S9 메모).
import { readFile } from 'node:fs/promises';
import { NEEDLE_MIN, overlapRatio, segmentsOf, squash } from './lib/bundleLeak.mjs';

const load = async (rel) => JSON.parse(await readFile(new URL(rel, import.meta.url), 'utf8'));

export function measureStayCopy(sourceRows, publishedRows, { withFeatures = false } = {}) {
  const published = new Map(publishedRows.map((p) => [p.id, p]));
  const result = [];
  for (const row of sourceRows) {
    if (row.type !== 'stay' || row.petPolicyTextPublic) continue;
    const pub = published.get(row.id) ?? row;
    const own = squash([row.petPolicyText ?? '', ...segmentsOf(row.petPolicy, 1), withFeatures ? (row.features ?? '') : ''].join(''));
    for (const [field, text] of [
      ['amenitiesText', pub.stay?.amenitiesText ?? row.stay?.amenitiesText],
      ['price.text', pub.stay?.price?.text ?? row.stay?.price?.text],
    ]) {
      if (!text) continue;
      result.push({ name: row.name, field, text, length: squash(text).length, ratio: overlapRatio(text, own) });
    }
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const withFeatures = process.argv.includes('--with-features');
  const rows = measureStayCopy(await load('../data/raw/places-source.json'), await load('../src/data/places.json'), { withFeatures });
  const long = rows.filter((r) => r.length >= NEEDLE_MIN);
  const copied = long.filter((r) => r.ratio > 0);
  console.log(`비공개(블로그 출처) 숙소의 값 ${rows.length}칸 중 ${NEEDLE_MIN}자 이상 ${long.length}칸, 원문과 ${NEEDLE_MIN}자 이상 겹친 칸 ${copied.length}`);
  for (const r of copied) console.log(`  ${r.name} · ${r.field} · ${r.length}자 · 겹침 ${(r.ratio * 100).toFixed(0)}% · ${r.text.slice(0, 40)}`);
}
