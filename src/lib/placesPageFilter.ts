import { areaOf, areaTownsLabel, type TAreaId } from './areaGroups';
import { AREA_CARD_TYPES } from './homePageAreaCards';
import { DIRECTION_LABEL, PLACE_TYPES, distanceKm, placesOfType, sameIsland, type TPlaceEntry } from './places';
import { PET_FILTERS, carriedFilterChips, comparePrice, envFiltersWithData, resetFiltersLabel, type TPetFilter, type TPetFilterKey, type TPlaceSort } from './placeFilters';
import { freshnessOf } from './placeFreshness';
import { isTypeWord, landmarkOfQuery, matchesQuery, queryWords } from './placeSearch';
import { distancesFrom, sortByDistance } from './distanceSort';
import { sortByEligibility } from './sortByEligibility';
import type { TEligibility } from './eligibility';
import { eligibilityMapOf, isReachable } from './eligibilityCounts';
import type { TDirection, TDogProfile, TPlaceType } from '../types';

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
  /** 6권역(19 T3) — 홈 동네 카드가 건다. **비퍼시스트**라 새로고침하면 풀린다(읍면과 다르다). */
  area: TAreaId | null;
  query: string;
  directions: readonly TDirection[];
  /** **이 종류의** 반려동물·환경 조건 키. */
  petKeys: readonly TPetFilterKey[];
  hideHard: boolean;
  /**
   * '갈 수 있는 곳만'(19 T4.1) — 가능 + 야외 자리(`isReachable`). 홈 동네 카드가 권역과 함께 건다: 카드 "묵을 곳 n" 이 그 셈이라
   * `hideHard`(어려움만 뺀다)로는 확인·정보 없음이 남아 "1곳" 을 눌러 2곳을 봤다. 필터 시트에도 같은 값의 칩이 있다(14 W261013.14d).
   */
  onlyReachable: boolean;
  /** 강아지가 없으면 null — 그때 hideHard·onlyReachable 은 걸러 내지 않는다. */
  eligibilityMap: Map<string, TEligibility> | null;
};

/**
 * 이 종류의 정렬 칸(14 W261019.13) — 가격 둘은 숙소만(식당·카페엔 요금 칸이 없다), 가까운 순은 모든 종류(10 F7).
 * 목록 위 정렬 줄(모바일)과 넓은 화면의 셀렉트가 같은 목록을 본다.
 */
export const placesPageSortOptions = (type: TPlaceType): TPlaceSort[] =>
  type === 'stay' ? ['none', 'near', 'asc', 'desc'] : ['none', 'near'];

/**
 * 정렬 이름(14 W261019.13) — 정렬이 보이는 모든 자리가 이것 하나를 부른다. '기본순' 은 무슨 기준인지 말하지 않았다(ux-expert-04 — 확인월 붙은 곳이 앞이었다).
 * 기본 순서는 강아지가 있으면 판정순이고 없으면 확인한 곳 먼저(`filterPlacesPage` 가 세운다)라 둘을 그 이름으로 부른다.
 * '가까운 순' 은 기준이 장소·관광지면 그 이름을 앞에 붙인다(14 W261013.14o · W261019.11) — 카드의 km 를 내 위치에서 잰 값으로 읽지 않게.
 */
export const placesPageSortLabel = (sort: TPlaceSort, { hasDog, nearFrom }: { hasDog: boolean; nearFrom?: string }): string => {
  if (sort === 'none') return hasDog ? '갈 수 있는 곳 먼저' : '확인한 곳 먼저';
  if (sort === 'near') return nearFrom ? `${nearFrom}에서 가까운 순` : '가까운 순';
  return sort === 'asc' ? '가격 낮은 순' : '가격 높은 순';
};

/** 카드에 'N월 확인'(올해 아닌 해는 'YYYY년 N월 확인') 이 붙는 곳인가 — 카드와 같은 함수(`freshnessShortLabel` 이 이것을 본다). 오래됐는지는 묻지 않는다(오래돼도 꼬리표는 선다). */
const isVerified = (place: TPlaceEntry): boolean => freshnessOf(place, null) !== null;

