import { describe, expect, it } from 'vitest';
import { parsePetPolicy } from './petPolicy';
import { PET_FILTERS, resetFiltersLabel } from './placeFilters';

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
