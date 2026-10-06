/**
 * 둘러보기 화면의 반려동물 조건 필터.
 * 각 항목은 petPolicy.ts 가 뽑아낸 값만 본다 — 원문을 다시 읽지 않는다.
 */
import type { TPetPolicy } from './petPolicy';
import type { TPlaceType, TStayEnvironment } from '../types';

export type TPetFilterKey =
  | 'indoor'
  | 'noCage'
  | 'largeDog'
  | 'leash'
  | 'feeFree'
  | 'multiDog'
  // 숙소 환경(10 F6) — 판정과 섞이지 않게 화면에서는 따로 묶는다(`ENV_FILTERS`).
  | 'standalone'
  | 'yard'
  | 'fencedYard'
  | 'noStairs';

export type TPetFilter = {
  key: TPetFilterKey;
  label: string;
  /** 둘째 인자는 숙소 환경 필터만 쓴다. */
  test: (policy: TPetPolicy, place?: { environment?: TStayEnvironment }) => boolean;
};

/** 식당·카페와 숙소는 원문에 적힌 정보가 달라서 필터도 다르다. */
const DINING_FILTERS: TPetFilter[] = [
  { key: 'indoor', label: '실내 동반 OK', test: (p) => p.indoor === 'free' || p.indoor === 'cage' },
  { key: 'noCage', label: '케이지 없이 OK', test: (p) => p.indoor === 'free' },
  { key: 'largeDog', label: '대형견 OK', test: (p) => p.largeDogOk },
  { key: 'leash', label: '리드줄 필요', test: (p) => p.leash },
];

const STAY_FILTERS: TPetFilter[] = [
  { key: 'feeFree', label: '추가요금 없음', test: (p) => p.feeFree },
  { key: 'largeDog', label: '대형견 OK', test: (p) => p.largeDogOk },
  // 원문에 마릿수 숫자가 적혀 있거나('최대 2마리') '견수 제한 없음' 처럼 무제한이라고
  // 못박은 곳만 걸린다. 숫자도 무제한 단서도 없으면 지어내지 않고 빠뜨린다.
  { key: 'multiDog', label: '2마리 이상', test: (p) => (p.maxDogs ?? 0) >= 2 || p.unlimitedDogs },
];

/**
 * 숙소 환경 필터(10 F6 — 은서 "조용하고 계단 없는 숙소", 태호 "둘이 뛰어놀 마당"). **true 로 확인된 곳만** 걸린다 —
 * 모르는 곳(null)을 넣으면 "계단 없음" 에 계단 있는 곳이 섞인다. 그래서 `계단 없음` 은 단층·계단 없음이 적힌 곳뿐이라 적다.
 * 판정(갈 수 있나)이 아니라 선호라 반려동물 조건과 다른 묶음으로 그린다.
 */
export const ENV_FILTERS: TPetFilter[] = [
  { key: 'standalone', label: '독채', test: (_p, place) => place?.environment?.standalone === true },
  { key: 'yard', label: '마당 있음', test: (_p, place) => place?.environment?.yard === true },
  { key: 'fencedYard', label: '울타리 마당', test: (_p, place) => place?.environment?.fencedYard === true },
  { key: 'noStairs', label: '계단 없음', test: (_p, place) => place?.environment?.stairs === false },
];

/** 데이터에 걸리는 곳이 하나라도 있는 환경 필터만 — 0곳짜리 칩은 고장으로 보인다. 순수. */
export const envFiltersWithData = (places: readonly { environment?: TStayEnvironment; policy: TPetPolicy }[]): TPetFilter[] =>
  ENV_FILTERS.filter((filter) => places.some((place) => filter.test(place.policy, place)));

export const PET_FILTERS: Record<TPlaceType, TPetFilter[]> = {
  stay: STAY_FILTERS,
  restaurant: DINING_FILTERS,
  cafe: DINING_FILTERS,
};

/** 목록 정렬. 가격 둘은 숙소만, `near`(가까운 순)는 모든 종류(10 F7 — 위치는 고를 때 한 번 받고 저장하지 않는다). */
export type TPlaceSort = 'none' | 'asc' | 'desc' | 'near';

/** 가격 정렬. 요금을 알 수 없는 숙소는 방향과 관계없이 항상 뒤로 보낸다. */
export const comparePrice =
  (sort: 'asc' | 'desc') =>
  (a: { stay?: { price: { min?: number } } }, b: { stay?: { price: { min?: number } } }) => {
    const av = a.stay?.price.min;
    const bv = b.stay?.price.min;
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return sort === 'asc' ? av - bv : bv - av;
  };

/**
 * 목록 머리의 지우기 링크 문구. 지우는 것을 그대로 말한다(D12) — 검색어만 있는데 "필터 지우기" 라고
 * 쓰면 필터가 걸린 줄 알고 시트를 연다. 둘 다 있으면 둘 다 지운다는 뜻으로 "모두".
 */
export const resetFiltersLabel = (hasQuery: boolean, conditionCount: number): string => {
  if (hasQuery && conditionCount > 0) return '모두 지우기';
  if (hasQuery) return '검색 지우기';
  return '필터 지우기';
};

/**
 * 종류를 바꿔도 **따라오는** 조건 — 스토어에 사는 읍면과 '실내 자리 필요'(화면 state 인 방향·조건·정렬은 `key={type}` 로 리셋된다).
 * 본 화면의 칩 줄과 스와이프 엿보기가 **같은 함수**로 칩을 만든다 — 따로 만들었더니 엿보기가 '실내 자리 필요' 를 빼먹어
 * 손을 놓는 순간 칩 줄이 튀어나왔다(12 U3.6). 숙소 탭은 실내 조건을 세지도 보이지도 않는다(12 U0.3).
 */
export type TCarriedChip = { key: 'town' | 'indoor'; label: string };

export const carriedFilterChips = (state: {
  town: string | null;
  needsIndoor: boolean;
  hasDog: boolean;
  type: TPlaceType;
}): TCarriedChip[] => [
  ...(state.town !== null ? [{ key: 'town' as const, label: state.town }] : []),
  ...(state.hasDog && state.type !== 'stay' && state.needsIndoor
    ? [{ key: 'indoor' as const, label: '실내 자리 필요' }]
    : []),
];
