import { areaOf, areaTownsLabel, type TAreaId } from './areaGroups';
import { DIRECTION_LABEL, placesOfType, type TPlaceEntry } from './places';
import { PET_FILTERS, carriedFilterChips, envFiltersWithData, type TPetFilter, type TPetFilterKey } from './placeFilters';
import { matchesQuery } from './placeSearch';
import type { TEligibility } from './eligibility';
import { isReachable } from './eligibilityCounts';
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

/**
 * 권역 안의 그 종류 — 권역이 없으면 전부. 0곳일 때 "다른 종류에 N곳"(`otherTypeMatches` 의 `placesOf`)도 이것으로 센다:
 * 권역은 탭을 따라오므로 다른 종류의 수도 그 권역 안이어야 누른 뒤 같은 수를 본다.
 */
export const placesOfTypeInArea = (type: TPlaceType, area: TAreaId | null): TPlaceEntry[] => {
  const list = placesOfType(type);
  return area ? list.filter((place) => areaOf(place) === area) : list;
};

export type TPlacesPageConditions = {
  type: TPlaceType;
  town: string | null;
  /** 6권역(19 T3) — 홈 동네 카드가 건다. **비퍼시스트**라 새로고침하면 풀린다(읍면과 다르다). */
  area: TAreaId | null;
  query: string;
  directions: readonly TDirection[];
  /** **이 종류의** 반려동물·환경 조건 키. */
  petKeys: readonly TPetFilterKey[];
  hideHard: boolean;
  /**
   * '갈 수 있는 곳만'(19 T4.1) — 가능 + 야외 자리(`isReachable`). 홈 동네 카드가 권역과 함께 건다: 카드 "묵을 곳 n" 이 그 셈이라
   * `hideHard`(어려움만 뺀다)로는 확인·정보 없음이 남아 "1곳" 을 눌러 2곳을 봤다. 시트에는 없다(권역처럼 칩으로만 푼다).
   */
  onlyReachable: boolean;
  /** 강아지가 없으면 null — 그때 hideHard·onlyReachable 은 걸러 내지 않는다. */
  eligibilityMap: Map<string, TEligibility> | null;
};

/**
 * 정렬 전의 걸러진 목록. 순서는 읍면 → 권역 → 검색어 → 방향 → 반려동물·환경 조건 → 어려운 곳 숨기기 → 갈 수 있는 곳만.
 * 정렬은 호출하는 쪽 몫이다 — 가까운 순·가격순은 화면 로컬 상태(`sort`·`origin`)라 엿보기는 갖지 않는다.
 *
 * "실내 자리 필요"(needsIndoor)는 판정(`judgeEligibility` opts)이 야외 전용 장소를 어려움으로 밀어 올리므로
 * hideHard 가 그 결과를 거른다 — 여기서 policy.indoor 를 다시 보지 않는다(판정 로직 중복 방지).
 */
export const filterPlacesPage = ({
  type,
  town,
  area,
  query,
  directions,
  petKeys,
  hideHard,
  onlyReachable,
  eligibilityMap,
}: TPlacesPageConditions): TPlaceEntry[] => {
  let list = placesByTown(type, town);

  if (area) list = list.filter((place) => areaOf(place) === area);

  if (query.trim()) list = list.filter((place) => matchesQuery(place, query));
  if (directions.length > 0) list = list.filter((place) => directions.includes(place.region.direction));

  const activeTests = filtersOfPlaceType(type).filter((filter) => petKeys.includes(filter.key));
  if (activeTests.length > 0) list = list.filter((place) => activeTests.every((filter) => filter.test(place.policy, place)));

  if (hideHard && eligibilityMap) list = list.filter((place) => eligibilityMap.get(place.id)?.level !== 'hard');
  if (onlyReachable && eligibilityMap) list = list.filter((place) => {
    const eligibility = eligibilityMap.get(place.id);
    return eligibility !== undefined && isReachable(eligibility);
  });
  return list;
};