/**
 * 정렬 전의 걸러진 목록. 순서는 읍면 → 권역 → 검색어 → 방향 → 반려동물·환경 조건 → 어려운 곳 숨기기 → 갈 수 있는 곳만.
 * 정렬은 호출하는 쪽 몫이다 — 가까운 순·가격순은 화면 로컬 상태(`sort`·`origin`)라 엿보기는 갖지 않는다.
 *
 * 단 **강아지가 없을 때의 기본 순서(확인한 곳 먼저)는 여기서 세운다**(14 W261019.13) — 정렬 이름이 그렇게 말하므로 데이터 순서(시드가 앞, 블로그 행이 뒤)라는
 * 우연에 맡기지 않는다: 나중에 확인한 블로그 행(중문보말칼국수)이 확인 안 된 곳 뒤에 있었다. 엿보기도 이 함수라 손을 놓아도 줄이 같다.
 * 강아지가 있으면 판정순(`sortByEligibility`)이 기본이라 데이터 순서 그대로 둔다 — 홈 동네 카드가 고른 곳(`homePageAreaPicks`)과 같은 순서여야 한다.
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
  return eligibilityMap ? list : [...list.filter(isVerified), ...list.filter((place) => !isVerified(place))];
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

/** 0곳 안내의 "조건 하나만 풀면" 한 칸 — `key` 는 칩 키(`placesPageChips`)다. */
export type TConditionRelease = { key: string; count: number };

/**
 * 0곳일 때 켜진 조건을 **하나씩** 풀면 몇 곳인가(14 W261010.33s, ferry-28 "야외면 N곳"). 읍면·권역·'갈 수 있는 곳만' 은 각자 갈래가 먼저 말하고
 * (`townReleaseCount` 등 — 그 셋이 답이면 이 함수의 수와 같다), 이것은 셋 다 답이 아닐 때 남는 "필터에 맞는 곳이 없어요" 의 다음 길이다.
 * 키가 칩 키라 화면은 그 칩의 이름·지우기를 그대로 쓴다 — 버튼이 칩 ✕ 와 같은 일을 해야 "N곳" 을 누르고 N곳을 본다.
 * 셈은 그 하나를 뺀 `filterPlacesPage` 다 — 목록과 같은 술어(따로 세면 카드 n ↔ 목록 수가 갈린다, ADR-027).
 *
 * - **'실내 자리 필요'** 는 걸러 내기가 아니라 판정을 바꾼다(야외 전용이 어려움이 된다) — 그 값 없이 다시 판정한 맵(`eligibilityMapOf`, 화면의 맵과 같은 호출)으로 센다.
 *   숨김 조건이 꺼져 있으면 목록이 그대로라 0 이 되어 빠진다.
 * - **'어려운 곳 빼고'(숨김) 는 세지 않는다** — 그것만 풀면 새로 보이는 곳은 전부 '이용하기 어려워요' 다. 갈 곳이 아니라 못 가는 곳을 보여 주는 길이다.
 * - 같은 이유로 **풀어서 나오는 곳이 이 강아지에게 전부 어려움이면 그 풀기도 내놓지 않는다** — 대형견 × 숙소 '대형견 OK' + '계단 없음' 에서
 *   '대형견 OK' 를 풀면 계단 없는 1곳이 '이용하기 어려워요' 였다(눌러 보면 접힌 어려움 한 칸뿐). 수는 그대로 목록 술어로 센다 — 버튼을 고를 뿐이다.
 *   판정은 풀고 난 뒤의 맵으로 본다('실내 자리 필요' 풀기는 그 값 없는 맵).
 * - 정렬은 걸러 내지 않는다.
 *
 * 0곳이 되는 풀기는 뺀다. 많은 순, 같으면 칩 순서.
 */
export const singleConditionReleases = (
  conditions: TPlacesPageConditions,
  judging: { dog: TDogProfile | null; needsIndoor: boolean },
): TConditionRelease[] => {
  const { type, town, area, query, directions, petKeys, onlyReachable, eligibilityMap } = conditions;
  // 수와 함께 "갈 곳이 하나라도 있나" — 판정이 없으면(강아지 없음) 따지지 않는다.
  const count = (released: Partial<TPlacesPageConditions>) => {
    const list = filterPlacesPage({ ...conditions, ...released });
    const map = released.eligibilityMap ?? eligibilityMap;
    return map && list.length > 0 && list.every((place) => map.get(place.id)?.level === 'hard') ? 0 : list.length;
  };
  const releases: TConditionRelease[] = [
    ...(area ? [{ key: 'area', count: count({ area: null }) }] : []),
    ...(onlyReachable && eligibilityMap ? [{ key: 'onlyReachable', count: count({ onlyReachable: false }) }] : []),
    ...(town !== null ? [{ key: 'town', count: count({ town: null }) }] : []),
    // 칩이 서는 조건과 같다(`carriedFilterChips` — 숙소엔 '실내 자리 필요' 칩이 없다).
    ...(judging.needsIndoor && judging.dog && type !== 'stay'
      ? [{ key: 'indoor', count: count({ eligibilityMap: eligibilityMapOf(placesOfType(type), judging.dog) }) }]
      : []),
    ...directions.map((direction) => ({
      key: `dir-${direction}`,
      count: count({ directions: directions.filter((other) => other !== direction) }),
    })),
    ...filtersOfPlaceType(type)
      .filter((filter) => petKeys.includes(filter.key))
      .map((filter) => ({ key: `pet-${filter.key}`, count: count({ petKeys: petKeys.filter((key) => key !== filter.key) }) })),
    ...(query.trim() ? [{ key: 'query', count: count({ query: '' }) }] : []),
  ];
  // Array#sort 는 안정 정렬이라 같은 수면 칩 순서 그대로다.
  return releases.filter((release) => release.count > 0).sort((a, b) => b.count - a.count);
};

