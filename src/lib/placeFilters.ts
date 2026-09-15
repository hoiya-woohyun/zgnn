/**
 * 둘러보기 화면의 반려동물 조건 필터.
 * 각 항목은 petPolicy.ts 가 뽑아낸 값만 본다 — 원문을 다시 읽지 않는다.
 */
import type { TPetPolicy } from './petPolicy';
import type { TPlaceType } from '../types';

export type TPetFilterKey = 'indoor' | 'noCage' | 'largeDog' | 'leash' | 'feeFree' | 'multiDog';

export type TPetFilter = {
  key: TPetFilterKey;
  label: string;
  test: (policy: TPetPolicy) => boolean;
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
  // 원문에 마릿수가 적힌 곳만 걸린다. '견수 제한 없음' 처럼 숫자가 없는 표현은 빠지므로
  // 필터를 켠 결과가 실제보다 적을 수 있다. 숫자를 지어내기보다 빠뜨리는 쪽을 택했다.
  { key: 'multiDog', label: '2마리 이상', test: (p) => (p.maxDogs ?? 0) >= 2 },
];

export const PET_FILTERS: Record<TPlaceType, TPetFilter[]> = {
  stay: STAY_FILTERS,
  restaurant: DINING_FILTERS,
  cafe: DINING_FILTERS,
};

export type TPriceSort = 'none' | 'asc' | 'desc';

/** 가격 정렬. 요금을 알 수 없는 숙소는 방향과 관계없이 항상 뒤로 보낸다. */
export const comparePrice =
  (sort: Exclude<TPriceSort, 'none'>) =>
  (a: { stay?: { price: { min?: number } } }, b: { stay?: { price: { min?: number } } }) => {
    const av = a.stay?.price.min;
    const bv = b.stay?.price.min;
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return sort === 'asc' ? av - bv : bv - av;
  };
