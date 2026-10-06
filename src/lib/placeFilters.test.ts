import { describe, expect, it } from 'vitest';
import { parsePetPolicy } from './petPolicy';
import { PET_FILTERS, carriedFilterChips, resetFiltersLabel } from './placeFilters';

const filter = (key: string, text: string) =>
  PET_FILTERS.stay.find((f) => f.key === key)!.test(parsePetPolicy(text));

describe('PET_FILTERS — 숙소', () => {
  it("'2마리 이상' 은 숫자 상한이 2 이상이거나 견수 제한이 없을 때 걸린다", () => {
    expect(filter('multiDog', '10kg 미만의 최대 2마리 가능.')).toBe(true);
    // 백화stay — 숫자는 없지만 '견수 제한 없음' 이라 2마리도 된다.
    expect(filter('multiDog', '견종 제한, 견수 제한 없음.\n반려동물 추가금 없음.')).toBe(true);
    expect(filter('multiDog', '5kg 이하의 1마리만 가능.')).toBe(false);
    expect(filter('multiDog', '1마리당 5만원.')).toBe(false);
  });
});

describe('resetFiltersLabel — 지우는 것을 그대로 말한다', () => {
  it('검색어만 → 검색 지우기 · 조건만 → 필터 지우기 · 둘 다 → 모두 지우기', () => {
    expect(resetFiltersLabel(true, 0)).toBe('검색 지우기');
    expect(resetFiltersLabel(false, 2)).toBe('필터 지우기');
    expect(resetFiltersLabel(true, 1)).toBe('모두 지우기');
  });
});

describe('carriedFilterChips — 종류를 바꿔도 따라오는 칩', () => {
  const base = { town: null, needsIndoor: false, hasDog: true, type: 'cafe' } as const;

  it('아무것도 안 켜져 있으면 없다', () => {
    expect(carriedFilterChips(base)).toEqual([]);
  });

  it('읍면과 실내 자리 필요가 순서대로 나온다', () => {
    expect(carriedFilterChips({ ...base, town: '애월읍', needsIndoor: true })).toEqual([
      { key: 'town', label: '애월읍' },
      { key: 'indoor', label: '실내 자리 필요' },
    ]);
  });

  it('프로필이 없거나 숙소 탭이면 실내 칩은 없다 — 보이지 않는 값은 칩으로 말하지 않는다', () => {
    expect(carriedFilterChips({ ...base, needsIndoor: true, hasDog: false })).toEqual([]);
    expect(carriedFilterChips({ ...base, needsIndoor: true, type: 'stay' })).toEqual([]);
  });
});