/** 동네 카드로 들어온 뒤 따라와 걸린 것 — 카드는 이것들 없이 셌다. */
export type TAreaCarried = { count: number; town: string | null; directions: number; petKeys: number };

/**
 * 동네 카드로 들어왔는데(권역 + '갈 수 있는 곳만') **0곳은 아니지만 카드보다 적게** 보일 때, 따라온 읍면·방향·조건 칩을 풀면
 * 몇 곳인가(19 T4.2). `enterArea` 는 검색어만 비운다 — 읍면은 퍼시스트이고 홈은 그것을 몰래 바꾸지 않는다(18 T2).
 * 그래서 목록 머리가 원인을 말하고 그 자리에서 푼다. 푸는 것은 셋뿐이다: 검색어는 진입이 비웠으니 뒤에 친 것이고,
 * '실내 자리 필요' 는 카드도 같은 판정으로 세므로 원인이 아니다. 풀어도 늘지 않거나 카드가 세지 않는 종류(식당)면 null.
 */
export const areaCarriedRelease = (conditions: TPlacesPageConditions, shown: number): TAreaCarried | null => {
  const { area, onlyReachable, eligibilityMap, town, directions, petKeys } = conditions;
  if (!area || !onlyReachable || !eligibilityMap) return null;
  // 권역·'갈 수 있는 곳만' 은 탭을 따라오지만 카드는 식당을 세지 않는다 — 카드에 없는 수를 카드 탓으로 말하지 않는다.
  if (!(AREA_CARD_TYPES as readonly TPlaceType[]).includes(conditions.type)) return null;
  if (town === null && directions.length === 0 && petKeys.length === 0) return null;
  const count = filterPlacesPage({ ...conditions, town: null, directions: [], petKeys: [] }).length;
  return count > shown ? { count, town, directions: directions.length, petKeys: petKeys.length } : null;
};

/**
 * 같은 검색어가 **다른 종류**에 몇 곳 맞는가 — 0곳일 때의 큰 안내(14 W261006.6)와 결과가 있을 때의 "다른 종류에도 있어요 · 카페 n곳"
 * (W261007.11)이 같이 쓴다. 0곳인 종류는 뺀다. 검색은 종류 탭 안에서만 돌아서, 숙소 탭에서 "부부키친"(식당)을 치면 그 가게가 없는 줄 안다.
 *
 * 링크는 탭만 바꾸므로 셈은 **넘어간 탭의 `filterPlacesPage` 그대로**다 — 검색어·읍면·권역·방향·'어려운 곳 숨기기'·'갈 수 있는 곳만' 은
 * 스토어 전역이라 따라가고, 조건 칩은 그 종류의 것(`petKeysByType[other]`)이 걸린다. 예전에는 검색어·읍면·권역만 셌다: 동네 카드로 들어와
 * '함덕' 을 치면 "카페 4곳" 을 눌러 그보다 적게 봤다(W261007.11a). 조건을 하나씩 덧대지 않고 같은 함수로 센다 — 하나만 빠져도 수가 갈린다.
 */
export const otherTypeMatches = (
  { type, ...conditions }: Omit<TPlacesPageConditions, 'petKeys'>,
  petKeysByType: Readonly<Record<TPlaceType, readonly TPetFilterKey[]>>,
): { type: TPlaceType; count: number }[] => {
  if (!conditions.query.trim()) return [];
  return PLACE_TYPES.filter((other) => other !== type)
    .map((other) => ({ type: other, count: filterPlacesPage({ ...conditions, type: other, petKeys: petKeysByType[other] }).length }))
    .filter((match) => match.count > 0);
};

