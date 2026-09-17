import { ITEMS } from './places';
import type { TSeasonFilter } from '../store/useAppStore';
import type { TItem } from '../types';

/**
 * 계절에 맞는 준비물.
 * 사계절 항목은 항상 보이고, 여름·겨울 항목은 그 계절을 골랐을 때만 보인다.
 *
 * 이 한 함수만 따로 떼어 둔 이유는 순환 참조 때문이다 — `checklist.ts` 는 `itemNeeds.ts` 를
 * 쓰고, `itemNeeds.ts` 도 계절 필터가 필요하다. 둘 다 여기를 바라보게 해서 고리를 끊는다.
 */
export const visibleItems = (season: TSeasonFilter): TItem[] =>
  ITEMS.filter(
    (item) => item.seasons.includes('사계절') || (season !== null && item.seasons.includes(season)),
  );
