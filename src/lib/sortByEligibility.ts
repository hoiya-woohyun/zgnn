import { compareEligibility, type TEligibility, type TEligibilityLevel } from './eligibility';

/**
 * 목록을 판정 레벨 순(ok → cond → unknown → hard)으로 정렬한다.
 * 같은 레벨 안에서는 원래 순서를 유지한다(Array#sort 는 안정 정렬).
 *
 * 판정 맵에 없는 항목(이론상 없어야 하지만 방어적으로)은 'unknown' 취급한다 — 맨 끝(어려움)
 * 으로 몰아 숨기는 대신, 정보가 없다는 사실 그대로 취급하기 위해서다.
 */
export const sortByEligibility = <T>(
  list: T[],
  eligibilityMap: Map<string, TEligibility>,
  getId: (item: T) => string,
): T[] => {
  const levelOf = (item: T): TEligibilityLevel => eligibilityMap.get(getId(item))?.level ?? 'unknown';
  return [...list].sort((a, b) => compareEligibility(levelOf(a), levelOf(b)));
};
