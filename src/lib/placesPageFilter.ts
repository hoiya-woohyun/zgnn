import { DIRECTION_LABEL, placesOfType, type TPlaceEntry } from './places';
import { PET_FILTERS, carriedFilterChips, envFiltersWithData, type TPetFilter, type TPetFilterKey } from './placeFilters';
import { matchesQuery } from './placeSearch';
import type { TEligibility } from './eligibility';
import type { TDirection, TPlaceType } from '../types';

/**
 * 둘러보기 목록·칩을 만드는 순수 함수 — 본 화면(`placesPage`)과 스와이프 엿보기(`placesPageSwipePeek`)가 **같은 함수**를 부른다.
 * 조건이 종류를 넘어 따라오게 되면서(07 U3) 엿보기가 "새 화면 = 기본 조건" 이라고 가정할 수 없다 — 따로 계산하면
 * 손을 놓는 순간 목록이 튄다. 빌드·테스트는 그대로 통과하는 조용한 어긋남이라 계산을 한 곳에 둔다(ADR-013).
 */

/** 이 종류에서 고를 수 있는 조건 전부 — 반려동물 조건 + (숙소) 데이터가 있는 환경 조건(10 F6). 칩·걸러 내기가 같은 목록을 본다. */
export const filtersOfPlaceType = (type: TPlaceType): TPetFilter[] =>
  type === 'stay' ? [...PET_FILTERS.stay, ...envFiltersWithData(placesOfType('stay'))] : PET_FILTERS[type];

/** 읍면만 걸러 둔 목록 — 이 종류에 그 읍면 자체가 없으면(0곳) 전용 빈 상태를 보여줘야 해서 다른 조건과 따로 둔다. */
export const placesByTown = (type: TPlaceType, town: string | null): TPlaceEntry[] => {
  const list = placesOfType(type);
  return town ? list.filter((place) => place.region.town === town) : list;
};

export type TPlacesPageConditions = {
  type: TPlaceType;
  town: string | null;
  query: string;
  directions: readonly TDirection[];
  /** **이 종류의** 반려동물·환경 조건 키. */
  petKeys: readonly TPetFilterKey[];
  hideHard: boolean;
  /** 강아지가 없으면 null — 그때 hideHard 는 걸러 내지 않는다. */
  eligibilityMap: Map<string, TEligibility> | null;
};

/**
 * 정렬 전의 걸러진 목록. 순서는 읍면 → 검색어 → 방향 → 반려동물·환경 조건 → 어려운 곳 숨기기.
 * 정렬은 호출하는 쪽 몫이다 — 가까운 순·가격순은 화면 로컬 상태(`sort`·`origin`)라 엿보기는 갖지 않는다.
 *
 * "실내 자리 필요"(needsIndoor)는 판정(`judgeEligibility` opts)이 야외 전용 장소를 어려움으로 밀어 올리므로
 * hideHard 가 그 결과를 거른다 — 여기서 policy.indoor 를 다시 보지 않는다(판정 로직 중복 방지).
 */
export const filterPlacesPage = ({
  type,
  town,
  query,
  directions,
  petKeys,
  hideHard,
  eligibilityMap,
}: TPlacesPageConditions): TPlaceEntry[] => {
  let list = placesByTown(type, town);

  if (query.trim()) list = list.filter((place) => matchesQuery(place, query));
  if (directions.length > 0) list = list.filter((place) => directions.includes(place.region.direction));

  const activeTests = filtersOfPlaceType(type).filter((filter) => petKeys.includes(filter.key));
  if (activeTests.length > 0) list = list.filter((place) => activeTests.every((filter) => filter.test(place.policy, place)));

  if (hideHard && eligibilityMap) list = list.filter((place) => eligibilityMap.get(place.id)?.level !== 'hard');
  return list;
};

export type TPlacesPageChip = { key: string; label: string };

/**
 * 켜진 조건을 이름으로. 순서는 따라오는 것(읍면·실내) → 방향 → 반려동물 → 정렬 → 어려운 곳 숨김 → 검색어.
 * `activeFilterCount` 는 **검색어를 뺀** 칩 수다 — 검색창은 시트 밖에 그대로 보이므로 접힌 시트 버튼의 숫자에 더하지 않는다.
 * `sortLabel` 은 본 화면만 준다(정렬은 종류를 바꾸면 리셋되므로 엿보기엔 늘 없다).
 */
export const placesPageChips = ({
  type,
  town,
  needsIndoor,
  hasDog,
  directions,
  petKeys,
  sortLabel = null,
  hideHard,
  query,
}: Pick<TPlacesPageConditions, 'type' | 'town' | 'directions' | 'petKeys' | 'hideHard'> & {
  needsIndoor: boolean;
  hasDog: boolean;
  sortLabel?: string | null;
  query: string;
}): { chips: TPlacesPageChip[]; activeFilterCount: number; hasFilters: boolean } => {
  const trimmedQuery = query.trim();
  const conditionChips: TPlacesPageChip[] = [
    ...carriedFilterChips({ town, needsIndoor, hasDog, type }),
    ...directions.map((direction) => ({ key: `dir-${direction}`, label: DIRECTION_LABEL[direction] })),
    ...filtersOfPlaceType(type)
      .filter((filter) => petKeys.includes(filter.key))
      .map((filter) => ({ key: `pet-${filter.key}`, label: filter.label })),
    ...(sortLabel !== null ? [{ key: 'sort', label: sortLabel }] : []),
    ...(hasDog && hideHard ? [{ key: 'hideHard', label: '어려운 곳 숨김' }] : []),
  ];
  const chips = trimmedQuery ? [...conditionChips, { key: 'query', label: `"${trimmedQuery}"` }] : conditionChips;
  return { chips, activeFilterCount: conditionChips.length, hasFilters: chips.length > 0 };
};
