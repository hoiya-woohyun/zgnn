import { ITEMS } from './places';
import type { TSeasonFilter } from '../store/useAppStore';
import type { TItem } from '../types';

/**
 * 계절에 맞는 준비물.
 * 사계절 항목은 항상 보이고, 여름·겨울 항목은 그 계절을 골랐을 때만 보인다.
 * 홈과 준비물 화면이 같은 숫자를 보여주도록 두 곳 모두 이 함수를 쓴다.
 */
export const visibleItems = (season: TSeasonFilter): TItem[] =>
  ITEMS.filter(
    (item) => item.seasons.includes('사계절') || (season !== null && item.seasons.includes(season)),
  );

export const checklistProgress = (season: TSeasonFilter, checkedItemIds: string[]) => {
  const items = visibleItems(season);
  return { items, total: items.length, checked: items.filter((item) => checkedItemIds.includes(item.id)).length };
};