/**
 * `otherTypeMatches` 가 0곳이라 말하지 않은 종류 중, 숨김 조건('어려운 곳 숨기기'·'갈 수 있는 곳만')만 풀면 맞는 곳이 있는 종류(14 W261007.11b).
 *
 * 다른 종류 수가 넘어간 탭의 목록 수가 되면서(W261007.11a), 찾던 가게가 이 강아지에게 '어려움' 이라 숨겨지면 0곳 안내에서 아예 빠졌다 —
 * "숙소에는 '부부키친'과 맞는 곳이 없어요" 만 남아 W261006.6 이 막은 "그 가게가 없다" 가 숨기기를 켠 사람에게 돌아온다.
 * 수는 두 조건을 **함께** 푼 넘어간 탭의 곳 수다 — 누르는 쪽이 둘 다 풀어야 같은 수를 본다. 판정 맵이 없으면 두 조건이 거르지 않아 늘 빈 배열.
 */
export const otherTypeHiddenMatches = (
  conditions: Omit<TPlacesPageConditions, 'petKeys'>,
  petKeysByType: Readonly<Record<TPlaceType, readonly TPetFilterKey[]>>,
): { type: TPlaceType; count: number }[] => {
  if (!conditions.hideHard && !conditions.onlyReachable) return [];
  const shown = new Set(otherTypeMatches(conditions, petKeysByType).map((match) => match.type));
  return otherTypeMatches({ ...conditions, hideHard: false, onlyReachable: false }, petKeysByType).filter(
    (match) => !shown.has(match.type),
  );
};

/**
 * 검색어 없이 0곳인 식당·카페에서 **다른 자리 종류**(카페·식당)에 몇 곳인가(14 W261010.33v, ferry-28 "카페엔 실내 대형견 OK N곳" — 경쟁 펫패스의 대체 장소).
 * 검색어가 있으면 `otherTypeMatches` 가 이미 말한다(찾던 그 가게가 다른 종류에 있다). 검색어 없이 0곳인 것은 조건이 막은 것이라, 대신이 되는 종류만 말한다 —
 * 식당과 카페는 서로의 대신이 되고(둘 다 앉는 자리다, 판정의 `seating`), 숙소는 대신할 종류가 없다("식당에 30곳" 은 묵을 곳을 찾는 사람의 답이 아니다).
 *
 * 셈은 `otherTypeMatches` 와 같은 규칙이다 — 넘어간 탭의 `filterPlacesPage` 그대로(방향·읍면·권역·판정 토글은 따라가고 조건 칩은 그 종류의 것).
 * 그래서 줄은 "같은 조건으로" 라고 하지 않는다: 이 종류에만 있는 칩('케이지 없이 OK' 등)은 넘어가지 않는다. 줄의 수는 눌러 넘어가 보는 수다(W261007.11a).
 */
export const otherSeatTypeMatches = (
  conditions: Omit<TPlacesPageConditions, 'petKeys'>,
  petKeysByType: Readonly<Record<TPlaceType, readonly TPetFilterKey[]>>,
): { type: TPlaceType; count: number }[] => {
  if (conditions.query.trim() || conditions.type === 'stay') return [];
  return PLACE_TYPES.filter((other) => other !== conditions.type && other !== 'stay')
    .map((other) => ({ type: other, count: filterPlacesPage({ ...conditions, type: other, petKeys: petKeysByType[other] }).length }))
    .filter((match) => match.count > 0);
};

export type TPlacesPageEmptySearch =
  | { kind: 'otherType'; top: { type: TPlaceType; count: number }; rest: { type: TPlaceType; count: number }[] }
  | { kind: 'landmark'; word: string; radiusKm: number; rest: string }
  | { kind: 'notListed'; multiWord: boolean };

/**
 * 검색어만으로 0곳일 때 큰 안내가 무엇을 말할지(14 W261013.10) — 답이 있으면 답이 먼저다.
 *
 * 다른 종류에 맞는 곳이 있으면 그것이 안내의 주인이다(가장 많은 종류, 동수면 주어진 순서). 작은 링크 줄로 위에 두면 아래 큰 "맞는 곳이 없어요" 가
 * 더 크게 읽혀 사용자가 답을 지나친다(하은 04). 어디에도 없으면 '우리 목록에 없다' 이고, 길은 알려 주기다.
 * "띄어쓰기를 바꿔 보세요" 는 하지 않는다 — 검색은 양쪽 공백을 지우고 비교해(`placeSearch.squash`) 띄어쓰기가 결과를 바꾸지 않는다.
 * "더 짧게" 는 단어가 둘 이상일 때만 의미가 있다: 모든 단어가 맞아야 나오므로 하나를 덜어야 풀린다.
 *
 * 검색어에 관광지·동 이름이 있으면 '목록에 없다' 가 아니다(14 W261019.11) — '법환' 은 가게 이름이 아니라 동네라, "가게를 알려 주세요" 는
 * 엉뚱한 답이었다(haeun). 그 반경 안에 모은 곳이 아직 없다고 말하고, 길은 그 자리에서 가까운 곳이다(`landmarkNearby`).
 * 다른 낱말이 있으면(`rest`) 없는 것은 그 낱말이다 — '중문 카레' 의 중문엔 식당이 있다. 종류 이름은 탭을 고르는 말이라 `rest` 에 넣지 않는다.
 */
