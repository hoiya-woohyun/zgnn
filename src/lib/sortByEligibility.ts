import { compareEligibility, isOutdoorSeatOnly, type TEligibility } from './eligibility';

/**
 * 목록을 판정 레벨 순(ok → 야외 → cond → unknown → hard)으로 정렬한다.
 * 같은 자리 안에서는 원래 순서를 유지한다(Array#sort 는 안정 정렬).
 *
 * '야외' 는 레벨이 아니라 cond 안의 앞자리다 — 카드가 "야외 자리에서 갈 수 있어요" 라고 하는 곳(`isOutdoorSeatOnly`).
 * 목록 요약이 "가능 · 야외 · 확인 필요" 순으로 세는데 정렬이 레벨만 보면 그곳이 확인 필요 사이에 섞인다
 * (14 W261007.5a — 30kg 식당 첫 카드가 무거버거가 아니라 부부키친).
 *
 * 판정 맵에 없는 항목(이론상 없어야 하지만 방어적으로)은 'unknown' 취급한다 — 맨 끝(어려움)
 * 으로 몰아 숨기는 대신, 정보가 없다는 사실 그대로 취급하기 위해서다.
 */
export const sortByEligibility = <T>(
  list: T[],
  eligibilityMap: Map<string, TEligibility>,
  getId: (item: T) => string,
): T[] => {
  const compare = (a: T, b: T): number => {
    const ea = eligibilityMap.get(getId(a));
    const eb = eligibilityMap.get(getId(b));
    const byLevel = compareEligibility(ea?.level ?? 'unknown', eb?.level ?? 'unknown');
    if (byLevel !== 0 || !ea || !eb) return byLevel;
    return Number(isOutdoorSeatOnly(eb)) - Number(isOutdoorSeatOnly(ea));
  };
  return [...list].sort(compare);
};
