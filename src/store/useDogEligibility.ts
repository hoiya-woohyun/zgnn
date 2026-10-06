import { useMemo } from 'react';
import { maxWeightKg } from '../lib/dogProfile';
import { judgeEligibility, type TEligibility } from '../lib/eligibility';
import { PLACES, type TPlaceEntry } from '../lib/places';
import { useAppStore } from './useAppStore';

/**
 * 장소 하나에 대한 판정. 강아지가 없으면 null — 화면은 이 값으로 "판정 없음(v0)" 과
 * "판정 있음" 을 가른다.
 */
export const useEligibility = (place: TPlaceEntry): TEligibility | null => {
  const dog = useAppStore((state) => state.dog);
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  return useMemo(
    () => (dog ? judgeEligibility(dog, place.policy, { needsIndoor }) : null),
    [dog, needsIndoor, place],
  );
};

/**
 * 전체 장소의 판정을 한 번에. 목록·지도처럼 여러 장소를 동시에 보여주는 화면이 장소마다
 * `useEligibility` 를 부르면 매 렌더 다시 계산하므로, 여기서 한 번 계산해 공유한다.
 * dog·needsIndoor 가 바뀔 때만 재계산한다(86곳 × 규칙 14개는 렌더마다 돌려도 무리는 없지만
 * 그래도 의미 없는 재계산을 피한다).
 */
export const useEligibilityMap = (): Map<string, TEligibility> | null => {
  const dog = useAppStore((state) => state.dog);
  const needsIndoor = useAppStore((state) => state.needsIndoor);
  return useMemo(() => {
    if (!dog) return null;
    const map = new Map<string, TEligibility>();
    for (const place of PLACES) {
      map.set(place.id, judgeEligibility(dog, place.policy, { needsIndoor }));
    }
    return map;
  }, [dog, needsIndoor]);
};

/** 가장 무거운 아이의 몸무게 — 카드·지도 시트가 요금 칩 하나를 고르는 데 쓴다(`PetBadges` 의 `weightKg`). 강아지가 없으면 undefined. */
export const useDogMaxWeightKg = (): number | undefined =>
  useAppStore((state) => (state.dog ? maxWeightKg(state.dog) : undefined));

/** 마릿수 — 요금 칩이 "2마리 또는 10kg 이상" 같은 마릿수 조건 줄을 고르는 데 쓴다(`PetBadges` 의 `dogCount`). 강아지가 없으면 undefined. */
export const useDogCount = (): number | undefined => useAppStore((state) => state.dog?.dogs.length);