export const placesPageEmptySearch = (
  query: string,
  otherTypes: { type: TPlaceType; count: number }[],
): TPlacesPageEmptySearch => {
  if (otherTypes.length === 0) {
    const found = landmarkOfQuery(query);
    if (found) {
      const rest = queryWords(query)
        .filter((word) => word !== found.word && !isTypeWord(word))
        .join(' ');
      return { kind: 'landmark', word: found.word, radiusKm: found.landmark.radiusKm, rest };
    }
    return { kind: 'notListed', multiWord: queryWords(query).length >= 2 };
  }
  const top = otherTypes.reduce((best, other) => (other.count > best.count ? other : best));
  return { kind: 'otherType', top, rest: otherTypes.filter((other) => other !== top) };
};

/**
 * 관광지·동 검색이 0곳일 때 그 중심에서 가까운 곳(14 W261019.11) — `법환` 반경(1.5km) 안은 0곳이지만 4.5km 에 식당이 있다.
 * 걸러 내기는 관광지 낱말만 뺀 `filterPlacesPage` 다(나머지 낱말·조건은 그대로 — '법환 카레' 면 법환에서 가까운 카레). 좌표 없는 곳은 거리를 몰라 뺀다.
 * 카드에 km 가 찍히므로 순서는 거리 하나다(`pickNearby` 와 같은 까닭). 관광지 낱말이 없으면 빈 배열.
 */
export const landmarkNearby = (conditions: TPlacesPageConditions, limit = 3): { place: TPlaceEntry; km: number }[] => {
  const found = landmarkOfQuery(conditions.query);
  if (!found) return [];
  const query = queryWords(conditions.query)
    .filter((word) => word !== found.word)
    .join(' ');
  return filterPlacesPage({ ...conditions, query })
    .flatMap((place) => (place.geo ? [{ place, km: distanceKm(found.landmark.center, place.geo) }] : []))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
};

export type TPlacesPageChip = {
  key: string;
  label: string;
  /**
   * 넓은 화면 머리(검색창·펼친 판)에 같은 말이 없다 — 켜진 조건 줄이 lg 에서도 이 칩을 남긴다(`PlacesPageActiveChips`).
   * 권역은 머리에 고르는 자리가 없고(19 T3), 관광지 검색어 칩은 검색창에 없는 반경을 말한다(14 W261019.11c — `"중문" · 3km 안` 이
   * 데스크톱에서만 사라져 서울앵무새가 왜 나왔는지가 다시 안 보였다). 나머지 칩은 같은 말이 머리에 이미 있다.
   */
  notInHeader?: true;
};

/**
 * 검색어 칩 — 관광지·동 낱말이 있으면 반경을 함께(`"중문" · 3km 안`, 14 W261019.11). '중문' 결과의 서울앵무새는 이름·설명에 중문이 없어
 * 왜 나왔는지 몰랐다 — 반경으로 걸린 곳이다. 낱말이 여럿이면 어느 낱말의 반경인지 적는다(`"중문 카페" · 중문 3km 안`).
 */
const queryChip = (query: string): TPlacesPageChip => {
  const found = landmarkOfQuery(query);
  if (!found) return { key: 'query', label: `"${query}"` };
  // 반경 칩은 따옴표 없이 '한담 1.5km 안'(22 A·B review R-5) — 따옴표로 감싼 검색어를 칩에 되풀이하면 검색칸의 글자를 한 번 더 적은 것으로 읽혔다.
  // 검색어는 바로 위 검색칸에 있고, 칩은 그 낱말의 반경만 말한다(낱말이 여럿이어도 반경을 건 낱말 하나 — '중문 카페' 면 '중문 3km 안').
  return { key: 'query', label: `${found.word} ${found.landmark.radiusKm}km 안`, notInHeader: true };
};

