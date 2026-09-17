import { itemsNeededForTrip, tripProvidedItemIds } from './itemNeeds';
import { visibleItems } from './seasonItems';
import type { TPlaceEntry } from './places';
import type { TSeasonFilter } from '../store/useAppStore';
import type { TItem } from '../types';

export { visibleItems };

export type TChecklistView = {
  /** 저장한 곳에 가려면 필요한 준비물. 저장한 곳이 없으면 빈 배열이다. */
  tripItems: TItem[];
  /** 그 밖의 준비물. tripItems 와 겹치지 않는다. */
  restItems: TItem[];
  /** 저장한 숙소가 대신 갖고 있는 준비물. */
  providedItemIds: Set<string>;
  /** 진행률의 분모가 된 항목(= 저장한 곳이 있으면 tripItems, 없으면 계절 전체). */
  total: number;
  /** 이미 준비된 것 — 직접 체크했거나, 저장한 숙소가 갖고 있거나. */
  ready: number;
  /** 진행률이 '이번 여행' 기준인지. 화면 문구가 이 값으로 갈린다. */
  scopedToTrip: boolean;
};

/**
 * 준비물을 "이번 여행(저장한 곳) × 계절" 로 좁힌 결과.
 *
 * 홈·준비물 화면·장소 카드가 전부 여기서 나온 숫자를 쓴다. 세 곳이 각자 세면
 * 같은 화면 안에서 서로 다른 숫자가 나온다 — 예전 `checklistProgress` 가 계절만 보던 것을
 * 저장한 곳까지 보도록 넓힌 것이고, 저장한 곳이 없으면 그때와 똑같이 동작한다.
 */
export const checklistView = (
  season: TSeasonFilter,
  checkedItemIds: string[],
  savedPlaces: TPlaceEntry[],
): TChecklistView => {
  const items = visibleItems(season);
  const tripItems = itemsNeededForTrip(savedPlaces, season);
  const tripIds = new Set(tripItems.map((item) => item.id));
  const provided = tripProvidedItemIds(savedPlaces, items);

  const scope = tripItems.length > 0 ? tripItems : items;
  return {
    tripItems,
    restItems: items.filter((item) => !tripIds.has(item.id)),
    providedItemIds: provided,
    total: scope.length,
    // 숙소가 갖고 있는 물건도 준비된 것으로 센다. 목록에서는 '숙소에 있어요' 로 흐리게
    // 표시해 놓고 숫자에서만 빼면, 같은 화면의 줄과 숫자가 서로 다른 말을 한다.
    ready: scope.filter((item) => checkedItemIds.includes(item.id) || provided.has(item.id)).length,
    scopedToTrip: tripItems.length > 0,
  };
};
