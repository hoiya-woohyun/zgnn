import { areaOf, areaTownsLabel, type TAreaId } from './areaGroups';
import { AREA_CARD_TYPES } from './homePageAreaCards';
import { DIRECTION_LABEL, PLACE_TYPES, placesOfType, type TPlaceEntry } from './places';
import { PET_FILTERS, carriedFilterChips, envFiltersWithData, type TPetFilter, type TPetFilterKey } from './placeFilters';
import { matchesQuery } from './placeSearch';
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
 * - **'어려운 곳 숨김' 은 세지 않는다** — 그것만 풀면 새로 보이는 곳은 전부 '이용하기 어려워요' 다. 갈 곳이 아니라 못 가는 곳을 보여 주는 길이다.
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

/**
 * '어려운 곳 숨기기' 가 지금 조건에서 숨기는(켜면 숨길) 곳 수(14 W261013.8). 나머지 조건은 그대로 센다 — 칩에 싣는 수다.
 * 0 이면 그 칩은 이 목록에서 아무것도 바꾸지 않는다: 콩이(이동가방) 식당 47곳은 어려움이 없어 눌러도 "47곳 보기" 그대로라
 * 고장으로 보였다. 판정 맵이 없으면(강아지 없음) 0.
 */
export const hideHardCount = (conditions: TPlacesPageConditions): number => {
  const { eligibilityMap } = conditions;
  if (!eligibilityMap) return 0;
  return filterPlacesPage({ ...conditions, hideHard: false }).filter((place) => eligibilityMap.get(place.id)?.level === 'hard').length;
};

/**
 * '갈 수 있는 곳만' 을 켜면(켜 두었으면) 남는 곳 수(14 W261013.14d) — 시트 칩 "갈 수 있는 곳만 4" 의 수. 옆 '어려운 곳 숨기기' 와 달리
 * 숨기는 수가 아니라 **남는** 수다: "~만 N" 은 그 N곳으로 읽히고, 홈 히어로("갈 수 있는 곳 N")도 같은 술어(`isReachable`)로 남는 쪽을 센다.
 * 나머지 조건은 그대로 센다. 판정 맵이 없으면(강아지 없음) 0.
 */
export const onlyReachableCount = (conditions: TPlacesPageConditions): number =>
  conditions.eligibilityMap ? filterPlacesPage({ ...conditions, onlyReachable: true }).length : 0;

/**
 * 읍면 칩 옆 수(14 W261010.33e) — 그 칩을 누르면 남는 곳 수. 지금 조건(검색어·방향·조건 칩·판정 토글)에서 읍면 선택을 빼고
 * 거른 목록을 읍면별로 센다(패싯). 예전엔 종류 전체를 셌다(`topTowns`) — '갈 수 있는 곳만' 을 켠 채 "구좌읍 9" 를 눌러 1곳을 봤다(ferry-26).
 * 읍면까지 넣어 세면 하나 고른 순간 다른 칩이 전부 0 이 된다. 걸러 내기는 `filterPlacesPage` 그대로 — 옆 칩의 `onlyReachableCount` 와 한 술어다.
 *
 * **권역도 뺀다**(W261010.33i) — 읍면을 고르면 권역을 대신하므로(화면의 `selectTown`, 권역 진입이 읍면을 푸는 것과 짝) 누른 뒤엔 권역이 없다.
 * 권역 안 읍면은 빼나 안 빼나 같은 수이고, 권역 밖 읍면은 눌러서 0곳이던 칩이 그 읍면의 수가 된다. 그래서 권역이 걸려 있으면 칩을 다 더한 수가 지금 목록보다 크다.
 * 맵에 없는 읍면은 0곳이다.
 */
export const townChipCounts = (conditions: TPlacesPageConditions): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const place of filterPlacesPage({ ...conditions, town: null, area: null })) {
    counts.set(place.region.town, (counts.get(place.region.town) ?? 0) + 1);
  }
  return counts;
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
  | { kind: 'notListed'; multiWord: boolean };

/**
 * 검색어만으로 0곳일 때 큰 안내가 무엇을 말할지(14 W261013.10) — 답이 있으면 답이 먼저다.
 *
 * 다른 종류에 맞는 곳이 있으면 그것이 안내의 주인이다(가장 많은 종류, 동수면 주어진 순서). 작은 링크 줄로 위에 두면 아래 큰 "맞는 곳이 없어요" 가
 * 더 크게 읽혀 사용자가 답을 지나친다(하은 04). 어디에도 없으면 '우리 목록에 없다' 이고, 길은 알려 주기다.
 * "띄어쓰기를 바꿔 보세요" 는 하지 않는다 — 검색은 양쪽 공백을 지우고 비교해(`placeSearch.squash`) 띄어쓰기가 결과를 바꾸지 않는다.
 * "더 짧게" 는 단어가 둘 이상일 때만 의미가 있다: 모든 단어가 맞아야 나오므로 하나를 덜어야 풀린다.
 */
export const placesPageEmptySearch = (
  query: string,
  otherTypes: { type: TPlaceType; count: number }[],
): TPlacesPageEmptySearch => {
  if (otherTypes.length === 0) return { kind: 'notListed', multiWord: query.trim().split(/\s+/).filter(Boolean).length >= 2 };
  const top = otherTypes.reduce((best, other) => (other.count > best.count ? other : best));
  return { kind: 'otherType', top, rest: otherTypes.filter((other) => other !== top) };
};

export type TPlacesPageChip = { key: string; label: string };

/**
 * 켜진 조건을 이름으로. 순서는 권역 → 따라오는 것(읍면·실내) → 방향 → 반려동물 → 정렬 → 어려운 곳 숨김 → 검색어.
 * `activeFilterCount` 는 **검색어·권역을 뺀** 칩 수다 — 검색어는 검색창에 보이고 권역은 시트에 고르는 자리가 없다(홈 동네 카드만 건다, 19 T3).
 * 접힌 시트 버튼의 숫자는 시트 안에서 끌 수 있는 것의 수여야 한다. '갈 수 있는 곳만' 은 시트에 칩이 생겨(14 W261013.14d) 센다 — 자리는 권역 바로 뒤 그대로
 * (카드가 둘을 함께 건다). 권역은 맨 앞 — 목록 전체의 테두리라 먼저 읽혀야 한다.
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
  const reachableChips: TPlacesPageChip[] = hasDog && onlyReachable ? [{ key: 'onlyReachable', label: '갈 수 있는 곳만' }] : [];
  const chips = [
    ...(area ? [{ key: 'area', label: areaTownsLabel(area) }] : []),
    ...reachableChips,
    ...conditionChips,
    ...(trimmedQuery ? [{ key: 'query', label: `"${trimmedQuery}"` }] : []),
  ];
  return { chips, activeFilterCount: reachableChips.length + conditionChips.length, hasFilters: chips.length > 0 };
};