/**
 * 켜진 조건을 이름으로. 순서는 권역 → '갈 수 있는 곳만' → 어려운 곳 빼고 → 실내 → 방향 → 읍면 → 원문 조건·환경 → 검색어 — 시트의 차례다(22 D-4).
 * `activeFilterCount` 는 **검색어·권역을 뺀** 칩 수다 — 검색어는 검색창에 보이고 권역은 시트에 고르는 자리가 없다(홈 동네 카드만 건다, 19 T3).
 * 접힌 시트 버튼의 숫자는 시트 안에서 끌 수 있는 것의 수여야 한다. '갈 수 있는 곳만' 은 시트에 칩이 생겨(14 W261013.14d) 센다 — 자리는 권역 바로 뒤 그대로
 * (카드가 둘을 함께 건다). 권역은 맨 앞 — 목록 전체의 테두리라 먼저 읽혀야 한다.
 * 정렬은 칩이 아니다(14 W261019.13) — 목록 위 정렬 줄·넓은 화면의 셀렉트가 지금 순서를 이름으로 말하고, 시트엔 정렬이 없어 버튼 숫자에도 안 든다.
 *
 * `resetLabel` 은 개수 줄 지우기 링크(md 부터)의 문구다. 링크는 칩 줄의 것을 **권역까지** 다 지우므로(`placesPage` 의 `resetFilters`) 권역도 센다 —
 * 시트 버튼 숫자(`activeFilterCount`)로 고르면 강아지 없이 권역 + 검색어일 때 '검색 지우기' 가 권역까지 풀었다(14 W261019.11f).
 * 본 화면·엿보기가 이 값을 그대로 받는다 — 각자 세면 한쪽만 고쳐져 손을 놓는 순간 문구가 바뀐다.
 */
export const placesPageChips = ({
  type,
  town,
  area = null,
  needsIndoor,
  hasDog,
  directions,
  petKeys,
  hideHard,
  onlyReachable = false,
  query,
}: Pick<TPlacesPageConditions, 'type' | 'town' | 'directions' | 'petKeys' | 'hideHard'> & {
  area?: TAreaId | null;
  onlyReachable?: boolean;
  needsIndoor: boolean;
  hasDog: boolean;
  query: string;
}): { chips: TPlacesPageChip[]; activeFilterCount: number; resetCount: number; hasFilters: boolean; resetLabel: string } => {
  const trimmedQuery = query.trim();
  const carried = carriedFilterChips({ town, needsIndoor, hasDog, type });
  // 시트의 차례 그대로 — 강아지 기준(숨김 → 실내) → 지역(방향 → 읍면) → 원문 조건·숙소 환경(22 D-4). 모바일은 이 칩들이 검색창 밑 한 줄에 선다.
  const conditionChips: TPlacesPageChip[] = [
    // '갈 수 있는 곳만' 이 켜져 있으면 숨김은 이미 그 안이라(가능 + 야외만 남는다) 칩을 세우지 않는다 — 시트의 한 축 세그먼트가 고른 하나만 말하듯(22 D-6).
    // 이름은 세그먼트의 칸 이름과 같다('어려운 곳 빼고').
    ...(hasDog && hideHard && !onlyReachable ? [{ key: 'hideHard', label: '어려운 곳 빼고' }] : []),
    ...carried.filter((chip) => chip.key === 'indoor'),
    ...directions.map((direction) => ({ key: `dir-${direction}`, label: DIRECTION_LABEL[direction] })),
    ...carried.filter((chip) => chip.key === 'town'),
    ...filtersOfPlaceType(type)
      .filter((filter) => petKeys.includes(filter.key))
      .map((filter) => ({ key: `pet-${filter.key}`, label: filter.label })),
  ];
  const reachableChips: TPlacesPageChip[] = hasDog && onlyReachable ? [{ key: 'onlyReachable', label: '갈 수 있는 곳만' }] : [];
  const chips: TPlacesPageChip[] = [
    ...(area ? [{ key: 'area', label: areaTownsLabel(area), notInHeader: true as const }] : []),
    ...reachableChips,
    ...conditionChips,
    ...(trimmedQuery ? [queryChip(trimmedQuery)] : []),
  ];
  const activeFilterCount = reachableChips.length + conditionChips.length;
  // 초기화가 푸는 조건 수 — '실내 자리 필요' 는 몸무게 같은 **설정**이라(앱 전체 판정 입력, 22 A·B review R-2) 어느 초기화도 끄지 않는다. 그 칩은 제 ✕ 로만 끈다.
  const resetCount = activeFilterCount - (carried.some((chip) => chip.key === 'indoor') ? 1 : 0);
  return {
    chips,
    activeFilterCount,
    resetCount,
    // 지우기 링크를 세우는가 — 누르면 바뀌는 것이 있을 때만(실내 자리 필요 하나뿐이면 링크가 아무것도 못 지운다).
    hasFilters: trimmedQuery.length > 0 || area !== null || resetCount > 0,
    resetLabel: resetFiltersLabel(trimmedQuery.length > 0, (area ? 1 : 0) + resetCount),
  };
};

