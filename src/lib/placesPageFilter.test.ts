import { describe, expect, it } from 'vitest';
import { AREAS, areaOf, countByArea } from './areaGroups';
import { judgeEligibility } from './eligibility';
import {
  areaCarriedRelease,
  areaReleaseCount,
  filterPlacesPage,
  filtersOfPlaceType,
  otherTypeMatches,
  placesByTown,
  placesPageChips,
  reachableReleaseCount,
  townReleaseCount,
} from './placesPageFilter';
import { PLACES, placesOfType } from './places';
import type { TDogProfile, TPlaceType } from '../types';

const base = { town: null, area: null, query: '', directions: [], petKeys: [], hideHard: false, onlyReachable: false, eligibilityMap: null } as const;
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
  it('권역은 그 권역 읍면의 곳만 남긴다', () => {
    const found = filterPlacesPage({ ...base, type: 'stay', area: 'west' });
    expect(found.length).toBeGreaterThan(0);
    expect(found).toEqual(placesOfType('stay').filter((place) => areaOf(place) === 'west'));
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
    expect(townReleaseCount(conditions)).toBe(filterPlacesPage({ ...base, type: 'stay', area: 'west' }).length);
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

describe("'갈 수 있는 곳만'(19 T4.1)", () => {
  const DUBU: TDogProfile = { dogs: [{ name: '두부', weightKg: 3 }], carrier: 'bag' };
  const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };
  const KONG_HAPPY: TDogProfile = { dogs: [{ name: '콩', weightKg: 2.5 }, { name: '해피', weightKg: 12 }], carrier: 'stroller' };
  const mapOf = (dog: TDogProfile, opts: { needsIndoor?: boolean } = {}) =>
    new Map(PLACES.map((place) => [place.id, judgeEligibility(dog, place.policy, opts)]));

  // 카드가 센 수 = 카드를 눌러 연 목록의 수. 진입(`enterArea`)이 거는 조건 그대로 — 권역 + '갈 수 있는 곳만', 나머지는 기본값.
  it.each([
    ['두부', DUBU, {}],
    ['보리', BORI, {}],
    ['콩+해피', KONG_HAPPY, {}],
    ['보리 · 실내 자리 필요', BORI, { needsIndoor: true }],
  ] as const)('%s — 6권역 × 숙소·카페 모두 카드 수와 목록 수가 같다', (_, dog, opts) => {
    const counts = countByArea(PLACES, dog, opts);
    const eligibilityMap = mapOf(dog, opts);
    for (const { id } of AREAS) {
      for (const type of ['stay', 'cafe'] as const) {
        const opened = filterPlacesPage({ ...base, type, area: id, onlyReachable: true, eligibilityMap });
        expect(opened, `${id}/${type}`).toHaveLength(counts[id][type].ok + counts[id][type].outdoor);
      }
    }
  });

  it("'어려운 곳 숨기기' 로는 같아지지 않는다 — 이 조건을 따로 둔 이유(보리 · 서남 숙소)", () => {
    const eligibilityMap = mapOf(BORI);
    const card = countByArea(PLACES, BORI).southwest.stay;
    const hidden = filterPlacesPage({ ...base, type: 'stay', area: 'southwest', hideHard: true, eligibilityMap });
    expect(hidden.length).toBeGreaterThan(card.ok + card.outdoor);
  });

  it('판정 맵이 없으면(강아지 없음) 거르지 않고 칩도 없다', () => {
    expect(filterPlacesPage({ ...base, type: 'cafe', onlyReachable: true })).toHaveLength(placesOfType('cafe').length);
    const chipBase = { type: 'cafe' as const, town: null, needsIndoor: false, directions: [], petKeys: [], hideHard: false, query: '' };
    expect(placesPageChips({ ...chipBase, hasDog: false, onlyReachable: true }).chips).toEqual([]);
  });

  it('칩은 권역 바로 뒤, 시트 버튼 숫자(activeFilterCount)에는 안 센다', () => {
    const chipBase = { type: 'stay' as const, town: null, needsIndoor: false, hasDog: true, directions: [], petKeys: [], hideHard: false, query: '' };
    const result = placesPageChips({ ...chipBase, area: 'west', onlyReachable: true });
    expect(result.chips.map((chip) => chip.key)).toEqual(['area', 'onlyReachable']);
    expect(result.activeFilterCount).toBe(0);
  });

  it('0곳이면 이 조건 하나만 푼 수를 센다 — 꺼져 있거나 맵이 없으면 0', () => {
    const eligibilityMap = mapOf(BORI);
    const conditions = { ...base, type: 'stay' as const, area: 'southwest' as const, onlyReachable: true, eligibilityMap };
    expect(reachableReleaseCount(conditions)).toBe(filterPlacesPage({ ...conditions, onlyReachable: false }).length);
    expect(reachableReleaseCount({ ...conditions, onlyReachable: false })).toBe(0);
    expect(reachableReleaseCount({ ...conditions, eligibilityMap: null })).toBe(0);
  });
});

describe('카드 진입에 따라온 읍면·방향·조건 칩(19 T4.2)', () => {
  const DUBU: TDogProfile = { dogs: [{ name: '두부', weightKg: 3 }], carrier: 'bag' };
  const eligibilityMap = new Map(PLACES.map((place) => [place.id, judgeEligibility(DUBU, place.policy)]));
  const entered = { ...base, type: 'cafe' as const, onlyReachable: true, eligibilityMap };
  // 카드가 0 이 아니고 읍면 둘 이상에 걸친 권역 — 읍면 하나를 걸면 카드보다 적어진다.
  const counts = countByArea(PLACES, DUBU);
  const pick = AREAS.map(({ id }) => {
    const opened = filterPlacesPage({ ...entered, area: id });
    const towns = [...new Set(opened.map((place) => place.region.town))];
    return { id, opened, towns, card: counts[id].cafe.ok + counts[id].cafe.outdoor };
  }).find(({ towns }) => towns.length >= 2);

  it('읍면이 걸려 카드보다 적으면 푼 수는 카드 수다 — 버튼이 하는 일과 같은 조건', () => {
    expect(pick, '읍면 둘 이상에 걸친 권역이 없다').toBeDefined();
    const { id, towns, card } = pick!;
    const conditions = { ...entered, area: id, town: towns[0] };
    const shown = filterPlacesPage(conditions).length;
    expect(shown).toBeLessThan(card);
    expect(areaCarriedRelease(conditions, shown)).toEqual({ count: card, town: towns[0], directions: 0, petKeys: 0 });
  });

  it('따라온 것이 없거나 · 카드 진입이 아니거나 · 풀어도 같으면 null', () => {
    const { id, opened, towns } = pick!;
    expect(areaCarriedRelease({ ...entered, area: id }, opened.length)).toBeNull();
    expect(areaCarriedRelease({ ...entered, area: id, town: towns[0], onlyReachable: false }, 0)).toBeNull();
    expect(areaCarriedRelease({ ...entered, area: null, town: towns[0] }, 0)).toBeNull();
    expect(areaCarriedRelease({ ...entered, area: id, town: towns[0], eligibilityMap: null }, 0)).toBeNull();
    // 권역 안 방향을 고르면(그 권역 곳이 전부 그 방향) 줄지 않는다 — 원인이 아니라 말하지 않는다.
    const direction = opened[0].region.direction;
    const sameDirection = { ...entered, area: id, directions: [direction] };
    const shown = filterPlacesPage(sameDirection).length;
    if (shown === opened.length) expect(areaCarriedRelease(sameDirection, shown)).toBeNull();
  });

  it('식당 탭이면 null — 권역은 탭을 따라오지만 카드는 식당을 세지 않는다', () => {
    const { id, towns } = pick!;
    const conditions = { ...entered, type: 'restaurant' as const, area: id, town: towns[0] };
    expect(areaCarriedRelease(conditions, 0)).toBeNull();
  });

  it('검색어는 풀지 않는다 — 진입이 비웠으니 뒤에 친 것이다', () => {
    const { id, opened, towns } = pick!;
    const conditions = { ...entered, area: id, town: towns[0], query: opened.find((place) => place.region.town === towns[0])!.name };
    const shown = filterPlacesPage(conditions).length;
    const withQuery = filterPlacesPage({ ...conditions, town: null }).length;
    expect(withQuery).toBeLessThan(pick!.card);
    expect(areaCarriedRelease(conditions, shown)?.count ?? null).toBe(withQuery > shown ? withQuery : null);
  });
});

describe('다른 종류에도 있어요 — 줄의 n = 눌러 넘어간 탭의 곳 수(14 W261007.11a)', () => {
  const DUBU: TDogProfile = { dogs: [{ name: '두부', weightKg: 3 }], carrier: 'bag' };
  const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };
  const mapOf = (dog: TDogProfile) => new Map(PLACES.map((place) => [place.id, judgeEligibility(dog, place.policy)]));
  const noKeys = { stay: [], restaurant: [], cafe: [] };
  const stayTab = { ...base, type: 'stay' as const };
  const countOf = (matches: { type: TPlaceType; count: number }[], type: TPlaceType) =>
    matches.find((match) => match.type === type)?.count ?? 0;

  it('검색어가 없으면 아무것도 권하지 않는다', () => {
    expect(otherTypeMatches({ ...stayTab, query: '  ' }, noKeys)).toEqual([]);
  });

  it('지금 종류는 세지 않고 0곳인 종류는 뺀다 — 숙소 탭의 "애월 카페" 는 카페 탭으로만', () => {
    expect(otherTypeMatches({ ...stayTab, query: '애월 카페' }, noKeys).map((match) => match.type)).toEqual(['cafe']);
  });

  // 링크는 탭만 바꾼다 — 넘어간 탭은 스토어 조건 그대로에 그 탭의 조건 칩을 건 목록을 그린다. 그 수와 같아야 하고,
  // 예전 셈(검색어·읍면·권역만)보다 줄어드는 곳이 실제로 있어야 이 테스트가 그 구멍을 지킨다(두부는 '어려움' 이 드물어 숨기기로는 안 준다).
  it.each([
    ['두부', DUBU, 'onlyReachable'],
    ['보리', BORI, 'onlyReachable'],
    ['보리', BORI, 'hideHard'],
  ] as const)('%s × %s — 검색어·권역마다 넘어간 탭과 같은 수, 예전 셈보다 적은 곳이 있다', (_, dog, flag) => {
    const eligibilityMap = mapOf(dog);
    let shrunk = 0;
    for (const query of ['함덕', '애월', '중문', '서귀포', '성산']) {
      for (const area of [null, ...AREAS.map(({ id }) => id)]) {
        const matches = otherTypeMatches({ ...stayTab, area, query, [flag]: true, eligibilityMap }, noKeys);
        for (const other of ['restaurant', 'cafe'] as const) {
          const opened = filterPlacesPage({ ...base, type: other, area, query, [flag]: true, eligibilityMap }).length;
          expect(countOf(matches, other), `${query}/${area}/${other}`).toBe(opened);
          if (opened < filterPlacesPage({ ...base, type: other, area, query }).length) shrunk += 1;
        }
      }
    }
    expect(shrunk).toBeGreaterThan(0);
  });

  it('방향과 넘어간 탭의 조건 칩도 센다 — 지금 탭의 칩은 걸지 않는다', () => {
    const query = '서귀포';
    const cafes = filterPlacesPage({ ...base, type: 'cafe', query }).length;
    const cafeKey = filtersOfPlaceType('cafe').find(
      (filter) => filterPlacesPage({ ...base, type: 'cafe', query, petKeys: [filter.key] }).length < cafes,
    )?.key;
    expect(cafeKey, '서귀포 카페를 줄이는 조건 칩이 없다').toBeDefined();
    const withCafeKey = otherTypeMatches({ ...stayTab, query }, { ...noKeys, cafe: [cafeKey!] });
    expect(countOf(withCafeKey, 'cafe')).toBe(filterPlacesPage({ ...base, type: 'cafe', query, petKeys: [cafeKey!] }).length);
    expect(countOf(withCafeKey, 'cafe')).toBeLessThan(cafes);

    const [stayKey] = filtersOfPlaceType('stay');
    expect(otherTypeMatches({ ...stayTab, query }, { ...noKeys, stay: [stayKey.key] })).toEqual(otherTypeMatches({ ...stayTab, query }, noKeys));

    const east = otherTypeMatches({ ...stayTab, query, directions: ['east'] }, noKeys);
    for (const other of ['restaurant', 'cafe'] as const) {
      expect(countOf(east, other)).toBe(filterPlacesPage({ ...base, type: other, query, directions: ['east'] }).length);
    }
    expect(countOf(east, 'cafe')).toBeLessThan(cafes);
  });
});