/**
 * 0곳일 때 **읍면 하나만** 풀면 몇 곳인가(18 T2.1). 읍면이 없으면 0.
 *
 * 읍면은 퍼시스트라 전에 걸어 둔 '구좌읍' 이 홈 관광지 칩("중문")과 겹쳐 이유 없이 0곳이 된다 — 홈은 퍼시스트 필터를
 * 몰래 바꾸지 않는다(T2). 대신 빈 상태가 원인을 말하고 그 자리에서 푼다. 나머지 조건은 그대로 두고 센다 —
 * 버튼이 하는 일(`setTown(null)`)과 같은 조건이라야 "N곳" 을 누르고 N곳을 본다.
 */
export const townReleaseCount = (conditions: TPlacesPageConditions): number =>
  conditions.town === null ? 0 : filterPlacesPage({ ...conditions, town: null }).length;

/**
 * 0곳일 때 **권역 하나만** 풀면 몇 곳인가(19 T3). 권역이 없으면 0. `townReleaseCount` 와 같은 모양 — 나머지 조건은 그대로 센다.
 *
 * 권역은 홈 카드가 걸고(hideHard 와 함께) 검색어는 사용자가 친다 — "서부" 에서 '중문' 을 치면 이유 없이 0곳이 된다.
 * 빈 상태가 권역 탓이라고 말하고 그 자리에서 푼다.
 */
export const areaReleaseCount = (conditions: TPlacesPageConditions): number =>
  conditions.area === null ? 0 : filterPlacesPage({ ...conditions, area: null }).length;

/**
 * 0곳일 때 **'갈 수 있는 곳만' 하나만** 풀면 몇 곳인가(19 T4.1). 꺼져 있으면 0. 동네 카드 "묵을 곳 0" 도 누를 수 있어서,
 * 열면 0곳이다 — 그 권역의 확인·정보 없음 곳은 있는데 권역을 통째로 풀라고 하면 방금 고른 동네를 잃는다. 그래서 권역보다 먼저 본다.
 */
export const reachableReleaseCount = (conditions: TPlacesPageConditions): number =>
  conditions.onlyReachable && conditions.eligibilityMap ? filterPlacesPage({ ...conditions, onlyReachable: false }).length : 0;

export type TPlacesPageChip = { key: string; label: string };

/**
 * 켜진 조건을 이름으로. 순서는 권역 → 따라오는 것(읍면·실내) → 방향 → 반려동물 → 정렬 → 어려운 곳 숨김 → 검색어.
 * `activeFilterCount` 는 **검색어·권역·'갈 수 있는 곳만' 을 뺀** 칩 수다 — 검색어는 검색창에 보이고 뒤의 둘은 시트에 고르는 자리가 없다(홈 동네 카드만 건다, 19 T3·T4.1).
 * 접힌 시트 버튼의 숫자는 시트 안에서 끌 수 있는 것의 수여야 한다. 권역은 맨 앞 — 목록 전체의 테두리라 먼저 읽혀야 한다.
 * `sortLabel` 은 본 화면만 준다(정렬은 종류를 바꾸면 리셋되므로 엿보기엔 늘 없다).
 */
export const placesPageChips = ({
  type,
  town,
  area = null,
  needsIndoor,
  hasDog,
  directions,
  petKeys,
  sortLabel = null,
  hideHard,
  onlyReachable = false,
  query,
}: Pick<TPlacesPageConditions, 'type' | 'town' | 'directions' | 'petKeys' | 'hideHard'> & {
  area?: TAreaId | null;
  onlyReachable?: boolean;
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
  const chips = [
    ...(area ? [{ key: 'area', label: areaTownsLabel(area) }] : []),
    ...(hasDog && onlyReachable ? [{ key: 'onlyReachable', label: '갈 수 있는 곳만' }] : []),
    ...conditionChips,
    ...(trimmedQuery ? [{ key: 'query', label: `"${trimmedQuery}"` }] : []),
  ];
  return { chips, activeFilterCount: conditionChips.length, hasFilters: chips.length > 0 };
};