/** 목록의 순서 — 화면 로컬 상태(정렬·기준점)라 종류를 바꾸면 리셋된다. 엿보기는 늘 기본(`PLACES_PAGE_DEFAULT_ORDER`)이다. */
export type TPlacesPageOrder = {
  sort: TPlaceSort;
  /** '가까운 순' 의 기준점 — 들어온 장소 → 검색어의 관광지·동 → 내 위치 차례로 화면이 고른 것. 없으면 가까운 순은 기본 순서로 보인다. */
  origin: { lat: number; lng: number } | null;
  /** 상세 「근처 장소」 로 들어온 기준 장소(`?near=`, 14 W261013.14o) — 다른 섬을 뒤로 보내고, 칩이 그 이름을 말한다. */
  nearPlace: TPlaceEntry | null;
};

export const PLACES_PAGE_DEFAULT_ORDER: TPlacesPageOrder = { sort: 'none', origin: null, nearPlace: null };

type TTypeCount = { type: TPlaceType; count: number };

/**
 * 둘러보기 본문(`PlacesPageResults`)이 그리는 값 전부 — 시트·펼친 판만 쓰는 수(`hideHardCount` 등)는 넣지 않는다.
 * 콜백은 여기 없다: 본 화면은 실제로 하고 엿보기는 아무것도 안 해서 본래 다르다.
 */
export type TPlacesPageResultsView = {
  type: TPlaceType;
  town: string | null;
  area: TAreaId | null;
  /** 다듬은 검색어. 빈 상태가 "검색 탓인가 필터 탓인가" 를 가르는 데 쓴다. */
  query: string;
  /** 걸러 내고 순서까지 세운 목록. */
  results: TPlaceEntry[];
  /** 이 종류에 그 읍면 자체가 없다(조건과 무관하게 0곳) — 전용 빈 상태(12 U1.6). */
  townHasNoPlaces: boolean;
  /** 켜진 조건 칩·시트 버튼 숫자·개수 줄 지우기 링크 문구(`placesPageChips`). */
  chips: TPlacesPageChip[];
  activeFilterCount: number;
  /** 초기화가 푸는 조건 수 — `activeFilterCount` 에서 '실내 자리 필요'(설정)를 뺀 것. 0 이면 초기화가 서지(켜지지) 않는다. */
  resetCount: number;
  hasFilters: boolean;
  resetLabel: string;
  /** 보이는 정렬 — '가까운 순' 인데 기준점이 없으면 기본. */
  sort: TPlaceSort;
  /** '가까운 순' 칩 앞에 붙는 기준 이름 — 들어온 장소, 없으면 검색어의 관광지·동 낱말(14 W261019.11). */
  nearFrom: string | undefined;
  /** 가까운 순일 때 장소 id → 거리(km). 카드가 "1.2km" 를 붙인다(10 F7). */
  distances: Map<string, number> | undefined;
  /** 같은 검색어가 맞는 다른 종류(`otherTypeMatches`) — 0곳이면 큰 안내, 결과가 있으면 목록 끝 한 줄(14 W261007.11 · W261019.11a). */
  otherTypes: TTypeCount[];
  /** 이하 0곳일 때만 — 결과가 있으면 비거나 0이다. 관광지·동 검색의 그 중심에서 가까운 곳(`landmarkNearby`, 14 W261019.11). */
  landmarkNearby: { place: TPlaceEntry; km: number }[];
  /** 숨김 조건만 풀면 맞는 곳이 있는 다른 종류(`otherTypeHiddenMatches`, 14 W261007.11b) — `otherTypes` 와 겹치지 않는다. */
  hiddenOtherTypes: TTypeCount[];
  /** 검색어 없이 0곳인 식당·카페에서 다른 자리 종류의 수(`otherSeatTypeMatches`, 14 W261010.33v). */
  seatOtherTypes: TTypeCount[];
  /** 읍면(18 T2.1)·권역(19 T3)·'갈 수 있는 곳만'(19 T4.1) 하나만 풀면 몇 곳인가 — 0 이면 그 탓이 아니다. */
  townReleaseCount: number;
  areaReleaseCount: number;
  reachableReleaseCount: number;
  /** 켜진 조건을 하나씩 풀면 몇 곳인가(`singleConditionReleases`, 14 W261010.33s) — 많은 순, 키는 칩 키. */
  conditionReleases: TConditionRelease[];
  /** 결과가 있는데 카드보다 적을 때만(19 T4.2) — 0곳이면 빈 상태 몫이다. */
  areaCarried: TAreaCarried | null;
};

