import { describe, expect, it } from 'vitest';
import { countByArea, type TAreaCounts } from './areaGroups';
import { COVERAGE_DOGS, coverageGates, reachOf, type TCoverageDogId } from './areaCoverage';
import { PLACES } from './places';

const byDogOf = () =>
  Object.fromEntries(COVERAGE_DOGS.map(({ id, dog }) => [id, countByArea(PLACES, dog)])) as Record<TCoverageDogId, TAreaCounts>;

describe('coverageGates — 19 §4 데이터 문턱', () => {
  it('갈 수 있는 곳 = ok + 야외(히어로·카드와 같은 셈)', () => {
    expect(reachOf({ ok: 2, outdoor: 1, cond: 5, unknown: 1, hard: 1 })).toBe(3);
  });

  // 게시 84곳 기준선. 토론의 "소형 6 · 다견 4" 는 야외를 뺀 셈(okOnly)이다 — 데이터가 바뀌면 여기가 먼저 깨진다.
  it('지금 데이터 — 소형 7(야외 빼면 6) · 다견 5(4) · 대형견 숙소 권역 0 · 대형견 빈칸 4', () => {
    expect(coverageGates(byDogOf())).toEqual({
      small: { cells: 7, okOnly: 6 },
      multi: { cells: 5, okOnly: 4 },
      bigStayAreas: 0,
      bigEmptyCells: 4,
    });
  });

  it('식당은 문턱 칸에 안 든다 — 식당만 늘어도 수가 그대로', () => {
    const byDog = byDogOf();
    const before = coverageGates(byDog);
    for (const counts of Object.values(byDog)) for (const byType of Object.values(counts)) byType.restaurant.ok += 10;
    expect(coverageGates(byDog)).toEqual(before);
  });
});
