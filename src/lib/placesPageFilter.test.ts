import { describe, expect, it } from 'vitest';
import { areaOf } from './areaGroups';
import { areaReleaseCount, filterPlacesPage, filtersOfPlaceType, placesByTown, placesOfTypeInArea, placesPageChips, townReleaseCount } from './placesPageFilter';
import { placesOfType } from './places';
import type { TPlaceType } from '../types';

const base = { town: null, area: null, query: '', directions: [], petKeys: [], hideHard: false, eligibilityMap: null } as const;
const TYPES: TPlaceType[] = ['stay', 'restaurant', 'cafe'];

describe('filterPlacesPage', () => {
  it('조건이 없으면 그 종류 전부', () => {
    for (const type of TYPES) expect(filterPlacesPage({ ...base, type })).toHaveLength(placesOfType(type).length);
  });

  it('같은 검색어가 종류마다 그 종류 안에서 걸러 낸다', () => {
    const query = placesOfType('restaurant')[0].name;
    for (const type of TYPES) {
      const found = filterPlacesPage({ ...base, type, query });
      expect(found.every((place) => place.type === type)).toBe(true);
      expect(found.length).toBeLessThanOrEqual(placesOfType(type).length);
    }
    expect(filterPlacesPage({ ...base, type: 'restaurant', query }).length).toBeGreaterThan(0);
  });

  it('방향은 그 방향 장소만 남긴다', () => {
    const found = filterPlacesPage({ ...base, type: 'restaurant', directions: ['east'] });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((place) => place.region.direction === 'east')).toBe(true);
  });

  it('반려동물 조건은 그 종류의 조건 키만 건다 — 다른 종류의 키는 무시한다', () => {
    const [first] = filtersOfPlaceType('restaurant');
    const found = filterPlacesPage({ ...base, type: 'restaurant', petKeys: [first.key] });
    expect(found.every((place) => first.test(place.policy, place))).toBe(true);
    const stayKeys = filtersOfPlaceType('stay').map((filter) => filter.key);
    const cafeKeys = new Set(filtersOfPlaceType('cafe').map((filter) => filter.key));
    const stayOnly = stayKeys.find((key) => !cafeKeys.has(key));
    if (stayOnly) expect(filterPlacesPage({ ...base, type: 'cafe', petKeys: [stayOnly] })).toHaveLength(placesOfType('cafe').length);
  });

  it('hideHard 는 어려움 판정만 뺀다 — 판정 맵이 없으면 거르지 않는다', () => {
    const list = placesOfType('cafe');
    const map = new Map(list.map((place, index) => [place.id, { level: index === 0 ? 'hard' : 'ok' }])) as never;
    const found = filterPlacesPage({ ...base, type: 'cafe', hideHard: true, eligibilityMap: map });
    expect(found).toHaveLength(list.length - 1);
    expect(found.some((place) => place.id === list[0].id)).toBe(false);
    expect(filterPlacesPage({ ...base, type: 'cafe', hideHard: true })).toHaveLength(list.length);
  });

  it('읍면이 없는 종류는 byTown 이 0곳이다', () => {
    expect(placesByTown('cafe', '없는읍')).toHaveLength(0);
  });
});

describe('townReleaseCount', () => {
  it('읍면이 없으면 0', () => {
    expect(townReleaseCount({ ...base, type: 'stay', query: '중문' })).toBe(0);
  });

  it('구좌읍 × 중문 = 0곳이어도 읍면만 풀면 중문 반경의 수 — 나머지 조건은 그대로 센다(18 T2.1)', () => {
    const conditions = { ...base, type: 'stay' as const, town: '구좌읍', query: '중문' };
    expect(filterPlacesPage(conditions)).toHaveLength(0);
    const released = filterPlacesPage({ ...conditions, town: null }).length;
    expect(released).toBeGreaterThan(0);
    expect(townReleaseCount(conditions)).toBe(released);
    // 방향은 풀지 않는다 — 중문(남쪽)에 '동쪽' 을 겹치면 읍면을 풀어도 0곳이다.
    expect(townReleaseCount({ ...conditions, directions: ['east'] })).toBe(0);
  });
});

describe('권역(19 T3)', () => {
  it('권역은 그 권역 읍면의 곳만 남긴다 — placesOfTypeInArea 와 같은 집합', () => {
    const found = filterPlacesPage({ ...base, type: 'stay', area: 'west' });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((place) => areaOf(place) === 'west')).toBe(true);
    expect(found).toEqual(placesOfTypeInArea('stay', 'west'));
    expect(placesOfTypeInArea('stay', null)).toEqual(placesOfType('stay'));
  });

  it('권역이 없으면 0, 서부 × 중문 = 0곳이면 권역만 풀면 중문 반경의 수', () => {
    expect(areaReleaseCount({ ...base, type: 'stay', query: '중문' })).toBe(0);
    const conditions = { ...base, type: 'stay' as const, area: 'west' as const, query: '중문' };
    expect(filterPlacesPage(conditions)).toHaveLength(0);
    const released = filterPlacesPage({ ...conditions, area: null }).length;
    expect(released).toBeGreaterThan(0);
    expect(areaReleaseCount(conditions)).toBe(released);
  });

  it('읍면과 권역이 어긋나면(구좌읍 × 서부) 둘 다 풀 거리가 된다 — 읍면을 풀면 서부의 수', () => {
    const conditions = { ...base, type: 'stay' as const, town: '구좌읍', area: 'west' as const };
    expect(filterPlacesPage(conditions)).toHaveLength(0);
    expect(townReleaseCount(conditions)).toBe(placesOfTypeInArea('stay', 'west').length);
    expect(areaReleaseCount(conditions)).toBe(placesByTown('stay', '구좌읍').length);
  });
});

describe('placesPageChips', () => {
  const chipBase = { type: 'restaurant' as const, town: null, needsIndoor: false, hasDog: true, directions: [], petKeys: [], hideHard: false, query: '' };

  it('권역은 맨 앞 칩이고 시트 버튼 숫자(activeFilterCount)에 안 든다', () => {
    const result = placesPageChips({ ...chipBase, area: 'west', hideHard: true, query: '카레' });
    expect(result.chips.map((chip) => chip.key)).toEqual(['area', 'hideHard', 'query']);
    expect(result.chips[0].label).toBe('서부(애월·한림·한경)');
    expect(result.activeFilterCount).toBe(1);
    expect(placesPageChips({ ...chipBase, area: 'west' }).hasFilters).toBe(true);
  });

  it('조건이 없으면 비어 있다', () => {
    expect(placesPageChips(chipBase)).toEqual({ chips: [], activeFilterCount: 0, hasFilters: false });
  });

  it('순서는 읍면 → 방향 → 정렬 → 숨김 → 검색어, 개수에는 검색어가 빠진다', () => {
    const result = placesPageChips({ ...chipBase, town: '애월읍', directions: ['east'], sortLabel: '가까운 순', hideHard: true, query: ' 카레 ' });
    expect(result.chips.map((chip) => chip.key)).toEqual(['town', 'dir-east', 'sort', 'hideHard', 'query']);
    expect(result.chips.at(-1)?.label).toBe('"카레"');
    expect(result.activeFilterCount).toBe(4);
    expect(result.hasFilters).toBe(true);
  });

  it('강아지가 없으면 숨김 칩을 안 그린다 · 검색어만이면 개수 0 에 hasFilters', () => {
    expect(placesPageChips({ ...chipBase, hasDog: false, hideHard: true }).chips).toEqual([]);
    expect(placesPageChips({ ...chipBase, query: '카레' })).toMatchObject({ activeFilterCount: 0, hasFilters: true });
  });
});