/**
 * 종류 하나의 둘러보기 본문 값을 **한 번에** 낸다(14 W261019.11g) — 본 화면과 스와이프 엿보기가 이것 하나를 부르고 결과를 통째로 `PlacesPageResults` 에 넘긴다.
 *
 * 걸러 내는 함수는 전부터 같았는데 엿보기가 두 번 어긋났다 — '실내 자리 필요' 칩(12 U3.6)과 관광지 0곳의 가까운 곳(14 W261019.11b) 둘 다
 * 본 화면이 새 값을 셈해 prop 으로 넘길 때 엿보기가 그 prop 을 안 넘긴 것이다. 값을 여기서 함께 내면 새 값은 한 곳에만 더하고 두 화면이 같이 받는다.
 *
 * 순서는 걸러진 목록(`filterPlacesPage`)에서 바로 세운다 — 가까운 순(좌표 없는 곳·다른 섬은 원래 자리)·가격순(안정 정렬)은 동점일 때 들어온 순서를 지키므로,
 * 판정순으로 한 번 세운 것을 다시 정렬하면 동점 순서가 조용히 바뀐다. 0곳 갈래들은 순서와 무관하다(수만 본다).
 */
export const placesPageResultsView = (
  {
    petKeysByType,
    dog,
    needsIndoor,
    ...rest
  }: Omit<TPlacesPageConditions, 'petKeys'> & {
    petKeysByType: Readonly<Record<TPlaceType, readonly TPetFilterKey[]>>;
    dog: TDogProfile | null;
    needsIndoor: boolean;
  },
  { sort, origin, nearPlace }: TPlacesPageOrder = PLACES_PAGE_DEFAULT_ORDER,
): TPlacesPageResultsView => {
  const conditions: TPlacesPageConditions = { ...rest, petKeys: petKeysByType[rest.type] };
  const { type, town, area, query, eligibilityMap } = conditions;
  const filtered = filterPlacesPage(conditions);

  const nearOrigin = sort === 'near' ? origin : null;
  const within = nearPlace ? (place: TPlaceEntry) => sameIsland(nearPlace, place) : undefined;
  let results = filtered;
  let distances: Map<string, number> | undefined;
  if (nearOrigin) {
    // 가까운 순을 고르면 거리가 우선이다 — 가격 정렬과 같은 결정(B3). 좌표 없는 곳은 뒤로, 기준이 장소면 다른 섬도 뒤로(근처 장소와 같은 규칙).
    results = sortByDistance(filtered, nearOrigin, within);
    distances = distancesFrom(results, nearOrigin, within);
    // 기준 장소 자신(숙소 상세 → 근처 숙소)은 0km 로 맨 위에 선다 — "50m" 를 붙이면 자기에게서 잰 거리가 된다. 칩이 이름을 말한다.
    if (nearPlace) distances.delete(nearPlace.id);
  } else if (type === 'stay' && (sort === 'asc' || sort === 'desc')) {
    // 가격 정렬을 고르면 가격이 우선이다(2026-09-15 리뷰 후속 B3 결정).
    results = [...filtered].sort(comparePrice(sort));
  } else if (eligibilityMap) {
    // 프로필이 있으면 기본 정렬은 ok → cond → unknown → hard(갈 수 있어요 → 확인이 필요해요 → 정보가 없어요 → 이용하기 어려워요).
    results = sortByEligibility(filtered, eligibilityMap, (place) => place.id);
  }

  // 다른 종류는 넘어간 탭의 조건 칩으로 센다(14 W261007.11a) — 그래서 이 종류의 칩(`petKeys`) 없는 조건에 종류별 칩을 통째로 넘긴다.
  const acrossTypes = rest;
  const empty = results.length === 0;
  return {
    type,
    town,
    area,
    query: query.trim(),
    results,
    townHasNoPlaces: town !== null && placesByTown(type, town).length === 0,
    ...placesPageChips({ ...conditions, needsIndoor, hasDog: Boolean(dog) }),
    sort: sort === 'near' && !origin ? 'none' : sort,
    nearFrom: nearPlace?.name ?? landmarkOfQuery(query)?.word,
    distances,
    landmarkNearby: empty ? landmarkNearby(conditions) : [],
    // 결과가 있어도 센다 — "다른 종류에도 있어요 · 식당 1곳"(14 W261007.11). 검색어가 없으면 빈 배열이다.
    otherTypes: otherTypeMatches(acrossTypes, petKeysByType),
    hiddenOtherTypes: empty ? otherTypeHiddenMatches(acrossTypes, petKeysByType) : [],
    seatOtherTypes: empty ? otherSeatTypeMatches(acrossTypes, petKeysByType) : [],
    townReleaseCount: empty ? townReleaseCount(conditions) : 0,
    areaReleaseCount: empty ? areaReleaseCount(conditions) : 0,
    reachableReleaseCount: empty ? reachableReleaseCount(conditions) : 0,
    conditionReleases: empty ? singleConditionReleases(conditions, { dog, needsIndoor }) : [],
    areaCarried: empty ? null : areaCarriedRelease(conditions, results.length),
  };
};
