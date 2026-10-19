import { describe, expect, it } from 'vitest';
import { AREAS, areaOf, countByArea } from './areaGroups';
import { judgeEligibility } from './eligibility';
import { eligibilityMapOf, reachablePlaces } from './eligibilityCounts';
import {
  areaCarriedRelease,
  areaReleaseCount,
  filterPlacesPage,
  filtersOfPlaceType,
  hideHardCount,
  landmarkNearby,
  onlyReachableCount,
  otherSeatTypeMatches,
  otherTypeHiddenMatches,
  otherTypeMatches,
  placesPageEmptySearch,
  placesByTown,
  placesPageChips,
  placesPageSortLabel,
  placesPageSortOptions,
  reachableReleaseCount,
  singleConditionReleases,
  townChipCounts,
  townReleaseCount,
} from './placesPageFilter';
import { landmarkOfWord } from './landmarks';
import { freshnessOf } from './placeFreshness';
import { matchesQuery } from './placeSearch';
import { PLACES, distanceKm, placesOfType, topTowns } from './places';
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

  it("'서귀포 시내'·'제주 시내' 는 '시내만 보기'(읍면 = 시내 태그)와 같은 집합이다(14 W261019.11)", () => {
    const ids = (list: { id: string }[]) => list.map((place) => place.id);
    for (const type of TYPES) {
      const seogwipo = ids(filterPlacesPage({ ...base, type, town: '서귀포시' }));
      const jeju = ids(filterPlacesPage({ ...base, type, town: '제주시' }));
      for (const query of ['서귀포 시내', '서귀포시 시내', '서귀포시내']) {
        expect(ids(filterPlacesPage({ ...base, type, query })), `${type} ${query}`).toEqual(seogwipo);
      }
      for (const query of ['제주 시내', '제주시 시내', '제주시내']) {
        expect(ids(filterPlacesPage({ ...base, type, query })), `${type} ${query}`).toEqual(jeju);
      }
    }
    expect(filterPlacesPage({ ...base, type: 'restaurant', query: '서귀포 시내' }).length).toBeGreaterThan(0);
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
    // 집합만 본다 — 강아지가 없을 때의 순서는 '확인한 곳 먼저'(아래 「정렬 이름·칸」).
    const ids = (list: { id: string }[]) => list.map((place) => place.id).sort();
    expect(ids(found)).toEqual(ids(placesOfType('stay').filter((place) => areaOf(place) === 'west')));
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

  it("관광지·동 낱말이면 검색어 칩이 반경을 말한다 — '중문' 의 서울앵무새가 왜 나왔는지(14 W261019.11)", () => {
    const label = (query: string) => placesPageChips({ ...chipBase, query }).chips.at(-1)?.label;
    expect(label('중문')).toBe('"중문" · 3km 안');
    expect(label(' 중문 카페 ')).toBe('"중문 카페" · 중문 3km 안');
    expect(label('법환')).toBe('"법환" · 1.5km 안');
    expect(label('카레')).toBe('"카레"');
    expect(label('서귀포 시내')).toBe('"서귀포 시내"');
  });

  it('조건이 없으면 비어 있다', () => {
    expect(placesPageChips(chipBase)).toEqual({ chips: [], activeFilterCount: 0, hasFilters: false });
  });

  it('순서는 읍면 → 방향 → 숨김 → 검색어, 개수에는 검색어가 빠진다 · 정렬은 칩이 아니다(14 W261019.13)', () => {
    const result = placesPageChips({ ...chipBase, town: '애월읍', directions: ['east'], hideHard: true, query: ' 카레 ' });
    expect(result.chips.map((chip) => chip.key)).toEqual(['town', 'dir-east', 'hideHard', 'query']);
    expect(result.chips.at(-1)?.label).toBe('"카레"');
    expect(result.activeFilterCount).toBe(3);
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

  // 카드가 권역 밑에 적는 말("남부(서귀포 시내·남원)")로 찾으면 그 칸이 나온다(14 W261019.11) — '서귀포 시내' 로 찾은 목록 + 남원읍 = 카드 n.
  it.each([
    ['두부', DUBU],
    ['보리', BORI],
  ] as const)("%s — 남부 카드 n = '서귀포 시내' 로 찾은 목록 + 남원읍 목록(갈 수 있는 곳만)", (_, dog) => {
    const counts = countByArea(PLACES, dog);
    const eligibilityMap = mapOf(dog);
    for (const type of ['stay', 'cafe'] as const) {
      const searched = filterPlacesPage({ ...base, type, query: '서귀포 시내', onlyReachable: true, eligibilityMap });
      const namwon = filterPlacesPage({ ...base, type, town: '남원읍', onlyReachable: true, eligibilityMap });
      expect(searched.length + namwon.length, type).toBe(counts.south[type].ok + counts.south[type].outdoor);
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

  it('칩은 권역 바로 뒤, 시트에 칩이 있어 시트 버튼 숫자(activeFilterCount)에 센다(14 W261013.14d)', () => {
    const chipBase = { type: 'stay' as const, town: null, needsIndoor: false, hasDog: true, directions: [], petKeys: [], hideHard: false, query: '' };
    const result = placesPageChips({ ...chipBase, area: 'west', onlyReachable: true, hideHard: true });
    expect(result.chips.map((chip) => chip.key)).toEqual(['area', 'onlyReachable', 'hideHard']);
    expect(result.activeFilterCount).toBe(2);
    expect(placesPageChips({ ...chipBase, onlyReachable: true }).activeFilterCount).toBe(1);
  });

  it('시트 칩의 수는 켜면 남는 곳 — 켜든 끄든 같고, 홈 히어로처럼 가능 + 야외를 센다(14 W261013.14d)', () => {
    const eligibilityMap = mapOf(BORI);
    const conditions = { ...base, type: 'stay' as const, eligibilityMap };
    // 홈 히어로 시트가 펼치는 곳(`reachablePlaces`) 중 숙소 — 시트 칩과 히어로가 한 술어다.
    const reachable = reachablePlaces(placesOfType('stay'), BORI).length;
    expect(reachable).toBeGreaterThan(0);
    expect(reachable).toBeLessThan(placesOfType('stay').length);
    expect(onlyReachableCount(conditions)).toBe(reachable);
    expect(onlyReachableCount({ ...conditions, onlyReachable: true })).toBe(reachable);
    expect(onlyReachableCount({ ...conditions, eligibilityMap: null })).toBe(0);
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

describe('0곳 안내가 숨긴 종류도 말한다(14 W261007.11b)', () => {
  const DUBU: TDogProfile = { dogs: [{ name: '두부', weightKg: 3 }], carrier: 'bag' };
  const BORI: TDogProfile = { dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' };
  const mapOf = (dog: TDogProfile) => new Map(PLACES.map((place) => [place.id, judgeEligibility(dog, place.policy)]));
  const noKeys = { stay: [], restaurant: [], cafe: [] };
  const stayTab = { ...base, type: 'stay' as const };

  it('숨김 조건이 없거나 판정 맵이 없으면 빈 배열', () => {
    expect(otherTypeHiddenMatches({ ...stayTab, query: '함덕', eligibilityMap: mapOf(BORI) }, noKeys)).toEqual([]);
    expect(otherTypeHiddenMatches({ ...stayTab, query: '함덕', hideHard: true, onlyReachable: true }, noKeys)).toEqual([]);
  });

  // 보이는 줄과 겹치지 않고, 수는 두 조건을 함께 푼 넘어간 탭의 곳 수 — 누르는 쪽이 둘 다 푼다. 숨긴 종류가 실제로 생겨야 지킨다.
  it.each([
    ['두부', DUBU, { onlyReachable: true }],
    ['보리', BORI, { onlyReachable: true }],
    ['보리', BORI, { hideHard: true }],
    ['보리', BORI, { hideHard: true, onlyReachable: true }],
  ] as const)('%s × %o — 보이는 종류와 겹치지 않고 푼 탭의 수와 같다', (_, dog, flags) => {
    const eligibilityMap = mapOf(dog);
    let hiddenSeen = 0;
    for (const query of ['함덕', '애월', '중문', '서귀포', '성산', '협재']) {
      for (const area of [null, ...AREAS.map(({ id }) => id)]) {
        const conditions = { ...stayTab, area, query, ...flags, eligibilityMap };
        const shown = otherTypeMatches(conditions, noKeys).map((match) => match.type);
        for (const hidden of otherTypeHiddenMatches(conditions, noKeys)) {
          hiddenSeen += 1;
          expect(shown, `${query}/${area}`).not.toContain(hidden.type);
          const released = filterPlacesPage({ ...base, type: hidden.type, area, query, eligibilityMap }).length;
          expect(hidden.count, `${query}/${area}/${hidden.type}`).toBe(released);
        }
      }
    }
    expect(hiddenSeen).toBeGreaterThan(0);
  });
});

describe('townChipCounts — 읍면 칩 옆 수(14 W261010.33e)', () => {
  const mapOf = (dog: TDogProfile) => new Map(PLACES.map((place) => [place.id, judgeEligibility(dog, place.policy)]));
  const BORI_MAP = mapOf({ dogs: [{ name: '보리', weightKg: 30 }], carrier: 'none' });
  const DUBU_MAP = mapOf({ dogs: [{ name: '두부', weightKg: 3 }], carrier: 'bag' });
  /** 칩 줄과 같은 읍면 — 그 종류에 장소가 있는 읍면 전부. */
  const townsOf = (type: TPlaceType) => topTowns(type, Number.MAX_SAFE_INTEGER).map((entry) => entry.town);
  const SETS = [
    ['숙소 · 보리 · 갈 수 있는 곳만', { ...base, type: 'stay' as const, onlyReachable: true, eligibilityMap: BORI_MAP }],
    ['식당 · 대형견 OK · 서쪽·동쪽', { ...base, type: 'restaurant' as const, petKeys: ['largeDog' as const], directions: ['west' as const, 'east' as const] }],
    ['카페 · 두부 · 서부 권역 · 어려운 곳 숨기기', { ...base, type: 'cafe' as const, area: 'west' as const, hideHard: true, eligibilityMap: DUBU_MAP }],
  ] as const;

  it.each(SETS)('%s — 칩의 수 = 그 칩을 눌렀을 때 남는 곳 수(누르면 권역이 풀린다 — W261010.33i)', (_, conditions) => {
    const counts = townChipCounts(conditions);
    let total = 0;
    for (const town of townsOf(conditions.type)) {
      // 화면의 `selectTown` 이 하는 일 그대로 — 읍면을 걸고 권역을 푼다.
      const opened = filterPlacesPage({ ...conditions, town, area: null }).length;
      expect(counts.get(town) ?? 0, town).toBe(opened);
      total += opened;
    }
    // 읍면 칩이 나누어 가진 수의 합 = 읍면·권역을 안 고른 목록 수 — 빠지거나 겹치는 읍면이 없다.
    expect(total).toBe(filterPlacesPage({ ...conditions, area: null }).length);
    expect(total).toBeGreaterThan(0);
  });

  it.each(SETS)('%s — 읍면 하나를 고른 뒤에도 다른 칩 수가 0 으로 떨어지지 않는다', (_, conditions) => {
    const released = townChipCounts(conditions);
    const picked = [...released.entries()].find(([, count]) => count > 0)?.[0];
    expect(picked).toBeDefined();
    const withTown = townChipCounts({ ...conditions, town: picked! });
    expect(withTown).toEqual(released);
    expect([...withTown.entries()].filter(([town, count]) => town !== picked && count > 0).length).toBeGreaterThan(0);
  });

  it("'갈 수 있는 곳만' 을 켜면 칩 수가 따라 준다 — 종류 전체 수(`topTowns`)로 셌을 땐 \"구좌읍 9\" 를 눌러 1곳을 봤다(ferry-26)", () => {
    const off = { ...base, type: 'stay' as const, eligibilityMap: BORI_MAP };
    const offCounts = townChipCounts(off);
    // 아무 조건이 없으면 종류 전체 수와 같다 — 예전 칩 수.
    for (const { town, count } of topTowns('stay', Number.MAX_SAFE_INTEGER)) expect(offCounts.get(town), town).toBe(count);
    const onCounts = townChipCounts({ ...off, onlyReachable: true });
    const shrunk = [...offCounts.entries()].filter(([town, count]) => (onCounts.get(town) ?? 0) < count);
    expect(shrunk.length).toBeGreaterThan(0);
    // 옆 칩 '갈 수 있는 곳만 N' 과 한 술어 — 읍면 칩을 다 더하면 그 N 이다.
    expect([...onCounts.values()].reduce((sum, count) => sum + count, 0)).toBe(onlyReachableCount(off));
  });

  it('종류 · 조건 칩 · 판정 토글을 바꾸면 칩 수가 바뀐다', () => {
    const stay = { ...base, type: 'stay' as const, eligibilityMap: BORI_MAP };
    const differs = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>) =>
      [...new Set([...a.keys(), ...b.keys()])].some((town) => (a.get(town) ?? 0) !== (b.get(town) ?? 0));
    const stayCounts = townChipCounts(stay);
    expect(differs(stayCounts, townChipCounts({ ...stay, type: 'cafe' }))).toBe(true);
    expect(differs(stayCounts, townChipCounts({ ...stay, petKeys: ['largeDog'] }))).toBe(true);
    expect(differs(stayCounts, townChipCounts({ ...stay, hideHard: true }))).toBe(true);
    expect(differs(stayCounts, townChipCounts({ ...stay, onlyReachable: true }))).toBe(true);
  });

  it('권역이 걸려도 권역 밖 읍면은 0 이 아니다 — 읍면을 고르면 권역을 대신한다(W261010.33i, 예전엔 눌러서 0곳)', () => {
    const free = { ...base, type: 'stay' as const, onlyReachable: true, eligibilityMap: BORI_MAP };
    const counts = townChipCounts({ ...free, area: 'west' });
    // 권역을 빼고 세므로 권역이 없을 때와 같은 칩 수다.
    expect(counts).toEqual(townChipCounts(free));
    let outsideSeen = 0;
    for (const town of townsOf('stay')) {
      const count = counts.get(town) ?? 0;
      if (areaOf({ region: { town } }) === 'west') {
        // 권역 안 읍면은 권역을 지워도 같은 목록 — 그래서 `selectTown` 은 가리지 않고 권역을 지운다.
        expect(count, town).toBe(filterPlacesPage({ ...free, area: 'west', town }).length);
      } else if (count > 0) {
        outsideSeen += 1;
        expect(filterPlacesPage({ ...free, area: 'west', town }).length, `${town} 권역과 겹치면`).toBe(0);
      }
    }
    expect(outsideSeen).toBeGreaterThan(0);
  });
});

describe('hideHardCount — 어려운 곳 숨기기 칩의 수(14 W261013.8)', () => {
  const mapOf = (dog: TDogProfile) => new Map(PLACES.map((place) => [place.id, judgeEligibility(dog, place.policy)]));

  it('강아지가 없으면 0', () => {
    expect(hideHardCount({ ...base, type: 'restaurant' })).toBe(0);
  });

  it('켜든 끄든 같은 수 — 숨기는(숨길) 어려움 곳, 나머지 조건은 그대로', () => {
    const eligibilityMap = mapOf({ dogs: [{ name: '보리', weightKg: 28 }], carrier: 'none' });
    const conditions = { ...base, type: 'restaurant' as const, eligibilityMap };
    const hard = filterPlacesPage(conditions).filter((place) => eligibilityMap.get(place.id)?.level === 'hard').length;
    expect(hard).toBeGreaterThan(0);
    expect(hideHardCount(conditions)).toBe(hard);
    expect(hideHardCount({ ...conditions, hideHard: true })).toBe(hard);
    expect(filterPlacesPage({ ...conditions, hideHard: true })).toHaveLength(filterPlacesPage(conditions).length - hard);
  });

  it("'갈 수 있는 곳만' 이 이미 어려움을 뺐으면 0 — 눌러도 바뀌는 것이 없다", () => {
    const eligibilityMap = mapOf({ dogs: [{ name: '보리', weightKg: 28 }], carrier: 'none' });
    expect(hideHardCount({ ...base, type: 'restaurant', onlyReachable: true, eligibilityMap })).toBe(0);
  });
});

describe('placesPageEmptySearch — 검색만으로 0곳일 때 큰 안내(14 W261013.10)', () => {
  it('가장 곳이 많은 다른 종류가 답이고, 나머지는 순서 그대로 남는다', () => {
    const result = placesPageEmptySearch('함덕', [
      { type: 'restaurant', count: 1 },
      { type: 'cafe', count: 4 },
    ]);
    expect(result).toEqual({ kind: 'otherType', top: { type: 'cafe', count: 4 }, rest: [{ type: 'restaurant', count: 1 }] });
  });

  it('동수면 주어진 순서가 앞선 쪽이 답이다', () => {
    const result = placesPageEmptySearch('함덕', [
      { type: 'restaurant', count: 2 },
      { type: 'cafe', count: 2 },
    ]);
    expect(result).toEqual({ kind: 'otherType', top: { type: 'restaurant', count: 2 }, rest: [{ type: 'cafe', count: 2 }] });
  });

  it('어디에도 없으면 목록에 없는 것 — 단어가 둘 이상일 때만 multiWord(앞뒤 공백은 단어가 아니다)', () => {
    expect(placesPageEmptySearch('애월 테라로사', [])).toEqual({ kind: 'notListed', multiWord: true });
    expect(placesPageEmptySearch('테라로사', [])).toEqual({ kind: 'notListed', multiWord: false });
    expect(placesPageEmptySearch('  테라로사  ', [])).toEqual({ kind: 'notListed', multiWord: false });
  });

  it("관광지·동 낱말이면 '목록에 없다' 가 아니다 — '법환' 은 가게가 아니라 동네다(14 W261019.11)", () => {
    expect(placesPageEmptySearch('법환', [])).toEqual({ kind: 'landmark', word: '법환', radiusKm: 1.5 });
    expect(placesPageEmptySearch('강정 카레', [])).toEqual({ kind: 'landmark', word: '강정', radiusKm: 1.5 });
    // 다른 종류에 있으면 그 답이 먼저다.
    expect(placesPageEmptySearch('법환', [{ type: 'cafe', count: 1 }])).toMatchObject({ kind: 'otherType' });
    // '서귀포 시내' 는 한 낱말이라 단어 둘이 아니다.
    expect(placesPageEmptySearch('서귀포 시내', [])).toEqual({ kind: 'notListed', multiWord: false });
  });
});

describe('singleConditionReleases — 0곳일 때 조건 하나만 풀면 몇 곳(14 W261010.33s)', () => {
  const BIG: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }], carrier: 'none' };
  const noJudging = { dog: null, needsIndoor: false };

  it('숙소 대형견 OK + 계단 없음 = 0곳 — 칩마다 그 하나를 뺀 목록 수, 많은 순', () => {
    const conditions = { ...base, type: 'stay' as const, petKeys: ['largeDog', 'noStairs'] as const };
    expect(filterPlacesPage(conditions)).toHaveLength(0);
    const releases = singleConditionReleases(conditions, noJudging);
    expect(releases.map((r) => r.key).sort()).toEqual(['pet-largeDog', 'pet-noStairs']);
    for (const release of releases) {
      const key = release.key.slice('pet-'.length);
      expect(release.count).toBe(filterPlacesPage({ ...conditions, petKeys: conditions.petKeys.filter((k) => k !== key) }).length);
    }
    expect(releases.map((r) => r.count)).toEqual([...releases.map((r) => r.count)].sort((a, b) => b - a));
  });

  it("키는 칩 키(placesPageChips)와 같다 — 화면이 그 칩의 지우기를 그대로 쓴다", () => {
    const conditions = { ...base, type: 'stay' as const, petKeys: ['largeDog', 'noStairs'] as const, directions: ['east'] as const };
    const { chips } = placesPageChips({ ...conditions, needsIndoor: false, hasDog: false });
    const chipKeys = new Set(chips.map((chip) => chip.key));
    for (const release of singleConditionReleases(conditions, noJudging)) expect(chipKeys.has(release.key)).toBe(true);
  });

  it("'실내 자리 필요' 는 그 값 없이 다시 판정한 맵으로 센다 — 화면의 맵과 같은 호출(eligibilityMapOf)", () => {
    const eligibilityMap = eligibilityMapOf(PLACES, BIG, { needsIndoor: true });
    const conditions = { ...base, type: 'restaurant' as const, directions: ['east'] as const, onlyReachable: true, eligibilityMap };
    expect(filterPlacesPage(conditions)).toHaveLength(0);
    const indoor = singleConditionReleases(conditions, { dog: BIG, needsIndoor: true }).find((r) => r.key === 'indoor');
    const expected = filterPlacesPage({ ...conditions, eligibilityMap: eligibilityMapOf(PLACES, BIG) }).length;
    expect(expected).toBeGreaterThan(0);
    expect(indoor?.count).toBe(expected);
    // 칩이 없는 곳(숙소)·강아지 없음이면 세지 않는다.
    expect(singleConditionReleases({ ...conditions, type: 'stay' }, { dog: BIG, needsIndoor: true }).some((r) => r.key === 'indoor')).toBe(false);
    expect(singleConditionReleases(conditions, { dog: null, needsIndoor: true }).some((r) => r.key === 'indoor')).toBe(false);
  });

  it("'어려운 곳 숨김' 은 후보가 아니다 — 그것만 풀면 새로 보이는 곳은 전부 '이용하기 어려워요' 다", () => {
    const eligibilityMap = eligibilityMapOf(PLACES, BIG, { needsIndoor: true });
    const conditions = { ...base, type: 'restaurant' as const, directions: ['udo'] as const, hideHard: true, eligibilityMap };
    expect(filterPlacesPage(conditions)).toHaveLength(0);
    const unhidden = filterPlacesPage({ ...conditions, hideHard: false });
    expect(unhidden.length).toBeGreaterThan(0);
    expect(unhidden.every((place) => eligibilityMap.get(place.id)?.level === 'hard')).toBe(true);
    expect(singleConditionReleases(conditions, { dog: BIG, needsIndoor: true }).map((r) => r.key)).not.toContain('hideHard');
  });

  it('풀어서 나오는 곳이 이 강아지에게 전부 어려움이면 그 풀기는 내놓지 않는다 — 대형견 × 숙소 대형견 OK + 계단 없음', () => {
    const eligibilityMap = eligibilityMapOf(PLACES, BIG);
    const conditions = { ...base, type: 'stay' as const, petKeys: ['largeDog', 'noStairs'] as const, eligibilityMap };
    expect(filterPlacesPage(conditions)).toHaveLength(0);
    const stairFree = filterPlacesPage({ ...conditions, petKeys: ['noStairs'] });
    expect(stairFree.length).toBeGreaterThan(0);
    expect(stairFree.every((place) => eligibilityMap.get(place.id)?.level === 'hard')).toBe(true);
    const releases = singleConditionReleases(conditions, { dog: BIG, needsIndoor: false });
    expect(releases.map((r) => r.key)).toEqual(['pet-noStairs']);
    expect(releases[0].count).toBe(filterPlacesPage({ ...conditions, petKeys: ['largeDog'] }).length);
    // 강아지가 없으면 판정이 없어 따지지 않는다 — 둘 다 선다.
    expect(singleConditionReleases({ ...conditions, eligibilityMap: null }, noJudging).map((r) => r.key).sort()).toEqual(['pet-largeDog', 'pet-noStairs']);
  });

  it('검색어도 하나의 조건이다 · 0곳이 되는 풀기는 뺀다 · 아무것도 안 켰으면 빈 배열', () => {
    const conditions = { ...base, type: 'stay' as const, query: '중문', petKeys: ['multiDog'] as const };
    expect(filterPlacesPage(conditions)).toHaveLength(0);
    const releases = singleConditionReleases(conditions, noJudging);
    expect(releases.find((r) => r.key === 'query')?.count).toBe(filterPlacesPage({ ...conditions, query: '' }).length);
    // '동쪽' 을 더하면 그것만 풀어도 중문 × 2마리 이상 = 0곳이라 그 풀기는 빠지고, 검색어를 지우는 길만 남는다.
    const east = singleConditionReleases({ ...conditions, directions: ['east'] }, noJudging);
    expect(east.every((r) => r.count > 0)).toBe(true);
    expect(east.map((r) => r.key)).not.toContain('dir-east');
    expect(east.map((r) => r.key)).toContain('query');
    expect(singleConditionReleases({ ...base, type: 'stay' }, noJudging)).toEqual([]);
  });
});

describe('otherSeatTypeMatches — 검색어 없이 0곳인 식당·카페의 대신(14 W261010.33v)', () => {
  const BIG: TDogProfile = { dogs: [{ name: '대장', weightKg: 28 }], carrier: 'none' };
  const noKeys = { stay: [], restaurant: [], cafe: [] } as const;

  it('식당 동쪽 × 갈 수 있는 곳만 × 실내 자리 필요(28kg) = 0곳 — 카페 수는 넘어간 탭의 목록 수', () => {
    const eligibilityMap = eligibilityMapOf(PLACES, BIG, { needsIndoor: true });
    const conditions = { ...base, type: 'restaurant' as const, directions: ['east'] as const, onlyReachable: true, eligibilityMap };
    expect(filterPlacesPage(conditions)).toHaveLength(0);
    const matches = otherSeatTypeMatches(conditions, noKeys);
    const cafe = filterPlacesPage({ ...conditions, type: 'cafe' }).length;
    expect(matches).toEqual(cafe > 0 ? [{ type: 'cafe', count: cafe }] : []);
  });

  it('넘어간 탭의 조건 칩이 걸린다 — 이 종류에만 있는 칩은 따라가지 않는다', () => {
    const conditions = { ...base, type: 'cafe' as const, directions: ['east'] as const };
    const largeDog = otherSeatTypeMatches(conditions, { ...noKeys, restaurant: ['largeDog'] });
    const all = otherSeatTypeMatches(conditions, noKeys);
    expect(largeDog[0]?.count ?? 0).toBe(filterPlacesPage({ ...conditions, type: 'restaurant', petKeys: ['largeDog'] }).length);
    expect(all[0]?.count).toBe(filterPlacesPage({ ...conditions, type: 'restaurant' }).length);
  });

  it('숙소는 대신할 종류가 없고, 검색어가 있으면 otherTypeMatches 몫이라 빈 배열', () => {
    expect(otherSeatTypeMatches({ ...base, type: 'stay', directions: ['east'] }, noKeys)).toEqual([]);
    expect(otherSeatTypeMatches({ ...base, type: 'restaurant', query: '함덕' }, noKeys)).toEqual([]);
    // 숙소는 대신 목록에 들지 않는다.
    expect(otherSeatTypeMatches({ ...base, type: 'cafe' }, noKeys).map((m) => m.type)).toEqual(['restaurant']);
  });
});

describe('landmarkNearby — 관광지·동 검색이 0곳일 때 그 중심에서 가까운 곳(14 W261019.11)', () => {
  it("'법환' — 거리순 세 곳, 좌표 있는 곳만, 그 종류만", () => {
    const center = landmarkOfWord('법환')!.center;
    for (const type of TYPES) {
      const nearby = landmarkNearby({ ...base, type, query: '법환' });
      expect(nearby.length, type).toBeGreaterThan(0);
      expect(nearby.length).toBeLessThanOrEqual(3);
      expect(nearby.every(({ place }) => place.type === type && place.geo)).toBe(true);
      expect(nearby.map(({ km }) => km)).toEqual([...nearby.map(({ km }) => km)].sort((a, b) => a - b));
      for (const { place, km } of nearby) expect(km).toBeCloseTo(distanceKm(center, place.geo!), 6);
    }
  });

  it('관광지 낱말만 빼고 나머지 낱말은 그대로 건다 — "법환 카레" 면 법환에서 가까운 카레', () => {
    const nearby = landmarkNearby({ ...base, type: 'restaurant', query: '법환 카레' });
    expect(nearby.every(({ place }) => matchesQuery(place, '카레'))).toBe(true);
    expect(nearby.length).toBeLessThanOrEqual(placesOfType('restaurant').filter((place) => matchesQuery(place, '카레')).length);
  });

  it('관광지 낱말이 없으면 빈 배열', () => {
    expect(landmarkNearby({ ...base, type: 'cafe', query: '카레' })).toEqual([]);
    expect(landmarkNearby({ ...base, type: 'cafe', query: '' })).toEqual([]);
  });
});

describe('정렬 이름·칸(14 W261019.13)', () => {
  it("'기본순' 대신 기준을 이름으로 — 강아지가 있으면 판정순, 없으면 확인한 곳 먼저", () => {
    expect(placesPageSortLabel('none', { hasDog: true })).toBe('갈 수 있는 곳 먼저');
    expect(placesPageSortLabel('none', { hasDog: false })).toBe('확인한 곳 먼저');
  });

  it("'가까운 순' 은 기준이 장소·관광지면 그 이름을 앞에", () => {
    expect(placesPageSortLabel('near', { hasDog: true })).toBe('가까운 순');
    expect(placesPageSortLabel('near', { hasDog: false, nearFrom: '중문' })).toBe('중문에서 가까운 순');
    expect(placesPageSortLabel('asc', { hasDog: true })).toBe('가격 낮은 순');
    expect(placesPageSortLabel('desc', { hasDog: false })).toBe('가격 높은 순');
  });

  it('가격 둘은 숙소만', () => {
    expect(placesPageSortOptions('stay')).toEqual(['none', 'near', 'asc', 'desc']);
    expect(placesPageSortOptions('restaurant')).toEqual(['none', 'near']);
    expect(placesPageSortOptions('cafe')).toEqual(['none', 'near']);
  });

  it("강아지가 없으면 기본 순서는 정말 '확인한 곳 먼저' — 카드에 'N월 확인' 이 붙는 곳이 앞, 그 안은 데이터 순서", () => {
    const verified = (place: Parameters<typeof freshnessOf>[0]) => freshnessOf(place, null) !== null;
    for (const type of TYPES) {
      const list = filterPlacesPage({ ...base, type });
      const firstUnverified = list.findIndex((place) => !verified(place));
      if (firstUnverified >= 0) expect(list.slice(firstUnverified).some(verified), type).toBe(false);
      const order = (places: { id: string }[]) => places.map((place) => place.id);
      expect(order(list.filter(verified)), type).toEqual(order(placesOfType(type).filter(verified)));
      expect(order(list.filter((place) => !verified(place))), type).toEqual(order(placesOfType(type).filter((place) => !verified(place))));
    }
  });

  it('강아지가 있으면 걸러 낸 목록은 데이터 순서 그대로다 — 판정순이 그 위에서 돈다(홈 카드가 고른 곳과 같은 순서)', () => {
    const eligibilityMap = new Map(PLACES.map((place) => [place.id, judgeEligibility({ dogs: [{ name: '두부', weightKg: 3 }], carrier: 'bag' }, place.policy)]));
    for (const type of TYPES) {
      expect(filterPlacesPage({ ...base, type, eligibilityMap }).map((place) => place.id)).toEqual(placesOfType(type).map((place) => place.id));
    }
  });
});
